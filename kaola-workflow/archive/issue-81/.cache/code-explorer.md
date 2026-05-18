# Code Explorer Output — Issue #81

## Conflict Summary

| Source | What it says |
|---|---|
| `CLAUDE.md` line 21 | Startup scripts require explicit `--target-issue N`; refuse auto-pick with typed refusals |
| `commands/workflow-next.md` step 5 (line 56) | If exactly one active folder exists, skip issue selection and route to it (no explicit target required) |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` step 5 | Same carve-out as above |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` step 5 | Same carve-out as above |
| `kaola-workflow-claim.js` lines 370-377 | Implements: no-target + sole-active = `verdict: owned`, exit 0 |

## cmdStartup Behavior (claim.js lines 366-387)

No `--target-issue` provided:
- **Zero active folders**: `{ verdict: 'no_target', claim: 'none' }`, exit 1
- **Exactly one active folder**: `{ verdict: 'owned', claim: 'owned', project: ..., worktree_path: ... }`, exit 0
- **Multiple active folders**: `{ verdict: 'no_target', claim: 'none' }`, exit 1

With `--target-issue N` provided: routes to `claimExplicitTarget()` — separate path, not in scope.

## CLAUDE.md Verbatim (lines 21-22)

> **Startup scripts validate, not select**: `cmdStartup`, `cmdPickNext`, and `cmdBootstrap` now require explicit `--target-issue N` flag. They validate the target is unclaimed and green/yellow, then claim. They refuse auto-pick with typed refusals.
> **Ambiguity handling**: When next issue is ambiguous or conflicts with active state, ask or stop. Do not let a script silently choose.

No carve-out for sole-active case.

## commands/workflow-next.md Step 5 (line 56)

> 5. If exactly one active folder is already present (startup will return `verdict: owned`), skip steps 1-4 and route to that project.

No `--target-issue` flag required; the parenthetical says startup handles it.

## Test Coverage Gaps (simulate-workflow-walkthrough.js)

All three no-target scenarios have zero regression tests:
1. `startup` no target, zero active → expect `{ verdict: 'no_target' }`, exit 1
2. `startup` no target, one active → currently `{ verdict: 'owned' }`, exit 0 (or exit 1 if contract changes)
3. `startup` no target, multiple active → expect `{ verdict: 'no_target' }`, exit 1

Only existing "owned" test (line 85-86): exercises explicit-target re-entry path, NOT the no-target sole-active path.

## Design Decision Required

The AC explicitly requires choosing one contract:
- **Option A** (explicit always): remove `if (active.length === 1)` sole-active branch from cmdStartup; remove step 5 from all 4 docs; update CLAUDE.md
- **Option B** (sole-active allowed): keep script; amend CLAUDE.md to carve out the sole-active resume case; update 3 command/skill docs to clarify

The GitLab command file must stay in sync with GitHub edition for whichever option is chosen.
