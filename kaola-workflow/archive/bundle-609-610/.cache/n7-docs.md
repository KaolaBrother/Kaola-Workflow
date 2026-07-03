evidence-binding: n7-docs 342b063ec66f
docs-updated: docs/api.md, docs/architecture.md

## Scope grounding

- `git log --oneline abb6a941..HEAD` showed the #609 (B2 prose purge) and #610 (neutral tier
  tokens) commits already merged: `143f666e`/`1fe81a63`/`000976cb` (n1/n2/synth for #609),
  `171351d7` (schema rename + envelope display), `328c0c84` (prose/enforcement + ADR D-610-01).
- `gh issue view` needed `--json` (the default text view failed on a missing `read:project`
  scope); read #609 and #610 bodies that way.
- Read `docs/decisions/D-610-01.md` and the actual code (`scripts/kaola-workflow-adaptive-schema.js`
  lines 42-231: `NODE_MODEL_TIERS`, `TIER_ALIASES`, `normalizeTier`, `dispatchModelClaude`,
  `dispatchEffort`, `TIER_RANK`/`CONTRACT_EFFORT_TABLE`/`mapTier`, `modelDisplay`) to transcribe
  exact shapes rather than guess. Cross-checked `modelDisplay`'s call sites in
  `kaola-workflow-adaptive-handoff.js:520-542` (`first_node.model_display`) and
  `kaola-workflow-adaptive-node.js` (`buildDispatch` at :1198-1203, plus 3 more call sites at
  :2027, :2511, :4505-4506) to confirm `model_display` is the same conditionally-attached
  `{claude, codex, opencode}` object everywhere.
- Confirmed via grep that neither `validate-workflow-contracts.js` nor
  `validate-kaola-workflow-contracts.js` pins any tier-vocabulary string inside `docs/api.md` or
  `docs/architecture.md` (the only `docs/api.md` assertions there are unrelated closure-contract /
  GitHub-only-wording checks) — free to edit the tier-vocabulary sections without breaking a pin.
  Also confirmed the B2 model-noun scanner (`validate-kaola-workflow-contracts.js:891-933`) only
  scans Codex `agents/*.toml` / `config/agents.toml` / `skills/*/SKILL.md` — docs/*.md are out of
  its scope, so no B2 constraint applies to this node's files either.

## docs/api.md

- **`dispatch` sub-object schema** (`### "opened" payload — dispatch sub-object`): changed the
  `model` field comment from `('opus'|'sonnet')` to `('reasoning'|'standard'; legacy 'opus'|
  'sonnet' aliases also accepted, see below)`; added a new optional `model_display?:
  { claude: string, codex: string, opencode: string }` field row plus a paragraph (mirroring the
  existing `leg_path`/`leg_branch` paragraph style) transcribing `modelDisplay()`'s exact
  per-runtime string formats (`claude` = the `Agent(model=…)` alias; `codex` = `"<effort>
  reasoning effort"`; `opencode` = `"<rank> effort variant"`), stating it is additive/conditional
  like `goal_line`/`leg_path`.
- **Per-node model tier paragraph** (`## Nodes` write-set-shape-refusals bullet list, issue #382):
  rewrote `NODE_MODEL_TIERS = {opus, sonnet}` to `{reasoning, standard}`, added a "Legacy aliases"
  clause describing `normalizeTier()`/`TIER_ALIASES` and the frozen-plan byte-preservation
  guarantee, updated the Codex effort-mapping example (`opus → xhigh`/`sonnet → high` to
  `reasoning → xhigh`/`standard → high`), added the Claude `dispatchModelClaude` mapping sentence
  and the opencode `mapTier`/`TIER_RANK` mapping sentence, and appended a closing sentence
  pointing at the `model_display` envelope field (cross-referencing the dispatch sub-object
  section above rather than duplicating the schema).
- **Lane-group `running-set.json` JSON example**: updated the illustrative node entry's
  `"model": "opus"` to `"model": "reasoning"` (new plans author neutral tokens per D-610-01; no
  narrative around the example needed further wording since the surrounding "Field contract"
  table doesn't describe the `model` value itself).
- Left untouched (out of scope): `DEFAULT_AGENT_MODELS` / `~/.claude/agents/.kaola-agent-models.json`
  install-manifest mentions (`"claude-opus-4-5"`, `"claude-sonnet-4-5"`) and the contractor's
  fixed-`sonnet` agent-model mentions — these are literal Claude model strings on a DIFFERENT axis
  (install-time agent-model resolution) that #610 explicitly keeps as Claude aliases, not
  `NODE_MODEL_TIERS` plan-column tokens.

## docs/architecture.md

- **Agent Profile Structure** paragraph (retired `-max` profiles note): updated the effort-mapping
  parenthetical from `` `opus → xhigh`, `sonnet → high` `` to `` `reasoning → xhigh`, `standard →
  high`; legacy plan-tier tokens `opus`/`sonnet` normalize to the same effort, #610 ``.
- **Model Resolution (Install-Time, Profile-Aware)** § "Runtime per-node override" paragraph:
  updated the tier vocabulary to `reasoning`/`standard` with a `normalizeTier()` legacy-alias
  clause, and added a sentence on the `model_display` envelope field cross-referencing
  `docs/api.md` § "`opened` payload — `dispatch` sub-object" instead of restating the schema.
- Left untouched (out of scope, same reasoning as api.md): the install-manifest example and the
  contractor's fixed-Sonnet mentions elsewhere in the file (Lean-orchestrator boundary section,
  Contractor Agent section) — literal Claude model configuration, not the plan-tier vocabulary.

## Verification

```
node scripts/validate-workflow-contracts.js       -> "Workflow contract validation passed" (exit 0)
node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed" (exit 0)
node scripts/simulate-workflow-walkthrough.js     -> "Workflow walkthrough simulation passed" (exit 0)
```

`git status --porcelain` shows exactly the 2 declared files changed (plus the untracked
`kaola-workflow/bundle-609-610/` project-state directory, which is not a write-set file):

```
 M docs/api.md
 M docs/architecture.md
?? kaola-workflow/bundle-609-610/
```

No `BLOCK:` — ground truth for both the schema shapes and the envelope field was unambiguous
(read directly from `kaola-workflow-adaptive-schema.js` source and its two call sites).
