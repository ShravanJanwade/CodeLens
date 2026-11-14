import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CirclePause,
  CircleX,
  GitPullRequestArrow,
  Github,
  History,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../features/auth/Auth';
import { DEMO_REPO, LIVE_REPO } from '../features/delivery/types';
import { Brand } from '../components/ui';

const LIVE = `/r/${LIVE_REPO}/delivery`;
const DEMO = `/r/${DEMO_REPO}/delivery`;
const LIVE_RUN = `/r/${LIVE_REPO}/runs/43467678047`;
const SOURCE = 'https://github.com/ShravanJanwade/CodeLens';

/**
 * The front page. It says what CodeLens does in one sentence, shows the
 * product doing it on a real failure, and gets out of the way: every
 * section is one idea, and every number is measured by code in the
 * repository.
 */
export default function Landing() {
  const auth = useAuth();
  const signedIn = Boolean(auth.data?.data.user);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp">
      <header className={`lp-nav ${stuck ? 'is-stuck' : ''}`}>
        <div className="lp-wrap lp-nav-inner">
          <Brand />
          <nav className="lp-nav-links" aria-label="Sections">
            <a href="#questions">Product</a>
            <a href="#act">Actions</a>
            <Link to="/benchmark">Accuracy</Link>
            <Link to="/documentation">Docs</Link>
          </nav>
          <div className="lp-nav-actions">
            <a
              className="icon-btn"
              href={SOURCE}
              target="_blank"
              rel="noreferrer"
              aria-label="Source on GitHub"
            >
              <Github size={16} />
            </a>
            <Link className="btn btn-ghost btn-sm" to={signedIn ? '/repositories' : '/login'}>
              {signedIn ? 'Workspace' : 'Sign in'}
            </Link>
            <Link className="btn btn-primary btn-sm" to={LIVE}>
              Open live repository
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap">
            <Link to={LIVE} className="lp-chip">
              <span className="lp-chip-dot" aria-hidden />
              <span>
                Live on a real repository
                <span className="lp-chip-more"> deploying to three Azure regions</span>
              </span>
              <ArrowRight size={13} aria-hidden />
            </Link>
            <h1>
              Know why your pipeline is red.
              <span>Then fix it from the same screen.</span>
            </h1>
            <p className="lp-lede">
              CodeLens reads a failed GitHub Actions run, its history and its deploy topology, names the root
              cause, and gives you the next step as a button.
            </p>
            <div className="lp-cta">
              <Link className="btn btn-primary btn-lg" to={LIVE}>
                See it on a real repository <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-outline btn-lg" to={DEMO}>
                Recorded demo
              </Link>
            </div>
            <p className="lp-facts">
              <span>No sign-in to look around</span>
              <span>Deterministic, no model calls</span>
              <span>Acts with your own GitHub permissions</span>
            </p>
          </div>
          <div className="lp-wrap lp-shot-wrap">
            <RunShot />
          </div>
        </section>

        <section className="lp-proof" aria-label="Measured results">
          <div className="lp-wrap lp-proof-grid">
            <Stat value="95.8%" label="root-cause accuracy" note="240 labelled failures" />
            <Stat value="88.9%" label="on adversarial cases" note="a decoy signal in every one" />
            <Stat value="<0.1 ms" label="to classify, p95" note="pure function, no network" />
            <Stat value="+9.6 pts" label="from flake history" note="measured by ablation" />
          </div>
        </section>

        <section className="lp-section" id="questions">
          <div className="lp-wrap">
            <SectionHead
              kicker="What it answers"
              title="Three questions every red build asks."
              lede="A single run can't answer them. CodeLens reads across runs, branches and regions to answer each one with evidence you can check."
            />
            <div className="lp-cards">
              <article className="lp-card">
                <h3>Why is it red?</h3>
                <p>One of eight root causes, with the log lines and history that produced the verdict.</p>
                <div className="lp-viz lp-signals" aria-hidden>
                  <Signal label="Configuration differs from healthy peers" weight="0.66" />
                  <Signal label="Failure isolated to one region" weight="0.60" />
                  <Signal label="Required setting absent at runtime" weight="0.56" />
                </div>
              </article>
              <article className="lp-card">
                <h3>Is my change to blame?</h3>
                <p>Flake history and cross-branch spread clear the commit, or convict it.</p>
                <div className="lp-viz" aria-hidden>
                  <div className="lp-flake-name">issues unique codes for a campaign</div>
                  <div className="lp-flake-runs">
                    {'ppppfpppppppfppppppfppppppppfp'.split('').map((r, i) => (
                      <i key={i} className={r === 'f' ? 'is-fail' : ''} />
                    ))}
                  </div>
                  <div className="lp-flake-meta">
                    <span>Known flake</span>
                    <span>14% of 28 runs · 3 branches</span>
                  </div>
                </div>
              </article>
              <article className="lp-card">
                <h3>What does this change touch?</h3>
                <p>The import graph walked backwards: every file, service and endpoint downstream.</p>
                <div className="lp-viz lp-layers" aria-hidden>
                  <Layer label="Changed" count={1} width={10} hot />
                  <Layer label="1 hop" count={12} width={78} />
                  <Layer label="2 hops" count={14} width={92} />
                  <Layer label="3 hops" count={5} width={34} />
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section-split" id="act">
          <div className="lp-wrap lp-split">
            <div>
              <SectionHead
                kicker="What it does about it"
                title="Then act, without leaving the page."
                lede="Every diagnosis ends in a next step. Where GitHub can take it, CodeLens puts it one click away."
              />
              <ul className="lp-acts">
                <li>
                  <RotateCcw size={16} aria-hidden />
                  <div>
                    <strong>Re-run</strong>
                    <span>The failed jobs, every job, or a single one.</span>
                  </div>
                </li>
                <li>
                  <History size={16} aria-hidden />
                  <div>
                    <strong>Roll back a region</strong>
                    <span>Redeploy a release that ran there before, to that environment alone.</span>
                  </div>
                </li>
                <li>
                  <CirclePause size={16} aria-hidden />
                  <div>
                    <strong>Approve after the bake</strong>
                    <span>Production waits for a reviewer once staging has stayed healthy.</span>
                  </div>
                </li>
                <li>
                  <GitPullRequestArrow size={16} aria-hidden />
                  <div>
                    <strong>Fix as a pull request</strong>
                    <span>Config drift and flaky tests, reviewed as a diff before anything opens.</span>
                  </div>
                </li>
              </ul>
              <p className="lp-trust">
                <ShieldCheck size={15} aria-hidden />
                Every action runs as you, with your GitHub permissions and audit log. CodeLens holds no cloud
                credentials.
              </p>
            </div>
            <GateShot />
          </div>
        </section>

        <section className="lp-closing">
          <div className="lp-wrap">
            <h2>See it on a real failure.</h2>
            <p>
              northwind-commerce is a real monorepo whose GitHub Actions release to three Azure regions. Open
              the run where France Central broke and the other two didn&rsquo;t.
            </p>
            <div className="lp-cta">
              <Link className="btn btn-primary btn-lg" to={LIVE_RUN}>
                Open that run <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-outline btn-lg" to={signedIn ? '/repositories' : '/login?mode=signup'}>
                {signedIn ? 'Connect a repository' : 'Use your own repository'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Brand />
          <span className="lp-footer-tag">Root-cause analysis for CI/CD</span>
          <nav aria-label="Footer">
            <Link to={LIVE}>Live repository</Link>
            <Link to={DEMO}>Demo</Link>
            <Link to="/benchmark">Accuracy</Link>
            <Link to="/documentation">Docs</Link>
            <a href={SOURCE} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={12} />
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ kicker, title, lede }: { kicker: string; title: string; lede: string }) {
  return (
    <div className="lp-head">
      <p className="lp-kicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{lede}</p>
    </div>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="lp-stat">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}

function Signal({ label, weight }: { label: string; weight: string }) {
  return (
    <div className="lp-signal">
      <span>{label}</span>
      <b>{weight}</b>
    </div>
  );
}

function Layer({ label, count, width, hot }: { label: string; count: number; width: number; hot?: boolean }) {
  return (
    <div className={`lp-layer ${hot ? 'is-hot' : ''}`}>
      <span>{label}</span>
      <i>
        <b style={{ width: `${width}%` }} />
      </i>
      <em>{count}</em>
    </div>
  );
}

/** The run page, in miniature: the EU deploy that failed while its two sibling regions shipped. */
function RunShot() {
  const jobs: { name: string; time: string; state: 'pass' | 'fail' }[] = [
    { name: 'Lint, typecheck and unit tests', time: '16s', state: 'pass' },
    { name: 'Integration tests', time: '11s', state: 'pass' },
    { name: 'Deploy staging', time: '24s', state: 'pass' },
    { name: 'Deploy production-us', time: '31s', state: 'pass' },
    { name: 'Deploy production-ca', time: '27s', state: 'pass' },
    { name: 'Deploy production-eu', time: '22s', state: 'fail' },
  ];
  return (
    <figure className="lp-shot" aria-label="CodeLens diagnosing a failed deploy">
      <div className="lp-shot-bar" aria-hidden>
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-shot-path">northwind-commerce / Delivery / Run</span>
      </div>
      <div className="lp-shot-body">
        <div className="lp-run-head">
          <CircleX size={18} className="lp-fail" aria-hidden />
          <div>
            <strong>Give the JSON catalog its own cache lifetime</strong>
            <span>Deploy #7 · main · 275dfa0 · 1m 34s</span>
          </div>
        </div>
        <div className="lp-shot-grid">
          <div className="lp-dx">
            <div className="lp-dx-kicker">
              <span>Config drift</span>
              <span className="lp-dx-conf">
                <i>
                  <b style={{ width: '90%' }} />
                </i>
                High confidence · 90%
              </span>
            </div>
            <h4>Environment configuration is wrong</h4>
            <p>
              production-eu failed while the same build succeeded in West US 2 and Canada Central.{' '}
              <code>catalogCacheSeconds</code> is set there and missing here.
            </p>
            <div className="lp-dx-verdict">
              <CircleCheck size={14} aria-hidden /> Not caused by this commit.
            </div>
            <div className="lp-dx-next">
              <span>Fix the configuration and re-run that deploy only. Do not revert the build.</span>
              <div>
                <span className="lp-btn lp-btn-primary">Fix with a pull request</span>
                <span className="lp-btn">Re-run production-eu</span>
              </div>
            </div>
          </div>
          <ol className="lp-jobs" aria-hidden>
            {jobs.map((job) => (
              <li key={job.name} className={job.state === 'fail' ? 'is-fail' : ''}>
                {job.state === 'pass' ? <CircleCheck size={14} /> : <CircleX size={14} />}
                <span>{job.name}</span>
                <em>{job.time}</em>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}

/** A release that baked in staging, waiting for its reviewer. */
function GateShot() {
  return (
    <figure className="lp-shot lp-gate" aria-label="A production release waiting for approval">
      <div className="lp-shot-bar" aria-hidden>
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-shot-path">Deploy #10 · In progress</span>
      </div>
      <div className="lp-shot-body">
        <ol className="lp-steps" aria-hidden>
          <li className="is-pass">
            <CircleCheck size={13} /> Tests
          </li>
          <li className="is-pass">
            <CircleCheck size={13} /> Staging
          </li>
          <li className="is-pass">
            <CircleCheck size={13} /> Bake 3:00
          </li>
          <li className="is-wait">
            <CirclePause size={13} /> Production
          </li>
        </ol>
        <div className="lp-gate-card">
          <strong>3 environments waiting for approval</strong>
          <span>Baked in staging for 3:06 with every health check passing. Reviewer: @ShravanJanwade</span>
          <div className="lp-gate-actions">
            <span className="lp-btn lp-btn-danger">Reject</span>
            <span className="lp-btn lp-btn-approve">Approve and deploy</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
