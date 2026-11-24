import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer, RefreshCw, Link2, Unlink, Loader2, AlertCircle, Search,
  X, Check, CreditCard, Pencil, Eraser, Save, TriangleAlert, Plus
} from 'lucide-react';
import { toast } from 'sonner';

// Printer page — the SpoolKeep-side equivalent of the firmware's own
// /filament page. Shows every lane's detected filament, which SpoolKeep spool
// it is bound to, and lets the lane be linked, re-read, reset, or overridden.
//
// Every printer action goes through the SpoolKeep backend (/api/printer/*),
// which talks to Moonraker — the browser never contacts the printer directly,
// so this works from anywhere SpoolKeep is reachable.

const POLL_MS = 5000;
const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'PA', 'PVA', 'HIPS'];

function remainingPercent(spool) {
  if (!spool) return null;
  const used = parseFloat(spool.usedPercentage);
  return Number.isFinite(used) ? Math.max(0, Math.round(100 - used)) : null;
}

export default function PrinterPage({ spools = [], printerUrl = '', onSavePrinterUrl, onSpoolsChanged }) {
  const [state, setState] = useState({ configured: !!printerUrl, reachable: false, lanes: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyLane, setBusyLane] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [urlDraft, setUrlDraft] = useState(printerUrl);
  const [savingUrl, setSavingUrl] = useState(false);
  const [picker, setPicker] = useState(null);   // { lane }
  const [editor, setEditor] = useState(null);   // { lane, vendor, material, subType, colour }
  const [creator, setCreator] = useState(null); // { lane, name, brand, material, subType, colour, netWeight, ... }
  const [creating, setCreating] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => { setUrlDraft(printerUrl); }, [printerUrl]);

  useEffect(() => {
    loadLanes(true);
    pollRef.current = setInterval(() => loadLanes(false), POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printerUrl]);

  async function loadLanes(showSpinner) {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch('/api/printer/lanes');
      const data = await res.json();
      setState(data);
      setError(res.ok ? '' : (data.error || 'Could not read the printer'));
    } catch (e) {
      setError(e.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  // Every lane action posts, then re-reads so the card reflects the printer.
  async function laneAction(lane, path, body, successMsg) {
    setBusyLane(lane.lane);
    try {
      const res = await fetch(`/api/printer/lane/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: lane.channel, ...body })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Printer rejected the command');
      if (successMsg) toast.success(successMsg);
      // The printer needs a moment to apply before the state reads back.
      setTimeout(() => loadLanes(false), 600);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setBusyLane(null);
    }
  }

  async function linkSpool(lane, spool) {
    const ok = await laneAction(
      lane, 'spool',
      { spoolmanId: spool.spoolmanId, cardUid: lane.cardUid || undefined },
      `Extruder ${lane.extruder} linked to ${spool.name || `#${spool.spoolmanId}`}.`
    );
    if (ok) {
      setPicker(null);
      // The card UID may have been stored on the spool — refresh the inventory.
      if (lane.cardUid && onSpoolsChanged) onSpoolsChanged();
    }
  }

  async function unlinkLane(lane) {
    await laneAction(lane, 'spool', { spoolmanId: 0 }, `Extruder ${lane.extruder} unlinked.`);
  }

  async function refreshLane(lane) {
    await laneAction(lane, 'refresh', {}, `Re-reading extruder ${lane.extruder}…`);
  }

  async function resetLane(lane) {
    await laneAction(lane, 'reset', {}, `Extruder ${lane.extruder} cleared.`);
  }

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      const res = await fetch('/api/printer/lane/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Printer rejected the command');
      toast.success('Reading all spool tags…');
      setTimeout(() => loadLanes(false), 1200);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRefreshingAll(false);
    }
  }

  // Add the lane's filament to the inventory as a new spool, then bind the
  // lane to it in one go. Saves typing a spool in by hand on the Spools page
  // and coming back here to link it — the tag already knows most of this.
  async function createSpoolFromLane(form) {
    const lane = form.lane;
    setCreating(true);
    try {
      const res = await fetch('/api/spools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || [form.brand, form.material, form.subType].filter(Boolean).join(' ') || 'New Spool',
          brand: form.brand.trim() || 'Generic',
          type: form.material,
          colourHex: form.colour,
          netWeight: parseFloat(form.netWeight) > 0 ? parseFloat(form.netWeight) : 1000,
          // Temps the tag reported, where it had them; the server defaults the rest.
          ...(form.minTemp ? { minTemp: form.minTemp } : {}),
          ...(form.maxTemp ? { maxTemp: form.maxTemp } : {}),
          ...(form.bedTemp ? { bedMinTemp: form.bedTemp, bedMaxTemp: form.bedTemp } : {}),
          notes: form.subType ? `${form.subType} — added from extruder ${lane.extruder}` : ''
        })
      });
      const spool = await res.json();
      if (!res.ok) throw new Error(spool.error || 'Could not create the spool');
      setCreator(null);
      if (onSpoolsChanged) onSpoolsChanged();
      // Bind straight away; this also stores the card UID on the new spool.
      await linkSpool(lane, spool);
      toast.success(`${spool.name} added and linked to extruder ${lane.extruder}.`);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setCreating(false);
    }
  }

  // Seed the form from what the lane reports, so most of it is already right.
  function openCreator(lane) {
    const subType = lane.subType || '';
    setCreator({
      lane,
      name: [lane.vendor, lane.material, subType].filter(Boolean).join(' '),
      brand: lane.vendor || '',
      material: lane.material || 'PLA',
      subType,
      colour: `#${String(lane.colorHex || '7F8C8D').replace(/^#/, '')}`,
      netWeight: '1000',
      minTemp: lane.rfid?.minTemp || '',
      maxTemp: lane.rfid?.maxTemp || '',
      bedTemp: lane.rfid?.bedTemp || ''
    });
  }

  async function applyFilament(form) {
    const lane = form.lane;
    const ok = await laneAction(lane, 'filament', {
      vendor: form.vendor,
      material: form.material,
      subType: form.subType,
      colours: [form.colour]
    }, `Extruder ${lane.extruder} filament set.`);
    if (ok) setEditor(null);
  }

  async function savePrinterUrl() {
    setSavingUrl(true);
    try {
      await onSavePrinterUrl(urlDraft.trim());
      toast.success('Printer address saved.');
      setTimeout(() => loadLanes(true), 300);
    } catch (e) {
      toast.error(e.message || 'Could not save the printer address.');
    } finally {
      setSavingUrl(false);
    }
  }

  const lanes = state.lanes || [];
  const linkedCount = lanes.filter(l => l.currentSpoolId > 0).length;
  const loadedCount = lanes.filter(l => !l.empty).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Printer size={22} /> Printer
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-outline)', margin: 0 }}>
            {state.configured
              ? (state.reachable
                ? `${loadedCount} lane${loadedCount === 1 ? '' : 's'} loaded · ${linkedCount} linked to inventory`
                : 'Printer not reachable')
              : 'No printer address configured yet'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <StatusDot ok={state.reachable} label={state.reachable ? 'Connected' : 'Offline'} />
          <button className="btn btn-secondary" onClick={() => loadLanes(true)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={16} className={loading ? 'spin' : undefined} /> Reload
          </button>
          <button className="btn btn-primary" onClick={refreshAll} disabled={!state.reachable || refreshingAll} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {refreshingAll ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />} Read spool tags
          </button>
        </div>
      </div>

      {/* Printer address */}
      <section className="controls-bar" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ flex: 1, minWidth: '260px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Printer address (Moonraker)</label>
          <input
            type="text"
            className="form-input"
            placeholder="http://10.0.1.51  ·  10.0.1.51:7125  ·  https://printer.local"
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') savePrinterUrl(); }}
            style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', marginTop: '0.3rem' }}>
            Plain host and IP addresses default to http. Port 7125 is Moonraker's own port; the
            extended firmware also serves it on port 80.
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={savePrinterUrl}
          disabled={savingUrl || urlDraft.trim() === (printerUrl || '').trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {savingUrl ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save
        </button>
      </section>

      {error && state.configured && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-error)', color: 'var(--md-sys-color-error)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div>{error}</div>
        </div>
      )}

      {loading && lanes.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '3rem', color: 'var(--md-sys-color-outline)' }}>
          <Loader2 size={18} className="spin" /> Reading printer…
        </div>
      )}

      {!loading && !state.configured && (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--md-sys-color-outline)', fontSize: '0.9rem' }}>
          Enter the printer's address above to see its lanes.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {lanes.map(lane => (
          <LaneCard
            key={lane.lane}
            lane={lane}
            busy={busyLane === lane.lane}
            onPick={() => setPicker({ lane })}
            onNew={() => openCreator(lane)}
            onUnlink={() => unlinkLane(lane)}
            onRefresh={() => refreshLane(lane)}
            onReset={() => resetLane(lane)}
            onEdit={() => setEditor({
              lane,
              vendor: lane.printer.vendor || lane.rfid?.vendor || '',
              material: lane.printer.material || lane.rfid?.material || 'PLA',
              subType: lane.printer.subType || '',
              colour: `#${lane.colorHex || 'FFFFFF'}`
            })}
          />
        ))}
      </div>

      {creator && (
        <NewSpoolFromLane
          value={creator}
          spools={spools}
          busy={creating}
          onChange={setCreator}
          onClose={() => setCreator(null)}
          onCreate={() => createSpoolFromLane(creator)}
        />
      )}

      {picker && (
        <SpoolPicker
          lane={picker.lane}
          spools={spools}
          onClose={() => setPicker(null)}
          onSelect={spool => linkSpool(picker.lane, spool)}
        />
      )}

      {editor && (
        <FilamentEditor
          value={editor}
          spools={spools}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onApply={() => applyFilament(editor)}
        />
      )}
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        backgroundColor: ok ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)'
      }} />
      {label}
    </span>
  );
}

