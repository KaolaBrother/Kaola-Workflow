evidence-binding: n1-validator-fix fa0346f5537f

## RED phase

Tests added to `scripts/simulate-workflow-walkthrough.js` inside the `testAdaptiveValidatorGovernance` function, immediately before the `#388 (FREEZE-ONLY / no-brick)` block.

Two assertions were added for #415:

1. `#415: a Unix absolute path (/Users/repo/src/app.js) must refuse at freeze`
   - Before fix: `AssertionError: #415: a Unix absolute path (/Users/repo/src/app.js) must refuse at freeze, got: {"result":"in-grammar","decision":"auto-run",...}`
   - The validator returned `in-grammar` because no check existed for `/`-prefixed tokens.

2. `#415: a Windows drive-letter path (C:src/app.js) must refuse at freeze`
   - Would also have returned `in-grammar` before fix.

RED: test `#415: a Unix absolute path (/Users/repo/src/app.js) must refuse at freeze` — AssertionError: expected result==='refuse' with /absolute_path/ in errors, got result==='in-grammar' (pre-impl)

## GREEN phase

Implementation added to `scripts/kaola-workflow-plan-validator.js` in the freeze-only write-set validation block (~line 788), BEFORE the existing `backslash_in_path` check:

- `tok.startsWith('/')` → typed reason `absolute_path`
- `tok.match(/^[A-Za-z]:/)` → typed reason `absolute_path`

The `revalidateForResume` function was NOT touched.

`barrier_base_mismatch` recovery hints updated at both sites (~line 1588 and ~line 1637 in `--barrier-check` and `--node-end` paths) to say: "run --drop-base then --record-base, or restore the ref; note: a fresh re-record after work was done would launder the crashed attempt, so prefer ref-restore where work exists" instead of the old "re-run --record-base".

Both `scripts/kaola-workflow-plan-validator.js` and `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` are byte-identical (verified with `diff`).

`npm run sync:editions` was run to propagate changes to `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`.

GREEN: test `#415: a Unix absolute path (/Users/repo/src/app.js) must refuse at freeze` passes; both #415 assertions green + full walkthrough 0 failures

## Test result

`node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed".

All four edition chains confirmed green:
- `npm run test:kaola-workflow:claude` — exit 0
- `npm run test:kaola-workflow:codex` — exit 0
- `npm run test:kaola-workflow:gitlab` — exit 0
- `npm run test:kaola-workflow:gitea` — exit 0

## change-type: bug-fix
