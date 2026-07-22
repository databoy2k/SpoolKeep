// Shared OrcaSlicer filament-preset construction.
//
// A preset is built in three layers, each overriding the one before it:
//   1. Baseline   - per-material defaults from profile-baselines.json, optionally
//                   overridden by the user in Settings > Filament Profile Defaults.
//   2. DB overlay - settings from a confirmed SimplyPrint profile match (optional).
//   3. Spool      - identity and temperatures, always taken from the spool record.
//
// Both export paths (spool export and colour-version export in server.js) go
// through buildFilamentPreset so they can never drift apart again.

const fs = require('fs-extra');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, 'profile-baselines.json');

// SpoolKeep's material dropdown does not line up 1:1 with OrcaSlicer's generic
// profiles. Anything not listed here falls back to the type name as-is, then PLA.
const TYPE_ALIASES = {
  'PLA+': 'PLA',
  PLAPLUS: 'PLA',
  NYLON: 'PA',
  PET: 'PETG',
  'PETG-CF': 'PETG-CF',
  PETGCF: 'PETG-CF',
  'PA-CF': 'PA-CF',
  PACF: 'PA-CF',
  'PLA-CF': 'PLA-CF',
  PLACF: 'PLA-CF',
  TPU95A: 'TPU',
  TPU98A: 'TPU',
  OTHER: 'PLA',
};

const FALLBACK_TYPE = 'PLA';

// Keys the spool record owns. Never sourced from a baseline or a DB match.
const SPOOL_OWNED_KEYS = [
  'name', 'from', 'inherits', 'version', 'is_custom_defined', 'type',
  'instantiation', 'filament_settings_id', 'filament_id', 'setting_id',
  'filament_vendor', 'default_filament_colour', 'filament_type',
  'renamed_from', 'filament_notes',
  'nozzle_temperature', 'nozzle_temperature_initial_layer',
  'nozzle_temperature_range_low', 'nozzle_temperature_range_high',
  // Only the plates SpoolKeep's bedMaxTemp actually refers to. The cool /
  // engineering / supertack plate temps are material data and stay in the
  // baseline.
  'hot_plate_temp', 'hot_plate_temp_initial_layer',
  'textured_plate_temp', 'textured_plate_temp_initial_layer',
  'compatible_printers', 'compatible_printers_condition',
  'compatible_prints', 'compatible_prints_condition',
  'filament_extruder_variant',
];
const SPOOL_OWNED = new Set(SPOOL_OWNED_KEYS);

