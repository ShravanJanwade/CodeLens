import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, GitBranch, ShieldCheck, Workflow } from 'lucide-react';

export default function Documentation() {
  return (
    <div className="max-w-4xl space-y-7 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-accent">
          <BookOpen className="w-5 h-5" />
          <span className="text-xs font-medium uppercase tracking-wider">CodeLens guide</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          Repository intelligence, without the black box
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Connect your repositories, understand their source, investigate changes, and follow the evidence
          from GitHub checks and deployments.
        </p>
      </div>
      <section className="card">
        <h2 className="text-base font-semibold text-text-primary">Start here</h2>
        <ol className="mt-3 space-y-3 text-sm text-text-secondary">
          <li>
            <span className="mr-2 text-accent">1.</span>Sign in, connect GitHub in Account & GitHub, and
            select a repository from{' '}
            <Link className="text-accent-text hover:underline" to="/repositories">
              Repositories
            </Link>
            . Public repository URLs also work without a GitHub connection.
          </li>
          <li>
            <span className="mr-2 text-accent">2.</span>Sync branches, select a live branch and index its
            latest code. The Code tab opens when indexing completes. Expand folders, open a file, then select
            text or Shift-click line numbers to ask about a range. Use Ask about this file for the complete
            file.
          </li>
          <li>
            <span className="mr-2 text-accent">3.</span>Select an immutable revision, open a source line, and
            use Ask CodeLens for questions with navigable source references. The assistant shows the actual
            provider and model configured on your server, plus the code attached to your question.
          </li>
          <li>
            <span className="mr-2 text-accent">4.</span>Open Investigations to compare your own commits and
            matching CI evidence, or explore the completed TaskForge example. CI/CD monitoring shows
            workflows, deployments, pull requests and accessible security alerts.
          </li>
        </ol>
      </section>
      <div className="equal-columns">
        <section className="surface-panel">
          <h2>What are findings?</h2>
          <p className="subtle-text">
            Findings are review suggestions attached to specific source lines. They help you prioritize code
            to inspect; a static warning alone does not prove a runtime bug. Open Findings & review, choose
            Review code, or ask AI to explain it before deciding on a change.
          </p>
        </section>
        <section className="surface-panel">
          <h2>What are file connections?</h2>
          <p className="subtle-text">
            File connections show imports between indexed files. Imports from shows what a file uses; Used by
            shows the files that may be affected when you change it. This is an impact map, not a list of
            installed packages or a complete runtime call graph.
          </p>
        </section>
      </div>
      <section className="surface-panel">
        <h2>Your investigation, step by step</h2>
        <p className="subtle-text">
          Choose revisions → Review changes → Checks & journeys → Decide next steps. The latest-commit
          shortcut selects a commit and its parent. Review the changed files, inspect CI jobs for the exact
          candidate commit, then follow the recommendations or prepare a draft PR. Saved investigations can be
          reopened from the repository's Investigations tab.
        </p>
        <p className="subtle-text mt-3">
          Your application's journeys come from tests you configure in its CI. Missing checks appear as
          missing evidence. The TaskForge example separately demonstrates instrumented HTTP journeys, database
          measurements, and a correction tested again.
        </p>
      </section>
      <section className="surface-panel">
        <h2>Release Rehearsal</h2>
        <p className="subtle-text">
          The initial executor supports the prepared TaskForge application. Each run records actual HTTP
          requests, SQL counts and durations, immutable source revisions and test settings. A small page-size
          probe investigates repeated-query behavior; supplied corrections and worker configurations are
          measured again.
        </p>
        <div className="notice mt-4">
          A completed execution can contain passed, failed, and inconclusive checks. Timing differences are
          scoped to the recorded environment. Previous findings on another revision require revalidation.
        </div>
        <Link className="btn-primary mt-5" to="/recorded">
          Explore a recorded investigation <ArrowRight size={14} />
        </Link>
        <p className="subtle-text mt-4">
          Recorded results are immediately available without AI or login. Fresh runs require the local
          executor or configured public CI integration and have explicit concurrency and daily limits.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card">
          <GitBranch className="w-5 h-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">Repository workspace</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            The tree, source content, summaries, imports, complexity, findings, and graph edges are stored
            from the analysis run—never invented by the UI.
          </p>
        </section>
        <section className="card">
          <Workflow className="w-5 h-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">Sync & analysis</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Sync branches refreshes GitHub's live branch list. Index latest code captures the selected
            branch's current commit. Historical snapshots retain their original source.
          </p>
        </section>
        <section className="card">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">Safe agent boundary</h2>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            The assistant cites indexed source. You review proposed file changes before the app creates a
            draft pull request. Merging and deployment remain explicit repository actions.
          </p>
        </section>
      </div>
      <section className="card">
        <h2 className="text-base font-semibold text-text-primary">Keeping GitHub current</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Sync branches and index the selected branch for a manual refresh. For automatic updates, open CI/CD
          monitoring → Webhooks and connect a signed webhook once your app has a public HTTPS URL. CodeLens
          configures a separate endpoint and secret for that repository. Push events refresh the affected
          branch; workflow and deployment events remain visible as delivery evidence.
        </p>
      </section>
      <section className="card">
        <h2 className="text-base font-semibold text-text-primary">Run locally</h2>
        <pre className="mt-3 overflow-auto rounded bg-surface-3 p-4 text-xs text-text-secondary">
          corepack pnpm install{`\n`}corepack pnpm run setup{`\n`}corepack pnpm dev
        </pre>
        <p className="mt-3 text-xs text-text-muted">
          Open http://127.0.0.1:3010 after both services report ready. See <code>README.md</code> and{' '}
          <code>docs/deploy-full-workspace.md</code> for OAuth, environment variables and deployment
          configuration.
        </p>
      </section>
      <Link to="/repositories" className="btn-primary inline-flex text-xs">
        Open repositories <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
