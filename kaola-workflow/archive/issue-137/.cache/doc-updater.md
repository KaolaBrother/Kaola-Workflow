# doc-updater Output: issue-137

## Files Updated

- `docs/api.md` — Added `assertBranchPushedToUpstream` guard documentation under the Merge Sink section: describes block conditions (unpushed commits, no upstream tracking ref), error reporting format, and OFFLINE skip behavior.

## Files Verified (No Changes Needed)

- `CHANGELOG.md` — already contains comprehensive [Unreleased] entry
- `.env.example` — already documents `KAOLA_WORKFLOW_OFFLINE=1`; no new env vars introduced
- `README.md` — high-level overview; guard details belong in API docs
- `docs/architecture.md` — high-level diagram; guard chain detail belongs in API docs

## Checklist Assessment

| Item | Status | Evidence |
|------|--------|---------|
| README.md | no change needed | high-level only; no guard list |
| API docs | updated | docs/api.md lines 23-26, 32 |
| CHANGELOG.md | already updated | entry under [Unreleased] |
| Architecture docs | no change needed | diagram-level; no guard detail |
| .env.example | no change needed | KAOLA_WORKFLOW_OFFLINE already documented |
| Inline comments | no change needed | no public interface changes |
