# Plan — bundle 609+610: purge Claude model-name prose from non-Claude runtimes (#609) then rename the plan tier tokens to runtime-neutral {reasoning|standard} with legacy aliases (#610)

<!-- plan_hash: 932a929a428b50b02a278bc42ac2a126ee47eb85881e7ccb542f9c1e9a76d4c2 -->

## Meta
speculative_open_policy: auto

labels: bug, enhancement, area:scripts, area:workflow-phases
validation_command: npm test
validation_test_consumes: commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/opencode-edition.md, docs/api.md, docs/architecture.md

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-b2-prose | tdd-guide | — | plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/agents/synthesizer.toml, plugins/kaola-workflow-gitlab/agents/synthesizer.toml, plugins/kaola-workflow-gitea/agents/synthesizer.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js | 30 | sequence | opus |
| n2-opencode-sync | tdd-guide | — | scripts/sync-opencode-edition.js, scripts/test-opencode-edition.js | 2 | sequence | sonnet |
| n3-609-review | code-reviewer | n1-b2-prose, n2-opencode-sync | — | 1 | sequence | opus |
| n4-tier-schema | tdd-guide | n3-609-review | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, scripts/test-install-model-rendering.js, scripts/test-next-action.js, scripts/test-adaptive-node.js, scripts/test-adaptive-handoff.js, scripts/test-agent-model-resolver.js | 35 | sequence | opus |
| n5-tier-prose | implementer | n3-609-review | commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js, scripts/test-agent-profile-parity.js, docs/decisions/D-610-01.md, docs/opencode-edition.md | 25 | sequence | sonnet |
| n6-backcompat | adversarial-verifier | n4-tier-schema | — | 1 | sequence | opus |
| n7-docs | doc-updater | n4-tier-schema, n5-tier-prose | docs/api.md, docs/architecture.md | 2 | sequence | sonnet |
| n8-final-review | code-reviewer | n6-backcompat, n7-docs | — | 1 | sequence | opus |
| n9-finalize | finalize | n8-final-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Bundle shape & ordering (hard constraint).** #610 rewords the per-edition mapping sentences #609
lands, and the two issues OVERLAP on shared prose + enforcement files (adapt/plan-run SKILLs, the 3
`workflow-planner.toml`, the contract validators, `test-route-reachability.js` T5b) AND on the two
generated aggregators `kaola-workflow-adaptive-handoff.js` / `kaola-workflow-adaptive-node.js`.
Because those file sets are NOT disjoint, #609 and #610 are NOT a parallel write antichain: the whole
#610 phase (n4, n5) `depends_on` the #609 gate `n3-609-review`, so every #609 surface is landed AND
reviewed before #610 rewords/extends it. The genuinely-disjoint sub-parts DO parallelize (co-open
below).

**Why the envelope-display code lives in n4, not a separate #609 node.** `adaptive-handoff.js` and
`adaptive-node.js` are GENERATED aggregators: a node touching the root MUST declare its codex twin +
gitlab/gitea ports in the SAME node (`generated_port_split`), and a forge-port mirror must be
downstream of EVERY root writer (#340). #609's runtime-native envelope display (codex/opencode) and
#610's claude-native display (`dispatchModelClaude`) edit the SAME emission code, and the claude
display NEEDS the #610 schema. Splitting them across two root-writer nodes is impossible without a
forge-port ordering gap, and they are one coherent feature (runtime-native display in emissions), so
BOTH land in n4 (the sole handoff/node root writer). #609's user-visible outcome is still delivered
before finalize (n1 prose + n2 opencode + n4 envelope); n8 is the code-reviewer for the envelope.

**Co-open frontiers (exact-path disjoint, `parallel_safe`-derived — never hand-annotated).**
- #609: `n1-b2-prose` ∥ `n2-opencode-sync` (no deps, no inter-dep, disjoint) co-open in isolated legs.
- #610: `n4-tier-schema` ∥ `n5-tier-prose` (both depend only on `n3-609-review`, no inter-dep, exact
  disjoint: schema/plan-validator/next-action/resolve/handoff/node/walkthroughs/rendering-tests in n4;
  routing prose/tomls/planner-md/CONTRACT-validators/T5b/parity/docs in n5). n5's leg is GREEN
  independent of n4's uncommitted schema — the contract validators `require()` the schema only for the
  (unchanged) ROUTE constants, never the tier VALUES.
