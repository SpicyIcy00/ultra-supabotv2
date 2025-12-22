import React, { useState } from 'react';
import { usePresetStore } from '../stores/presetStore';

interface PresetSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PresetSaveDialog: React.FC<PresetSaveDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { createPreset, activePreset } = usePresetStore();
  const [presetName, setPresetName] = useState(activePreset?.name || '');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!presetName.trim()) {
      setError('Preset name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // The current config already has the group_by_category setting from the filters panel
      await createPreset(presetName, setAsDefault);

      setPresetName('');
      setSetAsDefault(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setPresetName(activePreset?.name || '');
    setSetAsDefault(false);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Save as Preset
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900 bg-opacity-50 border border-red-600 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Preset Name
            </label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g., Top 50 Products"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
              />
              <span className="text-sm text-gray-300">
                Set as default preset
                {setAsDefault && <span className="ml-2 text-yellow-400">⭐</span>}
              </span>
            </label>
          </div>

          <div className="text-xs text-gray-400 bg-gray-700 bg-opacity-50 p-3 rounded">
            <strong>Note:</strong> This will save your current filter and column visibility settings.
            Store selections and date ranges are not saved in presets.
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={saving || !presetName.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
