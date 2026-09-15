import { Link } from 'react-router-dom';
import { Server } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchServices } from '../api';

export default function Services() {
  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: fetchServices,
    refetchInterval: 3000,
  });
  const services = data?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Services</h1>
        <p className="text-sm text-text-secondary mt-1">Microservice registry and health status</p>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-muted">Loading services...</div>
      ) : services.length === 0 ? (
        <div className="text-center py-10 text-text-muted">No services found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc: any) => (
            <Link key={svc.id} to={`/services/${svc.name || svc.id}`} className="card-hover group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`status-dot-${svc.status || 'healthy'}`} />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-text transition-colors font-mono">
                    {svc.name || svc.id}
                  </h3>
                  <span className="text-2xs text-text-muted">v{svc.version || '1.0.0'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-muted block mb-0.5">Error Rate</span>
                  <span
                    className={
                      (svc.errorRate || 0) > 5 ? 'text-status-critical font-semibold' : 'text-text-primary'
                    }
                  >
                    {(svc.errorRate || 0).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">P50 Latency</span>
                  <span
                    className={
                      (svc.latencyP50 || 0) > 500 ? 'text-status-warning font-semibold' : 'text-text-primary'
                    }
                  >
                    {(svc.latencyP50 || 0).toFixed(0)}ms
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">P99 Latency</span>
                  <span
                    className={
                      (svc.latencyP99 || 0) > 2000
                        ? 'text-status-critical font-semibold'
                        : 'text-text-primary'
                    }
                  >
                    {(svc.latencyP99 || 0).toFixed(0)}ms
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">RPM</span>
                  <span className="text-text-primary">{(svc.requestsPerMinute || 0).toFixed(0)}</span>
                </div>
              </div>
              {Array.isArray(svc.dependencies) && svc.dependencies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <span className="text-2xs text-text-muted">Dependencies: </span>
                  <span className="text-2xs text-text-tertiary font-mono">{svc.dependencies.join(', ')}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
