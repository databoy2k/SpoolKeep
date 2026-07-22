// Cross-reference SpoolKeep spools against the SimplyPrint slicer-profiles-db.
//
//   https://github.com/SimplyPrint/slicer-profiles-db
//
// The repo stores OrcaSlicer filament presets at
//   profiles/orcaslicer/<PrinterVendor>/filament/<Preset Name>.json
// where <Preset Name> is "<Filament Name> @<printer variant>". Roughly 6000
// files collapse to ~1300 distinct filaments once the variant suffix is
// stripped. We index the collapsed set, preferring the printer-agnostic
// "@System" variant when one exists.
//
// Profile files are NOT raw Orca presets -- each setting is keyed by the slicer
// version it was seen in, so they have to be flattened before use.

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

const REPO = 'SimplyPrint/slicer-profiles-db';
const BRANCH = 'main';
const PROFILE_ROOT = 'profiles/orcaslicer';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const API_BASE = `https://api.github.com/repos/${REPO}`;

const DATA_DIR = path.join(__dirname, 'data');
const INDEX_FILE = path.join(DATA_DIR, 'profile-db-index.json');
const CACHE_DIR = path.join(DATA_DIR, 'profile-db-cache');

const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MATCH_THRESHOLD = 55;
const REQUEST_TIMEOUT = 20000;

// Material tokens that may appear in a preset name, longest first so that
// "PETG-CF" wins over "PETG".
const TYPE_TOKENS = [
  'PPA-CF', 'PPA-GF', 'PETG-CF', 'PETG HF', 'PLA-CF', 'PLA+', 'PA6-CF', 'PA6-GF',
  'PAHT-CF', 'PA-CF', 'ABS-GF', 'ASA-CF', 'PET-CF', 'PPS-CF', 'PP-CF', 'PP-GF',
  'PE-CF', 'PCTG', 'PETG', 'PVA', 'BVOH', 'HIPS', 'TPU', 'ABS', 'ASA', 'PLA',
  'PA6', 'PPA', 'PPS', 'PHA', 'SBS', 'EVA', 'PVB', 'PET', 'PLA', 'PC', 'PP',
  'PE', 'PA',
];

let indexCache = null;

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenise(value) {
  const n = normalise(value);
  return n ? n.split(' ') : [];
}

function detectType(name) {
  const upper = String(name || '').toUpperCase();
  return TYPE_TOKENS.find(t => upper.includes(t)) || null;
}

// Reduce a material to its family so PLA / PLA+ / PLA-CF / PLA Matte all
// compare equal. Without this an exact "SUNLU PLA+ 2.0" hit gets penalised for
// not being literally "PLA".
function familyOf(type) {
  const detected = detectType(type) || String(type || '').toUpperCase();
  return detected
    .replace(/\+/g, '')
    .replace(/-(CF|GF)$/, '')
    .replace(/\s+HF$/, '')
    .replace(/\d+$/, '') || detected;
}

// ---------------------------------------------------------------- index build

async function getTree(sha, recursive = false) {
  const { data } = await axios.get(
    `${API_BASE}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`,
    { timeout: REQUEST_TIMEOUT, headers: { Accept: 'application/vnd.github+json' } }
  );
  return data;
}

async function fetchProfileTree() {
  // A recursive listing of the repo root exceeds GitHub's cap and comes back
  // truncated, so walk down to profiles/orcaslicer first and recurse only from
  // there. Three API calls total, which matters on the unauthenticated
  // 60-requests-per-hour budget.
  const root = await getTree(BRANCH);
  const profiles = root.tree.find(n => n.path === 'profiles' && n.type === 'tree');
  if (!profiles) throw new Error('profiles/ not found in profile DB');

  const profilesTree = await getTree(profiles.sha);
  const orca = profilesTree.tree.find(n => n.path === 'orcaslicer' && n.type === 'tree');
  if (!orca) throw new Error(`${PROFILE_ROOT}/ not found in profile DB`);

  const tree = await getTree(orca.sha, true);
  if (tree.truncated) throw new Error('Profile DB tree listing was truncated');

  const entries = [];
  for (const node of tree.tree) {
    if (node.type !== 'blob') continue;
    const parts = node.path.split('/');
    if (parts.length !== 3 || parts[1] !== 'filament' || !parts[2].endsWith('.json')) continue;
    entries.push({
      printerVendor: parts[0],
      path: `${PROFILE_ROOT}/${node.path}`,
      preset: parts[2].slice(0, -'.json'.length),
    });
  }
  return { entries, parentSha: orca.sha };
}

function collapseVariants(entries) {
  const byBase = new Map();
  for (const entry of entries) {
    const [base, variant = ''] = entry.preset.split(/\s+@/);
    const existing = byBase.get(base);
    const candidate = {
      base,
      variant,
      path: entry.path,
      printerVendor: entry.printerVendor,
      type: detectType(base),
      tokens: tokenise(base),
    };
    // Printer-agnostic "@System" presets are the safest default; otherwise keep
    // whichever variant we saw first.
    if (!existing || (variant === 'System' && existing.variant !== 'System')) {
      byBase.set(base, candidate);
    }
  }
  return [...byBase.values()].sort((a, b) => a.base.localeCompare(b.base));
}

