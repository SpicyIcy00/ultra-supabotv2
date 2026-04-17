import React, { useState } from 'react';
import { ReplenishmentDashboard } from '../components/replenishment/ReplenishmentDashboard';
import { ShipmentPlanTable } from '../components/replenishment/ShipmentPlanTable';
import { WarehousePicklist } from '../components/replenishment/WarehousePicklist';
import { ExceptionsPanel } from '../components/replenishment/ExceptionsPanel';
import { StoreTierConfig } from '../components/replenishment/StoreTierConfig';
import { SeasonalityCalendar } from '../components/replenishment/SeasonalityCalendar';
import { WarehouseInventoryManager } from '../components/replenishment/WarehouseInventoryManager';
import { PipelineManager } from '../components/replenishment/PipelineManager';

type ReplenishmentSubTab = 'dashboard' | 'shipment-plan' | 'picklist' | 'exceptions' | 'configuration';
type ConfigSubTab = 'store-tiers' | 'seasonality' | 'warehouse' | 'pipeline';

const ReportingPage: React.FC = () => {
  const [replenishmentSubTab, setReplenishmentSubTab] = useState<ReplenishmentSubTab>('dashboard');
  const [configSubTab, setConfigSubTab] = useState<ConfigSubTab>('store-tiers');

  const renderContent = () => {
    if (replenishmentSubTab === 'dashboard') return <ReplenishmentDashboard />;
    if (replenishmentSubTab === 'shipment-plan') return <ShipmentPlanTable />;
    if (replenishmentSubTab === 'picklist') return <WarehousePicklist />;
    if (replenishmentSubTab === 'exceptions') return <ExceptionsPanel />;
    if (replenishmentSubTab === 'configuration') {
      return (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-[#2e303d]">
            {([
              { key: 'store-tiers' as ConfigSubTab, label: 'Store Tiers' },
              { key: 'seasonality' as ConfigSubTab, label: 'Seasonality' },
              { key: 'warehouse' as ConfigSubTab, label: 'Warehouse Inventory' },
              { key: 'pipeline' as ConfigSubTab, label: 'Pipeline (On-Order)' },
            ]).map(tab => (
              <button key={tab.key} onClick={() => setConfigSubTab(tab.key)}
                className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
                  configSubTab === tab.key
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
          {configSubTab === 'store-tiers' && <StoreTierConfig />}
          {configSubTab === 'seasonality' && <SeasonalityCalendar />}
          {configSubTab === 'warehouse' && <WarehouseInventoryManager />}
          {configSubTab === 'pipeline' && <PipelineManager />}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Reports</h1>
          <p className="text-sm sm:text-base text-gray-400">Replenishment planning and inventory management</p>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#2e303d]">
          {([
            { key: 'dashboard' as ReplenishmentSubTab, label: 'Dashboard' },
            { key: 'shipment-plan' as ReplenishmentSubTab, label: 'Shipment Plan' },
            { key: 'picklist' as ReplenishmentSubTab, label: 'Picklist' },
            { key: 'exceptions' as ReplenishmentSubTab, label: 'Exceptions' },
            { key: 'configuration' as ReplenishmentSubTab, label: 'Configuration' },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setReplenishmentSubTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
                replenishmentSubTab === tab.key
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {renderContent()}
      </div>
    </div>
  );
};

export default ReportingPage;
