/**
 * /storehub-imports — StoreHub's exports, in (P3.h).
 *
 * WHY THIS PAGE EXISTS. Bob reads purchase orders, stock transfers and the
 * supplier list from tables that only a file fills. Until this page the only
 * way to fill them was a session with a superuser string, so the morning of
 * 2026-09-19 said purchase orders were 16 days old and transfers 80 — not
 * because nothing had happened, but because nobody who could export a file
 * could also import it.
 *
 * WHAT IT DRAWS IS THE SERVER'S ANSWER, ALL OF IT. An import can succeed
 * completely while saying that six SKUs matched nothing or that a re-import
 * removed lines. Those sentences decide whether a figure built on this data
 * means what it appears to, so they are drawn ABOVE the counts (UI rule 4),
 * in the server's words. A page that showed "imported 58 documents" and
 * stopped would be discarding the half that carries the caveats.
 *
 * A REFUSAL IS NOT A FAILURE, AND THEY READ DIFFERENTLY. A 422 is the parser
 * declining a file it cannot trust: nothing was written, and its sentence
 * says which file to fetch instead (the document-only transfer export is
 * refused by name). Anything else — a lost connection, no access — is an
 * upload that did not happen, and says only that.
 *
 * ONE TAB IS ONE RECORD (the owner, 2026-09-19: "it shouldnt show all imports
 * in all import pages it should be show past imports per tab"). Choosing a
 * kind changes what is uploaded AND what is listed; the ledger is read per
 * kind from the server, not filtered in the browser, so the list is the
 * server's answer to the question this tab asks.
 *
 * WHAT HAPPENED IS LOUD, WHAT HAPPENED BEFORE IS FOLDED AWAY (the owner, same
 * day: "it can just hide first and then when you upload i new file it needs to
 * be clear its processing with a bar and green if it went through and red if
 * it failed"). So: a bar while it is going up, one outcome band when it lands,
 * and the history closed behind a line you can open.
 *
 * THE OUTCOME COLOURS ARE NOT THE ACCENT AND NOT A MEASUREMENT (UI rule 5).
 * `--landed` and `--refused` say what happened to the file this person just
 * chose. They are not "needs you" — nothing is waiting on a decision — and
 * they are not `--up` / `--down`, which mean a direction a tool measured.
 * `accentUse.test.ts` holds all three families apart.
 *
 * THE LEDGER IS A LOADED LIST (UI rule 8). Checking, failed and empty are
 * three renderings; "nothing imported yet" is a claim about the world and is
 * made only by a loaded, empty result.
 *
 * Every count carries a time (UI rule 6): a ledger row its own `uploaded_at`,
 * and the result above it borrows the time of ITS ledger row once the list has
 * reloaded — from the server, never the browser's clock.
 */
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoomHead } from '../room/RoomShell';
import { errorMessage } from '../services/pinsApi';
import {
  listImports, uploadExport, wasRefused,
} from '../services/storehubImportsApi';
import type {
  ImportKind, ImportNotice, ImportResult, ImportSummary,
} from '../services/storehubImportsApi';

const KINDS: { kind: ImportKind; label: string; file: string }[] = [
  { kind: 'purchase_orders', label: 'Purchase orders', file: 'Purchase_Orders_….csv' },
  { kind: 'stock_transfers', label: 'Stock transfers', file: 'StockTransfers_FROM-….csv' },
  { kind: 'products', label: 'Products', file: 'Products_FROM-….csv' },
];

const labelOf = (kind: string): string =>
  KINDS.find((k) => k.kind === kind)?.label ?? kind;

const n = (value: number | undefined): string => (value ?? 0).toLocaleString('en-PH');

