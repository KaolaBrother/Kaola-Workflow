# Code Architect Output: issue-42 — Remove /workflow-next-pr; Drive Sink from Prompt Intent + Merge Fallback

## Design Decisions

- Receipt-first freeze-point: `.cache/sink-fallback.json` schema is the contract boundary between sink-merge (writer), Phase 6 dispatch (reader), and `cmdSinkFallback` (lease updater). Schema defined first.
- Post-failure recovery only: push is attempted unconditionally; `classifyMergeError` runs only on caught exceptions. No pre-flight dry-run.
- Prose-only intent detection: agent reads user's prompt and sets `KAOLA_SINK=pr` before startup. Existing `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through propagates without modification.
- `cmdSinkFallback` reuses `updateSinkLease()`: no new file I/O pattern.
- Script parity is byte-identical: both copies of `kaola-workflow-claim.js` and `kaola-workflow-sink-merge.js` updated in lockstep.
- CWD safety in Phase 6 pivot: `cd "$_MAIN_ROOT"` must execute before `sink-fallback` and `sink-pr` node calls.
- sink-pr.js has no worktree dependency: confirmed zero references to `worktree_path`.

## Receipt Schema (Freeze Point)

Path: `kaola-workflow/{project}/.cache/sink-fallback.json`

Fields:
- `project`: string — workflow project name
- `branch`: string — feature branch (e.g. "workflow/issue-42")
- `issue_number`: integer | null
- `reason`: "branch_protected" | "non_fast_forward" | "permission_denied"
- `timestamp`: ISO-8601 string

## Files to Delete

| File | Reason |
|------|--------|
| `commands/workflow-next-pr.md` | Replaced by prose intent-detection in workflow-next.md Step 0a |
| `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md` (+ directory) | Codex skill removed |

## Files to Modify

