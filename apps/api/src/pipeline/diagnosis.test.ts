// ============================================================
// Diagnosis engine unit tests
// ============================================================
// The benchmark measures aggregate accuracy; these pin the specific
// behaviours that aggregate would happily hide. Each case here
// corresponds to a bug the engine actually had during development.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, isChangeExonerated, type FailureContext } from '@codelens/shared';

function context(over: {
  stage?: Partial<FailureContext['stage']>;
  run?: Partial<FailureContext['run']>;
  history?: FailureContext['history'];
}): FailureContext {
  return {
    stage: {
      key: 'unit-tests',
      name: 'Unit tests',
      kind: 'test',
      exitCode: 1,
      durationMs: 120_000,
      attempts: 1,
      log: '',
      baselineDurationMs: 120_000,
      ...over.stage,
    },
    run: {
      branch: 'feat/thing',
      defaultBranch: 'main',
      trigger: 'push',
      commitSha: 'a'.repeat(40),
      commitAuthor: 'dev',
      filesChanged: [],
      ...over.run,
    },
    history: over.history ?? {},
  };
}

const FLAKY = {
  name: 'session refresh survives clock skew',
  file: 'services/identity/src/session.test.ts',
  flakeRate: 0.17,
  distinctBranches: 9,
  runCount: 312,
  firstFailure: false,
};

const FRESH = {
  name: 'applies the discount ceiling',
  file: 'services/orders/src/promo.test.ts',
  flakeRate: 0,
  distinctBranches: 1,
  runCount: 288,
  firstFailure: true,
};

// ---- Flake vs. regression: the core discrimination -------------

test('a failing test with cross-branch flake history is not blamed on the commit', () => {
  const result = diagnose(
    context({
      stage: { log: 'AssertionError: expected 3 to equal 2\n  ✕ session refresh survives clock skew' },
      history: { failingTests: [FLAKY], sameFailureOtherBranches: 4 },
    }),
  );
  assert.equal(result.category, 'flaky-test');
  assert.equal(isChangeExonerated(result.category), true);
  // Blaming a commit for a pre-existing flake is the exact mistake
  // the engine exists to prevent.
  assert.equal(result.blame?.commitSha, undefined);
});

test('a first-time test failure on a previously green branch is a regression', () => {
  const result = diagnose(
    context({
      stage: { log: 'AssertionError: expected 1200 to equal 900\n  ✕ applies the discount ceiling' },
      run: { filesChanged: ['services/orders/src/promo.ts'] },
      history: { failingTests: [FRESH], previousRunOnBranchPassed: true },
    }),
  );
  assert.equal(result.category, 'code-regression');
  assert.equal(isChangeExonerated(result.category), false);
  assert.equal(result.blame?.commitSha, 'a'.repeat(40));
});

test('a regression on the default branch recommends a revert, not a fix-forward', () => {
  const onMain = diagnose(
    context({
      stage: { log: 'error TS2345: Argument of type string is not assignable' },
      run: { branch: 'main', filesChanged: ['services/orders/src/promo.ts'] },
      history: { previousRunOnBranchPassed: true },
    }),
  );
  assert.equal(onMain.category, 'code-regression');
  assert.equal(onMain.recommendedAction, 'revert');

  const onBranch = diagnose(
    context({
      stage: { log: 'error TS2345: Argument of type string is not assignable' },
      run: { branch: 'feat/thing', filesChanged: ['services/orders/src/promo.ts'] },
      history: { previousRunOnBranchPassed: true },
    }),
  );
  assert.equal(onBranch.recommendedAction, 'fix-forward');
});

// ---- Regression guards for bugs the engine actually had ---------

test('an OOM kill outranks the assertion noise from the half-run suite', () => {
  // Regression guard: a killed process reports every unfinished test
  // as failed, and the engine used to blame the commit for that.
  const result = diagnose(
    context({
      stage: {
        kind: 'test',
        log: [
          '  ✕ applies the discount ceiling',
          'AssertionError: expected 1200 to equal 900',
          '',
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
          'Process completed with exit code 137.',
        ].join('\n'),
      },
      history: { failingTests: [FRESH], runnerMemoryPct: 99.2, previousRunOnBranchPassed: true },
    }),
  );
  assert.equal(result.category, 'infra-capacity');
  assert.equal(result.recommendedAction, 'scale-runner');
});

