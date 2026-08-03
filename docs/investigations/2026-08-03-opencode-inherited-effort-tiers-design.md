# opencode edition — two effort tiers that both inherit the main session's model

**Status: design only. Nothing in this document is applied.** Recorded for later.

Scope is the **opencode edition alone**. The claude, codex and kimi editions are unaffected and
were not examined.

## The problem, measured

Every subagent opencode has ever run on this box executed at reasoning effort `default`. Across all
projects, 14 distinct agent names and ~80 subagent sessions, **not one session resolved `high` or
`max`**. Dispatch was never at fault — every `task` call carried the correct `subagent_type`.

The cause is a coupling in opencode 1.18.11: **an agent's `variant` is honoured only when that agent
also pins a `model`.** Two code paths enforce it, and they interlock deliberately:

| surface | code | consequence |
|---|---|---|
| `TaskTool.execute` | `variant: b.model ? void 0 : q` | `b.variant` is never read; the subagent inherits the **parent's** variant `q` unless it pins a model |
| `SessionPrompt.prompt` | `Q = U.model && <model matches>`; agent variant reachable only through a lookup gated on `Q` | without `U.model`, `U.variant` is unreachable |

TaskTool suppresses the inherited variant *precisely when* the agent pins a model, so SessionPrompt
can then apply the agent's own. Pin no model and neither half fires.

The Kaola-Workflow generator pins no model — by design. `scripts/sync-opencode-edition.js:641`
states it outright (*"NO model is pinned — both tiers inherit the model you are already using"*) and
`:672` emits `{ "variant": … }` with no `model`. So the edition's own design intent and opencode's
variant mechanism are mutually exclusive. `:651` further asserts *"opencode applies them from this
file"*, which is the false premise that hid this.

**`variant` is therefore unusable for an inheriting design and must be abandoned, not repaired.**

## The mechanism

Carry the tier in **`agent.<role>.options`** instead of `agent.<role>.variant`.

opencode merges agent options into every model call with **no model gate**:

```
d = merge(merge(merge(providerOptions, model.options), agent.options), variantOptions)
  → plugin.trigger("chat.params", …, { temperature, topP, topK, maxOutputTokens, options: d })
```

Because nothing consults `agent.model`, the role can stay unpinned and still carry an effort knob.
Model inheritance is preserved by TaskTool's own fallback: `R = b.model ?? {parent modelID,
providerID}` — with no `b.model`, the subagent runs on the main session's model.

The payloads already exist. `CONTRACT_EFFORT_TABLE` in `kaola-workflow-adaptive-schema.js` already
stores `{ variant, options }` per tier; only the destination key changes.

### Layer 1 — static config

Generator change at `sync-opencode-edition.js:672`: emit `profile.top.options` /
`profile.second.options` under `"options"` rather than the variant *name* under `"variant"`. The
`provider.*.variants` block (`:657`–`:668`) is then dead for tiering purposes.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "build",

  // Kaola-Workflow · opencode edition — TWO effort tiers, BOTH inheriting the main
  // session's model. No "model" is pinned on any role and no provider.*.variants
  // block is needed: the tier rides on "options", which opencode merges into every
  // call regardless of which model the session resolved.
  "agent": {
    // reasoning tier
    "code-architect":       { "options": { "thinking": { "type": "enabled", "budgetTokens": 32000 } } },
    "code-reviewer":        { "options": { "thinking": { "type": "enabled", "budgetTokens": 32000 } } },
    "planner":              { "options": { "thinking": { "type": "enabled", "budgetTokens": 32000 } } },
    "security-reviewer":    { "options": { "thinking": { "type": "enabled", "budgetTokens": 32000 } } },
    "synthesizer":          { "options": { "thinking": { "type": "enabled", "budgetTokens": 32000 } } },

    // standard tier
    "adversarial-verifier": { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "build-error-resolver": { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "code-explorer":        { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "doc-updater":          { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "implementer":          { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "investigator":         { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "knowledge-lookup":     { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "metric-optimizer":     { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } },
    "tdd-guide":            { "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } } }
  }
}
```

The payload above is the **Anthropic contract** (GLM-via-z.ai). `contractForProvider` keys it as
today: OpenAI → `{"reasoningEffort":"xhigh"|"high"}`, Google → `high|low`, unknown → `high|medium`.

### Layer 2 — plugin, contract resolved per call

Layer 1 still bakes one contract's payload at sync time, so switching the main session to a model on
a *different* API contract sends a wrong payload. Layer 2 removes that entirely.

