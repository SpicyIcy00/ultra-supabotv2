/**
 * Username + password login.
 *
 * Rendered by SessionGuard whenever there is no valid session, so it does not
 * need its own route.
 */
import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { login } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await login(username, password);
      setSession(result.access_token, result.user);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not sign in. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 mb-5">
            <LogIn className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Sign in</h1>
          <p className="text-sm text-gray-400">Supabot Warehouse</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            className="w-full bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
          />

          {error && (
            <div className="text-red-400 text-sm text-center py-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={!username || !password || submitting}
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
