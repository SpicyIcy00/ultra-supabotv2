import axios from 'axios';
import type { ProductSalesReportResponse, Store } from '../types/report';
import { transformDataForSheets } from '../config/sheetsMapping';

// Use relative URL to leverage Vercel rewrite proxy (avoids CORS)
const API_BASE_URL = '';  // Empty because we append /api/v1 below
const API_V1_PREFIX = '/api/v1';
const GOOGLE_SHEETS_WEB_APP_URL = import.meta.env.VITE_GOOGLE_SHEETS_URL || '';

/**
 * Fetch list of stores
 */
export const fetchStores = async (): Promise<Store[]> => {
  // Use the analytics/stores endpoint which is already available
  const response = await axios.get<Array<{ id: string, name: string }>>(`${API_BASE_URL}${API_V1_PREFIX}/analytics/stores`);
  // Map to Store type (analytics endpoint returns minimal data)
  return response.data.map(store => ({
    ...store,
    address1: null,
    address2: null,
    city: null,
    state: null,
    country: null,
    postal_code: null,
    phone: null,
    email: null,
    website: null,
    created_at: '',
    updated_at: ''
  }));
};

/**
 * Fetch product sales report
 *
 * @param salesStoreId - Store ID for sales data
 * @param compareStoreIds - Store IDs for comparison (inventory and sales)
 * @param start - Start datetime in ISO format with timezone (e.g., 2024-01-01T00:00:00+08:00)
 * @param end - End datetime in ISO format with timezone (e.g., 2024-01-31T23:59:59+08:00)
 * @param categories - Optional: Filter by product categories
 * @param min_quantity - Optional: Minimum quantity sold
 * @param max_quantity - Optional: Maximum quantity sold
 * @param limit - Optional: Limit number of results (top N)
 * @param sort_by - Optional: Field to sort by
 * @param sort_order - Optional: Sort order (asc/desc)
 * @param search - Optional: Search text
 * @param min_price - Optional: Minimum unit price
 * @param max_price - Optional: Maximum unit price
 * @param min_profit_margin - Optional: Minimum profit margin percentage
 * @param max_profit_margin - Optional: Maximum profit margin percentage
 * @param days_of_week - Optional: Filter by days of week
 */
export const fetchProductSalesReport = async (
  salesStoreId: string,
  compareStoreIds: string[],
  start: string,
  end: string,
  categories?: string[],
  min_quantity?: number,
  max_quantity?: number,
  limit?: number,
  sort_by?: string,
  sort_order?: string,
  search?: string,
  min_price?: number,
  max_price?: number,
  min_profit_margin?: number,
  max_profit_margin?: number,
  days_of_week?: string[]
): Promise<ProductSalesReportResponse> => {
  const params: any = {
    sales_store_id: salesStoreId,
    compare_store_ids: compareStoreIds,
    start,
    end,
  };

  // Add optional filters
  if (categories && categories.length > 0) params.categories = categories;
  if (min_quantity !== undefined) params.min_quantity = min_quantity;
  if (max_quantity !== undefined) params.max_quantity = max_quantity;
  if (limit) params.limit = limit;
  if (sort_by) params.sort_by = sort_by;
  if (sort_order) params.sort_order = sort_order;
  if (search) params.search = search;
  if (min_price !== undefined) params.min_price = min_price;
  if (max_price !== undefined) params.max_price = max_price;
  if (min_profit_margin !== undefined) params.min_profit_margin = min_profit_margin;
  if (max_profit_margin !== undefined) params.max_profit_margin = max_profit_margin;
  if (days_of_week && days_of_week.length > 0) params.days_of_week = days_of_week;

  const response = await axios.get<ProductSalesReportResponse>(
    `${API_BASE_URL}${API_V1_PREFIX}/reports/product-sales`,
    {
      params,
      paramsSerializer: {
        indexes: null // This makes axios send arrays without brackets: key=val1&key=val2
      }
    }
  );

  return response.data;
};

/**
 * Export report data to CSV
 *
 * Exact column order: product_name, sku, product_id, quantity_sold, store_inv, warehouse_inv
 * @param data - Report data to export
 * @param storeName - Name of the primary store for the filename
 */
