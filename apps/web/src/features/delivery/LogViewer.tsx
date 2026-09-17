import { useMemo, useState } from 'react';
import { Check, Copy, Search, Terminal } from 'lucide-react';

/**
 * Stage log with line numbers, severity colouring and evidence
 * highlighting.
 *
 * The evidence part matters: the diagnosis quotes specific log lines
 * as signals, and highlighting those exact lines here is what lets a
 * reader verify the verdict instead of taking it on faith.
 */
export interface LogViewerProps {
  log: string;
  stageName: string;
  /** Signal details quoted by the diagnosis, highlighted in place. */
  evidence?: string[];
}

type LineKind = 'plain' | 'error' | 'warn' | 'group' | 'pass';

function classify(line: string): LineKind {
  if (/^##\[error\]|^\s*error[:\s]|\berror\b.*exit code|FATAL|✕|✗|denied|failed/i.test(line)) return 'error';
  if (/^##\[warning\]|^npm WARN|\bWARN\b|Waiting for/i.test(line)) return 'warn';
  if (/^##\[(group|endgroup)\]/.test(line)) return 'group';
  if (/^\s*✓|successfully rolled out|Done in|passed|No known vulnerabilities|all checks green/i.test(line))
    return 'pass';
  return 'plain';
}

export default function LogViewer({ log, stageName, evidence = [] }: LogViewerProps) {
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => log.split('\n'), [log]);

  // A signal's detail is the trimmed log line it matched, so compare
  // on trimmed text rather than trying to re-run the patterns here.
  const evidenceSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of evidence) {
      const trimmed = item.trim().replace(/\.\.\.$/, '');
      if (trimmed.length > 12) set.add(trimmed);
    }
    return set;
  }, [evidence]);

  const isEvidence = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    for (const item of evidenceSet) if (trimmed.startsWith(item) || item.startsWith(trimmed)) return true;
    return false;
  };

  const needle = filter.trim().toLowerCase();
  const visible = needle ? lines.filter((l) => l.toLowerCase().includes(needle)) : lines;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable in some embedded contexts; the log is
      // selectable either way, so there is nothing useful to report.
    }
  };

  return (
    <div className="logv">
      <div className="logv-bar">
        <Terminal size={13} className="muted" />
        <strong>{stageName}</strong>
        <span className="muted">
          {needle ? `${visible.length} of ${lines.length}` : `${lines.length}`} lines
        </span>
        <div className="spacer" />
        <div className="search" style={{ width: 178 }}>
          <Search size={13} />
          <input
            className="input"
            style={{ height: 26, fontSize: 12 }}
            placeholder="Filter log"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter log lines"
          />
        </div>
        <button type="button" className="icon-btn icon-btn-sm" onClick={copy} aria-label="Copy log">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="logv-empty">No lines match “{filter}”.</p>
      ) : (
        <pre className="logv-body">
          {visible.map((line, index) => (
            <div
              key={`${index}-${line.slice(0, 24)}`}
              className={`logv-line is-${classify(line)} ${isEvidence(line) ? 'is-evidence' : ''}`}
            >
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
