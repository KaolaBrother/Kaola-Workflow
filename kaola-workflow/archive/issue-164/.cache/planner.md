# Planner — issue-164

## Recommendation: Option B (buildClosureReceipt helper + full receipt)

### Key Decisions

**Option A (in-place, no helper)**: Rejected — duplicates enum-mapping logic across 3+ call sites; fails the unification goal.

**Option B (buildClosureReceipt helper)**: Recommended — single mapping point per forge tree; seeds emptyReceipt() once; 3 immediate callers in same PR (not speculative abstraction).

**Option C (closure subcommand)**: Rejected — paths own disjoint subsets of steps; forced unification duplicates work.

### Q1: circular dependency — No risk
sink-merge already requires claim.js at L6; add `buildClosureReceipt` to destructure.

### Q2: extend checkClosureInvariants to all 7 — In scope
4 new invariants: `active-folder-absent`, `archive-state-closed`, `branch-worktree-resolved` (all local/receipt-only), `remote-closed-after-publish` (skip when OFFLINE or `remote_issue_closed === 'skipped_offline'`).

### Q3: sink:pr receipt — Docs-only
No `cmdSinkPr` in claim.js. Authoritative closure receipt for sink:pr is emitted by `cmdWatchPr` at merge. AC #4 satisfied by docs note. closure-contract.js is NOT modified.

## Implementation Steps (in order)

1. `buildClosureReceipt()` helper in GitHub claim.js + export
2. Refactor `cmdFinalize` — seed receipt, capture `removeWorktree` result into `worktree_removed`, `branch_removed: 'kept'`
3. Extend `checkClosureInvariants` to all 7 invariants
4. Refactor `cmdWatchPr` — per-folder `receipts[]`; keep `cleanups`/`warnings` compatibility (check tests)
5. `KAOLA_GH_MOCK_SCRIPT` support in sink-merge `ghExec`
6. Emit receipt from sink-merge `postMergeCleanup`/`main`
7. Byte-identical copy to Codex plugin (claim.js + sink-merge.js)
8. GitLab claim.js + sink-merge equivalents
9. Gitea claim.js + sink-merge equivalents
10. 5 regression tests
11. Docs + CHANGELOG

## Explicitly Out of Scope
- Schema change to kaola-workflow-closure-contract.js
- `closure` subcommand wrapper (Option C)
- `already_absent` probe-first detection
- cmdSinkPr receipt beyond docs note
