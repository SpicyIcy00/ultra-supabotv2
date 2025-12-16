import React, { useState, useRef, useEffect } from 'react';
import { usePresetStore } from '../stores/presetStore';

interface PresetSelectorProps {
  onSaveClick: () => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({ onSaveClick }) => {
  const {
    presets,
    activePreset,
    defaultPresetId,
    isLoading,
    selectPreset,
    deletePreset,
    setDefaultPreset,
    updatePreset,
    resetCurrentConfig,
  } = usePresetStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showActions, setShowActions] = useState<number | null>(null);
  const [renamingPreset, setRenamingPreset] = useState<number | null>(null);
  const [renameName, setRenameName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowActions(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPreset = (presetId: number) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      selectPreset(preset);
      setIsOpen(false);
    }
  };

  const handleDelete = async (presetId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this preset?')) {
      try {
        await deletePreset(presetId);
        setShowActions(null);
      } catch (error) {
        console.error('Failed to delete preset:', error);
      }
    }
  };

  const handleSetDefault = async (presetId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await setDefaultPreset(presetId);
      setShowActions(null);
    } catch (error) {
      console.error('Failed to set default preset:', error);
    }
  };

  const handleRename = (presetId: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPreset(presetId);
    setRenameName(currentName);
    setShowActions(null);
  };

  const handleRenameSubmit = async (presetId: number) => {
    if (!renameName.trim()) return;

    try {
      await updatePreset(presetId, renameName);
      setRenamingPreset(null);
      setRenameName('');
    } catch (error) {
      console.error('Failed to rename preset:', error);
    }
  };

  const handleRenameCancel = () => {
    setRenamingPreset(null);
    setRenameName('');
  };

  const handleNewPreset = () => {
    resetCurrentConfig();
    setIsOpen(false);
    onSaveClick();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Preset
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-left hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        <span>
          {activePreset ? (
            <>
              {activePreset.name}
              {activePreset.is_default && (
                <span className="ml-2 text-yellow-400">⭐</span>
              )}
            </>
          ) : (
            'Select or create preset...'
          )}
        </span>
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto overflow-x-visible">
          {/* Create New Option */}
          <button
            onClick={handleNewPreset}
            className="w-full px-4 py-3 text-left hover:bg-gray-600 text-blue-400 font-medium flex items-center gap-2 border-b border-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Preset
          </button>

          {/* Preset List */}
          {isLoading ? (
            <div className="px-4 py-3 text-gray-400 text-sm flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading presets...
            </div>
          ) : presets.length === 0 ? (
            <div className="px-4 py-3 text-gray-400 text-sm">
              No presets yet. Create your first preset!
            </div>
          ) : (
            presets.map((preset) => (
              <div
                key={preset.id}
                className={`relative overflow-visible ${
                  activePreset?.id === preset.id ? 'bg-gray-600' : 'hover:bg-gray-600'
                }`}
              >
                {renamingPreset === preset.id ? (
                  <div className="px-4 py-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(preset.id);
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                      className="flex-1 px-2 py-1 bg-gray-700 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRenameSubmit(preset.id)}
                      className="p-1 text-green-400 hover:bg-gray-500 rounded"
                      title="Save"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleRenameCancel}
                      className="p-1 text-red-400 hover:bg-gray-500 rounded"
                      title="Cancel"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelectPreset(preset.id)}
                    className="w-full px-4 py-3 text-left flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {preset.name}
                      {preset.is_default && (
                        <span className="text-yellow-400 text-sm">⭐</span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActions(showActions === preset.id ? null : preset.id);
                      }}
                      className="p-1 hover:bg-gray-500 rounded"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                  </button>
                )}

                {/* Actions Menu */}
                {showActions === preset.id && !renamingPreset && (
                  <div className="absolute right-4 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 min-w-[150px]">
                    <button
                      onClick={(e) => handleRename(preset.id, preset.name, e)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-blue-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Rename
                    </button>
                    {!preset.is_default && (
                      <button
                        onClick={(e) => handleSetDefault(preset.id, e)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-yellow-400"
                      >
                        <span>⭐</span>
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(preset.id, e)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-red-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
