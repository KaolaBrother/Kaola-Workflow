evidence-binding: n1-schema 1486f5405cf6

# n1-schema — external config-schema validity (knowledge-lookup, read-only)

## Live schema source
URL: `https://opencode.ai/config.json` · fetched via WebFetch 2026-06-19. Root `Config` is `additionalProperties: false`; schema sets `allowComments: true` + `allowTrailingCommas: true` → JSONC legal. Supporting docs: `https://opencode.ai/docs/models/` (§Variants → Custom variants), `https://opencode.ai/docs/config/` (§Schema/§Agents/§Default agent), `https://opencode.ai/docs/agents/` (§Additional: "any other options … passed through to the provider") — fetched 2026-06-19.

## Neutral template validation (committed `opencode.json`)
| Key | Schema path | Result |
|---|---|---|
| `$schema` | `Config.$schema` (string) | PASS |
| `default_agent: "build"` | `Config.default_agent` (string) | PASS — `"build"` is a built-in primary agent |
| `// comments` | `allowComments:true` | PASS |
| no other live keys | `Config.additionalProperties:false` | PASS |

**A7 confirmed:** committed file === `renderOpencodeJson()` no-args (asserted `test-opencode-edition.js:177`). Provider-agnostic neutral template (no `model`, no `agent`, only commented pins). `--adapt` personalization correctly NOT committed.

## Adapted config validation (`renderOpencodeJson({inheritModel:'zhipuai-coding-plan/glm-5.2'})`)
Shape from `renderAdaptiveConfig` + `PROVIDER_EFFORT_TABLE['zhipuai-coding-plan']` = `{top:{variant:'max',options:{reasoningEffort:'max'}}, second:{variant:'high',options:{reasoningEffort:'high'}}}`; cross-checked A12 (`test-opencode-edition.js:221-230`).
| Key | Schema path | Result |
|---|---|---|
| `provider` | `Config.provider` → `ProviderConfig` | PASS |
| `provider.<id>.models` | `ProviderConfig.models` | PASS |
| `…models.<m>.variants` | model `.variants` | PASS |
| `…variants.max={reasoningEffort:'max'}` | variant-value (extras allowed) | PASS — docs-confirmed pattern |
| `…variants.high={reasoningEffort:'high'}` | (same) | PASS |
| `agent.<role>` | `Config.agent` addlProps → `AgentConfig` | PASS |
| `agent.<role>.variant` | `AgentConfig.variant` (string, "Default model variant for this agent") | PASS |

**`reasoningEffort` is a recognized option:** free-form provider pass-through (not schema-enumerated); live docs §Custom Variants show `provider.<id>.models.<model>.variants.<name>.reasoningEffort` verbatim. **`agent.<role>.variant` is a valid shape** (explicit `AgentConfig.variant`). **No key the schema rejects → opencode will NOT hard-fail on the adapted config.**

## Schema drift
**None detected.** Every key the edition uses (`$schema`, `default_agent`, `provider`, `provider.<id>.models`, `…models.<m>.variants`, `agent`, `agent.<role>.variant`) is present + documented, unchanged since authoring. Deprecated keys (`mode`, `reference`, `autoshare`, `layout`) exist but the config uses none.

## Defects
1. (none fix-now) — both neutral and adapted shapes fully schema-valid; no key causes opencode to reject.
2. [follow-up, low] `reasoningEffort:'max'` for `zhipuai-coding-plan` is an unconstrained pass-through value (docs' enumerated `reasoningEffort` values are OpenAI-centric low/high/xhigh). Correct for GLM-5.2 per its High+Max vocabulary, but if the zhipu AI-SDK provider does not accept `reasoningEffort` as its option key the variant would be a runtime no-op (NOT a schema/load failure). Runtime-smoke-test candidate, not a schema concern.

## Decision inputs (for n2)
- Config-schema validity (#9) is fully satisfied for both the committed neutral template and the `--adapt` output. No schema drift. `opencode.json` (neutral) is the correct committed canonical form.
- The only runtime uncertainty (not a schema defect) is whether the zhipu provider honors `reasoningEffort:'max'` — addressable by a runtime smoke-test, out of config-schema scope.
