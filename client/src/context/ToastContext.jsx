import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

/** Toast notifications (§3). Auto-dismissing, stacked, keyboard-dismissible. */

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  success: 'border-success-500/30 bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500',
  error: 'border-danger-500/30 bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-500',
  warning: 'border-warning-500/30 bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-500',
  info: 'border-info-500/30 bg-info-50 text-info-700 dark:bg-info-500/10 dark:text-info-500',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message, { type = 'info', title, duration = 4500 } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, message, type, title }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show(message, { ...options, type: 'success' }),
      error: (message, options) => show(message, { ...options, type: 'error', duration: 6500 }),
      warning: (message, options) => show(message, { ...options, type: 'warning' }),
      info: (message, options) => show(message, { ...options, type: 'info' }),
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={`pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border p-3.5 shadow-popover backdrop-blur ${STYLES[toast.type]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                <p className="break-words text-sm">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}

export default ToastContext;
