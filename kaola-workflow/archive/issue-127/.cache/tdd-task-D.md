# TDD Task D — CHANGELOG entry

## Task
Add ### Fixed entry for issue #127 under [Unreleased] in CHANGELOG.md.

## RED
N/A — no test for CHANGELOG.

## Changes Made
File: `CHANGELOG.md`
Prepended under existing `### Fixed` section in `[Unreleased]`:
```
- Remove `workflow:in-progress` label when linked issue is closed via sink-merge (GitHub, GitLab, Gitea) (#127)
```

## GREEN Evidence
Visual inspection — entry appears at top of ### Fixed section, no existing content altered.
