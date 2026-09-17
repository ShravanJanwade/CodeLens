// ============================================================
// Diagnosis benchmark runner
// ============================================================
// Replays the labelled corpus through the classifier, scores it,
// and persists the result so the product can report accuracy that
// was actually measured rather than asserted.
//
//   pnpm --filter @codelens/api bench:diagnosis
//
// Writes one row to diagnosis_benchmark_runs and prints a confusion
// matrix. Run it after touching anything in packages/shared/src/
// diagnosis.ts — if accuracy moves, the number in the README and on
// the benchmark page moves with it.
// ============================================================

import { getDb, diagnosisBenchmarkRuns, diagnosisBenchmarkCases } from '@codelens/db';
import { diagnose, DIAGNOSIS_ENGINE_VERSION } from '@codelens/shared';
import type { DiagnosisSignal } from '@codelens/shared';
import { v4 as uuid } from 'uuid';
import { buildBenchmarkCorpus, corpusShape, isHardCase, type BenchmarkCase } from './benchmark-cases';

type CaseSource = DiagnosisSignal['source'];

export interface CaseResult {
  id: string;
  label: string;
  expectedCategory: string;
  predictedCategory: string;
  expectedAction: string;
  predictedAction: string;
  categoryCorrect: boolean;
  actionCorrect: boolean;
  confidence: number;
  computeMs: number;
  signalCount: number;
  hard: boolean;
}

export interface BenchmarkReport {
  engineVersion: string;
  totalCases: number;
  correctCategory: number;
  correctAction: number;
  categoryAccuracy: number;
  actionAccuracy: number;
  meanConfidence: number;
  p50ComputeMs: number;
  p95ComputeMs: number;
  /** Accuracy split by corpus difficulty. */
  easyAccuracy: number;
  hardAccuracy: number;
  hardCases: number;
  perCategory: Record<
    string,
    { support: number; correct: number; precision: number; recall: number; f1: number }
  >;
  confusion: { expected: string; predicted: string; count: number }[];
  results: CaseResult[];
  /** Accuracy with evidence sources selectively withheld. */
  ablation: { name: string; sources: string[]; accuracy: number; delta: number }[];
  shape: Record<string, number>;
  ranAt: string;
}

