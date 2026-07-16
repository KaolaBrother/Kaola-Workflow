evidence-binding: n8-code-review 3516a7f36db8
verdict: fail
findings_blocking: 6
delegation_outcome: completed
role: code-reviewer
domain_outcome: changes_requested
upstream_read: n7-documentation c5f11e42db9c
upstream_read: n1-architecture ea05782ab1d5
upstream_read: n2-profile-contracts ca71dbdf270d
upstream_read: n3-validation-runner 7eb9cc90efb9
upstream_read: n4-review-engine 01af83fb4cdf
upstream_read: n5-runtime-guidance 68ac15fe7117
upstream_read: n6-installed-contract-proof e4f670abbcf7

# n8 code review — bundle #693/#696/#697/#698

reviewed_base: d59b191c925c634a36a74592ac9a9d21dfc93982
reviewed_candidate: complete post-n7 working tree in the bundle-693-696-697-698 isolated worktree
review_scope: candidate diff, surrounding lifecycle callers, live issue acceptance criteria, all upstream evidence, focused executable checks, and direct counterexamples
full_chain_policy: not run here; the frozen plan assigns `npm test && node scripts/test-opencode-edition.js` to n13

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=fabricated-resolution-digests-count-as-current-candidate-progress
finding: id=R2 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=current-candidate-validation-obligations-cannot-be-satisfied-after-repair
finding: id=R3 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=G4-omits-test-consumed-prose-producers
finding: id=R4 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=review-lineage-is-keyed-by-plan-and-gate-rather-than-scope-lineage
finding: id=R5 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=schema2-security-context-is-runtime-specific-and-silently-downgraded-to-v1
finding: id=R6 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=required-deterministic-conformance-corpus-is-represented-by-labels-not-executable-cases

## Findings

### R1 — Arbitrary 64-hex resolution references count as proof and progress (HIGH, confidence 99%)

failure_class: correctness
issues: #698, #697

Trigger:

- Precondition: a closure attempt removes a prior open UID.
- Input: a resolution with the correct UID, repair id, and candidate digest, but with invented 64-hex `validation_vector_digest` and `evidence_digest` values that do not identify any current validation receipt or evidence artifact.

Expected:

- #698 requires valid current-candidate resolution evidence. The harness must resolve both digests against authoritative current-candidate artifacts before allowing the UID to leave the frontier or counting progress.

Observed:

- `normalizeResolutionSet` checks only shape, 64-hex syntax, repair id, and candidate digest (`scripts/kaola-workflow-adaptive-schema.js:1152-1181`).
- `assessReviewProgress` repeats only the 64-hex syntax checks and then returns progress (`scripts/kaola-workflow-adaptive-schema.js:1384-1402`).
- The real lifecycle has current validation vectors and receipt evidence available, but never cross-references the resolution digests (`scripts/kaola-workflow-adaptive-node.js:1159-1160`, `:1212-1220`, `:3333-3352`).
- The committed tests actively demonstrate the false pass with arbitrary repeated digits (`scripts/test-adaptive-node.js:16919-16925`, `:16941-16948`; `scripts/simulate-workflow-walkthrough.js:15411-15413`, `:15434-15452`).

Direct reproduction:

```text
normalizeResolutionSet([{validation_vector_digest: c*64, evidence_digest: d*64, ...}])
  -> {ok:true, ...}
assessReviewProgress(previous=[uid], current=[], resolutions=[fabricated], validation={status:"pass"})
  -> {progress:true, reason:null}
```

Impact:

- A reviewer can close a blocker and advance/finalize without any referenced validation/evidence object existing. This defeats the central anti-laundering property of the schema-2 closure contract.

Required repair:

- Resolve the resolution vector reference to an authoritative current-candidate validation receipt and the evidence reference to an authoritative current-candidate artifact; fail closed on missing, stale, wrong-candidate, wrong-repair, or digest mismatch. Add negative lifecycle tests that use well-formed nonexistent hashes.

