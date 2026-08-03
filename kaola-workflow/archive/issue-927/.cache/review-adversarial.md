# #927 adversarial review — the claim is REFUTED

**Claim under test (verbatim):**

> Every opencode subagent effort tier this edition ships now actually reaches the model. Both tiers
> still inherit the main session's model with nothing pinned; the tier rides on
> `agent.<role>.options`, which opencode merges into every call with no model gate; and a
> `chat.params` plugin hook re-resolves the correct knob against the model actually in use on each
> call, so switching models needs no regeneration. Nothing can silently de-tier.

**Surface:** `git diff c3938174` in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927`,
plus the evidence under `kaola-workflow/issue-927/.cache/`.

**Analytical result: REFUTED.** Three independent clauses break. Two clauses survive and are now
better evidenced than they were.

Everything below was executed, not reasoned about. opencode 1.18.11, live, against a scratch project
and `OPENCODE_CONFIG_DIR` pointed at a scratch config dir. The user's `~/.config/opencode/` was read
but never written.

---

## Attack 1 — Is the oracle sound? **REFUTED (the oracle's decisive probe never measured what it says it measured)**

### 1a. The plugin FAILED TO LOAD in all three oracle probes

The probe logs the oracle itself produced are still on disk at
`/private/tmp/claude-501/…/e5bef84f-998c-4766-a21b-c0b1d082b10a/scratchpad/oracle-out/`. Every one of
them — `probeB.log`, `probeA1.log`, `probeA2.log` — carries these two lines at bootstrap:

```
level=ERROR message="failed to load plugin" path=file:///Users/ylpromax5/.config/opencode/plugins/kaola-workflow-hooks.js error="The \"paths[0]\" property must be of type string, got object"
level=ERROR message="failed to load plugin" path=file:///private/tmp/.../oracle/.opencode/plugins/kaola-workflow-hooks.js error="The \"paths[0]\" property must be of type string, got object"
```

`live-oracle/README.md` states of probe A1 *"Sidecar removed, so the plugin hook no-ops **by
design**"* and of probe A2 *"**The sidecar won.** The `chat.params` hook demonstrably applies on a
real call"*. Neither statement was checked against the log the probe emitted, and the log says the
plugin failed to load. The record shipped as evidence omits this entirely.

### 1b. The A2 conclusion is nevertheless TRUE — established independently, not by the oracle

I re-ran the mechanism with instrumentation. Byte-identical branch plugin
(`sha256 e3138d97add9527ca80f603f77c67d482a07fc319d8081618534e6d6f9020b2d`, matching
`templates/opencode/plugins/kaola-workflow-hooks.js`), two spy plugins sorted around it
(`aaa-spy.js` / `zzz-spy.js`), sidecar `effort.anthropic.second` set to a sentinel
`budgetTokens: 12345` while `opencode.json` still said `16000`, and one `task`-tool dispatch of the
`implementer` subagent. Result:

```
{"ev":"chat.params","tag":"PRE","agent":"implementer","providerId":"zhipuai-coding-plan","modelId":"glm-5.2",
 "options":{"thinking":{"type":"enabled","clear_thinking":false,"budgetTokens":16000}}}
{"ev":"chat.params","tag":"POST","agent":"implementer","providerId":"zhipuai-coding-plan","modelId":"glm-5.2",
 "options":{"thinking":{"type":"enabled","budgetTokens":12345}}}
