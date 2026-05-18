# Phase 3 - Plan: issue-42

## Blueprint

### Receipt Schema (freeze point)

Path: `kaola-workflow/{project}/.cache/sink-fallback.json`

```json
{
  "project": "issue-42",
  "branch": "workflow/issue-42",
  "issue_number": 42,
  "reason": "branch_protected | non_fast_forward | permission_denied",
  "timestamp": "ISO-8601"
}
```

Written by `sink-merge.js` (on push exception → classified token); read by `cmdSinkFallback`.

### Reason-Token Mapping Table

| Observed error (push stderr) | Token |
|------------------------------|-------|
| `protected branch` OR `GH006` | `branch_protected` |
| `rejected` AND `non-fast-forward` | `non_fast_forward` |
| `permission denied` OR `403` OR `not authorized` | `permission_denied` |
| `conflicts with target` (FF-only context = divergent base) | `non_fast_forward` |
| Anything else | `null` — transient; exit 1, NOT exit 3 |

Note: classification is on PUSH stderr only. Local `git merge --ff-only` failures are NOT classified and propagate as exit 1 unchanged.

### Data Flow

**Normal merge path:** `/workflow-next` → startup (sink: merge) → Phase 6 → `sink-merge.js` push succeeds → exit 0

**PR-intent path:** User prompt contains keyword → `export KAOLA_SINK=pr` → startup (sink: pr) → Phase 6 → `sink-pr.js` directly

**Merge-fallback path:** `sink-merge.js` push → exception caught → `classifyMergeError` returns token → `git reset --hard origin/main` → write `.cache/sink-fallback.json` → return `{exitCode: 3}` → main sets `process.exitCode = 3` → Phase 6 catches exit 3 → `cd "$_MAIN_ROOT"` → `claim.js sink-fallback` (updates lock file + Sink block to pr + sink_fallback_reason) → `sink-pr.js` → propagate exit

### Files to Delete

