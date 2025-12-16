import React, { useState, useRef, useEffect } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { getStoreColor } from '../../constants/colors';

export const StoreSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const stores = useDashboardStore((state) => state.stores);
  const fetchStores = useDashboardStore((state) => state.fetchStores);
  const selectedStores = useDashboardStore((state) => state.selectedStores);
  const isAllStoresSelected = useDashboardStore((state) => state.isAllStoresSelected);
  const toggleStore = useDashboardStore((state) => state.toggleStore);
  const selectAllStores = useDashboardStore((state) => state.selectAllStores);
  const setStores = useDashboardStore((state) => state.setStores);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

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
    if (isAllStoresSelected) {
      // Deselect all
      setStores([]);
    } else {
      // Select all
      selectAllStores();
    }
  };

  const getDisplayText = () => {
    if (stores.length === 0) return 'Loading...';

    if (isAllStoresSelected) {
      return `All ${stores.length} stores`;
    }
    if (selectedStores.length === 0) {
      return 'No stores selected';
    }
    if (selectedStores.length === 1) {
      const store = stores.find(s => s.id === selectedStores[0]);
      return store ? store.name : 'Unknown Store';
    }
    return `${selectedStores.length} stores selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-400 mr-2">Stores:</span>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="
            px-4 py-3 rounded-lg bg-[#1c1e26] text-white
            hover:bg-[#2e303d] transition-colors duration-200
            flex items-center justify-between gap-3 min-w-[200px]
            border border-[#2e303d]
          "
        >
          <span className="text-sm font-medium">{getDisplayText()}</span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="
          absolute top-full left-0 mt-2 w-[250px]
          bg-[#1c1e26] border border-[#2e303d] rounded-lg
          shadow-xl z-50 py-2
          max-h-[400px] overflow-y-auto
        ">
          {stores.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Loading stores...</div>
          ) : (
            <>
              {/* All Stores Option */}
              <label
                className="
                  flex items-center gap-3 px-4 py-2.5
                  hover:bg-[#2e303d] cursor-pointer transition-colors
                  border-b border-[#2e303d]
                "
              >
                <input
                  type="checkbox"
                  checked={isAllStoresSelected}
                  onChange={handleToggleAll}
                  className="
                    w-4 h-4 rounded cursor-pointer
                    bg-[#0e1117] border-2 border-gray-500
                    checked:bg-[#00d2ff] checked:border-[#00d2ff]
                  "
                />
                <span className="text-sm font-semibold text-white">All Stores</span>
              </label>

              {/* Individual Stores */}
              {stores.map((store) => {
                const isSelected = selectedStores.includes(store.id);
                const color = getStoreColor(store.name);

                return (
                  <label
                    key={store.id}
                    className="
                      flex items-center gap-3 px-4 py-2.5
                      hover:bg-[#2e303d] cursor-pointer transition-colors
                    "
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStore(store.id)}
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
                      <span className="text-sm text-white">{store.name}</span>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
