evidence-binding: r1-repair-blueprint e5345fa3e0ad
files_to_modify: scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-handoff.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-replan.js, plugins/kaola-workflow/scripts/kaola-workflow-replan.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-replan.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-claim-hardening.js, scripts/test-bundle-finalize.js, scripts/simulate-workflow-walkthrough.js, scripts/test-plan-run.js, README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md
build_sequence: r2-lifecycle-transport-repair -> r3-lineage-proof-repair -> r4-forge-contract-repair -> r5-documentation-correction -> r6-code-review -> r7-security-review -> fanout(r8-falsify-lifecycle-transport, r9-falsify-binding-caseb, r10-falsify-crash-editions) -> r11-finalize

# Epoch-2 repair blueprint

## Decision and invariants

Use one fail-closed authority chain for every repaired path:

`claim identity + immutable claim root -> typed source authority -> entry/freeze/snapshot/activation CAS -> snapshot-authority projection -> exact child bytes + planner attestation -> full snapshot seal -> active plan/state/task mirror`.

Every structured record is canonical JSON, and every Markdown authority is hashed as exact bytes. All mutations remain under the existing scheduler lock and use the existing atomic replacement discipline. A durable-write label fires only after the corresponding write, rename, or unlink has completed. A retry may accept an exact existing byte sequence as an idempotent no-op; it must refuse a different record at the same authority key. No operator-authored `replan-source.json`, manually supplied digest, mutable branch name, or live child file is authority.

The frozen epoch-1 plan, its evidence, and the frozen epoch-2 plan are read-only. Runtime compatibility is provenance verification, never rewriting old bytes. New schema-2 transactions use only the repaired contracts below.

Current-state classification: the active epoch-2 plan authority is not corrupt. The live plan hash, `plan_epoch: 2`, task mirror, ledger, and opened `r1-repair-blueprint` agree. The state Planning Evidence still names the parent's first node (`n1-epoch-architecture`) rather than the child first node (`r1-repair-blueprint`), so it is a committed semantic inconsistency named `state_planning_evidence_stale_first_node`. Dispatch continues from the frozen plan/ledger authority, not that advisory stale field. Do not hand-edit the live state. Repair the generic activation constructor and add a consistency refusal so the mismatch cannot recur or pass future archive/finalize verification.

Observed legacy self-host facts to preserve and verify rather than mutate:

- active epoch-2 plan hash: `356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938`;
- epoch-1 full manifest exact-file digest: `8b95f06d90bdc4470ed4c714bb0394000eed58d67ce7636763f751a1a79f87df`;
- epoch-1 manifest self digest: `2dc27a7699f6373e1e35be07dfc7ee076f91f5509b6f8797c312a54708ec47c3`;
- child-plan exact digest, manifest child row, copied child file row, transaction child digest, and planner attestation child digest all agree at `2364dcf41a23e511e24518ada45d7150c9d1867cafc8a4a927e582d49ef971e3`;
- that frozen child's `parent_snapshot_manifest_digest` is literally `pending`.

## Seven source requirements and exact ownership

