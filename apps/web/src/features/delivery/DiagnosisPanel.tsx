import { useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileDiff,
  FileText,
  GitCommit,
  Gauge,
  Lightbulb,
  ScrollText,
  ShieldQuestion,
  Sparkles,
  Timer,
  TrendingUp,
  User,
} from 'lucide-react';
import type { DiagnosisSignal, RunDetail } from './types';
import { micros, pct } from './format';
import { useLiveDiagnosis } from './queries';

const SOURCE_ICON: Record<DiagnosisSignal['source'], typeof ScrollText> = {
  log: ScrollText,
  history: TrendingUp,
  topology: Building2,
  diff: FileDiff,
  metrics: Gauge,
};

const SOURCE_LABEL: Record<DiagnosisSignal['source'], string> = {
  log: 'Stage log',
  history: 'Run history',
  topology: 'Deploy topology',
  diff: 'Commit diff',
  metrics: 'Runner metrics',
};

/** Arc gauge for the confidence score. */
function Gauge58({ value }: { value: number }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="dx-gauge">
      <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
        <circle className="track" cx="29" cy="29" r={radius} />
        <circle
          className="value"
          cx="29"
          cy="29"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <b>{Math.round(value * 100)}</b>
    </div>
  );
}

function SignalRow({ signal, against }: { signal: DiagnosisSignal; against: boolean }) {
  const Icon = SOURCE_ICON[signal.source] ?? ScrollText;
  return (
    <div className={`signal ${against ? 'is-against' : ''}`}>
      <span className={`signal-src src-${signal.source}`} title={SOURCE_LABEL[signal.source]}>
        <Icon size={13} />
      </span>
      <div className="signal-main">
        <div className="signal-label">
          {signal.label}
          <span className="signal-weight">
            {signal.weight === 0 ? 'rules out' : `w ${signal.weight.toFixed(2)}`}
          </span>
        </div>
        <p className="signal-detail">{signal.detail}</p>
      </div>
    </div>
  );
}

export interface DiagnosisPanelProps {
  repositoryId: string;
  runNumber: number;
  diagnosis: NonNullable<RunDetail['diagnosis']>;
  onJumpToStage?: (stageKey: string) => void;
}

