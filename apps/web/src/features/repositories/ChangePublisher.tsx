import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { GitPullRequest, FilePlus2, Workflow, ArrowUpRight } from 'lucide-react';
import { api, repositoryPath } from '../api';
import { PageHeading, ErrorState, Loading } from '../../components/ui';
const workflow = `name: CodeLens CI
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: corepack enable
      - name: Install locked dependencies
        run: |
          if [ -f pnpm-lock.yaml ]; then corepack pnpm install --frozen-lockfile;
          elif [ -f yarn.lock ]; then corepack yarn install --immutable;
          else npm ci; fi
      - name: Type checks
        run: npm run typecheck --if-present
      - name: Tests
        run: npm run test --if-present
      - name: Production build
        run: npm run build --if-present
# Review these commands for your repository before merging.
# Add your application journeys and hosting provider's deployment job here.
# Deployment monitoring requires your provider to report GitHub Deployments.
`;
export default function ChangePublisher() {
  const { id = '' } = useParams(),
    [params] = useSearchParams(),
    [path, setPath] = useState(params.get('path') ?? ''),
    [branch, setBranch] = useState(''),
    [content, setContent] = useState(''),
    [original, setOriginal] = useState(''),
    [loaded, setLoaded] = useState<{ path: string; branch: string; sha: string } | null>(null),
    [title, setTitle] = useState(''),
    [review, setReview] = useState(false),
    [requestId] = useState(() => crypto.randomUUID());
  const branches = useQuery({
    queryKey: ['branches', id],
    queryFn: () => api(`${repositoryPath(id)}/branches`),
  });
  const selectedBranch = branch || branches.data?.data.defaultBranch || '',
    sha = branches.data?.data.branches.find((b: any) => b.name === selectedBranch)?.sha;
  const load = useMutation({
    mutationFn: () =>
      api(`${repositoryPath(id)}/github-file?path=${encodeURIComponent(path)}&revision=${sha}`),
    onSuccess: (r) => {
      setContent(r.data.content);
      setOriginal(r.data.content);
      setLoaded({ path, branch: selectedBranch, sha });
      setReview(false);
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`${repositoryPath(id)}/changes/publish`, {
        method: 'POST',
        body: JSON.stringify({
          requestId,
          title,
          baseBranch: loaded?.branch,
          expectedHead: loaded?.sha,
          files: [{ path: loaded?.path, content }],
          confirm: true,
        }),
      }),
  });
  const createFile = useMutation({
    mutationFn: async ({ filePath, value }: { filePath: string; value: string }) => {
      let before = '';
      try {
        const result = await api(
          `${repositoryPath(id)}/github-file?path=${encodeURIComponent(filePath)}&revision=${sha}`,
        );
        before = result.data.content;
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
      return { filePath, value, before, branch: selectedBranch, sha };
    },
    onSuccess: (result) => {
      setPath(result.filePath);
      setContent(result.value);
      setOriginal(result.before);
      setLoaded({ path: result.filePath, branch: result.branch, sha: result.sha });
      setReview(false);
    },
  });
  return (
    <div className="workspace-page">
      <Link className="muted-link" to={`/repositories/${id}`}>
        ← Repository workspace
      </Link>
      <PageHeading
        eyebrow="REVIEWED GITHUB CHANGES"
        title="Turn a finding into a draft."
        description="Prepare a source or workflow change, review its contents, and create a draft pull request on a new branch."
      />
      <section className="surface-panel">
        <div className="two-column">
          <label className="field-label">
            Base branch
            <select
              className="input"
              disabled={load.isPending || createFile.isPending || publish.isPending}
              value={selectedBranch}
              onChange={(e) => {
                setBranch(e.target.value);
                setLoaded(null);
                setReview(false);
              }}
            >
              {branches.data?.data.branches.map((b: any) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            File path
            <input
              className="input"
              disabled={load.isPending || createFile.isPending || publish.isPending}
              value={path}
              placeholder="src/app.ts"
              onChange={(e) => {
                setPath(e.target.value);
                setLoaded(null);
                setReview(false);
              }}
            />
          </label>
        </div>
        <div className="inline-actions">
          <button
            className="btn-secondary"
            disabled={!path || !sha || load.isPending || createFile.isPending || publish.isPending}
            onClick={() => load.mutate()}
          >
            {load.isPending ? 'Loading…' : 'Load existing file'}
          </button>
          <button
            className="btn-secondary"
            disabled={!path || !sha || createFile.isPending}
            onClick={() => createFile.mutate({ filePath: path, value: '' })}
          >
            <FilePlus2 size={15} /> New file
          </button>
          <button
            className="btn-secondary"
            disabled={!sha || createFile.isPending}
            onClick={() =>
              createFile.mutate({ filePath: '.github/workflows/codelens-ci.yml', value: workflow })
            }
          >
            <Workflow size={15} /> Start with a CI workflow
          </button>
        </div>
        {branches.isError && <ErrorState error={branches.error} retry={() => branches.refetch()} />}
        {load.isError && <ErrorState error={load.error} />}
        {createFile.isError && <ErrorState error={createFile.error} />}
      </section>
      {loaded && (
        <section className="surface-panel">
          <span className="eyebrow">
            {loaded.path} · BASE {loaded.sha.slice(0, 10)}
          </span>
          <label className="field-label">
            Pull request title
            <input
              className="input"
              maxLength={150}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setReview(false);
              }}
              placeholder="Describe the problem this change fixes"
            />
          </label>
          <label className="field-label">
            Proposed file contents
            <textarea
              className="input source-editor"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setReview(false);
              }}
              spellCheck={false}
            />
          </label>
          <div className="notice">
            Publishing creates a new branch and a draft pull request. Review the entire change and your
            repository’s checks before merging. If the base branch moves, CodeLens requires a fresh review.
          </div>
          <button
            className="btn-secondary mt-4"
            disabled={!title.trim() || content === original}
            onClick={() => setReview(!review)}
          >
            {review ? 'Back to editing' : 'Review before publishing'}
          </button>
          {review && (
            <div className="mt-5">
              <h2>Review: {title}</h2>
              <div className="two-column mt-4">
                <div>
                  <h3>Before</h3>
                  <pre className="evidence-json">{original || '(new file)'}</pre>
                </div>
                <div>
                  <h3>After</h3>
                  <pre className="evidence-json">{content}</pre>
                </div>
              </div>
              <button
                className="btn-primary mt-5"
                disabled={publish.isPending || publish.isSuccess}
                onClick={() => publish.mutate()}
              >
                <GitPullRequest size={16} />
                {publish.isPending ? 'Creating draft on GitHub…' : 'Create draft pull request on GitHub'}
              </button>
            </div>
          )}
          {publish.isError && <ErrorState error={publish.error} />}{' '}
          {publish.isSuccess && (
            <div className="notice mt-5">
              <strong>Draft pull request created</strong>
              <p>Branch: {publish.data.data.branch}</p>
              <a className="text-link" target="_blank" rel="noreferrer" href={publish.data.data.url}>
                Review on GitHub <ArrowUpRight size={15} />
              </a>
              <Link className="text-link ml-5" to={`/repositories/${id}/delivery`}>
                Follow CI checks
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
