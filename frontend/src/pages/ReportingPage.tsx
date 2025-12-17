import React, { useState, useEffect, useMemo } from 'react';
import { fetchStores, fetchProductSalesReport, exportReportToCSV, postReportToSheets } from '../services/reportApi';
import type { ProductSalesReportResponse, Store, ReportRow } from '../types/report';
import { FileDown, Play, Loader2, Upload } from 'lucide-react';
import { usePresetStore } from '../stores/presetStore';
import { PresetSelector } from '../components/PresetSelector';
import { PresetSaveDialog } from '../components/PresetSaveDialog';
import { ColumnVisibilityPanel } from '../components/ColumnVisibilityPanel';
import { ReportFilterPanel } from '../components/ReportFilterPanel';

/**
 * Product Sales Reporting Page
 *
 * Allows users to:
 * - Select a Sales Store (Store A)
 * - Select a Compare Inventory Store (Store B)
 * - Pick a Date Range (Asia/Manila timezone)
 * - Generate a grouped report of product sales with inventories
 * - Download the result as CSV with exact 7 columns in order
 */
const ReportingPage: React.FC = () => {
  // State for form inputs
  const [stores, setStores] = useState<Store[]>([]);
  const [salesStoreId, setSalesStoreId] = useState<string>('');
  const [compareStoreIds, setCompareStoreIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // State for report data
  const [reportData, setReportData] = useState<ProductSalesReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for Google Sheets posting
  const [postingToSheets, setPostingToSheets] = useState(false);
  const [sheetsSuccess, setSheetsSuccess] = useState<string | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Preset system state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showCompareStoresDropdown, setShowCompareStoresDropdown] = useState(false);
  const { loadPresets, currentConfig } = usePresetStore();

  // Load stores and presets on mount
  useEffect(() => {
    loadStores();
    setDefaultDateRange();
    loadPresets('product-sales');
  }, []);

  /**
   * Load available stores from API
   */
  const loadStores = async () => {
    try {
      const storesData = await fetchStores();
      setStores(storesData);

      // Auto-select first store if available
      if (storesData.length > 0) {
        setSalesStoreId(storesData[0].id);
        // Auto-select first store for comparison
        setCompareStoreIds([storesData[0].id]);
      }
    } catch (err) {
      console.error('Failed to load stores:', err);
      setError('Failed to load stores. Please refresh the page.');
    }
  };

  /**
   * Set default date range to last 7 full days in Manila timezone
   */
  const setDefaultDateRange = () => {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1); // Yesterday

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6); // 7 days ago

    // Format as YYYY-MM-DD for date input
    setStartDate(formatDateForInput(startDate));
    setEndDate(formatDateForInput(endDate));
  };

  /**
   * Format date as YYYY-MM-DD for date input
   */
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Convert date input to ISO format with Manila timezone
   */
  const toManilaISO = (dateStr: string, isEndOfDay: boolean = false): string => {
    const time = isEndOfDay ? '23:59:59' : '00:00:00';
    return `${dateStr}T${time}+08:00`;
  };

  /**
   * Toggle comparison store selection
   */
  const toggleCompareStore = (storeId: string) => {
    setCompareStoreIds(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  /**
   * Run the report
   */
  const runReport = async () => {
    if (!salesStoreId || compareStoreIds.length === 0 || !startDate || !endDate) {
      setError('Please fill in all required fields and select at least one comparison store.');
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const start = toManilaISO(startDate, false);
      const end = toManilaISO(endDate, true);

      // Apply filters from preset config
      const data = await fetchProductSalesReport(
        salesStoreId,
        compareStoreIds,
        start,
        end,
        currentConfig.filters.categories,
        currentConfig.filters.min_quantity,
        currentConfig.filters.max_quantity,
        currentConfig.filters.limit,
        currentConfig.filters.sort_by,
        currentConfig.filters.sort_order,
        currentConfig.filters.search,
        currentConfig.filters.min_price,
        currentConfig.filters.max_price,
        currentConfig.filters.min_profit_margin,
        currentConfig.filters.max_profit_margin,
        currentConfig.filters.days_of_week
      );
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to fetch report:', err);
      setError(err.response?.data?.detail || 'Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download CSV
   */
  const downloadCSV = () => {
    if (reportData) {
      // Find the sales store name
      const salesStore = stores.find(s => s.id === salesStoreId);
      const storeName = salesStore?.name || 'Unknown';
      exportReportToCSV(reportData, storeName, stores);
    }
  };

  /**
   * Post to Google Sheets
   * Posts data to the sheet tab corresponding to the Sales Store name
   */
  const postToGoogleSheets = async () => {
    if (!reportData) return;

    // Get the sales store name (this will be the sheet tab name)
    const salesStore = stores.find(s => s.id === salesStoreId);
    const sheetName = salesStore?.name;

    if (!sheetName) {
      setSheetsError('Unable to determine store name. Please select a valid Sales Store.');
      return;
    }

    setPostingToSheets(true);
    setSheetsSuccess(null);
    setSheetsError(null);

    try {
      const result = await postReportToSheets(reportData, sheetName);
      setSheetsSuccess(result.message);

      // Auto-dismiss success message after 5 seconds
      setTimeout(() => {
        setSheetsSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to post to Google Sheets:', err);
      setSheetsError(err.message || 'Failed to post to Google Sheets');

      // Auto-dismiss error message after 8 seconds
      setTimeout(() => {
        setSheetsError(null);
      }, 8000);
    } finally {
      setPostingToSheets(false);
    }
  };

  /**
   * Group report rows by category (if enabled in preset config)
   */
  const groupedData = useMemo(() => {
    if (!reportData) return new Map<string, ReportRow[]>();

    // If group_by_category is false, return all rows in a single group
    if (currentConfig.group_by_category === false) {
      return new Map<string, ReportRow[]>([['All Products', reportData.rows]]);
    }

    const groups = new Map<string, ReportRow[]>();

    reportData.rows.forEach(row => {
      const category = row.category || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(row);
    });

    // Sort categories alphabetically
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [reportData, currentConfig.group_by_category]);

  return (
    <div className="h-full">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
          <p className="text-gray-400">
            Generate sales reports with inventory comparison across stores
          </p>
        </div>

        {/* Preset Selector & Filters Toggle */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Preset Selector */}
            <div className="flex-1">
              <PresetSelector onSaveClick={() => setShowSaveDialog(true)} />
            </div>

            {/* Filters Toggle */}
            <div className="flex items-end">
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="w-full md:w-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                {showFiltersPanel ? 'Hide' : 'Show'} Filters & Columns
              </button>
            </div>

            {/* Save Button */}
            <div className="flex items-end">
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                title="Save as Preset"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save
              </button>
            </div>
          </div>

          {/* Collapsible Filters Panel */}
          {showFiltersPanel && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ColumnVisibilityPanel />
              <ReportFilterPanel />
            </div>
          )}
        </div>

        {/* Store and Date Filters */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
            {/* Sales Store */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Sales Store (Store A)
              </label>
              <select
                value={salesStoreId}
                onChange={(e) => setSalesStoreId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select store...</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Compare Stores */}
            <div className="lg:col-span-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Comparison Stores (select one or more)
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCompareStoresDropdown(!showCompareStoresDropdown)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg min-h-[42px] flex items-center justify-between hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {compareStoreIds.length === 0 ? (
                    <span className="text-gray-400">Select stores...</span>
                  ) : (
                    <span className="text-sm">
                      {compareStoreIds.length} store{compareStoreIds.length !== 1 ? 's' : ''} selected
                      {compareStoreIds.length <= 2 && (
                        <span className="text-gray-400 ml-2">
                          ({compareStoreIds.map(id => stores.find(s => s.id === id)?.name || id).join(', ')})
                        </span>
                      )}
                    </span>
                  )}
                  <svg
                    className={`w-5 h-5 transition-transform ${showCompareStoresDropdown ? 'transform rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showCompareStoresDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    <div className="p-2">
                      {stores.map(store => (
                        <label
                          key={store.id}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-gray-600 p-2 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={compareStoreIds.includes(store.id)}
                            onChange={() => toggleCompareStore(store.id)}
                            className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-500 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <span className="text-sm text-white">{store.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Start Date */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* End Date */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={runReport}
              disabled={loading || !salesStoreId || compareStoreIds.length === 0 || !startDate || !endDate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Report
                </>
              )}
            </button>

            <button
              onClick={downloadCSV}
              disabled={!reportData || loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown className="w-4 h-4" />
              Download CSV
            </button>

            <button
              onClick={postToGoogleSheets}
              disabled={!reportData || loading || postingToSheets}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {postingToSheets ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Post to Sheets
                </>
              )}
            </button>
          </div>

          {/* Timezone Note */}
          <p className="text-sm text-gray-400 mt-3">
            All dates are in Asia/Manila timezone (UTC+8)
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Google Sheets Success Message */}
        {sheetsSuccess && (
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mb-6 animate-fade-in">
            <p className="text-green-400">{sheetsSuccess}</p>
          </div>
        )}

        {/* Google Sheets Error Message */}
        {sheetsError && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6 animate-fade-in">
            <p className="text-red-400">{sheetsError}</p>
          </div>
        )}

        {/* Report Results */}
        {reportData && (
          <div className="space-y-6">
            {/* Report Metadata */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <h2 className="font-semibold text-blue-400 mb-2">Report Info</h2>
              <div className="text-sm text-blue-300 space-y-1">
                <p>Total Products: {reportData.rows.length}</p>
                <p>Total Quantity Sold: {reportData.rows.reduce((sum, row) => sum + row.quantity_sold, 0).toFixed(2)}</p>
                <p>Generated: {new Date(reportData.meta.generated_at).toLocaleString()}</p>
              </div>
            </div>

            {/* No Data Message */}
            {reportData.rows.length === 0 && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">No sales data found for the selected criteria.</p>
              </div>
            )}

            {/* Grouped Tables by Category */}
            {Array.from(groupedData.entries()).map(([category, rows]) => (
              <div key={category} className="bg-gray-800/50 border border-gray-700 rounded-lg shadow-sm overflow-hidden">
                {currentConfig.group_by_category !== false && (
                  <div className="bg-gray-700/50 px-6 py-3 border-b border-gray-600">
                    <h3 className="font-semibold text-white">
                      {category} ({rows.length} products)
                    </h3>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/30">
                      <tr>
                        {currentConfig.columns.product_name && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Product Name
                          </th>
                        )}
                        {currentConfig.columns.sku && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            SKU
                          </th>
                        )}
                        {currentConfig.columns.product_id && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Product ID
                          </th>
                        )}
                        {currentConfig.columns.quantity_sold && (
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Qty Sold
                          </th>
                        )}
                        {currentConfig.columns.revenue && (
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Revenue
                          </th>
                        )}
                        {currentConfig.columns.inventory_sales_store && (
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Sales Store Inv
                          </th>
                        )}
                        {/* Dynamic comparison store columns */}
                        {reportData && reportData.meta.compare_store_ids.map((storeId) => {
                          const storeName = stores.find(s => s.id === storeId)?.name || storeId;
                          return (
                            <React.Fragment key={storeId}>
                              {currentConfig.columns.comparison_qty_sold && (
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                  {storeName} - Qty
                                </th>
                              )}
                              {currentConfig.columns.comparison_inventory && (
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                  {storeName} - Inv
                                </th>
                              )}
                              {currentConfig.columns.comparison_revenue && (
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                  {storeName} - Rev
                                </th>
                              )}
                              {currentConfig.columns.comparison_variance && (
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                  {storeName} - Variance
                                </th>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {rows.map((row, idx) => (
                        <tr key={`${row.product_id}-${idx}`} className="hover:bg-gray-700/30">
                          {currentConfig.columns.product_name && (
                            <td className="px-4 py-3 text-sm text-white">{row.product_name}</td>
                          )}
                          {currentConfig.columns.sku && (
                            <td className="px-4 py-3 text-sm text-gray-400">{row.sku || '-'}</td>
                          )}
                          {currentConfig.columns.product_id && (
                            <td className="px-4 py-3 text-sm text-gray-400 font-mono text-xs">
                              {row.product_id}
                            </td>
                          )}
                          {currentConfig.columns.quantity_sold && (
                            <td className="px-4 py-3 text-sm text-white text-right font-medium">
                              {row.quantity_sold.toFixed(2)}
                            </td>
                          )}
                          {currentConfig.columns.revenue && (
                            <td className="px-4 py-3 text-sm text-white text-right font-medium">
                              ${row.revenue.toFixed(2)}
                            </td>
                          )}
                          {currentConfig.columns.inventory_sales_store && (
                            <td className="px-4 py-3 text-sm text-white text-right">
                              {row.inventory_sales_store}
                            </td>
                          )}
                          {/* Dynamic comparison store cells */}
                          {reportData && reportData.meta.compare_store_ids.map((storeId) => {
                            const compData = row.comparison_stores[storeId];
                            return (
                              <React.Fragment key={storeId}>
                                {currentConfig.columns.comparison_qty_sold && (
                                  <td className="px-4 py-3 text-sm text-gray-300 text-right">
                                    {compData?.quantity_sold.toFixed(2) || '0.00'}
                                  </td>
                                )}
                                {currentConfig.columns.comparison_inventory && (
                                  <td className="px-4 py-3 text-sm text-gray-300 text-right">
                                    {compData?.inventory || 0}
                                  </td>
                                )}
                                {currentConfig.columns.comparison_revenue && (
                                  <td className="px-4 py-3 text-sm text-gray-300 text-right">
                                    ${compData?.revenue.toFixed(2) || '0.00'}
                                  </td>
                                )}
                                {currentConfig.columns.comparison_variance && (
                                  <td className={`px-4 py-3 text-sm text-right font-medium ${(compData?.qty_variance || 0) > 0 ? 'text-green-400' :
                                      (compData?.qty_variance || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                                    }`}>
                                    {compData?.qty_variance.toFixed(2) || '0.00'} ({compData?.qty_variance_percent.toFixed(1) || '0.0'}%)
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save Dialog */}
        <PresetSaveDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSuccess={() => {
            // Reload presets after saving
            loadPresets('product-sales');
          }}
        />
      </div>
    </div>
  );
};

export default ReportingPage;
