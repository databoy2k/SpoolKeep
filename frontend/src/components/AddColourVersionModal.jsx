import { useState, useEffect } from 'react';
import { X, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { getColorNameFromHex, getColourFamily } from '../utils/colorUtils';

function rgbDistance(hex1, hex2) {
  const parse = (h) => {
    const c = h.replace('#', '').padEnd(6, '0');
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

  // Group same-type spools by colour family; sameType is already distance-sorted so
  // each group's first entry is its closest match — use that to rank the groups.
  const familyMap = {};
  for (const s of sameType) {
    const fam = getColourFamily(colourOf(s));
    if (!familyMap[fam]) familyMap[fam] = [];
    familyMap[fam].push(s);
  }
  const sortedFamilies = Object.entries(familyMap)
    .sort(([, a], [, b]) => rgbDistance(fil.colorHex, colourOf(a[0])) - rgbDistance(fil.colorHex, colourOf(b[0])));

  const borderColor = fil.matchedSpoolId
    ? 'var(--md-sys-color-primary)'
    : 'var(--md-sys-color-tertiary)';

  return (
    <div style={{
      border: `2px solid ${borderColor}`,
      borderRadius: 'var(--md-shape-corner-medium)',
      padding: '0.85rem',
      backgroundColor: 'var(--md-sys-color-surface-container)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      borderBottom: `4px solid ${fil.colorHex}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          backgroundColor: fil.colorHex,
          border: '1.5px solid var(--md-sys-color-outline-variant)',
          flexShrink: 0
        }} />
        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Slot {fil.slot}</span>
        {fil.role && (
          <span style={{
            fontSize: '0.7rem', padding: '0.1rem 0.4rem',
            borderRadius: 'var(--md-shape-corner-small)',
            backgroundColor: 'var(--md-sys-color-secondary-container)',
            color: 'var(--md-sys-color-on-secondary-container)'
          }}>{fil.role}</span>
        )}
      </div>

      {matchedSpool && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <div style={{
            width: '16px', height: '16px', borderRadius: '50%',
            backgroundColor: spoolColour,
            border: fil.isGeneric
              ? '1.5px dashed var(--md-sys-color-outline)'
              : '1.5px solid var(--md-sys-color-outline-variant)',
            flexShrink: 0
          }} />
          <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            {matchedSpool.brand} {matchedSpool.name}
          </span>
        </div>
      )}

      {showMismatch && (
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--md-sys-color-error)',
          backgroundColor: 'var(--md-sys-color-error-container)',
          padding: '0.2rem 0.5rem',
          borderRadius: 'var(--md-shape-corner-small)',
          alignSelf: 'flex-start'
        }}>
          ⚠ Colour Mismatch
        </div>
      )}

      <select
        value={fil.matchedSpoolId || 'generic'}
        onChange={(e) => onChange(fil.slot, e.target.value)}
        style={{
          padding: '0.3rem 0.5rem',
          fontSize: '0.8rem',
          borderRadius: 'var(--md-shape-corner-small)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          color: 'var(--md-sys-color-on-surface)',
          cursor: 'pointer',
          outline: 'none',
          width: '100%'
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

export default function AddColourVersionModal({ isOpen, onClose, model, spools, onAdded }) {
  const [versionName, setVersionName] = useState('');
  const [date, setDate] = useState('');
  const [filaments, setFilaments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !model) return;

    const nextN = (model.colourVersions?.length || 0) + 1;
    setVersionName(`Colour Version ${nextN}`);
    setDate(new Date().toISOString().split('T')[0]);

    const seedSlots = model.threeMfFile?.baseSlots || [];
    const lastCv = model.colourVersions?.at(-1);

    if (seedSlots.length > 0) {
      const seeded = seedSlots.map(slot => {
        const prevFil = lastCv?.filaments?.find(f => f.slot === slot.slot);
        return prevFil
          ? { ...prevFil, role: slot.role || prevFil.role }
          : {
              slot: slot.slot,
              colorHex: slot.colorHex,
              matchedSpoolId: null,
              brand: 'Generic',
              type: slot.type,
              name: `Generic ${getColorNameFromHex(slot.colorHex)} ${slot.type}`,
              isGeneric: true,
              role: slot.role
            };
      });
      setFilaments(seeded);
    } else if (lastCv?.filaments?.length) {
      setFilaments(lastCv.filaments.map(f => ({ ...f })));
    } else {
      setFilaments([]);
    }
  }, [isOpen, model]);

  if (!isOpen || !model) return null;

  const handleSlotChange = (slot, value) => {
    setFilaments(prev => prev.map(fil => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/print-files/${model.id}/colour-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: versionName, date, filaments })
      });
      const data = await response.json();
      if (response.ok) {
        onAdded(data);
        onClose();
      } else {
        toast.error(data.error || 'Failed to add colour version.');
      }
    } catch {
      toast.error('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <h2>Add Colour Version</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Version Name</label>
              <input
                type="text"
                className="form-input"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {filaments.length > 0 ? (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.75rem' }}>
                Assign inventory spools to each filament slot:
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
                maxHeight: '360px',
                overflowY: 'auto',
                paddingRight: '0.25rem'
              }}>
                {filaments.map(fil => (
                  <SlotCard
                    key={fil.slot}
                    fil={fil}
                    spools={spools}
                    onChange={handleSlotChange}
                  />
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-outline)', marginBottom: '1.25rem', fontStyle: 'italic' }}>
              No slot data available. The colour version will be created empty — use Gemini Recommend or Re-check Inventory after saving.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {saving && <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={16} />}
              Add Version
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
