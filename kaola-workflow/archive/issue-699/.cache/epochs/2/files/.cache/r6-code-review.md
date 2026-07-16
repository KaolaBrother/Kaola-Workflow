evidence-binding: r6-code-review 450fb7b6bb95
verdict: fail
findings_blocking: 0
certifier_kind: code
certifier_aggregation: sequence
certifier_gate_digest: d36bf2fabd6cc557197d01cba8e1900125d042a8888b0c3fd63d3ad093bbddd9
certifier_epoch_lineage_id: 013e796d486ea0426548c2b1448a20d92cd95e62e4a0ee3b601048f8ebf1e4f7
certifier_inherited_frontier_digest: 42b1b3321089d2e423e359b2b5afb51496e7e26548a52986f8a01f875275583c
certified_candidate_digest: 07984b68e9c52fff512de5fec6f4e613251a3c5620aa93417d6cd063a5ab159d
finding: id=R6-699-01 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=projection-bound-child-is-rejected-by-finalize
finding: id=R6-699-02 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=valid-planless-epoch-one-cannot-archive
finding: id=R6-699-03 scope=in_scope action=fix status=open severity=medium fix_role=build-error-resolver rationale=packaged-planner-packet-fixtures-omit-snapshot-authority
finding: id=R6-699-04 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=walkthrough-timeout-is-shorter-than-focused-suite-runtime

# Findings

## HIGH — R6-699-01: every new projection-bound child is rejected by finalization

Requirement: N7-699-04 child/snapshot cross-binding and the schema-2 finalization authority chain.

Owner: `r3-lineage-proof-repair` for the transaction/snapshot representation and
`r4-forge-contract-repair` for the finalization consumer; repair role `tdd-guide`.

Locations:

- `scripts/kaola-workflow-adaptive-schema.js:360-362` declares epoch schema 2 but leaves
  `REPLAN_TRANSACTION_SCHEMA_VERSION` at 1.
- `scripts/kaola-workflow-replan.js:1074-1091` stamps every newly prepared transaction with that
  version 1 constant.
- `scripts/kaola-workflow-plan-validator.js:2050-2057` accepts the projection digest only when
  `tx.schema_version === 2`; every version 1 transaction is treated as a historical externally sealed
  transaction whose child must contain literal `pending`.
- `scripts/test-replan.js:1069-1090` proves that a new child correctly contains the real
  `tx.snapshot.authority_digest`, but never sends that committed child through `--finalize-check`.
  The finalization integration beginning at `scripts/test-replan.js:2192` covers an uncommitted fence,
  so it cannot expose the post-commit discriminator mismatch.
- The generated Codex, GitLab, and Gitea schema/replan/validator mirrors contain the same mismatch.

Impact: a canonical schema-2 re-plan can prepare, freeze, snapshot, and report `committed`, yet the
first finalization check rejects the legitimate child as `epoch_state_mismatch`. The new workflow
therefore cannot reach its release gate after a real epoch transition.

Focused reproduction: I loaded the existing `initFixture` and `advanceToAttestedChild` helper prelude
from `scripts/test-replan.js` in memory (no repository file was created), called the canonical
`resumeReplan` path through `committed`, then invoked:

`node scripts/kaola-workflow-plan-validator.js <fixture>/kaola-workflow/issue-699/workflow-plan.md --finalize-check --json`

Observed values:

- `resume_result: committed`
- `transaction_schema_version: 1`
- transaction snapshot authority digest and child `parent_snapshot_manifest_digest` were identical
  (`196ffda74eb9c45993a7e4337430d55055af01965a27064c846370ce347c3f1c` in this run)
- finalization exited 1 with
  `{"result":"refuse","reason":"epoch_state_mismatch","errors":["parent_snapshot_manifest_digest"]}`

Acceptance for resolution:

1. Use one authoritative discriminator that distinguishes newly projection-bound transactions from
   verified historical external seals; do not accept `pending` for a new schema-2 child.
2. Add a regression that performs a canonical prepare -> planner handoff -> commit, then exercises
   `--finalize-check`; the epoch binding must pass and the fixture may proceed to the next independent
   gate (for example `chains_unverified` when no chain receipt is installed).
3. Preserve the historical epoch-1 snapshot compatibility receipt and regenerate all three plugin
   mirrors byte-for-byte modulo forge names.

## HIGH — R6-699-02: the legal planless epoch-1 state cannot be archived

Requirement: A5-699-01, including both legal initial authority forms and fail-closed archive behavior.

Owner: `r2-lifecycle-transport-repair` for lifecycle behavior and `r3-lineage-proof-repair` for the
recursive verifier; repair role `tdd-guide`.

Locations:

