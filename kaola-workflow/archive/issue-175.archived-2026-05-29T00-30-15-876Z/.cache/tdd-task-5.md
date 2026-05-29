# TDD Task 5: GitLab tests fix + 4 new IIFEs

## Status: PASSED

## Changes
File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

1. Replaced IIFE at lines 814-830 (wrong `verdict:'green'`) with correct `verdict:'target_unverified'` assertion + reasoning check
2. Added 4 new IIFE blocks: roadmap-acquires, owned-routes, unrelated-active-folder, startup-end-to-end

Also fixed 3 pre-existing tests broken by new classifier behavior:
- Issue #101 fast-startup (issue 7) - added roadmap fixture
- Issue #149 OFFLINE-wins-NATIVE (issue 602) - added roadmap fixture
- testGitLabOfflineBypassesFailClosed (issue 202) - added roadmap fixture

These tests relied on OFFLINE+no-evidence returning 'green'; they need roadmap fixtures to establish evidence after #175 fix.

## Validation
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → exit 0
"GitLab workflow script tests passed"