function manila(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

/**
 * The counts of one import as lines of words, from the server's own fields.
 * Shared by the fresh result and every ledger row, so the two cannot describe
 * the same import differently. A line about a problem is present only when
 * the server counted one; the two that say what landed are always present.
 */
export function countLines(
  c: Record<string, number | undefined>,
  kind: string = 'purchase_orders',
): string[] {
  // A products export has no documents and no lines, and saying "0 documents"
  // about it would be a fact about the wrong thing. It counts what it changed.
  if (kind === 'products') {
    const rows = [
      `Products: ${n(c.products_matched)} matched in the catalogue`
        + ` — ${n(c.products_seen)} in the file`,
      `Suppliers: ${n(c.suppliers_inserted)} added · ${n(c.suppliers_updated)} unchanged · `
        + `${n(c.suppliers_deleted)} removed`,
      `Stock levels: ${n(c.stock_levels_inserted)} added · ${n(c.stock_levels_updated)} unchanged · `
        + `${n(c.stock_levels_deleted)} removed`,
    ];
    if (c.unknown_products) {
      rows.push(`Products in the file with no catalogue row: ${n(c.unknown_products)}`);
    }
    if (c.rows_without_product_id) {
      rows.push(`Rows carrying no Product Id: ${n(c.rows_without_product_id)}`);
    }
    if (c.unresolved_locations) {
      rows.push(`Locations that match no store: ${n(c.unresolved_locations)}`);
    }
    return rows;
  }

  const lines = [
    `Documents: ${n(c.documents_inserted)} inserted · ${n(c.documents_updated)} updated`
      + ` — ${n(c.documents_seen)} in the file`,
    `Lines: ${n(c.lines_inserted)} inserted · ${n(c.lines_updated)} updated · `
      + `${n(c.lines_deleted)} deleted — ${n(c.lines_seen)} in the file`,
  ];
  if (c.unmatched_skus || c.ambiguous_skus) {
    lines.push(`SKUs with no product link: ${n(c.unmatched_skus)} unmatched · `
      + `${n(c.ambiguous_skus)} ambiguous`);
  }
  if (c.header_total_mismatches) {
    lines.push(`Header totals that disagree with their lines: ${n(c.header_total_mismatches)}`);
  }
  if (c.unresolved_locations) {
    lines.push(`Locations that match no store: ${n(c.unresolved_locations)}`);
  }
  return lines;
}

function Notices({ notices }: { notices: ImportNotice[] }) {
  if (!notices.length) return null;
  return (
    <ul className="r-import-notices" aria-label="Notices from this import">
      {notices.map((notice, i) => (
        <li key={`${notice.kind}-${i}`} className="r-note" style={{ whiteSpace: 'pre-line' }}>
          {notice.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * The bar, in the four states a file can be in.
 *
 * `sending` is the only one with a real fraction, and it is the bytes that
 * have left this browser. Once they all have, nothing measurable is
 * happening in the browser at all — the server is parsing, resolving and
 * writing, in one transaction, reporting nothing — so the bar goes to a
 * moving stripe and says `reading`, which is true, instead of a number
 * nobody computed.
 */
function Progress({ state, sent, says }: {
  state: 'sending' | 'reading' | 'landed' | 'refused';
  sent: number;
  says: string;
}) {
  const pct = state === 'sending' ? Math.round(sent * 100) : 100;
  return (
    <div className="r-import-progress" data-state={state}>
      <div className="r-bar" role="progressbar" aria-label={says}
           aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={state === 'sending' ? pct : undefined}>
        <span className="r-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="r-src" style={{ marginTop: 8 }}>
        {says}{state === 'sending' ? ` · ${pct}%` : ''}
      </p>
    </div>
  );
}

function Result({ result, at }: { result: ImportResult; at: string | null }) {
  return (
    <section className="r-item r-import-out" data-state="landed" aria-label="This import">
      <h2 className="r-item-name">{result.filename}</h2>
      <p className="r-src" style={{ marginTop: 6 }}>
        {labelOf(result.kind)} · import {result.import_id}
        {at ? ` · ${at}` : ''}
      </p>
      {/* ABOVE the counts, because they say what the counts may not mean. */}
      <Notices notices={result.notices} />
      {countLines(result.counters, result.kind).map((line) => (
        <p key={line} className="r-item-of" style={{ marginTop: 8 }}>{line}</p>
      ))}
    </section>
  );
}

function LedgerRow({ row }: { row: ImportSummary }) {
  const [open, setOpen] = useState(false);
  // The whole counter dict when the ledger has it, the flat columns when it
  // does not — an import recorded before the ledger carried `counters`.
  const counts = row.counters ?? (row as unknown as Record<string, number>);
  return (
    <li className="r-item">
      <h3 className="r-item-name" style={{ fontSize: 15 }}>{row.filename}</h3>
      <p className="r-src" style={{ marginTop: 6 }}>
        import {row.id} · {manila(row.uploaded_at) ?? 'no time recorded'}
        {' · '}{row.uploaded_by}
      </p>
      {countLines(counts, row.kind).map((line) => (
        <p key={line} className="r-item-of" style={{ marginTop: 6 }}>{line}</p>
      ))}
      {row.notices.length > 0 && (
        <div className="r-row-acts" style={{ marginTop: 8 }}>
          <button type="button" className="r-act" aria-expanded={open}
                  onClick={() => setOpen((was) => !was)}>
            {open ? 'Hide' : 'Show'} {row.notices.length === 1 ? 'its notice' : `its ${row.notices.length} notices`}
          </button>
        </div>
      )}
      {open && <Notices notices={row.notices} />}
    </li>
  );
}

export default function StorehubImportsPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<ImportKind>('purchase_orders');
  const [over, setOver] = useState(false);
  const [sent, setSent] = useState(0);
  const [showEarlier, setShowEarlier] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // PER TAB. The kind is in the key, so switching tabs is a different question
  // with a different answer, and the orders tab never shows a products import.
  const ledger = useQuery({
    queryKey: ['storehub-imports', kind],
    queryFn: () => listImports(kind),
    staleTime: 30_000,
    retry: 1,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadExport(kind, file, setSent),
    // A refused file writes nothing, so only a success can change the ledger.
    // The rail reads every kind, so its copy is invalidated too.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storehub-imports'] }),
  });

  const send = (file: File | undefined) => {
    if (!file || upload.isPending) return;
    setSent(0);
    upload.mutate(file);
    if (input.current) input.current.value = '';   // the same file may be chosen again
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    send(event.dataTransfer.files?.[0]);
  };

  const chosen = KINDS.find((k) => k.kind === kind)!;
  const result = upload.data;
  const refused = upload.isError && wasRefused(upload.error);
  const filename = upload.variables?.name ?? 'the file';
  // The result's time is its ledger row's — the server's, once the list holds it.
  const resultAt = result
    ? manila(ledger.data?.find((row) => row.id === result.import_id)?.uploaded_at ?? null)
    : null;
  // The import drawn above is not an EARLIER one, and the same thing is never
  // drawn twice on one screen. It joins the list on the next visit.
  const shownAbove = result && !upload.isError ? result.import_id : null;
  const earlier = (ledger.data ?? []).filter((row) => row.id !== shownAbove);

  return (
    <>
      <RoomHead
        title="StoreHub exports"
        says="Purchase orders, stock transfers and the product list reach Bob from the files StoreHub exports. Choose which one, then drop the file. The same file twice changes nothing."
      />

      <div className="r-import">
        <div className="r-row-acts" role="radiogroup" aria-label="Which export" style={{ marginTop: 0 }}>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind}
                    className="r-import-kind" data-on={kind === k.kind ? 'yes' : 'no'}
                    disabled={upload.isPending}
                    onClick={() => {
                      if (k.kind === kind) return;
                      setKind(k.kind);
                      setShowEarlier(false);
                      upload.reset();
                    }}>
              {k.label}
            </button>
          ))}
        </div>

        <label className="r-drop" data-over={over ? 'yes' : 'no'}
               data-busy={upload.isPending ? 'yes' : 'no'}
               onDragOver={(e) => { e.preventDefault(); setOver(true); }}
               onDragLeave={() => setOver(false)}
               onDrop={onDrop}>
          <input ref={input} type="file" accept=".csv,text/csv" className="r-drop-input"
                 aria-label={`Choose a ${chosen.label.toLowerCase()} export`}
                 disabled={upload.isPending}
                 onChange={(e) => send(e.target.files?.[0])} />
          <span className="r-say" style={{ fontSize: 15 }}>
            {upload.isPending
              ? `Importing ${filename}…`
              : `Drop the ${chosen.label.toLowerCase()} export here, or choose it`}
          </span>
          <span className="r-src">{chosen.file}</span>
        </label>
      </div>

      {/* WHILE IT IS GOING. Sending is measured; reading is not, and does not
          pretend to be. */}
      {upload.isPending && (
        <Progress state={sent < 1 ? 'sending' : 'reading'} sent={sent}
                  says={sent < 1 ? `Sending ${filename}` : `Reading ${filename}`} />
      )}

      {upload.isError && (
        <section className="r-item r-import-out" data-state="refused"
                 aria-label="This upload" role="alert">
          <Progress state="refused" sent={1}
                    says={refused ? 'Refused — nothing was imported' : 'The upload did not go through'} />
          <h2 className="r-item-name" style={{ marginTop: 10 }}>
            {refused ? `Refused — nothing was imported from ${filename}` : 'The upload did not go through'}
          </h2>
          {/* The server's sentence, verbatim: for a refusal it names the file
              to fetch instead, and a paraphrase would lose that. */}
          <p className="r-note" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
            {errorMessage(upload.error)}
          </p>
        </section>
      )}

      {result && !upload.isError && <Result result={result} at={resultAt} />}

      {/* EARLIER IS FOLDED AWAY. One line saying how many there are, and the
          list only if it is asked for. The count is a claim about the world,
          so it is drawn from the loaded result and from nothing else. */}
      {ledger.isPending && <p className="r-note" style={{ marginTop: 20 }}>Checking earlier imports…</p>}
      {ledger.isError && (
        <p className="r-say" style={{ fontSize: 15, marginTop: 20 }}>
          Earlier {chosen.label.toLowerCase()} imports could not be read.
        </p>
      )}
      {ledger.isSuccess && earlier.length === 0 && !result && (
        <p className="r-say" style={{ fontSize: 15, marginTop: 20 }}>
          No {chosen.label.toLowerCase()} export has been imported yet.
        </p>
      )}
      {ledger.isSuccess && earlier.length > 0 && (
        <div className="r-row-acts" style={{ marginTop: 20 }}>
          <button type="button" className="r-act" aria-expanded={showEarlier}
                  onClick={() => setShowEarlier((was) => !was)}>
            {showEarlier ? 'Hide' : 'Show'} {earlier.length} earlier{' '}
            {chosen.label.toLowerCase()} {earlier.length === 1 ? 'import' : 'imports'}
          </button>
        </div>
      )}
      {ledger.isSuccess && showEarlier && earlier.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
          {earlier.map((row) => <LedgerRow key={row.id} row={row} />)}
        </ul>
      )}
    </>
  );
}
