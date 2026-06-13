evidence-binding: n2-impl-aggregator 14bcd784b493
REPAIR of n2 (G1 reviewer R1 CRITICAL + R2 HIGH + R3 LOW), test-first.
RED: pre-fix the new regression assertions failed: T9a/T9b/T9c (canonical source still contained literals kaola-workflow-gitlab / kaola-workflow-gitea / kaola-workflow--v), T9d (manifest path transform), T10 (second --cut returned refuse reason=non_monotonic_version, idempotent=undefined). 7 failing / 38 passing.
GREEN: orchestrator re-ran node scripts/test-release.js => 'test-release: all 45 assertions passed' exit 0.
R1 fix: PLUGIN_BASE='plugins/kaola-workflow' + suffix concatenation for the 3 CODEX_MANIFEST_RELPATHS; RELEASE_TAG_PREFIX='kaola-workflow'+'--v' used at all 5 tag sites. Verified: node scan for /kaola-workflow-(gitlab|gitea)|kaola-workflow--v/ => 0 matches, so rename-normalization is now a no-op on the body and forge ports become correct (reference real plugins/kaola-workflow-gitlab/... paths + kaola-workflow--v tags).
R2 fix: idempotent-completion short-circuit at top of runCut (before monotonic guard) — a receipt with git_tag done for this version returns {result:ok, idempotent:true} no-op; partial-crash resume + new-version monotonic guard preserved.
R3: removed dead 'os' + 'spawnSync' child_process imports (os require:false; spawnSync only remains in a comment).
Scope: git status shows only the 2 declared files as this node's writes (M validate-script-sync.js is the prior n3 registration, pre-baseline for this reopened node). All fixtures in os.tmpdir().
