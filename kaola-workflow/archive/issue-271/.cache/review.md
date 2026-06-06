# G1 review gate — issue #271 (implement node)

Scope: working-tree diff vs HEAD for the 5 files named in the gate. Read-only review.
Files reviewed:
- scripts/kaola-workflow-plan-validator.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (codex)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- scripts/simulate-workflow-walkthrough.js

## Priority 1 — Correctness of the additive pre-pass (canonical validator)

The pre-pass (lines 604-609) iterates `selectGroups` and, per group, builds
`srcsForName = new Set(grp.members.map(m => m.selectorSource).filter(Boolean))`;
if `size > 1` it pushes the new G-SEL-1 refusal.

Verified the refusal message is byte-for-byte the frozen spec wording:
`G-SEL-1: select group name "<name>" used by arms with different selector_source nodes; use distinct group names for independent groups`
(uses `grp.label`, which equals the bare group name set at line 567).

ADDITIVITY — proven, not asserted. The existing G-SEL-1b check (line 625) computes
`srcs = new Set(members.map(m => m.selectorSource).filter(Boolean))` over the SAME
`grp.members`, in a loop over the SAME `selectGroups` map, with NO mutation of members
between the two loops. The pre-pass's `srcsForName` is therefore element-for-element
identical to G-SEL-1b's `srcs` for every group. Consequence: the pre-pass's
`srcsForName.size > 1` fires IF AND ONLY IF G-SEL-1b's `else if (srcs.size > 1)` branch
already fires. The new code can only APPEND one error string; it cannot change any
pass/refuse outcome of any plan, valid or invalid. That is the strongest possible
additivity guarantee — it cannot relax a gate because it cannot change an outcome at all.
Valid single-group select() plans (which never have >1 distinct selector_source) are
unaffected: the pre-pass never fires for them.

Empirically confirmed AC#1 fixture (two select(fix) groups, classify1 vs classify2):
result=refuse, and errors contain the new G-SEL-1 message. (The old G-SEL-1b
"conflicting selector_source(s)" message and a G-SEL-4 coarse-area message also appear —
expected, see non-blocking note 1.)

## Priority 2 — Cross-edition parity

- Canonical vs codex (plugins/kaola-workflow/...): `diff` reports IDENTICAL. PASS.
- gitea and gitlab ports: each carries a byte-identical insertion of the same pre-pass
  block at the same location (after the fan-out groups loop, before the #263 G-SEL loop).
  The new code references only `grp.members`, `m.selectorSource`, and `grp.label` — it
  invokes NO `classifier.*` method, so the forge-specific `require()` classifiers are
  irrelevant to this logic and the ports are equally correct. PASS.
- `npm test` script-sync gate (per implement evidence) reports the 5-file byte-identical
  group in sync. The full walkthrough suite was re-run here: exit 0,
  "Workflow walkthrough simulation passed".

## Priority 3 — Regression coverage in simulate-workflow-walkthrough.js

- AC#1 (lines ~6894-6916): asserts result=refuse AND an error matches
  `/G-SEL-1: select group name "fix" used by arms with different selector_source nodes/`.
  This is a precise regex on the NEW message — it failed RED before the validator change
  (RED evidence in implement.md showed only the old G-SEL-1b message, which the regex does
  not match) and passes GREEN now. Correct RED→GREEN coverage. PASS.
- AC#3 (#263/#267 single-group select): existing coverage in `testAdaptivePatternLibrary`
  is untouched and that test PASSES. PASS.

## Priority 4 — AC#2 "structurally unreachable" claim — JUDGED SOUND

The implementer asserts AC#2 as literally worded ("two select(fix) groups with the SAME
classifier node is a typed refusal") is unreachable under option 1, and the AC#2 fixture
instead exercises the pre-existing G-SEL-4 overlapping-write-set refusal.

This reasoning is correct. select groups are keyed by the BARE group name (line 567),
deliberately NOT origin-scoped the way fan-out is (lines 561-562). So two same-named groups
that ALSO share one classifier node are grammar-indistinguishable from a single valid N-arm
group — there is no signal the pre-pass could key a refusal on without origin-scoping, and
origin-scoping would be option 2 (it would change outcomes and so would NOT be additive).
Empirically confirmed: a same-name + same-classifier group with arms writing distinct
top-level dirs (src/, lib/, app/, pkg/) validates `in-grammar` — no #271 refusal is possible.
This faithfully mirrors the accepted `#244 AC#3 unreachable` precedent: an AC can be
structurally impossible and honestly documented rather than forced to pass. The AC#2 test
(lines ~6918-6948) is honestly commented as exercising G-SEL-4, not a new #271 refusal, and
its assertion matches the actual governing error (`/overlapping write sets/`). Not a gap;
not blocking.

## Priority 5 — Logic bug / off-by-one / regex / masking scan

- No off-by-one: the pre-pass is a Set-cardinality test, no indexing.
- No masking/relaxing: the pre-pass runs BEFORE the #263 G-SEL loop and ONLY ever calls
  `errors.push(...)`. It removes/skips nothing. Every prior G-SEL refusal still fires.
- Message string matches the spec exactly (verified char-for-char against the gate text).
- `.filter(Boolean)` correctly drops empty selectorSource ('' from the parser at line 140),
  matching G-SEL-1b's identical filter — so a group of arms that declare no source yields an
  empty set (size 0) and the pre-pass correctly does not fire (that case is G-SEL-1b's
  "declare no selector_source" path).

## Non-blocking observations

1. For the different-source case, the refusal output now contains BOTH the new G-SEL-1
   message AND the older, less-actionable G-SEL-1b "conflicting selector_source(s)" message
   (plus an incidental G-SEL-4 coarse-area message when arm write sets share a top-level
   dir). This dual emission is by design and REQUIRED by the "purely additive — never relax
   an existing gate" constraint: editing or removing the G-SEL-1b message would be
   non-additive. No action needed; noted for awareness.
2. Evidence-file imprecision (NOT a shipping defect, does not affect code): implement.md
   line 26 cites `src/a.js`+`src/b.js` as a "fully disjoint ... validates in-grammar"
   example. Those two share coarse-area `src`, so that specific pairing actually refuses via
   G-SEL-4. The underlying unreachability claim is nonetheless correct — confirmed with arms
   in genuinely distinct top-level dirs (src/, lib/, app/, pkg/), which validates in-grammar.
   Evidence note only; the shipped code and tests are correct.

## Conclusion

The pre-pass is provably additive (cannot change any outcome; only appends one error),
correct, identical across all four editions, the forge ports need no classifier change, the
regression tests cover AC#1 (RED→GREEN) and AC#3 (still-passing single group), and the AC#2
unreachability call is sound and honestly documented per the #244 precedent. No blocking
defects. Full walkthrough suite re-run: exit 0.

verdict: pass