- `n6-backcompat` (read-only) ∥ `n7-docs` (docs) both feed `n8-final-review`.

**n1 — B2 prose purge + machine enforcement (tdd-guide, opus).** #609 B2: purge Claude model NOUNS
("Opus"/"Sonnet"/"no haiku"/"~5x sonnet") from the CODEX prompt surfaces and REPLACE with tier/effort
vocabulary (codex: reasoning tier → per-spawn `reasoning_effort` `xhigh`; standard tier → `high`),
keeping ONLY the B1 column-token mentions phrased as ranks. Surfaces: `workflow-planner.toml`
"Model assignment" paragraph, `synthesizer.toml` "reasoning-class (Opus)", `contractor.toml`
"The Opus orchestrator", `config/agents.toml`, adapt SKILL model-column bullets, plan-run SKILL
"reasoning-class Opus-floor synthesizer" — byte-mirrored across the 3 plugin trees. Workflow-init
guidance rule: add ONE constraint sentence to the Step-2 synthesis template on all six init surfaces —
the generated "Kaola Workflow" section MUST use runtime-neutral tier vocabulary, never vendor model
nouns — and confirm the codex/opencode init variants carry their runtime's dispatch wording (not the
Claude "pass the role's configured model" phrasing). TDD: RED-first, add NEGATIVE contract assertions
(no B2 nouns outside the B1 mentions) to the four contract validators (each scans ITS OWN edition's
surfaces; the root `validate-workflow-contracts.js` and its BYTE-IDENTICAL codex twin
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` both declared — common-script pair)
+ the workflow-init constraint-present assertion + keep `test-route-reachability.js` T5b in lockstep;
these fail against the current "Opus" prose; then GREEN by rewriting the prose. OPUS: the
reasoning-bounded crux is the negative-assertion boundary — a matcher that catches every B2 noun yet
does NOT trip the legitimate B1 `opus`/`sonnet` token mentions. The Claude `agents/workflow-planner.md`
legitimately says "Opus" (real model on Claude) and is NOT in scope here — it is #610's B1 surface
(n5). Forge-neutral rule: plugin prose names "the forge CLI"/"the forge", never `gh`/`glab`; run the
count-independent `--forbidden-only` codex/forge contract check on changed files as you go.

**n2 — opencode agent-body rewrite (tdd-guide, sonnet).** Root cause: `renderAgent()` in
`sync-opencode-edition.js` applies only `rewriteClaudeScriptPaths()`; agent BODIES never pass through
`transformCommandBody()`, so B2 nouns from the canonical Claude sources leak verbatim into
`.opencode/agent/*.md`. Add a PURE agent-body rewrite helper (mirror the `rewriteClaudeScriptPaths()`
shape) inside `renderAgent()`; extend `transformCommandBody()` for the command sites (workflow-next,
plan-run, adapt); NARROW the `test-opencode-edition.js` S2 exemption so the guard FORBIDS B2 words in
generated output while keeping the B1 token-mention exemption. TDD: RED = the narrowed S2 assertion
fails on current generated output; GREEN = the rewrite helper cleans it. Verify with
`node scripts/sync-opencode-edition.js --write` then grep `.opencode/{agent,command}/` for 0 B2 sites,
then `node scripts/test-opencode-edition.js`. The generated `.opencode/` tree is gitignored — NOT in
the write set (regenerated, never committed); only the two tracked scripts are. Opencode is additive
(D-530-02 (existing)) → NO four-chain obligation for this node; its gate is the opencode suite.

**n3 — #609 gate (code-reviewer, opus).** Post-dominates n1/n2 (G1 for the two #609 code legs) AND is
the reconciliation checkpoint after the 2-leg co-open, BEFORE #610 rewords/extends these surfaces.
Lean scope (NOT the full four chains — n8 owns those): review the merged #609 diff + run the four
contract validators, `test-route-reachability.js`, `test-opencode-edition.js`. Emit lowercase
`verdict: pass`/`fail`.

**n4 — tier-token rename core + runtime-native envelope display (tdd-guide, opus).** #610 core +
#609 envelope, HIGHEST reasoning floor (back-compat correctness is safety-critical). One cohesive node
because the rename is only GREEN end-to-end when schema + validators + dispatch + walkthroughs land
together (splitting by layer leaves every intermediate node RED — the issue-597 lesson), and the
aggregators are single-writer (see the envelope note above).
- `adaptive-schema.js` (BYTE-IDENTICAL ×4 drift anchor, all four declared): `NODE_MODEL_TIERS` →
  `['reasoning','standard']`; add `normalizeTier(token)` accepting legacy `opus→reasoning`,
  `sonnet→standard`; make `TIER_RANK` / `dispatchEffort` / `mapTier` / `dispatchEffortOpencode`
  alias-aware via the normalizer; add `dispatchModelClaude(tier)` (`reasoning→opus`,
  `standard→sonnet`).
- `plan-validator.js` + `next-action.js` (GENERATED aggregators, all four each per
  `generated_port_split`): validate via `normalizeTier`; the `model_invalid` message lists the neutral
  tokens and notes legacy aliases are accepted; enforcement stays at the two existing sites.
- `resolve-agent-model.js` (BYTE-IDENTICAL ×4): `DEFAULT_AGENT_MODELS`/frontmatter stay Claude aliases
  on the Claude edition (they feed `Agent(model=…)` directly); the `REASONING_FLOOR_ROLES` check
  normalizes before comparing so `reasoning` satisfies the floor.
- `adaptive-handoff.js` + `adaptive-node.js` (GENERATED ×4 each): add the runtime-native DISPLAY
  alongside the raw tier in handoff/orient/dispatch emissions — codex "xhigh reasoning effort" via
  `dispatchEffort`, opencode "top effort variant" via `dispatchEffortOpencode`, claude the model alias
  via the NEW `dispatchModelClaude(tier)`. The raw tier persists in the payload (additive,
  back-compatible; `first_node.model` is the seen instance).
- **Back-compat (get this exactly right — a regression silently breaks in-flight runs):** frozen /
  archived plans keep their BYTES — aliases validate at parse, NO rewrite, `plan_hash` UNCHANGED,
  `--resume-check` green, dispatch efforts byte-identical to before. New plans author neutral tokens.
- Tests: `test-install-model-rendering.js`, `test-next-action.js`, `test-adaptive-node.js`,
  `test-adaptive-handoff.js`, `test-agent-model-resolver.js` (floor normalize). The ×6 walkthroughs
  gain a LEGACY-ALIAS fixture (an old plan with `sonnet` cells resumes green, same efforts) + a
  neutral-token scenario; mirror any changed `model_invalid` assertion across all six editions (#307).

**n5 — tier-token prose + ADR (implementer, sonnet).** non_tdd_reason: mechanical token/prose
rewording + enforcement-pin sync + ADR authoring; the tier-rename BEHAVIOR is unit-tested in
n4-tier-schema — no independent failing behavioral unit here. The SIX adapt surfaces + SIX plan-run
surfaces (3 Claude commands + 3 Codex SKILL packs each) + the 3 `workflow-planner.toml` +
`agents/workflow-planner.md` author the NEUTRAL tokens, each edition keeping EXACTLY ONE mapping
sentence (claude: reasoning→Opus / standard→Sonnet at dispatch; codex: reasoning→`xhigh` /
standard→`high` per-spawn effort; opencode: top/second effort variant). Update the enforcement pins:
`validate-workflow-contracts.js` (:936-939) + its byte-identical codex twin
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, `validate-kaola-workflow-contracts.js`
(:775-780), the gitlab/gitea twins, `test-route-reachability.js` T5b (`model: sonnet -> high` /
`` `sonnet`/absent `` become neutral-token-and-alias-aware). Confirm `test-agent-profile-parity.js`
FEATURE_TOKENS (none is a model noun today) stays green after the workflow-planner md↔toml rewrite;
update only if a pinned substring moves (declared as a safe companion). ADR `docs/decisions/D-610-01.md`
(next free number — verified no D-610 record exists) records the supersession of the
portable-vocabulary ruling (the #537 root-cause note, the `docs/opencode-edition.md:39-40` ruling, the
#382 grammar choice); operator-directed. Update `docs/opencode-edition.md:39-40` to match (opus/sonnet
become legacy aliases of reasoning/standard).

**n6 — back-compat adversarial skeptic (adversarial-verifier, opus, read-only).** An INDEPENDENT
subagent whose whole job is to REFUTE #610's back-compat claim — the highest correctness risk. Has
Bash → RUN the experiments, do not reason about them: (a) freeze/archive a plan with legacy
`sonnet`/`opus` cells, "upgrade", `--resume-check` — must stay GREEN with `plan_hash` UNCHANGED and
byte-identical dispatch efforts; (b) `model_invalid` still refuses a genuinely out-of-vocab cell;
(c) the main-session-gate / finalize-sink model prohibition is unchanged. Emit lowercase
`verdict: pass`/`fail`. Investigation verifier (does not post-dominate a code node — n7 carries n4 to
the sink independently); findings feed n8.

**n7 — chain-asserted doc docking (doc-updater, sonnet).** `docs/api.md` and `docs/architecture.md`
document the plan tier tokens as the CURRENT public interface (`NODE_MODEL_TIERS = {opus, sonnet}`,
`model: ('opus'|'sonnet')`, the `opus → xhigh` mapping). Dock them to the neutral vocabulary with the
legacy-alias note. Written BEFORE the four-chain gate (n8) so the validation receipt is not staled by
a post-chains doc edit. `docs/opencode-edition.md` + the ADR live in n5 (no overlap).

**n8 — final cross-edition gate + four chains (code-reviewer, opus).** Post-dominates n4/n5 (G1 for
#610) and transitively every code node. #307 cross-edition obligation: run all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains SEQUENTIALLY (a green claude chain
alone is insufficient — `npm test` short-circuits on the first `&&` failure) PLUS
`node scripts/test-opencode-edition.js` (D-530-02 (existing), its own suite). Host note: run chains with
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` and `KAOLA_RUN_CHAINS_TIMEOUT_MS=1500000` (this box's claude
chain runs ~976s and SIGKILLs octopus merge under `auto` concurrency). Review the merged bundle
holistically incl. n6's findings. Emit lowercase `verdict: pass`/`fail`. CI/CD is NOT a gate (#501).

**n9 — finalize (finalize, sink).** `CHANGELOG.md` `[Unreleased]` only (docs/state) — one bundle
entry: Fixed #609 (B2 prose purge + opencode body-rewrite + workflow-init guidance) / Changed #610
(runtime-neutral {reasoning|standard} tier tokens with legacy aliases). ADR, opencode-edition.md,
api.md, architecture.md are already written upstream (n5, n7); state/roadmap/archive are
contractor-mechanical, not plan-node writes.

**Cross-edition / validation summary.** Cross-edition ×4 (schema byte-anchor + generated aggregators
plan-validator/next-action/handoff/node + hand-ported contract validators + SIX-surface prose) →
four-chain obligation (n8) + `edition-sync.js --check` (folded into the codex/gitlab/gitea chains) +
route-reachability. Opencode additive (D-530-02 (existing)) — its own suite, not in the four chains. No release
cut is planned in this run.

## Node Ledger

| id | status |
| --- | --- |
| n1-b2-prose | complete |
| n2-opencode-sync | complete |
| n3-609-review | complete |
| n4-tier-schema | complete |
| n5-tier-prose | complete |
| n6-backcompat | complete |
| n7-docs | complete |
| n8-final-review | complete |
| n9-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-opencode-sync) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-b2-prose) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-609-review 6b84816d33c2 | |
| tdd-guide (n4-tier-schema) | subagent-invoked | evidence-binding: n4-tier-schema fe2538e52c53 | |
| adversarial-verifier (n6-backcompat) | subagent-invoked | evidence-binding: n6-backcompat 58fd65cac92c | |
| implementer (n5-tier-prose) | subagent-invoked | evidence-binding: n5-tier-prose 79c51679c30a | |
| doc-updater (n7-docs) | subagent-invoked | evidence-binding: n7-docs 342b063ec66f | |
| finalize (n9-finalize) | main-session-direct | evidence-binding: n9-finalize c4e3b5eb3303 | |
