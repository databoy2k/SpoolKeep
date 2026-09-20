// Automatic spool linking for a connected printer (Snapmaker U1 extended
// firmware / PAXX + Moonraker + SpoolLink).
//
// Reads the printer's live lane state (RFID card UID plus the vendor /
// material / colour the printer is actually using), matches each loaded lane
// to a spool in the SpoolKeep inventory, and binds them by issuing
// `SET_SPOOL_ID` over Moonraker - the same command the firmware's own
// /filament page sends from its spool picker.
//
// Lane data comes from two Moonraker objects:
//   filament_detect    - the RFID read: CARD_UID, VENDOR, MAIN_TYPE, RGB_1 ...
//   print_task_config  - what the printer is actually using per lane:
//                        filament_spool_id[] (the current Spoolman binding),
//                        filament_vendor[] / filament_type[] and the real
//                        colour, which are populated for hand-configured
//                        lanes too, not just RFID ones.
//
// Once a lane is linked, the card UID is remembered on the SpoolKeep spool
// (cardUids), so the next time that tag shows up in any lane it is matched
// exactly instead of guessed.
//
// Endpoints:
//   GET  /api/printer/status        - is the printer/Moonraker reachable + Spoolman connected
//   GET  /api/printer/link/preview  - per-lane read data + suggested inventory match
//   POST /api/printer/link/apply    - { links: [{ lane, spoolmanId, cardUid }] } -> SET_SPOOL_ID

const fs = require('fs-extra');

let deps = null; // { dbFile, logMsg, axios, getPrinterUrl, onSpoolUpdated }

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

