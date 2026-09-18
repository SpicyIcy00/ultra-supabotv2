/**
 * What Bob is doing, in words, while he does it.
 *
 * Kept apart from the components for the same reason markState.ts and
 * pinShape.ts are: the suite tests these decisions without a DOM, and a
 * component file exports only components.
 *
 * TWO THINGS LIVE HERE, AND THEY ARE DIFFERENT.
 *
 *   actName / actLine   what he is doing        — derived from the TOOL
 *   cognitionTail       what he is thinking     — derived from the MODEL
 *
 * The first is ours and is always true: a tool_call frame arrived, so that
 * tool is running. The second is the model's own summarized reasoning, which
 * is worth showing but is not evidence of anything — no number is ever read
 * out of it, and it is never stored.
 *
 * ONE MAP, SO A VOICE LAYER CANNOT DRIFT. A spoken "checking purchasing" and a
 * printed one have to be the same words; when they come from two places they
 * eventually stop matching. This is the one place.
 */
import type { BobState } from '../../types/bob';

/**
 * Tool -> the act, as Bob would say it out loud.
 *
 * Present participle throughout, because it is appended to a mark that is
 * visibly working: "checking purchasing…", not "Check purchasing" and not
 * "get_purchasing". Every tool in agent/loop.py TOOL_FUNCTIONS is here, plus
 * the three injected surfaces from agent/write_tools.py and
 * agent/composite_tools.py — those only appear when a writer or runner was
 * injected, but when they do appear they are the most interesting thing on
 * screen and must not be the only rows still reading as identifiers.
 */
const ACTS: Record<string, string> = {
  // Reads — the figures.
  get_sales: 'reading sales',
  get_stock: 'counting stock',
  get_product: 'looking up the product',
  get_movement: 'tracing movement',
  get_vending: 'reading vending',
  get_vending_stock: 'checking the machines',
  get_dead_stock: 'looking for dead stock',
  get_purchasing: 'checking purchasing',
  get_cost_history: 'reading cost history',
  get_brief: 'reading the morning brief',

  // Injected — present only when the web process passed a writer, a runner
  // or a page reader.
  pin_answer: 'pinning this',
  save_workflow: 'saving the rule',
  run_workflow: 'running the workflow',
  view_page: 'reading the page',
  // The label tool (agent/findings.py). It reads nothing; it says what each
  // read WAS. Named here so the work line never falls back to its identifier.
  record_findings: 'noting what each read was',
  compose: 'composing the workspace',
};

/**
 * The act a tool is performing.
 *
 * An unknown tool falls back to its own name rather than to a generic phrase.
 * A tool added tomorrow then reads exactly as it does today — plainly, as an
 * identifier — instead of being described wrongly by a catch-all like
 * "reading the data", which would claim a read of something that might write.
 */
export function actName(tool: string): string {
  return ACTS[tool] ?? tool;
}

/**
 * Everything in flight, as one line.
 *
 * DEDUPED FIRST. The model dispatches the same tool more than once in one
 * turn as a matter of course — a live turn asked get_purchasing for po_count
 * and again for ordered_value, and both tool_call frames landed before either
 * result — which without this reads "checking purchasing and checking
 * purchasing…". The act is what is being done, not how many calls are doing
 * it, and the tool rows below the mark already show every call.
 *
 * Two names at most after that. Parallel dispatch can put five calls in the
 * air at once, and five acts is a log line rather than a sentence — past two,
 * the count says more than the names would.
 *
 * FROM THE ARGUMENTS WHERE THEY CHANGE THE ACT (added 2026-09-08). A call
 * carrying its arguments is described from them — "comparing transactions
 * and ATP at Rockwell…", "looking at product changes…" — because an
 * investigation issues get_sales five times in a turn and "reading sales…"
 * five times over says nothing true about what is different each time.
 * Every word still comes from the tool_call frame: the metric, the
 * comparison, the grouping and the store filter the loop dispatched. No
 * stage, no plan, no checklist — only the call that was issued.
 */
export function actLine(calls: CallLike[]): string {
  return joinActs(groupActs(calls, 'present'), '…');
}

