# Adaptive Workflow Plan — bundle-612-613

<!-- plan_hash: f14a33c058e22238d5688a97cd5127c001437a470e38c64136120a26c89878ac -->

Two independent, disjoint-write test-hygiene bug fixes bundled from the 2026-07-04 post-completion
audit of #585-#611:

- **#612** — `node scripts/test-adaptive-node.js` run from the repo root leaks a real untracked
  artifact `kaola-workflow/legacy-test/.cache/run-progress.json` into the actual repo checkout. The
  #605 run-progress mirror (`writeRunProgressMirror` in `scripts/kaola-workflow-adaptive-node.js`,
  triggered when `realRepoRoot !== mainRoot` for a `LEDGER_MUTATING_SUBCOMMANDS` op) is FAIL-OPEN by
  design — nothing reds, the artifact just appears. Some fixture in `scripts/test-adaptive-node.js`
  does not fully sandbox the mainRoot resolution chain (`main_root:` state field, falling back to
  `getMainRoot` → `resolveMainRoot` → `getCoordRoot` → `git rev-parse --git-common-dir` in
  `scripts/kaola-workflow-adaptive-schema.js`), so it resolves outside its own temp sandbox.
- **#613** — two walkthrough cases (`testClosureAuditExecuteLabelRemovalTimeoutBreaks`,
  `testClosureAuditExecuteDetectionTimeoutPropagates`) race a real 300ms
  `KAOLA_GH_REMOTE_TIMEOUT_MS` OS-level `execFileSync` timeout-kill against a shim subprocess that
  hangs forever (`setInterval(() => {}, 1 << 30)`); under CPU contention the real wall-clock race
  misfires. `testClosureAuditExecuteDetectionTimeoutPropagates` is CONFIRMED cross-edition (present,
  byte-similar, in `scripts/simulate-workflow-walkthrough.js` AND
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` AND
  `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`);
  `testClosureAuditExecuteLabelRemovalTimeoutBreaks` exists ONLY in the root/claude walkthrough (no
  gitea/gitlab twin). The codex plugin walkthrough
  (`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`) has NEITHER case and is
  untouched — but the diff still touches the gitlab/gitea edition trees, so CLAUDE.md's #307
  four-chain policy applies to the bundle.

## Meta

labels: bug, area:scripts
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix612 | tdd-guide | — | scripts/test-adaptive-node.js, scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 1 | sequence | opus |
| n2-fix613 | tdd-guide | — | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js | 1 | sequence | opus |
| n3-docs | doc-updater | n1-fix612, n2-fix613 | CHANGELOG.md | 1 | sequence | sonnet |
| n4-review | code-reviewer | n1-fix612, n2-fix613, n3-docs | — | 1 | sequence | opus |
| n5-finalize | finalize | n4-review | — | 1 | sequence | — |

## Plan Notes

**AC → node map.**
- #612 AC (identify escaping fixture(s); pin with a RED assertion — run the suite from a fixture
  repo root, assert zero writes outside the sandbox; fix root resolution; full suite green; no
  `kaola-workflow/legacy-test/` residue) → **n1-fix612**.
- #613 AC (the two named cases pass reliably under parallel/contention load; the timeout code path
  stays genuinely exercised — non-vacuous; full walkthrough + affected chains green) →
  **n2-fix613**.

**Investigation carried in from planning (verified, not guessed) — hand this to n1/n2 so they don't
re-derive it:**
- **#612 mechanism** (confirmed by reading, NOT yet reproduced live): `scripts/kaola-workflow-adaptive-node.js`
  `main()` resolves `mainRoot` by first checking a `main_root:` field in the project's
  `workflow-state.md`, then falling back to `getMainRoot(repoRoot)` →
  `resolveMainRoot` (in `kaola-workflow-adaptive-schema.js`) → `getCoordRoot` → `git rev-parse
  --git-common-dir` (cwd-scoped to `repoRoot`, itself from `getRoot()` → `git rev-parse
  --show-toplevel`, cwd-scoped to whatever `cwd` the test's `execFileSync`/`spawnSync` call to the
  REAL CLI passed — or the inherited process cwd if a call site omits it). Any
  `LEDGER_MUTATING_SUBCOMMANDS` op where the resolved `mainRoot !== realRepoRoot` triggers
  `writeRunProgressMirror(mainRoot, project, ...)`, which does `fs.mkdirSync` +
  `fs.writeFileSync` under `path.join(mainRoot, 'kaola-workflow', project, '.cache',
  'run-progress.json')` — FAIL-OPEN (catches and swallows any error, never reds). A full serial run
  of `node scripts/test-adaptive-node.js` in a fresh local clone of this repo (not the live
  checkout) completed 0-exit / 1394 assertions with **no** leaked artifact and clean `git status`,
  so the escape is NOT reproduced by a single straightforward full-suite pass in a fresh clone —
  it may be order-sensitive, environment-state-sensitive (e.g. requires something already present
  under `.kw/` or `kaola-workflow/`), or otherwise conditional. Do NOT treat "test-file-only, single
  edition" as settled fact — treat it as the leading, evidence-backed hypothesis (no other test file
  references this fixture pattern; production's mirror-write is fail-open BY DESIGN so the intended
  fix target is fixture isolation, not the production write itself). **If live investigation shows
  the escape actually reaches into the shared root-resolution logic in
  `scripts/kaola-workflow-adaptive-node.js` / `scripts/kaola-workflow-adaptive-schema.js` (not just
  the test fixture)**, STOP before editing those files — they are mirrored across 4 editions
  (`plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`) and
  the declared write set here does not cover them; surface a `write_set_overflow`/repair-node cycle
  rather than editing outside the frozen set. **Never reproduce directly against this live repo
  checkout** (it will leak into the real working tree) — use a scratch clone or worktree to
  reproduce and verify the fix.
- **#613 candidate mechanism** (a concrete, verified-plausible direction, not mandated — n2 confirms
  via its own RED/GREEN cycle): the two flaky shims currently hang via
  `setInterval(() => {}, 1 << 30)` and rely on Node's real `execFileSync({timeout: N})` OS-level
  kill to fire after N ms — a genuine wall-clock race that a loaded box can miss (e.g. spawn/schedule
  latency alone can approach or exceed 300ms). The production code's classification
  (`err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT'` in
  `scripts/kaola-workflow-closure-audit.js`) does not care WHY the child died by SIGTERM — only that
  it did. A shim that immediately self-terminates via signal (e.g.
  `process.kill(process.pid, 'SIGTERM')` in place of the real hang) would make `execFileSync` throw
  the identical error shape deterministically and near-instantly, with NO dependency on the 300ms/
  2000ms window at all — satisfying "prefer determinism" without touching production code (the
  existing `REMOTE_TIMEOUT_MS`/`ghExec` mechanism is correct and unchanged). This is a TEST-ONLY
  candidate fix confined to the shim bodies in the three files above; the existing
  `probeTimeoutEnv()`/`TEST_PARALLEL` scaling (300ms/2000ms) can stay as-is or be simplified — n2's
  call. Confirm the fix is non-vacuous (the timeout code path — `labels_skipped_reason`,
  `labels_failed`/`labels_removed` shape — is still genuinely exercised) and stress-test per the AC
  (e.g. run the affected walkthrough(s) twice concurrently) before declaring green. Fallback per the
  issue's own direction: raise the probe budget to a contention-proof value (2000ms+) and assert
  ordering only, if the deterministic route proves more invasive than warranted.

