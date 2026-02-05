/**
 * Enhanced Chart Types for AI Chat
 * Supports 15+ chart types with customization options
 */

// All supported chart types
export type ChartType =
  // Core charts (Recharts native)
  | 'bar'
  | 'line'
  | 'pie'
  | 'area'
  | 'stacked_bar'
  | 'horizontal_bar'
  | 'scatter'
  | 'combo'
  // Advanced charts
  | 'treemap'
  | 'radar'
  | 'gauge'
  | 'waterfall'
  | 'bubble'
  | 'funnel'
  | 'sparkline'
  // Business intelligence charts
  | 'pareto'
  | 'bullet'
  | 'calendar_heatmap'
  | 'slope'
  | 'lollipop';

// Chart state for user customization
export interface ChartState {
  chartType: ChartType;
  colorTheme: string;
  showLegend: boolean;
  showGrid: boolean;
  title: string;
  isAnimated: boolean;
}

// Color theme definition
export interface ColorTheme {
  name: string;
  colors: string[];
  gradient?: boolean;
}

// Available color themes
export const COLOR_THEMES: Record<string, ColorTheme> = {
  default: {
    name: 'Default',
    colors: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
  },
  cool: {
    name: 'Cool',
    colors: ['#00d2ff', '#3a47d5', '#667eea', '#764ba2', '#4facfe', '#00f2fe'],
    gradient: true,
  },
  warm: {
    name: 'Warm',
    colors: ['#f59e0b', '#ef4444', '#ec4899', '#f97316', '#eab308', '#dc2626'],
  },
  nature: {
    name: 'Nature',
    colors: ['#10b981', '#059669', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4'],
  },
  corporate: {
    name: 'Corporate',
    colors: ['#1e3a5f', '#3d5a80', '#98c1d9', '#e0fbfc', '#ee6c4d', '#293241'],
  },
};

// Enhanced chart configuration from backend
export interface EnhancedChartConfig {
  type: ChartType;
  x_axis?: string;
  y_axis?: string;
  y_axis_secondary?: string; // For combo charts
  series?: string[];
  title?: string;
  is_currency?: boolean;
  units_column?: string;
  formatting?: ChartFormatting;
  tooltip?: TooltipConfig;
  // Chart-specific options
  treemap?: TreemapConfig;
  radar?: RadarConfig;
  gauge?: GaugeConfig;
  waterfall?: WaterfallConfig;
  funnel?: FunnelConfig;
  pareto?: ParetoConfig;
  calendar?: CalendarHeatmapConfig;
}

// Formatting options
export interface ChartFormatting {
  abbreviate_numbers?: boolean;
  currency_symbol?: string;
  decimal_places?: number;
  show_grid?: boolean;
  show_labels?: boolean;
  label_rotation?: number;
  max_label_length?: number;
}

// Tooltip configuration
export interface TooltipConfig {
  show_percentage?: boolean;
  show_units?: boolean;
  currency_format?: boolean;
}

// Treemap configuration
export interface TreemapConfig {
  value_key: string;
  name_key: string;
  parent_key?: string;
}

// Radar chart configuration
export interface RadarConfig {
  metrics: string[];
  max_value?: number;
}

// Gauge configuration
export interface GaugeConfig {
  min: number;
  max: number;
  target?: number;
  thresholds?: { value: number; color: string }[];
}

// Waterfall configuration
export interface WaterfallConfig {
  positive_color?: string;
  negative_color?: string;
  total_color?: string;
}

// Funnel configuration
export interface FunnelConfig {
  stages: string[];
  show_conversion_rate?: boolean;
}

// Pareto configuration
export interface ParetoConfig {
  show_cumulative_line?: boolean;
  threshold_percentage?: number; // e.g., 80 for 80/20 rule
}

// Calendar heatmap configuration
export interface CalendarHeatmapConfig {
  date_key: string;
  value_key: string;
  color_scale?: string[]; // Array of colors from low to high
}

// Chart data point
export interface ChartDataPoint {
  name: string;
  value: number;
  fullName?: string;
  units?: number;
  // For additional series
  [key: string]: any;
}

// Treemap data point
export interface TreemapDataPoint {
  name: string;
  value: number;
  children?: TreemapDataPoint[];
}

// Waterfall data point
export interface WaterfallDataPoint {
  name: string;
  value: number;
  type: 'positive' | 'negative' | 'total';
}

// Funnel data point
export interface FunnelDataPoint {
  name: string;
  value: number;
  percentage?: number;
  conversionRate?: number;
}

// Props for the enhanced chart renderer
export interface EnhancedChartRendererProps {
  config: EnhancedChartConfig;
  data: ChartDataPoint[];
  messageId: string;
  initialCustomization?: Partial<ChartState>;
  onCustomizationChange?: (state: ChartState) => void;
  onDrillDown?: (payload: DrillDownEvent) => void;
}

// Drill-down event
export interface DrillDownEvent {
  type: 'filter' | 'detail';
  field: string;
  value: any;
  payload: ChartDataPoint;
  suggestedQuery?: string;
}

// Chart compatibility map - which types can switch to which
export const CHART_COMPATIBILITY: Record<ChartType, ChartType[]> = {
  bar: ['horizontal_bar', 'lollipop', 'stacked_bar'],
  horizontal_bar: ['bar', 'lollipop'],
  line: ['area', 'sparkline'],
  area: ['line', 'sparkline'],
  pie: ['treemap', 'funnel'],
  stacked_bar: ['bar', 'horizontal_bar'],
  scatter: ['bubble'],
  bubble: ['scatter'],
  combo: ['bar', 'line'],
  treemap: ['pie'],
  radar: [],
  gauge: ['bullet'],
  bullet: ['gauge'],
  waterfall: ['bar'],
  funnel: ['pie', 'bar'],
  sparkline: ['line', 'area'],
  pareto: ['bar'],
  calendar_heatmap: [],
  slope: [],
  lollipop: ['bar', 'horizontal_bar'],
};

// Default chart state
export const DEFAULT_CHART_STATE: ChartState = {
  chartType: 'bar',
  colorTheme: 'default',
  showLegend: true,
  showGrid: true,
  title: '',
  isAnimated: true,
};

// Helper to get colors for current theme
export function getThemeColors(themeName: string): string[] {
  return COLOR_THEMES[themeName]?.colors || COLOR_THEMES.default.colors;
}

// Helper to format currency values
export function formatCurrency(value: number, symbol: string = '₱'): string {
  return `${symbol}${value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Helper to abbreviate large numbers
export function abbreviateNumber(value: number): string {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}
