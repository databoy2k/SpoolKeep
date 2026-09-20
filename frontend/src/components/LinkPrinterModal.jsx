import { useState, useEffect, useMemo } from 'react';
import { X, Link2, RefreshCw, Loader2, AlertCircle, Check, CreditCard, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

// Reads the connected printer's loaded lanes and lets the user confirm which
// SpoolKeep spool each lane maps to, then binds them via SET_SPOOL_ID
// (backend POST /api/printer/link/apply).
//
// Lanes the printer already points at the right spool are shown as linked and
// left alone; only changed lanes are sent.
export default function LinkPrinterModal({ isOpen, onClose, onLinked }) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [lanes, setLanes] = useState([]);
  // Map of lane -> chosen spoolmanId ('' = don't link)
  const [choices, setChoices] = useState({});

  useEffect(() => {
    if (isOpen) loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function initialChoices(laneList) {
    const initial = {};
    laneList.forEach(l => {
      // Prefer the suggestion; otherwise keep whatever the printer already has.
      const pick = l.suggestedSpoolId != null
        ? l.suggestedSpoolId
        : (l.currentSpoolId > 0 ? l.currentSpoolId : null);
      initial[l.lane] = pick != null ? String(pick) : '';
    });
    return initial;
  }

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/printer/link/preview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read printer');
      const laneList = data.lanes || [];
      setLanes(laneList);
      setChoices(initialChoices(laneList));
    } catch (e) {
      setError(e.message);
      setLanes([]);
    } finally {
      setLoading(false);
    }
  }

  // Lanes whose selection differs from what the printer currently holds.
  const pending = useMemo(() => lanes.filter(l => {
    const choice = choices[l.lane];
    if (!choice) return false;
    return parseInt(choice, 10) !== l.currentSpoolId;
  }), [lanes, choices]);

  function acceptAllSuggestions() {
    setChoices(initialChoices(lanes));
    const n = lanes.filter(l => l.suggestedSpoolId != null).length;
    toast.success(n ? `Filled ${n} suggested match${n === 1 ? '' : 'es'}.` : 'No confident matches found.');
  }

  async function applyLinks() {
    const links = pending.map(l => ({
      lane: l.lane,
      spoolmanId: parseInt(choices[l.lane], 10),
      cardUid: l.cardUid || undefined
    }));
    if (links.length === 0) {
      toast.error('Nothing to change — every lane already points at the selected spool.');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch('/api/printer/link/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      const okCount = (data.results || []).filter(r => r.ok).length;
      const failCount = (data.results || []).length - okCount;
      if (okCount) toast.success(`Linked ${okCount} spool${okCount === 1 ? '' : 's'} on the printer.`);
      if (failCount) toast.error(`${failCount} link${failCount === 1 ? '' : 's'} failed — check the server log.`);
      if (onLinked) onLinked();
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  }

  if (!isOpen) return null;

  const badgeStyle = (colour) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    fontSize: '0.65rem',
    padding: '0.1rem 0.35rem',
    borderRadius: '999px',
    border: `1px solid ${colour}`,
    color: colour,
    whiteSpace: 'nowrap'
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={20} />
            Link Printer Spools
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginTop: 0 }}>
            Each loaded lane is matched against your inventory — by RFID card first, then brand,
            material and colour. Confirm or change the matches and hit Link; the card UID is
            saved on the spool so the same tag is recognised instantly next time.
          </p>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1.5rem', justifyContent: 'center', color: 'var(--md-sys-color-outline)' }}>
              <Loader2 size={18} className="spin" /> Reading printer…
            </div>
          )}

          {!loading && error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-error)', color: 'var(--md-sys-color-error)', fontSize: '0.85rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
              <div>{error}<br /><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Check the Printer URL in Settings and that the printer is on.</span></div>
            </div>
          )}

          {!loading && !error && lanes.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--md-sys-color-outline)', fontSize: '0.85rem' }}>
              No loaded filament detected on the printer.
            </div>
          )}

          {!loading && !error && lanes.map(lane => {
            const changed = parseInt(choices[lane.lane] || '0', 10) !== lane.currentSpoolId && choices[lane.lane] !== '';
            return (
              <div key={lane.lane} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', marginTop: '0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, backgroundColor: `#${lane.colorHex || 'FFFFFF'}`, border: '1px solid var(--md-sys-color-outline-variant)' }} title={`#${lane.colorHex}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                      Extruder {lane.extruder} <span style={{ fontWeight: 'normal', color: 'var(--md-sys-color-outline)' }}>({lane.lane})</span>
                    </span>
                    {lane.matchedBy === 'card' && (
                      <span style={badgeStyle('var(--md-sys-color-primary)')}><CreditCard size={10} /> card match</span>
                    )}
                    {lane.alreadyLinked && (
                      <span style={badgeStyle('var(--md-sys-color-outline)')}><Check size={10} /> already linked</span>
                    )}
                    {changed && !lane.alreadyLinked && (
                      <span style={badgeStyle('var(--md-sys-color-primary)')}>will change</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                    {[lane.vendor, lane.material].filter(Boolean).join(' ') || 'Unknown'}
                    {lane.cardUid ? ` · card ${lane.cardUid}` : ' · no card'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)' }}>
                    {lane.currentSpool
                      ? `Printer has #${lane.currentSpool.spoolmanId} ${lane.currentSpool.brand || ''} ${lane.currentSpool.name || ''}`.trim()
                      : (lane.currentSpoolId > 0
                        ? `Printer has #${lane.currentSpoolId} (not in inventory)`
                        : 'Printer has no spool bound')}
                  </div>
                </div>
                <select
                  className="form-input"
                  style={{ width: '260px', flexShrink: 0, fontSize: '0.8rem', padding: '0.4rem' }}
                  value={choices[lane.lane] ?? ''}
                  onChange={e => setChoices(c => ({ ...c, [lane.lane]: e.target.value }))}
                >
                  <option value="">— Don't link —</option>
                  {lane.candidates.map(c => (
                    <option key={c.spoolmanId} value={c.spoolmanId}>
                      #{c.spoolmanId} {c.brand} {c.type} — {c.name}
                      {c.uidMatch ? '  ⬤ card' : (c.brandMatch && c.typeMatch && c.colourDistance < 30 ? '  ✓' : '')}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={loading || applying} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <RefreshCw size={14} /> Re-read
            </button>
            <button type="button" className="btn btn-secondary" onClick={acceptAllSuggestions} disabled={loading || applying || lanes.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Wand2 size={14} /> Use suggestions
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={applyLinks} disabled={loading || applying || pending.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {applying ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
              {pending.length > 0 ? `Link ${pending.length} lane${pending.length === 1 ? '' : 's'}` : 'Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
