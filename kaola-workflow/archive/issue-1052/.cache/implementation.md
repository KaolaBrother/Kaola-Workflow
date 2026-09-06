# Issue #1052 implementation

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
Branch: `workflow/issue-1052`  
Baseline SHA (acceptance RED): `05b67a8ca096ee9661d06c0393aacb97eaf3d31d`

## Task

Make standalone Cursor CLI/local Workflow **startup** and **normal resume** execute Repo role prep through the **installed** `kaola-workflow-cursor-surface.js --ensure-target <explicit workspace>` transaction, before a new claim and on resume without re-claim. Prompt-only “before first named dispatch” is not the skip-proof.

## Files changed (this implementer)

- `scripts/kaola-workflow-claim.js`
  - Registered `--product` and `--host` in `KNOWN_VALUE_FLAGS` so App/Cloud can be expressed without `unknown_flag`.
  - Added `ensureCursorCliLocalPrep`: for `--runtime cursor` with product not `app`, spawn
    `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js`
    `--ensure-target <getRoot()> --forge=<forge|github> --json`.
    Target is `git rev-parse --show-toplevel` (`getRoot()`), not nested cwd, not `worktree_path`, not a neighbor.
    Helper is the installed CURSOR_HOME copy (spawn), not `require()` of the producer source tree.
  - Fail-closed before `claimExplicitTarget` / `claimExplicitBundle`: helper missing, nonzero helper status, or invalid status prints the helper/install diagnostic (`collision` / `unmanaged` / `symlink` / `authority` / `install` / `receipt` / `stale`) and exits nonzero with `claim: none`. No issue folder. Never “Task-unsupported”.
  - `cmdResume` runs the same ensure for Cursor CLI/local; does not rewrite `workflow-state.md` or `mission-list.md`; does not set `claim: acquired`.
  - Merges `cursor_prep` onto startup/resume JSON. On helper `status: materialized`, `cursor_prep.restart_boundary === 'new_process_same_chat'`. On `status: current`, claim/resume proceeds (helper is byte-level no-write).
  - `--runtime claude` does not ensure. Explicit `--product app` (local or cloud) still claims/resumes and does not ensure. `status` / `list-open` unchanged (zero-write). No inference from sibling `agent` or `Cursor.app`.
- `scripts/sync-cursor-edition.js`
  - **Next:** appends startup/resume Repo-prep prose (no `Immediately before the first named Kaola child dispatch`, no skippable first-named-dispatch `--ensure-target "$PWD"` block). States startup and resume execute prep; missing named/project roles are not a capability_gap for omitting prep; file-ready/on-disk materialization vs live Task catalog/enum/visibility; `new_process_same_chat` / new Cursor CLI process; App/Cloud negatives; no ambient cwd copier / sessionStart materializer; fail-closed authority → collision → symlink → before project mutation.
  - **Finalize:** meaning unchanged — still `## Cursor standalone CLI pre-dispatch materialization` with `--ensure-target "$PWD"`, “Immediately before the first named Kaola child dispatch”, current=no-op vs materialized=stop named dispatch + new Cursor CLI process, same host negatives and fail-closed pins.

Not modified by this implementer: `scripts/test-issue-1052-cursor-cli-startup-prep.js`, `scripts/test-cursor-edition.js` (acceptance meaning left as authored), Runner / kaola-project-runner, `kaola-workflow/bundle-1051`, `.kw/worktrees/bundle-1051`, installer `--global` / sessionStart dual-write (not restored).

## Helper invocation

```
node "${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js" \
  --ensure-target <getRoot()> --forge=github --json
```

Spawned from claim.js with `process.execPath`; cwd = CLI workspace root; env inherited (`CURSOR_HOME` scoped).

## Verification tier

`tests-green`

## Commands

### Before (baseline RED, same SHA)

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit **1** (19 failed / 19 passed)
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` → exit **1**
  - Next still located prep at first named dispatch
  - Next did not forbid missing-named `capability_gap` skip of Repo prep

### After (this change)

Worktree cwd: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit **0**  
  `issue-1052 cursor CLI startup/resume prep passed (38 assertions).`
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` → exit **0**  
  `CLI-MATERIALIZATION-ORACLE GREEN: Next startup/resume order and Finalize pre-dispatch ensure`

Did not restore ambient sessionStart materialization or `--global` ambient repo writes.

## Unexecuted

- Live standalone Cursor CLI **new-process** named Task dispatch after prep (catalog visibility, omit-model named role). Later mission; not faked.
- Live Cursor App local / App Cloud sessions.
- Runner / kaola-project-runner (out of scope).
- Full producer chain `npm test` / `test:kaola-workflow:claude:full` / walkthrough.
- Full `test-cursor-edition.js` (main-checkout generated-tree D0 can still block G2/G7 in this worktree). Isolated `--cli-materialization-oracle` was the required oracle.
- User-facing docs (later mission). Self-review (not this role).
