import { useState, useEffect, useRef } from 'react';
import { X, RotateCw, Paperclip, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function EditPrintFileModal({ isOpen, onClose, model, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [threeMfFile, setThreeMfFile] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (model) {
      setName(model.name || '');
      setDescription(model.description || '');
      setSourceUrl(model.sourceUrl || '');
      setThreeMfFile(null);
    }
  }, [model]);

  if (!isOpen || !model) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/print-files/${model.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description, sourceUrl })
      });
      const data = await response.json();
      if (response.ok) {
        onSaved(data);
        onClose();
      } else {
        toast.error(data.error || 'Failed to save changes.');
      }
    } catch {
      toast.error('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleAttach3MF = async () => {
    if (!threeMfFile) return;
    setAttaching(true);
    try {
      const formData = new FormData();
      formData.append('threeMfFile', threeMfFile);
      const response = await fetch(`/api/print-files/${model.id}/attach-3mf`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        toast.success('3MF file attached successfully.');
        onSaved(data);
        setThreeMfFile(null);
      } else {
        toast.error(data.error || 'Failed to attach 3MF.');
      }
    } catch {
      toast.error('Network error while attaching 3MF.');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>Edit Model Details</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Model Name</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Notes / Description</label>
              <textarea
                rows="4"
                className="form-input"
                placeholder="Infill settings, slicing parameters, source notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">
                Source URL <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>(optional)</span>
              </label>
              <input
                type="url"
                className="form-input"
                placeholder="e.g. https://www.printables.com/model/..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {saving && <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={16} />}
              Save Changes
            </button>
          </div>
        </form>

        {/* 3MF attachment section — below the form, separated visually */}
        <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
          <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.5rem' }}>3MF File</div>
          {model.threeMfFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--md-sys-color-outline)' }}>
              <CheckCircle size={14} style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.threeMfFile.fileName}</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', flex: 1 }}>No .3mf attached</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={13} /> Attach .3mf
              </button>
            </div>
          )}

          {threeMfFile && (
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
              <span style={{ flex: 1, color: 'var(--md-sys-color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {threeMfFile.name}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}
                onClick={handleAttach3MF}
                disabled={attaching}
              >
                {attaching ? <RotateCw size={13} style={{ animation: 'spin 1.5s linear infinite' }} /> : <Paperclip size={13} />}
                {attaching ? 'Attaching…' : 'Confirm Attach'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', flexShrink: 0 }}
                onClick={() => { setThreeMfFile(null); fileInputRef.current.value = ''; }}
              >
                <X size={13} />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".3mf"
            style={{ display: 'none' }}
            onChange={(e) => setThreeMfFile(e.target.files[0] || null)}
          />
        </div>
      </div>
    </div>
  );
}
