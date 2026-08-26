/**
 * Passcode login.
 *
 * One field, no username: the passcode identifies the account, which supplies
 * the role. Rendered by SessionGuard whenever there is no valid session, so it
 * does not need its own route.
 */
import React, { useState } from 'react';
import { login } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login(passcode);
      setSession(result.access_token, result.user);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not sign in. Please try again.');
      setPasscode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">Sign in</h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoFocus
            className="w-full bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
          />

          {error && <div className="text-red-400 text-sm text-center py-1">{error}</div>}

          <button
            type="submit"
            disabled={!passcode || submitting}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
