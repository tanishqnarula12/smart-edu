import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button, IconButton } from './Button.jsx';
import { useEscapeKey } from '../../hooks/useApi.js';
import { cn } from '../../utils/cn.js';

/**
 * Modal, drawer and confirmation dialog.
 *
 * All three trap focus, restore it on close, lock body scroll and close on
 * Escape — the things that make an overlay usable with a keyboard.
 */

function useOverlayBehaviour(isOpen, onClose) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEscapeKey(() => onClose?.(), isOpen);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;

    // Compensate for the scrollbar so the page does not jump on open.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPadding = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    // Move focus into the panel so the next Tab stays inside it.
    const focusTimer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? panelRef.current)?.focus();
    }, 40);

    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  return panelRef;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  className,
}) {
  const panelRef = useOverlayBehaviour(isOpen, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            'relative w-full animate-scale-in rounded-t-2xl bg-surface-raised shadow-panel sm:rounded-2xl',
            SIZES[size],
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line p-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close dialog" size="sm" onClick={onClose} />
          </div>

          <div className="scrollbar-slim max-h-[70vh] overflow-y-auto p-5">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken/50 p-4 sm:rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Side panel — better than a modal for detail views and long forms. */
export function Drawer({ isOpen, onClose, title, description, children, footer, width = 'max-w-md' }) {
  const panelRef = useOverlayBehaviour(isOpen, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col bg-surface-raised shadow-panel',
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close panel" size="sm" onClick={onClose} />
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken/50 p-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Confirmation before anything destructive (§3). */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isPending = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            variant === 'danger'
              ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10'
              : 'bg-warning-50 text-warning-600 dark:bg-warning-500/10'
          )}
        >
          <AlertTriangle size={19} aria-hidden="true" />
        </span>
        <p className="pt-1.5 text-sm text-ink-muted">{message}</p>
      </div>
    </Modal>
  );
}

export default Modal;
