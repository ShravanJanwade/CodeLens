import { useEffect, useMemo, useState } from 'react';
import type { Stage } from './types';
import { duration } from './format';
import { StatusIcon } from './ui';

// ============================================================
// Layout
// ============================================================
// Positions are a pure function of (sequence, lane): fixed node sizes
// give a stable layout and correct edges on first paint, with no
// measuring.

const NODE_W = 212;
const NODE_H = 56;
const COL_GAP = 44;
const ROW_GAP = 10;
const TOP = 24;

const x = (sequence: number) => sequence * (NODE_W + COL_GAP);
const y = (lane: number) => TOP + lane * (NODE_H + ROW_GAP);

const PHASE: Record<string, string> = {
  checkout: 'Source',
  build: 'Build',
  test: 'Test',
  scan: 'Scan',
  package: 'Package',
  approval: 'Approval',
  deploy: 'Deploy',
  verify: 'Verify',
  rollback: 'Rollback',
};

function phaseLabel(stages: Stage[]): string {
  if (stages.some((s) => isBake(s))) return 'Bake';
  const kinds = [...new Set(stages.map((s) => s.kind))];
  return kinds.length === 1 ? (PHASE[kinds[0]] ?? 'Jobs') : 'Checks';
}

export const isBake = (stage: Pick<Stage, 'name' | 'kind'>) =>
  stage.kind === 'verify' && /\bbake\b|\bsoak/i.test(stage.name);

export function bakeTarget(stage: Stage): number | null {
  const minutes = (stage.summary as { bakeMinutes?: unknown }).bakeMinutes;
  return typeof minutes === 'number' ? minutes : null;
}

/** Re-renders every second while something is moving. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The second line of a node: what this job did, or is doing. */
function detail(stage: Stage, now: number): { text: string; tone?: string; progress?: number } | null {
  const s = stage.summary as Record<string, number | string | undefined>;
  if (stage.status === 'blocked') return { text: 'Waiting for approval', tone: 'warn' };
  if (isBake(stage)) {
    const target = bakeTarget(stage);
    if (stage.status === 'running' && stage.startedAt) {
      const elapsed = now - Date.parse(stage.startedAt);
      return target
        ? {
            text: `${clock(elapsed)} of ${clock(target * 60_000)}`,
            progress: Math.min(0.99, elapsed / (target * 60_000)),
          }
        : { text: `Baking ${clock(elapsed)}` };
    }
    if (stage.status === 'success') return { text: `Healthy for ${duration(stage.durationMs)}` };
    if (target !== null && stage.status !== 'skipped') return { text: `${target} min in staging` };
  }
  if (stage.status === 'cancelled' && /rejected/i.test(stage.log)) return { text: 'Rejected', tone: 'fail' };
  if (stage.environment) return { text: stage.environment.regionLabel || stage.environment.region };
  if (stage.kind === 'test' && (s.testsFailed || s.testsPassed)) {
    return s.testsFailed
      ? { text: `${s.testsFailed} failed · ${s.testsPassed ?? 0} passed`, tone: 'fail' }
      : { text: `${s.testsPassed} passed` };
  }
  if (stage.status === 'failed' && typeof s.failedStep === 'string')
    return { text: s.failedStep, tone: 'fail' };
  if (stage.attempts > 1) return { text: `Attempt ${stage.attempts}` };
  return null;
}

