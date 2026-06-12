import { X, Nfc, Check, AlertCircle } from 'lucide-react';

export default function RfidReaderModal({
  isOpen,
  onClose,
  rfidReadStatus,
  rfidReadError,
  rfidReadPayload,
  scannedSpool,
  activeNfcSpool,
  isAddEditModalOpen,
  startRfidReading,
  setRfidReadStatus,
  handleApplyRfidToForm,
  handleWriteRfidTagFromReader
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Nfc size={20} />
            OpenSpool RFID Tag Reader
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="nfc-scanning-view">
          <div className="nfc-icon-wrapper">
            <Nfc size={38} />
            {rfidReadStatus === 'scanning' && <div className="nfc-pulse" />}
          </div>

          {rfidReadStatus === 'idle' && (
            <div>
              <h3>Ready to Scan Tag</h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Put your OpenSpool RFID tag near the back of your NFC-enabled device to read it.
              </p>
              {('NDEFReader' in window) && (
                <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={startRfidReading}>
                  Start Scanning
                </button>
              )}
            </div>
          )}

          {rfidReadStatus === 'scanning' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-primary)' }}>Hold Tag to Device</h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Scanning for OpenSpool NDEF records...
              </p>
            </div>
          )}

          {rfidReadStatus === 'success' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Check size={20} /> Tag Read Successfully!
              </h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Spool found: <strong>{scannedSpool?.brand} {scannedSpool?.name}</strong>. Opening...
              </p>
            </div>
          )}

          {rfidReadStatus === 'notFound' && rfidReadPayload && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--md-sys-color-tertiary)', marginBottom: '1rem', justifyContent: 'center' }}>
                <AlertCircle size={20} />
                <h3 style={{ margin: 0 }}>Spool Not in Database</h3>
              </div>

              <div style={{ backgroundColor: 'var(--md-sys-color-surface-container)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--md-sys-color-outline-variant)', marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--md-sys-color-outline)', textTransform: 'uppercase' }}>OpenSpool Tag Details:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Brand</span>
                    <strong>{rfidReadPayload.brand || 'Generic'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Material Type</span>
                    <strong>{rfidReadPayload.type || 'PLA'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Spool ID</span>
                    <strong style={{ fontFamily: 'monospace' }}>{rfidReadPayload.id || 'None (New Tag)'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Colour Hex</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: `#${rfidReadPayload.colour_hex || rfidReadPayload.color_hex}` }}></span>
                      <strong>#{rfidReadPayload.colour_hex || rfidReadPayload.color_hex || '7F8C8D'}</strong>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Nozzle Temp Range</span>
                    <strong>{rfidReadPayload.min_temp || '200'}° - {rfidReadPayload.max_temp || '220'}°C</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Bed Temp Range</span>
                    <strong>{rfidReadPayload.bed_min_temp || '50'}° - {rfidReadPayload.bed_max_temp || '60'}°C</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRfidReadStatus('idle')}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleApplyRfidToForm}>
                  {isAddEditModalOpen ? 'Apply to Form' : 'Review & Add'}
                </button>
              </div>
            </div>
          )}

          {rfidReadStatus === 'needsWrite' && activeNfcSpool && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--md-sys-color-primary)', marginBottom: '1rem', justifyContent: 'center' }}>
                <Nfc size={22} className="logo-icon" style={{ color: 'var(--md-sys-color-primary)' }} />
                <h3 style={{ margin: 0 }}>Write Spool to Tag</h3>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-outline)', marginBottom: '1rem', textAlign: 'center' }}>
                Spool added successfully! To link the physical tag, write the new generated ID (<strong>{activeNfcSpool.id}</strong>) to the tag now.
              </p>

              <div style={{ backgroundColor: 'var(--md-sys-color-surface-container)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--md-sys-color-outline-variant)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>New Spool ID</span>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--md-sys-color-primary)' }}>{activeNfcSpool.id}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Brand & Material</span>
                    <strong>{activeNfcSpool.brand} {activeNfcSpool.type}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                  Close / Skip Write
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleWriteRfidTagFromReader}>
                  Write Spool ID to Tag
                </button>
              </div>
            </div>
          )}

          {rfidReadStatus === 'error' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-error)' }}>Read Failed</h3>
              <p style={{ color: 'var(--md-sys-color-error)', marginTop: '0.5rem', fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'var(--md-sys-color-error-container)', borderRadius: '6px' }}>
                {rfidReadError}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRfidReadStatus('idle')}>
                  Retry
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
