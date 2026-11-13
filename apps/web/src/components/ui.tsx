import { AlertCircle, ArrowRight, Code2, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
/** The CodeLens mark: a lens in a rounded square, drawn in the current text colour. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo-mark">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <circle cx="12" cy="12" r="6.2" fill="var(--c-canvas)" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      <path d="M16.6 16.6 20 20" stroke="var(--c-canvas)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="CodeLens home">
      <LogoMark />
      {!compact && <span>CodeLens</span>}
    </Link>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
export function Loading({ label = 'Loading workspace…' }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="animate-spin" size={24} />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Something needs your attention</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <button className="btn-secondary mt-3" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel">
      <span className="empty-icon">
        <Code2 size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status-badge status-${value}`}>
      <i />
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      <span>{children}</span>
      <ArrowRight size={15} />
    </Link>
  );
}
