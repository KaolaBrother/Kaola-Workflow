evidence-binding: n2-review 976308c390c4
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=none status=deferred severity=low fix_role=none rationale=negative-space-test-asserts-not-parent_dirty-rather-than-strict-field-absence-documented-intent-non-blocking

## G1 code-review evidence — issue #616 serial-degrade telemetry

Diff reviewed: full working-tree diff vs HEAD (05f122ba, == merge-base with origin/main; nothing committed).
Files: scripts/kaola-workflow-adaptive-node.js, scripts/test-adaptive-node.js, 3 regenerated edition ports.

1. parentDirty hoist (focus 1): PASS. Fence evaluated at most ONCE via guarded ternary
   (scripts/kaola-workflow-adaptive-node.js:4345-4346); N1 short-circuit preserved (no fence spawn when
   !legCoupled or <2 writes); truth table of the gate at :4347 identical to pre-change. `const parentDirty`
   is block-scoped to the non-speculative else-if arm — no stale reuse; the speculative branch's own fence
   call (:4280) is a mutually-exclusive arm, so at most one fence subprocess per runOpenReady call.
2. Label discrimination (focus 2): PASS. Label set ONLY at :4387 gated on parentDirty; structurally exact
   attribution (parentDirty true implies legCoupled && >=2 held AND the else was entered because of dirt).
   grp.ok===false (:4377-4380) and groupCeiling<2 (:4361-4363) degrades untouched, no field; !legCoupled /
   <2 causes have parentDirty=false by short-circuit — no label.
3. Byte-identical non-degrade paths (focus 3): PASS. Sole response-shape change is the conditional spread
   at :4615 (null => key absent). write_awaits_drain (:4392) and cap_reached (:4395) returns unchanged; on
   the labeled path toOpen=[writeNodes[0]] is non-empty so the label always reaches the success envelope.
4. Four-edition byte-sync (focus 4): PASS. plugins/kaola-workflow copy byte-identical (cmp); gitlab/gitea
   ports differ ONLY by the @generated banner + mechanical kaola-{gitlab,gitea}-workflow- renames
   (rename-normalized diff empty) — consistent with edition-sync.js --write output.
5. Test quality (focus 5): PASS. Positive (#615-MIXED extension, test-adaptive-node.js:6962) asserts the
   EXACT value 'parent_dirty' on the successful degrade envelope over a genuinely dirty parent; genuine RED
   confirmed: HEAD has 0 occurrences of serialDegradeReason (git show HEAD | grep -c => 0), so pre-fix the
   assert fails on undefined. Negative (#616-PLAIN-SERIAL-DEGRADE, :6978-6986) forces the kill-switch
   (legCoupled=false, clean parent) and asserts the label is NOT parent_dirty — causes stay distinguishable.
   R1 (low, non-blocking): it asserts !== 'parent_dirty' rather than strict absence; documented intent
   ("absent-or-non-parent_dirty"), satisfies the absent/different contract — no action required.

Verification (run by this gate, not trusted from n1-telemetry):
- node scripts/test-adaptive-node.js — passed, 1416 assertions
- node scripts/simulate-workflow-walkthrough.js — "Workflow walkthrough simulation passed"
- npm test — all four chains green (claude && codex && gitlab && gitea; gitea tail reached => no
  short-circuit; exit 0). #307 four-chain obligation satisfied for this cross-edition diff.

Verdict: APPROVE — no CRITICAL/HIGH/MEDIUM findings; one LOW informational note (R1), non-blocking.
