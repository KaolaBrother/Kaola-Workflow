evidence-binding: n4-docs ffd4a4c68e7f

## n4-docs — documentation update for #595 / #594 / #593

### A. Six plan-run routing surfaces (LOCKSTEP, all byte-identical for the two edited blocks)
1. `commands/kaola-workflow-plan-run.md`
2. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`
4. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
5. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`

Confirmed (via `grep`) all six carried byte-identical stale text in two spots before editing:
(a) the dispatch-instructions bullet ("`--write-overlap-consent` is required ONLY for
coarse/shared-infra (non-disjoint) co-open"), (b) the `<!-- PIN: leg-isolation-recipe -->`
block. Both rewritten identically across all six files to state: planner-proven-disjoint,
shared-infra, AND coarse (same non-shared top-level area, exact-file-disjoint) write
frontiers ALL co-open by default under the retained net (post-dominating `code-reviewer`
gate + no PROTECTED file); serial is the fallback only for a genuine exact-path overlap
(same file/case-collision), a directory/glob-shaped entry that can't prove exact-path
disjointness, the net not holding, no worktree support, or `KAOLA_PARALLEL_WRITES=0`;
`--write-overlap-consent` / `write_overlap_policy` stay parsed for frozen-plan back-compat
but are VESTIGIAL at this seam. The `--write-overlap-consent` literal token and the
`<!-- PIN: leg-isolation-recipe -->` / `<!-- PIN: frontier unit -->` markers were
PRESERVED verbatim in all six (route-reachability T5/T8 pin exactly these tokens).

**Needle-preservation proof:**
- `node scripts/test-route-reachability.js` → `Route-reachability test passed (185 assertions).`
- Post-edit grep confirmed each of the six files still carries exactly 1×
  `<!-- PIN: leg-isolation-recipe -->`, 2× `--write-overlap-consent`, 1×
  `<!-- PIN: frontier unit -->`.
- The stale phrase `is required ONLY for` no longer appears in any of the six files
  (`grep -rn` returned zero hits across all six).

**Provenance scan (required by PROVENANCE_BAN — scans these exact six surfaces):**
`grep -nE '#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|\bINV-[0-9]+|ADR[ -][0-9]{2,4}' <the six files>`
→ zero hits (no issue refs, decision IDs, invariant tags, or ADR citations were introduced;
none existed pre-edit in the two rewritten blocks either).

### B. Docs
7. `docs/conventions.md` — added a new `## Write co-open eligibility: exact-path is the
   granularity of truth (#593)` section (after the existing Freeze-time write-set hygiene
   section, before Barrier and write-halt triage payload): states the new default-relax
   contract, then the consequence for planner surface maps — exact-path is now the only
   granularity that matters, and lists the concrete hidden-shared-surface classes
   (`package.json` chain entries, `simulate-workflow-walkthrough.js` needles, `install.sh`
   registration blocks, contract-validator `assertIncludes`/`assertConcept` needle pins) a
   planner's write-set declaration must surface so a genuine collision on one of them
   classifies `exact` (correctly serialized) instead of silently escaping the proof. No
   needle constraint in any validator pins this file's prose (verified: no
   `assertConcept`/`assertIncludes` reference `docs/conventions.md`).
