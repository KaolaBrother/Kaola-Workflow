# Phase 2 - Ideation: issue-109

## Approaches Evaluated

### Option A: Pattern B Parity (GitLab Codex sibling mirror)
- Summary: Add `KAOLA_CLAIM` extraction alongside `PICK_NEXT_PROJECT`; replace unguarded release with combined `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]` guard; add 3 contract assertions.
- Pros: Minimal blast radius (2 lines in SKILL.md, 3 lines in contracts); byte-level parity with GitLab sibling; `PICK_NEXT_PROJECT` at line 50 untouched.
- Cons: `PICK_NEXT_PROJECT` vs `KAOLA_PROJECT` naming drift persists across plugins (non-blocking).
- Risk: Low
- Complexity: Small

### Option B: Pattern A Rename (PICK_NEXT_PROJECT → KAOLA_PROJECT)
- Summary: Rename `PICK_NEXT_PROJECT` to `KAOLA_PROJECT` at lines 50 and 117, add `KAOLA_CLAIM`, add guarded release.
- Pros: Aligns variable naming with Claude command convention.
- Cons: Rename touches line 50 unnecessarily; rename-incomplete is the exact failure mode being fixed; extra axis of change.
- Risk: Low-Medium
- Complexity: Small

### Option C: Fix both GitHub + GitLab Codex routers
- Summary: Apply the fix to both skill files.
- Pros: Belt-and-suspenders coverage.
- Cons: GitLab sibling already correct — scope creep with no benefit.
- Risk: Medium
- Complexity: Medium

## Advisor Findings
Advisor confirmed Approach 1 (Option A) is correct. Key findings:
- `PICK_NEXT_PROJECT` at line 50 is authoritative local naming; `$KAOLA_PROJECT` at line 139 is a true orphan regression-from-drift bug.
- GitLab sibling has identical context (`--runtime codex`, same `claim_script` discovery), so byte-parity is the cheapest verifiable invariant.
- Combined guard `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]` satisfies AC #2 and AC #3 in one expression.
- Add a third assertion for `'--reason git-freshness-block'` to guard against removal of the recovery step.
- Risk: Low. Complexity: S. No missed approaches.

Pre-Phase-3 verifications required (advisor):
1. Read SKILL.md directly to confirm exact line positions (50, 113–119, 139).
2. Check JS string style in `validate-kaola-workflow-contracts.js` lines 86–89.
3. Add third assertion for `'--reason git-freshness-block'`.

## Selected Approach
**Option A — Pattern B Parity (GitLab Codex sibling mirror)**

Rationale: Minimal blast radius, byte-level parity with the already-correct GitLab sibling, and the combined guard closes both AC #2 (claim guard) and AC #3 (project variable correctness) in a single expression. Naming drift is acknowledged and out of scope.

## Out of Scope (explicit)
- GitLab Codex SKILL.md — already correct
- GitLab contracts validator — no gap introduced by this fix
- Claude command (`commands/workflow-next.md`) — already correct
- `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` rename — out of scope
- Fast-forward retry before release (Pattern A feature) — Pattern B sibling parity beats Claude parity for this file
- Simulation changes beyond contract validator

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