| File | Nature of Change | Priority |
|------|-----------------|----------|
| `scripts/kaola-workflow-sink-merge.js` | Add `classifyMergeError(stderr)`, wrap push in try/catch, write `.cache/sink-fallback.json`, `git reset --hard origin/main`, exit 3; add `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` env var | P0 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identical copy of above | P0 |
| `scripts/kaola-workflow-claim.js` | Add `sink_fallback_reason` to `buildSinkBlock`/`buildLockData`; add `cmdSinkFallback`; add to dispatch switch | P0 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of above | P0 |
| `commands/kaola-workflow-phase6.md` | Wrap `merge|*` case: on exit 3, cd to main root, read receipt, call `claim.js sink-fallback`, dispatch `sink-pr.js`, propagate exit | P1 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Same exit-3 pivot wrap in sink dispatch block | P1 |
| `commands/workflow-next.md` | Add "Startup Step 0a — PR Intent Capture" block with 6 NLU keywords | P1 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Same Step 0a block | P1 |
| `scripts/validate-workflow-contracts.js` | Remove L299-301; add negation assertion; add `classifyMergeError` and `"if (sub === 'sink-fallback')"` to parity symbol array | P1 |
| `scripts/validate-kaola-workflow-contracts.js` | Remove `'kaola-workflow-next-pr'` from skills array (L73) | P1 |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 18 (18A/18B/18C) using `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | P2 |
| `README.md` | Remove next-pr from skill listing; rewrite PR Sink Mode section | P2 |
| `CHANGELOG.md` | Add issue-42 entry under [Unreleased] | P2 |
| `kaola-workflow/cross-machine-followups/phase2-ideation.md` | Scrub `workflow-next-pr` references | P3 |
| `kaola-workflow/codex-parity/phase2-ideation.md` | Scrub `workflow-next-pr` references | P3 |

## Reason-Token Mapping Table

| Observed error (stderr) | Token |
|------------------------|-------|
| `protected branch` OR `GH006` | `branch_protected` |
| `rejected` AND `non-fast-forward` | `non_fast_forward` |
| `permission denied` OR `403` OR `not authorized` | `permission_denied` |
| `conflicts with target` (FF-only context = divergent base) | `non_fast_forward` |
| Anything else | `null` (transient; exit 1, NOT exit 3) |

## Data Flow

**Normal merge path:** `/workflow-next` → startup (sink: merge) → Phase 6 → `sink-merge.js` → push succeeds → exit 0

**PR-intent path:** User prompt contains keyword → `export KAOLA_SINK=pr` → startup (sink: pr) → Phase 6 → `sink-pr.js` directly

**Merge-fallback path:** `sink-merge.js` → push fails → `classifyMergeError` returns token → `git reset --hard origin/main` → write `.cache/sink-fallback.json` → exit 3 → Phase 6 catches exit 3 → `cd "$_MAIN_ROOT"` → `claim.js sink-fallback` (updates Sink block to pr) → `sink-pr.js` → propagate exit

## Build Sequence

1. Task 2 — `sink-merge.js` (depends on: receipt schema)
2. Task 3 — `claim.js` (depends on: receipt schema)
3. Task 4 — Parity sync (depends on: Tasks 2 and 3)
4. Task 5 — Phase 6 dispatch (depends on: receipt schema, Task 3 interface; parallel with Tasks 2/3)
5. Task 6 — Intent detection prose (independent; parallel with Tasks 2-5)
6. Task 7 — Delete workflow-next-pr files (depends on: Task 6)
7. Task 8 — Validator updates (depends on: Tasks 2, 3, 7)
8. Task 9 — Epic Case 18 (depends on: Tasks 2, 3, 4)
9. Task 10 — Documentation cleanup (depends on: all functional tasks)

## Task List

### Task 2: sink-merge.js — exit 3 + merge-impossible classification
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic Case 18A, 18B, 18C)
- Write Set: `scripts/kaola-workflow-sink-merge.js`, `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1 (receipt schema — already frozen in blueprint)
- Parallel Group: A
- Action: MODIFY
- Implement:
  - Add `const FORCE_MERGE_IMPOSSIBLE = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE || '';`
  - Add `classifyMergeError(stderr)` function: checks FORCE_MERGE_IMPOSSIBLE first, then patterns for protected branch/GH006, non-fast-forward, permission denied; returns null for unrecognized
  - Refactor push in `postMergeCleanup(args)` into try/catch; on caught error: classify → if non-null: `git reset --hard origin/main`, write receipt JSON to `.cache/sink-fallback.json`, return `{exitCode: 3}`; if null: re-throw
  - In `main()`: if `postMergeCleanup` returns `{exitCode: 3}`, set `process.exitCode = 3; return;`
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 3: claim.js — `sink_fallback_reason` field + `cmdSinkFallback`
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic Case 18A sub-assertion)
- Write Set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Task 1 (receipt schema)
- Parallel Group: A
- Action: MODIFY
- Implement:
  - `buildSinkBlock`: add `if (lockData.sink_fallback_reason != null) lines.push('sink_fallback_reason: ' + lockData.sink_fallback_reason);`
  - `buildLockData`: add `sink_fallback_reason: null` field
  - New `cmdSinkFallback`: reads receipt path, reads lock file, sets `lockData.sink = 'pr'` and `lockData.sink_fallback_reason = receipt.reason`, writes lock file, calls `updateSinkLease(stateFile, lockData)`, prints JSON result
  - Dispatch switch: add `if (sub === 'sink-fallback') return cmdSinkFallback();`
  - Usage string: add `sink-fallback` to pipe-delimited list
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0; `node scripts/kaola-workflow-claim.js sink-fallback 2>&1` prints "--project is required"

### Task 4: Parity sync
- Files: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: same as above (copy from scripts/)
- Depends On: Tasks 2, 3
- Parallel Group: B (after A)
- Action: COPY
- Validate: `node scripts/validate-workflow-contracts.js` (parity assertions pass)

