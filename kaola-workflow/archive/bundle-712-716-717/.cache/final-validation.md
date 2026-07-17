# Final Validation — bundle-712-716-717

repo_kind: self-host (npm; package.json declares test:kaola-workflow:* scripts)
gate: four-chain machine receipt (kaola-workflow-run-chains.js), not prose attestation

## Chain receipt

- artifact: kaola-workflow/bundle-712-716-717/.cache/chain-receipt.json
- stamped: 2026-07-17T22:01:22Z against headSha 683e4171616b957f25968b0ad2664ee8aab03ec7 (synth merge) + workTreeHash covering the n3 doc delta
- chains: claude exit 0 (2987048 ms), codex exit 0, gitlab exit 0, gitea exit 0 — all accepted_red: false, attempts 1 each (retry run after the timeout flake recorded in run-gaps-manual.md)
- stamped AFTER every code change and every test-consumed prose/doc update for the final candidate had landed (n3 docs preceded the stamp; only validation-invisible .cache workflow state changed since)

## Meta validation_command (run once over the final post-documentation tree, n6 evidence)

- command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js — exit 0
- claude/codex/gitlab/gitea chains green sequentially; kimi-edition 577 assertions; opencode-edition 547 assertions
- evidence: kaola-workflow/bundle-712-716-717/.cache/n6-finalize.md (full log: session task bash-fzxaa87i output)

## Gate freshness (schema-2)

- code certifier n4-code-review: approved, findings_blocking 0, candidate_digest b8b618a4… (current)
- adversarial gate n5-falsify-review-gate-fixes: not_refuted, findings_blocking 0, same candidate_digest
- --verdict-check / --gate-verify / --barrier-check / --resume-check: all exit 0 at finalize entry

verdict: pass
