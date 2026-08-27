import axios from 'axios';

const API_BASE = '/api/v1/packing';

/** What staff can enter. kg is converted to grams server-side before storing. */
export type PackUnit = 'packs' | 'kg';
export type PackingStatus = 'pending' | 'in_progress' | 'done';

export interface ProductOption {
  id: string;
  name: string;
  nickname: string | null;
  sku: string | null;
  pack_weight_g: number | null;
}

export interface ItemRecord {
  id: string;
  product_id: string;
  product_name: string;
  nickname: string | null;
  /** Stored unit — 'kg' input is normalised to grams by the API. */
  unit: 'packs' | 'grams';
  quantity: number;
  pack_weight_g_snapshot: number | null;
  /** The amount entered, in kg. */
  total_kg: number | null;
  total_packs: number | null;
  /** What those complete packs actually weigh — packs x pack weight. */
  packed_kg: number | null;
  actual_packed: number | null;
  remarks: string | null;
  discrepancy: number | null;
}

export interface ListTotals {
  total_packs: number;
  total_grams: number;
  total_kg: number;
  total_packed_kg: number;
  item_count: number;
}

export interface ListSummary {
  id: string;
  /** Human-readable list number, e.g. PL0007. */
  reference: string | null;
  category: string | null;
  status: PackingStatus;
  created_by_name: string | null;
  created_at: string;
  totals: ListTotals;
}

export interface ListDetail extends ListSummary {
  items: ItemRecord[];
}

/** Any product, whether or not it has a pack weight yet. */
export interface CatalogProduct {
  id: string;
  name: string;
  nickname: string | null;
  sku: string | null;
  category: string | null;
  pack_weight_g: number | null;
}

export const searchCatalog = async (
  search?: string,
  missingOnly = false,
): Promise<CatalogProduct[]> =>
  (await axios.get<CatalogProduct[]>(`${API_BASE}/catalog`, {
    params: { ...(search ? { search } : {}), missing_only: missingOnly },
  })).data;

export const updateProductPacking = async (
  productId: string,
  payload: { pack_weight_g?: number | null; nickname?: string | null },
): Promise<CatalogProduct> =>
  (await axios.patch<CatalogProduct>(`${API_BASE}/catalog/${productId}`, payload)).data;

/**
 * "27 Aug 2026, 08:03" — readable, unambiguous about the month, and without
 * the seconds that toLocaleString() adds by default.
 *
 * The value is an instant, so the browser renders it in the viewer's own zone.
 */
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const getCategories = async (): Promise<string[]> =>
  (await axios.get<string[]>(`${API_BASE}/categories`)).data;

export const searchProducts = async (search?: string): Promise<ProductOption[]> =>
  (await axios.get<ProductOption[]>(`${API_BASE}/products`, {
    params: search ? { search } : {},
  })).data;

export const createList = async (category?: string): Promise<ListDetail> =>
  (await axios.post<ListDetail>(`${API_BASE}/lists`, { category })).data;

export const getHistory = async (): Promise<ListSummary[]> =>
  (await axios.get<ListSummary[]>(`${API_BASE}/lists`)).data;

export const getList = async (listId: string): Promise<ListDetail> =>
  (await axios.get<ListDetail>(`${API_BASE}/lists/${listId}`)).data;

export const updateList = async (
  listId: string,
  payload: { category?: string; status?: PackingStatus },
): Promise<ListDetail> =>
  (await axios.patch<ListDetail>(`${API_BASE}/lists/${listId}`, payload)).data;

export const deleteList = async (listId: string): Promise<void> => {
  await axios.delete(`${API_BASE}/lists/${listId}`);
};

/** Returns the whole list back, with server-computed totals. */
export const addItem = async (
  listId: string,
  payload: { product_id: string; unit: PackUnit; quantity: number },
): Promise<ListDetail> =>
  (await axios.post<ListDetail>(`${API_BASE}/lists/${listId}/items`, payload)).data;

export const updateItem = async (
  itemId: string,
  payload: {
    unit?: PackUnit;
    quantity?: number;
    actual_packed?: number;
    remarks?: string;
  },
): Promise<ListDetail> =>
  (await axios.patch<ListDetail>(`${API_BASE}/items/${itemId}`, payload)).data;

export const deleteItem = async (itemId: string): Promise<ListDetail> =>
  (await axios.delete<ListDetail>(`${API_BASE}/items/${itemId}`)).data;
