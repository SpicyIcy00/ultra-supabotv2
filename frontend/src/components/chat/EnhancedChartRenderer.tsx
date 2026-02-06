/**
 * Enhanced Chart Renderer Component
 * Supports 15+ chart types with customization, export, and interactivity
 */

import { useState, useRef, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Treemap,
  Funnel,
  FunnelChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  Legend,
  Brush,
  ReferenceLine,
} from 'recharts';
import { ChartToolbar } from './ChartToolbar';
import { ChartCustomizationPanel } from './ChartCustomizationPanel';
import {
  DEFAULT_CHART_STATE,
  getThemeColors,
  formatCurrency,
  abbreviateNumber,
} from '../../types/enhancedChart';
import type {
  ChartType,
  ChartState,
  EnhancedChartConfig,
  ChartDataPoint,
} from '../../types/enhancedChart';

interface EnhancedChartRendererProps {
  config: EnhancedChartConfig;
  data: ChartDataPoint[];
  originalData?: Record<string, any>[]; // Original data with all fields for customization
  messageId: string;
  initialCustomization?: Partial<ChartState>;
  onCustomizationChange?: (state: ChartState) => void;
  onDrillDown?: (payload: any) => void;
}

export function EnhancedChartRenderer({
  config,
  data: rawData,
  originalData,
  messageId,
  initialCustomization,
  onCustomizationChange,
  onDrillDown,
}: EnhancedChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null); // Separate ref for export (excludes toolbar)
  const [showSettings, setShowSettings] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Data mapping state (which fields to use for X and Y axis)
  const [dataMapping, setDataMapping] = useState({
    xAxis: 'name',
    yAxis: 'value',
  });

  // Get available fields - combine rawData fields (name, value) with originalData fields
  // This allows users to see what's currently displayed AND switch to other fields
  const availableFields = useMemo(() => {
    const fields = new Set<string>();

    // Add rawData fields first (these are the defaults: name, value, fullName)
    if (rawData && rawData.length > 0) {
      Object.keys(rawData[0]).forEach(key => fields.add(key));
    }

    // Add originalData fields (all SQL result columns)
    if (originalData && originalData.length > 0) {
      Object.keys(originalData[0]).forEach(key => fields.add(key));
    }

    if (fields.size === 0) return ['name', 'value'];
    return Array.from(fields);
  }, [rawData, originalData]);

  // Source data for the customization panel (for type detection)
  const sourceDataForFields = originalData && originalData.length > 0 ? originalData : rawData;

  // Map data based on current mapping (allows users to change what's displayed)
  // Default: use rawData (chart_data) which is already properly formatted by the backend
  // Only use originalData when user explicitly changes the data mapping to custom fields
  const isUsingDefaultMapping = dataMapping.xAxis === 'name' && dataMapping.yAxis === 'value';

  const data = useMemo(() => {
    // If using default mapping, use the pre-formatted chart_data (rawData)
    // This is the recommended visualization from the backend
    if (isUsingDefaultMapping) {
      // Ensure rawData has valid names
      return rawData.map((item, index) => ({
        ...item,
        name: item.name || item.fullName || `Item ${index + 1}`,
        fullName: item.fullName || item.name || `Item ${index + 1}`,
      }));
    }

    // User has customized the mapping - use originalData if available
    const dataSource = originalData && originalData.length > 0 ? originalData : rawData;
    if (!dataSource || dataSource.length === 0) return rawData;

    // Re-map data to use the user's selected fields
    return dataSource.map((item, index) => {
      const anyItem = item as any;
      const nameValue = anyItem[dataMapping.xAxis] ?? anyItem.name;
      const displayName = nameValue ? String(nameValue) : `Item ${index + 1}`;
      return {
        ...item,
        name: displayName,
        value: Number(anyItem[dataMapping.yAxis] ?? anyItem.value ?? 0),
        fullName: displayName,
      };
    });
  }, [rawData, originalData, dataMapping, isUsingDefaultMapping]);

  // Chart state with defaults
  const [chartState, setChartState] = useState<ChartState>({
    ...DEFAULT_CHART_STATE,
    chartType: config.type as ChartType,
    title: config.title || '',
    ...initialCustomization,
  });

  // Get colors from current theme
  const colors = useMemo(() => getThemeColors(chartState.colorTheme), [chartState.colorTheme]);

  // Handle state changes
  const handleStateChange = (updates: Partial<ChartState>) => {
    const newState = { ...chartState, ...updates };
    setChartState(newState);
    onCustomizationChange?.(newState);
  };

  // Handle data mapping changes
  const handleDataMappingChange = (mapping: { xAxis: string; yAxis: string }) => {
    setDataMapping(mapping);
  };

  // Handle click for drill-down
  const handleChartClick = (data: any) => {
    if (onDrillDown && data?.payload) {
      onDrillDown({
        type: 'filter',
        field: config.x_axis || 'name',
        value: data.payload.name,
        payload: data.payload,
        suggestedQuery: `Show details for ${data.payload.fullName || data.payload.name}`,
      });
    }
  };

  // Helper to get display name from data point
  const getDisplayName = (item: any): string => {
    return item?.fullName || item?.name || item?.label || item?.category || 'Unknown';
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const dataPoint = payload[0]?.payload;
    const displayLabel = getDisplayName(dataPoint) || label || 'Item';

    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
        <p className="text-white font-semibold mb-2 max-w-xs truncate">{displayLabel}</p>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-400">{entry.dataKey === 'value' ? 'Value' : entry.name || 'Value'}:</span>
            <span className="text-white font-medium">
              {config.is_currency
                ? formatCurrency(entry.value)
                : entry.value?.toLocaleString()}
            </span>
          </div>
        ))}
        {dataPoint?.units !== undefined && (
          <div className="text-xs text-gray-500 mt-1">
            {dataPoint.units.toLocaleString()} units
          </div>
        )}
      </div>
    );
  };

  // Format Y-axis values
  const formatYAxis = (value: number) => {
    if (config.is_currency) {
      return `₱${abbreviateNumber(value)}`;
    }
    return abbreviateNumber(value);
  };

  // Common chart props
  const commonProps = {
    isAnimationActive: chartState.isAnimated,
    animationDuration: 800,
    animationEasing: 'ease-out' as const,
  };

  // Grid component (conditional)
  const renderGrid = () =>
    chartState.showGrid ? (
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
    ) : null;

  // Legend component (conditional)
  const renderLegend = () =>
    chartState.showLegend ? <Legend wrapperStyle={{ paddingTop: '10px' }} /> : null;

  // ============================================
  // CHART RENDERERS
  // ============================================

  // Format X-axis tick to handle missing/long names
  const formatXAxisTick = (value: any, index: number) => {
    if (!value || value === 'undefined' || value === 'null') {
      return `Item ${index + 1}`;
    }
    const str = String(value);
    return str.length > 12 ? `${str.slice(0, 10)}...` : str;
  };

  const renderBarChart = () => (
    <BarChart data={data} onClick={handleChartClick}>
      {renderGrid()}
      <XAxis
        dataKey="name"
        stroke="#9ca3af"
        tick={{ fontSize: 12 }}
        tickLine={{ stroke: '#4b5563' }}
        tickFormatter={formatXAxisTick}
      />
      <YAxis
        stroke="#9ca3af"
        tickFormatter={formatYAxis}
        tick={{ fontSize: 12 }}
        tickLine={{ stroke: '#4b5563' }}
      />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      <Bar
        dataKey="value"
        fill={colors[0]}
        cursor="pointer"
        radius={[4, 4, 0, 0]}
        {...commonProps}
      />
    </BarChart>
  );

  const renderHorizontalBarChart = () => (
    <BarChart data={data} layout="vertical" onClick={handleChartClick}>
      {renderGrid()}
      <XAxis
        type="number"
        stroke="#9ca3af"
        tickFormatter={formatYAxis}
        tick={{ fontSize: 12 }}
      />
      <YAxis
        type="category"
        dataKey="name"
        width={120}
        stroke="#9ca3af"
        tick={{ fontSize: 11 }}
        tickFormatter={(value, index) => {
          if (!value || value === 'undefined' || value === 'null') return `Item ${index + 1}`;
          const str = String(value);
          return str.length > 15 ? `${str.slice(0, 15)}...` : str;
        }}
      />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      <Bar
        dataKey="value"
        fill={colors[0]}
        cursor="pointer"
        radius={[0, 4, 4, 0]}
        {...commonProps}
      />
    </BarChart>
  );

  const renderStackedBarChart = () => {
    // Get all numeric keys except 'name' for stacking
    const firstItem = data[0] as any;
    const seriesKeys = config.series ||
      (firstItem ? Object.keys(firstItem).filter(k => k !== 'name' && k !== 'fullName' && typeof firstItem[k] === 'number') : ['value']);

    return (
      <BarChart data={data} onClick={handleChartClick}>
        {renderGrid()}
        <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={formatXAxisTick} />
        <YAxis stroke="#9ca3af" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        {renderLegend()}
        {seriesKeys.map((key, idx) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={colors[idx % colors.length]}
            radius={idx === seriesKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            {...commonProps}
          />
        ))}
      </BarChart>
    );
  };

  const renderLineChart = () => (
    <LineChart data={data} onClick={handleChartClick}>
      {renderGrid()}
      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={formatXAxisTick} />
      <YAxis stroke="#9ca3af" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      <Line
        type="monotone"
        dataKey="value"
        stroke={colors[0]}
        strokeWidth={2}
        dot={{ fill: colors[0], strokeWidth: 2, r: 4 }}
        activeDot={{ r: 6, fill: colors[0] }}
        {...commonProps}
      />
      {data.length > 10 && (
        <Brush
          dataKey="name"
          height={30}
          stroke={colors[0]}
          fill="#1f2937"
          travellerWidth={10}
        />
      )}
    </LineChart>
  );

  const renderAreaChart = () => (
    <AreaChart data={data} onClick={handleChartClick}>
      <defs>
        <linearGradient id={`gradient-${messageId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={colors[0]} stopOpacity={0.6} />
          <stop offset="95%" stopColor={colors[0]} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      {renderGrid()}
      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={formatXAxisTick} />
      <YAxis stroke="#9ca3af" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      <Area
        type="monotone"
        dataKey="value"
        stroke={colors[0]}
        fill={`url(#gradient-${messageId})`}
        strokeWidth={2}
        {...commonProps}
      />
      {data.length > 10 && (
        <Brush dataKey="name" height={30} stroke={colors[0]} fill="#1f2937" />
      )}
    </AreaChart>
  );

  const renderPieChart = () => {
    // Custom label renderer that handles missing names
    const renderPieLabel = ({ name, fullName, percent, index }: any) => {
      const displayName = fullName || name || data[index]?.fullName || data[index]?.name || `Item ${index + 1}`;
      const shortName = displayName.length > 15 ? `${displayName.slice(0, 12)}...` : displayName;
      return `${shortName} (${(percent * 100).toFixed(0)}%)`;
    };

    return (
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={40}
          label={renderPieLabel}
          labelLine={{ stroke: '#6b7280' }}
          {...commonProps}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors[index % colors.length]}
              cursor="pointer"
              onClick={() => handleChartClick({ payload: data[index] })}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        {renderLegend()}
      </PieChart>
    );
  };

  const renderScatterChart = () => (
    <ScatterChart>
      {renderGrid()}
      <XAxis
        dataKey="name"
        name={config.x_axis || 'X'}
        stroke="#9ca3af"
        tick={{ fontSize: 12 }}
      />
      <YAxis
        dataKey="value"
        name={config.y_axis || 'Y'}
        stroke="#9ca3af"
        tickFormatter={formatYAxis}
        tick={{ fontSize: 12 }}
      />
      <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
      {renderLegend()}
      <Scatter
        data={data}
        fill={colors[0]}
        cursor="pointer"
        onClick={handleChartClick}
        {...commonProps}
      />
    </ScatterChart>
  );

  const renderBubbleChart = () => (
    <ScatterChart>
      {renderGrid()}
      <XAxis dataKey="x" name="X" stroke="#9ca3af" tick={{ fontSize: 12 }} />
      <YAxis dataKey="y" name="Y" stroke="#9ca3af" tick={{ fontSize: 12 }} />
      <ZAxis dataKey="z" range={[50, 400]} name="Size" />
      <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
      {renderLegend()}
      <Scatter data={data} fill={colors[0]} {...commonProps}>
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Scatter>
    </ScatterChart>
  );

  const renderComboChart = () => (
    <ComposedChart data={data}>
      {renderGrid()}
      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
      <YAxis yAxisId="left" stroke="#9ca3af" tickFormatter={formatYAxis} />
      <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      <Bar yAxisId="left" dataKey="value" fill={colors[0]} radius={[4, 4, 0, 0]} {...commonProps} />
      <Line yAxisId="right" type="monotone" dataKey="value2" stroke={colors[1]} strokeWidth={2} {...commonProps} />
    </ComposedChart>
  );

  const renderRadarChart = () => {
    const radarFirstItem = data[0] as any;
    const metrics = config.radar?.metrics ||
      (radarFirstItem ? Object.keys(radarFirstItem).filter(k => k !== 'name' && typeof radarFirstItem[k] === 'number') : ['value']);

    return (
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        {renderLegend()}
        {metrics.map((metric, idx) => (
          <Radar
            key={metric}
            name={metric}
            dataKey={metric}
            stroke={colors[idx % colors.length]}
            fill={colors[idx % colors.length]}
            fillOpacity={0.3}
            {...commonProps}
          />
        ))}
      </RadarChart>
    );
  };

  const renderTreemap = () => (
    <Treemap
      data={data}
      dataKey="value"
      aspectRatio={4 / 3}
      stroke="#1f2937"
      fill={colors[0]}
      {...commonProps}
    >
      {data.map((_, index) => (
        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
      ))}
      <Tooltip content={<CustomTooltip />} />
    </Treemap>
  );

  const renderFunnelChart = () => (
    <FunnelChart>
      <Tooltip content={<CustomTooltip />} />
      <Funnel
        dataKey="value"
        data={data}
        isAnimationActive={chartState.isAnimated}
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Funnel>
    </FunnelChart>
  );

  const renderGaugeChart = () => {
    const value = data[0]?.value || 0;
    const gaugeConfig = config.gauge || { min: 0, max: 100 };
    const percentage = ((value - gaugeConfig.min) / (gaugeConfig.max - gaugeConfig.min)) * 100;
    const angle = (percentage / 100) * 180;

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <svg viewBox="0 0 200 120" className="w-full max-w-xs">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#374151"
            strokeWidth="20"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M 20 100 A 80 80 0 0 1 ${20 + 160 * Math.sin((angle * Math.PI) / 180)} ${100 - 80 * (1 - Math.cos((angle * Math.PI) / 180))}`}
            fill="none"
            stroke={colors[0]}
            strokeWidth="20"
            strokeLinecap="round"
            className={chartState.isAnimated ? 'transition-all duration-1000' : ''}
          />
          {/* Center text */}
          <text x="100" y="90" textAnchor="middle" className="fill-white text-2xl font-bold">
            {config.is_currency ? formatCurrency(value) : value.toLocaleString()}
          </text>
          <text x="100" y="110" textAnchor="middle" className="fill-gray-400 text-xs">
            {gaugeConfig.target ? `Target: ${gaugeConfig.target}` : ''}
          </text>
        </svg>
        {chartState.title && (
          <p className="text-gray-400 text-sm mt-2">{chartState.title}</p>
        )}
      </div>
    );
  };

  const renderWaterfallChart = () => {
    // Calculate running total for waterfall
    let runningTotal = 0;
    const waterfallData = data.map((item) => {
      const start = runningTotal;
      runningTotal += item.value;
      return {
        ...item,
        start,
        end: runningTotal,
        fill: item.value >= 0 ? colors[0] : colors[5] || '#ef4444',
      };
    });

    return (
      <BarChart data={waterfallData}>
        {renderGrid()}
        <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
        <YAxis stroke="#9ca3af" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        {renderLegend()}
        {/* Invisible bar for positioning */}
        <Bar dataKey="start" stackId="waterfall" fill="transparent" {...commonProps} />
        {/* Actual value bars */}
        <Bar dataKey="value" stackId="waterfall" {...commonProps}>
          {waterfallData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    );
  };

  const renderParetoChart = () => {
    // Calculate cumulative percentage
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let cumulative = 0;
    const paretoData = data.map((item) => {
      cumulative += item.value;
      return {
        ...item,
        cumulative: (cumulative / total) * 100,
      };
    });

    return (
      <ComposedChart data={paretoData}>
        {renderGrid()}
        <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" stroke="#9ca3af" tickFormatter={formatYAxis} />
        <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip content={<CustomTooltip />} />
        {renderLegend()}
        <Bar yAxisId="left" dataKey="value" fill={colors[0]} radius={[4, 4, 0, 0]} {...commonProps} />
        <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={colors[1]} strokeWidth={2} dot={{ r: 4 }} {...commonProps} />
        <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="3 3" />
      </ComposedChart>
    );
  };

  const renderLollipopChart = () => (
    <ComposedChart data={data} layout="vertical">
      {renderGrid()}
      <XAxis type="number" stroke="#9ca3af" tickFormatter={formatYAxis} />
      <YAxis
        type="category"
        dataKey="name"
        width={120}
        stroke="#9ca3af"
        tick={{ fontSize: 11 }}
      />
      <Tooltip content={<CustomTooltip />} />
      {renderLegend()}
      {/* Line from origin to point */}
      <Bar dataKey="value" fill={colors[0]} barSize={3} {...commonProps} />
      {/* Circle at end */}
      <Scatter dataKey="value" fill={colors[0]}>
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
        ))}
      </Scatter>
    </ComposedChart>
  );

  const renderBulletChart = () => {
    const value = data[0]?.value || 0;
    const gaugeConfig = config.gauge || { min: 0, max: 100, target: 80 };

    return (
      <div className="w-full h-16 relative">
        {/* Background ranges */}
        <div className="absolute inset-0 flex rounded overflow-hidden">
          <div className="h-full bg-gray-700" style={{ width: '60%' }} />
          <div className="h-full bg-gray-600" style={{ width: '25%' }} />
          <div className="h-full bg-gray-500" style={{ width: '15%' }} />
        </div>
        {/* Value bar */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1/2 rounded"
          style={{
            width: `${Math.min((value / gaugeConfig.max) * 100, 100)}%`,
            backgroundColor: colors[0],
          }}
        />
        {/* Target marker */}
        {gaugeConfig.target && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-white"
            style={{ left: `${(gaugeConfig.target / gaugeConfig.max) * 100}%` }}
          />
        )}
        {/* Labels */}
        <div className="absolute -bottom-6 left-0 text-xs text-gray-400">
          {config.is_currency ? formatCurrency(value) : value}
        </div>
      </div>
    );
  };

  const renderSparkline = () => (
    <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
      <Line
        type="monotone"
        dataKey="value"
        stroke={colors[0]}
        strokeWidth={1.5}
        dot={false}
        {...commonProps}
      />
    </LineChart>
  );

  const renderCalendarHeatmap = () => {
    // Simple grid-based heatmap
    const maxValue = Math.max(...data.map((d) => d.value));

    return (
      <div className="grid grid-cols-7 gap-1 p-4">
        {data.map((item, idx) => {
          const intensity = item.value / maxValue;
          return (
            <div
              key={idx}
              className="aspect-square rounded-sm cursor-pointer hover:ring-2 hover:ring-white/50 transition-all"
              style={{
                backgroundColor: `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
              }}
              title={`${item.name}: ${item.value}`}
              onClick={() => handleChartClick({ payload: item })}
            />
          );
        })}
      </div>
    );
  };

  const renderSlopeChart = () => {
    // Slope chart shows change between two periods
    return (
      <div className="flex justify-between items-center h-full px-8">
        {/* Left axis */}
        <div className="flex flex-col gap-2">
          {data.slice(0, 5).map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-sm text-gray-400 w-24 truncate">{item.name}</span>
              <span className="text-white font-medium">
                {config.is_currency ? formatCurrency(item.value) : item.value}
              </span>
            </div>
          ))}
        </div>
        {/* Connecting lines */}
        <svg className="flex-1 h-full mx-4" preserveAspectRatio="none">
          {data.slice(0, 5).map((_, idx) => {
            const y1 = 20 + idx * 30;
            const y2 = 20 + idx * 30;
            return (
              <line
                key={idx}
                x1="0"
                y1={y1}
                x2="100%"
                y2={y2}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
              />
            );
          })}
        </svg>
        {/* Right axis */}
        <div className="flex flex-col gap-2">
          {data.slice(0, 5).map((item, idx) => {
            const anyItem = item as any;
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-white font-medium">
                  {config.is_currency ? formatCurrency(anyItem.value2 || item.value) : (anyItem.value2 || item.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Select chart renderer based on type
  const renderChart = () => {
    switch (chartState.chartType) {
      case 'bar':
        return renderBarChart();
      case 'horizontal_bar':
        return renderHorizontalBarChart();
      case 'stacked_bar':
        return renderStackedBarChart();
      case 'line':
        return renderLineChart();
      case 'area':
        return renderAreaChart();
      case 'pie':
        return renderPieChart();
      case 'scatter':
        return renderScatterChart();
      case 'bubble':
        return renderBubbleChart();
      case 'combo':
        return renderComboChart();
      case 'radar':
        return renderRadarChart();
      case 'treemap':
        return renderTreemap();
      case 'funnel':
        return renderFunnelChart();
      case 'gauge':
        return renderGaugeChart();
      case 'waterfall':
        return renderWaterfallChart();
      case 'pareto':
        return renderParetoChart();
      case 'lollipop':
        return renderLollipopChart();
      case 'bullet':
        return renderBulletChart();
      case 'sparkline':
        return renderSparkline();
      case 'calendar_heatmap':
        return renderCalendarHeatmap();
      case 'slope':
        return renderSlopeChart();
      default:
        return renderBarChart();
    }
  };

  // Determine height based on chart type
  const getChartHeight = () => {
    switch (chartState.chartType) {
      case 'sparkline':
        return 60;
      case 'bullet':
        return 80;
      case 'gauge':
        return 200;
      default:
        return 300;
    }
  };

  return (
    <div
      ref={chartRef}
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowSettings(false);
      }}
    >
      {/* Toolbar - appears on hover (outside export ref so it's not captured in image) */}
      <div
        className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <ChartToolbar
          chartRef={exportRef}
          data={data}
          title={chartState.title || config.title || 'chart'}
          onSettingsClick={() => setShowSettings(!showSettings)}
        />
      </div>

      {/* Customization Panel */}
      {showSettings && (
        <div className="absolute top-12 right-2 z-20">
          <ChartCustomizationPanel
            chartState={chartState}
            currentType={config.type as ChartType}
            availableFields={availableFields}
            data={sourceDataForFields}
            onStateChange={handleStateChange}
            onDataMappingChange={handleDataMappingChange}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}

      {/* Export container - wraps only title + chart for clean image export */}
      <div ref={exportRef}>
        {/* Title */}
        {chartState.title && (
          <h4 className="text-sm font-medium text-gray-300 mb-2">{chartState.title}</h4>
        )}

        {/* Chart */}
        <ResponsiveContainer width="100%" height={getChartHeight()}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default EnhancedChartRenderer;
