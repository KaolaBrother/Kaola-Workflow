evidence-binding: n11e-fix-validators 71a4e3bd6ffa

non_tdd_reason: surgical validator false-positive fix — two identical loops in forge contract validators scan all .js files for forge CLI binary names without excluding comment lines; adding nonCommentText filter is comment-only false-positive elimination, not behavior change; integration evidence = 4 chains green

build-green

## Changes made

1. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` lines 549-555: added `const nonCommentText = text.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');` after `const text = read(file);` and changed the `\bgh\b` assertion to test `nonCommentText` instead of `text`. The fallback-script assertion continues to test the full `text`.

2. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` lines 556-562: same pattern — added `nonCommentText` filter line and changed the `\bglab\b` assertion to test `nonCommentText` instead of `text`. The fallback-script assertion continues to test the full `text`.

## Chain results
claude: PASSED
codex: PASSED
gitlab: PASSED
gitea: PASSED
