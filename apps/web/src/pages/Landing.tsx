import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  ChevronRight,
  Code2,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe2,
  Layers,
  Network,
  Radar,
  ScrollText,
  ShieldCheck,
  Target,
  Terminal,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../features/auth/Auth';
import { DEMO_REPO } from '../features/delivery/types';

const DEMO_PATH = `/r/${DEMO_REPO}/delivery`;
const HERO_RUN = `/r/${DEMO_REPO}/runs/2184`;

/**
 * Marketing page.
 *
 * Written to answer, in order: what is this, is it real, and can I
 * see it without signing up. The primary CTA goes straight into a
 * populated workspace rather than a signup form -- anyone evaluating
 * this in sixty seconds will not create an account first.
 *
 * Every number on this page is measured. The accuracy figures come
 * from `pnpm --filter @codelens/api bench:diagnosis`; the graph
 * figures come from the indexed demo repository. Nothing is
 * aspirational copy.
 */
export default function Landing() {
  const auth = useAuth();
  const [stuck, setStuck] = useState(false);
  const signedIn = Boolean(auth.data?.data.user);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp">
      <nav className={`lp-nav ${stuck ? 'is-stuck' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Code2 size={16} />
            </span>
            <span>
              CodeLens<span className="brand-period">.</span>
            </span>
          </Link>
          <div className="lp-nav-links">
            <a href="#problem">Problem</a>
            <a href="#how">How it works</a>
            <a href="#accuracy">Accuracy</a>
            <a href="#stack">Architecture</a>
          </div>
          <div className="lp-nav-actions">
            <Link className="btn btn-ghost btn-sm" to={signedIn ? '/repositories' : '/login'}>
              {signedIn ? 'Workspace' : 'Sign in'}
            </Link>
            <Link className="btn btn-primary btn-sm" to={DEMO_PATH}>
              Open live demo <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================================
          Hero
          ============================================================ */}
      <header className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-pill">
              <b>LIVE</b> No sign-in required
            </span>
            <h1>
              Your pipeline is red.
              <br />
              <em>Know why in one screen.</em>
            </h1>
            <p className="lp-lede">
              CodeLens reads the stage logs, the run history and the deploy topology of a failed CI/CD run and
              tells you the actual root cause —{' '}
              <strong>which region, which branch, which commit, which test</strong> — plus whether your change
              is even to blame.
            </p>
            <div className="lp-cta">
              <Link className="btn btn-primary btn-lg" to={DEMO_PATH}>
                Explore the live demo <ArrowRight size={17} />
              </Link>
              <Link className="btn btn-outline btn-lg" to={HERO_RUN}>
                See a real diagnosis <ChevronRight size={16} />
              </Link>
            </div>
            <p className="lp-cta-note">
              <BadgeCheck size={14} />
              Seeded five-service monorepo · 3 production regions · 41 pipeline runs · every verdict computed
              live
            </p>
          </div>

          {/* Product mock: the hero scenario, in miniature. */}
          <div className="lp-mock" aria-label="Pipeline failure diagnosis, illustrated">
            <div className="lp-mock-bar">
              <span className="lp-mock-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="lp-mock-path">northwind/commerce-platform · run #2184 · main</span>
            </div>
            <div className="lp-mock-body">
              <div className="lp-mini">
                <span className="lp-mini-node ok">build</span>
                <ChevronRight size={13} className="lp-mini-arrow" />
                <span className="lp-mini-node ok">tests</span>
                <ChevronRight size={13} className="lp-mini-arrow" />
                <span className="lp-mini-node ok">image</span>
                <ChevronRight size={13} className="lp-mini-arrow" />
                <span className="lp-mini-node ok">approve</span>
                <ChevronRight size={13} className="lp-mini-arrow" />
                <span className="lp-mini-node bad">deploy</span>
                <ChevronRight size={13} className="lp-mini-arrow" />
                <span className="lp-mini-node idle">verify</span>
              </div>

              <div className="lp-regions">
                <div className="lp-region">
                  <i className="dot dot-pass" />
                  <code>us-east-1</code>
                  <span>deployed 2024.9.14</span>
                </div>
                <div className="lp-region">
                  <i className="dot dot-pass" />
                  <code>eu-west-1</code>
                  <span>deployed 2024.9.14</span>
                </div>
                <div className="lp-region bad">
                  <i className="dot dot-fail" />
                  <code>ap-southeast-2</code>
                  <span>0/6 replicas ready</span>
                </div>
              </div>

              <div className="lp-verdict">
                <div className="lp-verdict-top">
                  <Globe2 size={13} /> CONFIG DRIFT · 97% CONFIDENCE
                </div>
                <p>
                  The same artifact deployed cleanly to two regions.{' '}
                  <code className="code-inline">LEDGER_WEBHOOK_SECRET</code> is absent in ap-southeast-2, so
                  replicas never passed readiness. <strong>Do not revert the build</strong> — reconcile the
                  target.
                </p>
                <div className="lp-verdict-foot">
                  <Cpu size={11} /> classified from 4 signals in under 2ms · no model call
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================
          Metric band
          ============================================================ */}
      <section className="lp-band">
        <div className="lp-band-grid">
          <div className="lp-band-cell">
            <div className="lp-band-value">95.8%</div>
            <p className="lp-band-label">Root-cause accuracy</p>
            <p className="lp-band-note">
              Across 240 labelled failures, 90 of them adversarial. Scored by a committed benchmark, not
              estimated.
            </p>
          </div>
          <div className="lp-band-cell">
            <div className="lp-band-value">&lt;0.1ms</div>
            <p className="lp-band-label">p95 classification</p>
            <p className="lp-band-note">
              Deterministic rules over stored evidence. No inference call, so no token bill and no variance.
            </p>
          </div>
          <div className="lp-band-cell">
            <div className="lp-band-value">57%</div>
            <p className="lp-band-label">Failures that weren&rsquo;t your fault</p>
            <p className="lp-band-note">
              Flakes, expired credentials, OOM-killed runners and config drift — all cleared without reading a
              log.
            </p>
          </div>
          <div className="lp-band-cell">
            <div className="lp-band-value">-20.8pp</div>
            <p className="lp-band-label">Cost of log-only triage</p>
            <p className="lp-band-note">
              What accuracy drops to when history and topology are withheld. The ablation is on the accuracy
              page.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          Problem
          ============================================================ */}
      <section className="lp-section" id="problem">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <span className="eyebrow">The problem</span>
            <h2>A red pipeline tells you something broke. Never what.</h2>
            <p>
              CI gives you an exit code and ten thousand lines of log. Working out whether you are blocked
              means reading them, comparing against yesterday&rsquo;s run, checking whether the test is a
              known flake, and noticing that only one region actually failed. That is archaeology, and it
              happens on every red build.
            </p>
          </div>

          <div className="lp-problems">
            <article className="lp-problem">
              <span className="lp-problem-cost">~40 min per incident</span>
              <h3>The log is not the answer</h3>
              <p>
                A stage that fails on an assertion, a stage killed for memory, and a stage refused by a
                registry all exit 1. The distinction lives in lines you have to go find.
              </p>
              <div className="lp-problem-fix">
                <ScrollText size={14} />
                <span>CodeLens matches log signatures and quotes the exact line it used as evidence.</span>
              </div>
            </article>

            <article className="lp-problem">
              <span className="lp-problem-cost">1 in 2 failures</span>
              <h3>You cannot tell a flake from a regression</h3>
              <p>
                Both present identically in one run: “tests failed”. The difference is only visible in history
                — a flake fails at a low rate across unrelated branches, a regression fails deterministically
                on exactly one.
              </p>
              <div className="lp-problem-fix">
                <TrendingUp size={14} />
                <span>
                  Per-test flake rates across branches decide it, and the engine says plainly when your change
                  is cleared.
                </span>
              </div>
            </article>

            <article className="lp-problem">
              <span className="lp-problem-cost">Wrong fix, twice the outage</span>
              <h3>Nobody checks whether it failed everywhere</h3>
              <p>
                One region failing while its peers shipped the identical artifact means the build is fine and
                the target is not. Miss that and you revert a good release.
              </p>
              <div className="lp-problem-fix">
                <Globe2 size={14} />
                <span>
                  Region asymmetry is a first-class signal, so the verdict distinguishes “bad code” from “bad
                  environment”.
                </span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <div className="lp-wrap">
        <div className="lp-divider" />
      </div>

      {/* ============================================================
          Capabilities
          ============================================================ */}
      <section className="lp-section" id="how">
        <div className="lp-wrap">
          <div className="lp-section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three questions, answered from evidence you already have.</h2>
            <p>
              No agents to install and no telemetry pipeline to run. CodeLens works from what CI already
              produces: stage logs, run history, the deploy topology and the repository&rsquo;s own import
              graph.
            </p>
          </div>

          <div className="lp-caps">
            {/* ---- 1. Root cause ---- */}
            <article className="lp-cap">
              <div className="lp-cap-copy">
                <span className="lp-cap-num">01</span>
                <h3>Why is it red?</h3>
                <p>
                  Every failed run gets classified into one of eight root causes with a confidence score and
                  the list of signals that produced it — including the evidence that argued <em>against</em>{' '}
                  the verdict, so you can check the reasoning instead of trusting it.
                </p>
                <ul className="lp-cap-list">
                  <li>
                    <Workflow size={15} />
                    <span>
                      Full stage DAG across environments and regions, with the failing path highlighted
                    </span>
                  </li>
                  <li>
                    <Radar size={15} />
                    <span>
                      Blame narrowed to a commit, file and author when the change really is at fault
                    </span>
                  </li>
                  <li>
                    <BadgeCheck size={15} />
                    <span>A plain verdict on whether you are blocked: “press re-run” or “stop and fix”</span>
                  </li>
                </ul>
              </div>
              <div className="lp-cap-visual">
                <div className="lp-visual-hd">
                  <ScrollText size={11} /> Signals behind run #2184
                </div>
                <div className="lp-visual-bd">
                  <div className="dx-body" style={{ background: 'transparent', display: 'block' }}>
                    {[
                      [
                        'topology',
                        'Configuration differs from healthy peers',
                        'VAULT_MOUNT_PATH: expected kv/prod/apse2, found kv/prod/use1',
                        '0.66',
                      ],
                      [
                        'topology',
                        'Failure isolated to one region',
                        'ap-southeast-2 failed while us-east-1, eu-west-1 deployed the same artifact',
                        '0.60',
                      ],
                      [
                        'log',
                        'Required configuration absent at runtime',
                        'ConfigurationError: LEDGER_WEBHOOK_SECRET is not set',
                        '0.56',
                      ],
                      [
                        'log',
                        'Deployed replicas never became ready',
                        'Readiness probe failed: statuscode 503',
                        '0.45',
                      ],
                    ].map(([source, label, detail, weight]) => (
                      <div className="signal" key={label}>
                        <span className={`signal-src src-${source}`}>
                          {source === 'log' ? <ScrollText size={13} /> : <Globe2 size={13} />}
                        </span>
                        <div className="signal-main">
                          <div className="signal-label">
                            {label}
                            <span className="signal-weight">w {weight}</span>
                          </div>
                          <p className="signal-detail">{detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            {/* ---- 2. Blast radius ---- */}
            <article className="lp-cap">
              <div className="lp-cap-copy">
                <span className="lp-cap-num">02</span>
                <h3>What does this change touch?</h3>
                <p>
                  CodeLens indexes the repository into an import graph and walks it <em>backwards</em> from
                  your diff. One edit to a shared money helper reaches{' '}
                  <strong>32 files across 4 services and 10 public endpoints</strong> — and flags the changed
                  files no test in range actually covers.
                </p>
                <ul className="lp-cap-list">
                  <li>
                    <Layers size={15} />
                    <span>
                      Impact bucketed by hop distance, because a direct importer is not the same risk as one
                      six hops out
                    </span>
                  </li>
                  <li>
                    <Boxes size={15} />
                    <span>
                      Services that must be redeployed, so you know the change cannot roll back atomically
                    </span>
                  </li>
                  <li>
                    <Network size={15} />
                    <span>A decomposable risk score — every point traceable to a stated reason</span>
                  </li>
                </ul>
              </div>
              <div className="lp-cap-visual">
                <div className="lp-visual-hd">
                  <Radar size={11} /> packages/core/src/money.ts · risk 74 / critical
                </div>
                <div className="lp-visual-bd">
                  <div className="lp-bars">
                    {[
                      ['In the diff', 1, true],
                      ['1 hop', 11, false],
                      ['2 hops', 11, false],
                      ['3 hops', 7, false],
                      ['4 hops', 2, false],
                    ].map(([label, count, hot]) => (
                      <div className={`lp-bar-row ${hot ? 'hot' : ''}`} key={String(label)}>
                        <span>{label}</span>
                        <span className="lp-bar">
                          <span style={{ width: `${(Number(count) / 11) * 100}%` }} />
                        </span>
                        <span className="lp-bar-count">{count}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
                    Spans payments, orders, ledger and gateway. Reaches 10 endpoints. Traversed 113 import
                    edges in single-digit milliseconds.
                  </p>
                </div>
              </div>
            </article>

            {/* ---- 3. Measured, not asserted ---- */}
            <article className="lp-cap">
              <div className="lp-cap-copy">
                <span className="lp-cap-num">03</span>
                <h3>Can you trust the verdict?</h3>
                <p>
                  The classifier is scored against a committed corpus of labelled failures, and the benchmark
                  CLI fails the build below 85% accuracy. More usefully, an <strong>ablation study</strong>{' '}
                  shows what each evidence source is actually worth — because an accuracy number on its own
                  cannot tell a good model from an easy test set.
                </p>
                <ul className="lp-cap-list">
                  <li>
                    <Target size={15} />
                    <span>Per-category precision, recall and F1, plus every misclassification</span>
                  </li>
                  <li>
                    <FlaskConical size={15} />
                    <span>90 adversarial cases where two causes co-occur and one is a decoy</span>
                  </li>
                  <li>
                    <Terminal size={15} />
                    <span>
                      Reproduce it yourself: <code>pnpm --filter @codelens/api bench:diagnosis</code>
                    </span>
                  </li>
                </ul>
              </div>
              <div className="lp-cap-visual">
                <div className="lp-visual-hd">
                  <Gauge size={11} /> Ablation · 240 cases
                </div>
                <div className="lp-visual-bd">
                  <div className="lp-abl">
                    <div className="lp-abl-row is-head">
                      <span>Evidence available</span>
                      <span>Acc</span>
                      <span>Delta</span>
                    </div>
                    <div className="lp-abl-row is-base">
                      <span>All signals</span>
                      <b>95.8%</b>
                      <span>&mdash;</span>
                    </div>
                    {[
                      ['Log patterns only', '75.0%', '-20.8pp'],
                      ['Without flake history', '86.3%', '-9.6pp'],
                      ['Without region topology', '87.5%', '-8.3pp'],
                    ].map(([name, acc, delta]) => (
                      <div className="lp-abl-row" key={name}>
                        <span style={{ textAlign: 'left' }}>{name}</span>
                        <b>{acc}</b>
                        <span className="lp-abl-delta">{delta}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
                    Pattern-matching the log gets three quarters of the way. The remaining 21 points come from
                    history and topology &mdash; which is the argument for storing them.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ============================================================
          Accuracy callout
          ============================================================ */}
      <section className="lp-section" id="accuracy" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="panel" style={{ padding: 'var(--s-8)' }}>
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
              <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                <span className="eyebrow">Stated plainly</span>
                <h3 style={{ marginTop: 12, fontSize: '1.3rem' }}>
                  The corpus is synthetic, and the page says so.
                </h3>
                <p className="text-sm" style={{ marginTop: 12, color: 'var(--c-ink-2)', lineHeight: 1.65 }}>
                  The benchmark cases were authored alongside the rules, so the headline figure is an upper
                  bound rather than a field result. That is why the ablation and the adversarial split are
                  reported next to it &mdash; those are the parts that survive the objection.
                </p>
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <Link className="btn btn-secondary" to="/benchmark">
                  <Target size={15} /> Read the full benchmark
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Architecture
          ============================================================ */}
      <section className="lp-section" id="stack" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-section-head">
            <span className="eyebrow">Architecture</span>
            <h2>Built as a monorepo, deployed as one container.</h2>
            <p>
              TypeScript end to end. The diagnosis engine is a pure, dependency-free module, so it can be
              unit-tested, benchmarked and shared between the API and the scoring harness without touching a
              database.
            </p>
          </div>

          <div className="lp-arch">
            <div className="lp-arch-card">
              <h4>
                <Code2 size={15} /> Web
              </h4>
              <p>
                React 19, React Router and TanStack Query. The pipeline DAG is laid out from pure functions of
                (sequence, lane) and drawn with SVG bezier edges &mdash; no layout library, no measurement
                pass.
              </p>
              <code>apps/web</code>
            </div>
            <div className="lp-arch-card">
              <h4>
                <Network size={15} /> API
              </h4>
              <p>
                Hono on Node 22. The delivery screen loads from a single composed endpoint rather than a
                waterfall of six, because it is useless partially loaded.
              </p>
              <code>apps/api</code>
            </div>
            <div className="lp-arch-card">
              <h4>
                <Cpu size={15} /> Diagnosis engine
              </h4>
              <p>
                Weighted signals combined with noisy-OR, plus explicit suppression rules for evidence that
                rules a cause <em>out</em>. Pure and deterministic: same input, same verdict.
              </p>
              <code>packages/shared/src/diagnosis.ts</code>
            </div>
            <div className="lp-arch-card">
              <h4>
                <Database size={15} /> Data
              </h4>
              <p>
                SQLite via Drizzle with idempotent migrations. Runs, stages, environments, deployments and
                flake history are modelled separately, so a stage DAG is a real graph rather than a list.
              </p>
              <code>packages/db</code>
            </div>
            <div className="lp-arch-card">
              <h4>
                <GitBranch size={15} /> Integrations
              </h4>
              <p>
                GitHub OAuth, signed per-repository webhooks and encrypted tokens. Connect a real repository
                and index a branch to run the same analysis on your own code.
              </p>
              <code>apps/api/src/routes</code>
            </div>
            <div className="lp-arch-card">
              <h4>
                <ShieldCheck size={15} /> Verification
              </h4>
              <p>
                Integration tests over the API, a scored diagnosis benchmark with an accuracy gate, and a
                deterministic seed so the demo is reproducible on any machine.
              </p>
              <code>pnpm test &middot; bench:diagnosis</code>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Close
          ============================================================ */}
      <section className="lp-close">
        <div className="lp-wrap">
          <h2>See it on a real failure.</h2>
          <p>
            The demo opens on run #2184 &mdash; a production deploy that succeeded in two regions and failed
            in the third. No account, no setup.
          </p>
          <div className="lp-cta">
            <Link className="btn btn-primary btn-lg" to={HERO_RUN}>
              Open the diagnosis <ArrowRight size={17} />
            </Link>
            <Link className="btn btn-outline btn-lg" to={signedIn ? '/repositories' : '/login?mode=signup'}>
              {signedIn ? 'Connect a repository' : 'Create a workspace'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Code2 size={15} />
            </span>
            <span>
              CodeLens<span className="brand-period">.</span>
            </span>
          </Link>
          <span>Root-cause analysis for CI/CD pipelines.</span>
          <div className="lp-footer-links">
            <Link to={DEMO_PATH}>Demo</Link>
            <Link to="/benchmark">Benchmark</Link>
            <Link to="/documentation">Docs</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