| File | Reason |
|------|--------|
| `commands/workflow-next-pr.md` | Replaced by prose intent-detection in workflow-next.md Step 0a |
| `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md` (+ directory) | Codex skill removed |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-sink-merge.js` | Add `classifyMergeError`, wrap push in try/catch, write receipt, reset, exit 3; add `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` env var | Core auto-fallback logic |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identical copy | Parity enforcement |
| `scripts/kaola-workflow-claim.js` | Add `sink_fallback_reason` to `buildSinkBlock`/`buildLockData`; add `cmdSinkFallback`; add to dispatch switch | Lease state management |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy | Parity enforcement |
| `commands/kaola-workflow-phase6.md` | Wrap merge case: on exit 3, cd to main root, call sink-fallback, dispatch sink-pr.js, propagate exit | Auto-fallback dispatch |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Same exit-3 pivot in sink dispatch block | Dual-copy parity |
| `commands/workflow-next.md` | Add Startup Step 0a — PR Intent Capture | NLU intent detection |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Same Step 0a block | Dual-copy parity |
| `scripts/validate-workflow-contracts.js` | Remove L299-301; add negation assertion; add `classifyMergeError` and `sink-fallback` to parity symbol array | Remove stale assertion; add new contract |
| `scripts/validate-kaola-workflow-contracts.js` | Remove `'kaola-workflow-next-pr'` from skills array (L73) | Deleted skill no longer registered |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 18 (18A/18B/18C) | Auto-fallback simulation |
| `README.md` | Remove next-pr skill listing; rewrite PR Sink Mode section | Docs reflect new approach |
| `CHANGELOG.md` | Add issue-42 entry under [Unreleased] | Release record |
| `kaola-workflow/cross-machine-followups/phase2-ideation.md` | Scrub `workflow-next-pr` references | Stale design doc |
| `kaola-workflow/codex-parity/phase2-ideation.md` | Scrub `workflow-next-pr` references | codex-parity checked: step=complete, safe to scrub |

### Build Sequence

1. Group A (parallel): Tasks 2, 3, 5, 6 — independent write sets
2. Group B (after A): Task 4 (parity copy, needs Tasks 2+3 done), Task 7 (delete, needs Task 6 done)
3. Group C (after B): Task 8 (validators, needs Tasks 2+3+7 done)
4. Group D (after C): Task 9 (Epic Case 18, needs Tasks 2+3+4 done)
5. Group E (after D): Task 10 (docs, after all functional tasks)

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 2, 3, 5, 6 | Disjoint write sets: sink-merge.js vs claim.js vs phase6.md vs workflow-next.md |
| B | 4, 7 | After A; Task 4 copies A's outputs; Task 7 deletes replaced files |
| C | 8 | After B; validators assert on files changed by A+B |
| D | 9 | After B; simulation uses A+B's implementations |
| E | 10 | After all functional tasks |

### External Dependencies

None. No new npm packages.

## Task List

### Task 2: sink-merge.js — exit 3 + merge-impossible classification
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic Case 18A, 18B, 18C)
- Write Set: `scripts/kaola-workflow-sink-merge.js`, `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: receipt schema (frozen in blueprint above)
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add at top: `const FORCE_MERGE_IMPOSSIBLE = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE || '';`
  2. Add `classifyMergeError(stderr)` function:
     ```js
     function classifyMergeError(stderr) {
       if (FORCE_MERGE_IMPOSSIBLE) return FORCE_MERGE_IMPOSSIBLE;
       if (/protected branch|GH006/i.test(stderr)) return 'branch_protected';
       if (/rejected/.test(stderr) && /non-fast-forward/.test(stderr)) return 'non_fast_forward';
       if (/permission denied|403|not authorized/i.test(stderr)) return 'permission_denied';
       if (/conflicts with target/i.test(stderr)) return 'non_fast_forward';
       return null;
     }
     ```
     Scope note: called ONLY in the push exception catch block. Local FF merge failures before the push step are NOT classified and propagate as exit 1.
  3. Wrap push call in `postMergeCleanup(args)` in try/catch. On caught exception:
     - Classify: `const token = classifyMergeError(err.stderr || err.message || '');`
     - If token is null: re-throw (exit 1 path, transient failure)
     - If token non-null:
       a. `execFileSync('git', ['reset', '--hard', 'origin/main'], {encoding: 'utf8'})`
       b. Compute receipt path: `path.join(mainRootFromCoord(getCoordRoot()), 'kaola-workflow', args.project, '.cache', 'sink-fallback.json')`
       c. Write receipt JSON: `{project: args.project, branch: args.branch, issue_number: args.issue || null, reason: token, timestamp: new Date().toISOString()}`
       d. Return `{exitCode: 3}` (plain object — do NOT call process.exit or throw)
  4. In `main()`: check return value of `postMergeCleanup(args)`:
     ```js
     const result = postMergeCleanup(args);
     if (result && result.exitCode === 3) { process.exitCode = 3; return; }
     ```
     This keeps `process.on('exit', ...)` running for CWD cleanup.
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 3: claim.js — `sink_fallback_reason` field + `cmdSinkFallback`
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic Case 18A sub-assertion)
- Write Set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: receipt schema (frozen in blueprint above)
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. `buildSinkBlock` (L712-724): add after `pr_number` line:
     ```js
     if (lockData.sink_fallback_reason != null) lines.push('sink_fallback_reason: ' + lockData.sink_fallback_reason);
     ```
  2. `buildLockData` (L883-901): add `sink_fallback_reason: null` to the returned object
  3. New `cmdSinkFallback` function (add before dispatch switch):
     ```js
     function cmdSinkFallback() {
       const args = parseArgs(process.argv.slice(3));  // parseArgs, NOT parseStartupArgs
       assert(args.project && isSafeName(args.project), '--project is required');
       const root = getRoot();
       const coordRoot = getCoordRoot();
       const receiptPath = path.join(mainRootFromCoord(coordRoot), 'kaola-workflow', args.project, '.cache', 'sink-fallback.json');
       assert(fs.existsSync(receiptPath), 'sink-fallback receipt not found: ' + receiptPath);
       const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
       assert(receipt.reason, 'receipt missing reason field');
       const lp = lockPath(coordRoot, args.project);
       assert(fs.existsSync(lp), 'lock file not found for project: ' + args.project);
       const existing = JSON.parse(fs.readFileSync(lp, 'utf8'));
       const updated = Object.assign({}, existing, { sink: 'pr', sink_fallback_reason: receipt.reason });
       fs.writeFileSync(lp, JSON.stringify(updated, null, 2) + '\n');
       const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
       updateSinkLease(stateFile, updated);
       process.stdout.write(JSON.stringify({ ok: true, reason: receipt.reason, project: args.project }) + '\n');
     }
     ```
     Write order: (1) read receipt, (2) read lock, (3) mutate lockData, (4) write lock file, (5) call updateSinkLease (constructs workflow-state.md from lockData — does not re-read lock file).
  4. Dispatch switch: add `if (sub === 'sink-fallback') return cmdSinkFallback();`
  5. Usage string (L2777): add `sink-fallback` to pipe-delimited list
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0; `node scripts/kaola-workflow-claim.js sink-fallback 2>&1` prints "--project is required"