### R2 — A legitimate current-candidate pass is classified as drift after any repair (HIGH, confidence 98%)

failure_class: validation
issues: #697, #698

Trigger:

- Precondition: an inherited obligation records `{command_id, required_pass_vector_id}` from candidate A.
- Input: after a repair produces candidate B, the same command and comparable execution identity run successfully on B.

Expected:

- The live #697 acceptance contract says every inherited `command_id` must have a current `pass` vector for the current candidate. The command/environment/tool identity must remain comparable, while the candidate-bound vector necessarily changes to B.

Observed:

- `buildValidationVector` includes `candidate_digest` and all candidate-bound runs in the semantic value hashed into `vector_id` (`scripts/kaola-workflow-validation-runner.js:564-587`). Therefore A and B cannot have the same vector id.
- `compareValidationObligations` nevertheless requires exact equality between the current vector id and the inherited A vector id (`scripts/kaola-workflow-adaptive-schema.js:1362-1381`).
- The fixture only tests a same-id synthetic pass and never constructs vectors through the real runner (`scripts/reviewer-conformance-fixtures.json:178-202`).

Direct reproduction:

```text
inherited candidate A: outcome=pass vector_id=V_A
current candidate B:   outcome=pass vector_id=V_B
V_A === V_B -> false
compareValidationObligations([{command_id:C, required_pass_vector_id:V_A}], [B-pass])
  -> {status:"drift", reason:"validation_vector_drift"}
```

Impact:

- Once an obligation exists, every substantive repair is forced into non-progress even when the exact inherited command passes under comparable identity on the repaired candidate. This makes the required validation-aware convergence contract unsatisfiable.

Required repair:

- Define and implement a comparator that preserves the immutable inherited obligation while accepting an authoritative comparable pass bound to the current candidate. Regression-test it with two vectors produced by `buildValidationVector` over different candidates, plus missing/fail/inconclusive/identity-drift controls.

### R3 — G4 ignores Markdown that the validation digest classifies as code-relevant (HIGH, confidence 99%)

failure_class: contract
issue: #698

Trigger:

- Precondition: a valid code writer is followed by the designated code certifier.
- Input: a downstream `doc-updater` changes `README.md` (or another built-in/declared test-consumed prose path) after that certifier and before finalization.

Expected:

- #698 explicitly includes test-consumed prose in the code-relevant producer set. G4 must refuse the topology because the designated certifier does not cover that later producer.

Observed:

- `producesCode` treats every `.md`/`docs/` write as inert, without consulting the validation-consumed set (`scripts/kaola-workflow-plan-validator.js:1120-1140`).
- Both `buildPlanView` and schema-2 G4 derive producers from that predicate (`scripts/kaola-workflow-plan-validator.js:1142-1175`, `:1349-1359`).
- The validation runner independently and correctly says `README.md` is validation-visible/code-relevant (`scripts/kaola-workflow-validation-runner.js:453-500`).

Direct reproduction:

```text
writer(scripts/example.js) -> review(code-reviewer) -> docs(README.md) -> finalize
runner.isValidationInvisible("README.md") -> false
validatePlan(schema2 plan, {forFreeze:true}) -> {result:"in-grammar"}
buildPlanView(plan).changeProducerIds -> ["writer"]  # docs omitted
```

Impact:

- The plan freezes even though a later relevant mutation necessarily stales the earlier certifier receipt. The authored DAG can therefore become unfinalizable after executing exactly as frozen, and G4 does not provide the promised early topology refusal.

Required repair:

- Make the G4 producer predicate share the runner's built-in plus `validation_test_consumes` classification. Add executable refusal cases for built-in and custom test-consumed prose, plus an inert-doc green control.

### R4 — Discovery/closure lineage is keyed by the current plan and gate identity, not `scope_lineage_id` (HIGH, confidence 97%)

failure_class: persistence
issue: #698

