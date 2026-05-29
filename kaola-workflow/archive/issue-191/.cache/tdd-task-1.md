# TDD Task 1: T-WS-A — base+github-plugin L2+L3+L4

## Result: GREEN ✓

## L3 Edits (4 scripts + plugin twins)
- active-folders.js:22 string-concat `':\\s*'` → `':[ \\t]*'`
- classifier.js:25 string-concat same
- repair-state.js:82 template-literal `:\\s*` → `:[ \\t]*`
- compact-context.js:64 template-literal same

## L2 Edit (roadmap.js:174)
`([^|]+?)` → `((?:[^|\\]|\\.)+?)` in all 4 capturing groups

## L4 Edit (claim.js)
- writeState template: added `'runtime: ' + (data.runtime || 'claude'),` after workflow_path
- claimProject data: added `runtime: args.runtime || 'claude',` after workflow_path

## Plugin sync
cp from base to all 6 plugin twins — byte-identical.

## Validation
- validate-script-sync.js: "OK: 10 common scripts"
- simulate-workflow-walkthrough.js: "Workflow walkthrough simulation passed" (exit 0)
