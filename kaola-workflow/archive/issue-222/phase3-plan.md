# Phase 3 - Plan: issue-222

## Blueprint — ~17 files across 5 groups + tests

### G1 — repair-state.js (CODE, the routing fix)
| File | Change |
|------|--------|
| `scripts/kaola-workflow-repair-state.js` | CANONICAL: add a dedicated escalation builder (model on `routeFast` :408) returning phase:1, workflowPath:'full', nextCommand:`/kaola-workflow-phase1 {project}`, nextSkill:`kaola-workflow-research {project}`, phaseFile→existing fast-summary.md; add a branch in `reconstruct()` IMMEDIATELY BEFORE the fast-summary rung (:372) that fires when `fast-summary.md` status === `ESCALATED`. Do NOT reuse `route()` (ENOENT on missing phase1-research). |
| `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js` | `cp` from root (byte-identical, COMMON_SCRIPTS) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | forge-port same logic (fns ~:58/:62/:317/:333, fast branch ~:352) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js` | forge-port same logic |

### G2 — fast command (PROSE)
`commands/kaola-workflow-fast.md` + `plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md` + `plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md`: (:40) Resume Detection — add forward route "`escalated_to_full`/ESCALATED present → route to full (/kaola-workflow-phase1)"; (:69-75) Mid-Flight Escalation — rewrite workflow-state.md to `workflow_path: full` + `next_command: /kaola-workflow-phase1 {project}` + `next_skill: kaola-workflow-research {project}` BEFORE stopping; drop the inert "without KAOLA_PATH=fast" instruction; keep writing fast-summary ESCALATED.

### G3 — fast SKILL.md (PROSE — ADD missing sections)
`plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` (Codex) + gitlab + gitea: ADD a Resume Detection section (escalated/ESCALATED → route to full /kaola-workflow-phase1; do not resume fast) AND a Mid-Flight Escalation procedure with the same state-rewrite as G2. (These currently lack both.)

### G4 — workflow-next.md doc + ladder
`commands/workflow-next.md` + gitlab + gitea: (:113-114) keep/refine "Fast false positives escalate cleanly" (now TRUE); (:298) add an escalation rung ABOVE the validator-locked `fast-summary.md exists -> /kaola-workflow-fast` string (e.g. "fast-summary.md status ESCALATED -> /kaola-workflow-phase1"). KEEP the locked string verbatim.

### G5 — contract validators (convert prose→enforced)
`scripts/validate-workflow-contracts.js` (+ byte copy `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) + Codex `scripts/validate-kaola-workflow-contracts.js` + `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` + gitea: add `assertIncludes` for the new escalation-rewrite (`next_command: /kaola-workflow-phase1`) and Resume forward-route strings in the fast command/SKILL per edition.

### Tests
| File | Change |
|------|--------|
| `scripts/simulate-workflow-walkthrough.js` | add `testRepairFastEscalation` (model on `testRepairFastPath` :151); covers root + byte-identical Codex |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | add forge `testRepairFastEscalation` (forge repair-state untested) |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | add forge `testRepairFastEscalation` |

NOT edited: validate-script-sync.js (repair-state already in COMMON_SCRIPTS); phase6.md (no escalation handling needed).

## Test plan (testRepairFastEscalation — 3 assertions)
1. **Escalated→FULL/Phase1**: state {workflow_path:fast, next_command:/kaola-workflow-fast, status:active} + fast-summary ESCALATED, NO phase1-research. Run repair. Assert state now {workflow_path:full, next_command:/kaola-workflow-phase1 {project}, next_skill:kaola-workflow-research {project}}, NO residual fast keying, exit 0 (no throw → dedicated builder).
2. **NEGATIVE CONTROL**: fast-summary IN_PROGRESS/REVIEW/PASSED (no escalation) → STILL valid / routes /kaola-workflow-fast (unbroken).
3. **PRECEDENCE**: phase1-research.md AND ESCALATED fast-summary → routes /kaola-workflow-phase2 (line 371 wins) → monotonic recovery.
Revert-probe: neutralize the ESCALATED branch → test 1 routes back to /kaola-workflow-fast → fails. Forge tests mirror assertion 1 (+ negative control).

## Build sequence
1. root repair-state.js (builder + reconstruct branch); cp to Codex. 2. forge-port gitlab+gitea repair-state. 3. add root testRepairFastEscalation (RED→GREEN). 4. forge walkthrough tests. 5. prose: fast command (root+2 forge) + ADD to 3 SKILLs. 6. workflow-next.md (3 editions). 7. validator assertIncludes (root pair + Codex + 2 forge). 8. full acceptance.

## Acceptance
node scripts/validate-script-sync.js; node scripts/simulate-workflow-walkthrough.js; node scripts/validate-workflow-contracts.js; node scripts/validate-kaola-workflow-contracts.js; gitlab+gitea contract validators; gitlab+gitea walkthroughs; npm test.