- `scripts/kaola-workflow-replan.js:2354-2374` correctly accepts zero snapshots for plan epoch 1 and
  `active_snapshot_manifest_digest: none`.
- `scripts/kaola-workflow-replan.js:2375-2380` then unconditionally reads `workflow-plan.md` and
  compares it with `active_plan_hash`, although the legal planless state intentionally has no plan and
  records `active_plan_hash: none`.
- `scripts/kaola-workflow-claim.js:2078-2093` makes that verifier a mandatory precondition of every
  archive.
- `scripts/simulate-workflow-walkthrough.js:15245-15280` tests planless claim only until the first
  handoff, while `scripts/simulate-workflow-walkthrough.js:15288-15306` tests archive refusal only via
  the forced-refusal seam. There is no positive archive test for a valid planless authority.

Impact: release/finalize/watch callers now fail closed, but a fresh valid claim cannot take any archive
path before a plan is handed off. This violates one of the two initial authority forms and turns a
valid planless project into durable workflow residue.

Focused reproduction: in a disposable Git repository I planted a local roadmap issue, ran offline
`kaola-workflow-claim.js startup --target-issue 6999`, and called the exported `archiveProjectDir` on
the untouched claim. The state was `epoch_schema_version: 2`, `plan_epoch: 1`,
`active_plan_hash: none`, `active_snapshot_manifest_digest: none`, and no plan existed. The result was:

`{"archived":false,"archive_incomplete":true,"missing":[],"snapshot_error":"snapshot_active_plan_mismatch"}`

Acceptance for resolution:

1. For the legal planless form, require `active_plan_hash: none` and absence of `workflow-plan.md`; do
   not attempt to hash an absent plan. Continue to reject a plan/hash mismatch in the planned form.
2. Add a positive direct archive regression for a fresh planless epoch-1 claim and at least one caller
   regression proving that explicit archive success, not a forced refusal, drives cleanup.
3. Keep archive failure fail-closed and preserve the live project on every verifier error.

## MEDIUM — R6-699-03: all packaged planner-packet fixtures omit snapshot authority

Requirement: N7-699-04 projection transport plus A5-699-03 four-edition packaged validation.

Owner: `r3-lineage-proof-repair` for the direct contract fixture shape and
`r4-forge-contract-repair` for packaged/forge parity; repair role `build-error-resolver`.

Locations:

- `scripts/validate-kaola-workflow-contracts.js:1037-1055` constructs a transaction without
  `transaction.snapshot` and immediately calls `buildPlannerPacket`.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:4965-4984` and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:4783-4802` repeat the obsolete
  shape.
- `plugins/kaola-workflow/scripts/kaola-workflow-replan.js:1384-1385`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js:1385-1386`, and
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js:1385-1386` require the projection
  and digest, as the production contract intends.

Impact: the Codex packaged contract validator and both forge edition suites abort with an unhandled
`TypeError` before they can certify the implementation. This is fixture drift, not evidence that the
projection should be made optional.

Focused reproductions:

- `node scripts/validate-kaola-workflow-contracts.js` -> exit 1 at the Codex replan port, reading
  `transaction.snapshot.authority_projection` from `undefined`.
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> exit 1 at the
  equivalent GitLab packet fixture.
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> exit 1 at the
  equivalent Gitea packet fixture.

Acceptance for resolution: construct a valid non-circular `snapshot.authority_projection` plus its
canonical digest in all three direct fixtures (prefer the canonical transaction builder where
practical), retain negative missing/tampered projection coverage, and make all three packaged commands
pass without weakening `buildPlannerPacket`.

## MEDIUM — R6-699-04: the integrated transport wrapper times out a passing focused suite

Requirement: the live review -> mechanical source -> planner transition and N7-699-06 durable
interruption/CAS proof must be executable through the focused walkthrough gate.

Owner: `r2-lifecycle-transport-repair` for the walkthrough integration; repair role `tdd-guide`.

Locations:

- `scripts/simulate-workflow-walkthrough.js:15388-15392` launches all of `scripts/test-replan.js`
  with a fixed `timeout: 120000` and asserts only `result.status === 0`.
- The wrapper does not report `result.error`/`ETIMEDOUT`, so the failure message obscures the actual
  timeout.

Impact: the required five-scenario focused walkthrough is deterministically red even though its nested
suite is green. On this review host the standalone suite needed more than twice the wrapper budget.

Focused reproductions:

- `node scripts/simulate-workflow-walkthrough.js --only testReviewOutcomeTransport699` -> exit 1 at
  `simulate-workflow-walkthrough.js:15392` after the child is terminated by the nested timeout.
- `/usr/bin/time -p node scripts/test-replan.js` -> `test-replan: PASSED (888 assertions)`,
  `real 251.75` seconds.

