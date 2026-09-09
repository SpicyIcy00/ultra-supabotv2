/**
 * A replay: the same calls, another window, no model.
 *
 * WHAT IT IS. A person drags the work to last month. The calls the surface is
 * drawn from — the plan's evidence, with the arguments the tools accepted —
 * are re-sent with the window argument changed and nothing else, through the
 * validation a pin passes and the runner a tile uses (POST /george/replay).
 * The results come back with their own receipts and read time, and are
 * composed by the SAME path an answer is: sources, dedupe, roles, plan. The
 * roles are the surface's own, carried across by position, so the field a
 * person was looking at recomposes with the same primary and the same
 * drivers over the new window.
 *
 * WHAT IT IS NOT. It is not stored. Nothing is written by a replay, and the
 * record of a window change is the next question, which carries the window
 * in `desk.window` (metrics.yaml surface.desk.replay). And it is not a
 * reading: George has not looked at the new figures, so the page marks the
 * old reading as an earlier window's until he is asked.
 *
 * THE DESK AT REST is the same mechanism over the definitions' resting reads
 * (surface.desk.rest.reads) with a primary role on the first, so the
 * composer's own attention rule applies to the estate before anything is
 * asked.
 */
import type { DeskWindow, Finding, ToolCall } from '../../types/george';
import type { PinCallResult, PinToolCall } from '../../types/pins';
import { sourcesFromPinRun } from '../george/resultShape';
import { anchorOf } from '../george/surfaceAnchor';
import { blockResults } from '../george/resultShape';
import { composeSurface, type Surface } from '../george/surfaceCompose';
import { workUnitFromResults } from '../george/workUnit';

/** The value a window argument takes for a window. */
export function windowArgument(window: DeskWindow): string | { start: string; end: string } | null {
  if (window.kind === 'preset') return window.name ?? null;
  if (window.start && window.end) return { start: window.start, end: window.end };
  return null;
}

/**
 * The calls a surface is drawn from, with the window moved.
 *
 * Only calls whose tool takes a window are changed (workflows.backtest.
 * window_arguments — the definitions say which argument, per tool). A read
 * with no window, a stock count say, is replayed as it was: it reads the
 * present either way, and leaving it out would drop a figure the person had.
 */
export function replayCalls(
  surface: Surface,
  window: DeskWindow,
  windowArguments: Record<string, string>,
): PinToolCall[] {
  const value = windowArgument(window);
  return surface.plan.evidence.flatMap((source) => {
    if (!source.arguments) return [];
    const arg = windowArguments[source.tool];
    const args = arg && value !== null ? { ...source.arguments, [arg]: value } : { ...source.arguments };
    return [{ tool: source.tool, arguments: args }];
  });
}

/**
 * The roles the surface composed with, keyed to the replay's call order.
 *
 * The plan's sections say which evidence is primary, driver, breakdown or
 * context; the replay's results arrive in evidence order, so the role of the
 * n-th evidence source becomes the role of the n-th result. `of` follows the
 * same map. A source with no arguments was not replayed and has no role.
 */
export function replayFindings(surface: Surface): Finding[] {
  const index = new Map<number, number>();
  let n = 0;
  for (const source of surface.plan.evidence) {
    if (!source.arguments) continue;
    index.set(source.seq, n++);
  }
  const roleOf = new Map<number, { role: Finding['role']; identity?: string | null }>();
  const ofOf = new Map<number, number | null>();
  for (const section of surface.plan.sections) {
    for (const result of blockResults(section.blocks)) {
      roleOf.set(result.source.seq, { role: section.role, identity: section.identity ?? null });
    }
  }
  // A driver or breakdown hangs off the primary, which is the primary section's first result.
  const primarySeq = (() => {
    const p = surface.plan.sections.find((s) => s.role === 'primary');
    return p ? blockResults(p.blocks)[0]?.source.seq ?? null : null;
  })();
  for (const [seq, r] of roleOf) ofOf.set(seq, r.role === 'driver' || r.role === 'breakdown' ? primarySeq : null);

  const out: Finding[] = [];
  for (const [seq, r] of roleOf) {
    const i = index.get(seq);
    if (i === undefined) continue;
    const of = ofOf.get(seq);
    const ofIndex = of === null || of === undefined ? null : index.get(of) ?? null;
    if ((r.role === 'driver' || r.role === 'breakdown') && ofIndex === null) continue;
    out.push({
      seq: i,
      role: r.role,
      of: ofIndex,
      tool: surface.plan.evidence.find((s) => s.seq === seq)?.tool ?? '',
      ...(r.role === 'primary' && r.identity ? { identity: r.identity } : {}),
    });
  }
  return out;
}

/** The calls of a replay as the activity line reads them. */
function callsOf(results: PinCallResult[]): ToolCall[] {
  return results.map((r, i) => ({
    seq: i,
    tool: r.tool,
    arguments: r.arguments,
    result: {
      row_count: r.rows?.length ?? 0,
      source_table: r.meta?.source_table ?? null,
      truncated: false,
      duration_ms: r.duration_ms,
      error: r.status === 'ok' ? null : r.error ?? r.status,
    },
  }));
}

/**
 * A surface from replayed results: one step, no intent, no prose.
 *
 * Composed by the one path an answer is, so the field it draws is the field
 * the answer would draw over the same rows. `id` names the replay; a page
 * keeps the surface it replaced so the trail and the reading still stand.
 */
export function surfaceFromResults(
  id: string,
  results: PinCallResult[],
  findings: Finding[] | undefined,
  at: string,
): Surface {
  const sources = sourcesFromPinRun(results);
  const unit = workUnitFromResults(id, sources, findings, callsOf(results), at);
  const anchor = anchorOf(unit);
  return {
    kind: 'surface',
    id,
    steps: [{ intent: null, unit }],
    lead: unit,
    latest: unit,
    anchor,
    plan: composeSurface(id, [{ intent: null, unit }], anchor),
  };
}

/** The surface a replay of `surface` composes into, over the new window. */
export function replayedSurface(surface: Surface, results: PinCallResult[], at: string): Surface {
  return surfaceFromResults(`${surface.id}:replay`, results, replayFindings(surface), at);
}

/** The desk at rest: the definitions' resting reads, the first as the primary fact. */
export function restSurface(results: PinCallResult[], at: string): Surface {
  const first = results.findIndex((r) => r.status === 'ok' && (r.rows ?? []).length > 0);
  const findings: Finding[] = first >= 0
    ? [{ seq: 0, role: 'primary', of: null, tool: results[first].tool }]
    : [];
  return surfaceFromResults('rest', results, findings, at);
}

/** What did not come back from a replay, in the runner's own words. */
export function replayMissing(results: PinCallResult[]): PinCallResult[] {
  return results.filter((r) => r.status !== 'ok');
}
