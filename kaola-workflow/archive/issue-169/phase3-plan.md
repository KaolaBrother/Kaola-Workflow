# Phase 3 - Plan: issue-169

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-classifier.js` | OFFLINE guard for `target_unverified`; `cmdClassify(argv)` refactor; top-level `--issue` + `--help` dispatch | AC #6, #7, #10 |
| `scripts/kaola-workflow-claim.js` | New `target_unverified` branch in `claimExplicitTarget()` | AC #8 |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-identical mirror | AC #11 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical mirror | AC #11 |
| `commands/workflow-next.md` | Step 0 new item 7 (target-existence check); Step 0b `KAOLA_VERDICT`/`KAOLA_REASONING`; Required Output refusal-diagnostics | AC #1, #3, #4, #5 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Step 0 new item 6; Step 0b extract; refusal prose | AC #2, #3, #4, #5 |
| `scripts/simulate-workflow-walkthrough.js` | Rename existing test; add 4 new; register | AC #9, #12, #13 |

### Build Sequence
1. **Group 1 (parallel):** T1 classifier, T2 claim, T3 workflow-next.md, T4 SKILL.md (disjoint write sets)
2. **Group 2 (after Group 1):** T5 mirror sync — copy `scripts/*` to `plugins/kaola-workflow/scripts/*`; verify with `diff -q`
3. **Group 3 (after T1+T2; can run in parallel with T5):** T6 tests
4. **Group 4 (after all):** Validation commands

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | T1, T2, T3, T4 | Disjoint write sets across two scripts and two docs |
| 2 | T5 + T6 | T5 writes `plugins/kaola-workflow/scripts/*`, T6 writes `simulate-workflow-walkthrough.js` — disjoint |
| 3 | Validation | Read-only |

### External Dependencies
None. Built-in Node modules only (`fs`, `path`, `child_process`, `assert`).

## Task List

### Task 1 (T1): Classifier — `target_unverified` verdict + CLI ergonomics
- File: `scripts/kaola-workflow-classifier.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (T6)
- Write Set: `scripts/kaola-workflow-classifier.js`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement:
  1. Refactor `cmdClassify()` to accept argv parameter:
     ```js
     function cmdClassify(argv) {
       const args = parseArgs(argv || process.argv.slice(3));
       // ... rest unchanged
     ```
  2. Inside the OFFLINE block (after `const roadmapFile = ...`, before `let labels = []`), add the unverified guard:
     ```js
     if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_number === args.issue)) {
       process.stdout.write(JSON.stringify({
         verdict: 'target_unverified',
         reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
       }) + '\n');
       return;
     }
     ```
     Note: `activeFolders.some(...)` is defensively redundant with line 328's early-return (which uses `.filter(Boolean)` on `issue_number` — a malformed folder with `issue_number: 0/null` would slip past). Kept for self-documentation.
  3. Add `printHelp()` function and update `main()` dispatcher (lines 381–386):
     ```js
     function printHelp() {
       process.stdout.write(
         'usage: kaola-workflow-classifier.js [classify] --issue <N> [--json]\n' +
         '       kaola-workflow-classifier.js --issue <N> [--json]   (top-level form)\n' +
         '       kaola-workflow-classifier.js --help\n'
       );
     }

     function main() {
       const sub = process.argv[2];
       assert(sub, 'usage: kaola-workflow-classifier.js [classify] --issue <N>');
       if (sub === '--help' || sub === '-h') { printHelp(); return; }
       if (sub === '--issue') return cmdClassify(process.argv.slice(2));
       if (sub === 'classify') return cmdClassify(process.argv.slice(3));
       throw new Error('unknown subcommand: ' + sub);
     }
     ```
- Mirror: same pattern as existing verdict emissions in `cmdClassify` (e.g., `target_unavailable` at line 359)
- Validate: `node scripts/kaola-workflow-classifier.js --help` exits 0 with usage; `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-classifier.js --issue 99999` (run from a tmp dir without `.roadmap/issue-99999.md`) emits `verdict:'target_unverified'` JSON

### Task 2 (T2): Claim — `target_unverified` branch
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (T6)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none (parallel with T1)
- Parallel Group: 1
- Action: MODIFY
- Implement: in `claimExplicitTarget()` (lines 428–444), insert new branch between the `target_unavailable` branch and the fall-through `return claimProject(...)`:
  ```js
  if (classified.verdict === 'target_unverified') {
    return {
      status: 'target_unverified',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning: classified.reasoning
    };
  }
  ```
- Mirror: same `{ status, claim, issue, project, reasoning }` shape as `user_target_blocked`, `user_target_red`, `target_unavailable`
- Validate: `cmdStartup` envelope at lines 467–474 already maps `result.status === 'target_unverified'` → `verdict: 'target_unverified'`, `claim: 'none'`, exit code 1 (the `Object.assign` spreads `result` last, so `reasoning` is preserved)

### Task 3 (T3): commands/workflow-next.md — Step 0 item 7 + Step 0b extraction + Required Output
- File: `commands/workflow-next.md`
- Test File: N/A (doc)
- Write Set: `commands/workflow-next.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement:
  1. **C1**: Insert new item 7 in Step 0 numbered list (between current items 6 and 7; existing item 7 "State the selected issue aloud" becomes item 8):
     ```markdown
     7. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.
        - Online: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.
        - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
     ```
  2. **C2**: Append two lines to Step 0b extraction (after current line 138):
     ```bash
       KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
       KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
     ```
  3. **C3**: Update Required Output prose (lines ~149–155): add `target_unverified` to typed-refusal enum; add directive to print `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING` before stopping when `claim: 'none'`.
- Mirror: existing `node -e` extraction pattern at lines 136–138
- Validate: visual inspection; agent re-read of routing prose

### Task 4 (T4): plugins/.../SKILL.md — same as T3
- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Test File: N/A
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Depends On: none
- Parallel Group: 1
- Action: MODIFY
- Implement:
  1. **D1**: Step 0 in SKILL.md has 6 items; insert new item 6 (existing "State aloud" → item 7). Use the same prose as T3.C1.
  2. **D2**: Append two extraction lines to Step 0b (after current line 119–120). **Use SKILL.md's existing naming style** — do NOT rename `PICK_NEXT_PROJECT` to `KAOLA_PROJECT`; only ADD `KAOLA_VERDICT` and `KAOLA_REASONING`.
  3. **D3**: Mirror C3 prose changes.
- Mirror: T3 pattern with SKILL.md naming
- Validate: visual inspection; diff against T3 prose for parity

### Task 5 (T5): Mirror sync to plugins/kaola-workflow/scripts/
- File: `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Test File: N/A
- Write Set: those two files
- Depends On: T1, T2
- Parallel Group: 2
- Action: MODIFY (copy)
- Implement:
  ```bash
  cp scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
  cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
  ```
- Validate:
  ```bash
  diff -q scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
  diff -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
  node scripts/validate-script-sync.js
  ```

### Task 6 (T6): Tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: self
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: T1, T2 (can run in parallel with T5)
- Parallel Group: 2
- Action: MODIFY
- Implement:
  1. **F1 — Rename `testClassifierOfflineBypassesFailClosed` → `testClassifierOfflineUnverifiedNoLocalEvidence`** and flip body (currently lines 2337–2363):
     ```js
     function testClassifierOfflineUnverifiedNoLocalEvidence() {
       // No roadmap entry for issue 156 + OFFLINE=1 + failing gh shim → unverified
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-unverified-no-evidence-'));
       try {
         const binDir = path.join(tmp, 'bin');
         writeGhShimFailingIssueView(binDir);

         const result = runNode(claimScript, ['startup', '--target-issue', '156'], tmp);
         assert(!result.signal, '...');
         assert(result.status === 1, 'startup must exit 1 for target_unverified, got ' + result.status);

         const parsed = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
         assert(parsed.verdict === 'target_unverified', 'verdict must be target_unverified, got: ' + parsed.verdict);
         assert(parsed.claim === 'none', 'claim must be none, got: ' + parsed.claim);
         assert((parsed.reasoning || '').includes('no local evidence'), 'reasoning must mention no local evidence');
         assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-156')), 'folder must NOT be created');
       } finally {
         fs.rmSync(tmp, { recursive: true, force: true });
       }
       console.log('testClassifierOfflineUnverifiedNoLocalEvidence: PASSED');
     }
     ```
  2. **F2 — Add 4 new tests** (insert immediately after F1, before `testClaimProjectOwnedFolderFailingRemote`):

     **testClassifierOfflineVerifiedRoadmapAcquires:**
     - Tmp dir with `kaola-workflow/.roadmap/issue-200.md` (minimal: `issue: #200\ntitle: test\nstatus: open\nworkflow_project: issue-200\nnext_step: ready\n`)
     - Run `startup --target-issue 200` via `runNode`
     - Assert exit 0, `claim === 'acquired'`, folder created at `tmp/kaola-workflow/issue-200`

     **testClassifierOfflineVerifiedOwnedFolderRoutes:**
     - `plantActiveFolder(tmp, 'issue-201', 201, null)` (line 328 early-return path)
     - Run `startup --target-issue 201` via `runNode`
     - Assert exit 0, `claim === 'owned'`

     **testClassifierOfflineUnverifiedWithUnrelatedActiveFolder:**
     - `plantActiveFolder(tmp, 'issue-300', 300, null)` (unrelated active folder)
     - Target M=301, no roadmap for 301
     - Run `startup --target-issue 301` via `runNode`
     - Assert exit 1, `verdict === 'target_unverified'` (NOT `user_target_red`), `claim === 'none'`, no folder for 301
     - **Consumer-repo isolation assertion**: assert `(parsed.reasoning || '').includes('#301')` (proves classifier used the requested target from cwd's context, not the unrelated active issue 300). Add comment: `// Consumer-repo isolation: getRoot() resolves to tmp via git rev-parse; existing shim returns name:repo (non-Kaola).`

     **testClassifierTopLevelIssueFlag:**
     - OFFLINE tmp, no roadmap
     - Run `node classifierScript --issue 999` (top-level, no `classify` subcommand)
       - Assert exit 0, stdout JSON parses with `verdict === 'target_unverified'`
     - Run `node classifierScript --help`
       - Assert exit 0, stdout contains `'usage:'`

  3. **F3 — Replace runner registration line** (at ~line 3433):
     ```js
     testClassifierOfflineUnverifiedNoLocalEvidence();
     testClassifierOfflineVerifiedRoadmapAcquires();
     testClassifierOfflineVerifiedOwnedFolderRoutes();
     testClassifierOfflineUnverifiedWithUnrelatedActiveFolder();
     testClassifierTopLevelIssueFlag();
     ```
- Mirror: existing test patterns at lines 303 (folder overlap), 2307 (fail closed), 2337 (currently bypass)
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed"

## Advisor Notes
Architect plan approved. All 13 acceptance criteria covered. Two sharpenings applied:
1. **CONSUMER_REPO_MARKER theater dropped.** Replaced with substantive assertion that `reasoning` mentions `#301` (proves cwd-resolved target). Comment documents the underlying isolation guarantee from `getRoot()` + `cwd: tmp`.
2. **T6 ordering**: tests reference `scripts/*` constants, not `plugins/kaola-workflow/scripts/*`, so T6 can run in parallel with T5 (both depend on T1+T2). Reflected in Parallelization Plan above.

Dispatch verification ✓: `main()` already exists at lines 381–386; architect A2 modifies in place.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | no .cache/architect-revision-*.md | advisor approved with non-blocking sharpenings applied inline |
