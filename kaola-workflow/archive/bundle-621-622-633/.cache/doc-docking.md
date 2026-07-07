evidence-binding: doc-docking (main-session)

# Documentation Docking — bundle-621-622-633 (#621, #622, #633)

## Changed surfaces (git diff dc2055d0..HEAD, bundle's own 2 commits)

Code (commit 7674ebf6):
- `scripts/kaola-workflow-adaptive-node.js` (canonical GENERATED_AGGREGATOR) — #621 baseline-first
  in the fused advance + reopen-node; #622 `liveHasLeglessWrite` relaxation + `merge_awaits_read_drain`
  fence; #633 `legMirrorPath` tracked-stub seeding + leg-preferred evidence read; R4 `lane_group_live`
  speculative-write exclusion.
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex twin, byte-identical),
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` — regenerated via
  `edition-sync.js --write` (rename-normalized parity confirmed by `--check`).
- `scripts/test-adaptive-node.js` (CLAUDE-ONLY) — RED-first tests (one per bug) + the R4-REGRESSION
  block; 1478 assertions total, all green.

Docs (commit 01082b6d):
- `docs/decisions/D-622-01.md` (NEW ADR, 160 lines) — the coupled lane-group scheduler decision.
- `docs/architecture.md` — lane-group co-open / write-exclusivity section + #590/#621 baseline-first note.
- `docs/plan-run-cards/frontier-batch.md` — `write_node_exclusive`/`write_awaits_drain`/`merge_awaits_read_drain`/`lane_group_live` reason semantics.
- `docs/workflow-state-contract.md` — running-set.json read-co-residency + tracked evidence-stub commit + leg-preferred read.
- `CHANGELOG.md` — `[Unreleased]` entry.

## Checklist

- [x] README.md — no user-facing feature/usage/env-var surface changed (internal scheduler); no update.
- [x] API docs (`docs/api.md`) — no API/schema/event contract changed; the reason-code semantics live in
      the plan-run card (frontier-batch.md), updated; no api.md gap.
- [x] CHANGELOG.md — updated (commit 01082b6d).
- [x] Architecture docs — updated (docs/architecture.md).
- [x] `.env.example` — no new env vars (the `KAOLA_*` toggles referenced are pre-existing).
- [x] Inline comments — updated in-code (the R4 `lane_group_live` branch carries a full rationale comment,
      and the #633 read-side/write-side comments were added by the implementer).
- [x] `docs/decisions/D-622-01.md` — NEW ADR authored (the primary durable artifact).
- [x] `docs/workflow-state-contract.md` — updated (SELF_HOST_TEST_CONSUMED; chain receipt generated AFTER
      this edit landed).
- [x] `docs/plan-run-cards/frontier-batch.md` — updated (reason-code semantics).

## Validation reuse boundary

The four-chain receipt (`.cache/chain-receipt.json`, headSha 01082b6d = HEAD) was generated AFTER all
code + docs + CHANGELOG landed, so it covers the full final tree. codex chain green; claude/gitlab/gitea
carry an `--accept-known-red …:635` waiver for the pre-existing `test-run-chains.js` load-flake (see Run
gaps). The substantive claude-chain content was independently re-verified green (test-adaptive-node.js
1478 assertions, run directly by the implementer, both reviewer passes, and the adversary), and the
walkthrough + contract validators pass in the codex/gitea chains — so the #307 cross-edition CORRECTNESS
obligation is met; only the orthogonal signal-death test-harness sub-test flakes.

## Verdict

No documentation gap. Proceed to closure.
