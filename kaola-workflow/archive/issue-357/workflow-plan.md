# Adaptive Workflow Plan — issue-357

<!-- plan_hash: 406b68b9610ea7fdd6a48facd96cd730f34de75b91375796ace42a0595f0d1a3 -->

adaptive: walkthrough dev-loop ergonomics — a `--only <name|prefix>` / `--list` scenario filter,
child output on failure, runNode timeouts + env scrub, fail-closed gh mock, and git-config /
shared-tmp isolation. Surfaced by the 2026-06-10 architecture audit. This is a TEST-HARNESS change
only: no production scripts, no public runtime API, no schema. Two independent code clusters share
one ready frontier (disjoint write sets):

1) `harness` (tdd-guide) — `scripts/simulate-workflow-walkthrough.js` only. The substantial,
   test-bearing change: a scenario REGISTRY (name→fn) + `--only <name|prefix>` + `--list` (default =
   all, order preserved, the pinned sentinel line `Workflow walkthrough simulation passed` and EVERY
   `assertConcept`-pinned test-function name UNCHANGED — validate-workflow-contracts.js:532 + :342-360
   read this source); `ghMockEnv` THROWS when the shim file is missing (fail-closed, no silent
   real-`gh`); `runNode` gains a default timeout (~120s) + a minimal `KAOLA_*` env scrub (delete
   unless test-provided); `initGitRepo` sets `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1`;
   `main().catch` prints `err.stdout`/`err.stderr` tails; shared-tmp head scenarios migrated to
   per-scenario mkdtemp. Natural failing tests exist (`--only testFinalize` runs just that scenario
   green; `--list` prints names; a missing shim fails fast) → tdd-guide.
2) `editions` (implementer) — the FOUR runner-of-runners with a swallowing `run()`/`stdio:'pipe'`
   (gitlab+gitea base + their codex variants). Same canonical change, mirrored per edition modulo
   path nouns (#309 shared spec, NOT free-form): wrap the child `execFileSync` so a failing child's
   `err.stdout`/`err.stderr` tails PRINT on failure instead of being swallowed. Behavior-preserving
   ergonomic wiring in harnesses that have no unit-test assertion surface → implementer.
   non_tdd_reason: no meaningful failing unit test — these are runner-of-runners whose only
   observable change is "print child output on failure"; pure parallel-prose mirror of the Claude
   runner's catch treatment across 4 edition files (4 ≤ FILE_CEILING 6).

These four edition runners are NOT byte-synced to scripts/simulate-workflow-walkthrough.js (each tests
a different surface; validate-script-sync.js excludes them), so no byte-identity group is touched and
no production const/token/env-var is renamed (#306 cross-edition scan clean — the only cross-tree
coupling is the READ-ONLY sentinel + assertConcept pins, which AC requires UNCHANGED).

review (code-reviewer) post-dominates BOTH code producers — one wall above the harness+editions
frontier (G1). No `*security*` path in any write-set and non-sensitive labels (enhancement,
area:scripts) → G2 not triggered. adversary (adversarial-verifier) adds rigor (the #290 test-tooling
precedent). docs (doc-updater) records the new `--only`/`--list` dev-loop + isolation conventions in
docs/conventions.md before the sink (a developer-facing test interface changed). finalize is the
unique docs/state sink (CHANGELOG.md only).

## Meta

labels: enhancement, workflow:in-progress, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| harness | tdd-guide | — | scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| editions | implementer | — | plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | harness, editions | — | 1 | sequence |
| adversary | adversarial-verifier | review | — | 1 | sequence |
| docs | doc-updater | adversary | docs/conventions.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| harness | complete |
| editions | complete |
| review | complete |
| adversary | complete |
| docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (harness) | subagent-invoked | # harness — tdd-guide evidence (issue #357) | |
| implementer (editions) | subagent-invoked | # editions — implementer evidence (issue #357) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (adversary) | subagent-invoked | verdict: pass | |
| doc-updater (docs) | subagent-invoked | # docs — doc-updater evidence (issue #357) | |
| finalize (finalize) | main-session-direct | # finalize — sink node evidence (issue #357, main-session bookkeeping) | |