test('a cross-branch build failure is not blamed on the commit even with no failing tests', () => {
  // Regression guard: the cross-branch signal used to sit behind an
  // early return that required a failing-test list, so build and
  // install stages never benefited from it.
  const result = diagnose(
    context({
      stage: {
        key: 'build',
        name: 'Compile',
        kind: 'build',
        log: "services/payments/src/provider.ts(14,10): error TS2305: Module '\"@northwind/retry-policy\"' has no exported member 'createBackoff'.",
      },
      history: { sameFailureOtherBranches: 3, lockfileChanged: false },
    }),
  );
  assert.equal(result.category, 'dependency-drift');
});

test('TS2305 is read as a dependency problem, not a local type error', () => {
  const upstream = diagnose(
    context({
      stage: {
        kind: 'build',
        log: "error TS2305: Module '\"@acme/core\"' has no exported member 'createLedgerClient'.",
      },
      history: { lockfileChanged: true },
    }),
  );
  assert.equal(upstream.category, 'dependency-drift');

  // A relative import failing to resolve is this repository's problem.
  const local = diagnose(
    context({
      stage: {
        kind: 'build',
        log: "error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
      },
      run: { filesChanged: ['services/orders/src/promo.ts'] },
      history: { previousRunOnBranchPassed: true },
    }),
  );
  assert.equal(local.category, 'code-regression');
});

// ---- Topology ---------------------------------------------------

test('one region failing while its peers succeed is config drift, not bad code', () => {
  const result = diagnose(
    context({
      stage: {
        key: 'deploy-apse2',
        name: 'Deploy ap-southeast-2',
        kind: 'deploy',
        environment: 'production',
        region: 'ap-southeast-2',
        log: 'Readiness probe failed: HTTP probe failed with statuscode: 503\n0/6 replicas are available',
      },
      run: { branch: 'main' },
      history: {
        siblingRegionResults: [
          { region: 'us-east-1', status: 'success' },
          { region: 'eu-west-1', status: 'success' },
          { region: 'ap-southeast-2', status: 'failed' },
        ],
        configDrift: [{ key: 'LEDGER_WEBHOOK_SECRET', expected: 'set', actual: 'absent' }],
      },
    }),
  );
  assert.equal(result.category, 'config-drift');
  assert.equal(isChangeExonerated(result.category), true);
  assert.match(result.recommendation, /Do not revert/i);
});

test('every region rejecting the artifact points back at the build', () => {
  const result = diagnose(
    context({
      stage: {
        key: 'deploy',
        name: 'Deploy',
        kind: 'deploy',
        environment: 'production',
        log: 'CrashLoopBackOff\n0/6 replicas are available',
      },
      history: {
        siblingRegionResults: [
          { region: 'us-east-1', status: 'failed' },
          { region: 'eu-west-1', status: 'failed' },
          { region: 'ap-southeast-2', status: 'failed' },
        ],
      },
    }),
  );
  assert.notEqual(result.category, 'config-drift');
});

// ---- Contract guarantees ---------------------------------------

test('declines to guess when there is no usable evidence', () => {
  const result = diagnose(
    context({ stage: { log: '##[error]Process completed with exit code 1.', baselineDurationMs: null } }),
  );
  assert.equal(result.category, 'unknown');
  assert.equal(result.recommendedAction, 'investigate');
  assert.ok(result.confidence <= 0.3, `expected low confidence, got ${result.confidence}`);
});

test('is deterministic: the same context always yields the same verdict', () => {
  const input = context({
    stage: { log: 'AssertionError: expected 3 to equal 2' },
    history: { failingTests: [FLAKY], sameFailureOtherBranches: 4 },
  });
  const a = diagnose(input);
  const b = diagnose(input);
  assert.deepEqual(a, b);
});

test('every verdict ships the evidence that produced it', () => {
  const result = diagnose(
    context({
      stage: { log: 'Error: ENOSPC: no space left on device, write' },
      history: { runnerDiskPct: 98 },
    }),
  );
  assert.ok(result.signals.length > 0);
  for (const signal of result.signals) {
    assert.ok(signal.id && signal.label && signal.detail, 'signal must be self-describing');
    assert.ok(signal.weight >= 0 && signal.weight <= 1);
  }
});

test('withholding evidence sources changes the verdict, proving they are used', () => {
  const input = context({
    stage: { log: 'AssertionError: expected 3 to equal 2' },
    history: { failingTests: [FLAKY], sameFailureOtherBranches: 4 },
  });
  assert.equal(diagnose(input).category, 'flaky-test');
  // Without history the flake record is invisible, so the same log
  // reads as an ordinary assertion failure.
  assert.notEqual(diagnose(input, { sources: ['log'] }).category, 'flaky-test');
});
