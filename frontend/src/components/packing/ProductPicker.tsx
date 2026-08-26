/**
 * Product search for the packing builder.
 *
 * Staff search by the nickname they already use ("Dikiam 140g"); the catalogue
 * name and SKU are shown underneath so it is obvious which real product was
 * matched. Only products with a pack weight are returned by the API.
 */
import { useEffect, useRef, useState } from 'react';
import { searchProducts, type ProductOption } from '../../services/packingApi';

interface ProductPickerProps {
  selected: ProductOption | null;
  onSelect: (product: ProductOption | null) => void;
}

export function ProductPicker({ selected, onSelect }: ProductPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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

  const choose = (product: ProductOption) => {
    onSelect(product);
    setTerm('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      {selected ? (
        <div className="flex items-center justify-between gap-2 bg-gray-900/60 border border-blue-500/50 rounded-lg px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm text-white truncate">
              {selected.nickname || selected.name}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {selected.name} · {selected.pack_weight_g}g/pack
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-xs text-gray-500 hover:text-white shrink-0"
          >
            Change
          </button>
        </div>
      ) : (
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search product by nickname, name or SKU…"
          className="w-full min-w-0 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      )}

      {open && !selected && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-[#12141c] border border-[#2e303d] rounded-lg shadow-xl">
          {loading && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No products found.</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p)}
              className="w-full text-left px-3 py-2 hover:bg-blue-500/10 border-b border-[#2e303d] last:border-0"
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
