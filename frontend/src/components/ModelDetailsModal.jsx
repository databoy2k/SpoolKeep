import { useState } from 'react';
import {
  X, Download, RotateCw, RefreshCw, Sparkles,
  ExternalLink, Pencil, Trash2, ChevronDown, ChevronUp, Plus
} from 'lucide-react';
import { getColorNameFromHex, getColourFamily } from '../utils/colorUtils';

function rgbDistance(hex1, hex2) {
  const parse = (h) => {
    const c = (h || '').replace('#', '').padEnd(6, '0');
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
  };
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

function SlotCard({ fil, spools, onChange }) {
  const matchedSpool = fil.matchedSpoolId ? spools.find(s => s.id === fil.matchedSpoolId) : null;
  const spoolColour = matchedSpool ? (matchedSpool.colourHex || matchedSpool.colorHex || fil.colorHex) : fil.colorHex;
  const showMismatch = matchedSpool && rgbDistance(fil.colorHex, spoolColour) > 60;

  const filType = fil.type.toUpperCase().replace(/\+/g,'');
  const colourOf = s => s.colourHex || s.colorHex || '#7f8c8d';
  const byColour = (a, b) => rgbDistance(fil.colorHex, colourOf(a)) - rgbDistance(fil.colorHex, colourOf(b));

  const sameType = spools
    .filter(s => s.type.toUpperCase().replace(/\+/g,'') === filType)
    .sort(byColour);
  const otherType = spools
    .filter(s => s.type.toUpperCase().replace(/\+/g,'') !== filType)
    .sort(byColour);

  const familyMap = {};
  for (const s of sameType) {
    const fam = getColourFamily(colourOf(s));
    if (!familyMap[fam]) familyMap[fam] = [];
    familyMap[fam].push(s);
  }
  const sortedFamilies = Object.entries(familyMap)
    .sort(([, a], [, b]) => rgbDistance(fil.colorHex, colourOf(a[0])) - rgbDistance(fil.colorHex, colourOf(b[0])));

  return (
    <div style={{
      border: `2px solid ${fil.matchedSpoolId ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-tertiary)'}`,
      borderRadius: 'var(--md-shape-corner-medium)',
      padding: '0.75rem',
      backgroundColor: 'var(--md-sys-color-surface-container)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      borderBottom: `4px solid ${fil.colorHex}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%',
          backgroundColor: fil.colorHex,
          border: '1.5px solid var(--md-sys-color-outline-variant)',
          flexShrink: 0
        }} />
        <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>Slot {fil.slot}</span>
        {fil.role && (
          <span style={{
            fontSize: '0.65rem', padding: '0.1rem 0.35rem',
            borderRadius: 'var(--md-shape-corner-small)',
            backgroundColor: 'var(--md-sys-color-secondary-container)',
            color: 'var(--md-sys-color-on-secondary-container)'
          }}>{fil.role}</span>
        )}
      </div>

      {matchedSpool && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
          <div style={{
            width: '14px', height: '14px', borderRadius: '50%',
            backgroundColor: spoolColour,
            border: '1.5px solid var(--md-sys-color-outline-variant)',
            flexShrink: 0
          }} />
          <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            {matchedSpool.brand} {matchedSpool.name}
          </span>
        </div>
      )}

      {showMismatch && (
        <div style={{
          fontSize: '0.65rem', color: 'var(--md-sys-color-error)',
          backgroundColor: 'var(--md-sys-color-error-container)',
          padding: '0.15rem 0.4rem', borderRadius: 'var(--md-shape-corner-small)',
          alignSelf: 'flex-start'
        }}>⚠ Colour Mismatch</div>
      )}

      <select
        value={fil.matchedSpoolId || 'generic'}
        onChange={(e) => onChange(fil.slot, e.target.value)}
        style={{
          padding: '0.25rem 0.4rem', fontSize: '0.75rem',
          borderRadius: 'var(--md-shape-corner-small)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          color: 'var(--md-sys-color-on-surface)',
          cursor: 'pointer', outline: 'none', width: '100%'
        }}
      >
        <option value="generic">≈ Generic / Unmapped ({fil.type})</option>
        {sortedFamilies.map(([family, familySpools]) => (
          <optgroup key={family} label={family}>
            {familySpools.map(s => (
              <option key={s.id} value={s.id}>{s.brand} {s.name} ({s.type})</option>
            ))}
          </optgroup>
        ))}
        {otherType.length > 0 && (
          <optgroup label="── Other Types ──">
            {otherType.map(s => (
              <option key={s.id} value={s.id}>{s.brand} {s.name} ({s.type})</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

function SlotSwatches({ filaments }) {
  return (
    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {filaments.map(fil => (
        <div
          key={fil.slot}
          title={`Slot ${fil.slot}${fil.role ? ` · ${fil.role}` : ''}: ${fil.brand} ${fil.name}`}
          style={{
            width: '16px', height: '16px', borderRadius: '50%',
            backgroundColor: fil.colorHex,
            border: fil.isGeneric
              ? '1.5px dashed var(--md-sys-color-outline)'
              : '1.5px solid var(--md-sys-color-outline-variant)'
          }}
        />
      ))}
    </div>
  );
}

function ColourVersionCard({
  cv, isLatest, model, spools, matchingSpoolsMap,
  recommendingColorsMap, onMatchSpools, onRecommendColors,
  onUpdateCv, onDeleteCv
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const [remapping, setRemapping] = useState(false);
  const [tempFilaments, setTempFilaments] = useState([]);
  const [renamingName, setRenamingName] = useState(null);

  const isStlOnly = !!model.stlFile && !model.threeMfFile;

  const handleStartRemap = () => {
    setTempFilaments(cv.filaments.map(f => ({ ...f })));
    setRemapping(true);
  };

  const handleSlotChange = (slot, value) => {
    setTempFilaments(prev => prev.map(fil => {
      if (fil.slot !== slot) return fil;
      if (value === 'generic') {
        const colorName = getColorNameFromHex(fil.colorHex);
        return { ...fil, matchedSpoolId: null, isGeneric: true, brand: 'Generic', name: `Generic ${colorName} ${fil.type}` };
      }
      const spool = spools.find(s => s.id === value);
      if (!spool) return fil;
      return {
        ...fil,
        matchedSpoolId: spool.id,
        isGeneric: false,
        brand: spool.brand,
        name: spool.name,
        type: spool.type,
        colorHex: spool.colourHex || spool.colorHex || fil.colorHex
      };
    }));
  };

  const handleSaveRemap = () => {
    onUpdateCv(cv.id, { filaments: tempFilaments });
    setRemapping(false);
  };

  const handleRenameSubmit = (newName) => {
    if (newName && newName.trim() && newName.trim() !== cv.name) {
      onUpdateCv(cv.id, { name: newName.trim() });
    }
    setRenamingName(null);
  };

  return (
    <div style={{
      border: isLatest ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
      borderRadius: 'var(--md-shape-corner-medium)',
      backgroundColor: 'var(--md-sys-color-surface-container-high)',
      overflow: 'hidden'
    }}>
      {/* Header row */}
      <div
        style={{
          padding: '0.85rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          gap: '0.75rem'
        }}
        onClick={() => !remapping && setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {renamingName !== null ? (
            <input
              autoFocus
              type="text"
              value={renamingName}
              onChange={(e) => setRenamingName(e.target.value)}
              onBlur={() => handleRenameSubmit(renamingName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(renamingName);
                if (e.key === 'Escape') setRenamingName(null);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: '0.9rem', fontWeight: '600',
                border: '1px solid var(--md-sys-color-primary)',
                borderRadius: 'var(--md-shape-corner-small)',
                backgroundColor: 'var(--md-sys-color-surface)',
                color: 'var(--md-sys-color-on-surface)',
                padding: '0.1rem 0.4rem',
                outline: 'none'
              }}
            />
          ) : (
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{cv.name}</span>
          )}

          <button
            type="button"
            title="Rename"
            onClick={(e) => { e.stopPropagation(); setRenamingName(cv.name); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--md-sys-color-outline)', display: 'flex' }}
          >
            <Pencil size={13} />
          </button>

          {isLatest && (
            <span style={{
              fontSize: '0.65rem', backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
              padding: '0.1rem 0.4rem', borderRadius: 'var(--md-shape-corner-small)', fontWeight: 'bold'
            }}>ACTIVE</span>
          )}

          <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>{cv.date ? new Date(cv.date).toLocaleDateString('en-CA') : ''}</span>

          {cv.filaments?.length > 0 && !expanded && (
            <SlotSwatches filaments={cv.filaments} />
          )}
        </div>

        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
          {/* Slot display / remap */}
          {remapping ? (
            <div style={{ paddingTop: '0.75rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '0.6rem',
                marginBottom: '0.75rem'
              }}>
                {tempFilaments.map(fil => (
                  <SlotCard key={fil.slot} fil={fil} spools={spools} onChange={handleSlotChange} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={handleSaveRemap}>
                  Save Mapping
                </button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setRemapping(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : cv.filaments?.length > 0 ? (
            <div style={{ paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {cv.filaments.map(fil => (
                <div key={fil.slot} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '50%',
                    backgroundColor: fil.colorHex,
                    border: fil.isGeneric ? '1px dashed var(--md-sys-color-outline)' : '1px solid var(--md-sys-color-outline-variant)',
                    flexShrink: 0
                  }} />
                  <span style={{ color: 'var(--md-sys-color-outline)', minWidth: '45px' }}>Slot {fil.slot}</span>
                  {fil.role && (
                    <span style={{
                      fontSize: '0.65rem', padding: '0.05rem 0.3rem',
                      borderRadius: 'var(--md-shape-corner-small)',
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                      color: 'var(--md-sys-color-outline)'
                    }}>{fil.role}</span>
                  )}
                  <span style={{ color: fil.isGeneric ? 'var(--md-sys-color-outline)' : 'var(--md-sys-color-on-surface)' }}>
                    {fil.brand} {fil.name}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--md-sys-color-outline)' }}>({fil.type})</span>
                  {!fil.isGeneric && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--md-sys-color-primary)', fontWeight: 'bold' }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', fontStyle: 'italic', paddingTop: '0.75rem' }}>
              No filaments assigned.{isStlOnly && ' Use Gemini Recommend to suggest colours.'}
            </p>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.4rem',
            marginTop: '0.85rem', paddingTop: '0.75rem',
            borderTop: '1px solid var(--md-sys-color-outline-variant)'
          }}>
            {/* Download buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {model.threeMfFile && cv.filaments?.length > 0 && (
                <a
                  href={`/api/print-files/download/${model.id}/3mf/${cv.id}`}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  title="Download 3MF with this colour version's filaments applied"
                >
                  <Download size={12} /> Download with Colours
                </a>
              )}
              {cv.filaments?.length > 0 && (
                <a
                  href={`/api/print-files/${model.id}/colour-versions/${cv.id}/orca-export`}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  title="Download OrcaSlicer filament preset files for this colour version"
                >
                  <Download size={12} /> Export Spools
                </a>
              )}
            </div>

            {/* Management row — always at bottom regardless of buttons above */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
              {cv.filaments?.length > 0 && !remapping && (
                <button
                  type="button"
                  className="select-option-btn"
                  style={{ fontSize: '0.7rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                  onClick={handleStartRemap}
                >
                  <RefreshCw size={10} /> Remap
                </button>
              )}
              {!remapping && (
                <button
                  type="button"
                  className="select-option-btn"
                  style={{ fontSize: '0.7rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                  onClick={() => onMatchSpools(model.id, cv.id)}
                  disabled={matchingSpoolsMap[cv.id]}
                >
                  {matchingSpoolsMap[cv.id]
                    ? <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={10} />
                    : <RefreshCw size={10} />}
                  Re-check Inventory
                </button>
              )}
              {isLatest && isStlOnly && !remapping && (
                <button
                  type="button"
                  className="select-option-btn"
                  style={{ fontSize: '0.7rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
                  onClick={() => onRecommendColors(model.id)}
                  disabled={recommendingColorsMap[model.id]}
                >
                  {recommendingColorsMap[model.id]
                    ? <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={10} />
                    : <Sparkles size={10} />}
                  Gemini Recommend
                </button>
              )}
              <button
                type="button"
                className="select-option-btn"
                style={{ fontSize: '0.7rem', display: 'flex', gap: '0.25rem', alignItems: 'center', color: 'var(--md-sys-color-error)', marginLeft: 'auto' }}
                onClick={() => {
                  if (confirm(`Delete "${cv.name}"? This cannot be undone.`)) onDeleteCv(model.id, cv.id);
                }}
              >
                <Trash2 size={10} /> Delete Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModelDetailsModal({
  model,
  spools = [],
  onClose,
  onEditDetails,
  onAddColourVersion,
  onMatchSpools,
  matchingSpoolsMap,
  onRecommendColors,
  recommendingColorsMap,
  onUpdateColourVersion,
  onDeleteColourVersion
}) {
  if (!model) return null;

  const cvs = model.colourVersions || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h2>Model Details</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Header: thumbnail + metadata */}
        <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {model.thumbnails?.length > 0 ? (
            <div style={{
              width: '120px', height: '120px', flexShrink: 0,
              display: 'flex', gap: '0.25rem', overflowX: 'auto',
              backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-shape-corner-medium)',
              padding: '0.15rem',
              scrollSnapType: 'x mandatory'
            }}>
              {model.thumbnails.map((_, idx) => (
                <img
                  key={idx}
                  src={`/api/print-files/thumbnail/${model.id}/plate/${idx}`}
                  alt={`${model.name} thumbnail ${idx + 1}`}
                  style={{ height: '100%', width: '100%', objectFit: 'contain', flexShrink: 0, scrollSnapAlign: 'start' }}
                />
              ))}
            </div>
          ) : model.thumbnail ? (
            <img
              src={`/api/print-files/thumbnail/${model.id}`}
              alt={model.name}
              style={{
                width: '120px', height: '120px', objectFit: 'contain', flexShrink: 0,
                backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-shape-corner-medium)'
              }}
            />
          ) : null}

          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '600', marginBottom: '0.2rem' }}>{model.name}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.4rem' }}>
              Added {new Date(model.dateAdded).toLocaleDateString('en-CA')}
            </p>
            {model.sourceUrl && (
              <a
                href={model.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--md-sys-color-primary)', textDecoration: 'none', marginBottom: '0.4rem' }}
              >
                <ExternalLink size={12} /> View Source
              </a>
            )}
            {model.description && (
              <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'pre-wrap', marginTop: '0.35rem' }}>
                {model.description}
              </p>
            )}
          </div>
        </div>

        {/* File row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
          {model.stlFile && (
            <a
              href={`/api/print-files/download/${model.id}/stl`}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Download size={14} /> Original STL
            </a>
          )}
          {model.threeMfFile && (
            <a
              href={`/api/print-files/download/${model.id}/3mf`}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Download size={14} /> Original 3MF
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={onEditDetails}
          >
            <Pencil size={14} /> Edit Details
          </button>
        </div>

        {/* Colour versions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Colour Versions</h4>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              onClick={onAddColourVersion}
            >
              <Plus size={14} /> Add Colour Version
            </button>
          </div>

          {cvs.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-outline)', fontStyle: 'italic' }}>
              No colour versions yet.{model.stlFile && !model.threeMfFile && ' Add a version and use Gemini Recommend to suggest colours.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[...cvs].reverse().map((cv, idx) => (
                <ColourVersionCard
                  key={cv.id}
                  cv={cv}
                  isLatest={idx === 0}
                  model={model}
                  spools={spools}
                  matchingSpoolsMap={matchingSpoolsMap}
                  recommendingColorsMap={recommendingColorsMap}
                  onMatchSpools={onMatchSpools}
                  onRecommendColors={onRecommendColors}
                  onUpdateCv={(cvId, patch) => onUpdateColourVersion(model.id, cvId, patch)}
                  onDeleteCv={onDeleteColourVersion}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
