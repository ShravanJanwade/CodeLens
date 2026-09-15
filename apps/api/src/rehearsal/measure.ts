import { performance } from 'node:perf_hooks';
import { startFixture, type Variant, type Trace } from '@codelens/taskforge';

export type Check = {
  name: string;
  outcome: 'passed' | 'failed' | 'inconclusive';
  expected: string;
  actual: string;
  traceId?: string;
  request?: string;
};
export function percentile(values: number[], q: number) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * q) - 1)] ?? 0;
}
export interface Measurement {
  contention?: Array<{ p95Ms: number; samplesMs: number[] }>;
  variant: Variant;
  engine: string;
  workers: number;
  pageSize: number;
  checks: Check[];
  traces: Trace[];
  repetitions: Array<{
    p50Ms: number;
    p95Ms: number;
    throughput: number;
    errors: number;
    requests: number;
    durationMs: number;
    maxQueries: number;
    queryDurationMs: number;
  }>;
  process: { cpuUserMs: number; cpuSystemMs: number; rssBytes: number; scope: string };
  settings: {
    warmup: number;
    requestsPerRepetition: number;
    repetitions: number;
    concurrency: number;
    dataIdentity: string;
    normalization: string[];
  };
}
export async function measure(
  variant: Variant,
  options: { workers?: number; pageSize?: number; signal?: AbortSignal } = {},
): Promise<Measurement> {
  const app = await startFixture(variant, {
    workers: options.workers,
    postgresUrl: process.env.TASKFORGE_DATABASE_URL,
  });
  const checks: Check[] = [];
  const repetitions: Measurement['repetitions'] = [];
  const cpu = process.cpuUsage();
  const pageSize = options.pageSize ?? 20;
  const request = async (endpoint: string, user = 1, method = 'GET') => {
    options.signal?.throwIfAborted();
    const response = await fetch(`${app.url}${endpoint}`, {
      method,
      headers: { 'x-user-id': String(user) },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
    return { response, body: (await response.json()) as any };
  };
  try {
    const allowed = await request('/api/issues?project=1&size=5');
    checks.push({
      name: 'Member can list issues',
      outcome:
        allowed.response.status === 200 &&
        Array.isArray(allowed.body.issues) &&
        allowed.body.issues.length === 5 &&
        allowed.body.issues.every(
          (i: any) => typeof i.id === 'number' && typeof i.title === 'string' && i.commentCount === 4,
        )
          ? 'passed'
          : 'failed',
      expected: '200; five issues; four comments per issue',
      actual: `${allowed.response.status}; ${allowed.body.issues?.length ?? 0} issues`,
      traceId: allowed.response.headers.get('x-trace-id')!,
      request: 'GET /api/issues?project=1&size=5 (x-user-id: 1)',
    });
    const denied = await request('/api/issues?project=2&size=5');
    checks.push({
      name: 'Non-member cannot read private project',
      outcome: denied.response.status === 403 ? 'passed' : 'failed',
      expected: '403',
      actual: String(denied.response.status),
      traceId: denied.response.headers.get('x-trace-id')!,
      request: 'GET /api/issues?project=2&size=5 (x-user-id: 1)',
    });
    const anonymous = await request('/api/issues', 0);
    checks.push({
      name: 'Anonymous request is rejected',
      outcome: anonymous.response.status === 401 ? 'passed' : 'failed',
      expected: '401',
      actual: String(anonymous.response.status),
      traceId: anonymous.response.headers.get('x-trace-id')!,
    });
    const searched = await request('/api/issues?search=Issue%20003');
    checks.push({
      name: 'Search returns the matching issue',
      outcome: searched.body.issues?.length === 1 && searched.body.issues[0].id === 3 ? 'passed' : 'failed',
      expected: 'issue 3 only',
      actual: JSON.stringify(searched.body),
      traceId: searched.response.headers.get('x-trace-id')!,
    });
    const report = await request('/api/reports', 1, 'POST');
    let completed = false;
    for (let poll = 0; poll < 10 && !completed; poll++) {
      const result = await request(`/api/reports/${report.body.id}`);
      completed = result.body.status === 'completed';
      if (!completed) await new Promise((r) => setTimeout(r, 20));
    }
    checks.push({
      name: 'Background report completes within bounded polling',
      outcome: report.response.status === 202 && completed ? 'passed' : 'failed',
      expected: '202 then completed within 10 polls',
      actual: completed ? 'completed' : 'timeout',
    });
    const endpoint = `/api/issues?project=1&size=${pageSize}`;
    for (let warmup = 0; warmup < 4; warmup++) await request(endpoint);
    for (let repeat = 0; repeat < 2; repeat++) {
      const durations: number[] = [];
      let errors = 0;
      const traceStart = app.traces.length;
      const start = performance.now();
      for (let i = 0; i < 16; i++) {
        const time = performance.now();
        const { response } = await request(endpoint);
        durations.push(performance.now() - time);
        if (response.status !== 200) errors++;
      }
      const durationMs = performance.now() - start;
      const traces = app.traces.slice(traceStart);
      repetitions.push({
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        throughput: 16 / (durationMs / 1000),
        errors,
        requests: 16,
        durationMs,
        maxQueries: Math.max(...traces.map((t) => t.queryCount)),
        queryDurationMs: traces.reduce((n, t) => n + t.queryDurationMs, 0),
      });
    }
    const maxQueries = Math.max(...repetitions.map((r) => r.maxQueries));
    checks.push({
      name: 'Issue listing query budget',
      outcome: maxQueries <= 4 ? 'passed' : 'failed',
      expected: 'at most 4 database queries/request',
      actual: String(maxQueries),
      traceId: app.traces.find((t) => t.queryCount === maxQueries)?.id,
      request: `GET ${endpoint} (x-user-id: 1)`,
    });
    const contention: Array<{ p95Ms: number; samplesMs: number[] }> = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const samplesMs: number[] = [];
      for (let i = 0; i < 5; i++) {
        const time = performance.now();
        await Promise.all([request('/api/reports', 1, 'POST'), request(endpoint)]);
        samplesMs.push(performance.now() - time);
      }
      contention.push({ p95Ms: percentile(samplesMs, 0.95), samplesMs });
    }
    checks.push({
      name: 'Foreground latency during report generation',
      outcome: contention.every((r) => r.p95Ms <= 150) ? 'passed' : 'failed',
      expected: 'paired request p95 <= 150 ms',
      actual: `${contention.map((r) => r.p95Ms.toFixed(2)).join(', ')} ms`,
    });
    const used = process.cpuUsage(cpu);
    return {
      variant,
      engine: app.engine,
      workers: app.workers,
      pageSize,
      checks,
      traces: app.traces,
      repetitions,
      contention,
      process: {
        cpuUserMs: used.user / 1000,
        cpuSystemMs: used.system / 1000,
        rssBytes: process.memoryUsage().rss,
        scope: 'Entire Node process including runner; not isolated application resource metrics',
      },
      settings: {
        warmup: 4,
        requestsPerRepetition: 16,
        repetitions: 2,
        concurrency: 1,
        dataIdentity: 'taskforge-v1:2-users:2-projects:80-issues:320-comments',
        normalization: [
          'Generated report identifiers are used for polling, not equality comparison.',
          'No normalization of issue ordering, permission results or business values.',
        ],
      },
    };
  } finally {
    await app.close();
  }
}
export function compare(baseline: Measurement, candidate: Measurement): Check[] {
  const ratios = candidate.repetitions.map((r, i) => r.p95Ms / baseline.repetitions[i].p95Ms);
  const meaningful = candidate.repetitions.every((r, i) => r.p95Ms - baseline.repetitions[i].p95Ms > 2);
  const contentionChecks: Check[] = [];
  if (baseline.contention && candidate.contention) {
    const ratios = candidate.contention.map((r, i) => r.p95Ms / baseline.contention![i].p95Ms);
    const meaningful = candidate.contention.every((r, i) => r.p95Ms - baseline.contention![i].p95Ms > 10);
    contentionChecks.push({
      name: 'Background contention latency regression',
      outcome:
        ratios.every((r) => r > 1.5) && meaningful
          ? 'failed'
          : ratios.every((r) => r <= 1.5)
            ? 'passed'
            : 'inconclusive',
      expected: 'paired foreground/report p95 <= baseline × 1.50 in both repetitions; delta > 10 ms to fail',
      actual: `Ratios: ${ratios.map((r) => r.toFixed(2)).join(', ')}. Process-shared contention test; not isolated CPU telemetry.`,
    });
  }
  return [
    ...candidate.checks,
    ...contentionChecks,
    {
      name: 'p95 latency regression',
      outcome:
        ratios.every((r) => r > 1.3) && meaningful
          ? 'failed'
          : ratios.every((r) => r <= 1.3)
            ? 'passed'
            : 'inconclusive',
      expected: 'candidate p95 <= baseline × 1.30 in both repetitions; delta > 2 ms to fail',
      actual: `Ratios: ${ratios.map((r) => r.toFixed(2)).join(', ')}. Small/mixed changes remain inconclusive.`,
    },
  ];
}
