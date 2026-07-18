# Final Validation — bundle-713-714

repo_kind: self-host (npm; package.json declares test:kaola-workflow:* scripts)
gate: four-chain machine receipt (kaola-workflow-run-chains.js), not prose attestation

## Chain receipt

- artifact: kaola-workflow/bundle-713-714/.cache/chain-receipt.json
- completedAt: 2026-07-18T05:18:26Z against headSha fe994d69885f5abf5234b5f116575201e8bb3fa9 (== claim_root_base.commit) + codeTreeHash e78c94a0281158c0 covering the full candidate tree
- chains: claude exit 0, codex exit 0, gitlab exit 0, gitea exit 0 — all accepted_red: false, attempts 1 each (single stamp run, KAOLA_RUN_CHAINS_TIMEOUT_MS=5400000 set from the start; no timeout flake this run)
- stamped AFTER every code change and every test-consumed prose/doc update for the final candidate had landed (n2 docs preceded the stamp; only validation-invisible .cache workflow state changed since)

## Meta validation_command (run once over the final post-documentation tree, n5 evidence)

- command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js — exit 0
- claude/codex/gitlab/gitea chains green sequentially (incl. adaptive-node 2479 assertions, replan 832, walkthrough passed); kimi-edition 577 assertions; opencode-edition 547 assertions
- evidence: kaola-workflow/bundle-713-714/.cache/n5-finalize.md (full log: session task bash-6ao6zjd6 output)

## Gate freshness (schema-2)

- code certifier n3-code-review: approved, findings_blocking 0, candidate_digest 4e9024c3b25112141780f7eb5b11f5487004eea99a470a729a2603194d9868a8 (current)
- adversarial gate n4-falsify-lifecycle-fixes: not_refuted, findings_blocking 0, same candidate_digest
- --verdict-check / --gate-verify / --barrier-check / --resume-check: all exit 0 at finalize entry

verdict: pass