/** Scores the corpus. Pure — no database access, so it is testable. */
export function scoreCorpus(cases: BenchmarkCase[]): BenchmarkReport {
  const results: CaseResult[] = [];

  for (const c of cases) {
    // Measure only the classifier, not corpus construction.
    const t0 = performance.now();
    const d = diagnose(c.context);
    const computeMs = performance.now() - t0;

    results.push({
      id: c.id,
      label: c.label,
      expectedCategory: c.expectedCategory,
      predictedCategory: d.category,
      expectedAction: c.expectedAction,
      predictedAction: d.recommendedAction,
      categoryCorrect: d.category === c.expectedCategory,
      actionCorrect: d.recommendedAction === c.expectedAction,
      confidence: d.confidence,
      computeMs,
      signalCount: d.signals.length,
      hard: isHardCase(c),
    });
  }

  const correctCategory = results.filter((r) => r.categoryCorrect).length;
  const correctAction = results.filter((r) => r.actionCorrect).length;
  const times = results.map((r) => r.computeMs).sort((a, b) => a - b);

  const easy = results.filter((r) => !r.hard);
  const hard = results.filter((r) => r.hard);

  // ---- Per-category precision / recall ----
  const categories = [
    ...new Set([...results.map((r) => r.expectedCategory), ...results.map((r) => r.predictedCategory)]),
  ].sort();

  const perCategory: BenchmarkReport['perCategory'] = {};
  for (const cat of categories) {
    const support = results.filter((r) => r.expectedCategory === cat).length;
    const predicted = results.filter((r) => r.predictedCategory === cat).length;
    const truePositives = results.filter(
      (r) => r.expectedCategory === cat && r.predictedCategory === cat,
    ).length;
    const precision = predicted === 0 ? 0 : truePositives / predicted;
    const recall = support === 0 ? 0 : truePositives / support;
    perCategory[cat] = {
      support,
      correct: truePositives,
      precision: round(precision, 4),
      recall: round(recall, 4),
      f1: round(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall), 4),
    };
  }

  // ---- Confusion matrix (only non-zero cells) ----
  const cells = new Map<string, number>();
  for (const r of results) {
    const key = `${r.expectedCategory}\u0000${r.predictedCategory}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const confusion = [...cells.entries()]
    .map(([key, count]) => {
      const [expected, predicted] = key.split('\u0000');
      return { expected, predicted, count };
    })
    .sort((a, b) => b.count - a.count);

  // ---- Ablation ----
  // Re-score the same corpus with evidence sources withheld. The
  // deltas answer "what is each input actually worth?" -- which is
  // the honest version of an accuracy claim, because a single number
  // cannot distinguish a good model from an easy test set.
  const ALL_SOURCES = ['log', 'history', 'topology', 'diff', 'metrics'] as const;
  const baseAccuracy = correctCategory / results.length;
  const ablation = [
    { name: 'All signals', sources: [...ALL_SOURCES] },
    { name: 'Log patterns only', sources: ['log'] },
    { name: 'Without flake history', sources: ALL_SOURCES.filter((x) => x !== 'history') },
    { name: 'Without region topology', sources: ALL_SOURCES.filter((x) => x !== 'topology') },
    { name: 'Without diff context', sources: ALL_SOURCES.filter((x) => x !== 'diff') },
    { name: 'Without runner metrics', sources: ALL_SOURCES.filter((x) => x !== 'metrics') },
  ].map((variant) => {
    const hits = cases.filter(
      (c) =>
        diagnose(c.context, { sources: variant.sources as CaseSource[] }).category === c.expectedCategory,
    ).length;
    const accuracy = hits / cases.length;
    return {
      name: variant.name,
      sources: [...variant.sources],
      accuracy: round(accuracy, 4),
      delta: round(accuracy - baseAccuracy, 4),
    };
  });
  return {
    engineVersion: DIAGNOSIS_ENGINE_VERSION,
    totalCases: results.length,
    correctCategory,
    correctAction,
    categoryAccuracy: round(correctCategory / results.length, 4),
    actionAccuracy: round(correctAction / results.length, 4),
    meanConfidence: round(results.reduce((a, r) => a + r.confidence, 0) / results.length, 4),
    p50ComputeMs: round(percentile(times, 0.5), 4),
    p95ComputeMs: round(percentile(times, 0.95), 4),
    easyAccuracy: easy.length ? round(easy.filter((r) => r.categoryCorrect).length / easy.length, 4) : 0,
    hardAccuracy: hard.length ? round(hard.filter((r) => r.categoryCorrect).length / hard.length, 4) : 0,
    hardCases: hard.length,
    perCategory,
    confusion,
    results,
    ablation,
    shape: corpusShape(cases),
    ranAt: new Date().toISOString(),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// ============================================================
// Persistence + CLI
// ============================================================

export async function runBenchmark(perGenerator = 10): Promise<BenchmarkReport> {
  const cases = buildBenchmarkCorpus(perGenerator);
  const report = scoreCorpus(cases);
  const db = getDb();

  // Keep the corpus in the database too, so the benchmark page can
  // show which cases exist without re-running the generator.
  await db.delete(diagnosisBenchmarkCases);
  for (const c of cases) {
    await db.insert(diagnosisBenchmarkCases).values({
      id: c.id,
      label: c.label,
      expectedCategory: c.expectedCategory,
      expectedAction: c.expectedAction,
      fixture: JSON.stringify(c.context),
      createdAt: report.ranAt,
    });
  }

  await db.insert(diagnosisBenchmarkRuns).values({
    id: uuid(),
    engineVersion: report.engineVersion,
    totalCases: report.totalCases,
    correctCategory: report.correctCategory,
    correctAction: report.correctAction,
    categoryAccuracy: report.categoryAccuracy,
    actionAccuracy: report.actionAccuracy,
    meanConfidence: report.meanConfidence,
    p50ComputeMs: report.p50ComputeMs,
    p95ComputeMs: report.p95ComputeMs,
    easyAccuracy: report.easyAccuracy,
    hardAccuracy: report.hardAccuracy,
    hardCases: report.hardCases,
    perCategory: JSON.stringify(report.perCategory),
    confusion: JSON.stringify(report.confusion),
    ablation: JSON.stringify(report.ablation),
    ranAt: report.ranAt,
  });

  return report;
}

function printReport(report: BenchmarkReport) {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log('');
  console.log(`  Diagnosis engine v${report.engineVersion}`);
  console.log(`  ${'-'.repeat(58)}`);
  console.log(`  cases              ${report.totalCases}`);
  console.log(
    `  category accuracy  ${pct(report.categoryAccuracy)}  (${report.correctCategory}/${report.totalCases})`,
  );
  console.log(
    `  action accuracy    ${pct(report.actionAccuracy)}  (${report.correctAction}/${report.totalCases})`,
  );
  console.log(
    `    single-cause     ${pct(report.easyAccuracy)}  (${report.totalCases - report.hardCases} cases)`,
  );
  console.log(
    `    adversarial      ${pct(report.hardAccuracy)}  (${report.hardCases} cases with a competing decoy signal)`,
  );
  console.log(`  mean confidence    ${pct(report.meanConfidence)}`);
  console.log(
    `  latency            p50 ${report.p50ComputeMs.toFixed(3)}ms · p95 ${report.p95ComputeMs.toFixed(3)}ms`,
  );
  console.log('');
  console.log(
    `  ${'category'.padEnd(20)}${'n'.padStart(4)}${'prec'.padStart(8)}${'rec'.padStart(8)}${'f1'.padStart(8)}`,
  );
  console.log(`  ${'-'.repeat(58)}`);
  for (const [cat, m] of Object.entries(report.perCategory).sort((a, b) => b[1].support - a[1].support)) {
    console.log(
      `  ${cat.padEnd(20)}${String(m.support).padStart(4)}${pct(m.precision).padStart(8)}${pct(m.recall).padStart(8)}${pct(m.f1).padStart(8)}`,
    );
  }

  console.log('');
  console.log(`  ${'ablation'.padEnd(28)}${'acc'.padStart(8)}${'delta'.padStart(9)}`);
  console.log(`  ${'-'.repeat(58)}`);
  for (const a of report.ablation) {
    const delta = a.delta === 0 ? Array(8).join(' ') : `${(a.delta * 100).toFixed(1)}pp`;
    console.log(`  ${a.name.padEnd(28)}${pct(a.accuracy).padStart(8)}${delta.padStart(9)}`);
  }

  const errors = report.confusion.filter((c) => c.expected !== c.predicted);
  if (errors.length > 0) {
    console.log('');
    console.log('  misclassifications');
    console.log(`  ${'-'.repeat(58)}`);
    for (const e of errors) console.log(`  ${e.expected}  ->  ${e.predicted}   x${e.count}`);
  }
  console.log('');
}

// Run directly: tsx src/pipeline/benchmark.ts [perGenerator]
if (process.argv[1] && process.argv[1].includes('benchmark')) {
  const per = Number(process.argv[2] ?? 10);
  runBenchmark(Number.isFinite(per) && per > 0 ? per : 10)
    .then((report) => {
      printReport(report);
      // Fail loudly in CI if the engine regresses below the bar the
      // product advertises.
      if (report.categoryAccuracy < 0.85) {
        console.error(`  FAIL: category accuracy below the 85% gate.`);
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
