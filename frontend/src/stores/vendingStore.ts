import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getVendingMachineColor } from '../constants/colors';
import { getDashboardDefaults } from '../services/dashboardDefaultsApi';

export interface VendingDevice {
  device_code: string;      // raw Weimi code — used in all queries
  device_name: string;      // display label, e.g. "CMG HQ"
  device_id?: string | null;
  cabinet_total?: number | null;
  layer_total?: number | null;
  aisle_total?: number | null;
  last_synced_at?: string | null;
}

interface VendingState {
  // Available machines fetched from API
  devices: VendingDevice[];

  // Selected machines (device codes)
  selectedDevices: string[];

  // Is all machines selected
  isAllDevicesSelected: boolean;

  // Version of the server-side defaults this browser has already applied
  appliedDefaultsAt?: string | null;

  // Actions
  fetchDevices: () => Promise<void>;
  toggleDevice: (deviceCode: string) => void;
  selectAllDevices: () => void;
  setDevices: (deviceCodes: string[]) => void;
  // Display helpers
  getDeviceName: (deviceCode: string) => string;
  getDeviceColor: (deviceCode: string) => string;
}

export const useVendingStore = create<VendingState>()(
  persist(
    (set, get) => ({
      // Initial state
      devices: [],
      selectedDevices: [],
      isAllDevicesSelected: true, // vending fleet is small — default to all

      // Fetch machines from API
      fetchDevices: async () => {
        try {
          // Use relative URL to leverage Vercel rewrite proxy (avoids CORS)
          const apiUrl = '/api/v1';
          const response = await fetch(`${apiUrl}/vending/devices`);
          if (!response.ok) throw new Error('Failed to fetch vending devices');

          const devices: VendingDevice[] = await response.json();
          set({ devices });

          const currentState = get();
          const hasSelection = currentState.selectedDevices.length > 0;

          // Server-side defaults from Settings. Applied when this browser has
          // no selection yet (a new device) or when the saved defaults changed
          // since this browser last applied them.
          let serverDefaults: string[] = [];
          let serverVersion: string | null = null;
          try {
            const config = await getDashboardDefaults();
            serverDefaults = config.vending.filter((code) =>
              devices.some((d) => d.device_code === code)
            );
            serverVersion = config.updated_at;
          } catch (error) {
            console.warn('Could not load vending defaults, using local selection:', error);
          }

          const defaultsChanged =
            !!serverVersion && serverVersion !== currentState.appliedDefaultsAt;

          if (serverDefaults.length > 0 && (!hasSelection || defaultsChanged)) {
            set({
              selectedDevices: serverDefaults,
              isAllDevicesSelected: serverDefaults.length === devices.length,
              appliedDefaultsAt: serverVersion,
            });
            return;
          }

          // Nothing configured server-side: select every machine on first load
          if (!hasSelection && currentState.isAllDevicesSelected) {
            set({ selectedDevices: devices.map((d) => d.device_code) });
          }
        } catch (error) {
          console.error('Error fetching vending devices:', error);
        }
      },

      // Toggle individual machine selection
      toggleDevice: (deviceCode: string) => {
        const { selectedDevices, devices } = get();
        const isSelected = selectedDevices.includes(deviceCode);

        const newSelectedDevices = isSelected
          ? selectedDevices.filter((code) => code !== deviceCode)
          : [...selectedDevices, deviceCode];

        set({
          selectedDevices: newSelectedDevices,
          isAllDevicesSelected:
            newSelectedDevices.length > 0 && newSelectedDevices.length === devices.length,
        });
      },

      // Select all machines
      selectAllDevices: () => {
        const { devices } = get();
        set({
          selectedDevices: devices.map((d) => d.device_code),
          isAllDevicesSelected: true,
        });
      },

      // Set specific machines
      setDevices: (deviceCodes: string[]) => {
        const { devices } = get();
        set({
          selectedDevices: deviceCodes,
          isAllDevicesSelected: deviceCodes.length > 0 && deviceCodes.length === devices.length,
        });
      },

      // Resolve display name by device code
      getDeviceName: (deviceCode: string) => {
        const device = get().devices.find((d) => d.device_code === deviceCode);
        return device?.device_name || deviceCode;
      },

      // Stable color per machine (position in the fleet list)
      getDeviceColor: (deviceCode: string) => {
        const index = get().devices.findIndex((d) => d.device_code === deviceCode);
        return getVendingMachineColor(index);
      },
    }),
    {
      name: 'vending-storage', // localStorage key
      partialize: (state) => ({
        devices: state.devices,
        selectedDevices: state.selectedDevices,
        isAllDevicesSelected: state.isAllDevicesSelected,
        appliedDefaultsAt: state.appliedDefaultsAt,
      }),
    }
  )
);
