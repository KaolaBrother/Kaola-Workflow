# Advisor — Phase 3 plan gate

## Verdict: blueprint approved. Stop the design loop (confirmed 4x). Implement now.

## Refinement 1 — add an 11th test
testClosureAuditDryRunNeverCallsRemoveLabel: gh shim writes a marker on
`issue edit --remove-label`; assert marker does NOT exist after a dry-run run.
Mirrors testAuditAndRepairLabels:2591. Asserts dry-run safety by side-effect absence,
not just output shape.

## Refinement 2 — roadmap_regenerated derivation
Do NOT use `result==='generated'`. If --execute runs but ROADMAP.md is already current,
regenerateRoadmap returns 'up-to-date' and strict logic would report false (reads as
failure). Treat "regenerateRoadmap ran without throwing" => roadmap_regenerated:true.
Matches archiveProjectDir convention (claim.js:545: success vs 'failed').

## Refinement 3 — dirty detection fixtures
git -C <project_dir> status --porcelain works because git walks up to the parent repo.
Confirm test fixtures call initGitRepo(tmp) before planting active folders (they do).
No code change — fixture mental check.

## Implementation invariants to preserve
- collectClosedSet is the ONLY caller of issueIsClosed; detectors take the set.
  Keeps gh-call count O(distinct N), not O(detectors x N).
- executeRepairs consumes the dry-run report — do NOT rerun detection. Add a comment.
- Locked JSON shape is the contract. No convenience fields "while you're there".
- Do NOT dispatch a Sonnet tdd-guide (quota hit). Write tests directly.

## Phase 6 reminder (does not block)
sink-merge #165 -> re-read closure_receipt, manual `gh issue close` if remote_issue_closed != closed.
#161 closes via plain `gh issue close` (not sink-merge).
