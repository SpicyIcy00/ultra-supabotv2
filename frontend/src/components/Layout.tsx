/**
 * Dashboard Layout with Sidebar and Header
 * Mobile: Bottom tab navigation (<768px)
 * Tablet: Slide-out sidebar (768-1023px)
 * Desktop: Persistent sidebar (>=1024px)
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';


interface LayoutProps {
  children: React.ReactNode;
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick?: () => void;
}

// Sidebar nav item (tablet/desktop)
function NavItem({ to, icon, label, isActive, onClick }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-500/10 text-blue-400'
          : 'text-gray-400 hover:text-white hover:bg-[#2e303d]'
      }`}
    >
      <div className="w-5 h-5">{icon}</div>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

// Bottom tab nav item (mobile only)
function MobileNavItem({ to, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-1 py-1 rounded-lg transition-colors ${
        isActive
          ? 'text-blue-400'
          : 'text-gray-500'
      }`}
    >
      <div className="w-6 h-6">{icon}</div>
      <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-blue-400' : 'text-gray-500'}`}>{label}</span>
    </Link>
  );
}

// Nav icon SVGs
const navIcons = {
  dashboard: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  analytics: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  chat: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  reports: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  settings: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  barcode: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 9V5a2 2 0 012-2h2M3 15v4a2 2 0 002 2h2m10-18h2a2 2 0 012 2v4m0 6v4a2 2 0 01-2 2h-2M9 7v10M12 7v10M15 7v10" />
    </svg>
  ),
};

const navItems = [
  { to: '/', icon: navIcons.dashboard, label: 'Dashboard', match: (p: string) => p === '/' },
  { to: '/analytics', icon: navIcons.analytics, label: 'Analytics', match: (p: string) => p === '/analytics' },
  { to: '/ai-chat', icon: navIcons.chat, label: 'AI Chat', match: (p: string) => p === '/ai-chat' },
  { to: '/reports/product-sales', icon: navIcons.reports, label: 'Reports', match: (p: string) => p === '/reports/product-sales' },
  { to: '/barcodes', icon: navIcons.barcode, label: 'Barcodes', match: (p: string) => p === '/barcodes' },
  { to: '/settings', icon: navIcons.settings, label: 'Settings', match: (p: string) => p === '/settings' },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  // Detect screen size: phone (<768), tablet (768-1023), desktop (>=1024)
  useEffect(() => {
    const checkScreen = () => {
      const width = window.innerWidth;
      const mobile = width < 1024;
      const phone = width < 768;
      setIsMobile(mobile);
      setIsPhone(phone);
      if (!mobile) {
        setSidebarOpen(true);
      }
    };

    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // Close sidebar on tablet when route changes
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  const handleNavClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1117] text-gray-100">
      {/* Overlay when sidebar is open (all non-phone sizes) */}
      {!isPhone && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on phone, slide-out on tablet, persistent on desktop */}
      {!isPhone && (
        <aside
          className={`fixed top-0 left-0 h-full w-64 bg-gray-900/95 border-r border-gray-800 backdrop-blur-sm transition-transform duration-300 z-30 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-6">
            {/* Logo + collapse button */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-white">Supabot</h1>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Navigation */}
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  isActive={item.match(location.pathname)}
                  onClick={handleNavClick}
                />
              ))}
            </nav>
          </div>

          {/* Footer */}
          <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-800">
            <div className="text-xs text-gray-500 text-center">
              Analytics Dashboard v1.0
            </div>
          </div>
        </aside>
      )}

      {/* Main Content — push right on desktop when sidebar open, full-width otherwise */}
      <div className={`transition-all duration-300 ${!isPhone && !isMobile && sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800">
          <div className="px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center justify-between">
              {/* Toggle Sidebar — hidden on phone (bottom nav handles it) */}
              {!isPhone ? (
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              ) : (
                <span className="text-sm font-bold text-white">Supabot</span>
              )}

            </div>
          </div>
        </header>

        {/* Page Content — extra bottom padding on phone for bottom nav */}
        <main className="p-3 sm:p-4 lg:p-6 pb-20 md:pb-6">{children}</main>
      </div>

      {/* Mobile Bottom Tab Navigation — phone only */}
      {isPhone && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => (
              <MobileNavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                isActive={item.match(location.pathname)}
              />
            ))}
          </div>
        </nav>
      )}

    </div>
  );
}
