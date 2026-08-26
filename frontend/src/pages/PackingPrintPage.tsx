/**
 * Printable packing sheet.
 *
 * Six columns, sized to fit A4 portrait. Product, Ordered, Packs and Weight are
 * filled from the data so the floor can see both what was asked for and what it
 * works out to; Actual packed and Remarks print as empty bordered cells to
 * hand-write into. Staff print this, pack, write on it, then key the actuals
 * back in from Packing → History.
 *
 * Light-on-white regardless of the app theme, and rendered outside <Layout> so
 * there is no chrome to suppress.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getList, type ItemRecord, type ListDetail } from '../services/packingApi';

const kg = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} kg`;

/** What staff actually typed, rather than the normalised storage unit. */
const ordered = (item: ItemRecord) =>
  item.unit === 'packs'
    ? `${Number(item.quantity)} packs`
    : `${(Number(item.quantity) / 1000).toFixed(2)} kg`;

const PackingPrintPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const [list, setList] = useState<ListDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!listId) return;
    getList(listId)
      .then(setList)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Could not load that list.'));
  }, [listId]);

  // Wait for the rows to be on the page, or the preview captures an empty sheet.
  useEffect(() => {
    if (list) {
      const handle = setTimeout(() => window.print(), 300);
      return () => clearTimeout(handle);
    }
  }, [list]);

  if (error) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>{error}</div>;
  if (!list) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Loading…</div>;

  return (
    <>
      <style>{`
        .sheet {
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          padding: 20px;
          margin: 0 auto;
          max-width: 780px;
        }
        .sheet h1 { font-size: 18px; margin: 0 0 2px; }
        .sheet .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
        .sheet table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
        .sheet th, .sheet td { border: 1px solid #000; padding: 5px 6px; text-align: left; }
        .sheet th { background: #eee; font-weight: bold; }
        .sheet .num { text-align: right; }
        .sheet .sub { font-size: 9px; color: #666; }
        /* Hand-written columns need room for a pen. */
        .sheet td.blank { height: 30px; }
        .sheet tfoot td { font-weight: bold; background: #f5f5f5; }
        .no-print { max-width: 780px; margin: 12px auto; padding: 0 20px; }

        @media print {
          .no-print { display: none !important; }
          .sheet { padding: 0; max-width: none; }
          .sheet tr { page-break-inside: avoid; }
          .sheet thead { display: table-header-group; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="no-print">
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            cursor: 'pointer',
            border: '1px solid #888',
            borderRadius: 6,
            background: '#f5f5f5',
          }}
        >
          Print again
        </button>
      </div>

      <div className="sheet">
        <h1>Packing List</h1>
        <div className="meta">
          {new Date(list.created_at).toLocaleString()}
          {list.created_by_name ? ` · ${list.created_by_name}` : ''}
        </div>

        <table>
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Ordered</th>
              <th className="num">Packs</th>
              <th className="num">Weight</th>
              <th className="num">Actual packed</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.nickname || item.product_name}
                  <div className="sub">{item.pack_weight_g_snapshot}g per pack</div>
                </td>
                <td className="num">{ordered(item)}</td>
                <td className="num">{item.total_packs ?? '—'}</td>
                <td className="num">{kg(item.packed_kg)}</td>
                {/* Filled in by hand on the floor. */}
                <td className="blank" />
                <td className="blank" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total ({list.totals.item_count} items)</td>
              <td />
              <td className="num">{list.totals.total_packs}</td>
              <td className="num">{kg(list.totals.total_packed_kg)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};

export default PackingPrintPage;
