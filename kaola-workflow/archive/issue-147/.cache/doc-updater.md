# Doc-Updater Output — issue-147

## Files Modified
- `CHANGELOG.md` — added [Unreleased] entry: GitLab/Gitea roadmap closure drift fix; `regenerateRoadmap(root)` exports and cleanup blocks added; tests updated
- `docs/api.md` — added `regenerateRoadmap(root)` to GitLab and Gitea module export sections; returns `'generated'` or `'up-to-date'`

## Skipped (no impact)
- `README.md` — internal implementation parity fix; no user-facing behavior change
- `.env.example` — no new env vars
- `docs/architecture.md` — already documents cleanup generically
- inline comments — code already has `/* roadmap mirror cleanup is non-fatal; archive already completed */`
