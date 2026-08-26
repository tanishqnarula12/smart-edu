import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Navbar } from './Navbar.jsx';
import { primaryNavigation, labelForPath } from './navigation.js';
import { useAuth } from '../context/AuthContext.jsx';
import { cn } from '../utils/cn.js';

/**
 * The shell every signed-in page renders inside (§47).
 *
 * Desktop  → fixed sidebar + content
 * Tablet   → collapsible sidebar
 * Mobile   → hamburger drawer + a bottom navigation bar
 */
export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { role } = useAuth();
  const { pathname } = useLocation();

  const bottomNav = primaryNavigation(role);

  // Close the drawer and scroll to the top whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Keep the document title in step with the page, for tab-switching and history.
  useEffect(() => {
    const label = labelForPath(role, pathname);
    document.title = label ? `${label} · Smart Edu` : 'Smart Edu';
  }, [role, pathname]);

  return (
    <div className="flex min-h-screen bg-surface-sunken">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />

        {/* Bottom padding on mobile clears the fixed bottom bar. */}
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/95 backdrop-blur-md sm:hidden"
        aria-label="Primary"
      >
        <div className="flex items-stretch justify-around">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2.5 text-[10px] font-medium transition',
                  isActive ? 'text-brand-600' : 'text-ink-subtle'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={19} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                  <span className="w-full truncate text-center">{item.label.split(' ')[0]}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
        {/* Respect the iOS home indicator. */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}

/** Standard page header — title, description and an optional action. */
export function PageHeader({ title, description, action, className, children }) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export default DashboardLayout;
