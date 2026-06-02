# Phase 4 - Progress: issue-222

## CODE (the revert-provable fix)
- root repair-state.js: `fastSummaryStatus(content)` (reads `## Status` first non-blank, UPPERCASE — matches fast-audit parseStatus) + `routeEscalatedToFull(root,workflowDir,project)` (phase 1, workflowPath 'full', nextCommand /kaola-workflow-phase1, nextSkill kaola-workflow-research, phaseFile→fast-summary.md). Branch in reconstruct() BETWEEN the phase1-research rung and the fast-summary rung: if fast-summary exists AND status==='ESCALATED' → routeEscalatedToFull, else routeFast. Idempotent (second run on workflow_path:full derives same next_command → "existing state valid"). cp to Codex (byte-identical).
- gitlab + gitea forge-ported (same logic, forge string-concat style).

## TEST (revert-proven)
testRepairFastEscalation (3 assertions): (1) ESCALATED fast → workflow_path:full + /kaola-workflow-phase1 + kaola-workflow-research, no residual fast keying, exit 0; (2) NEGATIVE CONTROL IN_PROGRESS fast → stays /kaola-workflow-fast; (3) PRECEDENCE phase1-research + ESCALATED → /kaola-workflow-phase2 (phase1 rung wins). Revert-probe: neutralize ESCALATED branch → "ESCALATED fast project must be rewritten to workflow_path: full". Forge walkthroughs: testRepairFastEscalation (assertion 1 + negative control) gitlab + gitea.

## PROSE (converted to validator-enforced)
- fast commands (root + gitlab + gitea): Resume Detection status-based forward route (ESCALATED → /kaola-workflow-phase1); Mid-Flight Escalation step 1 rewrites workflow-state.md to full/phase1; removed inert "without KAOLA_PATH=fast".
- 3 fast SKILLs (Codex + gitlab + gitea): ADDED ## Resume Detection + ## Mid-Flight Escalation (previously absent).
- workflow-next.md commands + next SKILLs (6 files): escalation rung ABOVE the locked `fast-summary.md exists -> /kaola-workflow-fast` string (unchanged).
- validators (root pair + Codex + gitlab + gitea): assertIncludes new escalation/resume strings + assertBefore ladder ordering.

## Acceptance (all exit 0)
validate-script-sync (10 common scripts in sync), root walkthrough, validate-workflow-contracts, validate-kaola-workflow-contracts, gitlab + gitea contract validators, gitlab + gitea walkthroughs (testRepairFastEscalation PASSED), npm test.

## Files touched: 24
4 repair-state + 3 walkthroughs + 3 fast commands + 3 fast SKILLs + 3 workflow-next commands + 3 next SKILLs + 5 validators.

## For Phase 5
- Revert-probe the CODE fix (ESCALATED branch) independently → test 1 fails.
- Verify negative control (normal fast unbroken) + precedence (phase1 rung wins).
- Byte-sync root↔Codex (repair-state + validate-workflow-contracts).
- Forge-port parity + validator-locked string preserved.
- Scope: confirm 24 files all intended (ladder rung in next SKILLs + validator parity), no unrelated edits.
- Security: routing + prose only; no path/shell/auth/untrusted-input surface → security-reviewer N/A-with-reason.
