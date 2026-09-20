/**
 * Draw the board.
 *
 * Keyed by Bob's own key, so an edit to a key already on screen changes
 * that node in place — that is the whole of "the workspace transforms". An
 * object nobody touched is not re-rendered into something new; it keeps
 * drawing the read it has always drawn, from the turn it came from.
 *
 * Notices belong to a TURN, not to the board: they qualify the figures that
 * just arrived, so they sit above everything from the newest turn only —
 * which since P1.c means above the READING, one region further up the page.
 * `turnNotices` is which ones still have to be said; the drawing is there.
 */
import {
  Fragment, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import type { BoardObject, Local } from './board';
import { inOrder } from './board';
import { retunedKey } from './tokenShape';
import { FIGURE_GAP, columnsFor, needsWidth, placeFigures, revealAt } from './beside';
import { CHILD_GAP, gather, type Relation } from './gather';
import { focusFor, sectionFor, type Section } from './page';
import { readIndexes } from './work';
import { PROCESS, callOf, rowsOf, tableShape, windowLabel, type AnswerTurn, type Dimension } from './data';
import { markFor } from './catalogue';
import type { ToolCall } from '../types/bob';
import {
  ControlTile, DraftTile, MemoryTile, SpecTile, StateTile, SystemTile,
  ownNotices, type TileActions, type TileProps,
} from './tiles';
import { MarkBlock } from './marks';
import { Marked } from './Reading';
import type { ActionOffer, Arrangement, BobNotice } from '../types/bob';

export interface BoardProps {
  /** Every answer turn, oldest first. An object names its own by index. */
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
  selection: string[];
  /** True while Bob is still working — drives the landing sequence. */
  live: boolean;
  /**
   * Reads re-run by a token or a control, keyed `turn:seq` (`retunedKey`).
   * Every object drawn from that read follows.
   *
   * KEYED BY THE TURN AS WELL AS THE SEQ since P1.j. `seq` restarts at 0 on
   * every turn, so a bare seq meant a replay on turn three's first read
   * redrew turn one's object with turn three's rows — a figure under somebody
   * else's label, which is the one thing the board may not do.
   */
  retuned: Record<string, ToolCall>;
  on: TileActions;
  /**
   * WHICH OFFERS EACH OBJECT MAY CARRY, keyed by object (P2.d).
   *
   * Decided once by `room/actions.placement` and handed down rather than
   * worked out here, because the FOOT needs the other half of the same
   * decision — what was left over — and two places deciding it separately is
   * how an offer ends up drawn twice or nowhere.
   */
  offers?: Map<string, ActionOffer[]>;
  /**
   * The index of the first answer the person has not seen (history.ts).
   * Objects touched from there on arrive with the landing glow, so what
   * changed since they last looked is what comes to the centre.
   */
  seenUpTo?: number;
  /**
   * HOW THE ARRIVAL IS GOING (P2S.2(d)): how many drawn figures have not
   * landed yet, and how many have. The mark is `reading` while any are on
   * their way and pulses once per arrival — the design's reveal, said to him.
   */
  onLanding?(progress: { pending: number; arrived: number }): void;
  /**
   * THE FIGURE THE ANSWER RESTS ON, by key (the log, 2026-09-17: *"all charts
   * dont need to be the same size or small it should decide based on the space
   * it has and how important it is"*). It goes first, spans the whole figures
   * area and reads larger. `Room` decides it from what the answer carries — the
   * read his claim cites, else the block he weighted `lead` — never a guess.
   */
  lead?: string | null;
  /** His sentences by the read they cite, for the newest turn (`beside.thoughtsOf`). */
  thoughts?: Map<number, string[]>;
  /**
   * HIS ANSWER AS THE PAGE (P3.n, `page.ts`): his paragraphs in his order, each
   * followed by the figures it cites. Present once the turn has settled and he
   * said more than a headline; absent, the board draws figure by figure as it
   * always did — while he is still reading, on a kept page, in an old thread.
   */
  page?: Section[];
  /**
   * HOW HE LAID THE RIGHT-HAND SIDE OUT (P3.p), for the newest turn. Present
   * only when he said so and the turn has settled; absent is the packing,
   * which is every answer composed before the channel existed.
   */
  arrangement?: Arrangement | null;
  /** List stores in one order across the answer's comparisons. */
  sameOrder?: boolean;
  /** Which figure the pointer is over, so the room can draw only its line. */
  onHover?(key: string | null): void;
}


/**
 * THE CAVEATS THIS TURN STILL HAS TO SAY — computed here because it is a
 * question about the BOARD (which notices are already drawn on an object),
 * and drawn above the reading, because a caveat comes before the answer it
 * qualifies and before every figure that answer is about (UI rule 4).
 *
 * Two are taken out. A notice an object already carries: a caveat shown twice
 * is a caveat people learn to skip, and this one is meant for what has no
 * object of its own. And the loop's own warnings about his edits —
 * "rockwell-hours: a block carries a kind or a spec, never both" is process,
 * not a caveat on a figure. The refusal is already enforced and already
 * conveyed to him; drawing it above the answer made three readings wear a
 * sentence about a shape he learnt to compose on the third try. A tool's
 * notice still surfaces, always; this is not one.
 */
/**
 * HOW A GATHERED POINT SITS UNDER ITS OWN, in words.
 *
 * An indent says two things belong together; it cannot say whether the second
 * agrees with the first. That difference is the whole of what makes a
 * composition an argument rather than a pile, so it is said — and said in the
 * label line that already carries `ruled out`, not in chrome of its own.
 */
/**
 * The space under one of his paragraphs, in px. Less than the gap between
 * figures (`FIGURE_GAP`), because that gap says two things are separate and a
 * paragraph and the figures it cites are one thing.
 */
const PARA_GAP = 18;

const RELATION_SAID: Record<Relation, string> = {
  evidence: 'why',
  counter: 'against that',
  scale: 'for scale',
};

/**
 * THE RELATION WHEN ITS POINT IS NOT BESIDE IT (P3.o).
 *
 * A block naming another as `under` gets one word — `why`, `against that`,
 * `for scale` — and that word works because the thing it refers to is directly
 * above it. The PLACEMENT is beat-scoped (a stem in another beat is not a stem
 * you can sit under), but the WORD was drawn whenever an `under` existed at
 * all. So a point whose stem was a beat earlier said "WHY" over nothing: the
 * chart it was the why OF was a screen above, and the owner read the page as
 * charts put together because at the one place it tried to say what led to
 * what, it pointed off the edge.
 *
 * SO IT SAYS WHICH POINT, in that point's own claim — `why · Three shops were
 * down last week`. The words are Bob's, already on the stem, already drawn as
 * its title; a claim carries no digits (metrics.yaml composition.claim), so
 * this names no figure. Nothing is inferred and nothing is computed.
 *
 * AND WHERE THERE IS NO CLAIM TO NAME, IT SAYS NOTHING. A default block has no
 * claim, so there is no honest way to finish the sentence — and a bare "why"
 * pointing at a chart the reader cannot find is worse than the quiet the page
 * had before the word existed.
 */
export function relationSaid(relation: Relation | undefined, adjacent: boolean,
                             stemClaim: string | null | undefined):
                             { word: string; point: string | null } | null {
  const word = RELATION_SAID[relation ?? 'evidence'];
  if (adjacent) return { word, point: null };
  const claim = (stemClaim ?? '').trim();
  return claim ? { word, point: claim } : null;
}

/**
 * THE WHOLE OF A FIGURE'S OWN CHROME, in one string: `read 4`, or
 * `read 3 · ruled out`.
 *
 * It used to be an uppercase banner over every block. The words are the same;
 * where they sit is the change (P3.k) — they ride the source line at the foot,
 * which was already drawn, so a block costs one line of chrome and not two.
 * The number stays because his prose's superscripts point at it.
 */
function chromeFor(index: number | null, out: boolean): string {
  // THE RELATION IS NOT HERE ANY MORE (P3.m). For an hour it was — `read 4 ·
  // why read 2` — which put the one word that makes two charts an argument
  // into the smallest type on the page. It is drawn above the point now
  // (`.r-fig-rel`); this line keeps what is genuinely chrome.
  const parts = [`read${index !== null ? ` ${index}` : ''}`];
  if (out) parts.push('ruled out');
  return parts.join(' · ');
}

export function turnNotices(p: {
  answers: AnswerTurn[];
  board: BoardObject[];
  local: Record<string, Local>;
  focused: string | null;
}): BobNotice[] {
  const newest = p.answers.length - 1;
  // A WARNING THE LOOP RAISED ABOUT HIS OWN WORK IS NEVER A CAVEAT (the log,
  // 2026-09-17: "caveat: caveat is at most 320 characters … (voice.reading.slots.
  // caveat)" and a bare "header_total_mismatch" drawn above the headline). Every
  // `warning` frame arrives as `source: 'loop'` (useBobStream); a tool's
  // notice never does. The named list stays for turns stored before that.
  const all = (p.answers[newest]?.notices ?? [])
    .filter((n) => !PROCESS.has(n.kind) && n.source !== 'loop');
  const onObjects = new Set(
    inOrder(p.board, p.local, p.focused).flatMap((o) => (
      o.seq === undefined ? []
        : ownNotices(p.answers[o.turn]?.toolCalls.find((c) => c.seq === o.seq)?.result?.meta)
    )).map((n) => n.kind),
  );
  return all.filter((n) => !onObjects.has(n.kind));
}

/**
 * THE FIGURES, FLOWING (P2S.1(c)).
 *
 * The design's beside room, not a board of tiles. His words, 2026-09-16: *"if
 * theres open space with the answer it should fill it"*, *"charts should go
 * from left to right then down"*, *"it still feels like its in squares"*. So:
 *
 *   NO LEAD ROW AND NO PACK. One flow, in Bob's order. How many columns is
 *   decided by how many figures there are (`columnsFor`); each figure goes to
 *   whichever column is shortest (`placeFigures`).
 *
 *   PLACED ON A GRID, NOT MOVED BETWEEN COLUMNS. A figure changing column must
 *   not remount — it would lose an opened panel and replay its arrival — so
 *   every figure is a child of ONE grid, told its column, and spans as many
 *   1px rows as it is tall. Items given a column stack in order within it.
 *
 *   NO BOX, NO CONTROLS ON IT. The frame is gone (`Shell`), and so are drag,
 *   resize, keep and set aside — the owner, 2026-09-17: *"remove"*. A hand-
 *   placed figure breaks the flow he asked for. Keeping still works by saying
 *   so, and by the thread's Page view.
 *
 *   IT ARRIVES, IT IS NOT NARRATED. A figure new to the board lands at 200ms,
 *   the next 260ms after, each drawing itself (`revealAt`). A figure already
 *   on screen stays put when the answer around it changes.
 */
export function Board(p: BoardProps) {
  const ordered = inOrder(p.board, p.local, p.focused);
  const newest = p.answers.length - 1;
  const leadKey = p.lead && ordered.some((o) => o.key === p.lead) ? p.lead
    : ordered.find((o) => o.turn === newest && o.weight === 'lead')?.key ?? null;
  const led = leadKey
    ? [...ordered.filter((o) => o.key === leadKey), ...ordered.filter((o) => o.key !== leadKey)]
    : ordered;
  // WHAT BELONGS TO WHAT (P2S.8). A block may name another as `under`; this
  // puts each stem immediately before what it gathered, so a family is
  // consecutive and can be placed as one item. A board that names nothing
  // yields no families and every line below runs exactly as it did.
  // A READ HE NEVER WROTE UP IS NOT A SECTION (P3.l).
  //
  // The loop draws a shape for every read the moment it lands, so the board
  // fills while he thinks. One he then writes up is a point he made; one he
  // never mentions is a read that happened — no claim, no thought, no place in
  // the argument — and drawing it as a full section between two of his points
  // is most of what the owner kept calling *"here's this and here's this"*.
  // His last board: eleven blocks, four of them unclaimed machine defaults,
  // one of which was the `attention` read with RANK and SIZE meaning pesos on
  // two rows and a count on six.
  //
  // They are not thrown away — they are a line at the foot, and it opens.
  // A turn where he wrote nothing up keeps them all, because then they are
  // the whole answer and not the noise around it.
  const [unfolded, setUnfolded] = useState(false);
  // ...UNLESS HIS WORDS LANDED ON IT. `thoughtsOf` takes a sentence that cites a
  // read off the words column and draws it under that read's chart. Folding
  // the chart would take the sentence with it — out of the left column and
  // onto nothing — so a default carrying his sentence is a point he made after
  // all. (Shipped without this for an hour on 2026-09-19; caught reading the
  // code, not by a test, so there is a test now.)
  const page = p.page ?? [];
  const seqOf = (o: BoardObject) => o.seq ?? o.seqs?.[0];
  const sectionOfObject = (o: BoardObject) => (o.turn === newest && page.length
    ? sectionFor(page, callOf(p.answers[o.turn], seqOf(o))) : -1);
  const his = (o: BoardObject) => !o.default || Boolean(o.claim || o.thought);
  const spoken = (o: BoardObject) => {
    const seq = seqOf(o);
    if (o.turn !== newest || seq === undefined) return false;
    if (!page.length) return Boolean(p.thoughts?.get(seq)?.length);
    // ON THE PAGE, a machine-drawn read earns a place when a paragraph of his
    // CITES it and he did not draw that same read himself. He wrote about
    // transactions and drew no chart of them: the loop's chart is the evidence
    // for that sentence, and the superscript on it needs somewhere to land. He
    // wrote about Fairview's day and drew it as a figure: the loop's seventeen-
    // row table of the same read is the same numbers, worse.
    return sectionOfObject(o) >= 0
      && !led.some((x) => x !== o && his(x) && x.turn === newest && seqOf(x) === seq);
  };
  const unsaid = led.filter((o) => o.default && !o.claim && !o.thought && !spoken(o));
  const said = led.filter((o) => !unsaid.includes(o));
  const shown = !said.length ? led : (unfolded ? [...said, ...unsaid] : said);
  const plan = gather(shown);
  // THE FLOW'S ITEMS: his paragraphs and the figures, in ONE list, because both
  // are measured and placed by the same packer. With no page this is exactly
  // `plan.order` and every point spans, as before.
  type Item = { kind: 'para'; key: string; text: string; opens: boolean }
    | { kind: 'fig'; o: BoardObject; point: boolean; told: boolean;
        /** The stem it sits directly under, when that stem is in the same beat. */
        under?: string;
        /** The rows this beat names, when it names one or two (`page.focusFor`). */
        focus?: string[] };
  const items: Item[] = [];
  if (page.length) {
    // EVERY FIGURE GOES TO ITS OWN BEAT — the thought of his that cites its read
    // most — and one that no thought cites goes where the point it hangs off
    // goes. So what he gathered `under` a point can stand under a LATER thought
    // when that is where he talks about it: the shops chart under the overview,
    // Greenhills' basket under "Greenhills is the real one".
    const own = new Map(plan.order.map((o) => [o.key, sectionOfObject(o)] as const));
    const beatOf = (o: BoardObject) => {
      const mine = own.get(o.key) ?? -1;
      if (mine >= 0) return mine;
      const up = plan.parentOf[o.key];
      return up ? own.get(up) ?? -1 : -1;
    };
    page.forEach((section, i) => {
      items.push({ kind: 'para', key: `para-${newest}-${i}`, text: section.para, opens: section.opens });
      const cites = (o: BoardObject) => {
        const n = section.seqs.indexOf(seqOf(o) as number);
        return n < 0 ? section.seqs.length : n;
      };
      const here = plan.order.filter((o) => beatOf(o) === i);
      const keys = new Set(here.map((o) => o.key));
      // In the order he brings them up; what hangs off a point in THIS beat
      // stays with that point (`plan.order` already has it just after).
      const anchor = (o: BoardObject) => {
        const up = plan.parentOf[o.key];
        return up && keys.has(up) ? here.find((x) => x.key === up) ?? o : o;
      };
      here.sort((x, y) => Number(anchor(y).key === leadKey) - Number(anchor(x).key === leadKey)
        || cites(anchor(x)) - cites(anchor(y)));
      // ONE ACROSS THE TOP WHEN THERE IS ONE TO PUT THERE: the figure the answer
      // rests on, or the odd one out of an odd number. An even pair with no lead
      // sits side by side, because neither is the other's heading.
      const peers = here.filter((o) => anchor(o) === o);
      const head = peers.length % 2 === 1 || peers.some((o) => o.key === leadKey);
      const parents = new Set(here.map((o) => plan.parentOf[o.key]).filter((k) => k && keys.has(k)));
      for (const o of here) {
        const up = plan.parentOf[o.key];
        const under = up && keys.has(up) ? up : undefined;
        items.push({
          kind: 'fig', o, told: true, under,
          point: !under && ((o === peers[0] && head) || parents.has(o.key)),
          focus: focusFor(section, callOf(p.answers[o.turn], seqOf(o))) ?? undefined,
        });
      }
    });
    // WHAT NO THOUGHT CITES comes after the prose: evidence he gathered and did
    // not talk about, and everything from earlier turns.
    for (const o of plan.order.filter((x) => beatOf(x) < 0)) {
      const up = plan.parentOf[o.key];
      const under = up && beatOf(plan.order.find((x) => x.key === up) ?? o) < 0 ? up : undefined;
      items.push({ kind: 'fig', o, told: false, under, point: !under });
    }
  } else {
    // THE DESIGN'S OWN SHAPE (2026-09-20): the figure the answer rests on
    // across the top, and the rest beside each other beneath it. Every point
    // spanning was P3.l's answer to a grid of widgets; with his prose gone
    // from this side it made a single column of charts, which is the thread
    // the owner refused by another route. A point still spans when it is
    // gathered-under (`under`) or when what it draws needs the width.
    for (const o of plan.order) {
      const under = plan.parentOf[o.key];
      items.push({ kind: 'fig', o, told: false, under,
                   point: !under && (o.key === leadKey || plan.families.some((f) => f.stem === o.key)) });
    }
  }
  const objects = items.flatMap((it) => (it.kind === 'fig' ? [it.o] : []));
  const width = useViewport();
  // WHAT EACH FIGURE NEEDS, from what it draws (beside.needsWidth).
  const wide = objects.map((o) => {
    if (o.spec) return needsWidth('spec', 0, 0);
    const call = callOf(p.answers[o.turn], o.seq);
    const rows = rowsOf(call);
    if (!rows.length) return false;
    const mark = markFor(o, rows);
    // The column NAMES too, so a table of four long headings takes the width
    // instead of scrolling inside half of it.
    const shown = tableShape(rows, call?.result?.meta ?? null).columns;
    return needsWidth(mark, rows.length, shown.length, shown);
  });
  const columns = columnsFor(objects.length, width, objects.length === 1 && wide[0]);
  // ONE STORE ORDER, AND ONLY ACROSS READS OF THE SAME STRETCH OF TIME.
  //
  // It exists so the eye finds a shop in the same place on every chart of an
  // answer, which is worth having. What it did was take the order from the
  // FIRST figure that listed shops, whatever that figure was about — and on
  // the owner's live turn of 2026-09-20 the first one was "this week so far"
  // while the chart beneath it was "last week". Last week's chart then drew
  // Rockwell below a shop with a smaller figure, which on that chart alone is
  // simply out of order, and reads as a sorting bug because on it, it is one.
  //
  // Two charts are only worth lining up when they cover the same period.
  // Different periods are different stories, and each sorts itself.
  const windowOf = (o: BoardObject) => {
    const call = callOf(p.answers[o.turn], o.seq ?? o.seqs?.[0]);
    const args = (call?.arguments ?? {}) as { date_range?: unknown };
    return JSON.stringify(args.date_range ?? null);
  };
  const setter = p.sameOrder
    ? objects.find((o) => o.turn === newest && rowsOf(callOf(p.answers[o.turn], o.seq))
        .filter((r) => typeof r.store === 'string').length > 1)
    : undefined;
  const order = setter
    ? rowsOf(callOf(p.answers[setter.turn], setter.seq)).map((r) => r.store)
        .filter((x): x is string => typeof x === 'string')
    : undefined;
  // WHICH PERIOD EACH FIGURE COVERS, and only where they differ (P3.q).
  //
  // His live turn of 2026-09-20 drew the closed week directly under a headline
  // about this week so far. Neither figure was wrong and neither was
  // mislabelled — the period sat in the source line UNDER each chart, which is
  // after the reader has already taken the number in. Where an answer spans
  // more than one period the period moves to the head of every figure and
  // leaves the source line, so it is read first and still said only once.
  const periodOf = (o: BoardObject) =>
    windowLabel(callOf(p.answers[o.turn], o.seq ?? o.seqs?.[0])?.result?.meta ?? null);
  const periods = new Set(objects.filter((o) => o.turn === newest)
    .map(periodOf).filter((x): x is string => Boolean(x)));
  const manyPeriods = periods.size > 1;

  const orderFor = (o: BoardObject) => (
    order && setter && windowOf(o) === windowOf(setter) ? order : undefined);
  // A FIGURE TAKES THE WHOLE WIDTH UNLESS IT IS GATHERED UNDER ANOTHER (P3.l).
  //
  // This is the whole of what makes the board a page instead of a grid, and it
  // took three tries. Two columns packed shortest-first was a dashboard. One
  // column everywhere was *"just one scroll"* — it flattened a point and its
  // evidence into three stacked blocks. So: a point spans, and only what
  // belongs to a point shares the width with its siblings, which is how the
  // design draws it — the finding across the top, its because and its against
  // side by side beneath.
  const wideOf = new Map(objects.map((o, i) => [o.key, wide[i]] as const));
  const itemKey = (it: Item) => (it.kind === 'para' ? it.key : it.o.key);
  const spans = items.map((it) => it.kind === 'para' || it.point || Boolean(wideOf.get(it.o.key)));
  const keys = items.map(itemKey).join('|');

  // HOW TALL EACH FIGURE IS, measured — the one input the placement needs.
  // Unmeasured is 0, which still places in order (ties go to fewest figures).
  const [heights, setHeights] = useState<Record<string, number>>({});
  const nodes = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const seen = new ResizeObserver((entries) => {
      setHeights((was) => {
        let next = was;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const key = el.dataset.figure ?? el.dataset.para ?? '';
          const body = el.firstElementChild as HTMLElement | null;
          const h = Math.round(body ? body.getBoundingClientRect().height : e.contentRect.height);
          if (key && was[key] !== h) {
            if (next === was) next = { ...was };
            next[key] = h;
          }
        }
        return next;
      });
    });
    nodes.current.forEach((n) => {
      seen.observe(n);
      if (n.firstElementChild) seen.observe(n.firstElementChild);
    });
    return () => seen.disconnect();
  }, [keys]);
  // A FAMILY IS PLACED AS ONE ITEM, by the same packer and its same tie rules
  // — so evidence can never be dropped into a different column from the point
  // it belongs to. With no families this is `placeFigures`, called as before.
  // The stem spans, which resets both columns to its foot, so its children
  // land side by side under it without anything having to group them.
  const placed = placeFigures(items.map((it) => heights[itemKey(it)] ?? 0), columns, spans);

  // WHICH FIGURES HAVE ARRIVED. Keyed, so an answer that transforms a figure
  // in place does not make it arrive again.
  const arrived = useArrival(objects.map((o) => o.key));
  const pending = objects.filter((o) => !arrived.has(o.key)).length;
  const landed = objects.length - pending;
  const { onLanding } = p;
  useEffect(() => { onLanding?.({ pending, arrived: landed }); }, [onLanding, pending, landed]);

  const touch = useTouch();

  // While he is still reading, what has landed is evidence — he has not said
  // where any of it goes yet.
  const settling = p.live && !p.answers[newest]?.composition;

  // ONE FIGURE, DRAWN THE SAME WAY WHEREVER IT SITS (P3.p). Extracted so
  // the packing and HIS ARRANGEMENT draw identical markup — two copies of
  // this would drift, and the difference between them would be a figure
  // that behaves differently depending on where he put it.
  //
  // `laid` is the only difference: packed, a figure is placed into the
  // measured 1px-row grid by column and span; laid out, it sits where his
  // tree puts it and carries no grid style at all.
  // ------------------------------------------------------------------
  // HIS ARRANGEMENT (P3.p) — the right-hand side laid out for this answer.
  //
  // The owner, 2026-09-20: *"i want it to use that space like its designing
  // its own page or artifact for its answer … it doesnt have to have text
  // before a chart … in that space its its playground."*
  //
  // The packing below is what he was describing when he said "here's this and
  // here's that": `placeFigures` drops each figure into whichever column is
  // shortest, so nothing he said ever reached the arrangement. When he sends
  // one, that whole mechanism steps aside — no measured rows, no columns, no
  // shortest-first — and the tree is drawn as he wrote it.
  //
  // IT DRAWS THE SAME FIGURES. A leaf names one of his own block keys, so a
  // figure laid out keeps its receipts, its notice, its read time, its
  // emphasis, its offers and its tap-to-inspect — `drawFigure` is the same
  // function either way, told only that it is not being packed.
  //
  // A BLOCK HE DID NOT PLACE IS STILL DRAWN, after the tree, in his order. The
  // server says so on `coerced` as well; this is the half that makes it true
  // on screen, because a figure that vanishes because an arrangement forgot it
  // is the one failure this may not have.
  const laidOut = p.arrangement ?? null;
  const byKey = new Map(items.flatMap((it) => (it.kind === 'fig' ? [[it.o.key, it] as const] : [])));
  // WHICH KEYS HIS TREE ACTUALLY PLACES, so the rest can be drawn after it.
  const placedKeys = new Set<string>();
  (function walk(node: Arrangement | null) {
    if (!node) return;
    if ('block' in node) { placedKeys.add(node.block); return; }
    if ('say' in node) return;
    (node.children ?? []).forEach(walk);
  })(laidOut);
  const drawNode = (node: Arrangement, at: string): ReactNode => {
    if ('say' in node) {
      // HIS WORDS, WHEREVER HE PUT THEM — the "it doesn't have to have text
      // before a chart" half.
      //
      // DRAWN BY THE ELEMENT HIS PARAGRAPHS ARE ALREADY DRAWN BY, not one of
      // this file's own. `.r-page-say` is 17.5px serif at 68ch; the first pass
      // invented `.r-laid-say` and it came out a different size at a different
      // measure, spanning the whole area — so a line of his read as a heading,
      // and the owner saw it immediately: *"are you sure it still feels all the
      // same?"*. The playground may rearrange what the app draws; it may not
      // draw it differently.
      return (
        <div key={at} className="r-para">
          <p className="r-say r-page-say">{node.say}</p>
        </div>
      );
    }
    if ('block' in node) {
      const it = byKey.get(node.block);
      // A key whose block is not on the board draws nothing rather than a
      // hole: the server already dropped unknown keys, and a block can still
      // be missing here if an earlier turn dropped it.
      return it ? <Fragment key={at}>{drawFigure(it, 0, true)}</Fragment> : null;
    }
    const kids = (node.children ?? []).map((c, n) => drawNode(c, `${at}.${n}`));
    if (node.layout === 'row') {
      return <div key={at} className="r-laid r-laid--row">{kids}</div>;
    }
    if (node.layout === 'grid') {
      return (
        <div key={at} className="r-laid r-laid--grid"
             style={{ '--laid-cols': node.cols ?? 2 } as CSSProperties}>{kids}</div>
      );
    }
    if (node.layout === 'panel') {
      return (
        <div key={at} className="r-laid r-laid--panel">
          {node.heading && <p className="r-laid-head">{node.heading}</p>}
          {kids}
        </div>
      );
    }
    return <div key={at} className="r-laid r-laid--stack">{kids}</div>;
  };

  const drawPara = (it: Extract<Item, { kind: 'para' }>, at: number, laid: boolean) => {
    const style = laid ? undefined
      : { gridColumn: '1 / -1',
          gridRowEnd: `span ${Math.max(1, (heights[it.key] ?? 0) + PARA_GAP)}` };
        // HIS PARAGRAPH, whole and in his order — the spine of the page. Not a
        // figure: no wire runs to it and nothing counts it as one.
        return (
          <div key={it.key} className="r-para" data-para={it.key}
               data-opens={it.opens && at > 0 ? 'yes' : undefined}
               ref={(el) => { if (el) nodes.current.set(it.key, el); else nodes.current.delete(it.key); }}
               style={style as CSSProperties}>
            <p className="r-say r-page-say">
              <Marked text={it.text} calls={p.answers[newest]?.toolCalls ?? []} />
            </p>
          </div>
        );
  };

  const drawFigure = (it: Extract<Item, { kind: 'fig' }>, at: number, laid: boolean) => {
      const { o } = it;
      const n = objects.indexOf(o);
      const turn = p.answers[o.turn];
      const index = readNumber(turn, o);
      const out = (o as BoardObject & { ruled_out?: boolean }).ruled_out === true;
      const h = heights[o.key] ?? 0;
      return (
        <div
          key={o.key}
          ref={(el) => { if (el) nodes.current.set(o.key, el); else nodes.current.delete(o.key); }}
          data-figure={o.key}
          data-turn={o.turn}
          data-seq={o.seq ?? o.seqs?.[0]}
          data-col={laid ? undefined : placed[at]}
          data-arrived={arrived.has(o.key) ? 'yes' : 'no'}
          data-lead={o.key === leadKey ? 'yes' : undefined}
          // WHETHER IT NEEDS THE WIDTH, not whether it has it. Every point
          // spans now, so `spans` would say yes to all of them and switch off
          // the cap that stops a small figure spending 940px on one number.
          data-span={wideOf.get(o.key) ? 'yes' : undefined}
          data-told={it.told ? 'yes' : undefined}
          // ON THE CANVAS NOTHING IS "UNDER" ANYTHING BUT WHERE HE PUT IT
          // (P6.e): the gathered-point indent and its rule drew on the
          // second block of every nested stack (the frame of 2026-09-20).
          data-under={laid ? undefined : it.under}
          data-relation={laid ? undefined : plan.relationOf[o.key]}
          data-weight={o.weight}
          className={['r-fig', out ? 'r-fig--out' : '', p.focused === o.key ? 'r-fig--open' : '',
                      o.key === leadKey ? 'r-fig--lead' : '']
            .filter(Boolean).join(' ')}
          // A gathered point sits tight under the one it belongs to, so it
          // closes the flow's gap. The same constant the family's height was
          // summed with, or the columns drift and it jumps on the next pass.
          // LAID OUT BY HIM, IT CARRIES NO PLACEMENT AT ALL. The measured
          // 1px-row grid is the packing's mechanism; inside his tree a figure
          // fills what its parent gives it, and a leftover span would fight
          // the flex or grid it now sits in.
          style={laid ? undefined
            : { gridColumn: spans[at] && columns > 1 ? '1 / -1' : placed[at] + 1,
                gridRowEnd: `span ${Math.max(1, h + (it.under ? CHILD_GAP : FIGURE_GAP))}` }}
        >
          <div className="r-fig-body">
            {manyPeriods && periodOf(o) && (
              <p className="r-fig-when">{periodOf(o)}</p>
            )}
            {(() => {
              const up = plan.parentOf[o.key];
              // ON THE CANVAS HIS ARRANGEMENT IS THE RELATION (P6.e): what
              // sits beside or under what is already said by where he put
              // it, and a WHY line over a chart he placed is a caption.
              if (!up || laid) return null;
              // ADJACENT IS `it.under` — the same decision that placed it
              // tight under its stem, so the word and the placement can no
              // longer disagree, which is the whole of the defect.
              const said = relationSaid(plan.relationOf[o.key], Boolean(it.under),
                                        plan.order.find((x) => x.key === up)?.claim);
              if (!said) return null;
              return (
                <p className="r-fig-rel" data-points={said.point ? 'yes' : undefined}>
                  <span className="r-fig-rel-word">{said.word}</span>
                  {said.point && <span className="r-fig-rel-pt">{said.point}</span>}
                </p>
              );
            })()}
            <Piece
              told={it.told}
              focus={it.focus}
              chrome={chromeFor(index, out)}
              canvas={laid}
              period={manyPeriods ? periodOf(o) : null}
              order={orderFor(o)}
              o={o}
              turn={turn}
              local={p.local[o.key] ?? {}}
              landing={(settling && o.turn === newest) || (p.live && o.touched === newest)
                || (p.seenUpTo !== undefined && o.touched >= p.seenUpTo)}
              delay={n * 110}
              focused={p.focused === o.key}
              selected={Boolean(o.subject && p.selection.includes(o.subject))}
              selection={p.selection}
              earlier={o.touched < newest}
              retuned={o.seq === undefined ? null : p.retuned[retunedKey(o.turn, o.seq)] ?? null}
              on={p.on}
              offers={p.offers?.get(o.key)}
            />
            {(() => {
              const seq = o.seq ?? o.seqs?.[0];
              const said = o.turn === newest && seq !== undefined ? p.thoughts?.get(seq) : undefined;
              const first = objects.findIndex((x) => x.turn === newest && (x.seq ?? x.seqs?.[0]) === seq) === n;
              // ON THE PAGE his words are the paragraph above, whole; drawing
              // the cited sentence again under the chart would say it twice.
              if (!said?.length || !first || page.length) return null;
              // HIS WORDS ABOUT THIS CHART, UNDER IT (the owner, 2026-09-18: "not
              // on top and before of the charts with the charts thats it related
              // to"). The chart first, then what he says about it.
              return (
                <div className="r-fig-thought" data-thought-for={seq}>
                  {said.map((s, i) => (
                    <p key={i} className="r-say"><Marked text={s} calls={turn?.toolCalls ?? []} /></p>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      );
  };

  return (
    <div className={`r-board r-flow${laidOut ? ' r-board--laid' : ''}`}
         data-board={objects.length} data-columns={columns}
         style={{ '--cols': columns } as CSSProperties}
         onMouseOver={(e) => {
           touch.over(e);
           const fig = (e.target as Element).closest?.('[data-figure]');
           p.onHover?.(fig?.getAttribute('data-figure') ?? null);
         }}
         onMouseLeave={() => { touch.leave(); p.onHover?.(null); }}
         onClickCapture={touch.tap}>
      {touch.tip}
      {laidOut
        ? (
          <>
            {drawNode(laidOut, 'root')}
            {/* A BLOCK HE DID NOT PLACE IS STILL DRAWN, after his arrangement
                and in his order. The server names it on `coerced`; this is the
                half that keeps it on screen, because a figure that vanishes
                because an arrangement forgot it is the one failure this may
                not have. */}
            {items.some((it) => it.kind === 'fig' && !placedKeys.has(it.o.key)) && (
              <div className="r-laid r-laid--stack r-laid--rest">
                {items.map((it, at) => (it.kind === 'fig' && !placedKeys.has(it.o.key)
                  ? <Fragment key={it.o.key}>{drawFigure(it, at, true)}</Fragment> : null))}
              </div>
            )}
          </>
        )
        : items.map((it, at) => (it.kind === 'para'
          ? drawPara(it, at, false)
          : drawFigure(it, at, false)))}
      {/* AT THE FOOT, and it opens. Not gone: the board still holds them,
          they still travel with the next question, and the count is the
          length of a list this already has rather than a number anybody
          wrote down (UI rule 8). No accent — this is navigation. */}
      {Boolean(said.length && unsaid.length) && (
        <p className="r-label r-earlier" style={{ gridColumn: '1 / -1' }}>
          <button type="button" className="r-earlier-line" aria-expanded={unfolded}
                  onClick={() => setUnfolded((o) => !o)}>
            {unsaid.length} more {unsaid.length === 1 ? 'read' : 'reads'} he did not
            {' '}write up · {unfolded ? 'fold' : 'show'}
          </button>
        </p>
      )}
    </div>
  );
}

/** Which edge of the tip sits on the mark. */
export type TipAnchor = 'start' | 'middle' | 'end';

/**
 * HOW FAR FROM AN EDGE A CENTRED TIP CAN STILL SIT.
 *
 * The tip is one line of mono and a name — the widest seen is about
 * "Rockwell · 2026-08-10 · ₱199,949 · read Sep 18 16:58", ~46 characters at
 * 11.5px, so ~260px, half of it 130. Rounded up, because being wrong here
 * costs a tip that hangs slightly inside the column rather than one cut in
 * half by it.
 */
const TIP_HALF = 150;

/**
 * Which edge of the tip to hang on the mark, given where the mark is.
 *
 * The figures area clips horizontally — it must, or a wide mark would spill
 * into the words — so a tip centred on a mark near the left edge lost its
 * first characters. The owner sent a screenshot of exactly that. Near an edge
 * the tip hangs from that side instead; anywhere else it is centred, which is
 * how the design draws it.
 */
export function anchorFor(x: number, width: number): TipAnchor {
  if (x < TIP_HALF) return 'start';
  if (width - x < TIP_HALF) return 'end';
  return 'middle';
}

/**
 * TOUCHING A MARK (P2S.2(f)) — the design's tooltip: the exact figure, and
 * when it was read. Hover shows it; a tap pins it, and a second tap on the
 * same mark (or a tap anywhere else in the figures) lets it go.
 *
 * ONE LISTENER FOR EVERY MARK KIND. Each mark puts its own words on the
 * element in `data-v` — values the tool returned, formatted, never worked out
 * — and its figure carries `data-read` off the call's `snapshot_timestamp`.
 * A tap on a mark is the mark's: it does not also open the figure behind it.
 */
function useTouch() {
  const [tip, setTip] = useState<
    { text: string; read: string; x: number; y: number; anchor: TipAnchor; pinned: boolean }
    | null>(null);
  // Placed in the board's own coordinates, so it scrolls with the figures and
  // no transformed ancestor can throw it off.
  const at = (el: Element, host: Element, pinned: boolean) => {
    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const x = r.left - h.left + r.width / 2;
    return {
      text: el.getAttribute('data-v') ?? '',
      read: el.closest('[data-read]')?.getAttribute('data-read') ?? '',
      x,
      y: r.top - h.top,
      // WHICH SIDE IT HANGS FROM, so it is never drawn outside the figures
      // and clipped by them (the owner, 2026-09-19: "when hovering some are
      // cut it should not"). Centred on the mark is the design's placement
      // and stays the placement everywhere there is room for it.
      anchor: anchorFor(x, h.width),
      pinned,
    };
  };
  const markOf = (target: EventTarget | null) =>
    (target instanceof Element ? target.closest('[data-v]') : null);
  return {
    over: (e: React.MouseEvent) => {
      // Measured NOW: React clears `currentTarget` before an updater runs.
      const el = markOf(e.target);
      const next = el ? at(el, e.currentTarget, false) : null;
      setTip((t) => (t?.pinned ? t : next));
    },
    leave: () => setTip((t) => (t?.pinned ? t : null)),
    tap: (e: React.MouseEvent) => {
      const el = markOf(e.target);
      if (!el) { setTip((t) => (t?.pinned ? null : t)); return; }
      e.stopPropagation();
      const next = at(el, e.currentTarget, true);
      setTip((t) => (t?.pinned && t.text === next.text ? null : next));
    },
    tip: tip && tip.text ? (
      <div className="r-tip" role="tooltip" data-pinned={tip.pinned ? 'yes' : 'no'}
           data-anchor={tip.anchor}
           style={{ left: tip.x, top: tip.y }}>
        <b>{tip.text}</b>
        {/* UI rule 6: a figure without its time is a claim with no expiry, so
            a read that carried none says that rather than nothing. */}
        {tip.read || 'no read time on this read'}
      </div>
    ) : null,
  };
}

/** The read's number in its turn — the same count the superscripts use. */
function readNumber(turn: AnswerTurn | undefined, o: BoardObject): number | null {
  if (!turn) return null;
  const seq = o.seq ?? o.seqs?.[0];
  if (seq === undefined) return null;
  return readIndexes(turn.toolCalls).get(seq) ?? null;
}

/** The window's width, kept current — the column count reads it. */
function useViewport(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1920 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function reducedMotion(): boolean {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * THE KEYS THAT HAVE ARRIVED. A key seen for the first time is scheduled by
 * its place among the NEW keys, so a second answer's figures arrive in their
 * own order and the first answer's stay where they are.
 */
function useArrival(keys: string[]): Set<string> {
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());
  const scheduled = useRef(new Set<string>());
  const joined = keys.join('|');
  useEffect(() => {
    const fresh = joined.split('|').filter((k) => k && !scheduled.current.has(k));
    if (!fresh.length) return undefined;
    const reduced = reducedMotion();
    const timers = fresh.map((key, i) => {
      scheduled.current.add(key);
      return window.setTimeout(() => {
        setArrived((was) => (was.has(key) ? was : new Set(was).add(key)));
      }, revealAt(i, reduced));
    });
    return () => {
      // An unmount mid-reveal un-schedules what had not landed, so the next
      // mount schedules it again rather than leaving it invisible for good.
      timers.forEach((t) => window.clearTimeout(t));
      for (const key of fresh) scheduled.current.delete(key);
    };
  }, [joined]);
  return arrived;
}

/**
 * WHAT DRAWS A BLOCK.
 *
 * Since P1.e there are three answers, not fourteen. A composed shape draws its
 * own tree. FIVE kinds are objects you do something to rather than readings of
 * a read, and they keep their tiles — `catalogue.NOT_A_MARK` says which and
 * why, and `catalogue.test.ts` holds this switch to that list so a kind cannot
 * quietly fall out of both. Everything else is a READING, and every reading is
 * one of the six marks: `MarkBlock` asks the catalogue which, and draws it
 * inside the one frame — claim-title, subtitle off `meta`, the mark, its
 * source line.
 */
function Piece(props: TileProps) {
  if (!props.turn) return null;
  // A composed shape has no `kind` — it carries its own tree instead.
  if (props.o.spec) return <SpecTile {...props} />;
  switch (props.o.kind) {
    case 'draft': return <DraftTile {...props} />;
    case 'state': return <StateTile {...props} />;
    case 'control': return <ControlTile {...props} />;
    case 'system': return <SystemTile {...props} />;
    case 'memory': return <MemoryTile {...props} />;
    default: return <MarkBlock {...props} />;
  }
}

export type { TileActions, Dimension };
