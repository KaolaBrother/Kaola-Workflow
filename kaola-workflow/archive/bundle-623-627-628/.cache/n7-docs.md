evidence-binding: n7-docs 48bd0aa00c49

## Task
Write TWO new decision records for bundle-623-627-628 (#623, #627), docs-only.

## Free-id confirmation
`ls docs/decisions/ | grep -E 'D-623|D-627'` → no matches before writing (D-622-01.md and
D-632-01.md exist, D-623 and D-627 were free). Used D-623-01 and D-627-01 as instructed.

## Style reference
Read `docs/decisions/D-619-01.md` and `docs/decisions/D-622-01.md` for house ADR shape
(Title / Date / Status / Issue / Related / Context / Decision / Consequences / Non-goals /
Alternatives considered).

## Grounding read
- `kaola-workflow/bundle-623-627-628/workflow-plan.md`: `### Shared canonical spec` (#623 wording),
  `### n1-plan-run-debloat` bullet (#627 fix#1), `### #627 fix#2 ... DESCOPED` bullet, `### n7-docs`
  bullet (dictated content).
- `.cache/n1-plan-run-debloat.md` (debloat blocks restubbed, before/after line counts, #623 wording
  applied, token survival).
- `.cache/n5-review.md` (G1 gate: PASS, one non-blocking low-severity residual R1 unrelated to n7's
  scope — README.md speculative-framing reword, already resolved per n6's Attack 3 before n7 ran).
- `.cache/n6-adversary.md` (verdict: pass, NOT-REFUTED — content-diff/pin-survival/#623-consistency/
  #628-correctness/#627-partial all confirmed by execution).
- `kaola-workflow/.roadmap/issue-623.md`, `issue-627.md`, `issue-628.md` for exact issue titles/scope.

## Files written (exactly 2, both NEW)
- `docs/decisions/D-623-01.md` (82 lines) — the #623 rolling-topup fork: chose Option 1 (prose
  honesty — scope rolling top-up to read frontiers; wide write frontiers run in fixed group waves)
  over Option 2 (live-group write-member admission), with the deferral rationale (group-identity
  invariants blast radius vs an efficiency-only gain not yet needed).
- `docs/decisions/D-627-01.md` (104 lines) — the #627 debloat decision (fix#1/#3/#4/#5 shipped,
  restoring the D-445-01 ~150-line skeleton) plus the fix#2 (runtime-dead-prose fencing) descope:
  explained WHY fix#2 is not achievable as prose-only (T5b/T14 cross-runtime pins in
  `scripts/test-route-reachability.js` + all four `validate-*-contracts.js` would turn RED),
  and that it is tracked as a dedicated follow-up issue (exact number left to finalize's CHANGENLOG
  wiring per the plan's instruction — n7 could not see a filed follow-up number in the roadmap
  sources at write time, so the record says "see the CHANGELOG entry for its issue number" rather
  than fabricating a number).

## Write-set confirmation
`git status --porcelain` after writing shows only the two new decision files as additions relative
to my node; `agents/workflow-planner.md`, `docs/plan-run-cards/README.md`, and
`docs/plan-run-cards/frontier-batch.md` are pre-existing modifications from n4/R1 (not touched by
n7). No code, command, SKILL, agent, or other doc file was edited by this node.

## Verification
Both files are inert ADRs (no test asserts them; confirmed via plan's own n7 notes — "speculative-
eligible behind n5... no chain coupling"). Not re-running `npm test`/walkthrough since this node's
write set (docs/decisions/ only) cannot affect their outcome and the plan states no validation
applies to n7. CHANGELOG.md was NOT touched (finalize node's job per n8).

Both files written; D-numbers confirmed: D-623-01, D-627-01.
