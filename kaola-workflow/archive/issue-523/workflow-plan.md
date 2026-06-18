<!-- plan_hash: 87346cf2b57d8c9d4905ea82d827496fadb0d9a0da96e8849415ea692fbcd304 -->
<!-- workflow-plan: issue-523 -->

## Meta

labels: —
shape_class: question-shaped (#486 Case B — bug/perf flavor: phenomenon clear (~574s claude chain), cause/fix unknown)
intent: Read-only SHAPING run. Root-cause the ~574s `test:kaola-workflow:claude` runtime, then DECIDE the
        shape of the remaining work (optimize vs. document-genuine-growth). The shape of any follow-on build
        run is UNKNOWABLE until the profile lands (files/roles/write-set depend on the findings), so per the
        freeze-once contract this is authored as a short read-only shaping run that records the findings +
        recommended plan SHAPE as a durable decision record; the orchestrator RE-PLANS a fresh run (new
        plan_hash) authored FROM the findings if a safe optimization is found. No code-producing node here →
        no G1/G2 gate; the only write is the finalize sink's decision record (docs/state — allowed on the sink).
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-survey | code-explorer | — | — | 1 | sequence | sonnet |
| n2-profile | adversarial-verifier | n1-survey | — | 1 | sequence | sonnet |
| n3-assume | planner | n2-profile | — | 1 | sequence | opus |
| n4-falsify | adversarial-verifier | n3-assume | — | 1 | sequence | opus |
| n5-converge | planner | n4-falsify | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-converge | docs/decisions/D-523-01.md | 1 | sequence | — |

## Plan Notes

- **Decision record id (#337):** `D-523-NN` is FREE in `docs/decisions/` (only `D-512-01 (existing)` and `D-522-01 (existing)`
  exist for the 52x series; the per-issue D-523 series is unused). This shaping run mints `D-523-01`
  (the recorded profile breakdown + the root-cause decision). A follow-on optimize BUILD run, if the
  findings recommend one, would take `D-523-02` (mirrors the D-500-01 (existing) shaping / D-500-02 (existing) build pattern).

- **n1-survey (`code-explorer`, READ-ONLY, no Bash):** map the cost surface WITHOUT running anything.
  Read `package.json` `test:kaola-workflow:claude` (the 37 `&&`-chained commands), enumerate the
  `node scripts/…` entries, and read `scripts/simulate-workflow-walkthrough.js` to extract: the scenario
  registry (`--only` selectable units), the count + distribution of real subprocess spawns
  (`spawnSync`/`execFileSync`/`execSync` ≈ 503 per the seed), and where per-test `git init`/worktree/
  `--sink` transactions are set up (shared-tmp vs. self-contained entries). Deliverable: the candidate
  timing-unit inventory (the 37 chain commands + the top-N suspect scenarios + their spawn counts) that
  n2 will actually time. Write evidence to `kaola-workflow/issue-523/.cache/n1-survey.md`.

- **n2-profile (`adversarial-verifier`, READ-ONLY + Bash — the only read-only role that can execute):**
  RUN the measurement. (a) Time each of the 37 chain commands individually (`/usr/bin/time -p`) and rank
  the slowest scripts. (b) Within the walkthrough, time per-scenario via `--only` (from n1's inventory),
  identifying the top-N slowest `test*` functions + per-scenario subprocess count.
  **CRITICAL — long-running + resumable (advisor-flagged, ~15-25 min real subprocess work):** write
  durable partial results to `kaola-workflow/issue-523/.cache/n2-profile.md` INCREMENTALLY (one timed
  unit per row, as it completes), and make the procedure RESUMABLE — on re-dispatch, SKIP any unit
  already recorded in the cache and resume from the first un-timed unit. A stream-timeout must not lose
  the work. **Do NOT fan out the timing** — concurrent timing on one machine contends for CPU/IO and
  SKEWS the very numbers being measured (accuracy is precedence #1). Serial measurement only; if a
  budget pass is needed, do a fast first-pass ranking then SERIAL confirmation of the top-N. Writes
  nothing outside `.cache` (read-only node — timing executes subprocesses but produces no repo edit).

- **n3-assume (`planner`):** from the n2 profile, form 2–3 root-cause HYPOTHESES for the ~574s, each with
  an explicit falsification criterion ("a re-run / spawn-count check shows ___ if true, ___ if false").
  Per the seed the leading hypothesis is "the walkthrough's ~503 real-subprocess spawns (real git repos +
  real `--sink` transactions) dominate; a share is redundant/avoidable per-test `git init`/`--sink`
  setup." Name the alternatives (environment slowdown; a small set of heavy non-walkthrough scripts;
  genuine irreducible coverage). Evidence → `kaola-workflow/issue-523/.cache/n3-assume.md`.

- **n4-falsify (`adversarial-verifier`, READ-ONLY + Bash, SEPARATE subagent — independence is structural):**
  try to REFUTE the leading hypothesis against the n2 evidence. Re-run the top-N suspect timing unit(s)
  to confirm the cost attribution is stable (not environment jitter), and ask the load-bearing question:
  is the dominant cost **genuine irreducible work** (real transactions a behavior-preserving change can't
  remove) **or avoidable redundancy** (shareable fixtures / consolidatable `--sink` runs / duplicated
  coverage)? This is what decides AC#2's "is there a SAFE optimization AT ALL?" — do not assume one
  exists. Read-only (executes repros, writes nothing). Evidence →
  `kaola-workflow/issue-523/.cache/n4-falsify.md`.

- **n5-converge (`planner`):** record the LOCALIZED dominant cost + the recommended plan SHAPE for the
  re-plan: either (A) a concrete behavior-preserving optimization (which files/roles/write-set a fresh
  build run would author — e.g. shared git fixtures, consolidated `--sink` transactions, scenario
  parallelization in the registry) with the expected before/after, OR (B) "genuine suite growth — no
  safe reduction" with the evidence. If the cost is dominated by `simulate-*-walkthrough.js` family
  restructuring, flag the CROSS-EDITION reach (#307: all four chains) for the re-plan's write-set.
  Evidence → `kaola-workflow/issue-523/.cache/n5-converge.md`.

- **n6-finalize (`finalize`, docs/state-only write — allowed on the sink):** write
  `docs/decisions/D-523-01.md` recording (1) the AC#1 profile breakdown (per-chain-command timing +
  per-top-N-scenario timing, dominant cost identified by evidence), (2) the AC#2 decision (optimize
  shape OR documented genuine-growth), and (3) the recommended next step for the orchestrator (re-plan a
  fresh build run as `D-523-02`, OR close with the documented-growth decision). Related: #512, D-512-01 (existing)
  (the deferral this dig resolves). NON-docs write on the sink would trip code-reviewer — sink writes
  ONLY the decision record.

- **Escalation valve (#486):** this is a FACTUAL dig (root-cause + a behavior-preserving optimization
  decision), not a value/standing/irreversible call — no `consent`-halt expected. The ONE escalation
  case: if n2 CANNOT stably reproduce the ~574s cost after a bounded measurement pass (timings dominated
  by un-attributable environment jitter), do NOT guess a fix — route to the `consent`-halt valve
  (`write-halt --reason consent`) so the operator decides, rather than recommending a speculative
  optimization against unreproduced numbers.

## Node Ledger

| id | status |
| --- | --- |
| n1-survey | complete |
| n2-profile | complete |
| n3-assume | complete |
| n4-falsify | complete |
| n5-converge | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-survey) | subagent-invoked | evidence-binding: n1-survey b44d5058e7cb | |
| adversarial-verifier (n2-profile) | subagent-invoked | evidence-binding: n2-profile f482012d6e5d | |
| planner (n3-assume) | subagent-invoked | evidence-binding: n3-assume aec55ca15c80 | |
| adversarial-verifier (n4-falsify) | subagent-invoked | evidence-binding: n4-falsify c3ee9e742ffb | |
| planner (n5-converge) | subagent-invoked | evidence-binding: n5-converge 8ece42278776 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize f591fce97eed | |
