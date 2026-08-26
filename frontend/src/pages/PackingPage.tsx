/**
 * Packing — replaces the packing Google Sheet.
 *
 * Build tab:   pick a category, start a list, add products one at a time by
 *              entering EITHER a pack count OR a target weight. The server
 *              derives the other figure and the running totals.
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
  getCategories,
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
}

function BuildTab({ list, setList }: BuildTabProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [unit, setUnit] = useState<PackUnit>('packs');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getCategories()
      .then((c) => {
        setCategories(c);
        setCategory((prev) => prev || c[0] || '');
      })
      .catch(() => setCategories([]));
  }, []);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setList(await createList(category || undefined));
    } catch (e: any) {
      setError(errText(e, 'Could not start a list.'));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!list || !product) return;
    const qty = Number(quantity);
    if (!(qty > 0)) {
      setError('Enter a quantity greater than zero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setList(await addItem(list.id, { product_id: product.id, unit, quantity: qty }));
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

  const finish = async () => {
    if (!list) return;
    setBusy(true);
    try {
      await updateList(list.id, { status: 'in_progress' });
      setList(null);
    } catch (e: any) {
      setError(errText(e, 'Could not save that list.'));
    } finally {
      setBusy(false);
    }
  };

  // --- No list open yet: choose a category and start one ---
  if (!list) {
    return (
      <div className="max-w-md">
        <label className="block text-sm text-gray-400 mb-2">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full min-w-0 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-4"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

        <button
          onClick={start}
          disabled={busy || !category}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Starting…' : 'Start packing list'}
        </button>
      </div>
    );
  }

  // --- A list is open: add products to it ---
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <span className="text-sm text-gray-400">Category</span>{' '}
          <span className="text-sm text-white font-medium">{list.category ?? '—'}</span>
        </div>
        <div className="flex gap-2">
          <a
            href={`/packing/${list.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Print
          </a>
          <button
            onClick={finish}
            disabled={busy || list.items.length === 0}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save &amp; close
          </button>
        </div>
      </div>

      {/* Add a product */}
      <div className="bg-gray-900/40 border border-[#2e303d] rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,auto,1fr,auto] gap-3 items-start">
          <ProductPicker selected={product} onSelect={setProduct} />

          <div className="flex rounded-lg overflow-hidden border border-gray-800">
            {(['packs', 'grams', 'kg'] as PackUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-3 py-2 text-sm transition-colors ${
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
            placeholder={unit === 'packs' ? 'How many packs' : `Target weight (${unit})`}
            className="w-full min-w-0 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={add}
            disabled={busy || !product || !quantity}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

      <PackingListTable
        items={list.items}
        totals={list.totals}
        mode="build"
        busy={busy}
        onChangeQuantity={changeQuantity}
        onRemove={remove}
      />
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
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openList(l)}
                    disabled={busy}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-30"
                  >
                    Open
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

      {activeTab === 'build' ? <BuildTab list={list} setList={setList} /> : <HistoryTab />}
    </div>
  );
};

export default PackingPage;
