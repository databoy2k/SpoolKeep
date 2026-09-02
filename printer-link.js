// Automatic spool linking for a connected printer (Snapmaker U1 extended
// firmware / Moonraker + SpoolLink).
//
// Reads the printer's live filament detection (RFID card UID + vendor +
// material + colour per lane), matches each loaded lane to a spool in the
// SpoolKeep inventory, and binds them by issuing `SET_SPOOL_ID` over
// Moonraker. The firmware writes the card UID into the spool's card_uids for
// us, so subsequent scans of that tag resolve automatically.
//
// Endpoints:
//   GET  /api/printer/status        - is the printer/Moonraker reachable + Spoolman connected
//   GET  /api/printer/link/preview  - per-lane read data + suggested inventory match
//   POST /api/printer/link/apply    - { links: [{ lane, spoolmanId }] } -> SET_SPOOL_ID

const fs = require('fs-extra');

let deps = null; // { dbFile, logMsg, axios, getPrinterUrl }

function printerUrl() {
  const u = (deps.getPrinterUrl() || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  return /^https?:\/\//.test(u) ? u : `http://${u}`;
}

// Convert a filament_detect CARD_UID (array of byte ints) to uppercase hex.
// Returns '' when there is no card (missing / all-zero), matching the
// firmware's own _uid_to_hex behaviour.
function uidToHex(uidRaw) {
  if (!Array.isArray(uidRaw) || uidRaw.length === 0) return '';
  if (uidRaw.every(b => b === 0)) return '';
  return uidRaw.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function intToHexColour(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  // filament_detect RGB_1 is a 24-bit 0xRRGGBB integer
  return (n & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
}

function colourDistance(hexA, hexB) {
  const norm = (h) => {
    let s = String(h || '').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    return s.length === 6 ? s : null;
  };
  const a = norm(hexA), b = norm(hexB);
  if (!a || !b) return Infinity;
  const r1 = parseInt(a.slice(0, 2), 16), g1 = parseInt(a.slice(2, 4), 16), b1 = parseInt(a.slice(4, 6), 16);
  const r2 = parseInt(b.slice(0, 2), 16), g2 = parseInt(b.slice(2, 4), 16), b2 = parseInt(b.slice(4, 6), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function normType(t) {
  return String(t || '').toUpperCase().replace(/\+/g, '').trim();
}

// Rank inventory spools for a lane read. Prefers same brand, then same type,
// then closest colour. Returns { suggestion, candidates }.
function matchSpools(spools, read) {
  const scored = spools.map(spool => {
    const dist = colourDistance(read.colorHex, spool.colourHex || spool.colorHex);
    const brandMatch = read.vendor && spool.brand &&
      read.vendor.toLowerCase() === spool.brand.toLowerCase();
    const typeMatch = normType(read.material) === normType(spool.type);
    // Lower is better: brand and type mismatches add large penalties so an
    // exact brand+type colour match always wins.
    const score = dist + (brandMatch ? 0 : 400) + (typeMatch ? 0 : 800);
    return { spool, dist, brandMatch, typeMatch, score };
  }).sort((a, b) => a.score - b.score);

  const candidates = scored.map(s => ({
    spoolmanId: s.spool.spoolmanId,
    id: s.spool.id,
    name: s.spool.name,
    brand: s.spool.brand,
    type: s.spool.type,
    colourHex: s.spool.colourHex || s.spool.colorHex,
    colourDistance: Math.round(s.dist),
    brandMatch: s.brandMatch,
    typeMatch: s.typeMatch
  }));

  // Only auto-suggest a confident match: right type and a close colour.
  const top = scored[0];
  const suggestion = (top && top.typeMatch && top.dist < 60)
    ? candidates[0].spoolmanId
    : null;

  return { suggestion, candidates };
}

async function fetchPrinterInfo() {
  const base = printerUrl();
  if (!base) throw new Error('No printer URL configured');
  const resp = await deps.axios.get(
    `${base}/printer/objects/query?filament_detect`,
    { timeout: 8000 });
  const info = resp.data?.result?.status?.filament_detect?.info;
  if (!Array.isArray(info)) throw new Error('Printer did not return filament_detect data');
  return info;
}

function registerPrinterLinkApi(app, options) {
  deps = {
    dbFile: options.dbFile,
    logMsg: options.logMsg || (() => {}),
    axios: options.axios,
    getPrinterUrl: options.getPrinterUrl || (() => '')
  };

  app.get('/api/printer/status', async (_req, res) => {
    const base = printerUrl();
    if (!base) return res.json({ configured: false });
    try {
      const [srv, spool] = await Promise.all([
        deps.axios.get(`${base}/server/info`, { timeout: 6000 }),
        deps.axios.get(`${base}/server/spoolman/status`, { timeout: 6000 }).catch(() => null)
      ]);
      res.json({
        configured: true,
        reachable: true,
        klippyState: srv.data?.result?.klippy_state || null,
        spoolmanConnected: !!spool?.data?.result?.spoolman_connected
      });
    } catch (error) {
      res.json({ configured: true, reachable: false, error: error.message });
    }
  });

  // Read each lane's live filament data and suggest an inventory match.
  app.get('/api/printer/link/preview', async (_req, res) => {
    try {
      const info = await fetchPrinterInfo();
      const spools = await fs.readJson(deps.dbFile);
      const lanes = [];
      info.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object') return;
        const cardUid = uidToHex(entry.CARD_UID);
        const vendor = entry.VENDOR && entry.VENDOR !== 'NONE' ? entry.VENDOR : '';
        const material = entry.MAIN_TYPE && entry.MAIN_TYPE !== 'NONE' ? entry.MAIN_TYPE : '';
        // Skip empty lanes: no card and no filament metadata
        if (!cardUid && !vendor && !material) return;
        const read = {
          lane: `E${idx}`,
          extruder: idx + 1,
          cardUid,
          cardType: entry.CARD_TYPE || '',
          vendor,
          material,
          colorHex: intToHexColour(entry.RGB_1),
          currentSpoolId: entry.SPOOL_ID && Number.isFinite(entry.SPOOL_ID) ? entry.SPOOL_ID : 0
        };
        const { suggestion, candidates } = matchSpools(spools, read);
        lanes.push({ ...read, suggestedSpoolId: suggestion, candidates });
      });
      res.json({ lanes });
    } catch (error) {
      deps.logMsg('ERROR', 'Printer link preview failed', error);
      res.status(502).json({ error: `Could not read printer: ${error.message}` });
    }
  });

  // Apply the confirmed links via SET_SPOOL_ID.
  app.post('/api/printer/link/apply', async (req, res) => {
    const base = printerUrl();
    if (!base) return res.status(400).json({ error: 'No printer URL configured' });
    const links = Array.isArray(req.body?.links) ? req.body.links : null;
    if (!links) return res.status(400).json({ error: 'links must be an array' });

    const results = [];
    for (const link of links) {
      const lane = String(link.lane || '').trim();
      const spoolId = parseInt(link.spoolmanId, 10);
      if (!/^E\d+$/.test(lane) || !Number.isFinite(spoolId)) {
        results.push({ lane, ok: false, error: 'invalid lane or spoolmanId' });
        continue;
      }
      try {
        const script = `SET_SPOOL_ID LANE=${lane} SPOOL_ID=${spoolId}`;
        const resp = await deps.axios.get(
          `${base}/printer/gcode/script`,
          { params: { script }, timeout: 10000 });
        const ok = resp.data?.result === 'ok';
        results.push({ lane, spoolmanId: spoolId, ok });
        deps.logMsg('INFO', `Printer link: ${script} -> ${ok ? 'ok' : 'unexpected response'}`);
      } catch (error) {
        results.push({ lane, spoolmanId: spoolId, ok: false, error: error.message });
        deps.logMsg('ERROR', `Printer link SET_SPOOL_ID ${lane} failed`, error);
      }
    }
    res.json({ results });
  });
}

module.exports = { registerPrinterLinkApi };