```

PRE is what opencode itself merged (Layer 1 present: `budgetTokens: 16000` from
`agent.implementer.options`, on a subagent that pins no model). POST is after the kaola hook (Layer 2
present, and it wins). So the hook does run, despite the load error — see attack 2 for why, and why
that is luck rather than design.

### 1c. Probe A1's "decisive" 350-vs-0 is a weaker control than stated

Verified in `~/.local/share/opencode/opencode.db`: session ids resolve, the numbers are real
(350/0, 305/182, 360/0), both subagents in each probe shared one parent and one inherited model, and
— to the oracle's credit — the **user prompt was byte-identical** for both arms (the derangement
question, recovered from the `part` table). That much holds.

What does not hold is "the only difference between them is the `options` payload". The two arms are
different *roles* with different system prompts. The genuine within-role control is probe B's
implementer (enabled → 182) against probe A1's implementer (disabled → 0) — n=1 per arm, across two
different process invocations one minute apart. And the DB refutes the supporting line "across ~80
subagent sessions in this database, not one ever resolved above `default`" as evidence that tiers did
nothing to reasoning: `implementer` subagents on 2026-08-03 under the OLD config produced 2 105,
3 613, 17 794, 22 810, 32 118 and 36 321 reasoning tokens. `default` there is the *variant name*, not
the reasoning volume.

### 1d. Scratch-scope / dropped-MCP concerns

Not a confound. Project scope resolves the sidecar via `deployedPath` candidate 1
(`<proj>/.opencode/kaola-workflow/effort-tiers.json`) and global scope via candidate 3
(`SELF_DIR/../kaola-workflow/…`); I confirmed the user's real global tree
(`~/.config/opencode/kaola-workflow/` holds only `scripts/`, no sidecar) so the global plugin
instance could not have leaked a tier map into probe A1. MCP absence does not touch `chat.params`.

---

## Attack 2 — "Nothing can silently de-tier" **REFUTED, three ways**

### R1 — The shipped plugin fails to load on every opencode startup; the hook survives by accident

Root cause, reproduced in isolation (`node`, emulating opencode's loader):

```
exports: [ 'default', 'findRoot', 'hookPath' ]
factory candidates: 3
  ok: KaolaWorkflowHooks
THREW: TypeError "The \"paths[0]\" argument must be of type string. Received an instance of Object"
hooks pushed before throw: 1 [[ 'tool.execute.before', 'experimental.session.compacting', 'chat.params' ]]
```

opencode's loader calls **every function export** as a plugin factory —
`function Xy($){ ... for(let Y of Object.values($)){ ... } }` and
`async function Jy($,Z,Q){ ... for(let J of Xy($.mod)) Q.push(await J(Z,$.options)) }` (both verified
byte-exact in the shipped binary). So `findRoot(PluginInput)` runs, `path.resolve(<object>)` throws,
`Jy` rejects, and opencode logs `failed to load plugin`.

The plugin's own comment is false:

```js
// Named exports for the test suite only — opencode loads the default export below; these are inert
// for the runtime but let test-opencode-edition.js assert hookPath's global-layout resolution (F3).
export { hookPath, findRoot };
```

They are not inert. The premise report already recorded the exact loader semantics — §G,
*"iterates `Object.values(mod)` — i.e. **default and every named export** are candidates"* — and the
conclusion was not drawn.

Why the hooks still work: `Q` in `Jy` is the shared array `K` that `Plugin.state` returns as
`{hooks:K}`, so the default export's hook table is already pushed before the later export throws.

**Why this is a silent-de-tier path, not a cosmetic log line.** ESM namespace keys are sorted:
`default` < `findRoot` < `hookPath`. The default export happens to sort first. Add one named export
whose name sorts before `default` — `contractForProvider`, `deployedPath`, `assertNoResidue`,
anything beginning `a`–`c` — and it throws *first*, the default is never invoked, `chat.params` is
never registered, and the entire Layer 2 mechanism dies. The only signal is the same
`failed to load plugin` line that is **already printed on every startup today** and therefore already
normalised as noise. That is precisely "silently de-tier".

The suite cannot see any of this. `scripts/test-opencode-edition.js` drives the hook via
`const factory = mod.default;` (A26, line 2070) and `const { hookPath } = await import(...)` (H1,
line 1629). Neither emulates `Object.values(mod)`. `grep -c 'Object.values(mod)'` → 0.

### R2 — The contract is resolved from the provider BRAND ID, not from the model's API contract

The hook reads `input.provider.id` and regex-matches it. It never reads `input.model`, which carries
`api.npm` — the exact discriminator opencode's own built-in `chat.params` hooks branch on
(`if(Y.model.api.npm==="@ai-sdk/anthropic") J.options.toolStreaming=!1`).

opencode's own contract→knob table (function `gy`, offset 4409643 in the `__BUN` segment):

| `api.npm` | opencode's effort knob | kaola rule match on the provider id | kaola knob |
|---|---|---|---|
| `@ai-sdk/anthropic` | `thinking.budgetTokens` | `anthropic\|claude` | `thinking` ✓ |
| `@ai-sdk/google-vertex/anthropic` | `thinking.budgetTokens` | **`google\|gemini`** (id `google-vertex-anthropic`) | **`reasoningEffort` ✗** |
| `@ai-sdk/google`, `@ai-sdk/google-vertex` | `thinkingConfig.thinkingBudget` | `google\|gemini` | **`reasoningEffort` ✗** |
| `@ai-sdk/amazon-bedrock` | `reasoningConfig` | none (id `bedrock`) → default | **`reasoningEffort` ✗** |
| `@openrouter/ai-sdk-provider` | `reasoning.max_tokens` | none → default | **`reasoningEffort` ✗** |
| `@ai-sdk/cohere` | `thinking.tokenBudget` | none → default | **`reasoningEffort` ✗** |
| `@ai-sdk/alibaba` | `enableThinking` + `thinkingBudget` | none → default | **`reasoningEffort` ✗** |
| `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `azure`, `groq`, `xai`, `mistral`, `github-copilot`, … | **returns `undefined` — no budget knob at all** | varies | `reasoningEffort` |

