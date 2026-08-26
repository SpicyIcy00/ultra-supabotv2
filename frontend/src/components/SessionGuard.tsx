/**
 * Gates the app on a valid login session.
 *
 * On mount it re-validates the stored token against /auth/me, which refreshes
 * the user's role and allowed pages. That means revoking a page or deactivating
 * an account takes effect on the next load rather than whenever the token would
 * have expired.
 *
 * This is presentation only — every protected endpoint re-checks the caller
 * server-side in app/core/deps.py.
 */
import { useEffect, useState } from 'react';
import { fetchMe } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';
import { LoginPage } from '../pages/LoginPage';

interface SessionGuardProps {
  children: React.ReactNode;
}

export function SessionGuard({ children }: SessionGuardProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        // The 401 interceptor already clears the session; this covers 403
        // (deactivated account) and anything else that makes the token unusable.
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per token — re-validating on every render would loop.
  }, [token, setUser, logout]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0e1117] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d2ff]" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
