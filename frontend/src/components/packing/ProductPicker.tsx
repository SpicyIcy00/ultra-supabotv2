/**
 * Product search for the packing builder.
 *
 * Behaves like a dropdown: click it to open the list, click a row to pick.
 * Clicking the current selection reopens the list, so changing your mind is one
 * click rather than a separate "Change" control.
 *
 * Staff search by the nickname they already use ("Dikiam 140g"); the catalogue
 * name and pack weight sit alongside so it is obvious which real product was
 * matched. Only products with a pack weight are returned by the API.
 */
import { useEffect, useRef, useState } from 'react';
import { searchProducts, type ProductOption } from '../../services/packingApi';

interface ProductPickerProps {
  selected: ProductOption | null;
  onSelect: (product: ProductOption | null) => void;
}

// Shared with the other controls in the add row so they line up exactly.
const CONTROL_HEIGHT = 'h-11';

export function ProductPicker({ selected, onSelect }: ProductPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced so typing a nickname does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchProducts(term || undefined));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [term, open]);

  // Close when clicking away, otherwise the dropdown covers the form.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const openList = () => {
    setTerm('');
    setOpen(true);
    // Focus after the input has rendered, so typing starts immediately.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const choose = (product: ProductOption) => {
    onSelect(product);
    setTerm('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      {open ? (
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            // Enter with exactly one match is the common case after typing a
            // nickname, so take it rather than making them reach for the mouse.
            if (e.key === 'Enter' && results.length === 1) choose(results[0]);
          }}
          placeholder="Search by nickname, name or SKU…"
          className={`w-full min-w-0 ${CONTROL_HEIGHT} bg-gray-900/60 border border-blue-500 rounded-lg px-3 text-sm text-white placeholder-gray-500 focus:outline-none`}
        />
      ) : (
        <button
          type="button"
          onClick={openList}
          className={`w-full min-w-0 ${CONTROL_HEIGHT} flex items-center justify-between gap-2 bg-gray-900/60 border rounded-lg px-3 text-left transition-colors ${
            selected
              ? 'border-blue-500/50 hover:border-blue-500'
              : 'border-gray-800 hover:border-gray-700'
          }`}
        >
          {selected ? (
            <span className="min-w-0 truncate text-sm text-white">
              {selected.nickname || selected.name}
              <span className="text-gray-500">
                {' '}
                · {selected.pack_weight_g}g/pack
              </span>
            </span>
          ) : (
            <span className="text-sm text-gray-500">Search by nickname, name or SKU…</span>
          )}
          <svg
            className="w-4 h-4 text-gray-500 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-[#12141c] border border-[#2e303d] rounded-lg shadow-xl">
          {loading && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No products found.</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className={`w-full text-left px-3 py-2 border-b border-[#2e303d] last:border-0 hover:bg-blue-500/10 ${
                selected?.id === p.id ? 'bg-blue-500/10' : ''
              }`}
            >
              <div className="text-sm text-white">{p.nickname || p.name}</div>
              <div className="text-xs text-gray-500">
                {p.name}
                {p.sku ? ` · ${p.sku}` : ''} · {p.pack_weight_g}g/pack
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
