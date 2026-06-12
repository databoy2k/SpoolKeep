import { X, Nfc, Check, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export default function RfidWriterModal({
  isOpen,
  onClose,
  activeNfcSpool,
  nfcStatus,
  nfcErrorMsg,
  setNfcStatus,
  handleWriteNfc,
  generateOpenSpoolPayload
}) {
  if (!isOpen || !activeNfcSpool) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>OpenSpool RFID Writer</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="nfc-scanning-view">
          <div className="nfc-icon-wrapper">
            <Nfc size={38} />
            {nfcStatus === 'scanning' && <div className="nfc-pulse" />}
            {nfcStatus === 'writing' && <div className="nfc-pulse" style={{ animationDuration: '0.8s' }} />}
          </div>

          {nfcStatus === 'idle' && (
            <div>
              <h3>Write RFID Tag</h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Requires a Web NFC compatible mobile browser (Chrome on Android). Put your NFC tag near the back of your device.
              </p>
              <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={handleWriteNfc}>
                Start NFC Write
              </button>
            </div>
          )}

          {nfcStatus === 'scanning' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-primary)' }}>Hold Tag to Device</h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Detecting NTAG215 or NTAG216 tags...
              </p>
            </div>
          )}

          {nfcStatus === 'writing' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-primary)' }}>Writing OpenSpool...</h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Writing NDEF payload...
              </p>
            </div>
          )}

          {nfcStatus === 'success' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Check size={20} /> NFC Tag Formatted!
              </h3>
              <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Tag was written and linked to spool `{activeNfcSpool.id}`.
              </p>
              <button className="btn btn-secondary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {nfcStatus === 'error' && (
            <div>
              <h3 style={{ color: 'var(--md-sys-color-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                Write Failed
              </h3>
              <p style={{ color: 'var(--md-sys-color-error)', marginTop: '0.5rem', fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'var(--md-sys-color-error-container)', borderRadius: '6px' }}>
                {nfcErrorMsg}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setNfcStatus('idle')}>
                  Retry
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Offline JSON Payload Copy Fallback */}
        <div className="nfc-fallback-section">
          <span style={{ fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--md-sys-color-on-background)' }}>
            <BookOpen size={14} />
            OpenSpool Payload (MIME: application/json)
          </span>
          <p style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.25rem' }}>
            You can write this payload using external apps like <em>NFC Tools</em>:
          </p>
          <pre className="code-block">
            {JSON.stringify(generateOpenSpoolPayload(activeNfcSpool), null, 2)}
          </pre>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(generateOpenSpoolPayload(activeNfcSpool), null, 2));
              toast.success('Copied to clipboard!');
            }}
          >
            Copy JSON Payload
          </button>
        </div>
      </div>
    </div>
  );
}
