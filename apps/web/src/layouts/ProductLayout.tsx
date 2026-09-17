import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronDown,
  Code2,
  FlaskConical,
  GitBranch,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Settings,
  Target,
  UserCircle,
  Workflow,
  X,
} from 'lucide-react';
import { API_BASE } from '../api';
import { useAuth } from '../features/auth/Auth';
import { useDeliveryOverview } from '../features/delivery/queries';
import { DEMO_REPO } from '../features/delivery/types';

/**
 * Shell for the product surfaces.
 *
 * Navigation leads with the three questions the product answers --
 * why is the pipeline red, what does this change touch, which
 * failures are noise -- and everything else lives under "More
 * tools". The ordering is the product thesis, so it is deliberate.
 */

function Brand({ compact }: { compact: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="CodeLens home">
      <span className="brand-mark">
        <Code2 size={16} />
      </span>
      {!compact && (
        <span>
          CodeLens<span className="brand-period">.</span>
        </span>
      )}
    </Link>
  );
}

const CRUMB_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  runs: 'Pipeline run',
  impact: 'Change impact',
  flakes: 'Flaky tests',
  benchmark: 'Diagnosis accuracy',
  repositories: 'Repositories',
  investigations: 'Investigations',
  documentation: 'Documentation',
  account: 'Account',
  settings: 'Settings',
};

export default function ProductLayout() {
  const auth = useAuth();
  const location = useLocation();
  const params = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const repositoryId = params.repoId ?? DEMO_REPO;
  const isDemo = repositoryId === DEMO_REPO;

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('API unavailable');
      return response.json();
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  // Only used for the failure count next to "Delivery"; a failure
  // here must not take the shell down with it.
  const overview = useDeliveryOverview(repositoryId);
  const failures = overview.data?.stats.failedRuns ?? 0;

  const base = `/r/${encodeURIComponent(repositoryId)}`;
  const segments = location.pathname.split('/').filter(Boolean);
  const leaf = segments.find((s) => CRUMB_LABELS[s]) ?? segments[segments.length - 1] ?? 'delivery';

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {mobileOpen && (
        <button className="sb-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sb ${mobileOpen ? 'is-open' : ''}`}>
        <div className="sb-brand">
          <Brand compact={collapsed} />
          <button
            type="button"
            className="icon-btn sb-toggle-mobile"
            style={{ marginLeft: 'auto' }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sb-repo" title={overview.data?.repository.fullName ?? repositoryId}>
          <span className="sb-repo-mark">
            <GitBranch size={13} />
          </span>
          <div>
            <strong>{overview.data?.repository.fullName ?? 'Loading…'}</strong>
            <small>{isDemo ? 'Demo workspace' : (overview.data?.repository.defaultBranch ?? '')}</small>
          </div>
        </div>

        <p className="sb-caption">Ship confidence</p>
        <NavLink
          to={`${base}/delivery`}
          className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}
        >
          <Workflow size={16} />
          <span className="sb-label">Delivery</span>
          {failures > 0 && <span className="sb-link-badge">{failures}</span>}
        </NavLink>
        <NavLink to={`${base}/impact`} className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
          <Radar size={16} />
          <span className="sb-label">Change impact</span>
        </NavLink>
        <NavLink to={`${base}/flakes`} className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
          <FlaskConical size={16} />
          <span className="sb-label">Flaky tests</span>
        </NavLink>

        <p className="sb-caption">Evidence</p>
        <NavLink to="/benchmark" className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
          <Target size={16} />
          <span className="sb-label">Diagnosis accuracy</span>
        </NavLink>
        <NavLink to="/repositories" className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
          <GitBranch size={16} />
          <span className="sb-label">Repositories</span>
        </NavLink>
        <NavLink to="/documentation" className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
          <BookOpen size={16} />
          <span className="sb-label">Documentation</span>
        </NavLink>

        {!collapsed && (
          <details className="sb-more">
            <summary>
              More tools <ChevronDown size={13} style={{ marginLeft: 'auto' }} />
            </summary>
            <NavLink to="/investigations" className="sb-link">
              Release rehearsal
            </NavLink>
            <NavLink to="/incidents" className="sb-link">
              Incident examples
            </NavLink>
            <NavLink to="/services" className="sb-link">
              Service registry
            </NavLink>
            <NavLink to="/agents" className="sb-link">
              Agent activity
            </NavLink>
            <NavLink to="/evaluations" className="sb-link">
              Evaluations
            </NavLink>
          </details>
        )}

        <div className="sb-foot">
          <NavLink
            to={auth.data?.data.user ? '/account' : '/login'}
            className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}
          >
            <UserCircle size={16} />
            <span className="sb-label">
              {auth.data?.data.user ? (auth.data.data.user.name ?? 'Account') : 'Sign in'}
            </span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
            <Settings size={16} />
            <span className="sb-label">Settings</span>
          </NavLink>
          <button
            type="button"
            className="sb-link"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            <span className="sb-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn sb-toggle-mobile"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to={`${base}/delivery`} className="truncate">
              {overview.data?.repository.fullName ?? 'Workspace'}
            </Link>
            <span className="crumbs-sep">/</span>
            <strong>{CRUMB_LABELS[leaf] ?? leaf}</strong>
          </nav>
          <div className="topbar-right">
            <span className="api-state" title={health.isSuccess ? 'API reachable' : 'API unreachable'}>
              <i className={`dot dot-${health.isSuccess ? 'pass' : health.isFetching ? 'run' : 'fail'}`} />
              {health.isSuccess ? 'API connected' : health.isFetching ? 'Connecting' : 'API offline'}
            </span>
          </div>
        </header>

        {isDemo && (
          <div className="demo-bar">
            <span className="badge badge-brand">Live demo</span>
            <span>
              <strong>northwind/commerce-platform</strong> is a seeded five-service monorepo with a real
              pipeline history. Every root cause you see was computed by the classifier, not written by hand.
            </span>
            <Link className="link" to={auth.data?.data.user ? '/repositories' : '/login?mode=signup'}>
              {auth.data?.data.user ? 'Connect your own repository' : 'Sign in to use your own repository'}
            </Link>
          </div>
        )}

        <main id="main" className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
