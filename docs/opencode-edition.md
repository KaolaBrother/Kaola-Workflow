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
| `commands/<file>.md`    | `.opencode/command/<file>.md` | Claude install-time `model="{...}"` placeholders + all "pass `model=`" instructions rewritten to opencode's central effort resolution (`task` tool, no per-call `model=`). The canonical Path Intent / auto-fallback prose is also stripped so adaptive is the unconditional default (see [Path selection](#path-selection--adaptive-is-the-unconditional-default) below). |
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
**general, explicit, contract-keyed mapping** — `mapTier(tier, provider)` — that keys
on the provider's API **contract**, not its brand name:

- **Level 1 (fixed):** `opus` → the "top" rank · `sonnet` → the "second" rank.
  (`opus`/`sonnet` stay the plan's portable per-node vocabulary, `NODE_MODEL_TIERS`.)
- **Level 2 (per contract):** each rank → that contract's effort variant **and knob**
  (Anthropic → `thinking` budget; OpenAI/Google → `reasoningEffort`).

| Contract | Providers | Knob | `opus` → top | `sonnet` → second |
| --- | --- | --- | --- | --- |
| `anthropic` | `anthropic`, `claude`, **`zhipu` / `z.ai` / GLM-5.2** (served via the Anthropic API contract) | `thinking` budget | `max` (budget 32000) | `high` (budget 16000) |
| `openai` | `openai`, `gpt`, `codex` | `reasoningEffort` | `xhigh` | `high` |
| `google` | `google`, `gemini` | `reasoningEffort` | `high` | `low` |
| `default` (unknown) | any other | `reasoningEffort` | `high` | `medium` |

> **Contract callout.** GLM-5.2 via z.ai is served under the **Anthropic API contract**, so its
> knob is the `thinking` budget (32000 / 16000) — **not** `reasoningEffort`. Variant names stay
> `max`/`high` (contract-keying flips only the *options* payload, never the variant *names*, so
> already-seeded `agent.<role>.variant` references keep resolving). Unrecognized providers get the
> `default` contract (a real `high`/`medium` top/second split — **no de-tier**).

`mapTier` + `CONTRACT_EFFORT_TABLE` + `contractForProvider` live in `kaola-workflow-adaptive-schema.js`
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
      "max":  { "thinking": { "type": "enabled", "budgetTokens": 32000 } },
      "high": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
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

If the inherited model's provider is **unrecognized**, the seed falls back to the safe
**default contract** (`reasoningEffort` `high`/`medium`) — a real top/second split,
**no de-tier**. (A falsy/absent model still renders the neutral template: both tiers
inherit, no variant pin.) Regenerate for another model:

```bash
node scripts/sync-opencode-edition.js --write-config --adapt         # re-detect + re-render
KAOLA_OPENCODE_INHERIT_MODEL=openai/gpt-5 \
  node scripts/sync-opencode-edition.js --write-config --adapt       # xhigh/high
```

### Switching models (resilience)

opencode's variant schema is **model-scoped**: variants live at
`provider.<id>.models.<model>.variants.*`, and opencode applies `agent.<role>.variant` by reading
them from `opencode.json` — there is **no per-call variant override** on the `task` tool (the
`opencode_variant` the dispatch envelope carries is a recording of intent for the ledger, not a
runtime override opencode honors). So when you switch your opencode model, the variant
*definitions* under the old `provider/<model>` no longer resolve under the new one. Two safety nets
keep this from silently de-tiering:

1. **Runtime dispatch never de-tiers.** The dispatch path (`dispatchEffortOpencode` →
   `resolveOpencodeProvider`) re-resolves the provider from `KAOLA_OPENCODE_INHERIT_MODEL` on
   **every** dispatch, so the dispatch envelope always carries the correct variant for the
   *currently* inherited model (sourced from `planner_model`, not `role_default`). Tier
   *selection* is resilient regardless of what the seeded config says.
2. **Config re-sync is documented.** For the config *side* to match after a model switch,
   regenerate the variant definitions:

   ```bash
   KAOLA_OPENCODE_INHERIT_MODEL=<new-provider>/<new-model> \
     node scripts/sync-opencode-edition.js --write-config --adapt
   ```

   The seeded `opencode.json` carries a prominent header comment stating the seeded model, its
   contract, the knob, and this exact command; `install-opencode.sh` echoes the same guidance at
   seed time.

The **default contract** is the third safety net: even a provider the resolver has never seen gets
the `high`/`medium` top/second split rather than collapsing to identical effort, so an unrecognized
provider never silently de-tiers.

### Computer-wide activation (merge into the global config)

A **project** `opencode.json` (repo-root) applies to that repo only — opencode resolves config
**global → project** (project wins). The seed above writes a *project* file, so by default each
Kaola-enabled repo gets its own. To make the two effort tiers effective on **every** repo on a
machine, the `provider.*` variants + `agent.<role>.variant` map must live in the **global**
`~/.config/opencode/opencode.json`.

**Why this isn't automatic (the gap).** The installer/script seeds `opencode.json` only **if
absent** (it preserves your existing file), and the adapted renderer writes a *full* file with
**no `model` line** (it assumes model inheritance). Consequences:

- a global config that already exists (the typical case — it carries your `model`, and often
  `mcp` servers with secrets) is **not** upgraded by re-running the installer;
- a blind overwrite (`--write-config-to ~/.config/opencode/opencode.json --adapt`) would **wipe**
  your `model` / `mcp` / other keys. Do **not** do that.

**Safe, agent-runnable procedure.** Generate the correct blocks to a **temp** file (the renderer
is good at this), then **merge** only `provider` + `agent` into the global, preserving everything
else. Any agent (or human) on opencode can run this — no repo code change required:

```bash
# 1. Detect the inherited model and render the adapted blocks to a TEMP file (global NOT touched).
node scripts/sync-opencode-edition.js --write-config-to /tmp/oc-adapted.json --adapt
#    Override the detected model with KAOLA_OPENCODE_INHERIT_MODEL=<provider>/<model> if needed.

# 2. Merge ONLY `provider` + `agent` from the temp into the global; back up first.
#    Preserves model / mcp / $schema / any other keys. Validates JSON. Prints no secrets.
node - <<'NODE'
const fs=require('fs'),path=require('path');
const home=process.env.HOME||require('os').homedir();
const G=path.join(home,'.config','opencode','opencode.json'), T='/tmp/oc-adapted.json';
const strip=t=>t.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
const g=JSON.parse(strip(fs.readFileSync(G,'utf8'))), a=JSON.parse(strip(fs.readFileSync(T,'utf8')));
if(!a.provider||!a.agent) throw new Error('adapted temp missing provider/agent');
fs.writeFileSync(G+'.bak', JSON.stringify(g,null,2)+'\n');            // local backup (has secrets — keep local)
g.provider=Object.assign({}, g.provider||{}, a.provider);
g.agent   =Object.assign({}, g.agent||{},    a.agent);
const out=JSON.stringify(g,null,2)+'\n'; JSON.parse(out);             // validate before write
fs.writeFileSync(G,out);
console.log('merged global:',G,'\n keys:',Object.keys(g).join(', '),
  '\n provider:',Object.keys(g.provider).join(', '),
  '\n agent roles:',Object.keys(g.agent).length,
  '\n model kept:',!!g.model,' mcp kept:',!!g.mcp);
NODE

# 3. Confirm in opencode (next subagent dispatch uses the tiers). Restore on any problem:
#    mv ~/.config/opencode/opencode.json.bak ~/.config/opencode/opencode.json
```

**Scope notes.**
- The `agent.<role>.variant` entries are Kaola role names; they take effect only where those roles
  are installed — a project `.opencode/agent/` (per-repo) or a global deploy
  (`./install-opencode.sh --global`). In non-Kaala repos they are inert, so placing them globally
  is safe.
- **Idempotent:** re-running overwrites the same `provider`/`agent` blocks with fresh values; your
  `model`/`mcp` are always preserved.
- **Opt out** computer-wide by removing the `provider`/`agent` blocks (or restoring the `.bak`);
  neutral behavior (both tiers inherit, no variant pin) returns.

> Future improvement (not required for the merge above): a `--merge-config --adapt` mode on
> `sync-opencode-edition.js` would collapse steps 1–2 into one safe command. Today the temp-render
> + agent merge is the supported path because the renderer's full-file output cannot be written
> blindly over an existing global.

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

## Path selection — adaptive is the unconditional default

On the opencode edition, the **adaptive path is the unconditional default**; there
is no Path Intent / adaptive-switch step at the router. The canonical
`commands/workflow-next.md` carries a `## Startup Step 0a-1 — Path Intent` section
(`KAOLA_ENABLE_ADAPTIVE` switch-resolution + Branch A/B path-selection prose) and
`commands/kaola-workflow-adapt.md` carries a "downgrade to full path" auto-fallback
in its repair loop. **Both are stripped at generation time** by
`sync-opencode-edition.js`'s `transformCommandBody` (a section-drop for the Path
Intent heading, a targeted prose rewrite for the adapt fallback) — so they reach
`.opencode/command/*` already flipped, and **canonical `commands/*.md` is never
touched**. This is Mechanism B (opencode-only generator transform): it delivers the
#538 adaptive-only-default flip on the opencode surface without colliding with
#538's in-flight canonical edits to those exact files.

