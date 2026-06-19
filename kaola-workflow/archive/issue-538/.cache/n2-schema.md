evidence-binding: n2-schema 2da504b4a6da
<!-- RED: paste RED here -->
RED: node $TMPDIR/n2-red.js (requires the canonical scripts/kaola-workflow-adaptive-schema.js, asserts the NEW installed_paths behavior) FAILED before the edit — exit 1:
  TypeError: S.resolveInstalledPaths is not a function
      at .../n2-red.js:15:28
  (first assertion `resolveInstalledPaths({installed_paths:['fast']}) deep-equals ['fast']` threw because the function did not exist yet / old resolveEnableAdaptive signature). RED confirmed.

<!-- GREEN: paste GREEN here -->
GREEN: after applying SPEC A1-A5 to the canonical scripts/ copy and propagating byte-identical to the 3 forge copies, node $TMPDIR/n2-red.js PASSED — exit 0:
  ok - resolveInstalledPaths({installed_paths:['fast']}) deep-equals ['fast']
  ok - resolveInstalledPaths({}) is []
  ok - resolveInstalledPaths({installed_paths:['adaptive','garbage','full']}) is ['full'] (adaptive/junk dropped)
  ok - isLegalWorkflowPath('adaptive', []) is true
  ok - isLegalWorkflowPath('fast', []) is false
  ok - isLegalWorkflowPath('fast', ['fast']) is true
  n2-red: ALL 6 assertions passed
Module loads clean: resolveInstalledPaths=function, INSTALLED_PATHS_FIELD='installed_paths'; retired symbols resolveEnableAdaptive / WORKFLOW_PATHS_NO_ADAPTIVE / ENABLE_ADAPTIVE_FIELD / ENABLE_ADAPTIVE_ENV all undefined.

4-WAY BYTE-IDENTITY: diff scripts/kaola-workflow-adaptive-schema.js against each of plugins/kaola-workflow, plugins/kaola-workflow-gitlab, plugins/kaola-workflow-gitea → OK (zero diff) for all three. git status shows all 4 schema copies modified.

WALKTHROUGH SMOKE (regression): node scripts/simulate-workflow-walkthrough.js → exit 1 at testClaimStatusRelease (L123). Failure is `adaptiveSchema.resolveEnableAdaptive is not a function` — the EXPECTED/ACCEPTABLE retired-symbol failure: kaola-workflow-claim.js still calls the now-retired resolveEnableAdaptive. claim.js (§B) + the walkthrough (§F cluster 4) are owned by downstream nodes (n3-claim / n7b), NOT this node's write set. No unrelated regression observed.
