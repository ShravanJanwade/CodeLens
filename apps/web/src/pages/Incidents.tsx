import { Link } from 'react-router-dom';
import { AlertTriangle, Filter, Search, Bot } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchIncidents } from '../api';

const severityBadge = (s: string) => {
  const map: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
    high: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    low: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  };
  return map[s] || map.low;
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    open: 'bg-red-500/10 text-red-400 border border-red-500/20',
    investigating: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    mitigating: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    awaiting_approval: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    resolved: 'bg-green-500/10 text-green-400 border border-green-500/20',
    closed: 'bg-surface-3 text-text-tertiary border border-border',
  };
  return map[s] || map.open;
};

export default function Incidents() {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => fetchIncidents(1),
    refetchInterval: 3000,
  });

  const incidents = data?.data || [];

  const filtered = incidents.filter((inc: any) => {
    if (filter !== 'all' && inc.status !== filter) return false;
    if (search && !inc.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Incidents</h1>
          <p className="text-sm text-text-secondary mt-1">{incidents.length} total incidents</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-lg p-0.5">
          {['all', 'open', 'investigating', 'mitigating', 'awaiting_approval', 'resolved', 'closed'].map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === s
                    ? 'bg-surface-4 text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </button>
            ),
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-text-muted">Loading incidents...</div>
      ) : (
        <>
          {/* Incident list */}
          <div className="space-y-2">
            {filtered.map((incident: any) => (
              <Link
                key={incident.id}
                to={`/incidents/${incident.id}`}
                className="card-hover flex items-start gap-4 group"
              >
                <div className="mt-1">
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      incident.severity === 'critical'
                        ? 'text-status-critical'
                        : incident.severity === 'high'
                          ? 'text-orange-400'
                          : incident.severity === 'medium'
                            ? 'text-status-warning'
                            : 'text-status-info'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-text-muted font-mono">{incident.id}</span>
                    <span className={`badge text-2xs ${severityBadge(incident.severity || 'low')}`}>
                      {(incident.severity || 'low').toUpperCase()}
                    </span>
                    <span className={`badge text-2xs ${statusBadge(incident.status)}`}>
                      {incident.status === 'investigating' && <Bot className="w-3 h-3" />}
                      {incident.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-text-primary group-hover:text-accent-text transition-colors">
                    {incident.title}
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {incident.description || 'No description provided'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-text-muted">
                    {new Date(incident.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <div className="text-2xs text-text-tertiary mt-0.5 font-mono">
                    {incident.service?.name || incident.serviceId}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Filter className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-secondary">No incidents match your filters</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
