# Finalization - Summary: issue-500

## Delivered
Case-B (#486) read-only shaping run for #500 ("a decision, not a build"): produced per-lever
wire-or-relabel decision inputs for the three inert parallel-write makespan levers (L1
write_overlap_policy relaxation, L2 KAOLA_LEG_ISOLATION, L3 speculative_open_policy:consent),
surfaced for owner approval. Wires/relabels NOTHING — the build run implements the approved
direction. **#500 stays OPEN (keep-open checkpoint).**

## Files Changed
- docs/investigations/2026-06-16-500-makespan-levers-decision.md (new — findings)
- docs/decisions/D-500-01.md (new — recommendation, Status: Proposed / PENDING APPROVAL)
- CHANGELOG.md ([Unreleased] ### Changed — docs-only, no behavior change)

## Test Coverage
N/A for behavior (no code/schema/prose-behavior change). Verified the docs-only diff breaks no
contract.

## Final Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 ("Workflow walkthrough simulation passed").
- `npm run test:kaola-workflow:claude` → **exit 0, zero test failures** (full claude chain GREEN),
  confirmed THREE times standalone (the last timed run: `RAW_EXIT=0 RAW_ELAPSED=574s`).
- Chain receipt: `kaola-workflow/issue-500/.cache/chain-receipt.json`, bound to HEAD.
  **Waiver (`--accept-known-red claude:512`, `accepted_red:true`):** the chain is green standalone,
  but its ~574s runtime is within ~26s of `run-chains.js`'s hardcoded 600s `spawnSync` capture
  timeout, so run-chains records it red (a CAPTURE-timeout artifact, not a test failure). The waiver
  carries the standalone-green evidence above and cites the filed tooling issue #512. NOT a real red.
- Scope note (no silent cap): this is a **docs-only, non-edition diff** (CHANGELOG + 2 new docs;
  zero `scripts/`, `plugins/`, or edition-tree changes), so the #307 cross-edition four-chain gate
  does NOT apply — the claude chain is sufficient evidence. codex/gitlab/gitea ports untouched.
- Adaptive barrier (finalize prerequisite): resume-check / gate-verify / barrier-check /
  verdict-check all exit 0.

## Documentation Docking
DOCKED — the deliverable IS documentation (investigation + decision record + CHANGELOG).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- The **build run** implementing the approved levers (L1 guarded-wire-or-relabel, L2 wire, L3
  wire-prose) — tracked by #500 staying OPEN (the umbrella the build run closes).
- Optional separate planner-rubric follow-up for L3's proactive speculative-open win.

## Run gaps
- manual:verdict-check-vs-486-adversarial-verifier (n4 emitted verdict:refuted, the correct #486
  investigation outcome, but adversarial-verifier ∈ GATE_VERDICT_ROLES so --verdict-check blocked
  the run until the gate-verdict was reframed to the deliverable-soundness axis): filed: #509
- deferred_red_chain (claude:512): filed: #512
- manual:run-chains-600s-timeout (claude chain ~574s standalone exit 0, but run-chains' hardcoded
  600s spawnSync timeout records it red at finalize; waived via --accept-known-red claude:512 with
  standalone-green evidence): filed: #512

## Closure Decision
Keep-open (partial-close terminal). This is a Case-B shaping run; the value call (per-lever
WIRE/RELABEL) is surfaced for the owner and implemented by a separate build run. `issue_action:
comment_keep_open` set in the `## Sink` block. No unapproved roadmap/issue reorganization performed.

## Commit And Push
[pending final Git gate — keep-open merge sink; final hash reported after push]

## GitHub Issue
open (keep-open) — substantive partial-close comment posted by main session; mechanical keep-open
comment posted by sink-merge. NOT closed.

## Roadmap
No change — #500 has no `.roadmap/issue-500.md` source (was never mirrored locally); ROADMAP.md
unaffected.

## Archive
pending (cmdFinalize --keep-issue-open → kaola-workflow/archive/issue-500/)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | deliverable is docs authored by the finalize node | docs-only investigation; no separate doc-impact |
| documentation docking | invoked (main-session-direct) | the 3 docs + CHANGELOG | |
| final-validation fix executors | N/A | | no failing validation |
| roadmap refresh | N/A | no roadmap source for #500 | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | keep-open merge sink |

## Status
ARCHIVED AFTER FINAL GIT GATE
