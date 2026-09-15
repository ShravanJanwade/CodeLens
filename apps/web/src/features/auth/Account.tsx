import { Github, LogOut, Link2, Unplug } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from './Auth';
import { api } from '../api';
import { API_BASE } from '../../api';
import { PageHeading, ErrorState, Loading, Status } from '../../components/ui';
export default function Account() {
  const auth = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      client.clear();
      navigate('/');
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api('/integrations/github', { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['auth'] }),
  });
  if (auth.isLoading) return <Loading />;
  if (auth.isError) return <ErrorState error={auth.error} />;
  const data = auth.data?.data;
  return (
    <div className="workspace-page">
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Account & connections"
        description="Your identity, your repository access, and the tools connected to CodeLens."
      />
      {params.get('error') && (
        <div className="notice warning">
          This GitHub account is already connected to another CodeLens account.
        </div>
      )}
      <div className="two-column">
        <section className="surface-panel">
          <span className="eyebrow">PROFILE</span>
          <h2>{data.user.name}</h2>
          <p className="subtle-text">{data.user.email}</p>
          <p className="subtle-text mt-4">Your connected repositories are scoped to this account.</p>
          <button className="btn-secondary mt-5" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut size={15} /> Sign out
          </button>
          {logout.isError && <ErrorState error={logout.error} />}
        </section>
        <section className="surface-panel">
          <div className="inline-actions">
            <Github size={23} />
            <h2>GitHub</h2>
            <Status value={data.github ? 'connected' : 'not connected'} />
          </div>
          <p className="subtle-text mt-4">
            {data.github
              ? `Connected as @${data.github.login}.`
              : 'Connect your GitHub account to choose repositories, sync branches, and see delivery evidence.'}
          </p>
          <p className="subtle-text mt-3">
            Repository access lets CodeLens read your public and private repositories and create draft pull
            requests or webhooks when you request them. GitHub shows the requested permissions before you
            authorize.
          </p>
          <div className="inline-actions mt-5">
            {data.githubOAuthAvailable ? (
              <a className="btn-primary" href={`${API_BASE}/auth/github/start?purpose=connect`}>
                <Link2 size={15} />
                {data.github ? 'Review / extend GitHub access' : 'Connect GitHub'}
              </a>
            ) : (
              <div className="notice">
                GitHub OAuth is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET,
                with this callback URL: <code className="block mt-3">{data.callbackUrl}</code>
              </div>
            )}
            {data.github && (
              <button
                className="btn-secondary"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                <Unplug size={15} /> Disconnect
              </button>
            )}
          </div>
          {disconnect.isError && <ErrorState error={disconnect.error} />}
          <Link className="text-link mt-5" to="/repositories">
            Open your repositories →
          </Link>
        </section>
      </div>
    </div>
  );
}
