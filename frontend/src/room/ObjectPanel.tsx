/**
 * WHAT IS INSIDE A THING WHEN YOU OPEN IT.
 *
 * Tapping a shop used to focus its tile and show the same one figure larger.
 * The complaint was exact — "there's so little data shown, there's nothing to
 * expand" — and this is the inside: its week, what moved it, what is selling,
 * what has run out, and what Bob thinks about it.
 *
 * NO MODEL TURN. One request, about a second, the same reads every time. The
 * server runs the identical tool Bob is given, so tapping and asking cannot
 * show different numbers.
 *
 * THIS IS PLUMBING, NOT A DESIGN. It reuses the room's existing type, table and
 * receipts styles deliberately — the visual pass comes at the end, and a second
 * visual vocabulary invented here would be the thing that has to be undone.
 * IT DID INVENT ONE ANYWAY, in the one place nobody looked: the table below
 * ran `fmt` over every cell, so a change had no arrow and no direction here
 * and had both everywhere else. It draws a change with `Delta` now, which is
 * the only definition of what a measured change looks like.
 *
 * FIVE SECTION STATES, DRAWN AS FIVE THINGS (UI rule 8). Available, empty,
 * refused, failed and unresolved are different facts: "nothing is out of stock here" is
 * not "the shelf could not be read", and neither is "I do not know which
 * product you meant". A section is never dropped for being empty, because a
 * section that vanished reads as "there is nothing here".
 */
import { useQuery } from '@tanstack/react-query';
import { openObject, type ObjectSection, type ObjectView } from '../services/objectApi';
import type { AnswerTurn, Dimension } from './data';
import { changeOf, fmt, receiptsDetail, receiptsLine, unitOf } from './data';
import type { ToolMeta } from '../types/bob';
import { Spec } from './Spec';
import { Delta } from './tiles';

/** Which object kind a board subject is. Only these can be opened. */
export function kindOf(dimension: Dimension | null | undefined): string | null {
  if (dimension === 'store') return 'shop';
  if (dimension === 'product') return 'product';
  // A supplier became a subject with P2.c, and `get_object` has opened one all
  // along — it is the orders section, which is what a supplier IS in this
  // record. A category still cannot be opened: there is no object for one.
  if (dimension === 'supplier') return 'supplier';
  return null;
}

export function useObject(kind: string | null, name: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['object', kind, name],
    queryFn: () => openObject(kind as string, name as string),
    enabled: Boolean(enabled && kind && name),
    staleTime: 60_000,
    retry: false,
  });
}

/** Columns worth showing, in a fixed order, capped so a section stays a glance. */
const HIDE = /(_id$|^section$|^unit$|^direction$|^baseline_status$|^receipts$)/;

function columns(rows: Record<string, unknown>[]): string[] {
  const keys = Object.keys(rows[0] ?? {}).filter((k) => !HIDE.test(k));
  const rank: Record<string, number> = {
    store: 0, product: 1, sku: 2, name: 1, value: 3, change_pct: 4,
    quantity_on_hand: 3, basis: 0, unit_cost: 3, document_date: 4,
  };
  return keys.sort((a, b) => (rank[a] ?? 5) - (rank[b] ?? 5)).slice(0, 5);
}

