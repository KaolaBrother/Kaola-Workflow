# Code Explorer: issue-177

## Tag Inventory

Local tags (no 3.15.0 or 3.16.0):
- kaola-workflow--v3.12.0 → fbae33ac
- kaola-workflow--v3.13.0 → fc1219ba
- kaola-workflow--v3.14.0 → 524e9694

Older annotated (packed-refs): 3.4.0, 3.8.0, 3.8.1, gitlab--v3.8.0, gitlab--v3.8.1

No local or remote tags for kaola-workflow--v3.15.0 or kaola-workflow--v3.16.0.

## Release Commits (from reflog)

| Version | SHA | Subject |
|---------|-----|---------|
| 3.15.0 | 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0 | chore(release): 3.15.0 (Codex packs 1.6.0) |
| 3.16.0 | 5e8084b438bf084f7efc5ad59412821c8c69204b | chore(release): 3.16.0 (Codex packs 1.7.0) |

Both are lightweight tags (matches 3.13.0/3.14.0 pattern).

## Release Tooling
No automated release tooling. Manual 4-command process in README.md lines 426-431:
- npm test, git diff --check, git tag, git push origin <tagname> (single tag only, never --tags)

## CHANGELOG
- [3.16.0] — 2026-05-26 (line 29): closure audit Gitea edition, sink-merge CWD fix
- [3.15.0] — 2026-05-25 (line 41): closure audit GitHub + contract/receipt unification

## Validation Gap
validate-workflow-contracts.js (lines 320-323) checks CHANGELOG heading vs package.json version,
but has NO check that a git tag for the current version actually exists.

## Files to Modify
- scripts/validate-workflow-contracts.js — add tag-existence check
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js — byte-identical mirror

## Key Paths
- package.json: version "3.16.0"
- .git/refs/tags/ — no 3.15.0 or 3.16.0 entries
- .git/packed-refs — older tags only