8. `docs/plan-run-cards/frontier-batch.md` — rewrote §3 (`open-ready` frontier-condition
   bullets: write-frontier eligibility now names disjoint/shared-infra/coarse together as
   BY-DEFAULT co-openers under the retained net; the old standalone "Overlapping
   (non-disjoint, `write_overlap_policy: coarse`) writes: require `--write-overlap-consent`"
   bullet is replaced with a "Genuinely-overlapping (`exact`)... NEVER co-open... consent is
   VESTIGIAL" bullet) and §7's table (same substitution). The `<!-- PIN: frontier unit -->`
   pin and the CLI flag signature (`open-ready ... [--write-overlap-consent]`, still legal
   for back-compat) were left untouched. `route-reachability` T5 (frontier-batch is not
   itself pinned by T5 — the six routing surfaces are — no regression risk here) plus manual
   grep confirm the card's pinned structure (headers, quick-reference diagram, cap table)
   is otherwise unchanged.
9. `docs/api.md` — (1) removed the `batch_active` reason-inventory bullet entirely (#594);
   fixed `serial_node_live` ("no scheduler/batch" → "no scheduler fan-out", dropped
   `batchState` from its carried context — verified against the actual `coordinationRefusal`
   diff: neither `scheduler_active` nor `serial_node_live` carries `batchState` post-#594)
   and added a one-line note on `scheduler_active` that the sibling `batch_active` reason no
   longer exists. (2) Rewrote the "Write-overlap relaxation" section's `coarse` bullet from
   "UNCHANGED — stays consent-gated" to "also co-opens BY DEFAULT under the same retained
   net (#593)" with the `hasUnresolvableEntry` resolvability guard explained, and updated the
   closing "refusal stands verbatim" sentence to list `exact` + unresolvable-coarse instead
   of `coarse with off/no-consent`. Did NOT touch the `## Closure Contract` /
   `audit-labels/repair-labels forge parity` `assertConcept` sections (verified: those are
   the only two `assertConcept('docs/api.md', ...)` calls in `validate-workflow-contracts.js`,
   neither overlaps the edited regions).
10. `docs/architecture.md` — fixed 5 stale spots: (i) the #281/D-586-01 retirement
    paragraph — was "guard prologue still recognizes... batch_active refusal... backward-compat
    crash detection", now states D-586-01 KEPT it as a future call and D-594-01 REMOVED it
    in full, including the sibling `active_batch_exists` arm; (ii) the AC#5/#293 legality
    paragraph — clarified the residual `active-batch.json` READ is `orient`'s own KEPT
    legality reconstruction (a scope boundary distinct from the removed guard), not "the
    backward-compat detection noted above" (which no longer exists as such); (iii) [INV-2]
    byte-identity invariant — dropped the now-vacuous "no active-batch" condition, noted why;
    (iv) "Guard refusal taxonomy is three-armed" → "two-armed", `batch_active` moved to a
    parenthetical past-tense note; (v) the lane-group co-open paragraph's "an overlap result
    degrades immediately to single serial write (only a genuinely-overlapping frontier stays
    consent-gated...)" → describes the `writeOverlapRelaxable` shared-infra/coarse downgrade
    accurately, narrowing "degrades to serial" to genuine `exact` overlap or an unresolvable
    coarse pair; (vi) the D-419-01 Part 3 one-line summary — added the D-593-01 coarse
    default-relax clause alongside the existing D-542-01 disjoint-writes clause. Verified
    live against the actual `writeOverlapRelaxable` diff (git diff HEAD --
    scripts/kaola-workflow-plan-validator.js) before writing every claim.
11. `CHANGELOG.md` — added three `[Unreleased]` entries, one per issue: `### Fixed` for #595
    (inserted at the top of the existing Fixed section, newest-first); `### Removed` for
    #594 (inserted at the top of the existing Removed section, ahead of the #586 parallel-batch
    retirement it follows on from); new `### Changed` section (added after `### Fixed`,
    matching the Fixed-then-Changed section-ordering precedent set by the 6.13.0/6.9.0
    release blocks) for #593. Each references its decision record and the four-chain
    cross-edition obligation, following the established narrative style (RED-first evidence,
    suite counts, cross-edition confirmation) of the surrounding entries.
12. `docs/decisions/D-593-01.md` (new) — co-open default-relax decision. Context: the
    `coarse` vs `shared-infra` asymmetry and its concrete cost in THIS repo (every
    cross-edition write frontier lives under `plugins/`, so it always classified `coarse`
    and always needed manual consent). Decision: relax `coarse` under NET-1+NET-2 like
    `shared-infra`, plus the new `hasUnresolvableEntry` guard; `exact` never relaxes;
    `write_overlap_policy`/`--write-overlap-consent` vestigial. Alternatives considered:
    keep consent-gated (status quo, rejected — the defect itself), plain-green with no net
    (rejected — reopens the resolvability soundness gap), squat `write_overlap_policy:exact`
    or repurpose consent as an override (rejected — reopens the same gap / collides with the
    reserved future axis), retire the policy/consent fields outright now (rejected — breaking
    change to in-flight frozen plans, out of scope).
13. `docs/decisions/D-594-01.md` (new) — dead-guard removal decision, structured to
    explicitly supersede D-586-01's "future call" framing. Documents the zero-writer grep
    proof, the `batch_active` guard removal (7 removal sites in `adaptive-node.js`) PLUS the
    `active_batch_exists` expansion (2 more sites) under the plan's "only if provably dead"
    authorization, and a dedicated "Scope boundary — deliberately kept" section arguing why
    `orient`'s read-only legality reconstruction stays (different consumer kind,
    contract-bearing, byte-identical for every producible state either way) — matching n2's
    evidence and n3's WITHSTOOD verdict on this exact question.
14. `docs/decisions/D-595-01.md` (new) — lock-orphan unlink decision. Context explicitly
    cross-references D-585-01's own "Residual accepted risks" section, which named this
    EXACT orphan window as an accepted risk when the scheduler lock first shipped — this
    decision is that risk's resolution. Decision + no-takeover invariant argument mirrors
    n1's evidence (fd-ownership reachability argument, RED-first T-595-orphan test). Corrected
    the `Related:` cross-reference from a fabricated `D-546-02` to the actual filename
    `docs/decisions/D-546-01.md` (titled "D-546-G2") after verifying the real file.

### Verification (all re-run after every doc edit, final run below)
- `node scripts/test-route-reachability.js` → `Route-reachability test passed (185 assertions).`
- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`
- `node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation passed`
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` →
  `Kaola-Workflow GitLab contract validation passed`
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` →
  `Kaola-Workflow Gitea contract validation passed`
- `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1248 assertions)` (no
  regression from n2's recorded 1248 — doc-only node, no code touched)
- `node scripts/test-commit-node.js` → `commit-node tests passed (123 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`
  (incl. `testTwoLanesInOneCheckout579`)
- Provenance scan on the six routing surfaces (see §A) → zero hits.
- `git status --short` confirms containment: only the 14 declared write-set files are
  modified/created (11 `M`, 3 new `docs/decisions/D-59{3,4,5}-01.md`); no file outside the
  declared set was touched.

### Anti-fabrication notes
Every claim about code behavior (the `writeOverlapRelaxable` NET-1/NET-2 logic,
`hasUnresolvableEntry`'s two shape checks, the `coordinationRefusal` context fields dropping
`batchState`, the exact removal sites in `adaptive-node.js`, the `acquireProjectLock` catch
branch and its `fd !== undefined` reachability argument) was verified by reading the actual
diff (`git diff HEAD -- scripts/kaola-workflow-plan-validator.js`,
`git diff HEAD -- scripts/kaola-workflow-adaptive-schema.js`,
`git diff HEAD -- scripts/kaola-workflow-adaptive-node.js`) before writing it into any doc —
no API/schema/reason-code content was guessed. No `BLOCK:` was needed.

### Deviations from the task spec
None within the declared write set. Two OUT-OF-WRITE-SET staleness findings surfaced during
verification, left untouched per the frozen-write-set rule (flagged here for the
orchestrator/reviewer to route, mirroring how n2 flagged its own out-of-set need):
1. `docs/workflow-state-contract.md:96` still describes the guard-prologue "still recognizes
   a residual `active-batch.json` on disk (a `batch_active` refusal) purely as backward-compat
   crash detection" — this is now false (#594 removed that detection in full). Not in n4's
   write set.
2. `docs/investigations/2026-06-12-parallelism-v3-design.md:100` still lists `batch_active`
   as one of three "DISTINCT typed reasons" in the guard-refusal taxonomy — a point-in-time
   investigation snapshot (same category as the pre-existing 2026-06-07 parallel-ready-set
   investigation doc, which architecture.md already treats as historical and does not keep
   current). Not in n4's write set; investigation docs are not on the Documentation Map's
   maintained list.
3. `docs/api.md:752` (the per-node model-tier propagation section) mentions "the batch path"
   as one of several dispatch surfaces the model tier threads through — likely a
   pre-#586-retirement straggler unrelated to the `batch_active` reason-inventory this task
   scoped in; left untouched as out of the task's declared scope (REMOVE the `batch_active`
   reason entry — this is not a reason-inventory entry).

---

## Follow-up (write set widened by orchestrator): `docs/workflow-state-contract.md` — deviation #1 RESOLVED

The orchestrator added `docs/workflow-state-contract.md` to n4-docs' declared write set (plan
re-frozen, resume-check green) and directed applying flagged deviation #1 only.

- **`docs/workflow-state-contract.md:92-97`** (the `active-batch.json` bullet in the `.cache/`
  inventory — the live location of the previously-flagged line 96): the stale claim that
  "`kaola-workflow-adaptive-node.js`'s guard prologue still detects a residual file on disk (a
  `batch_active` refusal) purely as backward-compat crash detection" is replaced with the
  accurate post-#594 state, matching the bullet's surrounding style: the `batch_active`
  backward-compat detection was itself removed (D-594-01), along with the sibling
  `active_batch_exists` plan-repair-reopen refusals; a residual file on disk is now silently
  inert to every mutation guard; only `orient`'s read-only manifest legality reconstruction
  still reads it (always `null` in producible state). The D-586-01 retirement sentence above it
  is unchanged (still accurate). Verified against the live line numbers before editing (the
  bullet sat at lines 92-97 as flagged).
- **Deviations #2 and #3 deliberately NOT applied** per the coordinator's direction:
  `docs/investigations/2026-06-12-parallelism-v3-design.md` is a dated historical investigation
  record (correct to stay as-written); `docs/api.md:752`'s "the batch path" is a pre-#586
  straggler NOT provably stale from the #594 diff (which removed the mutual-exclusion guard, not
  any dispatch path) — re-read confirmed, judgment unchanged, left untouched.

### Green re-run (after the workflow-state-contract.md edit)
- `node scripts/test-route-reachability.js` → `Route-reachability test passed (185 assertions).`
- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`
- `node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation passed`
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` →
  `Kaola-Workflow GitLab contract validation passed`
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` →
  `Kaola-Workflow Gitea contract validation passed`
- Post-edit grep: the only remaining `batch_active` token in `docs/workflow-state-contract.md`
  is the new accurate past-tense sentence itself.
- Nothing else touched: the follow-up modified exactly `docs/workflow-state-contract.md` (now
  in-set) plus this evidence file (barrier-exempt `.cache/*.md`).
