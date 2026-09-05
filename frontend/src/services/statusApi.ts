/**
 * The status band's data.
 *
 * Bare axios like every other George service. Deliberately does NOT carry the
 * needs-you count: that comes from GET /workflows/approvals, which is the
 * queue's one source, and a second count computed elsewhere could disagree
 * with the rail it sits above.
 */
import axios from 'axios';
import type { StatusBandData } from '../components/george/statusState';

export const readStatus = async (): Promise<StatusBandData> => {
  const { data } = await axios.get<StatusBandData>('/api/v1/george/status');
  return data;
};
