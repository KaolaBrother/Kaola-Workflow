# Finalization - Summary: issue-435

## Delivered
Run-gap capture gate at finalize: a new `kaola-workflow-gap-sweep.js` scanner (`--json`) + `--check` verify-mode gate. The scanner sweeps run-discovered defects from the project's own `.cache` (provenance reopens → `in_run_repair`, chain-receipt `accepted_red` → `deferred_red_chain`, optional `run-gaps-manual.md` → `manual:<slug>`), deduped by `(reasonClass, sample)`. The `--check` gate refuses `gaps_unswept` until `finalization-summary.md`'s `## Run gaps` section maps each swept class to `filed: #N` or `noise: <justification>`. Wired at finalize via contractor Step 8c.2 + the 6 finalize prose surfaces (NO cmdFinalize/claim.js edit — mirrors the #432 chain-receipt gate). The goal follow-up-filing rule is documented on the 6 router surfaces.

## Files Changed
scripts/kaola-workflow-gap-sweep.js (new) + scripts/test-gap-sweep.js (new); plugins/kaola-workflow{,-gitlab,-gitea}/scripts/kaola{,-gitlab,-gitea}-workflow-gap-sweep.js (codex byte-mirror + 2 forge ports); scripts/validate-script-sync.js + both kaola-workflow-install-manifest.js byte-copies + package.json (registration); plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-*-contracts.js (forge validator lists); 6 finalize surfaces (commands/kaola-workflow-finalize.md ×3 + skills/kaola-workflow-finalize/SKILL.md ×3); 6 router surfaces (commands/workflow-next.md ×3 + skills/kaola-workflow-next/SKILL.md ×3); agents/contractor.md + 3 contractor.toml; docs/decisions/D-435-01.md (new) + docs/conventions.md + docs/architecture.md + CHANGELOG.md.

## Test Coverage
scripts/test-gap-sweep.js: 38 assertions (8 cases), all green, TMPDIR-isolated. Covers scan dedup, the refuse→map→pass AC, noise mapping, and vacuous empty-sweep pass.

## Final Validation Evidence
Adaptive barrier (resume/gate/barrier/verdict) all exit 0; four-chain cross-edition gate (#307) all green (claude/codex/gitlab/gitea exit 0). Evidence: .cache/final-validation.md.

## Documentation Docking
DOCKED — .cache/doc-docking.md.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| test-install-manifest-single-source.js (G1 R1) | regression (test-fragility) | n4 reopen (manifest reorder) | .cache/n9-review.md | resolved |

## Run gaps
- in_run_repair (n4-registration): filed: #450
- in_run_repair (n8-contractor-prose): noise: benign idempotent `open-next --node-id` re-open to retrieve the rotated nonce after the fused advance — not a defect
- in_run_repair (n9-review): noise: the post-dominating gate was folded+reopened by the n4 R1 `reopen-node` repair cycle — a mechanical consequence of the repair, not a separate defect

## Follow-Up Items
- #450 (filed) — `test-install-manifest-single-source.js` plant anchor assumes run-chains is the last SUPPORT_SCRIPTS entry; the G1 R1 regression. The in-run workaround (reorder so run-chains stays last) is fragile; the plant test should be made position-robust.

## Closure Decision
No deferred items requiring user decision. The one real run-discovered defect (R1, the plant-test fragility) was filed as #450 and mapped in `## Run gaps`; the other two swept classes are benign re-opens justified as noise. Issue #435 acceptance criteria met → close.

## In-run Repair Record
G1 review (n9) found one in-scope blocker R1 (the #407 plant test went red when gap-sweep was appended after run-chains in SUPPORT_SCRIPTS). Fixed via reopen-node n4 (reorder so run-chains stays last, keeping the plant anchor valid) → n9 re-review verdict pass. SUPPORT_SCRIPTS is set-membership only, so the reorder is safe.

## GitHub Issue
#435 — to be closed by sink-merge after merge.

## Roadmap
Updated by cmdFinalize (removes .roadmap/issue-435.md, regenerates ROADMAP.md).

## Archive
kaola-workflow/archive/issue-435/ (by cmdFinalize).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1) | invoked | .cache/n1-design.md | |
| tdd-guide (n2) | invoked | .cache/n2-script.md | |
| implementer (n3-n8) | invoked | .cache/n{3,4,5,6,7,8}-*.md | |
| code-reviewer (n9, G1) | invoked | .cache/n9-review.md | |
| doc-updater (n10) | invoked | .cache/n10-docs.md | |
| run-gap sweep (dogfood) | invoked | .cache/run-gaps.json + this ## Run gaps section | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/diff | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
