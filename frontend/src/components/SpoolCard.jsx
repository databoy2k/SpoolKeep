import { useState } from 'react';
import { Edit2, Trash2, Nfc, ChevronDown, ChevronUp } from 'lucide-react';

export default function SpoolCard({
  spool,
  isSelected,
  isNfcSupported,
  highlightedSpoolId,
  onToggleSelect,
  onEdit,
  onDelete,
  onUpdateStock,
  onOpenNfcWriter
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const remainingPercentage = 100 - spool.usedPercentage;
  const spoolColor = spool.colourHex || spool.colorHex || '#337150';

  return (
    <div
      className={`spool-card ${spool.id === highlightedSpoolId ? 'highlighted' : ''}`}
      style={{
        borderTop: `4px solid ${spoolColor}`
      }}
    >
      <div className="spool-header">
        <div className="spool-select-wrap">
          <input
            type="checkbox"
            className="spool-checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
          />
          <div className="colour-badge" style={{ backgroundColor: spoolColor }} />
          {spool.opened ? (
            <span className="opened-badge" title={spool.dateOpened ? `Opened on ${spool.dateOpened}` : 'Opened (undated)'}>
              OPENED{spool.dateOpened ? `: ${spool.dateOpened}` : ''}
            </span>
          ) : (
            <span className="unopened-badge" title="Unopened spool">UNOPENED</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {isExpanded && (
            <div className="card-actions" style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                className="btn btn-secondary btn-icon-only"
                onClick={onEdit}
                title="Edit spool"
                style={{ width: '36px', height: '36px' }}
              >
                <Edit2 size={14} />
              </button>
              <button
                className="btn btn-danger btn-icon-only"
                onClick={onDelete}
                title="Delete spool"
                style={{ width: '36px', height: '36px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-icon-only"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse card" : "Expand card"}
            style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      <div className="spool-title-block">
        <span className="spool-brand">{spool.brand}</span>
        <h3 className="spool-name" title={spool.name}>{spool.name}</h3>
      </div>

      {spool.notes && (
        <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: isExpanded ? '1.25rem' : '0', fontStyle: 'italic' }}>
          {spool.notes.length > 55 && !isExpanded ? `${spool.notes.substring(0, 55)}...` : spool.notes}
        </p>
      )}

      {isExpanded && (
        <>
          {/* M3 Linear Progress usage bar instead of circular gauge */}
          <div className="usage-block">
            <div className="usage-text-row">
              <span className="usage-lbl">Remaining</span>
              <span className="usage-val">{remainingPercentage}%</span>
            </div>
            <div className="usage-bar-track">
              <div
                className="usage-bar-fill"
                style={{
                  width: `${remainingPercentage}%`,
                  backgroundColor: spoolColor
                }}
              />
            </div>
          </div>

          <div className="specs-block">
            <div className="spec-item">
              <span className="spec-lbl">Filament Type</span>
              <span className="spec-val">{spool.type}</span>
            </div>
            <div className="spec-item">
              <span className="spec-lbl">TD Value</span>
              <span className="spec-val">{spool.td !== undefined && spool.td !== null ? `${spool.td} mm` : 'N/A'}</span>
            </div>
            <div className="spec-item">
              <span className="spec-lbl">Extruder Temp</span>
              <span className="spec-val">{spool.minTemp}°-{spool.maxTemp}°C</span>
            </div>
            <div className="spec-item">
              <span className="spec-lbl">Bed Temp</span>
              <span className="spec-val">{spool.bedMinTemp}°-{spool.bedMaxTemp}°C</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', fontWeight: '500' }}>Stock Quantity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn-icon-only"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  background: 'var(--md-sys-color-surface-container-high)',
                  color: 'var(--md-sys-color-on-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  transition: 'var(--transition-m3)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStock(Math.max(0, (spool.stock !== undefined ? spool.stock : 1) - 1));
                }}
              >
                -
              </button>
              <strong style={{ fontSize: '0.9rem', minWidth: '1.2rem', textAlign: 'center' }}>
                {spool.stock !== undefined ? spool.stock : 1}
              </strong>
              <button
                type="button"
                className="btn-icon-only"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  background: 'var(--md-sys-color-surface-container-high)',
                  color: 'var(--md-sys-color-on-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  transition: 'var(--transition-m3)'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStock((spool.stock !== undefined ? spool.stock : 1) + 1);
                }}
              >
                +
              </button>
            </div>
          </div>

          <div className="meta-block" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span className="spool-tag-id">ID: {spool.id}</span>
            <button
              className={`rfid-status ${spool.rfidLinked ? 'linked' : 'unlinked'}`}
              type="button"
              onClick={onOpenNfcWriter}
              disabled={!isNfcSupported}
              style={{
                opacity: isNfcSupported ? 1 : 0.5,
                cursor: isNfcSupported ? 'pointer' : 'not-allowed'
              }}
              title={isNfcSupported ? (spool.rfidLinked ? "RFID tag is linked" : "Write OpenSpool RFID Tag") : "Web NFC is not supported on this device/browser"}
            >
              <Nfc size={14} />
              {spool.rfidLinked ? 'RFID Active' : 'Write RFID'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
