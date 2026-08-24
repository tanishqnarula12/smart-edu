import { NavLink, Link } from 'react-router-dom';
import { GraduationCap, LogOut, X, Sparkles } from 'lucide-react';
import { NAVIGATION, ROLE_LABELS } from './navigation.js';
import { useAuth, dashboardPathFor } from '../context/AuthContext.jsx';
import { Avatar } from '../components/ui/Misc.jsx';
import { IconButton } from '../components/ui/Button.jsx';
import { cn } from '../utils/cn.js';

/**
 * Sidebar (§44).
 *
 * One component serves both the fixed desktop rail and the mobile slide-over;
 * `isOpen`/`onClose` only affect the mobile presentation.
 */
export function Sidebar({ isOpen, onClose }) {
  const { user, role, logout } = useAuth();
  const items = NAVIGATION[role] ?? [];

  const handleNavigate = () => {
    // On mobile the drawer must close when a destination is chosen.
    if (window.innerWidth < 1024) onClose?.();
  };

  const content = (
    <div className="flex h-full flex-col bg-surface-raised">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Link
          to={dashboardPathFor(role)}
          className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2"
          onClick={handleNavigate}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
            <GraduationCap size={19} aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-ink">Smart Edu</span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </Link>

        <IconButton icon={X} label="Close menu" size="sm" onClick={onClose} className="lg:hidden" />
      </div>

      {/* Links */}
      <nav className="scrollbar-slim flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
        {items.map((item, index) =>
          item.section ? (
            <p
              key={`section-${item.section}-${index}`}
              className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
              {item.section}
            </p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    size={18}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-subtle group-hover:text-ink-muted'
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                  {item.highlight && !isActive && (
                    <Sparkles size={13} className="ml-auto shrink-0 text-brand-400" aria-hidden="true" />
                  )}
                </>
              )}
            </NavLink>
          )
        )}
      </nav>

      {/* Account */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-ink-muted">{user?.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10"
        >
          <LogOut size={18} className="shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">
        <div className="fixed inset-y-0 left-0 w-64">{content}</div>
      </aside>

      {/* Mobile slide-over */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-left shadow-panel">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

export default Sidebar;
