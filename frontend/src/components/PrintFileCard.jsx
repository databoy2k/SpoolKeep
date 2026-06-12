import { useState } from 'react';
import { Edit2, Trash2, Eye, FileCode, Download, RotateCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Printer } from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-CA');
}

export default function PrintFileCard({
  file,
  onDelete,
  onEdit,
  onView3D,
  onViewDetails,
  onRecommendColors,
  onMarkPrinted,
  recommendingColorsMap
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [thumbIdx, setThumbIdx] = useState(0);
  const [editingLastPrinted, setEditingLastPrinted] = useState(false);

  const hasStl = !!file.stlFile;
  const has3mf = !!file.threeMfFile;
  const lastCv = file.colourVersions?.at(-1);
  const filaments = lastCv?.filaments || [];

  return (
    <div className="spool-card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {hasStl && (
            <span style={{
              padding: '0.2rem 0.5rem', borderRadius: 'var(--md-shape-corner-small)',
              fontSize: '0.7rem', fontWeight: 'bold',
              backgroundColor: 'rgba(57,101,107,0.15)', color: 'var(--md-sys-color-on-tertiary-container)',
              border: '1px solid var(--md-sys-color-tertiary)'
            }}>STL</span>
          )}
          {has3mf && (
            <span style={{
              padding: '0.2rem 0.5rem', borderRadius: 'var(--md-shape-corner-small)',
              fontSize: '0.7rem', fontWeight: 'bold',
              backgroundColor: 'rgba(51,113,80,0.15)', color: 'var(--md-sys-color-on-primary-container)',
              border: '1px solid var(--md-sys-color-primary)'
            }}>3MF</span>
          )}

          {/* Filament swatches */}
          {!isExpanded && filaments.length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              {filaments.map(fil => (
                <div
                  key={fil.slot}
                  style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    backgroundColor: fil.colorHex,
                    border: fil.isGeneric
                      ? 'dashed 1px var(--md-sys-color-outline)'
                      : 'solid 1px var(--md-sys-color-outline-variant)'
                  }}
                  title={`${fil.role ? `[${fil.role}] ` : ''}${fil.brand} ${fil.name} (${fil.type})`}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {isExpanded && (
            <>
              <button
                className="btn btn-secondary btn-icon-only"
                onClick={onEdit}
                title="Edit model"
                style={{ width: '36px', height: '36px' }}
              >
                <Edit2 size={14} />
              </button>
              <button
                className="btn btn-danger btn-icon-only"
                onClick={onDelete}
                title="Delete model"
                style={{ width: '36px', height: '36px' }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          {onMarkPrinted && (
            <button
              className="btn btn-secondary btn-icon-only"
              onClick={() => onMarkPrinted()}
              title={file.lastPrinted ? `Printed ${fmtDate(file.lastPrinted)} — click to mark again` : 'Mark as printed now'}
              style={{ width: '36px', height: '36px' }}
            >
              <Printer size={14} style={{ color: file.lastPrinted ? 'var(--md-sys-color-primary)' : 'currentColor' }} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-icon-only"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
            style={{ width: '36px', height: '36px' }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Model name */}
      <h3 className="spool-name" title={file.name} style={{ margin: '0 0 0.25rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {file.name}
      </h3>
      <div style={{ margin: '0 0 0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: '1.2rem' }}>
        {!file.lastPrinted ? (
          <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline-variant)', fontStyle: 'italic' }}>Not yet printed</span>
        ) : editingLastPrinted ? (
            <input
              type="date"
              defaultValue={file.lastPrinted.slice(0, 10)}
              autoFocus
              onBlur={() => setEditingLastPrinted(false)}
              onChange={(e) => {
                const val = e.target.value;
                if (val) onMarkPrinted(new Date(val + 'T12:00:00').toISOString());
                setEditingLastPrinted(false);
              }}
              style={{
                fontSize: '0.7rem', padding: '0.1rem 0.3rem',
                borderRadius: 'var(--md-shape-corner-extra-small)',
                border: '1px solid var(--md-sys-color-primary)',
                background: 'var(--md-sys-color-surface-container)',
                color: 'var(--md-sys-color-on-surface)',
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditingLastPrinted(true)}
                style={{
                  fontSize: '0.7rem', color: 'var(--md-sys-color-outline)',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                }}
                title="Edit last printed date"
              >
                <Printer size={10} /> Last printed: {fmtDate(file.lastPrinted)}
              </button>
              <button
                type="button"
                onClick={() => onMarkPrinted(null)}
                style={{
                  fontSize: '0.65rem', color: 'var(--md-sys-color-outline)',
                  background: 'none', border: 'none', padding: '0 0.1rem', cursor: 'pointer',
                  lineHeight: 1,
                }}
                title="Clear last printed date"
              >
                ✕
              </button>
            </>
          )}
        </div>

      {/* Thumbnail */}
      <div style={{
        height: '180px',
        backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
        border: '1px solid var(--md-sys-color-outline-variant)',
        borderRadius: 'var(--md-shape-corner-medium)',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        marginBottom: isExpanded ? '1rem' : '0'
      }}>
        {file.thumbnails?.length > 0 ? (
          <>
            <img
              src={`/api/print-files/thumbnail/${file.id}/plate/${thumbIdx}`}
              alt={`${file.name} - plate ${thumbIdx + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--md-shape-corner-medium)' }}
            />
            {file.thumbnails.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setThumbIdx(i => Math.max(0, i - 1)); }}
                  style={{
                    position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', borderRadius: '50%', width: '28px', height: '28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    opacity: thumbIdx === 0 ? 0.25 : 1, transition: 'opacity 0.15s',
                  }}
                  disabled={thumbIdx === 0}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setThumbIdx(i => Math.min(file.thumbnails.length - 1, i + 1)); }}
                  style={{
                    position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', borderRadius: '50%', width: '28px', height: '28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    opacity: thumbIdx === file.thumbnails.length - 1 ? 0.25 : 1, transition: 'opacity 0.15s',
                  }}
                  disabled={thumbIdx === file.thumbnails.length - 1}
                >
                  <ChevronRight size={16} />
                </button>
                <div style={{
                  position: 'absolute', top: '0.4rem', left: '50%', transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 'var(--md-shape-corner-full)',
                  padding: '0.1rem 0.45rem', fontSize: '0.65rem', color: '#fff', fontWeight: '600',
                  pointerEvents: 'none',
                }}>
                  {thumbIdx + 1}/{file.thumbnails.length}
                </div>
              </>
            )}
          </>
        ) : file.thumbnail ? (
          <img
            src={`/api/print-files/thumbnail/${file.id}?t=${new Date(file.dateAdded).getTime()}`}
            alt={file.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--md-sys-color-outline)' }}>
            <FileCode size={40} strokeWidth={1.5} />
            <span style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>No preview</span>
          </div>
        )}

        <button
          type="button"
          onClick={onView3D}
          style={{
            position: 'absolute', bottom: '0.5rem', right: '0.5rem',
            backgroundColor: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff', borderRadius: 'var(--md-shape-corner-full)',
            padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem'
          }}
          title="Interactive 3D view"
        >
          <Eye size={12} /> 3D View
        </button>
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <>
          {/* Description + source */}
          <div style={{ marginBottom: '1rem' }}>
            <p style={{
              fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', lineHeight: '1.3',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>
              {file.description || 'No description.'}
            </p>
            {file.sourceUrl && (
              <a
                href={file.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--md-sys-color-primary)', marginTop: '0.4rem', textDecoration: 'none', fontWeight: '500' }}
              >
                <ExternalLink size={12} /> View Source
              </a>
            )}
          </div>

          {/* Filament slots */}
          <div style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderRadius: 'var(--md-shape-corner-medium)',
            padding: '0.75rem',
            marginBottom: '1.25rem',
            minHeight: '60px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--md-sys-color-outline)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {hasStl && !has3mf ? 'Suggested Filaments' : 'Model Filaments'}
              </span>
              {recommendingColorsMap[file.id] && (
                <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={12} />
              )}
            </div>

            {filaments.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {filaments.map(fil => (
                  <div
                    key={fil.slot}
                    style={{
                      width: '26px', height: '26px', borderRadius: '50%',
                      backgroundColor: fil.colorHex,
                      border: fil.isGeneric ? 'dashed 2px var(--md-sys-color-outline)' : 'solid 2px var(--md-sys-color-outline-variant)',
                      cursor: 'pointer'
                    }}
                    title={`${fil.role ? `[${fil.role}] ` : ''}${fil.brand} ${fil.name} (${fil.type})`}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                  {hasStl && !has3mf ? 'No colour recommendations yet.' : 'No filament data.'}
                </span>
                {hasStl && !has3mf && (
                  <button
                    type="button"
                    onClick={onRecommendColors}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                    disabled={recommendingColorsMap[file.id]}
                  >
                    Suggest Colors
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Actions footer */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '0.75rem' }}>
            <button
              className="btn btn-secondary"
              onClick={onViewDetails}
              style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', height: '36px' }}
            >
              Colour Versions & Details
            </button>

            {(hasStl || has3mf) && (() => {
              const hasMapped = has3mf && lastCv?.filaments?.length > 0;
              const hasOrcaExport = !has3mf && hasStl && lastCv?.filaments?.length > 0;
              const href = hasMapped
                ? `/api/print-files/download/${file.id}/3mf/${lastCv.id}`
                : hasOrcaExport
                  ? `/api/print-files/${file.id}/colour-versions/${lastCv.id}/orca-export`
                  : `/api/print-files/download/${file.id}/${has3mf ? '3mf' : 'stl'}`;
              const label = (hasMapped || hasOrcaExport) ? 'Download Mapped' : 'Download';
              return (
                <a
                  href={href}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem', fontSize: '0.8rem', textDecoration: 'none', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', flex: 1 }}
                >
                  <Download size={14} />
                  {label}
                </a>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
