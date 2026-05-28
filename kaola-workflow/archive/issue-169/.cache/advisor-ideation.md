# Advisor Ideation Gate — issue-169

## Verdict
Approach A approved. All risks are accurate. No missed approaches. 

## Key Sharpenings

### 1. Missing test (blocking for Phase 3 task list)
Add `testClassifierOfflineUnverifiedWithUnrelatedActiveFolder`:
- Plant an active folder for issue N (different from target M)
- OFFLINE startup with `--target-issue M` (no roadmap for M)
- Assert: `verdict: 'target_unverified'`, `claim: 'none'`, no folder for M created
- This is the case the issue explicitly calls out — unrelated active folder must NOT cause `user_target_red`

### 2. Verify `activeFolders` item shape ✓ DONE
Items have `.issue_number` field (confirmed at `scripts/kaola-workflow-classifier.js:325`). Predicate: `activeFolders.some(f => f.issue_number === args.issue)`.

### 3. Verify line 328 early-return ✓ DONE  
Lines 327–331: `if (activeStateIssues.has(args.issue)) { process.exitCode = 2; return; }` — this fires BEFORE the OFFLINE block at line 334. The `alreadyActive` check in the new guard is for defensive inline clarity only; the real same-target exit is at line 328.

### 4. Step 0 validation ordering
New validation step must be inserted between Step 0 (target selection) and Step 0a-1 (path rubric). Call it "Step 0 — Target Existence Check" as a sub-step within Step 0, or number it so it precedes Step 0a-1 in the spec prose. This ensures the agent cannot fabricate a fast/full rubric judgment for an unverified target.

## Non-blocking notes
- `cmdClassify(argv)` refactor: keep `argv || process.argv.slice(3)` default for backward compat
- `--help` → stdout + exit 0 (not stderr)
- New reasoning string is single-line ASCII — survives `node -e` extraction

## Conclusion
Proceed with Approach A. Add the unrelated-active-folder test. The two field/line-number facts are verified and correct.

---

## Correction (2026-05-28)

Issue framing corrected: #317 was in a downstream consumer project, not `KaolaBrother/Kaola-Workflow`. Validation invariant is consumer-repo context. Scripts already use cwd context correctly (`ghExec`, `getRoot`).

Approach A unchanged. Sharpenings from second advisor pass:
- One sentence of consumer-repo prose in Step 0 (no new section)
- Target-existence check is item 7 in Step 0 (not "Step 0c")
- ONE consumer-repo assertion in an existing new test (not a separate test)
- Existing fixture (`writeGhShimForStartup` returns `owner:test, name:repo`) already models a downstream project; no new fixture helpers needed
- Keep `testClassifierOfflineUnverifiedWithUnrelatedActiveFolder`

Proceed to code-architect with corrected framing.