Trigger:

- Precondition: the same claim/frontier continues into another plan epoch, or the planner merely renames an otherwise identical gate.
- Input: open the renamed/replanned gate with the same computed `scope_lineage_id`.

Expected:

- #698 requires discovery once per scope lineage across plan epochs; renaming a gate must not reset it. Issue #699 owns the activation/CAS transaction, but the scope-lineage storage and lookup semantics are explicitly #698-owned.

Observed:

- `readReviewLineageV2` first validates the journal against the current `plan_hash`, then filters attempts solely by `logical_gate.key`; it does not accept or select by `scope_lineage_id` (`scripts/kaola-workflow-adaptive-node.js:728-753`).
- The journal validator rejects a different plan hash (`scripts/kaola-workflow-adaptive-schema.js:1515-1524`) and groups phase/ordinal history by gate key (`:1528-1529`, `:1582-1591`, `:1712-1717`).
- A logical gate key hashes member ids, so a rename changes it (`scripts/kaola-workflow-adaptive-node.js:698-724`), while `scope_lineage_id` intentionally excludes the node id (`:848-861`). The subsequent opener therefore sees zero attempts and emits `review_phase: discovery` (`:862-900`).
- The claim-root fallback also reads mutable live `HEAD` (`scripts/kaola-workflow-adaptive-node.js:773-785`) even though normal parallel synthesis advances `HEAD` via a real merge before downstream review (`:6962-7025`), adding another way for standard execution to perturb scope identity.

Impact:

- Gate renaming resets broad discovery, and a future #699 activation cannot preserve closure merely by carrying the claim if this reader still rejects the prior plan and indexes by gate key. Within parallel repair lifecycles, a moving claim root can also produce inconsistent scope ids and old/new UID frontiers.

Required repair:

- Persist/index the durable history by `epoch_lineage_id + scope_lineage_id`, with gate identity as attempt metadata rather than the lineage key. Preserve a claim-time root base across synthesis/repair. Keep #699's activation/CAS mechanics out of this patch, but expose the in-scope handoff/reader contract that #699 can call.

### R5 — Schema-2 security gates silently use runtime-specific synthetic v1 behavior identities (HIGH, confidence 99%)

failure_class: compatibility
issues: #698, #696 integration

Trigger:

- Precondition: the same schema-2 security-reviewer plan/candidate/claim is opened from Claude and Codex editions.
- Input: neither legacy security profile contains the generated schema-2 identity fields.

Expected:

- A schema-2 gate context uses behavior contract version 2 and runtime-neutral behavior identity; the runtime-specific resolved profile hash belongs only in the dispatch envelope. Missing required identities should fail before spawn rather than silently inventing a weaker contract.

Observed:

- `resolveReviewerProfileIdentity` accepts missing embedded version/behavior/self-hash fields, substitutes version 1, and hashes the complete runtime-specific profile bytes into the behavior hash (`scripts/kaola-workflow-adaptive-node.js:647-695`). The same fallback also labels the built-in `main-session-gate:review-contract-v2` as version 1.
- `buildReviewContext` permits any behavior version >=1 instead of requiring contract-2 behavior (`scripts/kaola-workflow-adaptive-schema.js:817-832`).
- `agents/security-reviewer.md` and the Codex security-reviewer TOMLs contain none of the three identity fields and have different bytes.

Real cross-runtime reproduction over byte-identical candidate and claim-root state:

```text
Claude security open:
  behavior_contract_version=1
  behavior_contract_hash=236c6c3134b3922190f33c82a4cea66f50545c3b0a2ee0bc5422d3e314fa07d5
  context_hash=329f0cb2fa2436f33b3a0492263c5fa9155063978b30bf92fae2ffdf1d00f32f
Codex security open:
  behavior_contract_version=1
  behavior_contract_hash=b748f81b4da807c6c4acfce6c4cdcc02578ea5496818dbe08487021ed89ba9b1
  context_hash=10868c125a0eeb3a89c8050fbb11cfe2d95d64a620b1747221f3542a49ba0ca5
candidate digests equal -> true
claim-root bases equal -> true
context hashes equal -> false
```

