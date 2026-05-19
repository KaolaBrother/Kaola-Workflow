# Phase 2 - Ideation: issue-90

## Approaches Evaluated

### Option A: Append general regex to existing `assertNoForbidden` array (SELECTED)
- Summary: Add `/\b[a-z]+glab\b/i` to the `forbidden` array; fix one-word typo in code-architect.toml
- Pros: Smallest diff (~2 lines); reuses existing file iteration; catches future `*glab` corruptions automatically
- Cons: Error message says "forbidden reference" (slightly imprecise phrasing)
- Risk: Low — regex verified safe against `glab` CLI, `glabExec`, JSON manifests
- Complexity: Small

### Option B: Dedicated `assertNoTermReplacementArtifacts` function with explicit list
- Summary: New function with `/enouglab|througlab|higlab|.../` explicit list
- Pros: Self-documenting; precise error message
- Cons: More code; misses novel corruptions; heavier diff
- Risk: Low
- Complexity: Small-Medium

### Option C: New function with general regex + tailored message
- Summary: Hybrid — new function using `/\b[a-z]+glab\b/i` with clearer diagnostic
- Pros: Best diagnostic clarity + full coverage
- Cons: Diverges from existing pattern; overkill for one rule
- Risk: Low
- Complexity: Small

## Advisor Findings
Option A confirmed sound. Regex safety verified. Key note: fix typo and add regex in the same commit (or fix typo first) to avoid the validator catching the live `enouglab` during a partial apply. TDD shape: add regex → see it fail on `enouglab` → fix typo → green. All code edits must happen in the `.kw/issue-90/` worktree.

## Selected Approach
**Option A** — append `/\b[a-z]+glab\b/i` to `forbidden` array in `assertNoForbidden`. Rationale: smallest surgical diff, full AC coverage, future-proof against novel `*glab` artifacts, zero false-positive risk in the validated file set.

## Out of Scope (explicit)
- GitHub validator (`scripts/validate-kaola-workflow-contracts.js`) — no changes
- Explicit typo enumeration list (general regex subsumes)
- Auto-fix scripts
- Changes to the `assertNoForbidden` file iteration (lines 114-116)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
