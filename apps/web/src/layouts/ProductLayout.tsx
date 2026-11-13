import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  FlaskConical,
  Github,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Settings,
  Target,
  Workflow,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/Auth';
import { useDeliveryOverview } from '../features/delivery/queries';
import { signInToActHref, useActionAccess } from '../features/delivery/actions';
import { DEMO_REPO, LIVE_REPO } from '../features/delivery/types';
import { relative } from '../features/delivery/format';
import { LogoMark } from '../components/ui';

/**
 * Shell for the product: the delivery views of one repository.
 *
 * Navigation follows the questions the product answers (is it red, why,
 * what does a change touch, which failures are noise) and keeps the
 * older workspace tools out of the way under "More".
 */

const CRUMB_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  runs: 'Run',
  impact: 'Change impact',
  flakes: 'Flaky tests',
  benchmark: 'Diagnosis accuracy',
  documentation: 'Documentation',
};

export default function ProductLayout() {
  const auth = useAuth();
  const location = useLocation();
  const params = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const repositoryId = params.repoId ?? DEMO_REPO;
  const isDemo = repositoryId === DEMO_REPO;
  const isLive = repositoryId === LIVE_REPO;

  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Only the failure count and the repository name come from here; a
  // failure must not take the shell down with it.
  const overview = useDeliveryOverview(repositoryId);
  const access = useActionAccess(repositoryId);
  const failures = overview.data?.runs.filter((r) => r.status === 'failed').length ?? 0;
  const sync = overview.data?.sync;
  const user = auth.data?.data.user as { name?: string; avatarUrl?: string } | null | undefined;

  const base = `/r/${encodeURIComponent(repositoryId)}`;
  const segments = location.pathname.split('/').filter(Boolean);
  const leaf = segments.find((s) => CRUMB_LABELS[s]) ?? 'delivery';
  const runCrumb = leaf === 'runs' ? segments[segments.indexOf('runs') + 1] : null;
  const link = ({ isActive }: { isActive: boolean }) => `sb-link ${isActive ? 'is-active' : ''}`;

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
          <Link to="/" className="brand" aria-label="CodeLens home">
            <LogoMark />
            {!collapsed && <span>CodeLens</span>}
          </Link>
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

        <div className="sb-scope" title={overview.data?.repository.fullName ?? repositoryId}>
          <span className="sb-scope-label">
            {isLive ? 'Live example' : isDemo ? 'Demo workspace' : 'Repository'}
          </span>
          <strong className="truncate">{overview.data?.repository.fullName ?? '…'}</strong>
        </div>

        <nav className="sb-nav" aria-label="Product">
          <NavLink to={`${base}/delivery`} className={link}>
            <Workflow size={16} />
            <span className="sb-label">Delivery</span>
            {failures > 0 && <span className="sb-count">{failures}</span>}
          </NavLink>
          <NavLink to={`${base}/flakes`} className={link}>
            <FlaskConical size={16} />
            <span className="sb-label">Flaky tests</span>
          </NavLink>
          <NavLink to={`${base}/impact`} className={link}>
            <Radar size={16} />
            <span className="sb-label">Change impact</span>
          </NavLink>

          <p className="sb-caption">Engine</p>
          <NavLink to="/benchmark" className={link}>
            <Target size={16} />
            <span className="sb-label">Diagnosis accuracy</span>
          </NavLink>
          <NavLink to="/documentation" className={link}>
            <BookOpen size={16} />
            <span className="sb-label">Documentation</span>
          </NavLink>

          <p className="sb-caption">Examples</p>
          <NavLink
            to={`/r/${LIVE_REPO}/delivery`}
            className={() => `sb-link ${isLive ? 'is-active-soft' : ''}`}
          >
            <span className="sb-glyph">
              <i className="dot dot-pass" />
            </span>
            <span className="sb-label">Live repository</span>
          </NavLink>
          <NavLink
            to={`/r/${DEMO_REPO}/delivery`}
            className={() => `sb-link ${isDemo ? 'is-active-soft' : ''}`}
          >
            <span className="sb-glyph">
              <i className="dot dot-idle" />
            </span>
            <span className="sb-label">Recorded demo</span>
          </NavLink>

          {!collapsed && (
            <details className="sb-more">
              <summary>
                More tools <ChevronDown size={13} />
              </summary>
              <NavLink to="/repositories" className="sb-link">
                Your repositories
              </NavLink>
              <NavLink to="/investigations" className="sb-link">
                Release rehearsal
              </NavLink>
              <NavLink to="/incidents" className="sb-link">
                Incident examples
              </NavLink>
              <NavLink to="/agents" className="sb-link">
                Agent activity
              </NavLink>
            </details>
          )}
        </nav>

        <div className="sb-foot">
          {user ? (
            <NavLink to="/account" className={link} title="Account">
              {user.avatarUrl ? (
                <img className="sb-avatar" src={user.avatarUrl} alt="" />
              ) : (
                <span className="sb-avatar">{(user.name ?? '?').slice(0, 1)}</span>
              )}
              <span className="sb-label truncate">
                {access.data?.github?.login ?? user.name ?? 'Account'}
              </span>
            </NavLink>
          ) : (
            <a className="sb-link" href={signInToActHref()}>
              <Github size={16} />
              <span className="sb-label">Sign in with GitHub</span>
            </a>
          )}
          <NavLink to="/settings" className={link}>
            <Settings size={16} />
            <span className="sb-label">Settings</span>
          </NavLink>
          <button
            type="button"
            className="sb-link sb-collapse"
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
              {overview.data?.repository.fullName.split('/').pop() ?? 'Repository'}
            </Link>
            <span className="crumbs-sep">/</span>
            {runCrumb ? (
              <>
                <Link to={`${base}/delivery`}>Delivery</Link>
                <span className="crumbs-sep">/</span>
                <strong>Run</strong>
              </>
            ) : (
              <strong>{CRUMB_LABELS[leaf] ?? leaf}</strong>
            )}
          </nav>
          <div className="topbar-right">
            {sync && (
              <span className="sync-state" title={sync.error ?? undefined}>
                {sync.running ? (
                  <>
                    <span className="spinner" /> Syncing with GitHub
                  </>
                ) : sync.error ? (
                  <>
                    <i className="dot dot-warn" /> Last sync failed
                  </>
                ) : (
                  <>
                    <i className="dot dot-pass" /> Synced {relative(sync.finishedAt)}
                  </>
                )}
              </span>
            )}
            {sync?.url && (
              <a
                className="btn btn-ghost btn-sm"
                href={sync.url.replace(/\/actions$/, '')}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={14} /> <span className="hide-sm">GitHub</span>
              </a>
            )}
          </div>
        </header>

        {(isLive || isDemo) && (
          <div className="context-bar">
            {isLive ? (
              <>
                <span className="context-tag is-live">Live</span>
                <span className="context-text">
                  Real GitHub Actions runs from{' '}
                  <a
                    href={`https://github.com/${overview.data?.repository.fullName ?? ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {overview.data?.repository.fullName ?? 'the live repository'}
                  </a>
                  , deploying to three Azure regions.{' '}
                  {access.data?.canAct
                    ? `You're signed in as @${access.data.github?.login} and can run actions here.`
                    : 'Anyone can look; actions are for its maintainers.'}
                </span>
              </>
            ) : (
              <>
                <span className="context-tag">Demo</span>
                <span className="context-text">
                  A seeded monorepo with a recorded pipeline history. Every root cause is computed by the
                  classifier, not written by hand.{' '}
                  <Link to={`/r/${LIVE_REPO}/delivery`}>See it on a real repository</Link>.
                </span>
              </>
            )}
          </div>
        )}

        <main id="main" className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
