// Spoolman-compatible API layer for SpoolKeep.
//
// Implements the subset of the Spoolman v1 REST API (plus the /api/v1/spool
// websocket) used by Moonraker's [spoolman] component and the SpoolLink
// bridge in the SnapmakerU1-Extended-Firmware, so the printer can talk to
// SpoolKeep as if it were a Spoolman server.
//
// Endpoints implemented:
//   GET   /api/v1/info                       - server info ("version" required by firmware validation)
//   GET   /api/v1/health                     - health probe
//   GET   /api/v1/field/:entityType          - list custom field definitions
//   POST  /api/v1/field/:entityType/:key     - create/update a custom field definition
//   GET   /api/v1/spool                      - list spools (Spoolman wire format)
//   GET   /api/v1/spool/:id                  - get spool by numeric id
//   PATCH /api/v1/spool/:id                  - update spool (extra.card_uids, weights)
//   PUT   /api/v1/spool/:id/use              - report filament usage (use_length mm / use_weight g)
//   WS    /api/v1/spool                      - spool event stream (added/updated/deleted)

const fs = require('fs-extra');
const path = require('path');
const { WebSocketServer } = require('ws');

const FILAMENT_DIAMETER_MM = 1.75;
// Cross-sectional area of 1.75mm filament in mm^2 (pi * r^2)
const FILAMENT_AREA_MM2 = Math.PI * Math.pow(FILAMENT_DIAMETER_MM / 2, 2);

// Typical densities in g/cm^3 by material type
const MATERIAL_DENSITIES = {
  PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21,
  PC: 1.20, PA: 1.15, NYLON: 1.15, PVA: 1.23, HIPS: 1.03
};
const DEFAULT_DENSITY = 1.24;
const DEFAULT_NET_WEIGHT = 1000;

let deps = null; // { dbFile, fieldsFile, dataDir, logMsg }
let wss = null;

function densityFor(type) {
  const key = String(type || '').toUpperCase();
  // Match on prefix so e.g. "PLA+" or "PA-CF" resolve sensibly
  for (const mat of Object.keys(MATERIAL_DENSITIES)) {
    if (key.startsWith(mat)) return MATERIAL_DENSITIES[mat];
  }
  return DEFAULT_DENSITY;
}

// grams -> length in mm for the spool's material
function gramsToMm(grams, type) {
  const volumeMm3 = (grams / densityFor(type)) * 1000; // g / (g/cm^3) = cm^3 -> mm^3
  return volumeMm3 / FILAMENT_AREA_MM2;
}

// length in mm -> grams
function mmToGrams(mm, type) {
  const volumeCm3 = (mm * FILAMENT_AREA_MM2) / 1000;
  return volumeCm3 * densityFor(type);
}

function netWeightOf(spool) {
  const w = parseFloat(spool.netWeight);
  return Number.isFinite(w) && w > 0 ? w : DEFAULT_NET_WEIGHT;
}

function usedWeightOf(spool) {
  const w = parseFloat(spool.usedWeight);
  if (Number.isFinite(w) && w >= 0) return w;
  const pct = parseFloat(spool.usedPercentage) || 0;
  return (pct / 100) * netWeightOf(spool);
}

function syncUsedPercentage(spool) {
  const net = netWeightOf(spool);
  const used = usedWeightOf(spool);
  spool.usedWeight = used;
  spool.usedPercentage = Math.max(0, Math.min(100, Math.round((used / net) * 100)));
}

