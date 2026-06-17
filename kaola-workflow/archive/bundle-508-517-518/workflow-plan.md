# Workflow Plan — bundle-508-517-518

<!-- plan_hash: 70df3971a5398905f96215c337a107cc00857efb36c6689de234e322833f158c -->

Sink/finalize close-accounting bundle. Unifying invariant: **an issue must not be reported closed
before its deliverable is actually pushed.** Three code-verified bugs with known fixes (normal build
DAG — no shaping run, no knowledge-lookup):

- **#508** (bug, area:scripts): `cmdFinalize` bundle close-loop closes a remote member at archive-time
  (pre-sink-push) AND mis-reports it as `close_pending` / `closed_issues:[]`. Fix lives in
  `kaola-workflow-claim.js` (cmdFinalize close path).
- **#517**: keep-open partial-close silently defeated by GitHub commit-keyword auto-close — no
  post-`push_main` verify/reopen. Fix lives in `kaola-workflow-sink-merge.js` (closure step +
  a new post-push reopen guard).
- **#518**: `--sink` resumes a completed prior-cycle sink-receipt from the reused bare
  `archive/<project>/.cache` path (no cycle identity) → `stale_sink_receipt` every cycle. Fix lives
  in `kaola-workflow-sink-merge.js` (`loadOrInitReceipt` cycle binding via `branch_head`).

## Meta