| Requirement | Contract to implement | Owner and files | RED/GREEN surface |
| --- | --- | --- | --- |
| A5-699-01 initial plan authority and archive refusal | Legal schema-2 planless/planned state forms, atomic handoff of both plan fields, full child Planning Evidence replacement at activation, and one shared fail-closed archive-result predicate at every caller | `r2`: claim, closure-contract, adaptive-handoff families and its tests; `r3`: replan/schema families for activation and recursive consistency | planless/planned table; stale-first-node fixture; finalize/release/merged-watch/closed-watch refusal fixtures |
| A5-699-02 offline/no-history roots | Offline dominates native worktree and in-place branch creation for single and bundle claims; persisted root is either a real commit/tree or the exact zero-commit/empty-tree baseline | `r2`: four claim ports plus claim/bundle/walkthrough tests; `r3`: four schema/replan ports plus replan tests for verification and candidate observation | `testWorktreeNativeOfflineWins`; offline `NATIVE=0`; single/bundle/no-history; malformed sentinel refusals |
| live review-to-prepare transport | The real repair-node outcome is atomically persisted before the CLI returns it; prepare consumes and re-verifies the same settled attempt without manual JSON | `r2`: four adaptive-node ports plus adaptive-node/replan/walkthrough tests; `r3`: source-envelope verification in replan/schema and tests | executable `review_failed -> repair_requires_replan -> prepare -> planner_pending`; crash/conflict/replay matrix |
| N7-699-04 child/snapshot cross-binding | Child binds a non-circular immutable snapshot-authority projection; full manifest seals exact child and attestation; committed validation and recursive archive verification enforce both; externally sealed schema-1 legacy only | `r3`: replan/schema families and tests; `r4`: plan-validator family for authoring-versus-committed validation | pending/arbitrary digest, child replacement, manifest-child mismatch, attestation mismatch, archive corruption, legacy seal pass/fail |
| N7-699-05 genuine Case B | A no-review source resolver derives typed diagnosis authority from the completed parent and four exact terminal artifacts, requires child citations, costs zero once, and refuses review-driven or writer-bearing laundering | `r3`: replan/schema families and replan/handoff/node/plan-run tests; `r4`: committed child validation | genuine no-review end-to-end; untyped/missing citation/repeated/review-driven/product-writer refusals |
| N7-699-06 durable prefixes and four CAS seams | Central labeled persistence inventory, failpoint immediately after every durable mutation, all-prefix convergence, and 4 seams x 3 tuple axes | `r3`: replan/schema families and focused tests; `r2`: source-outcome durable prefix only | every label killed once; exact second-resume idempotence; twelve CAS mutations with zero unintended effects |
| A5-699-03 forge neutrality | Canonical validator comment is forge-neutral; generated four-file family has no forbidden forge CLI token | `r4`: four plan-validator files only | GitLab `gh` and Gitea `glab` `--forbidden-only` probes, generated sync, packaged tests |

No downstream node may expand these write sets. `r2`, `r3`, `r4`, and `r5` are serial: test files overlap, the source transport feeds lineage verification, the validator consumes the lineage contract, and documentation describes the final mechanics. Only the read-only falsifiers `r8`, `r9`, and `r10` may run in parallel after both reviews.

## Contract 1: legal initial state and fail-closed archival

### Plan authority state machine

The state validator and recursive snapshot verifier must recognize exactly two initial epoch-1 representations:

| Form | Required state | Required filesystem | Forbidden mix |
| --- | --- | --- | --- |
| `planless` | `plan_epoch: 1`, `active_plan_hash: none`, Planning Evidence `plan_hash: none`, `first_node_id: none`, `first_node_role: none`, no active snapshot | `workflow-plan.md` absent; zero epoch snapshots | a plan file, non-`none` first node, a snapshot, or a non-`none` hash |
| `planned` | `plan_epoch: 1`, `active_plan_hash` equals the exact frozen-plan hash, Planning Evidence repeats that hash and the frozen first node id/role, no active snapshot | one frozen `workflow-plan.md`; zero epoch snapshots | `none`, hash disagreement, first-node disagreement, a snapshot, or an unfrozen plan |

Claim creates only the planless form. Adaptive handoff freezes the first plan and performs one state replacement that changes both `## Epoch Lineage active_plan_hash` and the complete `## Planning Evidence` tuple. The verifier explicitly handles zero snapshots before trying to read a plan, so a valid planless claim is not forced through planned-state logic.

Epoch activation must replace, not patch, the complete child Planning Evidence tuple: exact child plan hash, governance/risk captured from the frozen child, and child's first node id/role. It must also set `plan_epoch`, `active_plan_hash`, task-mirror hash, and active snapshot digest from one transaction authority. A consistency check refuses `state_planning_evidence_stale_first_node`, `state_active_plan_hash_mismatch`, or `state_task_mirror_mismatch` before archive/finalize.

### Archive caller boundary

Introduce one pure predicate, used after every `archiveProjectDir(...)` call in all four claim editions:

`archiveSucceeded(result) := result.archived === true || result.skipped === 'source-missing'`.

Anything else, including `archive_incomplete`, `snapshot_error`, missing/invalid manifest, thrown copy error, false/undefined result, or a destination verification mismatch, returns a typed nonzero refusal before any downstream side effect. The protected side effects include roadmap-source removal/regeneration, remote close/disposition, advisory-claim removal, worktree removal, in-place checkout, branch deletion, closure receipt stamping, and status-success output.

