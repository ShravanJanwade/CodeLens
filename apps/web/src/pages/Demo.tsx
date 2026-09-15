import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Play,
  Bot,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Search,
  FileText,
  Server,
  Lightbulb,
  Shield,
  ThumbsUp,
  Clock,
  RotateCcw,
  Activity,
  Pause,
} from 'lucide-react';
import { API_BASE } from '../api';

type DemoPhase =
  | 'idle'
  | 'injecting'
  | 'detecting'
  | 'investigating'
  | 'rca'
  | 'remediation'
  | 'approval'
  | 'executing'
  | 'verifying'
  | 'resolved';

interface TimelineEvent {
  time: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  color: string;
  phase: DemoPhase;
}

const SCENARIO_OPTIONS = [
  ['db-connection-exhaustion', 'Database connection exhaustion'],
  ['bad-deployment', 'Bad deployment regression'],
  ['memory-leak', 'Memory leak'],
  ['cache-outage', 'Redis/cache outage'],
  ['queue-consumer-lag', 'Queue consumer lag'],
  ['downstream-timeout', 'Downstream API timeout'],
] as const;

const DEMO_TIMELINE: TimelineEvent[] = [
  {
    time: '00:00',
    icon: Zap,
    title: 'Deterministic failure injected',
    desc: 'The selected scenario emits reproducible metrics, logs, and traces.',
    color: 'text-status-warning',
    phase: 'injecting',
  },
  {
    time: '00:02',
    icon: Activity,
    title: 'Telemetry detects anomaly',
    desc: 'Threshold evaluation receives the scenario telemetry.',
    color: 'text-status-critical',
    phase: 'detecting',
  },
  {
    time: '00:03',
    icon: AlertTriangle,
    title: 'Incident created',
    desc: 'Alert fingerprinting groups this scenario into one incident.',
    color: 'text-status-critical',
    phase: 'detecting',
  },
  {
    time: '00:04',
    icon: Bot,
    title: 'Agent investigation started',
    desc: 'Orchestrator agent initiated with incident context',
    color: 'text-status-investigating',
    phase: 'investigating',
  },
  {
    time: '00:05',
    icon: Search,
    title: 'Tool: get_service_metrics',
    desc: 'The metrics agent records the deterministic signal values as evidence.',
    color: 'text-accent-text',
    phase: 'investigating',
  },
  {
    time: '00:06',
    icon: FileText,
    title: 'Tool: query_logs',
    desc: 'The logs agent captures a scenario-specific error sample.',
    color: 'text-accent-text',
    phase: 'investigating',
  },
  {
    time: '00:07',
    icon: GitBranch,
    title: 'Tool: get_recent_deployments',
    desc: 'The deployment agent compares the active state and known baseline.',
    color: 'text-accent-text',
    phase: 'investigating',
  },
  {
    time: '00:08',
    icon: GitBranch,
    title: 'Tool: get_dependency_graph',
    desc: 'The dependency agent scopes the impact to the affected service.',
    color: 'text-accent-text',
    phase: 'investigating',
  },
  {
    time: '00:09',
    icon: Lightbulb,
    title: 'Hypotheses generated and ranked',
    desc: 'The orchestrator confirms only the hypothesis supported by persisted evidence.',
    color: 'text-status-investigating',
    phase: 'rca',
  },
  {
    time: '00:10',
    icon: CheckCircle2,
    title: 'Root cause identified',
    desc: 'The incident record stores an evidence-backed confidence score.',
    color: 'text-status-healthy',
    phase: 'rca',
  },
  {
    time: '00:11',
    icon: Shield,
    title: 'Remediation proposed',
    desc: 'The plan is persisted and cannot execute before a human approval action.',
    color: 'text-status-investigating',
    phase: 'remediation',
  },
  {
    time: '00:12',
    icon: ThumbsUp,
    title: 'Human approval granted',
    desc: 'Mutating action requires explicit human approval',
    color: 'text-status-healthy',
    phase: 'approval',
  },
  {
    time: '00:13',
    icon: RotateCcw,
    title: 'Remediation executing',
    desc: 'The simulator applies the approved, typed action to the demo state.',
    color: 'text-status-warning',
    phase: 'executing',
  },
  {
    time: '00:15',
    icon: Activity,
    title: 'Recovery verification',
    desc: 'Healthy service baselines are restored and recorded.',
    color: 'text-status-healthy',
    phase: 'verifying',
  },
  {
    time: '00:16',
    icon: CheckCircle2,
    title: 'Incident resolved',
    desc: 'An evaluation run and Markdown postmortem are generated.',
    color: 'text-status-healthy',
    phase: 'resolved',
  },
];

