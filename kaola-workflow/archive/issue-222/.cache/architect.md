# Architect — issue-222 (research + blueprint)

## SETTLED DECISION: resume point = PHASE 1 (not Plan/Ideation)
Issue says "route into Plan/Ideation" (Phase 2/3) — WRONG, would re-wedge. Evidence:
- commands/kaola-workflow-phase2.md:11-17 HARD gate: phase1-research.md must exist else STOP.
- commands/kaola-workflow-phase3.md:11-14 requires phase1-research.md AND phase2-ideation.md.
An escalated fast project has ONLY fast-summary.md → Phase 2/3 dead-end at their own gate. Phase 1 is the ONLY non-wedging resume point. Consistent with reconstruct() artifact order (repair-state.js:369-372: phase3→phase2→phase1@371→fast-summary@372): once Phase 1 produces phase1-research.md, line 371 fires before the fast-summary branch → climbs full ladder automatically, fast-summary never read again. Self-reinforcing → makes workflow-next.md:113-114 honest.
Escalation write-side sets: workflow_path: full, next_command: /kaola-workflow-phase1 {project}, next_skill: kaola-workflow-research {project}.

## Part-A refinement (narrower than issue)
Load-bearing fix = a SINGLE new branch in reconstruct() BEFORE line 372. The issue's routeFast/stateLooksValid/fastStateValid edits are redundant — both main() paths funnel through reconstruct() (line 546 valid / 571 invalid). For escalated state (workflow_path:fast, next_command:/kaola-workflow-fast, status:active), stateLooksValid true → reconstruct() → new branch returns nextCommand:/kaola-workflow-phase1 → line 552 new≠current → REWRITE fires. stateContent() (:461) regenerates whole file preserving only Sink block → clears workflow_path:fast + fast next_command automatically.
KEY DETECTION ON fast-summary.md status === 'ESCALATED', NOT escalated_to_full in workflow-state.md: stateContent() does NOT preserve escalated_to_full on rewrite → keying on state field is non-idempotent; keying on fast-summary status is idempotent (re-runs before phase1 completes keep routing to phase1; once phase1-research.md exists, line 371 wins). Negative control falls out (IN_PROGRESS/REVIEW/PASSED ≠ ESCALATED).
MUST NOT reuse route() — line 380 readFile(phaseFile) → ENOENT on missing phase1-research.md. New dedicated builder modeled on routeFast (:408): phase:1, workflowPath:'full', nextCommand:/kaola-workflow-phase1 {project}, nextSkill:kaola-workflow-research {project}, phaseFile → existing fast-summary.md.

## Edition matrix (~17 files)
G1 repair-state.js (CODE): scripts/ canonical + plugins/kaola-workflow/scripts/ (cp byte-identical, COMMON_SCRIPTS) + gitlab kaola-gitlab-workflow-repair-state.js (forge-port, fns at :58/:62/:317/:333, fast branch :352) + gitea (same offsets).
G2 fast command (PROSE): commands/kaola-workflow-fast.md (:40 forward route to full; :69-75 rewrite escalation to set workflow_path:full/next_command:/kaola-workflow-phase1, drop inert "without KAOLA_PATH=fast") + gitlab + gitea plugin commands. Codex has NO commands/ dir.
G3 fast SKILL.md (PROSE — ADD MISSING Resume Detection + Mid-Flight Escalation, 107-line files): plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md (Codex) + gitlab + gitea.
G4 workflow-next.md: root :113-114 (now TRUE) + :298 ladder rung ABOVE the validator-locked `fast-summary.md exists -> /kaola-workflow-fast` string + gitlab + gitea.
G5 validators (convert prose→enforced via assertIncludes): scripts/validate-workflow-contracts.js (+ byte copy plugins/kaola-workflow/scripts/) + Codex validate-kaola-workflow-contracts.js + gitlab validate-kaola-workflow-gitlab-contracts.js + gitea.
Tests: scripts/simulate-workflow-walkthrough.js (root, covers Codex via byte-sync) + gitlab + gitea walkthroughs (forge repair-state UNtested — grep -c repair-state = 0 in forge walkthroughs; forge copies independently structured → port-bug risk → ADD coverage).
validate-script-sync.js needs NO edit (repair-state.js already in COMMON_SCRIPTS:44).

## Test-covered vs review-only
TEST-COVERED (revert-provable): repair-state.js routing — root walkthrough drives via runNode(repairScript,[project],tmp) subprocess; Codex covered transitively by validate-script-sync. Neutralize new ESCALATED branch → routes back to fast → fails.
CONVERTED review-only→enforced: fast command/SKILL prose (G2/G3) — walkthrough can't bite, but G5 validators assertIncludes the new escalation-rewrite + Resume-forward-route strings per edition.

## Test plan: testRepairFastEscalation (model on testRepairFastPath:151)
1. Escalated→FULL/Phase1: state workflow_path:fast + next_command:/kaola-workflow-fast + status:active + fast-summary ESCALATED, NO phase1-research. Run repairScript. Assert state now workflow_path:full, next_command:/kaola-workflow-phase1 {project}, next_skill:kaola-workflow-research {project}, no residual fast keying, exit 0 (no throw → proves dedicated builder not route()).
2. NEGATIVE CONTROL: fast-summary IN_PROGRESS/REVIEW/PASSED (no escalation) → STILL "existing state valid"/routes /kaola-workflow-fast.
3. PRECEDENCE: phase1-research.md AND ESCALATED fast-summary → routes /kaola-workflow-phase2 (line 371 wins) → monotonic recovery.
Revert-probe: neutralize ESCALATED detection → test 1 routes back to /kaola-workflow-fast → fails.
Forge: ADD testRepairFastEscalation to gitlab+gitea walkthroughs (forge harness spawnSync(process.execPath,[repairScript,...])).

## Coupling traps
- `fast-summary.md exists -> /kaola-workflow-fast` LOCKED by 3 validators (root validate-workflow-contracts.js:163, gitlab :447, gitea :452). Add escalation rung ABOVE; keep exact string.
- stateContent():461 regenerates preserving only Sink → rewrite auto-clears workflow_path:fast. Don't rely on escalated_to_full persisting; key idempotency on fast-summary status.

## #225 flag
#222 restructures the fast SKILL (adds Resume Detection + Mid-Flight Escalation). #225 (later) repoints Codex fast-skill refs → must rebase onto #222's SKILL edits.

## Build sequence
1. root repair-state.js (builder + reconstruct branch); cp to Codex. 2. forge-port gitlab+gitea repair-state. 3. add root testRepairFastEscalation (RED→GREEN). 4. forge walkthrough tests. 5. prose: fast command (root+2 forge) escalation+resume; ADD Resume Detection+escalation to 3 SKILLs. 6. workflow-next.md :113-114 + ladder rung (3 editions). 7. validator assertIncludes (root pair + Codex + 2 forge). 8. full acceptance.

## Acceptance
node scripts/validate-script-sync.js; node scripts/simulate-workflow-walkthrough.js; node scripts/validate-workflow-contracts.js; node scripts/validate-kaola-workflow-contracts.js; gitlab+gitea contract validators; gitlab+gitea walkthroughs; npm test.
