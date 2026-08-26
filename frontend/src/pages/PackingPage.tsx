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
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
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

type PackingTab = 'build' | 'history';

const TABS: { key: PackingTab; label: string }[] = [
  { key: 'build', label: 'Build List' },
  { key: 'history', label: 'History' },
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
    // window.open has to happen synchronously inside the click or the popup
    // blocker eats it, so the tab is opened before the save is awaited.
    window.open(`/packing/${list.id}/print`, '_blank', 'noopener');
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
            className="w-full min-w-0 h-11 bg-gray-900/60 border border-gray-800 rounded-lg px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab() {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [open, setOpen] = useState<ListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    try {
      setOpen(await updateList(open.id, { status: 'done' }));
      await load();
      setNotice('List closed.');
    } catch (e: any) {
      setError(errText(e, 'Could not close that list.'));
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <button
              onClick={() => {
                setOpen(null);
                load();
              }}
              className="text-sm text-gray-400 hover:text-white"
            >
              ← Back to history
            </button>
            <div className="mt-1 text-sm text-gray-400">
              {open.category ?? '—'} ·{' '}
              <span className={STATUS_STYLE[open.status]}>{open.status}</span> ·{' '}
              {new Date(open.created_at).toLocaleString()}
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/packing/${open.id}/print`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Print
            </a>
            <button
              onClick={markDone}
              disabled={busy || open.status === 'done'}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Mark done
            </button>
          </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
        {notice && <div className="text-green-400 text-sm mb-3">{notice}</div>}

        <p className="text-xs text-gray-500 mb-3">
          Key in what was actually packed from the printed sheet. Difference is
          calculated as packs minus actual.
        </p>

        <PackingListTable
          items={open.items}
          totals={open.totals}
          mode="actuals"
          busy={busy}
          onSaveActuals={saveActuals}
        />
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
      <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/60 text-gray-400">
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Category</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Items</th>
              <th className="text-right font-medium px-4 py-3">Packs</th>
              <th className="text-right font-medium px-4 py-3">Weight</th>
              <th className="text-left font-medium px-4 py-3">By</th>
              <th className="text-right font-medium px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id} className="border-t border-[#2e303d]">
                <td className="px-4 py-3 text-gray-300">
                  {new Date(l.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-gray-300">{l.category ?? '—'}</td>
                <td className={`px-4 py-3 ${STATUS_STYLE[l.status]}`}>{l.status}</td>
                <td className="px-4 py-3 text-right text-gray-400">{l.totals.item_count}</td>
                <td className="px-4 py-3 text-right text-white">{l.totals.total_packs}</td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {l.totals.total_kg.toFixed(2)} kg
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const PackingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: PackingTab = searchParams.get('tab') === 'history' ? 'history' : 'build';
  const [list, setList] = useState<ListDetail | null>(null);

  const selectTab = (tab: PackingTab) => {
    setSearchParams(tab === 'build' ? {} : { tab }, { replace: true });
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
            : 'Past lists — reopen one to record what was actually packed.'}
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

      {activeTab === 'build' ? (
        <BuildTab list={list} setList={setList} onFinished={() => selectTab('history')} />
      ) : (
        <HistoryTab />
      )}
    </div>
  );
};

export default PackingPage;
