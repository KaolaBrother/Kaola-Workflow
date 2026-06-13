evidence-binding: n4-registration b80b562a633c
REPAIR of n4 (G1 finding R1 CRITICAL): the #407 plant self-test (test-install-manifest-single-source.js) anchors on 'kaola-workflow-run-chains.js',\n]); assuming run-chains is the LAST SUPPORT_SCRIPTS entry; appending gap-sweep AFTER it broke the anchor -> claude chain RED.
FIX (within n4 write set, test file is in no node's write set): reordered SUPPORT_SCRIPTS so 'kaola-workflow-gap-sweep.js' precedes 'kaola-workflow-run-chains.js' (run-chains stays last), in BOTH #274 byte copies. SUPPORT_SCRIPTS is a set; order is functionally irrelevant; byte-pair stays identical.
non_tdd_reason: registration-list reorder, config/glue.
build-green: node scripts/test-install-manifest-single-source.js exit 0 (was AssertionError #407); manifest byte-pair IDENTICAL; node scripts/validate-script-sync.js exit 0 (22 common, 5 families).
Scope: only the 2 manifest byte-copies (re-edited).
