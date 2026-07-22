import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, RotateCcw, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

const CARD = {
  backgroundColor: 'var(--md-sys-color-surface-container-high)',
  border: '1px solid var(--md-sys-color-outline-variant)',
  borderRadius: 'var(--md-shape-corner-medium)',
  padding: '0.75rem'
};
const HINT = { fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' };
const SECTION = { borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' };

// Baseline values are stored in OrcaSlicer's shape -- a single-element array of
// strings. The curated form fields edit the scalar inside.
const toScalar = (value) => (Array.isArray(value) ? value[0] : value);
const toOrca = (value, original) => (Array.isArray(original) ? [String(value)] : String(value));

// OrcaSlicer writes "nil" for settings that fall through to the printer profile.
// Show those as an empty field labelled "inherit", and turn an emptied field
// back into "nil" rather than an empty string.
const isNil = (value) => value === 'nil' || value === '' || value === undefined || value === null;

export default function FilamentDefaultsSection({
  baselines = {},
  typesInUse = [],
  overrides = {},
  setOverrides,
  globals = {},
  setGlobals,
  curatedFields = [],
  profileDbEnabled = false,
  setProfileDbEnabled,
  profileDbStatus,
  onRefreshProfileDb,
  onLoadProfileDbStatus
}) {
  // Only materials the inventory actually uses. No point offering an ABS
  // baseline to someone who owns no ABS.
  const types = useMemo(
    () => typesInUse.filter(t => baselines[t]).sort(),
    [baselines, typesInUse]
  );
  const [activeType, setActiveType] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState('');
  const [rawError, setRawError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Also re-picks when the current selection drops out of the list, e.g. after
  // the last spool of that material is deleted.
  useEffect(() => {
    if (!types.length) return;
    if (!types.includes(activeType)) setActiveType(types.includes('PLA') ? 'PLA' : types[0]);
  }, [types, activeType]);

  useEffect(() => {
    if (onLoadProfileDbStatus) onLoadProfileDbStatus();
  }, [onLoadProfileDbStatus]);

  // Shipped baseline with the user's overrides applied -- what an export uses.
  const effective = useMemo(() => {
    const base = baselines[activeType];
    if (!base) return {};
    return { ...base.settings, ...(overrides[activeType]?.settings || {}) };
  }, [baselines, overrides, activeType]);

  useEffect(() => {
    setRawDraft(JSON.stringify(effective, null, 2));
    setRawError('');
  }, [effective, activeType]);

  const setField = (key, input) => {
    const original = baselines[activeType]?.settings?.[key];
    const rawValue = input === '' ? 'nil' : input;
    setOverrides({
      ...overrides,
      [activeType]: {
        ...(overrides[activeType] || {}),
        settings: { ...(overrides[activeType]?.settings || {}), [key]: toOrca(rawValue, original) }
      }
    });
  };

  const resetType = () => {
    const next = { ...overrides };
    delete next[activeType];
    setOverrides(next);
  };

  const applyRaw = () => {
    let parsed;
    try {
      parsed = JSON.parse(rawDraft);
    } catch (err) {
      setRawError(err.message);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setRawError('Expected a JSON object of setting keys.');
      return;
    }
    // Store only what actually differs from the shipped baseline.
    const shipped = baselines[activeType]?.settings || {};
    const diff = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (JSON.stringify(shipped[key]) !== JSON.stringify(value)) diff[key] = value;
    }
    setOverrides({ ...overrides, [activeType]: { ...(overrides[activeType] || {}), settings: diff } });
    setRawError('');
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshProfileDb();
    } finally {
      setRefreshing(false);
    }
  };

  const base = baselines[activeType];
  const overriddenKeys = Object.keys(overrides[activeType]?.settings || {});
  const groups = useMemo(() => {
    const out = new Map();
    for (const field of curatedFields) {
      if (!(field.key in effective)) continue;
      if (!out.has(field.group)) out.set(field.group, []);
      out.get(field.group).push(field);
    }
    return [...out.entries()];
  }, [curatedFields, effective]);

  return (
    <>
      <div style={SECTION}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.25rem' }}>Filament Profile Defaults</h3>
        <p style={{ ...HINT, marginBottom: '0.75rem' }}>
          Baseline settings written into every exported OrcaSlicer preset. Extruder and bed
          temperatures are not listed here — those always come from the spool.
          Only materials in your inventory are listed.
        </p>

        {!types.length && (
          <div style={{ ...CARD, ...HINT }}>
            No materials to configure yet — add a spool and its material will appear here.
          </div>
        )}

        {types.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">Material</label>
            <select className="form-input" value={activeType} onChange={(e) => setActiveType(e.target.value)}>
              {types.map(t => (
                <option key={t} value={t}>
                  {t}{overrides[t]?.settings && Object.keys(overrides[t].settings).length ? ' •' : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetType}
            disabled={!overriddenKeys.length}
            title="Discard your changes for this material"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        )}

        {base && (
          <div style={{ ...HINT, marginBottom: '0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span>
              Inherits <strong>{overrides[activeType]?.inherits || base.inherits}</strong> · {Object.keys(effective).length} settings
              {overriddenKeys.length > 0 && <> · <strong>{overriddenKeys.length} changed</strong></>}
            </span>
            <span className="tooltip-container" style={{ display: 'inline-flex' }}>
              <AlertCircle size={13} style={{ color: 'var(--md-sys-color-primary)', cursor: 'pointer' }} />
              <span className="tooltip-text">
                {base.source === 'orca-bundle'
                  ? `Derived from ${base.sampleCount} OrcaSlicer presets that agreed on every value.`
                  : 'Derived from the SimplyPrint profile database Generic profile for this material.'}
              </span>
            </span>
          </div>
        )}

        {groups.map(([group, fields]) => (
          <div key={group} style={{ marginBottom: '0.75rem' }}>
            <div style={{ ...HINT, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{group}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
              {fields.map(field => {
                const value = toScalar(effective[field.key]);
                const changed = overriddenKeys.includes(field.key);
                return (
                  <div key={field.key}>
                    <label
                      className="form-label"
                      style={{ fontSize: '0.75rem', color: changed ? 'var(--md-sys-color-primary)' : undefined }}
                      title={field.key}
                    >
                      {field.label}{field.unit ? ` (${field.unit})` : ''}
                    </label>
                    {field.kind === 'bool' ? (
                      <select
                        className="form-input"
                        value={String(value) === '1' ? '1' : '0'}
                        onChange={(e) => setField(field.key, e.target.value)}
                      >
                        <option value="0">No</option>
                        <option value="1">Yes</option>
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        type={field.kind === 'number' ? 'number' : 'text'}
                        step="any"
                        placeholder={isNil(value) ? 'inherit' : undefined}
                        value={isNil(value) ? '' : value}
                        onChange={(e) => setField(field.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {base && (
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--md-sys-color-primary)', fontSize: '0.8rem', fontWeight: '600' }}
        >
          {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          All {Object.keys(effective).length} settings (raw JSON)
        </button>
        )}

        {base && showRaw && (
          <div style={{ marginTop: '0.5rem' }}>
            <textarea
              className="form-input"
              spellCheck={false}
              value={rawDraft}
              onChange={(e) => setRawDraft(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.7rem', minHeight: '220px', width: '100%', resize: 'vertical' }}
            />
            {rawError && (
              <div style={{ ...HINT, color: 'var(--md-sys-color-error)', marginTop: '0.25rem' }}>{rawError}</div>
            )}
            <button type="button" className="btn btn-secondary" onClick={applyRaw} style={{ marginTop: '0.4rem' }}>
              Apply JSON
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', marginTop: '1rem' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Preset version</label>
            <input
              className="form-input"
              value={globals.presetVersion || ''}
              onChange={(e) => setGlobals({ ...globals, presetVersion: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Vendor fallback</label>
            <input
              className="form-input"
              value={globals.vendorFallback || ''}
              onChange={(e) => setGlobals({ ...globals, vendorFallback: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div style={SECTION}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Profile Database</h3>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
          <div>
            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>SimplyPrint Profile Database</div>
            <div style={{ ...HINT, marginTop: '0.15rem' }}>
              Cross-reference spools against{' '}
              <a href="https://github.com/SimplyPrint/slicer-profiles-db" target="_blank" rel="noopener noreferrer"
                 style={{ color: 'var(--md-sys-color-primary)', textDecoration: 'underline' }}>
                SimplyPrint/slicer-profiles-db
              </a>{' '}
              and show a sync badge on the spool form. Off means no outbound requests.
            </div>
          </div>
          <input
            type="checkbox"
            checked={profileDbEnabled}
            onChange={(e) => setProfileDbEnabled(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: 'var(--md-sys-color-primary)', flexShrink: 0, marginLeft: '1rem' }}
          />
        </label>

        {/* Always available -- syncing the index is independent of the toggle, so
            you can download it without a save-and-reopen round trip. */}
        <div style={{ ...CARD, marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={HINT}>
            {profileDbStatus?.entryCount
              ? <>{profileDbStatus.entryCount} filaments from {profileDbStatus.fileCount} presets<br />
                  Synced {new Date(profileDbStatus.fetchedAt).toLocaleString()}</>
              : 'Not indexed yet — sync to download the filament index.'}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}
          >
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            {refreshing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>
    </>
  );
}
