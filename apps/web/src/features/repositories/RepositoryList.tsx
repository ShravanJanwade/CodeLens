import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  FolderGit2,
  Clock3,
  FlaskConical,
  Code2,
  X,
  RefreshCw,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRepositories, addRepository, analyzeRepository, API_BASE } from '../../api';
import { PageHeading, ErrorState, EmptyState, Loading, Status } from '../../components/ui';
import { useAuth } from '../auth/Auth';
import { api } from '../api';
export default function Repositories() {
  const auth = useAuth(),
    [githubPage, setGithubPage] = useState(1);
  const [connecting, setConnecting] = useState(false),
    [url, setUrl] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const navigate = useNavigate(),
    client = useQueryClient();
  const query = useQuery({ queryKey: ['repositories'], queryFn: fetchRepositories, refetchInterval: 30_000 });
  const githubRepos = useQuery({
    queryKey: ['github-repositories', githubPage],
    queryFn: () => api(`/integrations/github/repositories?page=${githubPage}`),
    enabled: connecting && !!auth.data?.data.github,
  });
  const connect = useMutation({
    mutationFn: async () => {
      const result = await addRepository(url);
      return result;
    },
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: ['repositories'] });
      setConnecting(false);
      navigate(`/repositories/${result.data.id}`);
    },
  });
  useEffect(() => {
    if (!connecting) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !connect.isPending) setConnecting(false);
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not([disabled]), [role="dialog"] input:not([disabled]), [role="dialog"] a[href], [role="dialog"] select:not([disabled])',
        ),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [connecting, connect.isPending]);
  const fixture = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/fixture`);
      if (!r.ok) throw new Error('Could not prepare the example. Check that the API is running.');
      return r.json();
    },
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ['repositories'] });
      navigate(`/repositories/${r.data.repositoryId}`);
    },
  });
  const repos = query.data?.data ?? [];
  const visible = repos.filter(
    (r: any) =>
      `${r.fullName} ${r.language ?? ''}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || (filter === 'indexed' ? !!r.lastAnalyzedAt : !r.lastAnalyzedAt)),
  );
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="YOUR DEVELOPER WORKSPACE"
        title="Your code. In focus."
        description="Explore your repositories. Understand the changes. Ship with evidence."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              connect.reset();
              setConnecting(true);
            }}
          >
            <Plus size={16} />
            Connect repository
          </button>
        }
      />
      <section className="workspace-feature">
        <div className="feature-copy">
          <span className="feature-tag">
            <Code2 size={14} /> YOUR NEXT STEP
          </span>
          <h2>
            Understand a file.
            <br />
            Investigate a change.
          </h2>
          <p>
            Choose a repository below, index its branch, and open a file. Ask about unfamiliar code, see which
            files depend on it, then compare a change with its actual GitHub checks.
          </p>
          <div className="feature-actions">
            <button
              className="btn-primary"
              onClick={() => {
                const own = repos.find((repo: any) => repo.id !== 'taskforge');
                if (own) navigate(`/repositories/${own.id}${own.lastAnalyzedAt ? '?tab=code' : ''}`);
                else setConnecting(true);
              }}
            >
              {repos.some((repo: any) => repo.id !== 'taskforge')
                ? 'Continue with your code'
                : 'Connect your first repository'}
              <ArrowRight size={15} />
            </button>
            <Link to="/recorded" className="feature-link">
              View recorded investigation <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className="feature-diagram" aria-label="Repository to release evidence workflow">
          <div className="diagram-top">
            <span className="code-window-dot" />
            <span className="code-window-dot" />
            <span className="code-window-dot" />
            <span>repository → release</span>
          </div>
          <div className="diagram-flow">
            <span className="diagram-node">
              <FolderGit2 size={24} />
            </span>
            <div className="diagram-connector" />
            <span className="diagram-node primary">
              <Code2 size={25} />
            </span>
            <div className="diagram-connector" />
            <span className="diagram-node">
              <FlaskConical size={24} />
            </span>
          </div>
          <div className="diagram-labels">
            <span>Understand</span>
            <span>Compare</span>
            <span>Verify</span>
          </div>
          <div className="diagram-caption">
            <span className="mini-dot" />
            Source context. Reviewable evidence.
          </div>
          <button
            className="prepared-label text-link"
            disabled={fixture.isPending}
            onClick={() => fixture.mutate()}
          >
            {fixture.isPending ? 'Preparing…' : 'Try the TaskForge example workspace →'}
          </button>
        </div>
      </section>
      {fixture.isError && <ErrorState error={fixture.error} retry={() => fixture.mutate()} />}
      <div className="workspace-stats">
        <div>
          <FolderGit2 size={18} />
          <strong>{query.isSuccess ? repos.length : '—'}</strong>
          <span>repositories</span>
        </div>
        <div>
          <Code2 size={18} />
          <strong>{query.isSuccess ? repos.filter((r: any) => r.lastAnalyzedAt).length : '—'}</strong>
          <span>indexed</span>
        </div>
        <div>
          <GitBranch size={18} />
          <strong>
            {query.isSuccess ? new Set(repos.map((r: any) => r.language).filter(Boolean)).size : '—'}
          </strong>
          <span>languages</span>
        </div>
        <div className="stats-note">
          <span className="mini-dot" />
          Built around your repositories
        </div>
      </div>
      <section>
        <div className="section-title-row">
          <div>
            <h2>
              Repositories <span className="count-badge">{repos.length}</span>
            </h2>
            <p>Your starting point for code intelligence.</p>
          </div>
          <button className="icon-button" aria-label="Refresh repositories" onClick={() => query.refetch()}>
            <RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="repository-toolbar">
          <div className="filter-tabs" aria-label="Filter repositories">
            {['all', 'indexed', 'pending'].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                className={filter === f ? 'active' : ''}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All repositories' : f === 'indexed' ? 'Indexed' : 'Not indexed'}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search repositories"
              placeholder="Find a repository…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {query.isLoading ? (
          <Loading label="Loading your repositories…" />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : !visible.length ? (
          <EmptyState
            title={search ? 'No matching repositories' : 'Start with a repository'}
            description={
              search
                ? 'Try another name or language.'
                : 'Connect a public GitHub repository or explore the prepared TaskForge example.'
            }
            action={
              <button className="btn-secondary" onClick={() => setConnecting(true)}>
                <Plus size={15} />
                Connect repository
              </button>
            }
          />
        ) : (
          <div className="repository-grid">
            {visible.map((repo: any) => (
              <Link className="repository-card" key={repo.id} to={`/repositories/${repo.id}`}>
                <div className="repo-card-top">
                  <span className={`repo-icon ${repo.id === 'taskforge' ? 'fixture-icon' : ''}`}>
                    {repo.id === 'taskforge' ? <FlaskConical size={21} /> : <FolderGit2 size={21} />}
                  </span>
                  <Status value={repo.lastAnalyzedAt ? 'indexed' : 'pending'} />
                  <ArrowUpRight className="repo-open" size={18} />
                </div>
                <h3>{repo.name}</h3>
                <span className="repo-owner">{repo.fullName}</span>
                <p className="repo-description">
                  {repo.description ||
                    'Connect source, explore dependencies, and ask questions grounded in your code.'}
                </p>
                <div className="repo-meta">
                  <span>
                    <i className="language-dot" />
                    {repo.language || 'Not detected'}
                  </span>
                  <span>
                    <GitBranch size={13} />
                    {repo.defaultBranch}
                  </span>
                  {repo.id === 'taskforge' && <span className="example-label">EXAMPLE</span>}
                </div>
                <div className="repo-card-footer">
                  <span>
                    <Clock3 size={13} />
                    {repo.lastAnalyzedAt
                      ? `Indexed ${new Date(repo.lastAnalyzedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : 'Ready to index'}
                  </span>
                  <span>
                    Open repository <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="workflow-guide">
        <div>
          <span className="eyebrow">A CONNECTED WORKFLOW</span>
          <h2>From the first question to the next release.</h2>
        </div>
        <div className="guide-steps">
          {[
            ['01', 'Explore the source', 'Files, symbols, and imports at a specific revision.'],
            ['02', 'Understand the change', 'Ask questions with navigable source references.'],
            ['03', 'Rehearse the release', 'Compare behavior and inspect measured evidence.'],
          ].map(([n, title, description]) => (
            <div key={n}>
              <span>{n}</span>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
      {connecting && (
        <div
          className="modal-backdrop"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !connect.isPending) setConnecting(false);
          }}
        >
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="connect-title">
            <div className="modal-title">
              <span className="repo-icon">
                <FolderGit2 size={22} />
              </span>
              <button
                className="icon-button"
                aria-label="Close dialog"
                disabled={connect.isPending}
                onClick={() => setConnecting(false)}
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="connect-title">Bring your code into focus.</h2>
            <p>
              Choose from your GitHub account or enter a repository URL. Select a branch in the workspace
              before indexing.
            </p>
            {auth.data?.data.github ? (
              <div className="github-picker">
                <div className="section-title-row">
                  <strong>@{auth.data.data.github.login}</strong>
                  <button className="text-link" onClick={() => githubRepos.refetch()}>
                    Refresh GitHub
                  </button>
                </div>
                {githubRepos.isLoading ? (
                  <Loading label="Loading your GitHub repositories…" />
                ) : githubRepos.isError ? (
                  <ErrorState error={githubRepos.error} />
                ) : (
                  <>
                    <div className="github-repo-options">
                      {githubRepos.data?.data.map((r: any) => (
                        <button
                          className={`github-repo-option ${url === r.fullName ? 'selected' : ''}`}
                          key={r.fullName}
                          onClick={() => setUrl(r.fullName)}
                        >
                          <span>
                            {r.fullName}
                            <small>
                              {r.defaultBranch} · {r.private ? 'private' : 'public'}
                            </small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </div>
                    <div className="inline-actions mt-3">
                      <button
                        className="text-link"
                        disabled={githubPage === 1}
                        onClick={() => setGithubPage((p) => p - 1)}
                      >
                        Previous
                      </button>
                      <small className="subtle-text">Page {githubPage}</small>
                      <button
                        className="text-link"
                        disabled={!githubRepos.data?.hasMore}
                        onClick={() => setGithubPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="notice">
                <Link className="text-link" to="/account">
                  Connect GitHub to browse your repositories →
                </Link>
                <p>You can also add a public repository by URL.</p>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                connect.mutate();
              }}
            >
              <label className="field-label">
                GitHub repository
                <input
                  autoFocus
                  className="input"
                  placeholder="https://github.com/owner/repository"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  maxLength={200}
                />
              </label>
              <p className="field-hint">
                Public or authorized private repositories · up to 500 text files · 25 MB indexed content
              </p>
              {connect.isError && <ErrorState error={connect.error} />}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={connect.isPending}
                  onClick={() => setConnecting(false)}
                >
                  Cancel
                </button>
                <button className="btn-primary" disabled={connect.isPending}>
                  {connect.isPending ? 'Connecting…' : 'Connect repository'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
