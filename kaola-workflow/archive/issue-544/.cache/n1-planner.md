evidence-binding: n1-planner 97355f59beab

# Design Spec — Issue #544: Generalize opencode effort-tier mapping across provider contracts

**Status:** DESIGN (frozen for n2 implementation). **Node:** n1-planner. **Worktree:** `.kw/worktrees/issue-544/`.

## 0. Root-cause summary (what is actually broken)

Three independent defects, all centered in `kaola-workflow-adaptive-schema.js` lines 92–132:

1. **Name-keyed, not contract-keyed.** `PROVIDER_EFFORT_TABLE` has a dedicated `'zhipuai-coding-plan'` entry (lines 105–108) that emits `reasoningEffort: max/high`. But GLM-5.2 via z.ai is served under the **Anthropic API contract**, whose effort knob is `thinking.budgetTokens`, not `reasoningEffort`. The table keys on brand name, not on the API contract the provider actually speaks.
2. **Unknown → null → de-tier.** `effortForProvider()` returns `null` for any unrecognized provider id (line 121). `mapTier()` then returns `null` (line 130) → `dispatchEffortOpencode()` returns `role_default` → both tiers collapse to identical effort.
3. **Config pinned to seeded model id.** `renderAdaptiveConfig()` (sync-opencode-edition.js lines 401–411) emits `provider.<seededProviderId>.models.<seededModelId>.variants.*`. Switch the opencode model without re-running `--adapt` and the `agent.<role>.variant` references (e.g. `"max"`) no longer resolve under the new model → silent de-tier on the config side.

