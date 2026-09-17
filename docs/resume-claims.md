# Résumé claims and where each number comes from

Every figure below is produced by committed code. Each row names the command
that regenerates it, so any claim can be re-verified — including by an
interviewer with the repository open.

**Rule for using this document:** never quote a number without the qualifier in
the "state it as" column. A bare "95.8% accurate" invites the obvious objection
and you lose the room. Leading with the ablation wins it.

---

## Bullets, ready to use

> **CodeLens — CI/CD root-cause analysis platform** · TypeScript, React 19,
> Hono, SQLite/Drizzle · [live demo](https://codelens-96py.onrender.com/demo)
>
> - Built a deterministic failure classifier that identifies the root cause of a
>   red CI/CD run from stage logs, cross-branch test history and multi-region
>   deploy topology — **95.8% accuracy over a 240-case labelled corpus** (88.9%
>   on 90 adversarial cases with competing decoy signals) in **under 0.1ms p95**,
>   with no model inference call.
> - Quantified each evidence source with an **ablation study**: log-pattern
>   matching alone reaches 75.0%, while flake history contributes +9.6pp and
>   region topology +8.3pp — the measurement that justified persisting both.
> - Eliminated a systematic misclassification where OOM-killed runners were
>   blamed on the developer's commit, by modelling evidence that *rules out* a
>   cause; **adversarial accuracy rose from 83.3% to 100%** on that subset.
> - Shipped change-impact analysis that traverses the reversed import graph to
>   find the blast radius of a diff — **one leaf module resolves to 32 downstream
>   files across 4 services and 10 public API endpoints in single-digit ms** — and flags
>   changed files no test in range covers.
> - Modelled CI/CD as a stage DAG across 3 production regions so parallel deploys
>   render side by side, making region-isolated failures visible without reading
>   a log; **57% of seeded failures are correctly cleared as not the author's
>   fault**.
> - Backed the platform with **50 automated tests** and a benchmark that fails
>   the build below 85% accuracy, so the headline metric cannot silently regress.

Pick three or four. The first two carry the most weight; the third is the best
answer to "tell me about a bug you found".

---

## Traceability

| Claim | Value | Source | Command |
| --- | --- | --- | --- |
| Root-cause accuracy | 95.8% (230/240) | `diagnosis_benchmark_runs.category_accuracy` | `pnpm bench` |
| Adversarial accuracy | 88.9% (90 cases) | `.hard_accuracy`, `.hard_cases` | `pnpm bench` |
| Log-only ablation | 75.0% (−20.8pp) | `.ablation[]` | `pnpm bench` |
| Flake-history contribution | +9.6pp | `.ablation[]` | `pnpm bench` |
| Region-topology contribution | +8.3pp | `.ablation[]` | `pnpm bench` |
| Classification latency | p95 < 0.1ms (~16µs p50, ~67µs p95 on this machine) | `.p50_compute_ms`, `.p95_compute_ms` | `pnpm bench` |
| OOM fix: 83.3% → 100% | adversarial subset | git history of `SUPPRESSIONS` in `packages/shared/src/diagnosis.ts` | `pnpm bench` before/after |
| Blast radius: 32 files / 4 services / 10 endpoints | from `packages/core/src/money.ts` | `computeBlastRadius` over the indexed demo graph | demo → Change impact |
| Blast radius traversal time | 1.5–3.5ms over 67 nodes / 113 edges | `BlastRadius.stats.computeMs` | same |
| Failures cleared as not-your-fault | 57% (4/7) | `delivery-overview` → `stats.exoneratedPct` | demo → Delivery |
| Test count | 50 (49 API + 1 events) | `pnpm test` | `pnpm test` |
| N+1 regression caught | 2 → 22 queries per request | Release Rehearsal measurement, asserted in `rehearsal.test.ts` | `pnpm test` |

## Numbers *not* to claim

Being disciplined here is what keeps the rest credible.

- **Do not claim a time-to-triage saving** (e.g. "cut triage from 40 min to
  30s"). The 40-minute figure is an industry anecdote, not something measured
  here. The landing page uses it as framing for the problem, never as a result.
- **Do not claim production traffic, users or uptime.** There are none.
- **Do not describe the demo repository as real.** It is seeded, and the UI says
  so. The *verdicts* on it are genuinely computed; the runs are not.
- **Do not round 95.8% up to "~96%" without the corpus size.** The size and the
  adversarial split are what make it defensible.

## Interview prep: the questions this project invites

**"95.8% on your own test set — isn't that meaningless?"**
Largely, as a headline. That is why the benchmark page leads with the ablation
rather than the accuracy. The corpus is synthetic and I wrote it alongside the
rules, so it is an upper bound. What the ablation shows is not "the model is
good" but "here is what each input is worth": withhold flake history and
accuracy drops 9.6 points, withhold region topology and it drops 8.3. Those
deltas are measured on the same corpus, so the shared bias cancels. It is also
why the adversarial subset exists and is reported separately at 88.9%.

**"Why rules instead of an LLM?"**
Three reasons, in priority order. Explainability: every verdict ships the
signals that produced it and the ones that argued against it, so an engineer can
check the reasoning — and for a tool that tells you to revert a commit, that is
the whole product. Determinism: the same evidence always yields the same verdict,
which is what makes the benchmark meaningful and the system debuggable.
Cost: 67µs and no token bill means it can run on every failed build without a
budget conversation. An LLM would be the right call for generating the
human-readable summary, and the provider interface in `packages/ai` is where
that would plug in.

**"What was the hardest part?"**
Separating a flaky test from a real regression. In a single run they are
identical — "tests failed" — so the discrimination has to come from the shape of
the failure over time: a flake fails at a low rate across unrelated branches, a
regression fails deterministically on exactly one branch starting at a specific
commit. The mechanism that made it work was modelling evidence that *rules a
cause out* rather than only evidence for it. The clearest case: a runner
OOM-killed mid-suite reports every unfinished test as failed, so those test
results carry almost no information. Before I suppressed test-derived evidence
on a kill signal, the engine blamed the developer's commit about half the time
on that shape of failure.

**"How would this work against real GitHub Actions?"**
The schema is already shaped for it — `pipeline_runs`, `pipeline_stages` and
`environments` map onto workflow runs, jobs and deployment environments, and the
webhook receiver with signature verification is built. What is missing is the
ingestion worker that polls the Actions API for job logs and writes those rows,
plus backfill for flake history. The classifier itself needs no change, which
was the point of keeping it a pure function over a `FailureContext`.

**"Walk me through a design decision you'd defend."**
Noisy-OR for combining signal weights instead of a weighted sum. A sum lets two
strong signals exceed 1.0 and requires normalisation that has no principled
basis. Noisy-OR (`1 - ∏(1 - wᵢ)`) treats each signal as independent evidence,
stays in [0,1] by construction, and gives diminishing returns for free — two 0.6
signals read as 0.84, which is the right answer. The independence assumption is
not strictly true, and I would revisit it if the corpus grew; with 15 log
signatures and 5 evidence sources it is a reasonable simplification.

**"What would you do next?"**
Live Actions ingestion, in that order of value. After that: learn the signal
weights from labelled outcomes instead of hand-tuning them, once there is real
data to learn from — the ablation harness is already the evaluation loop that
would need. And a Slack integration, because the verdict is most valuable
delivered to the person whose build broke rather than waiting on a dashboard.
