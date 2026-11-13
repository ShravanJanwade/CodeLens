import { useState, type ReactNode } from 'react';
import {
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleSlash,
  CircleX,
  Github,
  LoaderCircle,
  Lock,
  MinusCircle,
} from 'lucide-react';
import { Dialog } from '../../components/overlay';
import { signInToActHref, useActionAccess } from './actions';
import type { ActionAccess } from './types';
import { absolute, relative } from './format';

// ---- Status ----------------------------------------------------------

const STATUS: Record<string, { icon: typeof CircleCheck; tone: string; label: string; spin?: boolean }> = {
  success: { icon: CircleCheck, tone: 'pass', label: 'Passed' },
  failed: { icon: CircleX, tone: 'fail', label: 'Failed' },
  running: { icon: LoaderCircle, tone: 'run', label: 'In progress', spin: true },
  queued: { icon: CircleDashed, tone: 'idle', label: 'Queued' },
  pending: { icon: CircleDashed, tone: 'idle', label: 'Pending' },
  blocked: { icon: CirclePause, tone: 'warn', label: 'Waiting' },
  skipped: { icon: MinusCircle, tone: 'idle', label: 'Skipped' },
  cancelled: { icon: CircleSlash, tone: 'idle', label: 'Cancelled' },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}

export function StatusIcon({ status, size = 16 }: { status: string; size?: number }) {
  const s = STATUS[status] ?? STATUS.pending;
  const Icon = s.icon;
  return (
    <Icon
      size={size}
      className={`status-icon tone-${s.tone} ${s.spin ? 'animate-spin' : ''}`}
      aria-label={s.label}
      role="img"
    />
  );
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <span className={`status-pill tone-${s.tone}`}>
      <StatusIcon status={status} size={13} />
      {label ?? s.label}
    </span>
  );
}

// ---- Small facts -------------------------------------------------------

export function Sha({ sha, repo }: { sha: string; repo?: string | null }) {
  const short = sha.slice(0, 7);
  return repo ? (
    <a className="sha" href={`https://github.com/${repo}/commit/${sha}`} target="_blank" rel="noreferrer">
      {short}
    </a>
  ) : (
    <span className="sha">{short}</span>
  );
}

export function Ago({ iso }: { iso: string | null | undefined }) {
  return (
    <time dateTime={iso ?? undefined} title={absolute(iso)}>
      {relative(iso)}
    </time>
  );
}

// ---- Access ------------------------------------------------------------

/**
 * Wraps actions in the visitor's access. `run(fn)` acts when the person
 * may; otherwise it explains why not and how to fix that, instead of a
 * button that does nothing.
 */
export function useAccessGate(repositoryId: string) {
  const access = useActionAccess(repositoryId);
  const [explaining, setExplaining] = useState(false);
  const run = (fn: () => void) => () => (access.data?.canAct ? fn() : setExplaining(true));
  const dialog = (
    <AccessDialog access={access.data ?? null} open={explaining} onClose={() => setExplaining(false)} />
  );
  return { access: access.data ?? null, canAct: Boolean(access.data?.canAct), run, dialog };
}

function AccessDialog({
  access,
  open,
  onClose,
}: {
  access: ActionAccess | null;
  open: boolean;
  onClose: () => void;
}) {
  const needsSignIn = !access?.github || access.reason?.startsWith('Reconnect');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Lock size={16} />}
      title="Maintainers only"
      description={access?.reason ?? 'Pipeline actions are for maintainers of this repository.'}
      footer={
        <>
          <span className="dialog-note">
            CodeLens acts with your own GitHub account, so GitHub decides what you may change.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          {needsSignIn && (
            <a className="btn btn-primary btn-sm" href={signInToActHref()}>
              <Github size={14} /> Sign in with GitHub
            </a>
          )}
        </>
      }
    >
      <ul className="access-list">
        <li>Viewing runs, logs and diagnoses is open to everyone.</li>
        <li>
          Re-running jobs, redeploying, approving releases and opening fix pull requests needs a GitHub
          account that can write to the repository.
        </li>
        <li>Every action is recorded with who ran it, in CodeLens and on GitHub.</li>
      </ul>
    </Dialog>
  );
}

/** A button that runs an action, or explains why it can't. */
export function ActionButton({
  gate,
  onClick,
  children,
  className = 'btn btn-secondary btn-sm',
  busy = false,
  disabled = false,
  title,
}: {
  gate: ReturnType<typeof useAccessGate>;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const locked = !gate.canAct;
  return (
    <button
      type="button"
      className={`${className} ${locked ? 'is-locked' : ''}`}
      onClick={gate.run(onClick)}
      disabled={busy || disabled}
      title={title}
      aria-describedby={undefined}
    >
      {busy ? <LoaderCircle size={14} className="animate-spin" /> : locked ? <Lock size={13} /> : null}
      {children}
    </button>
  );
}
