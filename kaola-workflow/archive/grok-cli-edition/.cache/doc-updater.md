# doc-updater — grok CLI edition (#1008)

**Last Updated:** 2026-08-19
**Working directory:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/grok-cli-edition`
**Verdict:** DOCKED

No `scripts/codemaps/` and no `docs/CODEMAPS/`. Did not invent a codemap tree. Reconciled the declared surfaces (README, CHANGELOG, `docs/*.md`, CLAUDE.md, public-interface comments) against measured code.

Did not commit. Did not edit tests. Did not edit production script bodies — only public-interface comments on `install-grok.sh`, `install-all.sh` usage, and `scripts/runtime-edition-forge.js` header.

---

## Commands run (verbatim)

### `node scripts/sync-grok-edition.js --help`

```
usage: node scripts/sync-grok-edition.js (--write | --refresh-present | --check) [--forge=github|gitlab|gitea]
  --forge=<f>  which forge to render (default github). github writes .grok/;
               gitlab/gitea write .grok-<forge>/
  --write   regenerate the forge tree agents + commands + hooks from canonical
  --refresh-present  regenerate every forge tree that already exists; create none (ignores --forge)
  --check   assert the generated tree is in byte-parity with a fresh render
  --print-tree-root  print the directory the generated trees land in; write nothing
```

Exit: 0

### `node scripts/sync-grok-edition.js` (no-arg)

Same usage text as `--help`. Exit: 0

### `node scripts/sync-grok-edition.js --print-tree-root`

```
/Users/ylpromax5/Workspace/Kaola-Workflow
```

Exit: 0

(This worktree is linked; generated trees land in the main checkout, not beside the worktree.)

### `node scripts/sync-grok-edition.js --forge=bitbucket --check`

```
sync-grok-edition: unknown forge "bitbucket" (expected one of github/gitlab/gitea)
```

Exit: 2

### `./install-grok.sh --help`

```
Usage: ./install-grok.sh [--target DIR] [--forge=github|gitlab|gitea] [--global]
                         [--regenerate] [--uninstall] [--no-scripts] [--yes]
  --target DIR     deploy agents+commands into DIR/.grok (default: current directory)
  --forge F        github (default), gitlab, or gitea — which forge's workflow prose
                   and support scripts to deploy
  --global         deploy agents+commands into ${GROK_HOME:-~/.grok} (all projects)
  --regenerate     refresh the in-repo .grok/ tree from canonical, then exit
  --uninstall      remove the kaola-deployed grok edition from the resolved scope
                   (honors --target/--global), then exit
  --no-scripts     skip support scripts, hook scripts, and the hooks JSON copy
  --yes            non-interactive (skip the confirmation prompt)

SUPPORT SCRIPTS + HOOKS: workflow commands resolve support scripts via
${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts (the list comes from
scripts/kaola-workflow-install-manifest.js); the grok hook script lands in
${GROK_HOME:-$HOME/.grok}/kaola-workflow/hooks and is wired by
${GROK_HOME:-$HOME/.grok}/hooks/kaola-workflow-hooks.json.

UNINSTALL: --uninstall removes ONLY kaola-deployed artifacts from the resolved
scope: the deployed agents and commands (by source-tree filename), the support
scripts + hook scripts under the grok home, and kaola-workflow-hooks.json.
The SHARED ~/.config/kaola-workflow/config.json is kept for any co-installed
Claude/Codex/opencode/kimi edition.
```

Exit: 0

### `./install-all.sh --help` (after docking `--global`/`--project` wording)

```
Usage: ./install-all.sh [options]

Reinstall/refresh every Kaola-Workflow runtime edition in sequence:
  1. claude    Claude Code   (install.sh)
  2. opencode  opencode      (install-opencode.sh)
  3. codex     Codex         (install-codex-agent-profiles.js)
  4. kimi      Kimi Code     (install-kimi.sh)
  5. grok      Grok CLI      (install-grok.sh)

Options:
  --forge=github|gitlab|gitea   Forge for every forge-aware runtime (default: github).
                                Threaded to Claude, opencode, Kimi Code, and Grok CLI. Codex
                                selects its forge by marketplace plugin entry instead.
  --global                      Install opencode/Codex/Kimi/Grok into the global config root (default)
  --project[=DIR]               Install opencode/Codex/Kimi/Grok into a project dir (default: CWD)
```

`RUNTIMES=(claude opencode codex kimi grok)` at `install-all.sh:57`. Fifth leg is `install-grok.sh`.

### `node scripts/kaola-workflow-claim.js --help`

```
usage: kaola-workflow-claim.js <claim|authoring-allowed|release|status|patch-branch|watch-pr|bootstrap|startup|finalize|pick-next|list-open|resume|worktree-status|worktree-finalize|sink-fallback|verify-sink|stale-worktree-check|stale-worktree-cleanup|legacy-worktree-cleanup|audit-labels|repair-labels|barrier-ref-sweep>
  flags: --project P [--json] [--force] [--strict] [--issue N] [--target-issue N] [--target-issues A,B] [--pr-number N]
         [--branch B] [--reason R] [--runtime claude|codex|opencode|kimi|grok] [--sink merge|mr|pr] [--workflow-path VALUE (retired, ignored)]
         [--keep-worktree] [--keep-open|--keep-issue-open] [--keep-branch] [--execute] [--archive] [--export]
```

`--runtime …|grok` matches `docs/api.md`.

### `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity`

Exit: 1

```
Error: the axiom block must be checked on every runtime x forge init surface AND on both repo-root prose surfaces — expected 17, derived 14 (commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, ../../../.opencode/command/workflow-init.md, .kimi/skills/workflow-init/SKILL.md, ../../../.opencode-gitlab/command/workflow-init.md, .kimi-gitlab/skills/workflow-init/SKILL.md, ../../../.opencode-gitea/command/workflow-init.md, .kimi-gitea/skills/workflow-init/SKILL.md, CLAUDE.md, README.md)
```

Not a documentation rewrite. The expected-count formula counts every `scripts/sync-*-edition.js` (now 3, including grok) but the constructed set still renders only opencode + kimi. I did not edit the test and did not paper this over in `docs/conventions.md` or README's axiom-surface sentence. See "Skipped / findings" below.

---

## Ground truth measured (not guessed)

### package.json scripts

- `scripts.test` = `npm run test:kaola-workflow:claude && …:codex && …:gitlab && …:gitea` — does **not** invoke `test-grok-edition.js`.
- `scripts["test:kaola-workflow:editions"]` = `node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js && node scripts/test-grok-edition.js`.
- `files` includes `install-grok.sh`.

### `generate-routing-surfaces.js`

`refreshPresentEditionTrees()` iterates `['sync-opencode-edition.js', 'sync-kimi-edition.js', 'sync-grok-edition.js']` and runs `--refresh-present`. Called from `--write` only, not `--check`.

### `sync-grok-edition.js` layout

- `treeLabel(forge)` = `'.grok' + outSuffix(forge)` → `.grok` / `.grok-gitlab` / `.grok-gitea`.
- Agents: `.grok/agents/<name>.md` — frontmatter `name`, `description`, `prompt_mode: full`, `model: inherit`, `permission_mode`, `agents_md: true`. No `effort` / `reasoning_effort`. Claude `tools:` dropped.
- Commands: `.grok/commands/<name>.md` — `Agent(` → `spawn_subagent(`, `model="{…}"` stripped, `--runtime claude` → `--runtime grok`.
- Hooks: `kaola-workflow-subagent-dispatch-log.sh` + generated `hooks.json`.
- Hook adaptations: `p.agent_type||p.agentType||p.subagentType` and `p.agent_id||p.agentId`.
- `hooks.json` commands already embed `${GROK_HOME:-$HOME/.grok}` (no `__GROK_HOME__` placeholder). `install-grok.sh` `cp`s that file; it does not substitute.

### Generated main-checkout trees (from `--print-tree-root`)

Present: `/Users/ylpromax5/Workspace/Kaola-Workflow/.grok`, `.grok-gitlab`, `.grok-gitea`.

`.grok/agents/` (14): adversarial-verifier, build-error-resolver, code-architect, code-explorer, code-reviewer, doc-updater, implementer, investigator, knowledge-lookup, metric-optimizer, planner, security-reviewer, synthesizer, tdd-guide. Every file has `model: inherit`. No `effort:` / `reasoning_effort:` / `tools:` in frontmatter.

`.grok/commands/` (3): `kaola-workflow-finalize.md`, `workflow-init.md`, `workflow-next.md`.

`.grok/hooks/`: `hooks.json`, `kaola-workflow-subagent-dispatch-log.sh`.

Sample spawn card (`kaola-workflow-finalize.md`):

```
spawn_subagent(
  subagent_type="tdd-guide",
  description="Routed fix: {the failing command}",
  prompt="the exact failure, the evidence path, and the working directory"
)
```

No `model=`. Inherit block heading: `## Model and effort are inherited`. `workflow-next.md` stamps `--runtime grok`.

No vendor slugs `grok-4.x` / `grok-build` in generated tree or in the docs I edited.

### `GROK_RUNTIME_NATIVE` (`scripts/test-grok-edition.js`)

```
inherit_session_model:
  'Grok subagents inherit the session model, so generated surfaces carry no per-dispatch model override and no effort field; raise session /effort to make every dispatched role think harder.'
```

### `install-all.sh`

`RUNTIMES=(claude opencode codex kimi grok)`. Forwards `--forge` and `--global`/`--target` to `install-grok.sh`.

### Cross-checkout `--refresh-present` stderr (measured in source)

opencode / kimi:

```
Verify from that root: npm run test:kaola-workflow:editions
```

grok:

```
Verify from that root: node scripts/test-grok-edition.js
```

---

## Files checked

| Path | Result |
| --- | --- |
| `CLAUDE.md` | Already names `./install-grok.sh` and additive grok. Documentation Map does not list per-edition docs (same as opencode/kimi). No edit. |
| `README.md` | Already names five product runtimes and Grok in install / roles / update. Line 42 still says "twelve workflow-init surfaces (four runtimes × three forges)" — that is the axiom-guard set (claude/codex + opencode/kimi), not the product runtime count. Left alone. No edit this pass. |
| `CHANGELOG.md` `[Unreleased]` | Grok #1008 bullet already matches installer / inherit / additive boundary / suite path. No new bullet (this pass only docked existing surfaces). |
| `docs/README.md` | Already indexes `grok-edition.md`. Index line already says "runtimes'" (not "four"). No edit. |
| `docs/architecture.md` | Grok column already present and pointed at `docs/grok-edition.md` + `GROK_RUNTIME_NATIVE`. Fixed the leftover "opencode's and kimi's" pointer sentence. |
| `docs/api.md` | `--runtime …\|grok` already matched claim `--help`. Fixed the lumped `--refresh-present` verify-command claim. |
| `docs/grok-edition.md` | Layout / inherit / treeLabel already matched the generator. Fixed installer (flags, install-all fifth leg, project hooks copy, `--print-tree-root`, no `__GROK_HOME__` sub) and hook payload (`agent_id`). |
| `docs/kimi-edition.md` | "four-runtime sequence" → five (kimi remains the fourth leg). |
| `docs/opencode-edition.md` | "four-runtime sequence" → five. |
| `docs/conventions.md` | Axiom-layer 14-surface description still names the constructed set (6 tracked + 6 opencode/kimi + 2 root). Did not rewrite it to 17. See findings. |
| `docs/workflow-state-contract.md` | No grok-specific contract. No edit. |
| `docs/kimi-edition.md` / `docs/opencode-edition.md` sister install-all notes | Updated sequence width only. |
| `package.json` | `test` / `test:kaola-workflow:editions` already correct. Description still says "Claude Code and Codex" — skipped (package metadata, not a grok-edition doc surface). |
| `.env.example` | Does not exist. |
| `.gitignore` | `.grok/` and `.grok-*/` present. |
| `install-grok.sh` | Help already correct. Header falsely claimed `__GROK_HOME__` substitution. Fixed comment. |
| `install-all.sh` | `--global`/`--project` help omitted Grok. Fixed usage text. |
| `scripts/runtime-edition-forge.js` | Header said "two runtime editions and their two installers". Fixed comment. |
| `scripts/sync-grok-edition.js` | Source of layout / inherit / usage. |
| `scripts/generate-routing-surfaces.js` | `refreshPresentEditionTrees` includes `sync-grok-edition.js`. |
| `scripts/test-grok-edition.js` | `GROK_RUNTIME_NATIVE`, inherit / no effort / no `model=` / no vendor slugs. |
| `scripts/kaola-workflow-claim.js` | `--runtime` usage includes `grok`. |
| Generated `.grok/{agents,commands,hooks}` on the main checkout | Sampled; matches `docs/grok-edition.md`. |

---

## Gaps found and fixed

1. **`docs/grok-edition.md` installer was thinner than the installer.** `--help` exposes `--target`, `--global`, `--regenerate`, `--uninstall`, `--no-scripts`, `--yes`. `install_hooks_json` also copies `hooks.json` + `*.sh` to `<project>/.grok/hooks/` on a project install. The installer resolves the source tree via `--print-tree-root`. The generated hooks file already uses `${GROK_HOME:-$HOME/.grok}`; there is no `__GROK_HOME__` substitution. Added the install-all fifth-leg note (same shape as kimi/opencode), the flag examples, the project hooks copy, and the as-is copy fact.

2. **`docs/grok-edition.md` hooks table omitted `agent_id`.** `HOOK_ADAPTATIONS` rewrites both `p.agent_type\|\|''` → `(p.agent_type\|\|p.agentType\|\|p.subagentType\|\|'')` and `p.agent_id\|\|''` → `(p.agent_id\|\|p.agentId\|\|'')`. Table now names both.

3. **`docs/api.md` claimed every additive sync's `--refresh-present` tells the reader to run `npm run test:kaola-workflow:editions`.** opencode and kimi do. grok prints `node scripts/test-grok-edition.js`. Sentence now names both.

4. **`docs/architecture.md` pointer coda still said only opencode and kimi have per-edition docs.** Grok column already pointed at `docs/grok-edition.md`. Now: "opencode's, kimi's, and grok's point at prose."

5. **`docs/kimi-edition.md` / `docs/opencode-edition.md` still said "four-runtime sequence".** `install-all.sh` is five legs. Kimi remains the fourth; grok is the fifth.

6. **`install-all.sh` usage `--global` / `--project` named only opencode/Codex/Kimi.** Scope flags are forwarded to grok (`GROK_SCOPE`). Help now says opencode/Codex/Kimi/Grok.

7. **`install-grok.sh` header claimed `__GROK_HOME__` substitution.** `install_hooks_json` is a straight `cp`. Comment now matches the copy and the extra project-hooks path.

8. **`scripts/runtime-edition-forge.js` header said "two runtime editions and their two installers".** Three consumers: opencode, Kimi, Grok.

---

## Skipped (with reason)

- **Codemaps** — neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists.
- **README product counts / CHANGELOG / CLAUDE.md / docs/README.md** — already docked to five product runtimes and `install-grok.sh` before this pass. No further product-count edit.
- **README line 42 "four runtimes × three forges = 12" + fourteen axiom surfaces** — this is the axiom-identity set (`docs/conventions.md` § First Principles axiom layer: 6 tracked init + 6 opencode/kimi in-memory renders + CLAUDE.md + README.md). It is not the product runtime count. Changing it to five would invent a 15-surface init sweep that `testAxiomBlockByteIdentity` does not construct.
- **`docs/conventions.md` axiom-width paragraph** — still accurately describes the *constructed* 14. The *expected* formula now derives 17 because `sync-grok-edition.js` matches `sync-*-edition.js`. Updating the paragraph to 17 would claim grok init surfaces are checked; they are not (the constructed list has no `sync-grok-edition.js` render). Updating it to say the test is green would be false (it reds, exit 1). Left as-is.
- **`docs/workflow-state-contract.md`** — no grok-specific fields.
- **`.env.example`** — absent.
- **`package.json` `description`** ("Claude Code and Codex") — package metadata, not a grok-edition doc surface; `files` already lists `install-grok.sh`.
- **Axiom / walkthrough test** — out of write set (`Do not edit tests`). Finding only: `testAxiomBlockByteIdentity` expected 17, derived 14. The implementer of the grok generator (or tdd-guide) owns adding grok's three in-memory init renders to that sweep, or re-anchoring the expected-count formula. I did not change either.
- **CHANGELOG new bullet** — this pass only corrected inaccuracies inside the already-Unreleased #1008 surface. The existing Unreleased grok bullet remains true.

---

## Result landed

Edits (worktree):

- `docs/grok-edition.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/kimi-edition.md`
- `docs/opencode-edition.md`
- `install-grok.sh` (header comment only)
- `install-all.sh` (usage text only)
- `scripts/runtime-edition-forge.js` (header comment only)

This record: `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/grok-cli-edition/.cache/doc-updater.md`

**Verdict: DOCKED**
