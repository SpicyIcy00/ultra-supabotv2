/**
 * Printable packing sheet.
 *
 * Column widths are percentages on a fixed-layout table and the page size is
 * left to the printer, so the sheet fits A4, Letter or anything else the user
 * picks rather than being forced to one format.
 *
 * Product, Ordered, Weight and Packs are filled from the data; Actual packed
 * and Remarks print as empty bordered cells to write into. Packs sits directly
 * beside Actual packed so the two numbers can be compared at a glance.
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
        /* This page is served inside the app shell, whose stylesheet sets a
           light text colour for the dark theme. Everything here is re-declared
           so nothing inherits an unreadable colour. */
        .pk-print *, .pk-print *::before, .pk-print *::after { box-sizing: border-box; }

        .pk-print { background: #fff; min-height: 100vh; padding: 16px 0; }

        .pk-bar {
          width: 100%;
          max-width: 900px;
          margin: 0 auto 16px;
          padding: 0 16px;
          display: flex;
          gap: 8px;
        }
        .pk-bar button {
          font: 500 14px/1 Arial, Helvetica, sans-serif;
          color: #fff;
          background: #2563eb;
          border: none;
          border-radius: 6px;
          padding: 10px 18px;
          cursor: pointer;
        }
        .pk-bar button.secondary { background: #e5e7eb; color: #111; }

        .sheet {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          padding: 0 16px;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .sheet h1 { font-size: 18px; margin: 0 0 2px; color: #000; }
        .sheet .meta { font-size: 11px; color: #555; margin-bottom: 12px; }

        .sheet table {
          width: 100%;
          max-width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          table-layout: fixed;
        }
        .sheet th, .sheet td {
          border: 1px solid #000;
          padding: 5px 6px;
          text-align: left;
          color: #000;
          /* A long catalogue name must wrap, never widen the column. */
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .sheet th { background: #eee; font-weight: bold; }
        .sheet .num { text-align: right; }
        .sheet .sub { font-size: 9px; color: #666; }
        .sheet td.blank { height: 30px; }
        .sheet tfoot td { font-weight: bold; background: #f5f5f5; }

        @media print {
          .pk-bar { display: none !important; }
          .pk-print { padding: 0; min-height: 0; }
          .sheet { max-width: none; padding: 0; }
          .sheet tr { page-break-inside: avoid; }
          .sheet thead { display: table-header-group; }
          /* No size declared: the sheet adapts to whatever paper is selected
             instead of being forced to one format. */
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="pk-print">
        <div className="pk-bar">
          <button onClick={() => window.print()}>Print</button>
          <button className="secondary" onClick={() => window.close()}>
            Close
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
              <col style={{ width: '28%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '19%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Ordered</th>
                <th className="num">Weight</th>
                <th className="num">Packs</th>
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
                  <td className="num">{kg(item.packed_kg)}</td>
                  <td className="num">{item.total_packs ?? '—'}</td>
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
                <td className="num">{kg(list.totals.total_packed_kg)}</td>
                <td className="num">{list.totals.total_packs}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
};

export default PackingPrintPage;
