// Formatting helpers shared across the delivery views. Centralised so
// a duration reads identically on a flow node, a table row and a
// metric tile.

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Sub-millisecond values are real here, so do not round them to zero. */
export function micros(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  return `${Math.round(ms)}ms`;
}

/**
 * Cascading divisors rather than absolute thresholds. Each `amount`
 * is how many of this unit make up the next one, so the loop divides
 * down until the value fits — which is what stops a two-hour-old run
 * being reported as "160 minutes ago".
 */
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  let value = (then - Date.now()) / 1000;
  if (Math.abs(value) < 45) return 'just now';

  for (const division of DIVISIONS) {
    if (Math.abs(value) < division.amount) return rtf.format(Math.round(value), division.unit);
    value /= division.amount;
  }
  return new Date(then).toLocaleDateString();
}

export function absolute(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pct(value: number | null | undefined, places = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(places)}%`;
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Maps a stage or run status onto the design system's signal tokens. */
export function tone(status: string): 'pass' | 'fail' | 'warn' | 'run' | 'idle' | 'info' {
  switch (status) {
    case 'success':
    case 'live':
    case 'healthy':
    case 'passing':
      return 'pass';
    case 'failed':
    case 'down':
    case 'failing':
    case 'rolled-back':
      return 'fail';
    case 'degraded':
    case 'blocked':
    case 'cancelled':
    case 'canary':
      return 'warn';
    case 'running':
    case 'deploying':
    case 'queued':
      return 'run';
    case 'superseded':
      return 'info';
    default:
      return 'idle';
  }
}

export const STATUS_LABEL: Record<string, string> = {
  success: 'Passed',
  failed: 'Failed',
  running: 'Running',
  queued: 'Queued',
  pending: 'Pending',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
};

export const TRIGGER_LABEL: Record<string, string> = {
  push: 'Push',
  pull_request: 'Pull request',
  manual: 'Manual',
  schedule: 'Scheduled',
  revert: 'Revert',
  rollback: 'Rollback',
};

/** Shortens a path for display without losing the filename. */
export function shortPath(path: string, segments = 2): string {
  const parts = path.split('/');
  if (parts.length <= segments + 1) return path;
  return `…/${parts.slice(-segments).join('/')}`;
}

export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}
