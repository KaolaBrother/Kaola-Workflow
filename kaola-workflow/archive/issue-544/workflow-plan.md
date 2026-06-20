# Workflow Plan — issue #544

<!-- plan_hash: 10519c675c7461516637cadac46e42a636ca1f1342c751085ec83422c28b6c38 -->

> Generalize the opencode effort-tier mapping across provider contracts (top/second ↔
> opus/sonnet), independent of the seeded model. Contract-keying, not name-keying.

## Meta

issue: 544
title: Generalize opencode effort-tier mapping across provider contracts (top/second ↔ opus/sonnet), independent of the seeded model
path: adaptive
runtime: opencode
project: issue-544
labels:
speculative_open_policy: off
write_overlap_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-planner | planner | — | — | 1 | sequence | opus |
| n2-tdd-guide | tdd-guide | n1-planner | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/sync-opencode-edition.js, scripts/test-opencode-edition.js, opencode.json | 1 | sequence | sonnet |
| n3-implementer | implementer | n2-tdd-guide | docs/decisions/D-544-01.md, docs/opencode-edition.md, install-opencode.sh | 1 | sequence | sonnet |
| n4-code-reviewer | code-reviewer | n2-tdd-guide, n3-implementer | — | 1 | sequence | opus |
| n5-finalize | finalize | n4-code-reviewer | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-planner | complete |
| n2-tdd-guide | complete |
| n3-implementer | complete |
| n4-code-reviewer | complete |
| n5-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (n1-planner) | subagent-invoked | evidence-binding: n1-planner 97355f59beab | |

| tdd-guide (n2-tdd-guide) | subagent-invoked | evidence-binding: n2-tdd-guide cf930f8030fd | |
| implementer (n3-implementer) | subagent-invoked | evidence-binding: n3-implementer 8a0bcdafd6aa | |
| code-reviewer | subagent-invoked | evidence-binding: n4-code-reviewer 8fe4ee8c1673 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 9418636c1526 | |
## Plan Notes

**Issue shape.** Feature-shape build (not a bug investigation — the phenomenon and root cause are
clear: `PROVIDER_EFFORT_TABLE`/`effortForProvider` are NAME-keyed, so GLM-5.2-via-z.ai emits
`reasoningEffort` though it is served under the Anthropic API contract → should emit a `thinking`
budget). The reasoning load is the DESIGN (the contract-keying scheme + resilience mechanism + the
safe default for unknown providers), which is why a `planner` node settles it before any code.

**Design invariants the n1-planner output (read-only `.cache` evidence) MUST lock:**
- **Contract-keying, not name-keying.** A model's effort knob follows its provider's API CONTRACT,
  not its provider NAME. `zhipuai-coding-plan`/z.ai/GLM-5.2 is served under the **Anthropic**
  contract → its effort options MUST be the `thinking` budget shape (`{type:'enabled',budgetTokens}`),
  NOT `reasoningEffort`. Anthropic-contract, OpenAI-contract, Google-contract each map to their own
  knob; a safe generalized default covers others.
- **Variant NAMES preserved.** GLM keeps variant labels `max` (top) / `high` (second). This is
  load-bearing: `scripts/test-adaptive-node.js` Cases 6/9 (lines ~7257-7284) assert
  `dispatchEffortOpencode(...,'zhipuai-coding-plan/glm-5.2')` → variant `max`, and the committed
  `opencode.json`/`test-opencode-edition.js` A12 assert `max`/`high`. Only the OPTIONS payload flips
  `reasoningEffort` → `thinking`; the variant names MUST stay `max`/`high`.
- **Unknown providers must NOT de-tier.** Today `effortForProvider()` returns `null` for an
  unrecognized provider → both tiers collapse to the same effort. The design gives unknown providers
  a sensible top/second split (a generalized default), mirroring Claude Code's opus/sonnet.
- **Resilient to an inherited-model switch.** Switching the opencode model must not silently de-tier.
  Runtime resolution already PURE-resolves the provider from `KAOLA_OPENCODE_INHERIT_MODEL`
  (`resolveOpencodeProvider`/`dispatchEffortOpencode`); the design makes the generated config +
  docs reflect a re-resolve/re-sync path (design call: re-resolve, documented re-sync, or a
  model-agnostic variant scheme).
- **Parity verified** for opus↔top / sonnet↔second against the canonical higher-profile reasoning
  role set `{code-architect, code-reviewer, planner, security-reviewer, synthesizer, workflow-planner}`.

**n1-planner is READ-ONLY** (declared_write_set `—`): it settles the contract-keying design and
records it as `.cache/{n1-planner}.md` evidence — the spec n2 implements and n3 materializes.

**n2-tdd-guide (test-first behavioral logic).** The current `scripts/test-opencode-edition.js`
**S1 (line ~228) asserts the BUG** (`glm...variants.max.reasoningEffort === 'max'`). TDD arc: flip
S1 to assert the corrected Anthropic-contract shape (`thinking` budget), add contract-keying
assertions (GLM→thinking; OpenAI→reasoningEffort; Google→reasoningEffort; unknown→safe default),
watch RED, implement the contract-keyed resolver + `sync-opencode-edition.js` generator change +
the generalized default, watch GREEN. Regenerate the committed `opencode.json` IFF
`renderOpencodeJson()`/`renderNeutralConfig` output changes (A7 pins committed === generator;
committed is the NEUTRAL template, env-independent — keep it so). All four `kaola-workflow-adaptive-
schema.js` copies MUST stay byte-identical (the ×4 drift anchor; `validate-script-sync.js` group).
`test-adaptive-node.js` is NOT a write target (variant-name-only assertions stay green) — re-run it
as evidence, do not modify unless the design changes variant names (it must not).

**n3-implementer (decision record + prose/wiring, post-generator).** Depends on n2 because it
materializes the durable `docs/decisions/D-544-01.md` (the contract-keying + resilience decision,
from n1's design evidence + n2's realization), and `docs/opencode-edition.md` carries a worked GLM
example (lines ~77-89, currently `"reasoningEffort":"max"`) that MUST match the finalized generator
output, and the "unknown → degrade" table row (~line 49) must become the safe default.
`install-opencode.sh` prose/wiring (~lines 137-144, the `--adapt` path) updated per the design's
resilience mechanism. D-544-01 is next-free for issue #544 (no existing #544 records in
`docs/decisions/`).

**Cross-edition scope (D-530-02 (existing) + CLAUDE.md Validation Policy).** The opencode-only files
(`sync-opencode-edition.js`, `test-opencode-edition.js`, `opencode.json`, `install-opencode.sh`,
`docs/opencode-edition.md`) are additive → NO `#307` four-chain obligation; their suite is
`node scripts/test-opencode-edition.js`. BUT `kaola-workflow-adaptive-schema.js` IS the ×4
byte-identical cross-edition anchor, so the schema change triggers the four-chain obligation for
THAT file: `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` all green (run sequentially).
Acceptance = four cross-edition chains green AND `node scripts/test-opencode-edition.js` green AND
`node scripts/sync-opencode-edition.js --check` parity green. n4-code-reviewer records all of these.

**Gate coverage.** n4-code-reviewer (opus) post-dominates the code producers n2/n3 (G1) — verifies
contract-keying correctness, ×4 byte-identity, the S1 test flip, opus↔top/sonnet↔second parity, and
the four-chain + opencode-suite green evidence. No security labels → G2 not triggered; all
acceptance is machine-verifiable → no `main-session-gate` (G3). Sink n5-finalize writes only
`CHANGELOG.md`.
