# n1-survey evidence
evidence-binding: n1-survey 9e118066a95d

## Role
doc-updater (n1-survey node for issue #420 — design(adaptive/auto): goal-driven automation)

## Task
Authored a runtime-grounded investigation document covering the four surfaces issue #420's
design builds on, grounded in real files and line numbers in this repo so the two downstream
ADRs (D-420-01, D-420-02) can cite concrete facts.

## Write set (declared)
- docs/investigations/2026-06-12-goal-driven-automation-design.md  (CREATED)

## Files read for grounding
- agents/issue-scout.md (read-only contract, JSON output, bundle rules)
- scripts/kaola-workflow-claim.js (cmdStartup:1193, claimExplicitTarget:805, claimProject:665, writeState:487, claimBundle:874)
- scripts/kaola-workflow-adaptive-handoff.js (freeze SPAWN 1:268, SPAWN 2:328, Planning Evidence:428, ready_to_run:464)
- scripts/kaola-workflow-adaptive-node.js (runWriteHalt:1454, runClearHalt:1584, runCloseAndOpenNext:1151, runOrient:572)
- scripts/kaola-workflow-plan-validator.js (computePlanHash:682, parseLabels:128, barrierCheck:578, write_set_granularity:659)
- scripts/release-surface-drift.js (tagAncestry:82, detectCodexReleaseSurfaceDrift:107)
- scripts/kaola-workflow-sink-merge.js (main:609, gh issue close:442/486, deriveMemberSet:591/636)
- scripts/validate-workflow-contracts.js (CHANGELOG presence:552, tag:556, ancestry:580, 3-manifest lockstep:469-496)
- commands/workflow-next.md (scout dispatch + env wiring), commands/kaola-workflow-plan-run.md (per-node loop)
- package.json (version 5.15.0, npm test chains), CHANGELOG.md ([Unreleased] #417 finding), kaola-workflow/ROADMAP.md
- gh issue list (open backlog #420-#435), gh issue view 420 (issue body)

## Key findings (per surface)
- Surface A (autopilot, Parts 1+3): scout→claim→plan→run→finalize all exist as discrete
  human-driven stages; no script crosses stage boundaries. #44 selection-aloud invariant +
  typed refusals (no_target, target_red, plan_invalid, halts, verdict-fail) are the autopilot's
  proceed/stop signals. scout's confidence:"high" is the proceed gate. State threads via
  workflow-state.md / workflow-plan.md / .cache.
- Surface B (halt triage, Part 2): runWriteHalt accepts [consent, security, test_thrash];
  today's payload is ONLY markers + transitions, NO diagnosis. barrierCheck already returns the
  offending arrays (outOfAllow/sensitiveHits/foreignArchiveHits/unattributed) + a typed `reason`
  envelope (#406), incl. the write_set_granularity subtype (#404) which IS a mechanical class. The
  enrichment threads existing classifier data into the halt return + adds lockfile/mirror/count-bump
  classes + a write-set-swap repair diff. Must stay forge-neutral + propagate ×4 editions.
- Surface C (goal line, Part 3): computePlanHash hashes ## Meta + ## Nodes only; a goal: line in
  ## Meta is hash-protected FOR FREE (no hash code change). Validator needs a parseGoal reader
  (mirror parseLabels, ## Meta-scoped), NOT a gate. Old plans stay hash-stable.
- Surface D (release aggregator, Part 4): all checks exist scattered in
  validate-workflow-contracts.js (tag:556, ancestry:580, 3-manifest lockstep:469-496, CHANGELOG
  presence:552) + release-surface-drift.js. #417 found CHANGELOG-presence != completeness (a
  shipped issue with no entry passes). Aggregator composes these + adds a completeness check;
  publish step (gh release create) stays forge-neutral/human (editions contract forbids a forge CLI
  in a shipped script). sink-merge.js is per-issue merge/close, NOT the release cut.

## Open questions raised (for the ADRs)
1. Autopilot auto-apply-repair vs. always-park on a mechanical halt (#44 covers selection, not repair).
2. Goal line: free prose (agent-judged) vs. structured ACs (mechanically checkable).
3. CHANGELOG-completeness needs the closed-issue set (forge-specific) — how to stay forge-neutral.
4. test_thrash delta capture — where the per-attempt test delta is recorded.
5. Where the autopilot lives (aggregator vs. orchestrator prose; subagents can't dispatch subagents).

## Status
- docs/investigations/2026-06-12-goal-driven-automation-design.md written with all six required sections
  (0 Summary, 1 Surface A, 2 Surface B, 3 Surface C, 4 Surface D, 5 Open Questions, 6 File/Line Index).
- Every design claim cites a real file + line/section.
- No other files written (no ADRs, no CHANGELOG, no source).
