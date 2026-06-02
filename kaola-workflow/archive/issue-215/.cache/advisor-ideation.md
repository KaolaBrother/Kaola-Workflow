# Advisor Gate: Phase 2 Ideation — Issue #215

## Verdict
Recommendation is sound. Approach 1 (inFence flag) is correct. Both rejections are correct for the right reasons. Proceed to Phase 3.

## Fence Tracking Sophistication Decision

Three levels evaluated:
1. **Naive toggle** (startsWith('```')||startsWith('~~~') → flip): fixes reported bug, passes required test. Floor.
2. **Family-only** (track which marker opened; close only on same family): closes mixed-marker false-GREEN hole. ~3-4 lines. **RECOMMENDED** — proportionate for a guard whose audit history is false-GREEN leaks.
3. **Run-length / CommonMark length matching** (4-backtick fences vs 3): **DROP** — speculative abstraction. Workflow-generated fast-summary.md never uses 4-backtick fences. Adds bug surface for a case that can't occur.

**Decision: family-only, no run-length.** Record as deliberate scoping decision in phase file so Phase 5 doesn't flag missing CommonMark handling as a gap.

## Test Coverage Requirement

- The primary `## ` in-fence test passes under the **naive** toggle, not specifically exercising family-tracking.
- If implementing family-only: **must add a mixed-marker test** — a `~~~` line inside a ```` ```sh ```` fence, then `## Heading`, then `- Write Set:` → expect RED. This exercises the family-tracking logic.
- Without the mixed-marker test, the family logic is unjustified overhead — either test it or drop to naive.
- **Keep the planner's discriminator test** (path written inside a fence → still counted → RED for overlapping candidate). Root walkthrough is enough; no need to triplicate.

## Risk Note for Phase 4
- GitLab/Gitea classifiers are hand-edited, NOT in validate-script-sync.js's byte-identity allowlist.
- Keep the family-only logic simple enough to mirror by eye.
- The byte-sync gate catches files 1↔2 drift but NOT forge mirror typos — only the forge harness tests catch those.
- Confirm the two forge harness tests actually execute the new mixed-marker case.
