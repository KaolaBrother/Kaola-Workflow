evidence-binding: r5-documentation-correction 7dbb4753c89a
upstream_read: r4-forge-contract-repair 9667df96675c
upstream_read: r1-repair-blueprint e5345fa3e0ad
upstream_read: r2-lifecycle-transport-repair b6675aaedc02
upstream_read: r3-lineage-proof-repair ef637b74db4b
role: doc-updater
delegation_outcome: completed
result: COMPLETE_WITH_CERTIFICATION_BLOCKERS
docs_updated: README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md

# r5 epoch-2 documentation correction

## Authority and scope

- Read `CLAUDE.md`, the complete frozen epoch-2 plan/r5 brief, r1 blueprint, current reopened r2 evidence, r3 implementation evidence, and direct r4 evidence before editing.
- Preserved every source, test, plugin/generated surface, frozen plan/state/transaction artifact, and prior node evidence. The only writes are the eight declared documentation files plus this seeded evidence file.
- Kept the existing `D-699-01`; no second decision id was created.
- Used a read-only source audit to verify implementation names and locate wording hazards; the audit made no filesystem changes.

## Documentation corrections

- `README.md` now describes the exact planless -> planned initial publication, offline no-worktree/no-in-place-branch behavior, zero-commit/canonical-empty-tree root, mechanical repair-outcome source, projection/full-seal distinction, historical external seal, typed Case B, 41-family/12-CAS proof, fail-closed archive boundary, and honest current certification status.
- `CHANGELOG.md` replaces the epoch-1 residual triad with the epoch-2 delivered mechanics and current PARTIAL boundary. It records the reopened r2 watch/closure target as green without claiming positive planless archival or integrated packaged completion.
- `docs/api.md` documents both legal initial authority forms, offline root behavior, schema-2 `repair_outcome` fields/consumption, CLI phases, the packet projection, child/full-manifest digest meanings, typed no-review Case B, 41 labels plus five dynamic forms, 12 CAS cells, historical `legacy_external_binding`, active Planning Evidence checks, archive-success predicate, public exports, and current blockers.
- `docs/architecture.md` now shows the full authority chain: initial plan state and immutable root, mechanical source transport, planner-only child, projection-before-child/full-seal-after-child, four-seam CAS, six-step activation, 41-family crash model, inherited G4 obligations, typed no-review Case B, archive caller boundary, and certification limits.
- `docs/workflow-state-contract.md` adds `replan-source.json`, projection fields, two-way snapshot seals, exact planless/planned forms, offline root semantics, 41/five-dynamic label inventory, 12-CAS no-effect requirement, Case-B state/budget rules, Planning Evidence consistency, historical external binding, and fail-closed archive consumption.
- `docs/conventions.md` prohibits manual source JSON, hash-only Planning Evidence patches, synthetic roots, projection/full-manifest conflation, schema-2 use of historical `pending`, and coverage overstatement; it gives the exact evidence wording for current partial certification.
- `docs/plan-run-cards/repair-routing.md` now requires the mechanically persisted source outcome before `prepare`, treats a missing packet projection as a transaction/fixture defect rather than operator input, separates no-review Case B from failed-review repair, and routes legacy seal failures without thawing the parent.
- `docs/decisions/D-699-01.md` remains `accepted contract; implementation certification pending` and now records initial/offline authority, mechanical source transport, non-circular projection/full seal, external historical compatibility, 41-family plus dynamic/12-CAS proof, typed Case B, Planning Evidence/archive gates, and the current certification boundary.

## Exact contract recorded

