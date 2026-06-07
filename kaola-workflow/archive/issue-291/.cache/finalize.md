# finalize node evidence — issue-291

## Deliverable
Added the #291 hardening entry to CHANGELOG.md under `## [Unreleased]` → `### Fixed`:
R1 (runSealMember idempotency guard), R2 (runOpenBatch baselines-first, honestly scoped),
R4 (partial-seal unsealed-subset predicate at both crossCheckStatus + runOrient), cross-edition
parity across all 4 editions, and the known pre-existing F1 follow-up (crossCheckStatus vs
runOrient single-in_progress + all-sealed divergence).

## Prerequisite barrier gates (all exit 0)
resume-check=0  gate-verify=0  barrier-check=0  verdict-check=0
whole-plan barrier-check: result pass, sensitiveHits=[], outOfAllow=[] (10-file diff within union allowlist).

## Scope
Only CHANGELOG.md written by this node (declared write set). All code + tests landed in
harden (6 base files) + harden-forge (4 gitlab/gitea ports), each barrier-verified.
