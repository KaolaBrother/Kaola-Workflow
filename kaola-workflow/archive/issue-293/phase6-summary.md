# Phase 6 - Summary: issue-293

## Delivered
Aligned the two AC#5 legality checks — `crossCheckStatus` (`kaola-workflow-parallel-batch.js`) and
the `runOrient` gate (`kaola-workflow-adaptive-node.js`) — on the single-`in_progress` +
non-matching-manifest case, closing the #291 finding F1 divergence. A single stale `in_progress`
row whose member is already sealed is now correctly treated as the legacy single-node path by both
sites (previously `crossCheckStatus` mis-flagged it `orphan_member_set_mismatch`). One-predicate
hoist (`ip.length <= 1` short-circuit above the manifest branch) in `crossCheckStatus` only;
`runOrient` production was already correct and is unchanged. Applied across all four editions with a
shared anti-drift fixture exercising both sites on the load-bearing manifest axis.

## Files Changed
- `scripts/kaola-workflow-parallel-batch.js` — `crossCheckStatus` hoist (base edition).
- `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` — byte-identical peer (#274 sync group).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js` — gitlab port mirror.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js` — gitea port mirror.
- `scripts/fixtures-orphan-legality.js` — NEW shared anti-drift fixture.
- `scripts/test-parallel-batch.js` — `crossCheckStatus` RED→GREEN assertion (fixture-driven).
- `scripts/test-adaptive-node.js` — `runOrient` characterization lock (same fixture).
- `CHANGELOG.md` — `[Unreleased] → Fixed` entry.

## Test Coverage
Hand-rolled assert suites (no coverage tool). `test-parallel-batch.js` 120 assertions,
`test-adaptive-node.js` 140 assertions; `crossCheckStatus` single-`in_progress` behavior is covered
RED→GREEN. Cross-edition parity verified: `crossCheckStatus` body SHA-identical across all four editions.

## Final Validation Evidence
`npm test` → **exit 0** (real exit code captured directly, not via a piped `| tail`) on the final
candidate state (all four lanes: claude, codex, gitlab, gitea; including `validate-script-sync.js`
byte-identity, both walkthroughs). Evidence: `.cache/final-validation.md`. Also: the four
script-enforced adaptive barrier gates all passed (resume-check=0, gate-verify=0, barrier-check=0,
verdict-check=0).

## Documentation Docking
DOCKED — `.cache/doc-docking.md`. `doc-updater` skipped (internal diagnostic alignment, no public
behavior/API/CLI/env/architecture-structure impact; CHANGELOG is the only doc surface, authored
inline). architecture.md / investigation doc remain accurate (they document `orient`'s unchanged
behavior, which the fix brings `crossCheckStatus` into conformance with).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- **R1 (non-blocking, LOW, out_of_scope/follow_up):** in `test-adaptive-node.js` the orient
  assertion shares only the manifest axis with the fixture (re-derives its `in_progress` ledger row
  inline). The `in_progress` axis is unshareable by construction (`crossCheckStatus` takes an array;
  `runOrient` parses a markdown ledger). Recorded in `.cache/code-review.md`, `.cache/advisor-closure.md`,
  and the CHANGELOG. NOT auto-filed (roadmap session owns issue creation); offered to the user.

## Closure Decision
Advisor consulted (`.cache/advisor-closure.md`). No blocking deferrals (`--verdict-check`
`unresolvedFixes: []`). #293 acceptance criteria pass → close #293. **User directive (post-finalize):**
the #293 adaptive branch merges normally; a tagged **release** is cut separately on `main` after the
sink (the version bump touches files outside the frozen plan's barrier allowlist), bundling the
accumulated `[Unreleased]` work. R1 will be **filed as a follow-up issue** per the same directive.

## Commit And Push
[pending final Git gate; final hash reported after push, not written back here]

## GitHub Issue
[pending — closed by sink-merge --issue 293]

## Roadmap
[pending — cmdFinalize closure + regen]

## Archive
[pending — cmdFinalize → kaola-workflow/archive/issue-293/]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | .cache/doc-docking.md | internal diagnostic alignment; no public behavior/API/CLI/env/architecture impact; CHANGELOG only |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | .cache/final-validation.md | no validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | contractor Step 7 + cmdFinalize Step 8b |
| archive completed folder | pending | | cmdFinalize Step 8b |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
