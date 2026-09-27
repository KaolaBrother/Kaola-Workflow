# Installation and Runtime Setup

This guide owns installation, update, verification, and removal. Runtime capability evidence is in
[Runtime Capabilities](runtime-capabilities.md); edition-specific carrier behavior is linked below.

## Prerequisites

- Git and Node.js are available.
- The selected forge CLI is installed and authenticated when the workflow will claim or close issues:
  `gh` for GitHub, `glab` for GitLab, or a compatible Gitea CLI/API setup.
- At least one supported coding-agent runtime is installed.

Clone once so every local runtime can converge from the same bytes:

```bash
git clone https://github.com/KaolaBrother/Kaola-Workflow.git ~/kaola-workflow
cd ~/kaola-workflow
```

## All local runtimes

Install or refresh every detected local runtime for GitHub:

```bash
./install-all.sh --yes --forge=github
```

Change the forge to `gitlab` or `gitea` as needed. The wrapper calls each runtime installer in turn,
continues through independent failures by default, and prints a per-runtime summary. It writes no
global-contract carrier itself: every runtime installer installs its own carrier as its last step
(see [Global contract carriers](#global-contract-carriers)). Useful controls:

```bash
./install-all.sh --check
./install-all.sh --yes --skip=claude,zcode
./install-all.sh --yes --strict
./install-all.sh --project=/absolute/repository/path --yes
```

`--check` is read-only and prints one `[global-contract] <runtime>: …` line per runtime. `--global` is the default for OpenCode, Codex, Kimi, Grok, Cursor,
ZCode, Devin, and Droid; Claude has one runtime-wide install. `--project[=DIR]` selects project scope where the
runtime supports it. Run `./install-all.sh --help` for the current option contract.

The wrapper does not create or update a Cursor Cloud environment. It also cannot choose a first
Codex marketplace plugin for the user; Codex forge selection belongs to the installed plugin entry.


### Global contract carriers

Each runtime installer — `install.sh` and the Codex installer included — installs only its
own global-contract carrier, as its last step, through
`node scripts/kaola-workflow-global-contract.js install --runtime <runtime> --json`. A standalone
install is therefore complete on its own, and no install order matters. `install-all.sh` produces
exactly what the standalone installers would, and `--skip=<runtime>` also skips that runtime's
carrier.

Ownership is recorded per target in
`~/.config/kaola-workflow/global-contract-targets/<target-id>.json` (carrier path, install hash, and
the owner bytes around a managed region). Each target is planned and written on its own, so a
hand-edited, symlinked, malformed, or drifted carrier fails only its own runtime's install or
`--check`. Other runtimes are not affected. A successful per-target install also registers the
runtime's `global`-scope reference on the shared config block (see
[Shared blocks and references](#shared-blocks-and-references)); a per-target uninstall releases it.

When a runtime's program is not detected on `PATH`, its record is kept and shown as `DORMANT`. This
does not release the reference: only that runtime's own uninstaller removes a record. When the runtime comes back, even after the contract text has
changed, it checks its carrier against its own record. If the hash matches, the carrier is refreshed.
If it does not match, `OWNER_CONFLICT` is reported for that runtime only. In
`install-all.sh --check`, a `DORMANT` runtime's carrier state is an advisory line, not a failure.

## Runtime-specific installation

### Claude Code

```bash
./install.sh --yes --forge=github
```

The installer deploys commands, support scripts, and the compact-recovery hook. It installs no
subagent profile and retires the ones earlier releases installed (see
[Upgrading from earlier releases](#upgrading-from-releases-that-installed-kaola-role-profiles)).
Restart Claude Code after install or update. Choose `--forge=gitlab` or `--forge=gitea` for those
editions.

### Codex

Codex separates marketplace registration, plugin installation, and hook installation.
Register the local checkout, then install exactly one forge edition:

```bash
codex plugin marketplace add ~/kaola-workflow

# Choose exactly one.
codex plugin add kaola-workflow@kaolabrother-kaola-workflow
# codex plugin add kaola-workflow-gitlab@kaolabrother-kaola-workflow
# codex plugin add kaola-workflow-gitea@kaolabrother-kaola-workflow
```

Run the Codex installer from the active plugin root, or run `./install-all.sh --yes` after the
plugin is present. The entry point keeps its historical name, `install-codex-agent-profiles.js`,
but installs and registers no profile. It retires the role profiles, ownership record, and
`# BEGIN/END kaola-workflow agents` registration block that earlier releases wrote in the target
scope (see [Upgrading from earlier releases](#upgrading-from-releases-that-installed-kaola-role-profiles)).
It then installs the global compact hook (`~/.codex/hooks.json`), its version-less hook home
(`~/.codex/kaola-workflow/`), and the `~/.codex/AGENTS.md` global-contract carrier. It also reports
the dispatch posture and `multi_agent_v2` state it reads from `config.toml` but never writes them.
The doctor is a read-only diagnostic:

```bash
node <active-plugin-root>/scripts/install-codex-agent-profiles.js --global
node <active-plugin-root>/scripts/kaola-workflow-codex-preflight.js \
  --doctor --project-root <project-root> --json
```

The terminal npm Codex CLI is updated separately from Workflow carriers:

```bash
npm install --global @openai/codex
codex --version
```

The ChatGPT desktop application carries its own Codex binary and is updated independently. The
Workflow installer does not install or upgrade either Codex surface, and Workflow carriers do not
require a particular desktop bundle version.

Open Codex, run `/hooks`, and approve the `kaola-workflow:` entries. Trust is content-hash based, so
changed hook bytes require renewed approval. Exit that session, rerun the installer and
doctor, then start a fresh working session. Automation that has independently vetted the hook source
may use `codex exec --dangerously-bypass-hook-trust` for that run; it does not persist approval.

Kaola-Workflow requires no Codex dispatch mode and sets no Codex version floor. The installer and
doctor report `multi_agent_v2`, the dispatch posture, and the V2 bounds as host facts, never as a
refusal. Multi-agent configuration in `config.toml` stays user-owned.

### OpenCode, Kimi, Grok, Cursor, ZCode, Devin, Droid, and DSH

Each additive installer accepts a forge, global or project scope, and non-interactive mode. The established OpenCode, Kimi, Grok, Cursor, ZCode, and Droid installers also expose removal; Devin removal is not yet a standalone installer mode:

```bash
./install-opencode.sh --global --yes --forge=github
./install-kimi.sh     --global --yes --forge=github
./install-grok.sh     --global --yes --forge=github
./install-cursor.sh   --global --yes --forge=github
./install-zcode.sh    --global --yes --forge=github
./install-devin.sh    --global --yes --forge=github
./install-droid.sh    --global --yes --forge=github
./install-dsh.sh      --global --yes --forge=github
```

For project scope, use `--target /absolute/repository/path` (Devin, Droid, and DSH use
`--project[=DIR]`). Cursor intentionally requires explicit
`--target` for project materialization. Start a fresh runtime session after installation so native
commands and skills are rediscovered.

Carrier, configuration, hook, scope, precedence, and upgrade details:

- [OpenCode edition](opencode-edition.md)
- [Kimi edition](kimi-edition.md)
- [Grok edition](grok-edition.md)
- [Cursor edition](cursor-edition.md)
- [ZCode edition](zcode-edition.md)
- [Devin edition](devin-edition.md)
- [Droid edition](droid-edition.md)
- [DSH edition](dsh-edition.md)

## Cursor Cloud

Cursor Cloud cannot inherit the local machine installation. Use an environment-setup Agent in the
selected repository and run both the global and repository transactions inside that environment:

```bash
./install-cursor.sh --global --yes --forge=github
./install-cursor.sh --target "$PWD" --yes --forge=github
node scripts/kaola-workflow-global-contract.js install-cloud --target "$PWD" --json
```

Verify the setup output, save the successful environment as an Active Build, then start a **new
top-level Agent** for the same repository from that saved Build. An old Agent, a Draft Build, or a
subagent does not prove that the saved environment is active. Before using repository tools in the
fresh Agent, check that its visible Build identity and no-tool response expose the installed project
contract. See [Cursor edition](cursor-edition.md) for the measured CLI/App/Cloud boundaries.

## Forge prerequisites

GitHub is the default. GitLab and Gitea select forge-shaped claim, issue, PR/MR, and closure scripts;
they do not change role behavior. Pass the same forge to every forge-aware installer. Codex selects
the forge through one of its three plugin names.

Authentication and repository permissions remain owned by the native forge tooling. Installation
does not create credentials or authorize destructive repository operations.

## Update and verify

Converge from a fast-forwarded checkout:

```bash
cd ~/kaola-workflow
git pull --ff-only
./install-all.sh --yes --forge=github
./install-all.sh --check
```

For Codex, a version-keyed plugin cache may need an explicit remove and add before the active plugin
root carries the new release:

```bash
codex plugin remove kaola-workflow@<marketplace>
codex plugin marketplace remove <marketplace>
codex plugin marketplace add ~/kaola-workflow
codex plugin add kaola-workflow@<marketplace>
node <active-plugin-root>/scripts/install-codex-agent-profiles.js --global
```

Use the forge-matching plugin name. Reapprove changed hooks, rerun the doctor, and open a fresh
session. A local-path marketplace is refreshed by remove/add; `marketplace upgrade` is for a remote
Git source and is not the local-path replacement.

Cursor Cloud updates repeat its setup transaction, Save Build, and fresh top-level Agent sequence.
Local `install-all.sh` correctly reports that remote target as `REMOTE_REQUIRED`.

## Upgrading from releases that installed Kaola role profiles

Kaola-Workflow ships no subagent role profiles ([ADR 0029](decisions/0029-native-subagents-only.md),
#1101). Earlier releases installed them for Claude Code, Codex, Grok, Cursor, ZCode, Devin, Kimi,
and OpenCode. Every one of those installers now retires them instead. Install, reinstall, upgrade,
and (where the runtime has one) uninstall remove a retired profile only when the evidence proves
Kaola wrote it and it is unchanged:

- **Ownership record**: the directory's ownership record lists the file with the sha256 the file
  still has. For Claude Code and Kimi, which stamped `kaola-workflow-managed-agent: true` into every
  recorded file, the file must also still carry that marker.
- **Released render**: the file's bytes equal a profile that some Kaola release installed for that
  runtime. The digests are frozen in `scripts/kaola-workflow-retired-agents.js` (Codex:
  `RELEASED_PROFILE_SHA256` in its installer) and never extended; how they were collected is
  recorded in `scripts/fixtures/issue-1101/PROVENANCE.md`.

Only files named after a role that some release installed, or listed in the record, are considered
(Codex: every `.toml` in the Kaola-owned `.codex/agents/kaola-workflow/`). Any other file in a
shared agents directory is neither touched nor reported. Symlinks and other non-regular entries are
never followed. A readable ownership record is removed once it has been read. Each decision is
reported, one line per path:

```text
Removed retired Kaola-Workflow agent: <path>
Removed retired Kaola-Workflow agent record: <path>
Preserved retired Kaola-Workflow agent (<reason>): <path>
```

| Reason | Meaning |
|---|---|
| `modified_since_install` | The record lists the file, but its bytes (or its managed marker) changed after install. |
| `no_ownership_record` | No record lists the file and its bytes are not a released render: a copied or edited profile, or your own file under a Kaola role name. |
| `non_regular` | A symlink or other non-file entry, or an agents directory or record that is not a regular directory or file. |

A preserved file does not fail anything: the retirement step exits 0 and the install or uninstall
continues. From then on the file is yours. Review each reported path and delete it by hand if you no
longer want it. The record is gone after the first run, so a later run reports that same file as
`no_ownership_record`. A shell installer stops with a `… sweep failed for <dir>` error only when the
retirement step itself cannot run (a usage or I/O error). `uninstall.sh` prints a warning in that
case and continues. `./install-all.sh --yes` runs every one of these installers at global scope. A
project scope migrates when that project is reinstalled at project scope (for example
`install-all.sh --project=DIR --yes`).

Nothing is resurrected. No installer deploys an agents directory, even when a stale generated
edition tree or an older plugin source still contains profiles.

Per runtime:

- **Claude Code**: `install.sh` and `uninstall.sh` retire `${KAOLA_AGENT_DIR:-~/.claude/agents}`
  against `.kaola-workflow-agent-manifest`, or by the released-render proof: a file whose bytes are
  a Claude profile some release tracked or installed (for example a `docs-lookup.md` left with no
  manifest row by an install between 2026-06-09 and 2026-07-25) is removed. The agent model manifest
  `.kaola-agent-models.json` that older installs wrote is deleted, reported as
  `Removed retired agent model manifest: <path>` on install and
  `Removed agent model manifest: <path>` on uninstall.
- **Codex**: `install-codex-agent-profiles.js` keeps its name because `install-all.sh`, the
  preflight, and older plugin caches invoke it. In the target scope (the home directory under
  `--global`, or a project root) it retires `.codex/agents/kaola-workflow/*.toml` and the
  `.kaola-managed-profiles.json` record, and strips the `# BEGIN/END kaola-workflow agents` block
  from `.codex/config.toml` only when the block's body is exactly one a release wrote. Codex itself
  writes hook-trust tables (`[hooks.state."…"]` with `trusted_hash = …`) inside that block; they
  are not part of the proof, and they stay byte-for-byte where the block was. The record is kept
  while any profile it proves is kept, so a later run can still retire that profile. It reports
  that block separately:

  ```text
  Removed retired Kaola-Workflow agent registrations: <config.toml>
  Preserved retired Kaola-Workflow agent registrations (<reason>): <config.toml>
  ```

  Codex adds these reasons: `referenced_by_user_config` (a `config_file` entry left in that
  `config.toml` still points at the profile, so it is kept), `unsupported_record` (the record is
  unparseable or has a newer schema), `ambiguous_markers` (the marker lines are not one well-formed
  pair), `mixed_managed_block` (the block's body, apart from Codex's own `hooks.state` tables, is not one
  a release wrote), and `not_writable`
  (the block would be removed, but `config.toml` cannot be written; every profile it still
  registers is kept with it). `config.toml` is always written before any profile is deleted. A
  scope whose `.codex` (or any directory between the scope root and it) is a symlink is kept
  whole and reported as `non_regular`; a symlinked `~/.codex` makes `--global` refuse with
  `install_target_unsafe` before touching anything. Pre-rename
  `codex-workflow` leftovers (`.codex/agents/codex-workflow/*.toml` and a
  `# BEGIN codex-workflow agents` block) are only reported, as `no_ownership_record`. Files under
  `CODEX_HOME` are not a retirement target and are left untouched.
  `kaola-workflow-codex-preflight.js` reports any remaining profile, record, or block as
  `retired_role_residue` (exit 1). Without `--no-autofix` it runs this installer for each such
  scope. If the installer preserved files, the preflight exits 1 with `autofix_attempted: true` and
  a repair telling you to review and delete them by hand. `--doctor` only reports.
- **Grok**: `install-grok.sh` and its `--uninstall` retire `<scope>/agents`, where the scope is
  `${GROK_HOME:-~/.grok}` or `<project>/.grok`. There is no record, so only the released-render
  proof applies.
- **Cursor**: the proof is a receipt row `agents/<name>.md` whose digest the file still has, or a
  released render (receipt-less v10.0.1-era installs). Install, `--ensure-target`, and `--uninstall`
  all retire, and Cursor prints the report lines on stderr. The `agents/` receipt rows are consumed
  and never carried into a new receipt, and an `agents/` row in an older receipt never makes the
  global authority stale. A project's `.cursor/agents` migrates the next time that project is
  materialized after the global upgrade: `install-cursor.sh --target DIR`, or the installed
  `kaola-workflow-cursor-surface.js --ensure-target DIR`.
- **ZCode**: install and `--uninstall` retire both the staged `<project>/.zcode/agents` and
  `${ZCODE_HOME:-~/.zcode}/agents`, on the released-render proof only. The managed marker alone is
  not proof.
- **Devin**: install retires `${DEVIN_CONFIG_DIR:-~/.config/devin}/agents` or
  `<project>/.devin/agents` on the released-render proof. There is no Devin uninstaller.
  `install-devin.sh --check` fails only while a released profile is still installed. It prints
  `Retired Kaola-Workflow agent still installed: <path>` and
  `check: retired Kaola agent profile still installed under <dir>`; rerun the install to clear it. A
  kept, edited profile does not fail `--check`.
- **Kimi**: install and `--uninstall` retire native agents in `<scope>/agents`, where the scope is
  `${KIMI_CODE_HOME:-~/.kimi-code}` or `<project>/.kimi-code`, against
  `.kaola-workflow-agent-manifest` (with the managed marker) or a released render. They also retire
  the role Skills of every release that shipped them, `<scope>/skills/kaola-role-<role>/`: a Skill
  directory is removed only when it holds exactly one `SKILL.md` whose bytes are a released render.
  Any other `kaola-role-*` entry is kept and reported.
- **OpenCode**: install and `--uninstall` retire `<layout>/agents` and the retired singular
  `<layout>/agent`, each against its `.kaola-workflow-agent-manifest` or a released render. The
  layout is `<project>/.opencode` or `<config>` (`${OPENCODE_CONFIG_DIR:-~/.config/opencode}`);
  `--global` also retires the nested `<config>/.opencode/agent` that the v6.7–v6.8 global installs
  wrote. `opencode.json` is never edited: its `agent.<role>` entries carry no ownership evidence, so
  each one under a Kaola role name is only reported. Remove it by hand if you do not want it:

  ```text
  Preserved retired Kaola-Workflow agent binding (no_ownership_record): <opencode.json> agent.<role>
  ```

Droid and DSH have no retirement step.

## Uninstall

Each runtime has its own uninstaller, and it writes only to that runtime's surfaces. Remove the
Claude forge editions (only what `install.sh` wrote under `~/.claude`):

```bash
./uninstall.sh --forge=all
```

Remove an additive runtime from the same scope in which it was installed:

```bash
./install-opencode.sh --global --uninstall
./install-kimi.sh     --global --uninstall
./install-grok.sh     --global --uninstall
./install-cursor.sh   --global --uninstall
./install-zcode.sh    --global --uninstall
./install-droid.sh    --global --uninstall
./install-dsh.sh      --global --uninstall
```

Use `--target /absolute/repository/path --uninstall` for project scope. These uninstallers remove
only Kaola-owned, provenance-safe artifacts and preserve foreign or modified owner bytes.

A global-scope uninstall also strips that runtime's own global-contract carrier through its own
per-target record (`kaola-workflow-global-contract.js uninstall --runtime <runtime> --json`): the
dedicated Rule file is deleted, or the managed region is cut out of `AGENTS.md` with the owner bytes
around it restored. The record goes with it, and the runtime's reference on the shared config block
is released. A carrier edited since install is refused with `OWNER_CONFLICT`, left in place, and
reported as a warning; no other runtime's carrier or record is touched. A project-scope uninstall
leaves the machine-global carrier alone. `uninstall.sh` removes Claude's carrier
(`~/.claude/rules/kaola-workflow-global.md`) once no Claude edition remains, and
`install-codex-agent-profiles.js --global --uninstall` removes Codex's managed region in
`~/.codex/AGENTS.md`.

Devin has no uninstaller yet. To remove only its carrier, run
`node scripts/kaola-workflow-global-contract.js uninstall --runtime devin --json`; its skills,
support scripts, and hook entry must be removed by hand.

Remove Codex with its own installer entry point, then remove the plugin through its native command.
`--global --uninstall` retires the global role profiles, their record, and the
`# BEGIN/END kaola-workflow agents` block in `~/.codex/config.toml` with the same proof the install
uses. It also removes the `kaola-workflow:` entries in `~/.codex/hooks.json` (other entries and the
file itself stay), the hook home `~/.codex/kaola-workflow`, and Codex's managed region in
`~/.codex/AGENTS.md`. A project-scope uninstall retires only that project's profiles and block; the
global hooks serve every Codex scope and stay until the global uninstall. A profile or block that
cannot be proven Kaola's and unchanged is preserved and reported:

```bash
node ~/kaola-workflow/plugins/kaola-workflow/scripts/install-codex-agent-profiles.js --global --uninstall
node ~/kaola-workflow/plugins/kaola-workflow/scripts/install-codex-agent-profiles.js <project-root> --uninstall
codex plugin remove kaola-workflow@<marketplace>
```

### Shared blocks and references

`~/.config/kaola-workflow/config.json` (for example `pr_auto_merge`) is read by every runtime, so it is
a shared block. `scripts/kaola-workflow-shared-refs.js` records which runtimes reference it in
`~/.config/kaola-workflow/shared-refs.json`, keyed by runtime id. A reinstall never adds a second
reference, and a runtime installed in several scopes (`global`, `project:<abs path>`) holds one
reference carrying its scopes. Each uninstaller above releases its own reference (`uninstall.sh`
releases `claude` once no Claude edition remains). Installs register through their carrier step,
which holds the `global` scope. The config file is removed only when the
last reference is released, and the registry itself is removed after every block reaches zero.
A machine with no registry record is left alone, because no uninstaller can prove it is the last user.

**Upgrading from a release before #1087.** Runtimes installed before this change hold no reference
record. Run `./install-all.sh --yes` (or reinstall each runtime) to seed their references. Until
then, uninstalling every re-registered runtime may remove the shared config block that an older,
non-reinstalled runtime still reads.

A refused carrier release (`OWNER_CONFLICT`, because the carrier was edited since install) is
reported as a warning. It does not fail the uninstall, which exits 0 once its own surfaces are
removed.

```bash
node scripts/kaola-workflow-shared-refs.js list --block kaola-config
node scripts/kaola-workflow-shared-refs.js register   --runtime <id> --scope global
node scripts/kaola-workflow-shared-refs.js deregister --runtime <id> --scope project --target <dir>
node scripts/kaola-workflow-shared-refs.js remove-all --operator-override   # machine-wide removal; ignores references
```

The module exports `registerSharedRef(blockId, runtimeId, meta?, opts?)`,
`deregisterSharedRef(blockId, runtimeId, opts?)` (returns `{ remaining, holders, released, cleaned,
registryRemoved }`), `listRefs(blockId?, opts?)`, `onZeroRefs(blockId, fn)`,
`operatorRemoveAll({ operatorOverride: true })`, the install-side helper
`installSharedConfigBlock(runtimeId, meta?, opts?)` (registers only; never creates or rewrites the
config file), `registryPath(home?)`, and `CONFIG_BLOCK_ID` (`kaola-config`). `CONFIG_BLOCK_ID` is
the only spelling of the block id: the CLI uses it when `--block` is omitted, and the global-contract
transaction imports it for its per-target references.

Cursor Cloud Build deactivation or deletion is an external environment decision and is not performed
by the local uninstaller.
