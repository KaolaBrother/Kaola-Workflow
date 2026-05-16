# Doc-Updater — Issue-34 Phase 6

## Files Updated

**CHANGELOG.md** — Added [Unreleased] entry for issue #34:
- Bug 1: non-atomic archive → cmdFinalize subcommand (atomic write + rename)
- Bug 2: missing status:closed → written before rename in cmdFinalize
- Bug 3: no GC for crashed claims → cmdSweep second pass (30-min threshold, phase-artifacts guard)
- Phase 6 Step 8b requirement documented
- Test 34-A/B/C coverage noted

**README.md** — Updated automation scripts section:
- Added `finalize` to kaola-workflow-claim.js subcommands list
- Enhanced sweep description with second pass GC behavior

## Skipped with Reasons

- `.env.example` — no new env vars
- API docs — no HTTP endpoints
- Architecture docs — no dedicated arch docs referencing archive step
- Inline comments — archiveProjectDir already has comment; exported per module.exports
