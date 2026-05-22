# Phase 6 - Summary: issue-153

## Delivered
Inherit-decouple for the Claude Code subagent model badge. The installer now
rewrites every INSTALLED agent frontmatter `model:` to `inherit`, while command
files still render concrete `model="sonnet|opus|haiku"`. Because the dispatched
concrete model now differs literally from the installed `inherit` baseline, the
model badge renders on every subagent dispatch (no parent-equal edge). Cost
profiles (common/higher) are preserved — `model=` still controls which model each
agent runs on. A new contract guard (`assertEveryDispatchHasModel`) across all
three forge validators prevents any command template from silently dropping a
`model=` line (which, under `inherit`, would run the agent on the parent/Opus).

## Files Changed
- install.sh — `agent_source_file()` + `install_managed_agent()` helpers; both copy sites rewrite installed frontmatter to `inherit` (in-loop before the manifest hash); `resolve_agent_model_for_install` reads the profile-applied SOURCE so command files keep concrete models.
- scripts/test-install-model-rendering.js — F2: asserts all 9 installed agents are `model: inherit` + retain the managed marker.
- scripts/validate-workflow-contracts.js (+ byte-identical mirror plugins/kaola-workflow/scripts/validate-workflow-contracts.js) — F3 per-dispatch model-line guard. The mirror also backfilled a pre-existing #152 sync drift (see Follow-Up / decisions D3).
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — F3 guard.
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — F3 guard.
- README.md, CHANGELOG.md — documentation.
- kaola-workflow/.roadmap/issue-153.md (removed in Step 7), kaola-workflow/ROADMAP.md (regenerated), kaola-workflow/issue-153/* (workflow artifacts → archived).

## Test Coverage
No coverage tooling in this repo (hand-rolled assert suite). All suites pass:
`npm test` exit 0 (claude/codex/gitlab/gitea), including F2 install-rendering, all forge
contract validators (with the new F3 guard), script-sync, vendored-agents, and all walkthrough simulations.

## Final Validation Evidence
- `npm test` → exit 0 (full suite, all 4 forges). Evidence: .cache/final-validation.md.
- Covers Phase 4/5 targeted commands (Validation De-Duplication): F2 test, validate-workflow-contracts (all forges), validate-script-sync, simulate-workflow-walkthrough.
- `bash -n install.sh` → exit 0 (Phase 4 evidence, no install.sh change since). Evidence: .cache/tdd-task-1.md.

## Documentation Docking
DOCKED. Evidence: .cache/doc-docking.md.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- LOW (Phase 5): dedupe `agent_source_file()` vs the inline higher-profile selection in `install_agent_files` (optional maintainability cleanup; reduces future drift risk). Non-blocking.
- Manual verification (out of automated scope): fresh `./install.sh --forge=github` (and `--profile=higher`) into a real $HOME + Claude Code restart, dispatch a workflow subagent, visually confirm the model badge. Mechanism empirically proven in a prior session (inherit baseline badges on every concrete model).
- Incidental: this PR also resolves a pre-existing #152 script-sync drift in the plugin mirror of validate-workflow-contracts.js (see .cache/decisions.md D3) — note in the commit/PR so reviewers don't read the larger mirror diff as scope creep.

## Closure Decision
Advisor consulted (.cache/advisor-closure.md): CLOSE issue #153 — implementation complete,
follow-ups non-blocking. No follow-up issue filed (LOW DRY nit is optional, recorded in archived
artifacts). Per /goal directive, followed advisor recommendation rather than stopping to ask the user.
#152 drift + manual-verify to be noted in the commit body.

## Commit And Push
pending final Git gate; final hash reported after sink, not written back here.

## GitHub Issue
[pending — closed by sink-merge on the merge path after AC pass]

## Roadmap
[pending Step 7 regeneration]

## Archive
[pending Step 8b cmdFinalize]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | — | final validation passed first run |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | Step 7 |
| archive completed folder | pending | | Step 8b |
| final commit and push | ready | git status/diff/upstream | final gate after this file committed |

## Status
READY FOR FINAL GIT GATE