export const exportReportToCSV = (data: ProductSalesReportResponse, salesStoreName: string, allStores: Store[]): void => {
  // Base headers
  const headers = [
    'Product Name',
    'SKU',
    'Product ID',
    'Quantity Sold',
    'Revenue',
    `${salesStoreName} Inv`, // Sales store inventory
  ];

  // Add headers for each comparison store
  data.meta.compare_store_ids.forEach(storeId => {
    const store = allStores.find(s => s.id === storeId);
    const storeName = store ? store.name : storeId;
    headers.push(`${storeName} Qty`);
    headers.push(`${storeName} Inv`);
    headers.push(`${storeName} Rev`);
  });

  // Convert rows to CSV format
  const csvRows = [
    headers.join(','), // Header row
    ...data.rows.map(row => {
      const baseColumns = [
        escapeCsvValue(row.product_name),
        escapeCsvValue(row.sku ?? ''),
        escapeCsvValue(row.product_id),
        row.quantity_sold.toString(),
        row.revenue.toFixed(2),
        row.inventory_sales_store.toString(),
      ];

      // Add columns for each comparison store
      const comparisonColumns: string[] = [];
      data.meta.compare_store_ids.forEach(storeId => {
        const compData = row.comparison_stores[storeId];
        if (compData) {
          comparisonColumns.push(compData.quantity_sold.toString());
          comparisonColumns.push(compData.inventory.toString());
          comparisonColumns.push(compData.revenue.toFixed(2));
        } else {
          // Fallback if data is missing for some reason
          comparisonColumns.push('0', '0', '0.00');
        }
      });

      return [...baseColumns, ...comparisonColumns].join(',');
    }),
  ];

  const csvContent = csvRows.join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  // Generate filename with store name and timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // Sanitize store name for use in filename
  const sanitizedStoreName = salesStoreName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `product-sales-report-${sanitizedStoreName}-${timestamp}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Escape CSV values to handle commas, quotes, and newlines
 */
function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Post report data to Google Sheets via backend proxy (avoids CORS issues)
 *
 * @param data - Report data to post
 * @param sheetName - Name of the sheet tab to post to (corresponds to store name)
 * @param sheetsUrl - Optional Google Sheets Web App URL (overrides env variable)
 * @returns Promise with response status
 */
export const postReportToSheets = async (
  data: ProductSalesReportResponse,
  sheetName: string,
  sheetsUrl?: string
): Promise<{ success: boolean; message: string; rowsWritten?: number; sheetName?: string }> => {
  const url = sheetsUrl || GOOGLE_SHEETS_WEB_APP_URL;

  if (!sheetName) {
    throw new Error('Sheet name is required. Please select a store.');
  }

  try {
    // Transform data according to mapping configuration
    const transformedData = transformDataForSheets(data.rows);

    console.log('=== Posting to Google Sheets via Backend Proxy ===');
    console.log('Sheet Name:', sheetName);
    console.log('Row Count:', transformedData.length);
    console.log('Sample Data (first 3 rows):', transformedData.slice(0, 3));

    // Use backend proxy to avoid CORS issues
    const response = await axios.post(`${API_BASE_URL}${API_V1_PREFIX}/sheets/post-to-sheets`, {
      sheetName: sheetName,
      data: transformedData,
      sheetsUrl: url || undefined  // Pass the URL to backend if configured
    });

    console.log('=== Backend Proxy Response ===');
    console.log('Response:', response.data);

    if (response.data.success) {
      return {
        success: true,
        message: response.data.message || `Posted ${transformedData.length} rows to "${sheetName}" tab`,
        rowsWritten: response.data.rowsWritten || transformedData.length,
        sheetName: sheetName,
      };
    } else {
      throw new Error(response.data.error || response.data.message || 'Unknown error');
    }

  } catch (error: any) {
    // Log detailed error information for debugging
    console.error('Google Sheets Post Error Details:', {
      message: error.message,
      name: error.name,
      response: error.response?.data
    });

    // Handle various error scenarios
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    } else if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    } else {
      throw new Error(`Failed to post to Google Sheets: ${error.message}`);
    }
  }
};

