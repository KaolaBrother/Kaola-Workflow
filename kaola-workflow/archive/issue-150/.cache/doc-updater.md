# Doc Updater: issue-150

## Action Taken

Added CHANGELOG.md entry under [Unreleased] / Fixed section:

> **Priority label sorting parity for GitLab and Gitea** (issue #150): Ported `readPriorityConfig(root)` and `priorityTier(issue, topTierLabels)` helpers to both GitLab and Gitea claim scripts. Updated `listOpenIssues()` to accept a `root` parameter and apply priority-tier sorting. Brings GitLab and Gitea editions to parity with the GitHub implementation of `priority_top_tier_labels` config. Added unit tests and discriminating priority-sort tests.

## Checklist Assessment

- README.md: No change — already documents priority labels as cross-forge behavior (lines 548-552)
- API docs: No change — no public API changes
- CHANGELOG.md: UPDATED — bug fix entry added
- Architecture docs: No change — no structural change
- .env.example: No change — no new env vars
- Inline comments: No change — no public interface changes needing comments
