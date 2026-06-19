# Workflow Plan — issue-537

<!-- plan_hash: bf5e1b7d10295d579e28145395716b6e2d79a06bd073f0c01a246d8c9a5fe971 -->

## Meta
issue: 537
project: issue-537
runtime: claude
workflow_path: adaptive
run_posture: in-place
base: feature/opencode-support
shape: build (two disjoint opencode-edition-local fix surfaces; parallel siblings → shared review gate → sink)
labels: area:scripts, workflow:in-progress
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-prose | tdd-guide | — | scripts/sync-opencode-edition.js,.opencode/command/kaola-workflow-adapt.md,.opencode/command/kaola-workflow-auto.md,.opencode/command/kaola-workflow-fast.md,.opencode/command/kaola-workflow-finalize.md,.opencode/command/kaola-workflow-phase1.md,.opencode/command/kaola-workflow-phase2.md,.opencode/command/kaola-workflow-phase3.md,.opencode/command/kaola-workflow-phase4.md,.opencode/command/kaola-workflow-phase5.md,.opencode/command/kaola-workflow-plan-run.md,.opencode/agent/workflow-planner.md,scripts/test-opencode-edition.js | 1 | sequence | sonnet |
| n2-variant | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js,plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js,plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js,plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js,scripts/test-adaptive-node.js | 1 | sequence | sonnet |
| n3-review | code-reviewer | n1-prose,n2-variant | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-prose | complete |
| n2-variant | complete |
| n3-review | complete |
| n4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-prose) | subagent-invoked | evidence-binding: n1-prose b4e69fe06021 | |

| tdd-guide (n2-variant) | subagent-invoked | evidence-binding: n2-variant fba45f01da61 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 6784b83c3bd7 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize de8a194122e4 | |
## Plan Notes

### Issue shape — BUILD, two disjoint fix surfaces (opencode-edition-local, forge-neutral)
Issue #537 fixes two surfaces where the opencode runtime edition leaks Claude-specific model-tier names instead of neutral effort-tier labels. The fix is **opencode-edition-local**: the opencode edition is additive (D-530-02 (existing)) and is NOT wired into `npm test`, `edition-sync.js`, `install.sh`, or the four-chain sync machinery; its verification suite is `node scripts/test-opencode-edition.js`. CI/CD is not a gate (#501).

**Surface 1 — generated command/agent prose leak (a #534-class leak).** The literal words `opus`/`sonnet` survive in the opencode-facing output. #306 root-cause trace: EVERY `opus`/`sonnet` occurrence in `.opencode/command/*.md` is produced by `scripts/sync-opencode-edition.js` — specifically the `OPENCODE_BADGE_BLOCK` constant (the `## Effort Variant Resolution` injection: `` `mapTier(tier, provider)` resolves the variant: opus → top, sonnet → second. ``) and three replacement strings inside `transformCommandBody` (the plan-run, review-fix, and "You MUST pass" rewrites, which emit `opus-tier`/`sonnet-tier`). `opencodeAgentSuffix` (same file) additionally emits `{opus, sonnet}` into `.opencode/agent/workflow-planner.md` (11 hits today). Fix = a STRUCTURALLY-SCOPED rewrite of these generator string constants to neutral tier labels (`top-tier`/`standard-tier`, or `reasoning-tier`/`standard-tier`) — the same discipline as the shipped #534 P1/P2 rewrites (no prose collateral, no over-broad regex) — then regenerate via `node scripts/sync-opencode-edition.js --write`. The `mapTier(tier, provider) → top/second` sentence becomes self-describing without Claude nouns.

**Surface 2 — dispatch variant unresolved.** `buildDispatch` (`kaola-workflow-adaptive-node.js:1057`) calls `dispatchEffortOpencode(nodeInfo.model, ctx.opencode_provider)`, but no runtime caller ever populates `ctx.opencode_provider`, so a declared `model: opus|sonnet` always resolves to `{opencode_variant: null, source: 'role_default'}`. The schema's `dispatchEffortOpencode`/`mapTier` (`scripts/kaola-workflow-adaptive-schema.js` lines ~125-141) already resolve correctly WHEN given a provider; the gap is provider resolution at the dispatch surface. Fix lives in the schema (the issue's named surface): make a declared tier resolve to a concrete `opencode_variant` for the active provider. Env-read is an established PURE pattern in this anchor (`resolveFanoutCap`/`resolveEnableAdaptive`/`resolveLaneContainment` all read `env`), so a provider detected from `KAOLA_OPENCODE_INHERIT_MODEL` (or an equivalent env) keeps the file's "no fs/forge-CLI/sibling-path" contract intact. claude/codex consume `dispatchEffort` (the codex twin), NEVER `dispatchEffortOpencode`, so this change is behavior-inert in those editions.

