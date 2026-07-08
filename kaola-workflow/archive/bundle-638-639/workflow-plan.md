# Workflow Plan — bundle-638-639

<!-- plan_hash: 050a1cdb7c467840907e45b82f5e2b2721071208f80378901746fd2adaaf6821 -->

## Meta
project: bundle-638-639
labels:
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-editionsync-check | tdd-guide | — | scripts/edition-sync.js, scripts/test-edition-sync.js | 2 | sequence | standard |
| n2-opt-freeze | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence | reasoning |
| n3-review | code-reviewer | n1-editionsync-check, n2-opt-freeze | — | 1 | sequence | reasoning |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning |
| n5-docs | doc-updater | n3-review | docs/api.md, docs/plan-run-cards/metric-optimizer.md, docs/decisions/D-638-01.md, docs/decisions/D-639-01.md | 4 | sequence | standard |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

Bundle of two small, cross-edition (#307) hardening follow-ups with exact-file-DISJOINT write sets,
authored as a natural 2-leg lane group (n1 ∥ n2 — an antichain with no dep edge, so the validator
derives `parallel_safe` and the scheduler co-opens them in isolated per-leg worktrees; both are
`scripts/`-area exact-file-disjoint, no PROTECTED file on a leg, gate post-dominates the union → the
#546-G2/#593 relaxation net applies).

- **n1-editionsync-check (#638 — edition-sync `--check` symmetry).** tdd-guide/standard: mechanical
  parity extension carrying out an already-specified fix (mirror `runWrite`'s #629 create-on-missing
  steps (b)/(c) into `runCheck` so `--check` reds a missing/divergent COMMON_SCRIPTS + byte-group
  mirror, not only a GENERATED_AGGREGATOR drift). RED first: a `test-edition-sync.js` case asserting
  `--check` reds a planted missing/divergent COMMON / byte-group mirror (today it stays GREEN — the
  `--check`/`--write` asymmetry). `edition-sync.js` and `test-edition-sync.js` are ROOT-ONLY (no
  edition port), so this leg's write set is the two root files.

- **n2-opt-freeze (#639 — metric-optimizer OPT freeze-rule hardening).** tdd-guide/reasoning:
  freeze-wall validator logic (highest blast radius in the system — governs every plan freeze across
  all four editions); the reasoning tier earns it on the typed-refusal precedence, the `..`-segment
  normalization, and the duplicate/fenced-decoy header counting. RED first: a typed-refuse walkthrough
  fixture per rule in `scripts/simulate-workflow-walkthrough.js`, each paired with an accept fixture.
  Rules (per the issue + roadmap stub):
  - **R1** — refuse `metric_command` absence at freeze (implicitly required by D2; no OPT rule reads
    `c.metric_command` today). ~3-line `errors.push('OPT-…: metric_command required')`.
  - **R2/R5** — refuse directory-shaped and `../`-alias `metric_paths` in OPT-2 (exact-string
    disjointness misses `bench/` and `bench/../src/hot.js`). Reuse the in-file `hasUnresolvableEntry`
    shape test (dir/glob) + the same `tok.split('/').indexOf('..') !== -1` `..`-segment refusal already
    used for `declared_write_set` (plan-validator.js:1404). All in-file — no `adaptive-schema.js` widen.
  - **R3/R7** — refuse duplicate / fenced-decoy `optimize(<id>)` blocks (Map.set last-win) by counting
    headers per id and pushing OPT-1 on a duplicate.
  - **R6 (numeric hex/exp `budget` form) is DOCUMENTATION-ONLY** — the cap binds on the CONVERTED value
    (no unbounded escape), so NO refusal is added; it is captured as a doc note only (see n5-docs).
  - `kaola-workflow-plan-validator.js` is a GENERATED_AGGREGATOR, so this node declares all four
    editions atomically (`generated_port_split`): canonical + codex twin + gitlab/gitea forge ports.
    Canonical spec for the three ports = the FULL accumulated root diff, regenerated via
    `node scripts/edition-sync.js --write` (sync:editions); the OPT tests live ONLY in the root
    `simulate-workflow-walkthrough.js` (the edition chains re-run the regenerated validators + their
    own walkthroughs). Both edits ship in ONE node — no separate forge-port node, no ordering gap.

- **Gates.** Labels are empty and no write-set path matches a sensitivity pattern → G2 not required
  (no security-reviewer). G1: `n3-review` (code-reviewer) post-dominates both code producers (n1, n2).
  `n4-adversary` (adversarial-verifier) is a change-gate on the code→sink path — it has Bash and runs
  the four `npm run test:kaola-workflow:*` chains + live plants over the freeze-wall change (matches
  the session pattern; #639 was itself surfaced by an adversary). Reviewer-shaped nodes are authored at
  the `reasoning` tier (the reasoning floor for a freeze-wall gate); the orchestrator applies the
  session-standing model=fable dispatch override for `code-reviewer`/`adversarial-verifier`.
- **n5-docs (doc-updater/standard)** updates the OPT documentation surfaces to the reviewed behavior:
  `docs/api.md` (OPT freeze-rule section — R1 required `metric_command`, R2 dir/`..` refusal, R3
  duplicate-block refusal) + `docs/plan-run-cards/metric-optimizer.md` (OPT-1/OPT-2 table rows + the
  R6 doc-only note) + next-free decision records `D-638-01.md`, `D-639-01.md` (the existing repo
  decision records run through `D-637-01 (existing)`). Docs-only write set (not code-producing → no
  extra G1). Depends only on the `n3-review` gate → speculative-open-eligible under `auto` (overlaps
  the review; DISCARD-only on a gate fail).
- **n6-finalize** is the unique docs/state sink (CHANGELOG.md `[Unreleased]` entry; issues 638+639
  close together under the `all_or_nothing` closure policy). Finalization runs the recorded
  `validation_command` (four-chain #307, run sequentially) as its evidence.

## Node Ledger

| id | status |
| --- | --- |
| n1-editionsync-check | complete |
| n2-opt-freeze | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-editionsync-check) | subagent-invoked | deferred_to_group | |
| tdd-guide (n2-opt-freeze) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 3ad8d13438cb | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 7f0c45f9b93b | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 3923aeb28a89 | |
