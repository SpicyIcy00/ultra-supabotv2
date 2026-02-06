/**
 * Chart Customization Panel
 * Full control over chart visualization - type, data mapping, colors, and display options
 */

import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { COLOR_THEMES } from '../../types/enhancedChart';
import type { ChartType, ChartState } from '../../types/enhancedChart';

interface ChartCustomizationPanelProps {
  chartState: ChartState;
  currentType: ChartType;
  availableFields: string[];
  data: any[];
  currentMapping?: DataMapping; // Current data mapping to restore state
  onStateChange: (state: Partial<ChartState>) => void;
  onDataMappingChange?: (mapping: DataMapping) => void;
  onClose: () => void;
}

export interface DataMapping {
  xAxis: string;
  yAxis: string;
  sortBy?: 'value_desc' | 'value_asc' | 'name_asc' | 'name_desc';
  limit?: number;
}

// ALL chart types organized by category
const CHART_CATEGORIES = {
  'Basic': ['bar', 'horizontal_bar', 'line', 'area', 'pie'] as ChartType[],
  'Comparison': ['stacked_bar', 'combo', 'radar', 'lollipop'] as ChartType[],
  'Relationship': ['scatter', 'bubble', 'treemap'] as ChartType[],
  'Progress': ['gauge', 'bullet', 'waterfall', 'funnel'] as ChartType[],
  'Analysis': ['pareto', 'calendar_heatmap', 'slope', 'sparkline'] as ChartType[],
};

// Display names for chart types
const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  horizontal_bar: 'Horizontal Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie / Donut',
  stacked_bar: 'Stacked Bar',
  scatter: 'Scatter',
  bubble: 'Bubble',
  combo: 'Combo (Bar+Line)',
  treemap: 'Treemap',
  radar: 'Radar / Spider',
  gauge: 'Gauge',
  bullet: 'Bullet',
  waterfall: 'Waterfall',
  funnel: 'Funnel',
  sparkline: 'Sparkline',
  pareto: 'Pareto (80/20)',
  calendar_heatmap: 'Calendar Heatmap',
  slope: 'Slope',
  lollipop: 'Lollipop',
};

// Chart type descriptions
const CHART_DESCRIPTIONS: Partial<Record<ChartType, string>> = {
  bar: 'Compare categories with vertical bars',
  horizontal_bar: 'Best for long labels or rankings',
  line: 'Show trends over time',
  area: 'Like line chart but filled, good for volume',
  pie: 'Show proportions of a whole',
  stacked_bar: 'Compare composition across categories',
  scatter: 'Show relationship between two values',
  bubble: 'Like scatter with size dimension',
  combo: 'Combine bars and lines',
  treemap: 'Show hierarchical data as nested boxes',
  radar: 'Compare multiple metrics across items',
  gauge: 'Show single KPI vs target',
  bullet: 'Compact KPI with target ranges',
  waterfall: 'Show incremental changes',
  funnel: 'Show conversion or stages',
  pareto: 'Find the vital few (80/20 rule)',
  calendar_heatmap: 'Show patterns over days',
  lollipop: 'Cleaner alternative to bar chart',
};