/* ------------------------------------------------ from the arguments -- */

/**
 * A call as the line needs it: the tool, and the arguments the loop sent
 * with it. A bare tool name is accepted so a caller that only has names
 * still gets a true line — a less specific one.
 */
export type CallLike = string | { tool: string; arguments?: Record<string, unknown> };

/**
 * Metric -> the word Bob would use for it. Read from the tool_call frame's
 * arguments, which are the arguments the loop actually dispatched, so a line
 * built from them describes the call that was issued and nothing else.
 *
 * A metric not in this map is shown as its own key: "reading returns_value"
 * is plain and true, where a guess would describe the wrong figure.
 */
const METRIC_WORDS: Record<string, string> = {
  net_sales: 'sales',
  transaction_count: 'transactions',
  average_transaction_value: 'ATP',
  product_revenue: 'product revenue',
  units_sold: 'units sold',
  returns_value: 'returns',
};

/** One act, split so acts that share a verb and a place can be joined. */
interface Act {
  verb: string;
  subject: string;
  tail: string;
}

const PAST: Record<string, string> = {
  reading: 'read',
  comparing: 'compared',
  'looking at': 'looked at',
};

function groupBy(a: Record<string, unknown>): string[] {
  const g = a.group_by;
  if (Array.isArray(g)) return g.map(String);
  if (typeof g === 'string') return [g];
  return [];
}

/**
 * What one call is doing, from its tool and its arguments.
 *
 * get_sales is the only tool whose arguments change what the act IS —
 * reading a figure, comparing it with the period before, or looking at how
 * it breaks down by product — so it is the only one described from them.
 * Every other tool keeps its one phrase. Nothing here is a business figure,
 * a stage, or a plan: it is the call, in words.
 */
export function describeCall(call: CallLike, tense: 'present' | 'past'): Act {
  const tool = typeof call === 'string' ? call : call.tool;
  const a = typeof call === 'string' ? {} : (call.arguments ?? {});
  const past = tense === 'past';

  if (tool !== 'get_sales') {
    const phrase = past ? (DEEDS[tool] ?? tool) : (ACTS[tool] ?? tool);
    return { verb: '', subject: phrase, tail: '' };
  }

  const metric = typeof a.metric === 'string' ? a.metric : 'net_sales';
  const word = METRIC_WORDS[metric] ?? metric;
  const groups = groupBy(a);
  const compared = typeof a.compare_to === 'string' && a.compare_to.length > 0;
  const filters = (a.filters ?? {}) as Record<string, unknown>;
  const dim = groups.find((g) => g === 'product' || g === 'category');

  let verb: string;
  let subject: string;
  if (dim) {
    verb = 'looking at';
    subject = compared ? `${dim} changes` : `${dim} mix`;
  } else if (compared) {
    verb = 'comparing';
    subject = word;
  } else {
    verb = 'reading';
    subject = word;
  }
  const tail = [
    groups.includes('store') ? 'by store' : '',
    typeof filters.store === 'string' ? `at ${filters.store}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { verb: past ? PAST[verb] : verb, subject, tail };
}

/**
 * Acts that share a verb and a place read as one: "comparing transactions
 * and ATP at Rockwell", not "comparing transactions at Rockwell and comparing
 * ATP at Rockwell". Deduped, in first-seen order; a phrase with no verb (any
 * tool but get_sales) groups with itself only.
 */
function groupActs(calls: CallLike[], tense: 'present' | 'past'): string[] {
  const groups: { key: string; verb: string; subjects: string[]; tail: string }[] = [];
  for (const call of calls) {
    const act = describeCall(call, tense);
    const key = act.verb ? `${act.verb}|${act.tail}` : `|${act.subject}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, verb: act.verb, subjects: [], tail: act.tail };
      groups.push(g);
    }
    if (!g.subjects.includes(act.subject)) g.subjects.push(act.subject);
  }
  return groups.map((g) => {
    if (!g.verb) return g.subjects[0];
    const s = g.subjects;
    const named =
      s.length <= 3
        ? s.length === 1
          ? s[0]
          : `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`
        : `${s[0]} and ${s.length - 1} other figures`;
    return `${g.verb} ${named}${g.tail ? ` ${g.tail}` : ''}`;
  });
}

