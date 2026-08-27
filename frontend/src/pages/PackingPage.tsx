/**
 * Packing — replaces the packing Google Sheet.
 *
 * Build tab:   search for any product and add it, entering EITHER a pack count
 *              OR a target weight in kg. The list is created on the first
 *              product, so there is no form to fill in before starting. The
 *              server derives the other figure and the running totals.
 * History tab: past lists, reopened to key in actual_packed and remarks after
 *              the physical packing is done.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProductPicker } from '../components/packing/ProductPicker';
import { PackingListTable } from '../components/packing/PackingListTable';
import { PrintableSheet, PRINT_STYLES } from '../components/packing/PrintableSheet';
import { PackWeightsTab } from '../components/packing/PackWeightsTab';
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  formatDateTime,
  getHistory,
  getList,
  updateItem,
  updateList,
  type ItemRecord,
  type ListDetail,
  type ListSummary,
  type PackUnit,
  type ProductOption,
} from '../services/packingApi';

type PackingTab = 'build' | 'history' | 'weights';

const TABS: { key: PackingTab; label: string }[] = [
  { key: 'build', label: 'Build List' },
  { key: 'history', label: 'History' },
  { key: 'weights', label: 'Pack Weights' },
];

const errText = (e: any, fallback: string) => e?.response?.data?.detail ?? fallback;

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-amber-400',
  done: 'text-green-400',
};

// ---------------------------------------------------------------------------
// Build tab
// ---------------------------------------------------------------------------

interface BuildTabProps {
  list: ListDetail | null;
  setList: (l: ListDetail | null) => void;
  /** Called once a list is put away, so the page can show it in History. */
  onFinished: () => void;
}

