# Advisor — Plan Gate: Issue #196

## Verdict: Plan approved, proceed with two amendments

The fix is correct, scope is right (GitLab-only, all 3 sub-cases). No architect revision needed.

## Amendment 1 — Final gate must be `KAOLA_WORKFLOW_OFFLINE=1 npm test`

The issue is titled "KAOLA_WORKFLOW_OFFLINE=1 npm test is not green." That exact command is the AC.
Running the GitLab sub-script directly proves the file is fixed; running the full npm test proves
the reported issue is closed. These are not the same claim.

The full command is runnable locally without tag friction because `npm test`'s git-tag check is
skipped under `KAOLA_WORKFLOW_OFFLINE=1` (docs/conventions.md, code-explorer finding).

Phase 4 validation section must treat `KAOLA_WORKFLOW_OFFLINE=1 npm test` as **required**, not optional.

## Amendment 2 — Use `replace_all: true` for the 3 identical lines

All three target lines are byte-identical:
  `env: Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })`

An Edit with `replace_all: false` will error on non-uniqueness. `replace_all: true` on that exact
string is safe because the architect's grep sweep confirms exactly 3 occurrences in that file
(forge.js:21 is a different string in a different file). Confirm post-edit count is 3.

## No architect revision needed

The blueprint is complete and dependency-safe. A developer can implement it from the plan alone.
