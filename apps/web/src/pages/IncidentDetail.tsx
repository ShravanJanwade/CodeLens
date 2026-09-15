import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Shield,
  Activity,
  GitBranch,
  Server,
  FileText,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { fetchIncidentDetail, approveDemoRemediation } from '../api';

const EVENT_ICONS: Record<string, any> = {
  deployment: GitBranch,
  metric_spike: Activity,
  alert_triggered: AlertTriangle,
  incident_created: AlertTriangle,
  investigation_started: Bot,
  tool_call: Server,
  log_query: FileText,
  root_cause_found: Lightbulb,
  remediation_proposed: Shield,
  approval_granted: ThumbsUp,
  approval_rejected: ThumbsDown,
  default: Clock,
};

export default function IncidentDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => fetchIncidentDetail(id!),
    refetchInterval: 3000,
  });

  const approvalMutation = useMutation({
    mutationFn: () => approveDemoRemediation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
    },
  });

  if (isLoading) return <div className="text-center py-10 text-text-muted">Loading incident...</div>;
  if (!data?.data) return <div className="text-center py-10 text-text-muted">Incident not found.</div>;

  const incident = data.data;
  const timeline = incident.timeline || [];
  const hypotheses = incident.hypotheses || [];
  const evidence = incident.evidence || [];
  const remediation = incident.remediationPlan;
  const service = incident.service;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/incidents" className="mt-1 p-1.5 rounded-lg hover:bg-surface-3 transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-text-muted font-mono">{incident.id}</span>
            <span
              className={`badge ${incident.severity === 'critical' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'} text-2xs`}
            >
              {(incident.severity || 'low').toUpperCase()}
            </span>
            <span
              className={`badge text-2xs ${incident.status === 'investigating' ? 'badge-investigating' : 'bg-surface-3 text-text-primary'}`}
            >
              {incident.status === 'investigating' && <Bot className="w-3 h-3" />}
              {incident.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">{incident.title}</h1>
          <p className="text-sm text-text-secondary mt-1">{incident.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-text-primary mb-4">Incident Timeline</h2>
              <div className="space-y-0">
                {timeline.map((event: any, i: number) => {
                  const Icon = EVENT_ICONS[event.type] || EVENT_ICONS.default;
                  return (
                    <div key={event.id} className="flex gap-3 pb-4 last:pb-0 relative">
                      {i < timeline.length - 1 && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                      )}
                      <div
                        className={`w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 z-10`}
                      >
                        <Icon className="w-3.5 h-3.5 text-text-tertiary" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-text-muted font-mono">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-sm text-text-primary font-medium">{event.title}</span>
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Root Cause */}
          {incident.rootCause && (
            <div className="card border-status-healthy/20 glow-accent">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-status-healthy" />
                <h2 className="text-sm font-semibold text-text-primary">Root Cause Analysis</h2>
                <span className="badge badge-healthy text-2xs ml-auto">
                  Confidence: {Math.round((incident.confidence || 0) * 100)}%
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{incident.rootCause}</p>

              {evidence.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">
                    Evidence
                  </h3>
                  <div className="space-y-1.5">
                    {evidence.map((e: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-2xs text-text-muted font-mono bg-surface-3 px-1.5 py-0.5 rounded mt-0.5 shrink-0 uppercase w-20 text-center">
                          {e.type}
                        </span>
                        <span className="text-text-secondary">{e.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Remediation Approval */}
          {remediation && (
            <div className="card border-accent/20">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-text-primary">Proposed Remediation</h2>
                {incident.approvalState === 'pending' ? (
                  <span className="badge bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-2xs ml-auto">
                    AWAITING APPROVAL
                  </span>
                ) : (
                  <span
                    className={`badge text-2xs ml-auto ${incident.approvalState === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                  >
                    {incident.approvalState?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="bg-surface-3 rounded-lg p-4 mb-4">
                <p className="text-sm text-text-primary font-medium mb-1">{remediation.action}</p>
                <p className="text-xs text-text-secondary">{remediation.description}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
                  <span>
                    Risk:{' '}
                    <span className="text-yellow-400 font-medium">{remediation.risk.toUpperCase()}</span>
                  </span>
                </div>
              </div>
              {incident.approvalState === 'pending' && (
                <div className="flex items-center gap-3">
                  <button
                    className="btn-primary text-xs px-6"
                    onClick={() => approvalMutation.mutate()}
                    disabled={approvalMutation.isPending}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <span className="text-2xs text-text-muted">
                    Demo mode only. Authenticated production approval uses the protected API.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Metadata */}
          <div className="card">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Details</h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Service', service?.name || incident.serviceId],
                ['Detected', new Date(incident.createdAt).toLocaleString()],
                ['Status', incident.status],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-text-tertiary">{label}</dt>
                  <dd className="text-text-primary font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Hypotheses */}
          {hypotheses.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-text-primary mb-3">Hypotheses</h2>
              <div className="space-y-2">
                {hypotheses.map((h: any) => (
                  <div key={h.id} className="p-2.5 rounded-lg bg-surface-3">
                    <div className="flex items-center gap-2 mb-1">
                      {h.status === 'confirmed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy" />
                      ) : (
                        <span className="w-3.5 h-3.5 text-2xs text-center text-status-critical">✕</span>
                      )}
                      <span className="text-xs font-medium text-text-primary">{h.title}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-5">
                      <span className="text-2xs text-text-tertiary">
                        Confidence: {Math.round((h.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