The `chat.params` plugin hook receives the **actual resolved model and provider for that call** and
may rewrite `output.options`. That lets `contractForProvider` + `CONTRACT_EFFORT_TABLE` run at call
time against whatever model the session is really using.

Sidecar rendered by the generator (tier assignment stays single-sourced in the canonical agent
frontmatter via `reasoningRoles()` / `standardTierRoles()`):

`~/.config/opencode/kaola-workflow/effort-tiers.json`
```json
{
  "version": 1,
  "tiers": {
    "code-architect": "top",
    "code-reviewer": "top",
    "planner": "top",
    "security-reviewer": "top",
    "synthesizer": "top",
    "adversarial-verifier": "second",
    "build-error-resolver": "second",
    "code-explorer": "second",
    "doc-updater": "second",
    "implementer": "second",
    "investigator": "second",
    "knowledge-lookup": "second",
    "metric-optimizer": "second",
    "tdd-guide": "second"
  }
}
```

Hook added to the existing `~/.config/opencode/plugins/kaola-workflow-hooks.js`, same `(input,
output)` shape as the `tool.execute.before` hook it already carries:

```js
"chat.params": async (input, output) => {
  const tier = TIERS[input.agent];                 // "top" | "second" | undefined
  if (!tier) return;                               // unknown agent → untouched
  const contract = contractForProvider(input.provider?.id);
  const payload = CONTRACT_EFFORT_TABLE[contract][tier].options;
  output.options = { ...(output.options || {}), ...payload };
},
```

Properties:

- Both tiers inherit the main session's model. Nothing is pinned anywhere.
- The knob is resolved against the model **in use on this call**, so switching the opencode model
  re-tiers correctly with no regeneration. This retires the installer's
  `⚠ SWITCHED YOUR OPENCODE MODEL?` warning and the staleness class behind it.
- Fail-open: an unknown agent or unrecognised provider leaves `options` untouched.

The two layers are **complementary, not alternatives**. Layer 1 keeps a correct-at-sync-time payload
if the plugin ever fails to load; Layer 2 corrects it whenever the inherited model has moved.

## Precedence, as measured

`variantOptions` merges *after* `agent.options`, so a pinned-model variant would still win — the
design does not fight one. `chat.params` runs after all merging and wins outright.

## Watch list — recorded, not built

- `options` is a raw provider payload merged blind. A wrong-contract payload is **sent**, where a
  mismatched `variant` merely de-tiered silently. Layer 2 is the answer; without it, Layer 1 carries
  this exposure.
- No guard proves an agent is actually running at its intended tier. `tokens_reasoning` in
  `opencode.db` is the cheapest available oracle and is what the probes below used.

## Evidence

All probes on opencode 1.18.11, `zhipuai-coding-plan/glm-5.2`, recorded in `opencode.db`.

| # | probe | config | result |
|---|---|---|---|
| 1 | `probe-novariant` | `variant: high`, no model | recorded `default` — **variant dropped** |
| 2 | `probe-withmodel` | `variant: high` + `model` | recorded `high` — variant applied |
| 3 | `probe-think-on` | `options` thinking enabled, **no model** | **19** reasoning tokens |
| 4 | `probe-think-off` | `options` thinking disabled, **no model** | **0** reasoning tokens |
| 5 | `probe-think-on` + plugin | `chat.params` forced disabled | **0** reasoning tokens; hook observed `model=glm-5.2 provider=zhipuai-coding-plan` |
| 6 | `sub-think-on` (**subagent**) | `options` enabled, **no model** | **9** reasoning tokens; `child_model=glm-5.2` = `parent_model` |
| 7 | `sub-think-off` (**subagent**) | `options` disabled, **no model** | **0** reasoning tokens; `child_model=glm-5.2` = `parent_model` |

Rows 1–2 establish the coupling that kills `variant`. Rows 3–4 establish that `options` works with
no model pinned. Row 5 establishes that the plugin hook fires, sees the real inherited model, and wins.

**Rows 6–7 are the load-bearing pair**: two subagents dispatched from one parent, both inheriting
that parent's `glm-5.2` with nothing pinned, running at *different* effort. That is precisely the
property this design must deliver — inheritance and tiering at the same time — measured on the
actual failure surface rather than inferred from the primary-session rows.

Rows 1–5 were primary sessions; on their own they would only be a hypothesis about subagents.

## Separate defect found alongside (not part of this design)

`~/.config/opencode/opencode.json` on this box is stale: `seed_config` preserves an existing file and
never regenerates it. It carries three retired roles (`contractor`, `issue-scout`,
`workflow-planner`) and is missing `investigator` and `metric-optimizer`. The current generator emits
exactly the right 14 roles, so a regenerate fixes it independently of anything above.