`google-vertex-anthropic` is the sharpest case: the kaola rule list *actively matches the wrong
rule*, because the string contains `google` while the endpoint is Anthropic. `github-copilot` serving
a Claude model has `api:{npm:"@ai-sdk/anthropic"}` (verified in the binary) and matches nothing.

Consequence in both directions: a knob the endpoint does not understand is either rejected (a live
provider error, which the design says Layer 2 exists to prevent) or ignored — in which case **top and
second rank send the same effective request and both roles run at the model's default**. Silent
de-tier. The claim's "re-resolves the correct knob against the model actually in use" is false as
worded; it re-resolves against the provider's *name*.

Repo-wide: `grep -c 'api.npm'` and `grep -c 'openai-compatible'` across
`scripts/test-opencode-edition.js`, `scripts/kaola-workflow-adaptive-schema.js` and
`docs/opencode-edition.md` → **0, 0, 0**.

### R3 — On the only provider ever measured, the two tiers are not separable

The base options my PRE spy captured for the primary `build` agent were
`{"thinking":{"type":"enabled","clear_thinking":false}}`. In the shipped binary, exactly one branch
produces that literal:

```js
if(["zai","zhipuai"].some((Y)=>$.model.providerID.includes(Y)) && $.model.api.npm==="@ai-sdk/openai-compatible")
  Z.thinking={type:"enabled",clear_thinking:!1};
```

So `zhipuai-coding-plan/glm-5.2` is **`@ai-sdk/openai-compatible`**, live-proven. The design says
otherwise in five places — `CONTRACT_EFFORT_TABLE`'s comment ("GLM-5.2 via z.ai, served under the
Anthropic API contract"), `PROVIDER_CONTRACT_RULES`' first entry, the generated `opencode.json`
banner, `install-opencode.sh`'s post-seed output, and `live-oracle/README.md` ("Anthropic contract →
knob is `thinking`"). The knob name coincides; the contract classification does not.

