# Finalization - Summary: issue-254

## Delivered
issue #254: under an ON adaptive switch, adaptive is the DEFAULT route in `/workflow-next` Step 0a-1 (`fast`/`full` are explicit path-naming escapes); `install.sh` switch default flipped `no`→`yes` with a real `--enable-adaptive=no` opt-out (writes `enable_adaptive:false`, survives a stale `:true`). Switch-OFF behaviour unchanged byte-for-byte; kill-switch resolution floor (`env > config > OFF`) untouched. Contract `'adaptive path selection'` concept: `flag-only`→`default` across all four contract validators. New ADR 0007; README updated. Shipped UNRELEASED via the adaptive path (dogfooded).

## Files Changed (18 impl)
- Router Step 0a-1 ×4: commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- Adapt precondition ×4: commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- Contract validators ×4: scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (5 — the claude pair + codex + gitlab + gitea)
- install.sh
- scripts/test-install-adaptive-config.js
- README.md, docs/decisions/0007-adaptive-default-under-switch-on.md, CHANGELOG.md

## Test Coverage
No coverage metric (Node scripts, hand-rolled asserts). All four edition test chains green.

## Final Validation Evidence
- Four adaptive barrier gates (resume-check / gate-verify / barrier-check / verdict-check): all exit 0 on the repaired plan (plan_hash 0dbe2dc2…). Evidence: /tmp/{rc,gv,bc,vc}2.json captured in-session.
- All four npm chains green (exit 0): `test:kaola-workflow:{claude,codex,gitlab,gitea}` — run sequentially to avoid CPU-contention flake. Evidence: /tmp/chain-*.log.
- install.sh 3 cases verified under scratch HOME + by the updated test-install-adaptive-config.js.

## Documentation Docking
DOCKED. README adaptive-switch description updated (ON-by-default, `--enable-adaptive=no` opt-out, default-route flip); ADR 0007 records the decision (supersedes the selection portion of 0003 + the #227 structure gate); CHANGELOG [Unreleased] entry added. No API/schema/.env changes.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| code-review (pass 1) | in-scope cross-edition Branch-A parity residual (R1) | implementer (core-and-install re-open) | .cache/code-review.md | resolved |
| npm test (finalize) | scope gap: 3 edition contract validators + install test missed by the issue's scope | implementer (harden-editions plan-repair node) | .cache/harden-editions.md | resolved |

## Follow-Up Items
- Open Question 3 (optional `workflow-init` CLAUDE.md discoverability bullet): DEFERRED — explicitly optional in the issue and "largely mooted" by the default-route change. Clean follow-up, not a blocker.

## Closure Decision
Issue ACs all met; the only deferred item is the explicitly-optional discoverability bullet (non-blocking per the issue). User goal is "finish issue 254" (= merge + close). Proceeding to close. No advisor-closure escalation needed.

## Commit And Push
pending final Git gate (contractor commit on workflow/issue-254 + sink-merge to main).

## GitHub Issue
to be closed by sink-merge (--issue 254).

## Roadmap
updated (cmdFinalize: rm .roadmap/issue-254.md + regenerate ROADMAP.md).

## Archive
pending (cmdFinalize archives kaola-workflow/issue-254/ → kaola-workflow/archive/issue-254/).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/docs.md (docs node) | |
| documentation docking | invoked | this summary | |
| closure advisor gate | N/A | only deferred item is explicitly-optional; user goal is finish/close | |
| final-validation fix executors | invoked | .cache/harden-editions.md; code-review repair re-runs | |
| roadmap refresh | pending | cmdFinalize Step 8b | |
| archive completed folder | pending | cmdFinalize Step 8b | |
| final commit and push | ready | contractor Step 8 + sink-merge | |

## Status
READY FOR FINAL GIT GATE
