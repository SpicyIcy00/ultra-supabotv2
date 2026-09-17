import axios from 'axios';

export interface StoreAppearance {
  display_name: string | null;
  color: string | null;
}

/** A store as `/analytics/stores` serves it: the colour a person set in Settings. */
export interface StoreRecord {
  id: string;
  name: string;
  display_name: string | null;
  color: string | null;
}

/** Every store's own display name and colour, as Settings saved them. */
export const readStoreAppearance = async (): Promise<StoreRecord[]> => {
  const { data } = await axios.get<StoreRecord[]>('/api/v1/analytics/stores');
  return Array.isArray(data) ? data : [];
};

export const updateStoreAppearance = async (
  storeId: string,
  appearance: StoreAppearance
): Promise<void> => {
  await axios.patch(`/api/v1/analytics/stores/${storeId}`, appearance);
};
