import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { useStoreDrilldownV2 } from '../../hooks/useStoreComparisonV2';
import { useDashboardStore } from '../../stores/dashboardStore';

interface StoreDrilldownPanelProps {
  storeId: string;
  startDate: Date;
  endDate: Date;
  compareStartDate: Date;
  compareEndDate: Date;
  storeIds: string[];
  onClose: () => void;
}

type MetricTab = 'revenue' | 'transactions' | 'avg_ticket';
type PeriodTab  = 'daily' | 'hourly';

const METRIC_LABELS: Record<MetricTab, string> = {
  revenue: 'Revenue',
  transactions: 'Transactions',
  avg_ticket: 'Avg Ticket',
};

const tooltipStyle = {
  backgroundColor: '#13141a',
  border: '1px solid #2e303d',
  borderRadius: 8,
  fontSize: 12,
  color: '#fff',
  padding: '10px 14px',
};

// ── KPI Card ─────────────────────────────────────────────────────────────────

const KpiCard = ({
  label, current, prior, change, changePct, format = 'currency',
}: {
  label: string; current: number; prior: number;
  change: number; changePct: number | null;
  format?: 'currency' | 'number' | 'pct' | 'decimal';
}) => {
  const fmt = (v: number) => {
    if (format === 'currency') return formatCurrency(v);
    if (format === 'pct')      return `${v.toFixed(1)}%`;
    if (format === 'decimal')  return v.toFixed(1);
    return formatNumber(v);
  };
  const up = change >= 0;
  const fmtChange = () => {
    if (format === 'currency') return formatCurrency(Math.abs(change));
    if (format === 'pct')      return `${Math.abs(change).toFixed(1)}pp`;
    if (format === 'decimal')  return Math.abs(change).toFixed(1);
    return formatNumber(Math.abs(change));
  };
  return (
    <div className="bg-[#252833] rounded-lg px-4 py-3">
      <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-xl font-bold text-white leading-none">{fmt(current)}</div>
        <div className={`text-xs font-semibold leading-none pb-0.5 ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? '+' : '-'}{fmtChange()}
          {changePct != null && <span className="opacity-70"> ({up ? '+' : ''}{changePct.toFixed(1)}%)</span>}
        </div>
      </div>
      <div className="text-[11px] text-gray-600 mt-1">Prior: {fmt(prior)}</div>
    </div>
  );
};

// ── Chart Tooltip ─────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label, metric }: any) => {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p: any) => p.dataKey?.startsWith('current'));
  const pri = payload.find((p: any) => p.dataKey?.startsWith('prior'));
  const fmt = (v: number) => metric === 'transactions' ? formatNumber(v) : formatCurrency(v);
  return (
    <div style={tooltipStyle}>
      <div className="font-semibold text-gray-300 mb-1">{label}</div>
      {cur && <div className="text-blue-400">Current: {fmt(cur.value)}</div>}
      {pri && <div className="text-gray-400">Prior: {fmt(pri.value)}</div>}
    </div>
  );
};

// ── Mover Row ─────────────────────────────────────────────────────────────────

const MoverRow = ({ item, positive }: { item: any; positive: boolean }) => {
  const isNew = positive && item.previous_revenue === 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#2e303d] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1 h-4 rounded-full flex-shrink-0 ${positive ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-white truncate">{item.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <span className="text-xs text-gray-500 hidden sm:block">
          {formatCurrency(item.previous_revenue)} → {formatCurrency(item.current_revenue)}
        </span>
        {isNew
          ? <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-medium">New</span>
          : <span className={`text-xs font-semibold ${positive ? 'text-green-400' : 'text-red-400'}`}>
              {positive ? '+' : ''}{item.change_pct != null ? `${item.change_pct.toFixed(1)}%` : '—'}
            </span>
        }
        <span className={`text-sm font-bold w-24 text-right ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {positive ? '+' : ''}{formatCurrency(item.revenue_change)}
        </span>
      </div>
    </div>
  );
};

// ── Collapsible Section ───────────────────────────────────────────────────────

const CollapsibleSection = ({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[#2e303d] pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left group mb-1"
      >
        <svg
          className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">{title}</span>
        {subtitle && <span className="text-xs text-gray-600">{subtitle}</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
};

// ── Main Panel ────────────────────────────────────────────────────────────────

export const StoreDrilldownPanel: React.FC<StoreDrilldownPanelProps> = ({
  storeId, startDate, endDate, compareStartDate, compareEndDate, storeIds, onClose,
}) => {
  const [metric, setMetric]   = useState<MetricTab>('revenue');
  const [period, setPeriod]   = useState<PeriodTab>('daily');

  const { data, isLoading, error } = useStoreDrilldownV2(
    storeId, startDate, endDate, compareStartDate, compareEndDate, storeIds
  );
  const getStoreName = useDashboardStore((state) => state.getStoreName);
  const getStoreNameByDbName = useDashboardStore((state) => state.getStoreNameByDbName);

  const btnBase = 'px-3 py-1 text-xs rounded font-medium transition-colors';
  const btn     = (active: boolean) => `${btnBase} ${active ? 'bg-[#3b82f6] text-white' : 'text-gray-400 hover:text-white'}`;

  if (isLoading) return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <PanelHeader title="Store Drill-Down" onClose={onClose} />
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    </div>
  );

  if (error || !data || data.error) return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
      <PanelHeader title="Store Drill-Down" onClose={onClose} />
      <div className="text-red-400 text-sm">Error loading drill-down data</div>
    </div>
  );

  const { summary, rank, daily, hourly, product_movers, categories, distribution, zero_sales, new_products } = data;

  const chartData = period === 'daily' ? daily : hourly;
  const xKey      = period === 'daily' ? 'label' : 'hour_label';
  const curKey    = `current_${metric}`;
  const priKey    = `prior_${metric}`;
  const fmtY      = (v: number) => metric === 'transactions' ? formatNumber(v) : formatCurrency(v);

  const catGainers   = (categories || []).filter((c: any) => c.revenue_change >= 0).sort((a: any, b: any) => b.revenue_change - a.revenue_change).slice(0, 5);
  const catDecliners = (categories || []).filter((c: any) => c.revenue_change < 0).sort((a: any, b: any) => a.revenue_change - b.revenue_change).slice(0, 5);
  const toMoverItem  = (c: any) => ({ ...c, name: c.category, previous_revenue: c.prior_revenue ?? c.previous_revenue ?? 0, current_revenue: c.current_revenue ?? 0 });

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e303d]">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {getStoreName(storeId) !== storeId ? getStoreName(storeId) : getStoreNameByDbName(data.store_name)}
          </h2>
          {rank?.rank && (
            <span className="text-xs text-gray-500">
              Rank <span className="text-blue-400 font-semibold">#{rank.rank}</span>
              <span> of {rank.total_stores}</span>
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Revenue"      current={summary.current.revenue}      prior={summary.prior.revenue}      change={summary.revenue_change}     changePct={summary.revenue_change_pct}  format="currency" />
          <KpiCard label="Transactions" current={summary.current.transactions} prior={summary.prior.transactions} change={summary.txn_change}          changePct={summary.txn_change_pct}      format="number"   />
          <KpiCard label="Avg Ticket"   current={summary.current.avg_ticket}   prior={summary.prior.avg_ticket}   change={summary.avg_ticket_change}   changePct={summary.avg_ticket_change_pct} format="currency" />
          <KpiCard label="SKUs/Basket"  current={summary.current.skus_per_txn} prior={summary.prior.skus_per_txn} change={summary.skus_change}         changePct={summary.skus_change_pct}     format="decimal"  />
          <KpiCard label="Margin %"     current={summary.current.margin_pct}   prior={summary.prior.margin_pct}   change={summary.margin_change}       changePct={null}                        format="pct"      />
        </div>

        {/* ── Transaction Distribution (compact) ── */}
        {distribution.length > 0 && (
          <div className="flex gap-2">
            {distribution.map((b: any) => {
              const diff = b.current_count - b.prior_count;
              const up   = diff >= 0;
              return (
                <div key={b.bucket} className="flex-1 bg-[#252833] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 flex-shrink-0">{b.bucket}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{formatNumber(b.current_count)}</span>
                    <span className={`text-[11px] ml-1.5 font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
                      {up ? '+' : ''}{diff}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Chart ── */}
        {chartData?.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-1 bg-[#252833] rounded-lg p-1">
                {(['daily', 'hourly'] as PeriodTab[]).map(p => (
                  <button key={p} className={btn(period === p)} onClick={() => setPeriod(p)}>
                    {p === 'daily' ? 'Daily' : 'By Hour'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(Object.keys(METRIC_LABELS) as MetricTab[]).map(m => (
                  <button key={m} className={btn(metric === m)} onClick={() => setMetric(m)}>
                    {METRIC_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" vertical={false} />
                <XAxis dataKey={xKey} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtY} width={68} />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey={curKey} name="Current" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey={priKey} name="Prior"   fill="#374151" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 justify-end">
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 rounded-sm bg-blue-500 inline-block" />Current</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 rounded-sm bg-[#374151] inline-block" />Prior</span>
            </div>
          </div>
        )}

        {/* ── Product Movers + Category Performance (collapsible) ── */}
        <CollapsibleSection
          title="Product Movers & Category Performance"
          subtitle={`${product_movers.gainers.length + product_movers.decliners.length} products · ${catGainers.length + catDecliners.length} categories`}
          defaultOpen
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Product Movers</div>
              {product_movers.gainers.length === 0 && product_movers.decliners.length === 0
                ? <div className="text-sm text-gray-600">No data</div>
                : <div className="space-y-4">
                    {product_movers.gainers.length > 0 && (
                      <div>
                        <div className="text-xs text-green-500 font-medium mb-1">▲ Gainers ({product_movers.gainers.length})</div>
                        {product_movers.gainers.map((item: any, i: number) => <MoverRow key={i} item={item} positive />)}
                      </div>
                    )}
                    {product_movers.decliners.length > 0 && (
                      <div>
                        <div className="text-xs text-red-500 font-medium mb-1">▼ Decliners ({product_movers.decliners.length})</div>
                        {product_movers.decliners.map((item: any, i: number) => <MoverRow key={i} item={item} positive={false} />)}
                      </div>
                    )}
                  </div>
              }
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Category Performance</div>
              {catGainers.length === 0 && catDecliners.length === 0
                ? <div className="text-sm text-gray-600">No data</div>
                : <div className="space-y-4">
                    {catGainers.length > 0 && (
                      <div>
                        <div className="text-xs text-green-500 font-medium mb-1">▲ Gainers ({catGainers.length})</div>
                        {catGainers.map((cat: any, i: number) => <MoverRow key={i} item={toMoverItem(cat)} positive />)}
                      </div>
                    )}
                    {catDecliners.length > 0 && (
                      <div>
                        <div className="text-xs text-red-500 font-medium mb-1">▼ Decliners ({catDecliners.length})</div>
                        {catDecliners.map((cat: any, i: number) => <MoverRow key={i} item={toMoverItem(cat)} positive={false} />)}
                      </div>
                    )}
                  </div>
              }
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Zero Sales + New Products (collapsible) ── */}
        {(zero_sales.length > 0 || new_products.length > 0) && (
          <CollapsibleSection
            title="Zero Sales & New Products"
            subtitle={`${zero_sales.length} zero-sales · ${new_products.length} new`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {zero_sales.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
                    Zero Sales This Period <span className="text-red-500 normal-case">({zero_sales.length})</span>
                  </div>
                  <div className="text-[11px] text-gray-600 mb-2">Sold in prior period — possible stockout</div>
                  {zero_sales.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#2e303d] last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1 h-4 rounded-full flex-shrink-0 bg-red-500" />
                        <span className="text-sm text-white truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatCurrency(p.prior_revenue)} prior</span>
                    </div>
                  ))}
                </div>
              )}
              {new_products.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
                    New This Period <span className="text-blue-400 normal-case">({new_products.length})</span>
                  </div>
                  <div className="text-[11px] text-gray-600 mb-2">No prior sales — new or recently introduced</div>
                  {new_products.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#2e303d] last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1 h-4 rounded-full flex-shrink-0 bg-blue-500" />
                        <span className="text-sm text-white truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-blue-400 font-semibold flex-shrink-0 ml-2">{formatCurrency(p.current_revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

      </div>
    </div>
  );
};

const PanelHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold text-white">{title}</h2>
    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
);
