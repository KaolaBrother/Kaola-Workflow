# Finalization — Summary: issue-926

## Delivered

- Replaced recurring Codex next/finalize profile/config recertification with install-time readiness proof.
- Preserved `install-codex-agent-profiles.js` as the authoritative fail-closed install/upgrade transaction.
- Preserved `kaola-workflow-codex-preflight.js --doctor` as an explicit diagnostic with standalone coverage.
- Preserved fixed per-spawn routing: standard roles use Sol/medium and reasoning roles use Sol/xhigh.
- Kept workflow-init, profiles, installers, doctor scripts, non-Codex commands, and other runtimes unchanged.

## Files Changed

- Two authoritative Codex routing skeletons and six generated next/finalize skills.
- One focused route-reachability absence/mutation contract.
- README, API, architecture, conventions, D-687-01, and Unreleased changelog.

## Test Coverage

- T19 mutation-checks nine recurring-gate signatures across both skeletons and all six generated skills.
- `node scripts/test-route-reachability.js`: 298 assertions passed.
- `node scripts/generate-routing-surfaces.js --check`: all 18 surfaces byte-match.
- `node scripts/test-install-model-rendering.js`: passed; installer and explicit doctor behavior remain covered.
- `node scripts/simulate-workflow-walkthrough.js`: 202/202 scenarios passed with 2,145 simulated spawns.
- Final diff review found no unresolved correctness finding; fixed model-routing blocks are byte-identical.

## Validation

- Candidate-bound receipt selected all four chains for edition coupling; Claude, Codex, GitLab, and Gitea each exited 0 on the first attempt with no accepted-red waiver.
- Receipt code-tree hash: `a38fa7f8752b326d8415a2d8d4b372ac287d12d6d07aa310dcd65309ccc8f97c`.

## Changed Paths

- Exactly 15 tracked paths, all within the two routing sources, their six generated Codex skills, one focused test, and six directly coupled documentation files.
- Zero installer, preflight-script, workflow-init, command, or other non-Codex surface changes.

## Documentation Docking

DOCKED. README, API, architecture, conventions, decision history, changelog, environment no-impact,
roadmap closure behavior, and issue comments were reconciled in `.cache/doc-docking.md`.

## Run gaps

None observed; the run discovered no separate defect requiring follow-up.

## Follow-Up Items

None.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-926/.cache/chain-receipt.json
- kaola-workflow/archive/issue-926/.cache/code-reviewer.md
- kaola-workflow/archive/issue-926/.cache/doc-docking.md
- kaola-workflow/archive/issue-926/.cache/doc-updater.md
- kaola-workflow/archive/issue-926/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-926/.cache/run-gaps.json
- kaola-workflow/archive/issue-926/finalization-summary.md
- kaola-workflow/archive/issue-926/mission-list.md
- kaola-workflow/archive/issue-926/workflow-state.md
