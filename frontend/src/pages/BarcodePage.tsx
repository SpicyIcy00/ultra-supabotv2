/**
 * Barcode Manager Page
 *
 * 1. Browse products — filter by Name, SKU, and/or Category
 * 2. Checkbox-select products
 * 3. Generate EAN-13 barcodes (check digit calculated server-side,
 *    duplicate-safe — skips any product that already has a barcode in the DB)
 * 4. Export to StoreHub Products Import Template CSV
 * 5. View / delete saved barcode assignments
 *
 * StoreHub note: Their public API is read-only for products.
 * Upload the exported CSV via StoreHub Back Office → Products → Import.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  generateBarcodes,
  listBarcodes,
  deleteBarcode,
} from '../services/barcodeApi';
import type { BarcodeEntry, BarcodeRecord } from '../services/barcodeApi';

// ── Product type (from /api/v1/products/) ─────────────────────────────────────
interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  price_type: string | null;
  unit_price: number | null;
  cost: number | null;
  track_stock_level: boolean;
}

type Tab = 'generate' | 'database';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Visual grouping for EAN-13: 1 · 6 · 6 */
function fmtBarcode(b: string): string {
  if (b.length !== 13) return b;
  return `${b[0]} ${b.slice(1, 7)} ${b.slice(7)}`;
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return `"${s.replace(/"/g, '""')}"`;
  return `"${s}"`;
}

// ── StoreHub CSV export ───────────────────────────────────────────────────────
// Matches the exact header row from the StoreHub Products Import Template.
// Core columns are filled; store-specific inventory columns are left empty.
const STOREHUB_HEADERS = [
  'SKU', 'Parent Product SKU', 'Product Name', 'Category',
  'Price Type', 'Unit', 'Tax-Inclusive Price', 'Min Price', 'Max Price',
  'Cost', 'Supplier Price', 'Product Tags', 'Inventory Type',
  'Track Stock Levels', 'Barcode', 'SC/PWD Discount', 'Solo Parent Discount',
  'Variant Name 1', 'Variant Value 1', 'Variant Name 2', 'Variant Value 2',
  'Variant Name 3', 'Variant Value 3', 'Supplier', 'Tax Name',
  'Store Credits', 'Kitchen Station', 'Online Price', 'Online Discounted Price',
  'Product Description',
];

// Row 2 in the template is an instruction/hint row. We include it so the file
// is importable straight into StoreHub without modification.
const STOREHUB_INSTRUCTION_ROW = [
  '#Required (Must be unique)', '', 'Required', 'Optional',
  'Required (Fixed/Variable/Unit)',
  'Required if the price type is Unit. Leave this field empty if the price Type is either Fixed or Variable.',
  'Optional; 0 by default', 'Optional', 'Optional', 'Optional', 'Optional',
  'Optional; use semicolon ( ; ) to separate multiple tags',
  'Optional(Simple/Composite/Serialized; Simple by default if tracking inventory)',
  'Required; Enter 0 to disable; 1 to enable',
  'Optional; Must be unique if specified; use semicolon ( ; ) to separate multiple barcodes',
  'Required; Enter 0 to disable; 1 to enable',
  'Required; Enter 0 to disable; 1 to enable',
  '', '', '', '', '', '', '', '', '', '',
  'Optional; The value should be Tax-Inclusive as per your Display Price setting in the BackOffice.',
  'Optional; The value should be Tax-Inclusive as per your Display Price setting in the BackOffice.',
  'Optional',
];

interface ExportRow {
  product: Product;
  barcode: string;
}

