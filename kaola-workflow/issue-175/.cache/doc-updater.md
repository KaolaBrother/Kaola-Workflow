# Doc-Updater: issue-175

## Result
CHANGELOG.md updated — added entry under [Unreleased] → ### Fixed

## Entry added
```
- **Port `target_unverified` OFFLINE no-evidence behavior to GitLab and Gitea editions** (issue #175): GitLab and Gitea startup and classifier scripts now return `target_unverified` when `KAOLA_WORKFLOW_OFFLINE=1` and the target issue has no local evidence, matching the GitHub edition behavior from issue #169.
```

## Checklist
| Item | Action |
|------|--------|
| README.md | skipped — no new features, flags, or usage examples |
| API docs | skipped — no public API surface changed |
| CHANGELOG.md | UPDATED — entry added under [Unreleased] → Fixed |
| Architecture docs | skipped — no structural changes |
| .env.example | skipped — no new env vars |
| Inline comments | skipped — no public interfaces changed |
