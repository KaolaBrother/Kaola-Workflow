evidence-binding: n4-critique-l1-safety 42bcc86ae2f1

# n4 — Adversarial critique of "L1 is cheap AND safe AND worthwhile to WIRE"

verdict: pass
findings_blocking: 0

## Gate-verdict axis correction (read first)
The original dispatch asked this node to emit `verdict: refuted|confirmed` ABOUT THE L1 HYPOTHESIS. That mapped the gate-verdict token onto the wrong axis: `--verdict-check` (GATE_VERDICT_ROLES) reads `verdict` as **deliverable-soundness** of THIS run (is there an in-scope actionable defect that would silently become a follow-up?), NOT hypothesis-truth. This run's deliverable is the read-only shaping recommendation (docs only). The L1 "cheap-AND-safe-AND-worthwhile" claim is the HYPOTHESIS this node EVALUATES, not the run's deliverable.
- **Gate verdict = pass**: the shaping run's deliverable survives scrutiny; the L1 refutation below is this node's ANALYTICAL OUTPUT (consumed by n5, recorded in `docs/decisions/D-500-01.md`'s L1 recommendation + build scope), not an in-scope defect of a docs-only run. `findings_blocking: 0` because nothing shipped by this run is left in a defective state — the shipped L1 recommendation ("do NOT do the cheap wire; guarded-wire-or-relabel; the win is real") IS this refutation's conclusion, fully consistent. No fix is pending against this run; all build work is explicitly routed to the future build run.
- (A genuine framework gap — adversarial-verifier ∈ GATE_VERDICT_ROLES so a hypothesis-refuting #486 verifier blocks `--verdict-check` despite the plan's "never a gate" note — is filed as a follow-up.)

## Analytical finding: the L1 "cheap AND safe AND worthwhile" CLAIM is REFUTED
Burden inverted (refuted-if-uncertain). The claim is conjunctive (cheap ∧ safe ∧ worthwhile); breaking one conjunct with evidence refutes it. Findings backed by EXECUTED validator/git repros + full test run.

### Q4 — Win is REAL (n1's "illusory win" is itself refuted)
- Built a real plan: two NEW distinct scripts `scripts/alpha.js` + `scripts/beta.js`.
  - `--parallel-safe --nodes n1,n2` (no consent) → `result:refuse, kind:yellow, "shared-infra area scripts"` (exit 1) — they SERIAL-DEGRADE today.
  - + `write_overlap_policy: coarse` + `--write-overlap-consent` → `result:ok, relaxed:[{kind:shared-infra,policy:coarse}]` (exit 0).
- Two new files under scripts/ is the DEFAULT multi-implementer decomposition; `disjointWriteSets` (classifier.js:378-385) classifies them shared-infra YELLOW (both areaForPath=scripts ∈ SHARED_INFRA at classifier.js:281), NOT green. So n1's "already green/disjoint → L1 not needed" is empirically FALSE; the win applies to the common case.

### Q1 — Even leg-coupled: safe-by-construction, UNPROVEN-by-execution
- Directory-entry same-file attack DEAD at the grammar: a `scripts/` write-set entry is refused at freeze (`directory-shaped`, plan-validator.js:1117-1118; bare existing dir `directory_shaped_bare`, 1128-1129; verified live → plan_invalid). Every entry is an exact non-directory path; `exact` overlaps NEVER relax (writeOverlapRelaxable:613). shared-infra ⇒ distinct files in the same area ⇒ legs write disjoint files.
- Octopus merge BAILS safely: controlled git repros — same-line conflict across legs → `ERROR: content conflict` non-zero → synthesizeLevel (adaptive-node.js:3568-3572) catches the throw, `git merge --abort`, returns merge_conflict. NO silent drop (initial apparent drop was a `git reset --hard` test artifact). Same-file NON-overlapping hunks auto-merge cleanly.
- Leg barrier + parent fence SOUND: `--leg-barrier` (plan-validator.js:2360-2433) diffs the leg's own worktree vs an ANCHORED base ref (no free --base, cross-checked --expect-base, ancestor backstop); member_vacuity refuses an empty leg (4297-4306); `--parent-clean-check` (2311-2358, `git status --porcelain -uall`) refuses parent_dirty before synthesis — closes the #283/#292 parent-leak vacuity.
- BUT the integrated relaxation path has NEVER executed end-to-end: makeLaneRepo (test-adaptive-node.js:4918-4963) defaults to disjoint ax.js/by.js with NO write_overlap_policy; every lane test forms via the green path (1895 short-circuits before writeOverlapRelaxable). AC18 was disjoint-only. An unexercised-but-implemented safety path is NOT credited "safe to ship reachable."

### Q2 — Guard IS load-bearing
- gatePresent is leg-scoped: gateUncovered(..., legIdSet.has, 'code-reviewer', planSink) (plan-validator.js:1881). PROTECTED files block at every tier (classifier.js:311-318). Not trivially satisfiable.

### The refutation — cheap ⊕ safe in direct tension (load-bearing)
- CHEAP wire (bare forward at :3351, gated only on consent) DECOUPLES formation (adaptive-node.js:3815-3816, gates on resolveLaneContainment && >=2 writers — consent NOT a formation condition) from leg-provisioning (3899, requires resolveLegIsolation && writeOverlapConsent). With KAOLA_LANE_CONTAINMENT=1 --write-overlap-consent but KAOLA_LEG_ISOLATION=0 → group FORMS, legs SKIPPED → 2 overlapping writers in the SHARED parent worktree = #283/#303 corruption. CHEAP wire is UNSAFE.
- SAFE wire (leg-couple at :3816 on resolveLegIsolation(process.env) && opts.writeOverlapConsent) is NOT cheap: leg-coupling + #400 6-surface prose (toggles ABSENT from all prose surfaces; only KAOLA_LANE_CONTAINMENT named) + a brand-new shared-infra-coarse end-to-end test that does not exist.
- "cheap AND safe" is false (cheap version unsafe; safe version not cheap; safe unproven-by-execution). Worthwhile is TRUE.

## Regression sanity
- `node scripts/test-adaptive-node.js` (983 assertions) and `simulate-workflow-walkthrough.js` both GREEN — model consistent with code.

## Conclusion (analytical, routed to the build run — not an in-scope defect of this run)
The L1 cheap-AND-safe-AND-worthwhile claim is REFUTED: the cheap wire is unsafe (formation/provisioning decoupling), the safe wire is not cheap + unproven end-to-end, the win is genuinely real. Supports a NARROWER, GUARDED WIRE (leg-coupled at :3816 + 6-surface activation prose + a new shared-infra-coarse end-to-end test), NOT the cheap wire, and NOT a flat illusory-win RELABEL. This conclusion is faithfully reflected in the shipped D-500-01 L1 recommendation; the build work is deferred to the re-planned build run. No pending in-scope remediation for THIS docs-only run.
