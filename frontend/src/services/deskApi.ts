/**
 * The desk's two reads that are not George: the definitions it is drawn
 * from, and a replay of calls already on screen.
 *
 * Bare axios, matching pinsApi and riverApi. Both routes sit behind George's
 * own page gate. Neither consults a model: the definitions are metrics.yaml
 * served, and a replay is the pin runner over calls a pin could hold.
 */
import axios from 'axios';
import type { DeskDimension, GeorgeNotice } from '../types/george';
import type { PinCallResult, PinToolCall } from '../types/pins';

const API_BASE = '/api/v1/george';

/** One date preset as the definitions state it (metrics.yaml sales_day.presets). */
export interface DeskWindowDef {
  name: string;
  includes_partial_day: boolean;
  closed_alternative: string | null;
  relative: Record<string, unknown>;
}

export interface DeskLocation {
  id: string;
  display_name: string;
  kind: 'retail' | 'warehouse';
}

/** Mirrors DeskDefinitions in backend/app/api/v1/routes/george.py. */
export interface DeskDefinitions {
  business: { name: string; short: string };
  windows: DeskWindowDef[];
  /** Which argument carries a window, per tool (workflows.backtest.window_arguments). */
  window_arguments: Record<string, string>;
  rest_reads: PinToolCall[];
  selection: { dimensions: DeskDimension[]; max_subjects: number; identity: Record<string, string> };
  direct_manipulation: string[];
  locations: DeskLocation[];
}

export const readDeskDefinitions = async (): Promise<DeskDefinitions> => {
  const { data } = await axios.get<DeskDefinitions>(`${API_BASE}/definitions/desk`);
  return data;
};

/** Mirrors ReplayOut. The same per-call shape a pin run returns. */
export interface ReplayOut {
  status: string;
  results: PinCallResult[];
  notices: GeorgeNotice[];
  ran_at: string;
}

/**
 * Re-run calls already on the workspace. Validated as a pin is; a tool's
 * refusal comes back as a status on the call, never as a failed request.
 */
export const replayCalls = async (calls: PinToolCall[]): Promise<ReplayOut> => {
  const { data } = await axios.post<ReplayOut>(`${API_BASE}/replay`, { calls });
  return data;
};
