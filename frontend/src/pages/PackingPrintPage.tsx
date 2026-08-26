/**
 * Printable packing sheet.
 *
 * Printing from inside a SPA means the sheet inherits whatever the app shell
 * puts on html/body/#root. Rather than trying to out-specify all of that, the
 * print rules hide every element, re-show only this component's subtree, and
 * pin it to the top-left of the page at full width. That makes the output
 * independent of the surrounding layout and of the paper size, so it fits A4,
 * Letter or anything else the printer is set to.
 *
 * Product, Ordered, Weight and Packs come from the data; Actual packed and
 * Remarks print as empty bordered cells to write into, with Packs beside them
 * for comparison.
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
        .pk-print *, .pk-print *::before, .pk-print *::after { box-sizing: border-box; }

        .pk-print {
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          min-height: 100vh;
          padding: 16px;
        }

        .pk-bar { margin-bottom: 16px; display: flex; gap: 8px; }
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

        .pk-print h1 { font-size: 17px; margin: 0 0 2px; color: #000; }
        .pk-print .meta { font-size: 11px; color: #555; margin-bottom: 10px; }

        .pk-print table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11px;
        }
        .pk-print th, .pk-print td {
          border: 1px solid #000;
          padding: 5px 6px;
          text-align: left;
          color: #000;
          /* A long catalogue name wraps; it never widens its column. */
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .pk-print th { background: #eee; font-weight: bold; }
        .pk-print .num { text-align: right; }
        .pk-print .sub { font-size: 9px; color: #666; }
        .pk-print td.blank { height: 32px; }
        .pk-print tfoot td { font-weight: bold; background: #f5f5f5; }

        @media print {
          /* Blank out the whole document, then re-show only this subtree. The
             ancestors stay in the box tree (so the sheet still lays out), but
             paint nothing. */
          body * { visibility: hidden !important; }
          .pk-print, .pk-print * { visibility: visible !important; }

          /* Detach from any app layout and pin to the page origin at full width. */
          .pk-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
            height: auto !important;
            background: #fff !important;
            overflow: visible !important;
          }

          .pk-bar { display: none !important; }

          /* Grey header fills are decorative but the cell borders are not —
             force both to survive "no background graphics". */
          .pk-print th, .pk-print td { border: 1px solid #000 !important; }
          .pk-print th, .pk-print tfoot td {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .pk-print tr { page-break-inside: avoid; }
          .pk-print thead { display: table-header-group; }

          /* No size declared — the sheet takes whatever paper is selected. */
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
                {/* Hand-written on the floor. The non-breaking space keeps the
                    cell from being treated as empty, which is what drops its
                    borders in some print engines. */}
                <td className="blank">&nbsp;</td>
                <td className="blank">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total ({list.totals.item_count} items)</td>
              <td>&nbsp;</td>
              <td className="num">{kg(list.totals.total_packed_kg)}</td>
              <td className="num">{list.totals.total_packs}</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
};

export default PackingPrintPage;
