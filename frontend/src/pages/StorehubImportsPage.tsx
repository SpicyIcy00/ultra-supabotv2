/**
 * /storehub-imports — StoreHub's exports, in (P3.h).
 *
 * WHY THIS PAGE EXISTS. Bob reads purchase orders and stock transfers from
 * tables that only a file fills. Until this page the only way to fill them
 * was a session with a superuser string, so the morning of 2026-09-19 said
 * purchase orders were 16 days old and transfers 80 — not because nothing had
 * happened, but because nobody who could export a file could also import it.
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
 * THE LEDGER IS A LOADED LIST (UI rule 8). Checking, failed and empty are
 * three renderings; "nothing imported yet" is a claim about the world and is
 * made only by a loaded, empty result.
 *
 * NO ACCENT ANYWHERE (UI rule 5). Importing a file is not an approval.
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

function Result({ result, at }: { result: ImportResult; at: string | null }) {
  return (
    <section className="r-item" aria-label="This import">
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
        {labelOf(row.kind)} · import {row.id} · {manila(row.uploaded_at) ?? 'no time recorded'}
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
  const input = useRef<HTMLInputElement>(null);

  const ledger = useQuery({
    queryKey: ['storehub-imports'],
    queryFn: listImports,
    staleTime: 30_000,
    retry: 1,
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadExport(kind, file),
    // A refused file writes nothing, so only a success can change the ledger.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storehub-imports'] }),
  });

  const send = (file: File | undefined) => {
    if (!file || upload.isPending) return;
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
                    onClick={() => { setKind(k.kind); upload.reset(); }}>
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
              ? `Importing ${upload.variables?.name ?? 'the file'}…`
              : `Drop the ${chosen.label.toLowerCase()} export here, or choose it`}
          </span>
          <span className="r-src">{chosen.file}</span>
        </label>
      </div>

      {upload.isError && (
        <section className="r-item" aria-label="This upload" role="alert">
          <h2 className="r-item-name">
            {wasRefused(upload.error)
              ? `Refused — nothing was imported from ${upload.variables?.name ?? 'the file'}`
              : `The upload did not go through`}
          </h2>
          {/* The server's sentence, verbatim: for a refusal it names the file
              to fetch instead, and a paraphrase would lose that. */}
          <p className="r-note" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
            {errorMessage(upload.error)}
          </p>
        </section>
      )}

      {result && !upload.isError && <Result result={result} at={resultAt} />}

      {/* No heading over nothing: when the only import there has ever been is
          the one drawn above, there is no "earlier" to head. */}
      {!(ledger.isSuccess && ledger.data.length > 0 && earlier.length === 0) && (
        <h2 className="r-import-h">Earlier imports</h2>
      )}
      {ledger.isPending && <p className="r-note">Checking…</p>}
      {ledger.isError && <p className="r-say" style={{ fontSize: 15 }}>The ledger could not be read.</p>}
      {ledger.isSuccess && ledger.data.length === 0 && (
        <p className="r-say" style={{ fontSize: 15 }}>No file has been imported yet.</p>
      )}
      {/* "No file yet" is a claim about the whole ledger, so it is made from
          the whole loaded list, never from the list with this import left out. */}
      {ledger.isSuccess && earlier.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {earlier.map((row) => <LedgerRow key={row.id} row={row} />)}
        </ul>
      )}
    </>
  );
}
