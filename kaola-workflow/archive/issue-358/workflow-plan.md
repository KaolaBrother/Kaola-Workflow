# Workflow Plan — issue #358

<!-- plan_hash: 472874bc565b60930597e7366d867f1baa444613b41567d82c98e28cdcafa46a -->

enhancement(tests): `npm run test:parallel` — four edition chains as parallel jobs, ending #307 `&&`-masking.

## Meta

labels: enhancement, area:scripts

Scope: add a local-only `test:parallel` runner that spawns the four edition chains
(`test:kaola-workflow:{claude,codex,gitlab,gitea}`) concurrently, buffers each chain's output,
ALWAYS runs all four to completion, prints a per-chain PASS/FAIL summary plus the failing chain's
output tail, and exits non-zero if any chain failed. `npm test` stays the canonical sequential gate
(unchanged). Make the runner trustworthy by bumping the load-sensitive 300ms closure-audit hang-probe
margins under a `TEST_PARALLEL=1` env so concurrent CPU contention no longer flakes the timeout-probe
scenarios. Document `test:parallel` in `docs/conventions.md` as the recommended pre-finalize check
satisfying #307's "all four recorded" requirement and correct the "run sequentially, not in parallel"
prose. No `area:security` label and no auth/secret/network-exposed surface → no G2 security-reviewer
node. The diff touches the gitlab/gitea edition trees (probe files) → cross-edition, so G1
code-reviewer post-dominance is required and all four chains must be green before Finalization.

The hang-probe margin change is ONE node (not a fanout) because it is the SAME semantic change to the
SAME hang-probe logic across three edition test drivers (#309): the three files share one canonical
spec — make the closure-audit probe timeout env-configurable so `TEST_PARALLEL=1` scales the 300ms
margin up while the default stays 300ms; the assertions still expect `skipped_timeout`. Splitting it
into parallel implementers risks divergent margins/env-knob names across editions.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| architect_design | code-architect | — | — | 1 | sequence |
| runner | tdd-guide | architect_design | scripts/test-parallel.js, package.json | 2 | sequence |
| flake_margin | tdd-guide | architect_design | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 3 | sequence |
| review | code-reviewer | runner, flake_margin | — | 1 | sequence |
| docs | doc-updater | review | docs/conventions.md, CHANGELOG.md | 2 | sequence |
| finalize | finalize | docs | kaola-workflow/issue-358/workflow-state.md | 1 | sequence |

<!-- architect_design: read-only design node above the two non-trivial implements. It fixes (a) the
     runner's process model — spawn all four `npm run test:kaola-workflow:*` chains concurrently,
     buffer stdout/stderr per chain, await ALL four (Promise.allSettled, never short-circuit), then
     print a PASS/FAIL summary + the failing chain's tail, process.exitCode non-zero iff any failed,
     wall-clock ≈ slowest single chain — and (b) the ONE shared env-margin contract both probe-bearing
     editions adopt: a single env knob (`TEST_PARALLEL=1`) that scales the closure-audit hang-probe
     timeout (currently the hard-coded `KAOLA_GH_REMOTE_TIMEOUT_MS: '300'` call-sites) up to a
     flake-safe margin while leaving the default at 300ms. code-architect is not a WRITE_ROLE, so it
     is not code-producing (writes only its design note); G1 still post-dominates it transitively via
     the review node it feeds into through runner/flake_margin. -->
<!-- runner: NEW scaffolding/wiring with a natural failing unit test — drive a fake 4-chain harness
     (shimmed `npm run` subcommands: some pass, some fail) and assert (1) all four are run to
     completion regardless of an early failure, (2) the printed summary reports each chain's
     PASS/FAIL, (3) exit is non-zero iff any chain failed, (4) buffered output is per-chain. Because
     a meaningful failing unit test exists, this is tdd-guide, not implementer. Write set is
     disjoint from flake_margin (the runner script + package.json vs. the three probe test drivers).
     package.json's `test:parallel` entry is the only package.json change. -->
<!-- flake_margin: behavioral logic with a testable assertion (the probe still returns
     `skipped_timeout`, now under a bumped margin when `TEST_PARALLEL=1`) → tdd-guide. ONE node per
     #309: the same hang-probe-margin change to the SAME logic across three edition test drivers
     (claude `simulate-workflow-walkthrough.js`, gitlab `test-gitlab-workflow-scripts.js`, gitea
     `test-gitea-workflow-scripts.js` — the only files carrying the load-sensitive
     `KAOLA_GH_REMOTE_TIMEOUT_MS: '300'` probe sites; the codex sims carry none). Shared canonical
     spec: read the probe timeout from a helper that returns the env-scaled margin under
     `TEST_PARALLEL=1` and 300ms otherwise — mirror the claude edition's exact margin logic and env
     knob in the gitlab/gitea drivers verbatim modulo forge nouns, so the editions converge by
     construction rather than each implementer inventing a margin. 3 paths, under FILE_CEILING. -->
<!-- review: G1 code-reviewer post-dominating both code-producing implements (runner, flake_margin).
     Cross-edition diff (gitlab/gitea trees touched) → all four `npm run test:kaola-workflow:*`
     chains must be recorded green before Finalization per #307. -->
<!-- docs: doc-updater — update docs/conventions.md (document test:parallel as the recommended
     pre-finalize check satisfying #307's "all four recorded"; correct the "run sequentially, not in
     parallel" caveat now that the probe margins are flake-hardened under TEST_PARALLEL=1) and add the
     CHANGELOG.md [Unreleased] entry. Runs before finalize because docs/public guidance changed. -->
<!-- finalize: docs/state-only sink — writes only the issue-358 workflow-state.md. CHANGELOG.md is
     owned by the docs node (disjoint), keeping the sink free of any non-docs write so it does not
     trip G1. -->

## Node Ledger

| id | status |
|----|--------|
| architect_design | complete |
| runner | complete |
| flake_margin | complete |
| review | complete |
| docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (architect_design) | subagent-invoked | # architect_design — blueprint (code-architect, read-only) | |
| tdd-guide (flake_margin) | subagent-invoked | # flake_margin — tdd-guide evidence (issue #358) | |
| tdd-guide (runner) | subagent-invoked | # runner — tdd-guide evidence (issue #358) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (docs) | subagent-invoked | # docs — doc-updater evidence (issue #358) | |
| finalize (finalize) | subagent-invoked | # finalize — sink node evidence (issue #358, main-session bookkeeping) | |
