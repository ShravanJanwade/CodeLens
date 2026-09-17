import { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  GitBranch,
  Hammer,
  Package,
  Rocket,
  ShieldCheck,
  TestTube2,
  Undo2,
  UserCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Stage, StageKind } from './types';
import { duration } from './format';

// ============================================================
// Layout
// ============================================================
// Positions are computed rather than measured: the node size is
// fixed, so a pure function of (sequence, lane) gives a stable
// layout with no ResizeObserver, no reflow thrash, and edges that
// are correct on first paint.

const NODE_W = 216;
const NODE_H = 86;
const COL_GAP = 62;
const ROW_GAP = 18;

const x = (sequence: number) => sequence * (NODE_W + COL_GAP);
const y = (lane: number) => lane * (NODE_H + ROW_GAP);

const KIND_ICON: Record<StageKind, typeof GitBranch> = {
  checkout: GitBranch,
  build: Hammer,
  test: TestTube2,
  scan: ShieldCheck,
  package: Package,
  approval: UserCheck,
  deploy: Rocket,
  verify: Activity,
  rollback: Undo2,
};

/** Column headings: the phase each DAG level represents. */
function columnLabel(stages: Stage[]): string {
  const kinds = [...new Set(stages.map((s) => s.kind))];
  if (kinds.length === 1) {
    return {
      checkout: 'Source',
      build: 'Build',
      test: 'Test',
      scan: 'Verify',
      package: 'Artifact',
      approval: 'Gate',
      deploy: 'Deploy',
      verify: 'Validate',
      rollback: 'Rollback',
    }[kinds[0]];
  }
  return 'Checks';
}

function edgeTone(target: Stage): string {
  switch (target.status) {
    case 'failed':
      return 'is-fail';
    case 'running':
      return 'is-run';
    case 'skipped':
    case 'pending':
    case 'cancelled':
      return 'is-skip';
    case 'success':
      return 'is-pass';
    default:
      return '';
  }
}

/** Chips summarising what a stage actually did. */
function chips(stage: Stage): { text: string; kind?: string }[] {
  const out: { text: string; kind?: string }[] = [];
  const s = stage.summary as Record<string, number | undefined>;

  if (stage.environment) {
    out.push({ text: stage.environment.region, kind: 'is-region' });
  }

  switch (stage.kind) {
    case 'test': {
      if (s.testsFailed) out.push({ text: `${s.testsFailed} failed`, kind: 'is-fail' });
      if (s.testsPassed) out.push({ text: `${s.testsPassed} passed` });
      break;
    }
    case 'package':
      if (s.imageSizeMb) out.push({ text: `${s.imageSizeMb}MB` });
      break;
    case 'scan':
      if (stage.status === 'success') out.push({ text: '0 vulnerabilities' });
      break;
    case 'deploy':
      if (s.replicasDesired !== undefined)
        out.push({
          text: `${s.replicasReady ?? 0}/${s.replicasDesired} replicas`,
          kind: (s.replicasReady ?? 0) < (s.replicasDesired ?? 0) ? 'is-fail' : undefined,
        });
      break;
    case 'approval':
      if (stage.status === 'success') out.push({ text: 'Approved', kind: 'is-approval' });
      break;
    case 'verify':
      if (s.checks) out.push({ text: `${s.checks} checks` });
      break;
    default:
      break;
  }

  if (stage.attempts > 1) out.push({ text: `${stage.attempts} attempts`, kind: 'is-fail' });
  return out.slice(0, 3);
}

// ============================================================
// Component
// ============================================================

