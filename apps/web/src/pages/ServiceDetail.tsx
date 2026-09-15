import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GitBranch, Server, FileText, AlertTriangle } from 'lucide-react';
import { fetchServiceDetail } from '../api';

export default function ServiceDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: () => fetchServiceDetail(id!),
    refetchInterval: 3000,
  });

  if (isLoading) return <div className="text-center py-10 text-text-muted">Loading service...</div>;
  if (!data?.data) return <div className="text-center py-10 text-text-muted">Service not found.</div>;

  const service = data.data;
  const isHealthy = service.status === 'healthy';
  const deps = Array.isArray(service.dependencies) ? service.dependencies : [];
  const deployments = service.deployments || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <Link to="/services" className="mt-1 p-1.5 rounded-lg hover:bg-surface-3 transition-colors">
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className={!isHealthy ? 'status-dot-critical' : 'status-dot-healthy'} />
            <h1 className="text-lg font-semibold text-text-primary font-mono">{service.name}</h1>
            <span className={`badge text-2xs ${!isHealthy ? 'badge-critical' : 'badge-healthy'}`}>
              {service.status.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            v{service.version || '1.0.0'} · Last health check:{' '}
            {new Date(service.lastHealthCheck || service.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Error Rate',
            value: `${(service.errorRate || 0).toFixed(1)}%`,
            alert: (service.errorRate || 0) > 5,
          },
          {
            label: 'P50 Latency',
            value: `${(service.latencyP50 || 0).toFixed(0)}ms`,
            alert: (service.latencyP50 || 0) > 500,
          },
          {
            label: 'P99 Latency',
            value: `${(service.latencyP99 || 0).toFixed(0)}ms`,
            alert: (service.latencyP99 || 0) > 2000,
          },
          { label: 'Requests/min', value: `${(service.requestsPerMinute || 0).toFixed(0)}`, alert: false },
        ].map((m) => (
          <div key={m.label} className="card">
            <span className="metric-label">{m.label}</span>
            <div className={`metric-value mt-1 ${m.alert ? 'text-status-critical' : 'text-text-primary'}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Deployments */}
        <div className="card">
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-text-tertiary" />
            Recent Deployments
          </h2>
          <div className="space-y-2">
            {deployments.map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-3">
                <span className="text-xs font-mono text-text-primary">v{d.version}</span>
                <span
                  className={`badge text-2xs ${d.status === 'active' ? 'badge-healthy' : d.status === 'failed' ? 'badge-critical' : 'bg-surface-4 text-text-muted border border-border'}`}
                >
                  {d.status}
                </span>
                <span className="text-2xs text-text-muted font-mono ml-auto">
                  {d.commitSha?.slice(0, 7) || 'unknown'}
                </span>
                <span className="text-2xs text-text-tertiary">
                  {new Date(d.deployedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
            {deployments.length === 0 && (
              <div className="text-center py-4 text-text-muted text-xs">No deployments recorded.</div>
            )}
          </div>
        </div>

        {/* Dependencies */}
        <div className="card">
          <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-text-tertiary" />
            Dependencies
          </h2>
          <div className="space-y-2">
            {deps.map((dep: string) => (
              <Link
                key={dep}
                to={`/services/${dep}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors"
              >
                <div className="status-dot-healthy" />
                <span className="text-xs font-mono text-text-primary">{dep}</span>
              </Link>
            ))}
            {deps.length === 0 && (
              <div className="text-center py-4 text-text-muted text-xs">No dependencies recorded.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
