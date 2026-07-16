note: node e5-documentation-correction has not yet been opened through the adaptive-node lifecycle
(no baseline, no dispatch-log nonce existed at write time) — this evidence file was written on direct
team-lead dispatch ahead of the formal per-node open, so no evidence-binding header could be preserved.
docs_updated: README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/decisions/D-699-01.md

Corrected the epoch-3 documentation surface that a prior epoch's e5 attempt had already written
(README.md/CHANGELOG.md/docs/api.md/docs/architecture.md/docs/conventions.md/docs/plan-run-cards/repair-routing.md/docs/decisions/D-699-01.md
were all already modified in the working tree; D-699-01.md already existed, matching the Plan Notes
instruction to correct it rather than allocate a new decision id). Read `kaola-workflow/issue-699/workflow-plan.md`,
`.cache/e1-epoch3-authority-blueprint.md`, `.cache/e2-versioned-epoch-repair.md`, `.cache/run-gaps-manual.md`,
`scripts/kaola-workflow-replan.js` (read-only), and `scripts/kaola-workflow-adaptive-schema.js` (read-only,
`validateEpochStateAuthority`) to verify claims before writing.

Two classes of correction:

1. Added the missing "current-epoch authority split" contract (`verifyCurrentEpochAuthority`), which
   was the actual R6-699-01 self-host fix but was completely undocumented. Verified against the live
   function at `scripts/kaola-workflow-replan.js:1045` and `validateEpochStateAuthority` at
   `scripts/kaola-workflow-adaptive-schema.js:575`. Documented the three-tier split (hash-verified
   authored Meta/Nodes/Briefs vs. parse-validated Node Ledger/Compliance/task-mirror runtime progress
   vs. the epoch_schema_version/epoch_lineage_id envelope) and the full typed-refusal set
   (state_epoch_schema_missing, state_epoch_schema_unsupported, state_epoch_lineage_missing,
   state_epoch_lineage_invalid, state_epoch_lineage_basis_invalid, state_epoch_lineage_mismatch,
   state_ledger_authority_invalid, state_ledger_progress_invalid, state_compliance_authority_invalid,
   state_compliance_progress_invalid, state_epoch_position_mismatch, state_epoch_receipt_mismatch, plus
   the four already-documented state_planless_authority_invalid/state_active_plan_hash_mismatch/
   state_planning_evidence_stale_first_node/state_task_mirror_mismatch). Also documented
   `verifyArchiveEpochAuthority` in claim.js (composes verifyCurrentEpochAuthority +
   verifyAllEpochSnapshots, run before archive and again on the archived destination/closure receipt) —
   confirmed by reading claim.js:2078-2090. Added to docs/api.md, docs/architecture.md,
   docs/workflow-state-contract.md, docs/decisions/D-699-01.md (extended Decision 1), and
   docs/conventions.md (as a forward-looking convention: new callers must compose the shared verifier,
   never rebuild a partial variant).

2. Corrected the "Verification status"/"Verification boundary" paragraphs that were duplicated
   near-verbatim across CHANGELOG.md, README.md, docs/api.md, docs/architecture.md,
   docs/workflow-state-contract.md, docs/conventions.md, and D-699-01.md. They asserted three specific
   epoch-2-era blockers as current: (a) Codex/GitLab/Gitea packaged fixtures missing
   transaction.snapshot.authority_projection, (b) a stale 120-second nested walkthrough timeout, (c)
   positive planless-epoch archival unproved/source-inconsistent. Verified (c) against the live code:
   `verifyAllEpochSnapshots` in scripts/kaola-workflow-replan.js (~line 2632) now branches on
   `binding.active_plan_hash === 'none'` and returns `{ ok: true, snapshots: [], authority_kind:
   'planless' }` directly, before any workflow-plan.md read — this matches e2's own evidence file
   ("both archive walkthrough scenarios passed") and directly contradicts the stale claim, so I removed
   it everywhere rather than repeat it. The exact assertion counts cited (test-replan.js 888,
   adaptive-node.js 2209) are also already superseded by e2's own evidence (955 and 2227
   respectively), confirming embedded pass/fail numbers go stale inside a single epoch. (a) is squarely
   e4's untouched write set (pending) and (b)/lifecycle callers are squarely e3's write set (in_progress,
   being actively edited by another agent at write time) — per the task brief's explicit instruction to
   "describe the contract, not implementation details that might shift" for that seam, I replaced all
   itemized blocker prose with a generalized, non-perishable status: versioned-authority engine (e2)
   implemented and green; lifecycle/publication (e3) and packaged-fixture (e4) repairs are separate,
   still-in-progress write surfaces; terminal certification withheld until e6/e7 certifiers and
   e8/e9/e10 falsifiers each record a pass; readers are pointed at the project's Node Ledger and
   per-node gate evidence as the live source of truth instead of embedded prose.

Also added one clause each to CHANGELOG.md bullet 1 and README.md's status paragraph naming the
authority-split fix, without inventing new "Added" bullets beyond what the epoch actually shipped.

Deliberately left out / did not touch:
- Any `.js` file (out of write set; e3 is actively editing overlapping files).
- docs/plan-run-cards/repair-routing.md — read in full; found it already accurate against the e1
  blueprint and e2 evidence (repair_requires_replan routing, planner-owned epoch transition steps,
  CAS-seam/consent-halt/legacy-v1 recovery table) with no stale "verification status" prose of the
  kind found elsewhere, so no correction was needed. No changes made.
- Precise current pass/fail status of the Codex/GitLab/Gitea packaged-fixture blocker and the
  walkthrough timeout: per the task brief's explicit guidance, described as contract/ownership only
  (which node owns the fix) rather than asserting a specific current state, since e3 is being edited
  concurrently by another agent and e4 has not started.
- No `[Unreleased]` bullet was removed; only the pre-existing "Verification status" bullet's prose was
  corrected, and one clause was added to the first "Added" bullet.
- Did not create a second D-699-01-style decision record; corrected the existing
  `docs/decisions/D-699-01.md` in place per the Plan Notes instruction.

Files changed (all within the assigned write set): README.md, CHANGELOG.md, docs/api.md,
docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/decisions/D-699-01.md.
docs/plan-run-cards/repair-routing.md was read and left unmodified (already accurate).
