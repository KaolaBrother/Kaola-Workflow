# doc-updater — issue-160

## Result: No gaps found

All documentation changes are already in place as part of the issue-160 deliverable.

## Checklist Status
- [x] README.md — line 534 updated: independent bracket syntax + precedence note
- [x] API docs — docs/api.md: 3 discrepancies fixed (mutex claims removed, skip-default described, JSON schema replaced)
- [x] CHANGELOG.md — Fixed entry (line 17) + Tests entry (line 21) under [Unreleased]
- [N/A] Architecture docs — No stale-worktree-cleanup structural references
- [N/A] .env.example — No new env vars; all flags are CLI-only
- [N/A] Inline comments — No claim scripts changed; no public interface changed

## Verification
doc-updater confirmed all 3 core doc corrections in docs/api.md:
1. Mutual-exclusivity language removed from flag descriptions (line 332 precedence paragraph added)
2. Default behavior corrected from "archive" to "skip dirty" (line ~341)
3. JSON schema replaced with two accurate shapes (dry-run + execute)

README.md and CHANGELOG.md confirmed accurate.
