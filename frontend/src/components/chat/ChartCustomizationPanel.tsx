/**
 * Chart Customization Panel
 * Full control over chart visualization - type, data mapping, colors, and display options
 */

import { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { COLOR_THEMES } from '../../types/enhancedChart';
import type { ChartType, ChartState } from '../../types/enhancedChart';

interface ChartCustomizationPanelProps {
  chartState: ChartState;
  currentType: ChartType;
  availableFields: string[];
  data: any[];
  onStateChange: (state: Partial<ChartState>) => void;
  onDataMappingChange?: (mapping: DataMapping) => void;
  onClose: () => void;
}

export interface DataMapping {
  xAxis: string;
  yAxis: string;
  series?: string[];
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
  onStateChange,
  onDataMappingChange,
  onClose,
}: ChartCustomizationPanelProps) {
  const [activeTab, setActiveTab] = useState<'type' | 'data' | 'style'>('type');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Basic');

  // Find best default Y-axis (prefer numeric fields with revenue/sales/quantity in name)
  const getDefaultYAxis = () => {
    const preferred = availableFields.find(f =>
      f.toLowerCase().includes('revenue') ||
      f.toLowerCase().includes('sales') ||
      f.toLowerCase().includes('total') ||
      f.toLowerCase().includes('quantity') ||
      f.toLowerCase().includes('amount')
    );
    if (preferred) return preferred;
    // Fall back to first numeric field
    if (data && data.length > 0) {
      const numericField = availableFields.find(f => typeof data[0][f] === 'number');
      if (numericField) return numericField;
    }
    return availableFields[1] || 'value';
  };

  // Find best default X-axis (prefer string fields with name/category in name)
  const getDefaultXAxis = () => {
    const preferred = availableFields.find(f =>
      f.toLowerCase().includes('name') ||
      f.toLowerCase().includes('category') ||
      f.toLowerCase().includes('product') ||
      f.toLowerCase().includes('store')
    );
    if (preferred) return preferred;
    // Fall back to first string field
    if (data && data.length > 0) {
      const stringField = availableFields.find(f => typeof data[0][f] === 'string');
      if (stringField) return stringField;
    }
    return availableFields[0] || 'name';
  };

  const [selectedXAxis, setSelectedXAxis] = useState(getDefaultXAxis());
  const [selectedYAxis, setSelectedYAxis] = useState(getDefaultYAxis());

  // Detect numeric vs categorical fields
  const numericFields = availableFields.filter(field => {
    if (!data || data.length === 0) return false;
    const sampleValue = data[0][field];
    return typeof sampleValue === 'number';
  });

  const categoricalFields = availableFields.filter(field => {
    if (!data || data.length === 0) return true;
    const sampleValue = data[0][field];
    return typeof sampleValue === 'string';
  });

  const handleChartTypeSelect = (type: ChartType) => {
    onStateChange({ chartType: type });
  };

  // Apply data mapping with specific values (called from onChange with new value)
  const applyDataMapping = (xAxis: string, yAxis: string) => {
    if (onDataMappingChange) {
      onDataMappingChange({
        xAxis,
        yAxis,
      });
    }
  };

  // Handle Apply button click
  const handleApply = () => {
    applyDataMapping(selectedXAxis, selectedYAxis);
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden max-h-[500px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-850 flex-shrink-0">
        <h3 className="text-sm font-medium text-white">Chart Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
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
              Select any chart type. Recommended charts are highlighted.
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
                            {isOriginal && !isSelected && (
                              <span className="text-xs text-green-400">Recommended</span>
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
                onChange={(e) => {
                  const newValue = e.target.value;
                  setSelectedXAxis(newValue);
                  // Apply immediately with the new value
                  applyDataMapping(newValue, selectedYAxis);
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {availableFields.map((field) => (
                  <option key={field} value={field}>
                    {field} {categoricalFields.includes(field) ? '(text)' : '(number)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Usually a category like product name, store, or date
              </p>
            </div>

            {/* Y-Axis (Value) */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Y-Axis (Value)
              </label>
              <select
                value={selectedYAxis}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setSelectedYAxis(newValue);
                  // Apply immediately with the new value
                  applyDataMapping(selectedXAxis, newValue);
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {availableFields.map((field) => (
                  <option key={field} value={field}>
                    {field} {numericFields.includes(field) ? '(number)' : '(text)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                The metric to measure (sales, quantity, etc.)
              </p>
            </div>

            {/* Sort Options */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                Sort By
              </label>
              <div className="flex gap-2">
                <button className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded">
                  Value (High→Low)
                </button>
                <button className="flex-1 px-3 py-2 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                  Name (A→Z)
                </button>
              </div>
            </div>

            {/* Data Preview */}
            <div className="border-t border-gray-700 pt-4">
              <label className="block text-xs text-gray-400 mb-2">
                Data Preview ({data?.length || 0} items)
              </label>
              <div className="max-h-32 overflow-y-auto bg-gray-750 rounded p-2 text-xs">
                {data?.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-gray-300 py-1 border-b border-gray-700 last:border-0">
                    <span className="truncate flex-1">{item[selectedXAxis] || item.name}</span>
                    <span className="text-white font-medium ml-2">
                      {typeof (item[selectedYAxis] || item.value) === 'number'
                        ? (item[selectedYAxis] || item.value).toLocaleString()
                        : item[selectedYAxis] || item.value}
                    </span>
                  </div>
                ))}
                {data && data.length > 5 && (
                  <div className="text-gray-500 text-center py-1">
                    +{data.length - 5} more...
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
          Apply Changes
        </button>
      </div>
    </div>
  );
}

export default ChartCustomizationPanel;
