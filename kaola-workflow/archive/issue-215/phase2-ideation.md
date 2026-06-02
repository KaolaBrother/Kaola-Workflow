# Phase 2 - Ideation: issue-215

## Approaches Evaluated

### Option A: inFence flag — family-only (SELECTED)
- Summary: Track fence-open state per line. On a trimmed line opening a fence (3+ `` ` `` or `~~~`), record the marker family (backtick or tilde) and enter fence state; exit only on a line matching the same family. While `inFence` is true, suppress the `^##\s` boundary check in both the heading-location loop and the body-collection loop.
- Pros: Structurally incapable of dropping in-section paths (moves boundary, never removes content); all failure modes err toward over-inclusion → false RED (safe direction); small, dependency-free, mirrors cleanly into 4 copies; extends the #213 mental model reviewers already know.
- Cons: Requires marker-family tracking (~3-4 lines) beyond naive toggle; forge copies are hand-mirrored (not enforced by byte-sync for files 3-4).
- Risk: Low
- Complexity: Small

**Refinement scoping decision (deliberate):** Family-only tracking, no run-length/CommonMark length matching. Workflow-generated `fast-summary.md` never uses 4-backtick fences. Adding run-length would be a speculative abstraction against an impossible input. Recorded here so Phase 5 does not flag missing CommonMark handling as a gap.

### Option B: Pre-strip fenced content (REJECTED)
- Summary: Remove all fenced regions before the heading/boundary scan.
- Pros: Conceptually clean separation.
- Cons: Drops `- Write Set:` paths that live inside a fence (which are currently extracted and counted correctly) → introduces a new false-GREEN vector, directly violating the no-false-negative invariant. More permissive than the buggy code for in-fence paths.
- Risk: High — disqualified, not deferred.
- Complexity: Small (irrelevant — fails the safety gate)

### Option C: Markdown AST library (REJECTED)
- Summary: Replace hand-rolled scan with a library (e.g. remark) that understands fenced blocks natively.
- Pros: Correct CommonMark fence semantics for free.
- Cons: Adds runtime dependency to 4 scripts including hand-edited forge mirrors; overkill for well-controlled fast-summary.md format; large blast radius on byte-identity sync contract.
- Risk: Medium
- Complexity: Large

## Advisor Findings
- Approach 1 confirmed correct; both rejections are correct for the right reasons.
- Key scoping decision: family-only, not run-length. Workflow inputs never use 4-backtick fences; adding run-length matching would be a speculative abstraction.
- Test coverage must match: the primary h2-in-fence test does NOT exercise family-tracking. Must add a mixed-marker test (a `~~~` line inside a ```` ```sh ```` fence, then `## Heading`, then `- Write Set:` → expect RED) to justify the family logic. Alternatively: drop to naive toggle and skip the mixed-marker test — both are internally consistent.
- Decision: implement family-only AND add the mixed-marker test (root walkthrough only; no need to triplicate in forge harnesses).
- Keep the planner's discriminator test: path written inside a fence → still counted → RED for overlapping candidate (root walkthrough only).
- Risk: hand-mirrored forge copies (files 3-4) are not covered by byte-sync gate; forge harness tests are the only catch for typos.

## Selected Approach
**Option A — inFence flag, family-only tracking.**

Rationale: Only approach structurally incapable of false negatives by construction. All failure modes err toward the safe direction. Family-only tracking is proportionate (closes the mixed-marker hole without run-length overhead). Pre-strip (Option B) was eliminated on safety grounds, not preference. AST library (Option C) is disproportionate for well-controlled workflow-generated inputs.

## Test Scope (expanded from Phase 1)
1. Primary test: `## ` h2 line inside `` ```sh `` fence above `- Write Set:` → assert RED. Add to all 3 harnesses.
2. Mixed-marker test: `~~~` line inside a `` ```sh `` fence, then `## Heading`, then `- Write Set:` → assert RED. Root walkthrough only (exercises family-tracking).
3. Discriminator test: path written inside a fence in `## Scope` → assert RED for overlapping candidate. Root walkthrough only (ensures in-fence paths are still counted; locks out future pre-strip regressions).

## Out of Scope (explicit)
- `validate-workflow-contracts.js:71` sectionBody — different function, intentionally fence-naive; its failure mode is symmetric (not a security false-GREEN)
- Re-handling the `# ` (h1) case — covered by #213
- Run-length / CommonMark length matching for fence delimiters — impossible input for workflow-generated fast-summary.md
- Pre-strip fenced content (Approach B) — safety-eliminated
- Markdown AST library dependency (Approach C)
- Diverging files 1↔2 — `cp` procedure is mandatory after editing the root canonical

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
