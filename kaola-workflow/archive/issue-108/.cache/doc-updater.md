# Documentation Updates — issue-108

**Updated**: 2026-05-19

## Summary

Updated documentation to reflect archive safety guards added in issue #108. The fix prevents sink pipelines from recreating archived project directories.

## Files Modified

### 1. CHANGELOG.md
**Status**: Updated — Added entry under [Unreleased]

Added concise entry documenting the archive guard fix for both sink-merge and cmdSinkFallback:
- sink-merge exits 3 if archive dir exists during postMergeCleanup receipt write
- cmdSinkFallback returns `{updated: false, reason: 'project archived'}` when archive dir exists

**Rationale**: User-visible bug fix affecting workflow stability; belongs in CHANGELOG as a Fixed entry.

### 2. docs/api.md
**Status**: Updated — Two locations

#### Location A: Merge Sink exit codes (line 16-20)
Added clarification to exit code 3:
- `3`: merge-impossible error (branch protected, non-fast-forward, permission denied); also returned if project archive dir exists during receipt write (GitLab guard)

**Rationale**: Exit code 3 now has broader semantics (archive guard + merge-impossible conditions). API consumers need to know that exit 3 can also mean "archive detected" to understand fallback behavior correctly.

#### Location B: GitLab Module Exports (added after line 106)
Added documentation for `cmdSinkFallback()` function:
- Describes the check logic (live folder existence AND archive folder existence)
- Documents return contract: `{updated: false, reason: 'project archived'}` vs. `{updated: true, sink: 'mr', reason}`
- Explains guard prevents recreation of archived projects
- Notes this is called after merge sink exits 3 during auto-fallback

**Rationale**: `cmdSinkFallback` is not exported but is a critical public-facing function invoked by Phase 6 auto-fallback logic. Test suites may need to validate this behavior.

## Sections with No Changes

### README.md
No new user commands, env vars, or install steps. Archive guards are internal operational safeguards, not surface API changes.

### Architecture docs (docs/architecture.md)
No structural change. The fix maintains the same Phase 6 sink flow diagram and auto-fallback logic. Archive guards are transparent to the architecture.

### .env.example
No new environment variables introduced. The fix uses only existing `KAOLA_WORKFLOW_OFFLINE` guard semantics.

### Inline comments
Already updated in Phase 5 via Trivial Inline Edit Exception. Added 2-line comments above both AND guards in `kaola-gitlab-workflow-sink-merge.js` explaining why AND (not OR) is the correct predicate for sink-merge.

## Validation

All file modifications verified:
- CHANGELOG.md: entry placed correctly under [Unreleased] Fixed section
- docs/api.md: two targeted updates at lines 16-20 and line 106 (new paragraph added)
- No links or references require updates
- All paths verified to exist in the codebase

## Cross-References

Related documentation:
- `docs/workflow-state-contract.md` — Project archive directory semantics
- `docs/api.md` (updated) — Sink API exit codes and module exports
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` — Phase 6 auto-fallback invocation points
