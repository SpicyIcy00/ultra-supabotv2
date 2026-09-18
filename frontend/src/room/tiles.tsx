/**
 * The things on the board.
 *
 * THE TILE IS A FRAME AND CARRIES NO COLOUR OF ITS OWN (P2.l, 2026-09-15).
 * It used to be lit from inside: the wash was the object's identity and its
 * brightness was |change|, so a board of seven shops was seven hues over rows
 * whose labels already said which shop each one was — the owner's P1.e report
 * at the layer P1.e exempted, asked again as *"what do the colors mean now?"*.
 * Now what a tile is about is read from its title and its rows, and the only
 * colour anywhere on it is inside a mark, where a tool declared a direction.
 *
 * None of these components computes a business figure. They pick a row, read a
 * value the tool already returned, and format it.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { GeorgeNotice, ToolMeta } from '../types/george';
import type { BoardObject, Local } from './board';
import type { ToolCall } from '../types/george';
import {
  callOf, fmt, pct, receiptsDetail, receiptsLine, rowFor, rowsOf, splitCaveat, tone,
  type AnswerTurn, type Change, type Dimension,
} from './data';
import { directionRgb } from './identity';
import { Spec } from './Spec';
import { Swatch } from './swatch';
import { useDrawnOnly } from './noticeDrawing';
import { cost, says } from './actions';
import type { ActionOffer } from '../types/george';

export interface TileActions {
  /** Bring it forward and give it the room. */
  open(key: string): void;
  /** Put it in the selection, so the next thing said is about it. */
  pick(subject: string, dimension: Dimension | null): void;
  /** Ask George about this one thing, now. */
  why(subject: string, dimension: Dimension | null): void;
  patch(key: string, local: Local): void;
  /**
   * Re-run the read an object draws from with ONE scope argument changed.
   * No model turn: this is the desk replay's path, which is why a control
   * costs a second rather than forty. Optional, so a surface that has not
   * wired it simply draws no control.
   */
  retune?(key: string, argument: string, value: string | number): void;
  /**
   * Stop holding a view. A PERSON'S GESTURE and never George's: he may revise
   * a view a read contradicts, he may not decide to stop knowing something
   * because somebody disagreed. Optional, so a surface that has not wired it
   * draws the row with no Forget rather than one that does nothing.
   */
  forget?(key: string, beliefId: string): void;
}

export interface TileProps {
  o: BoardObject;
  /**
   * A re-run of the read this object draws, after somebody moved a control.
   *
   * KEYED BY THE READ, NOT BY THE OBJECT, and that is the semantics: changing
   * the window on a read changes EVERY object drawn from it, because they are
   * all showing the same figures through different shapes. Absent means the
   * turn's own call, exactly as before controls existed.
   */
  retuned?: ToolCall | null;
  turn: AnswerTurn;
  local: Local;
  landing: boolean;
  delay: number;
  focused: boolean;
  selected: boolean;
  earlier: boolean;
  on: TileActions;
  notices?: GeorgeNotice[];
  /** What the person has picked, so a comparison can mark its own subjects. */
  selection?: string[];
  /**
   * WHAT GEORGE OFFERED TO DO ABOUT A ROW OF THIS OBJECT (P2.d).
   *
   * Already placed: `room/actions.placement` decided once, for the whole
   * screen, which offers this object can carry — so a mark filters to the row
   * and never decides whether it is the right object. Absent means none, which
   * draws exactly as the board drew before offers existed.
   */
  offers?: ActionOffer[];
  /**
   * THE ORDER STORES ARE LISTED IN ACROSS AN ANSWER (the `speak` layout,
   * 2026-09-17): a comparison lists its stores in this order, so the eye finds
   * OPUS in the same place on every chart. Absent keeps the tool's own order.
   */
  order?: string[];
}

/**
 * ONE OFFER, WHERE THE THING IT IS ABOUT IS DRAWN.
 *
 * Three parts and no fourth: the act in the surface's own word, George's
 * reason, and what it costs. The reason is why this is not a menu item — a
 * button saying "why" beside a row is a control, and a button saying "why —
 * the only shop that fell while takings rose" is a suggestion you can
 * disagree with.
 *
 * THE COST IS DRAWN AS IT ARRIVED. It was derived server-side from the act
 * (metrics.yaml composition.actions.acts) and stored on the answer post; this
 * component works none of it out, so what a reopened thread shows is what the
 * person was shown. It takes no accent — an offer is not an approval, and the
 * one colour that means "needs you" is spoken for (UI rule 5).
 */
