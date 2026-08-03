# #927 — test authoring (RED on baseline)

**Artifact**: `scripts/test-opencode-edition.js` (worktree `.kw/worktrees/issue-927`, branch
`workflow/issue-927`). One file changed, `+608/−38` at the time of writing. No production file touched.

**Baseline**: `c39381748ad80cc09afbc42ac07ff4f65ff18012` (worktree HEAD, clean apart from the test file).
**Command**: `node scripts/test-opencode-edition.js` (the opencode half of
`npm run test:kaola-workflow:editions`).

```
before:  opencode-edition test passed (492 assertions).            exit 0
after:   opencode-edition test FAILED: 232 failure(s), 563 passed. exit 1
```

`node scripts/test-kimi-edition.js` is still green (507 assertions, exit 0) — the whole red is mine.
Full log: `kaola-workflow/issue-927/.cache/test-authoring-red-run.txt`.

Accounting: 23 runtime assertions deleted with their mechanism (11 source sites), 326 added.
232 of the 326 fail on baseline; the 94 that pass are named below with why.

---

## 1. What is asserted

### `A12-options` — Layer 1, the static config (165 red)

Five contract cases, each rendering `sync.renderOpencodeJson({ inheritModel })` and parsing it:
`zhipuai-coding-plan/glm-5.2` (anthropic contract — brand ≠ contract), `anthropic/claude-sonnet-4-5`,
`openai/gpt-5`, `google/gemini-2.5-pro`, `acme/unknown-model` (safe default).

Per case:

- **Payload per role.** `agent[role].options` deep-equals the contract's cell, **role list derived
  from `sync.topTierRoles()` / `sync.standardTierRoles()`** — never a hand-typed list, so a role whose
  canonical frontmatter tier moves cannot silently stay on the old tier. The **payloads are spelled
  literally** (anthropic `thinking` 32000/16000, openai `xhigh`/`high`, google `high`/`low`, default
  `high`/`medium`) rather than read back out of `CONTRACT_EFFORT_TABLE`: a fully-derived assertion
  reads the same table the generator reads and would stay green against a table that had itself gone
  wrong. Derived half and literal half are deliberately sourced differently.
- **Comparison is order-insensitive** (`stableJson`, recursive key sort) so a payload that differs only
  in key order is not reported as a defect.
- **Exact deep-equality, not "contains the knob"** — that is what forbids cross-contract leakage
  (an anthropic payload also carrying `reasoningEffort`). I removed a separate stray-key loop I had
  first written: it was fully subsumed and, worse, 70 of its assertions passed vacuously today.
- **Distinctness read off the emitted config**, not off my literals: an emitter that wrote one payload
  to both tiers fails here even though each per-role loop compares a role only against its own
  expectation.
- **Absence.** No `variant` key on any role; no `model` key on any role; no `variants` key **anywhere**
  in the config (recursive scan — a block that merely moved would still read as live configuration);
  no `variant` key anywhere.
- **Prose.** The rendered text must no longer contain `opencode applies them from this file` (the
  false mechanism claim) or `SWITCHING YOUR OPENCODE MODEL` (the staleness warning Layer 2 retires).

### `A12-options(subagent)` — the static half of the subagent criterion (1 red)

