import { useState } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, ArrowRight, ArrowLeft, LockKeyhole, GitBranch, ScanLine } from 'lucide-react';
import { api } from '../api';
import { API_BASE } from '../../api';
import { Brand, ErrorState } from '../../components/ui';
import { useAuth } from './Auth';
const errors: Record<string, string> = {
  github_setup:
    'GitHub sign-in needs the server’s OAuth app configuration. Email and password sign-in is available now.',
  oauth_state: 'This GitHub sign-in could not be verified. Start again from this page.',
  oauth_expired: 'GitHub sign-in expired or was cancelled. Please try again.',
  github_failed: 'GitHub sign-in did not complete. Check the OAuth configuration and try again.',
  link_existing:
    'An account already uses your GitHub email. Sign in with your password, then connect GitHub from Account.',
};
export default function Login() {
  const [params] = useSearchParams(),
    [signup, setSignup] = useState(params.get('mode') === 'signup'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState('');
  const auth = useAuth(),
    client = useQueryClient(),
    navigate = useNavigate();
  const submit = useMutation({
    mutationFn: () =>
      api(`/auth/${signup ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      }),
    onSuccess: async () => {
      client.clear();
      await client.invalidateQueries({ queryKey: ['auth'] });
      const next = params.get('next');
      navigate(
        next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')
          ? next
          : '/repositories',
        { replace: true },
      );
    },
  });
  if (auth.data?.data.user) return <Navigate to="/repositories" replace />;
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">A CLEARER PATH TO YOUR NEXT RELEASE</span>
          <h1>
            Know your code.
            <br />
            <em>Own the outcome.</em>
          </h1>
          <p>
            One workspace for your repository, the changes you’re making, and the evidence you need to ship.
          </p>
          <div className="auth-benefits">
            {[
              [GitBranch, 'Your repositories. Your branches.'],
              [ScanLine, 'Source-linked answers and investigations.'],
              [LockKeyhole, 'Account-scoped access. Credentials stay on the server.'],
            ].map(([Icon, label]: any) => (
              <div key={label}>
                <Icon size={19} />
                {label}
              </div>
            ))}
          </div>
        </div>
        <Link to="/" className="muted-link">
          <ArrowLeft size={14} /> Back to CodeLens
        </Link>
      </aside>
      <main className="auth-form-panel">
        <div className="auth-form-inner">
          <span className="eyebrow">WELCOME TO CODELENS</span>
          <h1>{signup ? 'Create your workspace.' : 'Welcome back.'}</h1>
          <p className="subtle-text">
            {signup
              ? 'Start with an account. Connect GitHub whenever you’re ready.'
              : 'Sign in to pick up where your code left off.'}
          </p>
          {params.get('error') && (
            <div className="notice warning" role="alert">
              {errors[params.get('error')!] ?? 'Sign-in could not be completed.'}
            </div>
          )}
          {auth.isError && <ErrorState error={auth.error} retry={() => auth.refetch()} />}
          {auth.data?.data.authenticationAvailable === false && (
            <div className="notice">
              This deployment serves the public recorded demo. Account workspaces require the Node API
              described in the deployment guide.
            </div>
          )}
          <a
            className={`btn-secondary oauth-button ${!auth.data?.data.githubOAuthAvailable ? 'unavailable' : ''}`}
            href={auth.data?.data.githubOAuthAvailable ? `${API_BASE}/auth/github/start` : undefined}
            aria-disabled={!auth.data?.data.githubOAuthAvailable}
          >
            <Github size={18} /> Continue with GitHub
          </a>
          {!auth.data?.data.githubOAuthAvailable && (
            <p className="subtle-text auth-hint">
              {auth.data?.data.authenticationAvailable === false
                ? 'Account sign-in is unavailable on this demo-only deployment.'
                : 'GitHub OAuth needs server setup. You can create an account with email below.'}
            </p>
          )}
          <div className="auth-divider">
            <span>or use email</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            {signup && (
              <label className="field-label">
                Your name
                <input
                  className="input"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label className="field-label">
              Email address
              <input
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label className="field-label">
              Password
              <input
                className="input"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                minLength={signup ? 12 : undefined}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {signup && <small>At least 12 characters.</small>}
            </label>
            {submit.isError && <ErrorState error={submit.error} />}
            <button
              className="btn-primary auth-submit"
              disabled={submit.isPending || auth.data?.data.authenticationAvailable === false}
            >
              {submit.isPending ? 'Opening your workspace…' : signup ? 'Create account' : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to CodeLens?'}{' '}
            <button
              className="text-link"
              onClick={() => {
                setSignup(!signup);
                submit.reset();
              }}
            >
              {signup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <Link to="/recorded" className="muted-link">
            Just exploring? View the recorded investigation <ArrowRight size={13} />
          </Link>
        </div>
      </main>
    </div>
  );
}
