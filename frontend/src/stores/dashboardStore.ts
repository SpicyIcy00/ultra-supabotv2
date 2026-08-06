import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PeriodType, PeriodDateRanges } from '../utils/dateCalculations';
import { calculatePeriodDateRanges } from '../utils/dateCalculations';
import { getDashboardDefaults } from '../services/dashboardDefaultsApi';

export interface StoredStore {
  id: string;
  name: string;           // raw DB name — never changed, used in all queries
  display_name?: string | null; // UI-only label
  color?: string | null;        // hex color e.g. '#E74C3C'
}

interface DashboardState {
  // Selected period
  selectedPeriod: PeriodType;

  // Custom date range for CUSTOM period
  customDateRange?: { start: Date; end: Date };

  // Available stores fetched from API
  stores: StoredStore[];

  // Selected stores (store IDs)
  selectedStores: string[];

  // Is all stores selected
  isAllStoresSelected: boolean;

  // Calculated date ranges
  dateRanges: PeriodDateRanges;

  // Version of the server-side defaults this browser has already applied.
  // Lets a Settings change propagate once to each device without overriding
  // the selection a user makes during a session.
  appliedDefaultsAt?: string | null;

  // Actions
  setPeriod: (period: PeriodType) => void;
  setCustomDates: (start: Date, end: Date) => void;
  fetchStores: () => Promise<void>;
  toggleStore: (storeId: string) => void;
  selectAllStores: () => void;
  clearStores: () => void;
  setStores: (storeIds: string[]) => void;
  // Display name helpers — read from store.display_name (DB), never from localStorage
  getStoreName: (storeId: string) => string;
  getStoreNameByDbName: (dbName: string) => string;
  // Color helpers — read from store.color (DB), fall back to default
  getStoreColorById: (storeId: string) => string;
  getStoreColorByDbName: (dbName: string) => string;
}

// Specific default stores as requested
const DEFAULT_STORE_NAMES = [
  'Rockwell',
  'Greenhills',
  'Magnolia',
  'North Edsa',
  'Fairview',
  'Opus'
];

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedPeriod: 'TODAY',
      customDateRange: undefined,
      stores: [],
      selectedStores: [],
      isAllStoresSelected: false, // Default to false to use specific defaults
      dateRanges: calculatePeriodDateRanges('TODAY'),

      // Set period and recalculate date ranges
      setPeriod: (period: PeriodType) => {
        if (period === 'CUSTOM') {
          // For CUSTOM, wait for dates to be set
          set({ selectedPeriod: period });
        } else {
          const dateRanges = calculatePeriodDateRanges(period);
          set({
            selectedPeriod: period,
            dateRanges,
            customDateRange: undefined,
          });
        }
      },

      // Set custom dates and recalculate ranges
      setCustomDates: (start: Date, end: Date) => {
        const dateRanges = calculatePeriodDateRanges('CUSTOM', start, end);
        set({
          selectedPeriod: 'CUSTOM',
          customDateRange: { start, end },
          dateRanges,
        });
      },

      // Fetch stores from API
      fetchStores: async () => {
        try {
          // Use relative URL to leverage Vercel rewrite proxy (avoids CORS)
          const apiUrl = '/api/v1';
          const response = await fetch(`${apiUrl}/analytics/stores`);
          if (!response.ok) throw new Error('Failed to fetch stores');

          const stores: StoredStore[] = await response.json();
          set({ stores });

          const currentState = get();
          const hasSelection = currentState.selectedStores.length > 0;

          // Server-side defaults from Settings. Applied when this browser has
          // no selection yet (a new device) or when the saved defaults changed
          // since this browser last applied them.
          let serverDefaults: string[] = [];
          let serverVersion: string | null = null;
          try {
            const config = await getDashboardDefaults();
            serverDefaults = config.stores.filter(id => stores.some(s => s.id === id));
            serverVersion = config.updated_at;
          } catch (error) {
            console.warn('Could not load dashboard defaults, using local selection:', error);
          }

          const defaultsChanged =
            !!serverVersion && serverVersion !== currentState.appliedDefaultsAt;

          if (serverDefaults.length > 0 && (!hasSelection || defaultsChanged)) {
            set({
              selectedStores: serverDefaults,
              isAllStoresSelected: serverDefaults.length === stores.length,
              appliedDefaultsAt: serverVersion,
            });
            return;
          }

          // Nothing configured server-side: fall back to the built-in defaults,
          // but only for a browser that has no selection at all.
          if (!hasSelection && !currentState.isAllStoresSelected) {
            const defaultStoreIds = stores
              .filter(store => DEFAULT_STORE_NAMES.includes(store.name))
              .map(store => store.id);

            // Only set if we found matching stores
            if (defaultStoreIds.length > 0) {
              set({ selectedStores: defaultStoreIds });
            } else {
              // Fallback: if no defaults match, select all (safety net)
              set({
                selectedStores: stores.map(s => s.id),
                isAllStoresSelected: true
              });
            }
          }
        } catch (error) {
          console.error('Error fetching stores:', error);
        }
      },

      // Toggle individual store selection
      toggleStore: (storeId: string) => {
        const { selectedStores, stores } = get();
        const isSelected = selectedStores.includes(storeId);

        let newSelectedStores: string[];

        if (isSelected) {
          // Remove store
          newSelectedStores = selectedStores.filter((id) => id !== storeId);
        } else {
          // Add store
          newSelectedStores = [...selectedStores, storeId];
        }

        // Check if all stores are selected
        const isAllSelected = newSelectedStores.length > 0 && newSelectedStores.length === stores.length;

        set({
          selectedStores: newSelectedStores,
          isAllStoresSelected: isAllSelected,
        });
      },

      // Select all stores
      selectAllStores: () => {
        const { stores } = get();
        set({
          selectedStores: stores.map(s => s.id),
          isAllStoresSelected: true,
        });
      },

      // Clear all stores
      clearStores: () => {
        set({
          selectedStores: [],
          isAllStoresSelected: false,
        });
      },

      // Set specific stores
      setStores: (storeIds: string[]) => {
        const { stores } = get();
        const isAllSelected = storeIds.length > 0 && storeIds.length === stores.length;
        set({
          selectedStores: storeIds,
          isAllStoresSelected: isAllSelected,
        });
      },

      // Resolve display name by store ID (uses store.display_name from DB, falls back to store.name)
      getStoreName: (storeId: string) => {
        const store = get().stores.find(s => s.id === storeId);
        return store?.display_name || store?.name || storeId;
      },

      // Resolve display name when only the raw DB name string is available
      getStoreNameByDbName: (dbName: string) => {
        const store = get().stores.find(s => s.name === dbName);
        return store?.display_name || dbName;
      },

      // Resolve color by store ID (uses store.color from DB, falls back to default)
      getStoreColorById: (storeId: string) => {
        const store = get().stores.find(s => s.id === storeId);
        return store?.color || '#00d2ff';
      },

      // Resolve color by raw DB name
      getStoreColorByDbName: (dbName: string) => {
        const store = get().stores.find(s => s.name === dbName);
        return store?.color || '#00d2ff';
      },
    }),
    {
      name: 'dashboard-storage', // localStorage key
      partialize: (state) => ({
        selectedPeriod: state.selectedPeriod,
        stores: state.stores,
        selectedStores: state.selectedStores,
        isAllStoresSelected: state.isAllStoresSelected,
        appliedDefaultsAt: state.appliedDefaultsAt,
      }),
    }
  )
);
