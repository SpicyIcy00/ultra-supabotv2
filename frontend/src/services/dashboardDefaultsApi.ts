/**
 * Dashboard Defaults API
 *
 * Which stores / vending machines are pre-selected on the dashboard. Stored
 * server-side so the Settings choice applies on every device, not just the
 * browser that saved it.
 */
import axios from 'axios';

const API_BASE = '/api/v1/dashboard-defaults';

export type DefaultsScope = 'stores' | 'vending';

export interface DashboardDefaultsConfig {
  stores: string[];   // store ids
  vending: string[];  // device codes
  updated_at: string | null;
}

export const getDashboardDefaults = async (): Promise<DashboardDefaultsConfig> => {
  const response = await axios.get<DashboardDefaultsConfig>(API_BASE);
  return response.data;
};

export const updateDashboardDefaults = async (
  scope: DefaultsScope,
  itemIds: string[]
): Promise<DashboardDefaultsConfig> => {
  const response = await axios.put<DashboardDefaultsConfig>(API_BASE, {
    scope,
    item_ids: itemIds,
  });
  return response.data;
};
