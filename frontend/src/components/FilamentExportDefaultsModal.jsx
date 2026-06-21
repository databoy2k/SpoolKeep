import { useState } from 'react';
import { X, RotateCcw, Layers, ChevronDown, ChevronRight } from 'lucide-react';

export const FILAMENT_EXPORT_DEFAULTS = {
  PLA:  { fan_min_speed: '35', fan_max_speed: '100', fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  PETG: { fan_min_speed: '20', fan_max_speed: '80',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  ABS:  { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  ASA:  { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  TPU:  { fan_min_speed: '30', fan_max_speed: '80',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  PA:   { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
  PC:   { fan_min_speed: '0',  fan_max_speed: '20',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
};

const COLUMNS = [
  { key: 'fan_min_speed',          label: 'Fan Min',      unit: '%',    min: 0, max: 100 },
  { key: 'fan_max_speed',          label: 'Fan Max',      unit: '%',    min: 0, max: 100 },
  { key: 'fan_cooling_layer_time', label: 'Fan On After', unit: 's',    min: 0, max: 300 },
  { key: 'slow_down_layer_time',   label: 'Slow Down At', unit: 's',    min: 0, max: 300 },
  { key: 'slow_down_min_speed',    label: 'Min Speed',    unit: 'mm/s', min: 0, max: 200 },
];

// Match a spool's type string to one of the FILAMENT_EXPORT_DEFAULTS keys,
// using the same logic as exportOrcaSlicerPresets in App.jsx.
function spoolMatKey(type) {
  const t = (type || '').toUpperCase().replace(/\+/g, '');
  return Object.keys(FILAMENT_EXPORT_DEFAULTS).find(k =>
    k === 'PA' ? (t.includes('PA') || t.includes('NYLON')) : t.includes(k)
  );
}

const TH = {
  padding: '0.5rem 0.6rem',
  textAlign: 'center',
  fontWeight: '600',
  color: 'var(--md-sys-color-outline)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--md-sys-color-outline-variant)',
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '0.35rem 0.5rem',
  textAlign: 'center',
  verticalAlign: 'middle',
};

function MaterialRow({ mat, values, stripe, onChange }) {
  return (
    <tr style={{ backgroundColor: stripe ? 'var(--md-sys-color-surface-container)' : 'transparent' }}>
      <td style={{ ...TD, textAlign: 'left', paddingLeft: '0.75rem', fontWeight: '600', color: 'var(--md-sys-color-on-surface)' }}>
        {mat}
      </td>
      {COLUMNS.map(col => (
        <td key={col.key} style={TD}>
          <input
            type="number"
            min={col.min}
            max={col.max}
            value={values?.[col.key] ?? ''}
            onChange={e => onChange(mat, col.key, e.target.value)}
            style={{
              width: '60px',
              padding: '0.25rem 0.35rem',
              borderRadius: 'var(--md-shape-corner-small)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              backgroundColor: 'var(--md-sys-color-surface)',
              color: 'var(--md-sys-color-on-surface)',
              fontSize: '0.82rem',
              textAlign: 'right',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function FilamentExportDefaultsModal({ isOpen, onClose, defaults, onSave, spools = [] }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(defaults)));
  const [othersExpanded, setOthersExpanded] = useState(false);

  if (!isOpen) return null;

  const update = (material, key, value) =>
    setLocal(prev => ({ ...prev, [material]: { ...prev[material], [key]: value } }));

  const reset = () => setLocal(JSON.parse(JSON.stringify(FILAMENT_EXPORT_DEFAULTS)));

  // Which material keys are represented by at least one spool in the DB
  const presentKeys = new Set(spools.map(s => spoolMatKey(s.type)).filter(Boolean));

  const allKeys = Object.keys(FILAMENT_EXPORT_DEFAULTS);
  const activeKeys = allKeys.filter(k => presentKeys.has(k));
  const otherKeys  = allKeys.filter(k => !presentKeys.has(k));

  let stripeIndex = 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={20} />
            Filament Export Details
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', margin: '1rem 0 1.25rem', lineHeight: '1.5' }}>
          These cooling and speed settings are baked into every OrcaSlicer filament profile SpoolKeep exports.
          They override the slicer&apos;s built-in material defaults, which can otherwise cause print failures —
          for example, PETG delaminating from too much fan cooling.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'left', paddingLeft: '0.75rem' }}>Material</th>
                {COLUMNS.map(col => (
                  <th key={col.key} style={TH}>
                    <div>{col.label}</div>
                    <div style={{ fontWeight: 'normal', color: 'var(--md-sys-color-outline)', fontSize: '0.68rem', marginTop: '0.1rem' }}>
                      {col.unit}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Materials present in the spool database — always visible */}
              {activeKeys.map(mat => (
                <MaterialRow
                  key={mat}
                  mat={mat}
                  values={local[mat]}
                  stripe={stripeIndex++ % 2 === 0}
                  onChange={update}
                />
              ))}

              {/* Expand/collapse toggle row for absent materials */}
              {otherKeys.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 1}
                      onClick={() => setOthersExpanded(e => !e)}
                      style={{
                        padding: '0.45rem 0.75rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: 'var(--md-sys-color-outline)',
                        borderTop: activeKeys.length > 0 ? '1px solid var(--md-sys-color-outline-variant)' : undefined,
                        backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        {othersExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {othersExpanded ? 'Hide' : 'Show'} other materials ({otherKeys.join(', ')})
                      </span>
                    </td>
                  </tr>

                  {othersExpanded && otherKeys.map(mat => (
                    <MaterialRow
                      key={mat}
                      mat={mat}
                      values={local[mat]}
                      stripe={stripeIndex++ % 2 === 0}
                      onChange={update}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--md-sys-color-outline-variant)',
          paddingTop: '1.25rem',
          marginTop: '1.5rem',
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            onClick={reset}
          >
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => onSave(local)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
