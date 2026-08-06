import React, { useState, useRef, useEffect } from 'react';
import { useVendingStore } from '../../stores/vendingStore';

export const MachineSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const devices = useVendingStore((state) => state.devices);
  const fetchDevices = useVendingStore((state) => state.fetchDevices);
  const selectedDevices = useVendingStore((state) => state.selectedDevices);
  const isAllDevicesSelected = useVendingStore((state) => state.isAllDevicesSelected);
  const toggleDevice = useVendingStore((state) => state.toggleDevice);
  const selectAllDevices = useVendingStore((state) => state.selectAllDevices);
  const setDevices = useVendingStore((state) => state.setDevices);
  const getDeviceColor = useVendingStore((state) => state.getDeviceColor);

  // Fetch machines on mount
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Track phone breakpoint
  useEffect(() => {
    const handleResize = () => setIsPhone(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleAll = () => {
    if (isAllDevicesSelected) {
      setDevices([]);
    } else {
      selectAllDevices();
    }
  };

  const getDisplayText = () => {
    if (devices.length === 0) return 'Loading...';

    if (isAllDevicesSelected) {
      return `All ${devices.length} machines`;
    }
    if (selectedDevices.length === 0) {
      return 'No machines selected';
    }
    if (selectedDevices.length === 1) {
      const device = devices.find((d) => d.device_code === selectedDevices[0]);
      return device ? device.device_name : 'Unknown Machine';
    }
    return `${selectedDevices.length} machines selected`;
  };

  const machineList = (
    <>
      {devices.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-400">Loading machines...</div>
      ) : (
        <>
          {/* All Machines Option */}
          <label
            className="
              flex items-center gap-3 px-4 py-3 sm:py-2.5 min-h-[44px]
              hover:bg-[#2e303d] cursor-pointer transition-colors
              border-b border-[#2e303d]
            "
          >
            <input
              type="checkbox"
              checked={isAllDevicesSelected}
              onChange={handleToggleAll}
              className="
                w-4 h-4 rounded cursor-pointer
                bg-[#0e1117] border-2 border-gray-500
                checked:bg-[#00d2ff] checked:border-[#00d2ff]
              "
            />
            <span className="text-sm font-semibold text-white">All Machines</span>
          </label>

          {/* Individual Machines */}
          {devices.map((device) => {
            const isSelected = selectedDevices.includes(device.device_code);
            const color = getDeviceColor(device.device_code);

            return (
              <label
                key={device.device_code}
                className="
                  flex items-center gap-3 px-4 py-3 sm:py-2.5 min-h-[44px]
                  hover:bg-[#2e303d] cursor-pointer transition-colors
                "
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleDevice(device.device_code)}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{
                    accentColor: color,
                    backgroundColor: isSelected ? color : '#0e1117',
                    borderColor: color,
                  }}
                />
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-white">{device.device_name}</span>
                </div>
              </label>
            );
          })}
        </>
      )}
    </>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-400 mr-1 sm:mr-2">Machines:</span>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="
            px-3 sm:px-4 py-3 rounded-lg bg-[#1c1e26] text-white
            hover:bg-[#2e303d] transition-colors duration-200
            flex items-center justify-between gap-2 sm:gap-3 min-w-[140px] sm:min-w-[200px]
            border border-[#2e303d]
          "
        >
          <span className="text-sm font-medium truncate">{getDisplayText()}</span>
          <svg
            className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Mobile: Bottom sheet / Desktop: Dropdown */}
      {isOpen && isPhone && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Bottom sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1c1e26] border-t border-[#2e303d] rounded-t-2xl shadow-xl max-h-[60vh] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e303d]">
              <span className="text-sm font-semibold text-white">Select Machines</span>
              <button onClick={() => setIsOpen(false)} className="p-2 text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {machineList}
          </div>
        </>
      )}

      {isOpen && !isPhone && (
        <div className="
          absolute top-full left-0 mt-2 w-[250px]
          bg-[#1c1e26] border border-[#2e303d] rounded-lg
          shadow-xl z-50 py-2
          max-h-[400px] overflow-y-auto
        ">
          {machineList}
        </div>
      )}
    </div>
  );
};
