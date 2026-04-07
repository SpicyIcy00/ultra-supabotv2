import axios from 'axios';

export interface StoreAppearance {
  display_name: string | null;
  color: string | null;
}

export const updateStoreAppearance = async (
  storeId: string,
  appearance: StoreAppearance
): Promise<void> => {
  await axios.patch(`/api/v1/analytics/stores/${storeId}`, appearance);
};
