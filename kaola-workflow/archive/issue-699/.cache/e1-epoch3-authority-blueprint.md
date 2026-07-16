evidence-binding: e1-epoch3-authority-blueprint a224da30381a

# Epoch 3 Authority Repair Blueprint

## Outcome

Implement the third and final authority repair as two serialized runtime changes, followed by packaging, documentation, and review. The repaired protocol must:

- distinguish immutable authored plan authority from mutable runtime progress;
- preserve every committed transaction and consumed repair source as immutable history before installing a successor;
- validate historical version-1 evidence with its sealed historical rules instead of re-deriving it with the current writer;
- accept the legal planless epoch-1 archive shape and reject every partial or hybrid shape;
- bind every new promoted state to the actual first node of its child plan;
- retain the two-transition replan ceiling without consuming budget or rotating authority on a refused third transition; and
- keep Claude, Codex, GitLab, and Gitea behaviorally equivalent at the semantic safety boundary, without requiring narration, prompt wording, or implementation-text parity.

No product source is modified by this planning node.

files_to_create: none

files_to_modify:
  - scripts/kaola-workflow-replan.js
  - plugins/kaola-workflow/scripts/kaola-workflow-replan.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js
  - scripts/kaola-workflow-adaptive-schema.js
  - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
  - plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
  - scripts/kaola-workflow-plan-validator.js
  - plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
  - scripts/kaola-workflow-claim.js
  - plugins/kaola-workflow/scripts/kaola-workflow-claim.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
  - scripts/kaola-workflow-closure-contract.js
  - plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
  - plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
  - scripts/kaola-workflow-adaptive-handoff.js
  - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-handoff.js
  - plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-handoff.js
  - scripts/kaola-workflow-adaptive-node.js
  - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
  - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-node.js
  - plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js
  - scripts/replan-conformance-fixtures.json
  - scripts/test-replan.js
  - scripts/test-adaptive-handoff.js
  - scripts/test-adaptive-node.js
  - scripts/test-claim-hardening.js
  - scripts/test-bundle-finalize.js
  - scripts/simulate-workflow-walkthrough.js
  - scripts/validate-kaola-workflow-contracts.js
  - plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  - plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  - README.md
  - CHANGELOG.md
  - docs/api.md
  - docs/architecture.md
  - docs/workflow-state-contract.md
  - docs/conventions.md
  - docs/plan-run-cards/repair-routing.md
  - docs/decisions/D-699-01.md

build_sequence: E2 versioned authority -> E3 lifecycle -> E4 fixtures -> E5 docs -> E6/E7 reviews -> E8/E9/E10 falsifiers -> E11 finalize
  1. RED: add focused conformance cases for committed-child legal progress, plan/compliance/task/state tampering, historical version-1 replay, committed transaction rotation, repair-source rotation, planless epoch-1 archival, first-node publication, and third-transition budget refusal.
  2. GREEN A: implement the versioned authority verifier and crash-safe history rotation in all four replan, adaptive-schema, and plan-validator families; keep the four editions semantically aligned from the same conformance fixtures.
  3. GREEN B: update archive/finalization consumers and adaptive source producers in all four claim, closure-contract, adaptive-handoff, and adaptive-node families; add direct and caller-level lifecycle tests.
  4. PACKAGE: repair Codex, GitLab, and Gitea packaged fixtures with a valid non-circular snapshot projection and run their packaged validators.
  5. DOCUMENT: describe the authored/runtime authority split, version matrix, rotation order, planless shape, failure modes, and compatibility promise.
  6. REVIEW: run detached code review, then security review, then parallel read-only budget, historical/archive, and publication/edition falsification; stop downstream execution and route any finding through workflow repair/replan to the owning write surface.
  7. FINALIZE: run the complete repository contract, focused replan, lifecycle, walkthrough, packaged-edition, and generated-diff gates before issue closure.

## Authority Model and Invariants

### A. Immutable authored plan authority

The immutable authored surface is exactly the input to the existing plan hash: '## Meta', '## Nodes', and any authored '## Node Briefs'. '## Node Ledger' and '## Compliance' are runtime surfaces and are not byte-equality inputs after commitment.

For every active planned epoch, require all three values to agree:

