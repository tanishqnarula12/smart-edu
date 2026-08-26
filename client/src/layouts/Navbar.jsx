import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ChevronDown, User, Settings, LogOut, Moon, Sun, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useClickOutside, useEscapeKey } from '../hooks/useApi.js';
import { labelForPath, ROLE_LABELS } from './navigation.js';
import { GlobalSearch } from './GlobalSearch.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { Avatar, Breadcrumbs } from '../components/ui/Misc.jsx';
import { IconButton } from '../components/ui/Button.jsx';
import { cn } from '../utils/cn.js';

/** Top bar: menu toggle, breadcrumbs, search, theme, notifications, account. */
export function Navbar({ onMenuClick }) {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);
  useEscapeKey(() => setMenuOpen(false), menuOpen);

  const pageLabel = labelForPath(role, pathname);

  const crumbs = [
    { label: ROLE_LABELS[role] ?? 'Home', to: `/${role}/dashboard` },
    ...(pageLabel && pageLabel !== 'Dashboard' ? [{ label: pageLabel }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-raised/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <IconButton icon={Menu} label="Open menu" onClick={onMenuClick} className="lg:hidden" />

        <Breadcrumbs items={crumbs} className="hidden min-w-0 md:flex" />

        {/* On mobile the breadcrumb collapses to just the page name. */}
        <p className="truncate text-sm font-semibold text-ink md:hidden">{pageLabel ?? 'Smart Edu'}</p>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <GlobalSearch className="hidden w-56 sm:block lg:w-72" />

          <IconButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          />

          <NotificationBell />

          {/* Account menu */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-xl p-1 pr-1.5 transition hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
              <ChevronDown
                size={14}
                className={cn('text-ink-subtle transition-transform', menuOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-60 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-popover"
              >
                <div className="flex items-center gap-3 border-b border-line p-4">
                  <Avatar name={user?.name} src={user?.avatarUrl} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
                    <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                      {ROLE_LABELS[role]}
                    </p>
                  </div>
                </div>

                <div className="p-1.5">
                  <MenuLink to={`/${role}/profile`} icon={User} onClick={() => setMenuOpen(false)}>
                    My profile
                  </MenuLink>

                  {role === 'student' && (
                    <MenuLink
                      to="/student/privacy"
                      icon={ShieldCheck}
                      onClick={() => setMenuOpen(false)}
                    >
                      Privacy controls
                    </MenuLink>
                  )}

                  {role === 'admin' && (
                    <MenuLink to="/admin/settings" icon={Settings} onClick={() => setMenuOpen(false)}>
                      Settings
                    </MenuLink>
                  )}
                </div>

                <div className="border-t border-line p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 transition hover:bg-danger-50 dark:hover:bg-danger-500/10"
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search moves below the bar on the narrowest screens. */}
      <div className="border-t border-line px-4 py-2 sm:hidden">
        <GlobalSearch />
      </div>
    </header>
  );
}

function MenuLink({ to, icon: Icon, children, onClick }) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </Link>
  );
}

export default Navbar;
