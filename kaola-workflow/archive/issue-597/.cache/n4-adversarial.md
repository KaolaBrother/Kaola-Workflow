evidence-binding: n4-adversarial 29743255134b
## n4-adversarial — change-gate adversarial verification (opus, read-only)

Claim: the auto-tier default-flip engine change (n1-engine) is correct, complete, and regression-free.

All six attacks executed with real repros; ALL WITHSTOOD:
(a) AC4 safety-condition parity at auto vs consent: downstream of the single authorization predicate (adaptive-node.js:3952) there is NO other policy/consent branch in runOpenReady/selectSpeculativeWriteGroup/close fence/runDiscardSpeculative (grep-confirmed). Executed fixtures at auto(no flag) and consent(flag) across genuine overlap, validator crash, garbled result, no-leg-capability, clean-disjoint — byte-equal outputs every case. Close fence + discard untouched by the diff. AC6: off/consent/auto/absent freeze in-grammar; unknown values still refuse speculative_policy_unsupported.
(b) AC3 resume safety: parseSpeculativePolicy(absent)='off' in all four validators (decoupled from DEFAULT='auto'). Real legacy cycle: froze a plan WITHOUT the field, confirmed would-materialize=false on already-frozen, next-action emission OMITTED, --resume-check ok, hash unmoved. No retroactive flip.
(c) Materialization + governance-ack integrity: fresh freeze injects speculative_open_policy: auto into ## Meta; hash recomputed BEFORE write and handed to --governance-ack; frozen=true resumeOk=true; Step-1.75 runs strictly AFTER both refuse-gates (returns precede it) + try/catch fail-safe — no path mutates the plan on REFUSE. Meta-scoping coherence verified across decoy/fenced/multi-field fixtures.
(d) O1 relabel: crash/garbled -> parallel_safe_indeterminate; genuine per-pair overlap -> overlaps_live_writer; clean -> both open; byte-equal at auto and consent; only two call sites carry the reason.
(e) Default-flip blast radius: every absence-path reader routes through parseSpeculativePolicy/resolveSpeculativePolicy (off on absent); SPECULATIVE_OPEN_POLICY_DEFAULT consumed ONLY by freeze-time materialization. Schema byte-identical x4 (md5 df78201e...); forge ports identical.
(f) Off-inertness + consent parity: off inert even with the flag; consent WITHOUT flag does NOT open; auto WITHOUT flag opens; emission object byte-equal across tiers.

Suites green: test-adaptive-handoff 116, test-next-action 113, test-commit-node 123, test-adaptive-node 1330, canonical walkthrough exit 0.

finding: id=R1 scope=in_scope action=document status=open severity=low fix_role=none rationale=stale-inline-comment next-action.js:269 says emit ONLY at consent but code emits at auto||consent; cosmetic, no behavior impact, also in 3 forge ports
(Orchestrator note: R1 RESOLVED post-verdict via the Trivial Inline Edit Exception — comment updated in canonical + ports regenerated via edition-sync --write; test-next-action 113 green; recorded in finalization-summary.)

NOT-REFUTED (confidence: high).

verdict: pass
findings_blocking: 0