### Task 4: Parity sync
- Files: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: same as above (copy from scripts/)
- Depends On: Tasks 2, 3 complete
- Parallel Group: B
- Action: COPY (byte-identical)
- Mirror:
  ```bash
  cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
  cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
  ```
- Validate: `node scripts/validate-workflow-contracts.js` (parity assertions pass)

### Task 5: Phase 6 dispatch — exit-3 pivot
- Files: `commands/kaola-workflow-phase6.md`, `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Write Set: both files
- Depends On: Task 3 interface spec (can be written in parallel with Task 3)
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. `_MAIN_ROOT` is already defined at L616: `_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"`. No new definition needed. The existing variable is correct (uses git-common-dir dirname, which is the main worktree root even in worktree-native mode).
  2. In the `merge|*` case block, wrap the sink-merge.js call to capture exit code:
     ```bash
     node "$_CLAIM_JS_PATH" ... ; _SINK_MERGE_EXIT=$?
     if [ "$_SINK_MERGE_EXIT" -eq 3 ]; then
       cd "$_MAIN_ROOT"
       node "$_CLAIM_JS_PATH" sink-fallback --project "{project}" --session "$KAOLA_SESSION_ID" || { echo "sink-fallback failed"; exit 1; }
       node "$_SINK_PR_JS" --branch "$SINK_BRANCH" --project "{project}" --issue "$ISSUE_NUMBER"
       exit $?
     fi
     [ "$_SINK_MERGE_EXIT" -ne 0 ] && exit "$_SINK_MERGE_EXIT"
     ```
  3. Apply identical pivot block to SKILL.md with same variable names
  4. No retry after pivot. sink-pr.js exit code propagates directly.
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 6: Intent detection prose (Step 0a)
- Files: `commands/workflow-next.md`, `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Write Set: both files
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Insert "Startup Step 0a — PR Intent Capture" block BEFORE Startup Step 0 (startup transaction):
  ```
  ## Startup Step 0a — PR Intent Capture
  
  If the user's initial prompt contains any of: "open a PR", "create a PR",
  "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink" — export KAOLA_SINK=pr
  before the startup call. The existing ${KAOLA_SINK:+--sink $KAOLA_SINK}
  pass-through propagates without modification.
  
  Matching is case-insensitive. Do not set KAOLA_SINK if no keyword matches.
  ```
  Apply identically to SKILL.md.
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 7: Delete workflow-next-pr files
- Files: `commands/workflow-next-pr.md`, `plugins/kaola-workflow/skills/kaola-workflow-next-pr/` (entire directory)
- Depends On: Task 6 (intent detection path must exist before deletion)
- Parallel Group: B
- Action: DELETE
- Commands:
  ```bash
  git rm commands/workflow-next-pr.md
  git rm -r plugins/kaola-workflow/skills/kaola-workflow-next-pr/
  ```
- Validate: `test ! -f commands/workflow-next-pr.md && test ! -d plugins/kaola-workflow/skills/kaola-workflow-next-pr/`

### Task 8: Validator updates
- Files: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`
- Write Set: both files
- Depends On: Tasks 2, 3, 7
- Parallel Group: C
- Action: MODIFY
- Implement:
  1. `validate-workflow-contracts.js` L299-301: remove the 3 lines asserting `commands/workflow-next-pr.md` exists and is ≤40 lines; replace with negation assertion: `assert(!fs.existsSync('commands/workflow-next-pr.md'), 'workflow-next-pr.md must be deleted (issue-42)');`
  2. Add `'classifyMergeError'` and `"if (sub === 'sink-fallback')"` to the parity symbol array (the array checked against both scripts/kaola-workflow-claim.js and plugins copy)
  3. `validate-kaola-workflow-contracts.js` L73: remove `'kaola-workflow-next-pr',` from skills array
- Validate: `node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js`

