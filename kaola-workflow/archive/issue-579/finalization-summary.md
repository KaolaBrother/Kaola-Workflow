# Finalization - Summary: issue-579

## Delivered
Hardened concurrent same-repo Kaola-Workflow sessions (issue #579) — engine-level, all editions. Three moves + a four-bucket lane classifier in the shared SUPPORT_SCRIPTS:
- **Move 1 — co-tenant clean-check**: the clean-worktree gate (claim-time `treeDirty`, sink-merge `assertCleanWorktree`/`assertWorktreeClean`) disregards non-owned `kaola-workflow/*` and `.kw/*` lane scratch but stays strict on real uncommitted code; own `<project>` folders + shared durable state stay strict; fail-closed posture preserved.
- **Move 2 — single main-root authority**: collapsed the triplicated `getCoordRoot`/`mainRootFromCoord` resolver into one shared helper (`resolveMainRoot`) in `kaola-workflow-adaptive-schema.js`; claim records `main_root` in `workflow-state.md`; executor reads it back before re-deriving (eliminates the authority-split from a linked/detached worktree; `getMainRoot` fallback for legacy state).
- **Move 3 — merge protocol unchanged**: `ffMergeLoop` byte-identical; true conflict still halts-and-asks; a lane cleans up its own branch/worktree/folder only after its own merge lands.
- **Lane classifier**: `classifyLane` (mine/live/stale/ambiguous) + per-lane precedence ladder (explicit-resume > co-tenant signal > liveness > ask); minimal liveness seatbelt (`session_marker` + `claim_ts` stamped claim-time only; single `LANE_STALENESS_MS = 86400000` / 24h); surfaced by `active-folders.js` across all four editions; consumed in `cmdStatus` (`lane_bucket`) + `cmdResume` (own-lane auto-select). Forge-neutral co-tenant guidance added to `issue-scout` + adapt/finalize prose.

## Files Changed
- Engine (canonical + codex twin + 2 forge ports each): `kaola-workflow-adaptive-schema.js`, `kaola-workflow-active-folders.js`, `kaola-workflow-classifier.js`, `kaola-workflow-claim.js`, `kaola-workflow-sink-merge.js`, `kaola-workflow-adaptive-node.js`.
- Tests: `scripts/test-claim-hardening.js`, `scripts/test-adaptive-node.js`, `scripts/simulate-workflow-walkthrough.js` (+ two-lane sim), 4 forge/codex walkthroughs, `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-workflow-scripts.js` (+ forge active-folders session-marker integration assertions).
- Prose (forge-neutral, provenance-free): `agents/issue-scout.md` + 3 `issue-scout.toml`; adapt + finalize command/skill surfaces across editions (16 files).
- Docs: `docs/workflow-state-contract.md`, `docs/conventions.md`, `docs/architecture.md`, `docs/decisions/D-579-01.md`, `CHANGELOG.md`.

## Test Coverage
Hand-rolled assertion suites (no coverage % framework). Canonical: test-claim-hardening 149 assertions, test-adaptive-node 1072 assertions, simulate-workflow-walkthrough incl. testTwoLanesInOneCheckout579. Forge: gitlab/gitea workflow-scripts suites incl. new testGitlab/GiteaActiveFoldersSessionMarker579.

## Final Validation Evidence
Four-chain mechanical acceptance (#307), serial concurrency (required on this host), run by the n6 code-reviewer gate AND re-run for the finalize chain-receipt: all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` green sequentially. Receipt: `.cache/chain-receipt.json`. Validation reuse covers code/test impact through the n6 gate; the finalize-node CHANGELOG edit is chain-asserted and was written BEFORE the receipt chains ran (receipt reflects the CHANGELOG'd tree).

## Documentation Docking
DOCKED — see `.cache/doc-docking.md`. All public behavior (new `workflow-state.md` fields, lane classifier, clean-check selectivity, single main-root authority) reflected in `docs/workflow-state-contract.md` (contract-parsed), `docs/conventions.md`, `docs/architecture.md`, `docs/decisions/D-579-01.md`, and `CHANGELOG.md`.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None deferred. Two implementation defects were caught by the accuracy gates and FULLY repaired + re-verified in-run (no residual): (1) the canonical own-session classify path was initially fed the wrong `ctx` shape; (2) the gitlab/gitea `active-folders` ports initially did not parse the new liveness fields back. Both are now covered by end-to-end integration assertions in the canonical + forge suites so neither can silently recur.

## Run gaps
- in_run_repair (n2-engine): noise: gate-caught implementation defects (R1 canonical ctx-shape + forge active-folders parse-back), both repaired and re-verified before merge via reopen-node; no residual product defect, recurrence guarded by new end-to-end integration assertions.
- in_run_repair (n5-refute): noise: the change-gate (adversarial-verifier) was correctly re-run after each repair to re-verify the corrected tree; final verdict pass, findings_blocking 0 — this is the gate loop working as designed, not an escaping defect.
- in_run_repair (n6-review): noise: the review gate (code-reviewer + four-chain) was correctly re-run after each repair; final verdict pass, findings_blocking 0, all four chains green — the gate loop working as designed, not an escaping defect.

## Closure Decision
No deferred items, conflicts, or partial work. Both run-discovered defects resolved in-run. No user-decision items. (Optional hardening idea surfaced to the user separately: a sync contract over forge active-folders state-field parity — already mitigated by the new integration assertions, not blocking.)

## Commit And Push
Pending final Git gate (impl commit by orchestrator → contractor chore commit → sink-merge --sink worktree→main).

## GitHub Issue
#579 — to be closed by the sink (acceptance criteria met).

## Roadmap
No `.roadmap/issue-579.md` source exists (issue filed post-#578-close, never had a roadmap source) → closure unlink is a no-op; ROADMAP regen unchanged for #579.

## Archive
Pending — cmdFinalize archives `kaola-workflow/issue-579/` → `kaola-workflow/archive/issue-579/`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n4-docs.md | n4-docs node |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | invoked | .cache/n2-engine.md (R1 + forge repairs) | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | no #579 source (no-op) |
| archive completed folder | pending | | |
| final commit and push | ready | git status/diff/upstream | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