// The subset surfaced as form fields in Settings. Everything else in a baseline
// stays editable through the raw-JSON pane.
const CURATED_FIELDS = [
  { key: 'filament_density', label: 'Density', group: 'Material', kind: 'number', unit: 'g/cm³' },
  { key: 'filament_diameter', label: 'Diameter', group: 'Material', kind: 'number', unit: 'mm' },
  { key: 'filament_cost', label: 'Cost', group: 'Material', kind: 'number', unit: '/kg' },
  { key: 'filament_shrink', label: 'Shrinkage', group: 'Material', kind: 'text' },
  { key: 'temperature_vitrification', label: 'Softening temp', group: 'Material', kind: 'number', unit: '°C' },
  { key: 'filament_soluble', label: 'Soluble', group: 'Material', kind: 'bool' },
  { key: 'required_nozzle_HRC', label: 'Required nozzle HRC', group: 'Material', kind: 'number' },

  { key: 'filament_flow_ratio', label: 'Flow ratio', group: 'Flow', kind: 'number' },
  { key: 'filament_max_volumetric_speed', label: 'Max volumetric speed', group: 'Flow', kind: 'number', unit: 'mm³/s' },
  { key: 'enable_pressure_advance', label: 'Enable pressure advance', group: 'Flow', kind: 'bool' },
  { key: 'pressure_advance', label: 'Pressure advance', group: 'Flow', kind: 'number' },

  { key: 'filament_retraction_length', label: 'Retraction length', group: 'Retraction', kind: 'number', unit: 'mm' },
  { key: 'filament_retraction_speed', label: 'Retraction speed', group: 'Retraction', kind: 'number', unit: 'mm/s' },
  { key: 'filament_deretraction_speed', label: 'Deretraction speed', group: 'Retraction', kind: 'number', unit: 'mm/s' },
  { key: 'filament_retraction_minimum_travel', label: 'Min travel', group: 'Retraction', kind: 'number', unit: 'mm' },
  { key: 'filament_z_hop', label: 'Z hop', group: 'Retraction', kind: 'number', unit: 'mm' },
  { key: 'filament_wipe', label: 'Wipe', group: 'Retraction', kind: 'bool' },

  { key: 'fan_min_speed', label: 'Min fan speed', group: 'Cooling', kind: 'number', unit: '%' },
  { key: 'fan_max_speed', label: 'Max fan speed', group: 'Cooling', kind: 'number', unit: '%' },
  { key: 'fan_cooling_layer_time', label: 'Full fan below layer time', group: 'Cooling', kind: 'number', unit: 's' },
  { key: 'overhang_fan_speed', label: 'Overhang fan speed', group: 'Cooling', kind: 'number', unit: '%' },
  { key: 'overhang_fan_threshold', label: 'Overhang threshold', group: 'Cooling', kind: 'text' },
  { key: 'close_fan_the_first_x_layers', label: 'Fan off for first N layers', group: 'Cooling', kind: 'number' },
  { key: 'full_fan_speed_layer', label: 'Full fan at layer', group: 'Cooling', kind: 'number' },
  { key: 'slow_down_layer_time', label: 'Slow down below layer time', group: 'Cooling', kind: 'number', unit: 's' },
  { key: 'slow_down_min_speed', label: 'Slow down min speed', group: 'Cooling', kind: 'number', unit: 'mm/s' },
];

const PRESET_GLOBALS = {
  presetVersion: '2.2.43.2',
  from: 'User',
  isCustomDefined: '0',
  vendorFallback: 'Generic',
};

let baselineCache = null;

function loadBaselines() {
  if (!baselineCache) {
    baselineCache = fs.readJsonSync(BASELINE_FILE);
  }
  return baselineCache;
}

// Resolve a SpoolKeep material string to a key in profile-baselines.json.
function resolveType(rawType) {
  const baselines = loadBaselines().types;
  const raw = String(rawType || FALLBACK_TYPE).trim();
  if (baselines[raw]) return raw;

  const upper = raw.toUpperCase();
  if (TYPE_ALIASES[upper] && baselines[TYPE_ALIASES[upper]]) return TYPE_ALIASES[upper];

  // "PLA Matte", "pla silk" and friends -- match case-insensitively.
  const hit = Object.keys(baselines).find(k => k.toUpperCase() === upper);
  if (hit) return hit;

  // Strip decoration ("PLA+", "TPU 95A") and retry on the leading token.
  const head = upper.replace(/[\s+]/g, '');
  if (TYPE_ALIASES[head] && baselines[TYPE_ALIASES[head]]) return TYPE_ALIASES[head];
  const token = upper.split(/[\s-]/)[0];
  const tokenHit = Object.keys(baselines).find(k => k.toUpperCase() === token);
  if (tokenHit) return tokenHit;

  return FALLBACK_TYPE;
}

// Effective baseline for a type: shipped defaults with the user's Settings
// overrides applied on top.
function baselineFor(type, overrides = {}) {
  const entry = loadBaselines().types[type] || loadBaselines().types[FALLBACK_TYPE];
  const override = overrides[type] || {};
  return {
    inherits: override.inherits || entry.inherits,
    source: entry.source,
    settings: { ...entry.settings, ...(override.settings || {}) },
  };
}

function orcaValue(value) {
  return Array.isArray(value) ? value : [String(value)];
}