**Cross-edition confirmation.** #613 is CONFIRMED cross-edition: n2's write set touches
`plugins/kaola-workflow-gitea/` and `plugins/kaola-workflow-gitlab/`, so CLAUDE.md's #307 policy
binds the WHOLE bundle — **n4-review must run all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains sequentially** (this box has hit
jetsam-kills of `git-merge-octopus` under default `auto` run-chains concurrency in
`test-adaptive-node.js` before — prefer `KAOLA_RUN_CHAINS_CONCURRENCY=serial` if using the run-chains
aggregator) and record all four green before verdict, even though the codex plugin walkthrough
itself carries neither flaky case. #612 (n1) is now ALSO cross-edition after the mid-run widening
below — the #307 obligation was already binding via #613, so this adds no new obligation.

**Plan repair (mid-run, before n1-fix612 closed).** n1-fix612's own live investigation — 4 disposable
scratch-clone environment variants (plain clone root; clone + registered linked worktree; + an active
`kaola-workflow/<project>/`; run FROM inside a linked worktree) under an `fs.writeFileSync`/`mkdirSync`
trap propagated into every spawned child, plus an isolated byte-replica of the walkthrough's #605(a)
mirror fixture — REFUTED the original hypothesis: `scripts/test-adaptive-node.js` has ZERO
run-progress-mirror references, `legacy-test` occurs NOWHERE in the repo (`git grep HEAD` = no match,
independently re-verified by the orchestrator), and even the real #605 mirror fixture (in
`scripts/simulate-workflow-walkthrough.js`, out of n1's original write set) does not escape its
sandbox in isolation. No RED/GREEN was possible in the original write set — n1 correctly halted
(write-set-overflow / hypothesis-refuted) without editing outside its declared set, and its leg stayed
clean. Operator (user) decision: rather than close #612 as unreproducible, WIDEN n1-fix612's write set
to harden the production `writeRunProgressMirror` (`scripts/kaola-workflow-adaptive-node.js:889`,
fail-open by design — catches and swallows any error, never validates that `mainRoot` was AFFIRMATIVELY
resolved from a trusted source before writing) and its `mainRoot` resolution chain
(`getMainRoot`/`resolveMainRoot`/`getCoordRoot` in `kaola-workflow-adaptive-schema.js`), regardless of
whether the literal `legacy-test` symptom reproduces — the fail-open write is judged a latent risk
worth closing defensively. This is now a genuine PRODUCTION fix, mirrored across all 4 editions
(`scripts/`, `plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`)
— widened write set above. **`kaola-workflow-adaptive-schema.js` must stay BYTE-IDENTICAL across all 4
copies** (cross-edition drift anchor per CLAUDE.md) — any edit there must be applied as the exact same
patch to all 4 files, never edition-specific prose. n1's own new AC: make the mirror write fail CLOSED
when `mainRoot` was not affirmatively resolved from the project's own `workflow-state.md` `main_root:`
field (i.e. never write on a heuristic/fallback-derived root), pin it with a RED assertion in
`scripts/test-adaptive-node.js`, GREEN after the fix, full suite green across all 4 editions, and no
behavior change to the legitimate (non-escaping) mirror-write path used by #605's own fixtures.

