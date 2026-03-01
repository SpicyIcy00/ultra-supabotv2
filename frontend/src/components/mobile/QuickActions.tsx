import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const QuickActions: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setIsPhone(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isPhone) return null;

  const actions = [
    {
      label: "Today's Sales",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      action: () => navigate('/'),
    },
    {
      label: 'Ask AI',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      action: () => navigate('/ai-chat'),
    },
    {
      label: 'Reports',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      action: () => navigate('/reports/product-sales'),
    },
    {
      label: 'Analytics',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      action: () => navigate('/analytics'),
    },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Action buttons */}
      {isOpen && (
        <div className="fixed bottom-36 right-4 z-50 flex flex-col gap-3 items-end">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                action.action();
                setIsOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1c1e26] border border-[#2e303d] rounded-full shadow-lg text-white text-sm font-medium hover:bg-[#2e303d] transition-colors"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#00d2ff] to-[#3a47d5] shadow-lg flex items-center justify-center transition-transform duration-200"
        style={{
          marginBottom: 'env(safe-area-inset-bottom)',
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </>
  );
};
