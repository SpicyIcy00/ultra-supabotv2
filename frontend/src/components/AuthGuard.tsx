
import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

interface AuthGuardProps {
    children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    // You can change this code to whatever you want for your private access
    // In a real production app, this should be an environment variable
    // but for simple access control, this works fine.
    const ACCESS_CODE = import.meta.env.VITE_ACCESS_CODE || 'supabot123';

    useEffect(() => {
        // Check if previously authenticated
        const authStatus = localStorage.getItem('bi_dashboard_auth');
        if (authStatus === 'true') {
            setIsAuthenticated(true);
        }
        setLoading(false);
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === ACCESS_CODE) {
            setIsAuthenticated(true);
            localStorage.setItem('bi_dashboard_auth', 'true');
            setError('');
        } else {
            setError('Incorrect access code');
            setPassword('');
            // Shake animation ref could go here
        }
    };

    const _handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('bi_dashboard_auth');
    };

    if (loading) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>;
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none"></div>
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>

                <div className="flex flex-col items-center max-w-md w-full z-10">
                    <div className="mb-8 relative">
                        <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full"></div>
                        <div className="relative bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-2xl">
                            <Lock className="w-10 h-10 text-blue-400" />
                        </div>
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Private Access</h1>
                    <p className="text-slate-400 mb-8 text-center max-w-xs">
                        This dashboard is private. Please enter the access code to view analytics.
                    </p>

                    <form onSubmit={handleLogin} className="w-full">
                        <div className="relative mb-4 group">
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter Access Code"
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-5 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-center tracking-widest"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm mb-4 text-center font-medium animate-pulse">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!password}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Unlock Dashboard
                        </button>
                    </form>

                    <p className="mt-8 text-xs text-slate-600 uppercase tracking-widest font-semibold">
                        Secured by Supabot
                    </p>
                </div>
            </div>
        );
    }

    // Pass logout handler to children if needed, or expose via context
    return <>{children}</>;
}
