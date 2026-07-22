/* global __APP_VERSION__ */
import { Settings, X, AlertCircle, ChevronRight } from 'lucide-react';

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const TILE = { backgroundColor: 'var(--md-sys-color-surface-container-high)', padding: '0.6rem 0.8rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)' };
const TILE_LABEL = { fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', fontWeight: 'bold', textTransform: 'uppercase' };
const TILE_VALUE = { fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--md-sys-color-on-surface)' };

export default function SettingsModal({
  isOpen,
  onClose,
  geminiApiKey,
  setGeminiApiKey,
  hasGeminiKey,
  isEnvOverridden,
  onSubmit,
  spools = [],
  printFiles = [],
  defaultSpoolSort,
  setDefaultSpoolSort,
  defaultFilesSort,
  setDefaultFilesSort,
  td1sEnabled,
  setTd1sEnabled,
  spoolmanEnabled = true,
  setSpoolmanEnabled,
  dataFolderSize = 0,
  onOpenFilamentDefaults
}) {
  if (!isOpen) return null;

  const totalSpools = spools.length;
  const rfidLinkedCount = spools.filter(s => s.rfidLinked).length;
  const totalFiles = printFiles.length;
  const stlCount = printFiles.filter(f => f.stlFile && !f.threeMfFile).length;
  const threeMfCount = printFiles.filter(f => f.threeMfFile).length;
  const unopenedCount = spools.filter(s => !s.opened).length;
  const avgRemaining = totalSpools > 0
    ? (spools.reduce((acc, curr) => acc + (100 - curr.usedPercentage), 0) / totalSpools).toFixed(1)
    : '0.0';
  const totalVersions = printFiles.reduce((acc, curr) => acc + (curr.colourVersions?.length ?? 0), 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={20} />
            SpoolKeep Settings
          </h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-on-primary-container)', backgroundColor: 'var(--md-sys-color-primary-container)', border: '1px solid var(--md-sys-color-primary)', padding: '0.15rem 0.5rem', borderRadius: 'var(--md-shape-corner-full)', fontWeight: 'bold' }}>v{__APP_VERSION__}</span>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>

          {/* Inventory Statistics */}
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--md-sys-color-on-surface)' }}>
            Inventory Statistics
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <div style={TILE}>
              <div style={TILE_LABEL}>Total Spools</div>
              <div style={TILE_VALUE}>{totalSpools}</div>
            </div>
            <div style={TILE}>
              <div style={TILE_LABEL}>RFID Linked</div>
              <div style={TILE_VALUE}>{rfidLinkedCount}</div>
            </div>
            <div style={TILE}>
              <div style={TILE_LABEL}>Print Files</div>
              <div style={TILE_VALUE}>{totalFiles} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--md-sys-color-outline)' }}>({totalVersions} vers)</span></div>
            </div>
            <div style={TILE}>
              <div style={TILE_LABEL}>Format Ratio (STL / 3MF)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--md-sys-color-on-surface)' }}>{stlCount} : {threeMfCount}</div>
            </div>
            <div style={TILE}>
              <div style={TILE_LABEL}>Unopened Spools</div>
              <div style={TILE_VALUE}>{unopenedCount}</div>
            </div>
            <div style={TILE}>
              <div style={TILE_LABEL}>Avg. Remaining</div>
              <div style={TILE_VALUE}>{avgRemaining}%</div>
            </div>
            <div style={{ ...TILE, gridColumn: '1 / -1' }}>
              <div style={TILE_LABEL}>Data Folder Size</div>
              <div style={TILE_VALUE}>{fmtBytes(dataFolderSize)}</div>
            </div>
          </div>

          {/* Default Sort Preferences */}
          <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Default Sort Order</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label className="form-label">Spools Page</label>
                <select className="form-input" value={defaultSpoolSort} onChange={e => setDefaultSpoolSort(e.target.value)}>
                  <option value="colour">Sort by Colour</option>
                  <option value="name">Sort by Name</option>
                  <option value="brand">Sort by Brand</option>
                  <option value="type">Sort by Type</option>
                  <option value="usedPercentage">Sort by Usage %</option>
                  <option value="dateAddedNewest">Date Added (Newest)</option>
                  <option value="dateAddedOldest">Date Added (Oldest)</option>
                  <option value="ageNewest">Age of Spool (Newest first)</option>
                  <option value="ageOldest">Age of Spool (Oldest first)</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label className="form-label">Print Files Page</label>
                <select className="form-input" value={defaultFilesSort} onChange={e => setDefaultFilesSort(e.target.value)}>
                  <option value="dateAddedNewest">Date Added (Newest)</option>
                  <option value="dateAddedOldest">Date Added (Oldest)</option>
                  <option value="lastPrintedNewest">Last Printed (Newest)</option>
                  <option value="lastPrintedOldest">Last Printed (Oldest)</option>
                  <option value="lastCvNewest">Colour Version (Newest)</option>
                  <option value="lastCvOldest">Colour Version (Oldest)</option>
                  <option value="format3mf">Format (3MF first)</option>
                  <option value="formatStl">Format (STL first)</option>
                  <option value="printedFirst">Printed first</option>
                  <option value="unprintedFirst">Unprinted first</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Hardware Integrations */}
          <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Hardware Integrations</h3>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>TD1s Spectrometer</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.15rem' }}>Show the TD1s colorimeter badge on the Add / Edit Spool form</div>
              </div>
              <input
                type="checkbox"
                checked={td1sEnabled || false}
                onChange={(e) => setTd1sEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--md-sys-color-primary)', flexShrink: 0, marginLeft: '1rem' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.5rem 0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)', marginTop: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Spoolman API (Printer Integration)</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.15rem' }}>Expose a Spoolman-compatible API so printers (e.g. Snapmaker U1 SpoolLink) can resolve spools and report filament usage</div>
              </div>
              <input
                type="checkbox"
                checked={spoolmanEnabled !== false}
                onChange={(e) => setSpoolmanEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--md-sys-color-primary)', flexShrink: 0, marginLeft: '1rem' }}
              />
            </label>
          </div>

          {/* Filament profile defaults live on their own page -- the baseline
              tables and the profile database are far too large for this modal. */}
          <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Filament Profiles</h3>
            <button
              type="button"
              onClick={onOpenFilamentDefaults}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--md-shape-corner-medium)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'inherit',
                font: 'inherit'
              }}
            >
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Profile Defaults &amp; Database</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.15rem' }}>
                  Per-material baselines for exported OrcaSlicer presets, and the SimplyPrint profile database
                </div>
              </div>
              <ChevronRight size={18} style={{ flexShrink: 0, color: 'var(--md-sys-color-outline)' }} />
            </button>
          </div>

          {/* Google Gemini API Key */}
          <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'relative' }}>
                Google Gemini API Key
                <span className="tooltip-container">
                  <AlertCircle size={14} style={{ color: 'var(--md-sys-color-primary)', cursor: 'pointer' }} />
                  <span className="tooltip-text">
                    Used for Photo OCR label scanning.<br />
                    1. Go to <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-sys-color-primary-container)', textDecoration: 'underline', fontWeight: 'bold' }}>Google AI Studio</a>.<br />
                    2. Sign in and click "Create API Key".<br />
                    3. Copy and paste the key here.
                  </span>
                </span>
              </label>
              <input
                type="password"
                className="form-input"
                placeholder={
                  isEnvOverridden
                    ? "Configured via Server Environment"
                    : (hasGeminiKey ? "Key is set (masked)" : "Enter Gemini API Key...")
                }
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                style={{ fontFamily: 'monospace' }}
                disabled={isEnvOverridden}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.25rem' }}>
                {isEnvOverridden
                  ? "This key is configured via the server's GEMINI_API_KEY environment variable and cannot be edited from the UI."
                  : (hasGeminiKey
                    ? "A key is currently active. To clear it, submit an empty key. To replace it, paste a new one."
                    : "No key is currently configured. OCR scanning will be disabled.")
                }
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {isEnvOverridden ? 'Close' : 'Cancel'}
            </button>
            {!isEnvOverridden && (
              <button type="submit" className="btn btn-primary">
                Save Settings
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
