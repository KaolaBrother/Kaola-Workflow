# ADR 0018 §5 item 2 / §8 step 2 — `list-open` CLI entry point

**task**: wrap the dormant priority-tier sorter (`readPriorityConfig` / `priorityTier` /
`listOpenIssues`) in a CLI subcommand, in all four `claim.js` copies, per the acceptance surface
`scripts/test-priority-list-open.js` defines. Did not touch `templates/routing/*`, rendered
`commands/`/`plugins/*/{commands,skills}` surfaces, `.roadmap`, or `roadmap.js`. No commit made.

## Design followed (as specified by the test file, unchanged)

- Subcommand: `list-open`. Envelope: one JSON line `{ "issues": [...] }`. Exit 0 always (mirrors
  `listOpenIssues`'s existing try/catch-to-`[]` degrade, including under
  `KAOLA_WORKFLOW_OFFLINE=1`).
- `listOpenIssues` was reused as-is — zero changes to its body in any of the four files. The new
  code is only a thin wrapper (`cmdListOpen`) plus a dispatch-table line plus a USAGE-string edit.

## Files changed

- `scripts/kaola-workflow-claim.js` (canonical) — +13/-1: added `cmdListOpen()` right after
  `listOpenIssues` (same placement convention as `cmdWorktreeStatus` next to
  `listWorkflowWorktrees`), added `if (sub === 'list-open') return cmdListOpen();` to `main()`,
  added `list-open` to the `USAGE` subcommand list. `listOpenIssues`/`priorityTier` remain
  unexported (matching `cmdPickNext`/`cmdWorktreeStatus`, which are also not exported).
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (codex mirror) — made byte-identical to
  canonical via `cp` (this file is in `validate-script-sync.js`'s `COMMON_SCRIPTS` list, which
  requires byte identity; confirmed `diff` empty after copy).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (hand port) — +13/-1:
  gitlab's `claim.js` already independently shipped its own `listOpenIssues`/`priorityTier`/
  `readPriorityConfig` (calling `forge.listIssues({state:'opened',...})`, GitLab's own vocabulary)
  with the same dormant-since-shipped shape as canonical — also zero call sites before this change.
  Added `cmdListOpen()` calling `output({ issues: listOpenIssues(getRoot()) })`, wired into `main()`
  and `USAGE`, same shape as canonical. `glabExec` already short-circuits on `OFFLINE` inside
  `kaola-gitlab-forge.js`, so `listOpenIssues` was already offline-safe with no change needed.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (hand port) — +13/-1: same
  situation as gitlab — `listOpenIssues` already existed, calling `forge.listIssues({state:'open',...})`
  (Gitea's own vocabulary, via `teaExec`, also already `OFFLINE`-safe). Same wrapper added.

Total: 4 files, +52/-4 lines across the group (13/-1 each × 4, `git diff --stat` confirms).

## Cross-edition reach — what I read and what it obligated

- `scripts/validate-script-sync.js`: `kaola-workflow-claim.js` is in `COMMON_SCRIPTS` — canonical
  and the codex mirror (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`) must be
  byte-identical. Handled by `cp`.
- The gitlab/gitea copies (`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`) are
  **not** in `COMMON_SCRIPTS`, not in `BYTE_IDENTICAL_GROUPS`, and not in
  `RENAME_NORMALIZED_FAMILIES` for claim.js — they are the divergent hand-ports the brief called
  out. The only sync obligation on them is `FORGE_EXPORT_SUPERSET_FAMILY` (`forge claim
  module.exports superset`), which requires the forge ports' `module.exports` keys to be a
  superset of canonical's (minus `canonicalOnly: ['ghExec']`). Since `cmdListOpen` is not exported
  from any copy (matching `cmdPickNext`/`cmdWorktreeStatus`, neither of which is exported either),
  this guard needed no new export and stayed green untouched.
- Neither forge port shells `gh` — I confirmed both already had their own `listOpenIssues` calling
  their own forge client (`kaola-gitlab-forge.js`'s `forge.listIssues` → `glab issue list`,
  `kaola-gitea-forge.js`'s `forge.listIssues` → `tea` equivalent), so "port the behaviour, not the
  command string" was already satisfied by the existing dormant functions; I only added the CLI
  door onto what was already there.
- Updated the subcommand list in each of the 4 files' own `USAGE`/error text (all four inline the
  literal list, there is no single shared string to edit).

## Gates — each exit code echoed separately

- `node scripts/test-priority-list-open.js` → **exit 0** ("all 18 tests passed" — 5 test functions,
  18 assertions).
- `node scripts/validate-script-sync.js` → **exit 0** ("OK: 15 common scripts, 27 byte-identical
  groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge
  export-superset families in sync." + "committed kernel parity: 4 Oracle Kernel copies identical
  at HEAD.").
- `node scripts/validate-workflow-contracts.js` → **exit 0** ("Workflow contract validation
  passed").
- `node scripts/validate-kaola-workflow-contracts.js` → **exit 0** ("Kaola-Workflow Codex contract
  validation passed").
- `node scripts/simulate-workflow-walkthrough.js` (full, non-sharded) → **exit 0**
  ("Workflow walkthrough simulation passed"); shard marker confirms full scope, not a sample:
  `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}`.

## Exact JSON emitted for a mixed-tier fixture

Fixture: issues `[20:P0, 5:P2, 99:P1, 10:P0, 50:P2]` (scrambled arrival order, matching the test
suite's own tier-ordering fixture), against a fresh git-init tmp root with `KAOLA_GH_MOCK_SCRIPT`
pointed at a mock emitting that payload for `gh issue list`, run as
`KAOLA_GH_MOCK_SCRIPT=... KAOLA_WORKFLOW_OFFLINE=0 node scripts/kaola-workflow-claim.js list-open`:

```
{"issues":[{"number":10,"title":"issue 10","labels":[{"name":"P0"}],"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/issues/10"},{"number":20,"title":"issue 20","labels":[{"name":"P0"}],"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/issues/20"},{"number":99,"title":"issue 99","labels":[{"name":"P1"}],"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/issues/99"},{"number":5,"title":"issue 5","labels":[{"name":"P2"}],"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/issues/5"},{"number":50,"title":"issue 50","labels":[{"name":"P2"}],"updatedAt":"2026-01-01T00:00:00Z","url":"https://example.invalid/issues/50"}]}
EXIT:0
```

Number order: `[10, 20, 99, 5, 50]` — P0 tier (10 before 20, arrival-scrambled but number-sorted
within tier), then P1 (99), then P2 tier (5 before 50) — tier-then-number, full set, nothing
dropped.

## Assertion-weakening check

None. `test-priority-list-open.js` was read but not modified (confirmed via `git status`: the file
is untracked/new, not one I touched — `listOpenIssues` was reused byte-for-byte in the canonical
file; I did not rename the subcommand or envelope key, so no "loud" deviation to report there
either).

## What turned out to be wrong in the brief

One correction, not a scope problem: the brief describes `listOpenIssues` as having "zero
production call sites" and frames the gitlab/gitea files as needing the sorter machinery ported in.
In fact gitlab and gitea **already had their own independent `listOpenIssues`/`priorityTier`/
`readPriorityConfig`** (using their own forge clients, already offline-safe), in the exact same
dormant, zero-call-site state as canonical's. So for those two files the work was identical in
shape to canonical's (add the CLI wrapper only) rather than a heavier port — I did not need to
write any new sorting/forge-calling logic for gitlab/gitea, only the same three-line wrapper +
dispatch + USAGE edit as canonical. Flagging this because it changes the "port the behaviour, not
the command string" instruction from a build task into a verification-that-it-already-matches task
for those two files.

## Verification tier

`tests-green` — `test-priority-list-open.js` (the authored suite for this behavior) passes, plus
`build-green`/`regression-green` corroboration from the sync/contract validators and the full
walkthrough (210/210, unsharded).
