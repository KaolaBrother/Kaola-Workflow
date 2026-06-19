# Kaola-Workflow · opencode Edition

The opencode edition makes the 6-phase Kaola-Workflow runnable from
[opencode](https://opencode.ai), the same way the Codex edition makes it runnable
from Codex. opencode is a coding-agent **runtime** (like Codex), not a git forge,
so this edition is delivered the opencode-native way — a project `opencode.json`
plus a generated `.opencode/` tree — and is fully **additive**: it touches none of
the existing `claude`/`codex`/`gitlab`/`gitea` edition machinery.

## What gets generated

Everything under `.opencode/` is **generated from canonical** by
`scripts/sync-opencode-edition.js` and parity-checked by
`scripts/test-opencode-edition.js` (the opencode twin of `edition-sync.js`):

| Canonical source        | opencode edition output       | Notes |
| ----------------------- | ----------------------------- | ----- |
| `agents/<name>.md`      | `.opencode/agent/<name>.md`   | opencode frontmatter (`description`, `mode: subagent`, read-only `permission`). **No `model:` field** — model-agnostic. |
| `commands/<file>.md`    | `.opencode/command/<file>.md` | Claude install-time `model="{...}"` placeholders + all "pass `model=`" instructions rewritten to opencode's central effort resolution (`task` tool, no per-call `model=`). |
| `hooks/<script>.sh`     | `.opencode/hooks/<script>.sh` | The 3 runtime-neutral hook scripts, byte-copied. |

Two files are **authored** (not generated) and verified present by the test:

- `.opencode/plugins/kaola-workflow-hooks.js` — the hook adapter plugin (see Hooks).
- `opencode.json` — the user-owned two-tier effort config (seeded once, preserved).

Generated agents are deliberately model-agnostic, so regenerating the tree never
overwrites a user's model choices — those live only in the user-owned
`opencode.json`.

## Model effort — two tiers as reasoning-effort variants

Claude Code uses a closed model vocabulary (`opus` / `sonnet`). opencode is
**provider-open** (Anthropic, OpenAI, Google, Z.ai/GLM, …), each with its own
reasoning-effort levels. The edition migrates Claude's two tiers to opencode with a
**general, explicit, provider-portable mapping** — `mapTier(tier, provider)` — that
never assumes a provider:

- **Level 1 (fixed):** `opus` → the "top" rank · `sonnet` → the "second" rank.
  (`opus`/`sonnet` stay the plan's portable per-node vocabulary, `NODE_MODEL_TIERS`.)
- **Level 2 (per provider):** each rank → that provider's effort variant.

| Provider | `opus` → top | `sonnet` → second |
| --- | --- | --- |
| `anthropic` | `max` | `high` |
| `openai` | `xhigh` | `high` |
| `google` | `high` | `low` |
| `zhipu` / `z.ai` (GLM-5.2) | `max` | `high` |
| _unknown_ | _(degrade: no effort pin)_ | |

`mapTier` + `PROVIDER_EFFORT_TABLE` live in `kaola-workflow-adaptive-schema.js`
(the ×4 byte-identical drift anchor), so all editions share one table. It is the
provider-open generalization of the existing Codex `dispatchEffort(opus→xhigh)`
translator.

### Tier membership (the "higher" profile correspondence)

- **Reasoning / top tier** — the canonical `opus` roles (**`planner`,
  `synthesizer`, `workflow-planner`**) **plus** the Claude Code `--profile=higher`
  roles (**`code-architect`, `code-reviewer`, `security-reviewer`**) → the model's
  TOP effort variant.
- **Standard / second tier** — every other role → the model's SECOND effort variant.

### Default install: adaptive (`--adapt`)

`install-opencode.sh` seeds `opencode.json` for your **inherited** model (detected
from `KAOLA_OPENCODE_INHERIT_MODEL`, else the global `~/.config/opencode/opencode.json`
`model` field): it defines the two effort variants under `provider.*` and selects
each role's variant via `agent.<role>.variant`. **No model is pinned** — both tiers
inherit the model you already use; only the effort differs. Example (GLM-5.2):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "build",
  "provider": {
    "zhipuai-coding-plan": { "models": { "glm-5.2": { "variants": {
      "max":  { "reasoningEffort": "max"  },
      "high": { "reasoningEffort": "high" }
    } } } }
  },
  "agent": {
    "planner":           { "variant": "max"  },   // reasoning tier → top effort
    "code-reviewer":     { "variant": "max"  },   // higher-profile → top effort
    "synthesizer":       { "variant": "max"  },
    "workflow-planner":  { "variant": "max"  },
    "code-architect":    { "variant": "max"  },
    "security-reviewer": { "variant": "max"  },
    "contractor":        { "variant": "high" }    // standard tier → second effort
    // … 9 standard roles on "high"
  }
}
```

If the inherited model's provider is unknown, the seed degrades to the neutral
template (both tiers inherit, no variant pin). Regenerate for another model:

```bash
node scripts/sync-opencode-edition.js --write-config --adapt         # re-detect + re-render
KAOLA_OPENCODE_INHERIT_MODEL=openai/gpt-5 \
  node scripts/sync-opencode-edition.js --write-config --adapt       # xhigh/high
```

### Adaptive effort selection in the workflow

The adaptive planner authors `opus`/`sonnet` per node by reasoning weight (#382);
opencode resolves that to an effort variant via `mapTier`. Because opencode applies
the variant **per role** (the `task` tool has no per-call variant override), the
planner realizes its tier choice through **role choice** — a reasoning-heavy node
uses a top-tier role (→ top effort), an execution node a standard role (→ second).
The opencode `workflow-planner` agent carries this `mapTier` guidance; the
`buildDispatch` packet carries the per-node `model` (the tier intent).

### Opt-out: pin tiers to different models

If you want the two tiers on **different models** (not just different efforts),
skip `--adapt` and pin via env (or hand-edit `opencode.json`):

- `KAOLA_OPENCODE_STANDARD_MODEL` — pin the standard tier to a `provider/model`
- `KAOLA_OPENCODE_REASONING_MODEL` — pin the reasoning tier to a `provider/model`

> `opencode.json` is **user-owned**: `--write` regenerates agents/commands but
> **preserves** this file. Use `--write-config [--adapt]` to reset it from the template.

## Hooks

opencode's hook model is **plugin-based** (TS/JS modules), not the shell +
`settings.json` model Claude Code uses. The opencode edition ships an adapter
plugin — `.opencode/plugins/kaola-workflow-hooks.js` — that feeds Claude-style
JSON payloads into the **same runtime-neutral shell scripts** the other editions
use (single source of truth, byte-copied under `.opencode/hooks/`), and honors
their exit codes. `throw` = deny (opencode's documented pattern).

| Claude/Codex hook | opencode plugin mapping | Script |
| --- | --- | --- |
| `PreToolUse` Bash (block multi-project commits) | `tool.execute.before` · `bash` | `kaola-workflow-pre-commit.sh` |
| `PreToolUse` Write\|Edit (#376 lane containment) | `tool.execute.before` · `edit`/`write` | `kaola-workflow-write-lane.sh` |
| `SubagentStart` (dispatch attestation) | `tool.execute.before` · `task` | `kaola-workflow-subagent-dispatch-log.sh` |
| `SessionStart` compact (resume state) | `experimental.session.compacting` | inline (reads `workflow-state.md`) |

Fail-open everywhere (a missing script, malformed payload, or non-git cwd never
breaks the session); only an explicit exit-2 deny throws. The write-lane hook
stays dormant unless `KAOLA_LANE_CONTAINMENT` is set, matching canonical behavior.

## Script resolution coupling

Workflow commands invoke `scripts/kaola-workflow-*.js` through a `kaola_script()`
locator that searches, in order: `./scripts/`, `$CLAUDE_PLUGIN_ROOT/scripts/`,
`~/.claude/kaola-workflow/scripts/`.

- **Self-dev (this repo)** — `package.json` name is `kaola-workflow`, so
  `./scripts/` resolves first. Nothing else needed; the edition works in place.
- **Consumer project** — `install-opencode.sh` copies the support scripts to
  `~/.claude/kaola-workflow/scripts/` (a path `kaola_script()` already searches),
  so commands resolve without editing them. Skip with `--no-scripts`.

## Install (into a project)

`install-opencode.sh` is a standalone, additive installer (it does not modify
`install.sh`):

```bash
./install-opencode.sh                         # deploy into the current directory
./install-opencode.sh --target /path/to/repo  # deploy into a specific project
./install-opencode.sh --global                # agents+commands → ~/.config/opencode
./install-opencode.sh --regenerate            # refresh in-repo .opencode/ from canonical
```

It seeds `opencode.json` only if absent. With `--adapt` (the default) it adapts the
two effort tiers to your **inherited** model (detected from
`KAOLA_OPENCODE_INHERIT_MODEL`, else the global opencode `model`); no model is
pinned — both tiers inherit the model you're already using, only the effort
differs. Override the inherited model, or pin tiers to different models via the
`KAOLA_OPENCODE_*_MODEL` env vars. Then in opencode:

```
/workflow-init
/workflow-next
```

## Develop / regenerate

```bash
node scripts/sync-opencode-edition.js --write              # regenerate .opencode/ + seed config
node scripts/sync-opencode-edition.js --write-config --adapt  # re-render opencode.json for the inherited model
node scripts/sync-opencode-edition.js --check              # parity assert (CI)
node scripts/test-opencode-edition.js                      # full structural + parity + route-reachability suite
```

The validator is self-contained (run directly with `node`; it is intentionally
**not** wired into `package.json`'s `test` chain, to keep the change additive).

## How it differs from the Codex edition

| Aspect | Codex edition | opencode edition |
| --- | --- | --- |
| Delivery | plugin (`.codex-plugin/` + `skills/` + `agents/*.toml`) | `opencode.json` + `.opencode/agent` + `.opencode/command` |
| Agent format | TOML profiles | Markdown (frontmatter + prompt body) |
| Forge coupling | shares the forge edition machinery (github/gitlab/gitea) | runtime-only; no forge axis |
| Models | baked per-agent | **two tiers as reasoning-effort variants** of your inherited model (`mapTier`, provider-adaptive); default = your model |

## Verification

The edition is covered by `scripts/test-opencode-edition.js` (223 assertions):
agent/command presence and frontmatter, model-agnostic invariant (no `model:` in
generated agents), byte-for-byte canonical parity, `opencode.json` JSONC validity
+ exact tier coverage, **adaptive effort tiers** (`mapTier` per provider + the
higher-profile correspondence), the **workflow-planner `mapTier` guidance**,
**model-prose consistency** (no contradictory "pass `model=`" instructions), and
route-reachability (every receipt-emitted command target resolves under
`.opencode/command/`). The existing `test-route-reachability.js` /
`validate-vendored-agents.js` / `validate-script-sync.js` / `test-edition-sync.js`
suites stay green — this edition adds a surface without altering the others.
