# Finalization - Summary: issue-615

## Delivered
Fixed the plan-run scheduler bug where a mixed serial + lane-group run made the last-member
group close structurally unsatisfiable (`parent_dirty` vs `write_set_overflow`). A new
`parentCarriesProductionDirt` helper in `scripts/kaola-workflow-adaptive-node.js` gates
lane-group formation at both formation sites in `runOpenReady` — the normal co-open path and
the speculative-write path — degrading to a serial open (or excluding the speculative write)
whenever the parent worktree carries out-of-allowband production dirt from already-closed
serial siblings. No fence relaxation, no change to the "commits are finalize-owned" serial
contract. See `docs/decisions/D-615-01.md` for the full decision record.

## Files Changed
- `scripts/kaola-workflow-adaptive-node.js` (canonical fix)
- `scripts/test-adaptive-node.js` (RED→GREEN tests: `#615-MIXED-SERIAL-LANE-DEGRADE`, `T615-SPEC-DIRTY-DEGRADE`)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (regenerated, codex byte-twin)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (regenerated)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (regenerated)
- `CHANGELOG.md`, `docs/decisions/D-615-01.md` (new), `docs/architecture.md` (n5-docs)
- `docs/api.md` (finalize-stage docking fix — new `speculativeWriteExcluded.reason` enum value)

## Test Coverage
Hermetic RED→GREEN unit tests added for both formation sites (real git repos, real
`open-ready` subprocesses). `node scripts/test-adaptive-node.js`: 1413 assertions passed.
`node scripts/simulate-workflow-walkthrough.js`: passed.

## Final Validation Evidence
Self-host (npm) chain-receipt gate. `node scripts/kaola-workflow-run-chains.js --project issue-615`
run by the orchestrator against the final candidate state — all four chains green:
- `npm run test:kaola-workflow:claude` — exit 0
- `npm run test:kaola-workflow:codex` — exit 0
- `npm run test:kaola-workflow:gitlab` — exit 0
- `npm run test:kaola-workflow:gitea` — exit 0

Run TWICE: once after n6-finalize's all-done validation, and once more after the finalize-stage
`docs/api.md` docking fix (test-consumed prose) invalidated that first receipt
(`--finalize-check` returned `chains_stale`). The current `.cache/chain-receipt.json` is the
second run, confirmed fresh by `--finalize-check` (`result: pass`, `checkedChanges: 0`) against
the current worktree state, which includes the `docs/api.md` fix. Also independently re-run and
confirmed by the n4-verify adversarial-verifier pass (against the pre-docs-fix code, unaffected
by a docs-only change).

## Documentation Docking
DOCKED. Evidence: `.cache/doc-docking.md`. One gap found and fixed during docking
(`docs/api.md`'s `speculativeWriteExcluded.reason` enum was missing the new `'parent_dirty'`
value); all other document classes covered or explicitly no-impact.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- #616 — "plan-run: non-speculative serial-degrade over a dirty parent is silent (no reason
  field)" — filed from n3-review finding N2 (observability enhancement; deferred as out of
  the #615 bounded-repair scope).

## Run gaps
- in_run_repair (n3-review): noise: n3-review found a genuine blocking gap in n2-fix's first pass (the speculative-write formation site was left unguarded); n2-fix was repair-reopened with baseline reused, the gap was fixed with its own RED→GREEN test, and n3-review's re-review passed with 0 blocking findings, independently confirmed by n4-verify's adversarial pass. Fully resolved within this run — no residual defect to track.
- manual:n2-observability (the non-speculative serial-degrade path in runOpenReady does not surface a reason field distinguishing a parent_dirty degrade from an ordinary serial choice; n3-review finding N2, deferred during the issue-615 repair as out of bounded-repair scope): filed: #616
- manual:n4-stale-comment (inline comments near the issue-615 fix cite pre-edit line numbers for the last-member close fence; n3-review finding N4, deferred, cosmetic, no functional impact): noise: cosmetic only, zero functional impact; line-number references in this file are an established approximate convention that self-restales on every future edit.

## Closure Decision
None needed — no unresolved conflicts, partial implementation, or user-decision items. The
`decision: ask` recorded in the plan's Planning Evidence (declared write set touches
SHARED_INFRA) is audit metadata per project convention, not an approval gate.

## Commit And Push
pending final Git gate

## GitHub Issue
#615 — to be closed (acceptance criteria met: root cause confirmed, fixed at both formation
sites, RED→GREEN tested, code-reviewed with one repair round to full pass, adversarially
verified NOT-REFUTED, four-chain cross-edition green, documentation docked)

## Roadmap
updated: yes (via cmdFinalize archive step)

## Archive
pending (via cmdFinalize)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|--------------|
| doc-updater (plan node n5-docs) | invoked | .cache/n5-docs.md | |
| doc-updater (finalize docking fix) | invoked | docs/api.md diff (this response) | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failures occurred |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
