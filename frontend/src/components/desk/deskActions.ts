/**
 * What a person can do from here — as a decision the suite can hold.
 *
 * TWO KINDS, AND THE DIFFERENCE IS WHO IS CONSULTED. A `local` action is a
 * change of view over rows already on screen and never reaches the model:
 * clear, back, show as a list. An `ask` action is a question George is asked,
 * in business words, built from trusted state — the selection's labels off
 * rows, the metric label and window off meta — through the one seam every
 * instruction crosses (surfaceEvents). The selection travels beside it as
 * context, so "Why?" with a store focused needs no name in it.
 *
 * OFFERED ONLY WHERE THE DEFINITIONS ALLOW. A breakdown chip appears only for
 * a dimension the focused subject can be broken down by; "why?" only where a
 * change exists to explain. The wording carries no tool vocabulary.
 */
import type { ToolMeta } from '../../types/george';
import { windowLabel } from '../george/resultShape';
import { instructionLabel, instructionQuestion } from '../george/surfaceEvents';
import type { SurfaceAnchor, SurfaceInstruction } from '../george/surfaceModel';
import type { DeskAction, DeskState } from './deskState';
import type { DeskLayout } from './deskCompose';

export interface DeskActionItem {
  id: string;
  label: string;
  kind: 'ask' | 'local';
  /** The question, for an `ask` action. Business words only. */
  question?: string;
  /** The reducer action, for a `local` one. */
  local?: DeskAction;
}

/**
 * How many moves George offers, and why there is a cap at all.
 *
 * A row of every valid follow-up is a menu, and a menu is what the box below
 * already is. These are the few most relevant NEXT MOVES, in the order the
 * evidence supports them — the recommendation George makes in the answer is
 * drawn separately and is not repeated here.
 */
export const MAX_MOVES = 3;

function ask(instruction: SurfaceInstruction, meta: ToolMeta, anchor?: SurfaceAnchor): DeskActionItem {
  const id = instruction.op === 'break_down' ? `break_down:${instruction.dimension}` : instruction.op;
  return {
    id,
    label: instructionLabel(instruction),
    kind: 'ask',
    question: instructionQuestion(instruction, meta, anchor),
  };
}

/** The anchor questions are phrased against: the work's, narrowed to the focus. */
export function questionAnchor(layout: DeskLayout): SurfaceAnchor | undefined {
  const base = layout.anchor ?? undefined;
  if (!base) return undefined;
  const store = layout.focus?.dimension === 'store'
    ? layout.focus.label
    : layout.scope.length > 0 && layout.level !== 'business' ? layout.scope[0] : null;
  return store ? { ...base, subjects: [store], subjectDimension: 'store' } : base;
}

/**
 * "Which products moved most at North Edsa last week?" — the localize rung
 * in a reader's words. George chooses the metric the definitions name for it
 * (investigation.ladder.localize); no tool vocabulary is put in anyone's mouth.
 */
export function localizeQuestion(dimension: 'product' | 'category', store: string | null, meta: ToolMeta): string {
  const noun = dimension === 'product' ? 'products' : 'categories';
  const where = store ? ` at ${store}` : ' across the stores';
  const when = windowLabel(meta)?.toLowerCase();
  return `Which ${noun} moved most${where}${when ? ` ${when}` : ''}?`;
}

/**
 * The moves on offer, prioritised and capped.
 *
 * `exclude` is the question George has already made his recommendation about:
 * offering it twice, once as his suggestion and once as a chip, reads as two
 * different moves and is one.
 */
export function deskActions(
  layout: DeskLayout,
  state: DeskState,
  exclude?: string | null,
): DeskActionItem[] {
  const all = allActions(layout, state);
  const asks = all.filter((a) => a.kind === 'ask' && a.question !== exclude).slice(0, MAX_MOVES);
  const locals = all.filter((a) => a.kind === 'local');
  return [...asks, ...locals];
}

function allActions(layout: DeskLayout, state: DeskState): DeskActionItem[] {
  const meta = layout.headlineMeta;
  const anchor = questionAnchor(layout);
  const out: DeskActionItem[] = [];
  const stage = layout.stage;
  const selection = state.selection;
  const labels = selection.map((s) => s.label);

  if (!meta) return out;

  // A question about stores names them; it is not also "at" one of them. A
  // question about products keeps the store they sit in.
  const stores = selection.length > 0 && selection[0].dimension === 'store';
  const selectionAnchor = stores && anchor ? { ...anchor, subjects: [] } : anchor;

  if (selection.length >= 2) {
    // Several subjects under the hand: compare them, or ask why them.
    if (stage.kind !== 'compare') out.push(ask({ op: 'compare_selection', subjects: labels }, meta, selectionAnchor));
    out.push(ask({ op: 'explain_selection', subjects: labels }, meta, selectionAnchor));
    out.push({ id: 'clear', label: 'Clear', kind: 'local', local: { type: 'clear' } });
    return out;
  }

  if (stage.kind === 'anatomy') {
    const subject = stage.anatomy.subject;
    if (stage.anatomy.headline.changePct !== null || stage.anatomy.headline.baselineStatus) {
      const scoped = subject.dimension === 'store' && anchor ? { ...anchor, subjects: [] } : anchor;
      out.push(ask({ op: 'explain_selection', subjects: [subject.label] }, meta, scoped));
    }
    if (subject.dimension === 'store') {
      const shown = stage.breakdown?.dimension ?? null;
      const store = subject.label;
      if (shown !== 'product') {
        out.push({ id: 'localize:product', label: 'Products', kind: 'ask', question: localizeQuestion('product', store, meta) });
      }
      if (shown !== 'category') {
        out.push({ id: 'localize:category', label: 'Categories', kind: 'ask', question: localizeQuestion('category', store, meta) });
      }
    }
    out.push({ id: 'back', label: 'Back', kind: 'local', local: { type: 'back' } });
    return out;
  }

  if (stage.kind === 'compare') {
    if (labels.length >= 2) out.push(ask({ op: 'explain_selection', subjects: labels }, meta, anchor));
    out.push({ id: 'clear', label: 'Clear', kind: 'local', local: { type: 'clear' } });
    return out;
  }

  if (stage.kind === 'field') {
    // What the definitions allow of the primary, then the list equivalent.
    for (const r of layout.refinements) {
      out.push({ id: r.id, label: r.label, kind: 'ask', question: r.question });
    }
    out.push({
      id: 'list',
      label: state.listView ? 'Show as field' : 'Show as list',
      kind: 'local',
      local: { type: 'list', on: !state.listView },
    });
    return out;
  }

  for (const r of layout.refinements) {
    out.push({ id: r.id, label: r.label, kind: 'ask', question: r.question });
  }
  return out;
}
