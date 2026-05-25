# Phase 2 - Ideation: issue-164

## Approaches Evaluated

### Option A: In-Place, No Helper
- Summary: Add missing fields directly inside each closure path without a shared helper
- Pros: Minimal abstraction; no new function surface
- Cons: Duplicates enum-mapping logic across 3+ call sites; fails the field-unification goal; each path builds its receipt differently; future fields require 3+ edits
- Risk: Medium
- Complexity: Medium

### Option B: buildClosureReceipt Helper + Full Receipt
- Summary: Add `buildClosureReceipt(project, issueNumber, steps)` to each claim.js; seed with `emptyReceipt()`; all closure paths call it; sink-merge gets `KAOLA_GH_MOCK_SCRIPT` support and emits receipt JSON
- Pros: Single mapping point per forge tree; fail-loud defaults from `emptyReceipt()`; 3 immediate callers (not speculative abstraction); testable via mock
- Cons: Small additional function surface in claim.js; byte-identical enforcement extends to sink-merge
- Risk: Low
- Complexity: Medium

### Option C: Closure Subcommand Wrapper
- Summary: Add a new `closure` subcommand that orchestrates all three closure paths through one entry point
- Pros: Single invocation surface
- Cons: Paths own disjoint subsets of steps; forced unification duplicates work; changes public CLI surface; overkill for receipt tracking
- Risk: High
- Complexity: XL

## Advisor Findings

Advisor confirmed Option B is correct. Key locked decisions:

**D1**: Trim `checkClosureInvariants` expansion to 3 new invariants only (3: `active-folder-absent`, 4: `archive-state-closed`, 7: `branch-worktree-resolved`). Do NOT add invariant 5 (`remote-closed-after-publish`) — defer to #165. These three are local-only and offline-safe; invariant 5 depends on `remote_issue_closed` being correctly populated, which #165 will wire properly.

**D2**: sink:pr deferred closure is docs-only. No schema change to `kaola-workflow-closure-contract.js`. Authoritative receipt for sink:pr is `cmdWatchPr` at merge. `docs/api.md` documents this as explicit pending-watcher behavior.

**Test 2 (drop)**: "PR sink pending" test is not testable against new code. Replaced by 4 concrete tests:
1. Merge sink receipt (`cmdFinalize` with shim; assert `worktree_removed`)
2. watch-pr merged (shim on sink:pr folder; assert `receipts[0]`)
3. Offline skipped (OFFLINE=1; assert `remote_issue_closed: 'skipped_offline'`)
4. sink-merge mockability + receipt (`KAOLA_GH_MOCK_SCRIPT`; assert stdout JSON)

**Context risk**: Ship #164, then stop. Do not chain into #165.

## Selected Approach

**Option B: buildClosureReceipt Helper + Full Receipt**

Rationale: Only approach that satisfies the unification goal without duplicating enum-mapping logic. Three immediate callers exist in the same PR scope — not speculative abstraction. `emptyReceipt()` defaults guarantee fail-loud behavior for unpopulated fields. `KAOLA_GH_MOCK_SCRIPT` extension to sink-merge is the minimal enabler for receipt testability. Both claim.js and sink-merge.js are in COMMON_SCRIPTS (L39/L46) — byte-identical copy is already enforced.

## Out of Scope (explicit)

- Schema change to `kaola-workflow-closure-contract.js`
- `closure` subcommand wrapper (Option C)
- `already_absent` probe-first detection
- `cmdSinkPr` receipt beyond docs note
- Invariant 5 (`remote-closed-after-publish`) — deferred to #165
- Issue #165 work in this session

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