export default function Demo() {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [scenarioId, setScenarioId] =
    useState<(typeof SCENARIO_OPTIONS)[number][0]>('db-connection-exhaustion');
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const runNextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= DEMO_TIMELINE.length) {
        setRunning(false);
        return prev;
      }
      const event = DEMO_TIMELINE[next];
      setPhase(event.phase);

      // Pause at approval step for human interaction
      if (event.phase === 'approval') {
        setNeedsApproval(true);
        setRunning(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const delay = currentStep < 3 ? 1200 : currentStep < 8 ? 800 : 1000;
    const timer = setTimeout(runNextStep, delay);
    return () => clearTimeout(timer);
  }, [running, currentStep, runNextStep]);

  const startDemo = async () => {
    setRequestError(null);
    try {
      const response = await fetch(`${API_BASE}/demo/scenarios/${scenarioId}/run`, { method: 'POST' });
      const payload = (await response.json()) as {
        data?: { incidentId: string };
        error?: { message: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(payload.error?.message ?? 'Unable to start the scenario');
      setIncidentId(payload.data.incidentId);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to start the scenario');
      return;
    }
    setCurrentStep(-1);
    setPhase('idle');
    setRunning(true);
    setNeedsApproval(false);
    setTimeout(runNextStep, 500);
  };

  const approveRemediation = async () => {
    if (!incidentId) return;
    setRequestError(null);
    try {
      const response = await fetch(`${API_BASE}/demo/incidents/${incidentId}/approve`, { method: 'POST' });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Unable to approve remediation');
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to approve remediation');
      return;
    }
    setNeedsApproval(false);
    setRunning(true);
    setTimeout(runNextStep, 600);
  };

  const resetDemo = () => {
    setRunning(false);
    setCurrentStep(-1);
    setPhase('idle');
    setNeedsApproval(false);
    setIncidentId(null);
    setRequestError(null);
  };

  const phaseLabel: Record<DemoPhase, { text: string; color: string }> = {
    idle: { text: 'Ready', color: 'text-text-muted' },
    injecting: { text: 'Injecting Failure', color: 'text-status-warning' },
    detecting: { text: 'Detecting Anomaly', color: 'text-status-critical' },
    investigating: { text: 'AI Investigating', color: 'text-status-investigating' },
    rca: { text: 'Root Cause Analysis', color: 'text-accent-text' },
    remediation: { text: 'Proposing Remediation', color: 'text-status-investigating' },
    approval: { text: 'Awaiting Approval', color: 'text-status-warning' },
    executing: { text: 'Executing Remediation', color: 'text-status-warning' },
    verifying: { text: 'Verifying Recovery', color: 'text-status-healthy' },
    resolved: { text: 'Incident Resolved ✓', color: 'text-status-healthy' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">Interactive Demo</h1>
            <span className="badge bg-accent/10 text-accent border border-accent/20 text-2xs">DEMO MODE</span>
          </div>
          <p className="text-sm text-text-secondary">
            Watch the full incident lifecycle: failure injection → detection → AI investigation → remediation
            → resolution
          </p>
          <p className="text-2xs text-text-muted mt-1">
            This demo uses deterministic responses. In production, the AI agent uses a local Ollama model.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card flex items-center gap-4">
        <label className="sr-only" htmlFor="scenario">
          Incident scenario
        </label>
        <select
          id="scenario"
          value={scenarioId}
          disabled={running || needsApproval}
          onChange={(event) => setScenarioId(event.target.value as typeof scenarioId)}
          className="bg-surface-3 border border-border rounded-md px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-60"
        >
          {SCENARIO_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={phase === 'idle' || phase === 'resolved' ? startDemo : resetDemo}
          className={
            phase === 'idle' || phase === 'resolved' ? 'btn-primary text-xs' : 'btn-secondary text-xs'
          }
        >
          {phase === 'idle' || phase === 'resolved' ? (
            <>
              <Play className="w-3.5 h-3.5" /> Run Scenario
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5" /> Reset
            </>
          )}
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Phase:</span>
          <span className={`text-xs font-semibold ${phaseLabel[phase].color}`}>{phaseLabel[phase].text}</span>
        </div>

        {running && (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        )}
      </div>

      {requestError && (
        <div role="alert" className="card border-status-critical/30 text-sm text-status-critical">
          {requestError}
        </div>
      )}

      {/* Approval prompt */}
      {needsApproval && (
        <div className="card border-accent/30 glow-accent animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Approval Required</h2>
          </div>
          <div className="bg-surface-3 rounded-lg p-4 mb-4">
            <p className="text-sm text-text-primary font-medium mb-1">
              Approve the evidence-backed remediation plan
            </p>
            <p className="text-xs text-text-secondary mb-2">
              This deterministic demo writes the approval, remediation, recovery verification, postmortem, and
              evaluation records to the local API.
            </p>
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span>
                Risk: <span className="text-yellow-400 font-medium">scenario-specific</span>
              </span>
              <span>
                Confidence: <span className="text-status-healthy font-medium">recorded on incident</span>
              </span>
              <span>
                Evidence: <span className="text-text-secondary">persisted with incident</span>
              </span>
            </div>
          </div>
          <button onClick={approveRemediation} className="btn-primary text-xs">
            <ThumbsUp className="w-3.5 h-3.5" />
            Approve Remediation
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="card">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-tertiary" />
          Investigation Timeline
        </h2>

        {currentStep < 0 ? (
          <div className="text-center py-12">
            <Bot className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-sm text-text-secondary">Click "Run Scenario" to start the demo</p>
            <p className="text-2xs text-text-muted mt-1">
              The AI agent will investigate a payment service degradation in real-time
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {DEMO_TIMELINE.slice(0, currentStep + 1).map((event, i) => {
              const Icon = event.icon;
              const isLatest = i === currentStep;
              return (
                <div
                  key={i}
                  className={`flex gap-3 pb-3 last:pb-0 relative ${isLatest ? 'animate-slide-up' : ''}`}
                >
                  {i < currentStep && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10 ${
                      isLatest && running ? 'bg-accent/20' : 'bg-surface-3'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${event.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs text-text-muted font-mono w-10 shrink-0">{event.time}</span>
                      <span
                        className={`text-sm font-medium ${isLatest ? 'text-text-primary' : 'text-text-secondary'}`}
                      >
                        {event.title}
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5 ml-12">{event.desc}</p>
                  </div>
                </div>
              );
            })}

            {running && currentStep < DEMO_TIMELINE.length - 1 && (
              <div className="flex gap-3 pt-1 animate-pulse-subtle">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                </div>
                <div className="pt-1.5">
                  <span className="text-xs text-text-muted">Processing next step...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result summary (shown when complete) */}
      {phase === 'resolved' && (
        <div className="card border-status-healthy/20 animate-slide-up">
          <h2 className="text-sm font-semibold text-status-healthy mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Incident Resolved Successfully
          </h2>
          <p className="text-xs text-text-secondary">
            The API persisted the telemetry, alert correlation, evidence, agent tool calls, approval, recovery
            verification, postmortem, and evaluation for this replay.
          </p>
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-3">
            <button onClick={startDemo} className="btn-secondary text-xs">
              <RotateCcw className="w-3 h-3" /> Run Again
            </button>
            {incidentId && (
              <Link to={`/incidents/${incidentId}`} className="btn-secondary text-xs">
                Inspect incident
              </Link>
            )}
            {incidentId && (
              <a
                href={`${API_BASE}/incidents/${incidentId}/postmortem`}
                className="btn-secondary text-xs"
                target="_blank"
                rel="noreferrer"
              >
                Export postmortem
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
