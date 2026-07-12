# Finalization - Summary: issue-666

## Delivered
ENOBUFS hardening: every unbounded-in-repo-size git call now carries an explicit 64 MB `maxBuffer` cap via a per-script local `GIT_MAX_BUFFER` constant. Upstreams the live worktree-hash hot-patch (previously only a reinstall-wiped hand-patch in the installed copy) and extends it to every sibling of the same git-plumbing pattern, across all four editions. Pinned by a >1 MB synthetic-tree regression.

## Files Changed
- scripts/kaola-workflow-plan-validator.js (+3 forge/codex editions) — 10 capped git sites + GIT_MAX_BUFFER const
- scripts/kaola-workflow-adaptive-node.js (+3 editions) — 1 capped site
- scripts/kaola-workflow-claim.js (+3 editions; forge ports hand-ported) — 2 capped sites
- scripts/kaola-workflow-sink-merge.js (+3 editions; forge ports hand-ported) — 1 capped site
- scripts/kaola-workflow-run-chains.js (+3 editions; forge ports hand-ported) — 1 capped site
- scripts/test-adaptive-node.js — >1 MB worktree-hash ENOBUFS regression (canonical-only)
- CHANGELOG.md — [Unreleased] entry

## Test Coverage
Not a coverage-gated repo. Regression added (test-adaptive-node.js #666-ENOBUFS-TREE-HASH, 2 new assertions → 1730 total). Four-chain gate below.

## Final Validation Evidence
- Adaptive barrier prerequisite: `--resume-check`/`--gate-verify`/`--barrier-check`/`--verdict-check` all exit 0.
- Four npm chains (cross-edition): recorded via kaola-workflow-run-chains.js receipt (.cache/chain-receipt.json) before sink.
- Parity: `edition-sync.js --check` + `validate-script-sync.js` clean (verified at n3-review gate).

## Documentation Docking
No public interface / API / env var / architecture change — internal git-plumbing hardening only. CHANGELOG [Unreleased] entry added; no docs/ or ADR update required. Docking: DOCKED (no-impact for README/api/architecture/.env.example).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- #669 (filed this run) — status --porcelain ENOBUFS fail-open family (see Run gaps).

## Run gaps
- manual:enobufs-porcelain-family (n3-review R1: git status --porcelain ENOBUFS fail-open family, one tier below #666 dirty-fence at plan-validator 3253 and siblings; see #669): filed: #669

## Closure Decision
No deferred items or user-decision items within #666's own scope. The one run-discovered defect (R1) is filed as #669 (see Run gaps). Issue #666 acceptance criteria pass; safe to close.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
#666 — to be closed by sink-merge after merge to main.

## Roadmap
Updated: issue-666.md removed at closure; issue-669.md added (follow-up); ROADMAP.md regenerated.

## Archive
pending (cmdFinalize)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | no public/API/docs impact (internal git-plumbing hardening); CHANGELOG done by finalize node | no docs-updater-eligible surface changed |
| documentation docking | invoked | this summary (DOCKED) | |
| final-validation fix executors | N/A | | no validation failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
