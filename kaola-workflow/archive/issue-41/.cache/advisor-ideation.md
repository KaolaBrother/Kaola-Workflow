# Advisor — Ideation Gate: issue-41

Generated: 2026-05-17

## Verdict

Proceed with the planner's 1A / 2A / 3A / 4A choices. No missed approaches that would change the recommendation. Risks are accurate. Three required adjustments before writing `phase2-ideation.md`:

---

## Review of Each Gap

### Gap 1 — `analyzeIssue()` wrapper (1A)

Sound. Adding a wrapper preserves backward compatibility and correctly positions the function as the shared entry point for Gaps 1 and 4. Hard-coding the top-tier regex is correct for v1; configurability would be premature abstraction.

No missed approaches.

### Gap 2 — `recovery` field on `claim:none` (2A)

Sound. Absence-of-field = success is the correct signal design. The three recovery values (`advance_project`, `consult_advisor`, `prompt_user`) cover the decision tree exhaustively.

Router-line concern: Before implementing the claim:none router text in `workflow-next.md`, verify that reclaimable lines exist. The planner notes a 2-line budget (currently 263/265). If Gap 4 adds 2 lines and Gap 2 adds 1 line, the cap is exactly hit. If any existing line proves non-reclaimable, the cap must be raised in `validate-workflow-contracts.js:177` as a tracked decision — not silently bypassed.

**Required adjustment**: Add a "verify reclaimable lines" pre-step to the Gap 2 + Gap 4 router-edit work item in the plan.

### Gap 3 — Phantom-Advisor Detection (3A)

Sound interpretation, but the phase file must accurately describe what 3A actually catches vs. what it misses:

3A is a **scope-reduced variant of approach (b)** (PostToolUse on Write/Edit scanning file content). It catches advisor-citation phrases in *written files* when no `.cache/advisor-*.md` artifact exists. It does **not** catch advisor references that exist only in conversation (never written to a file). This is a known limitation: if a session cites the advisor in chat but never writes that to a workflow artifact, the hook will not fire.

**Required adjustment**: Document this known limitation explicitly in `phase2-ideation.md`.

### Gap 4 — Fast-Path Workflow (4A)

Sound. The signal-weight table is well-researched. The mid-flight escalation convention (write field to workflow-state.md, re-route to Phase 1) is the right level of enforcement — hooks would be too coarse.

Optional stronger option: Add a `fast_path_caps` block to `workflow-state.md` when fast path is selected, logging the signal counts and threshold used. Phase 6 reads this block as a sanity check before finalizing. This is additive and does not change the core design. The plan should note it as an optional enhancement for PR B.

---

## Pre-Commit Checks Required

1. Run `git show 4df454c --stat` — confirm that commit only touched cache/state files (no implementation conflicts with Phase 1 feature branch commit).
2. Run `sed -n '168,183p' commands/workflow-next.md` — confirm Co-active Leases section content before claiming those lines are reclaimable.

Both checks must pass before Phase 3 begins.

---

## Summary of Required Adjustments

| # | Gap | Adjustment |
|---|-----|-----------|
| 1 | Gap 2+4 | Add "verify reclaimable lines" pre-step to router-edit work item |
| 2 | Gap 3 | Call 3A a scope-reduced variant of (b); document chat-only citation miss as known limitation |
| 3 | Gap 4 | Note `fast_path_caps` block as optional enhancement in PR B |

No blockers. Phase 3 can proceed after these are recorded.