Apply the gate to all five current call sites: finalize, release, merged PR/MR watch, closed PR/MR watch, and any edition-equivalent cleanup route. Finalize retains its early snapshot/finalize precheck but also gates the actual archive result to close the time-of-check/time-of-use window. `archiveProjectDir` itself must leave source/worktree/branch/claim authority in place on refusal and return one stable reason. Success receipts may not encode `status: closed` or `released: true` unless the predicate passed.

Exact RED cases owned by `r2`:

1. Valid planless claim verifies and archives; planless with a stray plan or hash refuses.
2. Normal handoff produces planned state whose two plan hashes and first node agree.
3. Child activation with parent/child first nodes different produces child metadata; the old hash-only replacement is rejected.
4. Inject snapshot verification refusal into finalize, release, merged watch, and closed watch; assert live project, worktree, feature branch, claim labels, roadmap source, and issue disposition are unchanged and the command exits nonzero.
5. Inject an archive-result refusal after finalize's precheck to prove the post-call gate.
6. Preserve the existing successful and `source-missing` idempotent paths.

## Contract 2: offline/no-history claim root

`KAOLA_WORKFLOW_OFFLINE=1` has precedence over `KAOLA_WORKTREE_NATIVE` for single and bundle claims. Restore `!OFFLINE` to every native-worktree creation guard. The existing in-place path remains `!OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE`. Therefore offline mode creates neither a worktree nor a branch, including `NATIVE=0`.

The immutable root tuple remains the existing schema shape, so no new unauthenticated mode flag is needed:

- history root: actual object format, exact commit object id, exact commit tree id, and claimed branch identity;
- no-history root: commit is all zeroes at the repository object-id width and tree is the canonical empty-tree object id for that repository's object format, with the claimed target branch identity.

The zero-commit sentinel is legal only when every commit hex digit is zero and the tree exactly equals the locally recomputed canonical empty-tree id for the declared object format. No arbitrary synthetic commit/tree pair is accepted. The claim identity separately binds the target branch; immutable-root verification must not require the mutable current `HEAD` branch to equal it. For a history root it proves the commit exists, is a commit, and resolves to the recorded tree. For the sentinel it proves the repository is still no-history and uses an empty index/base map. Candidate observation uses `read-tree --empty` and an empty base map for the sentinel, so all present worktree files are inherited candidate entries. A non-Git root or a no-history root whose sentinel/object format cannot be established refuses `claim_root_unavailable`; it is never replaced by wall-clock, path, or mutable-file hashing.

Exact RED matrix owned across `r2` then `r3`:

- single and bundle, offline x `NATIVE=1` and `NATIVE=0`: no worktree, no checkout/branch creation, state path remains the main root, and a valid root digest is persisted;
- initialized no-history repository with files: exact zero/empty tuple and candidate includes every non-workflow file;
- SHA-1 and, when locally supported, SHA-256 empty-tree widths;
- one nonzero sentinel digit, wrong empty-tree id, history appearing after a no-history claim, object-format mismatch, current-branch change, and missing Git repository: the first four refuse; current-branch change alone does not invalidate the immutable tuple; missing Git refuses cleanly;
- real history root still rejects missing commit, commit/tree mismatch, and object-format mismatch.

## Contract 3: mechanical repair-outcome transport

The adaptive-node command that invokes a real repair node owns persistence. When the settled node result is `repair_requires_replan`, it must validate the corresponding failed, lifecycle-settled, unconsumed review attempt and write `.cache/replan-source.json` before returning the result to the caller. The schema-2 file is an envelope around a canonical payload:

```text
payload = {
  schema_version: 2,
  kind: "repair_outcome",
  result: "repair_requires_replan",
  attempt_id,
  reason,
  producer_slice,
  parent_plan_hash,
  epoch_lineage_id,
  claim_identity_digest,
  claim_root_base_digest,
  review_journal_digest,
  review_attempt_digest,
  effective_candidate_digest
}
envelope = { ...payload, outcome_digest: sha256Canonical(payload), persisted_at }
```

