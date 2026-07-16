evidence-binding: n6-documentation c49f69bd882d
upstream_read: n5-edition-contract-proof 343b9eb67127
role: doc-updater
delegation_outcome: completed
result: COMPLETE_WITH_UPSTREAM_CERTIFICATION_BLOCKERS
docs_updated: README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md

## Changed documentation

- `README.md` now presents planner-owned, claim-preserving re-plan epochs in the adaptive workflow overview and operational script map. It explicitly separates the normative contract from the still-partial Unreleased runtime certification.
- `CHANGELOG.md` records the #699 contract under Unreleased and preserves `A5-699-01`, `A5-699-02`, and `A5-699-03` as certification blockers rather than converting structural GREEN into integrated PASS.
- `docs/api.md` documents the re-plan CLI, transaction phases, CAS seams, activation journal, planner-only authoring boundary, liveness/consent rules, snapshots, v1 compatibility, typed refusals, and verified public exports.
- `docs/architecture.md` documents authority transfer across epochs, the journaled roll-forward model, inherited-frontier/G4 obligations, immutable snapshots, budget rules, and the terminal-verification boundary.
- `docs/workflow-state-contract.md` inventories the new durable cache artifacts and schema-2 lineage/state fields, including transaction fencing, recovery, consent, snapshot, legacy, and archive invariants.
- `docs/conventions.md` replaces the obsolete discard/restart recovery guidance with the planner-owned epoch route and defines accurate proof wording for structural versus integrated results.
- `docs/plan-run-cards/repair-routing.md` routes `repair_requires_replan`, unattributed writes, and topology-changing repairs through `prepare`/`resume` without editing the frozen parent.
- `docs/decisions/D-699-01.md` is the next-free accepted decision record for the immutable-parent, planner-owned-child, claim-preserving epoch contract; its status is `accepted contract; implementation certification pending`.

## Contract documented

- The parent frozen plan and Node Ledger remain byte-immutable and authoritative until child activation; the issue claim/label, branch, worktree, product candidate, claim root, and inherited frontier survive.
- `workflow-planner` exclusively authors and attests `workflow-plan.next.md`; main passes evidence, typed reason, bindings, and the exact child path without prescribing DAG topology or ownership.
- The transaction advances `prepared -> planner_pending -> child_frozen -> parent_archived -> committed` under `scheduler.lock` and fences ordinary mutation while incomplete.
- Prepare, pre-freeze, pre-snapshot, and pre-activation CAS observations bind candidate, claim-root, and inherited-frontier digests; drift returns `replan_candidate_changed` without epoch or budget advance.
- Activation is an ordered multi-file roll-forward (`child_plan_promoted`, `child_state_promoted_fenced`, `task_mirror_promoted`, `active_cache_cleaned`, `transaction_committed`, `state_unfenced`), not a claim of one filesystem-atomic write.
- Immutable epoch snapshots retain the complete parent proof tree, including the authoritative review journal and every attempt's complete `rebind` ledger; inherited code/security work retains G4 certification obligations.
- Two automatic review-driven replacements are allowed per claim lineage; a further attempt consent-halts, each verified user action adds exactly one hash-chained slot, and the strictly proven diagnosis-to-build exemption is one-shot.
- Verified v1 authority remains explicit and moves to schema 2 only through the fail-closed compatibility transaction.
- Hosted CI/CD is not a completion gate; candidate-bound local validators, packaged walkthroughs, review roles, and falsification nodes own certification.

## Verification boundary and remaining documentation risks

The documentation is complete for the frozen target contract, but terminal runtime certification remains withheld by upstream proof. The following findings are intentionally visible in README/CHANGELOG and detailed references:

- `A5-699-01`: planless finalize/release cleanup leaves an active project folder, and the Codex packaged walkthrough stops before the re-plan smoke.
- `A5-699-02`: GitLab/Gitea offline-native fixtures expect an empty worktree path while runtime resolves a real edition-local worktree.
- `A5-699-03`: forge plan-validator forbidden-token probes still find `gh` in GitLab and `glab` in Gitea.

Documentation risk is limited to those upstream implementation results changing before Finalization; if their owners repair and re-certify the candidate, the Unreleased verification caveats and decision status must be refreshed from the new exact evidence. No docs claim integrated PASS today.

## Scoped checks

- `node scripts/test-route-reachability.js` -> PASS (`1037 assertions`).
- `node scripts/validate-workflow-contracts.js` -> PASS.
- `node scripts/generate-routing-surfaces.js --check` -> PASS (`all 12 surfaces byte-match the skeleton`).
- Local Markdown link-target check across all eight updated docs -> PASS.
- Documented `kaola-workflow-replan.js` export probe -> PASS (`10` exports present).
- `git diff --check` -> PASS.
- Write scope -> only the eight assigned documentation files plus this seeded evidence file.
- Node closure -> not run; the parent orchestrator retains lifecycle ownership.
