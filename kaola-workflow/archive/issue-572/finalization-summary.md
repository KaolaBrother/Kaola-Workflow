# Finalization - Summary: issue-572

## Delivered
Re-grounded the `workflow-init`-injected `## Kaola-Workflow` block (the `KW-CLAUDE-TEMPLATE-START/END` region) on the adaptive DAG-of-roles model — removing the retired 6-phase-as-default vocabulary that contradicted #538 — and fully enforced parity (phase-ban + cross-forge + opencode), which was previously only half-enforced.

## Files Changed
- commands/workflow-init.md
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
- scripts/validate-kaola-workflow-contracts.js (phase-ban + cross-forge parity + needle move)
- scripts/validate-workflow-contracts.js (needle move)
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js (#274 byte-mirror, needle move)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (needle move)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (needle move)
- scripts/test-opencode-edition.js (opencode phase-ban + parity, A24)
- CHANGELOG.md (n3 — [Unreleased] ### Fixed)
- docs/decisions/D-572-01.md (n3 — new ADR)
(scripts/sync-opencode-edition.js was in the declared write set but needed no change — barrier-safe over-declaration.)

## Test Coverage
N/A (no numeric coverage tool). Verification is the four-chain contract suite + opencode suite + walkthrough.

## Final Validation Evidence
- Self-host (npm) repo → four-chain receipt via `kaola-workflow-run-chains.js --project issue-572`, run **serially** (`KAOLA_RUN_CHAINS_CONCURRENCY=serial`). Receipt: `kaola-workflow/issue-572/.cache/chain-receipt.json`.
- Per-node evidence: n1 `.cache/n1-init-template-adaptive.md` (RED→GREEN), n2 `.cache/n2-review.md` (verdict pass, 0 blocking).
- Adaptive barrier gates: resume=0 gate=0 barrier=0 verdict=0.
- Environment fix recorded: the default concurrent four-chain run (`KAOLA_RUN_CHAINS_CONCURRENCY=auto`) caused macOS to SIGKILL git's `git-merge-octopus` shell-helper inside `test-adaptive-node.js` under peak memory pressure (git 2.50.1 / Apple Git-155). Each test passes standalone/idle; running the chains serially (CLAUDE.md's mandated order) eliminates the contention. Not a #572 regression — reproduced on clean main; #572 touches none of the leg-synthesizer code.

## Documentation Docking
DOCKED — evidence: `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| `run-chains` (concurrent default) — claude chain | environment / tool noise (git-merge-octopus SIGKILL under concurrent-load memory pressure) | re-run serially (`KAOLA_RUN_CHAINS_CONCURRENCY=serial`) | `.cache/chain-receipt.json` | resolved (serial run green) |

## Follow-Up Items
- Out-of-template stale "phase" terminology sweep (reviewer NB1/NB2 + arch.md staleness) — see ## Run gaps.

## Run gaps
- manual:stale-phase-terminology-out-of-template (reviewer n2 NB1/NB2 + docs/architecture.md:11 "full … the default"): filed: #573

## Closure Decision
No blocking deferred items. The reviewer's out-of-scope nits are captured as one filed follow-up (above); #572's own acceptance criteria (AC1–AC6) all pass. #572 closes.

## Commit And Push
[pending final Git gate]

## GitHub Issue
#572 — to be closed by the merge sink after the green chain receipt.

## Roadmap
To be regenerated once by cmdFinalize (removes `.roadmap/issue-572.md`).

## Archive
Pending (cmdFinalize, worktree posture --keep-worktree).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-init-template-adaptive) | subagent-invoked | .cache/n1-init-template-adaptive.md | |
| code-reviewer (n2-review) | subagent-invoked | .cache/n2-review.md (verdict pass, 0 blocking) | |
| finalize (n3-finalize) | main-session-direct | .cache/n3-finalize.md | non-delegable sink node |
| doc-updater | skipped | .cache/doc-docking.md | doc impact limited to CHANGELOG + new ADR (n3 declared write set), authored main-session-direct; no README/api/architecture/env impact |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | env fix (serial chains), no code routing |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | cmdFinalize |
| archive completed folder | pending | | cmdFinalize |
| final commit and push | ready | | final gate after this file |

## Status
ARCHIVED AFTER FINAL GIT GATE (pending green serial chain receipt)
