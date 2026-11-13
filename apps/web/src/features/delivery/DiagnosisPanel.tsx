import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CircleX, ExternalLink, RotateCcw, Wrench } from 'lucide-react';
import type { DiagnosisSignal, RunDetail } from './types';
import { micros } from './format';
import { useLiveDiagnosis } from './queries';
import { useRerun } from './actions';
import { ActionButton, type useAccessGate } from './ui';
import type { FixRequest } from './FixDialog';

const SOURCE_LABEL: Record<DiagnosisSignal['source'], string> = {
  log: 'Log',
  history: 'History',
  topology: 'Topology',
  diff: 'Diff',
  metrics: 'Metrics',
};

function Signal({ signal, against }: { signal: DiagnosisSignal; against?: boolean }) {
  return (
    <li className={`signal ${against ? 'is-against' : ''}`}>
      <span className="signal-src">{SOURCE_LABEL[signal.source] ?? signal.source}</span>
      <div className="signal-main">
        <div className="signal-label">{signal.label}</div>
        <p className="signal-detail">{signal.detail}</p>
      </div>
      <span className="signal-weight" title="How much this signal weighs in the verdict">
        {signal.weight === 0 ? 'rules out' : signal.weight.toFixed(2)}
      </span>
    </li>
  );
}

export interface DiagnosisPanelProps {
  repositoryId: string;
  run: RunDetail['run'];
  diagnosis: NonNullable<RunDetail['diagnosis']>;
  failedStageName: string | null;
  gate: ReturnType<typeof useAccessGate>;
  onFix: (fix: FixRequest) => void;
  onJumpToStage: (stageKey: string) => void;
}

