import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';
import { formatCurrency, formatNumber } from '../../utils/dateCalculations';
import { useStoreDrilldownV2 } from '../../hooks/useStoreComparisonV2';

interface StoreDrilldownPanelProps {
  storeId: string;
  startDate: Date;
  endDate: Date;
  compareStartDate: Date;
  compareEndDate: Date;
  storeIds: string[];
  onClose: () => void;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const Delta = ({ value, pct, unit = '' }: { value: number; pct: number | null; unit?: string }) => {
  const up = value >= 0;
  const color = up ? 'text-green-400' : 'text-red-400';
  const arrow = up ? '▲' : '▼';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {up ? '+' : ''}{unit}{formatNumber(Math.abs(value))}
      {pct != null && ` (${up ? '+' : ''}${pct.toFixed(1)}%)`}
    </span>
  );
};

const KpiCard = ({
  label, current, prior, change, changePct, format = 'currency', unit = '',
}: {
  label: string;
  current: number;
  prior: number;
  change: number;
  changePct: number | null;
  format?: 'currency' | 'number' | 'pct' | 'decimal';
  unit?: string;
}) => {
  const fmt = (v: number) => {
    if (format === 'currency') return formatCurrency(v);
    if (format === 'pct')     return `${v.toFixed(1)}%`;
    if (format === 'decimal') return v.toFixed(1);
    return formatNumber(v);
  };
  const up = change >= 0;
  return (
    <div className="bg-[#252833] rounded-lg p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-white">{fmt(current)}</div>
      <div className="text-xs text-gray-500">Prior: {fmt(prior)}</div>
      <div className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {up ? '+' : ''}{format === 'currency' ? formatCurrency(Math.abs(change)) : format === 'pct' ? `${Math.abs(change).toFixed(1)}pp` : format === 'decimal' ? Math.abs(change).toFixed(1) : formatNumber(Math.abs(change))}
        {changePct != null && ` (${up ? '+' : ''}${changePct.toFixed(1)}%)`}
      </div>
    </div>
  );
};

const customTooltipStyle = {
  backgroundColor: '#1c1e26',
  border: '1px solid #2e303d',
  borderRadius: '8px',
  color: '#fff',
  fontSize: 12,
};

// ── Main component ────────────────────────────────────────────────────────────

type ChartTab = 'revenue' | 'transactions' | 'avg_ticket';

