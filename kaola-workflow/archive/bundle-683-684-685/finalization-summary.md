# Finalization - Summary: bundle-683-684-685

## Delivered
The #682 review/repair journal hardened on three axes: #683 removes the simultaneous-failed-gates repair
dead-end via an append-only candidate re-bind transaction (synthetic-base re-anchor, P0–P5 admissibility,
fail-closed partition proof); #684 restores mutation-killing coverage for six #682 fail-closed paths plus the
#664 collective fold; #685 adds the parent-directory fsync to the atomic-replace helper. The #683 rebind
mechanism was adversarially refuted five times (examination set, mode+sha, __proto__ keyspace, integer-key
fail-closed, and the temporal-attribution hole) and each hole was reproduced and fixed RED-first.

## Files Changed
- scripts/kaola-workflow-adaptive-node.js (+ 3 edition ports) — rebind mechanism + P3b temporal fix
- scripts/kaola-workflow-adaptive-schema.js (+ 3 ports, byte-identical anchor) — journal schema + fsync
- scripts/kaola-workflow-roadmap.js (+ 2 forge ports) — parent-dir fsync sibling
- scripts/test-adaptive-node.js, scripts/test-claim-hardening.js, scripts/simulate-workflow-walkthrough.js
- scripts/validate-workflow-contracts.js + the 3 edition contract validators — new refusal-taxonomy needles
- docs/decisions/D-683-01.md (new), docs/api.md, CHANGELOG.md
- kaola-workflow/.roadmap/issue-688.md, issue-689.md (new follow-up sources)

## Test Coverage
adaptive-node test suite 2156 assertions, 0 failures; walkthrough passed. All four
test:kaola-workflow:{claude,codex,gitlab,gitea} chains green (run sequentially, chain-receipt.json).

## Final Validation Evidence
Self-host four-chain receipt: kaola-workflow/bundle-683-684-685/.cache/chain-receipt.json (all chains exit 0).
Plan-validator finalize gates: --resume-check=0, --gate-verify=0, --verdict-check=0, --barrier-check=0
(scoped to the project's own diff via KAOLA_FINALIZE_BASE, the base commit — the branch carries a prior
reviewed base commit plus this run's R7/R8 fix commit). --finalize-check=pass.

## Documentation Docking
DOCKED — D-683-01 records the decision + the five-hole soundness campaign; api.md reflects the #685 fsync;
CHANGELOG carries #683/#684/#685 under [Unreleased]. No further public-surface impact.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- #688 — fail-closed hardening of the rebind-proof keyspace + ledger-status predicate (R5/R6/N2R1/N3R1;
  all provably unreachable today, defense-in-depth).
- #689 — fast/full/phase4-advance writeFileAtomic missing parent-dir fsync (same gap as #685, opt-in paths).

## Run gaps
(sweep empty for this run — the re-plan had no in-run repairs; the substantive first-run findings are either
resolved here (R7/R8) or filed above (R5/R6/fast-advance))

## Closure Decision
No open user-decision items. The one value decision (how to recover from the first run's mechanically-wedged
plan) was routed to the user and resolved: keep the bundle whole, re-plan the adversarial stage as a
single-writer repairable gate, preserve the reviewed base as a commit. Follow-ups filed as #688/#689.

## Commit And Push
Two-commit branch workflow/bundle-683-684-685 (base feat + R7/R8 fix); finalize bookkeeping commit pending.

## GitHub Issue
Closing #683, #684, #685 (all-or-nothing bundle) at sink.

## Roadmap
Regenerated at closure (683/684/685 sources removed; 686/687/688/689 retained).

## Archive
Pending cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n4-docs.md | |
| documentation docking | invoked | this summary + D-683-01 | |
| final-validation fix executors | invoked | .cache/n1-fix.md (R7/R8 fix) | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | git status/log | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session
