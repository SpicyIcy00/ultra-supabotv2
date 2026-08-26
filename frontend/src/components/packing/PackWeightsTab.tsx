/**
 * Pack Weights — set a product's per-pack weight and the nickname staff know
 * it by.
 *
 * The packing picker only offers products that have a weight, so without this
 * a product missing one is invisible with no way to fix it. Search covers the
 * whole catalogue, not just packable items.
 *
 * Both fields save on blur, matching how actuals are keyed in elsewhere.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  searchCatalog,
  updateProductPacking,
  type CatalogProduct,
} from '../../services/packingApi';

const errText = (e: any, fallback: string) => e?.response?.data?.detail ?? fallback;

export function PackWeightsTab() {
  const [term, setTerm] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await searchCatalog(term || undefined, missingOnly));
      setError('');
    } catch (e: any) {
      setError(errText(e, 'Could not load products.'));
    } finally {
      setLoading(false);
    }
  }, [term, missingOnly]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [load]);

  const save = async (
    product: CatalogProduct,
    payload: { pack_weight_g?: number | null; nickname?: string | null },
  ) => {
    setSavingId(product.id);
    setError('');
    try {
      const updated = await updateProductPacking(product.id, payload);
      // Patch in place rather than reloading, so the row does not jump out from
      // under the cursor when "missing only" is on.
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e: any) {
      setError(errText(e, 'Could not save that product.'));
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const missingCount = products.filter(
    (p) => p.pack_weight_g === null || p.pack_weight_g <= 0,
  ).length;

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search all products by name, nickname or SKU…"
          className="flex-1 min-w-[240px] h-11 bg-gray-900/60 border border-gray-800 rounded-lg px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
          Missing a weight only
        </label>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        A product needs a pack weight before it can be added to a packing list.
        Nickname is what staff search by. Both fields save when you leave them.
        {missingCount > 0 && !loading && (
          <span className="text-amber-400"> {missingCount} shown still have no weight.</span>
        )}
      </p>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : products.length === 0 ? (
        <div className="border border-[#2e303d] rounded-lg p-8 text-center text-sm text-gray-500">
          No products match that search.
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2e303d] rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400">
                <th className="text-left font-medium px-4 py-3">Product</th>
                <th className="text-left font-medium px-4 py-3">SKU</th>
                <th className="text-left font-medium px-4 py-3">Nickname</th>
                <th className="text-right font-medium px-4 py-3">Pack weight (g)</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  saving={savingId === p.id}
                  onSave={save}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ProductRowProps {
  product: CatalogProduct;
  saving: boolean;
  onSave: (
    product: CatalogProduct,
    payload: { pack_weight_g?: number | null; nickname?: string | null },
  ) => void;
}

function ProductRow({ product, saving, onSave }: ProductRowProps) {
  const [nickname, setNickname] = useState(product.nickname ?? '');
  const [weight, setWeight] = useState(
    product.pack_weight_g === null ? '' : String(product.pack_weight_g),
  );

  const commitNickname = () => {
    const next = nickname.trim();
    if (next === (product.nickname ?? '')) return;
    onSave(product, { nickname: next || null });
  };

  const commitWeight = () => {
    const raw = weight.trim();
    const next = raw === '' ? null : Number(raw);
    if (next !== null && (Number.isNaN(next) || next <= 0)) return;
    if (next === product.pack_weight_g) return;
    onSave(product, { pack_weight_g: next });
  };

  const missing = product.pack_weight_g === null || product.pack_weight_g <= 0;

  return (
    <tr className="border-t border-[#2e303d]">
      <td className="px-4 py-3">
        <div className="text-gray-100">{product.name}</div>
        {product.category && (
          <div className="text-xs text-gray-500">{product.category}</div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-500">{product.sku ?? '—'}</td>
      <td className="px-4 py-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={commitNickname}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className="w-48 bg-gray-900/60 border border-gray-800 rounded px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={commitWeight}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className={`no-spinner w-28 bg-gray-900/60 border rounded px-2 py-1 text-right text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 ${
            missing ? 'border-amber-500/50' : 'border-gray-800'
          }`}
        />
        {saving && <div className="text-xs text-gray-500 mt-1">Saving…</div>}
      </td>
    </tr>
  );
}