export function ChartCustomizationPanel({
  chartState,
  currentType,
  availableFields,
  data,
  currentMapping,
  onStateChange,
  onDataMappingChange,
  onClose,
}: ChartCustomizationPanelProps) {
  const [activeTab, setActiveTab] = useState<'type' | 'data' | 'style'>('type');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Basic');

  // Analyze field types from data
  const fieldTypes = useMemo(() => {
    const types: Record<string, 'number' | 'string' | 'mixed'> = {};
    if (!data || data.length === 0) {
      availableFields.forEach(f => { types[f] = 'string'; });
      return types;
    }

    availableFields.forEach(field => {
      let hasNumber = false;
      let hasString = false;

      // Check first few items to determine type
      for (let i = 0; i < Math.min(5, data.length); i++) {
        const val = data[i]?.[field];
        if (val === null || val === undefined) continue;
        if (typeof val === 'number' || (!isNaN(Number(val)) && val !== '')) {
          hasNumber = true;
        } else {
          hasString = true;
        }
      }

      if (hasNumber && hasString) types[field] = 'mixed';
      else if (hasNumber) types[field] = 'number';
      else types[field] = 'string';
    });

    return types;
  }, [data, availableFields]);

  const numericFields = availableFields.filter(f => fieldTypes[f] === 'number');
  const categoricalFields = availableFields.filter(f => fieldTypes[f] === 'string' || fieldTypes[f] === 'mixed');

  // Find best defaults - prefer real field names from originalData over 'name'/'value'
  const getDefaultXAxis = () => {
    // First check for real name fields (not the synthetic 'name' field)
    const realNameFields = ['product_name', 'store_name', 'category_name', 'category'];
    for (const field of realNameFields) {
      if (availableFields.includes(field)) return field;
    }
    // Then check for any field containing 'name'
    const preferred = availableFields.find(f =>
      f.toLowerCase().includes('name') && f !== 'name' && f !== 'fullName'
    );
    if (preferred) return preferred;
    // Fall back to 'name' if it exists
    if (availableFields.includes('name')) return 'name';
    // Fall back to first string field
    const stringField = categoricalFields[0];
    if (stringField) return stringField;
    return availableFields[0] || 'name';
  };

  const getDefaultYAxis = () => {
    // First check for real value fields (not the synthetic 'value' field)
    const realValueFields = ['total_revenue', 'revenue', 'total_sales', 'sales', 'total_quantity_sold', 'quantity', 'amount'];
    for (const field of realValueFields) {
      if (availableFields.includes(field)) return field;
    }
    // Then check for any field containing value-like names
    const preferred = availableFields.find(f =>
      (f.toLowerCase().includes('revenue') ||
      f.toLowerCase().includes('sales') ||
      f.toLowerCase().includes('total') ||
      f.toLowerCase().includes('quantity') ||
      f.toLowerCase().includes('amount')) && f !== 'value'
    );
    if (preferred) return preferred;
    // Fall back to 'value' if it exists
    if (availableFields.includes('value')) return 'value';
    // Fall back to first numeric field
    const numField = numericFields[0];
    if (numField) return numField;
    return availableFields[1] || 'value';
  };

  // Local state for pending changes - initialize from currentMapping if provided
  const [selectedXAxis, setSelectedXAxis] = useState(() =>
    currentMapping?.xAxis && availableFields.includes(currentMapping.xAxis)
      ? currentMapping.xAxis
      : getDefaultXAxis()
  );
  const [selectedYAxis, setSelectedYAxis] = useState(() =>
    currentMapping?.yAxis && availableFields.includes(currentMapping.yAxis)
      ? currentMapping.yAxis
      : getDefaultYAxis()
  );
  const [sortBy, setSortBy] = useState<'value_desc' | 'value_asc' | 'name_asc' | 'name_desc'>(
    currentMapping?.sortBy || 'value_desc'
  );
  const [limit, setLimit] = useState<number>(currentMapping?.limit || 0); // 0 = show all

  // Apply all data changes at once
  const applyDataMapping = () => {
    if (onDataMappingChange) {
      onDataMappingChange({
        xAxis: selectedXAxis,
        yAxis: selectedYAxis,
        sortBy,
        limit: limit || undefined,
      });
    }
  };

  // Reset to defaults
  const handleReset = () => {
    const defaultX = getDefaultXAxis();
    const defaultY = getDefaultYAxis();
    setSelectedXAxis(defaultX);
    setSelectedYAxis(defaultY);
    setSortBy('value_desc');
    setLimit(0);
    if (onDataMappingChange) {
      onDataMappingChange({
        xAxis: defaultX,
        yAxis: defaultY,
        sortBy: 'value_desc',
      });
    }
    onStateChange({
      chartType: currentType,
      colorTheme: 'default',
      showLegend: true,
      showGrid: true,
      isAnimated: true,
      title: '',
    });
  };

  const handleChartTypeSelect = (type: ChartType) => {
    onStateChange({ chartType: type });
  };

  // Handle Apply button click
  const handleApply = () => {
    applyDataMapping();
    onClose();
  };

  // Get preview data based on current selections
  const previewData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let preview = data.map(item => ({
      x: item[selectedXAxis] ?? item.name ?? 'Unknown',
      y: item[selectedYAxis] ?? item.value ?? 0,
    }));

    // Sort
    if (sortBy === 'value_desc') {
      preview.sort((a, b) => Number(b.y) - Number(a.y));
    } else if (sortBy === 'value_asc') {
      preview.sort((a, b) => Number(a.y) - Number(b.y));
    } else if (sortBy === 'name_asc') {
      preview.sort((a, b) => String(a.x).localeCompare(String(b.x)));
    } else if (sortBy === 'name_desc') {
      preview.sort((a, b) => String(b.x).localeCompare(String(a.x)));
    }

    // Limit
    if (limit > 0) {
      preview = preview.slice(0, limit);
    }

    return preview.slice(0, 5); // Show max 5 in preview
  }, [data, selectedXAxis, selectedYAxis, sortBy, limit]);

  // Stop propagation to prevent panel from closing
  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 overflow-hidden max-h-[500px] flex flex-col"
      onClick={handlePanelClick}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-850 flex-shrink-0">
        <h3 className="text-sm font-medium text-white">Chart Settings</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            title="Reset to defaults"
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 flex-shrink-0">
        {[
          { id: 'type', label: 'Chart Type' },
          { id: 'data', label: 'Data' },
          { id: 'style', label: 'Style' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-750'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Chart Type Tab */}
        {activeTab === 'type' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-3">
              Select a chart type. The recommended type is marked.
            </p>
            {Object.entries(CHART_CATEGORIES).map(([category, types]) => (
              <div key={category} className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-750 hover:bg-gray-700 transition-colors"
                >
                  <span className="text-sm text-gray-300">{category}</span>
                  {expandedCategory === category ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {expandedCategory === category && (
                  <div className="p-2 space-y-1 bg-gray-800">
                    {types.map((type) => {
                      const isSelected = chartState.chartType === type;
                      const isOriginal = currentType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => handleChartTypeSelect(type)}
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-gray-700 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {CHART_TYPE_LABELS[type]}
                            </span>
                            {isOriginal && (
                              <span className={`text-xs ${isSelected ? 'text-blue-200' : 'text-green-400'}`}>
                                Recommended
                              </span>
                            )}
                          </div>
                          {CHART_DESCRIPTIONS[type] && (
                            <p className={`text-xs mt-0.5 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                              {CHART_DESCRIPTIONS[type]}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Data Tab */}
        {activeTab === 'data' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Choose which data fields to display on each axis.
            </p>

            {/* X-Axis (Category/Label) */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                X-Axis (Category/Label)
              </label>
              <select
                value={selectedXAxis}
                onChange={(e) => setSelectedXAxis(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {availableFields.map((field) => (
                  <option key={field} value={field}>
                    {field} ({fieldTypes[field] || 'unknown'})
                  </option>
                ))}
              </select>
            </div>

            {/* Y-Axis (Value) */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Y-Axis (Value)
              </label>
              <select
                value={selectedYAxis}
                onChange={(e) => setSelectedYAxis(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {availableFields.map((field) => (
                  <option key={field} value={field}>
                    {field} ({fieldTypes[field] || 'unknown'})
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Options */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Sort By
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSortBy('value_desc')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    sortBy === 'value_desc' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Value ↓
                </button>
                <button
                  onClick={() => setSortBy('value_asc')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    sortBy === 'value_asc' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Value ↑
                </button>
                <button
                  onClick={() => setSortBy('name_asc')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    sortBy === 'name_asc' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Name A→Z
                </button>
                <button
                  onClick={() => setSortBy('name_desc')}
                  className={`px-3 py-2 text-xs rounded transition-colors ${
                    sortBy === 'name_desc' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Name Z→A
                </button>
              </div>
            </div>

            {/* Limit */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Show Items
              </label>
              <div className="flex gap-2">
                {[0, 5, 10, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setLimit(n)}
                    className={`flex-1 px-3 py-2 text-xs rounded transition-colors ${
                      limit === n ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {n === 0 ? 'All' : `Top ${n}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Preview */}
            <div className="border-t border-gray-700 pt-4">
              <label className="block text-xs text-gray-400 mb-2">
                Preview ({data?.length || 0} total items{limit > 0 ? `, showing top ${limit}` : ''})
              </label>
              <div className="max-h-32 overflow-y-auto bg-gray-750 rounded p-2 text-xs">
                {previewData.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-gray-300 py-1 border-b border-gray-700 last:border-0">
                    <span className="truncate flex-1">{String(item.x)}</span>
                    <span className="text-white font-medium ml-2">
                      {typeof item.y === 'number' ? item.y.toLocaleString() : item.y}
                    </span>
                  </div>
                ))}
                {data && data.length > 5 && (
                  <div className="text-gray-500 text-center py-1">
                    +{Math.max(0, (limit || data.length) - 5)} more...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Style Tab */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Color Theme */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Color Theme</label>
              <div className="space-y-2">
                {Object.entries(COLOR_THEMES).map(([key, theme]) => (
                  <button
                    key={key}
                    onClick={() => onStateChange({ colorTheme: key })}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                      chartState.colorTheme === key
                        ? 'bg-gray-700 ring-1 ring-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex gap-1">
                      {theme.colors.slice(0, 5).map((color, idx) => (
                        <div
                          key={idx}
                          className="w-4 h-4 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-300">{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Display Options */}
            <div className="space-y-3 border-t border-gray-700 pt-4">
              <label className="block text-xs text-gray-400 mb-2">Display Options</label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chartState.showLegend}
                  onChange={(e) => onStateChange({ showLegend: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm text-gray-300">Show Legend</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chartState.showGrid}
                  onChange={(e) => onStateChange({ showGrid: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm text-gray-300">Show Grid Lines</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chartState.isAnimated}
                  onChange={(e) => onStateChange({ isAnimated: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm text-gray-300">Animations</span>
              </label>
            </div>

            {/* Title */}
            <div className="border-t border-gray-700 pt-4">
              <label className="block text-xs text-gray-400 mb-2">Custom Title</label>
              <input
                type="text"
                value={chartState.title}
                onChange={(e) => onStateChange({ title: e.target.value })}
                placeholder="Enter chart title..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer with Apply button */}
      <div className="border-t border-gray-700 p-3 bg-gray-850 flex-shrink-0">
        <button
          onClick={handleApply}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium transition-colors"
        >
          Apply & Close
        </button>
      </div>
    </div>
  );
}

export default ChartCustomizationPanel;
