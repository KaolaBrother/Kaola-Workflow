# Finalization - Summary: bundle-677-678-679

Explicit user-directed bundle: #677, #678, #679 (all-or-nothing closure, one merge sink).

## Delivered

Three disjoint-file, low-severity residual fixes discovered by the post-#672/#674/#675 campaign, decomposed as a parallel-safe write antichain (three isolated legs, mechanical octopus merge — no synthesizer):

- **#677** — `worktreeDirtyState` (`kaola-workflow-claim.js`) fail-closes an `existsSync` stat failure: the bare `fs.existsSync(wtPath)` gate returned false for a genuinely-present worktree under a `chmod 000` parent (EACCES), misrouting it to `'missing'` → destructive prune. Now `fs.lstatSync` in try/catch: only `ENOENT` → `'missing'`; any other stat error → the existing `'unprobeable'` keep state. Plus the #672 A1 coverage gap: a mirrored `cmdStaleWorktreeCleanup` unprobeable-keep regression + a root-guarded parent-unreadable RED.
- **#678** — `open-ready`'s Phase-1 group-form aborts now also drop the shared GROUP baseline (`barrier-base-lg-*` file + ref) via a guarded `dropGroupBaseline()` at all 5 aborts — the symmetric half of #674's per-member drop. R2 (Phase-2 non-drop + pre-journal SIGKILL strand) deferred → #680.
- **#679** — `gap-sweep`'s `runScan` refuses `foreign_run_gaps_output` when an explicit `--output` at a `run-gaps.json` outside the scanned project's own `.cache/` would overwrite an existing (foreign/archived) artifact — closing the #675 residual where a live project dir + same-named archive let an explicit `--output` clobber archived gap evidence. Belt-and-suspenders residual (non-existent foreign target) deferred → #681.

## Files Changed

12 script editions (canonical + codex twin + gitlab + gitea for each of claim / adaptive-node / gap-sweep), 3 test files, 3 per-node evidence files:

- `scripts/kaola-workflow-claim.js` (+ 3 editions), `scripts/test-claim-hardening.js`
- `scripts/kaola-workflow-adaptive-node.js` (+ 3 editions), `scripts/test-adaptive-node.js`
- `scripts/kaola-workflow-gap-sweep.js` (+ 3 editions), `scripts/test-gap-sweep.js`
- `CHANGELOG.md` (#677/#678/#679 entries)

## Test Coverage

Per-suite: claim-hardening 185 assertions, adaptive-node 1820, gap-sweep 79; `simulate-workflow-walkthrough.js` exit 0. Each leg RED-first (three genuine reproductions, re-verified by the adversary via revert-to-`main`). `edition-sync.js --check` + `validate-script-sync.js` clean across all four editions. Authoritative four-chain receipt stamped at finalize (below).

## Final Validation Evidence

Self-host (npm) repo → four-chain chain-receipt gate. `kaola-workflow-run-chains.js --project bundle-677-678-679` stamped `.cache/chain-receipt.json` at the finalize candidate HEAD (all four `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains exit 0); the four adaptive barrier gates (`--resume-check`, `--gate-verify`, `--barrier-check`, `--verdict-check`) all exit 0. `sink-merge --sink` re-runs `npm test` (four-chain) before the ff-merge.

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. CHANGELOG updated inline; no README / `docs/api.md` / architecture / `.env.example` impact (internal fail-close + guard hardening; the new `foreign_run_gaps_output` typed refusal follows the same not-enumerated-at-api-level convention as the #675 `project_archived` sibling; `'unprobeable'` is #672's already-shipped state; the group-baseline abort-drop is an internal correctness detail).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

- **#680** — open-ready baseline crash-window family: Phase-2 aborts (`baseline_failed`, `node_not_in_ledger`) drop neither the group nor member baselines, and the "--drop-base illegal in Phase-2" rationale is factually wrong (ledger written after the Phase-2 loop); plus the pre-journal SIGKILL strand. Crash/race-window-only, pre-existing, non-regressive (M-effort journal-ordering + orphan-baseline reconcile sweep).
- **#681** — gap-sweep `foreign_run_gaps_output` guard skips a non-existent foreign `run-gaps.json` target (`&& fs.existsSync` precondition); harmless (no machine consumer) belt-and-suspenders (S).

## Run gaps

- manual:crash-window (#678 R2 SIGKILL pre-journal strand plus Phase-2 group and member baseline non-drop deferred to a journal-ordering redesign): filed: #680
- manual:foreign-output (#679 existsSync-gated stray write into a non-existent foreign run-gaps.json target): filed: #681
- manual:symlink-resolve (#679 lexical path.resolve vs realpathSync proven safe over-refusal only): noise: lexical resolve equality implies the same normalized target, so a symlink can only cause a safe over-refusal, never a clobber of real evidence

## Closure Decision

The two follow-ups (#680, #681) are already FILED (not user-decision items — they are characterized, out-of-scope residuals, low severity). No deferred item requires user approval before closing #677/#678/#679. The symlink edge is proven non-exploitable (noise). Cleared to close all three bundle members.

## Commit And Push

[pending final Git gate; final hash reported after push]

## GitHub Issue

#677, #678, #679 — to be closed by the merge sink (all-or-nothing).

## Roadmap

Updated at closure — `.roadmap/issue-677.md`, `.roadmap/issue-678.md`, `.roadmap/issue-679.md` removed and `ROADMAP.md` regenerated once by `cmdFinalize`.

## Archive

Pending — `cmdFinalize` archives `kaola-workflow/bundle-677-678-679/` atomically at Step 8b.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | CHANGELOG updated inline; `.cache/doc-docking.md` | no public behavior/API/setup/architecture/env change — internal fail-close + guard hardening only |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: missing
finalize_contractor_attested: attested
ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log — claim/author seam may have been run inline by main session
