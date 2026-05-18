# Advisor — Phase 2 Ideation Gate: issue-81

## Verdict
Endorse Option A — proceed, with three verifications first.

## Reasoning
The planner's reasoning is sound: CLAUDE.md was deliberately tightened in #44, the sole-active branch is selection-by-omission, no existing tests depend on the removed branch, and the resume affordance trivially survives via agent-side `status`. Option B asks you to argue CLAUDE.md was wrong on a recent deliberate rule — nothing in the evidence supports that.

## Required Verifications Before Phase 3 Blueprint

1. **JSON shape parity on already-owned target.** When the agent calls `startup --target-issue N` and `issue-N` is already an active folder claimed by this session, does `claimExplicitTarget()` return `worktree_path` (and `verdict: owned`)? The bash glue in all three docs extracts `KAOLA_WORKTREE_PATH` from the response. If the explicit-target path returns a different shape than the deleted sole-active branch did, the no_target tests will pass while production breaks. Read `claimExplicitTarget` directly to confirm.

2. **`status` output format.** The new agent-side flow needs to derive `--target-issue N` from `node CLAIM_JS status`. Confirm `status` exposes the issue number (or that the project name `issue-N` is reliably parseable). If not, the doc rewrite has a hole.

3. **Test coverage breadth.** The three no_target scenarios are necessary but insufficient. Add a fourth test for the **round-trip**: a sole active folder exists → agent reads `status` → derives target → calls `startup --target-issue N` → asserts `verdict: owned` and `worktree_path` set. The contract is about behavior, and the resume affordance is the behavior that must survive. Test it explicitly.

4. **Check for callers without --target-issue.** Grep `scripts/`, `docs/`, `.github/`, and `plugins/` for `startup` invocations that omit `--target-issue`. Option A breaks any caller that expects sole-active resume from no-target startup.

## Nuance
Option A doesn't *remove* the sole-active fast path — it *relocates* detection from script to agent. The doc rewrite in step 5 must say this clearly, or future readers will think the resume affordance was killed entirely. The `### Co-active Folders Advisory` section in SKILL.md must stay coherent with the new step 5 — check it during Phase 3.

## Phase 3 Entry Conditions
Record verifications 1-4 above as Phase 3 entry conditions in the blueprint.
