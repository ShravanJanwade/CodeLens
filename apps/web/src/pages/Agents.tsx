import {
  CheckCircle2,
  Bot,
  Clock,
  Wrench,
  AlertTriangle,
  Search,
  FileText,
  GitBranch,
  Server,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAgents } from '../api';

const ICONS: Record<string, any> = {
  orchestrator: Bot,
  get_service_metrics: Search,
  query_logs: FileText,
  get_recent_deployments: GitBranch,
  compare_deployments: GitBranch,
  get_dependency_graph: Server,
};

export default function Agents() {
  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    refetchInterval: 3000,
  });

  const runs = data?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Agent Activity</h1>
        <p className="text-sm text-text-secondary mt-1">AI investigation runs and tool execution history</p>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-muted">Loading agent runs...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-10 text-text-muted">No agent activity found.</div>
      ) : (
        <div className="space-y-5">
          {runs.map((run: any) => (
            <div key={run.id} className="card">
              {/* Run header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      run.status === 'running' ? 'bg-accent/10' : 'bg-status-healthy/10'
                    }`}
                  >
                    <Bot
                      className={`w-4 h-4 ${run.status === 'running' ? 'text-accent' : 'text-status-healthy'}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/incidents/${run.incidentId}`}
                        className="text-sm font-medium text-text-primary hover:text-accent-text transition-colors"
                      >
                        {run.incidentId}
                      </Link>
                      <span
                        className={`badge text-2xs ${run.status === 'running' ? 'badge-investigating' : 'badge-healthy'}`}
                      >
                        {run.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-2xs text-text-muted mt-0.5">
                      <span>
                        Model: <code className="text-text-tertiary">qwen2.5:7b</code>
                      </span>
                      <span>{(run.steps || []).length} steps</span>
                      <span>{new Date(run.startedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Steps */}
              {run.steps && run.steps.length > 0 ? (
                <div className="space-y-1">
                  {run.steps.map((step: any, i: number) => {
                    const Icon = ICONS[step.agentType] || Clock;
                    return (
                      <div
                        key={step.id || i}
                        className="flex flex-col gap-1 px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0" />
                          ) : step.status === 'failed' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-status-critical shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
                          )}
                          <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          <span className="text-sm font-medium text-text-primary flex-1">
                            {step.action || step.agentType}
                          </span>
                          <code className="text-2xs text-text-muted font-mono bg-surface-3 group-hover:bg-surface-4 px-1.5 py-0.5 rounded transition-colors">
                            {step.agentType}
                          </code>
                          <span className="text-2xs text-text-tertiary w-12 text-right shrink-0">
                            {step.durationMs ? `${step.durationMs}ms` : '—'}
                          </span>
                        </div>
                        {step.reasoning && (
                          <div className="pl-9 pr-2 text-xs text-text-secondary italic">
                            "{step.reasoning}"
                          </div>
                        )}
                        {step.output && (
                          <div className="pl-9 pr-2 text-2xs text-text-muted mt-1 bg-surface-4/50 p-2 rounded border border-border/50 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                            {typeof step.output === 'string'
                              ? step.output
                              : JSON.stringify(step.output, null, 2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-text-muted px-3">Agent has not executed any steps yet.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
