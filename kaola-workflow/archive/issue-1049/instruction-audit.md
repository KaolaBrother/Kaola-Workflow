# Issue 1049 instruction audit and implementation recommendation

## Scope and evidence

Read-only audit on 2026-09-05 against baseline `7e93763e43864091f722b306c404bb85d7f96052`. This planning dispatch was assigned native `planner`, model `gpt-6-astra`, reasoning effort `high`; the parent dispatch record owns the actual invocation evidence. This is one useful operational sample, not a performance or quality comparison.

Read the local `AGENTS.md`, ADR 0017, ADR 0021, and live issue #1049 body/comments. Examined routing skeletons and shared dispatch contract, Codex adapter data, relevant role profiles, generated and installed Next/Finalize/compact carriers, machine-global managed AGENTS block, receipt evaluation source, and existing focused-test seams. The official Astra guidance was already fetched by the parent; this report's findings derive from local instruction text, not an inferred model defect. No runtime settings, experimental context management, product files, or Mission List were modified by this audit.

At inspection, all six sampled generated GitHub Codex files byte-matched the installed 10.2.1 copies under `/Users/ylpromax5/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/10.2.1`:

| Relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| skills/kaola-workflow-next/SKILL.md | 11548 | 9337ac967cf6fb5b578ece1234fca0c3285b291203633eb746e25c4533578390 |
| skills/kaola-workflow-finalize/SKILL.md | 17807 | da186e92231bcec897118a21f32ce2364981c7b0a6413e99ed8f6242b8ee54c7 |
| hooks/kaola-workflow-codex-compact-recovery.md | 7460 | 460a9c48cfcbd87d4f68bea63f72bd4eb4626618204e46d78117b50f3a290b5c |
| agents/planner.toml | 7134 | 53dbf319f323ac50eb161aa8b7388c33e44e7a469d941e32a4b69e80f168e075 |
| agents/tdd-guide.toml | 6257 | fe6010a74ddf8e8c1f6ae926ad5c1695b7a434c4e5c9bc9288406573557ed826 |
| agents/code-reviewer.toml | 8282 | 5cef09027607953640a1f0e451f4553526b21cb95f7671b16b962b65daaf0a3f |

The global source text also matched the managed block in `/Users/ylpromax5/.codex/AGENTS.md`, excluding the carrier markers and `Contract schema: 1` footer. This is content evidence, not a claim that the whole installer doctor is clean. The parent separately reports managed registration drift while all 14 installed role profiles match.

## Findings and decisions

### 1. Existing scoped authorization is absent from consent wording

`templates/routing/{init,next,finalize}.skeleton.md` share the unconditional sentence “ask, in conversation, before taking one.” Next additionally says “Ask before merge, rebase, stash, reset, or moving user dirt”; Finalize requires a user's answer for named operations. `templates/global/kaola-workflow-global.md` has no rule carrying already-given authorization forward. The planner and implementer behavior contracts also tell their owner to ask about value calls without distinguishing settled decisions.

Measured omission: the text does not explain that the current issue already authorizes the scoped model defaults, terminal CLI update, supported installation and ordinary Workflow lifecycle. It can therefore be read as demanding the same answer again. This audit does not claim to have reproduced an actual Astra pause.

Recommendation: add one concise global rule that existing session authorization continues within its stated scope; ask only for a new or materially changed irreversible/value decision. Qualify the routing consent guidance consistently so the global rule is not contradicted by a local unconditional wait. Preserve the user's control of destructive Git, user dirt, deployments, credentials, public interfaces/schema, working-capability deletion, genuine content conflicts, and owner-authored instruction rewrites. Authorization for one operation must not silently authorize adjacent work.

Implementation note: `scripts/test-generate-routing-surfaces.js:528` extracts the consent sentence across all 18 Init/Next/Finalize surfaces. Preserve its shared wording and add the same qualification, or have independent test custody adjust the oracle for an intentionally revised shared sentence. Do not hand-edit generated surfaces or weakening-test pins. Avoid rewriting whole role bodies: the global authorization rule is sufficient unless a direct remaining contradiction is demonstrated.

### 2. Dispatch flexibility works; one permission qualifier is missing

`templates/routing/dispatch-contract.md` already makes inline and native children first-class, re-evaluates per mission, preserves independent research/test/review custody, carries bounded briefs and real identities, and treats the live adapter as authority. The three Codex adapters already say host policy owns the tool boundary and honor active multi-agent exposure. There is no measured need for a new scheduler, forced delegation, fixed width, whole-run serialization, or routine profile preflight.

The shared contract and Next's Run section nevertheless say no “approval” attaches to the judgment without qualifying host permission. This is ambiguous beside the current host's explicit-request-only posture. The owner explicitly authorized this run's delegation, so no runtime-setting change is necessary.

Recommendation: qualify that Workflow adds no separate approval requirement within the host's allowed dispatch boundary; retain existing session/host restrictions. Carry this through the shared dispatch contract and the duplicate Next sentence, not a new model or permission gate. Leave native inheritance, available per-call overrides, history-fork rules, tool schemas, role membership, and generic-route identities intact.

### 3. Baseline and finalization evidence can be needlessly repeated

