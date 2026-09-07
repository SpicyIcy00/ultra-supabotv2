import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '../services/queryClient';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  display_name?: string | null;
  allowed_pages: string[];
}

interface AuthState {
  sessionRevision: number;
  token: string | null;
  user: AuthUser | null;

  setSession: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;

  isLoggedIn: () => boolean;
  canSee: (pageKey: string) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      sessionRevision: 0,

      setSession: (token, user) => {
        // clear() cancels existing queries and removes mutations as well as data.
        queryClient.clear();
        set({ token, user, sessionRevision: get().sessionRevision + 1 });
      },

      // Refreshed from /auth/me on load so a revoked page disappears without
      // the user having to log out and back in.
      setUser: (user) => set({ user }),

      logout: () => {
        queryClient.clear();
        set({ token: null, user: null, sessionRevision: get().sessionRevision + 1 });
      },

      isLoggedIn: () => Boolean(get().token && get().user),

      canSee: (pageKey) => get().user?.allowed_pages.includes(pageKey) ?? false,

      isAdmin: () => get().user?.role === 'admin',
    }),
    { name: 'supabot_auth', partialize: ({ token, user }) => ({ token, user }) },
  ),
);
