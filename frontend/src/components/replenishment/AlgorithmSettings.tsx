import React, { useState, useEffect } from 'react';
import { getAlgorithmSettings, updateAlgorithmSettings } from '../../services/replenishmentApi';
import type { AlgorithmSettings as AlgorithmSettingsType } from '../../types/replenishment';

const DEFAULTS: AlgorithmSettingsType = {
  snapshot_enabled: true,
  snapshot_required_days: 28,
  stockout_buffer_weekday_pct: 20,
  stockout_buffer_weekend_pct: 10,
  priority_velocity_weight: 0.6,
  priority_stockout_weight: 0.4,
  overstock_threshold_days: 120,
  critical_stock_threshold_days: 3,
};

interface NumberField {
  type: 'number';
  key: keyof AlgorithmSettingsType;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

interface ToggleField {
  type: 'toggle';
  key: keyof AlgorithmSettingsType;
  label: string;
  description: string;
  onLabel?: string;
  offLabel?: string;
}

type FieldConfig = NumberField | ToggleField;

const SECTIONS: { title: string; subtitle: string; fields: FieldConfig[] }[] = [
  {
    title: 'Data Mode',
    subtitle: 'Controls whether snapshot-based or transaction-based sales calculation is used.',
    fields: [
      {
        type: 'toggle',
        key: 'snapshot_enabled',
        label: 'Snapshot Mode',
        description: 'When on, uses daily inventory snapshots to exclude stockout days from the sales average — more accurate. When off, always uses transaction-based fallback.',
        onLabel: 'Enabled',
        offLabel: 'Disabled (Fallback)',
      },
      {
        type: 'number',
        key: 'snapshot_required_days',
        label: 'Snapshot Days Required',
        description: 'Minimum days of snapshot history needed to activate snapshot mode.',
        min: 1, max: 90, step: 1, suffix: 'days',
      },
    ],
  },
  {
    title: 'Stockout Buffer',
    subtitle: 'Extra quantity added when a stockout is predicted within the review window.',
    fields: [
      {
        type: 'number',
        key: 'stockout_buffer_weekday_pct',
        label: 'Weekday Buffer (Mon–Fri)',
        description: 'Extra % added when stockout is predicted on a weekday.',
        min: 0, max: 100, step: 1, suffix: '%',
      },
      {
        type: 'number',
        key: 'stockout_buffer_weekend_pct',
        label: 'Weekend Buffer (Sat–Sun)',
        description: 'Extra % added when stockout is predicted on a weekend day.',
        min: 0, max: 100, step: 1, suffix: '%',
      },
    ],
  },
  {
    title: 'Priority Weights',
    subtitle: 'Ranks store-SKU pairs when warehouse stock is scarce. Weights should sum to 1.0.',
    fields: [
      {
        type: 'number',
        key: 'priority_velocity_weight',
        label: 'Velocity Weight',
        description: 'Weight given to sales velocity. Higher = prefer high-sellers.',
        min: 0, max: 1, step: 0.05,
      },
      {
        type: 'number',
        key: 'priority_stockout_weight',
        label: 'Stockout Risk Weight',
        description: 'Weight given to stockout urgency (1 ÷ days of stock). Higher = prefer items nearly empty.',
        min: 0, max: 1, step: 0.05,
      },
    ],
  },
  {
    title: 'Exception Thresholds',
    subtitle: 'Thresholds that trigger exception flags on the Exceptions tab.',
    fields: [
      {
        type: 'number',
        key: 'overstock_threshold_days',
        label: 'Overstock Threshold',
        description: 'Items with more than this many days of stock are flagged as overstock.',
        min: 1, max: 3650, step: 1, suffix: 'days',
      },
      {
        type: 'number',
        key: 'critical_stock_threshold_days',
        label: 'Critical Stock Threshold',
        description: 'Items with fewer than this many days of stock are flagged as critical.',
        min: 0, max: 30, step: 1, suffix: 'days',
      },
    ],
  },
];

export const AlgorithmSettings: React.FC = () => {
  const [settings, setSettings] = useState<AlgorithmSettingsType>(DEFAULTS);
  const [draft, setDraft] = useState<AlgorithmSettingsType>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAlgorithmSettings();
      setSettings(data);
      setDraft(data);
    } catch {
      setError('Failed to load algorithm settings.');
    } finally {
      setLoading(false);
    }
  };

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const handleNumber = (key: keyof AlgorithmSettingsType, raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) setDraft((prev) => ({ ...prev, [key]: num }));
  };

  const handleToggle = (key: keyof AlgorithmSettingsType) => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReset = () => { setDraft(settings); setError(null); };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { updated_at, ...payload } = draft;
      const result = await updateAlgorithmSettings(payload);
      setSettings(result);
      setDraft(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const weightSum = (draft.priority_velocity_weight + draft.priority_stockout_weight).toFixed(2);
  const weightWarning = parseFloat(weightSum) !== 1.0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Algorithm Settings</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Controls the replenishment calculation engine. Changes take effect on the next run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button onClick={handleReset}
              className="px-3 py-1.5 text-xs text-gray-400 border border-[#2e303d] rounded-lg hover:text-white hover:border-gray-500 transition-colors">
              Reset
            </button>
          )}
          <button onClick={handleSave} disabled={!isDirty || saving}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saved && (
        <div className="bg-green-900/30 border border-green-600/50 rounded-lg px-4 py-3">
          <p className="text-green-400 text-sm">Settings saved. They will apply on the next replenishment run.</p>
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {weightWarning && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg px-4 py-3">
          <p className="text-yellow-400 text-sm">
            Priority weights sum to <strong>{weightSum}</strong> — they should sum to 1.0.
          </p>
        </div>
      )}

      {/* Sections */}
      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2e303d]">
            <h3 className="text-sm font-semibold text-white">{section.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{section.subtitle}</p>
          </div>
          <div className="divide-y divide-[#2e303d]">
            {section.fields.map((field) => {
              const value = draft[field.key];
              const original = settings[field.key];
              const changed = value !== original;

              return (
                <div key={String(field.key)} className="px-5 py-4 flex items-center gap-4">
                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-200">{field.label}</p>
                      {changed && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400">modified</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{field.description}</p>
                    {changed && field.type === 'number' && (
                      <p className="text-xs text-gray-600 mt-1">
                        Was: <span className="text-gray-400">{original as number}{(field as NumberField).suffix ? ` ${(field as NumberField).suffix}` : ''}</span>
                      </p>
                    )}
                  </div>

                  {/* Control — fixed width so all inputs align */}
                  <div className="shrink-0 w-36 flex items-center justify-end gap-2">
                    {field.type === 'toggle' ? (
                      <button
                        onClick={() => handleToggle(field.key)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          value ? 'bg-blue-600' : 'bg-[#2e303d]'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          value ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={(field as NumberField).min}
                          max={(field as NumberField).max}
                          step={(field as NumberField).step}
                          value={value as number}
                          onChange={(e) => handleNumber(field.key, e.target.value)}
                          className="w-20 bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none text-right tabular-nums"
                        />
                        <span className="text-xs text-gray-500 w-8 text-left">
                          {(field as NumberField).suffix ?? ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {settings.updated_at && (
        <p className="text-xs text-gray-600">
          Last saved: {new Date(settings.updated_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
};

export default AlgorithmSettings;