`build` (opencode's primary agent) is **not** in the emitted agent block, and two dispatch-only roles
(`code-reviewer` top, `tdd-guide` standard) carry different payloads on one inherited model.

The block carries an explicit comment about what a static suite can and cannot prove: it can prove the
tier rides on a mechanism with no `agent.model` gate and that nothing pins a model, but it **cannot**
prove a running subagent reasons harder — config resolution was green throughout this entire failure.
`tokens_reasoning` in `opencode.db` is the only oracle for that and is deliberately not simulated here.

### `A26-sidecar` — the generated tier sidecar (4 red)

Read off a **real hermetic `install-opencode.sh --global --yes`** (own `HOME`, own
`OPENCODE_CONFIG_DIR`), i.e. what ships, not what was authored:

- exists at `<config>/kaola-workflow/effort-tiers.json` and parses as JSON;
- `tiers` covers **exactly** the 14 canonical roles (`sync.listCanonAgents()`);
- its `top` set `===` `topTierRoles()` and its `second` set `===` `standardTierRoles()` — a hand-typed
  duplicate inside the generator fails here the moment the two diverge;
- every tier token indexes a real `CONTRACT_EFFORT_TABLE` rank (a third token would resolve to nothing
  at call time);
- `build` is absent; the three retired roles (`contractor`, `issue-scout`, `workflow-planner`) are
  absent.

### `A26-hook` — Layer 2, the `chat.params` hook (44 + 3 red)

The **shipped plugin** from that same global install is imported in a child
`node --input-type=module` harness (the pattern H1 already uses), its default export invoked, and
`chat.params` driven over 23 cases. `HOME` and `OPENCODE_CONFIG_DIR` are hermetic temp dirs so no
homedir fallback can reach the developer's real config.

- **The critical case**: the same tier resolves to a **different payload for two different providers**
  — asserted both as inequality and as two exact literals. This is the whole reason Layer 2 exists
  over Layer 1.
- Ten exact-payload assertions across `{anthropic, openai, google, default, zhipuai-coding-plan}` ×
  `{top, second}`, including GLM-via-z.ai landing on the **anthropic** contract, never `reasoningEffort`.
- Two dispatch-only roles on one provider and one inherited model → different payloads.
- An unrelated option already in `output.options` survives (by hook time it already holds opencode's
  merged provider/model/agent options, and opencode's own built-in hooks write there).
- **Cannot resolve a tier → untouched**: unknown agent, `build`, `input.agent` absent.
- **Cannot resolve a provider → untouched**: `input.provider` absent, and `provider` present without
  `id`. (Judgement call — see §4.)
- `input.agent` is passed as a plain **string** in every case. A hook reading `input.agent.name` or
  `input.agent.options` resolves nothing and every payload case goes red. That is the single easiest
  way to get this hook wrong and it is covered by construction.
- **Nothing throws**, on all 23 inputs, including `agent` as an object, an entirely empty `input`, and
  `output.options` absent.

### `A26-degraded` — absent and malformed sidecar (8 red)

Two more environments (plugin taken straight from the tracked template, hermetic `HOME` +
`OPENCODE_CONFIG_DIR`): no sidecar at all, and a sidecar containing non-JSON bytes. Both must load,
not throw for any case, and leave `output.options` untouched.

### `A27` — installer drift (7 red)

Uses the repo's existing installer-test convention (hermetic `HOME` + `--target`, real
`install-opencode.sh` spawned via `bash`) — same shape as the P1/G1/U1/I1/FA9 blocks. A drifted
user-owned `opencode.json` is planted (one live role, the three retired roles, twelve roles missing),
`KAOLA_OPENCODE_INHERIT_MODEL=openai/gpt-5` so the generator side is the full adaptive 14-role set:

- **exit 0** — a drifted config is a finding, not a refusal;
- the output **names every extra role** and **every missing role** (both directions, by name);
- the file is left **byte-identical** — detection is not permission to rewrite a user-owned file;
- the report **names an explicit opt-in flag**, and that flag actually adopts: every `--flag` in the
  drift output is tried on a fresh fixture until one regenerates the config, and the result must equal
  `renderOpencodeJson({inheritModel})` byte-for-byte.
  **The flag's spelling is not pinned.** A frozen name would be a mechanism claim that rots; what is
  required is the *result* — that the report is actionable and that the action works.
- **Negative control**: an install over a config the generator itself just wrote must report no drift.
  Without it, a check that fires on everything would look armed.

---

## 2. Deleted, with their mechanism

11 source sites / 23 runtime assertions, all in the old A12 block. Every one pinned a mechanism this
design removes; none was rewritten to keep passing.

| deleted | mechanism it pinned |
|---|---|
| `glm.provider[…].models[…].variants.max && .high` | the `provider.*.variants` block |
| `glmMax.thinking … 32000` / `glmMax.reasoningEffort === undefined` / `glmHigh.thinking … 16000` | those payload facts read **through** `variants.*` |
| `glm.agent[role].variant === 'max'` (×5 top roles) | `agent.<role>.variant` — unreachable for a role that pins no model |
| `glm.agent[role].variant === 'high'` (×9 standard roles) | same |
| `Object.keys(oai.provider.openai.models['gpt-5'].variants) === 'high/xhigh'` | the variants block |
| `oai.agent.planner.variant === 'xhigh' && oai.agent.implementer.variant === 'high'` | `agent.*.variant` |
| `unk.provider !== undefined && unk.agent !== undefined` | the `provider` half only; the `agent` half survives as coverage |
| `unk.provider.acme.models[…].variants.high && .medium` | the variants block |
| `unk.agent.planner.variant === 'high' && …implementer.variant === 'medium'` | `agent.*.variant` |

The **content** those assertions carried is not lost: the anthropic-contract payloads, the openai and
default splits, full role coverage, and "an unknown provider still gets a real split, not a de-tier"
are all re-asserted in `A12-options` against `agent.<role>.options` — the key that actually reaches
the model call. Deletion notes are left in place in the file explaining each.

---

## 3. New assertions that already PASS on baseline (and why that is correct)

94 of the 326. None of them is load-bearing evidence; each is a regression pin or a precondition.

| assertion | count | why it passes today |
|---|---|---|
| `contractForProvider(provider) === contract` | 5 | precondition, deliberately unchanged — asserted first so a payload mismatch can never be blamed on contract resolution |
| agent block covers exactly `topTierRoles() ∪ standardTierRoles()` | 5 | the current generator already emits all 14; this pins that the redesign must not drop any |
| **no `model` key on any role** | 70 | the adaptive path never pinned a model; an acceptance criterion, pinned as a regression guard |
| `A26-sidecar`: `build` absent / retired roles absent | 4 | vacuous while the sidecar is absent; armed the moment it exists |
| `A27`: drifted config left byte-identical; install exits 0 | 2 | today's `seed_config` already preserves — the *reporting* half is what is red |
| `A27-neg` negative control (×2) | 2 | correct: today there is no drift check to over-fire |
| harness/install plumbing (`--global` exits 0, plugin deployed, harness runs) | ~6 | environment, not subject |

I deleted a 70-assertion stray-key loop I had written first, precisely because it passed vacuously and
was fully subsumed by the exact deep-equality above.

---

## 4. Things in the design I believe are WRONG or unsettled

### 4.1 BLOCKING-ish: Layer 2 as specified does not actually remove the wrong-contract payload

The brief's justification for Layer 2 is that Layer 1 alone would get a wrong-contract payload
**sent** to the provider. But the design of record's own hook snippet is

```js
output.options = { ...(output.options || {}), ...payload };
```

and the measured merge order (premise report §C, byte-exact) puts `agent.options` **into**
`output.options` *before* the hook runs. So if Layer 1 baked the anthropic payload and the session has
since moved to an OpenAI model, the hook adds `reasoningEffort: 'xhigh'` and the stale
`thinking: {…}` **stays**. The call then goes out carrying both. That is exactly the exposure Layer 2
is claimed to close, still open.

I encoded this as a **result, not a method** (`A26-hook[stale-anthropic-on-openai]`,
`[stale-openai-on-anthropic]`, plus a paired assertion that clearing the other contract's knob may not
clear unrelated options): after the hook, the payload carries this call's contract knob and no other
contract's. A plain spread-merge satisfies neither. **If you disagree that this is forced, strike
these three assertions — but do it here, in conversation; the implementer must not edit them.**

### 4.2 `CONTRACT_EFFORT_TABLE`'s own `variant` field becomes dead — and the suite still pins it

The brief says the *config* must carry no `variant`. It says nothing about the table. Once
`renderAdaptiveConfig` stops reading `profile.top.variant`, that field has no reader left — which is
literally the "dead key that reads as configuration" class the brief names as the defect. But the
table is the ×4 byte-identical anchor, `mapTier()` returns `{variant, options}`, and the existing
`S1-contract[glm]` assertions (`glmProfile.top.variant === 'max' && .second.variant === 'high'`) and
`S1-contract[unknown]` (`top.variant !== second.variant`) still pin its presence.

I left them alone — a test is deleted *with* its mechanism, and the mechanism is still there today.
**Decision needed**: if the implementer is to drop `variant` from `CONTRACT_EFFORT_TABLE`, those
assertions must come back to me for deletion. They must not be edited by the implementer.

### 4.3 The `## Effort Variant Resolution` badge prose is a second false mechanism claim, out of scope

`sync-opencode-edition.js:262,269` renders into **every generated opencode agent**:
*"`mapTier(tier, provider)` resolves the variant: the reasoning tier → the TOP effort variant…"*.
After this change that is the same false-mechanism class as `:651`, sitting in a dispatch-time prompt
surface. The brief's prose list names only `:641`/`:650-656`, and the existing `S2` block asserts on
that badge section, so a rewrite there is not free. **Not tested, deliberately** — flagging it because
"one rule, one wording" makes it a real gap.

### 4.4 Sidecar location for a PROJECT install is unspecified — untested

I pinned only what the design of record states: `<OPENCODE_CONFIG_DIR>/kaola-workflow/effort-tiers.json`
(= `~/.config/opencode/kaola-workflow/effort-tiers.json`), verified through a real `--global` install.
A **project** install (`--target`) deploys the plugin to `<dest>/.opencode/plugins/` and nothing in the
brief or the design doc says whether a sidecar lands there. I did not invent one and there is **no
assertion covering it**. Decide: does the plugin always resolve through the config dir, or does a
project install need its own sidecar?

### 4.5 `--no-scripts` and the sidecar

My `A26` install deliberately does **not** pass `--no-scripts`, so I do not constrain whether the
sidecar write lives inside `install_support_scripts`. If it does, every `--no-scripts` install ships a
plugin with no sidecar and silently un-tiers. Not asserted, because the acceptance surface does not
say — but it is a live hazard.

### 4.6 Drift detection when no inherited model is detectable

With `--adapt` and nothing to detect, `renderOpencodeJson` falls through to the **neutral** template,
which emits no `agent` block at all — so "the role set the generator emits" is empty and every role in
the user's config would read as "extra". My `A27` sets `KAOLA_OPENCODE_INHERIT_MODEL` so the
comparison is meaningful. The no-model case is **untested** and unspecified; reporting "4 extra roles,
0 missing" there would be a false alarm.

### 4.7 The one judgement call I made inside the suite

`no-provider` / `provider-without-id` → `output.options` **untouched**. The brief says "untouched when
it cannot resolve a **tier**"; here the tier resolves but the contract does not. I chose untouched on
two grounds: `effortForProvider('') === null` is the existing single-source rule in the ×4 anchor
(kept explicitly as backward-compat), and guessing the `default` contract's `reasoningEffort` for what
might be an Anthropic-contract session sends a wrong-contract knob — §4.1's exposure again. Overrule
it here if you prefer a different answer.

---

## 5. What I could not test

- **The acceptance criterion itself.** "Two subagents on the same inherited model with nothing pinned
  measurably run at different effort", oracle `tokens_reasoning` in `opencode.db`. No static suite can
  produce that; the brief is explicit that a config-resolution assertion is not sufficient — it was
  green throughout the entire failure. The suite proves the *static* half (§`A12-options(subagent)`,
  `A26-hook` sub-pair) and says so in a comment. The live measurement is the orchestrator's.
- **Whether a throwing `chat.params` hook kills the process or only the request** (premise report §G,
  CANNOT-DETERMINE). I encoded the conservative reading the brief mandates: must not throw, for all 23
  inputs and both degraded-sidecar states.
- **Mutation proof.** Not mine to run, but the assertions are shaped for it: deleting the emitted
  `options` payload turns 70 `A12-options` assertions red, and deleting the `chat.params` hook turns
  47 `A26-hook` assertions red — arming and coverage separable, per contract and per role.

---

## 6. Red signature (representative — full log in `test-authoring-red-run.txt`)

```
RED: A12-options[glm(zhipuai-coding-plan)][planner] — top-tier role carries the anthropic contract
     TOP options payload {"thinking":{"type":"enabled","budgetTokens":32000}} — got undefined
RED: A12-options[glm(zhipuai-coding-plan)][planner] — NO `variant` key survives on the role
RED: A12-options[glm(zhipuai-coding-plan)]        — NO `provider.*.variants` block survives anywhere
RED: A12-options[glm(zhipuai-coding-plan)]        — the "opencode applies them from this file"
     mechanism claim is gone — it was false when written
RED: A12-options(subagent)                        — two dispatch-only roles (code-reviewer top,
     tdd-guide standard) carry DIFFERENT payloads on the same inherited model
RED: A26-sidecar — a global install writes the generated tier sidecar at
     <config>/kaola-workflow/effort-tiers.json
RED: A26-sidecar — the tier map covers EXACTLY the 14 canonical roles — got []
RED: A26-hook    — the plugin registers a `chat.params` hook
RED: A26-hook    — the SAME tier resolves to a DIFFERENT payload for two different providers
     (anthropic=undefined, openai=undefined)
RED: A26-hook[stale-anthropic-on-openai] — a thinking budget left over from the previously inherited
     model must NOT still be sent to an OpenAI-contract call
RED: A26-degraded[malformed][degraded-resolvable] — the hook must NOT throw with a malformed sidecar
RED: A27 — the drift report names the EXTRA role "contractor" present in the existing opencode.json
RED: A27 — the drift report names the MISSING role "investigator" the generator emits
RED: A27 — the drift report names an explicit opt-in flag that regenerates the config.
     Flags found in output: []

opencode-edition test FAILED: 232 failure(s), 563 passed.
baseline: c39381748ad80cc09afbc42ac07ff4f65ff18012
```
