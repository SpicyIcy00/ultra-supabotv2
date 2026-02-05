import React, { useState, useEffect } from 'react';
import { Store, Plus, X, Save, RefreshCw } from 'lucide-react';
import { getStoreFilters, updateStoreFilters, getAvailableStores } from '../services/storeFiltersApi';
import type { StoreFilterConfig } from '../types/storeFilters';

export const StoreFiltersPage: React.FC = () => {
  const [config, setConfig] = useState<StoreFilterConfig>({ sales_stores: [], inventory_stores: [] });
  const [availableStores, setAvailableStores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [filtersData, storesData] = await Promise.all([
        getStoreFilters(),
        getAvailableStores()
      ]);
      setConfig(filtersData);
      setAvailableStores(storesData.stores);
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load store filters');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.sales_stores.length || !config.inventory_stores.length) {
      setError('Both lists must have at least one store');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateStoreFilters(config);
      setSuccess('Store filters saved successfully!');
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save store filters');
    } finally {
      setSaving(false);
    }
  };

  const addStore = (type: 'sales' | 'inventory', storeName: string) => {
    if (!storeName) return;

    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';
    if (config[key].includes(storeName)) return;

    setConfig(prev => ({
      ...prev,
      [key]: [...prev[key], storeName]
    }));
    setHasChanges(true);
  };

  const removeStore = (type: 'sales' | 'inventory', storeName: string) => {
    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';

    setConfig(prev => ({
      ...prev,
      [key]: prev[key].filter(s => s !== storeName)
    }));
    setHasChanges(true);
  };

  const getUnselectedStores = (type: 'sales' | 'inventory') => {
    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';
    return availableStores.filter(s => !config[key].includes(s));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1117] p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Loading store filters...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1117] p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Store className="w-8 h-8 text-blue-400" />
              AI Chat Store Filters
            </h1>
            <p className="text-gray-400">
              Configure which stores are included in AI Chat queries by default
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-600/50 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg text-green-300">
            {success}
          </div>
        )}

        {/* Info Box */}
        <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-blue-400 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-300 mb-1">How Store Filtering Works</h4>
              <p className="text-xs text-blue-200/70">
                When users ask questions in AI Chat, these filters are automatically applied unless they specify a particular store.
                Sales queries use the "Sales Stores" list, while inventory queries include the "Inventory Stores" list.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Stores */}
          <StoreFilterSection
            title="Sales Stores"
            description="Stores included in sales, revenue, and transaction queries"
            stores={config.sales_stores}
            availableStores={getUnselectedStores('sales')}
            onAdd={(store) => addStore('sales', store)}
            onRemove={(store) => removeStore('sales', store)}
            color="purple"
          />

          {/* Inventory Stores */}
          <StoreFilterSection
            title="Inventory Stores"
            description="Stores included in stock and inventory queries (includes warehouse)"
            stores={config.inventory_stores}
            availableStores={getUnselectedStores('inventory')}
            onAdd={(store) => addStore('inventory', store)}
            onRemove={(store) => removeStore('inventory', store)}
            color="green"
          />
        </div>
      </div>
    </div>
  );
};

interface StoreFilterSectionProps {
  title: string;
  description: string;
  stores: string[];
  availableStores: string[];
  onAdd: (store: string) => void;
  onRemove: (store: string) => void;
  color: 'purple' | 'green';
}

const StoreFilterSection: React.FC<StoreFilterSectionProps> = ({
  title,
  description,
  stores,
  availableStores,
  onAdd,
  onRemove,
  color
}) => {
  const [selectedStore, setSelectedStore] = useState('');

  const handleAdd = () => {
    if (selectedStore) {
      onAdd(selectedStore);
      setSelectedStore('');
    }
  };

  const borderColor = color === 'purple' ? 'border-purple-600/30' : 'border-green-600/30';
  const headerBg = color === 'purple' ? 'bg-purple-900/20' : 'bg-green-900/20';
  const tagBg = color === 'purple' ? 'bg-purple-900/40' : 'bg-green-900/40';
  const tagBorder = color === 'purple' ? 'border-purple-600/30' : 'border-green-600/30';
  const tagText = color === 'purple' ? 'text-purple-200' : 'text-green-200';

  return (
    <div className={`bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className={`p-4 ${headerBg} border-b ${borderColor}`}>
        <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
        <p className="text-sm text-gray-400">{description}</p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Add Store */}
        <div className="flex gap-2">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="flex-1 bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select a store to add...</option>
            {availableStores.map((store) => (
              <option key={store} value={store}>{store}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedStore}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Store List */}
        <div className="space-y-2">
          {stores.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No stores added</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stores.map((store) => (
                <div
                  key={store}
                  className={`flex items-center gap-2 px-3 py-1.5 ${tagBg} border ${tagBorder} rounded-full ${tagText} text-sm`}
                >
                  <span>{store}</span>
                  <button
                    onClick={() => onRemove(store)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <div className="text-xs text-gray-500 pt-2 border-t border-[#2e303d]">
          {stores.length} store{stores.length !== 1 ? 's' : ''} selected
        </div>
      </div>
    </div>
  );
};
