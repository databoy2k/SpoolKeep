import { useState, useEffect } from 'react';
import { X, Link2, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Reads the connected printer's loaded lanes and lets the user confirm which
// SpoolKeep spool each RFID-detected filament maps to, then binds them via
// SET_SPOOL_ID (backend POST /api/printer/link/apply).
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

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/printer/link/preview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read printer');
      setLanes(data.lanes || []);
      const initial = {};
      (data.lanes || []).forEach(l => {
        initial[l.lane] = l.suggestedSpoolId != null ? String(l.suggestedSpoolId) : '';
      });
      setChoices(initial);
    } catch (e) {
      setError(e.message);
      setLanes([]);
    } finally {
      setLoading(false);
    }
  }

  async function applyLinks() {
    const links = Object.entries(choices)
      .filter(([, v]) => v !== '')
      .map(([lane, v]) => ({ lane, spoolmanId: parseInt(v, 10) }));
    if (links.length === 0) {
      toast.error('Nothing selected to link.');
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

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={20} />
            Link Printer Spools
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginTop: 0 }}>
            Each loaded lane's RFID-detected filament is matched to a spool in your inventory.
            Confirm or change each match, then Link — the printer binds the card so future scans
            resolve automatically.
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

          {!loading && !error && lanes.map(lane => (
            <div key={lane.lane} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', marginTop: '0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0, backgroundColor: `#${lane.colorHex || 'FFFFFF'}`, border: '1px solid var(--md-sys-color-outline-variant)' }} title={`#${lane.colorHex}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                  Extruder {lane.extruder} <span style={{ fontWeight: 'normal', color: 'var(--md-sys-color-outline)' }}>({lane.lane})</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                  {[lane.vendor, lane.material].filter(Boolean).join(' ') || 'Unknown'}
                  {lane.cardUid ? ` · card ${lane.cardUid}` : ' · no card'}
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
                    {c.brandMatch && c.typeMatch && c.colourDistance < 30 ? '  ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '1rem 1.25rem' }}>
          <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={loading || applying} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <RefreshCw size={14} /> Re-read
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={applyLinks} disabled={loading || applying || lanes.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {applying ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />} Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
