# Finalization - Summary: issue-500 (build run)

## Delivered
The #500 BUILD run: WIRED all three parallel-write makespan levers the owner-approved safe way (the
shaping run produced the recommendation D-500-01; the owner approved 2026-06-16; D-500-02 records the
acceptance). This run CLOSES #500.
- **L1** (`write_overlap_policy` relaxation) — leg-COUPLED safe wire: `tryFormLaneGroup` forwards
  `--write-overlap-consent` only under `resolveLegIsolation(process.env) && opts.writeOverlapConsent`
  (couples formation to provisioning; closes the #283/#303 clobber window) + a NEW shared-infra-coarse
  end-to-end test (adversarially mutation-verified non-vacuous).
- **L2** (`KAOLA_LEG_ISOLATION`) — honesty wire: full activation recipe documented across the six #400
  plan-run surfaces; stale "DORMANT" comments reworded to ADR-0010 "containment, not construction".
- **L3** (`speculative_open_policy:consent`) — prose wire: new `docs/plan-run-cards/speculative-open.md`
  card + six markers + driver line; route-reachability T8/T9 pins.

## Files Changed
16 (committed at b6246528): scripts/kaola-workflow-adaptive-node.js + 3 forge ports,
scripts/test-adaptive-node.js, scripts/test-route-reachability.js, the 6 plan-run surfaces,
docs/plan-run-cards/{speculative-open.md (new),README.md}, docs/decisions/D-500-02.md (new), CHANGELOG.md.

## Test Coverage
4-chain cross-edition gate green (this is an edition-tree diff, #307).

## Final Validation Evidence
- Chain receipt `kaola-workflow/issue-500/.cache/chain-receipt.json` bound to HEAD b6246528, ALL FOUR
  chains green, NO waivers: claude exit 0 (596s), codex exit 0 (15s), gitlab exit 0 (173s), gitea exit 0 (174s).
- `plan-validator --finalize-check` → result: pass (chain-receipt mode, 16 changes attributed).
- Adaptive barrier (finalize prerequisite): resume-check / gate-verify / barrier-check / verdict-check all exit 0.
- n4 adversarial-verify (verdict: pass, mutation-proven coupling non-vacuous); n5 code-review (verdict: pass,
  edition-sync --check parity, forge-neutral, 1007 + 122 assertions, walkthrough green).

## Documentation Docking
DOCKED — D-500-02 acceptance record + CHANGELOG entry + the L3 card + the 6-surface recipe prose.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- #513 — planner rubric to author speculative-open-eligible topologies (L3's proactive win; out of #500 scope).
- #514 — two LOW cosmetic comment nits from n5 review (stale "until Slice 3" fragment; T9 header typo).

## Run gaps
- manual:l3-planner-rubric (L3's proactive makespan win needs a planner shaping rubric, out of #500 scope): filed: #513
- manual:review-low-nits (two LOW non-blocking cosmetic comment findings from n5-review): filed: #514

## Closure Decision
Normal close — the build delivers the #500 end-state (every lever reachable on the live path). #500 is
CLOSED by this run (sink-merge probe-before-close). No keep-open.

## Commit And Push
[pending final Git gate — merge sink to main + close #500]

## GitHub Issue
to be CLOSED by sink-merge.

## Roadmap
No `.roadmap/issue-500.md` source committed (build branch cut from d45fe15e); ROADMAP.md unaffected.

## Archive
pending (cmdFinalize → kaola-workflow/archive/issue-500/).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked (n6) | docs/decisions/D-500-02.md | |
| documentation docking | invoked | D-500-02 + CHANGELOG + L3 card + recipe prose | |
| final-validation fix executors | N/A | | no failing validation |
| roadmap refresh | N/A | no roadmap source | |
| archive completed folder | pending | | |
| final commit and push | ready | git status / receipt / 4 chains green | merge sink + close #500 |

## Status
ARCHIVED AFTER FINAL GIT GATE
