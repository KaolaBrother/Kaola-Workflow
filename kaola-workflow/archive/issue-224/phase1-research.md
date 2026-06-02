# Phase 1 - Research / Discovery: issue-224

## Deliverable
Three roadmap-mirror edge-case fixes in `kaola-workflow-roadmap.js`:
- **#16+#17 (unified)** `readRoadmapIssues` derives the issue number from the filename (single authority), removing both the silent-drop of a source file missing the `issue:` field (#16) and the filename-vs-field authority split (#17).
- **#18** `parseRoadmapTable` unescapes `\|`→`|` in the captured cells, fixing the generate→migrate→generate double-escape (`\\|`).

## Why
- #16: `readRoadmapIssues` derives the number from the in-file `issue:` field and filters out records failing `/^#\d+$/`; a `.roadmap/issue-N.md` missing the `issue:` line vanishes from `ROADMAP.md` with no warning/error/nonzero exit (`validate` can't catch it — both sides apply the same filter).
- #17: the row renders from the in-file `issue:` field (~:73) while `cmdProjectName`/closure key off the filename; `issue-43.md` containing `issue: #999` renders `#999` while filename-keyed paths operate on `43`.
- #18: `buildTableRow` escapes `|`→`\|`; `parseRoadmapTable` never unescapes; `cmdMigrate` writes the escaped cell into `title:`; next `generate` escapes the backslash again → `\\|`.

## Affected Area (verified; line numbers confirmed)
- `scripts/kaola-workflow-roadmap.js` (root): `readRoadmapIssues` :70-79 (field read :73; filter :79; filename filter :64), `parseRoadmapTable` :177-183, `buildTableRow` :82-91.
- `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` (Codex) — byte-identical to root (COMMON_SCRIPTS, validate-script-sync gate).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` — forge-adapted; have `readRoadmapIssues`/`buildTableRow`/`parseRoadmapTable` but **NO `cmdMigrate`** (verified) → #16+#17 apply; **#18 does not** (no round-trip possible).
- `scripts/kaola-workflow-claim.js` (+Codex) — **NOT modified** for #17: verified `field(_, 'issue')` never appears in claim.js; it is already filename-authoritative (`projectNameForIssue` :113, closure :560/583).
- Tests: `scripts/simulate-workflow-walkthrough.js` (root+Codex coverage); `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` + gitea (forge #16/#17 tests; must NOT rename existing roadmap test fns — contract validator asserts names).

## Linked issue
GitHub #224 (grouped tracker for audit findings #16/#17/#18). Acceptance: all 3 fixes done, root↔Codex byte-identical, full suite green.
