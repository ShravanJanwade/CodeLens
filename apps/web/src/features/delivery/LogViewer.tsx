import { useMemo, useState } from 'react';
import { Check, Copy, Search } from 'lucide-react';

/**
 * A job's log with line numbers, severity colouring and the lines the
 * diagnosis quoted highlighted in place, so the verdict can be checked
 * against the evidence rather than taken on faith.
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

  // A signal's detail is the trimmed log line it matched.
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
  const numbered = lines.map((text, index) => ({ text, n: index + 1 }));
  const visible = needle ? numbered.filter((l) => l.text.toLowerCase().includes(needle)) : numbered;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable in embedded contexts; the text stays selectable.
    }
  };

  return (
    <div className="logv">
      <div className="logv-bar">
        <span className="muted text-xs">
          {needle ? `${visible.length} of ${lines.length} lines` : `${lines.length} lines`}
          {evidenceSet.size > 0 && ' · highlighted lines are the evidence the diagnosis quotes'}
        </span>
        <div className="spacer" />
        <div className="search" style={{ width: 200 }}>
          <Search size={13} />
          <input
            className="input"
            style={{ height: 28 }}
            placeholder={`Filter ${stageName} log`}
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
          {visible.map((line) => (
            <div
              key={line.n}
              className={`logv-line is-${classify(line.text)} ${isEvidence(line.text) ? 'is-evidence' : ''}`}
            >
              <span className="logv-n">{line.n}</span>
              <span className="logv-t">{line.text || ' '}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
