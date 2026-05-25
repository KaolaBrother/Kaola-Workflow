# Planner — issue-162

## Key Correction vs Phase 1 Research

1. **`archiveProjectDir` already returns a value** — `{ archived: true, dest }` on success, `{ skipped: 'source-missing' }` on early exit. Receipt design extends the existing return object.

2. **4 claim-script trees, not 3** — `validate-script-sync.js` COMMON_SCRIPTS (line 40) pins `scripts/kaola-workflow-claim.js` byte-identical to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (Codex). GitLab and Gitea are manual sync. So changes must land in: scripts/ + Codex (enforced identical) + GitLab + Gitea (manual).

## Option A: Make cleanup fatal (throw on failure)
- **Disqualifier: atomicity violation.** Archive (renameSync + rmSync) already completed by the time roadmap block runs. A throw strands the system — re-running finalize hits `{ skipped: 'source-missing' }` early return and never reaches roadmap cleanup again. `cmdWatchPr` loop aborts mid-pass. **Incompatible with "Scripts Own Atomicity" principle.**
- Complexity: Low to write, high to get correct.

## Option B: Receipt with post-block throw
- Same atomicity hazard as A; cosmetically different throw location. No behavioral improvement.
- Marginally more code than A for same risk profile.

## Option C: Return receipt only, mandatory invariant check (RECOMMENDED)
- Replaces `catch (_) {}` with named-error capture. Sets `roadmap_source_removed` to `'removed'`/`'absent'`/`'failed'` and `roadmap_regenerated` to `'regenerated'`/`'failed'`.
- Extends return object with receipt fields. `cmdFinalize` merges into JSON output. `cmdWatchPr` adds a `warnings` array.
- A **separate post-closure invariant check** (AC #3) consumes `CLOSURE_INVARIANTS[roadmap-source-absent, roadmap-mirror-clean]` — this is where "mandatory" lives without atomicity hazard.
- Respects the `emptyReceipt()` fail-loud pattern from #161 and the planned #164 executor design.

## Selected Approach: Option C

**Why**: The defect is silent failure, not non-fatal failure. The correct fix is visible receipt + authoritative invariant gate. Throwing after an irreversible archive step is the wrong abstraction.

## Out of Scope
- Full #164 shared closure executor (only two roadmap receipt fields in #162)
- Abandoned path (`cmdRelease`/`cmdWatchPr` `'abandoned'`) — keep skipping roadmap block
- `.roadmap/` directory purge — only single `issue-N.md` file deleted
- Re-architecting `cmdWatchPr` to per-folder JSON
- Backfilling stale roadmap entries from past closures

## Missing Facts That Could Change the Decision
1. Is #164 already in flight? If so, caller wiring may belong there.
2. Invocation point for AC#3 invariant check — inside `cmdFinalize`, in sink-merge guard, or CI only?
3. `cmdWatchPr` failure visibility — is a `warnings` array sufficient for an unattended watcher?
