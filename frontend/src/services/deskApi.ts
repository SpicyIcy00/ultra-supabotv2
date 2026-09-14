/**
 * The desk's two reads that are not George: the definitions it is drawn
 * from, and a replay of one call already on screen.
 *
 * Bare axios, matching pinsApi and riverApi. Both routes sit behind George's
 * own page gate. Neither consults a model: the definitions are metrics.yaml
 * served, and a replay is the pin runner over a call the loop recorded.
 */
import axios from 'axios';
import type { CompositionBlock, DeskDimension, GeorgeNotice, ToolMeta } from '../types/george';
import type { PinStatus, PinToolCall } from '../types/pins';

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
  /**
   * The subject dimensions SOME metric can be broken down by — not the
   * headline metric's own, because net sales refuses a product grouping while
   * the investigation ladder localizes by product through product revenue.
   * Served, so the client never decides what the definitions permit.
   */
  breakdown_dimensions: DeskDimension[];
}

export const readDeskDefinitions = async (): Promise<DeskDefinitions> => {
  const { data } = await axios.get<DeskDefinitions>(`${API_BASE}/definitions/desk`);
  return data;
};

/** Mirrors ReplayOut in backend/app/api/v1/routes/george.py. */
export interface ReplayOut {
  status: PinStatus;
  tool: string;
  seq: number;
  argument: string;
  /** What the stored call had, so the change itself has a receipt. */
  was: unknown;
  value: unknown;
  arguments: Record<string, unknown>;
  rows: Record<string, unknown>[];
  meta: ToolMeta;
  notices: GeorgeNotice[];
  /** The tool's own words when it refused. Never rephrased here. */
  refusal: string | null;
  /**
   * The board frame: validated blocks from the same default composer the loop
   * uses, which names a shape for rows and never a word about them. Empty for
   * a refusal, for no rows, and for more rows than a screen is sent.
   */
  blocks: CompositionBlock[];
  duration_ms: number;
  /** Whether the change reached the post. False is a real outcome, not a failure. */
  recorded: boolean;
  ran_at: string;
}

/**
 * Run ONE stored read again with ONE scope argument changed. No model.
 *
 * The call is NAMED, not sent: `post` and `seq` address a call the loop
 * recorded, and every argument but the changed one comes off that record. A
 * tool's refusal comes back as a status and its own sentence, never as a
 * failed request.
 */
export const replayStoredCall = async (
  post: string, seq: number, argument: string, value: unknown,
): Promise<ReplayOut> => {
  const { data } = await axios.post<ReplayOut>(
    `${API_BASE}/replay`, { post, seq, argument, value });
  return data;
};
