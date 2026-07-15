verdict: pass
source: chain-receipt
validated_command: node scripts/kaola-workflow-run-chains.js --project issue-687
validated_at_head: 484d8cc780ab6e5d2aa60b261f3f29893a06be10
validated_work_tree_hash: 3d02284785304939d79afb68727f72b879f4f45ba748dbb2cde60f49a205f840
validated_code_tree_hash: 8b087b9341dfe431856dadc7b0ecc0bf3cc1fec50af24f3fecaccce1877a9596
completed_at: 2026-07-15T08:39:53.414Z

All four sequential self-host chains passed on the final candidate: Claude, Codex, GitLab, and
Gitea. The authoritative machine receipt is `.cache/chain-receipt.json`; no accepted-red waiver,
retry, timeout, or signal occurred. The adaptive resume, gate-verify, whole-plan barrier, and
verdict gates also exited 0 before the receipt run.
