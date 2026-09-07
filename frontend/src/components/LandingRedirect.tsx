/**
 * "/" is a redirect and nothing else.
 *
 * A person with George lands in George; everyone else lands on their first
 * allowed page, exactly as before (constants/pages.ts decides the order).
 * "/" is no page's own path any more, so landingPathFor can never return it
 * and this cannot loop.
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { landingPathFor } from '../constants/pages';

export function LandingRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return <Navigate to={landingPathFor(user.allowed_pages)} replace />;
}
