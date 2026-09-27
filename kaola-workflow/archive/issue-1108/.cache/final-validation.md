verdict: pass
validation_command: node scripts/kaola-workflow-run-chains.js --output /tmp/kw1108/chain-receipt.json && node scripts/kaola-workflow-run-chains.js --release-check --candidate HEAD --receipt /tmp/kw1108/chain-receipt.json
validated_candidate_hash: 778d7cf7ec163dceac04f59b3a058404fd63fe8e88d7227379d1a6046e7d6a93
