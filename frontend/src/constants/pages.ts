/**
 * The single source of truth mapping a role_page_access.page_key to its route.
 *
 * page_key values must stay in sync with PAGE_KEYS in
 * backend/app/models/role_page_access.py.
 */
export interface PageDef {
  key: string;
  path: string;
  label: string;
}

export const PAGES: PageDef[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard' },
  { key: 'analytics', path: '/analytics', label: 'Analytics' },
  { key: 'ai_chat', path: '/ai-chat', label: 'AI Chat' },
  { key: 'warehouse', path: '/warehouse', label: 'Warehouse' },
  { key: 'packing', path: '/packing', label: 'Packing' },
  { key: 'settings', path: '/settings', label: 'Settings' },
  { key: 'admin', path: '/admin/page-access', label: 'Admin' },
];

export const pathForPage = (key: string): string =>
  PAGES.find((p) => p.key === key)?.path ?? '/';

/**
 * Where to send a user who has landed somewhere they cannot see.
 * Follows PAGES order, so a warehouse_staff user with only 'packing' lands on
 * /packing rather than a dashboard they are not allowed to open.
 */
export const landingPathFor = (allowedPages: string[]): string => {
  const first = PAGES.find((p) => allowedPages.includes(p.key));
  return first?.path ?? '/no-access';
};
