# Phase 2 - Ideation: issue-81

## Approaches Evaluated

### Option A: Explicit-Always (selected)
- Summary: Remove the sole-active no-target branch from `cmdStartup`. All no-target calls return `no_target`. The resume affordance survives — the agent reads `node CLAIM_JS status`, derives the issue number from `active[0].issue_number`, and calls `startup --target-issue N`. Three command/skill docs are updated to make this agent-side step explicit. CLAUDE.md is confirmed as correct.
- Pros: Single authoritative contract; script never selects; symmetrical with `cmdPickNext`; zero existing tests broken; reinforces "Agent Owns Reasoning; Scripts Own Atomicity" from issue #44
- Cons: One extra agent-side read in sole-active resume flow (already documented as step 3; reordering, not new work)
- Risk: Medium — doc rewrite in four files must be complete or agents loop on `no_target`. Mitigated by adding four regression tests.
- Complexity: Small — one script delete (5-7 lines), four small doc edits, three test cases + one round-trip test

### Option B: Sole-Active-Allowed
- Summary: Keep the script as-is; amend CLAUDE.md with a sole-active exception carve-out; tighten three docs to label this as an intentional exception.
- Pros: Zero script change; preserves one-call resume magic; trivial complexity
- Cons: Weakens CLAUDE.md's sharp-edged "scripts validate, not select" rule; contradicts issue #44 principle; inconsistent with `cmdPickNext`; erodes contract incrementally
- Risk: Medium governance — sets precedent for future "obvious" carve-outs
- Complexity: Trivial

## Advisor Findings
Advisor endorses Option A. Reasoning: CLAUDE.md was deliberately tightened in #44; sole-active branch is selection-by-omission; no existing tests depend on the removed branch. Option B requires arguing CLAUDE.md was wrong on a recent deliberate rule with no supporting evidence.

Advisor required four verifications before Phase 3 blueprint:
1. **JSON shape parity** — CONFIRMED BUG: `claimProject` line 310 returns `{ status: 'owned', folder: {...} }` where `worktree_path` is inside `folder`, not at top level. The sole-active branch at line 373 puts `worktree_path` at top level. Phase 3 must hoist `worktree_path` from `folder` in `cmdStartup`'s already-owned output path.
2. **`status` output format** — CONFIRMED WORKABLE: `cmdStatus` returns `{ active: [...], drift: [...], count: N }` where each active entry has `issue_number` directly accessible. The agent can derive `--target-issue N` from `active[0].issue_number`.
3. **Fourth round-trip test** — REQUIRED: add test for sole-active → agent reads status → derives target → calls `startup --target-issue N` → asserts `verdict: owned` and `worktree_path` set. (Blocked on shape parity fix.)
4. **External callers without `--target-issue`** — CONFIRMED CLEAN: all `startup` invocations in tests/scripts/docs pass explicit `--target-issue`; no external caller depends on the sole-active no-target branch.

Additional advisor note: The doc rewrite must explicitly state that the resume affordance is relocated to the agent side (not killed), to prevent future readers from thinking the capability was removed. The `### Co-active Folders Advisory` section in SKILL.md must stay coherent with the new step 5.

## Selected Approach
**Option A — Explicit-Always**

CLAUDE.md is the authoritative project contract and was deliberately tightened in issue #44. The sole-active branch in `cmdStartup` is selection-by-omission, which the rule explicitly prohibits. The cost is one small script delete, four small doc edits, and four regression tests — all using patterns already present in the codebase. No existing tests break. The resume affordance survives via agent-side `status` check.

Phase 3 must also fix the shape parity bug: hoist `worktree_path` from the `folder` object in `cmdStartup`'s already-owned output so the bash glue extracts it correctly after the sole-active branch is removed.

## Out of Scope (explicit)
- `cmdResume` — different command, different documented contract, not named in issue #81
- `cmdPickNext` — already returns `no_target` correctly; no change needed
- `cmdBootstrap` — alias for `cmdStartup`; fixing `cmdStartup` covers it automatically
- ROADMAP.md regeneration — phase-6 concern
- Worktree cleanup / `.kw` sibling logic — independent surface
- `KAOLA_SINK` / PR-intent capture machinery — orthogonal

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
