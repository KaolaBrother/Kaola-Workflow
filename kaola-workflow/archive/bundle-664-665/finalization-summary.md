# Finalization - Summary: bundle-664-665

## Delivered
Bundle of two diagnosed post-audit bug fixes (all-or-nothing closure of #664 + #665).
- #664: adaptive `repair-node` now collectively folds a COMPLETED adversarial-verifier fan-out group after a downstream writer repair (mirroring reopen-node) — resets member rows, purges group receipts — so stale round-1 votes can no longer satisfy `--verdict-check`. Mid-vote `would_orphan_in_progress` preserved; legacy role-prefix purged via CLI dispatch (readdir wired); per-receipt-name dedupe handles two same-label groups.
- #665: the #660 fence-transition semantics (family + run-length + empty-suffix + `^\s{0,3}` indent anchor) extended to the two residual consumers — `schema.locateSection` (closer semantics) and `release.unreleasedSection` (fence-aware `[Unreleased]` termination), each implemented locally (no classifier import).

## Files Changed
- scripts/kaola-workflow-adaptive-node.js (+3 editions) — #664 fold + 4c purge + readdir dispatch + per-name dedupe
- scripts/kaola-workflow-adaptive-schema.js (+3 byte-identical copies) — #665 locateSection closer semantics
- scripts/kaola-workflow-release.js (+3 editions: codex byte + gitlab/gitea rename-normalized) — #665 unreleasedSection fence-aware termination + `^\s{0,3}` anchor
- scripts/test-adaptive-node.js — #664 collective-fold + repair (R1/R2) regressions + #665 T6c decoy E2E
- scripts/test-release.js — #665 fenced-Unreleased + indented-fence (A1) both-direction assertions
- CHANGELOG.md — [Unreleased] entries for #664 and #665

## Test Coverage
Not coverage-gated. test-adaptive-node.js 1767 assertions; test-release.js 244; simulate-workflow-walkthrough.js exit 0. Four-chain gate below.

## Final Validation Evidence
- Adaptive barrier prerequisite: `--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check` all exit 0 (whole-plan barrier confirms the in-run R1/R2/A1 fixes are within the plan's total write set).
- Four npm chains (cross-edition): recorded via run-chains.js receipt before the sink.
- Parity: `validate-script-sync.js` + `edition-sync.js --check` clean.

## Documentation Docking
Both fixes complete already-shipped decisions (#658 collective fold / #660 fence-aware scanner) — no new public interface/API/env/architecture. CHANGELOG [Unreleased] entries added; no docs/ or ADR update. Docking: DOCKED.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- #670 (filed this run) — locateSection ln.trim() indent divergence (A2/R3).
- #671 (filed this run) — task-mirror EISDIR fail-open raw stack trace (R4).
- A3 (legacy-purge fs-seam) and R5 (cosmetic test label) — noise, see Run gaps.

## Run gaps
- in_run_repair (n3-review): noise: n3 code-review found R1 repair-node CLI dispatch omitted readdir + R2 label-only purge dedupe; both fixed in-run mirroring reopen-node and re-reviewed clean; no residual
- in_run_repair (n4-adversary): noise: n4 adversary refuted on A1 unreleasedSection fence used ln.trim not the 0-3-space anchor; fixed in-run and re-verified NOT-REFUTED with a 17-case matrix plus 5000-doc fuzz; no residual
- manual:locate-section-indent (R3/A2 locateSection ln.trim indent divergence vs classifier 0-3-space anchor; indented-fence decoy risk; pre-existing post-#665 residual; filed #670): filed: #670
- manual:task-mirror-eisdir (R4 task-mirror refreshTaskMirror EISDIR fail-open prints a raw stack trace on a workflow-tasks.json dir collision; pre-existing; filed #671): filed: #671
- manual:legacy-purge-fs-seam (A3 legacy-purge fs-seam caller-sensitivity; no reachable production caller omits readdir after the R1 dispatch fix; harness-only seam): noise: no reachable production caller; both dispatch sites pass readdir after R1
- manual:cosmetic-test-label (R5 cosmetic 665-labelled tests covering the 664 repair fix; non-blocking bookkeeping nit): noise: cosmetic label only; issue-refs-in-scripts are permitted

## Closure Decision
Both #664 and #665 acceptance criteria pass; two in-run adversarial repair loops (R1/R2, A1) resolved and re-verified before finalize; residual follow-ups filed (#670, #671) or justified as noise. No user-decision items within the bundle's scope. Bundle safe to close all-or-nothing.

## Commit And Push
[pending final Git gate; final hashes reported after push]

## GitHub Issue
#664 + #665 — to be closed by sink-merge (all-or-nothing) after merge to main.

## Roadmap
Updated: issue-664.md + issue-665.md removed at closure; issue-670.md + issue-671.md added (follow-ups); ROADMAP.md regenerated.

## Archive
pending (cmdFinalize; one bundle folder)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | no public/API/docs impact; CHANGELOG done by finalize node | both fixes complete shipped decisions, no new interface |
| documentation docking | invoked | this summary (DOCKED) | |
| final-validation fix executors | invoked | in-run R1/R2 + A1 repairs (routed tdd-guide), re-reviewed/re-verified | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
