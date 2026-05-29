# Phase 1 - Research / Discovery: issue-177

## Deliverable
1. Create and push lightweight git tags `kaola-workflow--v3.15.0` (at commit `1313aaf`) and `kaola-workflow--v3.16.0` (at commit `5e8084b`) to origin
2. Add a tag-existence check to `scripts/validate-workflow-contracts.js` (and its byte-identical Codex mirror) so future `npm test` catches tag/metadata drift

## Why
Repo metadata (package.json, README, CHANGELOG) presents 3.16.0 as the current official release, but remote tags stop at 3.14.0 — the tagging step was simply never run for 3.15.0 and 3.16.0. Users installing via the tagged release process (README release checklist) can't pin to these versions. The validation gap also means the drift went undetected.

## Affected Area

### Git operations (no file change)
- Create `kaola-workflow--v3.15.0` at `1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0`
- Create `kaola-workflow--v3.16.0` at `5e8084b438bf084f7efc5ad59412821c8c69204b`
- Push each tag individually (`git push origin kaola-workflow--v3.15.0`)

### Files to modify
- `scripts/validate-workflow-contracts.js` — add tag-existence assertion after line ~323
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical Codex mirror

## Key Patterns Found

1. **Tag naming**: `kaola-workflow--v{X.Y.Z}` lightweight tag at the release bump commit — `kaola-workflow--v3.13.0` at `fc1219ba`, `kaola-workflow--v3.14.0` at `524e9694` (`.git/refs/tags/`)
2. **CHANGELOG drift guard**: `validate-workflow-contracts.js:320–323` checks `## [${rootVersion}]` present in CHANGELOG.md; same file would host new tag-existence assertion
3. **Byte-identical sync**: `scripts/validate-workflow-contracts.js` ↔ `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` enforced by `validate-script-sync.js` in `npm test`
4. **Release checklist rule**: Push single tag by name only — never `--tags` or `git push origin main --tags` (README.md lines 433–440)
5. **Tag-existence check pattern**: Read `.git/refs/tags/kaola-workflow--v${version}` or search `.git/packed-refs`; if absent, `process.exitCode = 1` + error message matching existing assertion style

## Test Patterns
- Framework: hand-rolled assert (node scripts/validate-workflow-contracts.js exits 0/1)
- Location: `scripts/validate-workflow-contracts.js`, `scripts/simulate-workflow-walkthrough.js`
- Structure: sequential assertions; `process.exitCode = 1` + `console.error` on failure; final `console.log('...passed')` on success
- Byte-identical sync tested by `scripts/validate-script-sync.js`

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — if set, tag-existence check must be skipped (git may not be available / offline context)
- `validate-script-sync.js` — enforces byte-identical pairs; will fail if files drift

## External Docs
docs-lookup: N/A — all operations use git CLI and Node.js `fs.readFileSync`; no external library behavior needed

## GitHub Issue
KaolaBrother/Kaola-Workflow#177

## Completeness Score
10/10

- Goal clarity: 3/3 — missing tags identified, release commits pinpointed, validation gap confirmed
- Expected outcome: 3/3 — 2 tags pushed + 1 new validation assertion in contracts script
- Scope boundaries: 2/2 — git ops + 2 script files (byte-identical pair); no other files
- Constraints: 2/2 — lightweight tag convention, single-tag push, offline skip, sync enforcement

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | Pure git CLI + Node.js fs — no external library behavior needed |

## Notes / Future Considerations
- Only the GitHub/main tag is required per README. GitLab tag is optional; Gitea has no tag.
- Tag-existence check should read `.git/refs/tags/kaola-workflow--v${version}` first; fall back to grepping `.git/packed-refs` (to cover annotated tags and packed-refs format).
- Should skip the tag-existence check under `KAOLA_WORKFLOW_OFFLINE=1` to preserve offline test suite compatibility.
