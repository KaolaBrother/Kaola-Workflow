evidence-binding: n1-lifecycle-producer-fixes 76608b1dae09
<!-- RED: paste RED here -->
RED: pre-implementation `node scripts/test-adaptive-node.js` failed exactly the 14 new/updated pins, all others green — `#713: deriveRepairDelta synthesizes the delta from a folded-pass boundary marker … got {"ok":false,"reason":"review_repair_delta_unavailable"}`; `#713: a marker-less sealed pass refuses with a detail naming the sanctioned recovery … got {"ok":false,"reason":"review_repair_delta_unavailable"}` (no detail); `#713: a folded-pass re-certification with a clean frontier makes progress at the fold boundary … got {"progress":false,"reason":"review_frontier_nonprogress"…}`; `#713: the fold durably records its boundary tuple … got undefined`; `#713: the folded-pass gateA REOPENS after the repair … got status=1 out={"result":"refuse","reason":"review_repair_delta_unavailable","detail":null,"nodeId":"gateA","closed":"writer"…}` (the issue's six-step wedge reproduced end-to-end in a real git repo over the real CLI: writer v1 → gateA(security-reviewer) PASS sealed → gateB(code-reviewer) FAIL → repair-node folds gateA+gateB, purges gateA.md → writer repairs → gateA reopen refused); `#714: splice keeps table rows contiguous with exactly one blank line before the next heading` + `#714: no blank line splits the table after the append`; `#714: the untouched close-node output passes validateRequiredAgentCompliance byte-untouched … got {"ok":false,"reason":"required_agent_compliance_invalid","detail":"## Required Agent Compliance must contain exactly one requirement for every node"}` + the three defect pins (blank inside table / bare `code-reviewer` cell / no blank before next heading); `T14b (#714): appended compliance row uses the canonical role (node-id) cell` + `… is NEVER a bare role cell`.
<!-- GREEN: paste GREEN here -->
GREEN: all 14 pins now pass — `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (2479 assertions)" (includes the #713 E2E: fold marker on gateA's sealed pass, gateA reopens with a synthesized closure repair_delta bound to the folding attempt B1, fold-boundary re-certification closes PASS, gateB normal closure, finalize closes, 4 settled attempts, validateReviewJournal(planHash,2) ok, --resume-check ok, no replan-source.json needed, compliance table validator-clean) — 2479/2479 assertions green. Gates: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0, repair/fold/orphan-guard assertions unchanged); `node scripts/edition-sync.js --check` → parity (12 forge aggregator ports, 25 COMMON_SCRIPTS, 28 byte-identical groups); `node scripts/validate-script-sync.js` → OK; `node scripts/test-replan.js` → PASSED (832 assertions); `node scripts/test-adaptive-handoff.js` → passed (179); `node scripts/test-claim-hardening.js` → passed (450); `node scripts/test-kimi-edition.js` → passed (577); `node scripts/test-opencode-edition.js` → passed (547).

## What changed (canonical scripts/, then propagated)

#713 — fix option (b) (the issue's preferred): the fold records its own boundary;
`deriveRepairDelta` (and thereby both consumers — the schema-2 open path in adaptive-node
and the journal validator) accepts a folded-pass lineage. Option (a) was NOT needed (no
journal invariant is violated by (b)); option (c) is implemented as the floor (below).

- `scripts/kaola-workflow-adaptive-node.js` `runRepairNodeCore` (new step (4a) after the
  gate fold): for every folded gate whose latest journal attempt is a settled PASS
  (`completedJournalGates` — same set that drives the stale-pass receipt purge), durably
  record on that attempt `fold: { repair_attempt_id, selected_writer, candidate_digest,
  candidate_declared }` — the folding repair's attempt id, its selected writer, and the
  sealed pass candidate digest/declared map (copied from the attempt's own fields).
  Contract-2 attempts only (schema-1 journals have no V2 delta consumer). The marker lives
  in the review journal, NEVER in the purged `.cache/<gate>.md`; in-memory at fold time,
  persisted by the existing settled/consumed journal writes, recomputed idempotently on
  every resume (all crash windows reconverge; no new journal write added).
- `scripts/kaola-workflow-adaptive-schema.js` `deriveRepairDelta`: two legitimate
  boundaries — the ordinary settled/consumed FAIL (unchanged semantics) and the folded
  settled PASS carrying a marker (cross-checked fail-closed against the attempt's own
  sealed partition via `effectiveCandidate`; a disagreeing marker is tampering and
  refuses). Synthesizes `repair_attempt_id` = folding attempt, `selected_writer` = folding
  writer, before = sealed pass candidate, after = current candidate, paths = declared-blob
  diff.
- `validateReviewJournalV2`: new fail-closed `attempt.fold` shape wall
  (`review_journal_fold_marker_invalid`): exact 4 keys, sealed-pass-only
  (`outcome === 'pass' && lifecycle_settled`), captured candidate byte-equal to the
  attempt's own `candidate_digest`/`candidate_declared`, and the referenced folding attempt
  must exist in this journal, be `outcome === 'fail'`, and have
  `repair.selected_writer === fold.selected_writer`. Round-trips the strict validators:
  journal validate, `--resume-check`, phase/lineage checks (asserted in the E2E).
- `assessReviewProgress`: new optional `fold_boundary` input — at a proven folded-pass
  boundary the gate legitimately re-presents an UNCHANGED (empty) frontier, so
  frontier-EQUAL + proof-clean + validation-pass is convergence; without the flag the
  strict frontier-shrink rule is byte-identical. Passed identically by both call sites
  (close-side `beginSchema2ReviewAttempt`, validator recompute) from the same journal
  bytes: `previous.outcome === 'pass' && previous.fold` present.
- Conservative invariants kept: the stale-pass receipt purge is untouched (a pass over the
  pre-repair tree never certifies the repaired tree), `baselineReused: true` untouched,
  mid-gate (`in_progress`) folds and the adversarial fan-out group purge untouched
  (N684-5/N684-6 and the walkthrough's repair assertions green unchanged).

Option-(c) floor / refusal-text surface (COORDINATION FOR n2-documentation): the only
remaining wedge path is a marker-less sealed pass (a journal written by a pre-fix
repair-node). It still refuses `review_repair_delta_unavailable`, now WITH detail, verbatim:

  "the gate's previous lineage attempt is a settled pass with no recorded fold boundary (a journal written before fold markers existed); sanctioned recovery: release-and-adopt (claim release, then a fresh adopt-candidate claim) or a replan prepare from a repair_requires_replan refusal"

n2-documentation: please write exactly this recovery (release-and-adopt primary, replan
prepare when a `repair_requires_replan` source exists) into the repair-node plan-run card
and reference this detail string as the refusal surface.

#714 — producer-side correctness (validator untouched, still strict):

- `scripts/kaola-workflow-adaptive-node.js` `addCloseCompliance`: the append path now
  ALWAYS emits the canonical `role (node-id)` cell (was `legacyRequirement ||
  canonicalRequirement` — bare for code-reviewer/security-reviewer). READ/match
  compatibility kept: the in-place advance path and `complianceRowExists` still match
  already-emitted legacy bare rows so they advance in place (pinned by a regression
  control) — but no path EMITS a bare cell anymore.
- `scripts/kaola-workflow-adaptive-schema.js` `spliceComplianceSection`: the `sec.next`
  append branch normalizes the boundary — `content.slice(0, sec.next).trimEnd() + '\n' +
  row + '\n' + content.slice(sec.next)` — so rows stay contiguous and exactly one blank
  line separates the table from the following heading (the section-trailing blank used to
  migrate INTO the table and the new row abutted the heading). `validateRequiredAgentCompliance`
  NOT relaxed; the issue's tolerance option deliberately not taken.

Tests (`scripts/test-adaptive-node.js`, +580 lines):
- #713 unit pins: folded-pass synthesis (+tampered-marker fail-closed), marker-less wedge
  detail, fold-boundary steady-state progress (+ two controls: no-boundary stays
  non-progress, failed validation never launders).
- #713 E2E over the real CLI in a real git repo: the issue's exact six steps on a schema-2
  serial writer → security-reviewer → code-reviewer plan (distinct gate claims ⇒ distinct
  scope lineages), driving to finalize with the claim intact; doubles as #714's schema-2
  pre-seeded-cycle pin (gate re-close after repair advances, never duplicates/drifts).
- #714 unit pins (splice normalization + EOF control) and the issue's round-trip: legacy
  3-node open/close cycle → untouched plan into `validateRequiredAgentCompliance`, with the
  three drift defects pinned explicitly; legacy bare-row advance regression control.
- Updated three stale pins that asserted the buggy bare-cell emission (T14b, R5, S391c) to
  assert the canonical cell instead.
- `scripts/simulate-workflow-walkthrough.js`: NOT modified — no cycle-level compliance
  assertion pins the drifted format (existing fixtures hand-author canonical tables; the
  repair/fold scenarios' semantics unchanged), per the task's "extend only if fixtures must
  move" instruction.

Propagation (sync:editions guard): `node scripts/edition-sync.js --write` regenerated the
three adaptive-node ports and byte-replicated the four adaptive-schema copies; `--check`
and `validate-script-sync.js` green. No port was hand-edited.

Write-set check: only the 9 declared files were modified (2 canonical scripts + 6 ports +
test-adaptive-node.js); simulate-workflow-walkthrough.js unchanged (see above). Main
checkout untouched — all work in the linked worktree.

Note for finalization: this diff touches the edition trees, so CLAUDE.md's four-chain
obligation (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` sequentially) applies
at Finalization; this node ran the plan-listed gates above (all green).
