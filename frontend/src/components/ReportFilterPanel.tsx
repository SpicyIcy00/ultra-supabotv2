import React, { useState, useEffect } from 'react';
import { usePresetStore } from '../stores/presetStore';
import { SORT_FIELD_OPTIONS } from '../types/preset';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const ReportFilterPanel: React.FC = () => {
  const { currentConfig, updateCurrentConfig } = usePresetStore();
  const [categories, setCategories] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    currentConfig.filters.categories || []
  );
  const [minQty, setMinQty] = useState<string>(
    currentConfig.filters.min_quantity?.toString() || ''
  );
  const [maxQty, setMaxQty] = useState<string>(
    currentConfig.filters.max_quantity?.toString() || ''
  );
  const [limit, setLimit] = useState<string>(
    currentConfig.filters.limit?.toString() || ''
  );
  const [sortBy, setSortBy] = useState(currentConfig.filters.sort_by || 'quantity_sold');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    currentConfig.filters.sort_order || 'desc'
  );
  const [search, setSearch] = useState(currentConfig.filters.search || '');
  const [groupByCategory, setGroupByCategory] = useState(
    currentConfig.group_by_category ?? true
  );
  const [minPrice, setMinPrice] = useState<string>(
    currentConfig.filters.min_price?.toString() || ''
  );
  const [maxPrice, setMaxPrice] = useState<string>(
    currentConfig.filters.max_price?.toString() || ''
  );
  const [minProfitMargin, setMinProfitMargin] = useState<string>(
    currentConfig.filters.min_profit_margin?.toString() || ''
  );
  const [maxProfitMargin, setMaxProfitMargin] = useState<string>(
    currentConfig.filters.max_profit_margin?.toString() || ''
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    currentConfig.filters.days_of_week || []
  );

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleDayOfWeek = (day: string) => {
    setDaysOfWeek((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  };

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get<string[]>(`${API_BASE_URL}/api/v1/products/categories`);
        setCategories(response.data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        // Fallback to empty array if fetch fails
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

  const applyFilters = () => {
    updateCurrentConfig({
      filters: {
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        min_quantity: minQty ? parseInt(minQty) : undefined,
        max_quantity: maxQty ? parseInt(maxQty) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        search: search || undefined,
        min_price: minPrice ? parseFloat(minPrice) : undefined,
        max_price: maxPrice ? parseFloat(maxPrice) : undefined,
        min_profit_margin: minProfitMargin ? parseFloat(minProfitMargin) : undefined,
        max_profit_margin: maxProfitMargin ? parseFloat(maxProfitMargin) : undefined,
        days_of_week: daysOfWeek.length > 0 ? daysOfWeek : undefined,
      },
      group_by_category: groupByCategory,
    });
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setMinQty('');
    setMaxQty('');
    setLimit('');
    setSortBy('quantity_sold');
    setSortOrder('desc');
    setSearch('');
    setGroupByCategory(true);
    setMinPrice('');
    setMaxPrice('');
    setMinProfitMargin('');
    setMaxProfitMargin('');
    setDaysOfWeek([]);
    updateCurrentConfig({
      filters: {
        categories: undefined,
        min_quantity: undefined,
        max_quantity: undefined,
        limit: undefined,
        sort_by: 'quantity_sold',
        sort_order: 'desc',
        search: undefined,
        min_price: undefined,
        max_price: undefined,
        min_profit_margin: undefined,
        max_profit_margin: undefined,
        days_of_week: undefined,
      },
      group_by_category: true,
    });
  };

  // Apply filters whenever they change (real-time)
  useEffect(() => {
    applyFilters();
  }, [selectedCategories, minQty, maxQty, limit, sortBy, sortOrder, search, groupByCategory, minPrice, maxPrice, minProfitMargin, maxProfitMargin, daysOfWeek]);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Filters</h3>
        <button
          onClick={clearFilters}
          className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Search
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product name, SKU, or ID..."
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Categories */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Categories
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.length > 0 ? (
            categories.map((category) => (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  selectedCategories.includes(category)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {category}
              </button>
            ))
          ) : (
            <span className="text-sm text-gray-400">Loading categories...</span>
          )}
        </div>
      </div>

      {/* Quantity Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Min Quantity
          </label>
          <input
            type="number"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            min="0"
            placeholder="Min"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Max Quantity
          </label>
          <input
            type="number"
            value={maxQty}
            onChange={(e) => setMaxQty(e.target.value)}
            min="0"
            placeholder="Max"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Top N Limit */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Top N Products (Limit)
        </label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          min="1"
          max="10000"
          placeholder="e.g., 50"
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Sorting */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Min Price (₱)
          </label>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="Min"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Max Price (₱)
          </label>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            min="0"
            step="0.01"
            placeholder="Max"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Profit Margin Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Min Profit Margin (%)
          </label>
          <input
            type="number"
            value={minProfitMargin}
            onChange={(e) => setMinProfitMargin(e.target.value)}
            min="0"
            max="100"
            step="0.1"
            placeholder="Min %"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Max Profit Margin (%)
          </label>
          <input
            type="number"
            value={maxProfitMargin}
            onChange={(e) => setMaxProfitMargin(e.target.value)}
            min="0"
            max="100"
            step="0.1"
            placeholder="Max %"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Day of Week Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Day of Week
        </label>
        <div className="flex flex-wrap gap-2">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
            <button
              key={day}
              onClick={() => toggleDayOfWeek(day.toLowerCase())}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                daysOfWeek.includes(day.toLowerCase())
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {day.substring(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Display Options */}
      <div className="pt-4 border-t border-gray-700">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Display Options</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={groupByCategory}
            onChange={(e) => setGroupByCategory(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
          />
          <span className="text-sm text-gray-300">
            Group results by category
          </span>
        </label>
      </div>
    </div>
  );
};
