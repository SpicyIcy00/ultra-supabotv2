/**
 * The printable packing sheet.
 *
 * Used two ways:
 *  - offscreen inside the Packing page, so Print goes straight to the OS
 *    dialog without opening a tab
 *  - visibly on /packing/:id/print, as a permalink for reprinting later
 *
 * Printing from inside a SPA means inheriting whatever the app shell puts on
 * html/body/#root. Rather than out-specifying all of that, the print rules
 * blank the document, re-show only this subtree, and pin it to the page origin
 * at full width — so the output is independent of the surrounding layout and of
 * the paper size, fitting A4, Letter or anything else.
 */
import { formatDateTime } from '../../services/packingApi';
import type { ItemRecord, ListDetail } from '../../services/packingApi';

const kg = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} kg`;

/** What staff actually typed, rather than the normalised storage unit. */
const ordered = (item: ItemRecord) =>
  item.unit === 'packs'
    ? `${Number(item.quantity)} packs`
    : `${(Number(item.quantity) / 1000).toFixed(2)} kg`;

export const PRINT_STYLES = `
  .pk-print *, .pk-print *::before, .pk-print *::after { box-sizing: border-box; }

  .pk-print {
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    padding: 16px;
  }

  /* Parked out of view on screen. Not display:none — hidden boxes do not
     print, and this element is the thing being printed. */
  .pk-print.offscreen {
    position: absolute;
    left: -10000px;
    top: 0;
    width: 800px;
  }

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
    /* Blank the whole document, then re-show only this subtree. Ancestors stay
       in the box tree so the sheet still lays out, but paint nothing. */
    body * { visibility: hidden !important; }
    .pk-print, .pk-print * { visibility: visible !important; }

    /* Detach from any app layout and pin to the page origin at full width. */
    .pk-print, .pk-print.offscreen {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: none !important;
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

    /* Cell rules are structural, not decoration — force them to survive
       "no background graphics", which drops the header fills. */
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
`;

interface PrintableSheetProps {
  list: ListDetail;
  /** Park it out of view — for printing from inside the app. */
  offscreen?: boolean;
}

export function PrintableSheet({ list, offscreen }: PrintableSheetProps) {
  return (
    <div className={`pk-print${offscreen ? ' offscreen' : ''}`} aria-hidden={offscreen}>
      <h1>Packing List {list.reference ?? ''}</h1>
      <div className="meta">
        {formatDateTime(list.created_at)}
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
      </table>
    </div>
  );
}
