# Adaptive Workflow Plan — issue-526

<!-- plan_hash: d0a59dadad69b04d2a58fa7f90cb3989c2de32043b8de739c6c76e0179bea69d -->

## Meta

issue: 526
labels: —
title: perf(tests) race-safe test-suite parallelism for chain makespan — dedicated design track
shape_note: |
  #486 question-shaped issue with a bimodal acceptance — a recorded design analysis answering
  "is race-safe test-suite parallelism worth the complexity/risk, or is serial the right permanent
  posture?" against all five D-523-01 (existing) hard constraints, terminating in EITHER a proven measured
  implementation OR a documented "serial is the right posture" decision record (continuing the
  D-523 series). The ANALYSIS arc is fully knowable now and is authored here in full (Case A):
  probe -> assume -> adversarially falsify -> converge -> record. The BUILD shape (a concurrent
  runner) is genuinely unknowable until the analysis answers feasibility, so it is NOT authored
  here — if n4 converges on "build it", the orchestrator RE-PLANS a fresh build run FROM these
  findings (Case B, freeze-once, no in-place thaw). This run's deliverable is the design analysis
  + the D-526-01 decision record. Read-only design/shaping run: the only writes are the docs
  decision record (doc-updater) and CHANGELOG (finalize sink) — zero code blast radius, so no G1
  code-reviewer gate attaches (D-523-01 (existing) itself shipped docs-only with no #307 obligation).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-probe-surface | code-explorer | — | — | 1 | sequence | sonnet |
| n1-probe-knowledge | knowledge-lookup | — | — | 1 | sequence | sonnet |
| n2-assume | planner | n1-probe-surface, n1-probe-knowledge | — | 1 | sequence | opus |
| n3-falsify | adversarial-verifier | n2-assume | — | 1 | sequence | opus |
| n4-converge | planner | n3-falsify | — | 1 | sequence | opus |
| n5-record | doc-updater | n4-converge | docs/decisions/D-526-01.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-record | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Why a read-only design/shaping run, not a build DAG (#486 Case A→B split).** Issue 526's
  acceptance is explicitly bimodal: a recorded design analysis, then EITHER a proven implementation
  OR a documented "serial is right" decision record. A concurrent test runner's existence, write
  set, and role mix are contingent on whether the analysis concludes "yes" — they cannot be frozen
  into a build DAG now without laundering an unvalidated premise (the #486 anti-pattern). The
  analysis arc itself IS fully knowable, so it is authored here in full. If n4 converges on "build
  it", the orchestrator re-plans a fresh BUILD run (new plan_hash) authored from these findings;
  freeze-once is honored (no in-place thaw).
- **PROBE frontier (n1-probe-surface + n1-probe-knowledge, read-only, independent antichain).** Two
  DIFFERENT roles, so not a homogeneous fanout group — authored as two parallel-safe read-only nodes
  with no dep edge between them, so the validator derives parallel_safe and the scheduler overlaps
  them on the #472 concurrent read frontier (same makespan win as a fan-out, without forcing one
  role). `n1-probe-surface` (code-explorer) maps the cost/race surface: the 37 `&&`-chained commands
  in `package.json` `test:kaola-workflow:*`; the 231/15 self-contained vs SHARED_TMP_NAMES
  walkthrough split (`simulate-workflow-walkthrough.js` `SHARED_TMP_NAMES` ~line 12731, enforced in
  `main()`); the real-transaction race surface (git `worktree add/remove`, `merge --no-ff`,
  `commit-tree`, `update-ref`, ledger splices, `--sink` in `$TMPDIR`); and the current
  `A && B && C` first-failure-attribution + clean-exit mechanics. `n1-probe-knowledge`
  (knowledge-lookup) gathers external Node test-parallelism conventions and race-safety /
  hermetic-per-unit-isolation patterns (worker pools, per-worker `$TMPDIR` sandboxing, ordered
  first-failure aggregation under concurrency) that cannot be confirmed from the local codebase
  alone. Both are read-only (`—` write set).
- **ASSUME (n2, planner, opus).** Proposes the candidate answers — chain-level parallelism /
  walkthrough-internal parallelism / serial-is-the-right-posture — EACH with an explicit
  falsification test mapped to the five D-523-01 (existing) constraints (race-safety, the indivisible 15-member
  shared-tmp serial unit, deterministic first-failure attribution + clean exit, MEASUREMENT
  INTEGRITY net of contention, and the #307 four-chain cross-edition obligation). opus: these
  hypotheses + falsification criteria constrain every downstream node.
- **FALSIFY (n3, adversarial-verifier, opus, Bash).** A SEPARATE subagent (structural independence)
  tries to REFUTE the leading answer against the probe evidence. Read-only but Bash-capable, so it
  can run the EXISTING chains/scenarios and MEASURE real CPU/IO contention to test constraint #4
  (measurement integrity — medians, multiple runs, not a best-case number; the ~28% jitter D-523
  already observed). It cannot rubber-stamp a "win" the measurement does not support. opus: subtle
  race-safety + measurement-integrity reasoning is the critical gate of this run.
- **CONVERGE (n4, planner, opus).** Records the answer + rationale and, if "build it", the
  recommended BUILD shape (so the orchestrator can re-plan from it). opus: the converged answer and
  recommended shape constrain the entire potential follow-on build run.
- **RECORD (n5, doc-updater, sonnet).** Writes `docs/decisions/D-526-01.md` — the next free number
  in the D-523 series (verified: no D-526-* exists), continuing the series per the issue's "decision
  record continuing the D-523 series" acceptance branch. Docs-only write → no G1 code-reviewer gate
  (matches D-523-01 (existing) shipping docs-only with no #307 obligation). Decision-record numbering checked
  at authoring time (#337) — D-526-01 is confirmed free.
- **finalize (n6, sink).** Single unique sink, docs/state only (`CHANGELOG.md`). No code write on
  the sink (would trip code-reviewer). No model cell (never dispatched as a subagent). Sink posture
  is worktree / merge per workflow-state.md.
- **No G1/G2/G3 gates.** Zero code-producing nodes (the only writes are the docs decision record and
  CHANGELOG), no sensitive write surface, and no non-delegable human/device acceptance check — so no
  `code-reviewer`/`security-reviewer`/`main-session-gate` post-dominance obligation attaches. The
  adversarial-verifier here is the #486 FALSIFICATION step (read-only, depends on n2), not a
  change-gate over a code diff.
- **No speculative_open_policy.** No read-only node has its sole unsatisfied predecessor as a
  high-probability-pass GATE; n4-converge legitimately must wait for the falsification result.
  Meta key left at the default (off).

## Node Ledger

| id | status |
| --- | --- |
| n1-probe-surface | complete |
| n1-probe-knowledge | complete |
| n2-assume | complete |
| n3-falsify | complete |
| n4-converge | complete |
| n5-record | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-probe-surface) | subagent-invoked | evidence-binding: n1-probe-surface 9d13b7632bfa | |
| knowledge-lookup (n1-probe-knowledge) | subagent-invoked | evidence-binding: n1-probe-knowledge 1c35b4411782 | |
| planner (n2-assume) | subagent-invoked | evidence-binding: n2-assume 6483bcfc7dd7 | |
| adversarial-verifier (n3-falsify) | subagent-invoked | evidence-binding: n3-falsify 9f41ccb1dfc5 | |
| planner (n4-converge) | subagent-invoked | evidence-binding: n4-converge 9e4603f3857f | |
| doc-updater (n5-record) | subagent-invoked | evidence-binding: n5-record c42b139fa07a | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize f52a9ca203c5 | |
