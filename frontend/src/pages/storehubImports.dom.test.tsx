// @vitest-environment jsdom
/**
 * THE UPLOAD PAGE DRAWS THE SERVER'S ANSWER, AND NOTHING ELSE (P3.h).
 *
 * The card's done-when, the half a browser owns:
 *
 *   - a file chosen on the page goes up under the chosen kind, and the result
 *     is drawn from the RESPONSE — counts, SKUs, header totals, the notices
 *     above them — with its time taken from its own ledger row;
 *   - the same file again draws what the server said: nothing inserted;
 *   - a refusal (422) is drawn as a refusal, in the parser's own sentence,
 *     and reads differently from an upload that merely failed;
 *   - the ledger is a loaded list: checking, failed and empty are three
 *     renderings and none borrows another's words (UI rule 8).
 *
 * The server half — that a re-import converges and the document-only export
 * is refused by name — is tests/test_storehub_parser.py and
 * tests/test_storehub_import_contract.py.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import StorehubImportsPage, { countLines } from './StorehubImportsPage';
import type { ImportResult, ImportSummary } from '../services/storehubImportsApi';

const listImports = vi.fn();
const uploadExport = vi.fn();
vi.mock('../services/storehubImportsApi', async (original) => ({
  ...(await original<typeof import('../services/storehubImportsApi')>()),
  listImports: () => listImports(),
  uploadExport: (kind: string, file: File) => uploadExport(kind, file),
}));
afterEach(() => { cleanup(); listImports.mockReset(); uploadExport.mockReset(); });

const FIRST: ImportResult = {
  import_id: 15, kind: 'purchase_orders', filename: 'Purchase_Orders_09-19-2026.csv',
  sha256: 'ab'.repeat(32),
  counters: {
    documents_seen: 58, lines_seen: 264, documents_inserted: 57, documents_updated: 1,
    lines_inserted: 264, lines_updated: 0, lines_deleted: 0,
    unmatched_skus: 6, ambiguous_skus: 1, header_total_mismatches: 2,
    unresolved_locations: 0, subtotal_mismatches: 0, mojibake_names: 0,
  },
  notices: [{ kind: 'unresolved_skus', message: '6 SKU(s) matched no product and 1 matched more than one.' }],
};

const AGAIN: ImportResult = {
  ...FIRST, import_id: 16,
  counters: { ...FIRST.counters, documents_inserted: 0, documents_updated: 58,
              lines_inserted: 0, lines_updated: 264 },
};

const ledgerRow = (result: ImportResult, at: string): ImportSummary => ({
  id: result.import_id, kind: result.kind, filename: result.filename, sha256: result.sha256,
  uploaded_by: 'ice', uploaded_at: at, notices: result.notices,
  ...(result.counters as unknown as Omit<ImportSummary,
    'id' | 'kind' | 'filename' | 'sha256' | 'uploaded_by' | 'uploaded_at' | 'notices'>),
});

const refusal = (status: number, detail: string) =>
  Object.assign(new Error('Request failed'), {
    isAxiosError: true, response: { status, data: { detail } },
  });

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><StorehubImportsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const choose = (name: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'text/csv' })] } });
};

describe('the StoreHub exports page', () => {
  it('draws the result from the response, notices above the counts, timed by its ledger row', async () => {
    listImports.mockResolvedValueOnce([]);
    listImports.mockResolvedValue([ledgerRow(FIRST, '2026-09-19T10:05:00+00:00')]);
    uploadExport.mockResolvedValue(FIRST);
    page();
    await screen.findByText('No file has been imported yet.');

    choose('Purchase_Orders_09-19-2026.csv');
    const result = await screen.findByRole('region', { name: 'This import' });
    expect(uploadExport).toHaveBeenCalledWith('purchase_orders', expect.any(File));

    const text = result.textContent ?? '';
    expect(text).toContain('Documents: 57 inserted · 1 updated — 58 in the file');
    expect(text).toContain('Lines: 264 inserted · 0 updated · 0 deleted — 264 in the file');
    expect(text).toContain('SKUs with no product link: 6 unmatched · 1 ambiguous');
    expect(text).toContain('Header totals that disagree with their lines: 2');
    expect(text).not.toContain('Locations that match no store');   // the server counted none
    // UI rule 4: what the counts may not mean is said BEFORE the counts.
    expect(text.indexOf('matched no product')).toBeLessThan(text.indexOf('Documents:'));
    // UI rule 6: the time is the ledger row's, 18:05 in Manila — not the browser's.
    await waitFor(() => expect(result.textContent).toContain('6:05'));
    // The ledger holds it now, so "no file yet" is gone — and the import is
    // drawn ONCE: it is not an earlier import, so nothing heads an empty list.
    expect(screen.queryByText('No file has been imported yet.')).toBeNull();
    expect(screen.getAllByText('Purchase_Orders_09-19-2026.csv')).toHaveLength(1);
    expect(screen.queryByText('Earlier imports')).toBeNull();
  });

  it('draws the same file again as what the server said: nothing inserted', async () => {
    listImports.mockResolvedValue([]);
    uploadExport.mockResolvedValue(AGAIN);
    page();
    await screen.findByText('No file has been imported yet.');
    choose('Purchase_Orders_09-19-2026.csv');
    const result = await screen.findByRole('region', { name: 'This import' });
    expect(result.textContent).toContain('Documents: 0 inserted · 58 updated');
    expect(result.textContent).toContain('Lines: 0 inserted · 264 updated · 0 deleted');
  });

  it('sends a transfer export under the transfer kind', async () => {
    listImports.mockResolvedValue([]);
    uploadExport.mockResolvedValue({ ...FIRST, kind: 'stock_transfers' });
    page();
    fireEvent.click(screen.getByRole('radio', { name: 'Stock transfers' }));
    choose('StockTransfers_FROM-ajiichiban.csv');
    await waitFor(() => expect(uploadExport).toHaveBeenCalledWith('stock_transfers', expect.any(File)));
  });

  it('draws a refusal as a refusal, in the parser\'s own sentence', async () => {
    const sentence = "This is StoreHub's document-only stock transfer export "
      + '(Stock_Transfer_MM-DD-YYYY.csv): one row per transfer. Export the transfers WITH their '
      + 'items instead - the file named StockTransfers_FROM-... - and upload that.';
    listImports.mockResolvedValue([]);
    uploadExport.mockRejectedValue(refusal(422, sentence));
    page();
    fireEvent.click(screen.getByRole('radio', { name: 'Stock transfers' }));
    choose('Stock_Transfer_09-03-2026.csv');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Refused — nothing was imported from Stock_Transfer_09-03-2026.csv');
    expect(alert.textContent).toContain(sentence);
    expect(screen.queryByRole('region', { name: 'This import' })).toBeNull();
  });

  it('does not call a failed upload a refusal', async () => {
    listImports.mockResolvedValue([]);
    uploadExport.mockRejectedValue(refusal(403, "Your role does not have access to 'storehub_imports'"));
    page();
    choose('Purchase_Orders_09-19-2026.csv');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The upload did not go through');
    expect(alert.textContent).not.toContain('Refused');
    expect(alert.textContent).toContain("does not have access to 'storehub_imports'");
  });

  it('keeps checking, failed and empty apart (UI rule 8)', async () => {
    let settle: (rows: ImportSummary[]) => void = () => {};
    listImports.mockReturnValue(new Promise<ImportSummary[]>((resolve) => { settle = resolve; }));
    page();
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(screen.queryByText('No file has been imported yet.')).toBeNull();
    settle([]);
    await screen.findByText('No file has been imported yet.');
    cleanup();

    listImports.mockReset();
    listImports.mockRejectedValue(new Error('down'));
    page();
    // The page retries the ledger once before it says so; wait past that.
    await screen.findByText('The ledger could not be read.', undefined, { timeout: 4000 });
    expect(screen.queryByText('No file has been imported yet.')).toBeNull();
  });

  it('lists earlier imports with who, when and the same lines the result uses', async () => {
    listImports.mockResolvedValue([
      ledgerRow(AGAIN, '2026-09-19T10:09:00+00:00'),
      ledgerRow(FIRST, '2026-09-19T10:05:00+00:00'),
    ]);
    page();
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('import 16');
    expect(rows[0].textContent).toContain('ice');
    expect(rows[0].textContent).toContain('6:09');
    expect(rows[0].textContent).toContain(countLines(AGAIN.counters)[0]);
    // A row's notices are there to open, and closed until asked for.
    expect(rows[0].textContent).not.toContain('matched no product');
    fireEvent.click(screen.getAllByRole('button', { name: /Show its notice/ })[0]);
    expect(rows[0].textContent).toContain('matched no product');
  });
});
