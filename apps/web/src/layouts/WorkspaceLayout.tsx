import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Settings,
  GitBranch,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronDown,
  FlaskConical,
  CircleHelp,
  Command,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../api';
import { Brand } from '../components/ui';
import { useAuth } from '../features/auth/Auth';
export function AppLayout() {
  const auth = useAuth();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false);
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('API unavailable');
      return r.json();
    },
    refetchInterval: 60_000,
    retry: 1,
  });
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />
      )}
      <aside className={`app-sidebar ${mobile ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand compact={collapsed} />
          <button
            className="mobile-close icon-button"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">W</span>
          {!collapsed && (
            <>
              <div>
                <strong>{auth.data?.data.user?.name ?? 'Explore CodeLens'}</strong>
                <small>Code intelligence</small>
              </div>
              <ChevronDown size={14} />
            </>
          )}
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {!collapsed && <p className="nav-caption">WORKSPACE</p>}
          <NavLink
            to="/repositories"
            className={({ isActive }) => `sidebar-link ${isActive ? 'selected' : ''}`}
            title="Repositories"
          >
            <GitBranch size={18} />
            {!collapsed && (
              <>
                Repositories
                <span className="nav-active-dot" />
              </>
            )}
          </NavLink>
          <NavLink
            to="/investigations"
            className={({ isActive }) => `sidebar-link ${isActive ? 'selected' : ''}`}
            title="Investigations"
          >
            <FlaskConical size={18} />
            {!collapsed && 'Investigations'}
          </NavLink>
          <NavLink
            to="/documentation"
            className={({ isActive }) => `sidebar-link ${isActive ? 'selected' : ''}`}
            title="Documentation"
          >
            <BookOpen size={18} />
            {!collapsed && 'Documentation'}
          </NavLink>
          {!collapsed && auth.data?.data.user && (
            <details className="secondary-tools">
              <summary>
                More tools <ChevronDown size={13} />
              </summary>
              <NavLink to="/incidents">Incident examples</NavLink>
              <NavLink to="/services">Services</NavLink>
              <NavLink to="/agents">Agent activity</NavLink>
              <NavLink to="/evaluations">Evaluations</NavLink>
              <NavLink to="/demo">Incident simulator</NavLink>
            </details>
          )}
        </nav>
        {!collapsed && (
          <div className="sidebar-note">
            <span className="note-icon">
              <FlaskConical size={18} />
            </span>
            <strong>Understand. Then verify.</strong>
            <p>Follow a code change from source to measured evidence.</p>
            <Link to="/recorded">
              Explore the example <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <div className="sidebar-bottom">
          <NavLink className="sidebar-link" to={auth.data?.data.user ? '/account' : '/login'} title="Account">
            <Command size={18} />
            {!collapsed && (auth.data?.data.user ? 'Account & GitHub' : 'Sign in')}
          </NavLink>
          <NavLink className="sidebar-link" to="/settings" title="Settings">
            <Settings size={18} />
            {!collapsed && 'Settings'}
          </NavLink>
          <button
            className="sidebar-link collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}{' '}
            {!collapsed && 'Collapse sidebar'}
          </button>
          <div className="profile-row">
            <span className="profile-avatar">
              <Command size={15} />
            </span>
            {!collapsed && (
              <div>
                <strong>{auth.data?.data.user?.name ?? 'Guest explorer'}</strong>
                <small>
                  {auth.data?.data.github
                    ? `GitHub · @${auth.data.data.github.login}`
                    : auth.data?.data.user
                      ? 'Personal workspace'
                      : 'Recorded evidence & examples'}
                </small>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {location.pathname.startsWith('/repositories/')
                ? 'Repository'
                : location.pathname.startsWith('/recorded')
                  ? 'Recorded investigation'
                  : location.pathname.split('/')[1]?.replaceAll('-', ' ') || 'Repositories'}
            </strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`connection-state ${health.isSuccess ? 'connected' : ''}`}
              title={
                health.isSuccess ? 'API health check succeeded' : 'API connection has not been established'
              }
            >
              <i />
              {health.isSuccess ? 'API connected' : health.isFetching ? 'Connecting' : 'API offline'}
            </span>
            <Link to="/documentation" className="icon-button" aria-label="Help">
              <CircleHelp size={18} />
            </Link>
          </div>
        </header>
        {!auth.data?.data.user && (
          <div className="preview-notice">
            <span>Public preview · recorded example and documentation</span>
            <Link className="text-link" to="/login">
              Sign in to use your own repository →
            </Link>
          </div>
        )}
        <main id="main-content" className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>CodeLens · Repository intelligence</span>
          <span>Source to certainty, with evidence.</span>
        </footer>
      </div>
    </div>
  );
}
