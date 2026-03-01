/**
 * Chart Toolbar Component
 * Provides export (PNG, CSV, copy) and settings buttons for charts
 */

import { useState } from 'react';
import { FileSpreadsheet, Copy, Settings, Check, Image } from 'lucide-react';
import { exportChartAsImage, exportAsCSV, copyTableToClipboard } from '../../utils/chartExportEnhanced';
import type { ChartDataPoint } from '../../types/enhancedChart';

interface ChartToolbarProps {
  chartRef: React.RefObject<HTMLDivElement | null>;
  data: ChartDataPoint[];
  title: string;
  onSettingsClick: () => void;
  className?: string;
}

export function ChartToolbar({
  chartRef,
  data,
  title,
  onSettingsClick,
  className = '',
}: ChartToolbarProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'csv' | null>(null);

  const handleExportPNG = async () => {
    if (!chartRef.current) return;

    setExporting('png');
    try {
      await exportChartAsImage(chartRef.current, title || 'chart', 'png');
    } catch (error) {
      console.error('Failed to export chart as PNG:', error);
    } finally {
      setExporting(null);
    }
  };

  const handleExportCSV = () => {
    setExporting('csv');
    try {
      // Flatten data for CSV export
      const csvData = data.map(point => ({
        name: point.fullName || point.name,
        value: point.value,
        ...(point.units !== undefined ? { units: point.units } : {}),
      }));
      exportAsCSV(csvData, title || 'chart-data');
    } catch (error) {
      console.error('Failed to export as CSV:', error);
    } finally {
      setExporting(null);
    }
  };

  const handleCopy = async () => {
    try {
      const csvData = data.map(point => ({
        name: point.fullName || point.name,
        value: point.value,
        ...(point.units !== undefined ? { units: point.units } : {}),
      }));
      await copyTableToClipboard(csvData);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div
      className={`flex items-center gap-1 bg-gray-800/90 rounded-lg px-2 py-1 backdrop-blur-sm ${className}`}
    >
      {/* Export as PNG */}
      <button
        onClick={handleExportPNG}
        disabled={exporting === 'png'}
        title="Export as PNG"
        className="p-1.5 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
      >
        {exporting === 'png' ? (
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Image className="w-4 h-4 text-gray-400 hover:text-white" />
        )}
      </button>

      {/* Export as CSV */}
      <button
        onClick={handleExportCSV}
        disabled={exporting === 'csv'}
        title="Export as CSV"
        className="p-1.5 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
      >
        {exporting === 'csv' ? (
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <FileSpreadsheet className="w-4 h-4 text-gray-400 hover:text-white" />
        )}
      </button>

      {/* Copy to clipboard */}
      <button
        onClick={handleCopy}
        title="Copy to clipboard"
        className="p-1.5 hover:bg-gray-700 rounded transition-colors"
      >
        {copySuccess ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
        )}
      </button>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 mx-1" />

      {/* Settings */}
      <button
        onClick={onSettingsClick}
        title="Chart settings"
        className="p-1.5 hover:bg-gray-700 rounded transition-colors"
      >
        <Settings className="w-4 h-4 text-gray-400 hover:text-white" />
      </button>
    </div>
  );
}

export default ChartToolbar;