1. 'readStoredHash(workflow-plan.md)';
2. 'computePlanHash(workflow-plan.md)' over the authored surface; and
3. the active transaction/state child plan hash.

Before commitment, activation steps may continue to require the exact staged child bytes. After commitment, never compare the whole live plan with the originally staged plan: legal ledger/compliance mutation must survive while authored-surface tampering still refuses.

### B. Mutable runtime authority

Post-commit verification must parse and validate current runtime surfaces rather than merely ignore them:

- 'Node Ledger': exactly one row for every authored node, no unknown or duplicate node, legal status vocabulary, and dependency/runtime state accepted by the scheduler's current transition rules, including legal review/reopen resets.
- 'Compliance': exactly the authored requirement rows in deterministic node/requirement order, no unknown or duplicate binding; open nodes remain pending, while closed nodes carry the required invoked/evidence binding.
- task mirror: semantically equals the current Nodes plus Ledger status and current source plan hash; generated timestamps may differ. A missing, stale, extra, or cross-plan mirror refuses successor preparation.
- workflow state: epoch, claim, replan counters, active plan hash, active snapshot binding, and planning evidence are stable authority. Mutable position/evidence/timestamp fields may evolve only through valid runtime transitions.
- current next action must be derivable without refusal from the plan, ledger, and state.

The verifier should expose one shared result object, for example:

'verifyCurrentEpochAuthority({ projectDir, state, plan, taskMirror, transaction, snapshotChain }) -> { mode, transactionVersion, parentBindingKind, planHash, firstNode, mutableProgressDigest }'

All prepare, resume, archive, finalize, and plan-validator callers consume this result; callers must not rebuild partial variants of these rules.

### C. Planless epoch-1 authority

The only legal planless shape is:

- 'plan_epoch: 1';
- 'active_plan_hash: none';
- active epoch snapshot binding absent/none;
- Planning Evidence plan hash, snapshot digest, first node id, and first node role all absent/none;
- no 'workflow-plan.md';
- no historical epoch snapshot directories; and
- no live task mirror claiming plan authority.

'verifyAllEpochSnapshots' must branch before reading a plan. It returns a positive planless result only for the complete shape above. Any hybrid—plan file with no hash, hash without plan, task mirror without plan, first-node residue, snapshot residue, or later epoch without a plan—refuses before archive, finalize, release cleanup, or watch cleanup mutates the project.

### D. Actual child first-node publication

'validateChildPlan' records the child's actual first node id and role. Every newly emitted fenced and unfenced promoted state copies those values from 'transaction.child', never from the parent state. Current-epoch validation compares state Planning Evidence to the current plan's actual first node. A stale first node inside already sealed version-1 history is compatibility data only; it must not authorize new output and must not be silently rewritten.

### E. Budget invariant

The current ceiling remains two transitions. Evaluate the prospective count before source consumption, committed-transaction rotation, snapshot creation, active transaction replacement, or state fencing. A refused third transition leaves byte-identical:

- active committed transaction;
- current repair source;
- plan, state, task mirror, and snapshot directories;
- committed transaction and source history directories; and
- replan count and epoch.

## Receipt and Snapshot Version Matrix

| Authority kind | Recognition | Verification rule | May current writer regenerate it? | Child binding rule |
|---|---|---|---|---|
| Transaction v1, external/legacy parent snapshot | 'schema_version: 1' plus recursively verified schema-1 manifest/external binding | Treat recorded bytes and recorded digests as sealed historical evidence; verify manifest index, transaction id, phase, and digest linkage. Do not recompute fenced/final states with current promotion code. | No | Legacy 'pending' only where the verified parent binding is external/legacy |
| Transaction v1 inside schema-2 projected snapshot | 'schema_version: 1' plus exact file indexed by a verified schema-2 manifest | Verify exact archived transaction bytes/digest and manifest projection linkage; do not reinterpret receipts with v2 writer semantics. | No | Projection digest, because the verified parent binding kind is projected |
| Transaction v2 | 'schema_version: 2' | Validate canonical v2 fields, current-authored authority, mutable runtime consistency, predecessor history link, source history link when present, and v2 activation receipts | Yes, only for a newly created v2 transaction | Projection digest for projected parent; legacy pending only if a valid v2 transition is intentionally supported from a recursively verified external parent |
| Snapshot manifest v1 | manifest schema 1 | Preserve its historical external-binding meaning and exact indexed bytes | No | Supplies 'legacy_external' discriminator |
| Snapshot manifest v2 | manifest schema 2 | Verify exact file index, authority projection, digest, and predecessor/source history entries recursively | Yes, for new snapshots | Supplies 'projected' discriminator |

