import {
  AlertTriangle,
  Server,
  Bot,
  CheckCircle2,
  GitBranch,
  TrendingUp,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboard, fetchIncidents, fetchServices, fetchAgents, fetchEvaluations } from '../api';

const severityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'badge-critical';
    case 'high':
      return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
    case 'medium':
      return 'badge-warning';
    case 'low':
      return 'badge-info';
    default:
      return 'badge-info';
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'investigating':
      return 'badge-investigating';
    case 'mitigating':
      return 'badge-warning';
    case 'resolved':
      return 'badge-healthy';
    case 'closed':
      return 'bg-surface-3 text-text-tertiary border border-border';
    default:
      return 'badge-info';
  }
};

export default function Dashboard() {
  const { data: dashboardRes } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 3000,
  });
  const { data: incidentsRes } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => fetchIncidents(),
    refetchInterval: 3000,
  });
  const { data: servicesRes } = useQuery({
    queryKey: ['services'],
    queryFn: fetchServices,
    refetchInterval: 3000,
  });
  const { data: agentsRes } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents, refetchInterval: 3000 });
  const { data: evaluationsRes } = useQuery({
    queryKey: ['evaluations'],
    queryFn: fetchEvaluations,
    refetchInterval: 3000,
  });

  const stats = dashboardRes?.data || {
    activeIncidents: 0,
    healthyServices: 0,
    degradedServices: 0,
    agentRuns: 0,
    resolvedToday: 0,
    totalRepositories: 0,
  };

  const recentIncidents = incidentsRes?.data?.slice(0, 5) || [];
  const servicesStatus = servicesRes?.data?.slice(0, 6) || [];
  const recentAgentActivity = agentsRes?.data?.slice(0, 5) || [];
  const evaluations = evaluationsRes?.data || [];
  const measuredDetection = evaluations.filter((run: any) => run.detectionLatencyMs != null);
  const averageDetection = measuredDetection.length
    ? Math.round(
        measuredDetection.reduce((sum: number, run: any) => sum + run.detectionLatencyMs, 0) /
          measuredDetection.length,
      )
    : null;
  const completedEvaluations = evaluations.filter((run: any) => run.status === 'completed');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">System overview and recent activity</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Incidents"
          value={stats.activeIncidents}
          icon={AlertTriangle}
          trend={0}
          color="text-status-critical"
          bgColor="bg-status-critical/5"
          glowClass={stats.activeIncidents > 0 ? 'glow-critical' : ''}
        />
        <MetricCard
          label="Healthy Services"
          value={`${stats.healthyServices}/${stats.healthyServices + stats.degradedServices}`}
          icon={Server}
          color="text-status-healthy"
          bgColor="bg-status-healthy/5"
        />
        <MetricCard
          label="Active Agent Runs"
          value={stats.agentRuns}
          icon={Bot}
          trend={0}
          color="text-status-investigating"
          bgColor="bg-status-investigating/5"
        />
        <MetricCard
          label="Resolved Today"
          value={stats.resolvedToday}
          icon={CheckCircle2}
          color="text-accent-text"
          bgColor="bg-accent/5"
        />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Incidents */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Recent Incidents</h2>
            <Link
              to="/incidents"
              className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {recentIncidents.map((incident: any) => (
              <Link
                key={incident.id}
                to={`/incidents/${incident.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors group"
              >
                <span className={`badge text-2xs ${severityColor(incident.severity)}`}>
                  {incident.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted font-mono">{incident.id}</span>
                    <span className="text-sm text-text-primary truncate group-hover:text-accent-text transition-colors">
                      {incident.title}
                    </span>
                  </div>
                  <span className="text-2xs text-text-tertiary">
                    {incident.service?.name || incident.serviceId}
                  </span>
                </div>
                <span className={`badge text-2xs ${statusColor(incident.status)}`}>{incident.status}</span>
                <span className="text-2xs text-text-muted w-16 text-right shrink-0">
                  {new Date(incident.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </Link>
            ))}
            {recentIncidents.length === 0 && (
              <div className="text-center py-4 text-text-tertiary text-sm">No recent incidents</div>
            )}
          </div>
        </div>

        {/* Services Status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">Service Health</h2>
            <Link
              to="/services"
              className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {servicesStatus.map((svc: any) => (
              <Link
                key={svc.name}
                to={`/services/${svc.name}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-3 transition-colors"
              >
                <div className={`status-dot-${svc.status}`} />
                <span className="text-sm text-text-primary flex-1 font-mono text-xs">{svc.name}</span>
                <div className="text-right">
                  <span
                    className={`text-2xs ${svc.errorRate > 5 ? 'text-status-critical' : 'text-text-tertiary'}`}
                  >
                    {(svc.errorRate || 0).toFixed(1)}% err
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">Agent Activity</h2>
          <Link
            to="/agents"
            className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-1.5">
          {recentAgentActivity.map((activity: any) => (
            <div
              key={activity.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-3 transition-colors"
            >
              {activity.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
              )}
              <span className="text-sm text-text-primary flex-1">
                Agent investigating {activity.incidentId}
              </span>
              <code className="text-2xs text-text-muted font-mono bg-surface-3 px-1.5 py-0.5 rounded">
                orchestrator
              </code>
              <span className="text-2xs text-text-tertiary w-16 text-right shrink-0">
                {new Date(activity.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {recentAgentActivity.length === 0 && (
            <div className="text-center py-4 text-text-tertiary text-sm">No recent agent activity</div>
          )}
        </div>
      </div>

      {/* Performance metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-text-tertiary" />
            <span className="metric-label">Avg Detection Time</span>
          </div>
          <div className="metric-value text-text-primary">
            {averageDetection == null ? '—' : `${averageDetection}ms`}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-text-tertiary" />
            <span className="metric-label">Completed Replays</span>
          </div>
          <div className="metric-value text-text-primary">{completedEvaluations.length}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-4 h-4 text-text-tertiary" />
            <span className="metric-label">Repositories Analyzed</span>
          </div>
          <div className="metric-value text-text-primary">{stats.totalRepositories}</div>
        </div>
      </div>
    </div>
  );
}

// ---- Metric Card Component ----

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  color: string;
  bgColor: string;
  glowClass?: string;
}

function MetricCard({ label, value, icon: Icon, trend, color, bgColor, glowClass }: MetricCardProps) {
  return (
    <div className={`card ${glowClass || ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">{label}</p>
          <p className="metric-value mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      {trend !== undefined && trend !== 0 && (
        <div className="mt-4 flex items-center gap-1">
          <span
            className={`text-xs font-medium ${trend > 0 ? 'text-status-healthy' : 'text-status-critical'}`}
          >
            {trend > 0 ? '+' : ''}
            {trend}%
          </span>
          <span className="text-xs text-text-tertiary">vs last week</span>
        </div>
      )}
    </div>
  );
}
