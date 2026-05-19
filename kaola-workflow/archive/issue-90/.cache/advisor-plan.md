# Advisor Plan Gate — Issue #90

## Verdict: Plan sound — one critical bundle decision

Blueprint is implementable. Build sequence dependency-safe, write sets disjoint, exact diffs specified.

## Critical Finding

`npm run test:kaola-workflow:gitlab` currently fails (baseline check run) with:
```
Error: plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js must not fall back to root or GitHub plugin scripts
```
This is issue #98. The validation command specified as #90's success criterion cannot pass without this fix being in place.

## Recommendation: Bundle #98 fix into this branch

Issue #98 fix is trivial:
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:345`
- Change `require('../scripts/kaola-gitlab-workflow-sink-merge')` → `require('./kaola-gitlab-workflow-sink-merge')`
- The plugin-local file exists at `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- No validator rule changes needed (the rule forbidding `require('../` is correct)

Both #90 and #98 touch files in the same plugin. Bundling them unblocks validation and avoids issuing #98 as dead work.

## Out-of-scope clarification
Issue #98 (test runner regression) — addressed by bundling into this branch.

## No other gaps found.
