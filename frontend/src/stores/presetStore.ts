/**
 * Preset Store
 *
 * Zustand store for managing preset state
 */

import { create } from 'zustand';
import type { ReportPreset, PresetConfig } from '../types/preset';
import { DEFAULT_PRESET_CONFIG as DEFAULT_CONFIG } from '../types/preset';
import * as presetApi from '../services/presetApi';

interface PresetState {
  // State
  presets: ReportPreset[];
  activePreset: ReportPreset | null;
  defaultPresetId: number | null;
  isLoading: boolean;
  error: string | null;

  // Current configuration (not yet saved)
  currentConfig: PresetConfig;

  // Actions
  loadPresets: (reportType?: string) => Promise<void>;
  selectPreset: (preset: ReportPreset) => void;
  createPreset: (name: string, isDefault?: boolean) => Promise<ReportPreset>;
  updatePreset: (presetId: number, name?: string, config?: PresetConfig, isDefault?: boolean) => Promise<void>;
  deletePreset: (presetId: number) => Promise<void>;
  setDefaultPreset: (presetId: number) => Promise<void>;
  updateCurrentConfig: (config: Partial<PresetConfig>) => void;
  resetCurrentConfig: () => void;
  clearActivePreset: () => void;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  // Initial state
  presets: [],
  activePreset: null,
  defaultPresetId: null,
  isLoading: false,
  error: null,
  currentConfig: DEFAULT_CONFIG,

  // Load all presets
  loadPresets: async (reportType?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await presetApi.fetchPresets(reportType);
      set({
        presets: response.presets,
        defaultPresetId: response.default_preset_id,
        isLoading: false,
      });

      // If there's a default preset and no active preset, set it as active
      if (response.default_preset_id && !get().activePreset) {
        const defaultPreset = response.presets.find(p => p.id === response.default_preset_id);
        if (defaultPreset) {
          get().selectPreset(defaultPreset);
        }
      }
    } catch (error: any) {
      set({ error: error.message || 'Failed to load presets', isLoading: false });
    }
  },

  // Select and activate a preset
  selectPreset: (preset: ReportPreset) => {
    // Migrate old column configuration if needed
    const config = { ...preset.config };
    const oldColumns: any = config.columns;

    // Check if this preset has old column names and migrate them
    if (oldColumns && ('inventory_store_a' in oldColumns || 'inventory_store_b' in oldColumns || 'comparison_stores' in oldColumns)) {
      const compValue = oldColumns.comparison_stores ?? true;
      config.columns = {
        category: oldColumns.category ?? true,
        product_name: oldColumns.product_name ?? true,
        sku: oldColumns.sku ?? true,
        product_id: oldColumns.product_id ?? true,
        quantity_sold: oldColumns.quantity_sold ?? true,
        revenue: oldColumns.revenue ?? true,
        inventory_sales_store: oldColumns.inventory_store_a ?? true,
        comparison_qty_sold: oldColumns.comparison_qty_sold ?? compValue,
        comparison_inventory: oldColumns.comparison_inventory ?? compValue,
        comparison_revenue: oldColumns.comparison_revenue ?? compValue,
        comparison_variance: oldColumns.comparison_variance ?? compValue,
      };
    }

    // Ensure comparison fields exist (for presets created before these fields were added)
    if (config.columns) {
      const cols = config.columns as any;
      const compValue = cols.comparison_stores ?? true;
      if (!('comparison_qty_sold' in config.columns)) {
        cols.comparison_qty_sold = compValue;
      }
      if (!('comparison_inventory' in config.columns)) {
        cols.comparison_inventory = compValue;
      }
      if (!('comparison_revenue' in config.columns)) {
        cols.comparison_revenue = compValue;
      }
      if (!('comparison_variance' in config.columns)) {
        cols.comparison_variance = compValue;
      }
      // Remove old comparison_stores field if it exists
      delete cols.comparison_stores;
    }

    // Migrate old compare_store_id to compare_store_ids
    if ((config as any).compare_store_id && !config.compare_store_ids) {
      config.compare_store_ids = [(config as any).compare_store_id];
      delete (config as any).compare_store_id;
    }

    set({
      activePreset: preset,
      currentConfig: config,
    });
  },

  // Create a new preset from current configuration
  createPreset: async (name: string, isDefault = false) => {
    set({ isLoading: true, error: null });
    try {
      const newPreset = await presetApi.createPreset({
        name,
        report_type: 'product-sales',
        config: get().currentConfig,
        is_default: isDefault,
      });

      set(state => ({
        presets: [...state.presets, newPreset],
        activePreset: newPreset,
        defaultPresetId: isDefault ? newPreset.id : state.defaultPresetId,
        isLoading: false,
      }));

      return newPreset;
    } catch (error: any) {
      set({ error: error.message || 'Failed to create preset', isLoading: false });
      throw error;
    }
  },

  // Update an existing preset
  updatePreset: async (presetId: number, name?: string, config?: PresetConfig, isDefault?: boolean) => {
    set({ isLoading: true, error: null });
    try {
      const updatedPreset = await presetApi.updatePreset(presetId, {
        name,
        config,
        is_default: isDefault,
      });

      set(state => ({
        presets: state.presets.map(p => (p.id === presetId ? updatedPreset : p)),
        activePreset: state.activePreset?.id === presetId ? updatedPreset : state.activePreset,
        defaultPresetId: isDefault ? updatedPreset.id : state.defaultPresetId,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message || 'Failed to update preset', isLoading: false });
      throw error;
    }
  },

  // Delete a preset
  deletePreset: async (presetId: number) => {
    set({ isLoading: true, error: null });
    try {
      await presetApi.deletePreset(presetId);

      set(state => ({
        presets: state.presets.filter(p => p.id !== presetId),
        activePreset: state.activePreset?.id === presetId ? null : state.activePreset,
        defaultPresetId: state.defaultPresetId === presetId ? null : state.defaultPresetId,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message || 'Failed to delete preset', isLoading: false });
      throw error;
    }
  },

  // Set a preset as default
  setDefaultPreset: async (presetId: number) => {
    set({ isLoading: true, error: null });
    try {
      const updatedPreset = await presetApi.setDefaultPreset(presetId);

      set(state => ({
        presets: state.presets.map(p => ({
          ...p,
          is_default: p.id === presetId,
        })),
        defaultPresetId: presetId,
        activePreset: state.activePreset?.id === presetId ? updatedPreset : state.activePreset,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message || 'Failed to set default preset', isLoading: false });
      throw error;
    }
  },

  // Update current configuration (not saved to preset yet)
  updateCurrentConfig: (config: Partial<PresetConfig>) => {
    set(state => ({
      currentConfig: {
        ...state.currentConfig,
        ...config,
        columns: config.columns ? { ...state.currentConfig.columns, ...config.columns } : state.currentConfig.columns,
        filters: config.filters ? { ...state.currentConfig.filters, ...config.filters } : state.currentConfig.filters,
      },
    }));
  },

  // Reset current configuration to default
  resetCurrentConfig: () => {
    set({ currentConfig: DEFAULT_CONFIG, activePreset: null });
  },

  // Clear active preset (keep current config)
  clearActivePreset: () => {
    set({ activePreset: null });
  },
}));
