evidence-binding: n3-regen-forge-ports bcd2de5dbb83

## Task
Regenerate the plan-validator gitlab/gitea forge ports after n1 fixed the canonical `scripts/kaola-workflow-plan-validator.js`.

## non_tdd_reason
Category: Config / IaC — mechanical regeneration of rename-normalized forge ports from the fixed canonical source via `edition-sync.js --write`; there is no failing-first unit test form for this step.

## verification_tier
build-green

## Write Set
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`

## Before: edition-sync --check output
```
edition-sync: FORGE AGGREGATOR PARITY FAILED (2 file(s)):
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js — first diff at line 789: expected "      // #415: an absolute-path token is never a valid in-repo relative path and would always" got "      // #388 (c)/(d): a backslash-bearing token — `src\\app.js` or the traversal evasion"
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js — first diff at line 789: expected "      // #415: an absolute-path token is never a valid in-repo relative path and would always" got "      // #388 (c)/(d): a backslash-bearing token — `src\\app.js` or the traversal evasion"
```

Only the two plan-validator forge ports needed syncing — exactly the declared write set.

## npm run sync:editions output
```
generated  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
generated  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
edition-sync: write complete (2 file(s) updated).
```

## After: edition-sync --check output
```
edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.
```

No drift.

## Forbidden-token checks
```
node scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only 2>/dev/null || true
(no output — no violations)

node scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only 2>/dev/null || true
(no output — no violations)
```

## Four-chain test results (exit code 0)

All four chains passed:

- `npm run test:kaola-workflow:claude` — PASSED (Workflow walkthrough simulation passed)
- `npm run test:kaola-workflow:codex` — PASSED (Kaola-Workflow walkthrough simulation passed)
- `npm run test:kaola-workflow:gitlab` — PASSED (GitLab workflow walkthrough simulation passed + GitLab Codex workflow walkthrough simulation passed)
- `npm run test:kaola-workflow:gitea` — PASSED (Gitea workflow walkthrough simulation passed + Gitea Codex workflow walkthrough simulation passed)

Both gitlab and gitea chains confirmed `edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.` as part of their test run.
