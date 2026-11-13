import { useMemo } from 'react';
import { ExternalLink, GitPullRequestArrow, Wrench } from 'lucide-react';
import { Dialog } from '../../components/overlay';
import { useFixPreview, useOpenFix } from './actions';
import type { FixPreview } from './types';
import { ActionButton, type useAccessGate } from './ui';

// ---- Diff --------------------------------------------------------------

type Line = { kind: 'same' | 'add' | 'del'; text: string; a?: number; b?: number };

/** Line diff by longest common subsequence: plenty for config and test files. */
export function diffLines(before: string, after: string): Line[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Removals before additions, as review tools show a change.
      out.push({ kind: 'del', text: a[i], a: i + 1 });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j], b: j + 1 });
      j++;
    }
  }
  return out;
}

/** Only the changed lines and three either side, like a review tool shows them. */
function hunks(lines: Line[], context = 3): (Line | 'gap')[] {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === 'same') return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++)
      keep.add(k);
  });
  const out: (Line | 'gap')[] = [];
  let last = -1;
  for (const index of [...keep].sort((x, y) => x - y)) {
    if (last !== -1 && index > last + 1) out.push('gap');
    out.push(lines[index]);
    last = index;
  }
  return out;
}

export function DiffView({ path, before, after }: { path: string; before: string; after: string }) {
  const rows = useMemo(() => hunks(diffLines(before, after)), [before, after]);
  const added = rows.filter((r) => r !== 'gap' && r.kind === 'add').length;
  const removed = rows.filter((r) => r !== 'gap' && r.kind === 'del').length;
  return (
    <div className="diff">
      <div className="diff-hd">
        <span className="mono">{path}</span>
        <span className="diff-stat">
          <span className="tone-pass">+{added}</span> <span className="tone-fail">−{removed}</span>
        </span>
      </div>
      <table className="diff-body">
        <tbody>
          {rows.map((row, index) =>
            row === 'gap' ? (
              <tr key={`gap-${index}`} className="diff-gap">
                <td colSpan={3}>⋯</td>
              </tr>
            ) : (
              <tr key={index} className={`diff-${row.kind}`}>
                <td className="diff-num">{row.a ?? ''}</td>
                <td className="diff-num">{row.b ?? ''}</td>
                <td className="diff-text">
                  <span className="diff-sign">
                    {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                  </span>
                  {row.text || ' '}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Dialog --------------------------------------------------------------

export type FixRequest = { kind: FixPreview['kind']; runNumber?: number; test?: string };

export default function FixDialog({
  repositoryId,
  fix,
  gate,
  onClose,
}: {
  repositoryId: string;
  fix: FixRequest | null;
  gate: ReturnType<typeof useAccessGate>;
  onClose: () => void;
}) {
  const preview = useFixPreview(repositoryId, fix);
  const open = useOpenFix(repositoryId);
  const data = preview.data;

  return (
    <Dialog
      open={Boolean(fix)}
      onClose={onClose}
      wide
      icon={<Wrench size={16} />}
      title={data?.title ?? (preview.error ? 'No fix to open' : 'Preparing the fix')}
      description={
        data ? (
          <>
            {data.summary} A pull request from <span className="mono">{data.branch}</span> into{' '}
            <span className="mono">{data.baseBranch}</span>, opened as you; nothing changes until it is
            merged.
          </>
        ) : preview.error ? (
          'CodeLens checked the files at the head of the default branch against what the diagnosis found.'
        ) : (
          'CodeLens reads the files at the head of the default branch and drafts the change.'
        )
      }
      footer={
        <>
          <span className="dialog-note">CI runs on the pull request before anyone merges it.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            gate={gate}
            className="btn btn-primary btn-sm"
            busy={open.isPending}
            disabled={!data}
            onClick={() =>
              fix && data && open.mutate({ ...fix, baseSha: data.baseSha }, { onSuccess: () => onClose() })
            }
          >
            {!open.isPending && <GitPullRequestArrow size={14} />} Open pull request
          </ActionButton>
        </>
      }
    >
      {preview.isLoading && <div className="skeleton" style={{ height: 180 }} />}
      {preview.error && (
        <div className="alert alert-warn">
          <Wrench size={16} />
          <div>
            <strong>No change to propose</strong>
            <p>{preview.error.message}</p>
          </div>
        </div>
      )}
      {data && (
        <div className="stack-4">
          {data.changes.map((change) => (
            <DiffView key={change.path} {...change} />
          ))}
          <details className="pr-body">
            <summary>Pull request description</summary>
            <pre>{data.body}</pre>
          </details>
          {open.data?.url && (
            <a className="link" href={open.data.url} target="_blank" rel="noreferrer">
              View the pull request <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </Dialog>
  );
}
