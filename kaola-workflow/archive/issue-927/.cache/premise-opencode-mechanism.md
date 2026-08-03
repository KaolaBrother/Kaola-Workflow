# Premise check: opencode variant/model/options mechanism (issue #927)

## Install located

- `which opencode` / `command -v opencode`: `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/opencode`
- `opencode --version`: **1.18.11** (matches issue's "~1.18.11" claim)
- `npm ls -g --depth=0`: `opencode-ai@1.18.11`
- Resolved binary: `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/lib/node_modules/opencode-ai/bin/opencode.exe`
  → symlinked to the platform package `opencode-ai/node_modules/opencode-darwin-arm64/bin/opencode`
  (138,608,738 bytes, `Mach-O 64-bit executable arm64`, confirmed via `file`)
- `~/.opencode` does not exist. `~/.config/opencode/node_modules` exists but contains **only**
  `@opencode-ai/plugin@1.17.7` (the plugin SDK type/helper package used by user plugin files) plus
  its own transitive deps (`effect`, `zod`, `yaml`, `toml`, `uuid`, `msgpackr`, etc.) — this is NOT
  the opencode server implementation, just what a locally-authored plugin can `import`.
- **No separate readable `.js` bundle exists anywhere on disk for the server itself.** opencode 1.18.11
  ships as a single Bun `--compile` standalone Mach-O executable. There is no plain-text sibling bundle.

### How the source was actually read

Bun's `--compile` output embeds the transpiled (but **not minified-away, not bytecode-only**) JS
source of every bundled chunk verbatim inside a Mach-O segment named `__BUN` (confirmed via
`otool -l`: `fileoff 62734336`, `filesize 74596352`). I extracted that segment with `dd`
(`dd if=<binary> of=bun_segment.bin bs=1 skip=62734336 count=74596352`, scratch file only, no
repo/tracked-file writes) and confirmed it is readable minified-but-textual JS: it begins with
`// @bun\nimport{...}from"/$bunfs/root/chunk-0585s4am.js"` and contains ~328 concatenated virtual
chunk files (`import{X as y}from"/$bunfs/root/chunk-<id>.js"` boundaries), interleaved with some
genuinely binary regions (icon/font/db assets). All JS-source regions are grep/string-searchable.
This is the **actual shipped code being executed** by this box's `opencode` binary — not
documentation, not a changelog, not a different version's source.

All quotes below are byte-for-byte from that extracted segment (scratch path:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e5bef84f-998c-4766-a21b-c0b1d082b10a/scratchpad/bun_segment.bin`,
kept in the session scratchpad only — not written into the repo). Offsets given are byte offsets
into that extracted file.

---

## A. Task tool suppresses `variant` when the agent pins a model — CONFIRMED (byte-exact)

Function `TaskTool.execute` (offset ~2994456), inside `TaskTool.runTask`:

```
let A=s.fn("TaskTool.runTask")(function*(){
  let G=yield*J.resolvePromptParts(m.prompt);
  return (yield*J.prompt({
    messageID:vo.ascending(),
    sessionID:O.id,
    model:{modelID:R.modelID,providerID:R.providerID},
    variant:b.model?void 0:q,
    agent:b.name,
    parts:G
  })).parts.findLast((Z)=>Z.type==="text")?.text??""
})
```

where earlier in the same function: `let q=U.info.variant, R=b.model??{modelID:U.info.modelID,providerID:U.info.providerID}`
(`b` = the resolved subagent config object from `o.get(m.subagent_type)`; `U` = the **parent** session's
invoking assistant message).

The literal construct is `variant:b.model?void 0:q` — this is a **character-for-character match** to
the issue's quoted `variant: b.model ? void 0 : q` (only whitespace differs, as expected of minified
output). CONFIRMED verbatim.

**One nuance the issue's quote alone doesn't show**: `q` is not "the subagent's own configured
variant" — it is `U.info.variant`, the **parent session's own message variant**. So when the subagent
has no pinned model, this line does not merely "fail to suppress" the subagent's variant — it never
even references the subagent's variant at this call site; it forwards the **parent's** variant
instead. (Whether the subagent's own variant configuration ever gets consulted downstream is the
subject of claim B.)

## B. Session prompt path gates the agent's own `variant` lookup on `agent.model` matching — CONFIRMED (byte-exact), and it is documented, intentional behavior, not a bug

Function `SessionPrompt.createUserMessage` (offset ~2905364):

```
let _=t.model??U.model??(yield*E(t.sessionID)),
    Q=U.model&&_.providerID===U.model.providerID&&_.modelID===U.model.modelID,
    C=!t.variant&&U.variant&&Q?yield*i.getModel(_.providerID,_.modelID).pipe(s.catchIf(Je.ModelNotFoundError.isInstance,()=>s.succeed(void 0))):void 0,
    X=t.variant??(U.variant&&C?.variants?.[U.variant]?U.variant:void 0),
```

(`U` = the resolved agent record, i.e. `l.get(V)` where `V=t.agent`.)

`Q=U.model&&_.providerID===U.model.providerID&&_.modelID===U.model.modelID` is a **character-for-character
match** to the issue's quoted `Q = U.model && <model matches>`. CONFIRMED verbatim.

Trace of the gate: `C` (the model definition object that carries the `.variants` registry) is only
fetched when `!t.variant && U.variant && Q` — i.e. only when no explicit variant was passed on this
turn, the agent has its own `.variant` set, **and** `Q` is true (which itself requires `U.model` to be
set and to match the already-resolved model `_`). If the agent has no `model` field, `U.model` is
`undefined`, so `Q` is falsy, so `C` stays `void 0`, so `X` (the final resolved variant) falls through
to `void 0` regardless of what `U.variant` says. Combined with A: a subagent with no pinned model gets
(a) the parent's variant forwarded by TaskTool, and (b) even if that's empty, its own `.variant` field
is never looked up here because the `Q` gate fails. **Net effect matches the issue's premise: an
agent's own `variant` is unreachable unless that agent also pins a `model`.**

**Important qualifier found only by reading the schema (see F below):** the config schema's own
annotation on the `variant` field reads: *"Default model variant for this agent (applies only when
using the agent's configured model)."* This is not an accidental side effect of the code above — it
is the **documented, intended** contract. The redesign in #927 should be framed as working around a
documented constraint, not patching an unnoted bug. This does not change any of the confirmed mechanics
above, but it changes how the issue should characterize the problem.

## C. Load-bearing claim: `agent.options` merges unconditionally, with no gate on `agent.model` — CONFIRMED

Function `LLMRequestPrep.prepare` (offset ~2838607):

```
let h=!e.small&&e.model.variants&&e.user.model.variant?e.model.variants[e.user.model.variant]:{},
    r=e.small?be.smallOptions(e.model):be.options({model:e.model,sessionID:e.sessionID,providerOptions:e.provider.options}),
    d=_s(_s(_s(r,e.model.options),e.agent.options),h);
...
let k=yield*e.plugin.trigger("chat.params",
  {sessionID:e.sessionID,agent:e.agent.name,model:e.model,provider:e.provider,message:e.user},
  {temperature:e.model.capabilities.temperature?e.agent.temperature??be.temperature(e.model):void 0,
   topP:e.agent.topP??be.topP(e.model),
   topK:be.topK(e.model),
   maxOutputTokens:be.maxOutputTokens(e.model,e.flags.outputTokenMax),
   options:d});
```

where `_s=(e,o)=>Ci(e,o??{})` — a two-arg merge helper (`Ci` is a deep-merge; `o` is folded into `e`,
`??{}` makes the fold a no-op when `o` is undefined/missing).

**(i) Exact merge order**: `d = merge(merge(merge(r, e.model.options), e.agent.options), h)`, i.e.
**provider/base options → model.options → agent.options → variant-slice options (`h`)**. `r` itself
comes from `be.options({model, sessionID, providerOptions:e.provider.options})`. This is the same
4-stage shape the issue describes.

**(ii) Does anything in that chain consult `agent.model`?** No. `e.agent.options` is folded in via the
same unconditional `_s(...)` call as `e.model.options` — there is no `e.agent.model` reference, no
conditional, no gate anywhere in this function. (The **only** model-gated construct in the whole
mechanism is the `variant` lookup in claim B, which lives in a completely different function
upstream, and — critically — that upstream gate governs `variant`, not `options`; `agent.options` was
never gated in either place.) `e.model` itself is the model **already resolved** by the time this
function runs (resolved upstream, by SessionPrompt/TaskTool) — its presence here doesn't reintroduce a
gate on whether the agent had pinned a model in its own config.

**(iii) Exact property name**: `e.agent.options` — i.e. the resolved in-memory agent record exposes a
plain `.options` property, which is a direct pass-through of the config's `agent.<name>.options` field
(see F for the schema proof this field exists and is typed `Record<string, Any>`).

## D. `chat.params` plugin hook — CONFIRMED, with corrected property names

**Trigger site**: same `LLMRequestPrep.prepare` call above. It is definitely triggered on every
non-small chat request (there is a parallel, differently-gated `be.smallOptions` path for `small`
requests, but `chat.params` still fires either way since the trigger call is unconditional).

**`input` (2nd arg to `trigger`) — actual shape**:
```
{ sessionID: e.sessionID, agent: e.agent.name, model: e.model, provider: e.provider, message: e.user }
```
- `input.agent` is a **string** — `e.agent.name` — **not** the resolved agent object. If the issue's
  proposed hook reads `input.agent` expecting anything beyond a name string (e.g. `input.agent.model`
  or `input.agent.options`), that would be **wrong**; if it only compares `input.agent === "role-name"`
  for gating, that's fine.
- `input.model` **is** the fully resolved model descriptor (has `.providerID`, `.api`, `.variants`,
  `.options`, `.capabilities`, confirmed by its other uses in the same function).
- `input.provider` **is** the resolved provider object, and it does carry `.id` — confirmed elsewhere
  in the same chunk: `let o=e.provider.id==="openai"&&e.auth?.type==="oauth"`. So `input.provider?.id`,
  as the issue assumes, **is valid**.

**`output` (3rd arg to `trigger`) — actual shape**:
```
{ temperature, topP, topK, maxOutputTokens, options: d }
```
matches the issue's assumed field set exactly (`temperature`, `topP`, `topK`, `maxOutputTokens`,
`options`).

**Are mutations to `output.options` consumed downstream, or discarded?** Consumed — traced concretely.
`Plugin.trigger` (see G) mutates the passed-in object in place and returns it; the call site captures
that return as `k` and returns it from `LLMRequestPrep.prepare` as `params:k`. Downstream, in the LLM
run path (same bundle, ~offset 2843221), the caller does:
```
temperature:a.params.temperature, topP:a.params.topP, topK:a.params.topK,
maxOutputTokens:a.params.maxOutputTokens, providerOptions:a.params.options, ...
```
directly feeding the native-runtime `rl.stream({...})` call (and the parallel ai-sdk fallback path
uses the same `a.params.*` fields). **CONFIRMED: `output.options` set by a `chat.params` plugin hook
is not discarded — it becomes `providerOptions` on the actual model API call.**

## E. TaskTool model-inheritance fallback — CONFIRMED (byte-exact)

Same `TaskTool.execute` block as A:
```
let q=U.info.variant, R=b.model??{modelID:U.info.modelID,providerID:U.info.providerID}, N={parentSessionId:l.sessionID,sessionId:O.id,model:R,...};
```
`R=b.model??{modelID:U.info.modelID,providerID:U.info.providerID}` is a **character-for-character
match** to the issue's quoted `R = b.model ?? {parent modelID, providerID}` (`U` here is the parent
session's own assistant message record, so `U.info.modelID`/`U.info.providerID` are literally the
parent session's currently-active model/provider). CONFIRMED: a subagent with no pinned model inherits
the parent session's model and provider exactly as claimed.

## F. Config schema: is `agent.<name>.options` an accepted key? — CONFIRMED, unambiguously, from the actual schema definition (not just docs)

Found the real schema (offset ~9382664), for the type identified as `"AgentConfig"`:

```
var a5=D.StructWithRest(D.Struct({
  model:D.optional(D.String),
  variant:D.optional(D.String).annotate({description:"Default model variant for this agent (applies only when using the agent's configured model)."}),
  temperature:D.optional(D.Finite),
  top_p:D.optional(D.Finite),
  prompt:D.optional(D.String),
  tools:D.optional(D.Record(D.String,D.Boolean)).annotate({description:"@deprecated Use 'permission' field instead"}),
  disable:D.optional(D.Boolean),
  description:D.optional(D.String).annotate({description:"Description of when to use the agent"}),
  mode:D.optional(D.Literals(["subagent","primary","all"])),
  hidden:D.optional(D.Boolean).annotate({description:"..."}),
  options:D.optional(D.Record(D.String,D.Any)),
  color:D.optional(mH).annotate({description:"..."}),
  steps:D.optional(j_).annotate({description:"..."}),
  maxSteps:D.optional(j_).annotate({description:"@deprecated Use 'steps' field instead."}),
  permission:D.optional(UY.Info)
}),[D.Record(D.String,D.Any)]),
dH=new Set(["name","model","variant","prompt","description","temperature","top_p","mode","hidden","color","steps","maxSteps","options","permission","disable","tools"]),
uH=(_)=>{
  let Y={..._.options};
  for(let[U,X] of Object.entries(_)) if(!dH.has(U)) Y[U]=X;
  ...
  return {..._, options:Y, permission:$, ...}
},
cH=a5.pipe(D.decodeTo(a5,{decode:rY.transform(uH), encode:rY.passthrough({strict:!1})})).annotate({identifier:"AgentConfig"});
```

(`D` here is the "effect" package's Schema module, matching the `effect` dependency observed in
`~/.config/opencode/node_modules`; this is Effect-TS `Schema.Struct`/`Schema.optional`/etc., not Zod
directly, though the semantics are the same for this purpose.)

**`options:D.optional(D.Record(D.String,D.Any))` is an explicitly declared, typed schema field** — not
an accident, not merely tolerated. Its type is an arbitrary string-keyed record of anything. Beyond
that, the schema is `StructWithRest(..., [D.Record(D.String,D.Any)])` — i.e. genuinely **open**: any
key not in the known set is still schema-valid (typed as `Record<string, Any>` catch-all), and the
`uH` decode transform explicitly folds every field **not** in `dH` (the known-keys set) into
`options` itself. This is also independently corroborated by an embedded documentation/skill text
found nearby (offset ~8698501, part of what looks like a bundled `config`-schema reference doc):
*"Allowed top-level frontmatter fields: `name, model, variant, description, mode, hidden, color, steps,
options, permission, disable, temperature, top_p`. Any unknown field is silently routed into
`options`."* — matching the code's `dH` set almost exactly (docs omit `prompt`/`maxSteps`/`tools` for
separate documented reasons — `prompt` is the file body, not frontmatter; `tools`/`maxSteps` are
marked `@deprecated`).

Also found supporting evidence in the OpenAPI-schema post-processing code (offset ~2591248):
`if(i.AgentConfig) i.AgentConfig.additionalProperties={}` — the SDK's public OpenAPI schema for
`AgentConfig` is deliberately kept open (`additionalProperties` set to the always-true `{}` schema),
consistent with the struct-with-rest design above.

**Verdict: `agent.<role>.options` does NOT fail schema validation. It is a first-class, explicitly
typed field.** The premise "if `agent.<role>.options` fails schema validation the whole design is
dead" is refuted — it does not fail.

## G. Plugin API shape — CONFIRMED for load/signature; partially CONFIRMED / CANNOT-DETERMINE for throw-safety

**Loading** (offset ~4377063, functions `Jy`/`Xy`/`Yy`):
```
function Yy($){ if(nV($))return $; if(!$||typeof $!=="object"||!("server"in $))return; if(!nV($.server))return; return $.server }
function Xy($){ let Z=new Set,Q=[]; for(let Y of Object.values($)){ if(Z.has(Y))continue; Z.add(Y);
  let J=Yy(Y); if(!J)throw TypeError("Plugin export is not a function"); Q.push(J) } return Q }
async function Jy($,Z,Q){ let Y=tV($.mod,$.spec,"server","detect"); if(Y){...Q.push(await Y.server(Z,$.options));return}
  for(let J of Xy($.mod)) Q.push(await J(Z,$.options)) }
```
This iterates `Object.values(mod)` — i.e. **default and every named export** are candidates
(`nV`=`typeof x==="function"` check) — matching the embedded doc's "exports `default` (or any named
export)". Each qualifying export is called as `fn(PluginInput, options)` and the awaited return value
(the `Hooks` object) is collected. A non-function export throws `TypeError("Plugin export is not a
function")` **at load time**.

**Hook signature at dispatch time** — `Plugin.trigger` (offset ~4379655):
```
J=v.fn("Plugin.trigger")(function*(W,K,w){
  if(!W)return w;
  let B=yield*p0.get(Y);
  for(let H of B.hooks){ let M=H[W]; if(!M)continue; yield*v.promise(async()=>M(K,w)) }
  return w
})
```
`W`=hook name, `K`=input, `w`=output. Each registered plugin's hook is called as `M(K,w)` — i.e.
`async (input, output) => {...}` — matching the issue's assumption verbatim. It mutates `w` in place
and `trigger` returns `w`, which the caller then re-uses (confirmed already in D). Confirmed also
against the concrete built-in `chat.params` hook implementations found in the bundle, e.g.
`"chat.params":async(G,W)=>{if(G.model.providerID!=="openai")return;W.maxOutputTokens=void 0}` and
`"chat.params":async(Y,J)=>{if(!Y.model.providerID.includes("github-copilot"))return; ...J.options.toolStreaming=!1}`
— both take `(input, output)` and mutate `output` fields directly, no return value used.

**Throwing hook — plugin LOAD/lifecycle errors are caught; hook INVOCATION errors are not, inside
`Plugin.trigger` itself.** Contrast the two code paths in the same module:
- Loading a plugin module: `yield*v.tryPromise({try:()=>Jy(N,F,K),catch:(V)=>{return y1(V)}}).pipe(v.tapError(...that logs "failed to load plugin"...), v.catch(()=>{return v.void}))` — explicit `try`/`catch`, logged, swallowed.
- Calling `.config?.()` once at init: same `v.tryPromise({try,catch:y1})` pattern, logged, `v.ignore`d.
- Calling `.dispose?.()` at teardown: same pattern.
- **Calling an actual hook during a request** (`Plugin.trigger`'s `yield*v.promise(async()=>M(K,w))`):
  **no `catch`, no `tryPromise`, no wrapping at all.** This is a distinct combinator (`v.promise`, not
  `v.tryPromise`) used nowhere else in this file with error handling — every other promise-returning
  call site in the same module that the authors wanted to make failure-tolerant uses `tryPromise` with
  an explicit `catch`. That asymmetry is itself evidence of intent: hook invocation was not written to
  be caught here.

  `v` resolves (via the chunk's import header) to `oM` from `chunk-datjqaqc.js`, consistent in every
  other observed idiom in this codebase (`s.fn`, `s.gen`, `yield*`, `s.orDie`, `s.fail`, `s.die`) with
  being the Effect-TS `Effect` module. Effect's documented semantics for `Effect.promise` (as opposed
  to `Effect.tryPromise`) are that a rejecting/throwing promise becomes an **untyped defect**, not a
  typed, catchable failure — unless something further up the fiber tree explicitly catches
  causes/defects (I found `catchCause` used 54 times and `catchTag` 75 times elsewhere in the bundle,
  and `toWebHandler` used 6 times, consistent with an HTTP-boundary layer that could convert
  request-scoped defects into an error response without crashing the whole process — but I could not
  isolate and confirm the *specific* handler wrapping the session/chat pipeline within the time
  available). **CANNOT-DETERMINE conclusively whether a throwing `chat.params` hook crashes the whole
  opencode server process versus fails only the one chat request/session** — what I can state with
  confidence is that `Plugin.trigger` itself does nothing to catch it, in clear contrast to how the
  same file handles plugin load/lifecycle failures.

---

## Compact verdict table

| # | Claim | Verdict |
|---|---|---|
| A | `variant:b.model?void 0:q` in TaskTool.execute | **CONFIRMED** (byte-exact) |
| B | `Q=U.model&&...` gates the agent's own variant lookup in SessionPrompt | **CONFIRMED** (byte-exact) — but this is documented, intended behavior (schema annotation), not an unnoted bug |
| C | `agent.options` merges unconditionally, no `agent.model` gate anywhere in the chain | **CONFIRMED** — merge order provider→model→agent→variant-slice; property is `e.agent.options` |
| D | `chat.params` triggered; `input`/`output` shapes; mutation is consumed downstream | **CONFIRMED**, with correction: `input.agent` is a **string** (agent name), not an object — `input.provider?.id` is valid as assumed |
| E | `R=b.model??{parent modelID, providerID}` | **CONFIRMED** (byte-exact) |
| F | `agent.<name>.options` is schema-accepted | **CONFIRMED** from the actual schema literal — explicitly typed `Record<string,Any>`, struct-with-rest is open, unknown keys route into `options` |
| G | Plugin loading/export shape; hook signature `(input,output)`; throw-safety | **CONFIRMED** for loading and hook signature; **CANNOT-DETERMINE** whether a throwing hook takes down the whole process or just the request — confirmed only that `Plugin.trigger` itself has no catch around hook invocation (unlike load/lifecycle hooks in the same file) |

## What would refute these findings

- A newer/older installed `opencode-ai` version with different minified variable names landing on this
  box (version was directly checked: 1.18.11, matches the issue's stated version).
- The extracted `__BUN` segment not actually being what `bin/opencode.exe` executes (ruled out: offsets
  were taken directly from `otool -l`'s reported `__BUN` segment `fileoff`/`filesize` on the exact
  binary resolved by `which opencode`).
- `v.promise` resolving to something other than Effect's `Effect.promise` (plausible but not fully
  proven — the import-alias trace (`v` ⇐ `oM` from `chunk-datjqaqc.js`) was not followed all the way to
  a definition literal within the time available; this is the one open item, called out above as
  CANNOT-DETERMINE rather than asserted).
