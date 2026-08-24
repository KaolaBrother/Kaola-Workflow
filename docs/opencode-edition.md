# Kaola-Workflow · opencode Edition

The opencode edition makes Kaola-Workflow runnable from
[opencode](https://opencode.ai), the same way the Codex edition makes it runnable
from Codex. opencode is a coding-agent **runtime** (like Codex), not a git forge,
so this edition is delivered the opencode-native way — a project `opencode.json`
plus a generated `.opencode/` tree — and is fully **additive**: it touches none of
the existing `claude`/`codex`/`gitlab`/`gitea` edition machinery.

## Forge axis

The runtime is not a forge, but the workflow *prose* is forge-shaped (`gh` vs `glab`
vs `tea`, pull requests vs merge requests, per-forge support-script basenames), so
`install-opencode.sh` takes `--forge=github|gitlab|gitea` (default `github`) and a
GitLab/Gitea project receives a forge-correct edition rather than GitHub-shaped
commands.

The forge variants are **generated, never hand-ported**. `sync-opencode-edition.js`
renders each forge from the routing-surface registry
(`scripts/generate-routing-surfaces.js`, via `scripts/runtime-edition-forge.js`), so
every forge tree derives from the same byte-checked command surfaces the Claude and
Codex editions ship. github renders the bare `.opencode/` tree; a forge renders the
sibling `.opencode-<forge>/`. All generated trees are gitignored build artifacts.

```bash
./install-opencode.sh --forge=gitlab            # GitLab-shaped edition
node scripts/sync-opencode-edition.js --forge=gitea --check
```

**Additive is unchanged by this.** Being additive is about edition *machinery*, not
forge support: the edition stays out of `npm test`, `edition-sync.js`, `install.sh`,
and the routing-surface `--check` contract, and keeps its own suite. The mandated
`generate-routing-surfaces.js --write` still refreshes a tree that already exists,
and creates none. An unknown `--forge` value is refused, never silently defaulted
to github.

## What gets generated

Everything under `.opencode/` is **generated from canonical** by
`scripts/sync-opencode-edition.js` and parity-checked by
`scripts/test-opencode-edition.js` (the opencode twin of `edition-sync.js`):

| Canonical source        | opencode edition output       | Notes |
| ----------------------- | ----------------------------- | ----- |
| `agents/<name>.md`      | `.opencode/agent/<name>.md`   | opencode frontmatter (`description`, `mode: subagent`, read-only `permission`). **No `model:` field** — model-agnostic. Generated reviewers preserve their canonical normalized behavior core and identity. |
| `commands/<file>.md`    | `.opencode/command/<file>.md` | Claude install-time `model="{...}"` placeholders + all "pass `model=`" instructions rewritten to opencode's inheritance (the `task` tool has no model or effort parameter). The canonical Path Intent prose is also stripped (see [Path selection](#path-selection) below). |
| `hooks/<script>.sh`     | `.opencode/hooks/<script>.sh` | The 1 runtime-neutral hook script, byte-copied. |
| `templates/opencode/plugins/*.js` | `.opencode/plugins/kaola-workflow-hooks.js` | Hook adapter plugin; byte-copied from the tracked canonical source by `sync-opencode-edition.js --write` (verified by `--check`; see [Hooks](#hooks)). |

One file is **authored** (not generated) and verified present by the test:

- `opencode.json` — the user-owned config (seeded once, then preserved; an install names any
  stale per-role effort entries it still carries and rewrites it only under `--adopt-config`).

Generated agents are deliberately model-agnostic, so regenerating the tree never
overwrites a user's model choices — those live only in the user-owned
`opencode.json`.

## Reviewer behavior derivation

`code-reviewer`, `adversarial-verifier`, and `security-reviewer` are first rendered into their
canonical Claude roots by `scripts/generate-reviewer-profiles.js` from
`templates/reviewers/behavior-contracts.json` and the closed runtime adapters. The generator owns
five Claude Markdown outputs and nine Codex TOML outputs across GitHub, GitLab, and Gitea.
`sync-opencode-edition.js` then transforms those generated roots into OpenCode
frontmatter/permissions; it does not maintain a second reviewer prompt.

`scripts/test-opencode-edition.js` extracts the delimited reviewer core and proves that role,
`behavior_contract_version`, `behavior_contract_hash`, and every normalized core byte match the
canonical generated source. This is deterministic contract equivalence only. OpenCode and another
runtime may produce different natural-language findings, explanations, or domain outcomes because
the underlying model execution is stochastic. The transform also makes no claim about private
runtime prompt-loader bytes; it proves the tracked/generated filesystem surface.

The review mechanism on opencode is the same generated `code-reviewer`/`security-reviewer`
profiles every runtime carries, documented in `docs/api.md`. Runtime transport differs
across editions, but the reviewer contract they run does not.

### Schema-2 reviewer identity (#708)

The opencode reviewer profiles carry the schema-2 identity fields
(`behavior_contract_version`, `behavior_contract_hash`, `resolved_profile_hash`) in their
frontmatter, stamped by the same transform that generates the profile. The `resolved_profile_hash`
is **re-stamped over the transformed opencode bytes** (not the Claude hash — the frontmatter
differs post-transform, so the Claude hash does not bind these bytes). The runtime resolver that
once read these fields back to bind a review-gate receipt retired with the node/DAG executor;
nothing currently reads them at run time. `scripts/test-opencode-edition.js` still verifies the
stamped bytes against canonical.

## Model and effort — inherited from the session

**A subagent runs the model and the reasoning effort of the session that dispatched it.** Nothing
is configured per role, and there is nothing to pass: opencode's `task` tool takes a
`subagent_type`, a `prompt` and a `description`, and has no model or effort parameter at all. To
make a dispatched role think harder, raise the session's own effort — every role you dispatch
follows it.

This is opencode's own behaviour, not something this edition arranges: `TaskTool` hands a subagent
the parent's variant whenever the role pins no model, and this edition pins none. It was measured
rather than assumed — with no `agent` block and the plugin hook inert, changing only the parent
session's effort moved both subagents with it (parent at `nothink` → 0 / 0 / 0 reasoning tokens;
parent at `think` → 26 / 560 / 641).

The edition previously seeded a per-role effort tier — a `provider.*.variants` block and an
`agent.<role>.variant` or `.options` entry for each role. That is **removed**, not merely
deprecated: it was an override of the inheritance above rather than a repair of it, and no observed
failure forced it to exist. `docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md`
records the design, what it measured, and why it was removed. A config written by an older install
still carries those entries; the installer names them (see [Config
drift](#config-drift-and---adopt-config)) and `--adopt-config` regenerates the file.

The **model**-pin path below is a different, opt-in feature and is unaffected.

### Opt-in: pin the standard and reasoning model classes

Effort is inherited and not configurable per role, but the **model** still is. If you want the
reasoning-tier roles on a different model from the rest, pin via env (or hand-edit
`opencode.json`):

- `KAOLA_OPENCODE_STANDARD_MODEL` — pin the standard tier to a `provider/model`
- `KAOLA_OPENCODE_REASONING_MODEL` — pin the reasoning tier to a `provider/model`

The canonical `fable` heavy class is deliberately classified as reasoning by
`sync-opencode-edition.js`, so planner and code-architect are included in the
reasoning-role override list. There is no separate heavy effort or model pin:
the session supplies effort for every role.

The seeded `opencode.json` carries this as a commented-out scaffold: a top-level `model` for the
standard tier and `agent.<role>.model` overrides for the reasoning-tier roles. That roster is
derived from the `model:` tier in `agents/*.md` and written into the scaffold, never hand-listed
here — read the current roles from the scaffold comment itself. With nothing set, every role
inherits the model you already use.

> A role that pins a model no longer inherits the session's effort either — that is opencode's
> coupling, not this edition's, and it is the trade this opt-in makes.

Generated command surfaces preserve the reviewer scope-and-acceptance packet but
omit Claude's one-bounded reviewer heavy re-dispatch. opencode's `task` tool has
no per-call model or effort parameter; reviewers follow the session and any
user-owned model pin that applies to their classified role.

> `opencode.json` is **user-owned**: `--write` regenerates agents/commands but
> **preserves** this file. Use `--write-config` to reset it from the template.

## Path selection

On the opencode edition, the router routes directly to the adaptive workflow; there is no
path-selection step at the router. The canonical `commands/workflow-next.md` is transformed at
generation time by `sync-opencode-edition.js`'s `transformCommandBody` so the generated
`.opencode/command/*` matches the opencode router shape, and **canonical `commands/*.md` is never
touched**.

### Installer command set

`install-opencode.sh` is a standalone installer — it has its own `--forge` flag and does not run
through `install.sh --forge`. It deploys the workflow command set — finalize, workflow-init,
workflow-next. `copy_tree` removes exactly three things: the command names the edition **retired
on purpose** (`RETIRED_WORKFLOW_COMMANDS`), the hook-script names it retired on purpose
(`RETIRED_HOOKS`), and each command name it is **about to write**, immediately before writing it.
A deployed command it has nothing to put back is left alone, so a source tree that renders
fewer commands than the destination holds no longer destroys the difference. Retiring a command
or hook script therefore means adding its name to the matching list. Support scripts come from the
selected forge's script tree, and the installer fails closed if an allowlisted script is missing
from source.

`sync-opencode-edition.js writeCommands` produces one command file per command surface the routing
registry declares for the selected forge, into the in-repo `.opencode[-<forge>]/command/` (the
single source the installer copies from). The route-reachability + content-reachability assertions
read the github tree and stay green.

## Hooks

opencode's hook model is **plugin-based** (TS/JS modules), not the shell +
`settings.json` model Claude Code uses. The opencode edition ships an adapter
plugin — `.opencode/plugins/kaola-workflow-hooks.js` — that feeds Claude-style
JSON payloads into the **same runtime-neutral shell scripts** the other editions
use (single source of truth, byte-copied under `.opencode/hooks/`), and honors
their exit codes. `throw` = deny (opencode's documented pattern).

The adapter plugin has a tracked canonical source at
`templates/opencode/plugins/kaola-workflow-hooks.js` (outside the gitignored `.opencode/`
tree). `sync-opencode-edition.js --write` byte-copies it to `.opencode/plugins/`; `--check`
asserts parity (missing or drifted plugin = parity failure). `install-opencode.sh` deploys the
plugin from the tracked canonical source, never from a self-referential `.opencode/` copy — a
missing plugin is a loud install error (no silent `2>/dev/null || true`).

**Plugin allowlist guard.** `sync-opencode-edition.js` maintains a `PLUGIN_SCRIPTS` allowlist
naming every managed plugin. The installer deploys via a `templates/opencode/plugins/*.js`
glob; `--check` enforces **set-equality** — every `*.js` present in
`templates/opencode/plugins/` must be registered in `PLUGIN_SCRIPTS`. A file added to that
directory without being registered exits `--check` non-zero with:
`unregistered plugin '<file>' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist`
This keeps the installer glob and the sync allowlist provably equivalent so they cannot
silently drift when a future second plugin is added. Enforced by `A11-allowlist` in
`test-opencode-edition.js`.

| Claude/Codex hook | opencode plugin mapping | Script |
| --- | --- | --- |
| `SubagentStart` (advisory dispatch log) | `tool.execute.before` · `task` | `kaola-workflow-subagent-dispatch-log.sh` |
| `SessionStart` compact (resume state) | `experimental.session.compacting` | inline (reads `workflow-state.md`) |

Fail-open everywhere (a missing script, malformed payload, or non-git cwd never
breaks the session); only an explicit exit-2 deny throws.

**One export, and it must be the default.** opencode's loader iterates `Object.values(mod)` and
calls **every** exported value as a plugin factory, so a named export beside the default is not a
harmless test handle — it is invoked with the plugin input, throws, and aborts registration of the
whole module. This plugin once shipped `export { hookPath, findRoot }` and logged
`failed to load plugin` on every startup as a result; the hooks survived only because ESM namespace
keys are sorted and `default` happened to be collected first. Test handles now hang off the default
export as properties, and `A29` walks the module the way the loader does rather than reaching for
`.default`, so the shape cannot regress quietly.

## Script resolution coupling

Workflow commands invoke `scripts/kaola-workflow-*.js` through a `kaola_script()`
locator that searches, in order: `./scripts/`, then
`${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/` (honoring
`$OPENCODE_CONFIG_DIR`, default `~/.config/opencode`). This is an **opencode-native**
path — there is **no** `$CLAUDE_PLUGIN_ROOT` and **no** `~/.claude/kaola-workflow` in
the generated `.opencode/` tree (the #544 Claude path-leak fix, folded into #543). The
generator (`sync-opencode-edition.js rewriteClaudeScriptPaths`) rewrites the canonical
Claude resolver to this opencode form at generation time; canonical `commands/*.md` /
`agents/*.md` are never touched.

- **Self-dev (this repo)** — `package.json` name is `kaola-workflow`, so
  `./scripts/` resolves first. Nothing else needed; the edition works in place.
- **Consumer project** — `install-opencode.sh` copies the support scripts to
  `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/` (a path
  `kaola_script()` already searches), so commands resolve without editing them.
  Skip with `--no-scripts`.

  The install **converges** that directory on the manifest rather than only adding to it: a `.js`
  the manifest no longer names is removed, so a script retired from the tree stops being resolvable
  by `kaola_script()` instead of lingering across upgrades. The scope is `install.sh`'s — `*.js` in
  that installer-owned directory — so anything else you keep alongside survives untouched, and a
  run that copied nothing sweeps nothing.

## Install (into a project)

`install-opencode.sh` is a standalone, additive installer (it does not modify
`install.sh`):

> The opencode runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as one leg of
> its six-runtime sequence. `install-all.sh` is a thin orchestrator: it does
> **not** fold opencode into `install.sh`/`edition-sync.js`/`npm test` — the
> additive-edition boundary (D-530-02) is preserved.


```bash
./install-opencode.sh                         # deploy into the current project (.opencode/ + opencode.json)
./install-opencode.sh --target /path/to/repo  # deploy into a specific project
./install-opencode.sh --global                # agents+commands → ~/.config/opencode (un-nested)
./install-opencode.sh --regenerate            # refresh in-repo .opencode/ from canonical
./install-opencode.sh --no-scripts            # skip the support-script copy (see Script resolution)
./install-opencode.sh --adopt-config          # replace an existing opencode.json (see Config drift)
./install-opencode.sh --uninstall             # remove the kaola-deployed edition (see Uninstall)
```

The install deploys the workflow command set — finalize, workflow-init, workflow-next.
It writes no configuration: the shared `~/.config/kaola-workflow/config.json` is user-owned
and no installer creates or edits it.

### Config drift and `--adopt-config`

`opencode.json` is user-owned, so an install preserves an existing one — which is also how it goes
stale, and nothing looked. A file written by an older install pins per-role reasoning effort
(`agent.<role>.options`, or `agent.<role>.variant` from before that); those settings no longer do
anything, because a subagent runs the model and effort of the session that dispatched it. Every
install **names the entries still carrying them** and changes nothing:

```
⚠ Config drift: it pins per-role reasoning effort, which no longer does anything.
    3 role entry(ies) carrying an inert effort setting: contractor, issue-scout, planner
    A subagent runs the model and reasoning effort of the session that dispatched it, so
    these are left over from an older install. An entry that only pins a model is yours
    and is not counted here.
```

That last line is the deliberate exclusion: an `agent.<role>` entry carrying **only** a `model` is
the opt-in model pin, which is yours and still works, so it is never named.

`--adopt-config` is the explicit opt-in that takes the regenerated config. It **regenerates the
whole file rather than merging into it** — the output is exactly what a fresh seed would write, so
hand edits and model pins are gone from the live config. The file it replaces is copied to
`<config>.<timestamp>.bak` first and the install prints that path; if the backup cannot be written
the install fails and the config is left alone. So the previous file is recoverable, but recovering
a pin means putting it back by hand.

An unreadable or non-JSON config is not this installer's to diagnose: it says nothing and never
fails the install.

### Deploy layout — project vs global (scope-dependent)

opencode resolves agents/commands/plugins **differently by scope**, so the installer
deploys to a scope-correct location (`copy_tree`'s `layout_root`):

| Scope | Deploy root for agents/commands/plugins/hooks | `opencode.json` |
| --- | --- | --- |
| `--target` (project, default `$PWD`) | `<project>/.opencode/{agent,command,plugins,hooks}/` | `<project>/opencode.json` |
| `--global` | `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/{agent,command,plugins,hooks}/` — **directly** under the config root | `<config>/opencode.json` |

The config dir **is** opencode's global ".opencode equivalent", so a `--global` install
writes its subdirs **directly** there — **not** a nested `~/.config/opencode/.opencode/`
(opencode never scans that nested path; deploying there left the entire global install
dead). The hooks plugin, when loaded globally from `<config>/plugins/`, resolves its hook
scripts from a sibling `<config>/hooks/` (it derives candidates from its own location via
`import.meta.url` plus `$OPENCODE_CONFIG_DIR`, in addition to the project-local
`.opencode/hooks/`). Verified by `test-opencode-edition.js` **G1** (a hermetic `--global`
install asserts the un-nested layout and that no nested `.opencode/` is created).

## Uninstall

```bash
./install-opencode.sh --uninstall                 # remove from the current project
./install-opencode.sh --uninstall --target DIR    # remove from a specific project
./install-opencode.sh --uninstall --global        # remove the global ~/.config/opencode install
```

`--uninstall` removes **only** kaola-deployed artifacts from the resolved scope, by
source-tree filename plus the names the edition retired on purpose (`RETIRED_WORKFLOW_COMMANDS`,
`RETIRED_HOOKS`, `RETIRED_SUPPORT_SCRIPTS` — a retired name is absent from the source tree and from
the install manifest, so without those lists it would linger forever; never a blind `rm` of a dir you
may share): the deployed agents/commands/plugin/hooks and the opencode-native support scripts
under `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/`. The shared
`~/.config/kaola-workflow/config.json` is user-owned and untouched, so a co-installed
Claude/Codex edition is unaffected. Your own `opencode.json` (model/permission
config) is **preserved**. A subsequent bare install then deploys the workflow edition — the
uninstall→reinstall round-trip is verified by `test-opencode-edition.js` **U1**, the retired-command
and retired-hook residue by **U2**, and the retired-support-script residue by **S1c** — which also
pins the removal as a **blocklist**: an unlisted, user-authored `.js` in the scripts dir survives the
uninstall byte-intact, because a namespace sweep of that directory would reintroduce #973's defect.

> `uninstall.sh` (the claude/codex/gitlab/gitea uninstaller) is **forge-scoped** and does
> not touch opencode — opencode is an additive runtime, not a forge (D-530-02), so its
> removal lives in `install-opencode.sh --uninstall`, which owns the deploy layout.

It seeds `opencode.json` only if absent — otherwise it preserves the file and names any stale
per-role effort entries it still carries (see [Config
drift](#config-drift-and---adopt-config)). The seeded file pins no model, so every role runs the
model and effort of the session that dispatched it; pin a tier to a different model with the
`KAOLA_OPENCODE_*_MODEL` env vars. Then in opencode:

```
/workflow-init
/workflow-next
```

## Develop / regenerate

```bash
node scripts/sync-opencode-edition.js --write              # regenerate .opencode/ + seed config
node scripts/sync-opencode-edition.js --write-config       # re-render opencode.json from the template
node scripts/sync-opencode-edition.js --refresh-present    # regenerate every tree that already exists; create none (ignores --forge)
node scripts/sync-opencode-edition.js --check              # parity assert: agents + commands + hooks + opencode.json
node scripts/test-opencode-edition.js                      # full structural + parity + route-reachability suite
```

A routing-prose change needs no separate refresh: the mandated
`node scripts/generate-routing-surfaces.js --write` already leaves every `.opencode*` tree on the
machine in parity, and still creates none. Reach for `--refresh-present` directly only when
refreshing the trees is the whole errand.

The validator is self-contained (run directly with `node`; it is intentionally
**not** wired into `package.json`'s `test` chain, to keep the change additive).

### What `--check` tells you to do about a failure

A failing `--check` lists each mismatched file with its reason and then closes with the
**remediation that actually clears the set it just reported**. Each mismatch class carries its own
remedy, and the closing advice is derived from the remedies present — so the command named is never
one that would exit 0 having repaired nothing:

- **Everything regenerable** (a missing, drifted or retired-but-present file in the generated
  tree) → `--write`.
- **Anything requiring the user-owned `opencode.json`** → `--write-config`, *including* mixtures
  that also contain regenerable files, because `--write-config` is a strict superset of `--write`.
  It comes with the warning that it rewrites `opencode.json` and discards model pins set there —
  `--write` alone preserves that file and would leave it stale while `--check` kept failing.
- **Anything only a source edit clears** (today: the plugin-allowlist class above — a `*.js` in
  `templates/opencode/plugins/` missing from `PLUGIN_SCRIPTS`) → the file is named with a line
  saying no flag of this script clears it. When the set contains *nothing else*, no invocation of
  this script is offered at all, so a command printed under the reasons is never mistaken for the
  fix.

```text
sync-opencode-edition[github]: PARITY FAILED (3 file(s)):
  - .opencode/agent/doc-updater.md — stale — regenerate
  - templates/opencode/plugins/probe-unregistered.js — unregistered plugin 'probe-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write-config
     (--write preserves the user-owned opencode.json and leaves it stale; --write-config rewrites it, discarding any model pins set there.)
No flag of this script clears templates/opencode/plugins/probe-unregistered.js — apply the source edit its reason names above.
```

The named flag always carries the `--forge=` the check ran under. Exit code is 1 on any mismatch.

## How it differs from the Codex edition

| Aspect | Codex edition | opencode edition |
| --- | --- | --- |
| Delivery | plugin (`.codex-plugin/` + `skills/` + `agents/*.toml`) | `opencode.json` + `.opencode/agent` + `.opencode/command` |
| Agent format | TOML profiles | Markdown (frontmatter + prompt body) |
| Forge coupling | shares the forge edition machinery (github/gitlab/gitea) | `--forge` flag; variants generated from the routing registry, outside the edition machinery |
| Models | baked per-agent | **inherited** — a subagent runs the model and reasoning effort of the session that dispatched it; standard/reasoning model pins are opt-in, with `fable` classified as reasoning |

## Verification

The edition is covered by `scripts/test-opencode-edition.js`: agent/command presence and
frontmatter, model-agnostic invariant (no `model:` in
generated agents), byte-for-byte canonical parity including generated reviewer behavior identity,
`opencode.json` JSONC validity,
**plugin load shape** (A29: the module exports exactly `["default"]`, and a harness walks it the
way opencode's loader does — `Object.values(mod)`, calling every exported value as a plugin
factory — so a named export beside the default, which once threw on every load, fails here instead
of silently killing every hook in the file), **config drift** (A27: an install names the entries
still pinning per-role effort and names the opt-in flag, which actually regenerates the file;
A27-neg / A27-quiet: a config the generator just wrote, and the inputs on which the check must say
nothing, report nothing), **model-prose consistency** (no contradictory "pass `model=`"
instructions),
**path-flip** (A22: no Path Intent section / auto-fallback prose on the opencode
surface), route-reachability (every receipt-emitted command target resolves
under `.opencode/command/`), **command-set lock-in** (P1: the deployed set is exactly
the workflow command set), the **folded
#544 Claude path-leak fix** (A: zero `$CLAUDE_PLUGIN_ROOT` /
`~/.claude/kaola-workflow` tokens across the deployed `.opencode/` tree), and
**canonical plugin source** (A11-canon: `templates/opencode/plugins/kaola-workflow-hooks.js`
exists and the regenerated `.opencode/plugins/kaola-workflow-hooks.js` is byte-identical to
it — closing the gap where a fresh-clone install silently deployed no hooks plugin),
**plugin allowlist** (A11-allowlist: every `*.js` in `templates/opencode/plugins/` must be
registered in `PLUGIN_SCRIPTS` — a file present on disk but absent from the allowlist fails
`--check` loudly, keeping the installer glob and the sync allowlist provably equivalent). The
existing `test-route-reachability.js` / `validate-vendored-agents.js` /
`validate-script-sync.js` / `test-edition-sync.js` suites stay green — this
edition adds a surface without altering the others.