### Task 5: Phase 6 dispatch — exit-3 pivot
- Files: `commands/kaola-workflow-phase6.md`, `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Write Set: both files
- Depends On: Task 3 interface spec (can be written in parallel with Task 3)
- Parallel Group: A
- Action: MODIFY
- Implement:
  - In `merge|*` case: wrap sink-merge.js call, capture `$SINK_MERGE_EXIT`; if exit 3: `cd "$_MAIN_ROOT"`, call `claim.js sink-fallback --project {project} --session $KAOLA_SESSION_ID`, dispatch `sink-pr.js --branch $SINK_BRANCH`, `exit $?`
  - Add exit-code 3 documentation after the case block
  - Apply same change to SKILL.md with equivalent variable names
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 6: Intent detection prose (Step 0a)
- Files: `commands/workflow-next.md`, `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Write Set: both files
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Insert "Startup Step 0a — PR Intent Capture" block with keywords: "open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink"; explain that agent sets `export KAOLA_SINK=pr` if any keyword matches; existing `${KAOLA_SINK:+--sink $KAOLA_SINK}` propagates without change
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 7: Delete workflow-next-pr files
- Files: `commands/workflow-next-pr.md`, `plugins/kaola-workflow/skills/kaola-workflow-next-pr/` (entire dir)
- Depends On: Task 6 (intent path must exist before deletion)
- Parallel Group: B
- Action: DELETE
- Validate: `test ! -f commands/workflow-next-pr.md && test ! -d plugins/kaola-workflow/skills/kaola-workflow-next-pr/`

### Task 8: Validator updates
- Files: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`
- Write Set: both files
- Depends On: Tasks 2, 3, 7
- Parallel Group: B
- Action: MODIFY
- Implement:
  - Remove lines 299-301 in validate-workflow-contracts.js; replace with negation assertion
  - Add `'classifyMergeError'` and `"if (sub === 'sink-fallback')"` to parity symbol array
  - Remove `'kaola-workflow-next-pr',` from skills array in validate-kaola-workflow-contracts.js
- Validate: `node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js`

### Task 9: Epic Case 18
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (mirror)
- Depends On: Tasks 2, 3, 4
- Parallel Group: C
- Action: MODIFY
- Implement: Add 3 sub-cases after last existing case:
  - 18A: `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected` → sink-merge.js exits 3 + `.cache/sink-fallback.json` exists with reason `branch_protected` + `cmdSinkFallback` updates workflow-state.md sink to `pr`
  - 18B: no force env var, OFFLINE mode → exits 0, no receipt file
  - 18C: unclassified push failure → exits 1, no receipt file
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 10: Documentation cleanup
- Files: `README.md`, `CHANGELOG.md`, `kaola-workflow/cross-machine-followups/phase2-ideation.md`, `kaola-workflow/codex-parity/phase2-ideation.md`
- Depends On: all functional tasks complete
- Parallel Group: D
- Action: MODIFY
- Validate: `grep -r "kaola-workflow-next-pr" README.md CHANGELOG.md kaola-workflow/cross-machine-followups/ kaola-workflow/codex-parity/` — should return zero results (only CHANGELOG historical release sections if any)

## External Dependencies

None. No new npm packages.

## Out of Scope (explicit)

- No retry on `sink-pr.js` failure after pivot. Single attempt, propagate exit.
- No CLI flag `--pr` on `/workflow-next`. Intent is prose-only.
- No non-English keywords. Six English keywords only.
- No pre-flight push dry-run.
- No mid-flight sink conversion except via exit-3 fallback.
- No partial-push recovery for mid-flight network drops (exit 1 unchanged).
- No `module.exports` change in `claim.js`.
- CHANGELOG historical release entries (lines 341, 343, 383) — not touched.
- `kaola-workflow/archive/**` — not scrubbed.
- `install.sh` — no change.
- Worktree restoration before pivot — not needed.
