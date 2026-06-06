# Phase 6 — Summary: issue-250

## Delivered
A new `implementer` adaptive node role alongside `tdd-guide` (issue #250), wired across all four editions (claude/codex/gitlab/gitea). Adaptive-path only.

## Files Changed (33 tracked + 5 new)
- Validator ×4: `scripts/kaola-workflow-plan-validator.js` + 3 plugin copies (CANONICAL/WRITE/IMPLEMENT_ROLES += implementer)
- Resolver ×4: `scripts/kaola-workflow-resolve-agent-model.js` + 3 plugin copies (implementer→sonnet)
- `install.sh`, `uninstall.sh` (REQUIRED_AGENTS + IMPLEMENTER_MODEL placeholder + manifest)
- `scripts/simulate-workflow-walkthrough.js` (RED→GREEN: implementer in-grammar + G1 post-dominance)
- `scripts/validate-vendored-agents.js` (localAgents += implementer)
- NEW: `agents/implementer.md`, `plugins/{kaola-workflow,gitlab,gitea}/agents/implementer.toml`, `.codex/agents/kaola-workflow/implementer.toml` (gitignored local artifact)
- `plugins/{kaola-workflow,gitlab,gitea}/config/agents.toml` ([agents.implementer])
- Forge count bumps ×4: `plugins/{gitlab,gitea}/scripts/validate-kaola-workflow-{gitlab,gitea}-contracts.js` + `test-{gitlab,gitea}-workflow-scripts.js` (12→13)
- Prose: `commands/kaola-workflow-{adapt,plan-run}.md`, `plugins/kaola-workflow/skills/kaola-workflow-{adapt,plan-run}/SKILL.md`, `plugins/{gitlab,gitea}/commands/kaola-workflow-{adapt,plan-run}.md`, `agents/workflow-planner.md` + 3 `plugins/*/agents/workflow-planner.toml`
- Docs: `README.md`, `docs/api.md`, `CHANGELOG.md`

## Test Coverage
`npm test` green across all four editions. New RED→GREEN regression in simulate-workflow-walkthrough.js asserts the load-bearing IMPLEMENT_ROLES⇒G1 reduction.

## Final Validation Evidence
All four adaptive barrier gates exit 0 (resume/gate/barrier/verdict) + `npm test` exit 0. Evidence: `.cache/final-validation.md`.

## Documentation Docking
DOCKED — `.cache/doc-docking.md`.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Plan repair (recorded deviation)
The frozen plan was re-frozen once via `plan-validator --freeze` to add node `impl-forge-counts` (the 4 forge contract-validator/test-script agent-count files, 12→13, were in no original node's declared write set and would have failed the Phase-6 whole-plan barrier as `outOfAllow` production paths). The `## Node Ledger` is outside `plan_hash`, so all completed-node progress was preserved. G1/G2 grammar re-validated on the re-freeze. The `prose-forge` role agent crashed mid-node (API socket); the orchestrator verified its in-lane edits were correct, reverted its out-of-lane writes, and authored its evidence. Both events are resolved, not deferred.

## Follow-Up Items
- None blocking. #250 open questions resolved by implementation choices: role name `implementer`; contractor requires `non_tdd_reason` + a change-type-appropriate check (sub-type left to `code-reviewer`); no hard per-plan cap (reviewer-validates-category fence).

## Closure Decision
No deferred items, conflicts, or user-decision items found in the closure scan. Acceptance criteria for #250 met.

## Commit And Push
Pending final Git gate (chore: finalize issue-250).

## GitHub Issue
#250 — to be closed by sink-merge after commit.

## Roadmap
To be regenerated (remove .roadmap/issue-250.md).

## Archive
Pending cmdFinalize → kaola-workflow/archive/issue-250/.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | docs node (.cache/docs.md) + CHANGELOG by finalize | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | orchestrator advisor consult (no deferred items) | |
| final-validation fix executors | N/A | no final-validation failures | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean of unrelated; barrier green | |

## Status
READY FOR FINAL GIT GATE
