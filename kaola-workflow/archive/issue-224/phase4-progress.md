# Phase 4 - Progress: issue-224

## RED (before fixes)
- #16 testRoadmapFilenameAuthorityMissingIssueField: no `issue:` → record dropped by trailing filter → ROADMAP "No active work". Assertion `| #42 |` failed.
- #17 testRoadmapFilenameAuthorityMismatch: `issue: #999` won → `| #999 |`. Assertion `| #43 |` failed.
- #18 testRoadmapMigrateRoundTripNoDoubleEscape: generate→migrate→generate → `Fix a\\|b parser` (double escape). Assertion failed.

## Edits
- root + Codex roadmap.js (cp, byte-identical): readRoadmapIssues `const n = parseInt(f.match(/\d+/)[0],10); issue:'#'+n` + drop trailing filter (#16+#17); parseRoadmapTable `.replace(/\\\|/g,'|')` on match[2]/[4]/[5] (#18).
- gitlab + gitea roadmap.js (forge hand-edit, #16+#17 only): same logic with `file`/`data` var names, em-dash defaults preserved, no #18.
- claim.js UNMODIFIED (already filename-authoritative).

## Byte-sync
`node scripts/validate-script-sync.js` → OK: 10 common scripts and 3 byte-identical file group in sync.

## GREEN + backward-compat
- 3 root tests GREEN; existing fixtures (issue-998/999, field==filename) render unchanged.
- validate-script-sync, root walkthrough, gitlab + gitea walkthroughs all exit 0.

## Files modified (7)
scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js. claim.js UNMODIFIED.

## For Phase 5
- Verify forge tests bite (written after forge fixes) — revert-probe one.
- Confirm #18 regex literal applied only to the 3 escaped columns; backward-compat of filename authority.
- Security surface minimal (local tool-written markdown; filenames pre-filtered by /^issue-\d+\.md$/) → security-reviewer N/A-with-reason.