The finalization discriminator is the recursively verified parent snapshot binding kind, not the active transaction schema number alone. This resolves the current failure where projection-bound schema-1 children are incorrectly forced through the legacy 'pending' rule. Unknown versions, missing discriminators, unindexed history files, or version/field hybrids refuse.

Version-1 compatibility is read-only: accept unchanged evidence with its historical meaning, but never emit new v1 transactions, rewrite v1 files, or pass their receipts through current canonical serializers.

## Crash-Safe Committed-Transaction Rotation

Under the scheduler lock, successor preparation follows this exact order:

1. validate budget without mutation;
2. verify the active committed transaction using its own version rules;
3. verify current authored plan authority, mutable runtime consistency, and the complete snapshot chain;
4. serialize the active transaction's exact existing bytes and calculate digest/size;
5. create-exclusive '.cache/committed-transactions/<transaction_id>.json', write the exact bytes, fsync the file, fsync its directory, reread, and verify id/version/digest/size;
6. if the history path exists, accept only an exact-byte match; otherwise refuse collision/tampering;
7. construct the successor v2 transaction with an immutable predecessor link '{ transaction_id, schema_version, path, digest, size }';
8. atomically install/fsync the successor active transaction;
9. only then begin normal child-plan/fenced-state/task/cleanup/commit/unfenced activation.

Crash/retry outcomes:

- crash before step 5: old committed transaction remains active, no successor exists;
- crash after durable history but before step 8: old transaction remains active and retry reuses the exact history file;
- crash after step 8: resume operates only from the successor transaction and verifies its predecessor link;
- collision, truncated write, wrong id/version/digest, or history link not present in the next snapshot projection: refuse and preserve active authority.

Never delete or overwrite committed history. Snapshot manifests must index the preserved predecessor file by exact path/digest/size so later replay does not depend on the mutable active transaction path.

## Crash-Safe Repair-Source Rotation

Repair source settlement and successor preparation have separate responsibilities:

1. before accepting a new review outcome, verify the live source is exactly the source referenced by the committed transaction and all applicable snapshots;
2. archive its exact bytes at '.cache/replan-sources/<source-file-digest>.json' using create-exclusive write, file fsync, directory fsync, reread, and exact id/digest/size verification;
3. if the path already exists, require exact bytes;
4. unlink the live source only after the archive is durable, then fsync the parent directory;
5. atomically write/fsync the new source with a 'rotated_from' link to the archived source;
6. the next v2 transaction and schema-2 snapshot projection bind that history link.

Retry must recognize: live-old only, archived-old plus live-old, archived-old with live absent, and archived-old plus exact live-new. Any other combination refuses without overwriting history. A distinct new outcome while an unarchived conflicting source is live remains 'replan_source_conflict'.

Budget refusal occurs before transaction-side consumption/rotation. If review settlement has already durably published a new source but replan consent is still required, prepare must leave that source byte-identical and report the consent/budget state; it must not advance count, epoch, snapshot, or transaction authority.

## Tamper and Compatibility Matrix