function BuildTab({ list, setList, onFinished }: BuildTabProps) {
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [unit, setUnit] = useState<PackUnit>('packs');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState<ListDetail | null>(null);

  const add = async () => {
    if (!product) return;
    const qty = Number(quantity);
    if (!(qty > 0)) {
      setError('Enter a quantity greater than zero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // The list is created lazily on the first product, so staff can just
      // start searching instead of filling in a form before any real work.
      const target = list ?? (await createList());
      setList(await addItem(target.id, { product_id: product.id, unit, quantity: qty }));
      setProduct(null);
      setQuantity('');
    } catch (e: any) {
      setError(errText(e, 'Could not add that product.'));
    } finally {
      setBusy(false);
    }
  };

  const changeQuantity = async (item: ItemRecord, next: number) => {
    setBusy(true);
    setError('');
    try {
      setList(await updateItem(item.id, { quantity: next }));
    } catch (e: any) {
      setError(errText(e, 'Could not update that row.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: ItemRecord) => {
    setBusy(true);
    setError('');
    try {
      setList(await deleteItem(item.id));
    } catch (e: any) {
      setError(errText(e, 'Could not remove that row.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Render the sheet offscreen, print it, then tear it down. Printing in place
   * avoids a second tab, a second page load and the popup blocker — the OS
   * dialog just appears over the app.
   */
  const printInPlace = (target: ListDetail) =>
    new Promise<void>((resolve) => {
      setPrinting(target);
      // Two frames: one for React to commit the sheet, one for layout to settle
      // before the browser snapshots the page.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.print();
          setPrinting(null);
          resolve();
        }),
      );
    });

  /** Put the list away and hand the user over to History, where it now lives. */
  const close = async (target: ListDetail) => {
    setBusy(true);
    try {
      await updateList(target.id, { status: 'in_progress' });
      setList(null);
      onFinished();
    } catch (e: any) {
      setError(errText(e, 'Could not save that list.'));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (list) await close(list);
  };

  const printAndSave = async () => {
    if (!list) return;
    await printInPlace(list);
    await close(list);
  };

  return (
    <div>
      {list && (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
          <button
            onClick={finish}
            disabled={busy || list.items.length === 0}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save without printing
          </button>
          {/* Printing is the end of building a list, so it saves too — nobody
              should have to remember a second button after sending it. */}
          <button
            onClick={printAndSave}
            disabled={busy || list.items.length === 0}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Print &amp; save
          </button>
        </div>
      )}

      {/* Add a product */}
      <div className="bg-gray-900/40 border border-[#2e303d] rounded-lg p-4 mb-6">
        {/* Every control is h-11 so the row lines up on one baseline. */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,auto,1fr,auto] gap-3 items-start">
          <ProductPicker selected={product} onSelect={setProduct} />

          <div className="flex h-11 rounded-lg overflow-hidden border border-gray-800">
            {(['packs', 'kg'] as PackUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-4 text-sm transition-colors ${
                  unit === u
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-900/60 text-gray-400 hover:text-white'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            placeholder={unit === 'packs' ? 'How many packs' : 'Target weight (kg)'}
            className="no-spinner w-full min-w-0 h-11 bg-gray-900/60 border border-gray-800 rounded-lg px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={add}
            disabled={busy || !product || !quantity}
            className="h-11 px-5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          {unit === 'packs'
            ? 'Enter a pack count — the total weight is calculated.'
            : 'Enter a target weight — the number of complete packs is calculated (partial packs are not counted).'}
        </p>

        {error && <div className="text-red-400 text-sm mt-3">{error}</div>}
      </div>

      {list ? (
        <PackingListTable
          items={list.items}
          totals={list.totals}
          mode="build"
          busy={busy}
          onChangeQuantity={changeQuantity}
          onRemove={remove}
        />
      ) : (
        <div className="border border-[#2e303d] rounded-lg p-8 text-center text-sm text-gray-500">
          Search for a product above to start a list.
        </div>
      )}

      {/* Mounted only while printing, parked offscreen. */}
      {printing && (
        <>
          <style>{PRINT_STYLES}</style>
          <PrintableSheet list={printing} offscreen />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

interface HistoryTabProps {
  /** Bumped when the History tab is clicked, to close whatever list is open. */
  closeSignal: number;
}

function HistoryTab({ closeSignal }: HistoryTabProps) {
  const [lists, setLists] = useState<ListDetail[]>([]);
  const [open, setOpen] = useState<ListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [printing, setPrinting] = useState<ListDetail | null>(null);

  const printInPlace = (target: ListDetail) => {
    setPrinting(target);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        setPrinting(null);
      }),
    );
  };

  const load = useCallback(async () => {
    try {
      setLists(await getHistory());
      setError('');
    } catch (e: any) {
      setError(errText(e, 'Could not load history.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Clicking History while a list is open returns to the list of lists, so no
  // separate back link is needed.
  useEffect(() => {
    if (closeSignal > 0) {
      setOpen(null);
      setNotice('');
      load();
    }
  }, [closeSignal, load]);

  const openList = async (summary: ListSummary) => {
    setBusy(true);
    setNotice('');
    try {
      setOpen(await getList(summary.id));
    } catch (e: any) {
      setError(errText(e, 'Could not open that list.'));
    } finally {
      setBusy(false);
    }
  };

  const saveActuals = async (
    item: ItemRecord,
    actualPacked: number | null,
    remarks: string,
  ) => {
    setBusy(true);
    setError('');
    try {
      const payload: { actual_packed?: number; remarks?: string } = { remarks };
      if (actualPacked !== null) payload.actual_packed = actualPacked;
      setOpen(await updateItem(item.id, payload));
      setNotice('Saved.');
    } catch (e: any) {
      setError(errText(e, 'Could not save that row.'));
    } finally {
      setBusy(false);
    }
  };

  const removeList = async (summary: ListSummary) => {
    const label = `${summary.totals.item_count} item(s) from ${new Date(
      summary.created_at,
    ).toLocaleDateString()}`;
    if (!window.confirm(`Delete this packing list (${label})? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteList(summary.id);
      setNotice('List deleted.');
      await load();
    } catch (e: any) {
      setError(errText(e, 'Could not delete that list.'));
    } finally {
      setBusy(false);
    }
  };

  const markDone = async () => {
    if (!open) return;
    setBusy(true);
    setError('');
    try {
      await updateList(open.id, { status: 'done' });
      // Closing a list is the end of working on it, so drop back to the
      // listing rather than leaving the finished list open.
      setOpen(null);
      await load();
      setNotice('List closed.');
    } catch (e: any) {
      setError(errText(e, 'Could not close that list.'));
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    // Rows whose actual_packed has not been saved yet. The row inputs hold
    // unsaved drafts, so this counts what is actually stored, matching what the
    // server will check.
    const unreconciled = open.items.filter((i) => i.actual_packed === null).length;

    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="text-sm text-gray-400">
            <span className="text-white font-medium font-mono mr-2">
              {open.reference ?? ''}
            </span>
            <span className={STATUS_STYLE[open.status]}>
              {open.status.replace('_', ' ')}
            </span>{' '}
            · {formatDateTime(open.created_at)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => printInPlace(open)}
              className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Print
            </button>
            <button
              onClick={markDone}
              disabled={busy || open.status === 'done' || unreconciled > 0}
              title={
                unreconciled > 0
                  ? `${unreconciled} row(s) still need an actual packed figure`
                  : undefined
              }
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Mark done
            </button>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
        {notice && <div className="text-green-400 text-sm mb-3">{notice}</div>}

        <p className="text-xs text-gray-500 mb-3">
          Key in what was actually packed from the printed sheet — each field
          saves when you leave it. Difference is calculated as packs minus actual.
        </p>

        {unreconciled > 0 && open.status !== 'done' && (
          <div className="text-xs text-amber-400 mb-3">
            {unreconciled} of {open.items.length} row(s) still need an actual packed
            figure before this list can be marked done. Enter 0 for anything that
            was not packed.
          </div>
        )}

        <PackingListTable
          items={open.items}
          totals={open.totals}
          mode="actuals"
          busy={busy}
          onSaveActuals={saveActuals}
        />

        {/* Mounted only while printing, parked offscreen. */}
        {printing && (
          <>
            <style>{PRINT_STYLES}</style>
            <PrintableSheet list={printing} offscreen />
          </>
        )}
      </div>
    );
  }

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>;

  if (lists.length === 0) {
    return (
      <div className="border border-[#2e303d] rounded-lg p-8 text-center text-sm text-gray-500">
        No packing lists yet.
      </div>
    );
  }

  return (
    <div>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
      {notice && <div className="text-green-400 text-sm mb-3">{notice}</div>}
      <p className="text-xs text-gray-500 mb-3">
        Open a list to record what was packed.
      </p>

      <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/60 text-gray-400">
              <th className="text-left font-medium px-4 py-3">List</th>
              <th className="text-left font-medium px-4 py-3">Date &amp; time</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Items</th>
              <th className="text-right font-medium px-4 py-3">Packs</th>
              <th className="text-right font-medium px-4 py-3">Weight</th>
              <th className="text-left font-medium px-4 py-3">By</th>
              <th className="text-right font-medium px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => {
              return (
                <React.Fragment key={l.id}>
                  <tr className="border-t-2 border-[#2e303d]">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium font-mono">
                        {l.reference ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {formatDateTime(l.created_at)}
                    </td>
                    <td className={`px-4 py-3 ${STATUS_STYLE[l.status]}`}>
                      {l.status.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {l.totals.item_count}
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      {l.totals.total_packs}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {l.totals.total_packed_kg.toFixed(2)} kg
                    </td>
                    <td className="px-4 py-3 text-gray-500">{l.created_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openList(l)}
                        disabled={busy}
                        className="text-xs text-blue-400 hover:text-blue-300 mr-4 disabled:opacity-30"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => removeList(l)}
                        disabled={busy}
                        className="text-xs text-gray-400 hover:text-red-400 disabled:opacity-30"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>

                  {/* Contents, inset and tinted so they read as belonging to
                      the list above rather than as more list rows. */}
                  <tr className="bg-[#0b0d13]">
                    <td colSpan={8} className="px-0 pb-3">
                        <div className="border-l-2 border-blue-500/40 ml-6 pl-4">
                          {l.items.length === 0 ? (
                            <div className="text-xs text-gray-600 py-2">
                              Nothing on this list.
                            </div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left font-medium py-1">Product</th>
                                  <th className="text-right font-medium py-1">Ordered</th>
                                  <th className="text-right font-medium py-1">Packs</th>
                                  <th className="text-right font-medium py-1">Weight</th>
                                  <th className="text-right font-medium py-1">Actual</th>
                                  <th className="text-left font-medium py-1 pl-4">Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {l.items.map((item) => (
                                  <tr key={item.id} className="text-gray-400">
                                    <td className="py-1 text-gray-200">
                                      {item.nickname || item.product_name}
                                    </td>
                                    <td className="py-1 text-right">
                                      {item.unit === 'packs'
                                        ? `${item.quantity} packs`
                                        : `${(item.quantity / 1000).toFixed(2)} kg`}
                                    </td>
                                    <td className="py-1 text-right text-gray-200">
                                      {item.total_packs ?? '—'}
                                    </td>
                                    <td className="py-1 text-right">
                                      {item.packed_kg?.toFixed(2) ?? '—'} kg
                                    </td>
                                    <td className="py-1 text-right">
                                      {item.actual_packed ?? '—'}
                                    </td>
                                    <td className="py-1 pl-4">{item.remarks || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const PackingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: PackingTab =
    tabParam === 'history' ? 'history' : tabParam === 'weights' ? 'weights' : 'build';
  const [list, setList] = useState<ListDetail | null>(null);
  const [historyCloseSignal, setHistoryCloseSignal] = useState(0);

  const selectTab = (tab: PackingTab) => {
    setSearchParams(tab === 'build' ? {} : { tab }, { replace: true });
    // Re-clicking History collapses an open list back to the listing.
    if (tab === 'history') setHistoryCloseSignal((n) => n + 1);
  };

  return (
    <div className="h-full min-w-0">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">
          Packing
        </h1>
        <p className="text-sm sm:text-base text-gray-400">
          {activeTab === 'build'
            ? 'Build a packing list, then print it for the floor.'
            : activeTab === 'history'
              ? 'Past lists — reopen one to record what was actually packed.'
              : 'Set the per-pack weight and nickname for any product.'}
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-[#2e303d]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'build' && (
        <BuildTab list={list} setList={setList} onFinished={() => selectTab('history')} />
      )}
      {activeTab === 'history' && <HistoryTab closeSignal={historyCloseSignal} />}
      {activeTab === 'weights' && <PackWeightsTab />}
    </div>
  );
};

export default PackingPage;
