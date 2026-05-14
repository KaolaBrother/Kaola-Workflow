# Phase 2 - Ideation: parallel-classifier

## Approaches Evaluated

### Option A: Compact router snippet + monolithic classifier (SELECTED)
- Summary: Single ~250-300 line `kaola-workflow-classifier.js` mirroring `kaola-workflow-claim.js` shape. Router gets a compact `if/fi` bash block under Startup Step 0 (pre-claim: classify candidates, then claim the selected one). Cap stays at 220 lines.
- Pros: Mirrors dominant pattern; cap stays intact; single review surface; all gh calls guarded by single OFFLINE check; subprocess-based Epic Case 6 verification sufficient for simple rule set.
- Cons: Rule engine not unit-testable in isolation; verdict verified end-to-end only.
- Risk: Low
- Complexity: Medium

### Option B: Library-style + cap raised to 230
- Summary: Split into thin CLI wrapper + exported helpers with `require.main` guard. Router scan loop ~14 lines. Cap raised from 220→230 with matching contract validator update.
- Pros: Rule engine directly unit-testable; cap-raise makes policy change visible.
- Cons: Two new patterns at once; cap-raise precedent; extra complexity for simple rule set.
- Risk: Medium
- Complexity: Medium-Large

### Option C: Classifier only, no auto-scan loop
- Summary: Build `kaola-workflow-classifier.js` but do NOT modify `workflow-next.md`. Manual invocation only.
- Pros: Zero cap risk; easiest to revert.
- Cons: Misses the stated feature goal (autonomous selection); config file becomes dead settings.
- Risk: Low (but incomplete)
- Complexity: Small

## Advisor Findings

Advisor confirmed Approach A is sound. Five critical issues were identified in the Phase 1 planner sketch — all must be addressed in Phase 3 task definitions:

**Bug 1 — OFFLINE guard terminates router:**
The planner snippet used `exit 0` which kills the entire `/workflow-next` session under OFFLINE mode. Fix: use an `if ... fi` guard block around the scan loop instead.

**Bug 2 — Yellow verdict dropped:**
The pick condition used `grep -q '"verdict":"green"'` which drops yellow. Issue spec requires `if v in {green, yellow}: claim c, break`. Fix: accept both `green` and `yellow` in the pick condition.

**Gap 3 — Claimed-set filtering missing:**
The planner snippet iterates every open issue without subtracting already-claimed ones. Fix: read `kaola-workflow/.locks/*.lock` to build claimed-set before the scan; skip claimed issues before classifying.

**Gap 4 — Step 0 sequencing conflict:**
The candidate scan is a pre-claim decision (choose what to claim), not post-claim. Fix: scan runs first in Startup Step 0, then claim follows for the selected issue. Step 0's `claim.js claim` must be deferred until a candidate is chosen.

**Gap 5 — depends-on resolution fragile:**
Using `gh pr list --search "fixes #N"` misses commit-closed issues. Fix: use `gh issue view N --json state,closedAt` — reliable for both PR-close and commit-close.

Additional advisor notes:
- Batch gh calls via `gh issue list --json number,title,body,labels,state` (single call, cache in-process)
- 9-line headroom may be tight with section header + fences; raise cap to 230 (not 225) paired with matching `validate-workflow-contracts.js:151` update if needed
- Epic Case 6 sub-tests named: 6A (green→select), 6B (red→skip), 6C (yellow→select+shared-infra warning), 6D (blocked dep→skip), 6E (OFFLINE+depends-on→blocked), 6F (claimed-set filter→skip)
- `Co-active Leases` section in workflow-next.md should reference the candidate scan

## Selected Approach

**Option A — Compact router snippet + monolithic classifier**

Rationale: Matches the dominant pattern in the codebase (mirrors `kaola-workflow-claim.js`); preserves the 220-line cap; delivers the full feature in one coherent unit; subprocess-based Epic Case 6 verification is sufficient for a simple rule set; fits within the 9-line router headroom (or raises cap cleanly to 230 if needed). All five advisor bugs/gaps are resolved in the Phase 3 task definitions — they are implementation details, not architectural concerns that require a different approach.

Key design decisions from advisor:
- Candidate scan is **pre-claim** (integrated into Startup Step 0, before `claim.js claim`)
- OFFLINE guard uses `if/fi` block, not `exit 0`
- Pick condition accepts **both** `green` and `yellow` verdicts
- `depends-on` checked via `gh issue view N --json state,closedAt`
- Claimed-set built from `.locks/*.lock` files before scan begins

## Out of Scope (explicit)

- Auto-claim of green verdicts without user-visible candidate selection
- Auto-suggest fixes for overlapping file sets
- Mutation of claimed projects' phase artifacts (only candidate's phase1-research.md yellow note)
- TTL/cache layer for verdicts
- Lock-file schema changes
- Scheduler, queue, or persistent ranking
- Cross-machine state synchronization
- New gh label taxonomy beyond `depends-on:#N`
- `require.main` guard / library-style exports (Option B pattern)
- Cap-raise without necessity (raise only if 9-line budget genuinely overflows, and only to 230)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
