import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PeriodType, PeriodDateRanges } from '../utils/dateCalculations';
import { calculatePeriodDateRanges } from '../utils/dateCalculations';

export interface StoredStore {
  id: string;
  name: string;
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

  // Actions
  setPeriod: (period: PeriodType) => void;
  setCustomDates: (start: Date, end: Date) => void;
  fetchStores: () => Promise<void>;
  toggleStore: (storeId: string) => void;
  selectAllStores: () => void;
  clearStores: () => void;
  setStores: (storeIds: string[]) => void;
}

// Specific default stores as requested
const DEFAULT_STORE_NAMES = [
  'Rockwell',
  'OPUS',
  'Greenhills',
  'Magnolia',
  'North Edsa',
  'Fairview'
];

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedPeriod: '1D',
      customDateRange: undefined,
      stores: [],
      selectedStores: [],
      isAllStoresSelected: false, // Default to false to use specific defaults
      dateRanges: calculatePeriodDateRanges('1D'),

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
          let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          // Sanitize URL: remove trailing slash and /api/v1 if present
          apiUrl = apiUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '');
          const response = await fetch(`${apiUrl}/api/v1/analytics/stores`);
          if (!response.ok) throw new Error('Failed to fetch stores');

          const stores: StoredStore[] = await response.json();
          set({ stores });

          // Logic for setting default selection on first load
          const currentState = get();

          // If no stores are currently selected and "all selected" is false, apply defaults
          if (currentState.selectedStores.length === 0 && !currentState.isAllStoresSelected) {
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
    }),
    {
      name: 'dashboard-storage', // localStorage key
      partialize: (state) => ({
        selectedPeriod: state.selectedPeriod,
        selectedStores: state.selectedStores,
        isAllStoresSelected: state.isAllStoresSelected,
      }),
    }
  )
);
