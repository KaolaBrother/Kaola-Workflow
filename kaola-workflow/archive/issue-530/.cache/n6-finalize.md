evidence-binding: n6-finalize de2a425e3136
compliance: main-session-direct

# n6-finalize — sink node (finalize, non-delegable; orchestrator main-session-direct)

Write-set: `CHANGELOG.md`. Added the `audit(opencode): #530` entry under `[Unreleased] ### Changed` summarizing: edition verified solid + no regression (4 chains green); D-530-01 (content-reachability assertions) + D-530-02 (additive boundary) recorded; this run is live opencode E2E; deliverables = audit report + 2 ADRs; defects filed as follow-ups.

## Node lifecycle summary (this run)
- n1-parity, n1-runtime, n1-schema (concurrent read-only probes) → completed
- n2-decisions (planner synthesis) → completed
- n3-critique (adversarial verifier; 4 chains green; decisions empirically validated) → completed, verdict pass
- n4-e2e (main-session-gate; live opencode cycle + simulation) → completed, verdict pass
- n5-report (doc-updater; 3 docs written) → completed
- n6-finalize (this node; CHANGELOG) → completed

All 8 nodes complete; routing to `/kaola-workflow-finalize issue-530` for closure (issue update, roadmap, archive, follow-up issue filing per the gaps_unswept gate).