function buildStoreHubCSV(rows: ExportRow[]): string {
  const lines: string[] = [];

  // Row 1 – headers
  lines.push(STOREHUB_HEADERS.map(h => csvEscape(h)).join(','));

  // Row 2 – instructions (pad/trim to match header count)
  const instrPadded = [...STOREHUB_INSTRUCTION_ROW];
  while (instrPadded.length < STOREHUB_HEADERS.length) instrPadded.push('');
  lines.push(instrPadded.slice(0, STOREHUB_HEADERS.length).map(v => csvEscape(v)).join(','));

  // Data rows
  for (const { product: p, barcode } of rows) {
    const priceType = p.price_type ?? 'Fixed';
    const cells: (string | number | null)[] = [
      p.sku ?? '',                        // SKU
      '',                                 // Parent Product SKU
      p.name,                             // Product Name
      p.category ?? '',                   // Category
      priceType,                          // Price Type
      '',                                 // Unit (leave blank for Fixed/Variable)
      p.unit_price ?? '',                 // Tax-Inclusive Price
      '',                                 // Min Price
      '',                                 // Max Price
      p.cost ?? '',                       // Cost
      '',                                 // Supplier Price
      '',                                 // Product Tags
      'Simple',                           // Inventory Type
      p.track_stock_level ? '1' : '0',    // Track Stock Levels
      barcode,                            // Barcode  ← generated EAN-13
      '0',                                // SC/PWD Discount
      '0',                                // Solo Parent Discount
      '', '', '', '', '', '',             // Variant Name/Value 1-3
      '',                                 // Supplier
      '',                                 // Tax Name
      '',                                 // Store Credits
      '',                                 // Kitchen Station
      '',                                 // Online Price
      '',                                 // Online Discounted Price
      '',                                 // Product Description
    ];
    lines.push(cells.map(v => csvEscape(v)).join(','));
  }

  return lines.join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface BarcodeRow {
  key: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  barcode: string;
  generated_at: string | null;  // null = came from products.barcode field
  dbId: number | null;          // null = not in product_barcodes table
}

// ── Component ─────────────────────────────────────────────────────────────────

const BarcodePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('generate');

  // ── Products ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  // ── Search filters (Generate tab) ─────────────────────────────────────────
  const [filterName, setFilterName] = useState('');
  const [filterSku, setFilterSku] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Generation ────────────────────────────────────────────────────────────
  const [prefix, setPrefix] = useState('200');
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{
    generated: BarcodeEntry[];
    skipped: string[];
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Database tab ──────────────────────────────────────────────────────────
  const [records, setRecords] = useState<BarcodeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => { loadProducts(); loadCategories(); loadRecords(); }, []);
  useEffect(() => { if (activeTab === 'database') loadRecords(); }, [activeTab]);

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await axios.get<Product[]>('/api/v1/barcodes/products', { params: { limit: 1000 } });
      if (Array.isArray(res.data)) {
        setProducts(res.data);
      } else {
        console.error('Products API returned unexpected data:', res.data);
        setProductsError(`API returned unexpected data (type: ${typeof res.data}). Check the backend.`);
        setProducts([]);
      }
    } catch (e: any) {
      setProductsError(e?.response?.data?.detail || e.message || 'Failed to load products');
    } finally {
      setProductsLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await axios.get<string[]>('/api/v1/barcodes/categories');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch { /* non-critical */ }
  }

  async function loadRecords() {
    setRecordsLoading(true);
    try {
      const data = await listBarcodes();
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setRecordsLoading(false); }
  }

  // ── Filtered products ─────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const name = filterName.toLowerCase();
    const sku  = filterSku.toLowerCase();
    return products.filter((p) => {
      if (filterCategory && p.category !== filterCategory) return false;
      if (name && !p.name.toLowerCase().includes(name)) return false;
      if (sku && !(p.sku ?? '').toLowerCase().includes(sku)) return false;
      return true;
    });
  }, [products, filterName, filterSku, filterCategory]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selected.has(p.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredProducts.forEach((p) => next.delete(p.id));
      else filteredProducts.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setFilterName('');
    setFilterSku('');
    setFilterCategory('');
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (selected.size === 0) return;
    if (!/^\d{3}$/.test(prefix)) {
      setGenerateError('Prefix must be exactly 3 numeric digits (e.g. 200)');
      return;
    }
    setGenerating(true);
    setGenerateResult(null);
    setGenerateError(null);
    try {
      const result = await generateBarcodes([...selected], prefix);
      setGenerateResult(result);
      setSelected(new Set());
    } catch (e: any) {
      setGenerateError(e?.response?.data?.detail || e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ── Export helpers ────────────────────────────────────────────────────────

  function buildExportRows(result: { generated: BarcodeEntry[]; skipped: string[] }): ExportRow[] {
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
    const rows: ExportRow[] = [];
    result.generated.forEach((b) => {
      const p = productMap[b.product_id];
      if (p) rows.push({ product: p, barcode: b.barcode });
    });
    // Include skipped — look up their barcodes from productBarcodeMap
    result.skipped.forEach((pid) => {
      const p = productMap[pid];
      const bc = productBarcodeMap.get(pid);
      if (p && bc) rows.push({ product: p, barcode: bc });
    });
    return rows;
  }

  /** Export newly-generated (+ skipped) barcodes to StoreHub import template */
  function exportGeneratedToTemplate() {
    if (!generateResult) return;
    const rows = buildExportRows(generateResult);
    if (rows.length === 0) return;
    const csv = buildStoreHubCSV(rows);
    downloadCSV(csv, `storehub-barcodes-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function postGeneratedToSheets() {
    if (!generateResult) return;
    const rows = buildExportRows(generateResult);
    if (rows.length === 0) return;
    setPostingSheets(true);
    setSheetsMsg(null);
    try {
      const sheetRows = rows.map(({ product: p, barcode }) => [p.sku ?? '', p.name, barcode]);
      const res = await axios.post('/api/v1/sheets/post-to-sheets', {
        sheetName: 'Barcodes',
        data: sheetRows,
      });
      setSheetsMsg(res.data?.message || `Posted ${sheetRows.length} rows to Sheets`);
    } catch (e: any) {
      setSheetsMsg(`Failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setPostingSheets(false);
    }
  }

  /** Export all DB barcode records to StoreHub import template */
  function exportDbToTemplate() {
    if (filteredDbRecords.length === 0) return;
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
    const rows: ExportRow[] = filteredDbRecords
      .map((r) => ({ product: productMap[r.product_id], barcode: r.barcode }))
      .filter((r) => r.product);
    const csv = buildStoreHubCSV(rows);
    downloadCSV(csv, `storehub-barcodes-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function postDbToSheets() {
    if (filteredDbRecords.length === 0) return;
    setPostingSheets(true);
    setSheetsMsg(null);
    try {
      const sheetRows = filteredDbRecords.map((r) => [r.sku ?? '', r.product_name, r.barcode]);
      const res = await axios.post('/api/v1/sheets/post-to-sheets', {
        sheetName: 'Barcodes',
        data: sheetRows,
      });
      setSheetsMsg(res.data?.message || `Posted ${sheetRows.length} rows to Sheets`);
    } catch (e: any) {
      setSheetsMsg(`Failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setPostingSheets(false);
    }
  }

  /** Export raw barcode DB as a plain CSV (all fields) */
  function exportDbToPlainCSV() {
    const rows = [
      ['Product Name', 'SKU', 'Product ID', 'EAN-13 Barcode', 'Source'],
      ...filteredDbRecords.map((r) => [r.product_name, r.sku ?? '', r.product_id, r.barcode, r.dbId ? 'Generated' : 'Existing']),
    ];
    const csv = rows.map((r) => r.map((c) => csvEscape(c)).join(',')).join('\n');
    downloadCSV(csv, `barcodes-export-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // ── Post to Sheets state ─────────────────────────────────────────────────
  const [postingSheets, setPostingSheets] = useState(false);
  const [sheetsMsg, setSheetsMsg] = useState<string | null>(null);

  // ── product_id → barcode (from product_barcodes OR products.barcode) ──────
  const productBarcodeMap = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => map.set(r.product_id, r.barcode));
    products.forEach((p) => { if (p.barcode && !map.has(p.id)) map.set(p.id, p.barcode); });
    return map;
  }, [records, products]);

  // ── Combined rows for Database tab ────────────────────────────────────────
  const allBarcodeRows = useMemo((): BarcodeRow[] => {
    const rows: BarcodeRow[] = [];
    records.forEach((r) => rows.push({
      key: `pb_${r.id}`,
      product_id: r.product_id,
      product_name: r.product_name,
      sku: r.sku,
      barcode: r.barcode,
      generated_at: r.generated_at,
      dbId: r.id,
    }));
    products.forEach((p) => {
      if (p.barcode && !records.some((r) => r.product_id === p.id)) {
        rows.push({
          key: `ex_${p.id}`,
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          generated_at: null,
          dbId: null,
        });
      }
    });
    return rows;
  }, [records, products]);

  // ── Filtered DB records ───────────────────────────────────────────────────
  const filteredDbRecords = useMemo(() => {
    const q = dbSearch.toLowerCase();
    if (!q) return allBarcodeRows;
    return allBarcodeRows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.barcode.includes(q) ||
        (r.sku ?? '').toLowerCase().includes(q)
    );
  }, [allBarcodeRows, dbSearch]);

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteBarcode(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0e1117] text-gray-100 p-4 md:p-6">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Barcode Manager
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Generate EAN-13 barcodes and export directly to the StoreHub Products Import Template.
        </p>
        <div className="mt-3 p-3 rounded-lg bg-amber-900/30 border border-amber-600/40 text-amber-300 text-xs leading-relaxed">
          <span className="font-semibold">StoreHub import:</span> Download the exported CSV and upload it
          via <em>StoreHub Back Office → Products → Import CSV</em>.
          The StoreHub REST API does not support updating products programmatically.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800">
        {(['generate', 'database'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'generate' ? 'Generate Barcodes' : `Barcode Database${records.length > 0 ? ` (${records.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: Generate
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'generate' && (
        <div>

          {/* ── Search / filter bar ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {/* Name */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Product name</label>
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Search by name…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* SKU */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input
                type="text"
                value={filterSku}
                onChange={(e) => setFilterSku(e.target.value)}
                placeholder="Search by SKU…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* EAN prefix + clear */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                EAN-13 prefix <span className="text-gray-500">(3 digits · 200 = in-store)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={3}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="200"
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                />
                {(filterName || filterSku || filterCategory) && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded-lg transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Action row ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <button
              onClick={handleGenerate}
              disabled={selected.size === 0 || generating}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {generating && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              Generate EAN-13 {selected.size > 0 && `(${selected.size} selected)`}
            </button>
            <span className="text-xs text-gray-500">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} shown
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
          </div>

          {/* ── Result banner ────────────────────────────────────────────── */}
          {generateError && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-600/40 text-red-300 text-sm">
              {generateError}
            </div>
          )}

          {generateResult && (
            <div className="mb-4 p-4 rounded-lg bg-green-900/30 border border-green-600/40 text-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-green-300 font-semibold">
                  {generateResult.generated.length > 0
                    ? `✓ ${generateResult.generated.length} barcode${generateResult.generated.length !== 1 ? 's' : ''} generated & saved`
                    : 'No new barcodes generated'}
                  {generateResult.skipped.length > 0 &&
                    ` · ${generateResult.skipped.length} skipped (already had barcodes in DB)`}
                </p>

                {(generateResult.generated.length > 0 || generateResult.skipped.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={exportGeneratedToTemplate}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export StoreHub CSV
                    </button>
                    <button
                      onClick={postGeneratedToSheets}
                      disabled={postingSheets}
                      className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                      </svg>
                      {postingSheets ? 'Posting…' : 'Post to Sheets'}
                    </button>
                  </div>
                )}
                {sheetsMsg && (
                  <p className={`text-xs mt-1 ${sheetsMsg.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                    {sheetsMsg}
                  </p>
                )}
              </div>

              {/* Generated barcode list */}
              {generateResult.generated.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {generateResult.generated.map((b) => (
                    <div
                      key={b.product_id}
                      className="flex items-center justify-between gap-3 bg-black/20 px-3 py-1.5 rounded"
                    >
                      <span className="text-gray-200 text-xs truncate flex-1 min-w-0">
                        {b.product_name}
                        {b.sku && <span className="text-gray-500 ml-1.5">({b.sku})</span>}
                      </span>
                      <span className="font-mono text-green-300 text-sm tracking-widest whitespace-nowrap">
                        {fmtBarcode(b.barcode)}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(b.barcode)}
                        title="Copy barcode"
                        className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Product table ────────────────────────────────────────────── */}
          {productsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : productsError ? (
            <div className="p-4 rounded-lg bg-red-900/40 border border-red-600/40 text-red-300 text-sm flex items-center gap-3">
              <span className="flex-1">{productsError}</span>
              <button onClick={loadProducts} className="underline flex-shrink-0">Retry</button>
            </div>
          ) : products.length === 0 && !filterName && !filterSku && !filterCategory ? (
            <div className="p-4 rounded-lg bg-yellow-900/30 border border-yellow-600/40 text-yellow-300 text-sm flex items-center gap-3">
              <span className="flex-1">No products found in the database. Ensure your products table is populated from StoreHub.</span>
              <button onClick={loadProducts} className="underline flex-shrink-0">Retry</button>
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[40px_minmax(0,1fr)_110px_140px_minmax(120px,160px)_80px] gap-2 px-4 py-2.5 bg-gray-800/60 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    disabled={filteredProducts.length === 0}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                </div>
                <div>Product Name</div>
                <div>SKU</div>
                <div>Category</div>
                <div>Barcode</div>
                <div className="text-right">Price</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-800/60 max-h-[520px] overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="text-center text-gray-500 py-10 text-sm">
                    {products.length === 0
                      ? 'No products loaded. Make sure the products table is populated, then click Retry.'
                      : 'No products match your filters — try clearing the name, SKU, or category filter.'}
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const existingBarcode = productBarcodeMap.get(p.id) ?? null;
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleOne(p.id)}
                        className={`grid grid-cols-[40px_minmax(0,1fr)_110px_140px_minmax(120px,160px)_80px] gap-2 px-4 py-3 cursor-pointer transition-colors ${
                          selected.has(p.id)
                            ? 'bg-blue-500/10 border-l-2 border-blue-500'
                            : 'hover:bg-gray-800/40 border-l-2 border-transparent'
                        }`}
                      >
                        <div
                          className="flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleOne(p.id)}
                            className="w-4 h-4 accent-blue-500 cursor-pointer"
                          />
                        </div>
                        <div className="truncate text-sm text-gray-200">{p.name}</div>
                        <div className="text-xs text-gray-400 font-mono truncate">{p.sku ?? '—'}</div>
                        <div className="text-xs text-gray-400 truncate">{p.category ?? '—'}</div>
                        <div className="flex items-center">
                          {existingBarcode ? (
                            <span className="font-mono text-green-400 text-xs tracking-wider truncate" title={existingBarcode}>
                              {fmtBarcode(existingBarcode)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          {p.unit_price != null ? `₱${Number(p.unit_price).toFixed(2)}` : '—'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-500 border-t border-gray-800 flex justify-between">
                <span>
                  {filteredProducts.length === products.length
                    ? `${products.length} product(s) · ${selected.size} selected`
                    : `${filteredProducts.length} of ${products.length} product(s) shown · ${selected.size} selected`}
                </span>
                <span>{productBarcodeMap.size} already have barcodes</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: Database
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'database' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1">Search</label>
              <input
                type="text"
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                placeholder="Product name, SKU, or barcode number…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* StoreHub template export */}
            <button
              onClick={exportDbToTemplate}
              disabled={filteredDbRecords.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export StoreHub CSV
            </button>

            {/* Post to Sheets */}
            <button
              onClick={postDbToSheets}
              disabled={filteredDbRecords.length === 0 || postingSheets}
              className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
              {postingSheets ? 'Posting…' : 'Post to Sheets'}
            </button>

            {/* Plain barcode export */}
            <button
              onClick={exportDbToPlainCSV}
              disabled={filteredDbRecords.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export plain CSV
            </button>

            <button
              onClick={loadRecords}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>

          {recordsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_110px_180px_160px_90px] gap-2 px-4 py-2.5 bg-gray-800/60 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div>Product</div>
                <div>SKU</div>
                <div>EAN-13 Barcode</div>
                <div>Source / Date</div>
                <div className="text-right">Action</div>
              </div>

              <div className="divide-y divide-gray-800/60 max-h-[560px] overflow-y-auto">
                {filteredDbRecords.length === 0 ? (
                  <div className="text-center text-gray-500 py-10 text-sm">
                    {allBarcodeRows.length === 0
                      ? 'No barcodes yet — go to "Generate Barcodes" to get started.'
                      : 'No records match your search.'}
                  </div>
                ) : (
                  filteredDbRecords.map((r) => (
                    <div
                      key={r.key}
                      className="grid grid-cols-[minmax(0,1fr)_110px_180px_160px_90px] gap-2 px-4 py-3 hover:bg-gray-800/30 transition-colors items-center"
                    >
                      <div className="truncate text-sm text-gray-200">{r.product_name}</div>
                      <div className="text-xs text-gray-400 font-mono truncate">{r.sku ?? '—'}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-300 text-sm tracking-widest">
                          {fmtBarcode(r.barcode)}
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(r.barcode)}
                          title="Copy barcode"
                          className="text-gray-600 hover:text-white transition-colors flex-shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.generated_at ? (
                          <span>
                            <span className="text-blue-400/70 mr-1">Generated</span>
                            {new Date(r.generated_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                          </span>
                        ) : (
                          <span className="text-amber-400/70">Existing (StoreHub)</span>
                        )}
                      </div>
                      <div className="text-right">
                        {r.dbId ? (
                          <button
                            onClick={() => handleDelete(r.dbId!)}
                            disabled={deletingId === r.dbId}
                            className="text-red-400 hover:text-red-300 disabled:opacity-40 text-xs transition-colors"
                          >
                            {deletingId === r.dbId ? 'Deleting…' : 'Delete'}
                          </button>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-500 border-t border-gray-800">
                {filteredDbRecords.length} record(s)
                {filteredDbRecords.length !== allBarcodeRows.length && ` (filtered from ${allBarcodeRows.length} total)`}
                {sheetsMsg && <span className={`ml-4 ${sheetsMsg.startsWith('Failed') ? 'text-red-400' : 'text-green-400'}`}>{sheetsMsg}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BarcodePage;