Impact:

- The first #698 acceptance criterion fails for security gates, and the gate is admitted under a silent v1 behavior contract even though the plan/dispatch contract is v2.

Required repair:

- Give every schema-2 gate role one explicit runtime-neutral behavior identity (including security and the built-in main-session gate), or fail schema-2 open before spawn when it is unavailable. Require behavior contract version 2 in contract-2 context validation and add real cross-edition context-byte tests for every gate role.

### R6 — The required conformance matrix is mostly a coverage-label assertion, not an executable corpus (MEDIUM, confidence 99%)

failure_class: test_coverage
issues: #693, #697, #698

Trigger:

- Precondition: a lifecycle seam regresses while the JSON `coverage` string remains present.
- Input examples required by the live issues: clean diff; concrete regression; style/speculative finding; unchanged pre-existing issue; malformed/stale investigation retry; the same AV topology as a change gate; role-only fallback at each seam; move and multi-anchor ordering; late-unbound stateful re-plan; real G4 refusal reasons; invalid schema-2 validation-policy fields.

Expected:

- #697 requires the full deterministic corpus to pass through the real shared normalizer/reducer. #693 requires the graph-derived mode to control every lifecycle seam. #698 explicitly requires anchor, lineage, G4, and stateful closure cases.

Observed:

- The fixture declares broad coverage names but contains only three graph rows, eight outcome rows, five individual anchors, four reducer rows, and four synthetic validation rows (`scripts/reviewer-conformance-fixtures.json:3-203`). It has no clean/regression/style/pre-existing behavioral cases.
- `scripts/test-adaptive-node.js` treats presence of `coverage` strings as assertions (`:16717-16735`) and has no `parseValidationPolicy` negative calls. Its anchor cases do not exercise a move or multiple secondary-anchor orderings (`:16823-16875`).
- `scripts/simulate-workflow-walkthrough.js` asserts the coverage token and a pure investigation reducer (`:15246-15269`); its one stateful schema-2 path is a code-review repair (`:15271-15468`), not malformed/stale investigation retry, same-topology AV change gate, or late-unbound re-plan.
- Direct search found no committed assertions for `validation_cwd_invalid`, repetition/range, pass-rule, allowlist, duplicate/unknown validation fields. Manual calls return the intended typed refusals, but the regression contract is absent.
- Existing G1/synthesizer tests do not cover the new inherited/test-consumed G4 cases; R3 stayed green because the new corpus only asserted `g4_common_certifier` as a string.

Manual disposition of the checklist candidates:

- A real all-read-only schema-2 investigation with `domain_outcome: refuted` was run here: it closed, opened downstream `finalize`, and created no repair journal. The shipped behavior is fixed, but the required committed E2E and seam mutation-killers are absent.
- Direct malformed validation-policy probes for cwd/repetitions/pass-rule/allowlist/duplicate/unknown fields returned the correct typed refusals. The issue is missing durable negative fixtures, not those six inspected branches.
- Late-unbound scope expansion has a pure helper assertion, but no stateful receipt/journal/replan transaction test.
- Live Claude/Codex qualification is implemented with mocked adapters in `scripts/test-validation-runner.js:224-284`; no live durable qualification artifact was supplied to this review. Treat that as pending release evidence, not proof of deterministic natural-language equality.

Impact:

- Required acceptance behavior can regress or remain unimplemented while the corpus reports coverage. R1, R2, R3, R4, and R5 are concrete examples that the green suite did not detect.

Required repair:

- Replace coverage-label assertions with data-driven executable rows through the real policy parser, normalizer, stateful CLI, and G4 validator. Add mutation controls that delete/bypass each shared-classifier seam and prove at least one test reds.

