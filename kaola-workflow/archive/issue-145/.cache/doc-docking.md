# Documentation Docking — issue-145

## Changed Files Reviewed
- `README.md` — release versioning table lines 378-380 updated to `3.12.0`; Codex manifest lines 381-383 untouched at `1.5.0`
- `scripts/validate-workflow-contracts.js` — drift-guard block added (derives from packageJson.version)
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — sync copy (repo convention enforced by validate-script-sync.js)
- `CHANGELOG.md` — [Unreleased] Fixed entry added for issue #145

## Documents Checked
- README.md: Direct fix target. No other sections referencing version numbers found.
- CHANGELOG.md: [Unreleased] Fixed section updated by doc-updater.
- API docs: N/A — no API changes.
- Architecture docs: N/A — no architecture changes.
- .env.example: N/A — no new env vars.

## Gaps Found and Fixed
None. All relevant documentation is accounted for.

## No-Impact Reasons for Skipped Document Classes
- API docs: pure version table sync + validator addition, no API surface changed
- Architecture docs: no structural changes
- .env.example: no new environment variables
- Inline comments: no public interface changes

## Acceptance Criteria Alignment
- AC1: README version table matches `3.12.0` for all 3 editions → ✓ (README.md:378-380)
- AC2: Codex plugin manifest versions remain accurate → ✓ (untouched at `1.5.0`)
- AC3: Validation check added so table doesn't drift → ✓ (drift-guard in validate-workflow-contracts.js)

## Final Verdict: DOCKED