The runtime **dispatch** path (`dispatchEffortOpencode` → `resolveOpencodeProvider` → `KAOLA_OPENCODE_INHERIT_MODEL`) already re-resolves the provider at runtime (#537 Surface 2), so the dispatch *envelope* is already resilient. The gaps are (1) the **data table** (contract-keying + safe default) and (2) the **generated config + docs** (resilience guidance).

---

## 1. The contract-keyed resolver

### 1.1 Design principle

The effort **knob** is determined by the provider's **API contract**, not its brand name. Four contracts:

| Contract | Knob | Options shape |
|---|---|---|
| **anthropic** | `thinking` budget | `{ thinking: { type: 'enabled', budgetTokens: <N> } }` |
| **openai** | `reasoningEffort` | `{ reasoningEffort: 'xhigh' \| 'high' \| 'medium' \| 'low' }` |
| **google** | `reasoningEffort` (low/high only) | `{ reasoningEffort: 'high' \| 'low' }` |
| **default** (unknown) | `reasoningEffort` (portable) | `{ reasoningEffort: 'high' \| 'medium' }` |

**GLM-5.2 via z.ai → Anthropic contract → `thinking` budget** (the core fix for requirement #2).

### 1.2 New data: `CONTRACT_EFFORT_TABLE` (replaces `PROVIDER_EFFORT_TABLE`)

In `kaola-workflow-adaptive-schema.js`, **replace** the existing `PROVIDER_EFFORT_TABLE` (lines 92–109) with a contract-keyed table. Exact shape:

```js
const CONTRACT_EFFORT_TABLE = Object.freeze({
  anthropic: Object.freeze({
    top:    { variant: 'max',  options: { thinking: { type: 'enabled', budgetTokens: 32000 } } },
    second: { variant: 'high', options: { thinking: { type: 'enabled', budgetTokens: 16000 } } },
  }),
  openai: Object.freeze({
    top:    { variant: 'xhigh', options: { reasoningEffort: 'xhigh' } },
    second: { variant: 'high',  options: { reasoningEffort: 'high' } },
  }),
  google: Object.freeze({
    top:    { variant: 'high', options: { reasoningEffort: 'high' } },
    second: { variant: 'low',  options: { reasoningEffort: 'low' } },
  }),
  default: Object.freeze({
    top:    { variant: 'high',   options: { reasoningEffort: 'high' } },
    second: { variant: 'medium', options: { reasoningEffort: 'medium' } },
  }),
});
```

**Variant-name preservation proof (load-bearing invariant):**
- Anthropic contract (incl. GLM-via-z.ai): `max` (top) / `high` (second) — **identical** to the old `zhipuai-coding-plan` and `anthropic` entries. Only the OPTIONS payload flips (`reasoningEffort` → `thinking`). ✓
- OpenAI: `xhigh` / `high` — unchanged. ✓
- Google: `high` / `low` — unchanged. ✓
- Default: `high` / `medium` — new (no prior default existed; was `null`).

This means `test-adaptive-node.js` Cases 4/5/6/7/9 (which assert variant `max` for zhipu and `high` for openai-second) stay GREEN unchanged — the variant names didn't change, only the options shape did, and those tests assert variant names only.

### 1.3 New helper: `contractForProvider(providerId)`

```js
function contractForProvider(providerId) {
  const lo = String(providerId || '').toLowerCase();
  if (/zhipu|^zai|z-?ai|glm/.test(lo)) return 'anthropic';   // GLM-via-z.ai → Anthropic contract
  if (/anthropic|claude/.test(lo)) return 'anthropic';
  if (/openai|gpt|codex/.test(lo)) return 'openai';
  if (/google|gemini/.test(lo)) return 'google';
  return 'default';
}
```

**Critical ordering note:** the `zhipu|^zai|z-?ai|glm` test runs FIRST (before the generic `anthropic|claude` test). GLM provider ids must resolve to the Anthropic contract. The regex order mirrors the old `effortForProvider` alias order (lines 117–120) so no existing alias regresses.

### 1.4 Rewritten `effortForProvider(providerId)` — falsy → null, unknown → default

```js
function effortForProvider(providerId) {
  const id = String(providerId || '');
  if (!id) return null;                                       // no provider → null (backward-compat)
  return CONTRACT_EFFORT_TABLE[contractForProvider(id)];      // unknown → 'default' (never null)
}
```

**The falsy-guard is the key backward-compat bridge.** It preserves Cases 1–3 and Case 8 in `test-adaptive-node.js` (lines 7236–7239, 7270–7273): when no provider is available, `effortForProvider(null)` → `null` → `mapTier` → `null` → `dispatchEffortOpencode` → `role_default`. The dispatch path for claude/codex (which never set an opencode provider) stays behavior-inert. Only a REAL unrecognized provider id (e.g. `'acme-corp'`) hits the default contract.

### 1.5 `mapTier(tier, providerId)` — unchanged signature, behavior shifts

`mapTier` (lines 126–132) needs **no signature change**. Its body stays identical — it calls `effortForProvider(providerId)` which now returns the default profile instead of null for unknown providers. The only observable change: `mapTier('opus', 'acme-corp')` now returns `{variant:'high', options:{reasoningEffort:'high'}}` instead of `null`. This is the desired de-tier fix.

```js
function mapTier(tier, providerId) {
  const rank = TIER_RANK[String(tier || '').toLowerCase()];
  if (!rank) return null;
  const profile = effortForProvider(providerId);
  if (!profile) return null;
  return profile[rank];
}
```

### 1.6 `dispatchEffortOpencode` / `resolveOpencodeProvider` — NO changes

These (lines 145–168) are already contract-correct: they resolve the provider id from `KAOLA_OPENCODE_INHERIT_MODEL` and delegate to `mapTier`. The contract-keying happens transparently inside `effortForProvider`. No edits needed. Cases 6/9 (variant `max` for zhipu) stay green because `contractForProvider('zhipuai-coding-plan')` → `'anthropic'` → `CONTRACT_EFFORT_TABLE.anthropic.top.variant` = `'max'`.

### 1.7 Module exports — update the export list

In the `module.exports` block (lines 693–763):
- **Remove** `PROVIDER_EFFORT_TABLE` (replaced by `CONTRACT_EFFORT_TABLE`).
- **Add** `CONTRACT_EFFORT_TABLE`, `contractForProvider`.
- Keep `effortForProvider`, `mapTier`, `dispatchEffortOpencode`, `TIER_RANK` exported.

> **n2 note:** grep for `PROVIDER_EFFORT_TABLE` across the entire repo before removing the export. The only consumers are `kaola-workflow-adaptive-schema.js` itself, `sync-opencode-edition.js` (calls `schema.effortForProvider`, NOT the table directly — line 374), and `test-opencode-edition.js` (references `PROVIDER_EFFORT_TABLE` only in a comment, line 205). The comment must be updated to `CONTRACT_EFFORT_TABLE`.

---

## 2. The resilience mechanism — documented re-sync (option b), made prominent

### 2.1 Design call + justification

**Decision: (b) documented re-sync, made prominent in the generated config comment + docs + install script, with the runtime dispatch path as the never-de-tiers safety net.**

Rejected alternatives:
- **(a) re-resolve at runtime:** opencode applies `agent.<role>.variant` by reading `opencode.json`'s `provider.<id>.models.<model>.variants.*` — there is **no per-call variant override** (sync-opencode-edition.js line 128–129 and docs/opencode-edition.md line 173). `dispatchEffortOpencode` emits `opencode_variant` in the dispatch envelope, but that is a **recording of intent** (for the ledger), not a runtime override opencode honors. Runtime re-resolve cannot fix the config-side gap.
- **(c) model-agnostic variant scheme:** opencode's variant schema is **model-scoped** (`provider.<id>.models.<modelId>.variants.*` — `renderAdaptiveConfig` lines 401–411). No model-agnostic namespace exists. A variant defined under `glm-5.2` does not apply when the active model is `claude-sonnet-4-5`. Not expressible.

**Why (b) satisfies "does NOT silently de-tier":**
1. The **runtime dispatch path** re-resolves the provider on every dispatch. The dispatch envelope always carries the correct variant, sourced from `planner_model` (not `role_default`), regardless of the seeded config. Never-de-tiers for the dispatch surface.
2. The **config-side** variant definitions are pinned to the seeded model id (unavoidable given opencode's model-scoped schema). The failure mode is converted from **silent** to **documented**: the generated `opencode.json` carries a prominent header comment stating the seeded model and the exact re-sync command; the docs carry a "Switching models" subsection; the install script echoes the guidance.

### 2.2 Changes to `renderAdaptiveConfig()` (sync-opencode-edition.js lines 379–421)

**Structural change: NONE** — the JSON shape stays `provider.<id>.models.<model>.variants.*` + `agent.<role>.variant`. The **comment block** (lines 391–400) is expanded to state the contract and the re-sync path. Replace with comment lines stating the contract (e.g. "Anthropic contract → thinking budget"), the tier→variant mapping, and a ⚠ SWITCHING YOUR OPENCODE MODEL? block with the re-sync command `KAOLA_OPENCODE_INHERIT_MODEL=<new-provider>/<new-model> node scripts/sync-opencode-edition.js --write-config --adapt`.

Derive `contractLabel` and `knobDescription` locally in `renderAdaptiveConfig` from `schema.contractForProvider(parsed.providerId)`. `sync-opencode-edition.js` already requires `./kaola-workflow-adaptive-schema` as `schema` (line 49), so import `contractForProvider` through it.

### 2.3 Changes to `renderNeutralConfig()` — NONE

The neutral template (lines 423–482) carries no variants and no provider block. It stays byte-identical so the A7 committed-file parity test (`read('opencode.json') === sync.renderOpencodeJson()`) stays green without regenerating the committed file. The resilience guidance lives in `renderAdaptiveConfig` (the `--adapt` output) + docs + install.

### 2.4 Changes to committed `opencode.json` — NONE

The committed `opencode.json` (22 lines) is the neutral template (no `--adapt` was run — this repo has no `KAOLA_OPENCODE_INHERIT_MODEL` in its env). Since `renderNeutralConfig` is unchanged, the committed file stays byte-identical and A7 stays green. The `--adapt` output (with the new comment block) is only materialized when a user/installer runs `--write-config --adapt` with a detected inherited model.

### 2.5 `renderOpencodeJson()` — behavior shift for unknown providers (intended)

`renderOpencodeJson` (lines 367–377) needs **no code change** — but its behavior shifts correctly:
- Previously: `effortForProvider('acme')` → `null` → `renderNeutralConfig` (degrade).
- Now: `effortForProvider('acme')` → `CONTRACT_EFFORT_TABLE.default` (non-null) → `renderAdaptiveConfig` with the default contract. Unknown providers now get a `provider.acme.models.<model>.variants.high/medium` block + the full `agent.<role>.variant` map → **top/second split preserved, NOT de-tier.** Intended fix for requirement #3.

The falsy-guard in `effortForProvider` ensures the no-model-detected case (`inheritModel = ''`) still returns neutral: `parseModelProvider('')` → `null` → `renderNeutralConfig`. ✓

---

## 3. The S1 test flip for n2 (test-opencode-edition.js)

### 3.1 S1 flip (line 225–229) — the BUG assertion becomes the FIX assertion

**New (asserts the Anthropic-contract thinking budget):**
```js
// S1 (FLIPPED #544): GLM-5.2 via z.ai is served under the ANTHROPIC API contract, so its
// effort options MUST be the `thinking` budget shape — NOT reasoningEffort. Variant NAMES
// stay max/high (contract-keying flips only the OPTIONS payload, per the #544 invariant).
const glmMax = glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.max;
assert(glmMax.thinking && glmMax.thinking.type === 'enabled' && glmMax.thinking.budgetTokens === 32000,
  'S1: glm-5.2 max variant carries thinking {type:"enabled",budgetTokens:32000} (Anthropic contract), got ' + JSON.stringify(glmMax));
assert(glmMax.reasoningEffort === undefined,
  'S1: glm-5.2 max variant does NOT carry reasoningEffort (Anthropic contract → thinking budget)');
const glmHigh = glm.provider['zhipuai-coding-plan'].models['glm-5.2'].variants.high;
assert(glmHigh.thinking && glmHigh.thinking.budgetTokens === 16000,
  'S1: glm-5.2 high variant carries thinking budgetTokens:16000');
```

### 3.2 New contract-keying assertions (insert after S1, before the A12 top-role loop at line 230)

Assert, for each contract:
- glm (`zhipuai-coding-plan`): `effortForProvider` → `top.options.thinking` (not reasoningEffort); variant names `max`/`high`; `contractForProvider('zhipuai-coding-plan') === 'anthropic'`; `z.ai`/`zhipu-glm` aliases → anthropic.
- openai: `top.options.reasoningEffort === 'xhigh'`, no thinking; `contractForProvider('openai')/'gpt-5'` → openai.
- google: `top.options.reasoningEffort === 'high'`, `second` → 'low'; `contractForProvider('google')/'gemini-2.5-pro'` → google.
- unknown (`acme-corp`): `effortForProvider` non-null; `top.variant !== second.variant`; `contractForProvider('acme-corp') === 'default'`.
- falsy: `effortForProvider(null) === null && effortForProvider('') === null` (backward-compat, NOT default).

### 3.3 A12 unknown-provider flip (lines 244–247)

**New (asserts safe-default contract config):** unknown provider NO LONGER degrades — it gets the safe-default contract. Assert `unk.provider !== undefined && unk.agent !== undefined`; `unk.provider.acme.models['unknown-model'].variants` exists; `unk.agent.planner.variant === 'high' && unk.agent.contractor.variant === 'medium'` (default contract).

### 3.4 A12 GLM variant-name assertions (lines 222–224, 230–235) — stay GREEN unchanged

These assert variant NAMES (`max`/`high`) for GLM, preserved by the contract-keyed table. **No edit needed.**

### 3.5 A12 OpenAI block (lines 237–242) — stays GREEN unchanged

`contractForProvider('openai')` → `'openai'` → `CONTRACT_EFFORT_TABLE.openai` → variant `xhigh`/`high`. Identical to the old `PROVIDER_EFFORT_TABLE.openai`. **No edit needed.**

---

## 4. D-544-01 decision record outline (for n3 to materialize)

**File:** `docs/decisions/D-544-01.md` (confirmed next-free — no existing D-544-* in the decisions dir).

Content: Context (three defects: name-keyed not contract-keyed; unknown de-tier; config pinned to seeded model id). Decision (1. contract-keyed resolver — replace PROVIDER_EFFORT_TABLE with CONTRACT_EFFORT_TABLE keyed by API contract; add contractForProvider with GLM-via-z.ai → anthropic; anthropic → thinking budget, openai/google → reasoningEffort; variant names stay provider-relative. 2. safe default for unknown — effortForProvider(unrecognized) returns CONTRACT_EFFORT_TABLE.default (high/medium) instead of null; falsy still null (backward-compat). 3. documented re-sync — runtime dispatch re-resolves on every dispatch; config-side re-sync documented prominently; command `KAOLA_OPENCODE_INHERIT_MODEL=<new> node scripts/sync-opencode-edition.js --write-config --adapt`). Alternatives considered ((a) runtime re-resolve only — rejected, opencode applies variants from opencode.json not envelope; (c) model-agnostic — rejected, opencode variants model-scoped). Consequences.

---

## 5. Docs + install changes for n3

### 5.1 `docs/opencode-edition.md` — table (lines 43–49)

New contract-keyed table:

| Contract | Providers | Knob | `opus` → top | `sonnet` → second |
| --- | --- | --- | --- | --- |
| `anthropic` | `anthropic`, `claude`, **`zhipu` / `z.ai` / GLM-5.2** (Anthropic API contract) | `thinking` budget | `max` (budget 32000) | `high` (budget 16000) |
| `openai` | `openai`, `gpt`, `codex` | `reasoningEffort` | `xhigh` | `high` |
| `google` | `google`, `gemini` | `reasoningEffort` | `high` | `low` |
| `default` (unknown) | any other | `reasoningEffort` | `high` | `medium` |

Plus a callout: GLM-5.2 via z.ai → Anthropic contract → thinking budget (NOT reasoningEffort); variant names stay max/high. Unknown providers get the default contract (no de-tier).

### 5.2 `docs/opencode-edition.md` — GLM worked example (lines 72–93)

Flip `reasoningEffort` → `thinking` budget:
```jsonc
"zhipuai-coding-plan": { "models": { "glm-5.2": { "variants": {
  "max":  { "thinking": { "type": "enabled", "budgetTokens": 32000 } },
  "high": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
} } } }
```
Variant names `max`/`high` stay (the `agent.<role>.variant` references unchanged).

### 5.3 `docs/opencode-edition.md` — new "Switching models (resilience)" subsection

Insert after the "--adapt" section. State variant definitions are model-scoped (no model-agnostic namespace, no per-call override). Two safety nets: (1) runtime dispatch never de-tiers (re-resolves from KAOLA_OPENCODE_INHERIT_MODEL on every dispatch); (2) config re-sync documented prominently — `KAOLA_OPENCODE_INHERIT_MODEL=<new> node scripts/sync-opencode-edition.js --write-config --adapt`. The default contract ensures unrecognized providers get a top/second split rather than collapsing.

### 5.4 `docs/opencode-edition.md` — line 51 reference update

`mapTier` + `PROVIDER_EFFORT_TABLE` → `mapTier` + `CONTRACT_EFFORT_TABLE` + `contractForProvider`.

### 5.5 `install-opencode.sh` — seed_config echo (lines 142–145)

Add a contract + re-sync note: "Seeded $cfg — effort tiers adapted to your inherited model (contract-keyed). GLM-5.2/z.ai → Anthropic contract (thinking budget); OpenAI → reasoningEffort; Google → reasoningEffort; unknown → safe default (no de-tier). ⚠ Switched your opencode model? Re-run with KAOLA_OPENCODE_INHERIT_MODEL=<new> to regenerate the variant definitions (the dispatch path re-resolves regardless)."

---

## 6. Parity + acceptance checklist

| # | Acceptance criterion | Where verified |
|---|---|---|
| A1 | anthropic-contract (incl. GLM-via-z.ai) → `thinking` budget | test-opencode-edition.js S1 (flipped) + S1-contract[glm]; contractForProvider('zhipuai-coding-plan')==='anthropic' |
| A2 | GLM does NOT emit `reasoningEffort` | S1: glmMax.reasoningEffort === undefined |
| A3 | openai-contract → `reasoningEffort` | S1-contract[openai]; A12 OpenAI block (unchanged, green) |
| A4 | google-contract → `reasoningEffort` low/high | S1-contract[google] |
| A5 | unknown → safe generalized default (no de-tier) | S1-contract[unknown] + A12-unknown (flipped); effortForProvider('acme-corp') !== null |
| A6 | variant names `max`/`high` preserved for GLM | A12 lines 222–224, 230–235 (unchanged, green); test-adaptive-node.js Cases 6/9 (assert `max`, unchanged) |
| A7 | switching inherited model does NOT silently de-tier | Runtime: dispatchEffortOpencode re-resolves from env (Cases 6/7/9 green); Config: prominent re-sync comment in renderAdaptiveConfig + docs §Switching models + install echo |
| A8 | opus↔top / sonnet↔second parity vs `{code-architect, code-reviewer, planner, security-reviewer, synthesizer, workflow-planner}` | topTierRoles() = canonical opus ∪ higher-profile = exactly these 6; A12 iterates topRoles→top variant, stdRoles→second variant |
| A9 | Four cross-edition chains green | ×4 byte-identical schema copies; validate-script-sync.js enforces byte-identity |
| A10 | opencode `--check` parity green | sync-opencode-edition.js --check; A6/A7 byte-parity in test-opencode-edition.js |

### 6.1 The ×4 byte-identical schema copies (n2 must edit ALL identically)

1. `scripts/kaola-workflow-adaptive-schema.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`
3. `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`
4. `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`

`validate-script-sync.js` enforces byte-identity. The `WRITE_SET_OVERFLOW_SUBTYPES.mirror_write` pattern already flags this file — any plan touching it must declare all 4.

### 6.2 `test-adaptive-node.js` — NOT a write target (evidence only)

Cases 4/5/6/7/9 (lines 7241–7289) assert variant NAMES only (`max` for zhipu-opus, `high` for openai-sonnet). Contract-keying preserves variant names, so these stay GREEN unchanged. Re-run as evidence; **do not modify** (per the frozen-plan invariant).

### 6.3 Files n2 touches (implementation), n3 touches (materialization)

**n2 (implementation):**
- `scripts/kaola-workflow-adaptive-schema.js` — replace PROVIDER_EFFORT_TABLE → CONTRACT_EFFORT_TABLE; add contractForProvider; rewrite effortForProvider; update module.exports; update header comment block to document contract-keying.
- ×3 mirror copies (byte-identical).
- `scripts/test-opencode-edition.js` — S1 flip, S1-contract block, A12-unknown flip, A12 comment update (PROVIDER_EFFORT_TABLE → CONTRACT_EFFORT_TABLE).
- `scripts/sync-opencode-edition.js` — renderAdaptiveConfig comment expansion (contract label + re-sync ⚠); use schema.contractForProvider.

**n3 (materialization):**
- `docs/decisions/D-544-01.md` — new decision record (§4 outline).
- `docs/opencode-edition.md` — table (§5.1), GLM example (§5.2), Switching models subsection (§5.3), line-51 reference (§5.4).
- `install-opencode.sh` — seed_config echo (§5.5).

**NOT touched:** `opencode.json` (stays neutral, byte-identical), `test-adaptive-node.js` (evidence only), `renderNeutralConfig()` (unchanged → A7 stays green).

---

## 7. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| effortForProvider falsy-guard regression: if removed, Cases 1–3/8 in test-adaptive-node break (claude/codex would get a phantom default variant) | High | The falsy-guard (`if (!id) return null`) is explicitly specified in §1.4. n2 must not omit it. S1-contract[falsy] assertion locks it. |
| Variant-name drift: if n2 changes GLM variant names, test-adaptive-node Cases 6/9 break AND the invariant is violated | High | CONTRACT_EFFORT_TABLE.anthropic specifies `max`/`high` verbatim. S1-contract[glm] asserts names. Design forbids name changes. |
| ×4 byte-identity drift: if n2 edits only copy #1, validate-script-sync fails | Medium | §6.1 lists all 4 paths. mirror_write overflow subtype already flags this file. |
| opencode rejects `thinking` budget on a non-Anthropic-contract provider | Low | Contract-keying ensures `thinking` is ONLY emitted for anthropic-contract providers (incl. GLM-via-z.ai). default + openai + google emit reasoningEffort. |
| Unknown-provider default `medium` invalid for Google-contract | Very Low | Google providers detected by /google|gemini/ before falling to default. An undetected Google provider is an extreme edge case; `medium` is ignored (not errored) by providers that don't support it. |

---

**End of design spec.** n2 implements §1 (schema) + §3 (test flips) + §2.2 (renderAdaptiveConfig comment); n3 materializes §4 (D-544-01) + §5 (docs/install). §6 is the acceptance gate.
