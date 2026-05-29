# TDD Task 6: Gitea tests fix + 4 new IIFEs

## Status: PASSED

## Changes
File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

1. Replaced IIFE at lines 809-825 (wrong `verdict:'green'`) with correct `verdict:'target_unverified'` assertion + reasoning check
2. Added 4 new IIFE blocks: roadmap-acquires, owned-routes, unrelated-active-folder, startup-end-to-end

Also fixed 2 pre-existing tests broken by new classifier behavior:
- testGiteaOfflineWinsOverNative (issue 9) - added roadmap fixture
- testGiteaOfflineBypassesFailClosed (issue 501) - added roadmap fixture

## Validation
`node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → exit 0
"Gitea workflow script tests passed"