export const StoreDrilldownPanel: React.FC<StoreDrilldownPanelProps> = ({
  storeId, startDate, endDate, compareStartDate, compareEndDate, storeIds, onClose,
}) => {
  const [dailyTab, setDailyTab] = useState<ChartTab>('revenue');
  const [hourlyTab, setHourlyTab] = useState<ChartTab>('revenue');

  const { data, isLoading, error } = useStoreDrilldownV2(
    storeId, startDate, endDate, compareStartDate, compareEndDate, storeIds
  );

  if (isLoading) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Store Drill-Down</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon /></button>
        </div>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Store Drill-Down</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon /></button>
        </div>
        <div className="text-red-400">Error loading drill-down data</div>
      </div>
    );
  }

  const { summary, rank, daily, hourly, product_movers, categories, distribution, zero_sales, new_products } = data;

  const tabClass = (active: boolean) =>
    `px-3 py-1 text-xs rounded font-medium transition-colors ${active ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`;

  const DailyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const cur = payload.find((p: any) => p.dataKey.startsWith('current'));
    const pri = payload.find((p: any) => p.dataKey.startsWith('prior'));
    const entry = daily.find((d: any) => d.label === label);
    return (
      <div style={customTooltipStyle} className="p-3 min-w-[180px]">
        <div className="font-semibold mb-1">{label} {entry?.cur_date ? `(${entry.cur_date})` : ''}</div>
        {cur && <div className="text-blue-400">Current: {formatCurrency(cur.value)}</div>}
        {pri && <div className="text-gray-400">Prior {entry?.pri_label}: {formatCurrency(pri.value)}</div>}
      </div>
    );
  };

  const HourlyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const cur = payload.find((p: any) => p.dataKey.startsWith('current'));
    const pri = payload.find((p: any) => p.dataKey.startsWith('prior'));
    return (
      <div style={customTooltipStyle} className="p-3">
        <div className="font-semibold mb-1">{label}</div>
        {cur && <div className="text-blue-400">Current: {formatCurrency(cur.value)}</div>}
        {pri && <div className="text-gray-400">Prior: {formatCurrency(pri.value)}</div>}
      </div>
    );
  };

  const dailyKey = dailyTab === 'revenue' ? ['current_revenue', 'prior_revenue']
    : dailyTab === 'transactions' ? ['current_transactions', 'prior_transactions']
    : ['current_avg_ticket', 'prior_avg_ticket'];

  const hourlyKey = hourlyTab === 'revenue' ? ['current_revenue', 'prior_revenue']
    : hourlyTab === 'transactions' ? ['current_transactions', 'prior_transactions']
    : ['current_avg_ticket', 'prior_avg_ticket'];

  const fmtAxis = (v: number) =>
    dailyTab === 'transactions' || hourlyTab === 'transactions' ? formatNumber(v) : formatCurrency(v);

  return (
    <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{data.store_name}</h2>
          {rank?.rank && (
            <span className="text-xs text-gray-400 mt-0.5">
              Ranked <span className="text-blue-400 font-semibold">#{rank.rank}</span> of {rank.total_stores} stores
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><XIcon /></button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Revenue"
          current={summary.current.revenue}
          prior={summary.prior.revenue}
          change={summary.revenue_change}
          changePct={summary.revenue_change_pct}
          format="currency"
        />
        <KpiCard
          label="Transactions"
          current={summary.current.transactions}
          prior={summary.prior.transactions}
          change={summary.txn_change}
          changePct={summary.txn_change_pct}
          format="number"
        />
        <KpiCard
          label="Avg Ticket"
          current={summary.current.avg_ticket}
          prior={summary.prior.avg_ticket}
          change={summary.avg_ticket_change}
          changePct={summary.avg_ticket_change_pct}
          format="currency"
        />
        <KpiCard
          label="SKUs / Basket"
          current={summary.current.skus_per_txn}
          prior={summary.prior.skus_per_txn}
          change={summary.skus_change}
          changePct={summary.skus_change_pct}
          format="decimal"
        />
        <KpiCard
          label="Margin %"
          current={summary.current.margin_pct}
          prior={summary.prior.margin_pct}
          change={summary.margin_change}
          changePct={null}
          format="pct"
        />
      </div>

      {/* Daily Performance */}
      {daily.length > 0 && (
        <div className="bg-[#252833] rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Daily Performance</h3>
            <div className="flex gap-1">
              {(['revenue', 'transactions', 'avg_ticket'] as ChartTab[]).map(t => (
                <button key={t} className={tabClass(dailyTab === t)} onClick={() => setDailyTab(t)}>
                  {t === 'revenue' ? 'Revenue' : t === 'transactions' ? 'Txns' : 'Avg Ticket'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} barGap={2} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtAxis} width={70} />
              <Tooltip content={<DailyTooltip />} />
              <Legend formatter={(v) => v === dailyKey[0] ? 'Current' : 'Prior'} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey={dailyKey[0]} name={dailyKey[0]} fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey={dailyKey[1]} name={dailyKey[1]} fill="#374151" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hour of Day */}
      {hourly.length > 0 && (
        <div className="bg-[#252833] rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Hour of Day</h3>
            <div className="flex gap-1">
              {(['revenue', 'transactions', 'avg_ticket'] as ChartTab[]).map(t => (
                <button key={t} className={tabClass(hourlyTab === t)} onClick={() => setHourlyTab(t)}>
                  {t === 'revenue' ? 'Revenue' : t === 'transactions' ? 'Txns' : 'Avg Ticket'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2e303d" vertical={false} />
              <XAxis dataKey="hour_label" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => hourlyTab === 'transactions' ? formatNumber(v) : formatCurrency(v)} width={70} />
              <Tooltip content={<HourlyTooltip />} />
              <Bar dataKey={hourlyKey[0]} name="Current" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey={hourlyKey[1]} name="Prior" fill="#374151" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Product Movers + Category Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Product Movers */}
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-white">Product Movers</h3>

          {product_movers.gainers.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1">
                ▲ Top Gainers ({product_movers.gainers.length})
              </div>
              <div className="space-y-2">
                {product_movers.gainers.map((item: any, i: number) => (
                  <MoverRow key={i} item={item} positive />
                ))}
              </div>
            </div>
          )}

          {product_movers.decliners.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                ▼ Top Decliners ({product_movers.decliners.length})
              </div>
              <div className="space-y-2">
                {product_movers.decliners.map((item: any, i: number) => (
                  <MoverRow key={i} item={item} positive={false} />
                ))}
              </div>
            </div>
          )}

          {product_movers.gainers.length === 0 && product_movers.decliners.length === 0 && (
            <div className="text-gray-500 text-sm">No product movement data</div>
          )}
        </div>

        {/* Category Movers */}
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-white">Category Performance</h3>
          {categories.length > 0 ? (
            <div className="space-y-2">
              {categories.map((cat: any, i: number) => {
                const maxRev = Math.max(...categories.map((c: any) => c.current_revenue));
                const pct = maxRev > 0 ? (cat.current_revenue / maxRev) * 100 : 0;
                const up = cat.revenue_change >= 0;
                return (
                  <div key={i} className="bg-[#1c1e26] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white font-medium truncate max-w-[60%]">{cat.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatCurrency(cat.current_revenue)}</span>
                        <span className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
                          {up ? '+' : ''}{cat.change_pct != null ? `${cat.change_pct.toFixed(1)}%` : 'New'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#2e303d] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${up ? 'bg-blue-500' : 'bg-orange-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Prior: {formatCurrency(cat.prior_revenue)} · {up ? '+' : ''}{formatCurrency(Math.abs(cat.revenue_change))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No category data</div>
          )}
        </div>
      </div>

      {/* Transaction Size Distribution */}
      {distribution.length > 0 && (
        <div className="bg-[#252833] rounded-lg p-4">
          <h3 className="text-base font-semibold text-white mb-4">Transaction Size Distribution</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {distribution.map((bucket: any) => {
              const diff = bucket.current_count - bucket.prior_count;
              const up = diff >= 0;
              return (
                <div key={bucket.bucket} className="bg-[#1c1e26] rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">{bucket.bucket}</div>
                  <div className="text-lg font-bold text-white">{formatNumber(bucket.current_count)}</div>
                  <div className="text-xs text-gray-500">txns</div>
                  <div className={`text-xs font-semibold mt-1 ${up ? 'text-green-400' : 'text-red-400'}`}>
                    {up ? '+' : ''}{diff} vs prior
                  </div>
                  <div className="text-xs text-gray-500">{formatCurrency(bucket.current_revenue)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zero-sales & New Products */}
      {(zero_sales.length > 0 || new_products.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {zero_sales.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Zero Sales This Period ({zero_sales.length})
              </h3>
              <div className="text-xs text-gray-500 mb-2">Sold in prior period — possible stockout or discontinuation</div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {zero_sales.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-[#252833] rounded px-3 py-2">
                    <span className="text-sm text-white truncate max-w-[65%]">{p.name}</span>
                    <span className="text-xs text-red-400 font-medium">{formatCurrency(p.prior_revenue)} prior</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {new_products.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                New This Period ({new_products.length})
              </h3>
              <div className="text-xs text-gray-500 mb-2">No sales in prior period — new or recently introduced</div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {new_products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-[#252833] rounded px-3 py-2">
                    <span className="text-sm text-white truncate max-w-[65%]">{p.name}</span>
                    <span className="text-xs text-blue-400 font-medium">{formatCurrency(p.current_revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const MoverRow = ({ item, positive }: { item: any; positive: boolean }) => {
  const isNew = positive && item.previous_revenue === 0;
  return (
    <div
      className="bg-[#252833] rounded-lg p-3 border-l-4"
      style={{ borderLeftColor: positive ? '#10b981' : '#ef4444' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white font-medium truncate max-w-[65%]">{item.name}</span>
        <span className={`text-sm font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {positive ? '+' : ''}{formatCurrency(item.revenue_change)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{formatCurrency(item.previous_revenue)} → {formatCurrency(item.current_revenue)}</span>
        {isNew ? (
          <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded text-xs font-medium">New</span>
        ) : (
          <span className={positive ? 'text-green-400' : 'text-red-400'}>
            {positive ? '+' : ''}{item.change_pct != null ? `${item.change_pct.toFixed(1)}%` : '—'}
          </span>
        )}
      </div>
    </div>
  );
};

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