export interface PipelineFlowProps {
  stages: Stage[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Stage the diagnosis blames, marked with a badge. */
  blamedKey?: string | null;
}

export default function PipelineFlow({ stages, selectedKey, onSelect, blamedKey }: PipelineFlowProps) {
  const [scale, setScale] = useState(1);

  const layout = useMemo(() => {
    const byKey = new Map(stages.map((s) => [s.key, s]));
    const maxSequence = Math.max(0, ...stages.map((s) => s.sequence));
    const maxLane = Math.max(0, ...stages.map((s) => s.lane));

    // Edges are declared on the target (dependsOn), so resolve them
    // into source/target pairs the SVG can draw.
    const edges = stages.flatMap((target) =>
      target.dependsOn
        .map((key) => byKey.get(key))
        .filter((source): source is Stage => Boolean(source))
        .map((source) => ({ source, target })),
    );

    const columns = [...new Set(stages.map((s) => s.sequence))]
      .sort((a, b) => a - b)
      .map((sequence) => ({
        sequence,
        label: columnLabel(stages.filter((s) => s.sequence === sequence)),
      }));

    return {
      byKey,
      edges,
      columns,
      width: x(maxSequence) + NODE_W,
      height: y(maxLane) + NODE_H,
    };
  }, [stages]);

  /**
   * When a stage is selected, everything not on its path dims. Walking
   * both directions is what makes the graph answer "what did this
   * block?" as well as "what was this waiting on?".
   *
   * Siblings at the same DAG level stay lit even though they are not
   * on the path. They are the comparison set -- when one region's
   * deploy fails, the whole point is seeing that its peers went
   * green, and dimming them hides the single most useful fact on the
   * screen.
   */
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

    const selectedStage = byKey.get(selectedKey);
    if (selectedStage) {
      for (const stage of stages) {
        if (stage.sequence === selectedStage.sequence) keep.add(stage.key);
      }
    }
    return keep;
  }, [selectedKey, layout, stages]);

  return (
    <div className="flow">
      <div className="flow-bar">
        <span className="flow-bar-title">
          <Activity size={15} /> Pipeline flow
        </span>
        <span className="tag-mono">
          {stages.length} stages · {layout.columns.length} phases
        </span>
        <div className="flow-legend">
          <span>
            <i className="dot dot-pass" /> passed
          </span>
          <span>
            <i className="dot dot-fail" /> failed
          </span>
          <span>
            <i className="dot dot-run" /> running
          </span>
          <span>
            <i className="dot dot-idle" /> skipped
          </span>
          <div className="segmented" style={{ marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}
              aria-label="Zoom out"
              disabled={scale <= 0.6}
            >
              <ZoomOut size={13} />
            </button>
            <button type="button" onClick={() => setScale(1)} className={scale === 1 ? 'is-active' : ''}>
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(1.2, Math.round((s + 0.2) * 10) / 10))}
              aria-label="Zoom in"
              disabled={scale >= 1.2}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="flow-scroll">
        <div
          style={{
            width: layout.width * scale,
            height: layout.height * scale + 26,
            position: 'relative',
          }}
        >
          <div
            className="flow-canvas"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              marginTop: 26,
            }}
          >
            {layout.columns.map((column) => (
              <span key={column.sequence} className="flow-column-label" style={{ left: x(column.sequence) }}>
                {column.label}
              </span>
            ))}

            <svg className="flow-edges" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map(({ source, target }) => {
                const x1 = x(source.sequence) + NODE_W;
                const y1 = y(source.lane) + NODE_H / 2;
                const x2 = x(target.sequence);
                const y2 = y(target.lane) + NODE_H / 2;
                const bend = Math.max(24, (x2 - x1) * 0.55);
                const muted = onPath && !(onPath.has(source.key) && onPath.has(target.key));
                return (
                  <path
                    key={`${source.key}->${target.key}`}
                    className={`flow-edge ${edgeTone(target)} ${muted ? 'is-muted' : ''}`}
                    d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  />
                );
              })}
            </svg>

            {stages.map((stage) => {
              const KindIcon = KIND_ICON[stage.kind] ?? Hammer;
              const muted = onPath && !onPath.has(stage.key);
              return (
                <button
                  type="button"
                  key={stage.key}
                  className={`stage s-${stage.status} ${selectedKey === stage.key ? 'is-selected' : ''} ${muted ? 'is-muted' : ''}`}
                  style={{ left: x(stage.sequence), top: y(stage.lane), width: NODE_W, height: NODE_H }}
                  onClick={() => onSelect(stage.key)}
                  aria-pressed={selectedKey === stage.key}
                  aria-label={`${stage.name}: ${stage.status}`}
                >
                  {blamedKey === stage.key && (
                    <span className="stage-blame" title="Root cause identified here">
                      <AlertOctagon size={12} />
                    </span>
                  )}
                  <span className="stage-top">
                    <span className="stage-icon">
                      <KindIcon size={13} />
                    </span>
                    <span className="stage-name">{stage.name}</span>
                    <span className="stage-duration">
                      {stage.status === 'running' ? 'live' : duration(stage.durationMs)}
                    </span>
                  </span>
                  <span className="stage-meta">
                    {chips(stage).map((chip) => (
                      <span key={chip.text} className={`stage-chip ${chip.kind ?? ''}`}>
                        {chip.text}
                      </span>
                    ))}
                    {stage.status === 'skipped' && <span className="stage-chip">skipped</span>}
                    {stage.status === 'pending' && <span className="stage-chip">queued</span>}
                  </span>
                  {stage.status === 'running' && <span className="stage-progress" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
