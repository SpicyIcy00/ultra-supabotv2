/**
 * The rows of a packing list.
 *
 * In "build" mode staff edit quantities and remove rows. In "actuals" mode the
 * list has been printed and packed, so the editable fields are actual_packed
 * and remarks — saved on blur rather than behind a per-row button, since a long
 * list would otherwise be one click per product before it can be closed.
 *
 * Every figure shown here comes back from the server — total_packs and
 * packed_kg are derived there, never computed in the browser.
 */
import { useState } from 'react';
import type { ItemRecord, ListTotals } from '../../services/packingApi';

interface PackingListTableProps {
  items: ItemRecord[];
  totals: ListTotals;
  mode: 'build' | 'actuals';
  busy?: boolean;
  onChangeQuantity?: (item: ItemRecord, quantity: number) => void;
  onRemove?: (item: ItemRecord) => void;
  onSaveActuals?: (item: ItemRecord, actualPacked: number | null, remarks: string) => void;
}

const num = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      });

export function PackingListTable({
  items,
  totals,
  mode,
  busy,
  onChangeQuantity,
  onRemove,
  onSaveActuals,
}: PackingListTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState('');

  if (items.length === 0) {
    return (
      <div className="border border-[#2e303d] rounded-lg p-8 text-center text-sm text-gray-500">
        No products on this list yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900/60 text-gray-400">
            <th className="text-left font-medium px-4 py-3">Product</th>
            <th className="text-right font-medium px-4 py-3">Per pack</th>
            <th className="text-right font-medium px-4 py-3">Entered</th>
            <th className="text-right font-medium px-4 py-3">Packs</th>
            <th className="text-right font-medium px-4 py-3">Weight</th>
            {mode === 'actuals' && (
              <>
                <th className="text-right font-medium px-4 py-3">Actual</th>
                <th className="text-right font-medium px-4 py-3">Diff</th>
                <th className="text-left font-medium px-4 py-3">Remarks</th>
              </>
            )}
            {mode === 'build' && (
              <th className="text-right font-medium px-4 py-3">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              mode={mode}
              busy={busy}
              editing={editingId === item.id}
              draftQty={draftQty}
              setDraftQty={setDraftQty}
              onStartEdit={() => {
                setEditingId(item.id);
                setDraftQty(String(item.quantity));
              }}
              onCancelEdit={() => setEditingId(null)}
              onCommitQty={() => {
                const next = Number(draftQty);
                if (next > 0) onChangeQuantity?.(item, next);
                setEditingId(null);
              }}
              onRemove={() => onRemove?.(item)}
              onSaveActuals={onSaveActuals}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-900/60 border-t border-[#2e303d] font-semibold text-white">
            <td className="px-4 py-3">
              Totals{' '}
              <span className="text-gray-500 font-normal">({totals.item_count} items)</span>
            </td>
            <td />
            <td />
            <td className="text-right px-4 py-3">{num(totals.total_packs)}</td>
            <td className="text-right px-4 py-3">{num(totals.total_packed_kg, 2)} kg</td>
            {mode === 'actuals' && (
              <>
                <td />
                <td />
                <td />
              </>
            )}
            {mode === 'build' && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface RowProps {
  item: ItemRecord;
  mode: 'build' | 'actuals';
  busy?: boolean;
  editing: boolean;
  draftQty: string;
  setDraftQty: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitQty: () => void;
  onRemove: () => void;
  onSaveActuals?: (item: ItemRecord, actualPacked: number | null, remarks: string) => void;
}

function Row({
  item,
  mode,
  busy,
  editing,
  draftQty,
  setDraftQty,
  onStartEdit,
  onCancelEdit,
  onCommitQty,
  onRemove,
  onSaveActuals,
}: RowProps) {
  const [actual, setActual] = useState(
    item.actual_packed === null ? '' : String(item.actual_packed),
  );
  const [remarks, setRemarks] = useState(item.remarks ?? '');

  const diff = item.discrepancy ?? 0;

  /**
   * Persist on blur, and only when something actually changed — tabbing across
   * a row that was already saved should not fire a write per field.
   */
  const commit = () => {
    const nextActual = actual === '' ? null : Number(actual);
    const unchanged =
      nextActual === item.actual_packed && remarks === (item.remarks ?? '');
    if (unchanged) return;
    if (nextActual !== null && Number.isNaN(nextActual)) return;
    onSaveActuals?.(item, nextActual, remarks);
  };

  return (
    <tr className="border-t border-[#2e303d]">
      <td className="px-4 py-3">
        <div className="text-gray-100">{item.nickname || item.product_name}</div>
        <div className="text-xs text-gray-500">{item.product_name}</div>
      </td>
      <td className="text-right px-4 py-3 text-gray-400">
        {num(item.pack_weight_g_snapshot)} g
      </td>
      <td className="text-right px-4 py-3 text-gray-400">
        {/* Show what staff typed. 'grams' is the storage unit; the UI only ever
            offers packs and kg, so render weights back in kg. */}
        {editing ? (
          <input
            type="number"
            value={draftQty}
            autoFocus
            onChange={(e) => setDraftQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitQty();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="no-spinner w-24 bg-gray-900/60 border border-gray-800 rounded px-2 py-1 text-right text-white focus:outline-none focus:border-blue-500"
          />
        ) : item.unit === 'packs' ? (
          <>
            {num(item.quantity)} <span className="text-gray-600">packs</span>
          </>
        ) : (
          <>
            {num(item.quantity / 1000, 2)} <span className="text-gray-600">kg</span>
          </>
        )}
      </td>
      <td className="text-right px-4 py-3 text-white font-medium">
        {num(item.total_packs)}
      </td>
      {/* packed_kg, not total_kg: what the complete packs actually weigh, so
          packs and weight never contradict each other. */}
      <td className="text-right px-4 py-3 text-gray-300">{num(item.packed_kg, 2)} kg</td>

      {mode === 'actuals' && (
        <>
          <td className="text-right px-4 py-3">
            {/* Deliberately not disabled while saving: blurring this field is
                what triggers the save, and disabling the row mid-flight would
                put focus on a dead Remarks box. */}
            <input
              type="number"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              placeholder="—"
              className="no-spinner w-24 bg-gray-900/60 border border-gray-800 rounded px-2 py-1 text-right text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </td>
          <td
            className={`text-right px-4 py-3 font-medium ${
              diff > 0 ? 'text-amber-400' : diff < 0 ? 'text-blue-400' : 'text-gray-500'
            }`}
          >
            {num(item.discrepancy)}
          </td>
          <td className="px-4 py-3">
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              placeholder="—"
              className="w-40 bg-gray-900/60 border border-gray-800 rounded px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </td>
        </>
      )}

      {mode === 'build' && (
        <td className="text-right px-4 py-3 whitespace-nowrap">
          {editing ? (
            <>
              <button
                onClick={onCommitQty}
                className="text-xs text-blue-400 hover:text-blue-300 mr-3"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="text-xs text-gray-500 hover:text-white"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onStartEdit}
                disabled={busy}
                className="text-xs text-blue-400 hover:text-blue-300 mr-3 disabled:opacity-30"
              >
                Edit
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                className="text-xs text-gray-400 hover:text-red-400 disabled:opacity-30"
              >
                Remove
              </button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}
