evidence-binding: n2-documentation a6649907cf19
upstream_read: n1-lifecycle-producer-fixes 76608b1dae09
<!-- docs_updated: paste docs_updated here -->
docs_updated: CHANGELOG.md + docs/plan-run-cards/reopen-complete-node.md

## What changed (docs only; write set = CHANGELOG.md, docs/plan-run-cards/reopen-complete-node.md)

- `CHANGELOG.md` — one `[Unreleased]` → `### Fixed` bullet covering the bundle that closes
  #713 and #714 together. #713: repair-node's fold now durably records the
  `fold: { repair_attempt_id, selected_writer, candidate_digest, candidate_declared }`
  boundary marker on each folded gate's settled-PASS contract-2 journal attempt;
  `deriveRepairDelta` synthesizes the delta from that marker (fail-closed cross-check against
  the sealed partition); the marker-less sealed pass still refuses
  `review_repair_delta_unavailable`, now with detail naming the sanctioned recovery, with a
  link to the repair-node card. #714: `addCloseCompliance` always emits the canonical
  `role (node-id)` cell on append; `spliceComplianceSection` normalizes the boundary (rows
  contiguous, exactly one blank line before the next heading); validator not relaxed.
- `docs/plan-run-cards/reopen-complete-node.md` — new section 7, "Folded review gates — the
  fold-boundary marker and its sanctioned recovery (#713)", documenting: (a) what repair-node
  records when it folds an already-passed gate (the 4-key `fold` marker on the settled-PASS
  journal attempt, contract-2 only, in the journal never the purged `.cache/<gate>.md`,
  idempotently recomputed on resume); (b) how the folded gate's reopen obtains its repair
  delta (`deriveRepairDelta` synthesizes repair_attempt_id/selected_writer from the folding
  attempt, before = sealed pass candidate, after = current candidate, paths = declared-blob
  diff; tampered markers refuse; fold-boundary frontier-EQUAL counts as convergence); and
  (c) the #713 third-acceptance-criterion recovery path for the one remaining wedge (a
  marker-less sealed pass from a pre-fix journal), quoting n1's shipped refusal detail
  VERBATIM: "the gate's previous lineage attempt is a settled pass with no recorded fold
  boundary (a journal written before fold markers existed); sanctioned recovery:
  release-and-adopt (claim release, then a fresh adopt-candidate claim) or a replan prepare
  from a repair_requires_replan refusal" — mapped to the real primitives
  (`kaola-workflow-claim.js release` + fresh `claim`; `kaola-workflow-replan.js prepare`,
  which requires the `repair_requires_replan` handoff as its source), plus a do-not-hand-edit
  warning (a fabricated marker fails the fail-closed sealed-partition cross-check). Decision
  tree gained a `review_repair_delta_unavailable` branch pointing at section 7.

## Verification performed

- Refusal detail text verified byte-for-byte against
  `scripts/kaola-workflow-adaptive-schema.js` (`deriveRepairDelta`, ~line 2016) in this
  worktree — the quoted string matches the code exactly, no invented recovery.
- Fold-marker shape verified against `scripts/kaola-workflow-adaptive-node.js`
  (`runRepairNodeCore`, ~lines 7640-7645): exact 4 keys, contract_version 2 + settled pass
  only; stale-receipt purge (`completedJournalGates` → `removeEvidenceName`) untouched.
- Recovery primitives verified to exist: `kaola-workflow-claim.js release|claim` subcommands;
  `kaola-workflow-replan.js prepare --project P [--source-attempt A]`, which per
  `prepareReplan`/`readSource` requires a `repair_requires_replan` handoff as source.
- No decision record allocated for this bundle (per plan direction); none written.
- Write-set check: only CHANGELOG.md, docs/plan-run-cards/reopen-complete-node.md, and this
  evidence file touched; all edits in the linked worktree, main checkout untouched.
