evidence-binding: n4-adversarial-distinctness d676a5ea94e7
<!-- verdict: paste verdict here -->
verdict: pass
findings_blocking: 0

(machine token = `pass` per parseNodeVerdict's VERDICT_VOCABULARY=['pass','fail'] in
kaola-workflow-adaptive-schema.js:154; NOT-REFUTED -> pass per the profile mapping table.
The dispatch's `real`/`refuted` vocabulary is NOT in VERDICT_VOCABULARY and would parse to
verdict=null -> fail-closed; using the canonical gate token instead.)

## Claim Under Test (issue #495)
NEW verdict `target_indeterminate`/`target_set_indeterminate` carrying `result: escalate` is
genuinely distinct (value + routing) from determinate `target_unavailable`/`target_set_unavailable`
carrying `result: refuse`; AND transient retry (kill/timeout/spawn-fault) does NOT bleed into
determinate refusals — clean determinate RED and clean non-zero are never retried; only transient
classes retried, bounded N<=2 (<=3 total); e.status===2 stays owned. Holds on single + bundle paths.

## Disproof Attempt — could NOT refute. Empirical (own mocks in $TMPDIR, real execFileSync seam):
- S1 RED-first bundle [83=exit1, 143=kill]: target_set_unavailable/result:refuse, cnt[83]=1, 143 never. Determinate hard-stop, not retried.
- S2 indeterminate-first bundle [83=kill, 143=exit1]: target_set_indeterminate/result:escalate, cnt[83]=3 EXACT, 143 never. Surfaces escalate, does NOT collapse to determinate target_set_unavailable (the production scenario that broke).
- S3 single persistent transient: target_indeterminate/result:escalate, cnt=3 EXACT (no off-by-one, no premature escalate).
- S4 single clean non-zero: target_unavailable/result:refuse, cnt=1 EXACT (determinate not retried).
- S5 single exit-2: classifyIssue->owned, cnt=1 EXACT (status===2 short-circuits inside loop before classifySubprocessError; not retried).
- S6 single timeout (300ms cap): target_indeterminate/result:escalate code=ETIMEDOUT signal=SIGTERM, cnt=3 EXACT (~966ms; timeout correctly transient).
- S7 fail-twice-then-green-on-attempt-3: ACQUIRED, cnt=3 (3rd-attempt success honored; bound is exactly 1+2).
- Pairing audit (grep): result:'escalate' only at lines 943/1269 (both indeterminate); result:'refuse' only on determinate statuses. verdict:'indeterminate' returned ONLY after loop exhaustion (line 755), never on first transient. classifySubprocessError checks status===2 then status!=null->clean_nonzero BEFORE signal, so a determinate non-zero can never be misread as transient.
- Byte-twin: diff scripts/kaola-workflow-claim.js vs plugins/kaola-workflow/scripts/kaola-workflow-claim.js => IDENTICAL.
- Committed test (node scripts/test-claim-hardening.js): 63 assertions pass; genuinely drives the real subprocess retry path via KAOLA_CLASSIFIER_MOCK_SCRIPT with a $TMPDIR counter file.

## Scope note — value-distinctness verified; consumer-routing out-of-slice
This slice is the EMISSION boundary (root/codex where indeterminate is emitted). Value-distinctness
proven exhaustively (distinct status strings + result:escalate vs result:refuse pairing, audited).
Note both escalate and refuse exit code 1, so the entire distinction lives in the JSON fields, none in
the exit code. Whether a downstream consumer branches on escalate vs refuse (the front-door consent
escalation) is a separate consumer-side slice and was NOT traced here — out of this slice, not missed.

## Non-refutation note (pre_existing, non-blocking)
Bundle precedence is positional: targets are sorted ascending (line 185) and the loop early-returns on
the FIRST non-green member. So [indeterminate-lower, RED-higher] escalates and never evaluates the RED.
This is the established bundle contract (every branch — closed/conflicts/probe-unavailable/red — already
early-returns); the fix only inserted indeterminate->escalate into the existing chain. The claim "a
determinate-RED member hard-stops refuse" holds for the deciding member; the fix never weakens a RED into
escalate. Out of scope for this fix; not a defect.

## Verdict
NOT-REFUTED (confidence: high). All result-pairings correct, retry bound exact at 3, no retry-bleed into
determinate refusals, byte-twin identical, both paths verified.
