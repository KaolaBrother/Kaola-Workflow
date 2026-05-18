# Phase 3 - Plan: issue-81

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | (1) Delete `if (active.length === 1)` sole-active branch (lines 372-375). (2) Add `worktree_path` hoist in base object of explicit-target output block. | Remove selection-by-omission; restore shape parity so bash glue extracts `worktree_path` correctly. |
| `scripts/simulate-workflow-walkthrough.js` | Add four regression tests: T1 (no-target + zero active → no_target + exit 1), T2 (no-target + one active → no_target + exit 1), T3 (no-target + multiple active → no_target + exit 1), T4 (round-trip: plant active → read status → derive target → startup --target-issue N → assert verdict owned + worktree_path non-empty). | Prove the sole-active branch is gone and shape parity is intact. |
| `commands/workflow-next.md` | Replace step 5 (line 56) with agent-side sole-active resume instructions (read status, derive issue_number, set KAOLA_TARGET_ISSUE). | Relocate detection from script to agent per Option A. |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | Same step-5 replacement, GitLab prose. | Parity with GitHub command doc. |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Same step-5 replacement, GitHub skill context. | Keep SKILL.md coherent with changed startup contract. |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Same step-5 replacement, GitLab skill context. | Keep GitLab SKILL.md coherent with changed startup contract. |

### Build Sequence
1. Task A — Remove sole-active branch from `cmdStartup`; add `worktree_path` hoist in base of explicit-target output. Both sub-steps in single atomic edit.
2. Task B — Add all four regression tests to `simulate-workflow-walkthrough.js`. Must happen after Task A (T2 asserts `no_target` for single-active; would false-green against old code).
3. Validation — `node scripts/simulate-workflow-walkthrough.js` exits 0.
4. Tasks C, D, E, F — Doc edits (parallel after Task A confirmed). All four files are disjoint.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| Serial | A then B | T2 in B would false-green against old A code |
| Parallel | C, D, E, F | Disjoint files; no shared sections |
| Post-A gate | C/D/E/F can start after A | Don't depend on B or validation passing |

### External Dependencies
None. All changes use Node.js built-ins and existing script patterns.

## Task List

### Task A: Remove sole-active branch; add worktree_path hoist
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` lines 370-386
- Depends On: none
- Parallel Group: serial (first)
- Action: MODIFY
- Implement:
  1. Delete lines 372-375: `if (active.length === 1) { output({...}); return; }`
  2. In explicit-target output block (lines 380-386), add `worktree_path` to the BASE object literal (not after Object.assign), so it persists when `result` doesn't carry it at top level:
     ```js
     output(Object.assign({
       verdict: ...,
       claim: ...,
       selected_project: ...,
       selected_issue: ...,
       target_source: 'user_directed',
       worktree_path: result.folder ? (result.folder.worktree_path || '') : (result.worktree_path || '')
     }, result), ...);
     ```
     **Placement constraint**: `worktree_path` MUST be in the base object (before the spread), not after Object.assign. The `owned` case returns `result` with no top-level `worktree_path` (it is nested in `result.folder`); the base value persists. The `acquired` case has `result.worktree_path` which overrides — same correct value. Placing it after Object.assign would break the `owned` case.
- Mirror: existing `cmdStartup` output pattern at lines 380-386
- Validate: `node scripts/simulate-workflow-walkthrough.js` (after Task B; Task A alone won't add coverage)

### Task B: Add four regression tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same
- Write Set: new test functions + main() invocations
- Depends On: Task A
- Parallel Group: serial (after A)
- Action: MODIFY
- Implement: Add four test functions following `runNode`/`runClaimOnline` patterns already in the file:
  - **T1** `testNoTargetZeroActive`: empty folder list → `startup` (no target) → assert JSON `verdict === 'no_target'`, exit 1. Use `runNode` (not `runClaimOnline` — latter throws on exit ≠ 0).
  - **T2** `testNoTargetOneActive`: plant one active folder → `startup` (no target) → assert `verdict === 'no_target'`, exit 1. Use `runNode`.
  - **T3** `testNoTargetMultipleActive`: plant two active folders → `startup` (no target) → assert `verdict === 'no_target'`, exit 1. Use `runNode`.
  - **T4** `testSoleActiveRoundTrip`: plant one active folder → `startup status` → assert `count === 1`, `active[0].issue_number` set → call `startup --target-issue N` → assert `verdict === 'owned'`, `worktree_path` non-empty. Use `runClaimOnline` (expects success).
  - Wire all four into `main()` in dependency order (T1, T2, T3, T4).
- Mirror: existing test function patterns in `simulate-workflow-walkthrough.js`
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed"

### Task C: Rewrite step 5 — GitHub command doc
- File: `commands/workflow-next.md`
- Write Set: line 56 area
- Depends On: Task A (conceptual)
- Parallel Group: parallel (C/D/E/F)
- Action: MODIFY
- Implement: Replace old step 5 (`"If exactly one active folder is already present (startup will return \`verdict: owned\`), skip steps 1-4 and route to that project."`) with:
  ```
  5. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.
  ```
  Include the exact bash one-liner so agents have a concrete implementation:
  ```bash
  STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
  KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
  ```
- Validate: diff review — confirm old carve-out is replaced and one-liner is present

### Task D: Rewrite step 5 — GitLab command doc
- File: `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- Write Set: line 56 area
- Depends On: Task A (conceptual)
- Parallel Group: parallel (C/D/E/F)
- Action: MODIFY
- Implement: Same step-5 replacement as Task C with GitLab-appropriate surrounding prose (MR, `glab`). Include the same bash one-liner.
- Validate: diff review

### Task E: Rewrite step 5 — GitHub skill doc
- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Write Set: line ~66 in "Agent Issue Selection" section
- Depends On: Task A (conceptual)
- Parallel Group: parallel (C/D/E/F)
- Action: MODIFY
- Implement: Same step-5 replacement as Task C. Confirm `### Co-active Folders Advisory` section stays coherent with new step 5.
- Validate: diff review

### Task F: Rewrite step 5 — GitLab skill doc
- File: `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- Write Set: line 66 in "Agent Issue Selection" section
- Depends On: Task A (conceptual)
- Parallel Group: parallel (C/D/E/F)
- Action: MODIFY
- Implement: Same step-5 replacement as Task C with GitLab context. Include the bash one-liner.
- Validate: diff review

## Advisor Notes

Advisor PASSED blueprint with no architect revision needed. Key implementation details to enforce during Phase 4:

1. **`worktree_path` placement**: Must be in the BASE object literal of `Object.assign` (not appended after). `owned` case: `result` has no top-level `worktree_path` — base value persists. `acquired` case: `result.worktree_path` overrides — same correct value. Failure cases: no `worktree_path` in result — base empty string persists.

2. **Test helper selection**: T1/T2/T3 must use `runNode` (the non-throwing variant); `runClaimOnline` throws on exit ≠ 0. T4 must use `runClaimOnline` (expects success, exit 0).

3. **Doc one-liner**: All four doc files must include the exact bash one-liner pattern (not just prose intent) to ensure agent-side derive is concrete and consistent:
   ```bash
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```

4. **CLAUDE.md**: Lines 21-22 are correct as-is ("validate, not select"; "ambiguity → ask or stop"). Optional affirmation for sole-active agent-driven path deferred to Phase 6 doc-updater consideration.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Advisor PASSED on first review; no revision needed |
