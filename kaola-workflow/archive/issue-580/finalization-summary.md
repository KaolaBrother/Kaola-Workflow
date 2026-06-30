# Finalization - Summary: issue-580

## Delivered
A machine-enforced cross-edition contract pinning the forge `active-folders` ports to parse the same SHARED engine `workflow-state.md` fields as canonical — closing the #579-class silent forge-port-miss class. Three parts:
1. A frozen, exported `SHARED_STATE_FIELDS` constant (13 shared engine fields) added to the byte-identical-×4 `kaola-workflow-adaptive-schema.js` drift anchor (single source of truth).
2. A root-only behavior parity gate `scripts/test-active-folders-field-parity.js` that, for each edition, calls the hermetic cross-edition-uniform entry `readActiveFolders(root, { excludeClosedIssues: false })` and asserts every shared field is surfaced, with non-vacuous sentinels distinct from each field's parser default.
3. The gate wired into all four `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains.
No `active-folders` port edits were needed (authoring audit confirmed all 13 fields already parse in every edition; #579 aligned the last three).

## Files Changed
- `scripts/kaola-workflow-adaptive-schema.js` (+ byte-identical mirrors: `plugins/kaola-workflow/scripts/`, `plugins/kaola-workflow-gitlab/scripts/`, `plugins/kaola-workflow-gitea/scripts/`) — `SHARED_STATE_FIELDS` constant + export
- `scripts/test-active-folders-field-parity.js` (NEW) — behavior parity gate (61 assertions)
- `package.json` — gate appended to all four chains
- `docs/decisions/D-580-01.md` (NEW) — ADR
- `docs/conventions.md` — cross-edition-discipline note
- `CHANGELOG.md` — `[Unreleased] ### Added` entry

## Test Coverage
New gate `test-active-folders-field-parity.js`: 61 assertions (1 length-guard + 4 editions × [1 fn-type + 1 folder-count + 13 field-checks]). RED-first verified (gate failed before the constant existed; green after). Non-vacuity behaviorally proven (deleting a shared field reds the gate; zero sentinel/default collisions across all 13 fields). No coverage % framework in this Node-script repo.

## Final Validation Evidence
- Command: `node kaola-workflow-run-chains.js --project issue-580` (KAOLA_RUN_CHAINS_CONCURRENCY=serial) — the single full-suite #307 four-chain pass.
- Result: ALL GREEN — claude=0, codex=0, gitlab=0, gitea=0 (`allGreen: true`).
- Receipt: `kaola-workflow/issue-580/.cache/chain-receipt.json` (headSha `286dc554`, codeTreeHash covers the worktree tree incl. the chain-asserted CHANGELOG — not stale).
- Adaptive barrier (whole-plan): resume=0 gate=0 barrier=0 verdict=0 (all pass).
- Reuse boundary: this four-chain run covers the full code/test/CHANGELOG impact at the current worktree tree. No files change after it except the contractor's mechanical finalize commit (inert workflow artifacts + archive move + roadmap), which is outside the codeTreeHash rerun trigger.

## Documentation Docking
DOCKED — `kaola-workflow/issue-580/.cache/doc-docking.md`. CHANGELOG + ADR (D-580-01) + conventions.md cover the change; README/api/architecture/.env have explicit no-impact reasons (internal contract test, no public API/CLI/env surface).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | No failures |

## Follow-Up Items
None. n3 opus code-reviewer passed 0-blocking; the single LOW (R1) resolved on inspection (ADR accurately describes presence-not-absence gate semantics — no idealization, no defect).

## Run gaps
(none — gap-sweep `sweptClasses: []`; no in-run repairs, halts, reopens, deferred/waived chains, or flakes this run.)

## Closure Decision
None needed. Closure scan found no deferred items, unresolved conflicts, partial implementation, or user-decision items. The one reviewer LOW was resolved, not deferred. Proceed to close #580.

## Commit And Push
Pending final Git gate (contractor `chore: finalize issue-580` commit, then `sink-merge --sink`). Final hash reported after push.

## GitHub Issue
#580 — to be closed by the merge sink after acceptance criteria pass (all met: SHARED_STATE_FIELDS exists + byte-identical ×4; behavior gate asserts every edition surfaces every key + runs in all four chains; RED-first + regression-fire proof; forge-specific fields not pinned; all four chains green).

## Roadmap
No `.roadmap/issue-580.md` source exists (issue filed after #579 close; never had a roadmap source). Closure unlink is a no-op; ROADMAP.md regen unchanged for #580 (`roadmap_source_removed: absent`).

## Archive
Pending — `cmdFinalize --keep-worktree` (contractor, Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1) | subagent-invoked | .cache/n1-shared-field-parity.md | |
| doc-updater (n2) | subagent-invoked | .cache/n2-docs.md | |
| code-reviewer (n3, opus gate) | subagent-invoked | .cache/n3-review.md (verdict: pass, findings_blocking: 0) | |
| finalize (n4) | main-session-direct | .cache/n4-finalize.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no validation failures |
| roadmap refresh | invoked | no source to remove (regen unchanged for #580) | |
| archive completed folder | pending | | cmdFinalize Step 8b |
| final commit and push | ready | git status / receipt / barrier all green | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
