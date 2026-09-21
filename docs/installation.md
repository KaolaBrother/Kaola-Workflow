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

`--check` is read-only and prints one `[global-contract] <runtime>: …` line per runtime. `--global` is the default for OpenCode, Codex profiles, Kimi, Grok, Cursor,
ZCode, Devin, and Droid; Claude has one runtime-wide install. `--project[=DIR]` selects project scope where the
runtime supports it. Run `./install-all.sh --help` for the current option contract.

The wrapper does not create or update a Cursor Cloud environment. It also cannot choose a first
Codex marketplace plugin for the user; Codex forge selection belongs to the installed plugin entry.


### Global contract carriers

Each runtime installer — `install.sh` and the Codex profile installer included — installs only its
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

The installer deploys commands, profiles, support scripts, and the compact-recovery hook. Restart
Claude Code after install or update. Choose `--forge=gitlab` or `--forge=gitea` for those editions.

### Codex

Codex separates marketplace registration, plugin installation, and profile/hook installation.
Register the local checkout, then install exactly one forge edition:

```bash
codex plugin marketplace add ~/kaola-workflow

# Choose exactly one.
codex plugin add kaola-workflow@kaolabrother-kaola-workflow
# codex plugin add kaola-workflow-gitlab@kaolabrother-kaola-workflow
# codex plugin add kaola-workflow-gitea@kaolabrother-kaola-workflow
```

Run the profile installer from the active plugin root, or run `./install-all.sh --yes` after the
plugin is present:

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
changed hook bytes require renewed approval. Exit that session, rerun the profile installer and
doctor, then start a fresh working session. Automation that has independently vetted the hook source
may use `codex exec --dangerously-bypass-hook-trust` for that run; it does not persist approval.

Kaola's named task dispatch requires the runtime's MultiAgentV2 feature. Keep user-owned Codex
configuration changes explicit and verify the live CLI because this capability is version-sensitive.
The current supported shape is:

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 5
```

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

For project scope, use `--target /absolute/repository/path`. Cursor intentionally requires explicit
`--target` for project materialization. Start a fresh runtime session after installation so native
commands and profiles are rediscovered.

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

For Codex, a version-keyed plugin cache may need an explicit remove and add before profiles are
refreshed:

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

Remove Codex with its own profile installer, then remove the plugin through its native command.
`--global --uninstall` removes the global profiles, the managed `[agents.*]` block in
`~/.codex/config.toml`, the `kaola-workflow:` entries in `~/.codex/hooks.json` (other entries and the
file itself stay), and the hook home `~/.codex/kaola-workflow`. A project-scope uninstall removes only
that project's profiles and config block; the global hooks serve every Codex scope and stay until the
global uninstall. A profile whose bytes no longer match the recorded hash is preserved and reported:

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