export function Offer({ offer, onTake }: {
  offer: ActionOffer;
  onTake(offer: ActionOffer): void;
}) {
  return (
    <button
      type="button"
      className="r-offer"
      data-act={offer.act}
      data-target={offer.target ?? ''}
      onClick={(e) => { e.stopPropagation(); onTake(offer); }}
    >
      <span className="r-offer-act">{says(offer)}</span>
      <span className="r-offer-why">{offer.reason}</span>
      {cost(offer) && <span className="r-offer-cost">{cost(offer)}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ shell */

/**
 * The tile every object sits in — a frame, and nothing that means anything.
 *
 * IT TAKES NO COLOUR, which is the whole of P2.l. It used to take a `hue` (the
 * object's identity) and a `change` (how brightly that hue burnt), and those
 * were two of the four meanings colour carried at once. `quiet` and `picked`
 * are the two states left, and both are drawn in the chrome's own greys: one
 * says this is no longer the point, the other says you picked it.
 *
 * THE `change` ARGUMENT WAS ALREADY DEAD when it was removed, and that is the
 * evidence the magnitude channel cost nothing: P1.e deleted the last tile that
 * passed one on 2026-09-14, so `--i` has been 0 on every tile since, and the
 * dogfood log still described the brightness as a live meaning a month later.
 */
export function Shell({ quiet, landing, delay, picked, boxed, children, onOpen }: {
  quiet?: boolean;
  landing: boolean;
  delay: number;
  picked?: boolean;
  /**
   * A BOX, ONLY FOR A THING YOU ACT ON (P2S.1(c)). The owner, three times:
   * *"i kinda dont like how its inside a box visually"*, *"the charts still
   * feel like they are in boxes"*, *"it still feels like its in squares"*. The
   * design keeps an edge only where the thing genuinely has one — a draft you
   * edit, an approval you decide — and a reading of a read is not that.
   */
  boxed?: boolean;
  children: ReactNode;
  onOpen?: () => void;
}) {
  const cls = [
    'r-tile',
    boxed ? 'r-tile--boxed' : '',
    quiet ? 'r-tile--quiet' : '',
    picked ? 'r-tile--picked' : '',
    landing ? 'r-landing' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={{ '--d': `${delay}ms` } as CSSProperties}
      {...(onOpen ? { 'data-open': true, role: 'button', tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
        } } : {})}
    >
      {children}
    </div>
  );
}

export function Delta({ change }: { change: Change }) {
  if (change.status && change.status !== 'ok') {
    const word = change.status === 'no_baseline' ? 'new'
      : change.status === 'no_current' ? 'none now' : 'was zero';
    const long = change.status === 'no_baseline' ? 'new — nothing to compare against'
      : change.status === 'no_current' ? 'nothing this period' : 'the previous period was zero';
    return <span className="r-delta r-delta--none" title={long}>{word}</span>;
  }
  if (change.pct === null) return null;
  if (change.pct === 0) return <span className="r-delta r-delta--none">no change</span>;
  // The sign is always drawn, so direction survives being the same green as
  // the shop called Greenhills.
  return (
    <span className="r-delta" style={{ '--dir': directionRgb(tone(change)) } as CSSProperties}>
      {change.pct > 0 ? '▲' : '▼'} {pct(change.pct)}
    </span>
  );
}

/**
 * THE SOURCE LINE. It says what was measured, how it was cut, over which days
 * and when it was read; the table and every filter are one hover away on the
 * same element — inspectable, not hidden (UI rule 3).
 *
 * IT IS NOT OPTIONAL WHERE A BLOCK IS DRAWN (P1.e). A read whose meta carries
 * none of those still names itself — the tool, or the table the rows came out
 * of — because a figure with no line under it is a figure a reader cannot
 * place, and the last-resort version of that line is still true.
 */
export function Receipts({ meta, tool }: {
  meta: Parameters<typeof receiptsLine>[0]; tool?: string | null;
}) {
  // A TAP OPENS THE RECEIPTS IN PLACE (UI rule 3, P2S.2(f)): the source and
  // every filter the read applied, under the line, with no route and no modal.
  const [open, setOpen] = useState(false);
  const line = receiptsLine(meta)
    || [tool?.replace(/^get_/, '').replace(/_/g, ' ') ?? null,
        meta?.source_table ?? null].filter(Boolean).join(' · ');
  if (!line) return null;
  const detail = receiptsDetail(meta);
  return (
    <>
      <button type="button" className="r-src r-src--tap" style={{ marginTop: 12 }}
              title={detail} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {line}
      </button>
      {open && (
        <div className="r-receipt" onClick={(e) => e.stopPropagation()}>
          {detail
            ? detail.split('\n').map((d) => <p key={d} className="r-src">{d}</p>)
            : <p className="r-src">the read carried no source or filters</p>}
          {meta?.snapshot_timestamp && <p className="r-src">read at {meta.snapshot_timestamp}</p>}
        </div>
      )}
    </>
  );
}

/*
 * `Acts` WAS HERE — open, compare, why, a drag grip, bigger, smaller, keep and
 * set aside under every object. Gone with P2S.1 at the owner's word
 * (2026-09-17, *"remove"*): the figures flow, so nothing is placed by hand,
 * and keeping is said or done from the thread's Page view. Opening a subject
 * and asking why are still a tap on the row itself.
 */

/*
 * BOTH SENTENCES ARE ADDRESSED TO THE READER (the dogfood log, 2026-09-15,
 * "a tile explaining itself to the reader"). They said *"George composed this
 * from Rockwell, which this read does not carry"* — true, and about George's
 * composing rather than the business, to a person who did not compose it. Now
 * they say what is and is not in the read, which is the thing the reader can
 * use; refusing to draw a wrong number is unchanged.
 */
export function Missing({ what }: { what: string }) {
  return (
    <div className="r-tile r-tile--quiet">
      <p className="r-note">Nothing to draw here: this read came back without {what}.</p>
    </div>
  );
}

/**
 * THE SAME SENTENCE, WHERE A NUMBER WOULD HAVE BEEN.
 *
 * `Missing` replaces a whole tile, which is right when the read came back with
 * nothing at all. When the read came back with rows and the block's subject is
 * not among them, the tile's title, its own caveat and its source line are all
 * still true and are kept; the one thing it cannot say honestly is the figure,
 * so the figure is the one thing left out.
 *
 * WHY THIS EXISTS (dogfood log, 2026-09-15). A tile captioned "Greenhills
 * turned down on a smaller basket" drew ₱206,800, a green +1.5% and a row
 * labelled Rockwell, because the mark fell back to the FIRST row of the read
 * when it could not find the subject. Nothing was invented — every figure was
 * read — and it was attached to a sentence that is not about it, which is the
 * one thing rule 9 exists to prevent. Drawing nothing is the correct answer,
 * and it also makes visible WHICH way round the mistake was: a claim written
 * onto the wrong read, or a block composed against one.
 */
export function MissingRow({ what }: { what: string }) {
  return (
    <p className="r-note r-mk-absent" data-absent={what}>
      {what} is not in this read, so there is no figure for it here.
    </p>
  );
}

/**
 * The call an object draws from: the re-tuned one if a control moved, else the
 * turn's own. One function so no tile can disagree with another about which
 * figures are on screen.
 */
export function callFor(p: TileProps): ToolCall | null {
  return p.retuned ?? callOf(p.turn, p.o.seq);
}

/**
 * THE CAVEAT BELONGING TO THIS OBJECT'S OWN READ, drawn ON it and ABOVE its
 * figures — which is what UI rule 4 asks for in its own words: "if a tile
 * cannot show the caveat, the tile is the wrong shape."
 *
 * Until now every notice from every read was stacked above the whole board,
 * so a draft order arrived under five warnings that belonged to it and to
 * nothing else, and George had to repeat all five in prose to surface them.
 * Measured over 51 answers: an answer over data with four-plus notices ran
 * 386 words against 137 with none — almost three times, all of it caveat.
 *
 * A caveat on the thing it qualifies is read on the way to the figure, which
 * is where it does its work.
 */
export function ownNotices(meta?: ToolMeta | null): GeorgeNotice[] {
  const notice = meta?.notice;
  if (!notice) return [];
  // A `multiple` is a container and is never drawn itself — the loop checks
  // each item's own kind, and so does the reader.
  return notice.kind === 'multiple' ? notice.items ?? [] : [notice];
}

export function OwnCaveat({ meta }: { meta?: ToolMeta | null }) {
  // ONLY WHAT SAYS THE FIGURE MAY BE WRONG (UI rule 4, 2026-09-17): a notice
  // that explains how it was measured is George's to say, not a box's.
  const notices = useDrawnOnly(ownNotices(meta));
  if (!notices.length) return null;
  return <Caveats notices={notices} />;
}


/**
 * Whether a row is one George pointed at.
 *
 * Shared by every tile that draws a list, so "the row that matters" looks the
 * same whichever widget is showing it — and so a sentence naming it becomes
 * unnecessary rather than merely redundant.
 *
 * SEVERAL ROWS, SINCE 2026-09-15. It took one name, and a comparison is about
 * two: asked to compare two shops George drew the estate, lit ONE of them and
 * titled it "Both selected shops gave back basket value" — a claim the
 * drawing could not support, with the comparison pushed into the prose
 * because the picture had nowhere to hold it. A string still means one row,
 * so every board stored before today draws exactly as it did.
 */
export function isLit(o: BoardObject, row: Record<string, unknown>): boolean {
  if (!o.emphasise) return true;
  const want = (Array.isArray(o.emphasise) ? o.emphasise : [o.emphasise])
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  if (!want.length) return true;
  return Object.values(row).some(
    (v) => typeof v === 'string' && want.includes(v.trim().toLowerCase()));
}

/** George's few words about what is drawn. Never a figure. */
function Note({ o }: { o: BoardObject }) {
  if (!o.note) return null;
  return <p className="r-spec-note r-spec-note--over">{o.note}</p>;
}



/**
 * A DRAFT — an order George produced. The quantity a person nudges is theirs
 * and lives here until they say to keep it; nothing is sent by nudging, and
 * the suggested figure stays beside it so an edit is always an edit OF
 * something.
 */
export function DraftTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const [qty, setQty] = useState<Record<number, number>>({});
  if (!rows.length) return <Missing what="the draft" />;
  const meta = call?.result?.meta as (Record<string, unknown> & { supplier?: string; cover_days?: number }) | undefined;
  const suggested = (row: Record<string, unknown>) =>
    Number(row.suggested_order_qty ?? row.requested_ship_qty ?? 0) || 0;
  const total = rows.reduce((s, row, n) => s + (qty[n] ?? suggested(row)), 0);

  return (
    <Shell boxed landing={p.landing} delay={p.delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <p className="r-label">draft order{meta?.supplier ? ` · ${meta.supplier}` : ''}</p>
          <p className="r-say" style={{ fontSize: 17, marginTop: 7 }}>
            {meta?.cover_days ? `Enough to last ${meta.cover_days} days` : 'What is running out'}
          </p>
          <Note o={p.o} />
        </div>
        <span className="r-delta r-delta--none">nothing sent</span>
      </div>

      <div className="r-scroll" style={{ overflowX: 'auto', marginTop: 16 }}>
        <table className="r-rows">
          <thead>
            <tr>
              <th>product</th><th className="n">per day</th>
              <th className="n">on hand</th><th className="n">order</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((row, n) => (
              <tr key={n} data-lit={p.o.emphasise && isLit(p.o, row) ? 'yes' : undefined}>
                <td>
                  <div style={{ color: 'var(--ink)' }}>{String(row.product ?? row.sku ?? '')}</div>
                  <div className="r-src" style={{ marginTop: 3 }}>
                    {row.days_of_cover !== undefined && row.days_of_cover !== null
                      ? `${fmt('days', row.days_of_cover)} days of cover` : ''}
                    {Number(row.days_with_nothing ?? 0) > 0
                      ? ` · out ${fmt('d', row.days_with_nothing)} days` : ''}
                  </div>
                </td>
                <td className="n">{fmt('units_per_day', row.units_per_day)}</td>
                <td className="n">{fmt('on_hand', row.on_hand)}</td>
                <td className="n">
                  <input
                    value={qty[n] ?? suggested(row)}
                    onChange={(e) => setQty((q) => ({ ...q, [n]: Math.max(0, Number(e.target.value) || 0) }))}
                    style={{
                      width: 62, textAlign: 'right', background: 'transparent', color: 'var(--ink)',
                      border: 0, borderBottom: '1px solid var(--edge)', outline: 0,
                      font: '400 13px/1.4 var(--sans)', fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--edge)' }}>
        <div>
          <p className="r-label">units to order</p>
          <div style={{ marginTop: 7 }}>
            <span className="r-num" style={{ '--size': '30px' } as CSSProperties}>
              {total.toLocaleString('en-PH')}
            </span>
          </div>
        </div>
        <p className="r-label" style={{ textAlign: 'right' }}>
          {rows.length} products{rows.length > 30 ? ' · showing 30' : ''}
        </p>
      </div>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/** Where a process stands. */
export function StateTile(p: TileProps) {
  const call = callFor(p);
  const meta = call?.result?.meta as (Record<string, unknown> & {
    run?: { run_date?: string; age_days?: number; stores_covered?: number; lines?: number };
  }) | undefined;
  const label = p.o.label ?? 'pending';
  return (
    <Shell landing={p.landing} delay={p.delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p className="r-label">{label}</p>
        <span className="r-delta r-delta--none">{label}</span>
      </div>
      {meta?.run && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span className="r-num" style={{ '--size': '28px' } as CSSProperties}>
              {String(meta.run.age_days ?? '—')}
            </span>
            <span className="r-label">days since this ran</span>
          </div>
          <p className="r-note" style={{ marginTop: 7 }}>
            run of {meta.run.run_date} · {meta.run.stores_covered} shops · {meta.run.lines?.toLocaleString()} lines
          </p>
        </>
      )}
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* ---------------------------------------------------------------- caveats */

function Caveat({ notice }: { notice: GeorgeNotice }) {
  const [open, setOpen] = useState(false);
  const { head, detail } = splitCaveat(notice.message);
  return (
    <p className="r-caveat">
      {head}
      {detail && (
        <>
          {' '}
          <button type="button" className="r-more" onClick={() => setOpen((o) => !o)}>
            {open ? 'less' : detail.includes(';') ? 'which ones' : 'more'}
          </button>
          {open && <span className="r-caveat-detail">{detail}</span>}
        </>
      )}
    </p>
  );
}

export function Caveats({ notices }: { notices?: GeorgeNotice[] }) {
  if (!notices || notices.length === 0) return null;
  return (
    <div className="r-caveats" data-caveats={notices.length}>
      {notices.map((n, i) => <Caveat key={`${n.kind}-${i}`} notice={n} />)}
    </div>
  );
}

/* ----------------------------------------------------------------- control
 *
 * A HANDLE ON A READ THAT IS ALREADY ON SCREEN. Change the window and every
 * object drawn from that read re-runs — no model turn, nothing read that the
 * person did not ask for. This is the same path the desk replay takes, which
 * is why it costs a second rather than forty.
 *
 * SCOPE ONLY. There is no control that changes a threshold, because a
 * threshold is a definition and lives in metrics.yaml where it was measured.
 * The vocabulary makes that structural rather than a matter of restraint.
 */
const WINDOWS = ['yesterday', 'last_week', 'last_month', 'last_30_days'];
const COUNTS = [5, 10, 25];

export function ControlTile(p: TileProps) {
  const call = callFor(p);
  const argument = p.o.argument ?? 'date_range';
  const current = String(
    (call?.arguments as Record<string, unknown> | undefined)?.[argument] ?? '',
  );
  const options: (string | number)[] = argument === 'top_n' ? COUNTS : WINDOWS;

  return (
    <Shell quiet landing={p.landing} delay={p.delay}>
      <p className="r-label">
        {argument === 'top_n' ? 'how many' : 'window'}
        {p.o.tool ? ` · ${p.o.tool.replace(/^get_/, '')}` : ''}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            className="r-chip"
            aria-pressed={String(option) === current}
            style={String(option) === current
              ? { borderColor: 'var(--edge-strong)', color: 'var(--ink)' }
              : undefined}
            onClick={() => p.on.retune?.(p.o.key, argument, option)}
          >
            {String(option).replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {/* No receipts: a control states no figure. What it changes carries its
          own, and re-runs them when it moves. */}
    </Shell>
  );
}

/* ------------------------------------------------------------------ system
 *
 * SOMETHING THAT RUNS: a saved rule, a standing question, a watch. Drawn over
 * view_automations, which is the read that returns them.
 *
 * The states are not interchangeable and are never collapsed into "on": a
 * watch that is quiet LOOKED and found nothing; one that is not switched on is
 * not looking; one that has never been backtested cannot start. Three
 * different facts about a thing you might be relying on.
 */
export function SystemTile(p: TileProps) {
  const call = callFor(p);
  const rows = rowsOf(call);
  const subject = p.o.subject ?? '';
  const row = rowFor(rows, subject) ?? {};
  const state = String(row.state ?? '');
  const when = row.when ? new Date(String(row.when)) : null;

  return (
    <Shell quiet landing={p.landing} delay={p.delay}
           picked={p.focused}>
      <p className="r-label">{subject}{p.earlier ? ' · from earlier' : ''}</p>
      <p className="r-note" style={{ marginTop: 8 }}>{state || 'no state recorded'}</p>
      {row.by ? (
        <p className="r-label" style={{ marginTop: 8, opacity: 0.8 }}>{String(row.by)}</p>
      ) : null}
      {when && !Number.isNaN(when.getTime()) && (
        <p className="r-label" style={{ marginTop: 6, opacity: 0.75 }}>
          last {when.toLocaleString()}
        </p>
      )}
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ memory
 *
 * WHAT HE REMEMBERS — every view he currently holds, one line each, drawn
 * over `view_memory`.
 *
 * IT IS NOT A MARK, and that is the whole reason it has a tile. The six marks
 * are ways of drawing what a read RETURNED; this has a FORGET on every row,
 * and a gesture per row is not something a drawing of rows can carry — the
 * same reason `draft` kept its editable quantities. `catalogue.NOT_A_MARK`
 * says so and `catalogue.test.ts` holds it there.
 *
 * FOUR THINGS PER ROW, because the question is about the memory and not only
 * about the business: what he thinks, when he learned it, what it RESTS ON,
 * and how many questions it has been carried into. All four come off the row
 * the tool returned; nothing here counts, dates or infers anything.
 *
 * THE COUNT IS DRAWN AS WHAT IT MEASURED. "carried into 9 questions" is what
 * the tool counted; "changed 9 answers" is what nobody measured, and the
 * difference is the difference between a receipt and a claim.
 */
function learnedOn(row: Record<string, unknown>): string | null {
  const when = row.held_since ? new Date(String(row.held_since)) : null;
  return when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString() : null;
}

export function MemoryTile(p: TileProps) {
  const call = callFor(p);
  // EVERY VIEW, NOT A PICK OF THEM. The vocabulary gives this kind `seq` and
  // nothing else (`composition.widgets.memory`), so there is no channel for
  // George to choose which of his views you are shown — which is right: a
  // memory you cannot see all of is not a memory you can check.
  const shown = rowsOf(call);
  const forgotten = new Set(p.local?.forgot ?? []);
  // The tool's own count where it gave one — it counts every view he holds,
  // which can be more than the rows it returns (self_reader.MAX_VIEWS).
  const meta = call?.result?.meta as { held?: unknown } | undefined;
  const held = typeof meta?.held === 'number' ? meta.held : shown.length;

  return (
    <Shell quiet landing={p.landing} delay={p.delay}
           picked={p.focused}>
      <p className="r-label">
        what I think right now
        {/* HOW MANY THERE ARE, so a list that scrolls is not a list that ends.
            *"am i supposed to be able to scroll this memory"* — the tile drew
            four of six and said nothing about the other two. The count is the
            read's own (`meta.held` where it gave one, the rows otherwise) and
            it is a figure, so it wears the read time the source line carries
            below it (UI rule 6). */}
        {shown.length > 0 && (
          <> · {held} {held === 1 ? 'view' : 'views'}</>
        )}
        {p.earlier ? ' · from earlier' : ''}
      </p>
      {shown.length === 0 && (
        /* HOLDING NOTHING IS ITS OWN STATE (UI rule 8) and it renders from
           the rows, which are loaded by the time this draws — never from a
           literal, and never borrowed from not-yet-loaded. */
        <p className="r-note" style={{ marginTop: 10 }}>
          He is not holding a view about anything yet.
        </p>
      )}
      <ul className="r-memory">
        {shown.map((row) => {
          const id = String(row.id ?? '');
          const gone = forgotten.has(id);
          const told = String(row.told ?? '').trim();
          const applied = typeof row.applied === 'number' ? row.applied : null;
          const learned = learnedOn(row);
          return (
            <li key={id || String(row.claim)} className="r-belief"
                data-forgotten={gone ? true : undefined}>
              <p className="r-belief-claim">
                <span className="r-belief-stance">{String(row.stance ?? '')}</span>
                {' '}
                {/* A VIEW ABOUT A STORE WEARS THAT STORE'S SWATCH (P2S.2(e)) —
                    the same hue it has in every figure, by what the row says
                    it is about, never by the name alone. */}
                <Swatch name={String(row.subject ?? '')}
                        dimension={row.subject_kind === 'store' || row.subject_kind === 'product'
                          ? row.subject_kind : undefined} />
                {String(row.subject ?? '')}: {String(row.claim ?? '')}
              </p>
              <p className="r-belief-life">
                {/* WHEN, FROM WHAT, HOW OFTEN — the card's three, in the
                    tool's own words. `told` is quoted because a person said
                    it; a list of reads is not. */}
                {learned && <>learned {learned}</>}
                {row.rests_on ? (
                  <> · {told ? <>you said “{told}”</> : <>from {String(row.rests_on)}</>}</>
                ) : null}
                {applied !== null && (
                  <> · carried into {applied} {applied === 1 ? 'question' : 'questions'}</>
                )}
                {row.carried === false && <> · no longer carried</>}
                {row.unconfirmed === true && <> · unconfirmed since new data landed</>}
              </p>
              {gone ? (
                <p className="r-belief-gone">Forgotten. He will not bring it to the next question.</p>
              ) : (
                <button
                  type="button"
                  className="r-chip"
                  onClick={(e) => { e.stopPropagation(); p.on.forget?.(p.o.key, id); }}
                  disabled={!id || !p.on.forget}
                >
                  Forget
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}

/* -------------------------------------------------------------- composed
 *
 * A shape George composed rather than named. The tile is the ordinary shell —
 * so it cools, sets aside and carries receipts exactly like every other
 * object — and what is inside it is his tree (Spec.tsx).
 *
 * RECEIPTS COME FROM THE READS THE SHAPE NAMES. A composed object may rest on
 * several, so it shows the first one's; each mark's own figures are resolved
 * from its own read, and nothing here is shared across them.
 */
/** What a composed shape is OF: the read's own measure and scope. */
function specLabel(call: ToolCall | null): string {
  const meta = call?.result?.meta;
  const filters = (call?.arguments as { filters?: Record<string, unknown> } | undefined)?.filters;
  const store = typeof filters?.store === 'string' ? filters.store : null;
  const parts = [store, meta?.metric_label ?? call?.tool?.replace(/^get_/, '').replace(/_/g, ' ')]
    .filter((x): x is string => Boolean(x));
  return parts.join(' · ') || 'composed';
}

export function SpecTile(p: TileProps) {
  if (!p.o.spec) return <Missing what="a shape" />;
  const first = (p.o.seqs ?? [])[0];
  const call = first === undefined ? null : (p.retuned ?? callOf(p.turn, first));
  const lit = !p.earlier && p.o.weight !== 'quiet';

  return (
    <Shell quiet={!lit} landing={p.landing} delay={p.delay} picked={p.focused}>
      {/* A SHAPE IS NAMED LIKE EVERY OTHER OBJECT. The grammar has no field
          for a title — a heading is a column or nothing — so the label comes
          from the read: what was measured, and the shop it was filtered to.
          Both are the tool's words. Without this a dots chart of Rockwell's
          hours sat on the board unlabelled, and the reader had to open the
          receipts to learn what the dots were. */}
      <p className="r-label">{specLabel(call)}{p.earlier ? ' · from earlier' : ''}</p>
      {p.o.thought?.trim() && <p className="r-mk-thought">{p.o.thought.trim()}</p>}
      <div style={{ marginTop: 10 }}>
        <Spec node={p.o.spec} turn={p.turn} retuned={{}} />
      </div>
      <Receipts meta={call?.result?.meta} />
    </Shell>
  );
}
