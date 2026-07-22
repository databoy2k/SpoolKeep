import { ArrowLeft, Save } from 'lucide-react';
import FilamentDefaultsSection from './FilamentDefaultsSection';

export default function FilamentDefaultsPage({
  onBack,
  onSave,
  saving = false,
  ...sectionProps
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Save size={16} />
          {saving ? 'Saving…' : 'Save Defaults'}
        </button>
      </div>

      <h1 style={{ fontSize: '1.6rem', fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
        Filament Profiles
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-outline)' }}>
        Baselines and database matching for the OrcaSlicer presets SpoolKeep exports.
      </p>

      <FilamentDefaultsSection {...sectionProps} />
    </div>
  );
}