// Spoolman stores custom field values as JSON-encoded strings
// ("double-serialised"): the string "AABBCCDD" goes over the wire as "\"AABBCCDD\"".
function encodeExtraString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function decodeExtraString(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    try {
      return String(JSON.parse(s));
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

// Map a SpoolKeep spool record to the Spoolman wire format that
// spoollink/Moonraker expect.
function toSpoolmanSpool(spool) {
  const net = netWeightOf(spool);
  const used = usedWeightOf(spool);
  const remaining = Math.max(0, net - used);
  const type = spool.type || 'PLA';
  const colorHex = String(spool.colourHex || spool.colorHex || '#7F8C8D')
    .replace(/^#/, '').toUpperCase().slice(0, 6);
  const cardUids = Array.isArray(spool.cardUids) ? spool.cardUids : [];

  return {
    id: spool.spoolmanId,
    registered: spool.dateAdded || null,
    first_used: spool.dateOpened || null,
    price: null,
    initial_weight: net,
    spool_weight: null,
    remaining_weight: remaining,
    used_weight: used,
    remaining_length: gramsToMm(remaining, type),
    used_length: gramsToMm(used, type),
    location: null,
    lot_nr: null,
    comment: spool.notes || null,
    archived: false,
    extra: {
      card_uids: encodeExtraString(cardUids.join(','))
    },
    filament: {
      id: spool.spoolmanId,
      registered: spool.dateAdded || null,
      name: spool.name || 'Unnamed Spool',
      material: type,
      price: null,
      density: densityFor(type),
      diameter: FILAMENT_DIAMETER_MM,
      weight: net,
      spool_weight: null,
      article_number: null,
      comment: null,
      settings_extruder_temp: spool.maxTemp || null,
      settings_bed_temp: spool.bedMaxTemp || null,
      color_hex: colorHex,
      multi_color_hexes: null,
      multi_color_direction: null,
      external_id: null,
      extra: {
        variant: encodeExtraString(spool.variant || '')
      },
      vendor: {
        id: 1,
        registered: spool.dateAdded || null,
        name: spool.brand || 'Generic',
        comment: null,
        empty_spool_weight: null,
        external_id: null,
        extra: {}
      }
    }
  };
}

async function readSpools() {
  return fs.readJson(deps.dbFile);
}

async function writeSpools(spools) {
  await fs.writeJson(deps.dbFile, spools);
}

async function readFields() {
  try {
    return await fs.readJson(deps.fieldsFile);
  } catch {
    return { spool: [], filament: [], vendor: [] };
  }
}

function findBySpoolmanId(spools, id) {
  const numId = parseInt(id, 10);
  if (!Number.isFinite(numId)) return -1;
  return spools.findIndex(s => s.spoolmanId === numId);
}

// -- Migration ---------------------------------------------------------------

// Ensure every spool has spoolmanId / cardUids / netWeight / usedWeight.
// Called from initDb(). Returns true if anything changed.
function migrateSpoolsForSpoolman(spools) {
  let migrated = false;
  let nextId = spools.reduce(
    (max, s) => Math.max(max, Number.isFinite(s.spoolmanId) ? s.spoolmanId : 0), 0) + 1;
  spools.forEach(spool => {
    if (!Number.isFinite(spool.spoolmanId)) {
      spool.spoolmanId = nextId++;
      migrated = true;
    }
    if (!Array.isArray(spool.cardUids)) {
      spool.cardUids = [];
      migrated = true;
    }
    if (!Number.isFinite(parseFloat(spool.netWeight))) {
      spool.netWeight = DEFAULT_NET_WEIGHT;
      migrated = true;
    }
    if (!Number.isFinite(parseFloat(spool.usedWeight))) {
      spool.usedWeight = ((parseFloat(spool.usedPercentage) || 0) / 100) * netWeightOf(spool);
      migrated = true;
    }
  });
  return migrated;
}

function nextSpoolmanId(spools) {
  return spools.reduce(
    (max, s) => Math.max(max, Number.isFinite(s.spoolmanId) ? s.spoolmanId : 0), 0) + 1;
}

// -- WebSocket ---------------------------------------------------------------

function attachSpoolmanWebSocket(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0].replace(/\/+$/, '');
    if (pathname === '/api/v1/spool') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    deps.logMsg('INFO', `Spoolman WS client connected (${req.socket.remoteAddress})`);
    ws.on('close', () => {
      deps.logMsg('INFO', 'Spoolman WS client disconnected');
    });
  });

  // Moonraker tracks server pings to detect a dead connection; ping every 20s
  // and drop clients that stop answering.
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 20000);
  wss.on('close', () => clearInterval(pingInterval));
}

// Broadcast a Spoolman-format resource event to all websocket clients.
// type: 'added' | 'updated' | 'deleted'; spool: SpoolKeep spool record.
function broadcastSpoolEvent(type, spool) {
  if (!wss || !spool || !Number.isFinite(spool.spoolmanId)) return;
  const message = JSON.stringify({
    type,
    resource: 'spool',
    date: new Date().toISOString(),
    payload: toSpoolmanSpool(spool)
  });
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(message);
  });
}

// -- Routes ------------------------------------------------------------------

