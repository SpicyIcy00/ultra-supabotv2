import React, { useState, useEffect } from 'react';
import { getAlgorithmSettings, updateAlgorithmSettings } from '../../services/replenishmentApi';
import type { AlgorithmSettings as AlgorithmSettingsType } from '../../types/replenishment';

const DEFAULTS: AlgorithmSettingsType = {
  review_period_days: 7,
  lead_time_days: 2,
  snapshot_required_days: 28,
  stockout_buffer_weekday_pct: 20,
  stockout_buffer_weekend_pct: 10,
  priority_velocity_weight: 0.6,
  priority_stockout_weight: 0.4,
  overstock_threshold_days: 120,
  critical_stock_threshold_days: 3,
};

interface FieldConfig {
  key: keyof AlgorithmSettingsType;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

const SECTIONS: { title: string; subtitle: string; fields: FieldConfig[] }[] = [
  {
    title: 'Planning Cycle',
    subtitle: 'Core timing parameters used in every calculation run.',
    fields: [
      {
        key: 'review_period_days',
        label: 'Review Period',
        description: 'How many days ahead each run plans for. Orders cover stock until the next run.',
        min: 1, max: 30, step: 1, suffix: 'days',
      },
      {
        key: 'lead_time_days',
        label: 'Lead Time',
        description: 'Days between placing an order and receiving it at the store. Added to min/max cover targets.',
        min: 0, max: 14, step: 1, suffix: 'days',
      },
      {
        key: 'snapshot_required_days',
        label: 'Snapshot Days Required',
        description: 'Minimum days of inventory snapshot history needed to activate high-accuracy mode.',
        min: 1, max: 90, step: 1, suffix: 'days',
      },
    ],
  },
  {
    title: 'Stockout Buffer',
    subtitle: 'Extra quantity added when a stockout is predicted within the review window.',
    fields: [
      {
        key: 'stockout_buffer_weekday_pct',
        label: 'Weekday Buffer (Mon–Fri)',
        description: 'Extra % added when stockout is predicted on a weekday — entering the weekend without stock.',
        min: 0, max: 100, step: 1, suffix: '%',
      },
      {
        key: 'stockout_buffer_weekend_pct',
        label: 'Weekend Buffer (Sat–Sun)',
        description: 'Extra % added when stockout is predicted on a weekend day.',
        min: 0, max: 100, step: 1, suffix: '%',
      },
    ],
  },
  {
    title: 'Priority Weights',
    subtitle: 'Controls how store-SKU pairs are ranked when warehouse stock is scarce. Weights should sum to 1.0.',
    fields: [
      {
        key: 'priority_velocity_weight',
        label: 'Velocity Weight',
        description: 'Weight given to sales velocity (log scale). Higher = prefer high-sellers.',
        min: 0, max: 1, step: 0.05,
      },
      {
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
        key: 'overstock_threshold_days',
        label: 'Overstock Threshold',
        description: 'Items with more than this many days of stock are flagged as overstock.',
        min: 1, max: 3650, step: 1, suffix: 'days',
      },
      {
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

  useEffect(() => {
    load();
  }, []);

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

  const handleChange = (key: keyof AlgorithmSettingsType, raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      setDraft((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleReset = () => {
    setDraft(settings);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { updated_at, ...payload } = draft;
      const saved = await updateAlgorithmSettings(payload);
      setSettings(saved);
      setDraft(saved);
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
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-gray-400 border border-[#2e303d] rounded-lg hover:text-white hover:border-gray-500 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-[#2e303d] disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
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
            Priority weights sum to <strong>{weightSum}</strong> — they should sum to 1.0 for correct scoring.
          </p>
        </div>
      )}

      {/* Settings Sections */}
      {SECTIONS.map((section) => (
        <div key={section.title} className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2e303d]">
            <h3 className="text-sm font-semibold text-white">{section.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{section.subtitle}</p>
          </div>
          <div className="divide-y divide-[#2e303d]">
            {section.fields.map((field) => {
              const value = draft[field.key] as number;
              const original = settings[field.key] as number;
              const changed = value !== original;
              return (
                <div key={field.key} className="px-5 py-4 flex items-start gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-200">{field.label}</p>
                      {changed && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400">
                          modified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{field.description}</p>
                    {changed && (
                      <p className="text-xs text-gray-600 mt-1">
                        Was: <span className="text-gray-400">{original}{field.suffix ? ` ${field.suffix}` : ''}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-24 bg-[#0e1117] border border-[#2e303d] text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none text-right tabular-nums"
                    />
                    {field.suffix && (
                      <span className="text-xs text-gray-500 w-8">{field.suffix}</span>
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
