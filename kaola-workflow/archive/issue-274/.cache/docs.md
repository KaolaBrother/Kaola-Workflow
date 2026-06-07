# Node `docs` evidence — issue #274 (doc-updater)

Updated docs/api.md + docs/architecture.md with text grounded in the shipped diff. No fabrication.

## docs/architecture.md (static-floor paragraph, after "...under-counts sensitive files.")
Added: "Freeze (#274) now also cross-checks the repo's byte-identity/sync-group obligations (COMMON_SCRIPTS + BYTE_IDENTICAL_GROUPS from `validate-script-sync.js`), catching a synced file edited without its mirror lane at freeze instead of post-merge at `npm test`."

## docs/api.md
(a) Grammar paragraph, after the G-SEL-4 clause — new "Sync-group gap (#274)" refusal class: a node's declared_write_set containing one half of a byte-identical sync pair (COMMON_SCRIPTS scripts/↔plugins/kaola-workflow/scripts/ mirror, or any BYTE_IDENTICAL_GROUPS member) without the peer(s) in some node's write set → typed refusal `sync-group gap: node <id> declares "<path>" without its byte-identical peer "<peer path>" (#274)` (group form appends label). Sync sets read from validate-script-sync.js's exported COMMON_SCRIPTS/BYTE_IDENTICAL_GROUPS; graceful no-op when absent (Codex/GitLab/Gitea copies, installed user projects).
(b) --freeze result shape line — noted sync-group gap refusals prevent frozen:true; runs on --freeze + default --json validate but NOT --resume-check/--gate-verify/--barrier-check/--verdict-check.

## Verification
- node scripts/validate-workflow-contracts.js → Workflow contract validation passed.
- node scripts/simulate-workflow-walkthrough.js → Workflow walkthrough simulation passed.
- git diff --stat → only docs/api.md (+4) and docs/architecture.md (+3) are this node's edits (the other 6 files are the pre-existing impl changes).