`reason` is a stable typed reason from the repair result, not free-form operator content. `producer_slice` is normalized and order-stable. The journal and attempt digests are computed from the exact settled authority read under lock. On retry, byte-identical semantic payload retains the original `persisted_at` and succeeds without rewriting; a different outcome at the same attempt id refuses `replan_source_conflict`. Fire `after_replan_source_outcome` immediately after the atomic write. A crash there must leave a consumable record even though the first CLI call did not print success.

`r3` makes `readSource` recompute every digest, confirm the attempt remains failed/settled/unconsumed and plan/lineage/candidate bound, and reject stale, replayed, symlinked, hardlinked, substituted, or schema-1 newly created envelopes. Schema-1 manually seeded sources remain readable only while verifying an already committed or aborted historical transaction; they cannot start or resume a new transaction. This keeps the current epoch history auditable without retaining manual JSON as a product bootstrap.

The mandatory executable test starts from a real frozen parent and failed review journal, invokes the real adaptive-node repair transition, observes the mechanically written envelope, then invokes `prepare` and `resume` to `planner_pending`. It must contain no fixture write to `replan-source.json`. Additional RED cases kill after outcome persistence, repeat the command, substitute journal/attempt/evidence/candidate/plan/lineage, race two different outcomes, and prove exactly one source record and one planner dispatch.

## Contract 4: non-circular snapshot-child binding

### Schema-2 snapshot authority

Before planner dispatch, `prepare` builds this canonical immutable projection from already known parent authority:

```text
snapshot_authority_projection = {
  schema_version: 2,
  epoch_lineage_id,
  parent_plan_epoch,
  transaction_id,
  claim_identity_digest,
  claim_root_base_digest,
  parent: {
    plan_hash,
    plan_exact_digest,
    task_mirror_exact_digest,
    ledger_semantic_digest,
    state_authority_digest
  },
  source: {
    source_evidence_digest,
    review_journal_digest,
    findings_digest,
    rebind_digest
  },
  entry_cas: {
    candidate_digest,
    claim_root_base_digest,
    inherited_frontier_digest
  }
}
snapshot_authority_digest = sha256Canonical(snapshot_authority_projection)
```

`state_authority_digest` covers only stable parent fields: schema/lineage, claim identity/root, parent epoch/active plan, inherited frontier, counters/ceiling/exemption-before, and active parent snapshot. It excludes phase, transaction fence, timestamps, and child fields. The transaction and planner packet persist both the projection and digest. The planner must copy that exact digest into the frozen child's existing `parent_snapshot_manifest_digest` Meta field. For schema 2 this field is explicitly the digest of the manifest's `snapshot_authority_projection`, not the exact-file digest of the later full manifest. This semantic name is retained for grammar compatibility and documented unambiguously.

At `child_frozen`, handoff rejects `pending`, arbitrary hex, a digest unequal to the packet/transaction, or an attestation whose exact child digest is not the frozen file. Immediately before snapshot staging, replan re-reads the exact live child and requires its plan hash, exact digest, planner binding, snapshot authority digest, transaction child identity, and attestation child identity all agree.

The schema-2 full snapshot manifest then contains:

- the exact projection and `snapshot_authority_digest`;
- the exact child path, child plan hash, child exact digest, and planner-attestation digest;
- every archived file's path/mode/size/exact digest, including the copied child;
- `manifest_self_digest = sha256Canonical(manifest without manifest_self_digest)`.

The transaction/state continue to store the exact full manifest-file digest separately. Thus the child binds immutable parent authority without a cycle, while the later full manifest seals the exact child. Recursive verification recomputes the projection from archived parent files, validates every file row, validates self and exact-file digests, and compares the child row to copied child bytes, transaction child, attestation, promoted live plan, and descendant state. Live-child substitution after freeze or archived-child corruption is therefore detected.

### Legacy self-host boundary

New snapshots are schema 2 and may never commit `pending`. A generic read-only compatibility branch may accept a schema-1 child whose field is `pending` only when all of these external seals are simultaneously present and exact:

1. immutable schema-1 manifest self digest and exact manifest-file digest verify;
2. its copied `workflow-plan.next.md` file row verifies;
3. manifest child row, copied child exact digest, transaction child plan digest, planner attestation child digest, promoted active-plan hash, and descendant plan exact bytes all agree;
4. transaction is committed and descendant state points to the exact schema-1 manifest-file digest;
5. no schema-2 manifest or new/uncommitted transaction is involved.

