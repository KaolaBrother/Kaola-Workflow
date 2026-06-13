evidence-binding: n11-review 061763cf66a4
verdict: pass
findings_blocking: 0

# Code Review — bundle-440-441 (n11-review gate)

Post-dominates n3,n4,n5,n6,n7,n8 + prose nodes n9,n10 (via lane heads n5/n7/n8/n9/n10).
Reviewed all uncommitted changes (34 files, +1517/-49). Verdict: APPROVE.

## Criteria verification

1. Cross-edition byte identity — PASS. `node scripts/validate-script-sync.js` OK (22 common,
   30 byte-identical groups, 5 rename-normalized families). adaptive-schema.js ×4 md5
   0c2a9e29... identical; closure-contract.js ×4 md5 a85de947... identical.
2. Generated aggregator ports — PASS. `node scripts/edition-sync.js --check`: 12 forge ports in
   rename-normalized parity. plan-validator.js ×4 + adaptive-node.js ×4 aligned.
3. Precedence preservation — PASS. New subtypes (lockfile_write/mirror_write/count_bump) are
   assigned INSIDE the rank-3 `else if (outOfAllow.length)` branch
   (plan-validator.js:797-815), narrowing the `write_set_overflow` LABEL only; classifyOverflowSubtype()
   returns null on no-single-match → falls back to plain write_set_overflow. No new precedence family;
   granularity still checked first. result still 'refuse' whenever errors.length. (D-440-01/D-419-02 honored.)
4. Additive-only halt return — PASS. runWriteHalt marker transaction UNCHANGED: consent→consent+security
   coupling (adaptive-node.js:1942-1947), plan-ledger-FIRST/state-LAST ordering (1977-2001) untouched.
   triage computed AFTER all mutating writes (2017-2019), additive field on the return. computeTriage is
   try/catch-wrapped, degrades to {class:'unclassified'}, never throws.
5. parseGoal correctness — PASS. Uses classifier.sectionBody(content,'Meta') (plan-validator.js:196),
   reader-only (returns {goal}), no gate; freeze accepts goal-absent plans. Same Meta-scoped reader as
   parseLabels; hash-covered for free.
6. goal_check advisory only — PASS. goal_check appears only in CLOSURE_RECEIPT_FIELDS + emptyReceipt seed
   + computeGoalCheck/assignment (claim.js:2162). NOT referenced in checkClosureInvariants or any
   CLOSURE_INVARIANTS entry; no blocking path. v1 emits satisfied|absent only (unsatisfied reserved),
   matching prose.
7. Forge-neutral — PASS. Zero gh/glab/tea tokens ADDED in any SKILL.md or toml (diff scan clean). Pre-
   existing `gh` in canonical agents/issue-scout.md:31,53 (GitHub edition, legitimate) not touched by
   this diff. The 3 issue-scout.toml twins scanned clean.
8. Route-reachability tokens — PASS. `node scripts/test-route-reachability.js`: 32 assertions passed.
   No pinned structural token removed (the few '-' lines in scout md/toml are in-place list extensions).
9. All four chains green (sequential) — PASS.
   claude  EXIT=0 (Workflow walkthrough simulation passed)
   codex   EXIT=0 (Kaola-Workflow walkthrough simulation passed)
   gitlab  EXIT=0 (GitLab Codex workflow walkthrough simulation passed)
   gitea   EXIT=0 (Gitea Codex workflow walkthrough simulation passed)

## Additional checks
- Contract validators (claude/gitlab/gitea) all EXIT=0.
- Test coverage T-440-A..D: write-halt triage attach, barrier_failed envelope triage, unclassified
   degradation, all four subtype→proposed_repair.kind mappings. Prose triage shape matches computeTriage.
- n9/n10 prose mirror canonical-spec across command + SKILL packs; triage kind mappings in prose
   (add_to_write_set / write_set_swap / revert_overflow) match the implementation.

## Non-blocking observations (informational only, no action required)
- adaptive-schema.js lockfile_write patterns include both `/(?:^|\/)\.lock$/` and `/\.lock$/` which are
   functionally redundant (both match a trailing `.lock`). Harmless; correctness unaffected.
- computeGoalCheck v1 is a presence-check (KAOLA_GOAL set OR plan goal: line present → satisfied), never
   emits 'unsatisfied'. This is the documented v1 advisory design (n7 plan notes; AC-vs-goal judgement is
   agent-side), not a defect.

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=lockfile_write regex has a redundant trailing-.lock pattern pair; harmless, correctness unaffected
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=computeGoalCheck v1 is a presence-check never emitting unsatisfied; matches documented advisory design, not a defect
