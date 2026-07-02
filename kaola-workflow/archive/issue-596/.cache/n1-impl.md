evidence-binding: n1-impl df9489ed7283
<!-- RED: paste RED here -->
RED: SPEC-3 (#596) in scripts/test-next-action.js — pre-fix `kaola-workflow-next-action.js` (git HEAD,
the `isReadOnly`-gated version): `FAIL: SPEC-3 (#596): a well-formed write node behind an open gate IS
speculative-eligible, got []` (then a cascading `TypeError: Cannot read properties of undefined (reading
'speculativeGate')` on the next assertion, confirming `speculativePending` was empty — the write node
`more` was excluded exactly as the OLD `isReadOnly` check intended, i.e. the RED failure the #596 static
change is designed to flip). Captured by running the updated test file against a `git show HEAD:` copy of
the pre-change `kaola-workflow-next-action.js` in a scratch dir (repo untouched).
<!-- GREEN: paste GREEN here -->
GREEN: SPEC-3 (#596) passes against the fixed `kaola-workflow-next-action.js`: `r.speculativePending`
contains exactly `['more']`, `speculativeGate === 'gate'`, `declared_write_set === 'b.js'`. Full
`node scripts/test-next-action.js` → "next-action tests passed (103 assertions)" (was 97 pre-#596,
verified by running the git-HEAD copy of the test file standalone; net +6: SPEC-3 grew 1→3 assertions,
plus SPEC-3b/3c/3d add 1+2+1 new assertions). Full
`node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1310 assertions)" (was 1248 — +62 from
the new #596 runtime block T596-1..T596-11, covering AC1-AC8). `node scripts/test-commit-node.js` →
"commit-node tests passed (123 assertions)" (unchanged — no commit-node.js edits). Both `edition-sync.js
--check` and `validate-script-sync.js` green after `edition-sync.js --write` regenerated the 9 downstream
ports (gitlab/gitea adaptive-node+next-action+plan-validator ×2 + codex-sync ×3 canonical mirrors).
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed".

## Static + runtime changes

STATIC (`scripts/kaola-workflow-next-action.js`, ×4 editions): lifted the `isReadOnly` exclusion in the
`speculativePending` builder. A node with a non-empty declared write set is now speculative-eligible
PROVIDED (a) every declared entry is EXACTLY resolvable (`hasUnresolvableEntry` — newly exported from
`kaola-workflow-plan-validator.js`, reused verbatim, no new logic), (b) no entry `isProtected` (reused from
`kaola-workflow-classifier.js`, already exported), and (c) the node is not the plan's `uniqueSink` (already
exported from the validator). All three conditions are vacuously true for a read-only node (empty set), so
the read half is byte-unchanged. The whole block stays gated behind `speculative_open_policy: consent`
(byte-identical omission at `off`).

RUNTIME (`scripts/kaola-workflow-adaptive-node.js`, ×4 editions):
- `runOpenReady`: added a THIRD selection branch — `writeNodes.length > 0 && openingSpeculative` — sitting
  between the read branch and the normal write co-open branch (which still requires
  `liveNodes.length === 0`, since the speculative case is reached precisely WHEN the open gate — or a
  sibling speculative read — IS live). Requires leg capability (`legCoupled`, the same
  `parallelWritesDefaultOn` gate normal co-open uses); if absent, ALL write candidates are excluded this
  call with `speculativeWriteExcluded: {reason:'no_leg_capability', nodeIds}` (never a hard refuse; read
  speculation is unaffected). Otherwise delegates to a new `selectSpeculativeWriteGroup` helper.
- `selectSpeculativeWriteGroup` (new, exported): re-verifies exact-path disjointness of every write
  candidate against currently-open write nodes (defensively — the running-set's
  write-node-runs-strictly-alone invariant makes a genuinely live writer unreachable here today, so this
  is belt-and-suspenders) AND against its own sibling candidates, via the SAME `validator --parallel-safe`
  predicate normal co-open uses (zero new validator logic). UNLIKE `tryFormLaneGroup` (all-or-nothing,
  requires >=2 members), an overlapping candidate is EXCLUDED (not a whole-batch refusal), and a LONE
  eligible candidate still forms a size-1 `lane_group` — a speculative write ALWAYS opens WITH a
  provisioned leg (unconditional, per the design), unlike the normal path's serial (legless) single-write
  fallback. Applies the WRITE fan-out ceiling (`resolveFanoutCap` folded with `--max`) exactly like normal
  co-open (AC6). The EXISTING generic Phase-1/Phase-2/Phase-3 open machinery (leg provisioning, group
  baseline, per-member baseline, `speculative:true`/`speculativeGate` stamping) required ZERO changes — it
  already keys generically on `groupForm`/`openingSpeculative`, both of which the new branch sets.
- Close fence: `speculativeCloseGuard` is UNCHANGED (verified via T596-2 that it fires for a WRITE member
  identically to a read member — role/kind-agnostic).
- Pass path: `closeGroupMember`'s existing `isOnly = allMemberIds.length === 1` degenerate-to-last-member
  logic already handles a size-1 speculative write group verbatim — `synthesizeLevel`'s octopus merge
  degenerates to a plain 2-parent merge for one leg branch. ZERO new merge code (T596-3 proves the full
  leg -> per-leg-barrier -> synthesizer -> commit-based union-barrier -> HEAD path).
- Fail path: `runDiscardSpeculative` gained an `isWriteMember` branch (keyed on `member.kind === 'write'`):
  (1) SKIPS the pre-existing git-checkout-based parent revert (step b) — a real, previously-latent bug for
  this new call shape: a leg-resident write's declared files are NEVER touched at the parent, and for a
  brand-new file `git checkout <baseSha> -- <path>` would hard-FAIL (pathspec did not match, since the file
  never existed at baseSha) — skipping is both correct (nothing to revert) and necessary (avoids the
  failure); (2) tears down the leg (`teardownLeg` — worktree + branch + leg-base ref, the same helper every
  other leg-lifecycle site uses); (3) purges the stale `.cache/{id}.md` evidence file (new: `unlink`,
  threaded through the CLI wiring for `discard-speculative` and `reconcile-running-set`) so a future
  re-open reseeds cleanly (`seedEvidenceFile`'s `forceRotate` is `false` on a normal open — a survived
  stale file would otherwise wedge the #392 binding check); (4) if this was the group's last live member,
  clears `lane_group` + drops the group baseline (mirrors `closeGroupMember`'s clean-completion teardown);
  else drops just this member from `lane_group.legs`/`members`. Read members are BYTE-UNCHANGED (the new
  branch is `if (isWriteMember)`-gated; T439-5/T439-6 still green unmodified).
- Crash safety: `runReconcileRunningSet` gained the crashed-speculative-write arm INSIDE the existing
  `keptAll`/`dropped` classification loop — a member with `n.opening && n.speculative && n.kind==='write'`
  additionally requires its `speculativeGate` to be ledger-`complete` AND `parseNodeVerdict(...).verdict
  === 'pass'` to land in `keptAll`; otherwise it is pushed to `dropped` (and its ledger row is EXPLICITLY
  reset `in_progress -> pending`, a genuinely NEW step — the pre-#596 `dropped` bucket only ever held
  already-`pending` members, so no ledger write was previously needed there). The SCOPING to `n.opening`
  (not a bare `wholeOpening` sweep) is load-bearing: a `wholeOpening` transaction walks EVERY member of
  `running.nodes`, including an unrelated, already-settled speculative write from a PRIOR successful open
  that merely coexists in the set — without the `n.opening` guard that member's still-legitimately-open
  gate would incorrectly trip the "roll back" branch. The EXISTING generic drop-direction machinery (per-
  node baseline drop, leg teardown for a surviving group's departing members, whole-group drop + group
  baseline drop when nothing survives) required ZERO changes — it already threads through `dropped`
  uniformly. Added a symmetric evidence-purge loop for `dropped ∪ cappedOut` speculative-write members
  (mirrors discard-speculative's new evidence-discard step). AC7's LITERAL scenario ("kill between leg
  provision and ledger flip" — ledger never flipped) needed NO new code at all (T596-8): the pre-existing
  lane-group crash-repair machinery already treats a speculative write's leg as an ordinary `lane_group`
  leg. The gate-verdict override specifically covers the NARROWER crash window (ledger DID flip,
  running-set stuck `opening`) — T596-9 (gate resolved fail -> rolls back) and T596-10 (gate resolved pass
  -> rolls forward) prove both directions of the new arm directly.
- CLI wiring: threaded `unlink: (f) => { try { fs.unlinkSync(f); } catch (_) {} }` into the
  `discard-speculative` and `reconcile-running-set` subcommand dispatch (mirrors the existing pattern at
  `close-node`/`reopen-node`/`repair-node`).

## Validator-hedge judgment

TOUCHED, minimally: `scripts/kaola-workflow-plan-validator.js` (×4) gained ONE new export —
`hasUnresolvableEntry` — an ALREADY-EXISTING pure function (the #593 coarse-relaxation resolvability
guard), now exported so `next-action.js`'s static write-eligibility check reuses it instead of
duplicating the directory-shape/glob-metacharacter regex. `uniqueSink` was already exported (no change
needed there). NO new validator ENTRY POINT, NO new CLI flag, NO behavioral change to `--parallel-safe` or
any other existing validator consumer — `node scripts/test-commit-node.js` (which exercises the validator
extensively via commit-node's shelling) stayed at exactly 123 assertions, unchanged. The RUNTIME
disjointness re-check (`selectSpeculativeWriteGroup`) reuses the EXISTING `--parallel-safe --nodes A,B[,C]`
flag verbatim — confirmed by direct testing (T596-5, the runtime exact-overlap unit test) that the SAME
predicate normal write co-open uses (`tryFormLaneGroup`) correctly excludes an overlapping speculative
write candidate, with zero new validator code. The issue's own hedge language ("only if the
`--parallel-safe` reuse needs a speculative entry point") is resolved: it did NOT need one.

## AC coverage map (scripts/test-adaptive-node.js, block "#596 (D-596-01)")

- AC1 (happy path): T596-1 — gate1 open -> `open-ready --speculative-consent` opens writerW in a
  provisioned size-1 `lane_group` leg; running-set entry carries `speculative:true`, `kind:'write'`,
  `speculativeGate:'gate1'`, `group_id`.
- AC2 (close fence): T596-2 — closing writerW while gate1 is open refuses `gate_not_complete` (unchanged
  `speculativeCloseGuard`, exercised by a write member).
- AC3 (pass path): T596-3 — gate1 verdict:pass -> writerW closes via `group_passed` + `synthesized:true`;
  `w.js` reaches `HEAD`; leg torn down on clean completion.
- AC4 (fail path): T596-4 — gate1 verdict:fail -> `speculative_review_required` names writerW ->
  `discard-speculative` reports `legTornDown:true, evidenceDiscarded:true, groupCleared:true`; leg
  worktree/branch/leg-base-ref gone; baseline + evidence files gone; ledger back to `pending`; `w.js`
  never existed at the parent root (byte-identical parent, proven by file-absence + a path-scoped `git
  status --porcelain`).
- AC5 (refusals): the PROTECTED/unresolvable/sink refusals are STATIC — covered in
  `scripts/test-next-action.js` (SPEC-3b protected, SPEC-3c directory-shaped + glob, SPEC-3d unique sink).
  The RUNTIME refusals: T596-5 — a direct unit test of `selectSpeculativeWriteGroup` (exported) proves
  exact-overlap exclusion against BOTH a stand-in "live writer" and a sibling candidate, plus the trivial
  no-live-writers pass case. T596-6 — `KAOLA_PARALLEL_WRITES=0` (no leg capability) excludes writerW with
  `speculativeWriteExcluded.reason === 'no_leg_capability'`, no hard refuse. NOTE: a full open-ready
  LIFECYCLE test of the exact-overlap refusal (two live/frozen sibling writers sharing a path) is
  IMPOSSIBLE to construct — the freeze grammar itself already refuses two concurrent (antichain) siblings
  declaring the same exact file at freeze time ("concurrent siblings ... both write ... (parallel
  non-fanout write overlap)"), so an in-grammar frozen plan can never reach that runtime state; T596-5's
  direct-unit-test approach is the correct (and only reachable) way to exercise this path.
- AC6 (cap accounting): T596-7 — two disjoint speculative write siblings under `KAOLA_FANOUT_CAP=1`: only
  one opens; the capped-out sibling stays `pending` and never enters the running set.
- AC7 (crash repair): T596-8 (literal "kill between leg provision and ledger flip" — ledger never
  flipped; reused generic lane-group crash-repair machinery, zero new code, idempotent 2nd reconcile);
  T596-9 (the NEW gate-check arm, gate resolved FAIL — ledger WAS in_progress, rolls back anyway, leg torn
  down, evidence purged, ledger explicitly reset to pending); T596-10 (the NEW gate-check arm, gate
  resolved PASS — rolls FORWARD, leg survives, running-set promotes to `open`).
- AC8 (inertness): T596-11 (consent flag absent -> no speculative write open, mirrors T439-2). Broader
  inertness: ALL pre-existing #439 read-speculative tests (T439-1..T439-10) pass UNCHANGED in the same
  suite run: their assertions were not touched, and the full 1310-assertion count includes them green.
  `scripts/test-next-action.js` SPEC-1/SPEC-2/SPEC-4/SPEC-5/SPEC-6 (read-speculation + policy-off
  byte-identity) also pass unchanged.

## Deviations from the seeded task text

- None structural. One test-numbering note: the plan originally sketched a "two overlapping live siblings"
  full-lifecycle test, which turned out to be unfreezable (see AC5 note above) and was replaced by the
  direct-unit-test T596-5 (more precise, and the only reachable exercise of that path) plus T596-6 for the
  no-leg-capability axis — both still under the AC5 umbrella, no coverage was dropped.