The verifier reports `legacy_external_binding` for that proven condition. Any missing or unequal seal refuses `legacy_snapshot_binding_unsealed`. This general rule admits the currently frozen self-host chain using the observed values above without an issue-number check and without trusting `pending`. R4's authoring validator may tolerate `pending` only before a transaction reaches `child_frozen`; its committed/resume/finalize checks must call the transaction/snapshot-aware verifier and enforce this exact compatibility rule.

Exact RED cases: new schema-2 pending child; random correct-width digest; digest from another transaction; child changed after freeze; copied child row changed; manifest child changed; attestation changed; projection field changed; parent archived file changed; promoted child differs; schema-1 pending with each external seal individually removed; current fully sealed legacy fixture passes as `legacy_external_binding`.

## Contract 5: genuine typed Case B

`readSourceAuthority` is a tagged resolver, not a review-only precondition:

1. If a failed/unresolved review attempt or repair-outcome authority exists, only the review route is legal and costs one. Diagnosis labels cannot override it.
2. Only when there is no failed or unresolved review authority may the resolver attempt `diagnosis_to_build` directly from the frozen parent plan, completed ledger, and immutable terminal artifacts. No `replan-source.json` is required or accepted for this route.

The parent Meta must declare `contract_version: 2`, `planned_transition: diagnosis_to_build`, and exact digests for these four files, each beneath `.cache/diagnosis/` or `.cache/case-b/`:

| Key | Required parsed content |
| --- | --- |
| `diagnosis_root_cause` | schema 2, matching kind, `status: diagnosis_complete`, terminal true, nonempty root-cause statement and evidence digest list |
| `falsified_alternatives` | schema 2, matching kind, `status: diagnosis_complete`, terminal true, nonempty alternatives whose results are all `falsified` and evidence digests verify |
| `acceptance_contract` | schema 2, matching kind, `status: diagnosis_complete`, terminal true, nonempty acceptance criteria |
| `recommendation` | schema 2, `kind: recommended_shape`, `status: diagnosis_complete`, terminal true, a nonempty recommended build shape and rationale |

Exact-byte digests, regular-file/no-symlink/no-hardlink checks, path containment, parsed type/status/kind, and internal evidence digests all must pass. The completed parent may write only those four declared artifact paths; product, config, test, package, generated runtime, or other cache writers disqualify the exemption. The proof payload binds parent plan hash/exact digest, complete ledger, exact four path/digest/type tuples, allowed writers, recommended-shape digest, and claim lineage. `source_evidence_digest` is its canonical proof digest.

The planner packet requires a Case-B child to cite `transition_reason: diagnosis_to_build`, `source_evidence_digest: <case-b-proof-digest>`, `diagnosis_source_digest: <case-b-proof-digest>`, and `recommended_shape_digest: <exact recommendation digest>` in Meta. Handoff/replan and the committed validator require those citations to equal the transaction proof. Missing or free-form prose citations refuse.

Budget behavior is mechanical: the first valid no-review diagnosis transition costs zero and atomically flips `case_b_exemption_consumed` to true; a second attempt costs one or reaches consent refusal. Every review-driven source costs one regardless of diagnosis labels. Untyped `{terminal:true}` fixtures, incomplete parents, unresolved/failed review presence, absent citations, digest substitution, repeated exemption, and any writer-bearing parent must be RED. The positive test begins with no review journal and no source-outcome file, builds the typed terminal parent, prepares/freezes/snapshots/activates the cited child, and proves count unchanged but exemption consumed exactly once.

## Contract 6: exhaustive durable-prefix and CAS proof

`r3` must route every replan authority mutation through labeled helpers. The test suite statically inventories the canonical replan source and refuses an unlabeled raw authority `atomicWrite`, `writeFile`, `rename`, `unlink`, or transaction/state update outside the narrowly named snapshot-copy helper. Dynamic labels carry a stable sorted ordinal/path digest, never a timestamp. The full required label inventory is:

### Main prepare/freeze/snapshot path

