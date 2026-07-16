evidence-binding: n1-epoch-architecture 2e20f56e4b04
files_to_create: canonical repository and runtime artifacts listed below
  repository:
    - scripts/kaola-workflow-replan.js
    - plugins/kaola-workflow/scripts/kaola-workflow-replan.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js
    - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js
    - scripts/replan-conformance-fixtures.json
    - scripts/test-replan.js
    - docs/decisions/D-699-01.md
  runtime_generated:
    - <project>/workflow-plan.next.md
    - <project>/.cache/replan-transaction.json
    - <project>/.cache/replan-planner-packet.json
    - <project>/.cache/replan-planner-attestation.json
    - <project>/.cache/epoch-consent-extensions.json
    - <project>/.cache/epochs/<parent-plan-epoch>/manifest.json
    - <project>/.cache/epochs/<parent-plan-epoch>/files/**
    - <project>/.cache/epochs/<parent-plan-epoch>/attempts/<transaction-id>.json
files_to_modify: frozen-node-owned repository files listed below
  n2_lineage_transaction:
    - scripts/kaola-workflow-adaptive-schema.js
    - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
    - plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
    - scripts/kaola-workflow-claim.js
    - plugins/kaola-workflow/scripts/kaola-workflow-claim.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
    - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
    - scripts/kaola-workflow-closure-contract.js
    - plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js
    - plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js
    - scripts/validate-script-sync.js
    - scripts/edition-sync.js
    - scripts/kaola-workflow-install-manifest.js
    - plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
    - scripts/test-claim-hardening.js
    - scripts/test-bundle-state.js
    - scripts/test-bundle-finalize.js
    - scripts/test-edition-sync.js
    - scripts/test-validate-script-sync.js
    - scripts/test-install-manifest-single-source.js
    - package.json
  n3_planner_control_plane:
    - templates/routing/plan-run.skeleton.md
    - templates/routing/next.skeleton.md
    - templates/routing/slots.js
    - templates/routing/required-blocks.js
    - commands/kaola-workflow-plan-run.md
    - plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
    - plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
    - plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
    - plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
    - plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
    - commands/kaola-workflow-adapt.md
    - plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
    - plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
    - plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
    - plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md
    - plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md
    - commands/kaola-workflow-finalize.md
    - plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
    - plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
    - plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
    - plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
    - plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
    - commands/workflow-next.md
    - plugins/kaola-workflow-gitlab/commands/workflow-next.md
    - plugins/kaola-workflow-gitea/commands/workflow-next.md
    - plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
    - plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
    - plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
    - agents/workflow-planner.md
    - plugins/kaola-workflow/agents/workflow-planner.toml
    - plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
    - plugins/kaola-workflow-gitea/agents/workflow-planner.toml
    - scripts/test-route-reachability.js
    - scripts/test-generate-routing-surfaces.js
  n4_runtime_integration:
    - scripts/kaola-workflow-adaptive-handoff.js
    - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js
    - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js
    - scripts/kaola-workflow-adaptive-node.js
    - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
    - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
    - scripts/kaola-workflow-plan-validator.js
    - plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
    - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
    - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
    - scripts/test-replan.js
    - scripts/test-adaptive-handoff.js
    - scripts/test-adaptive-node.js
    - scripts/test-plan-run.js
    - scripts/simulate-workflow-walkthrough.js
  n5_edition_contract_proof:
    - scripts/validate-workflow-contracts.js
    - plugins/kaola-workflow/scripts/validate-workflow-contracts.js
    - scripts/validate-kaola-workflow-contracts.js
    - plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
    - plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
    - plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
    - plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
    - plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  n6_documentation:
    - README.md
    - CHANGELOG.md
    - docs/api.md
    - docs/architecture.md
    - docs/workflow-state-contract.md
    - docs/conventions.md
    - docs/plan-run-cards/repair-routing.md

# Issue 699 executable architecture

## 1. Outcome and boundary

Implement one claim-scoped epoch-lineage state machine around the existing adaptive project. Re-planning is a resumable transaction, not a restart.

- The frozen parent plan, its Ledger, and state remain authoritative until activation promotes an already frozen child.
- Only a genuinely dispatched workflow-planner authors the semantic child DAG. Main may create a typed evidence packet, seed the exact output path, resume the machine, and report typed refusals; it may not supply or repair roles, dependencies, write sets, cardinality, shape, or model.
- Every mutating re-plan command reuses scheduler.lock and writeFileAtomicReplace. Do not add a second lock domain or nest locks.
- Four CAS seams bind candidate_digest, claim_root_base_digest, and inherited_frontier_digest.
- Review lineage is claim-scoped and indexed by epoch_lineage_id plus scope_lineage_id. plan_hash and logical_gate are metadata, never lineage roots.
- Snapshot the complete parent proof before allowlisted active-cache cleanup.
- Permit two automatic review-driven transitions per lineage; the third needs one durable user extension. Permit one narrowly proven diagnosis-to-build Case-B exemption.
- A legacy v1 parent enters a schema-2 child only through section 12. Never downgrade a new missing-schema plan.

Out of scope: scheduler rewrite, restart, alternate project/claim, approval gate, discard/recreate, active bundle mutation, or relaxing issues 682/693/698. Do not add issue/ADR provenance to agent-facing surfaces.

## 2. Canonical serialization and hash domains

All new semantic digests are lowercase SHA-256 over UTF-8 canonical JSON. canonicalJson recursively sorts object keys, preserves caller-sorted arrays, accepts only null/boolean/string/safe-integer/array/plain-object, rejects floats/undefined/non-finite/non-plain values, and emits no whitespace. Exact-file digests hash raw bytes.

### 2.1 Claim identity and root

At claim creation persist:

    claim_identity = {
      schema_version: 2,
      repository_id,
      issue_numbers: <sorted unique positive integers>,
      primary_issue,
      bundle_id,
      closure_policy,
      branch,
      worktree_path: <captured realpath>,
      claim_ts,
      session_marker
    }

claim_identity_digest = sha256(canonicalJson(claim_identity)).

Also persist:

    claim_root_base = {
      schema_version: 2,
      object_format,
      commit: <full worktree HEAD at claim creation>,
      tree: <full tree object id>,
      branch
    }

claim_root_base_digest = sha256(canonicalJson(claim_root_base)).

Later code re-hashes persisted typed fields and verifies branch/worktree/issue state. It never falls back to mutable HEAD, current main, freeze time, or a moving merge-base.

    epoch_lineage_id = sha256(canonicalJson({
      schema_version: 2,
      claim_identity_digest,
      claim_root_base_digest
    }))

The lineage excludes plan_hash, gate, node ids, candidate, and epoch ordinal.

### 2.2 Candidate, frontier, and scope

Reuse issue 698's landable-candidate implementation, including tracked, staged, and relevant untracked files under its path/mode/binary/symlink rules.

    candidate_view = {
      schema_version: 2,
      claim_root_base_digest,
      base_tree,
      entries: [{
        path, kind, mode, blob_digest, code_relevant, security_relevant
      }]
    }

Sort entries by path then kind. candidate_digest = sha256(canonicalJson(candidate_view)).

Derive, never trust from parent Meta:

    inherited_frontier_view = {
      schema_version: 2,
      claim_root_base_digest,
      candidate_digest,
      code_digest,
      security_digest,
      inherited_frontier_classes,
      changed_entry_digests,
      validation_obligation_digests,
      scope_lineage_ids
    }

Use issue-698 classifiers for code/security digests. Classes are the sorted nonempty subset of code/security. All digest/id arrays are sorted. inherited_frontier_digest is the canonical hash of this view. Parent fields must match the recomputation.

    scope_lineage_id = sha256(canonicalJson({
      schema_version: 2,
      epoch_lineage_id,
      claim_identity_digest,
      claim_root_base_digest,
      acceptance_contract_digest,
      reviewed_surface_digest
    }))

Storage/lookup uses epoch_lineage_id plus scope_lineage_id. plan_hash, gate, attempt, and ordinal are attributes. Independent code/security gates on one scope/candidate cost one transition when settled into one packet.

### 2.3 Other domains

- plan_hash remains the validator hash of normalized Meta, Nodes, and optional Briefs; Ledger remains excluded.
- Parent/child plan, state, evidence, journal, context, receipt, vector, packet, attestation, and manifest file digests hash exact bytes.
- parent_ledger_digest hashes normalized typed rows.
- evidence_index_digest hashes sorted path/node/binding/nonce/size/mode/file-digest records.
- review_lineage_digest hashes the normalized claim-scoped journal.
- Snapshot file entries bind relative path, regular-file type, size, POSIX mode, and exact digest.

## 3. workflow-state schema-2 Epoch Lineage block

Keep existing claim/project/sink/branch/Planning Evidence fields. Add:

    epoch_schema_version: 2
    claim_identity_digest: <64 hex>
    claim_root_base_commit: <full object id>
    claim_root_base_tree: <full object id>
    claim_root_base_digest: <64 hex>
    epoch_lineage_id: <64 hex>
    plan_epoch: <positive integer, initial 1>
    active_plan_hash: <verified frozen hash>
    inherited_frontier_digest: <64 hex>
    inherited_frontier_classes: <sorted list or none>
    automatic_review_replans: <nonnegative, initial 0>
    authorized_epoch_ceiling: <nonnegative, initial 2>
    case_b_exemption_consumed: <boolean, initial false>
    replan_status: <none|in_progress|candidate_changed|consent_halt>
    replan_transaction_id: <id or none>
    replan_phase: <none|prepared|planner_pending|child_frozen|parent_archived|committed>
    active_snapshot_manifest_digest: <64 hex or none>

plan_epoch/counters advance only at committed child activation. authorized_epoch_ceiling is only a cache of the verified consent chain: base 2 plus valid +1 entries. During incomplete activation, the transaction file is recovery authority and all normal mutators stay fenced even when state is one write ahead/behind.

## 4. Re-plan transaction

.cache/replan-transaction.json is atomically replaced under scheduler.lock. Required fields:

    schema_version: 1
    transaction_id
    epoch_lineage_id
    planner_attempt
    phase
    outcome
    transition_reason
    transition_cost
    case_b_exemption
    created_at
    updated_at
    parent
    source
    cas
    budget
    planner
    child
    snapshot
    activation
    failure

    transaction_id = sha256(canonicalJson({
      schema_version: 1,
      epoch_lineage_id,
      parent_plan_epoch,
      parent_plan_hash,
      source_reason,
      source_attempt_ids,
      prepare_candidate_digest,
      prepare_inherited_frontier_digest
    }))

source_attempt_ids is sorted. Repeating the request resumes the same transaction. Candidate-changed reauthoring appends an aborted attempt receipt and derives a new transaction id from the new tuple without epoch/counter advance.

parent binds epoch/hash, exact plan/state bytes, normalized Ledger/state, contract, claim/root/lineage. source binds typed reason, settled attempts, journal/evidence/context/receipt digests, producer slice, typed findings, and prepare candidate/frontier. cas stores named prepare/pre_freeze/pre_snapshot/pre_activation observations. budget stores before/prospective-after counters, verified consent digest, cost, exemption proof, ceiling. child stores contract, exact bytes/hash/semantic digest, all-pending Ledger digest, governance/validator receipts, freeze time.

planner binds exact packet and child paths, packet digest, unique dispatch_nonce, dispatch-log record for workflow-planner and exact worktree/project/transaction, profile identity, attestation digest, output precondition, and bounded child-repair attempts.

activation is an ordered prefix journal:

    child_plan_promoted
    child_state_promoted_fenced
    task_mirror_promoted
    active_cache_cleaned
    transaction_committed
    state_unfenced

Each is not_started/complete with output digest/time. Repeat only when current output matches. Valid typed failures include replan_candidate_changed, replan_planner_dispatch_required, replan_planner_attestation_invalid, replan_child_invalid, replan_snapshot_incomplete, replan_task_mirror_failed, replan_cache_cleanup_failed, replan_consent_required, and legacy_claim_root_unprovable.

## 5. Parent/child authority and planner-only handoff

### 5.1 Parent authority

From prepare through parent_archived:

- workflow-plan.md and its Ledger remain byte-identical to recorded parent digests.
- State may gain/update only the transaction fence and continues identifying the parent until child_state_promoted_fenced.
- Scheduler, finalize, claim archive, another replan, normal handoff/freeze, and task-mirror refresh refuse with replan_in_progress plus exact phase.
- orient stays read-only and reports transaction id/phase, parent/child hashes, last CAS result, and the single legal mutation: replan resume.

### 5.2 Planner packet and attestation

The harness packet contains repository/project/worktree identity, typed reason/source evidence, claim/root/epoch/candidate/frontier/contract/budget bindings, current parent as facts, acceptance requirements, and exact child path. It must contain no proposed roles, node ids, dependencies, write sets, cardinality, shape, model, build order, or exact DAG fragment.

The workflow-planner re-plan mode consumes that packet, writes only workflow-plan.next.md, refuses exact-DAG instructions from main, emits a schema-2 all-pending child, and returns through the replan-specific handoff.

Genuine dispatch requires all of:

1. A post-planner_pending dispatch-log record for agent_type workflow-planner, exact worktree/project, transaction, and nonce.
2. A planner-profile attestation binding packet digest, transaction, child exact-byte digest, and profile identity.
3. Proof the child path was absent or an empty harness seed before dispatch.
4. Handoff verification of record and attestation before parsing/freeze.

Missing/mismatched provenance is a typed refusal. This is mechanical provenance, not a cryptographic user identity claim.

### 5.3 Child freeze and activation

Replan handoff runs inside the replan-held scheduler lock or acquires it directly, never nested. It verifies parent bytes/transaction/attestation, runs pre-freeze CAS, validates schema-2 and issue-698 G4/code/security semantics, runs governance and the existing bounded planner-only repair loop, freezes workflow-plan.next.md atomically in place, initializes every child Ledger row pending, records child_frozen, and never replaces the active parent.

After verified parent snapshot:

1. Atomically rename the frozen child over workflow-plan.md and verify its exact digest.
2. Atomically write child state with epoch +1, child hash/frontier/prospective counters, but replan_status in_progress.
3. Import pure generateMirror, generate from promoted child bytes, and atomically write workflow-tasks.json. Do not invoke the currently non-atomic CLI. Transaction mirror failure blocks.
4. Perform manifest-allowlisted cache cleanup.
5. Atomically mark the transaction committed.
6. Atomically clear the state fence. Crash between 5/6 resumes only the verified unfence.

After step 1 no rollback is attempted; the fence makes partial activation inaccessible and resume rolls forward.

## 6. Phase idempotency and crash table

| Phase/prefix | Authority | Resume behavior | Failure behavior |
| --- | --- | --- | --- |
| no transaction | Parent | Lock; verify source; prepare CAS; write transaction then state fence. | Prepare mismatch returns candidate_changed with no packet/epoch/counter. Crash after transaction repairs the matching fence. |
| prepared | Parent | Verify transaction, parent bytes, source, budget, CAS; write packet/challenge then planner_pending. | Parent/source integrity drift refuses. Candidate drift records an aborted attempt and reauthors without epoch/counter advance. |
| planner_pending, no child | Parent | Reuse packet/nonce/path. If no valid dispatch result, return planner_dispatch_required; never synthesize/repeatedly dispatch. | Partial/unattested child is quarantined; increment planner_attempt only. |
| planner_pending, child present | Parent | Verify dispatch/attestation; pre-freeze CAS; validate/freeze. Same frozen bytes are a no-op. | CAS mismatch invalidates draft and requires reauthor. Invalid semantics use bounded planner repair only. |
| child_frozen | Parent | Verify child; pre-snapshot CAS; build/fsync staging snapshot; atomic rename; reverify. | Mismatch keeps parent, audits stale child, and reauthors. Snapshot failure clears nothing. |
| parent_archived | Parent until promotion | Verify manifest; pre-activation CAS; execute only next prefix with verified predecessors. | Mismatch before promotion keeps parent. After promotion all errors remain fenced and roll forward. |
| plan promoted | Transaction fence; child file | Verify child digest and write recorded child state. | Never restore parent. Missing/mutated child is manual-recovery integrity failure. |
| state promoted | Transaction fence; child identity | Regenerate deterministic mirror, then allowlisted cleanup. | Mirror/cleanup failure is typed and resumable. |
| transaction committed/state fenced | Child | Verify activation digests and clear only state fence. | No counter/epoch recalculation. |
| committed/unfenced | Child | Return already_committed with transaction/manifest/plan hashes. | Normal paths require validator agreement. |
| candidate_changed | Parent unless promotion began | Append failed-attempt receipt, recompute tuple, seed fresh planner attempt. | No epoch/counter change. After promotion it is integrity failure and rolls forward. |
| consent_halt | Parent | orient reports counter/ceiling and exact consent-extension route. | No packet/dispatch until verified +1 extension. |

Add a failpoint after every durable write. Tests kill there, resume twice, and compare final exact digests to an uninterrupted run.

## 7. Four CAS seams

The tuple is candidate_digest, claim_root_base_digest, inherited_frontier_digest.

1. prepare: compare current tuple with the source attempt effective candidate after verified rebind overlay, persisted root, and freshly derived frontier. Diagnosis route uses two independent reads around packet construction.
2. pre_freeze: after attested planner output, before validator freeze.
3. pre_snapshot: after child verification, before reading parent files into staging.
4. pre_activation: after manifest verification, immediately before active-path promotion.

At every seam recompute from repository bytes/persisted anchors, compare all three, atomically record full observation/result, and on pre-promotion mismatch preserve parent, quarantine child/attempt proof, return replan_candidate_changed, make no epoch/counter change, and require planner reauthoring. Never patch child Meta to a new candidate/frontier. Apply only issue-682-settled rebind overlays with exact producer evidence before prepare and snapshot the complete overlay.

## 8. Cross-epoch review journal

The combined issue-698/699 schema-2 journal is claim-scoped:

- Top-level identity is epoch_lineage_id and claim_identity_digest, not one plan hash.
- Each attempt stores epoch/hash/gate/scope, candidate and code/security digests, contexts/receipts, findings, settlement, repair/rebind events, and consumed_by.
- Primary index is epoch_lineage_id plus scope_lineage_id. Gate/hash may filter, never hide same-scope history.
- Attempt ids are lineage-unique. Rebinds are append-only and preserve from/to candidate, producer evidence, reason, ordinal, settlement. Effective candidate is terminal verified overlay, never rewritten base.
- Mark source attempts consumed by transition only after commit; prospective consumption lives in transaction.
- Separate code/security attempts for one scope/candidate remain distinct evidence but cost one transition packet.

For v1, snapshot review-attempts.json exact bytes. Start child schema-2 journal with legacy_import referencing manifest, legacy journal/evidence/attempt/transaction digests. Do not invent schema-2 finding UIDs, resolutions, or validation-vector identities. This removes the active R4 bug: lookup cannot be current plan hash plus gate or mutable HEAD root.

## 9. Snapshot manifest and archive

Canonical path is .cache/epochs/<parent-plan-epoch>/. Build in sibling .staging-<transaction-id>, fsync files/directories, atomically rename, then re-open/reverify. Existing epoch directory requires exact manifest equality; never overwrite.

Manifest must bind:

- schema, lineage, parent epoch, transaction, time.
- full claim/root payloads and digests.
- entry/exit CAS tuples.
- exact parent plan/state bytes, plan hash, Meta/Nodes/Briefs digest, Ledger digest, pre-fence state semantic digest, and separate fence record.
- branch/worktree/issue/bundle/sink/closure fields.
- candidate/frontier views, code/security digests, validation obligations.
- full review journal bytes/semantic lineage.
- every attempt's complete rebind ledger, including explicit empty rebind for n8-code-review:1.
- source attempts/contexts/receipts/findings/consumption.
- node evidence index with node/binding nonce/path/size/mode/digest.
- exact node evidence, contexts, receipts, certifier proof, vectors, policy/contract inputs, packet/attestation, barrier base/open proof, and dispatch provenance.
- task mirror marked derived/non-authoritative.
- frozen child digest/hash/attestation.
- sorted complete file index and manifest_self_digest computed with that field omitted.

Include every cache proof format, not only .md; extend closure archive verification recursively.

Safety: lstat every component; reject symlink, special file, path escape/dot-dot, duplicate normalized path, case-fold collision, unexpected hard link, and source changed during copy. Exclusive-create, fsync, rename, reverify.

Failed attempts live at epochs/<parent-epoch>/attempts/<transaction-id>.json only after canonical snapshot exists. Before that they stay append-only in transaction; never create partial epoch directories.

## 10. Cache cleanup, task mirror, and fences

Cleanup starts only after snapshot re-verification and child plan/state/mirror promotion. Derive an allowlist from the parent manifest and remove only files whose current digest equals it:

- running-set/active-batch state.
- parent barrier base/open files and refs.
- parent node evidence, review contexts/receipts/certifiers/vectors/findings route/envelopes/timings and epoch-local projections.
- completed stale child drafts after their digests are recorded.

Never remove epochs/**, transaction, consent ledger, claim/lineage anchors, child claim-scoped review lineage, dispatch logs, any absent-from-manifest file, any digest-changed file, or scheduler.lock. Cleanup is idempotent; missing expected files need prior deletion receipts. Remove dirs bottom-up only when empty.

Task mirror imports generateMirror purely, serializes deterministically, writes atomically under the transaction, verifies child plan hash/all-pending rows, and blocks activation on failure.

Centralize a readReplanFence/projectMutationGuard in adaptive-schema and call it before adaptive-node mutators/scheduling, normal adaptive-handoff, plan-run/next, claim finalize before any side effect, and closure finalize verification. Only replan resume may mutate an incomplete transaction.

State none plus incomplete transaction is fenced; committed transaction plus stale state fence routes only to resume; missing/mismatched transaction is integrity refusal. orient suppresses mirror refresh while fenced. Finalize proves no incomplete transaction, plan/state epoch agreement, all snapshots/manifests, consent chain, issue-682 journal settlement, and recursive archive preservation.

## 11. Liveness and one-shot Case-B

Base authorized_epoch_ceiling is 2 automatic review-driven transitions per lineage: original plus at most two replacements.

- transition_cost is 1 for review_repair_requires_replan, regardless of included gates/attempts.
- Increment only at committed activation. Failed CAS/child/dispatch/snapshot/crash costs 0.
- If count equals ceiling, prepare writes consent_halt before packet/dispatch and returns replan_consent_required.

Explicit user consent appends:

    {
      schema_version: 1,
      extension_id,
      epoch_lineage_id,
      prior_ceiling,
      new_ceiling,
      increment: 1,
      user_turn_reference,
      requested_at,
      reason,
      previous_entry_digest,
      entry_digest
    }

Only the user-facing control path supplies user_turn_reference. Labels, issue text, and review prose are not consent. new_ceiling must be prior +1. Entries are a digest chain; each authorizes exactly one further committed review transition.

One zero-cost diagnosis-to-build transition is allowed only when:

1. Frozen parent schema-2 Meta says planned_transition diagnosis_to_build.
2. Validator proves every non-sink writer is limited to recognized investigation artifacts and none can change product code/config/generated runtime/packaging/tests.
3. Parent is complete with typed diagnosis root cause, falsified alternatives, evidence, acceptance contract, recommended implementation-shape digest.
4. Source reason is diagnosis_to_build, no unresolved review.
5. Packet binds diagnosis/recommendation digests.
6. case_b_exemption_consumed is false.

Commit sets it true with cost 0. A second diagnosis, mislabeled review, any code/config writer, absent/mutable artifact, or retroactive child label costs 1 and uses the ceiling.

## 12. Explicit v1 parent to v2 child

This is the only missing-schema path:

1. Verify v1 frozen hash, Ledger grammar/status, state identity, issue-682 settlement, evidence bindings, and candidate.
2. Preserve v1 plan/state/journal/evidence/receipts/rebind arrays exact-byte; never insert schema-2 fields into parent files.
3. Derive legacy claim root only from immutable corroborated proof:
   - Prefer persisted claim-time commit/tree.
   - Otherwise require the common commit in all first-runnable-frontier barrier-open proofs, verify objects/tree/ancestor and branch/worktree/claim agreement.
   - Live fixture must calculate d59b191a25b8b662789267cc71527dc4d23792b6 from proof, not hard-code it as runtime truth.
   - Current HEAD, moving main, uncorroborated reflog, or merge-base alone is forbidden.
   - Ambiguity/missing proof returns legacy_claim_root_unprovable.
4. Build schema-2 claim/root/lineage in transaction state only; parent stays legacy-authoritative.
5. Derive candidate/frontier against root. Bind n8-code-review:1 effective candidate, empty rebind array, candidate/residue, R1-R6, and producer slice.
6. Dispatch a fresh planner. Child explicitly declares contract 2, lineage, parent v1 hash/manifest, frontier/classes, and issue-698 certifiers.
7. Start child claim-scoped journal with legacy_import; do not fabricate schema-2 resolutions/vector identities.
8. Commit through normal snapshot/activation. All later transitions are v2-to-v2.

Compatibility is chosen only for a verified frozen v1 parent. A newly authored/repaired missing-schema child is invalid.

## 13. Child validator and inherited frontier

Child Meta requires contract_version 2, epoch_lineage_id, plan_epoch, parent_plan_hash, parent_snapshot_manifest_digest, claim_root_base_digest, inherited_frontier_digest/classes, transition reason/source evidence digest, planner binding, and issue-698 code_certifier/security_certifier declarations. Validator recomputes every binding.

For nonzero code frontier, a reachable code-certifier gate is downstream of every code-producing or test-consumed-prose writer and feeds final sink. Writer classification includes product/tests/executable fixtures/scripts/validation policy/test-consumed prompts/prose/routing templates/generated agent surfaces; Markdown is not automatically inert. For security frontier, a reachable security gate is downstream of every relevant writer and feeds sink.

Every unresolved finding lineage has child repair/validation reachability or typed carry-forward refusal; it cannot vanish on renamed nodes/gates. Keep resolution evidence, vector identity, and candidate binding separate (R1/R2). Coverage labels do not replace executable corpus (R6). Synthetic main/security identities do not satisfy genuine certifier provenance (R5).

## 14. Live bundle fixture

scripts/replan-conformance-fixtures.json is a minimal deterministic fixture copied from the read-only bundle-693-696-697-698 proof:

- parent hash d2f4efb9d8f02ad50ebc8a75eca0f55da48ae7d8a8683b7216c54839cb0c0ed2.
- n8-code-review:1, ordinal 1, generation nonce 3516a7f36db8.
- candidate 5343174e2507cd27dfbdad2cf21d240b4e24416a697f6f1e84eb66705d93bf22.
- residue f070d761f87d4f56ed2a997a5a5412f2e6401e1dffcc2fb1f26a3b9e2d503c8e.
- repair_requires_replan producer slice n2-profile-contracts through n7-documentation.
- R1-R6 typed findings, contexts/receipts/evidence, lifecycle_settled true, repair nulls, rebind [], consumed_by null.
- v1 plan/state/journal and root-frontier proof.

Tests copy it to a new temp Git repository/project and run real scripts there. Never mutate the live bundle. Optional conformance may compare live hashes read-only and must prove before/after hashes/mtimes unchanged.

End-to-end assertions: parent bytes remain through parent_archived; genuinely attested schema-2 child inherits nonzero code/security frontier; snapshot has v1 journal/empty rebind/R1-R6/all proof; activation increments epoch/count exactly once with stable lineage/root and all-pending child Ledger/mirror; second resume is byte-stable already_committed.

## 15. TDD tasks and ownership

### A. n2 schema/claim anchors

RED: canonical JSON rejection/order tests; persisted claim identity/root/epoch tests; mutable-HEAD/root-object drift tests; legacy root success/ambiguity tests; fence/atomic crash tests.

GREEN: export canonical hashing, root/frontier/transaction/fence/snapshot validators and existing lock/atomic helpers; persist fresh claim anchors. Keep stale-lock takeover manual/typed.

Commands:

    node scripts/test-claim-hardening.js
    node scripts/test-bundle-state.js

### B. n2 transaction/snapshot/liveness/closure

RED first in test-replan: phase/failpoint/CAS/snapshot/cleanup/counter/Case-B/v1. Add finalize/archive recursive proof and edition/install sync failures.

GREEN: implement root engine; pure/atomic mirror; snapshot/allowlisted cleanup; consent/Case-B; closure recursion; register in edition-sync GENERATED_AGGREGATORS, validate-script-sync, SUPPORT_SCRIPTS; regenerate three ports.

Commands:

    node scripts/test-replan.js
    node scripts/test-bundle-finalize.js
    node scripts/test-edition-sync.js
    node scripts/test-validate-script-sync.js
    node scripts/test-install-manifest-single-source.js
    node scripts/edition-sync.js --check

Snapshot/mirror/cleanup failure remains fenced. Integrity failure after promotion is manual-recovery severity; no auto-restore.

### C. n3 planner/routing

This is exact-file-disjoint from n2 and the only safe implementation parallel group.

RED: replan phase exposes only resume; scheduler/finalize/handoff forbidden; profiles reject exact DAG and require next-path/attestation; six-surface plan-run/adapt/finalize/next propagation.

GREEN: four profiles; canonical plan-run/next templates/slots/required blocks; canonical adapt/finalize; regenerate. Keep forge-neutral/provenance-free.

Commands:

    node scripts/test-route-reachability.js
    node scripts/test-generate-routing-surfaces.js
    node scripts/generate-routing-surfaces.js --check

Fix generator drift at canonical templates, never generated copies.

### D. n4 runtime convergence

Depends on A-C.

RED: normal/replan handoff, genuine attestation, child path, bounded repair, mutation/finalize/orient fences, state/transaction split brain, schema-2 frontier/test-consumed prose/cross-epoch lineage/legacy import, activation crash, mirror determinism.

GREEN: distinct replan handoff; node fence/orient/resume; issue-698 runtime with claim-scoped lineage/persisted root; validator/finalize epoch checks.

Commands:

    node scripts/test-replan.js
    node scripts/test-adaptive-handoff.js
    node scripts/test-adaptive-node.js
    node scripts/test-plan-run.js
    node scripts/simulate-workflow-walkthrough.js

Root cause in n2/n3 returns to that owner; n4 does not patch their write sets.

### E. n5 edition proof

Extend validators/walkthroughs for four script chains, six surfaces, manifest parity, every phase/recovery route, v1 fixture, parent/snapshot/finalize, issue-698 G4/certifiers, and forbidden approval/discard/restart/auto-takeover prose.

Commands:

    node scripts/validate-workflow-contracts.js
    node scripts/validate-kaola-workflow-contracts.js
    node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
    node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
    node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
    node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
    node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

Do not advance on root/plugin semantic or byte drift.

### F. n6 docs

After E, document only passing API/CLI outcomes, epoch/hash/authority/CAS/crash model, snapshots/cleanup/finalize, liveness/Case-B/v1, routing card, D-699-01, README/CHANGELOG.

    node scripts/test-route-reachability.js
    node scripts/validate-workflow-contracts.js

If names/outcomes differ, align docs or route to implementation owner; invent no aliases.

### G. review/falsification

n7 exact-head correctness review; n8 path/symlink/deletion/lock/TOCTOU/provenance/consent/hash/activation security review; n9 planner-authorship falsifier; n10 transaction/snapshot falsifier; n11 G4/liveness/v1 falsifier. Findings route to smallest owner and invalidate downstream reviewed-head proof.

## 16. Falsification matrix

| Invariant | Minimum falsification cases |
| --- | --- |
| Parent authority | Hash plan/Ledger/state semantic view at every phase; crash after every write; attempt scheduler/handoff/finalize/second replan; no parent semantic change before activation. |
| Planner-only child | Main supplies roles/deps/write sets; forged profile/nonce/log/path; prepopulated child; wrong worktree; replayed attestation; planner edits parent. All refuse. |
| CAS | Mutate tracked/staged/untracked/mode/symlink/vector/rebind/root/frontier separately before each seam; candidate_changed, zero epoch/counter, reauthor. |
| Claim root | Advance HEAD/main; alter branch; delete tree; ambiguous legacy barriers; fake merge-base; persisted root wins or fail closed. |
| Frontier/G4 | Code/security/both/zero; test-consumed Markdown/template; label-only reachability; gate not feeding sink; renamed gate; new plan same scope. |
| Journal/rebind | Empty overlay; valid overlay; bad ordinal; wrong evidence; rewritten base; prior epoch same scope; different scope same gate; code/security same candidate. |
| Snapshot | Missing non-md receipt; source changes during copy; symlink/traversal/case collision/special file/bad mode/size/hash/self-digest; partial staging; unequal existing epoch; archive omission. Cleanup stays blocked. |
| Cleanup | Unsnapshotted/digest-changed/missing-without-receipt file; nonempty dir; repeated cleanup; crash each deletion. Preserve epochs/lineage/consent/dispatch/transaction. |
| Activation | Crash after plan, state, mirror, each cleanup, commit, pre-unfence; double resume; exactly one epoch/counter and exact final bytes. |
| Mirror | Non-atomic CLI forbidden; generation failure; wrong hash; parent mirror reuse; partial file; deterministic repeat. |
| Liveness | First/second commit; third halts pre-dispatch; failed attempt zero; two gates same scope cost one; state-only ceiling edit fails; +2 fails; valid +1 permits exactly one. |
| Case-B | Valid once; second; code/config/test writer; unresolved review; absent diagnosis; edited child label; mislabeled review. Only strict first costs zero. |
| v1-to-v2 | R1-R6 fixture succeeds without source mutation; missing/ambiguous root refuses; new missing-schema child refuses; legacy bytes/empty rebind preserved; no fabricated resolution/vector; no later downgrade. |
| Finalize/archive | Every incomplete phase refuses pre-side-effect; split brain refuses; missing manifest refuses; recursive archive verifies; committed/unfenced succeeds. |
| Concurrency/lock | Two prepare/resume processes; stale/wrong owner; signal; no auto-takeover; exactly one transaction/activation. |
| Edition parity | Root/Claude/GitLab/Gitea behavior and routing bytes; install manifest includes script; forbidden approval/restart/discard tokens absent. |

## 17. Validation ladder

Run focused owner commands in section 15. After n5 and after any review fix:

    npm test
    node scripts/edition-sync.js --check
    node scripts/generate-routing-surfaces.js --check

Live conformance runs only from a temporary copy and reports immutable source before/after hashes, parent hash/attempt, four CAS receipts, planner attestation, child hash/schema, snapshot digest, child epoch/counters, and second-resume already_committed proof.

Reject evidence that substitutes broad green for a missing focused invariant, writes to the external bundle, omits an edition, or is not bound to the exact implementation head.

build_sequence: ordered dependency-safe implementation steps listed below
  - id: n1-epoch-architecture
    status: complete_when_this_evidence_is_bound
    writes: only kaola-workflow/issue-699/.cache/n1-epoch-architecture.md
    output: schema, phase machine, ownership, validation, falsification
  - parallel_group:
      - id: n2-lineage-transaction
        depends_on: n1-epoch-architecture
        sequence:
          - write failing hash, claim-root, state, lock, legacy-root tests
          - implement root schema and claim anchors
          - write failing transaction, CAS, phase, snapshot, cleanup, liveness, Case-B, archive, live-fixture tests
          - implement root transaction and closure preservation
          - register edition/validation/install/package chains
          - regenerate forge ports and prove parity
      - id: n3-planner-control-plane
        depends_on: n1-epoch-architecture
        sequence:
          - write failing provenance, exact-DAG refusal, phase-route, six-surface tests
          - implement four planner profiles
          - update canonical plan-run/next and adapt/finalize routing
          - regenerate and prove reachability/byte identity
    parallel_safe_reason: exact disjoint write sets frozen in workflow-plan.md; neither edits n4 convergence files
  - id: n4-runtime-integration
    depends_on:
      - n2-lineage-transaction
      - n3-planner-control-plane
    sequence:
      - write failing handoff, attestation, fence, schema-2, cross-epoch journal, activation, mirror tests
      - integrate distinct child freeze in adaptive-handoff
      - integrate fence/orient/resume in adaptive-node
      - integrate issue-698 G4 and claim-scoped lineage in validator/runtime
      - pass focused replan/handoff/node/plan-run/walkthrough tests
  - id: n5-edition-contract-proof
    depends_on: n4-runtime-integration
    sequence:
      - extend root/edition validators
      - extend Claude/Codex/GitLab/Gitea walkthroughs
      - prove v1-to-v2 fixture, recovery, parity, forbidden prose
  - id: n6-documentation
    depends_on: n5-edition-contract-proof
    sequence:
      - document verified API/state/architecture only
      - add D-699-01 and repair-routing state machine
      - update README/CHANGELOG
      - rerun docs-sensitive route/contract checks
  - id: n7-code-review
    depends_on: n6-documentation
    action: detached exact-head correctness/scope/maintainability/coverage review
  - id: n8-security-review
    depends_on: n7-code-review
    action: filesystem/provenance/CAS/lock/consent/cleanup/activation audit
  - parallel_group:
      - id: n9-planner-authorship-falsifier
        depends_on: n8-security-review
      - id: n10-transaction-falsifier
        depends_on: n8-security-review
      - id: n11-g4-liveness-falsifier
        depends_on: n8-security-review
    parallel_safe_reason: all three are read-only with no write set
  - id: n12-finalize
    depends_on:
      - n9-planner-authorship-falsifier
      - n10-transaction-falsifier
      - n11-g4-liveness-falsifier
    sequence:
      - verify exact reviewed head and all evidence
      - run npm test and edition/routing generation checks
      - verify state, epoch manifests, closure contract, repository finalization
