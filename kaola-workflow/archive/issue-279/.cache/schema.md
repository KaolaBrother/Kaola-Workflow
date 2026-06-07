# Node schema — #279 findings vocabulary + parser (implementer)
non_tdd_reason: pure parser + 3 closed vocabularies (FINDING_SCOPE/ACTION/STATUS) + the gate predicate unresolvedInScopeFixes added to the 4 byte-identical adaptive-schema copies; the natural failing-unit-test for this behavior lives in the `gate` node walkthrough (single test-file owner; tests of the validator gate must live at/after the validator). Verified here by build-green.
build-green:
- require loads: parseNodeFindings=function, unresolvedInScopeFixes=function, FINDING_SCOPE_VOCABULARY=in_scope,out_of_scope,pre_existing,needs_user_decision
- functional: parsed 2 blocking 1 | absent 0 | missingStatusBlocks 1 (missing status fails closed = open) | resolvedPasses 0
- validate-script-sync: OK 17 common scripts + 7 byte-identical groups in sync (4 schema copies byte-identical)
- simulate-workflow-walkthrough: 122 tests passed, exit 0 (pure additions, no regression)
write-set: scripts/kaola-workflow-adaptive-schema.js + plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/scripts/kaola-workflow-adaptive-schema.js (byte-identical)