/** Two phrases at most, then a count — the shape actLine has always had. */
function joinActs(acts: string[], end: string): string {
  if (acts.length === 0) return '';
  if (acts.length === 1) return `${acts[0]}${end}`;
  if (acts.length === 2) return `${acts[0]} and ${acts[1]}${end}`;
  return `${acts[0]} and ${acts.length - 1} other things${end}`;
}

/* -------------------------------------------------------------- narration -- */

/**
 * Tool -> what its result is ABOUT, as a subject Bob can put a verb after.
 *
 * Capitalised, because these open a sentence: "Purchasing came back — 14 rows".
 * Parallel to ACTS above and covering exactly the same tools, so a tool can
 * never narrate its call and go silent on its result.
 */
const SUBJECTS: Record<string, string> = {
  get_sales: 'Sales',
  get_stock: 'Stock',
  get_product: 'The product',
  get_movement: 'Movement',
  get_vending: 'Vending',
  get_vending_stock: 'The machines',
  get_dead_stock: 'Dead stock',
  get_purchasing: 'Purchasing',
  get_cost_history: 'Cost history',
  get_brief: 'The brief',

  pin_answer: 'The pin',
  save_workflow: 'The rule',
  run_workflow: 'The workflow',
  view_page: 'The page',
};

/**
 * Tool -> what its rows are, where they are not rows of a figure.
 *
 * A page read's rows are the pins it inspected, and "The page came back —
 * 5 rows" would count them as if they were data. Everything else counts rows.
 */
const UNITS: Record<string, [string, string]> = {
  view_page: ['pin', 'pins'],
};

/**
 * Tool -> the act in the PAST, for a turn that is over.
 *
 * A third map in the same file, and it belongs here for the reason the first
 * two do: one home, so a spoken summary and a printed one cannot drift. It is
 * a map rather than a transformation of ACTS because the verbs are irregular —
 * reading/read, counting/counted, looking up/looked up — and a rule that
 * produced "readed" once would produce it forever.
 *
 * Lower case, because these are joined into a sentence and only the first is
 * capitalised.
 */
const DEEDS: Record<string, string> = {
  get_sales: 'read sales',
  get_stock: 'counted stock',
  get_product: 'looked up the product',
  get_movement: 'traced movement',
  get_vending: 'read vending',
  get_vending_stock: 'checked the machines',
  get_dead_stock: 'looked for dead stock',
  get_purchasing: 'checked purchasing',
  get_cost_history: 'read cost history',
  get_brief: 'read the morning brief',

  pin_answer: 'pinned this',
  save_workflow: 'saved the rule',
  run_workflow: 'ran the workflow',
  view_page: 'read the page',
  record_findings: 'noted what each read was',
  compose: 'composed the workspace',
};

/**
 * What Bob DID, as one line — the same shape actLine has, in the past.
 *
 * Deduped and capped at two names for the same reasons: the act is what was
 * done rather than how many calls did it, and five acts is a log line rather
 * than a sentence.
 */
export function deedLine(calls: CallLike[]): string {
  const joined = joinActs(groupActs(calls, 'past'), '');
  return joined ? joined[0].toUpperCase() + joined.slice(1) : '';
}

/** One completed call, as much of it as narration needs. */
export interface LastResult {
  tool: string;
  rowCount: number | null;
  error?: string | null;
}

/**
 * What Bob is doing, in the first person.
 *
 * Built from actLine, so the vocabulary has exactly one home and the spoken
 * and printed forms cannot drift — the property this file was created to hold.
 * ACTS are present participles precisely so "I'm " can be put in front of any
 * of them and come out grammatical.
 *
 * Empty for an empty list rather than "I'm …", so a caller can fall back to the
 * state's own label instead of rendering a sentence with nothing in it.
 */
export function narrateCall(calls: CallLike[]): string {
  const line = actLine(calls);
  return line ? `I'm ${line}` : '';
}