/**
 * Build a complete OrcaSlicer filament preset.
 *
 * @param {object} spool        - spool record (or colour-version filament entry)
 * @param {object} opts
 * @param {object} opts.overrides - user baseline overrides, keyed by material type
 * @param {object} opts.globals   - preset-wide defaults (version, from, ...)
 * @param {object} opts.dbSettings - flattened settings from a confirmed SimplyPrint match
 */
function buildFilamentPreset(spool, opts = {}) {
  const overrides = opts.overrides || {};
  const globals = { ...PRESET_GLOBALS, ...(opts.globals || {}) };
  const type = resolveType(spool.type);
  const base = baselineFor(type, overrides);

  const preset = {};
  for (const [key, value] of Object.entries(base.settings)) {
    if (!SPOOL_OWNED.has(key)) preset[key] = orcaValue(value);
  }

  // Layer 2: settings from a confirmed DB match win over the baseline.
  for (const [key, value] of Object.entries(opts.dbSettings || {})) {
    if (SPOOL_OWNED.has(key)) continue;
    if (value === 'nil' || (Array.isArray(value) && value[0] === 'nil')) continue;
    preset[key] = orcaValue(value);
  }

  // Layer 3: the spool record.
  const brand = spool.brand || globals.vendorFallback;
  const displayName = `${brand} ${spool.name}`.trim();
  const minTemp = Number(spool.minTemp) || 190;
  const maxTemp = Number(spool.maxTemp) || 220;
  const avgTemp = Math.round((minTemp + maxTemp) / 2);
  const bedTemp = Number(spool.bedMaxTemp) || 60;
  const colour = spool.colourHex || spool.colorHex || '#FFFFFF';

  Object.assign(preset, {
    name: displayName,
    from: globals.from,
    inherits: base.inherits,
    is_custom_defined: globals.isCustomDefined,
    version: globals.presetVersion,
    filament_settings_id: [displayName],
    filament_vendor: [brand],
    filament_type: [spool.type || type],
    default_filament_colour: [colour],
    nozzle_temperature_range_low: [String(minTemp)],
    nozzle_temperature_range_high: [String(maxTemp)],
    nozzle_temperature: [String(avgTemp)],
    nozzle_temperature_initial_layer: [String(avgTemp)],
    hot_plate_temp: [String(bedTemp)],
    hot_plate_temp_initial_layer: [String(bedTemp)],
    textured_plate_temp: [String(bedTemp)],
    textured_plate_temp_initial_layer: [String(bedTemp)],
  });

  return preset;
}

function presetFileName(spool) {
  const brand = (spool.brand || PRESET_GLOBALS.vendorFallback).toLowerCase();
  const clean = String(spool.name || 'filament').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `${brand.replace(/[^a-z0-9_-]/g, '_')}_${clean}.json`;
}

/**
 * Compare a spool's effective preset against a DB match, field by field.
 * Only compares keys the DB actually carries, and skips spool-owned keys.
 */
function diffAgainstDb(spool, dbSettings, opts = {}) {
  const ours = buildFilamentPreset(spool, { ...opts, dbSettings: undefined });
  const differences = [];
  for (const [key, rawValue] of Object.entries(dbSettings || {})) {
    if (SPOOL_OWNED.has(key)) continue;
    if (rawValue === 'nil' || (Array.isArray(rawValue) && rawValue[0] === 'nil')) continue;
    const theirs = JSON.stringify(orcaValue(rawValue));
    const mine = JSON.stringify(ours[key] ?? null);
    if (theirs !== mine) {
      differences.push({ key, db: orcaValue(rawValue), current: ours[key] ?? null });
    }
  }
  return differences;
}

module.exports = {
  BASELINE_FILE,
  CURATED_FIELDS,
  PRESET_GLOBALS,
  SPOOL_OWNED_KEYS,
  loadBaselines,
  resolveType,
  baselineFor,
  buildFilamentPreset,
  presetFileName,
  diffAgainstDb,
};
