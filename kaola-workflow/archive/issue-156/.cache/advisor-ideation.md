# Advisor — Ideation Gate (issue-156)

## Verdict

Approach A is sound and scoped correctly.

## Critical Pre-Condition (verified)

- `fc1219b` confirmed as the 3.13.0 release commit: `package.json#version = 3.13.0` at that SHA, `3.12.0` at parent.
- `## [3.13.0]` CHANGELOG section first introduced at `fc1219b` — planner's claim verified.
- HEAD includes two unreleased commits (4ebd1b4 docs, b654850 fix#155); tag must point to fc1219b, not HEAD.

## Guidance

1. **CHANGELOG guard passes today** — it's a regression guard, not a currently-failing test. State this plainly in PR.
2. **Add positive test** in simulate-workflow-walkthrough.js: temp dir + mismatched CHANGELOG → assert guard fires.
3. **Codex-plugin 1.5.0 stream** — confirm the guard reads package.json#version only, does not accidentally cross-check .codex-plugin/plugin.json (independent version stream).
4. **AC2 (GitLab tag)** — "equally consistent with data" interpretation: 3.12.0 had no GitLab tag (intentional or same bug). Historical precedent leans "optional." Document in README as optional; do not push GitLab tag unless user clarifies.
5. **AC3 partial coverage** — CHANGELOG guard catches CHANGELOG-vs-package.json drift, not tag-vs-package.json drift. State explicitly in PR description.

## Tag Push Authorization (AC1)

Tag push is reversible (`git push --delete origin <tag>` + retag). Agent should push autonomously with strict pre-flight:
1. Resolve SHA → fc1219b (verified above)
2. Verify metadata at that SHA
3. State SHA in message before pushing
4. `git tag kaola-workflow--v3.13.0 fc1219b && git push origin kaola-workflow--v3.13.0`