What is stripped, opencode-only:

- `.opencode/command/workflow-next.md` — the entire `## Startup Step 0a-1 — Path
  Intent` section (heading + body, including the `### Branch A` / `### Branch B`
  subheadings and the `KAOLA_ENABLE_ADAPTIVE` switch-resolution prose) is dropped.
  `## Startup Step 0a-2` (the adaptive front-end entry) stays — it describes what
  fires when `KAOLA_PATH=adaptive`, which is now the default.
- `.opencode/command/kaola-workflow-adapt.md` — the "downgrade to full path / "
  option in the `plan_invalid` repair-loop escape list is removed (the remaining
  `discard+restart / STOP` options stay coherent). "fall back to full" only lived
  inside the stripped Path Intent section, so it is gone with the section.

Locked by `test-opencode-edition.js` assertion **A22**.

> **Surviving back-references.** A few inline parentheticals elsewhere in
> `workflow-next.md` (Bundle Lane, Goal-Driven Autonomy, the output template) still
> mention "(Step 0a-1)" or the switch-OFF concept. These are stale but coherent —
> with adaptive as the unconditional default, "resolve the path intent" resolves
> trivially to adaptive and the switch-OFF branches simply never fire. Purging them
> would mean deep surgery on canonical concepts outside this flip's scope, so they
> are left in place intentionally.

