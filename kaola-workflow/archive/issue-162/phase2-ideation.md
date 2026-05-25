# Phase 2 - Ideation: issue-162

## Approaches Evaluated

### Option A: Make cleanup fatal (throw on failure)
- Summary: Replace `catch (_) {}` with a re-throw; any roadmap cleanup failure aborts `archiveProjectDir`.
- Pros: Simple to write; immediate visibility on failures.
- Cons: Atomicity violation — archive `renameSync` at line 516 already completed before cleanup block runs. Re-running `cmdFinalize` after a throw hits `{ skipped: 'source-missing' }` early return and never reaches cleanup again. `cmdWatchPr` loop aborts mid-pass.
- Risk: High
- Complexity: Small (to write), High (to get correct)

### Option B: Receipt with post-block throw
- Summary: Populate receipt fields, then throw after the cleanup block if any field is `'failed'`.
- Pros: Receipt is populated before throw; caller can inspect it.
- Cons: Same atomicity hazard as A — throw is still after an irreversible archive step; caller cannot retry the cleanup.
- Risk: High
- Complexity: Small

### Option C: Return receipt only + mandatory invariant check (RECOMMENDED)
- Summary: Replace `catch (_) {}` with named-error capture. Populate `roadmap_source_removed` (`'removed'`/`'absent'`/`'failed'`) and `roadmap_regenerated` (`'regenerated'`/`'failed'`) inside the cleanup block before any potential throw. Extend the existing return object with these two fields. `cmdFinalize` merges them into JSON output. `cmdWatchPr` surfaces them via a `warnings` array. A separate post-closure invariant check consumes `CLOSURE_INVARIANTS[roadmap-source-absent, roadmap-mirror-clean]`.
- Pros: No atomicity hazard; receipt schema already exists; aligns with `emptyReceipt()` fail-loud pattern from #161; surgical extension to existing return object; invariant check provides mandatory gate without re-entrancy risk.
- Cons: Failures are observable but not immediately fatal — depends on invariant check being enforced.
- Risk: Low
- Complexity: Medium

## Advisor Findings
Advisor temporarily overloaded. Direct codebase verification confirms Option C is sound.
See `.cache/advisor-ideation.md` for full verification. Key findings:
- `archiveProjectDir` return is NOT void (verified: returns `{ archived: true, dest }` or `{ skipped: 'source-missing' }`).
- Archive is irreversible before cleanup block — Options A and B are atomicity violations.
- Receipt schema already synchronized across all 4 forge trees via `BYTE_IDENTICAL_GROUPS`.
- COMMON_SCRIPTS enforces byte-identity for `kaola-workflow-claim.js` between scripts/ and Codex tree — changes land in 4 trees.

## Selected Approach
**Option C: Return receipt only + mandatory invariant check**

Rationale: The defect is silent failure, not non-fatal failure. The correct fix is visible receipt +
authoritative invariant gate. Throwing after an irreversible archive step is the wrong abstraction.
Receipt-only approach respects the `emptyReceipt()` fail-loud pattern from #161 and the planned #164
executor design. All 4 claim-script trees must be updated.

## Out of Scope (explicit)
- Full #164 shared closure executor — only two roadmap receipt fields in #162
- Abandoned path (`cmdRelease`/`cmdWatchPr` `'abandoned'`) — roadmap cleanup is already skipped for abandoned; keep skipping
- `.roadmap/` directory purge — only single `issue-N.md` file deleted
- Re-architecting `cmdWatchPr` to per-folder JSON
- Backfilling stale roadmap entries from past closures
- `cmdStaleWorktreeCleanup` path — not listed in AC; out of scope

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked (overloaded) | .cache/advisor-ideation.md | Direct verification used per issue-161 precedent |