async function refreshIndex() {
  const { entries, parentSha } = await fetchProfileTree();
  const collapsed = collapseVariants(entries);
  const index = {
    repo: REPO,
    branch: BRANCH,
    sha: parentSha || null,
    fetchedAt: new Date().toISOString(),
    fileCount: entries.length,
    entries: collapsed,
  };
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(INDEX_FILE, index);
  indexCache = index;
  return index;
}

async function loadIndex() {
  if (indexCache) return indexCache;
  if (await fs.pathExists(INDEX_FILE)) {
    indexCache = await fs.readJson(INDEX_FILE);
    return indexCache;
  }
  return null;
}

async function ensureIndex() {
  const index = await loadIndex();
  if (!index) return refreshIndex();
  const age = Date.now() - new Date(index.fetchedAt).getTime();
  if (Number.isFinite(age) && age > INDEX_MAX_AGE_MS) {
    try {
      return await refreshIndex();
    } catch {
      return index; // stale beats nothing
    }
  }
  return index;
}

async function status() {
  const index = await loadIndex();
  return {
    repo: REPO,
    entryCount: index ? index.entries.length : 0,
    fileCount: index ? index.fileCount : 0,
    fetchedAt: index ? index.fetchedAt : null,
  };
}

// -------------------------------------------------------------------- lookups

function scoreEntry(entry, queryTokens, spoolType) {
  const entryTokens = entry.tokens;
  if (!entryTokens.length) return 0;

  const querySet = new Set(queryTokens);
  const entrySet = new Set(entryTokens);
  const entryCoverage = entryTokens.filter(t => querySet.has(t)).length / entryTokens.length;
  const queryCoverage = queryTokens.filter(t => entrySet.has(t)).length / Math.max(queryTokens.length, 1);

  let score = 50 * entryCoverage + 20 * queryCoverage;

  // The vendor prefix carries most of the signal -- "SUNLU PLA+" should never
  // match a spool branded eSUN just because both are PLA.
  if (querySet.has(entryTokens[0])) score += 40;

  // Same token set both ways: the preset name and the spool name are the same
  // filament, not merely overlapping.
  if (entryCoverage === 1 && queryCoverage === 1) score += 15;

  if (entry.type && spoolType) {
    if (entry.type.toUpperCase() === spoolType.toUpperCase()) score += 15;
    else if (familyOf(entry.type) === familyOf(spoolType)) score += 10;
    else score -= 25;
  }
  return score;
}

async function match({ brand, name, type }) {
  const index = await ensureIndex();
  if (!index) return { match: null, alternates: [] };

  const queryTokens = [...tokenise(brand), ...tokenise(name)];
  if (!queryTokens.length) return { match: null, alternates: [] };

  const spoolType = detectType(type) || type;
  const ranked = index.entries
    .map(entry => ({ entry, score: scoreEntry(entry, queryTokens, spoolType) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const best = ranked[0];
  return {
    match: best && best.score >= MATCH_THRESHOLD
      ? { ...best.entry, score: Math.round(best.score) }
      : null,
    alternates: ranked
      .slice(best && best.score >= MATCH_THRESHOLD ? 1 : 0)
      .filter(r => r.score > 0)
      .map(r => ({ ...r.entry, score: Math.round(r.score) })),
  };
}

// SimplyPrint stores {settings: {key: {slicerVersion: value}}}. Take the newest
// version present for each key and drop Orca's "nil" placeholders.
function flattenProfile(doc) {
  const out = {};
  for (const [key, versions] of Object.entries(doc.settings || {})) {
    const newest = Object.keys(versions).sort(compareVersions).pop();
    const value = versions[newest];
    if (value === 'nil' || (Array.isArray(value) && value[0] === 'nil')) continue;
    out[key] = value;
  }
  return out;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

async function fetchProfile(profilePath) {
  const index = await ensureIndex();
  // Only ever fetch paths the index vouches for -- this endpoint is reachable
  // from the browser and must not become an arbitrary-URL fetcher.
  if (!index || !index.entries.some(e => e.path === profilePath)) {
    throw new Error('Unknown profile path');
  }

  const key = crypto.createHash('sha1').update(profilePath).digest('hex');
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  if (await fs.pathExists(cacheFile)) {
    return fs.readJson(cacheFile);
  }

  const url = RAW_BASE + profilePath.split('/').map(encodeURIComponent).join('/');
  const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
  const flattened = flattenProfile(data);
  const record = {
    path: profilePath,
    name: data.name,
    vendor: data.vendor,
    filamentId: data.filament_id || null,
    settings: flattened,
  };
  await fs.ensureDir(CACHE_DIR);
  await fs.writeJson(cacheFile, record);
  return record;
}

async function clearCache() {
  await fs.remove(CACHE_DIR);
  await fs.remove(INDEX_FILE);
  indexCache = null;
}

module.exports = {
  REPO,
  clearCache,
  ensureIndex,
  fetchProfile,
  flattenProfile,
  match,
  refreshIndex,
  status,
};