/**
 * What Bob is SEEING, in the first person — the thing the line used to go
 * quiet for.
 *
 * Until now the label named the call and then fell back to a state word the
 * moment the result landed, so the most interesting instant in a turn — data
 * arriving — was the one instant that said nothing.
 *
 * DERIVED, THEREFORE TRUE. Every word comes from the tool_result frame: which
 * tool, how many rows, whether it errored. Nothing here is the model's account
 * of what happened, which is why this line may be read as fact while the
 * cognition line below it may not.
 *
 * AN EMPTY RESULT IS NOT A ZERO, and it does not get to look like one. "came
 * back empty" says the query found no rows; a zero would be a figure. The same
 * distinction PinTile draws for a tile with no rows.
 */
export function narrateResult(result: LastResult): string {
  const subject = SUBJECTS[result.tool] ?? result.tool;
  if (result.error) return `${subject} refused that`;
  const n = result.rowCount;
  if (n === null || n === undefined) return `${subject} came back`;
  if (n === 0) return `${subject} came back empty`;
  const [one, many] = UNITS[result.tool] ?? ['row', 'rows'];
  return `${subject} came back — ${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`;
}

/**
 * The live thinking line: the last thing he has got as far as saying.
 *
 * A HELD THOUGHT, NOT A SCROLLING LOG. Thinking deltas arrive faster than
 * anyone reads, and rendering the whole accumulation turns the mark into a
 * teleprompter that pushes the page around. So this shows the LAST clause only
 * — sentences already finished have been superseded by the one being written.
 *
 * Trailing ellipsis always, because the line is by definition unfinished: the
 * next delta may extend it, and a clause that looked complete for one frame is
 * not a sentence Bob chose to end.
 *
 * Markdown is stripped rather than rendered. This is a single dimmed line
 * under a mark; a heading or a bullet in it would be furniture, and the
 * complete reasoning is still reachable in the turn's own disclosure once the
 * turn is done.
 */
export function cognitionTail(text: string, max = 140): string {
  const flat = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')   // fenced code, closed or still open
    // NOT underscore. Emphasis by underscore is vanishing rare in the model's
    // reasoning, while tool arguments in it are constant — stripping it turned
    // a live "last_30_days" into "last30days", which is a metric name that
    // does not exist and reads as though Bob had invented one.
    .replace(/[*`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';

  // The last clause: everything after the final sentence end that is followed
  // by more text. A trailing terminator is not a boundary — it is the end of
  // the clause we want to show.
  //
  // A capital letter counts as "more text" even with no space before it.
  // Deltas are concatenated raw, and a live turn produced "...how it's
  // changed.This window is..." across a delta boundary — without this the two
  // sentences read as one clause and the superseded half never leaves the line.
  const boundary = /[.!?](?=\s+\S|[A-Z])/g;
  let start = 0;
  for (let m = boundary.exec(flat); m !== null; m = boundary.exec(flat)) {
    start = m.index + 1;
  }
  let clause = flat.slice(start).trim();

  // A clause longer than the line keeps its END, not its beginning: the words
  // arriving now are the ones that have not been read yet.
  if (clause.length > max) {
    clause = `…${clause.slice(clause.length - max).replace(/^\S*\s/, '')}`;
  }

  // An ellipsis is in the strip set too: the model writes them, and this
  // always appends one.
  return `${clause.replace(/[.,;:…\s]+$/, '')}…`;
}


/**
 * The cognition line for a state — empty unless he is actually working.
 *
 * Shown while thinking and while tools run, and dropped the moment the answer
 * begins. Once there are words in the thread the reasoning behind them is no
 * longer the most useful thing on screen, and the turn's own disclosure still
 * holds all of it.
 *
 * Never shown in `error`, which is the case that matters: the last thing the
 * model was thinking before something broke is not an explanation of what
 * broke, and leaving it under a dimmed mark invites it to be read as one.
 */
export function liveCognition(state: BobState, thinking: string): string {
  return state === 'thinking' || state === 'running' ? cognitionTail(thinking) : '';
}