### Canonical-vocabulary preservation (the architectural constraint — DO NOT violate)
`NODE_MODEL_TIERS = Object.freeze(['opus','sonnet'])` (`kaola-workflow-adaptive-schema.js:49`) and `TIER_RANK = {opus:'top', sonnet:'second'}` are the **canonical cross-edition tier vocabulary**. claude/codex editions consume `opus`/`sonnet` as LITERAL model names. **DO NOT rename these tokens repo-wide.** The frozen-plan `model:` column keeps `sonnet`/`opus` (this very plan uses them). Only the opencode DISPLAYED surface (generated prose + resolved variant) translates. The internal tokens stay; the opencode surface renders neutral labels.

### Cross-edition cohesion — the ×4 byte-identical schema anchor (#306 / #291 / #453)
`scripts/kaola-workflow-adaptive-schema.js` is a **×4 byte-identical drift anchor** (copied VERBATIM into every edition's `scripts/` dir; enrolled as a byte-group in `validate-script-sync.js:183-186`; recognized by `WRITE_SET_OVERFLOW_SUBTYPES.mirror_write`). n2-variant's declared write set therefore carries ALL FOUR verbatim copies in ONE node (the #453 no-file-ceiling + #291 cohesion rule — a byte-group must move atomically; splitting it is `write_set_overflow`-by-construction):
- `scripts/kaola-workflow-adaptive-schema.js` (canonical)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` (codex twin)
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` (gitlab — NOT forge-renamed, verbatim)
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` (gitea — NOT forge-renamed, verbatim)

The schema edit must be byte-identical across all four (run `node scripts/validate-script-sync.js` to confirm). The contract validators (`validate-workflow-contracts.js` + codex/forge twins) `assertIncludes` specific symbols (`WRITE_OVERLAP_POLICY_LEGAL`, `resolveLaneContainment`, `writeFileAtomicReplace`, `locateSection`, `spliceComplianceSection`, `/kaola-workflow-plan-run`, `resolveEnableAdaptive`, `MAIN_SESSION_GATE_ROLE`) — none are `dispatchEffortOpencode`/`mapTier`, so the resolver edit leaves them green as long as those strings remain. `scripts/test-adaptive-node.js` (single, not ×4) currently ASSERTS the null branch at lines 7151-7154 (D451-DISPATCH-EFFORT); n2 adds the env-resolved concrete-variant cases (the existing explicit-provider cases at 7156-7162 stay valid).

### Disjoint parallel siblings (D-419-01 (existing) wide frontier)
n1-prose and n2-variant touch EXACT-DISJOINT file sets (generator+generated-artifacts+opencode-test vs schema-×4+adaptive-node-test) and share no dependency. Per the scheduler-default posture they are authored as an antichain (both `depends_on: —`) so the validator derives `parallel_safe` and the executor co-schedules them; the critical path is `max(n1,n2) + n3 + n4`, not `n1+n2+n3+n4`. They are genuinely independent: n1's generator output is determined by its own string constants (the schema's `effortForProvider`/`PROVIDER_EFFORT_TABLE` are unchanged by n2), so regenerating `.opencode/` is independent of the schema resolver edit.

### G1 gate — single shared code-reviewer post-dominates both impls
n3-review (code-reviewer, opus) depends on BOTH n1-prose and n2-variant. Every path from either impl to the sink passes through n3 (n1→n3→n4; n2→n3→n4), so n3 post-dominates both code-producing nodes (G1 satisfied). A single cohesive review over the combined diff is stronger than two fragmented reviews: the reviewer must confirm (a) ×4 schema byte-identity is preserved and `NODE_MODEL_TIERS`/`TIER_RANK` tokens are untouched; (b) the prose rewrite is structurally scoped (no collateral matches, no over-broad regex — the #534 discipline); (c) `grep -rn "sonnet\|opus" .opencode/command/` → 0 after regeneration; (d) claude/codex chains are behavior-inert (only `dispatchEffortOpencode`/the opencode generator changed); (e) `node scripts/test-opencode-edition.js` and the relevant `test-adaptive-node.js` cases are green. opus tier because the ×4-drift and canonical-vocabulary-preservation errors are exactly what a cheaper reviewer would miss.

### Acceptance (no non-delegable gate)
All acceptance criteria are subagent/script-checkable: `grep` for residual leaks, `node scripts/test-opencode-edition.js` green (with the new neutral-label content-reachability assertion mirroring the #532 A15-A21 style), dispatch-envelope `opencode_variant` non-null for a declared tier (unit assertion), and claude/codex unaffected (internal tokens untouched). No GPU/visual/human sign-off — no `main-session-gate`. The finalize sink records the CHANGELOG entry.