Acceptance for resolution: remove the redundant short nested deadline or set a supported, non-flaky
budget above the actual suite envelope; surface `result.error` explicitly; and prove that the focused
walkthrough scenario and standalone 888-assertion suite both pass.

# Verdict

BLOCK. No CRITICAL finding was found, so `findings_blocking` is 0 under the schema contract. The four
open `scope=in_scope action=fix` findings are nevertheless mechanical finalization blockers. The
candidate must return through a bounded repair cycle before this certifier can issue `verdict: pass`.

# Review authority and candidate binding

- Reviewed base: `d59b191c925c634a36a74592ac9a9d21dfc93982`.
- Frozen epoch-2 plan hash: `356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938`.
- Direct upstream: `r5-documentation-correction 7dbb4753c89a`.
- The certifier tuple above was recomputed from the frozen plan and current candidate and matched the
  seeded values exactly: gate digest `d36bf2fabd6cc557197d01cba8e1900125d042a8888b0c3fd63d3ad093bbddd9`,
  lineage `013e796d486ea0426548c2b1448a20d92cd95e62e4a0ee3b601048f8ebf1e4f7`, inherited frontier
  `42b1b3321089d2e423e359b2b5afb51496e7e26548a52986f8a01f875275583c`, candidate
  `07984b68e9c52fff512de5fec6f4e613251a3c5620aa93417d6cd063a5ab159d`.
- Immutable epoch-1 manifest, physical `files/` snapshot, archived review receipt/journal, and child
  linkage were inspected. The historical external-seal receipt remains present and its manifest/child
  digests match the active epoch-2 lineage; this review did not modify or re-author it.
- Read the issue body/comments, r1-r5 evidence, active transaction/state, complete tracked diff and
  candidate-only files, generated mirrors, tests, docs, and the core claim/handoff/replan/validator
  consumers. `git diff --check` passed.

# Seven-source-requirement disposition

1. A5-699-01 initial authority: planless claim and planless -> planned publication probes pass, but
   positive planless archival is broken by R6-699-02.
2. A5-699-02 offline/no-history: focused offline dominance and zero-commit/canonical-empty-tree probes
   pass for native-off and native-on configurations.
3. Live review-to-planner transport: the canonical repair source/prepare/commit cases pass in the
   standalone re-plan suite, but the required integrated wrapper is red under R6-699-04.
4. N7-699-04 child/snapshot cross-binding: projection/full-seal/tamper cases pass in the focused suite,
   but a real committed child cannot finalize under R6-699-01 and packaged fixtures are red under
   R6-699-03.
5. N7-699-05 Case B: typed terminal diagnosis artifacts, no-review route, citations, and one-shot
   budget behavior pass in the focused 888-assertion suite.
6. N7-699-06 durable prefixes/CAS: the 41 base families, five deterministic dynamic forms, crash
   prefixes, and four-seam x three-axis CAS matrix pass in the focused suite. No claim of full package
   certification is made while R6-699-03/R6-699-04 remain open.
7. A5-699-03 forge neutrality: edition/script sync and both standalone forbidden-token probes pass;
   GitLab/Gitea package execution remains blocked by R6-699-03 rather than by a forbidden token.

# Focused validation record

- `node scripts/test-replan.js` -> PASS, 888 assertions; measured `real 251.75` seconds.
- Initial authority/archive-refusal/offline focused walkthrough subset -> PASS, four scenarios.
- Positive disposable planless archive probe -> reproduced `snapshot_active_plan_mismatch`.
- Disposable canonical committed-child finalization probe -> reproduced `epoch_state_mismatch` on
  `parent_snapshot_manifest_digest`.
- `node scripts/validate-kaola-workflow-contracts.js` -> expected current FAIL, R6-699-03.
- GitLab and Gitea direct edition suites -> expected current FAIL, R6-699-03.
- `node scripts/simulate-workflow-walkthrough.js --only testReviewOutcomeTransport699` -> expected
  current FAIL, R6-699-04.
- `node scripts/edition-sync.js --check` -> PASS: 12 forge ports, 25 common mirrors, 27 byte-identical
  groups.
- `node scripts/validate-script-sync.js` -> PASS: common/normalized/hook/export-superset families.
- Correct GitLab and Gitea standalone `--forbidden-only` checks over their plan-validator/replan ports
  -> PASS.
- Current frozen plan `--resume-check` -> PASS. Current `--finalize-check` advances through epoch
  binding and refuses only `chains_unverified`, as expected before final chain execution.
- Full `npm test` and the four complete package chains were not run, per the node brief and dispatch;
  the focused failures above already prevent a valid full-chain certification claim.
