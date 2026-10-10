// components/booker/ui.tsx
// Small shared building blocks for the Booking Agent workspace. They use the
// platform's global classes (styles/globals.css) so the workspace reads as the
// same product, and add the accessibility wiring the forms need.

import { useEffect, useId, useRef, type ReactNode } from 'react';

// ── Modal ───────────────────────────────────────────────────────────────────
interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider dialog for long forms */
  wide?: boolean;
}

/**
 * Accessible dialog: labelled by its title, closes on Escape or backdrop click,
 * moves focus inside on open and restores it to the trigger on close.
 */
export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ position: 'relative', maxWidth: wide ? 720 : 560, borderRadius: 'var(--radius)' }}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="modal-close" data-close aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Form field ──────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Render prop receives the id and aria props to spread on the control. */
  children: (control: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) => ReactNode;
}

/** Label + control + hint + error, programmatically associated. */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--accent)' }}> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" style={{ fontSize: '0.78rem', color: 'var(--red)', fontWeight: 700 }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ── Banners and states ──────────────────────────────────────────────────────
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="card"
      style={{ borderColor: 'rgba(240,104,95,0.5)', background: 'rgba(240,104,95,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}
    >
      <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem' }}>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
      <div className="display" style={{ fontSize: '1.6rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
        {title}
      </div>
      <p className="text-sm text-muted" style={{ maxWidth: 440, margin: '0 auto 1.25rem', lineHeight: 1.6 }}>
        {body}
      </p>
      {action}
    </div>
  );
}

/** Placeholder rows while data loads (anything over ~1s). */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-sm)' }} />
      ))}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/** A colored dot identifying a band across lists and the agenda. */
export function BandDot({ color, label }: { color: string | null; label?: string }) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: color ?? 'var(--accent)', flexShrink: 0 }}
    />
  );
}

/** Footer row for modal forms: cancel + submit with a busy state. */
export function FormActions({ busy, submitLabel, onCancel }: { busy: boolean; submitLabel: string; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
      <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}
