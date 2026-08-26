/**
 * Guards "/" specifically.
 *
 * Warehouse staff have no 'dashboard' access, so opening the app root has to
 * forward them to their own first allowed page. RequirePage cannot do this on
 * "/" without bouncing between the two routes when landingPathFor also returns
 * "/", so this variant renders children when allowed and redirects otherwise.
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { landingPathFor } from '../constants/pages';

interface LandingRedirectProps {
  children: React.ReactNode;
}

export function LandingRedirect({ children }: LandingRedirectProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  if (user.allowed_pages.includes('dashboard')) {
    return <>{children}</>;
  }

  // "/" is the dashboard's path, and the check above already established the
  // user cannot see it — so landingPathFor returns another page or
  // "/no-access", never "/". This cannot loop.
  return <Navigate to={landingPathFor(user.allowed_pages)} replace />;
}
