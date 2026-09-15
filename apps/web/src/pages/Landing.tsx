import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  GitBranch,
  FileCode2,
  Workflow,
  ShieldCheck,
  Search,
  Check,
  ArrowDown,
  FlaskConical,
} from 'lucide-react';
import { Brand } from '../components/ui';
import { useAuth } from '../features/auth/Auth';
export default function Landing() {
  const auth = useAuth(),
    destination = auth.data?.data.user ? '/repositories' : '/login?mode=signup';
  return (
    <div className="marketing-page">
      <nav className="marketing-nav">
        <Brand />
        <div className="marketing-links">
          <a href="#why">Why CodeLens</a>
          <a href="#workflow">How it works</a>
          <Link to="/recorded">See the evidence</Link>
        </div>
        <div className="inline-actions">
          <Link className="marketing-signin" to="/login">
            Sign in
          </Link>
          <Link className="btn-primary" to={destination}>
            {auth.data?.data.user ? 'Open workspace' : 'Get started'}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </nav>
      <main>
        <section className="marketing-hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <i /> FROM SOURCE CODE TO SHIP CONFIDENCE
            </span>
            <h1>
              Understand the code.
              <br />
              See the change.
              <br />
              <em>Ship with evidence.</em>
            </h1>
            <p>
              Joining an unfamiliar codebase or reviewing a risky change? Explore the source, ask about exact
              lines, and connect a commit to its checks—all in one workspace.
            </p>
            <div className="hero-actions">
              <Link to={destination} className="btn-primary">
                Start your workspace <ArrowRight size={17} />
              </Link>
              <Link to="/recorded" className="hero-secondary">
                Explore a real investigation <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="hero-footnote">
              <Check size={14} /> Email or GitHub sign-in <span>·</span> Recorded example needs no account
            </div>
          </div>
          <div className="hero-product" aria-label="Illustration of the CodeLens workflow">
            <div className="product-window-top">
              <span>
                <i />
                <i />
                <i />
              </span>
              <small>YOUR REPOSITORY / ONE CONNECTED VIEW</small>
            </div>
            <div className="product-repo">
              <span className="repo-icon">
                <GitBranch size={23} />
              </span>
              <div>
                <strong>Your next release</strong>
                <small>Understand → investigate → verify</small>
              </div>
              <span className="product-pill">WORKFLOW</span>
            </div>
            <div className="product-source">
              <div>
                <FileCode2 size={14} /> Source context <span>01</span>
              </div>
              <p>
                <b>const</b> nextRelease = {'{'}
              </p>
              <p className="indent">
                repository: <em>yourCode</em>,
              </p>
              <p className="indent">
                revision: <em>selectedBranch</em>,
              </p>
              <p className="indent">
                decision: <em>evidence</em>
              </p>
              <p>{'};'}</p>
            </div>
            <div className="product-flow-arrow">
              <ArrowDown size={18} />
            </div>
            <div className="product-signal">
              <Workflow size={20} />
              <div>
                <strong>Follow the actual delivery</strong>
                <small>Workflow runs · deployments · pull requests</small>
              </div>
            </div>
            <div className="product-signal">
              <ShieldCheck size={20} />
              <div>
                <strong>Know what needs attention</strong>
                <small>Source references · findings · next steps</small>
              </div>
            </div>
            <div className="product-window-footer">
              A workflow illustration. Explore the example for measured results.
            </div>
          </div>
        </section>
        <section className="marketing-proof">
          <span>BUILT AROUND YOUR DEVELOPMENT WORKFLOW</span>
          <div>
            <GitBranch /> GitHub repositories
          </div>
          <div>
            <FileCode2 /> Source intelligence
          </div>
          <div>
            <Workflow /> CI/CD visibility
          </div>
          <div>
            <FlaskConical /> Release Rehearsal
          </div>
        </section>
        <section className="marketing-section" id="why">
          <div className="marketing-section-title">
            <span className="eyebrow">THE PROBLEM</span>
            <h2>
              The code is connected.
              <br />
              Your tools should be, too.
            </h2>
            <p>
              A passing build doesn’t explain a change. A failed deployment doesn’t point you straight to the
              cause. And a new repository rarely comes with a map.
            </p>
          </div>
          <div className="marketing-three">
            {[
              [
                '01',
                'Too much code. Too little context.',
                'You jump between files, branches, and chat to understand what a repository actually does.',
              ],
              [
                '02',
                'Signals scattered across tabs.',
                'The failing workflow, deployment status, and affected source live in different places.',
              ],
              [
                '03',
                'Fixes without a clear trail.',
                'It’s difficult to explain what failed, what you changed, and what evidence supports the next step.',
              ],
            ].map(([n, title, text]) => (
              <article key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-section solution-section" id="workflow">
          <div className="marketing-section-title">
            <span className="eyebrow">THE CODELENS APPROACH</span>
            <h2>
              A clear path from
              <br />
              <em>question to evidence.</em>
            </h2>
            <p>
              Start with your repository. Keep its revisions and evidence together as you explore,
              investigate, and prepare the next change.
            </p>
          </div>
          <div className="marketing-three">
            {[
              [
                Search,
                'Understand',
                'Connect GitHub, choose a live branch, index its latest commit, and ask questions with navigable source references.',
              ],
              [
                Workflow,
                'Investigate',
                'Compare revisions and inspect actual GitHub workflows, deployments, security alerts, and pull-request conflicts.',
              ],
              [
                FlaskConical,
                'Verify & share',
                'Review evidence, prepare a draft pull request, and use the TaskForge rehearsal to explore measured regression testing.',
              ],
            ].map(([Icon, title, description]: any) => (
              <article key={title}>
                <div className="feature-symbol">
                  <Icon size={24} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-cta">
          <div>
            <span className="eyebrow">LESS GUESSWORK. MORE CONTEXT.</span>
            <h2>
              Make your next change
              <br />
              one you understand.
            </h2>
            <p>Bring your repository, or follow a complete prepared investigation first.</p>
          </div>
          <div className="hero-actions">
            <Link className="btn-primary" to={destination}>
              Create your workspace <ArrowRight size={16} />
            </Link>
            <Link className="hero-secondary" to="/investigations">
              Choose an investigation <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="marketing-footer">
        <Brand />
        <p>Repository intelligence. Release evidence.</p>
        <Link to="/documentation">Documentation</Link>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  );
}