export default function DiagnosisPanel({
  repositoryId,
  runNumber,
  diagnosis,
  onJumpToStage,
}: DiagnosisPanelProps) {
  const [live, setLive] = useState(false);
  const rerun = useLiveDiagnosis(repositoryId, runNumber, live);

  // Signals the engine kept as counter-evidence carry weight 0 or
  // argue for a different category. Showing them separately is the
  // point: a verdict you can only agree with is not a verdict.
  const supporting = diagnosis.signals.filter((s) => s.supports === diagnosis.category);
  const against = diagnosis.signals.filter((s) => s.supports !== diagnosis.category);

  return (
    <section className={`dx ${diagnosis.exonerated ? 'is-clear' : 'is-fail'}`}>
      <header className="dx-hd">
        <span className="dx-mark">
          {diagnosis.exonerated ? <BadgeCheck size={21} /> : <AlertOctagon size={21} />}
        </span>
        <div className="dx-hd-main">
          <div className="dx-title">
            <span className={`badge ${diagnosis.exonerated ? 'badge-pass' : 'badge-fail'}`}>
              {diagnosis.categoryLabel}
            </span>
            <h2>{diagnosis.title}</h2>
          </div>
          <p className="dx-summary">{diagnosis.summary}</p>
        </div>
        <div className="dx-confidence">
          <Gauge58 value={diagnosis.confidence} />
          <small>confidence</small>
        </div>
      </header>

      {/* The one line a developer actually needs. */}
      <div className={`dx-verdict ${diagnosis.exonerated ? 'is-clear' : 'is-blocked'}`}>
        {diagnosis.exonerated ? <BadgeCheck size={15} /> : <AlertOctagon size={15} />}
        {diagnosis.exonerated
          ? 'Your change is not the cause. This failure would have happened on any commit.'
          : 'This change introduced the failure and needs a fix before it can ship.'}
        <div className="dx-verdict-action">
          <span className="badge badge-brand">
            <Lightbulb size={11} /> {diagnosis.actionLabel}
          </span>
          {onJumpToStage && (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => onJumpToStage(diagnosis.stageKey)}
            >
              Go to stage <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="dx-body">
        <div className="dx-col">
          <h3>
            <ScrollText size={12} /> Evidence for this verdict
            <span className="tab-count">{supporting.length}</span>
          </h3>
          {supporting.length === 0 ? (
            <p className="text-sm muted">No supporting signals were recorded.</p>
          ) : (
            supporting.map((signal) => <SignalRow key={signal.id} signal={signal} against={false} />)
          )}

          {against.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>
                <ShieldQuestion size={12} /> Considered and ruled out
                <span className="tab-count">{against.length}</span>
              </h3>
              {against.map((signal) => (
                <SignalRow key={signal.id} signal={signal} against />
              ))}
            </>
          )}
        </div>

        <div className="dx-col">
          <h3>
            <Lightbulb size={12} /> Recommended next step
          </h3>
          <p className="text-sm" style={{ color: 'var(--c-ink-2)', lineHeight: 1.6 }}>
            {diagnosis.recommendation}
          </p>

          {(diagnosis.blame.file || diagnosis.blame.commitShort) && (
            <>
              <h3 style={{ marginTop: 20 }}>
                <FileText size={12} /> Where to look
              </h3>
              <div className="stack-2">
                {diagnosis.blame.file && (
                  <div className="row-tight text-xs">
                    <FileText size={12} className="muted" />
                    <code className="code-inline">{diagnosis.blame.file}</code>
                  </div>
                )}
                {diagnosis.blame.commitShort && (
                  <div className="row-tight text-xs">
                    <GitCommit size={12} className="muted" />
                    <code className="code-inline">{diagnosis.blame.commitShort}</code>
                  </div>
                )}
                {diagnosis.blame.author && (
                  <div className="row-tight text-xs muted">
                    <User size={12} />
                    {diagnosis.blame.author}
                  </div>
                )}
              </div>
            </>
          )}

          <h3 style={{ marginTop: 20 }}>
            <Timer size={12} /> How this was produced
          </h3>
          <p className="text-xs muted" style={{ lineHeight: 1.6 }}>
            Classified deterministically from {diagnosis.signals.length} signals in{' '}
            <strong style={{ color: 'var(--c-ink-2)' }}>{micros(diagnosis.computeMs)}</strong>. No model call,
            so the same evidence always produces the same verdict.
          </p>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => setLive(true)}
            disabled={rerun.isFetching}
          >
            <Sparkles size={13} />
            {rerun.isFetching ? 'Re-classifying…' : 'Re-run the classifier now'}
          </button>

          {rerun.data && (
            <div className="alert alert-info" style={{ marginTop: 12, display: 'block' }}>
              <strong>
                {rerun.data.categoryLabel} · {pct(rerun.data.confidence, 0)} confidence
              </strong>
              <p className="text-xs" style={{ marginTop: 4 }}>
                Recomputed live in {micros(rerun.data.elapsedMs)} from {rerun.data.evidenceUsed.logBytes}{' '}
                bytes of log, {rerun.data.evidenceUsed.siblingRegions} sibling regions and{' '}
                {rerun.data.evidenceUsed.greenBaselineSamples} green baseline samples.
              </p>
              {rerun.data.category !== diagnosis.category && (
                <p className="text-xs" style={{ marginTop: 6, color: 'var(--c-warn-ink)' }}>
                  This differs from the stored verdict because the live path reconstructs evidence from the
                  database and has no commit diff available.
                </p>
              )}
            </div>
          )}
          {rerun.error && (
            <p className="field-error" style={{ marginTop: 10 }}>
              {(rerun.error as Error).message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