// Card UIDs are stored in a couple of shapes depending on who wrote them
// (SpoolLink writes bare hex, the firmware UI displays colon-separated pairs).
function normUid(uid) {
  return String(uid || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
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
    if (s.length === 8) s = s.slice(0, 6); // RRGGBBAA
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

// Rank inventory spools for a lane read. A card UID already stored on a spool
// is an exact match and always wins; otherwise prefer same brand, then same
// type, then closest colour. Returns { suggestion, matchedBy, candidates }.
function matchSpools(spools, read) {
  const laneUid = normUid(read.cardUid);
  const uidSpool = laneUid
    ? spools.find(s => (Array.isArray(s.cardUids) ? s.cardUids : []).some(u => normUid(u) === laneUid))
    : null;

  const scored = spools.map(spool => {
    const dist = colourDistance(read.colorHex, spool.colourHex || spool.colorHex);
    const brandMatch = !!(read.vendor && spool.brand &&
      read.vendor.toLowerCase() === spool.brand.toLowerCase());
    const typeMatch = normType(read.material) === normType(spool.type);
    const uidMatch = !!uidSpool && spool === uidSpool;
    // Lower is better: brand and type mismatches add large penalties so an
    // exact brand+type colour match always wins. A known card UID outranks
    // everything else.
    const score = uidMatch
      ? -1
      : (Number.isFinite(dist) ? dist : 1000) + (brandMatch ? 0 : 400) + (typeMatch ? 0 : 800);
    return { spool, dist, brandMatch, typeMatch, uidMatch, score };
  }).sort((a, b) => a.score - b.score);

  const candidates = scored.map(s => ({
    spoolmanId: s.spool.spoolmanId,
    id: s.spool.id,
    name: s.spool.name,
    brand: s.spool.brand,
    type: s.spool.type,
    colourHex: s.spool.colourHex || s.spool.colorHex,
    colourDistance: Number.isFinite(s.dist) ? Math.round(s.dist) : null,
    brandMatch: s.brandMatch,
    typeMatch: s.typeMatch,
    uidMatch: s.uidMatch
  }));

  const top = scored[0];
  if (top && top.uidMatch) {
    return { suggestion: candidates[0].spoolmanId, matchedBy: 'card', candidates };
  }
  // Only auto-suggest a confident match: right type and a close colour.
  const confident = !!(top && top.typeMatch && top.dist < 60);
  return {
    suggestion: confident ? candidates[0].spoolmanId : null,
    matchedBy: confident ? (top.brandMatch ? 'brand + colour' : 'colour') : null,
    candidates
  };
}

async function fetchPrinterState() {
  const base = printerUrl();
  if (!base) throw new Error('No printer URL configured');
  const resp = await deps.axios.get(
    `${base}/printer/objects/query?filament_detect&print_task_config`,
    { timeout: 8000 });
  const status = resp.data?.result?.status || {};
  const info = status.filament_detect?.info;
  if (!Array.isArray(info)) throw new Error('Printer did not return filament_detect data');
  return { info, ptc: status.print_task_config || {} };
}

// Merge one lane's filament_detect entry with print_task_config into the
// single "what is in this lane" record the matcher works from.
function readLane(idx, fd, ptc) {
  const at = (arr) => (Array.isArray(arr) ? arr[idx] : undefined);
  const clean = (v) => (v && v !== 'NONE' ? String(v).trim() : '');

  const cardUid = uidToHex(fd.CARD_UID);
  const rfidVendor = clean(fd.VENDOR);
  const rfidMaterial = clean(fd.MAIN_TYPE);
  // A bare or unprogrammed tag reports sentinel values (white colour, zeroed
  // temps), so only trust its colour when it carries real filament metadata.
  const rfidHasData = !!(rfidVendor || rfidMaterial);
  const rfidColour = rfidHasData ? intToHexColour(fd.RGB_1) : '';

  // print_task_config is the printer's working copy: populated for RFID lanes
  // and for lanes the user configured by hand.
  const ptcVendor = clean(at(ptc.filament_vendor));
  const ptcMaterial = clean(at(ptc.filament_type));
  const multi = at(ptc.filament_color_multi);
  const ptcColour = (multi && multi.nums > 0 && Array.isArray(multi.colors) && multi.colors[0])
    ? String(multi.colors[0]).toUpperCase()
    : String(at(ptc.filament_color_rgba) || '').slice(0, 6).toUpperCase();

  const spoolIdRaw = parseInt(at(ptc.filament_spool_id), 10);

  return {
    lane: `E${idx}`,
    extruder: idx + 1,
    cardUid,
    cardType: fd.CARD_TYPE || '',
    vendor: ptcVendor || rfidVendor,
    material: ptcMaterial || rfidMaterial,
    colorHex: ptcColour || rfidColour,
    official: !!at(ptc.filament_official),
    filamentPresent: !!at(ptc.filament_exist),
    currentSpoolId: Number.isFinite(spoolIdRaw) && spoolIdRaw > 0 ? spoolIdRaw : 0
  };
}

// Remember the lane's card UID on the spool it was just linked to, so the next
// read is an exact match instead of a guess.
async function rememberCardUid(spoolmanId, cardUid) {
  const uid = normUid(cardUid);
  if (!uid) return;
  const spools = await fs.readJson(deps.dbFile);
  const spool = spools.find(s => s.spoolmanId === spoolmanId);
  if (!spool) return;
  if (!Array.isArray(spool.cardUids)) spool.cardUids = [];
  if (spool.cardUids.some(u => normUid(u) === uid)) return;
  spool.cardUids.push(uid);
  await fs.writeJson(deps.dbFile, spools, { spaces: 2 });
  deps.logMsg('INFO', `Printer link: card ${uid} remembered on spool #${spoolmanId}`);
  if (deps.onSpoolUpdated) deps.onSpoolUpdated(spool);
}

function registerPrinterLinkApi(app, options) {
  deps = {
    dbFile: options.dbFile,
    logMsg: options.logMsg || (() => {}),
    axios: options.axios,
    getPrinterUrl: options.getPrinterUrl || (() => ''),
    onSpoolUpdated: options.onSpoolUpdated || null
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
      const { info, ptc } = await fetchPrinterState();
      const spools = await fs.readJson(deps.dbFile);
      const lanes = [];
      info.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object') return;
        const read = readLane(idx, entry, ptc);
        // Skip empty lanes: nothing loaded, no card, no metadata
        if (!read.cardUid && !read.vendor && !read.material && !read.filamentPresent) return;
        const { suggestion, matchedBy, candidates } = matchSpools(spools, read);
        const linked = spools.find(s => s.spoolmanId === read.currentSpoolId) || null;
        lanes.push({
          ...read,
          currentSpool: linked
            ? { spoolmanId: linked.spoolmanId, name: linked.name, brand: linked.brand, type: linked.type }
            : null,
          // The printer already points at the spool we would pick: nothing to do.
          alreadyLinked: read.currentSpoolId > 0 && read.currentSpoolId === suggestion,
          suggestedSpoolId: suggestion,
          matchedBy,
          candidates
        });
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
        if (ok && spoolId > 0 && link.cardUid) {
          try {
            await rememberCardUid(spoolId, link.cardUid);
          } catch (uidError) {
            deps.logMsg('ERROR', `Printer link: could not store card UID for #${spoolId}`, uidError);
          }
        }
      } catch (error) {
        results.push({ lane, spoolmanId: spoolId, ok: false, error: error.message });
        deps.logMsg('ERROR', `Printer link SET_SPOOL_ID ${lane} failed`, error);
      }
    }
    res.json({ results });
  });
}

module.exports = { registerPrinterLinkApi };
