/**
 * Where a person lands.
 *
 * "/" IS THE DESK for a person with George — the business at rest, not a
 * redirect to it (2026-09-09, the Experience Reset). George is no longer one
 * of several destinations to be sent to; it is the environment, and it is
 * what "/" renders. Everyone else lands on their first allowed page, exactly
 * as before (constants/pages.ts decides the order), and no allowed page's own
 * path is "/", so this cannot loop.
 */
import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { landingPathFor } from '../constants/pages';

const DeskPage = React.lazy(() => import('../pages/DeskPage'));

export function LandingRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (user.allowed_pages.includes('george')) {
    return (
      <Suspense fallback={<div className="desk-ground h-dvh" />}>
        <DeskPage />
      </Suspense>
    );
  }
  return <Navigate to={landingPathFor(user.allowed_pages)} replace />;
}