`templates/agents/behavior-contracts.json`, `implementer.body`, Verification Protocol step 1 unconditionally orders a fresh suite/build before any change. Independent test custody already owns RED/baseline evidence. Thus a dispatched implementer receiving a usable baseline is still told to repeat its collection. This is a concrete redundant instruction, not measured runtime overhead.

Recommendation: permit using supplied baseline evidence when it covers the same candidate, relevant check and acceptance scope; otherwise run the appropriate baseline. Keep the implementer's post-change proof and independent downstream review. Do not convert a role's own green run into final acceptance or remove meaningful before/after evidence for a refactor.

`templates/routing/finalize.skeleton.md` starts by resuming existing receipts, but then unconditionally says to run producer-selected chains after freezing. Its later rerun instruction already scopes invalidation to changed bytes. Add a small clarification that a still-valid receipt may satisfy an already-completed check, while missing, failed, stale, insufficient, or inapplicable evidence requires execution. Preserve the required integration chain and exact-candidate review.

Critical limit: `scripts/kaola-workflow-adaptive-schema.js:evaluateChainReceipt` prefers `codeTreeHash`, falls back to `headSha` for legacy receipts, and accepts nonempty green-or-waived chain records. Its green classification alone does not establish complete required-chain coverage or unwaived success. Reuse requires checking applicable command/chain coverage, candidate binding, outcome and allowed waiver status. A release has stricter complete, unwaived, exact-commit checks through `evaluateReleaseReceipt`; no release is requested here. Do not add a shortcut to the evaluator or equate prose “passed” with a receipt.

### 4. Compact and review need no new mechanism

`templates/routing/compact-recovery.skeleton.md` already restores global contract and dispatch, reloads the operation prompt, and reconciles durable results/receipts. Author-source corrections propagate through this existing carrier. No new hook, sidecar, acknowledgement, preflight, or experimental context setting is warranted.

The code-reviewer already reads candidate bytes first, avoids an expensive named validation after finding a defect, consolidates findings by causal class, and leaves the final verdict to the orchestrator. The tdd-guide already holds independent acceptance meaning. Preserve these behaviors. The reviewer describing itself as optional does not waive required issue acceptance or integration checks; it states carrier/role choice, so no change is justified by that phrase alone.

## Implementation plan

1. **Independent acceptance** — extend focused acceptance in test custody for the three Codex tier mappings and the demonstrated instruction omissions; prove baseline failure. Verify standard Luna/max, reasoning Astra/medium, heavy Astra/high across all three adapters and generated Next/Finalize/compact carriers. Preserve non-Codex pairs and omitted-model inheritance. Complexity low; dependency none.
2. **Author sources** — edit only `templates/agents/runtime-capabilities.json` for the requested six reasoning/heavy mappings; `templates/global/kaola-workflow-global.md` for persistent scoped authorization and evidence reuse; `templates/routing/dispatch-contract.md` and Next for host-qualified dispatch; routing consent/Finalize text as above; and the implementer baseline sentence in `templates/agents/behavior-contracts.json` if that finding is accepted. Complexity low to medium; depends on acceptance. Risk is accidentally weakening consent or custody, controlled by retaining explicit boundaries.
3. **Generate and document** — use existing agent/routing generators and edition refresh paths. Update `README.md`, `docs/api.md`, `CHANGELOG.md` under Unreleased, and `docs/decisions/0021-runtime-native-orchestration-guidance.md` for current dispatch defaults and instruction decisions. Preserve historical measurements and ADR 0017's four-field record design. Complexity low; depends on source changes.
4. **Focused proof then integration/review** — run independent new acceptance and appropriate existing tests: `scripts/test-runtime-agent-architecture.js`, `scripts/test-generate-routing-surfaces.js`, `scripts/test-issue-1046-global-contract.js`, generator `--check` commands, relevant validation-runner/receipt tests if reuse guidance is changed, then producer-selected required chains including the integration walkthrough. Freeze and review the exact candidate; mutation invalidates affected evidence. Complexity medium; depends on generated candidate.
5. **Supported local refresh** — parent carries out the authorized terminal-only stable CLI upgrade and supported Workflow installer refresh after candidate review, then verifies executable identities/versions, role/profile discovery, diagnostics and installation consistency. Preserve parent configuration, desktop bundle and experimental settings. This audit provides no before/after CLI claim. Complete the ordinary issue lifecycle using its existing records.

## Success and intentional limits

- Requested mappings propagate source → generated carriers → supported installation; standard and other runtimes stay intact.
- Consent distinguishes already-authorized work from genuinely new decisions; dispatch honors the host without introducing another approval step.
- Valid existing evidence avoids unnecessary duplicate checks while candidate binding, independent custody and required integration remain mandatory.
- Audit conclusions and no-change decisions survive in this report; actual dispatch evidence remains in the orchestrator's record.
- No behavior benchmark, runtime latency measurement, permission-system change, or new validation gate is claimed. A demonstrated failure after these prose corrections would be the reason to consider a larger mechanism.

Recommendation: take the small author-source corrections above, reuse the existing generators and receipt machinery, and leave compact/runtime scheduling architecture unchanged.
