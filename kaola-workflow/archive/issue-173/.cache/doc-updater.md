# Documentation Update Summary — Issue #173

**Date:** 2026-05-28

## Task
Update documentation for issue #173 (decision issue on legacy session/lock cleanup).

## Changes Made

### 1. CHANGELOG.md Update
- **File:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/CHANGELOG.md`
- **Section:** `## [Unreleased] → ### Added`
- **Added Entry:**
  ```
  - **ADR 0001: legacy session/lock cleanup decision** (issue #173): Records the decision not to add durable tooling for `.git/kaola-workflow/.sessions/*.json` and `.locks/` cleanup (Option A — Drop). Files may be removed manually if they accumulate; no audit script or startup cleanup will be added.
  ```
- **Position:** After issue #171 entry, before ### Changed section
- **Status:** Verified (entry confirmed in place)

## Checklist
- [x] CHANGELOG.md - entry added to [Unreleased] → ### Added for issue #173
- [x] API docs - no changes needed (no API changes)
- [x] README.md - no changes needed (no feature/usage changes)
- [x] .env.example - no changes needed (no env vars)
- [x] Architecture docs - no changes needed (no structural changes)
- [x] Inline comments - no changes needed (decision-only, no code)

## Notes
This is a docs-only issue documenting an ADR (Architecture Decision Record) filed separately in `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/docs/decisions/0001-legacy-session-lock-cleanup.md`. The ADR files were created by issue #173 itself; this doc-updater run simply mirrors the decision into the CHANGELOG with a freshness timestamp.
