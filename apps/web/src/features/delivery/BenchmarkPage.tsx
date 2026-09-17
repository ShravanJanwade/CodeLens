import { Link } from 'react-router-dom';
import { Beaker, CircleCheck, Cpu, Target, Terminal, TriangleAlert } from 'lucide-react';
import { useBenchmark } from './queries';
import { micros, pct, relative } from './format';
import { Loading, ErrorState } from '../../components/ui';

/**
 * Measured accuracy of the diagnosis engine.
 *
 * This page exists because "94% accurate" is worthless without the
 * corpus, the confusion matrix and the errors. Everything here is
 * read from the last scored benchmark run in the database, so it
 * cannot drift from what the engine actually does.
 */
export default function BenchmarkPage() {
  const query = useBenchmark();

  if (query.isLoading) return <Loading label="Loading benchmark…" />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const report = query.data?.data;

  if (!report) {
    return (
      <div className="dl-page">
        <div className="panel state">
          <span className="state-icon">
            <Beaker size={20} />
          </span>
          <h3>No benchmark has been scored yet</h3>
          <p>{query.data?.reason}</p>
          <pre className="code-block" style={{ marginTop: 12 }}>
            pnpm --filter @codelens/api bench:diagnosis
          </pre>
        </div>
      </div>
    );
  }

  const confusion = report.confusion ?? [];
  const ablation = report.ablation ?? [];
  const errors = confusion.filter((c) => c.expected !== c.predicted);
  const categories = Object.entries(report.perCategory ?? {}).sort((a, b) => b[1].support - a[1].support);
  const label = (id: string) => report.categoryLabels[id] ?? id;

  return (
    <div className="dl-page">
      <header className="dl-head">
        <div className="dl-head-main">
          <h1>
            <Target size={24} style={{ color: 'var(--c-brand-ink)' }} />
            Diagnosis accuracy
          </h1>
          <p>
            The root-cause classifier scored against a labelled corpus of pipeline failures. Engine{' '}
            <code className="code-inline">v{report.engineVersion}</code>, last scored {relative(report.ranAt)}
            . Reproduce with <code className="code-inline">pnpm --filter @codelens/api bench:diagnosis</code>.
          </p>
        </div>
      </header>

      <div className="dl-metrics">
        <div className="dl-metric accent">
          <span className="dl-metric-top">
            <CircleCheck size={11} /> Category accuracy
          </span>
          <span className="dl-metric-value">{pct(report.categoryAccuracy, 1)}</span>
          <span className="dl-metric-note">
            {report.correctCategory} of {report.totalCases} failures classified correctly
          </span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Target size={11} /> Action accuracy
          </span>
          <span className="dl-metric-value">{pct(report.actionAccuracy, 1)}</span>
          <span className="dl-metric-note">recommended the right remedy in {report.correctAction} cases</span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Cpu size={11} /> Classification latency
          </span>
          <span className="dl-metric-value">{micros(report.p95ComputeMs)}</span>
          <span className="dl-metric-note">p95 · p50 {micros(report.p50ComputeMs)} · no model call</span>
        </div>
        <div className="dl-metric">
          <span className="dl-metric-top">
            <Beaker size={11} /> Mean confidence
          </span>
          <span className="dl-metric-value">{pct(report.meanConfidence, 0)}</span>
          <span className="dl-metric-note">
            deliberately below 100% — ambiguous cases report as uncertain
          </span>
        </div>
      </div>

      {/* Honesty note: this is the single most important paragraph on
          the page. A self-authored corpus at high accuracy means very
          little without saying so. */}
      <div className="alert alert-info">
        <TriangleAlert size={18} />
        <div>
          <strong>How to read this number</strong>
          <p>
            The corpus is synthetic and authored alongside the rules, so treat the headline figure as an upper
            bound rather than a field result. The parts worth trusting are the <strong>ablation</strong> below
            — which shows how much each evidence source actually contributes — and the adversarial subset,
            where two causes co-occur and one of them is a decoy. Log-pattern matching alone scores far lower
            than the full engine, which is the real argument for keeping run history and deploy topology in
            the loop.
          </p>
        </div>
      </div>

      {/* ---- Corpus split ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <Beaker size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Corpus difficulty</h2>
            <p>Single-cause failures versus cases carrying a decoy signal for the wrong category.</p>
          </div>
        </div>
        <div className="panel-bd">
          <div className="br-layers">
            <div className="br-layer">
              <span className="br-layer-label">Single cause</span>
              <span className="br-layer-bar">
                <span style={{ width: `${(report.easyAccuracy ?? 0) * 100}%` }} />
              </span>
              <span className="br-layer-count">{pct(report.easyAccuracy ?? 0, 1)}</span>
            </div>
            <div className="br-layer d0">
              <span className="br-layer-label">Adversarial</span>
              <span className="br-layer-bar">
                <span style={{ width: `${(report.hardAccuracy ?? 0) * 100}%` }} />
              </span>
              <span className="br-layer-count">{pct(report.hardAccuracy ?? 0, 1)}</span>
            </div>
          </div>
          <p className="text-xs muted" style={{ marginTop: 12 }}>
            {report.hardCases ?? 0} of {report.totalCases} cases are adversarial — a runner killed mid-suite
            while assertions were failing, a 401 arriving during a config-driven outage, a regression in a
            file that also owns a known flake.
          </p>
        </div>
      </section>

      {/* ---- Ablation: the honest artifact ---- */}
      {ablation.length > 0 && (
        <section className="panel-flush">
          <div className="panel-hd">
            <Cpu size={15} style={{ color: 'var(--c-ink-3)' }} />
            <div>
              <h2>Ablation — what each evidence source is worth</h2>
              <p>
                The same corpus re-scored with inputs withheld. This is the part that distinguishes a working
                model from an easy test set.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Configuration</th>
                  <th>Evidence sources</th>
                  <th className="right">Accuracy</th>
                  <th className="right">Change</th>
                </tr>
              </thead>
              <tbody>
                {ablation.map((variant) => (
                  <tr key={variant.name}>
                    <td>
                      <strong>{variant.name}</strong>
                    </td>
                    <td className="text-xs muted">{variant.sources.join(', ')}</td>
                    <td className="right num">{pct(variant.accuracy, 1)}</td>
                    <td className="right num">
                      {variant.delta === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className={`metric-delta ${variant.delta < 0 ? 'up' : 'down'}`}>
                          {(variant.delta * 100).toFixed(1)}pp
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-ft">
            Withholding diff context and runner metrics costs nothing on this corpus — those signals are
            redundant given the log and history. That is a finding, not a bug, and it is why they are weighted
            low.
          </div>
        </section>
      )}

      {/* ---- Per category ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <Target size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Per-category performance</h2>
            <p>Precision, recall and F1 for each root cause the engine can report.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Root cause</th>
                <th className="right">Cases</th>
                <th className="right">Correct</th>
                <th className="right">Precision</th>
                <th className="right">Recall</th>
                <th className="right">F1</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(([id, m]) => (
                <tr key={id}>
                  <td>
                    <strong>{label(id)}</strong>
                  </td>
                  <td className="right num">{m.support}</td>
                  <td className="right num">{m.correct}</td>
                  <td className="right num">{pct(m.precision, 1)}</td>
                  <td className="right num">{pct(m.recall, 1)}</td>
                  <td className="right num">
                    <span
                      className="badge"
                      style={{
                        background: m.f1 >= 0.95 ? 'var(--c-pass-wash)' : 'var(--c-warn-wash)',
                        color: m.f1 >= 0.95 ? 'var(--c-pass-ink)' : 'var(--c-warn-ink)',
                      }}
                    >
                      {pct(m.f1, 1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Errors ---- */}
      <section className="panel-flush">
        <div className="panel-hd">
          <TriangleAlert size={15} style={{ color: 'var(--c-ink-3)' }} />
          <div>
            <h2>Where it gets things wrong</h2>
            <p>Every misclassification in the last scored run.</p>
          </div>
        </div>
        {errors.length === 0 ? (
          <div className="panel-bd">
            <p className="text-sm muted">No misclassifications in this run.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ground truth</th>
                  <th>Predicted</th>
                  <th className="right">Cases</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={`${e.expected}-${e.predicted}`}>
                    <td>
                      <strong>{label(e.expected)}</strong>
                    </td>
                    <td>
                      <span className="badge badge-warn">{label(e.predicted)}</span>
                    </td>
                    <td className="right num">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="panel-ft">
              Most remaining errors are the engine declining to guess on genuinely contested cases — it
              reports <em>unclassified</em> rather than asserting a cause it cannot support.
            </div>
          </div>
        )}
      </section>

      <p className="text-xs muted row-tight">
        <Terminal size={12} />
        The benchmark CLI exits non-zero below 85% accuracy, so this number cannot silently regress.{' '}
        <Link className="link" to="/">
          Back to the overview
        </Link>
      </p>
    </div>
  );
}