labels: bug, area:scripts
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-sink-fix | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 6 | sequence | sonnet |
| n2-claim-fix | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-bundle-finalize.js | 5 | sequence | sonnet |
| n3-cross-edition-tests | tdd-guide | n1-sink-fix, n2-claim-fix | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-claim-hardening.js | 5 | sequence | sonnet |
| n4-review | code-reviewer | n1-sink-fix, n2-claim-fix, n3-cross-edition-tests | — | 1 | sequence | opus |
| n5-docs | doc-updater | n4-review | CHANGELOG.md, docs/decisions/D-508-01.md, docs/decisions/D-517-01.md, docs/decisions/D-518-01.md, docs/workflow-state-contract.md | 5 | sequence | sonnet |
| n6-finalize | finalize | n5-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Scope & cross-edition mirror spec (#306/#340)
Every fix is cross-edition. The canonical+twin pair `scripts/<base>` and
`plugins/kaola-workflow/scripts/<base>` are **byte-identical** (verified at authoring) — the codex
twin must be a byte mirror of the root file after the fix. The two forge ports
(`kaola-{gitlab,gitea}-workflow-<base>.js`) **mirror the FULL accumulated root diff modulo forge
nouns** — never a per-concern re-derivation (the #328/#340 half-mirror trap). `sink-merge.js` and
`claim.js` are NOT generated-aggregators (real scripts with named forge ports), so
`generated_port_split` does not apply; the four-edition coverage is enforced by #306 symbol-scoping,
captured directly in the write sets above.

### n1-sink-fix (#517 + #518) — tdd-guide
ONE node because both fixes carve the SAME file (`sink-merge.js` ×4) — they cannot be disjoint
siblings, and the receipt/closure accounting is cohesive (#309/#453: keep coupled cross-edition work
in one node). Two failing tests first:
- **#518 cycle-identity** (RED): a completed prior-cycle receipt (steps all `done`, same reused
  branch name) must NOT be resumed on a fresh cycle. Fix in `loadOrInitReceipt`: stamp
  `branch_head: <branch-tip-sha>` at init; on resume, if `steps.merge === 'done'` AND
  (`branch_head` ≠ current branch tip OR `merge-base --is-ancestor <branch> <default>` fails),
  reinitialize steps to `pending` (move the existing post-hoc ancestry guard up-front). Secondary:
  after a successful sink, delete/relocate the bare `archive/<project>/.cache/sink-receipt.json`.
- **#517 reopen-after-push** (RED): a keep-open run whose merge commit lands on the default branch
  and is auto-closed by GitHub must be detected and reopened. Fix: add a keep-open verification
  AFTER `push_main` (the closure step at line ~695 runs at step 6, BEFORE `push_main` at step 9 —
  the auto-close fires at push_main, so the probe MUST be post-push). Probe live issue state; if
  `keepIssueOpen` and CLOSED → reopen and record
  `remote_issue_closed: 'reopened_after_autoclose'`. Forge ports use the forge CLI / forge reopen,
  not a forge-branded binary (forge-neutral in agent prose; the ports themselves use the
  edition-appropriate exec).
Edition test surfaces in-set: `test-gitlab-sinks.js` + `test-gitea-sinks.js` carry the forge
sink-receipt + keep-open assertions (existing #484/#336 scenarios at gitlab:865/974, gitea:817/923).
The claude-chain sink assertions live in `simulate-workflow-walkthrough.js` (owned by n3) — n1 must
NOT edit that file.

### n2-claim-fix (#508) — tdd-guide
RED first: a bundle finalize on the merge lane (keep-worktree, close PENDING at sink) must NOT close
a remote member at archive-time, and the receipt accounting (`closed_issues`, `remote_issue_closed`,
`close_disposition`, `closure.closed`) must be consistent — no `close_pending`/`[]` while a remote
close actually happened, and no pre-sink-push close window. The bundle close-loop is at
`cmdFinalize` (~lines 2160-2270): align the bundle path with the single-issue `close_pending`
deferral semantics so it defers remote member closure to sink-merge on the merge lane. Test surface:
`scripts/test-bundle-finalize.js` (existing close_pending/closed_issues coverage at :338-467).
DISJOINT from n1 (different file family) — antichain with n1, validator will derive `parallel_safe`;
no dep edge added (write frontiers serial-degrade today, #463 unshipped, but disjointness is correct
and future-proof). NEVER hand-add `parallel_safe`.

### n3-cross-edition-tests — tdd-guide
Owns the SHARED assertion files both code fixes touch behaviorally: the four walkthroughs (claude
`simulate-workflow-walkthrough.js`, codex `simulate-kaola-workflow-walkthrough.js` — the #447/#448
codex-chain surface, gitlab/gitea walkthroughs) plus `test-claim-hardening.js`. Depends on n1 AND n2
so it asserts the merged behavior. Add/adjust assertions for the post-push reopen (#517),
cycle-identity resume (#518), and bundle close-accounting (#508) wherever the walkthroughs exercise
the sink/finalize lane. A separate node (not folded into n1/n2) because both fixes' assertions land
in these shared files — they cannot sit in two parallel nodes.

### n4-review (G1) — code-reviewer, opus
Post-dominates every code-producing node (n1, n2, n3). Opus because close-accounting and the
push-ordering window are subtle correctness (the reasoning floor): verify no
issue-closed-before-deliverable-pushed window on EITHER the bundle finalize path (#508) or the
keep-open sink path (#517), and that the cycle-identity guard (#518) does not false-refuse a genuine
resume. Must confirm all four edition ports are full mirrors, not half-mirrors.

### n5-docs — doc-updater, sonnet
CHANGELOG.md `[Unreleased]` entries for #508/#517/#518. Decision records: `D-508-01` (the
close-vs-defer design choice for the bundle finalize path — a real architectural decision; next free
number, no existing D-508 records). `D-517-01` and `D-518-01` reserved for the reopen-after-autoclose
and cycle-identity-binding decisions — doc-updater reads `docs/decisions/` and resolves to the next
free numbers per #337 if these collide (they do not at authoring time). `docs/workflow-state-contract.md`
documents the sink-receipt schema — add the new `branch_head` and `reopened_after_autoclose` receipt
fields there.

### n6-finalize — finalize sink
Docs/state only (CHANGELOG.md). No non-docs write (would trip code-reviewer). Unique sink,
post-dominated by all gates transitively. No model cell (never dispatched as a subagent).

## Node Ledger

| id | status |
| --- | --- |
| n1-sink-fix | complete |
| n2-claim-fix | complete |
| n3-cross-edition-tests | complete |
| n4-review | complete |
| n5-docs | complete |
| n6-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-sink-fix) | subagent-invoked | evidence-binding: n1-sink-fix e87a3544c370 | |
| tdd-guide (n2-claim-fix) | subagent-invoked | evidence-binding: n2-claim-fix 5ccc55a9205c | |
| tdd-guide (n3-cross-edition-tests) | subagent-invoked | evidence-binding: n3-cross-edition-tests 111098d64b88 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review e6c5852f75b7 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs c4eac7f645b8 | |
