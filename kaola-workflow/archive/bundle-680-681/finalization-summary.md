# Finalization - Summary: bundle-680-681

Explicit user-directed bundle: #680, #681 (all-or-nothing closure, one merge sink) — the last two open residuals before a release cut.

## Delivered

Two disjoint-file fixes (parallel-safe antichain, octopus-merged), one of which required an in-run adversarial repair:

- **#680** — the `open-ready` lane-group baseline crash-window family. Part A: `runOpenReady`'s two Phase-2 aborts (`baseline_failed`, `node_not_in_ledger`) now drop the group + member baselines (helpers hoisted to `runOpenReady` scope); the wrong "--drop-base illegal in Phase-2" rationale corrected. Part B: an additive orphan-baseline sweep in `runReconcileRunningSet` (hoisted above the `!running` early-return) that drops only `barrier-base-*` with no live owner. **In-run repair:** the first adversarial change-gate REFUTED Part B — the group baseline had a single keep-source (`running.lane_group.group_id`), so a torn Phase-3 running-set (null after the ledger flipped members to in_progress) dropped the LIVE group baseline. Repaired via `reopen-node`: the sweep now KEEPS any `barrier-base-lg-*` when the running-set is torn/absent AND ≥1 in_progress row exists (its `lg-<...>` id is unrecoverable, so deadness is unprovable — fail-safe under-reap), reaping it only when authoritatively dead. Re-review PASS + re-adversary NOT-REFUTED.
- **#681** — dropped the `&& fs.existsSync(outputPath)` precondition from `gap-sweep`'s `foreign_run_gaps_output` guard, so a scan never writes a `run-gaps.json` outside its own `.cache/` even to a non-existent foreign target; in-project `--output` unaffected.

## Files Changed

8 script editions (adaptive-node.js ×4 + gap-sweep.js ×4), 2 test files, 2 evidence files, CHANGELOG.md.
- `scripts/kaola-workflow-adaptive-node.js` (+ 3 editions), `scripts/test-adaptive-node.js`
- `scripts/kaola-workflow-gap-sweep.js` (+ 3 editions), `scripts/test-gap-sweep.js`
- `CHANGELOG.md` (#680/#681 entries)

## Test Coverage

test-adaptive-node 1843 assertions; test-gap-sweep 85 assertions; `simulate-workflow-walkthrough.js` exit 0. RED-first each leg; the #680-B-repair test reproduces the adversary's live-group-drop (fails pre-repair, passes post-repair). `edition-sync --check` + `validate-script-sync` clean across all four editions. Four-chain receipt stamped at finalize.

## Final Validation Evidence

Self-host (npm) four-chain chain-receipt gate: `kaola-workflow-run-chains.js --project bundle-680-681` stamps `.cache/chain-receipt.json` at the finalize HEAD (all four chains exit 0); the four adaptive barrier gates (`--resume-check`, `--gate-verify`, `--barrier-check`, `--verdict-check`) all exit 0. `sink-merge --sink` re-runs `npm test` before the ff-merge.

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. CHANGELOG updated inline; no README / `docs/api.md` / architecture / `.env.example` impact (internal crash-recovery correctness + a fail-closed guard tightening; the orphan-baseline sweep extends the already-documented `reconcile-running-set` crash-repair contract).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

None filed. The one adversary-noted residual — a torn-null running-set with an UNRELATED in_progress node leaves a dead `lg-*` orphan un-reaped — is the DELIBERATE fail-safe under-reap (never a live drop; self-heals on the next zero-in_progress reconcile), not a defect.

## Run gaps

- in_run_repair (n1-node-680): noise: writer reopened once via reopen-node to repair the adversary R1 live-group-baseline-drop refutation; fix re-verified in-run (n3 re-review PASS, n4 re-adversary NOT-REFUTED)
- in_run_repair (n3-review): noise: gate folded to pending by the reopen-node repair and re-run; second run PASS with 0 blocking findings
- in_run_repair (n4-adversary): noise: gate folded to pending by the reopen-node repair and re-run; second run NOT-REFUTED (high confidence)

## Closure Decision

No deferred item requires user approval before closing #680/#681. The R1 refutation was repaired + re-verified in-run (not deferred); the single residual is a deliberate fail-safe (noise). Cleared to close both bundle members.

## Commit And Push

[pending final Git gate; final hash reported after push]

## GitHub Issue

#680, #681 — to be closed by the merge sink (all-or-nothing).

## Roadmap

Updated at closure — `.roadmap/issue-680.md`, `.roadmap/issue-681.md` removed and `ROADMAP.md` regenerated once by `cmdFinalize`.

## Archive

Pending — `cmdFinalize` archives `kaola-workflow/bundle-680-681/` atomically at Step 8b.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | CHANGELOG updated inline; `.cache/doc-docking.md` | no public behavior/API/setup/architecture/env change — internal crash-recovery correctness + guard tightening only |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
