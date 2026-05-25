# tdd-task-1 — Foundations (A1 forge labels + A2 roadmapDir export + C3 forge-API test)

> tdd-guide dispatched with model=opus (Sonnet rate-limited this session).

## Modified files (exactly the 3 in write set)
1. plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js (TEST first)
2. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js (A1)
3. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js (A2)

## RED evidence (test edited, impl not yet changed)
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js`
```
TypeError: Cannot read properties of undefined (reading 'issue_iid')
    at .../test-gitlab-forge-helpers.js:95:103
EXIT: 1
```
Expected RED: without the `--label` push, listIssues builds key `issue list --output json --per-page 100 --state closed` (no labels) → not in responses → runner returns '' → parseJson('',[])=[] → [][0].issue_iid throws.

## GREEN evidence
After A1 `for (const label of options.labels || []) args.push('--label', label);`:
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` → `GitLab forge helper tests passed` EXIT 0.

A2 smoke after adding `roadmapDir,` to module.exports:
`node -e "console.log(typeof require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap').roadmapDir)"` → `function`.

## Orchestrator verification
git diff confirms: forge.js one-line labels push after --state (correct position); roadmap.js roadmapDir added to exports; test file 2 response keys + 2 assertions. All within write set. Re-ran validation in-session: forge tests pass, roadmapDir=function. No deviations.

## Git policy
No commits created; changes left in working tree.
