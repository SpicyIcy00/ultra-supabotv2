/**
 * Warehouse Page
 *
 * Single home for warehouse operations, split into two tabs:
 *  1. Replenishment Reports — planning, picklists, exceptions, configuration
 *  2. Barcode Generator     — EAN-13 generation + StoreHub export
 *
 * The active tab is mirrored in the URL (?tab=barcodes) so links and refreshes
 * land on the right tab.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import ReplenishmentReports from './ReportingPage';
import BarcodeGenerator from './BarcodePage';

type WarehouseTab = 'replenishment' | 'barcodes';

const TABS: { key: WarehouseTab; label: string }[] = [
  { key: 'replenishment', label: 'Replenishment Reports' },
  { key: 'barcodes', label: 'Barcode Generator' },
];

const WarehousePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: WarehouseTab = searchParams.get('tab') === 'barcodes' ? 'barcodes' : 'replenishment';

  const selectTab = (tab: WarehouseTab) => {
    // Keep the default tab clean of query noise
    setSearchParams(tab === 'replenishment' ? {} : { tab }, { replace: true });
  };

  return (
    <div className="h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Warehouse</h1>
        <p className="text-sm sm:text-base text-gray-400">
          {activeTab === 'replenishment'
            ? 'Replenishment planning and inventory management'
            : 'Generate EAN-13 barcodes and export directly to the StoreHub Products Import Template.'}
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#2e303d]">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => selectTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'replenishment' ? <ReplenishmentReports /> : <BarcodeGenerator />}
    </div>
  );
};

export default WarehousePage;
