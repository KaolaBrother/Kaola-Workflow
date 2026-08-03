# #927 live oracle — measured, not asserted

Acceptance criterion 1 demands a measurement, not a config assertion: `opencode debug agent` was
green throughout the entire failure. The oracle is `tokens_reasoning` for a **subagent** whose model
is inherited, with nothing pinned.

## Setup

opencode **1.18.11**. A PROJECT-scoped install of this branch into a scratch directory, with
`OPENCODE_CONFIG_DIR` pointed at a minimal config dir carrying only the model and provider —
the user's own `~/.config/opencode/` was never written to in order to satisfy a test, and the four
MCP servers in it were deliberately dropped so they could not confound the run.

Inherited model `zhipuai-coding-plan/glm-5.2` → Anthropic contract → knob is `thinking`.
Every probe dispatches TWO subagents from ONE parent, both inheriting, neither pinning a model.

Reasoning tokens are read per message from `~/.local/share/opencode/opencode.db`:
`json_extract(data,'$.tokens')` on the `message` table, joined to `session` by `session_id`.
Note the session-level `tokens_reasoning` aggregate lagged during the run — the message rows are
the measurement.

## Probe B — the shipped config, unmodified

Both tiers enabled, differing only in budget (top 32000, second 16000).

| session | agent | parent | model | reasoning |
|---|---|---|---|---|
| `ses_039945656ffebm` | **planner** (top) | `ses_039948fd7ffeX1` | glm-5.2 | **305** |
| `ses_03994503effe5z` | **implementer** (second) | `ses_039948fd7ffeX1` | glm-5.2 | **182** |
| `ses_039948fd7ffeX1` | build (primary, no options) | — | glm-5.2 | 102 |

Both subagents share one parent and one inherited model, and both reasoned. The top tier produced
more than the standard tier — **consistent with the tiers applying, but not proof of it.** A budget
is a cap, not a target, and this is a single stochastic sample; 305 vs 182 could be ordinary
variance. That is why probe A exists.

## Probe A1 — Layer 1 isolated. **This is the decisive one.**

Sidecar removed, so the plugin hook no-ops by design and only the static `agent.<role>.options`
payload can act. `planner` left enabled; `implementer` set to `thinking: {type:"disabled"}`.

| session | agent | parent | model | pinned model | reasoning |
|---|---|---|---|---|---|
| `ses_039936326ffe2n` | **planner** (enabled 32000) | `ses_03993a1ceffel8` | glm-5.2 | none | **350** |
| `ses_039935d70ffeQY` | **implementer** (disabled) | `ses_03993a1ceffel8` | glm-5.2 | none | **0** |

**Two subagents, one parent, one inherited model, nothing pinned on either — 350 vs 0.** The only
difference between them is the `options` payload. This is acceptance criterion 1 met on the oracle
it demands: the tier reaches a SUBAGENT and controls its reasoning. It is also the exact comparison
that the shipped `variant` mechanism failed for as long as it existed — across ~80 subagent sessions
in this database, not one ever resolved above `default`.

The primary `build` session carries no `options` and reasoned anyway (80/52), which is worth stating:
a non-zero count alone proves nothing, because the model reasons by default. Only the **contrast under
a controlled payload** is evidence, which is why probe B's 305-vs-182 was reported as consistent-with
rather than proof.

## Probe A2 — Layer 2 overrides Layer 1, per call

The static config was restored to what ships (`implementer` → thinking **enabled**, 16000). The
sidecar the plugin reads was restored with `effort.anthropic.second` → thinking **disabled**. The two
now disagree deliberately, so whichever wins is visible in the oracle.

| session | agent | parent | static config says | sidecar says | reasoning |
|---|---|---|---|---|---|
| `ses_0399255c1ffedF` | **planner** (top) | `ses_0399286e6ffenq` | enabled 32000 | enabled 32000 | **360** |
| `ses_0399252daffeUR` | **implementer** (second) | `ses_0399286e6ffenq` | **enabled 16000** | **disabled** | **0** |

**The sidecar won.** The `chat.params` hook demonstrably applies on a real call and takes precedence
over the payload baked into the config at sync time — which is the entire reason Layer 2 exists, and
the thing that lets the model change underneath without a regeneration. `planner` is the control: the
two sources agreed for it, and it reasoned.

## What these probes do and do not establish

**Established, measured:** the tier reaches a subagent that pins no model (A1, 350 vs 0); the plugin
resolves and applies per call, overriding the sync-time payload (A2, 0 against a config saying
enabled); both subagents in every probe inherited the parent's model with nothing pinned.

**Not established:** that the shipped 32000-vs-16000 budget split produces a *reliably* different
token count. Probe B measured 305 vs 182 in the expected direction, but a budget is a cap and one
sample is not a distribution. The tiers are proven to *apply*; their numeric separation on ordinary
prompts is not, and nothing in this run should be read as claiming it.

**Not touched:** the user's `~/.config/opencode/opencode.json`. Every probe ran against a scratch
project and a minimal scratch config dir.

---

## CORRECTION — this oracle overstated what it measured

An adversarial pass read the logs these probes emitted. **I had not.** All three carry, at bootstrap:

