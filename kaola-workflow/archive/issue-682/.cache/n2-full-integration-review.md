evidence-binding: n2-full-integration-review 5d73c678366d
verdict: pass
findings_blocking: 0
upstream_read: n1-routing-integration cd37ab2c55e3
execution_mode: main-session-inline-user-directed

# Full integration re-review

No blocking or non-blocking findings remain. This was an explicit user-directed inline self-review,
not an independent delegated verdict. Confidence rests on the reproduced R1 counterexample, the
new crash/retry regression matrix, full focused suites, and direct base-to-candidate inspection.

## R1 disposition

- The original finding was reproduced before implementation for both public close commands under
  ordinary retry and a simulated crash immediately after provisional plan persistence.
- `prepareReviewClose` retains provisional fan-out settlement semantics but now commits the same
  close compliance and replay-safe sidecars used by ordinary closes before running-set removal.
- Plan/compliance is durable first. Close timing is appended only for a currently open generation;
  close provenance is deduplicated by `(event, nodeId, nonce)`. A retry completes a missing prefix
  without creating duplicates.
- Bound bare-role review rows distinguish two same-role fan-out members by evidence binding, while
  legacy unbound rows preserve the old role-level idempotency behavior.

## Whole-candidate review

- The issue-682 journal/repair behavior remains agent-shaped: the journal supplies authoritative
  history, proofs, recovery, and the five-repair gate bound; it never selects an owner or rewrites
  the DAG. No scheduler state, automatic strategy, second state machine, or R17 fsync change exists.
- The canonical plan-run skeleton remains the single source for all six approved plan-run outputs;
  `generate-routing-surfaces --check` reports all 12 surfaces byte-match, and next surfaces are
  unchanged from the recovery base.
- The only tracked changes beyond approved `07f1532a` are the canonical skeleton, four synchronized
  adaptive-node runtimes, and the focused adaptive-node regressions. Approved public docs, ADR,
  repair card, and changelog text were not duplicated or rewritten during recovery.
- Root/Codex/GitLab/Gitea runtime parity, schema/profile parity, routing reachability, contract
  validators, script sync, edition sync, and workflow walkthrough all pass.

## Validation

- `node scripts/test-adaptive-node.js`: pass, 2038 assertions.
- `node scripts/test-generate-routing-surfaces.js`: pass, 33 assertions.
- `node scripts/test-route-reachability.js`: pass, 578 assertions.
- `node scripts/test-agent-profile-parity.js`: pass, 96 assertions.
- `node scripts/test-edition-sync.js`: pass, 41 assertions.
- `node scripts/simulate-workflow-walkthrough.js`: pass.
- All four contract validators, `edition-sync --check`, `validate-script-sync`, four runtime syntax
  checks, generator freshness, and `git diff --check 5d749661`: pass.
- Full sequential four-chain `npm test` remains reserved for n3.