### Installer command-set parity — scoped out

`install-opencode.sh` is a standalone installer (not `install.sh --forge`) and
deploys the **full** command set (including `kaola-workflow-fast.md` and the
`phase1`–`phase5` commands). #538's install.sh target is adaptive-only-default
with `--with-fast` / `--with-full` opt-ins. That parity is **scoped out of this
flip**: the load-bearing change is the router-prose flip (the transform, above),
which already makes adaptive the default *behavior* regardless of which commands
are installed; the install-time command-set partition (which commands exist) is
orthogonal and is a design call best aligned with #538's canonical install.sh
work. Full `--with-fast` / `--with-full` parity can ride a later issue without
colliding. See the rationale comment at the top of `install-opencode.sh`.

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

The edition is covered by `scripts/test-opencode-edition.js` (300 assertions):
agent/command presence and frontmatter, model-agnostic invariant (no `model:` in
generated agents), byte-for-byte canonical parity, `opencode.json` JSONC validity
+ exact tier coverage, **adaptive effort tiers** (`mapTier` per provider + the
higher-profile correspondence), the **workflow-planner `mapTier` guidance**,
**model-prose consistency** (no contradictory "pass `model=`" instructions),
**path-flip** (A22: no Path Intent section / auto-fallback prose on the opencode
surface), and route-reachability (every receipt-emitted command target resolves
under `.opencode/command/`). The existing `test-route-reachability.js` /
`validate-vendored-agents.js` / `validate-script-sync.js` / `test-edition-sync.js`
suites stay green — this edition adds a surface without altering the others.
