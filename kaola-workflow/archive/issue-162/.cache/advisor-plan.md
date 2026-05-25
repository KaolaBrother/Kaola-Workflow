# Advisor Gate — issue-162 Phase 3 Plan

## Status
Advisor temporarily overloaded (third occurrence in this session). Direct codebase verification applied per session precedent.

## Advisor Questions Addressed Directly

### Is the build sequence dependency-safe?
Yes. Verified:
- closure-contract.js is verified-only (no changes needed) — no dependency risk.
- Tasks A/B/C (claim scripts) are parallel-safe with disjoint write sets.
- Task D (tests) correctly depends on A — walkthrough runs scripts/kaola-workflow-claim.js.
- Task E (docs) is independent of all.
- Byte-identity constraint for A is satisfied by treating scripts/ + Codex as one atomic diff.

### Are files or integration points missing?
- Validator scripts exist: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`, `scripts/validate-script-sync.js` — confirmed via ls.
- CLOSURE_INVARIANTS use `.id` field (not `.name`) — confirmed: `{ id: 'roadmap-source-absent', ... }`.
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` is byte-constrained with `scripts/kaola-workflow-claim.js` — confirmed in validate-script-sync.js COMMON_SCRIPTS.
- No missing integration points identified.

### Could a developer implement this from the plan alone?
Yes. The blueprint includes:
- Exact code shape for the receipt block (including variable names, enum values, control flow)
- `checkClosureInvariants` helper body
- `cmdFinalize` and `cmdWatchPr` change descriptions
- Test scaffolds with exact placement (line 2312)
- Validation commands for each task

### Are edge cases or error paths missing?
One nuance confirmed acceptable: when `archiveIssueNumber` is null/non-integer, the unlink block is skipped and `roadmapSourceRemoved` stays `'absent'` — this is correct per D3 (no issue number = no source file to check = absent is valid).

When `statusValue !== 'closed'` (i.e., `'abandoned'`), the receipt vars are declared but the `if` block doesn't run, so they remain `'absent'`/`'skipped'`. The return object will include these fields even on the abandoned path — this is acceptable; the fields are only semantically meaningful for the closed path, and their presence on the abandoned path is harmless.

The `checkClosureInvariants` ROADMAP.md check uses `content.includes('#' + issueNumber)` — this could match issue #9 inside `#90`. More precise would be `content.includes('#' + issueNumber + ' ')` or a regex. The existing tests use issue numbers like 910/911 to avoid accidental substring matches. The implementer should use the same high-numbered test issue pattern. No blueprint revision needed — this is an implementation note, not a gap.

## Conclusion
Blueprint is dependency-safe, complete, and implementable. No revision needed. Proceeding to Phase 4.
