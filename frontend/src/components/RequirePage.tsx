/**
 * Route-level access check.
 *
 * Redirects to the user's own landing page when they open a route their role
 * cannot see, so a staff member who types /analytics is bounced rather than
 * shown an empty shell.
 *
 * Cosmetic only — the matching API routes are guarded server-side by
 * require_page() / require_admin in app/core/deps.py.
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { landingPathFor } from '../constants/pages';

interface RequirePageProps {
  pageKey: string;
  children: React.ReactNode;
}

export function RequirePage({ pageKey, children }: RequirePageProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  if (!user.allowed_pages.includes(pageKey)) {
    const target = landingPathFor(user.allowed_pages);
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

/** Shown when a role has no enabled pages at all. */
export function NoAccessPage() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-xl font-bold text-white mb-2">No pages assigned</h1>
      <p className="text-sm text-gray-400 max-w-sm mb-6">
        Your account ({user?.username}) does not have access to any pages yet.
        Ask an administrator to grant access.
      </p>
      <button
        onClick={logout}
        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
