# Documentation Docking — issue-437

## Changed files reviewed
- scripts/kaola-workflow-plan-validator.js (--parallel-safe, --group-barrier, barrierCheck opts.groupMembers)
- scripts/kaola-workflow-adaptive-node.js (tryFormLaneGroup, runOpenReady co-open, closeGroupMember, runCloseNode)
- scripts/kaola-workflow-parallel-batch.js (runStatus laneGroup surface)
- scripts/test-commit-node.js, scripts/test-adaptive-node.js, scripts/test-parallel-batch.js
- plugins/kaola-workflow/scripts/* (byte-pairs), plugins/kaola-workflow-gitlab/scripts/* (forge ports), plugins/kaola-workflow-gitea/scripts/* (forge ports)

## Documents checked
- docs/decisions/D-437-01.md — PRESENT, NEW: covers all 4 settlements, INV-6, R1 advisory
- docs/architecture.md — UPDATED: lane-group co-open section added
- docs/api.md — UPDATED: lane_group schema, new CLI flags, response extensions
- docs/workflow-state-contract.md — UPDATED: lane_group durability contract
- CHANGELOG.md — UPDATED: [Unreleased] entry with all 3 scripts, 4 settlements, test counts, 4-chain green

## Gaps found
None. All public behavior changes documented:
- New CLI flags (--parallel-safe, --group-barrier) documented in docs/api.md
- New running-set.json schema extension documented in docs/api.md and docs/workflow-state-contract.md
- open-ready/close-node response shape changes documented in docs/api.md
- Flag-OFF INV-6 invariant documented in D-437-01.md and architecture.md
- Advisory finding R1 documented in D-437-01.md

## No-impact reasons for skipped document classes
- README.md: no user-visible install change, no new env var, no setup impact — skip justified
- .env.example: KAOLA_LANE_CONTAINMENT is documented via architecture.md/api.md; default OFF means no setup change for existing users — skip justified
- Inline comments: new functions have adequate inline context; no public interface change that would leave callers confused without additional comments

## Final verdict: DOCKED
