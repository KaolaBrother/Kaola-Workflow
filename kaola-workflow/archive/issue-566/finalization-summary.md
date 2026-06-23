# Finalization - Summary: issue-566

## Delivered
Issue #566 — the per-node `model` column was the only frozen-plan field with no closed loop.
The `kaola-workflow-subagent-dispatch-log.sh` SubagentStart hook now records the dispatched
model in `.cache/dispatch-log.jsonl`: `model_planned` (always resolved from the agent manifest
via `kaola-workflow-resolve-agent-model.js`) and `model` (the runtime-supplied tier — codex CLI
only; empty for Claude Code SubagentStart and opencode). Additive, payload-agnostic, fail-open,
backward-compatible. No new gate, no schema migration.

## Files Changed
- `hooks/kaola-workflow-subagent-dispatch-log.sh`
- `plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh`
- `plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh`
- `plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh`
- `scripts/simulate-workflow-walkthrough.js` (+ `testDispatchLogEmitsModelFields566`)
- `docs/architecture.md`, `docs/workflow-state-contract.md`, `CHANGELOG.md`

(The four hook copies are byte-identical — `validate-script-sync` sync-group at `:157`.)

## Test Coverage
The walkthrough suite (`simulate-workflow-walkthrough.js`) covers the new behavior via
`testDispatchLogEmitsModelFields566` (RED→GREEN: asserts non-empty `model_planned` and the
payload-supplied `model`). No standalone coverage tooling in this repo (Node scripts only).

## Final Validation Evidence
Self-host npm repo → machine-gated on the chain receipt (`#432`). All four forge chains GREEN
(claude/codex/gitlab/gitea exit 0), receipt bound to HEAD `d82aff50`, codeTreeHash current.
Evidence: `.cache/chain-receipt.json` + `.cache/final-validation.md`. Cross-edition obligation
`#307` satisfied (diff touches gitlab/gitea plugin hooks).

## Documentation Docking
DOCKED — `.cache/doc-docking.md`. architecture + state-contract + CHANGELOG updated; README /
.env.example / api.md explicitly no-impact.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| gitlab+gitea `assertNoForbidden` (forge `./scripts` leak, `#328`) | regression (cross-edition contract) | tdd-guide (finalize-lane fix) | `.cache/final-validation-fix-1.md` | fixed — locator re-expressed without `./scripts` literal; all 4 chains re-run green |

## Follow-Up Items
None open. (Process note, non-blocking: the n3 code-reviewer gate did not run the forge
`--forbidden-only` check the plan called for; the four-chain finalize gate caught the slip
mechanically. No product follow-up — the gate worked as designed.)

## Run gaps
Sweep was empty (`run-gaps.json` → `sweptClasses: []`); the in-run repair above is a resolved
fix recorded in the Failure Ledger, not a deferred/waived defect requiring a follow-up issue.

## Closure Decision
None needed — acceptance criteria met (dispatch-log carries the model fields; additive;
backward-compatible; four chains green). No deferred items, no user-decision items.

## Commit And Push
Implementation committed as `d82aff50` on `workflow/issue-566` (unpushed). Final hash reported
after the sink gate runs.

## GitHub Issue
#566 — pending close at the sink step (acceptance passed).

## Roadmap
No `kaola-workflow/.roadmap/issue-566.md` source existed (the issue was not on the local
roadmap mirror). `cmdFinalize`/`archiveProjectDir` regenerates `ROADMAP.md` once at archive.

## Archive
Pending — `cmdFinalize` (contractor Step 8b) archives `kaola-workflow/issue-566/` atomically.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| n1 knowledge-lookup (payload probe) | invoked | `.cache/n1-payload-probe.md` | |
| n2 tdd-guide (RED→GREEN) | invoked | `.cache/n2-dispatch-model-field.md` | |
| n3 code-reviewer (G1 gate) | invoked | `.cache/n3-review.md` (verdict: pass) | |
| n4 doc-updater | invoked | `.cache/n4-docs.md` + `.cache/doc-docking.md` | |
| final-validation fix executors | invoked | `.cache/final-validation-fix-1.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` (DOCKED) | |
| chain-receipt gate (self-host) | invoked | `.cache/chain-receipt.json` (4/4 green) | |
| run-gap sweep | invoked | `.cache/run-gaps.json` (empty sweep) | |
| roadmap refresh | pending | | cmdFinalize regenerates once at archive |
| archive completed folder | pending | | contractor Step 8b |
| final commit and push | ready | branch `workflow/issue-566` @ `d82aff50`, unpushed | final sink gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
