# TDD Task 1 - Add checkRepoSquashEnabled to kaola-gitea-forge.js

## Modified File
plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js

## RED Evidence
TypeError: forge.checkRepoSquashEnabled is not a function (before implementation)

## GREEN Evidence
node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
→ Gitea forge helper tests passed (exit 0)

## Changes
- Added checkRepoSquashEnabled(project, opts) function (=== false strict check)
- Wired into mergePullRequest: if (options.squash) checkRepoSquashEnabled(project, options)
- Exported in module.exports
