import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Store, Plus, X, Save, Pencil, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { getStoreFilters, updateStoreFilters, getAvailableStores } from '../services/storeFiltersApi';
import { updateStoreAppearance } from '../services/storesApi';
import type { StoreFilterConfig } from '../types/storeFilters';
import { useDashboardStore } from '../stores/dashboardStore';

type TabType = 'general' | 'stores';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('general');

  return (
    <div className="min-h-screen bg-[#0e1117] p-6">
      <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your dashboard preferences and data</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#2e303d]">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('stores')}
            className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'stores'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            Store Settings
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'stores' && <StoresSettings />}
      </div>
    </div>
  );
};

// General Settings Tab
const GeneralSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    setShowSuccess(false);
    setShowError(false);

    try {
      await axios.post('/api/v1/analytics/invalidate-cache');
      await queryClient.invalidateQueries();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setShowError(true);
      setTimeout(() => setShowError(false), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Management Section */}
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Data Management</h2>

        <div className="space-y-4">
          <div className="flex items-start justify-between p-4 bg-[#0e1117] rounded-lg border border-[#2e303d]">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-1">Refresh All Data</h3>
              <p className="text-sm text-gray-400">
                Clears both backend (Redis) and frontend (React Query) caches to force a fresh fetch of all
                dashboard data from the database.
              </p>
              <div className="mt-3 text-xs text-gray-500">
                <p>Data cache times:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Dashboard KPIs, Sales, Products: 5 minutes</li>
                  <li>Inventory data: 10 minutes</li>
                  <li>Sales anomalies: 15 minutes</li>
                </ul>
              </div>
            </div>

            <div className="ml-6 flex flex-col items-end gap-2">
              <button
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
              </button>

              {showSuccess && (
                <div className="text-sm text-green-400 font-medium">Data refreshed successfully!</div>
              )}
              {showError && (
                <div className="text-sm text-red-400 font-medium">Error refreshing data.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Combined Store Settings Tab
const StoresSettings: React.FC = () => {
  return (
    <div className="space-y-10">
      {/* ── Section 1: AI Chat Store Filters ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">AI Chat Store Filters</h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure which stores are included in AI Chat queries by default
          </p>
        </div>
        <AiChatStoreFilters />
      </section>

      <div className="border-t border-[#2e303d]" />

      {/* ── Section 2: Dashboard Store Defaults ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">Dashboard Store Defaults</h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure which stores are shown by default across the dashboard
          </p>
        </div>
        <DashboardStoreDefaults />
      </section>

      <div className="border-t border-[#2e303d]" />

      {/* ── Section 3: Store Display Names ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">Store Display Names</h2>
          <p className="text-sm text-gray-400 mt-1">
            Override how store names appear in the UI. DB names and all queries remain unchanged.
          </p>
        </div>
        <StoreDisplayNames />
      </section>
    </div>
  );
};

// ── AI Chat Store Filters (formerly StoreFiltersSettings tab) ──────────────
const AiChatStoreFilters: React.FC = () => {
  const getStoreNameByDbName = useDashboardStore(s => s.getStoreNameByDbName);
  const [config, setConfig] = useState<StoreFilterConfig>({ sales_stores: [], inventory_stores: [] });
  const [availableStores, setAvailableStores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

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
      setError(err.response?.data?.detail || err.message || 'Failed to load store filters');
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
      setError(err.response?.data?.detail || err.message || 'Failed to save store filters');
    } finally {
      setSaving(false);
    }
  };

  const addStore = (type: 'sales' | 'inventory', storeName: string) => {
    if (!storeName) return;
    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';
    if (config[key].includes(storeName)) return;
    setConfig(prev => ({ ...prev, [key]: [...prev[key], storeName] }));
    setHasChanges(true);
  };

  const removeStore = (type: 'sales' | 'inventory', storeName: string) => {
    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';
    setConfig(prev => ({ ...prev, [key]: prev[key].filter(s => s !== storeName) }));
    setHasChanges(true);
  };

  const getUnselectedStores = (type: 'sales' | 'inventory') => {
    const key = type === 'sales' ? 'sales_stores' : 'inventory_stores';
    return availableStores.filter(s => !config[key].includes(s));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-400 py-6">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading store filters...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-600/50 rounded-lg text-red-300">{error}</div>
      )}
      {success && (
        <div className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg text-green-300">{success}</div>
      )}

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
        <StoreFilterSection
          title="Sales Stores"
          description="Stores included in sales, revenue, and transaction queries"
          stores={config.sales_stores}
          availableStores={getUnselectedStores('sales')}
          onAdd={(store) => addStore('sales', store)}
          onRemove={(store) => removeStore('sales', store)}
          color="purple"
          getDisplayName={getStoreNameByDbName}
        />
        <StoreFilterSection
          title="Inventory Stores"
          description="Stores included in stock and inventory queries (includes warehouse)"
          stores={config.inventory_stores}
          availableStores={getUnselectedStores('inventory')}
          onAdd={(store) => addStore('inventory', store)}
          onRemove={(store) => removeStore('inventory', store)}
          color="green"
          getDisplayName={getStoreNameByDbName}
        />
      </div>
    </div>
  );
};

// ── Dashboard Store Defaults (formerly DashboardStoresSettings tab) ─────────
const DashboardStoreDefaults: React.FC = () => {
  const { stores, selectedStores, setStores, fetchStores, getStoreName } = useDashboardStore();
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (stores.length === 0) fetchStores();
  }, []);

  useEffect(() => {
    setLocalSelected(selectedStores);
  }, [selectedStores]);

  const selectedNames = localSelected
    .map(id => stores.find(s => s.id === id)?.name)
    .filter(Boolean) as string[];

  const availableNames = stores
    .filter(s => !localSelected.includes(s.id))
    .map(s => s.name);

  const handleAdd = (name: string) => {
    const store = stores.find(s => s.name === name);
    if (!store) return;
    setLocalSelected(prev => [...prev, store.id]);
    setHasChanges(true);
  };

  const handleRemove = (name: string) => {
    const store = stores.find(s => s.name === name);
    if (!store) return;
    setLocalSelected(prev => prev.filter(id => id !== store.id));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (localSelected.length === 0) return;
    setStores(localSelected);
    setHasChanges(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (stores.length === 0) {
    return (
      <div className="flex items-center gap-3 text-gray-400 py-6">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading stores...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges || localSelected.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          <Save className="w-4 h-4" />
          {success ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {success && (
        <div className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg text-green-300">
          Dashboard store defaults updated successfully!
        </div>
      )}

      <div className="p-4 bg-blue-950/20 border border-blue-900/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="text-blue-400 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-300 mb-1">How Dashboard Stores Work</h4>
            <p className="text-xs text-blue-200/70">
              These stores are pre-selected across all dashboard pages — KPIs, analytics, replenishment, and more.
              You can still change the selection per session using the store picker in the toolbar.
              Saving here updates your persistent default.
            </p>
          </div>
        </div>
      </div>

      <StoreFilterSection
        title="Default Dashboard Stores"
        description="Stores pre-selected on every dashboard page load"
        stores={selectedNames}
        availableStores={availableNames}
        onAdd={handleAdd}
        onRemove={handleRemove}
        color="blue"
        getDisplayName={(name) => {
          const store = stores.find(s => s.name === name);
          return store ? getStoreName(store.id) : name;
        }}
      />
    </div>
  );
};

// ── Store Display Names & Colors ───────────────────────────────────────────
type StoreDraft = { display_name: string; color: string };

const StoreDisplayNames: React.FC = () => {
  const { stores, fetchStores } = useDashboardStore();
  const [drafts, setDrafts] = useState<Record<string, StoreDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stores.length === 0) fetchStores();
  }, []);

  // Seed drafts from DB values whenever stores load/refresh
  useEffect(() => {
    if (stores.length > 0) {
      const initial: Record<string, StoreDraft> = {};
      stores.forEach(s => {
        initial[s.id] = {
          display_name: s.display_name ?? '',
          color: s.color ?? '#00d2ff',
        };
      });
      setDrafts(initial);
    }
  }, [stores.length]);

  const handleChange = (storeId: string, field: keyof StoreDraft, value: string) => {
    setDrafts(prev => ({ ...prev, [storeId]: { ...prev[storeId], [field]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        stores.map(s => {
          const draft = drafts[s.id];
          if (!draft) return Promise.resolve();
          return updateStoreAppearance(s.id, {
            display_name: draft.display_name.trim() || null,
            color: draft.color || null,
          });
        })
      );
      // Refresh store list so Zustand picks up the new display_name/color from DB
      await fetchStores();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (storeId: string) => {
    try {
      await updateStoreAppearance(storeId, { display_name: null, color: null });
      await fetchStores();
      setDrafts(prev => ({ ...prev, [storeId]: { display_name: '', color: '#00d2ff' } }));
    } catch (e: any) {
      setError(e?.message || 'Failed to reset');
    }
  };

  const hasChanges = stores.some(s => {
    const draft = drafts[s.id];
    if (!draft) return false;
    return (
      (draft.display_name.trim() || null) !== (s.display_name || null) ||
      (draft.color || null) !== (s.color || null)
    );
  });

  if (stores.length === 0) {
    return (
      <div className="flex items-center gap-3 text-gray-400 py-6">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading stores...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-600/50 rounded-lg text-red-300">{error}</div>
      )}
      {saved && (
        <div className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg text-green-300">
          Store appearances updated and saved to database!
        </div>
      )}

      <div className="p-4 bg-amber-950/20 border border-amber-900/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="text-amber-400 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-300 mb-1">Display-Only — DB Names Never Change</h4>
            <p className="text-xs text-amber-200/70">
              Changes are saved to the database and apply to all users and the AI Chat.
              All SQL queries, filters, and aggregations continue using the original DB store names.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
        <div className="p-4 bg-[#1a1c24] border-b border-[#2e303d]">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
            <span>DB Store Name (read-only)</span>
            <span>Display Name</span>
            <span>Color</span>
            <span className="w-8" />
          </div>
        </div>

        <div className="divide-y divide-[#2e303d]">
          {stores.map(store => {
            const draft = drafts[store.id] ?? { display_name: '', color: '#00d2ff' };
            const hasOverride = !!(store.display_name || store.color);
            return (
              <div key={store.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 items-center px-4 py-3">
                {/* Raw DB name — never editable */}
                <span className="text-gray-300 text-sm font-mono truncate">{store.name}</span>

                {/* Display name input */}
                <div className="relative flex items-center">
                  <Pencil className="absolute left-3 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={draft.display_name}
                    onChange={e => handleChange(store.id, 'display_name', e.target.value)}
                    placeholder={store.name}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0e1117] border border-[#2e303d] rounded-lg text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Color picker */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.color || '#00d2ff'}
                    onChange={e => handleChange(store.id, 'color', e.target.value)}
                    className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-[#2e303d] p-0.5"
                    title="Pick store color"
                  />
                </div>

                {/* Reset button */}
                <button
                  onClick={() => handleReset(store.id)}
                  disabled={!hasOverride}
                  title="Reset to defaults"
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Shared Store Filter Section Component ──────────────────────────────────
interface StoreFilterSectionProps {
  title: string;
  description: string;
  stores: string[];
  availableStores: string[];
  onAdd: (store: string) => void;
  onRemove: (store: string) => void;
  color: 'purple' | 'green' | 'blue';
  getDisplayName?: (name: string) => string;
}

const StoreFilterSection: React.FC<StoreFilterSectionProps> = ({
  title,
  description,
  stores,
  availableStores,
  onAdd,
  onRemove,
  color,
  getDisplayName,
}) => {
  const label = (name: string) => getDisplayName ? getDisplayName(name) : name;
  const [selectedStore, setSelectedStore] = useState('');

  const handleAdd = () => {
    if (selectedStore) {
      onAdd(selectedStore);
      setSelectedStore('');
    }
  };

  const borderColor = color === 'purple' ? 'border-purple-600/30' : color === 'green' ? 'border-green-600/30' : 'border-blue-600/30';
  const headerBg = color === 'purple' ? 'bg-purple-900/20' : color === 'green' ? 'bg-green-900/20' : 'bg-blue-900/20';
  const tagBg = color === 'purple' ? 'bg-purple-900/40' : color === 'green' ? 'bg-green-900/40' : 'bg-blue-900/40';
  const tagBorder = color === 'purple' ? 'border-purple-600/30' : color === 'green' ? 'border-green-600/30' : 'border-blue-600/30';
  const tagText = color === 'purple' ? 'text-purple-200' : color === 'green' ? 'text-green-200' : 'text-blue-200';

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">
      <div className={`p-4 ${headerBg} border-b ${borderColor}`}>
        <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="flex-1 bg-[#0e1117] border border-[#2e303d] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select a store to add...</option>
            {availableStores.map((store) => (
              <option key={store} value={store}>{label(store)}</option>
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
                  <span>{label(store)}</span>
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

        <div className="text-xs text-gray-500 pt-2 border-t border-[#2e303d]">
          {stores.length} store{stores.length !== 1 ? 's' : ''} selected
        </div>
      </div>
    </div>
  );
};
