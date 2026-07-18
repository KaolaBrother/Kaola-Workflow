# Final Validation — issue-715

command: node scripts/kaola-workflow-run-chains.js --project issue-715 --json
result: pass — all four edition chains exit 0 (claude, codex, gitlab, gitea)
evidence: .cache/chain-receipt.json (codeTreeHash 33ff88e349cce7bc3073c0479ef4e5f4b13de21a3ac1e767edb78f67b7472973, headSha cd28e8e52fb641cf2173ced57c91a042e3c13e1e)
gate: plan-validator --finalize-check exit 0 (mode chain-receipt, checkedChanges 0)

verdict: pass

## Notes

- First receipt attempt timed out on the claude chain (30-min default cap) while the GitHub API
  rate limit was exhausted — a duration flake, not a red suite (codex/gitlab/gitea passed on the
  same run; the identical npm test passed over this tree at n6 terminal validation). Re-run with
  KAOLA_RUN_CHAINS_TIMEOUT_MS=3600000 after quota recovery: all four chains green.
- Terminal change-gate validation for the plan's Meta validation_command
  (npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js, exit 0
  over the final post-documentation tree) is recorded in .cache/n6-finalize-epoch3.md. The
  four-chain receipt above re-covers the code/test impact of the full candidate; finalize-step
  writes since the receipt (workflow state, this file, finalization-summary.md) are
  validation-invisible and do not stale it.
