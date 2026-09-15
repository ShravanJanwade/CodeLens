import { Bot, Database, Globe, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE, fetchConfig } from '../api';

export default function Settings() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['config'], queryFn: fetchConfig });
  const config = data?.data ?? data;
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Runtime configuration</h1>
        <p className="text-sm text-text-secondary mt-1">
          Values are read from the running API. Environment configuration is intentionally not editable from
          the browser.
        </p>
      </div>
      {isLoading ? (
        <div className="card text-sm text-text-muted">Loading runtime configuration…</div>
      ) : isError ? (
        <div role="alert" className="card text-sm text-status-critical">
          Unable to read the API configuration.
        </div>
      ) : (
        <>
          <Section icon={Globe} title="API boundary">
            <Row label="Client API path" value={API_BASE} />
            <Row
              label="Deployment behavior"
              value="Same-origin by default; VITE_API_URL supports a separate API host."
            />
          </Section>
          <Section icon={Bot} title="AI provider">
            <Row label="Active provider" value={config?.provider ?? 'Unknown'} />
            <Row label="Active model" value={config?.model ?? 'No external model'} />
            <Row
              label="Demo safety"
              value={
                config?.demoMode
                  ? 'Deterministic demo provider is active; no external model call.'
                  : `The ${config?.provider ?? 'configured'} provider is active. Credentials stay server-side.`
              }
            />
          </Section>
          <Section icon={Shield} title="Safety limits">
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(config?.limits ?? {}).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-text-tertiary">{key.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="text-xs text-text-primary font-mono mt-1">{String(value)}</dd>
                </div>
              ))}
            </div>
          </Section>
          <Section icon={Database} title="Persistence">
            <Row label="Local system" value="SQLite via libSQL-compatible file adapter" />
            <Row
              label="Public demo"
              value="Hosted runs use the allowlisted TaskForge CI executor; arbitrary repositories remain local."
            />
          </Section>
        </>
      )}
    </div>
  );
}
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bot;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-text-tertiary" />
        {title}
      </h2>
      {children}
    </section>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary mt-1">{value}</dd>
    </div>
  );
}
