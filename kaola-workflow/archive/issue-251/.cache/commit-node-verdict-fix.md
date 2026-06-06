# commit-node verdict-fix evidence note
# Issue: #251 — verdictCheck absent-arg regression in combineResults whole-plan mode

## Failing test before fix

test4b calls `combineResults` with `mode: 'whole-plan'`, providing `barrierCheck` (passing) and
`gateVerify` (passing) but NO `verdictCheck` key (undefined). Expected `overallOk === true`.

Before fix — whole-plan branch:
```js
const verdictPass = !!(verdictCheck && verdictCheck.exitCode === 0 && verdictCheck.ok === true);
overallOk = barrierPass && gatePass && verdictPass;
```
With `verdictCheck === undefined`, `verdictPass` evaluates to `false` -> `overallOk === false` -> FAIL.

Output: `commit-node tests FAILED (2 failures, 25 passed)`
  FAIL: test4b: overallOk===true when both barrier and gate pass in whole-plan
  FAIL: test4b: result===ok

## Diff summary (whole-plan else branch of combineResults, all 4 files)

- REMOVED: `const gatePass = !!(gateVerify && gateVerify.exitCode === 0 && gateVerify.ok === true);`
- REMOVED: `const verdictPass = !!(verdictCheck && verdictCheck.exitCode === 0 && verdictCheck.ok === true);`
- ADDED:   `const gatePass = (gateVerify == null) ? true : (gateVerify.exitCode === 0 && gateVerify.ok === true);`
- ADDED:   `const verdictPass = (verdictCheck == null) ? true : (verdictCheck.exitCode === 0 && verdictCheck.ok === true);`
- ADDED:   explanatory comment block (rationale: absent = "not provided", not "silent pass"; main()
           always shells both in whole-plan and each fail-closes internally)

Files changed (4):
  scripts/kaola-workflow-commit-node.js
  plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js

## Verification results

1. node scripts/test-commit-node.js
   RESULT: commit-node tests passed (27 assertions) — exit 0. All 27/27 pass.

2. cmp root vs plugins/kaola-workflow
   RESULT: IDENTICAL (byte-for-byte).

3. Fork diffs vs root:
   gitea fork: 33c33 only — const VALIDATOR = 'kaola-gitea-workflow-plan-validator.js'
   gitlab fork: 33c33 only — const VALIDATOR = 'kaola-gitlab-workflow-plan-validator.js'
   Both forks load without error (node -e "require(...)" — exit 0).

4. node scripts/simulate-workflow-walkthrough.js
   RESULT: Workflow walkthrough simulation passed — exit 0.

5. npm test suites:
   claude suite:  Workflow walkthrough simulation passed — GREEN
   gitlab suite:  GitLab workflow walkthrough simulation passed + GitLab Codex walkthrough passed — GREEN
   gitea suite:   Gitea workflow walkthrough simulation passed + Gitea Codex walkthrough passed — GREEN
   codex suite:   BLOCKED — validate-kaola-workflow-contracts.js line 448 requires `validateNodeOutput`
                  in plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md. This term is
                  absent because the contract was tightened in #251 but the SKILL.md documentation
                  half was not yet written. This failure is INDEPENDENT of the commit-node verdict fix
                  (the assertConcept check reads only SKILL.md; the 4-file diff does not touch it)
                  and is OUTSIDE the declared write set. Surface as a #251 documentation follow-up.
