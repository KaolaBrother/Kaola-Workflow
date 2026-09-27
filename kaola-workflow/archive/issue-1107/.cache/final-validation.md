verdict: pass
validation_command: node scripts/kaola-workflow-run-chains.js --output /tmp/kw1107/chain-receipt.json && node scripts/kaola-workflow-run-chains.js --release-check --candidate HEAD --receipt /tmp/kw1107/chain-receipt.json
validated_candidate_hash: 602b8d3e76480e317749fe345593d469a5743865a4a74a2feadfe6eb5b107856
