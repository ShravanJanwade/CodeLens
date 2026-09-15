import { BarChart3, CheckCircle2, Clock, Cpu, Wrench, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvaluations } from '../api';

type Evaluation = {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  detectionLatencyMs: number | null;
  investigationLatencyMs: number | null;
  totalToolCalls: number;
  incorrectToolCalls: number;
  rootCauseAccuracy: number | null;
  remediationSuccess: boolean;
  recoveryVerified: boolean;
  totalAgentSteps: number;
  model: string | null;
  startedAt: string;
  completedAt: string | null;
  failureReason: string | null;
};
const displayDuration = (milliseconds: number | null) =>
  milliseconds == null
    ? '—'
    : milliseconds < 1000
      ? `${milliseconds}ms`
      : `${(milliseconds / 1000).toFixed(milliseconds % 1000 ? 1 : 0)}s`;
const percentage = (value: number | null) => (value == null ? '—' : `${Math.round(value * 100)}%`);

export default function Evaluations() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['evaluations'],
    queryFn: fetchEvaluations,
    refetchInterval: 3_000,
  });
  const runs = (data?.data ?? []) as Evaluation[];
  const groups = Object.values(
    runs.reduce<Record<string, { name: string; runs: Evaluation[] }>>((result, run) => {
      (result[run.scenarioId] ??= { name: run.scenarioName, runs: [] }).runs.push(run);
      return result;
    }, {}),
  );
  const successful = runs.filter(
    (run) => run.status === 'completed' && run.remediationSuccess && run.recoveryVerified,
  );
  const measuredDetection = runs.filter((run) => run.detectionLatencyMs != null);
  const averageDetection = measuredDetection.length
    ? Math.round(
        measuredDetection.reduce((sum, run) => sum + (run.detectionLatencyMs ?? 0), 0) /
          measuredDetection.length,
      )
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Agent Evaluation</h1>
        <p className="text-sm text-text-secondary mt-1">
          Measurements from persisted incident replays. Metrics appear only after a scenario completes.
        </p>
      </div>
      {isLoading ? (
        <div className="card text-sm text-text-muted">Loading evaluation history…</div>
      ) : isError ? (
        <div role="alert" className="card text-sm text-status-critical">
          Unable to load evaluation history.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Successful runs" value={`${successful.length}/${runs.length}`} />
            <Metric label="Scenarios measured" value={groups.length} />
            <Metric label="Avg detection" value={displayDuration(averageDetection)} />
            <Metric label="Latest RCA confidence" value={percentage(runs[0]?.rootCauseAccuracy ?? null)} />
          </div>
          <div className="card">
            <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-text-tertiary" />
              Scenario performance
            </h2>
            {groups.length === 0 ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Head>Scenario</Head>
                      <Head>Runs</Head>
                      <Head>Recovery verified</Head>
                      <Head>Avg detection</Head>
                      <Head>RCA confidence</Head>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(({ name, runs: scenarioRuns }) => {
                      const complete = scenarioRuns.filter((run) => run.status === 'completed');
                      const detection = complete.filter((run) => run.detectionLatencyMs != null);
                      const confidence = complete.filter((run) => run.rootCauseAccuracy != null);
                      return (
                        <tr key={name} className="border-b border-border/50 hover:bg-surface-3">
                          <td className="py-2.5 pr-4 text-text-primary font-medium">{name}</td>
                          <td className="py-2.5 text-center text-text-secondary">{scenarioRuns.length}</td>
                          <td className="py-2.5 text-center text-text-secondary">
                            {complete.filter((run) => run.recoveryVerified).length}/{complete.length}
                          </td>
                          <td className="py-2.5 text-center text-text-secondary font-mono text-xs">
                            {displayDuration(
                              detection.length
                                ? Math.round(
                                    detection.reduce((sum, run) => sum + (run.detectionLatencyMs ?? 0), 0) /
                                      detection.length,
                                  )
                                : null,
                            )}
                          </td>
                          <td className="py-2.5 text-center text-text-secondary">
                            {percentage(
                              confidence.length
                                ? confidence.reduce((sum, run) => sum + (run.rootCauseAccuracy ?? 0), 0) /
                                    confidence.length
                                : null,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="text-sm font-semibold text-text-primary mb-4">Recent evaluation runs</h2>
            {runs.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-3">
                    <>
                      {run.status === 'completed' && run.recoveryVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-status-healthy shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-status-critical shrink-0" />
                      )}
                    </>
                    <span className="text-sm text-text-primary flex-1">{run.scenarioName}</span>
                    <span className="badge text-2xs bg-surface-4 text-text-secondary border-border">
                      RCA {percentage(run.rootCauseAccuracy)}
                    </span>
                    <div className="flex items-center gap-3 text-2xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        {run.totalToolCalls}
                      </span>
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {run.totalAgentSteps}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {displayDuration(run.investigationLatencyMs)}
                      </span>
                    </div>
                    <code className="text-2xs text-text-muted font-mono">{run.model ?? '—'}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <span className="metric-label">{label}</span>
      <div className="metric-value mt-1 text-text-primary">{value}</div>
    </div>
  );
}
function Head({ children }: { children: string }) {
  return (
    <th className="text-center first:text-left text-xs text-text-tertiary font-medium py-2 px-3 first:pl-0">
      {children}
    </th>
  );
}
function Empty() {
  return (
    <div className="py-8 text-center text-sm text-text-muted">
      No completed replay evaluations yet. Run and approve a scenario in the Demo.
    </div>
  );
}
