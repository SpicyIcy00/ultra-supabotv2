// Fixed color mappings for stores and categories
// DO NOT MODIFY - These colors are mapped to specific business entities

export const STORE_COLORS: Record<string, string> = {
  Rockwell: '#E74C3C', // red
  Greenhills: '#2ECC71', // green
  Magnolia: '#F1C40F', // yellow
  'North Edsa': '#3498DB', // blue
  Fairview: '#9B59B6', // purple
  Opus: '#1ABC9C', // teal
};

export const CATEGORY_COLORS: Record<string, string> = {
  'n/a': '#64748b', // Slate
  'aji mix': '#38bdf8', // Sky Blue
  bev: '#2dd4bf', // Teal
  ccp: '#f87171', // Coral
  choco: '#fb923c', // Orange
  indi: '#34d399', // Emerald
  mint: '#67e8f9', // Cyan
  nuts: '#fbbf24', // Amber
  oceana: '#60a5fa', // Blue
  'per gram': '#c084fc', // Violet
  seasonal: '#f472b6', // Pink
  toys: '#facc15', // Yellow
  tradsnax: '#4ade80', // Green
};

// Theme colors
export const THEME_COLORS = {
  background: '#0e1117',
  cardBackground: '#1c1e26',
  cardBorder: '#2e303d',
  primaryText: '#ffffff',
  secondaryText: '#a0a0a0',
  positiveChange: '#16a085', // green
  negativeChange: '#e74c3c', // red
  primaryAccent: '#00d2ff', // cyan blue
  gridLines: 'rgba(255,255,255,0.1)',
};

// Helper function to get store color
export const getStoreColor = (storeName: string): string => {
  return STORE_COLORS[storeName] || THEME_COLORS.primaryAccent;
};

// Helper function to get category color
export const getCategoryColor = (categoryName: string): string => {
  return CATEGORY_COLORS[categoryName] || THEME_COLORS.secondaryText;
};

// All store names (for reference)
export const ALL_STORES = [
  'Rockwell',
  'Greenhills',
  'Magnolia',
  'North Edsa',
  'Fairview',
  'Opus',
] as const;

// All category names (for reference)
export const ALL_CATEGORIES = [
  'n/a',
  'aji mix',
  'bev',
  'ccp',
  'choco',
  'indi',
  'mint',
  'nuts',
  'oceana',
  'per gram',
  'seasonal',
  'toys',
  'tradsnax',
] as const;

export type StoreName = typeof ALL_STORES[number];
export type CategoryName = typeof ALL_CATEGORIES[number];
