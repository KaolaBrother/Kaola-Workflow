verdict: pass

# Final Validation — issue-544 (self-host npm repo)

Repo kind: **self-host (npm)** — validation gate is the machine-verifiable chain receipt (`.cache/chain-receipt.json`), not this file. This file records the consolidated validation evidence per finalize Step 1.

## Chain receipt (the gate)
- `.cache/chain-receipt.json` headSha `afad79ec` == current HEAD `afad79ec` (not stale).
- All four cross-edition chains exit 0: claude (875s), codex (34s), gitlab (395s), gitea (398s).
- This satisfies the #307 four-chain obligation (the change touches `kaola-workflow-adaptive-schema.js`, the ×4 byte-identical cross-edition anchor).
- Note: an earlier chain run hit a transient GitHub rate-limit burst (claim-hardening network errors + the closed-issue #519 transient-stderr flake); the rate limit reset and the re-run is clean. The failures were environmental, not introduced by #544 (n4 had all four green ~45 min earlier; the failures are in claim/classifier/gh-fetch tests, untouched by this effort-tier change).

## Scope-relevant validation (node n4 evidence + re-verified)
- `node scripts/test-opencode-edition.js` → 300 assertions (S1 flip + S1-contract block + A12-unknown flip GREEN).
- `node scripts/test-adaptive-node.js` → 1030 assertions (variant NAMES max/high preserved — Cases 4/5/6/7/9 GREEN; falsy-guard intact).
- `node scripts/validate-script-sync.js` → in sync (×4 schema md5 1f7cd6ee00e2c1edc2ffd377e410ece3 byte-identical).
- `node scripts/sync-opencode-edition.js --check` → 15 agents + 12 commands in parity.
- `bash -n install-opencode.sh` → OK.
- opencode.json committed neutral template byte-identical (`git diff opencode.json` empty).

## Acceptance (#544) — all met (node n4 verification matrix)
- anthropic-contract incl. GLM-via-z.ai → `thinking` budget (not reasoningEffort) ✓
- openai/google contracts → reasoningEffort ✓
- unknown provider → safe default (no de-tier) ✓
- model switch → documented re-sync (runtime dispatch never de-tiers) ✓
- opus↔top / sonnet↔second parity vs canonical reasoning role set ✓

## Reuse boundary
Validation covers code/test impact through node n2/n3 + the four-chain receipt run at HEAD; the finalize-stage CHANGELOG.md + README.md:361 (allowband) edits are docs-only and outside the rerun trigger.
