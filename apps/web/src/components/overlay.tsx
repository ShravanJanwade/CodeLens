import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, ExternalLink, X } from 'lucide-react';

// ============================================================
// Toasts
// ============================================================
// Short confirmations of what an action did, with a link to where it
// happened. Announced politely, dismissed on their own after a while.

interface Toast {
  id: number;
  tone: 'pass' | 'fail';
  title: string;
  href?: string;
}

type Push = (toast: Omit<Toast, 'id'>) => void;
const ToastContext = createContext<Push>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>(
    (toast) => {
      const id = next.current++;
      setToasts((list) => [...list.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'fail' ? 9000 : 6000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast is-${toast.tone}`}>
            {toast.tone === 'pass' ? <CircleCheck size={16} /> : <CircleX size={16} />}
            <div className="toast-body">
              <div>{toast.title}</div>
              {toast.href && (
                <a className="link text-xs" href={toast.href} target="_blank" rel="noreferrer">
                  Open on GitHub <ExternalLink size={11} />
                </a>
              )}
            </div>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ============================================================
// Dialog
// ============================================================
// The native <dialog> element: focus is trapped, Escape closes it and
// the rest of the page is inert while it is open.

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'is-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="dialog-hd">
            {icon && <span className="dialog-icon">{icon}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          {children && <div className="dialog-bd">{children}</div>}
          {footer && <div className="dialog-ft">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// ============================================================
// Menu
// ============================================================

export function Menu({
  label,
  children,
  align = 'end',
  className = 'btn btn-secondary btn-sm',
  disabled,
  tip,
  ariaLabel,
}: {
  label: ReactNode;
  ariaLabel?: string;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  disabled?: boolean;
  tip?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  // The menu is portalled and fixed, so a scrolling table or a clipped
  // panel never cuts it off. It opens above the button near the bottom
  // of the window.
  const position = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom > 220;
    const top = below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - (menu.current?.offsetHeight ?? 160));
    setPlace(align === 'end' ? { top, right: window.innerWidth - rect.right } : { top, left: rect.left });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    position();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, position]);

  // Keyboard users land on the first item.
  useEffect(() => {
    if (open && place) menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open, place]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-disabled={disabled || undefined}
        data-tip={disabled ? tip : undefined}
        data-tip-align="end"
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            className="menu"
            style={{
              position: 'fixed',
              visibility: place ? 'visible' : 'hidden',
              ...(place ?? { top: 0, left: 0 }),
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onSelect,
  disabled,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onSelect} disabled={disabled}>
      {icon}
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}
