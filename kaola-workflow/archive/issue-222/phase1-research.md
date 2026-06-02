# Phase 1 - Research / Discovery: issue-222

## Deliverable
Make fast-path mid-flight escalation route cleanly into the full workflow instead of looping back to the fast skill. Three parts:
- **A (CODE)** `repair-state.js`: a new `reconstruct()` branch detects an ESCALATED fast project and routes to **Phase 1** (the only non-wedging resume point), via a dedicated builder.
- **B (PROSE)** the fast command + fast SKILL escalation procedure rewrites `workflow-state.md` to `workflow_path: full` / `next_command: /kaola-workflow-phase1` on escalation, and the Resume Detection forward-routes an escalated state to full.
- **C (DOC + ENFORCEMENT)** `workflow-next.md` reconstruction ladder gains an escalation rung; contract validators assert the new strings so the prose half is enforced, not just reviewed.

## Why
On escalation today, the orchestrator writes `escalated_to_full` + sets `fast-summary.md` ESCALATED but never resets `workflow_path: fast` / `next_command: /kaola-workflow-fast`. On re-run, `repair-state` (`fastStateValid` never inspects escalation) routes back to the fast skill, which dead-ends (Claude `fast.md:40` has no forward route; Codex SKILL has no Resume Detection). The "re-run without KAOLA_PATH=fast" instruction is inert (path is persisted, not from env). `workflow-next.md:113-114` falsely promises clean escalation.

## Affected Area (verified line numbers)
- `scripts/kaola-workflow-repair-state.js`: `isFastWorkflowState` :89-91, `fastStateValid` :93-98, `reconstruct()` artifact ladder :346-375 (bug site: fast-summary→routeFast :372; phase1 branch :371), `routeFast` template :408-422, `stateLooksValid` :424-441, `route()` :380 (`readFile(phaseFile)` — must NOT reuse, ENOENT on missing phase1-research), `stateContent()` :461 (regenerates preserving only Sink block).
- `commands/kaola-workflow-fast.md`: Resume Detection :40 (dead-end), Mid-Flight Escalation steps :69-75.
- Codex `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`: NO Resume Detection, NO Mid-Flight Escalation procedure (only Goal Contract mention :19).
- `commands/workflow-next.md`: :113-114 false claim, :298 ladder (validator-locked string `fast-summary.md exists -> /kaola-workflow-fast`).
- Prerequisite gates that FORCE the resume-point decision: `commands/kaola-workflow-phase2.md:11-17` (requires phase1-research.md), `commands/kaola-workflow-phase3.md:11-14` (requires phase1 + phase2).

## Edition / byte-sync
- repair-state.js: root↔Codex byte-identical (COMMON_SCRIPTS); gitlab/gitea forge-adapted (`kaola-gitlab/gitea-workflow-repair-state.js`, ~512 diff lines, hand-port).
- fast command: root + gitlab + gitea `commands/kaola-workflow-fast.md` (Codex has no commands/ dir — SKILL only).
- fast SKILL.md: Codex + gitlab + gitea (107-line files; ADD the missing sections).
- workflow-next.md + 3 contract validators (root pair byte-identical + Codex + gitlab + gitea).
- Tests: root walkthrough (covers Codex via byte-sync) + gitlab + gitea walkthroughs (forge repair-state currently untested).

## Linked issue
GitHub #222. Acceptance: escalation→resume→full transition routes to Phase 1 (no re-wedge); normal fast routing unbroken; byte-sync intact; all walkthroughs + contract validators green.