| Mutation / replay case | Expected result | Protecting check |
|---|---|---|
| Ledger advances through a legal node start/complete/reopen transition after commit | accept | parsed scheduler-valid runtime consistency |
| Compliance changes from pending to a valid invoked/evidence row after node closure | accept | exact requirement ownership plus lifecycle rule |
| Task mirror timestamp alone changes | accept | semantic mirror comparison |
| Meta, Nodes, Briefs, node dependency, role, or brief changes | refuse | stored hash = recomputed authored hash = active child hash |
| Unknown/duplicate/missing Ledger row or illegal status | refuse | strict Ledger parser and node-set equality |
| Unknown/duplicate/missing Compliance row, cross-node evidence, or completed node without required evidence | refuse | strict Compliance parser and authored requirement equality |
| Stale/missing/extra task mirror entry or wrong source plan hash | refuse | semantic mirror equality |
| State active hash, snapshot digest, first-node id/role, epoch, claim, or count changes | refuse | stable state authority comparison |
| Legal Current Position/Last Evidence/timestamp progress | accept | validated mutable state projection |
| Committed predecessor history missing, truncated, overwritten, wrong id/version, or not manifest-indexed | refuse | exact history link plus snapshot file index |
| Consumed source history missing, altered, colliding, or not projection-bound | refuse | exact source history link plus snapshot projection |
| Historical v1 receipt differs from sealed manifest bytes | refuse | manifest exact file digest/size |
| Unchanged historical v1 receipt cannot be reproduced by current writer | accept | sealed-version verifier; no current-writer re-derivation |
| Projection-bound schema-1 child transaction | accept | verified parent binding kind, not transaction schema alone |
| Planless canonical epoch 1 | accept archive/finalize | explicit planless branch before plan read |
| Any planless/planned hybrid | refuse with project left intact | complete mode-shape validation |
| Child state carries parent's stale first node | refuse for new output | actual child first-node binding |
| Third replan attempt at ceiling | refuse without byte changes | budget-first ordering |
| Unknown transaction/manifest version | refuse | closed version dispatcher |

## TDD Task Packets and Ownership

### Task E2 — Versioned epoch authority and history

Dependencies: E1 only. Must complete before E3.

Exclusive write set:

- 'scripts/kaola-workflow-replan.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-replan.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js';
- 'scripts/kaola-workflow-adaptive-schema.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js';
- 'scripts/kaola-workflow-plan-validator.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js';
- 'scripts/replan-conformance-fixtures.json';
- 'scripts/test-replan.js'.

RED tests to land before implementation:

1. commit a child, legally advance Ledger/Compliance/task/state, then successfully prepare and commit the next child;
2. repeat with each authored and runtime tamper in the matrix;
3. prove the first committed transaction is preserved byte-for-byte and linked by successor and snapshot;
4. replay the preserved schema-1 transaction whose historical fenced/final receipts differ from current writer output;
5. finalize a projection-bound schema-1 child using the parent-binding discriminator;
6. inject crashes at every history-copy/active-replace boundary and prove idempotent retry;
7. refuse a third transition with a before/after recursive byte manifest showing zero mutation;
8. publish the child plan's actual first node in both fenced and unfenced state;
9. retain the complete existing 888-assertion replan baseline.

Implementation notes:

- introduce an explicit accepting dispatcher for v1 and v2, while making the writer emit v2 only;
- keep verification helpers pure where possible and return structured refusal codes;
- place edition-neutral test vectors in the conformance fixture, not prose-specific snapshots;
- do not let mirrored prompt wording become a compatibility requirement.

Failure routing: schema/version, snapshot, committed-history, budget, or current-authority failures return to E2. E2 must not edit lifecycle or package-owned files.

### Task E3 — Source settlement and lifecycle consumers

Dependencies: E2. Serialized because it consumes E2's verifier/rotation interfaces.

Exclusive write set:

- 'scripts/kaola-workflow-claim.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-claim.js';
- 'scripts/kaola-workflow-closure-contract.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js';
- 'scripts/kaola-workflow-adaptive-handoff.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-handoff.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-handoff.js';
- 'scripts/kaola-workflow-adaptive-node.js';
- 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js';
- 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-node.js';
- 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js';
- 'scripts/test-adaptive-handoff.js';
- 'scripts/test-adaptive-node.js';
- 'scripts/test-claim-hardening.js';
- 'scripts/test-bundle-finalize.js';
- 'scripts/simulate-workflow-walkthrough.js'.

RED tests:

1. direct archive of the canonical planless epoch-1 shape succeeds;
2. finalize, release, and watch callers archive that same shape successfully;
3. every planless/planned hybrid refuses before cleanup and retains the live project;
4. old source archives exactly, new source publishes with 'rotated_from', and the next snapshot indexes both;
5. crash after each source-copy/unlink/new-write boundary resumes idempotently;
6. conflicting, truncated, or tampered source history refuses without overwrite;
7. stale parent first-node publication is rejected for new output;
8. replace the walkthrough's nested whole-suite 120-second spawn with a focused scenario or no artificial deadline, and include command, status, stdout, and stderr on failure.

Failure routing: source settlement, planless archive/finalize, cleanup ordering, handoff, or first-node consumer failures return to E3. Runtime authority semantics discovered here return to E2 rather than being duplicated.

