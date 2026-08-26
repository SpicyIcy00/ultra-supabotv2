/**
 * Standalone print route — a permalink for reprinting a list later.
 *
 * The Packing page prints in place rather than opening a tab; this exists so a
 * list can still be reached and reprinted from a bookmarked or shared URL.
 * Both render the same PrintableSheet.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PrintableSheet, PRINT_STYLES } from '../components/packing/PrintableSheet';
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
        ${PRINT_STYLES}
        .pk-page { background: #fff; min-height: 100vh; }
        .pk-bar { display: flex; gap: 8px; padding: 16px 16px 0; }
        .pk-bar button {
          font: 500 14px/1 Arial, Helvetica, sans-serif;
          color: #fff;
          background: #2563eb;
          border: none;
          border-radius: 6px;
          padding: 10px 18px;
          cursor: pointer;
        }
        @media print { .pk-bar { display: none !important; } }
      `}</style>

      <div className="pk-page">
        <div className="pk-bar">
          <button onClick={() => window.print()}>Print</button>
        </div>
        <PrintableSheet list={list} />
      </div>
    </>
  );
};

export default PackingPrintPage;
