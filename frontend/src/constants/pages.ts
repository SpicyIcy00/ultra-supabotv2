/**
 * The single source of truth mapping a role_page_access.page_key to its route.
 *
 * page_key values must stay in sync with PAGE_KEYS in
 * backend/app/models/role_page_access.py.
 *
 * ORDER IS THE LANDING. `landingPathFor` takes the first allowed page, so the
 * dashboard comes first and a person lands in the BI app.
 *
 * BOB IS A PAGE AGAIN, AT `/bob` (2026-09-12, the owner's decision).
 *
 * From 2026-09-09 to 2026-09-12 Bob had no path of its own: "/" RENDERED
 * the room, on the reading that Bob is the environment rather than a
 * destination. What that produced in practice was an app whose front door was
 * Bob and whose other pages — Dashboard, Analytics, Warehouse, Packing —
 * were still routed, still allowed, and reachable from nowhere a person
 * actually stood. The room's rail offers Bob's own screens and nothing
 * else, so landing there was a one-way door.
 *
 * The owner's words: "this is still supabot, just make bob a page." The
 * product is Supabot BI; Bob is one page in it, in the same nav as the
 * rest, and "/" goes back to being a redirect to the first page a person is
 * allowed to see.
 */
export interface PageDef {
  key: string;
  path: string;
  label: string;
}

export const PAGES: PageDef[] = [
  // The dashboard leads, so "/" lands in the BI app. Bob sits beside it as
  // a page with its own path, which is what makes it reachable AND leavable.
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { key: 'bob', path: '/bob', label: 'Bob' },
  { key: 'analytics', path: '/analytics', label: 'Analytics' },
  { key: 'ai_chat', path: '/ai-chat', label: 'AI Chat' },
  { key: 'warehouse', path: '/warehouse', label: 'Warehouse' },
  { key: 'packing', path: '/packing', label: 'Packing' },
  // P3.h: the upload page for StoreHub's purchase-order and stock-transfer
  // exports. Rendered in the room's chrome; granted by name in the admin screen.
  { key: 'storehub_imports', path: '/storehub-imports', label: 'StoreHub exports' },
  { key: 'settings', path: '/settings', label: 'Settings' },
  { key: 'admin', path: '/admin/page-access', label: 'Admin' },
];

export const pathForPage = (key: string): string =>
  PAGES.find((p) => p.key === key)?.path ?? '/no-access';

/**
 * Where to send a user who has landed somewhere they cannot see.
 * Follows PAGES order, so a warehouse_staff user with only 'packing' lands on
 * /packing rather than a dashboard they are not allowed to open.
 */
export const landingPathFor = (allowedPages: string[]): string => {
  const first = PAGES.find((p) => allowedPages.includes(p.key));
  return first?.path ?? '/no-access';
};
