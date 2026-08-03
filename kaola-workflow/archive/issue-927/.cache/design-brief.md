# #927 design brief — opencode inherited effort tiers

Everyone working this issue reads this file. It states **results to reach** and **facts already
measured**, with where each fact came from. It does not dictate how to get there.

## The failure

Every opencode subagent effort tier this edition ships is inert. Across the whole `opencode.db` —
all projects, 14 agent names, ~80 subagent sessions — not one ever resolved above `default`.
Dispatch was correct and config resolution was correct (`opencode debug agent implementer` reported
`"variant": "high"` throughout). The variant is discarded downstream.

## Measured facts (evidence, not assumptions)

Read from the real opencode 1.18.11 Bun-compiled binary by extracting its embedded `__BUN` segment;
full detail in `.cache/premise-opencode-mechanism.md`. Repo anchors verified at commit `c3938174`;
full detail in `.cache/premise-repo-anchors.md`.

- opencode honours an agent's `variant` **only when that agent also pins a `model`**. Two interlocking
  sites enforce it, and the config schema annotates `variant` as *"applies only when using the agent's
  configured model"* — this is documented intent, not an opencode bug. Our generator pins no model by
  design, so `variant` is unusable for an inheriting design and must be abandoned, not repaired.
- **Agent-level `options` are merged into every call with no gate on `agent.model` anywhere.** Merge
  order is provider options → `model.options` → `agent.options` → variant-slice options. The agent's
  payload is read from `e.agent.options`.
- `output.options` mutated in a `chat.params` hook was traced through to `providerOptions` on the real
  model API call. It is consumed, not discarded.
- `agent.<name>.options` is schema-accepted (`options: D.optional(D.Record(D.String, D.Any))`), and
  `AgentConfig` is an open struct that folds unknown keys into `options`. It will not fail validation.
- In `chat.params`, `input.agent` is a plain **string** (the agent name) and `input.provider` is the
  resolved provider object, so `input.provider?.id` is valid.
- A subagent that pins no model inherits the parent session's model and provider.
- **Unresolved and therefore hostile**: whether a *throwing* `chat.params` hook kills the session.
  `Plugin.trigger` wraps hooks in a bare promise with no catch, unlike every lifecycle call around it.
  Treat a throw as fatal — the hook must not be able to throw for any input.

## Where things actually are

- `CONTRACT_EFFORT_TABLE` — `scripts/kaola-workflow-adaptive-schema.js:144-161`. Four contracts
  (`anthropic`, `openai`, `google`, `default`), tier keys `top` / `second`, each cell already shaped
  `{ variant, options }`. **The options payloads this design needs already exist here.**
- `contractForProvider` — same file, `:167`. Regex chain mapping a provider id to a contract.
- The emit site — `scripts/sync-opencode-edition.js:672`, inside `renderAdaptiveConfig`. The dead
  `provider.*.variants` block is `:657-668`; the prose to correct is `:641` and `:650-656`.
- `renderNeutralConfig` (`:679`) is a **different, opt-in path** that pins `agent.<role>.model` when
  the user sets a model-pin env var. It is not an effort tier and is out of scope — do not change it,
  and scope any "no model key on any role" assertion to the adaptive path.
- Tier membership — `reasoningRoles()` / `topTierRoles()` / `standardTierRoles()` at `:542-576`. Top
  is exactly `code-architect, code-reviewer, planner, security-reviewer, synthesizer`; standard is the
  other 9. **This stays the one source of tier assignment.**
- The plugin — the hand-written source is `templates/opencode/plugins/kaola-workflow-hooks.js`. It is
  **byte-copied** by the installer into `.opencode/plugins/`, `.opencode-gitea/plugins/` and
  `.opencode-gitlab/plugins/`. Edit the template; never a rendered copy.
- `scripts/` is deployed to `<config>/kaola-workflow/scripts/` at global install, so a generated
  sidecar has a home next to the config.
- Installer: `seed_config` at `install-opencode.sh:413-419` returns early when `opencode.json` exists;
  its warning string is `Switched your opencode model?` at `:433`.
- Suite: `npm run test:kaola-workflow:editions` (opencode + kimi; absent from `npm test`). The
  existing A12 block is `scripts/test-opencode-edition.js:659-762` and today asserts only
  `agent[role].variant`.
- `kaola-workflow-adaptive-schema.js` is the ×4 byte-identical drift anchor (copies under
  `plugins/kaola-workflow{,-gitea,-gitlab}/scripts/`). `node scripts/edition-sync.js --write`
  re-syncs; `node scripts/validate-script-sync.js` verifies.

## Results to reach

**Layer 1 — static config.** The adaptive config carries each role's tier as an `options` payload
rather than a variant name, and the variant machinery it replaces is gone rather than left beside it:
no `variant` key on any role, and no `provider.*.variants` block, because a dead key that reads as
configuration is what hid this failure. No `model` key appears on any role — both tiers still inherit
the session's model. The prose at `:641`/`:650-656` states the result rather than the method; `:651`'s
*"opencode applies them from this file"* was a false mechanism claim when written.

