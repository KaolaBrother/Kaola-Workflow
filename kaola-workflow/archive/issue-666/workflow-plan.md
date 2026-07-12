# Workflow Plan — issue-666

<!-- plan_hash: 71d9bc14b50393543eb59e092d5f7cb75f5550a64120b37d593a3dd6064dc205 -->

## Meta

labels: workflow:in-progress
validation_command: node scripts/simulate-workflow-walkthrough.js
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-plan-validator | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-adaptive-node.js | 5 | sequence | standard |
| n2-sweep | implementer | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js | 16 | sequence | standard |
| n3-review | code-reviewer | n1-plan-validator, n2-sweep | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Node Briefs

### n1-plan-validator

Intent: upstream the live ENOBUFS hot-patch and harden every unbounded-in-repo-size git call in
`scripts/kaola-workflow-plan-validator.js`, then prove it with a regression.

Approach (test-first):
1. RED: add a focused regression to `scripts/test-adaptive-node.js` (it already carries the
   `makeLaneRepo` / `snapshotWorktree` / git-tree harness — line ~6107) that builds a synthetic
   tree whose `git ls-tree -r` listing exceeds 1 MB (many small tracked files and/or long paths —
   Node's default `maxBuffer` is 1 MB), then drives the plan-validator worktree-hash / finalize-check
   freshness path (`computeCodeTreeHash` → `snapshotWorktree` → `git ls-tree -r`). Against the
   unpatched code this throws `ENOBUFS`; assert it instead returns a stable hex hash. Keep the
   fixture bounded/fast (build just past 1 MB, not far past).
2. GREEN: add an explicit `maxBuffer` cap to EVERY unbounded-output git call in the canonical
   validator. Confirmed sites (line numbers at HEAD, re-locate before editing): 2480 (`ls-tree -r`,
   the crash site), 2499 (`diff <sha> --name-only`), 2500 (`ls-files --others --exclude-standard`),
   3039 / 3186 / 3210 / 3334 / 3597 (`diff-tree -r --name-only`), 3048 (`diff --name-only`), 3542
   (`diff <base>...HEAD --name-only`). Use the 64 MB value from the proven hot-patch
   (`64 * 1024 * 1024`).
Key constraints:
- Introduce ONE per-script local constant `const GIT_MAX_BUFFER = 64 * 1024 * 1024;` near the top of
  the canonical validator and reference it at every capped call. Do NOT put the constant in
  `kaola-workflow-adaptive-schema.js` (its 4-edition byte-anchor would couple this node to the sweep
  node and defeat their parallelism).
- Leave FIXED-SIZE probes uncapped — do not touch `rev-parse`, `tag -l <name>`, `--quiet` diffs,
  `for-each-ref`, `merge-base`, single-pathspec `diff ... -- <one file>`, or bounded `log -n <k>`.
- `kaola-workflow-plan-validator.js` is a GENERATED_AGGREGATOR (`sync:editions`): edit the canonical
  `scripts/` copy, then run `npm run sync:editions` so the codex twin + both forge ports regenerate.
  All four edition files are in this node's write set and MUST land together (they move atomically).
  Do NOT hand-edit the `@generated` forge ports.
- The regression test file `scripts/test-adaptive-node.js` is canonical-only (not edition-ported).
Local check: `node scripts/test-adaptive-node.js` (RED before GREEN, then green), plus the shared
`validation_command`.

### n2-sweep

Intent: apply the SAME explicit `maxBuffer` cap to the remaining unbounded-in-repo-size git calls in
the sibling production scripts the audit flagged. Pure defensive hardening — behavior is unchanged at
normal output sizes; the cap only matters past 1 MB. `non_tdd_reason`: mechanical git-plumbing
hardening with no behavior change at normal sizes and no natural failing unit test; the >1 MB crash
path is covered by n1's plan-validator regression, and these siblings are the identical pattern.

Confirmed sites to cap (re-locate before editing; leave fixed-size probes alone):
- `scripts/kaola-workflow-adaptive-node.js:5418` — `diff --name-only <base> HEAD -- <paths>`.
- `scripts/kaola-workflow-claim.js:353` — `ls-files -z --others --exclude-standard`; `:357` —
  `diff HEAD` (full working-tree diff, the largest unbounded risk). Leave `:1841`
  (`diff --cached --name-only -- <single roadmap file>`), `:2671` / `:3060` (`--quiet`, no output),
  `:551` (`remote show`, network-bounded), `:2865` (`for-each-ref`, branch-name list — bounded).
- `scripts/kaola-workflow-sink-merge.js:259` — `diff --name-only <base>...<branch>`. Leave `:302`
  (`log ... -n 5`, bounded to 5 commits) and `:1330` (`--quiet`).
- `scripts/kaola-workflow-run-chains.js:365` — `diff HEAD` (full working-tree diff).

Key constraints:
- Use the same per-script local `const GIT_MAX_BUFFER = 64 * 1024 * 1024;` pattern near the top of
  EACH edited canonical script (add it once per script family; reference at each capped call). Do not
  centralize in `adaptive-schema`.
- Edition-sync classes differ across these scripts — cover ALL of them so all four chains stay green:
  - `kaola-workflow-adaptive-node.js` is a GENERATED_AGGREGATOR: edit canonical, run
    `npm run sync:editions`; codex twin + both `@generated` forge ports regenerate (all 4 in the
    write set). Do not hand-edit the forge ports.
  - `kaola-workflow-run-chains.js` is COMMON (canonical↔codex byte) with RENAME_NORMALIZED forge
    ports: edit canonical, run `npm run sync:editions` to regenerate codex + both forge ports.
  - `kaola-workflow-claim.js` and `kaola-workflow-sink-merge.js` are COMMON canonical↔codex (byte,
    regenerated by `sync:editions`) but their forge ports are DIVERGENT HAND-PORTS (forge-specific
    CLI). `sync:editions` will NOT regenerate the forge ports — you MUST hand-apply the identical
    `maxBuffer` cap at the corresponding git call sites in
    `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-{claim,sink-merge}.js` and the gitea
    twins (grep each forge port for `ls-files --others` / `diff HEAD` / `diff --name-only` and cap the
    same forge-neutral git plumbing calls; add the `GIT_MAX_BUFFER` constant to each forge port too).
- After editing, run `node scripts/edition-sync.js --check` (and/or `npm run sync:editions`) to prove
  the mirror/port families are in sync before closing.
Local check: the shared `validation_command`, plus `node scripts/test-claim-hardening.js` and
`node scripts/test-run-chains.js` for the touched sibling scripts.

### n3-review

Intent: gate every code-producing node (G1 post-dominance over n1 + n2). Reasoning-tier review of a
cross-edition change.
Read n1's and n2's evidence files first. Verify: (a) every flagged unbounded git site now carries the
`maxBuffer` cap and no FIXED-SIZE probe was needlessly capped; (b) all four editions of the two
GENERATED aggregators (plan-validator, adaptive-node) and the run-chains ports regenerated cleanly
(`edition-sync --check` clean), and the DIVERGENT claim/sink-merge forge ports were hand-edited to
match; (c) n1's regression genuinely exercises the >1 MB worktree-hash path and would fail (ENOBUFS)
without the fix; (d) the constant is per-script local (not in the adaptive-schema byte-anchor). This
is a cross-edition diff — confirm the four-chain obligation is discharged (see Finalization). Record a
verdict.

### n4-finalize

Intent: unique docs/state sink. Add a `CHANGELOG.md` entry under `[Unreleased]` describing the
ENOBUFS hardening (explicit 64 MB `maxBuffer` on unbounded git calls in the plan-validator and sibling
scripts + the >1 MB worktree-hash regression). Docs/state only — no code writes on the sink.
No public interface / env var / API changed, so no `docs/` or ADR update is required. Note in the
sink evidence that the post-ship reinstall of the three runtimes (to clear the installed-copy
divergence and delete the `.bak-enobufs-20260711` residue) is a manual post-merge step, not a plan
node.

## Plan Notes

- Cross-edition diff (touches the edition plugin trees + two GENERATED aggregators): Finalization
  REQUIRES all four chains green, run sequentially and recorded before sink —
  `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`.
  A green claude chain alone is insufficient (`npm test` short-circuits on first failure).
- No CI/CD gate; no security surface (labels carry no sensitivity); no non-delegable acceptance check
  → no `security-reviewer` and no `main-session-gate`.
- No decision record: this is a mechanical robustness fix, not an architecture decision. CHANGELOG
  entry only.
- n1 and n2 write disjoint exact paths and carry no dependency edge → antichain; the scheduler may
  co-open them in isolated legs (parallel_safe is validator-derived, not authored).

## Node Ledger

| id | status |
| --- | --- |
| n1-plan-validator | complete |
| n2-sweep | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-plan-validator) | subagent-invoked | deferred_to_group | |
| implementer (n2-sweep) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review fef1d7aa6ed8 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize f5843b2ea326 | |