export interface PipelineFlowProps {
  stages: Stage[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** The stage the diagnosis points at. */
  blamedKey?: string | null;
}

export default function PipelineFlow({ stages, selectedKey, onSelect, blamedKey }: PipelineFlowProps) {
  const moving = stages.some((s) => s.status === 'running');
  const now = useNow(moving);

  const layout = useMemo(() => {
    const byKey = new Map(stages.map((s) => [s.key, s]));
    const maxSequence = Math.max(0, ...stages.map((s) => s.sequence));
    const maxLane = Math.max(0, ...stages.map((s) => s.lane));
    const edges = stages.flatMap((target) =>
      target.dependsOn
        .map((key) => byKey.get(key))
        .filter((source): source is Stage => Boolean(source))
        .map((source) => ({ source, target })),
    );
    const columns = [...new Set(stages.map((s) => s.sequence))]
      .sort((a, b) => a - b)
      .map((sequence) => ({ sequence, label: phaseLabel(stages.filter((s) => s.sequence === sequence)) }));
    return { byKey, edges, columns, width: x(maxSequence) + NODE_W, height: y(maxLane) + NODE_H };
  }, [stages]);

  // Selecting a job dims everything not on its path, but keeps its
  // siblings lit: when one region fails, its peers are the comparison.
  const onPath = useMemo(() => {
    if (!selectedKey) return null;
    const { byKey } = layout;
    const keep = new Set<string>([selectedKey]);
    const up = (key: string) => {
      for (const dep of byKey.get(key)?.dependsOn ?? []) {
        if (keep.has(dep)) continue;
        keep.add(dep);
        up(dep);
      }
    };
    const down = (key: string) => {
      for (const stage of stages) {
        if (!stage.dependsOn.includes(key) || keep.has(stage.key)) continue;
        keep.add(stage.key);
        down(stage.key);
      }
    };
    up(selectedKey);
    down(selectedKey);
    const selected = byKey.get(selectedKey);
    if (selected) for (const stage of stages) if (stage.sequence === selected.sequence) keep.add(stage.key);
    return keep;
  }, [selectedKey, layout, stages]);

  return (
    <div className="flow-scroll">
      <div className="flow-canvas" style={{ width: layout.width, height: layout.height }}>
        {layout.columns.map((column) => (
          <span key={column.sequence} className="flow-phase" style={{ left: x(column.sequence) }}>
            {column.label}
          </span>
        ))}
        <svg className="flow-edges" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map(({ source, target }) => {
            const x1 = x(source.sequence) + NODE_W;
            const y1 = y(source.lane) + NODE_H / 2;
            const x2 = x(target.sequence);
            const y2 = y(target.lane) + NODE_H / 2;
            const mid = x1 + (x2 - x1) / 2;
            const muted = onPath && !(onPath.has(source.key) && onPath.has(target.key));
            // Orthogonal connectors with rounded corners read as a pipeline, not a mind map.
            const r = Math.min(8, Math.abs(y2 - y1) / 2);
            const d =
              y1 === y2
                ? `M ${x1} ${y1} H ${x2}`
                : `M ${x1} ${y1} H ${mid - r} Q ${mid} ${y1} ${mid} ${y1 + Math.sign(y2 - y1) * r} V ${y2 - Math.sign(y2 - y1) * r} Q ${mid} ${y2} ${mid + r} ${y2} H ${x2}`;
            return (
              <path
                key={`${source.key}->${target.key}`}
                className={`flow-edge e-${target.status} ${muted ? 'is-muted' : ''}`}
                d={d}
              />
            );
          })}
        </svg>
        {stages.map((stage) => {
          const muted = onPath && !onPath.has(stage.key);
          const info = detail(stage, now);
          return (
            <button
              type="button"
              key={stage.key}
              className={`node s-${stage.status} ${selectedKey === stage.key ? 'is-selected' : ''} ${muted ? 'is-muted' : ''} ${blamedKey === stage.key ? 'is-blamed' : ''}`}
              style={{ left: x(stage.sequence), top: y(stage.lane), width: NODE_W, height: NODE_H }}
              onClick={() => onSelect(stage.key)}
              aria-pressed={selectedKey === stage.key}
              aria-label={`${stage.name}: ${stage.status}`}
            >
              <StatusIcon status={stage.status} size={15} />
              <span className="node-main">
                <span className="node-name">{stage.name}</span>
                {info && (
                  <span className={`node-sub ${info.tone ? `tone-${info.tone}` : ''}`}>{info.text}</span>
                )}
              </span>
              <span className="node-time">
                {stage.status === 'running' && stage.startedAt
                  ? clock(now - Date.parse(stage.startedAt))
                  : stage.status === 'skipped' || stage.status === 'blocked'
                    ? ''
                    : duration(stage.durationMs)}
              </span>
              {info?.progress !== undefined && (
                <span className="node-progress" style={{ width: `${info.progress * 100}%` }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
