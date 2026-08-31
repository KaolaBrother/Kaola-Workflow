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

Change the forge to `gitlab` or `gitea` as needed. The wrapper installs the machine-global contract
before edition surfaces, continues through independent failures by default, and prints a per-runtime
summary. Useful controls:

```bash
./install-all.sh --check
./install-all.sh --yes --skip=claude,zcode
./install-all.sh --yes --strict
./install-all.sh --project=/absolute/repository/path --yes
```

`--check` is read-only. `--global` is the default for OpenCode, Codex profiles, Kimi, Grok, Cursor,
and ZCode; Claude has one runtime-wide install. `--project[=DIR]` selects project scope where the
runtime supports it. Run `./install-all.sh --help` for the current option contract.

The wrapper does not create or update a Cursor Cloud environment. It also cannot choose a first
Codex marketplace plugin for the user; Codex forge selection belongs to the installed plugin entry.

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

### OpenCode, Kimi, Grok, Cursor, and ZCode

Each additive installer accepts a forge, global or project scope, non-interactive mode, and removal:

```bash
./install-opencode.sh --global --yes --forge=github
./install-kimi.sh     --global --yes --forge=github
./install-grok.sh     --global --yes --forge=github
./install-cursor.sh   --global --yes --forge=github
./install-zcode.sh    --global --yes --forge=github
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

Remove all Claude forge editions:

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
```

Use `--target /absolute/repository/path --uninstall` for project scope. These uninstallers remove
only Kaola-owned, provenance-safe artifacts and preserve foreign or modified owner bytes.

Remove a Codex plugin through its native command. The shared Kaola uninstaller removes the global
hook home and removes Codex profiles/config from the directory scope in which it runs. Run it from
the project root for project scope, or from `$HOME` for the default global profile scope; it also
removes the corresponding Claude install, so use this only when that shared cleanup is intended:

```bash
codex plugin remove kaola-workflow@<marketplace>

# Project-scoped Codex profiles plus shared Claude/Codex assets.
cd <project-root>
~/kaola-workflow/uninstall.sh --forge=all

# Or global Codex profiles plus shared Claude/Codex assets.
cd "$HOME"
~/kaola-workflow/uninstall.sh --forge=all
```

Cursor Cloud Build deactivation or deletion is an external environment decision and is not performed
by the local uninstaller.
