# Advisor — Ideation Gate, Issue #108

## Verdict: Prefer Approach 2 (skip receipt when archived), not Approach 1

## Key Arguments

### 1. Audit trail argument is hollow
`cmdSinkFallback` never opens `sink-fallback.json` — it just edits `workflow-state.md`. No current consumer of the receipt's contents exists downstream. "An operator will find it" is theoretical; there is no `workflow-state.md` next to it for context in the archived case.

### 2. Approach 1 relaxes an existing invariant
The planner's test plan says "extend the snapshot whitelist to include `.cache/sink-fallback.json` as allowed new file inside archive." `testFallbackGuardsAfterArchive` asserts archive is **byte-for-byte unchanged** — a contract from issue #83. Approach 1 isn't just adding tests; it's loosening that contract. The "minor con" framing is inaccurate.

### 3. AC explicitly allows skip
From the issue AC:
> "The fallback receipt is written to an archive-aware location, **or Phase 6 consumes it without recreating the live folder.**"
Skip = nothing to consume = no recreation. Satisfies the second branch literally.

### 4. `resolveProjectFile` analogy fails for writes
That pattern is live-first-then-archive for READS. Generalizing to WRITES is where the analogy stops — archived writes mutate a contracted-terminal directory.

## Decision

**Part A (`sink-merge.js postMergeCleanup`):** Approach 2. Before writing receipt, check: if `kaola-workflow/{project}/` is missing AND `kaola-workflow/archive/{project}/` exists → write one-line stderr notice, return `{exitCode:3}`. No file written, no archive mutated.

**Part B (`claim.js cmdSinkFallback`):** Add archive-existence check before live-existence check, same `{updated:false, reason:'project archived'}` shape.

**Tests:** New `test-gitlab-sinks.js` case asserts exit 3 + no live dir + **no receipt anywhere**. Integration test in `simulate-gitlab-workflow-walkthrough.js` keeps existing byte-equality assertion intact.

## No Missed Approaches
The design space (write to archive / skip / write elsewhere) is fully enumerated. No fourth credible option.

## Risk Correction
Planner under-weighted Approach 1's archive-mutation cost (modifies contracted invariant) and over-weighted audit trail (no current consumer). Approach 2's "loses audit trail" con is null in practice.

## No Blockers
Issue ordering (#108 before #109) is fine — independent bugs. Dirty main worktree is fine — working in `.kw/issue-108` worktree; Phase 6 commits only the issue-108 write set on its own branch.
