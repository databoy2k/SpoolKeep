import { useRef } from 'react';
import { X, FileUp, RotateCw } from 'lucide-react';

function FilePicker({ label, accept, file, onFile, onClear }) {
  const inputRef = useRef(null);

  return (
    <div
      style={{
        flex: 1,
        border: `2px dashed ${file ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
        borderRadius: 'var(--md-shape-corner-medium)',
        padding: '1.25rem 0.75rem',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: file
          ? 'var(--md-sys-color-primary-container)'
          : 'var(--md-sys-color-surface-container-lowest)',
        position: 'relative',
        transition: 'var(--transition-m3)',
        minWidth: 0
      }}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <FileUp size={28} style={{
        color: file ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)',
        marginBottom: '0.5rem'
      }} />

      <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--md-sys-color-on-surface)', marginBottom: '0.2rem' }}>
        {label}
      </p>

      {file ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-primary)', fontWeight: '600', wordBreak: 'break-all' }}>
            {file.name}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--md-sys-color-outline)' }}>
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              marginTop: '0.25rem',
              fontSize: '0.65rem',
              color: 'var(--md-sys-color-error)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0'
            }}
          >
            <X size={11} /> Remove
          </button>
        </div>
      ) : (
        <p style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)' }}>
          Click to select
        </p>
      )}
    </div>
  );
}

export default function UploadPrintFileModal({
  isOpen,
  onClose,
  stlFile,
  setStlFile,
  threeMfFile,
  setThreeMfFile,
  uploadName,
  setUploadName,
  uploadDescription,
  setUploadDescription,
  uploadSourceUrl,
  setUploadSourceUrl,
  isUploading,
  onSubmit
}) {
  if (!isOpen) return null;

  const canSubmit = (stlFile || threeMfFile) && uploadName.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h2>Upload Print File</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>

            {/* Dual file pickers */}
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.6rem' }}>
                Select at least one file — you can add both STL and 3MF for the same model.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <FilePicker
                  label="STL File (optional)"
                  accept=".stl"
                  file={stlFile}
                  onFile={(f) => {
                    setStlFile(f);
                    if (!uploadName) setUploadName(f.name.replace(/\.stl$/i, ''));
                  }}
                  onClear={() => setStlFile(null)}
                />
                <FilePicker
                  label="3MF File (optional)"
                  accept=".3mf"
                  file={threeMfFile}
                  onFile={(f) => {
                    setThreeMfFile(f);
                    if (!uploadName) setUploadName(f.name.replace(/\.3mf$/i, ''));
                  }}
                  onClear={() => setThreeMfFile(null)}
                />
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Model Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Charmander Figure"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label className="form-label">Notes / Description</label>
              <textarea
                rows="3"
                className="form-input"
                placeholder="Infill settings, slicing parameters..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
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
                value={uploadSourceUrl}
                onChange={(e) => setUploadSourceUrl(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isUploading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isUploading || !canSubmit}
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              {isUploading && <RotateCw style={{ animation: 'spin 1.5s linear infinite' }} size={16} />}
              {isUploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
