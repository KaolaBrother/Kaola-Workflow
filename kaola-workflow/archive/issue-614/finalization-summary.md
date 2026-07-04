# Finalization - Summary: issue-614

## Delivered
Made the finalize command/SKILL "final-validation" instruction dual-mode across all six
finalize surfaces (3 Claude commands + 3 Codex SKILL packs), resolving the contradiction
between the unconditional "full test suite + coverage >= 80%" mandate and the same files'
already-shipped consumer-mode Validation Gate trade (agent owns verification via
`.cache/final-validation.md` + the plan's `validation_command`). Self-host (npm) path is
unchanged — the four-chain receipt stays the gate. Prose-only: zero script/gate/behavior
change.

## Files Changed
- CHANGELOG.md
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

7 files, 66 insertions / 33 deletions vs `origin/main`. Zero `scripts/` files touched.

## Test Coverage
N/A — prose-only change to agent-facing instruction files; no code coverage applies.
Verification is the four cross-edition chains (below) plus the n3-review semantic
one-story review (verdict: pass, 0 blocking findings).

## Final Validation Evidence
Self-host (npm) repo — machine-gated on the four-chain receipt (not free-form attestation).
`node scripts/kaola-workflow-run-chains.js --project issue-614` — all four chains green
against HEAD `ed75806943ab18fd65622f44e9c07bf7fcef9cc2` (claude/codex/gitlab/gitea, all
exitCode 0, zero `accepted_red`). Receipt `headSha` matches current HEAD exactly.
Evidence: `.cache/final-validation.md`, `.cache/chain-receipt.json`.

Reuse boundary: this receipt was generated after all three write/review nodes (n1-prose,
n2-docs, n3-review) closed and merged to HEAD `ed758069` — covers the complete final
candidate state; nothing changed afterward that falls outside it.

## Documentation Docking
DOCKED. Evidence: `.cache/doc-docking.md`, `.cache/doc-updater.md`. No documentation edits
needed beyond the CHANGELOG entry (already authored by n2-docs, independently verified
accurate and non-duplicated) — `docs/api.md` already correctly documented the dual-mode
finalize gate, confirming this fix targets agent-facing prose only, not a doc gap.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | N/A — no validation failures occurred |

## Follow-Up Items
None. n3-review's one non-blocking note (n1-prose ran a redundant full four-chain `npm test`
inside its own leg, on top of the plan's single All-Done chain pass) is a makespan/token-cost
observation, not a product defect — no follow-up issue warranted.

## Run gaps
(sweep empty — `node scripts/kaola-workflow-gap-sweep.js --project issue-614 --check` returned
`result: pass`, `sweptClasses: []`; section omitted per template.)

## Closure Decision
None needed. No deferred items, unresolved conflicts, partial-implementation notes, or open
review follow-ups exist across any node's evidence. Issue #614's AC (six-surface edit,
zero-script-change, four-chain-green, CHANGELOG entry) are all satisfied in full — clean
close.

## Commit And Push
[pending final Git gate; final hash is reported after push and is not written back here]

## GitHub Issue
#614 — will close on merge (acceptance criteria pass, no follow-ups, Closure Decision Gate
found nothing to defer).

## Roadmap
Issue #614 was filed directly via `gh issue create` and never entered the roadmap mirror
(`kaola-workflow/.roadmap/` has no `issue-614.md` source) — no roadmap source to remove.
`ROADMAP.md` regeneration still runs once as part of Step 8b for consistency (no-op if #614
was never listed as an open item there).

## Archive
[pending — performed atomically by `cmdFinalize` in Step 8b]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|--------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no validation failures occurred |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