This matters because `budgetTokens` is an `@ai-sdk/anthropic` parameter. Per `gy` above, opencode
emits **no** budget knob for `@ai-sdk/openai-compatible`. The two shipped payloads for this provider —
`{thinking:{type:"enabled",budgetTokens:32000}}` and `{thinking:{type:"enabled",budgetTokens:16000}}` —
therefore differ only in a field opencode itself never sends to this contract. `type:"enabled"` vs
`type:"disabled"` **is** honoured (that is what probe A1's 0 actually demonstrates). A 32000-vs-16000
*separation* has no supporting measurement: probe B's 305-vs-182 is n=1 and its own author calls it
non-probative.

So "Every opencode subagent effort tier this edition ships now actually reaches the model" holds only
in the sense that *a payload* reaches the model. That the *tier* reaches it — that top and second are
different efforts — is unestablished on the one provider that was tested, and there is a concrete
mechanism (no budget knob on this contract) predicting they are not.

### Other de-tier paths checked

| path | outcome |
|---|---|
| sidecar absent (`--no-scripts`) | **SURVIVES.** `copy_tree` writes it with the plugin, not with the support scripts; verified in the diff. Absent sidecar → `loadEffortTiers` → null → hook no-ops; Layer 1 still applies. |
| project vs global layout | **SURVIVES.** Candidate order verified against both real trees. |
| uninstall/reinstall ordering | **SURVIVES.** `uninstall_edition` removes `$layout_root/kaola-workflow/effort-tiers.json` and `rmdir`s harmlessly at global scope. |
| agent in config but not sidecar (or vice versa) | **SURVIVES** at install time (both derive from `topTierRoles()`/`standardTierRoles()`), but a preserved stale `opencode.json` without `--adopt-config` leaves Layer 1 contributing nothing — documented, and Layer 2 covers it *if the plugin loads* (see R1). |
| provider id matching no rule | **REFUTED** — see R2. |
| session switches model mid-run | **SURVIVES** for the model *identity* (the hook re-reads `input.provider` per call); **REFUTED** for the *contract*, same R2 cause. |
| subagent dispatched with an explicit model | Not reachable from the shipped surfaces (the generated prose forbids per-call `model=`), and `agent.options` has no model gate anyway (binary-verified). Untested live. |
| two plugin instances (global + project install both present) | **Minor gap.** Both register a `chat.params` hook, each resolving its *own* sidecar; the later one wins, with nothing declaring which. Harmless while both are same-version. |

---

## Attack 3 — Does the tier reach EVERY subagent, or only the 14 named roles? **SURVIVES, with a named gap**

Live: for `agent:"build"` PRE and POST were byte-identical — the hook correctly declines an agent it
does not own. `title` (the small-model summariser) likewise passes through `chat.params` and is
correctly skipped.

`build`, `plan`, `general`, `title` and any user-authored agent get no tier. That silence is right —
tiering an agent the workflow does not own would be the worse defect. The residual gap is that the
sidecar's `tiers` map is the *sole* gate: an agent file deployed under `.opencode/agent/` whose name
is absent from the sidecar is untiered with no check anywhere, and nothing compares the two sets. The
installer's new drift report compares `opencode.json`'s role set only — not the sidecar's.

---

## Attack 4 — Layer 1 / Layer 2 disagreement **REFUTED (they produce different payloads on the same call)**

From the same instrumented run:

```
PRE : {"thinking":{"type":"enabled","clear_thinking":false,"budgetTokens":16000}}
POST: {"thinking":{"type":"enabled","budgetTokens":12345}}
```

`clear_thinking:false` — set by **opencode itself** for zhipu providers — is destroyed. opencode
merges `agent.options` with a deep merge (`d=_s(_s(_s(r,e.model.options),e.agent.options),h)`, where
`_s` folds recursively); the plugin replaces the whole `thinking` object
(`opts[knob] = detach(payload[knob])`). So the two layers are not equivalent, contrary to the
generated banner's "The payloads written here are what applies if that plugin is not loaded."

The suite's `preserve-unrelated` case proves only that a **top-level** sibling key (`__kwUnrelated`)
survives. Nothing covers a sibling *inside* the knob object. `grep -c 'clear_thinking'
scripts/test-opencode-edition.js` → 0.

On the "wrong `thinking` payload sent to an OpenAI-contract endpoint is a live provider error" premise
in the brief: it is worse than stated in one direction and better in another. Worse — R2 shows the
plugin *itself* can emit the wrong-contract knob, so Layer 2 does not close that class. Better — a
wrong knob appears to be tolerated here rather than fatal: opencode's own `smallOptions` sent
`reasoningEffort:"high"` to this zhipu (openai-compatible) endpoint for the `title` agent with no
error. Which converts the failure mode from "loud" to "silent", against the claim.

---

## Attack 5 — Spot-check the premise report against the actual binary **SURVIVES**

I did not trust `bun_segment.bin`; I grepped the **shipped executable**
(`…/opencode-ai/bin/opencode.exe`, 138 608 738 bytes) directly:

| quote | in the real binary |
|---|---|
| `_s(_s(_s(r,e.model.options),e.agent.options),h)` (premise C) | 1 match ✓ |
| `agent:e.agent.name,model:e.model,provider:e.provider` (premise D) | 1 match ✓ |
| `function Xy($){...Object.values($)...}` / `Jy` loader (premise G) | ✓ |
| `input.agent` is a plain string | ✓ live: `"agentType":"string"` in every captured call |
| `input.provider.id` valid | ✓ live: `"providerId":"zhipuai-coding-plan"` |

The premise report is accurate on the points I checked. Its §G "CANNOT-DETERMINE whether a throwing
hook crashes the process" is unresolved and the plugin's total `try/catch` is the right response.

---

## What actually survived

- **"Both tiers still inherit the main session's model with nothing pinned."** SURVIVES. The generated
  `opencode.json` carries no top-level `model` and no `agent.<role>.model`; `TaskTool` inheritance
  (`R=b.model??{modelID:U.info.modelID,providerID:U.info.providerID}`) is byte-verified; the live
  `implementer` subagent ran on the parent's `glm-5.2`.
- **"The tier rides on `agent.<role>.options`, which opencode merges into every call with no model
  gate."** SURVIVES, and is now stronger than the shipped evidence made it: the PRE dump shows
  `budgetTokens:16000` from `agent.implementer.options` present on a **subagent** call that pinned no
  model. This is the one claim the whole change turns on, and it is sound.
- **The `chat.params` hook fires per call and overrides Layer 1.** SURVIVES as a mechanism (the 12345
  sentinel). What fails is "the correct knob" (R2) and the fact that its registration is accidental
  (R1).

## What remains untested

- Whether zhipu's endpoint actually ignores `budgetTokens` (R3 argues it from opencode's own contract
  table and from the absence of any separating measurement; I did not obtain a positive control).