### Task 9: Epic Case 18
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (mirror after)
- Depends On: Tasks 2, 3, 4
- Parallel Group: D
- Action: MODIFY
- Implement: Add 3 sub-cases after the last existing epic case:
  - **18A** (branch-protected auto-fallback, subprocess invocation):
    - Set `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected`
    - Run `sink-merge.js --branch ... --project ...`
    - Assert exit code === 3
    - Assert `.cache/sink-fallback.json` exists with `reason: 'branch_protected'`
    - Invoke `cmdSinkFallback` via subprocess: `execFileSync('node', [CLAIM_JS, 'sink-fallback', '--project', proj, '--session', sessionId])`
    - Assert workflow-state.md contains `sink: pr` and `sink_fallback_reason: branch_protected`
    - Subprocess requirement: must use `execFileSync` (not `require()`), same as Phase 6 dispatch
  - **18B** (offline mode, no merge-impossible — normal path):
    - Set `KAOLA_OFFLINE=1`, no FORCE env var
    - Run sink-merge.js with a valid local branch
    - Assert exit code === 0, assert no `.cache/sink-fallback.json` written
  - **18C** (unclassified push failure — exits 1, no pivot):
    - Set `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=` (empty) + arrange a push failure with unrecognized stderr
    - Assert exit code === 1 (NOT 3), assert no receipt file written
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 10: Documentation cleanup
- Files: `README.md`, `CHANGELOG.md`, `kaola-workflow/cross-machine-followups/phase2-ideation.md`, `kaola-workflow/codex-parity/phase2-ideation.md`
- Depends On: all functional tasks complete
- Parallel Group: E
- Action: MODIFY
- Implement:
  - `README.md`: remove `kaola-workflow-next-pr` from skill listing (~L181); rewrite PR Sink Mode section (~L414-418) to describe intent detection + auto-fallback instead of `/workflow-next-pr`
  - `CHANGELOG.md`: add issue-42 entry under [Unreleased]: "feat: remove /workflow-next-pr; drive sink from prompt intent + auto-fallback (issue-42)"
  - `kaola-workflow/cross-machine-followups/phase2-ideation.md`: scrub `workflow-next-pr` references (replace with "intent detection (see issue-42)")
  - `kaola-workflow/codex-parity/phase2-ideation.md`: scrub `workflow-next-pr` references; codex-parity workflow-state.md confirmed `phase: 6, step: complete` — safe to scrub
- Validate:
  - `grep -r "kaola-workflow-next-pr" README.md CHANGELOG.md kaola-workflow/cross-machine-followups/ kaola-workflow/codex-parity/` — must return zero lines
  - Post-archive grep: `grep -r "workflow-next-pr" . --exclude-dir=archive --exclude-dir=.git` — should match only CHANGELOG historical entries if any

## Acceptance Criteria

- `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed"
- `node scripts/validate-workflow-contracts.js` exits 0
- `node scripts/validate-kaola-workflow-contracts.js` exits 0
- `test ! -f commands/workflow-next-pr.md` — file deleted
- `test ! -d plugins/kaola-workflow/skills/kaola-workflow-next-pr/` — directory deleted
- Grep for `workflow-next-pr` in non-archive, non-.git paths returns zero results (except CHANGELOG historical lines if pre-existing)
- workflow-state.md contains `sink: pr` and `sink_fallback_reason: branch_protected` after Epic Case 18A runs

## Advisor Notes

From `.cache/advisor-plan.md`:

Four blocking gaps resolved:
1. `parseArgs` (not `parseStartupArgs`) — correct function at L149 of claim.js
2. "Depends on: Task 1" phrasing removed — receipt schema is frozen in blueprint, no Task 1 entry
3. `_MAIN_ROOT` must be defined before case block — `git rev-parse --show-toplevel 2>/dev/null || pwd`
4. `getCoordRoot` consistency confirmed — sink-merge.js imports it from claim.js via require(); same function, same return value

Four clarification items incorporated:
- `classifyMergeError` scope is PUSH exceptions only; local FF merge failures propagate as exit 1
- `cmdSinkFallback` write order: mutate lockData → write lock file → call updateSinkLease
- Epic Case 18A uses subprocess invocation for cmdSinkFallback (not require)
- `postMergeCleanup` returns `{exitCode: 3}` (plain object); main() checks return value, sets process.exitCode

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | Gaps resolved inline in phase3-plan.md rather than new architect revision; all gaps were function-name and variable-definition corrections with no architectural change | |