**Parallelism.** n1-fix612 and n2-fix613 are a genuine antichain — same role (tdd-guide),
file-disjoint write sets (`scripts/test-adaptive-node.js` vs the three #613 files), no shared root
cause, no ordering dependency (confirmed independent by the reporting auditor and by this
investigation). They are authored as two independent `sequence` nodes with NO edge between them
(NOT a declared `fanout` group — both write sets share the `scripts/` top-level directory, which the
validator's fan-out disjointness check treats as shared infra at directory granularity, so `fanout`
would be refused here even though the exact files never overlap). Left as a bare antichain, the
validator derives `parallel_safe` and the scheduler co-opens them by default; 2-wide is the genuine
scope here (no wider fan is warranted).

**Model rationale.** n1/n2 → opus: both are non-obvious-root-cause bug investigations (n1's escape
mechanism was NOT fully pinned down even after this planning session's own live-reproduction attempt;
n2 requires a considered determinism-vs-budget design call under an explicit AC direction) — reasoning
depth, not blast radius, drives the tier. n3-docs → sonnet (mechanical CHANGELOG entry, no design
decision). n4-review → opus (must verify the correctness of a determinism fix for a real subprocess-
signal race and confirm the four-chain cross-edition receipt — a strong reviewer over a cheap one).
n5-finalize carries no model (never dispatched as a subagent).

**Docs scope.** No public API/architecture/interface changes in either fix (internal test hygiene +
fixture isolation only) — CHANGELOG entry under `[Unreleased]` is sufficient; no ADR/decision record
warranted for either fix (narrow test-only corrections, not architecture decisions), no
docs/api.md or docs/architecture.md changes needed. n3-docs writes CHANGELOG.md BEFORE n4-review's
chain run (not folded into the finalize sink) so the four-chain receipt is not made
`chains_stale` by a later doc write.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix612 | complete |
| n2-fix613 | complete |
| n3-docs | complete |
| n4-review | complete |
| n5-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-fix613) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-fix612) | subagent-invoked | group_passed | |
| doc-updater (n3-docs) | subagent-invoked | evidence-binding: n3-docs 8061d8f8bc65 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review a1d4cdbf045d | |