**Layer 2 — resolved per call.** Layer 1 alone bakes one contract's payload at sync time, so a session
that moves to a model on a different API contract would be *sent* a wrong-contract payload — a live
provider error where a mismatched variant merely de-tiered silently. So Layer 2 is not optional. A
`chat.params` hook resolves the contract against the model actually in use on that call and sets the
payload accordingly. Its tier map is generated, not hand-written, so `reasoningRoles()` /
`standardTierRoles()` remain the single source. The two layers are complementary: Layer 1 keeps a
correct-at-sync-time payload if the plugin fails to load.

Because the hook needs to map a provider to a contract, and duplicating that regex into the plugin
would make a fifth copy of one rule, the provider→contract rules should become data that
`contractForProvider` itself consumes and the generator can serialize. That makes this an
**edition-touching diff**: re-sync the ×4 anchor, and the finalize chain run is all four.

**Layer 2 retires** the installer's `Switched your opencode model?` warning and the staleness class
behind it — with per-call resolution there is nothing to regenerate.

**Installer drift.** `seed_config` preserving a stale `opencode.json` is why this box's config carries
three retired roles and is missing `investigator` and `metric-optimizer`, and nothing detects it.
**Owner ruling, 2026-08-03**: detect the drift, report exactly what drifted, and act only behind an
explicit opt-in flag. The config is user-owned — never overwrite it silently.

## Acceptance

- Two subagents on the **same inherited model with nothing pinned** measurably run at different
  effort. The oracle is `tokens_reasoning` in `opencode.db`. A config-resolution assertion is **not**
  sufficient — it was green throughout this entire failure.
- The suite proves the tier reaches a **subagent**, not only a primary session.
- No `model` key on any role in the adaptive path; `variant` gone rather than left beside `options`.
- The `:641`/`:651` prose states the result, not the method.
- Guard is mutation-proven: deleting the emitted `options` payload turns the suite red. Prove arming
  and coverage separately — a mutation that passes means the test is wrong, and a mutation control can
  share the code's own assumption.
- The hook cannot throw for any input, including an unknown agent, a missing provider, and a
  malformed or absent sidecar.

## Addendum — corrections after test authoring (2026-08-03)

**1. Layer 2 must REPLACE the knob, not spread over it.** The test author found that the hook as
originally sketched does not close the hole it exists for: `agent.options` — Layer 1's sync-time
payload — is already inside `output.options` by the time `chat.params` runs, so a spread-merge leaves
a stale `thinking` budget sitting alongside a freshly-resolved `reasoningEffort`, and both get sent.
That is the wrong-contract-payload exposure Layer 2 is supposed to remove. **Result to reach**: after
the hook runs, `output.options` carries the knob for the resolved contract and carries no knob
belonging to any other contract. Clearing the other contracts' knobs must be derived from the table,
not a hand-typed key list, or the next contract added will reintroduce the bug.

**2. The agent-facing badge is the same false mechanism claim, on a prompt surface.**
`OPENCODE_BADGE_BLOCK` at `scripts/sync-opencode-edition.js:261-271` and `OPENCODE_BADGE_GUIDANCE` at
`:276-279` are rendered into every opencode agent file, and both assert that effort resolves through
*variants* — the mechanism that has never worked. The behavioural instruction they carry ("dispatch by
`subagent_type`, never pass a per-call `model=`") is correct and must survive. **Result to reach**:
the badge states the result — the role's configured effort applies centrally, no per-call `model=` —
without naming variants as the mechanism. `scripts/sync-kimi-edition.js:405` references this block by
name in a comment; keep that reference honest.

**3. `CONTRACT_EFFORT_TABLE.variant` stays.** It is now unused by the opencode emission path, but
`mapTier`/`effortForProvider` still return the whole cell, and no observed failure demands removing
it. Removing it would widen the diff across the ×4 byte-identical anchor for no measured gain —
recorded on the watch list, not built. The existing `S1-contract` assertions that pin variant names
stay green.

## The seam — fixed now so two implementers can work concurrently

- The sidecar is `effort-tiers.json`, deployed at global scope to
  `<OPENCODE_CONFIG_DIR>/kaola-workflow/effort-tiers.json` — beside the already-deployed `scripts/`.
- The generator writes it on demand via `node scripts/sync-opencode-edition.js --write-effort-tiers-to <path>`.
- The plugin resolves the sidecar across the same project-then-global candidate layouts that
  `hookPath()` in the plugin template already walks for hook scripts. Reuse that resolution; do not
  invent a second one. A sidecar that cannot be found is a no-op, never a throw.

Everything above the seam is one implementer's; `install-opencode.sh` is the other's.