1. `after_tx_prepared`
2. `after_state_prepared_fence`
3. `after_packet_written`
4. `after_child_seeded`
5. `after_tx_planner_pending`
6. `after_state_planner_pending_fence`
7. `after_tx_pre_freeze_cas`
8. `after_child_frozen_bytes`
9. `after_tx_child_frozen`
10. `after_state_child_frozen_fence`
11. `after_tx_pre_snapshot_cas`
12. `after_snapshot_stage_created`
13. `after_snapshot_stage_file:<sorted-ordinal>:<path-digest>` for every staged file
14. `after_snapshot_manifest_written`
15. `after_snapshot_epoch_renamed`
16. `after_tx_parent_archived`
17. `after_state_parent_archived_fence`
18. `after_tx_pre_activation_cas`

### Activation/cleanup path

19. `after_plan_child_promoted`
20. `after_tx_child_plan_promoted`
21. `after_state_child_promoted_fenced`
22. `after_tx_child_state_promoted_fenced`
23. `after_tasks_child_promoted`
24. `after_tx_task_mirror_promoted`
25. `after_tx_cleanup_intent:<sorted-ordinal>:<path-digest>` before each authorized cleanup
26. `after_cache_unlinked:<sorted-ordinal>:<path-digest>` after each actual unlink
27. `after_tx_active_cache_cleaned`
28. `after_tx_committed`
29. `after_state_unfenced`
30. `after_tx_state_unfenced`

### Reauthor/consent/failure side paths

31. `after_tx_candidate_changed:<cas-seam>`
32. `after_state_candidate_changed:<cas-seam>`
33. `after_tx_reauthored`
34. `after_child_reauthor_seeded`
35. `after_state_reauthor_fence`
36. `after_consent_ledger`
37. `after_state_consent_ceiling`
38. `after_tx_consent_resumed`
39. `after_tx_failure_snapshot`
40. `after_tx_failure_task_mirror`
41. `after_tx_failure_cleanup`

`r2` adds the separate source prefix `after_replan_source_outcome`. Any other durable side path discovered by the static inventory must receive a label and a generated case before GREEN; this list is a floor, not permission to leave a write untested.

For every label and every dynamic file/cleanup ordinal, run an uninterrupted control, kill immediately after the write, resume once, and compare exact final plan/state/tasks/transaction/snapshot bytes plus planner-dispatch, epoch, automatic-count, Case-B-consumption, archive, and cleanup cardinalities. Resume a second time and require exact `already_committed` with no byte or cardinality change. Prefixes before publication may be completed; prefixes after a committed atomic boundary may be recognized and advanced; no prefix may duplicate child dispatch, snapshot directory, counter increment, or activation.

At each of `prepare`, `pre-freeze`, `pre-snapshot`, and `pre-activation`, independently perturb one observation axis—candidate digest, claim-root-base digest, inherited-frontier digest—for twelve cases. Every case returns typed `replan_candidate_changed` with seam, axis, expected, and actual; keeps parent plan/state/task authority; advances neither epoch nor automatic count; creates no child dispatch/snapshot/activation side effect beyond durable mismatch receipts. Removing a transient observation injection and resuming may reauthor exactly once from the same immutable claim root. A persisted claim-root/state or transaction tamper remains a hard refusal and is never reauthored into a new lineage.

## Contract 7: forge-neutral validator generation

R4 removes forge-specific CLI examples from the canonical validator comment and uses only `the forge CLI`. It must not weaken the GitLab or Gitea scanners. Regenerate all four plan-validator files from the full accumulated canonical diff using the existing edition generator; do not hand-edit generated forge ports. In the same family, add committed child-binding validation that delegates to the single schema/replan authority rather than recomputing a second digest model.

Current RED proof is exact:

- GitLab forbidden-only exits 1 because `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` contains forbidden `/\bgh\b/`;
- Gitea forbidden-only exits 1 because `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` contains forbidden `/\bglab\b/`.

## TDD task packets and rollback routing

### r2-lifecycle-transport-repair

RED first in the already declared tests for initial state, all archive callers, offline precedence/no-history claim setup, and real source transport. Then change only r2's claim/closure/handoff/adaptive-node families, mirror the complete canonical behavior, and turn those RED cases green. `r2` may produce the zero/empty root tuple, but `r3` owns its schema/verifier semantics. Do not weaken archive verification to make lifecycle tests pass.

Failure routing: a source-envelope ambiguity or archive refusal remains a visible nonzero product result and goes to r6/r7; do not fall back to a manual file. If an edition cannot preserve the same semantics modulo forge nouns, stop at r2 rather than shipping a partial root-only fix.