```
level=ERROR message="failed to load plugin"
  path=file:///.../.opencode/plugins/kaola-workflow-hooks.js
  error="The \"paths[0]\" property must be of type string, got object"
```

So probe A2's headline above — *"The sidecar won. The `chat.params` hook demonstrably applies"* — was
written against a log that says a plugin load failed. Verified by me directly afterwards: the error is
present in `probeB.log`, `probeA1.log` and `probeA2.log`, twice each.

**What is actually true**, established independently by the adversarial pass rather than by A2: the
hook does fire and does override Layer 1 — they captured the payload transformation on a live call.
The load error comes from the module's *named* exports (`hookPath`, `findRoot`), which opencode's
loader calls as plugin factories; the real hooks register from the default export first and survive
only because `default` sorts before `findRoot`. So the conclusion stands and **the evidence I gave
for it did not.** A2 alone could not distinguish "the hook applied the disabled payload" from "the
model happened not to reason on one call" — n=1 per arm.

That fragility is itself a defect, now routed as a blocking fix: any named export sorting before
`default` would silently kill all tiering, with nothing but this already-normalised error line.

Probe A1's 350-vs-0 also confounds the role's system prompt with the payload — `planner` and
`implementer` differ in more than their `options`. The within-role control is the honest comparison:
`implementer` enabled measured 182 (probe B) against `implementer` disabled measured 0 (probe A1),
n=1 per arm.

**Leaving the original text above unedited on purpose.** What it claimed, and what the same run's own
logs said, is the more useful record.

---

## Probe C — does a subagent already inherit the parent's EFFORT? **Yes. Measured.**

Prompted by the owner's statement that whatever model and effort the main session uses, the subagent
should use the same. Test: **no `agent` block at all** in the config, **no sidecar** (so the plugin
hook no-ops by design), two variants defined on the model, and the same two-subagent dispatch run
twice — changing only the PARENT's `--variant`.

| parent `--variant` | parent | planner (sub) | implementer (sub) |
|---|---|---|---|
| `nothink` — thinking disabled | 0 | **0** | **0** |
| `think` — thinking enabled 32000 | 26 | **560** | **641** |

Flipping only the parent's effort flips both subagents, with nothing configured per role and nothing
pinning a model. **opencode already does exactly what the owner described.** This is the native
`TaskTool` behaviour the premise reports read out of the binary — `variant: b.model ? void 0 : q`
hands the subagent the *parent's* variant `q` whenever the role pins no model.

Note also that the two subagents came back at 560 and 641 — **no tier distinction**, which is the
correct result when no per-role payload exists.

### What this does to #927's premise

#927 was filed on the reading that ~80 subagent sessions all running `default` was a defect. It was
not. They inherited correctly from parents that were themselves at `default`. Had the main session
been set to `high`, they would have been `high`.

So the machinery this run built — `agent.<role>.options`, the `effort-tiers.json` sidecar, the
`chat.params` hook — exists to make subagents run at an effort **different from** the main session.
That is an override of native inheritance, not a repair of it. Under this project's additive
derivation rule, the observed failure that would force it to exist has not been produced: "the agent
might not think hard enough" argues against the design's premise rather than for a mechanism.

**Still standing regardless of that ruling**, because they were real and are independent of tiering:
the installer's config-drift blindness, `--adopt-config` destroying a working config while printing
success, the plugin's named exports breaking opencode's loader, and the false mechanism claims in
prose that told readers effort resolved through `variant`s.

---

## Probe D — post-deletion verification: does subagent dispatch work correctly?

Asked for directly by the user. Run against a **fresh install of the post-pivot branch**, config
exactly as shipped — no `agent` block, no sidecar, no hand edits. Session effort set where a user
would set it: two variants on the model in their own global config, selected with `--variant`.

| arm | session | role | model | **variant** | reasoning |
|---|---|---|---|---|---|
| `nothink` | build | PARENT | glm-5.2 | `nothink` | 0 |
| | planner | sub | glm-5.2 | **`nothink`** | **0** |
| | code-reviewer | sub | glm-5.2 | **`nothink`** | **0** |
| `think` | build | PARENT | glm-5.2 | `think` | 38 |
| | planner | sub | glm-5.2 | **`think`** | **832** |
| | code-reviewer | sub | glm-5.2 | **`think`** | **334** |

Four things established:

1. **Dispatch routes correctly.** Each `task` call landed on the role named in `subagent_type`, as
   its own session parented to the dispatching one.
2. **Model inherits.** Every subagent ran the parent's `glm-5.2`, nothing pinned.
3. **Effort inherits.** The `variant` is recorded *on the subagent's own session row* — direct
   evidence, not inferred from token counts, which is what the earlier probes had to rely on.
4. **The effort is real, not just recorded.** 0/0 against 832/334 across the two arms.

**Zero plugin load errors in both arms**, against the shipped install — the loader fix holds where
this box's v9.4.2 copy still fails.

Method note: the first read of this data showed `planner` at 0 in the `think` arm, because the query
returned one arbitrary message row per session rather than the session's total. Aggregating gave 832.
Reported here because a single-row read is exactly how the original oracle overstated itself.
