# final-validation — issue-167 (Phase 6)

## Command (authoritative final gate)
`npm test` — all four editions (claude/codex/gitlab/gitea) + validators.

## Result: PASS (exit 0)
- test:kaola-workflow:claude — validate-script-sync ("OK: 10 common scripts and 2 byte-identical file group in sync"), validate-vendored-agents, bash -n install/uninstall, package.json parse, model resolver/rendering/upgrade, validate-workflow-contracts, simulate-workflow-walkthrough — all passed (GitHub regression check: shared install.sh + docs touched — no regression).
- test:kaola-workflow:codex — sync + contract + walkthrough passed.
- test:kaola-workflow:gitlab — contract + both walkthroughs passed (no regression from shared edits).
- test:kaola-workflow:gitea — validate-kaola-workflow-gitea-contracts passed (now asserts new closure-audit script in both arrays + install.sh; forbidden-token loop scanned new script, 0 glab), simulate-gitea-workflow-walkthrough + simulate-gitea-codex-workflow-walkthrough passed (11 new closure-audit tests run via test-gitea-workflow-scripts.js).

## Classification: all green; no routing needed.
Covers Phase 4 + Phase 5 targeted commands (dedup) — no files changed since the last green run.

## Acceptance criteria (#167) — all met
1. Dry-run default JSON matching GitHub shape (PR — Gitea keeps unarchived_pr_folders) — tests + smoke.
2. --execute removes safe local roadmap sources + regenerates ROADMAP.md + removes stale labels online — test 9.
3. Active folders / unarchived PR folders report-only — tests 7,8,10.
4. Offline audits local, marks remote skipped — test 1.
5. Tests in Gitea walkthrough/test suite — 11 tests in test-gitea-workflow-scripts.js, run by simulate-gitea-workflow-walkthrough.
6. docs/api.md updated (Gitea subsection + heading + flow row + follow-up bullet).