## Acceptance matrix

| Issue | Review result | Evidence |
|---|---|---|
| #693 | PARTIAL / blocking test gap | Real read-only investigation closure works, but committed stateful malformed/stale/same-topology and seam-mutation coverage is absent (R6). |
| #696 | Generated two-role profile contract passes focused checks; integration incomplete | Generated code-reviewer/adversarial profiles and installed parity are green. Schema-2 security/main-session behavior identity still silently falls back and breaks #698 runtime neutrality (R5). |
| #697 | FAIL | Current-candidate validation comparison is unsatisfiable after candidate change (R2); required deterministic behavioral corpus and live durable qualification evidence are incomplete (R6). |
| #698 | FAIL | Unbound resolution proof (R1), test-consumed G4 omission (R3), wrong lineage key (R4), runtime-specific security context (R5), and missing executable acceptance cases (R6). |
| #699 boundary | Respected by this verdict | No activation/CAS implementation was required or found. R4 concerns the #698-owned durable lineage reader that a future #699 transaction must consume, not the activation transaction itself. |

## Focused validation executed

Green commands:

- `git diff --check` -> exit 0.
- `node scripts/generate-reviewer-profiles.js --check` -> exit 0.
- `node scripts/test-agent-profile-parity.js` -> exit 0; 275 assertions.
- `node scripts/test-validation-runner.js` -> exit 0.
- `node scripts/edition-sync.js --check` -> exit 0; 10 forge ports, 24 common mirrors, 28 byte-identical groups.
- `node scripts/validate-script-sync.js` -> exit 0.
- `node scripts/test-adaptive-node.js` -> exit 0; 2255 assertions.
- `node scripts/simulate-workflow-walkthrough.js --only testReviewerContractV2Conformance` -> exit 0.
- `node scripts/test-commit-node.js` -> exit 0; 126 assertions.
- `node scripts/test-adaptive-handoff.js` -> exit 0; 155 assertions.
- `node scripts/test-plan-run.js` -> exit 0; 23 assertions.
- `node scripts/test-route-reachability.js` -> exit 0; 1400 assertions.
- `node scripts/test-install-model-rendering.js` -> exit 0.

Focused counterexamples:

- Fabricated resolution digests -> normalization accepted and `progress:true` (R1).
- Two real runner-built passing vectors for the same command over candidates A/B -> ids differ and comparator returns `validation_vector_drift` (R2).
- Schema-2 `writer -> review -> README doc-updater -> finalize` -> freeze reports `in-grammar` while runner classifies README as validation-visible (R3).
- Same candidate/claim security plan opened from canonical Claude and plugin Codex executors -> behavior version 1 and different context hashes (R5).
- Stateful all-read-only investigation `refuted` -> close succeeds, downstream opens, no repair journal (narrows #693 disposition in R6).
- Direct invalid validation-policy cases -> intended typed refusals (narrows #697 parser disposition in R6).

## Non-findings and residual risks

- The scheduler-entrypoint `open-next` then `open-ready -> serial_node_live` defect is real but pre-existing and separately owned by reopened #439 with #597/#383 context; it is not candidate-caused by this frozen bundle and is not counted above.
- No issue-#699 activation/CAS implementation was found in the candidate; that boundary remains deferred as designed.
- Profile generation, tracked-byte parity, edition mirrors, environment scrubbing tests, installer rendering, routing reachability, and focused existing lifecycle suites are green.
- The final full frozen validation command remains n13-owned and was intentionally not duplicated here.
- A real local Claude/Codex qualification artifact remains pending; mocked adapter tests prove the executable boundary, not a live stochastic release sample.

## Review conclusion

The candidate is not approvable. The five implementation findings break core schema-2 safety/liveness contracts, and the conformance corpus is not strong enough to detect them. Route R1-R6 to the owning implementation/test node, repair from canonical sources, regenerate mirrors where required, and rerun this review before n9.