### Task E4 — Packaged edition conformance

Dependencies: E2 and E3.

Exclusive write set:

- 'scripts/validate-kaola-workflow-contracts.js';
- 'plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js';
- 'plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js'.

Update the Codex, GitLab, and Gitea package fixtures to include a valid transaction snapshot with a non-circular authority projection/digest. Preserve negative fixtures for missing, malformed, and mismatched snapshot authority. Prove each package independently and prove the aggregate validator.

Failure routing: fixture construction or packaged validation returns to E4; semantic verifier failures return to E2/E3 owner.

### Task E5 — Contract documentation

Dependencies: E2 through E4.

Exclusive write set:

- 'README.md';
- 'CHANGELOG.md';
- 'docs/api.md';
- 'docs/architecture.md';
- 'docs/workflow-state-contract.md';
- 'docs/conventions.md';
- 'docs/plan-run-cards/repair-routing.md';
- 'docs/decisions/D-699-01.md'.

Document transaction/snapshot version recognition, the authored/runtime authority split, history locations and exact-byte guarantees, source and transaction crash order, planless shape, actual-first-node rule, budget-first refusal, and operator-visible refusal/recovery paths. State explicitly that cross-edition parity is semantic safety parity, not narration parity.

Failure routing: documentation drift or omitted operator contract returns to E5; do not patch runtime from the docs task.

### Tasks E6–E11 — Review and finalization

- E6 detached code review: validate correctness, scope, generated-edition parity, and test coverage.
- E7 security review: after E6 passes, attack version confusion, history/source substitution, filesystem aliasing, counter forgery, crash boundaries, and archive cleanup without editing product files.
- E8 two-transition/budget falsifier, E9 history/archive falsifier, and E10 publication/editions falsifier are read-only and may run in parallel after E7.
- E11 finalization is read-only except for workflow-owned closure/archive/git actions authorized by its node contract.

Safe parallel group: E8, E9, E10 only; all have empty product write sets and certify disjoint investigative claims. E2, E3, E4, E5, E6, E7, and E11 remain serial. Do not parallelize the four edition files within one task: they share conformance intent and must land as one coherent change.

## Exact Validation Commands

Run focused gates at the end of the owning task, then repeat all gates from the final reviewed head:

    node scripts/test-replan.js
    node scripts/test-adaptive-handoff.js
    node scripts/test-adaptive-node.js
    node scripts/test-claim-hardening.js
    node scripts/test-bundle-finalize.js
    node scripts/simulate-workflow-walkthrough.js
    node scripts/validate-kaola-workflow-contracts.js
    node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
    node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
    node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
    node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
    node scripts/validate-script-sync.js
    node scripts/edition-sync.js --check
    node scripts/test-edition-sync.js
    git diff --check
    npm test

For each generated family, review the complete canonical-root diff from the plan-sealed claim base 'd59b191c925c634a36a74592ac9a9d21dfc93982' and prove every semantic hunk is represented in all declared editions before running the sync gates. Record each command, exit status, assertion count where emitted, and reviewed HEAD. The standalone replan suite and walkthrough must each pass independently; the walkthrough may not treat a timed-out nested replan suite as coverage.

## Rollback and Failure Routing

- No verifier failure may trigger destructive cleanup. Preserve plan, state, active transaction, source, task mirror, and history for inspection.
- Never roll back by deleting sealed history. Repair forward with a new versioned transaction or source only after the current authority validates.
- A crash before an atomic replacement resumes from the old active file; a crash after replacement resumes from the new file and its durable predecessor link.
- Unknown versions, ambiguous parent binding, exact-history collisions, incomplete fsync/re-read proof, or conflicting live sources are hard refusals.
- Findings involving shared authority helpers route to E2; lifecycle/source publication to E3; packaged fixtures to E4; docs to E5.
- If any edition cannot express the same semantic invariant, stop finalization and record the platform-specific blocker. Do not weaken the invariant to force textual parity.

## Out of Scope

- changing the two-transition ceiling;
- redesigning scheduler policy or legal node-transition semantics;
- rewriting or normalizing already sealed version-1 evidence;
- demanding Claude/Codex/GitLab/Gitea prompt, narration, or implementation-text parity;
- opportunistic cleanup unrelated to issue 699;
- CI/CD enablement or hosted workflow changes.