export default function DiagnosisPanel({
  repositoryId,
  run,
  diagnosis,
  failedStageName,
  gate,
  onFix,
  onJumpToStage,
}: DiagnosisPanelProps) {
  const [live, setLive] = useState(false);
  const rerunClassifier = useLiveDiagnosis(repositoryId, run.runNumber, live);
  const rerun = useRerun(repositoryId);
  const actionable = Boolean(run.externalUrl) && run.status !== 'running' && run.status !== 'blocked';

  const supporting = diagnosis.signals.filter((s) => s.supports === diagnosis.category);
  const against = diagnosis.signals.filter((s) => s.supports !== diagnosis.category);
  const confidence = Math.round(diagnosis.confidence * 100);
  const strength = confidence >= 70 ? 'High' : confidence >= 45 ? 'Medium' : 'Low';

  const rerunFailed = (primary: boolean) => (
    <ActionButton
      gate={gate}
      className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm`}
      busy={rerun.isPending && rerun.variables?.mode === 'failed'}
      onClick={() => rerun.mutate({ runNumber: run.runNumber, mode: 'failed' })}
    >
      {!(rerun.isPending && rerun.variables?.mode === 'failed') && <RotateCcw size={14} />} Re-run failed jobs
    </ActionButton>
  );

  const actions = (() => {
    if (!actionable) return null;
    switch (diagnosis.category) {
      case 'config-drift':
        return (
          <>
            {/* Anyone can preview the fix; opening it is the gated step. */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onFix({ kind: 'config-drift', runNumber: run.runNumber })}
            >
              <Wrench size={14} /> Fix with a pull request
            </button>
            {failedStageName && (
              <ActionButton
                gate={gate}
                busy={rerun.isPending && rerun.variables?.mode === 'job'}
                onClick={() =>
                  rerun.mutate({ runNumber: run.runNumber, mode: 'job', stageKey: diagnosis.stageKey })
                }
              >
                Re-run {failedStageName}
              </ActionButton>
            )}
          </>
        );
      case 'flaky-test':
        return (
          <>
            {rerunFailed(true)}
            <Link className="btn btn-secondary btn-sm" to={`/r/${encodeURIComponent(repositoryId)}/flakes`}>
              Flake history
            </Link>
          </>
        );
      case 'code-regression':
      case 'migration-failure':
        return (
          <>
            {diagnosis.blame.commitSha && run.externalUrl && (
              <a
                className="btn btn-secondary btn-sm"
                href={run.externalUrl.replace(
                  /\/actions\/runs\/\d+.*$/,
                  `/commit/${diagnosis.blame.commitSha}`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                View {diagnosis.blame.commitShort} <ExternalLink size={12} />
              </a>
            )}
            {rerunFailed(false)}
          </>
        );
      default:
        return rerunFailed(true);
    }
  })();

  return (
    <section className={`dx ${diagnosis.exonerated ? 'is-clear' : 'is-fail'}`} aria-label="Diagnosis">
      <div className="dx-hd">
        <div className="dx-kicker">
          <span className="dx-cat">{diagnosis.categoryLabel}</span>
          <span className="dx-conf" title={`${confidence}% confidence`}>
            <span className="dx-meter">
              <i style={{ width: `${confidence}%` }} />
            </span>
            {strength} confidence · {confidence}%
          </span>
        </div>
        <h2>{diagnosis.title}</h2>
        <p className="dx-summary">{diagnosis.summary}</p>
      </div>

      <div className={`dx-verdict ${diagnosis.exonerated ? 'is-clear' : 'is-blocked'}`}>
        {diagnosis.exonerated ? <CircleCheck size={15} /> : <CircleX size={15} />}
        <span>
          {diagnosis.exonerated ? (
            <>Not caused by this commit. It would have failed on any commit.</>
          ) : (
            <>
              Caused by this change
              {diagnosis.blame.commitShort ? (
                <>
                  {' '}
                  in <span className="sha">{diagnosis.blame.commitShort}</span>
                </>
              ) : null}
              {diagnosis.blame.file ? (
                <>
                  , <span className="mono">{diagnosis.blame.file}</span>
                </>
              ) : null}
              .
            </>
          )}
        </span>
        <button type="button" className="link dx-jump" onClick={() => onJumpToStage(diagnosis.stageKey)}>
          Show the failing job
        </button>
      </div>

      <div className="dx-next">
        <div>
          <h3>Next step</h3>
          <p>{diagnosis.recommendation}</p>
        </div>
        {actions && <div className="dx-actions">{actions}</div>}
      </div>

      <details className="dx-section" open>
        <summary>
          Evidence <span className="muted">{supporting.length}</span>
        </summary>
        <ul className="signals">
          {supporting.map((signal) => (
            <Signal key={signal.id} signal={signal} />
          ))}
        </ul>
        {against.length > 0 && (
          <>
            <p className="signals-caption">Weighed against it</p>
            <ul className="signals">
              {against.map((signal) => (
                <Signal key={signal.id} signal={signal} against />
              ))}
            </ul>
          </>
        )}
      </details>

      <details className="dx-section">
        <summary>How this was produced</summary>
        <p className="dx-how">
          Classified deterministically from {diagnosis.signals.length} signals in{' '}
          {micros(diagnosis.computeMs)}, with no model call, so the same evidence always produces the same
          verdict.
        </p>
        <div className="row-wrap" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setLive(true)}
            disabled={rerunClassifier.isFetching}
          >
            {rerunClassifier.isFetching ? 'Classifying…' : 'Run the classifier again'}
          </button>
          {rerunClassifier.data && (
            <span className="text-xs muted">
              {rerunClassifier.data.categoryLabel}, {Math.round(rerunClassifier.data.confidence * 100)}%, in{' '}
              {micros(rerunClassifier.data.elapsedMs)} from{' '}
              {rerunClassifier.data.evidenceUsed.logBytes.toLocaleString()} bytes of log
              {rerunClassifier.data.category !== diagnosis.category
                ? ' (differs from the stored verdict)'
                : ''}
            </span>
          )}
          {rerunClassifier.error && (
            <span className="text-xs tone-fail">{rerunClassifier.error.message}</span>
          )}
        </div>
      </details>
    </section>
  );
}
