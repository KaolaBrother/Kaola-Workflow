evidence-binding: n6-registration daf295857520

non_tdd_reason: Config/wiring — adding a script name to the frozen SUPPORT_SCRIPTS registration array + two validate-script-sync enrollment lists (COMMON_SCRIPTS, RENAME_NORMALIZED_FAMILIES). No new behavioral logic, no contract change; correctness proof = the arrays contain the right names and the #407 plant test stays green.

verification_tier: build-green

install-manifest edit (scripts/kaola-workflow-install-manifest.js, + byte-identical codex mirror via cp):
- inserted `'kaola-workflow-autopilot.js'` between `'kaola-workflow-gap-sweep.js'` and `'kaola-workflow-run-chains.js'` so run-chains stays LAST (the #407/#450 plant anchor preserved).
- `node scripts/test-install-manifest-single-source.js` → "test-install-manifest-single-source (#407/#412): PASSED" exit 0.
- run-chains-last confirmed: SUPPORT_SCRIPTS[last] = kaola-workflow-run-chains.js.

validate-script-sync.js additions (mirroring the release/gap-sweep precedent):
- COMMON_SCRIPTS gains `'kaola-workflow-autopilot.js'` (canonical↔codex byte pair).
- RENAME_NORMALIZED_FAMILIES gains `autopilot forge ports` family (reference scripts/kaola-workflow-autopilot.js; ports gitlab kaola-gitlab-workflow-autopilot.js + gitea kaola-gitea-workflow-autopilot.js).

INDEPENDENTLY VERIFIED actual state (build-green):
- base autopilot.js pair EXISTS (21221 B each, n2) and is BYTE-IDENTICAL → COMMON_SCRIPTS pair IN SYNC (NOT missing).
- install-manifest byte-pair: `cmp` IDENTICAL.
- `node scripts/validate-script-sync.js` exit 1 reporting EXACTLY two missing files: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-autopilot.js + plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-autopilot.js — the EXPECTED n7 hand-off (the RENAME_NORMALIZED_FAMILIES entry registers where the ports must live; n7 creates them). No drift, no unexpected missing files; the COMMON_SCRIPTS base pair is in sync.
- n6 git diff touches exactly the 3 declared files (install-manifest ×2 + validate-script-sync), no out-of-lane writes.

EXPECTED transient state: validate-script-sync / npm test chains will be RED for the 2 missing autopilot ports until n7 creates them; the 4-chain green proof is at n12-finalize after n7.
