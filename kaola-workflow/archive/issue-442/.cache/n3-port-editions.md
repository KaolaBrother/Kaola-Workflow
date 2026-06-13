evidence-binding: n3-port-editions 45c72b23c8dd
RE-MIRROR after canonical R1/R2/R3 repair — regenerated the 3 stale edition copies.
non_tdd_reason: mechanical edition re-mirror (codex byte copy + rename-normalized gitlab/gitea ports) — migration/glue, parity enforced by validate-script-sync + forge contract validators, no unit test.
build-green: orchestrator re-verified: node scripts/validate-script-sync.js => 'OK: 21 common scripts, 30 byte-identical groups, 4 rename-normalized families' exit 0 (was exit 1 with 3 stale mismatches before re-mirror); cmp canonical vs codex mirror => IDENTICAL; gitlab+gitea --forbidden-only PASS.
R1 FIX VERIFIED at port level: both forge ports now have 0 mangled forms (kaola-gitlab-workflow-gitlab gone); manifest paths built via PLUGIN_BASE+'-gitlab/.codex-plugin/plugin.json' resolving to REAL dirs; tag prefix 'kaola-workflow'+'--v' (root-coupled, not forge-mangled). Normalizer now touches only 2 legit script-identity lines per port (header comment + usage string), never data tokens.
Scope: git status shows only the 3 edition port files as this node's writes; validate-script-sync.js registration unchanged (persisted from prior pass).
