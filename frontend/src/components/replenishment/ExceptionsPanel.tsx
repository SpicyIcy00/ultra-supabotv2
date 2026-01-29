import React, { useState, useEffect } from 'react';
import { getExceptions } from '../../services/replenishmentApi';
import type { ExceptionsResponse, ExceptionItem } from '../../types/replenishment';

export const ExceptionsPanel: React.FC = () => {
  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getExceptions();
      setData(result);
    } catch {
      // no data
    } finally {
      setLoading(false);
    }
  };

  const filtered = data?.items.filter(
    i => filter === 'all' || i.exception_type === filter
  ) || [];

  const typeCounts = (data?.items || []).reduce<Record<string, number>>((acc, i) => {
    acc[i.exception_type] = (acc[i.exception_type] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <FilterButton label="All" count={data?.total_exceptions || 0} active={filter === 'all'} onClick={() => setFilter('all')} />
        {Object.entries(typeCounts).map(([type, count]) => (
          <FilterButton key={type} label={formatType(type)} count={count} active={filter === type} onClick={() => setFilter(type)} />
        ))}
      </div>

      {/* Exception List */}
      {filtered.length === 0 ? (
        <div className="bg-[#1c1e26] border border-[#2e303d] rounded-lg p-8 text-center">
          <p className="text-gray-400">No exceptions found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, idx) => (
            <ExceptionRow key={`${item.store_id}-${item.sku_id}-${idx}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

const FilterButton: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-[#1c1e26] border border-[#2e303d] text-gray-400 hover:text-white'
    }`}
  >
    {label} ({count})
  </button>
);

const ExceptionRow: React.FC<{ item: ExceptionItem }> = ({ item }) => {
  const typeColors: Record<string, string> = {
    warehouse_shortage: 'border-l-red-500',
    negative_stock: 'border-l-red-500',
    overstock: 'border-l-yellow-500',
    critical_stock: 'border-l-orange-500',
    low_data: 'border-l-gray-500',
  };

  return (
    <div className={`bg-[#1c1e26] border border-[#2e303d] border-l-4 ${typeColors[item.exception_type] || 'border-l-gray-500'} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white font-medium">
            {item.product_name} <span className="text-gray-500">@</span> {item.store_name}
          </p>
          <p className="text-xs text-gray-400 mt-1">{item.detail}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">
            Req: {item.requested_qty} | Alloc: {item.allocated_qty}
          </p>
          <p className="text-xs text-gray-500">
            Days: {item.days_of_stock.toFixed(1)} | Priority: {item.priority_score.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};

function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default ExceptionsPanel;
