# opencode edition — two effort tiers that both inherit the main session's model

**Status: BUILT, MEASURED, THEN REMOVED (#927, 2026-08-03).** This design was implemented and shipped
into the working tree, proven on a live oracle, and then deleted — because a later probe showed its
premise was false. **Nothing described below is in the product.** A subagent runs the model *and the
reasoning effort* of the session that dispatched it, which is opencode's own behaviour and needs no
configuration.

Read [Why this was removed](#why-this-was-removed--probe-c) before anything else here. The design is
kept unedited above that section, because a design record that quietly becomes a description of the
final state loses the only thing that made it worth keeping — and because two of its own errors are
worth more than its conclusion.

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

> **The spread-merge on the last line is wrong** and is not what shipped — it leaves the exposure
> Layer 2 exists to remove. See the [correction](#correction--the-hook-replaces-the-knob-it-does-not-spread-over-it)
> at the end of this document.

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
  this exposure. **The Layer 2 sketch above does not actually remove it** — see the
  [correction](#correction--the-hook-replaces-the-knob-it-does-not-spread-over-it).
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

**Closed alongside #927**, by owner ruling, and it **outlived the design** — it was the one thing
here that was a real defect independent of tiering. The install *reports* rather than rewrites, and
acts only under the explicit `--adopt-config` opt-in; the file is user-owned and is never
overwritten silently. Passing the flag is a decision to take the new config, not consent to lose the
old one, so adoption copies the file it replaces to a timestamped backup it names and fails rather
than replacing it if that copy cannot be written.

Its **subject changed with the removal**. The check originally compared the role set in the existing
file against the set the generator emits. Post-removal the generator emits no `agent` block at all,
so that comparison has no baseline and the detector went completely silent — measured, with a
positive control. The useful check is the mirror image, and it is the one this box's own config
needed: an existing config carrying per-role effort entries (`variant` or `options`) is stale,
because those entries no longer do anything, and it is named as such. An entry pinning only a
`model` is the user's own opt-in and is deliberately not counted.

## Correction — the hook replaces the knob, it does not spread over it

Found while authoring the tests, before anything was built. The hook that was built is this, not the
sketch in Layer 2 — and both are now deleted. **This correction is the most useful thing in the
document**: it is a design of record that could not have done the job it was derived for, caught by
someone re-deriving the requirement rather than reading the code.

The sketch ends `output.options = { ...(output.options || {}), ...payload }`. **That does not close
the wrong-contract exposure Layer 2 exists for.** Layer 1's sync-time payload is `agent.options`,
and opencode has already merged `agent.options` into `output.options` by the time `chat.params`
runs. So on a session that has moved to a model on another contract, a spread leaves the stale
`thinking` budget sitting *alongside* the freshly-resolved `reasoningEffort`, and both go out — the
same wrong-contract payload the layer was added to prevent, now with an extra key.

The result to reach is therefore stronger than "set the right knob": after the hook runs,
`output.options` carries the knob for the resolved contract and **carries no knob belonging to any
other contract**. The shipped hook deletes every other contract's knob before writing the resolved
payload, and the set of knobs to delete is **derived from the effort table itself** — the union of
every top-level option key across every contract and rank in the generated sidecar — rather than a
hand-typed key list. A hand-typed list would go stale the first time a contract with a new knob was
added, which is the same class of failure as the stale payload this hook removes. Options the table
does not own are untouched.

---

## Why this was removed — probe C

Owner ruling, 2026-08-03, on a measurement rather than an argument.

Everything above assumed that ~80 subagent sessions all running at reasoning effort `default` was a
**defect**. Probe C tested that assumption directly, and it is false.

Setup: **no `agent` block** in the config, **no sidecar** (so the plugin hook no-ops by design), two
variants defined on the model, and the same two-subagent dispatch run twice — changing only the
**parent** session's `--variant`.

| parent `--variant` | parent | planner (sub) | implementer (sub) |
|---|---|---|---|
| `nothink` — thinking disabled | 0 | **0** | **0** |
| `think` — thinking enabled 32000 | 26 | **560** | **641** |

Flipping only the parent's effort flips both subagents, with nothing configured per role and nothing
pinning a model. This is the native `TaskTool` behaviour the premise reports had already read out of
the 1.18.11 binary — `variant: b.model ? void 0 : q` hands the subagent the *parent's* variant `q`
whenever the role pins no model — and it is exactly what the owner wanted. The ~80 sessions were
**inheriting correctly** from parents that were themselves at `default`. Had the main session been
set higher, they would have followed.

So the machinery this document designs — `agent.<role>.options`, the `effort-tiers.json` sidecar,
the `chat.params` hook — exists to make subagents run at an effort **different from** the session
that dispatched them. That is an override of correct native behaviour, not a repair of it. Under
this project's additive-derivation rule the observed failure that would force it to exist was never
produced: *"the agent might not think hard enough"* argues against the design's premise rather than
for a mechanism. It was removed entirely, variant-era remains included, rather than reverted to the
`variant` form — which was measured inert.

### Two things the design got wrong that the probes above could not see

1. **The tier separation was never demonstrated.** Probe C's two subagents came back at 560 and 641
   — no tier distinction, which is the *correct* result when no per-role payload exists. But the
   probes that were supposed to prove separation never did either: probe B's 305-vs-182 was reported
   as consistent-with rather than proof, and probe A1's 350-vs-0 confounds the role's system prompt
   with the payload, since `planner` and `implementer` differ in far more than their `options`. The
   honest within-role comparison is n=1 per arm. **The 32000/16000 split was shipped without a
   measurement showing it did anything.**
2. **The contract was resolved from the provider brand, and the brand was wrong.** The whole
   contract-keying story — GLM-5.2 via z.ai is served under the Anthropic API contract, so its knob
   is the `thinking` budget — was **not verified against the transport**. `zhipuai-coding-plan`
   routes through `@ai-sdk/openai-compatible`, not the Anthropic contract. So the one provider this
   design was ever measured on was being sent a `thinking` payload keyed off its *brand name*, and
   the 32000/16000 split had no demonstrated effect on it. A rule that keys on a brand id and calls
   itself contract-keyed is the same class of error as a config key that reads as live and is not.

### What survived, and why

Each of these was a real defect, found alongside the design and independent of it:

- **The installer's config-drift blindness** — an existing `opencode.json` was preserved forever and
  nothing ever looked at it. Now reported, with its subject changed to per-role effort entries.
- **`--adopt-config` destroying a working config while printing success** — now backed up to a
  collision-proof timestamped file first, and failing rather than replacing if that backup cannot be
  written.
- **The plugin's named exports breaking opencode's loader** — `export { hookPath, findRoot }` was
  called as a plugin factory, threw, and logged `failed to load plugin` on every startup. The hooks
  survived only because ESM namespace keys sort and `default` came first; one export name sorting
  ahead of it would have killed every hook in the file. Now `export default` only.
- **The false mechanism claims in prose** — the docs told readers effort resolved through `variant`s
  and through a `provider.*` block. Neither was ever true.

### The lesson worth keeping

The failure this document opens with was real and was correctly measured: `variant` never applied,
across ~80 sessions. What was never checked is whether the thing it failed to do was worth doing.
Four probes, a two-layer design, a generated sidecar, a plugin hook and a full test suite were built
on top of an unexamined premise, and one probe against the premise itself retired all of it.
**Measure the premise before building the mechanism** — the cheapest probe in this entire
investigation was the last one run.
