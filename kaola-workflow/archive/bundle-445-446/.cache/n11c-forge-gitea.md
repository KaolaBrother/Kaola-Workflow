evidence-binding: n11c-forge-gitea 9b59fff51cea

non_tdd_reason: edition-sync regeneration from canonical (not a behavior change needing a failing test; the sync:editions command is the authoritative tool for forge port parity; gitea counterpart to n11b-forge-gitlab)

## Work done
- Ran `npm run sync:editions` to regenerate all 8 forge aggregator ports from canonical scripts
- 4 Gitea forge ports now byte-identical to renderForgePort(canonical):
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- 4 Gitlab ports unchanged (already fixed by n11b; sync:editions produces same output)
- edition-sync --check: all 12 forge aggregator ports in rename-normalized parity with canonical

## Verification
- edition-sync --check exits 0
- @generated header present in all 4 gitea files
- Forge script names correct in operator_hint strings (e.g. kaola-gitea-workflow-adaptive-node.js)

build-green: npm run sync:editions completed successfully; gitea forge ports regenerated from canonical; edition-sync --check passes