### r3-lineage-proof-repair

Read r2 evidence and mirror the full accumulated base-to-HEAD canonical replan/schema diff. RED first for schema-2 binding, all legacy seal counterexamples, genuine no-review Case B, stale Planning Evidence, static persistence inventory, every failpoint, and all twelve CAS cases. Then implement the one source/snapshot/budget authority described above.

Failure routing: if non-circular projection reproduction disagrees with archived files, refuse before activation and retain parent/child/transaction for inspection. If a crash prefix cannot converge without accepting unequal bytes, keep it RED; do not delete the conflicting artifact. If root authority changes, refuse lineage mutation rather than rebase the claim.

### r4-forge-contract-repair

Consume r3's verifier; do not invent another projection. RED is the two existing forbidden-only failures plus committed pending/arbitrary binding cases. Regenerate the four-file validator family and run sync/packaged checks.

Failure routing: a generated-port mismatch returns to r4 with the root file as canonical. A legacy fixture may pass only through `legacy_external_binding`; no broad `pending` allowlist and no issue-specific token is allowed.

### r5-documentation-correction

Document exactly the two initial state forms, offline zero/empty root, durable source envelope, projection/full-seal distinction, legacy externally sealed boundary, typed one-shot Case B, archive-success predicate, label/CAS matrix, and stale-first-node consistency rule. Update `D-699-01 (existing)` and `[Unreleased]`; create no new decision id and describe no hosted pipeline as a gate.

## Exact validation commands

Baseline evidence captured before implementation:

```sh
node scripts/test-replan.js
# test-replan: PASSED (496 assertions)

node scripts/simulate-workflow-walkthrough.js --only testReplanRuntimeFence699
# testReplanRuntimeFence699: PASSED; subset passed

node scripts/simulate-workflow-walkthrough.js --only testWorktreeNativeOfflineWins
# exit 1: worktree_path was nonempty under OFFLINE=1 + NATIVE=1

node scripts/simulate-workflow-walkthrough.js --only testClaimStatusRelease --only testReplanRuntimeFence699
# exit 1 in the shared lifecycle group: "released folder should leave active set"

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
# exit 1: forbidden /\bgh\b/

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
# exit 1: forbidden /\bglab\b/
```

R2 GREEN commands, from repository root:

```sh
node scripts/test-claim-hardening.js
node scripts/test-bundle-finalize.js
node scripts/test-adaptive-handoff.js
node scripts/test-adaptive-node.js
node scripts/test-replan.js
node scripts/simulate-workflow-walkthrough.js --only testWorktreeNativeOfflineWins --only testPlanlessAndPlannedInitialAuthority699 --only testArchiveCallersFailClosed699 --only testOfflineNoHistoryClaimRoot699 --only testReviewOutcomeTransport699
node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-699/workflow-plan.md --resume-check --json
```

R3 GREEN commands:

```sh
node scripts/test-replan.js
node scripts/test-adaptive-handoff.js
node scripts/test-adaptive-node.js
node scripts/test-plan-run.js
node scripts/edition-sync.js --check
node scripts/validate-script-sync.js
node scripts/kaola-workflow-replan.js status --project issue-699 --json
node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-699/workflow-plan.md --resume-check --json
```

R4 GREEN commands:

```sh
node scripts/test-replan.js
node scripts/edition-sync.js --check
node scripts/validate-script-sync.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-699/workflow-plan.md --resume-check --json
```

R5 runs documentation/source consistency probes named in its evidence plus the Meta validator above. R6 reproduces all six baseline commands and the new positive/negative focused tests. R7 adds symlink/hardlink/path-substitution, stale source/dispatch, transaction tamper, and crash double-effect attacks. R8-r10 independently run the exact gates named in their frozen briefs. Only r11 runs the repository-wide Meta `npm test`, once, on the final documented candidate.

## Out of scope

- no mutation of either frozen plan or epoch-1 evidence/snapshot;
- no issue-specific compatibility branch, digest allowlist, or operator-seeded source authority;
- no branch reset/rebase or claim-root rebasing;
- no new hosted automation gate;
- no write outside the frozen r2/r3/r4/r5 declared sets;
- no parallel product writers in epoch 2.