function Badge({ children, tone = 'outline', title }) {
  const colour = tone === 'primary' ? 'var(--md-sys-color-primary)'
    : tone === 'error' ? 'var(--md-sys-color-error)'
      : 'var(--md-sys-color-outline)';
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
      fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '999px',
      border: `1px solid ${colour}`, color: colour, whiteSpace: 'nowrap'
    }}>{children}</span>
  );
}

function LaneCard({ lane, busy, onPick, onNew, onUnlink, onRefresh, onReset, onEdit }) {
  const spool = lane.currentSpool;
  const remaining = remainingPercent(spool);
  const swatches = lane.colours?.length ? lane.colours : [lane.colorHex || 'FFFFFF'];

  return (
    <div style={{
      padding: '1rem',
      borderRadius: 'var(--md-shape-corner-large)',
      border: '1px solid var(--md-sys-color-outline-variant)',
      backgroundColor: 'var(--md-sys-color-surface-container-high)',
      opacity: lane.empty ? 0.65 : 1,
      position: 'relative'
    }}>
      {busy && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--md-sys-color-surface-container-high)', opacity: 0.75, borderRadius: 'var(--md-shape-corner-large)', zIndex: 2 }}>
          <Loader2 size={20} className="spin" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          {swatches.slice(0, 3).map((c, i) => (
            <div key={i} style={{
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: `#${c}`,
              border: '1px solid var(--md-sys-color-outline-variant)',
              marginLeft: i ? '-10px' : 0
            }} title={`#${c}`} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Extruder {lane.extruder}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[lane.vendor, lane.material, lane.subType].filter(Boolean).join(' ') || 'No filament'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
        {lane.official && <Badge tone="primary">official</Badge>}
        {lane.cardUid && <Badge><CreditCard size={9} /> {lane.cardType || 'RFID'}</Badge>}
        {lane.currentSpoolId > 0 && <Badge tone="primary">spool #{lane.currentSpoolId}</Badge>}
        {lane.tagEmpty && <Badge title="Tag carries no filament data">blank tag</Badge>}
        {lane.tagMalformed && <Badge tone="error">unreadable tag</Badge>}
        {lane.mismatch && (
          <Badge tone="error" title="The tag and the printer's current filament settings disagree">
            <TriangleAlert size={9} /> mismatch
          </Badge>
        )}
      </div>

      <dl style={{ margin: '0.75rem 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', fontSize: '0.75rem' }}>
        <dt style={{ color: 'var(--md-sys-color-outline)' }}>Card UID</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>
          {lane.cardUid || '—'}
        </dd>
        <dt style={{ color: 'var(--md-sys-color-outline)' }}>Linked spool</dt>
        <dd style={{ margin: 0 }}>
          {spool
            ? `${spool.brand || ''} ${spool.name || ''}`.trim() || `#${spool.spoolmanId}`
            : (lane.currentSpoolId > 0 ? `#${lane.currentSpoolId} (not in inventory)` : 'None')}
          {remaining != null && (
            <span style={{ color: 'var(--md-sys-color-outline)' }}> · {remaining}% left</span>
          )}
        </dd>
        {!!lane.rfid?.material && (
          <>
            <dt style={{ color: 'var(--md-sys-color-outline)' }}>Tag says</dt>
            <dd style={{ margin: 0 }}>
              {[lane.rfid.vendor, lane.rfid.material, lane.rfid.subType].filter(Boolean).join(' ')}
              {lane.rfid.colorHex ? ` · #${lane.rfid.colorHex}` : ''}
            </dd>
          </>
        )}
      </dl>

      {lane.suggestedSpoolId != null && lane.currentSpoolId !== lane.suggestedSpoolId && (
        <div style={{ fontSize: '0.72rem', color: 'var(--md-sys-color-primary)', marginTop: '0.5rem' }}>
          Suggested: #{lane.suggestedSpoolId}
          {lane.matchedBy === 'card' ? ' (known card)' : ` (${lane.matchedBy})`}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
        <button className="btn btn-primary" onClick={onPick} style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Link2 size={13} /> {lane.currentSpoolId > 0 ? 'Change spool' : 'Link spool'}
        </button>
        {(lane.cardUid || lane.vendor || lane.material) && lane.matchedBy !== 'card' && (
          <button className="btn btn-secondary" onClick={onNew} title="Add this filament to the inventory as a new spool and link the lane to it" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Plus size={13} /> New spool
          </button>
        )}
        {lane.currentSpoolId > 0 && (
          <button className="btn btn-secondary" onClick={onUnlink} style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Unlink size={13} /> Unlink
          </button>
        )}
        <button className="btn btn-secondary" onClick={onRefresh} title="Re-read this lane's RFID tag" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <RefreshCw size={13} /> Re-read
        </button>
        <button className="btn btn-secondary" onClick={onEdit} title="Set this lane's filament by hand" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Pencil size={13} /> Filament
        </button>
        <button className="btn btn-secondary" onClick={onReset} title="Clear this lane's detected filament" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Eraser size={13} /> Reset
        </button>
      </div>
    </div>
  );
}

// Inventory picker for one lane. Candidates come from the backend already
// ranked (known card UID first, then brand/material/colour), so the list opens
// on the best guess.
function SpoolPicker({ lane, spools, onClose, onSelect }) {
  const [query, setQuery] = useState('');

  const ordered = useMemo(() => {
    const byId = new Map(spools.map(s => [s.spoolmanId, s]));
    const ranked = (lane.candidates || [])
      .map(c => byId.get(c.spoolmanId))
      .filter(Boolean);
    const seen = new Set(ranked.map(s => s.spoolmanId));
    return ranked.concat(spools.filter(s => !seen.has(s.spoolmanId)));
  }, [lane, spools]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(s =>
      [s.name, s.brand, s.type, String(s.spoolmanId)]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q)));
  }, [ordered, query]);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={20} /> Pick a spool — Extruder {lane.extruder}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ padding: '1rem 1.25rem' }}>
          <div className="search-container" style={{ marginBottom: '0.75rem' }}>
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              placeholder="Search inventory…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--md-sys-color-outline)', fontSize: '0.85rem' }}>
                No spools match.
              </div>
            )}
            {filtered.map(s => {
              const candidate = (lane.candidates || []).find(c => c.spoolmanId === s.spoolmanId);
              const isCurrent = s.spoolmanId === lane.currentSpoolId;
              return (
                <button
                  key={s.spoolmanId}
                  type="button"
                  onClick={() => onSelect(s)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem',
                    padding: '0.55rem 0.7rem', marginBottom: '0.35rem', textAlign: 'left',
                    borderRadius: 'var(--md-shape-corner-medium)', cursor: 'pointer',
                    border: `1px solid ${isCurrent ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
                    backgroundColor: 'var(--md-sys-color-surface-container-high)'
                  }}
                >
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0, backgroundColor: `#${(s.colourHex || s.colorHex || 'FFFFFF').replace('#', '')}`, border: '1px solid var(--md-sys-color-outline-variant)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name || `Spool #${s.spoolmanId}`}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--md-sys-color-outline)' }}>
                      #{s.spoolmanId} · {[s.brand, s.type].filter(Boolean).join(' ')} · {remainingPercent(s) ?? '—'}% left
                    </div>
                  </div>
                  {candidate?.uidMatch && <Badge tone="primary"><CreditCard size={9} /> card</Badge>}
                  {isCurrent && <Badge tone="primary"><Check size={9} /> current</Badge>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Add the lane's filament to the inventory as a new spool and link it in one
// step. Everything is seeded from what the lane reports, so a tagged spool
// usually needs no typing at all — and the card UID gets stored on the new
// spool by the link, so the printer recognises it from then on.
function NewSpoolFromLane({ value, spools, busy, onChange, onClose, onCreate }) {
  const materials = useMemo(() => {
    const fromInventory = spools.map(s => s.type).filter(Boolean);
    return Array.from(new Set([...COMMON_MATERIALS, ...fromInventory]));
  }, [spools]);
  const brands = useMemo(
    () => Array.from(new Set(spools.map(s => s.brand).filter(Boolean))).sort(),
    [spools]);

  const set = (patch) => onChange({ ...value, ...patch });
  const lane = value.lane;
  const hasTagData = !!(lane.vendor || lane.material);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> New spool — Extruder {lane.extruder}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--md-sys-color-outline)' }}>
            {hasTagData
              ? 'Filled in from what this lane reports. Adjust anything that looks wrong.'
              : 'This lane reports no filament data, so fill it in yourself.'}
            {lane.cardUid && ' The card UID below is stored on the spool, so the printer will recognise it next time.'}
          </p>
          {lane.cardUid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
              <CreditCard size={12} />
              <span style={{ fontFamily: 'monospace' }}>{lane.cardUid}</span>
            </div>
          )}
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Name</label>
            <input className="form-input" value={value.name} onChange={e => set({ name: e.target.value })} placeholder="Make Market PLA" />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Brand</label>
            <input className="form-input" list="printer-brands" value={value.brand} onChange={e => set({ brand: e.target.value })} placeholder="Generic" />
            <datalist id="printer-brands">
              {brands.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Material</label>
              <select className="form-input" value={value.material} onChange={e => set({ material: e.target.value })}>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Sub-type</label>
              <input className="form-input" value={value.subType} onChange={e => set({ subType: e.target.value })} placeholder="Silk, Matte…" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Colour</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={value.colour} onChange={e => set({ colour: e.target.value })} style={{ width: '48px', height: '38px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                <input className="form-input" value={value.colour} onChange={e => set({ colour: e.target.value })} style={{ fontFamily: 'monospace' }} />
              </div>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Spool weight (g)</label>
              <input className="form-input" type="number" min="1" value={value.netWeight} onChange={e => set({ netWeight: e.target.value })} placeholder="1000" />
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={onCreate} disabled={busy || !value.material} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {busy ? 'Adding…' : 'Add and link'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Manual per-lane filament override — the same SET_PRINT_FILAMENT_CONFIG the
// firmware's own page sends from its "User" dialog.
function FilamentEditor({ value, spools, onChange, onClose, onApply }) {
  const materials = useMemo(() => {
    const fromInventory = spools.map(s => s.type).filter(Boolean);
    return Array.from(new Set([...COMMON_MATERIALS, ...fromInventory]));
  }, [spools]);
  const brands = useMemo(
    () => Array.from(new Set(spools.map(s => s.brand).filter(Boolean))).sort(),
    [spools]);

  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Pencil size={18} /> Set filament — Extruder {value.lane.extruder}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--md-sys-color-outline)' }}>
            Overrides what the printer thinks is loaded in this lane. The RFID tag is not
            rewritten — re-reading the tag undoes this.
          </p>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Brand</label>
            <input
              className="form-input"
              list="printer-brands"
              value={value.vendor}
              onChange={e => set({ vendor: e.target.value })}
              placeholder="Generic"
            />
            <datalist id="printer-brands">
              {brands.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Material</label>
              <select className="form-input" value={value.material} onChange={e => set({ material: e.target.value })}>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Sub-type</label>
              <input className="form-input" value={value.subType} onChange={e => set({ subType: e.target.value })} placeholder="Silk, Matte…" />
            </div>
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Colour</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="color" value={value.colour} onChange={e => set({ colour: e.target.value })} style={{ width: '48px', height: '38px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
              <input className="form-input" value={value.colour} onChange={e => set({ colour: e.target.value })} style={{ fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.25rem' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onApply} disabled={!value.material}>Apply to lane</button>
        </div>
      </div>
    </div>
  );
}
