/**
 * Printable packing sheet.
 *
 * Deliberately light-on-white regardless of the app theme — this exists to come
 * out of a printer. Product, Job order/PO and Raw qty are filled from the data;
 * Actual packed, Discrepancy and Remarks print as empty bordered cells with
 * enough height to hand-write into. Staff print this, pack, write the actuals
 * on paper, then key them back in from Packing → History.
 *
 * Rendered outside <Layout> so there is no sidebar or header to suppress.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getList, type ListDetail } from '../services/packingApi';

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

  // Fire the print dialog once the rows are actually on the page, otherwise the
  // preview captures an empty sheet.
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
        .print-sheet {
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          padding: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }
        .print-sheet h1 { font-size: 20px; margin: 0 0 4px; }
        .print-sheet .meta { font-size: 12px; color: #444; margin-bottom: 16px; }
        .print-sheet .po-line {
          font-size: 13px;
          margin-bottom: 16px;
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .print-sheet .po-rule {
          flex: 1;
          border-bottom: 1px solid #000;
          height: 18px;
          max-width: 320px;
        }
        .print-sheet table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .print-sheet th, .print-sheet td {
          border: 1px solid #000;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
        }
        .print-sheet th { background: #eee; font-weight: bold; }
        .print-sheet td.num, .print-sheet th.num { text-align: right; }
        /* Hand-written columns need room for a pen. */
        .print-sheet td.blank { height: 34px; }
        .print-sheet tfoot td { font-weight: bold; background: #f5f5f5; }
        .print-sheet .hint { font-size: 11px; color: #666; margin-top: 12px; }
        .no-print { margin: 16px auto; max-width: 1000px; padding: 0 24px; }

        @media print {
          .no-print { display: none !important; }
          .print-sheet { padding: 0; max-width: none; }
          /* Keep a row from being split across a page break mid-write. */
          .print-sheet tr { page-break-inside: avoid; }
          .print-sheet thead { display: table-header-group; }
          @page { margin: 12mm; }
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

      <div className="print-sheet">
        <h1>Packing List</h1>
        <div className="meta">
          Category: {list.category ?? '—'} &nbsp;·&nbsp; Created:{' '}
          {new Date(list.created_at).toLocaleString()}
          {list.created_by_name ? ` · By: ${list.created_by_name}` : ''}
        </div>

        {/* Blank line for the floor to write the job order against. */}
        <div className="po-line">
          <strong>Job Order / PO:</strong>
          <span className="po-rule" />
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Job order/PO</th>
              <th className="num">Raw qty</th>
              <th className="num">Actual packed</th>
              <th className="num">Discrepancy</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.nickname || item.product_name}
                  <div style={{ fontSize: 10, color: '#666' }}>{item.product_name}</div>
                </td>
                <td>{list.category ?? ''}</td>
                <td className="num">{item.total_packs ?? '—'}</td>
                {/* Left empty on purpose — these are filled in by hand. */}
                <td className="blank" />
                <td className="blank" />
                <td className="blank" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total ({list.totals.item_count} items)</td>
              <td className="num">{list.totals.total_packs}</td>
              <td colSpan={3}>
                Total weight: {list.totals.total_kg.toFixed(2)} kg (
                {list.totals.total_grams.toLocaleString()} g)
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="hint">
          Write the actual packed quantity and any remarks above, then key them
          back in under Packing → History.
        </div>
      </div>
    </>
  );
};

export default PackingPrintPage;
