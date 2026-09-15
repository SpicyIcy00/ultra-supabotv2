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

/** One value a token may be moved to, with what a person may type for it. */
export interface DeskAlternative {
  value: unknown;
  label: string;
  /**
   * What resolves to this alternative when TYPED. Served, so matching is a
   * lookup in a list the definitions own — no stemming, no fuzzy match, no
   * "did you mean" anywhere on the client (metrics.yaml
   * surface.desk.tokens.spoken).
   */
  spellings: string[];
  /**
   * The word `permitted_by` names this alternative by, for a token whose
   * alternatives depend on something the call carries. Null for one whose
   * alternatives are the same on every call.
   */
  permit_key?: string | null;
}

/**
 * One part of the estate a question may be scoped to (P2.g) — a business, its
 * words, and the places it covers resolved to their display names on the
 * server. The client never holds a shop's name or counts one.
 */
export interface DeskEstatePart {
  key: string;
  label: string;
  says: string | null;
  /**
   * The places this part covers, by display name. Empty for a business whose
   * places are not shops — vending's are machines, which live in Weimi.
   */
  places: string[];
}

/** The switch: what it is called, what a question means untouched, its parts. */
export interface DeskEstate {
  label: string;
  /** The part a question is on before anybody presses anything. Never sent. */
  default: string;
  parts: DeskEstatePart[];
}

/** One argument the loop accepted, as a thing a person can move. */
export interface DeskToken {
  argument: string;
  /** What moving it costs: `navigation` skips the model, `analytical` does not. */
  kind: 'navigation' | 'analytical';
  label: string;
  alternatives: DeskAlternative[];
  /**
   * Which alternatives a call actually permits, and what decides it. A
   * `group_by` token offering a cut the tool will refuse is worse than no
   * token: `net_sales` is transaction grain and declines a product grouping
   * in its own sentence. Served, so what a call permits is the metric's own
   * list and never a rule worked out here.
   */
  permitted_by?: { argument: string; permits: Record<string, string[]> } | null;
}

/** Mirrors DeskDefinitions in backend/app/api/v1/routes/george.py. */
export interface DeskDefinitions {
  business: { name: string; short: string };
  windows: DeskWindowDef[];
  /** Which argument carries a window, per tool (workflows.backtest.window_arguments). */
  window_arguments: Record<string, string>;
  rest_reads: PinToolCall[];
  /**
   * The selection's own definitions, whole (`surface.desk.selection`). Which
   * column of a row IS the subject's id, which columns carry its label, the
   * words that turn two picked subjects into a replay, and the kinds an `@`
   * resolves over. Served, so no client holds a copy of any of it.
   */
  selection: {
    dimensions: DeskDimension[];
    max_subjects: number;
    identity: Record<string, string>;
    label_columns?: Record<string, string[]>;
    comparison?: {
      spoken: string[];
      min_subjects: number;
      replays_by_dimension: Record<string, string>;
    };
    mentions?: {
      trigger: string;
      min_prefix: number;
      max_per_kind: number;
      max_results: number;
      kinds: Record<string, { binds: string; says: string; dimension?: string }>;
    };
  };
  direct_manipulation: string[];
  locations: DeskLocation[];
  /**
   * The subject dimensions SOME metric can be broken down by — not the
   * headline metric's own, because net sales refuses a product grouping while
   * the investigation ladder localizes by product through product revenue.
   * Served, so the client never decides what the definitions permit.
   */
  breakdown_dimensions: DeskDimension[];
  /**
   * Which businesses a question may be scoped to, and the places each covers
   * (metrics.yaml surface.desk.estate). The pills are drawn from this and
   * from nothing else.
   */
  estate: DeskEstate;
  /** The tokens a drawn read may carry, alternatives already resolved. */
  tokens: DeskToken[];
  /**
   * `surface.desk.replay`, as the definitions state it. Where each argument
   * lands in a call's own arguments (a `path`, or a `per_tool` pointer
   * resolved through `window_arguments`), which argument a composed control
   * names, which changes change the shape of the rows, and how much of the
   * record is read back on opening. Never keep a copy of any of it.
   */
  replay: {
    arguments: Record<string, { path?: string[]; per_tool?: string }>;
    from_control: Record<string, string>;
    changes_shape: string[];
    max_restored_per_open: number;
    /**
     * The words a reader must never see (`surface.prose.leaks`, the same list
     * the loop scans an answer with) and the line that replaces a refusal
     * carrying one. Served here so no component keeps a second copy.
     */
    leaks?: string[];
    refused_leaks_says?: string;
    refused_detail_word?: string;
    [key: string]: unknown;
  };
  /** How short a fragment may be, and the one token that costs a turn. */
  fragments: {
    max_words: number;
    correction: { token: string; asks: string };
    [key: string]: unknown;
  };
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
  /**
   * False when the read returned more rows than a screen is sent, in which
   * case `rows` is empty: all of them or none, never a prefix. The board does
   * not move, and the room says so in the definitions' own sentence
   * (`replay.rows_incomplete_says`).
   */
  rows_complete: boolean;
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