function Rows({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = columns(rows);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="r-rows">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={typeof rows[0][c] === 'number' ? 'n' : ''}>
                {c.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, n) => (
            <tr key={n}>
              {cols.map((c) => (
                <td key={c} className={typeof row[c] === 'number' ? 'n' : ''}>
                  {/* A CHANGE IS DRAWN AS A CHANGE HERE TOO (the dogfood log,
                      2026-09-15). *"why do these have no color? there should
                      be color right?"* — and he was right: this table ran
                      `fmt` over every cell, so `+1.5%` was plain text in the
                      panel while the same figure on the board wore its
                      direction's arrow and colour. `Delta` is the one
                      definition of how a measured change looks, and the
                      panel was the last place not using it.

                      The row's own unit still decides the currency, not the
                      name of the column (P1.c). */}
                  {c === 'change_pct'
                    ? <Delta change={changeOf(row)} />
                    : fmt(c, row[c], unitOf(row))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sections in order, with the reads of one section kept together. */
function group(sections: ObjectSection[]): [string, ObjectSection[]][] {
  const out: [string, ObjectSection[]][] = [];
  for (const section of sections) {
    const last = out[out.length - 1];
    if (last && last[0] === section.section) last[1].push(section);
    else out.push([section.section, [section]]);
  }
  return out;
}

/**
 * THE SECTIONS THAT ARE INSTRUMENTS. A shop's thirty days are a range and a
 * calendar, its hours are dots — the same marks Bob composes with, drawn
 * over the section's own rows, so opening a shop looks like the board and
 * not like a report about it. Every other section is rows.
 */
const INSTRUMENTED = new Set(['days', 'hours']);

function Instrument({ section }: { section: ObjectSection }) {
  const turn = {
    toolCalls: [{
      seq: 0, tool: section.call?.tool, arguments: section.call?.arguments ?? {},
      result: { rows: section.rows, meta: section.meta ?? {} },
    }],
  } as unknown as AnswerTurn;
  if (section.section === 'days') {
    return (
      <>
        <Spec node={{ mark: 'range', seq: 0, field: 'value', by: 'day' }} turn={turn} retuned={{}} />
        <div style={{ marginTop: 16 }}>
          <Spec node={{ mark: 'calendar', seq: 0, field: 'value', by: 'day' }} turn={turn} retuned={{}} />
        </div>
      </>
    );
  }
  if (section.section === 'hours') {
    return <Spec node={{ mark: 'dots', seq: 0, field: 'value', by: 'hour' }} turn={turn} retuned={{}} />;
  }
  return <Rows rows={section.rows} />;
}

function Section({ section }: { section: ObjectSection }) {
  const meta = (section.meta ?? null) as ToolMeta | null;
  const receipts = receiptsLine(meta);
  return (
    <div style={{ marginTop: 10 }}>
      {section.state === 'available' && (
        INSTRUMENTED.has(section.section) ? <Instrument section={section} /> : <Rows rows={section.rows} />
      )}
      {/* Each of the three non-available states says a different thing, and
          none of them is "nothing here". */}
      {section.state === 'empty' && (
        <p className="r-note" style={{ marginTop: 6 }}>Nothing to show — this read came back with no rows.</p>
      )}
      {/* A refusal is a real answer with a reason, not an error. */}
      {section.state === 'refused' && (
        <p className="r-note" style={{ marginTop: 6 }}>{section.reason}</p>
      )}
      {section.state === 'failed' && (
        <p className="r-note" style={{ marginTop: 6 }}>This could not be read. {section.reason}</p>
      )}
      {section.state === 'unresolved' && (
        <p className="r-note" style={{ marginTop: 6 }}>{section.reason}</p>
      )}
      {receipts && (
        <p className="r-src" style={{ marginTop: 8 }} title={receiptsDetail(meta)}>{receipts}</p>
      )}
    </div>
  );
}

/** What Bob thinks, with when he formed it and whether it has been checked since. */
function View({ view }: { view: ObjectView['view'] }) {
  if (!view) {
    // NOT the same as "he thinks nothing is wrong", and it must not read that way.
    return (
      <p className="r-note" style={{ marginTop: 6 }}>
        Bob has not formed a view on this yet.
      </p>
    );
  }
  if (view.state === 'unavailable') {
    return <p className="r-note" style={{ marginTop: 6 }}>{view.reason}</p>;
  }
  return (
    <div style={{ marginTop: 6 }}>
      <p className="r-note" style={{ color: 'rgb(var(--bob))' }}>{view.claim}</p>
      <p className="r-label" style={{ marginTop: 6, opacity: 0.75 }}>
        {view.stance}
        {view.held_since && ` · held since ${new Date(view.held_since).toLocaleDateString()}`}
        {view.unconfirmed && ' · not checked against data that has landed since'}
      </p>
    </div>
  );
}

export function ObjectPanel({ kind, name }: { kind: string; name: string }) {
  const { data, isPending, isError } = useObject(kind, name, true);

  // Three outcomes, three renderings — loading may never borrow the words of
  // empty (UI rule 8).
  if (isPending) return <p className="r-label" style={{ marginTop: 16 }}>Opening {name}…</p>;
  if (isError || !data) {
    return <p className="r-note" style={{ marginTop: 16 }}>{name} could not be opened.</p>;
  }

  const notice = data.meta?.notice as { message?: string } | null | undefined;

  return (
    // `.r-obj` draws the rule in the object's OWN hue — the one identity colour
    // left in the room (P2.l). It was the board's grey edge; on a panel about
    // one named thing, a colour that says which thing is the point.
    <div className="r-obj">
      {/* A caveat sits ABOVE the figures it qualifies, always (UI rule 4). */}
      {notice?.message && (
        <p className="r-note" style={{ marginTop: 14, borderLeft: '2px solid var(--edge)', paddingLeft: 10 }}>
          {notice.message}
        </p>
      )}
      <div style={{ marginTop: 18 }}>
        <p className="r-label">what Bob thinks</p>
        <View view={data.view} />
      </div>
      {/* One heading per section, however many reads it took. `drivers` is
          two reads — transactions and basket value — and printing its
          sentence twice made the same explanation look like two findings. */}
      {group(data.sections).map(([name, sections]) => (
        <div key={name} style={{ marginTop: 18 }}>
          <p className="r-label">{sections[0].says}</p>
          {sections.map((section, n) => (
            <Section key={n} section={section} />
          ))}
        </div>
      ))}
    </div>
  );
}
