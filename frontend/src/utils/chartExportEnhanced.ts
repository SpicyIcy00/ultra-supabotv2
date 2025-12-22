/**
 * Enhanced Chart Export Utilities
 *
 * Provides functions to export charts and tables to various formats:
 * - PNG, JPG, SVG (for charts)
 * - CSV (for table data)
 */


/**
 * Export chart as image (PNG, JPG, or SVG)
 */
export async function exportChartAsImage(
  chartElement: HTMLElement,
  filename: string,
  format: 'png' | 'jpg' | 'svg' = 'png',
  quality: number = 0.95
): Promise<void> {
  try {
    // Find the SVG element inside the chart container
    const svgElement = chartElement.querySelector('svg');

    if (!svgElement) {
      throw new Error('No SVG element found in chart');
    }

    if (format === 'svg') {
      // Export as SVG (vector format)
      await exportAsSVG(svgElement, filename);
    } else {
      // Export as raster image (PNG or JPG)
      await exportAsRasterImage(svgElement, filename, format, quality);
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}

/**
 * Export SVG directly (vector format, best for print)
 */
async function exportAsSVG(svgElement: SVGElement, filename: string): Promise<void> {
  // Clone the SVG to avoid modifying the original
  const svgClone = svgElement.cloneNode(true) as SVGElement;

  // Add XML declaration and namespace
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgClone);

  // Add XML declaration if not present
  if (!svgString.startsWith('<?xml')) {
    svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
  }

  // Create blob and download
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${filename}.svg`);
}

/**
 * Export SVG as raster image (PNG or JPG)
 */
async function exportAsRasterImage(
  svgElement: SVGElement,
  filename: string,
  format: 'png' | 'jpg',
  quality: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Get SVG dimensions
      const bbox = svgElement.getBoundingClientRect();
      const width = bbox.width;
      const height = bbox.height;

      // Create canvas
      const canvas = document.createElement('canvas');
      const scale = 2; // 2x for retina displays
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Scale for high DPI
      ctx.scale(scale, scale);

      // For JPG, fill background with white
      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      // Serialize SVG to data URL
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Load SVG into image
      const img = new Image();

      img.onload = () => {
        // Draw image to canvas
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              downloadBlob(blob, `${filename}.${format}`);
              resolve();
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          format === 'jpg' ? 'image/jpeg' : 'image/png',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };

      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Export table data as CSV
 */
export function exportAsCSV(
  data: any[],
  filename: string
): void {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Get column headers
  const headers = Object.keys(data[0]);

  // Create CSV content
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(escapeCSVValue).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return escapeCSVValue(value);
    });
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Escape CSV values (handle quotes, commas, newlines)
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If value contains comma, quote, or newline, wrap in quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Escape quotes by doubling them
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy table data to clipboard as tab-separated values (for pasting into Excel)
 */
export async function copyTableToClipboard(data: any[]): Promise<void> {
  if (data.length === 0) {
    throw new Error('No data to copy');
  }

  // Get column headers
  const headers = Object.keys(data[0]);

  // Create TSV content (tab-separated values)
  const tsvRows: string[] = [];

  // Add header row
  tsvRows.push(headers.join('\t'));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return value === null || value === undefined ? '' : String(value);
    });
    tsvRows.push(values.join('\t'));
  }

  const tsvContent = tsvRows.join('\n');

  // Copy to clipboard
  await navigator.clipboard.writeText(tsvContent);
}

/**
 * Analyze data to determine best chart type
 */
export function detectChartType(data: any[]): {
  type: 'line' | 'bar' | 'pie' | 'area' | 'table';
  xKey?: string;
  yKeys?: string[];
  nameKey?: string;
  dataKey?: string;
} {
  if (data.length === 0) {
    return { type: 'table' };
  }

  const firstRow = data[0];
  const keys = Object.keys(firstRow);

  if (keys.length < 2) {
    return { type: 'table' };
  }

  // Identify column types
  const dateColumns: string[] = [];
  const numericColumns: string[] = [];
  const stringColumns: string[] = [];

  for (const key of keys) {
    const value = firstRow[key];
    const keyLower = key.toLowerCase();

    // Skip ID columns - treat them as strings even if they're numbers
    if (keyLower === 'id' || keyLower.endsWith('_id') || keyLower === 'product_id' || keyLower === 'store_id') {
      // Don't add ID columns to any category - they'll be ignored
      continue;
    }

    // Check if it's a date
    if (isDateLike(value)) {
      dateColumns.push(key);
    }
    // Check if it's numeric (and not an ID)
    else if (typeof value === 'number' || !isNaN(Number(value))) {
      numericColumns.push(key);
    }
    // Otherwise it's a string/categorical
    else {
      stringColumns.push(key);
    }
  }

  // Decision logic:

  // Time series: date column + numeric columns -> Line chart
  if (dateColumns.length > 0 && numericColumns.length > 0) {
    return {
      type: 'line',
      xKey: dateColumns[0],
      yKeys: numericColumns
    };
  }

  // Categorical comparison: string column + numeric column(s) -> Bar chart
  if (stringColumns.length > 0 && numericColumns.length > 0) {
    // Prioritize 'name' column as X-axis if it exists
    const nameColumn = stringColumns.find(col =>
      col.toLowerCase() === 'name' ||
      col.toLowerCase() === 'product_name' ||
      col.toLowerCase() === 'store_name' ||
      col.toLowerCase() === 'category'
    );
    const xKey = nameColumn || stringColumns[0];

    // Filter out ID columns from numeric columns (they shouldn't be charted)
    const chartableNumericColumns = numericColumns.filter(col =>
      !col.toLowerCase().includes('id') &&
      !col.toLowerCase().includes('_id')
    );

    // Use line chart ONLY for time series data (hours, dates, time)
    // This prevents line charts from being used for categorical data like product names
    if (
      xKey.toLowerCase().includes('hour') ||
      xKey.toLowerCase().includes('date') ||
      xKey.toLowerCase().includes('time') ||
      xKey.toLowerCase().includes('day') ||
      xKey.toLowerCase().includes('month') ||
      xKey.toLowerCase().includes('year')
    ) {
      return {
        type: 'line',
        xKey: xKey,
        yKeys: chartableNumericColumns
      };
    }

    // For categorical data (products, stores, categories), use bar or pie chart
    // If only one numeric column and few categories, consider pie chart
    if (chartableNumericColumns.length === 1 && data.length <= 5) {
      return {
        type: 'pie',
        nameKey: xKey,
        dataKey: chartableNumericColumns[0]
      };
    }

    // Default to bar chart for categorical data (products, stores, etc.)
    return {
      type: 'bar',
      xKey: xKey,
      yKeys: chartableNumericColumns
    };
  }

  // Too many rows or complex data -> Table
  if (data.length > 50) {
    return { type: 'table' };
  }

  // Default to table
  return { type: 'table' };
}

/**
 * Check if a value looks like a date
 */
function isDateLike(value: any): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const str = String(value);

  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return true;
  }

  // Try parsing as date
  const date = new Date(str);
  return !isNaN(date.getTime());
}

export default {
  exportChartAsImage,
  exportAsCSV,
  copyTableToClipboard,
  detectChartType
};
