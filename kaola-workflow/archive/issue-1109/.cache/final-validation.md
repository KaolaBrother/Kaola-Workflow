verdict: pass
validation_command: node scripts/kaola-workflow-run-chains.js --output /tmp/kw1109/chain-receipt.json && node scripts/kaola-workflow-run-chains.js --release-check --candidate HEAD --receipt /tmp/kw1109/chain-receipt.json
validated_candidate_hash: 3ccfb89599a07f915b208ed2074409c9e11501ae808343bc9f5de6cec02a6226
