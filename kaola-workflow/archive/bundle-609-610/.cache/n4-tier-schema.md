evidence-binding: n4-tier-schema fe2538e52c53

RED: test_tier_rename_schema — AssertionError: "NODE_MODEL_TIERS should be neutral tokens": actual ['opus','sonnet'], expected ['reasoning','standard']; schema.normalizeTier / dispatchModelClaude / modelDisplay are undefined (pre-impl, red-probe.js:7).

GREEN: NODE_MODEL_TIERS===['reasoning','standard']; normalizeTier(opus→reasoning, sonnet→standard, neutral passthrough, haiku/''→null); dispatchModelClaude(reasoning→opus, standard→sonnet); modelDisplay() native {claude,codex,opencode}. All suites green: test-adaptive-node 1362, test-next-action 116, test-adaptive-handoff 122, test-agent-model-resolver PASS, test-install-model-rendering PASS, simulate-workflow-walkthrough PASS (+5 edition walkthroughs PASS), validate-script-sync OK (24 common / 25 byte-identical groups), edition-sync --check OK (10 forge ports in parity).

## What landed (#610 core + #609 envelope-display, item 3)

Single-writer node in the parent worktree bundle-609-610 (no leg). 35 files, all within declared write set.

### Schema (kaola-workflow-adaptive-schema.js, byte-identical ×4)
- `NODE_MODEL_TIERS` → `['reasoning','standard']` (runtime-neutral).
- `TIER_ALIASES = {opus:'reasoning', sonnet:'standard'}` + `normalizeTier(token)` — the single alias-resolution seam (legacy alias resolves, neutral passes through, unknown/'' → null).
- `dispatchModelClaude(tier)` (`reasoning→opus`, `standard→sonnet`); `TIER_MODEL_CLAUDE` const.
- `TIER_RANK` re-keyed to neutral tokens; `dispatchEffort`, `mapTier` (hence `dispatchEffortOpencode`) route through `normalizeTier` — alias-aware.
- `modelDisplay(tier)` → `{claude, codex:'<effort> reasoning effort', opencode:'<rank> effort variant'}` or null.
- New exports: TIER_ALIASES, normalizeTier, TIER_MODEL_CLAUDE, dispatchModelClaude, modelDisplay.

### Validation (plan-validator + next-action, ×4 each)
- Both model-column sites validate via `normalizeTier(...) === null` (accepts neutral AND legacy aliases).
- `model_invalid` message lists the neutral tokens and notes "legacy aliases opus/sonnet are also accepted".

### Reasoning floor (resolve-agent-model.js, byte-identical ×4)
- `isReasoningClass` accepts `reasoning` OR `opus`. DELIBERATELY inlined (NOT a schema require): the subagent-dispatch-log hook copies this resolver standalone (no schema sibling on disk) — a require broke walkthrough #567. DEFAULT_AGENT_MODELS / floor label stay `opus` (Claude aliases feed Agent(model=…)).

### Envelope display (#609 item 3 — additive, raw tier stays)
- `model_display` sibling attached where a model echoes into narratives: handoff `first_node`, buildDispatch dispatch card, open-next/fused `opened`, open-ready member, orient/read frontiers (via new `frontierNode()` helper). Attached only when `modelDisplay(model)` is non-null.

## BACK-COMPAT PROOF (the safety-critical part)
- Frozen/archived legacy plans keep their BYTES: `revalidateForResume` untouched (never checked tiers); a legacy `{opus,sonnet}` plan `--resume-check` green; `computePlanHash` stable (no rewrite); `computeNextAction` accepts it and preserves the `opus` cell verbatim.
- Dispatch efforts byte-identical across the rename: `dispatchEffort('opus')===dispatchEffort('reasoning')==='xhigh'`; `dispatchEffort('sonnet')===dispatchEffort('standard')==='high'`; `dispatchEffort('haiku')` still role_default. Same for `mapTier` ranks and `model_display`.
- Proven in-suite: simulate-workflow-walkthrough.js #610 LEGACY-ALIAS FIXTURE (frozen legacy plan resumes green, hash stable, efforts identical) + test-adaptive-node buildDispatch back-compat block (legacy effort+display == neutral).

## model_display field shape (for n5 / consumers)
`model_display: { claude: 'opus'|'sonnet', codex: '<xhigh|high> reasoning effort', opencode: '<top|second> effort variant' }` — each runtime reads its own key (mirrors how codex_reasoning_effort + opencode_variant already coexist). opencode phrasing is rank-based (provider-agnostic, always available). Null (key omitted) when no resolvable tier.

## NOTES FOR n5 (prose/contract-validator owner)
1. Contract validators still pin OLD `sonnet`/`opus` plan-token strings (validate-workflow-contracts.js:936-939, validate-kaola-workflow-contracts.js:775-780, gitlab :788-793, gitea :793-798, test-route-reachability T5b :201-209). I did NOT touch or run them (out of my set, per instructions) — they will red until you re-author to the neutral vocabulary.
2. test-opencode-edition.js is UNAFFECTED by my schema change (it imports only effortForProvider/contractForProvider, which stay compatible; it does NOT assert NODE_MODEL_TIERS values). But its S2/B1 comments and the planner-prose {opus,sonnet} model-column mentions it exempts are yours to reword to neutral tokens (lines ~316/510).
3. DEFAULT_AGENT_MODELS and agent frontmatter INTENTIONALLY stay Claude aliases (opus/sonnet) — they feed Agent(model=…). Do not neutralize those.

## DEVIATION (walkthrough ×6)
Only the CANONICAL walkthrough (scripts/simulate-workflow-walkthrough.js) tests the plan-column tier tokens; the codex-twin walkthrough references only `model_reasoning_effort` (codex config, unrelated), and the 4 gitlab/gitea walkthroughs have ZERO tier/model references. Adding a contrived tier fixture to those 5 would be out-of-place noise. The schema is a byte-identical ×4 drift anchor (behavior tested once in canonical + the dedicated test files; cross-edition identity enforced by validate-script-sync + the four npm chains), so the legacy-alias/neutral fixture lives in the canonical walkthrough only. No `model_invalid` assertion exists in the other 5 to mirror.
