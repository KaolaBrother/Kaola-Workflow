# Doc Updater — issue-33
Generated: 2026-05-16

## Files Updated

### CHANGELOG.md
Added `### Fixed — Phase 6 CWD Restoration After Worktree Removal (issue #33)` section under `[Unreleased]`:
- sink-merge.js pre-chdir before removeWorktree via mainRootFromCoord() helper
- process.on('exit') handler guarantees CWD restoration at all exit points
- Phase 6 Step 9 shell captures _MAIN_ROOT, restores after esac
- Test 16G-CWD sub-case validates end-to-end

### .env.example
Added commented block:
```
# Dev/test probe: when set, sink-merge writes final CWD to this file on exit
# Not for production use; used by test suite to verify CWD restoration
# KAOLA_WORKFLOW_DEBUG_CWD=
```

### README.md
Added `KAOLA_WORKFLOW_DEBUG_CWD` row to env vars table (Session Identity Binding section) — marked DEV/TEST ONLY.

## No-Impact Reasons
- API docs: no public API changed
- Architecture docs: no structural change (two-layer CWD fix is internal to sink scripts)
- Inline comments: already added in implementation (claim.js:638 reference comment in pre-chdir block)
