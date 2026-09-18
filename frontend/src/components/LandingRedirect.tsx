/**
 * Where a person lands.
 *
 * "/" is a redirect and nothing else. It sends everybody to the first page
 * they are allowed to see, in the order `constants/pages.ts` declares, which
 * puts the dashboard first — so a person lands in the BI app.
 *
 * FROM 2026-09-09 TO 2026-09-12 this rendered the room instead, on the reading
 * that Bob is the environment rather than a destination. The cost was that
 * the rest of Supabot BI — still routed, still allowed — was reachable from
 * nowhere a person stood, because the room's rail links only to Bob's own
 * screens. Bob is a page again, at `/bob` (the owner's decision: "this
 * is still supabot, just make bob a page").
 *
 * No allowed page's path is "/", so this cannot loop.
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { landingPathFor } from '../constants/pages';

export function LandingRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return <Navigate to={landingPathFor(user.allowed_pages)} replace />;
}
