# Phase 2 - Ideation: issue-152

## Approaches Evaluated

### Option A: Blocks in Validation Delegation Policy (SELECTED)
- Summary: Insert tdd-guide + build-error-resolver Agent blocks after the prose paragraph naming agents, before the cache-path code fence, in the Validation Delegation Policy section of each affected command file.
- Pros: "Exactly as documented above" references in Fix Routing become accurate without rewording. Mirrors Phase 4's single canonical site pattern. Minimal risk.
- Cons: None significant.
- Risk: Low
- Complexity: Small

### Option B: Blocks in Fix Routing section only
- Summary: Insert blocks at the "documented above" site instead of above it.
- Pros: Co-locates blocks with the reference.
- Cons: "documented above" would still be inaccurate (blocks are at the reference, not above it); requires prose rewording.
- Risk: Low
- Complexity: Small-Medium

### Option C: Blocks in both sections
- Summary: Duplicate blocks in both Delegation Policy and Fix Routing.
- Pros: Maximum redundancy.
- Cons: Diverges from Phase 4's single canonical site; unnecessary duplication.
- Risk: Low
- Complexity: Medium

## Advisor Findings

The advisor confirmed Option A is sound and identified a Phase 4 scope gap:

- Phase 4 Validation Delegation Policy (line ~114) names `build-error-resolver` in prose only. Phase 4 Step 3 (line 306-308) says "exactly as documented above" — but only the tdd-guide Agent block exists above it. Identical dangling reference as Phase 5/6.
- All three Phase 4 copies (root, gitlab, gitea) have the same gap.
- Advisor recommendation: expand scope to fix Phase 4 in the same commit rather than creating a follow-up issue for an identical 3-file edit.
- `{BUILD_ERROR_RESOLVER_MODEL}` substitution confirmed wired in `install.sh` (lines 383, 400) → renders to `sonnet`.
- Fast path (`kaola-workflow-fast.md`) has no `build-error-resolver` references — no gap there.

## Selected Approach

**Option A + Phase 4 scope expansion.**

Insert canonical Agent blocks in the Validation Delegation Policy section of all 9 affected command files (root + gitlab + gitea × phase4/phase5/phase6). Phase 4 gets only the build-error-resolver block (tdd-guide block already exists in Phase 4 Step 1). Phase 5 and Phase 6 get both tdd-guide + build-error-resolver blocks. Add 15 assertIncludes calls to `validate-workflow-contracts.js` and 2 render assertions to `test-install-model-rendering.js`.

Rationale: leaving Phase 4 broken would require a follow-up issue doing the same 3-file edit; fixing it here costs negligible incremental effort.

## Affected Files

**Command files (9 total):**
- `commands/kaola-workflow-phase4.md` — add build-error-resolver block
- `commands/kaola-workflow-phase5.md` — add tdd-guide + build-error-resolver blocks
- `commands/kaola-workflow-phase6.md` — add tdd-guide + build-error-resolver blocks
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md` — same as root
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md` — same as root
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` — same as root
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md` — same as root
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md` — same as root
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md` — same as root

**Validator scripts (2 total):**
- `scripts/validate-workflow-contracts.js` — 15 new assertIncludes calls
- `scripts/test-install-model-rendering.js` — 2 new render assertions

## Assertion Counts

**validate-workflow-contracts.js:**
- Phase 4 files × 3: `{BUILD_ERROR_RESOLVER_MODEL}` = 3 assertions
- Phase 5 files × 3: `{TDD_GUIDE_MODEL}` + `{BUILD_ERROR_RESOLVER_MODEL}` = 6 assertions
- Phase 6 files × 3: `{TDD_GUIDE_MODEL}` + `{BUILD_ERROR_RESOLVER_MODEL}` = 6 assertions
- Total: 15 assertions

**test-install-model-rendering.js:**
- `assert(phase5.includes('model="sonnet",'), 'phase5 routed path should render tdd-guide/build-error-resolver as sonnet')`
- `assert(phase6.includes('model="sonnet",'), 'phase6 routed path should render tdd-guide/build-error-resolver as sonnet')`

## Out of Scope (explicit)

- `commands/kaola-workflow-fast.md` — no `build-error-resolver` references; already instrumented for tdd-guide
- `commands/kaola-workflow-phase4.md` tdd-guide block — already exists in Step 1; no change needed
- `prompt="..."` in new Agent blocks — keep template-shaped (do not fill with concrete text)
- `validate-script-sync.js` expansion — plugin command file sync is not automated; new assertions catch missed forks
- Combined routing table — two separate blocks matches Phase 4 pattern; no merged table
- Rewording "exactly as documented above" sentences — Option A makes them accurate as-is

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