- Any provider other than `zhipuai-coding-plan/glm-5.2` live. R2's wrong-knob cases are established
  from opencode's shipped contract table plus the plugin's own rule list, not from live calls to
  Bedrock/Vertex/OpenRouter.
- Whether a throwing `chat.params` hook kills the process or the request (unchanged from premise §G).
- The four-chain / edition suite was not run: I had admitted defects before reaching it.

---

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=named exports hookPath/findRoot are invoked as plugin factories by opencode's loader, so the plugin logs "failed to load plugin" on every startup and chat.params registers only because the default export happens to sort first; any future export sorting before "default" silently kills all tiering, and no test emulates Object.values(mod)
finding: id=R2 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=the contract is resolved from the provider brand id, never from input.model.api.npm which the hook is handed; google-vertex-anthropic matches the google rule and gets reasoningEffort against an Anthropic endpoint, and bedrock/openrouter/cohere/alibaba/github-copilot-claude all fall to the default contract's wrong knob — a silent de-tier
finding: id=R3 scope=in_scope action=fix status=open severity=high fix_role=investigator rationale=zhipuai-coding-plan/glm-5.2 is api.npm "@ai-sdk/openai-compatible" (live-proven via the clear_thinking base option), not the Anthropic contract the design asserts in five places; opencode emits no budget knob for that contract, so the shipped 32000-vs-16000 tier split has no demonstrated effect on the only provider measured
finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=Layer 2 replaces the whole thinking object where opencode deep-merges, destroying clear_thinking:false that opencode itself set for zhipu; the suite's preserve-unrelated case only covers a top-level sibling key
finding: id=R5 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=live-oracle/README.md states probe A2 proved the chat.params hook applied and probe A1 isolated Layer 1 by design, while all three probe logs it produced carry "failed to load plugin"; the shipped live-oracle directory contains a prose README and no raw measurement artifact
finding: id=R6 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=probe A1's 350-vs-0 confounds role system prompt with payload; the real within-role control is B-enabled-182 vs A1-disabled-0 at n=1, and the "~80 sessions never above default" line describes the variant NAME, not reasoning volume
finding: id=R7 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=a global plus project install registers two chat.params hooks each resolving its own sidecar, last writer wins, undeclared

verdict: fail
findings_blocking: 7
