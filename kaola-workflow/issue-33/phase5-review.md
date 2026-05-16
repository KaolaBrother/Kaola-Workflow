# Phase 5 - Review: issue-33

## Code Review Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
- **M1** (`sink-merge.js:166-171`): `KAOLA_WORKFLOW_DEBUG_CWD` — test instrumentation in production code with env-controlled write path. Content written is benign (`process.cwd()`). Recommended: rename to `KAOLA_WORKFLOW_TEST_CWD_PROBE` in a follow-up. Does not block.
- **M2** (`sink-merge.js:176`): Pre-chdir failure silently swallowed — on failure, bug recurs without trace. **FIXED**: changed `catch (_) {}` to `catch (e) { process.stderr.write(...) }`. See `.cache/review-fix-1.md`.

### MEDIUM/LOW
- **L1** (`sink-merge.js:34-36` vs `phase6.md:591-593`): JS `mainRootFromCoord` is conditional (`basename === '.git'`); shell derivation uses unconditional `dirname`. Logically equivalent in the standard case. Follow-up: add matching conditional to shell block or comment the assumption.
- **L2** (`simulate-workflow-walkthrough.js`): Shell-level `cd "$_MAIN_ROOT"` in phase6.md not covered by automated tests. Follow-up: add sub-case or manual regression check.
- **L3** (`sink-merge.js:149-219`): `main()` is ~70 lines, exceeds 50-line guideline. Follow-up: extract Step 0 into named helper.

## Security Review
Ran: yes — `sink-merge.js` touches filesystem operations (`fs.writeFileSync`, `process.chdir`) and process control (`process.on('exit')`).

### Findings
No CRITICAL, HIGH, or MEDIUM security issues.
- `KAOLA_WORKFLOW_DEBUG_CWD` write path: informational only — same-principal, benign content, no privilege boundary.
- `process.chdir()` path: derived from env or git subprocess, no shell, wrapped in try/catch — not a risk.
- All external commands use `execFileSync` — injection structurally impossible.
- `process.on('exit')` handler: safe, synchronous, cannot be triggered externally.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | filesystem access + process.chdir in sink-merge.js |
| review-fix executors | invoked | .cache/review-fix-1.md | M2 fix applied |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied
- M2: pre-chdir `catch (_) {}` → `catch (e) { process.stderr.write(...) }` in sink-merge.js:176

## Validation Evidence
- Full suite after M2 fix: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0). Evidence: `.cache/review-fix-1.md`.
- Phase 4 validation evidence cited (no changes to tested behavior): `.cache/tdd-task-3.md`.

## Follow-Up Items
- M1: Rename `KAOLA_WORKFLOW_DEBUG_CWD` → `KAOLA_WORKFLOW_TEST_CWD_PROBE` (coordinate in sink-merge.js + walkthrough.js)
- L1: Mirror JS conditional logic into shell `_MAIN_ROOT` derivation block
- L2: Add automated test for shell-side `cd "$_MAIN_ROOT"` in phase6.md
- L3: Extract `main()` Step 0 into `pruneWorktreeAndAnchorCwd()` helper

## Review Status
PASSED WITH FOLLOW-UPS