- Epoch 1 recognizes exactly `planless` and `planned`; fresh claim writes planless, and initial handoff atomically publishes active hash plus complete Planning Evidence. Child activation replaces the full child tuple and task/snapshot pointers; stale first-node/hash/task-mirror states refuse.
- Offline dominates `KAOLA_WORKTREE_NATIVE=0|1`; output has no worktree and no in-place branch, while claim identity binds the resolved repo-root authority path. No-history root is the object-width all-zero commit plus locally recomputed canonical empty-tree id.
- Direct repair atomically persists schema-2 `.cache/replan-source.json` before returning `repair_requires_replan`; prepare verifies the same failed, settled, unconsumed attempt and never accepts operator-authored bootstrap JSON.
- `snapshot_authority_projection` exists before planner dispatch. The schema-2 child field `parent_snapshot_manifest_digest` binds its digest; the later full manifest separately seals exact child/attestation/files, manifest self-digest, and exact manifest bytes. Historical schema-1 `pending` is accepted only as fully proven `legacy_external_binding`.
- Case B is a no-review route: review journal/source absence, completed parent, four exact regular schema-2 terminal `diagnosis_complete` artifacts, artifact-only writers, exact child citations, and one-shot zero-cost consumption.
- `REPLAN_DURABLE_WRITE_LABELS` contains 41 base families and five deterministic dynamic suffix forms. Tests lock that inventory and execute every discovered main-path crash prefix; the docs explicitly do not claim direct failpoint execution for every consent/failure side label. Four seams x three axes produce the 12-CAS no-unintended-effect matrix.
- `archiveSucceeded` accepts only `archived:true` or idempotent `skipped:"source-missing"`. Finalize, release, and watch callers stop before cleanup/success on every other result; lineage-preserved receipts are derived only after recursive archive verification.

## Certification boundary and blocker disposition

- Reopened r2 target: GREEN. GitLab `testWatchMrAbandonedClosureInvariantsClean`, Gitea `testWatchPrAbandonedClosureInvariantsClean`, and their next same-owner stateless-orphan cases pass. Focused r2 proof remains green at claim-hardening 264, bundle-finalize 148, adaptive-handoff 165, adaptive-node 2209, and re-plan 888 assertions.
- Focused r3/r4 proof: GREEN. Re-plan 888, resume-check, edition/script sync, and both forge forbidden-only probes pass. The former A5-699-02 offline/native and A5-699-03 forbidden-token targets are not presented as still red.
- Codex packaged contract validator: BLOCKED. `node scripts/validate-kaola-workflow-contracts.js` exits 1 at `plugins/kaola-workflow/scripts/kaola-workflow-replan.js:1384` because its legacy direct fixture omits `transaction.snapshot`, so `buildPlannerPacket` reads missing `authority_projection`.
- GitLab/Gitea packaged suites: BLOCKED on the equivalent r3-owned/incomplete fixture shape at their replan ports; this is the current r2 replay handoff blocker, not the now-fixed r4 closure-receipt blocker.
- Focused five-scenario walkthrough wrapper: BLOCKED by its stale 120-second nested `test-replan.js` timeout; the standalone 888-assertion re-plan suite passes.
- Positive planless archival: UNPROVED / SOURCE-INCONSISTENT. Recursive verification accepts zero snapshots but then can compare the intentionally absent `workflow-plan.md`, returning `snapshot_active_plan_mismatch`. Existing tests prove initial forms and fail-closed refusal injection, not successful planless archival. Later runtime/test owners must repair and certify this before integrated PASS.
- Disposition: documentation does not repair any source/test blocker or claim integrated PASS. Later r6/r7/r8-r10 owners must review/falsify the exact candidate and route the fixture, timeout, and positive-planless gaps to authorized write sets.

## Scoped checks

- `node scripts/test-route-reachability.js` -> PASS, 1037 assertions.
- `node scripts/validate-workflow-contracts.js` -> PASS.
- `node scripts/validate-kaola-workflow-contracts.js` -> EXPECTED BLOCKED on the documented incomplete `transaction.snapshot` fixture; no out-of-scope repair attempted.
- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-699/workflow-plan.md --resume-check --json` -> PASS, frozen plan hash `356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938`.
- `node scripts/generate-routing-surfaces.js --check` -> PASS, all 12 surfaces byte-match the skeleton.
- `node scripts/edition-sync.js --check` -> PASS, 12 forge ports, 25 common mirrors, 27 byte-identical groups.
- `node scripts/validate-script-sync.js` -> PASS, all common/byte/normalized/hook/export-superset families in sync.
- GitLab and Gitea standalone `--forbidden-only` validator checks -> PASS.
- Local Markdown target check across all eight updated docs -> PASS.
- Epoch-2 docs/source consistency probe -> PASS: required terms present; 41 labels, five dynamic forms, four CAS seams, and exact `archiveSucceeded` truth table agree with source.
- Stale residual wording scan -> PASS; no old `n5`/three-unresolved-triad certification claim remains.
- `git diff --check` -> PASS.
- `record-evidence --verify` -> PASS (initial self-check); final evidence re-verification follows this update.
- Node closure -> not run; lifecycle ownership remains with the parent orchestrator.
