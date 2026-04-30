import axios from 'axios';

const API_V1 = '/api/v1';

export interface BarcodeEntry {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string;       // EAN-13 (13 digits)
  base_digits: string;   // first 12 digits
  already_existed?: boolean;
}

export interface GenerateBarcodesResponse {
  generated: BarcodeEntry[];
  skipped: string[];     // product_ids that already had a barcode
}

export interface BarcodeRecord {
  id: number;
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string;
  base_digits: string | null;
  generated_at: string;
}

/**
 * Generate EAN-13 barcodes for the given product IDs and persist them.
 * prefix defaults to "200" (GS1 in-store restricted circulation range).
 */
export const generateBarcodes = async (
  productIds: string[],
  prefix = '200',
): Promise<GenerateBarcodesResponse> => {
  const response = await axios.post<GenerateBarcodesResponse>(`${API_V1}/barcodes/generate`, {
    product_ids: productIds,
    prefix,
  });
  return response.data;
};

/** Fetch all saved barcode assignments. */
export const listBarcodes = async (): Promise<BarcodeRecord[]> => {
  const response = await axios.get<BarcodeRecord[]>(`${API_V1}/barcodes/`);
  return response.data;
};

/** Remove a barcode assignment by its DB id. */
export const deleteBarcode = async (barcodeId: number): Promise<void> => {
  await axios.delete(`${API_V1}/barcodes/${barcodeId}`);
};

/**
 * Upload a StoreHub Products export CSV, patch the Barcode column from
 * product_barcodes (matched by SKU), and return the modified CSV blob.
 */
export const processStoreHubCsv = async (file: File): Promise<{ blob: Blob; patchedCount: number }> => {
  const form = new FormData();
  form.append('file', file);
  const response = await axios.post(`${API_V1}/barcodes/process-csv`, form, {
    responseType: 'blob',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const patchedCount = parseInt(response.headers['x-patched-count'] ?? '0', 10);
  return { blob: response.data as Blob, patchedCount };
};

export interface BarcodeLookupResult {
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string;
  source: 'generated' | 'storehub';
  category: string | null;
  unit_price: number | null;
}

/** Look up a product by its EAN-13 barcode value. */
export const lookupBarcode = async (barcode: string): Promise<BarcodeLookupResult> => {
  const response = await axios.get<BarcodeLookupResult>(`${API_V1}/barcodes/lookup/${barcode}`);
  return response.data;
};

/**
 * Fetch products from the live StoreHub API (read-only).
 * StoreHub has no product update endpoint — barcodes must be entered manually
 * in the StoreHub Back Office.
 */
export const fetchStoreHubProducts = async (): Promise<{
  products: any[];
  note: string;
}> => {
  const response = await axios.get(`${API_V1}/barcodes/storehub/products`);
  return response.data;
};
