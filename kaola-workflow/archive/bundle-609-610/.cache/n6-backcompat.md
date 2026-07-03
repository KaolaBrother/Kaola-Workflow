evidence-binding: n6-backcompat 58fd65cac92c
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=note status=noise severity=low fix_role=none rationale=model_invalid error-message text changed (now lists reasoning/standard + "legacy aliases opus/sonnet"); cosmetic, emitted only for out-of-vocab cells that no valid archived plan contains — not a behavior change

## Claim Under Test
Issue #610, n6-backcompat surface: "an archived/frozen plan with legacy `opus`/`sonnet` model cells behaves byte-identically after the tier-token rename (n4-tier-schema)." Specifically: legacy plans `--resume-check` green with an unchanged `plan_hash`; dispatch efforts identical (opus→xhigh, sonnet→high on codex; claude model opus/sonnet; opencode top/second); `model_invalid` still refuses out-of-vocab; the gate/sink model prohibition and the reasoning-floor still behave exactly as before; schema/resolver byte-identical ×4.

Run-state note: n4's changes were uncommitted working-tree modifications at verification time (31 files, HEAD 000976cb). Tested the on-disk NEW scripts (what will land) vs OLD scripts extracted from HEAD (`git archive HEAD scripts`) — the correct differential.

## Disproof Attempt
Built an OLD (pre-n4, NODE_MODEL_TIERS=['opus','sonnet'], no normalizeTier) vs NEW (['reasoning','standard'] + normalizeTier) harness in /private/tmp/claude-501 and RAN real experiments. Every disproof failed:

1. Real archived plan resume. kaola-workflow/archive/bundle-607-608/workflow-plan.md (legacy `| opus |`/`| sonnet |` cells, frozen hash b7f3b5b7…) `--resume-check` → pass, planHash reproduced identically on the root validator AND all three forge ports (claude-plugin, gitlab, gitea). Non-vacuous: flip one byte (opus→sonnet in a cell) → refuse: plan_hash mismatch. Hash algorithm untouched → NEW reproduces the OLD-frozen hash, no rewrite.

2. Dispatch-effort differential OLD vs NEW, tokens {opus,sonnet,haiku,gpt-5,'',null,Opus,OPUS,Sonnet,' opus '}. dispatchEffort / mapTier('openai') / dispatchEffortOpencode('openai') byte-identical OLD↔NEW for every legacy/edge token (opus→xhigh/planner_model, sonnet→high, haiku/empty→role_default). Only divergences: the NEW neutral tokens reasoning/standard (OLD role_default → NEW planner_model — expected, never in legacy plans) and an untrimmed ' opus ' in mapTier, UNREACHABLE from a plan because parseNodes trims+lowercases the cell (line 27, identical OLD/NEW).

3. next-action dispatch cycle. Frozen legacy plan (n1 pending, `| opus |`) → `next-action --json` output byte-for-byte identical OLD↔NEW; raw model:"opus" preserved verbatim.

4. Freeze-validation differential. opus/sonnet → both in-grammar; haiku/gpt-5 → both refuse (model_invalid) (message text differs, accept/reject outcome identical); case variants Opus/OPUS/Sonnet → both in-grammar (parse lowercases first). Structural safety proven: NEW's accepted set ⊇ OLD's — zero OLD-valid→NEW-invalid regression, so no archived plan can break.

5. Gate/sink model prohibition. A main-session-gate carrying a model still refuses "must not declare a model" for BOTH legacy (opus/sonnet) and neutral (reasoning/standard) tokens in OLD and NEW — a neutral token does NOT become allowed on a gate (prohibition check untouched by the diff).

6. Reasoning floor. enforceReasoningFloor('synthesizer',…): opus→ok (both), sonnet/standard/''/inherit→fail (both, exactly as before); reasoning→ok is additive. Legacy synthesizer resolves via DEFAULT_AGENT_MODELS→opus → satisfies floor identically.

7. Byte-identity + hook. adaptive-schema.js and resolve-agent-model.js each hash to 1 distinct value ×4 editions. Resolver require()s only fs/os/path (no schema import) → the dispatch-log hook (kaola-workflow-subagent-dispatch-log.sh:34, shells the resolver standalone) still works. simulate-workflow-walkthrough.js and test-agent-model-resolver.js both pass (exit 0).

8. Envelope display additive. first_node emits `model: firstNode.model` (raw token retained) with model_display attached only when non-null (adaptive-handoff.js:538-543); modelDisplay('opus')===modelDisplay('reasoning') and modelDisplay('sonnet')===modelDisplay('standard') — a frozen opus cell displays identically; raw payload token never mutated.

Only behavioral delta found: the model_invalid error-message STRING (neutral vocab + legacy-alias note), emitted solely for out-of-vocab cells that a valid archived plan never contains → no runtime effect on any archived plan (recorded R1, out-of-scope/noise). No failing input/state/path exists for a real legacy plan.

## Verdict
NOT-REFUTED (confidence: high)
Back-compat held under a full differential + real-fixture + ×4-forge-port + walkthrough assault; NEW's accept-set is a strict superset of OLD's with byte-identical dispatch on the legacy overlap, so no archived/frozen opus/sonnet plan can change behavior.