function registerSpoolmanApi(app, options) {
  deps = {
    dbFile: options.dbFile,
    fieldsFile: options.fieldsFile,
    dataDir: options.dataDir,
    logMsg: options.logMsg || (() => {})
  };

  app.get('/api/v1/info', (_req, res) => {
    res.json({
      version: '0.22.1',
      debug_mode: false,
      automatic_backups: false,
      data_dir: deps.dataDir,
      backups_dir: '',
      db_type: 'json',
      git_commit: 'spoolkeep',
      build_date: null
    });
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  // Custom field definitions (spoollink ensures card_uids/variant exist)
  app.get('/api/v1/field/:entityType', async (req, res) => {
    try {
      const fields = await readFields();
      res.json(fields[req.params.entityType] || []);
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to read custom fields', error);
      res.status(500).json({ message: 'Failed to read custom fields' });
    }
  });

  app.post('/api/v1/field/:entityType/:key', async (req, res) => {
    try {
      const { entityType, key } = req.params;
      const fields = await readFields();
      if (!Array.isArray(fields[entityType])) fields[entityType] = [];
      const def = {
        key,
        name: req.body.name || key,
        entity_type: entityType,
        field_type: req.body.field_type || 'text',
        order: req.body.order !== undefined ? req.body.order : 0,
        default_value: req.body.default_value !== undefined ? req.body.default_value : null,
        choices: req.body.choices || null,
        multi_choice: req.body.multi_choice || null
      };
      const idx = fields[entityType].findIndex(f => f.key === key);
      if (idx === -1) fields[entityType].push(def);
      else fields[entityType][idx] = def;
      await fs.writeJson(deps.fieldsFile, fields);
      deps.logMsg('INFO', `Spoolman API: custom field ${entityType}/${key} registered`);
      res.json(fields[entityType]);
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to create custom field', error);
      res.status(500).json({ message: 'Failed to create custom field' });
    }
  });

  // List spools
  app.get('/api/v1/spool', async (req, res) => {
    try {
      let spools = await readSpools();
      const limit = parseInt(req.query.limit, 10);
      if (Number.isFinite(limit) && limit > 0) spools = spools.slice(0, limit);
      const mapped = spools.map(toSpoolmanSpool);
      res.set('x-total-count', String(mapped.length));
      res.json(mapped);
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to list spools', error);
      res.status(500).json({ message: 'Failed to list spools' });
    }
  });

  // Get spool by numeric id
  app.get('/api/v1/spool/:id', async (req, res) => {
    try {
      const spools = await readSpools();
      const idx = findBySpoolmanId(spools, req.params.id);
      if (idx === -1) {
        return res.status(404).json({ message: `No spool with ID ${req.params.id} found.` });
      }
      res.json(toSpoolmanSpool(spools[idx]));
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to get spool', error);
      res.status(500).json({ message: 'Failed to get spool' });
    }
  });

  // Update spool (spoollink PATCHes extra.card_uids to bind/unbind RFID cards)
  app.patch('/api/v1/spool/:id', async (req, res) => {
    try {
      const spools = await readSpools();
      const idx = findBySpoolmanId(spools, req.params.id);
      if (idx === -1) {
        return res.status(404).json({ message: `No spool with ID ${req.params.id} found.` });
      }
      const spool = spools[idx];

      if (req.body.extra && req.body.extra.card_uids !== undefined) {
        const decoded = decodeExtraString(req.body.extra.card_uids);
        spool.cardUids = decoded
          .split(',')
          .map(u => u.trim().toUpperCase())
          .filter(u => u.length > 0);
        deps.logMsg('INFO',
          `Spoolman API: spool #${spool.spoolmanId} card UIDs set to [${spool.cardUids.join(', ')}]`);
      }
      if (req.body.initial_weight !== undefined) {
        const w = parseFloat(req.body.initial_weight);
        if (Number.isFinite(w) && w > 0) spool.netWeight = w;
      }
      if (req.body.remaining_weight !== undefined) {
        const w = parseFloat(req.body.remaining_weight);
        if (Number.isFinite(w)) spool.usedWeight = Math.max(0, netWeightOf(spool) - w);
      }
      if (req.body.used_weight !== undefined) {
        const w = parseFloat(req.body.used_weight);
        if (Number.isFinite(w)) spool.usedWeight = Math.max(0, w);
      }
      syncUsedPercentage(spool);

      await writeSpools(spools);
      broadcastSpoolEvent('updated', spool);
      res.json(toSpoolmanSpool(spool));
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to patch spool', error);
      res.status(500).json({ message: 'Failed to update spool' });
    }
  });

  // Filament usage reporting from Moonraker (every sync_rate seconds while printing)
  app.put('/api/v1/spool/:id/use', async (req, res) => {
    try {
      const spools = await readSpools();
      const idx = findBySpoolmanId(spools, req.params.id);
      if (idx === -1) {
        return res.status(404).json({ message: `No spool with ID ${req.params.id} found.` });
      }
      const spool = spools[idx];

      let grams = 0;
      if (req.body.use_weight !== undefined) {
        const w = parseFloat(req.body.use_weight);
        if (!Number.isFinite(w)) {
          return res.status(422).json({ message: 'use_weight must be a number' });
        }
        grams += w;
      }
      if (req.body.use_length !== undefined) {
        const mm = parseFloat(req.body.use_length);
        if (!Number.isFinite(mm)) {
          return res.status(422).json({ message: 'use_length must be a number' });
        }
        grams += mmToGrams(mm, spool.type);
      }

      spool.usedWeight = Math.max(0, usedWeightOf(spool) + grams);
      syncUsedPercentage(spool);

      await writeSpools(spools);
      broadcastSpoolEvent('updated', spool);
      res.json(toSpoolmanSpool(spool));
    } catch (error) {
      deps.logMsg('ERROR', 'Spoolman API: failed to report spool usage', error);
      res.status(500).json({ message: 'Failed to report spool usage' });
    }
  });
}

module.exports = {
  registerSpoolmanApi,
  attachSpoolmanWebSocket,
  broadcastSpoolEvent,
  migrateSpoolsForSpoolman,
  nextSpoolmanId,
  toSpoolmanSpool
};
