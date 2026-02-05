/**
 * Chart Customization Panel
 * Allows users to customize chart type, colors, legend, grid, and title
 */

import { X } from 'lucide-react';
import {
  COLOR_THEMES,
  CHART_COMPATIBILITY,
} from '../../types/enhancedChart';
import type { ChartType, ChartState } from '../../types/enhancedChart';

interface ChartCustomizationPanelProps {
  chartState: ChartState;
  currentType: ChartType;
  onStateChange: (state: Partial<ChartState>) => void;
  onClose: () => void;
}

// Display names for chart types
const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  horizontal_bar: 'Horizontal Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  stacked_bar: 'Stacked Bar',
  scatter: 'Scatter',
  bubble: 'Bubble',
  combo: 'Combo',
  treemap: 'Treemap',
  radar: 'Radar',
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

export function ChartCustomizationPanel({
  chartState,
  currentType,
  onStateChange,
  onClose,
}: ChartCustomizationPanelProps) {
  // Get compatible chart types for switching
  const compatibleTypes = [currentType, ...(CHART_COMPATIBILITY[currentType] || [])];

  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white">Chart Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Chart Type Selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">Chart Type</label>
          <div className="grid grid-cols-2 gap-1">
            {compatibleTypes.map((type) => (
              <button
                key={type}
                onClick={() => onStateChange({ chartType: type })}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  chartState.chartType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {CHART_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Color Theme Selector */}
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
                    : 'bg-gray-750 hover:bg-gray-700'
                }`}
              >
                {/* Color swatches */}
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

        {/* Toggle Options */}
        <div className="space-y-3">
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
            <span className="text-sm text-gray-300">Show Grid</span>
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

        {/* Title Editor */}
        <div>
          <label className="block text-xs text-gray-400 mb-2">Chart Title</label>
          <input
            type="text"
            value={chartState.title}
            onChange={(e) => onStateChange({ title: e.target.value })}
            placeholder="Enter custom title..."
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

export default ChartCustomizationPanel;
