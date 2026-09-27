# Kaola-Workflow · cursor Edition

The cursor edition makes Kaola-Workflow runnable from
[Cursor](https://cursor.com), the same way the Grok edition makes it runnable
from Grok CLI. Cursor is a coding-agent **runtime** (like Codex, opencode, Kimi,
and Grok), not a git forge, so this edition is delivered the Cursor-native way —
flat slash **commands** under `.cursor/commands/` and an empty Kaola hook mapping in
`.cursor/hooks.json`. The separate global
transaction owns the one persistent Rule. The edition is fully **additive**: it touches none of
the existing `claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi`/`grok` edition
machinery.

Cursor's official hook contract cannot supply one universal post-compact injection: Cloud does not
support `sessionStart`, and `preCompact` cannot modify the model context. Official project Rules are
system-level prompt context, and repository Rules apply to Cloud Agents using that repository. The
global transaction therefore renders one V2 `alwaysApply` Rule: local CLI/App share the user Rule;
Cloud setup explicitly materializes identical bytes in the selected repository. No Kaola
prompt-lifecycle hook is installed.
Cursor CLI and Cursor App are separate product surfaces; App local IDE and App-started Cloud are
different execution hosts and must not be inferred from each other or from a CLI binary.
Standalone CLI, local App/IDE, and App-started Cloud Task catalogs were each measured separately.
Cloud sees project carriers only after its environment setup Build materializes the selected
repository; checked-in files and a saved user-global-only Build were both negative controls.
See
[runtime capabilities](runtime-capabilities.md#cursor).

## Agent-led Cloud installation

Cursor Cloud installation is a saved-environment workflow, not a command run once inside an
arbitrary task VM. `install-all.sh` installs only the computer where it runs and never deploys a
Cloud environment:

1. Open the target repository's environment setup in Cursor Cloud and ask that setup Agent to
   install Kaola-Workflow for the Cloud machine and the selected repository. Only after the Agent
   has established that it is in Cursor Cloud environment setup may it take this path.
2. The setup Agent installs the remote authority with `./install-cursor.sh --global --yes
   --forge=github`, explicitly materializes the selected repository with
   `./install-cursor.sh --target "$PWD" --yes --forge=github`, runs
   `node scripts/kaola-workflow-global-contract.js install-cloud --target "$PWD" --json`, and runs a
   test Build. It verifies
   the exact candidate, both receipts, the authority binding, collision safety, and idempotence,
   then reports the exact Build ID.
3. The setup agent asks the user to click **Save** in Cursor. A green setup VM, snapshot, or draft
   Build is not a persisted production environment until that user action succeeds.
4. Select the saved environment and open a new top-level Cloud Agent in the same repository. Verify
   its **View build details** link equals the reported Build ID, then inspect the fresh parent's live
   catalog and continue work.

The saved environment, same-repository launch, visible Build identity, and live catalog together
prove that the intended environment loaded. This follows Cursor's documented
[environment resolution](https://cursor.com/docs/cloud-agent/setup) and
[Build lifecycle](https://cursor.com/docs/cloud-agent/builds).

Cursor reads root and nested `AGENTS.md` directly, combining parent guidance with more-specific
instructions. Kaola installs no project-instruction bridge for Cursor. Generated commands and the
empty hook mapping are Cursor adapter data, not a copy of the universal contract.
See [runtime capabilities](runtime-capabilities.md#cursor) for first-party evidence and limits.

## Forge axis

The runtime is not a forge, but the workflow *prose* is forge-shaped (`gh` vs
`glab` vs `tea`, pull requests vs merge requests, per-forge support-script
basenames), so `install-cursor.sh` takes `--forge=github|gitlab|gitea` (default
`github`) and a GitLab/Gitea project receives a forge-correct edition rather
than GitHub-shaped commands.

The forge variants are **generated, never hand-ported**. `sync-cursor-edition.js`
renders each forge from the routing-surface registry
(`scripts/generate-routing-surfaces.js`, via `scripts/runtime-edition-forge.js`).
github renders the bare `.cursor/` tree; a forge renders the sibling
`.cursor-<forge>/`. All generated trees are gitignored build artifacts. The
installer copies a forge tree **into live `.cursor/`** — Cursor does not scan
`.cursor-gitlab/`.

```bash
./install-cursor.sh --target DIR --forge=gitlab # GitLab-shaped explicit project edition
node scripts/sync-cursor-edition.js --forge=gitea --check
```

**Additive is unchanged by this.** Being additive is about edition *machinery*,
not forge support: the edition stays out of `npm test`, `edition-sync.js`,
`install.sh`, and the routing-surface `--check` contract, and keeps its own
suite. The mandated `generate-routing-surfaces.js --write` still refreshes a
tree that already exists, and creates none. An unknown `--forge` value is
refused, never silently defaulted to github.

## What gets generated

Everything under `.cursor/` is **generated from canonical** by
`scripts/sync-cursor-edition.js` and parity-checked by
`scripts/test-cursor-edition.js`:

| Canonical source | cursor edition output | Notes |
| ---------------- | --------------------- | ----- |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). The marked runtime dispatch block becomes a one-line pointer to the always-loaded Rule, which carries the dispatch contract and adapter facts. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| global contract + compact skeleton + Cursor adapter | local `$CURSOR_HOME/rules/kaola-workflow-global.mdc`; Cloud `.cursor/rules/kaola-workflow-global.mdc` | One `alwaysApply: true` V2 Rule contains the universal contract, complete operation reload route, mandatory dispatch contract, and Cursor adapter. The global transaction owns it; the edition emits no duplicate Rule. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). Kaola emits an empty mapping and removes receipt-owned legacy prompt hooks; foreign hook entries survive merge. |

## Subagents are Cursor's own

Kaola-Workflow defines no subagent roles, role profiles, or subagent model or effort bindings
([ADR 0029](decisions/0029-native-subagents-only.md), #1101), so the edition generates no agents:
`sync-cursor-edition.js --write` renders commands and prunes the retired `agents/` files from a
generated tree. Before #1101 the edition rendered seven `.cursor/agents/` profiles pinning one model
and effort.

The Rule's Cursor adapter carries the native route: dispatch with `Task`, whose `subagent_type`
names a type from the live catalog. Measured hosts exposed writable `generalPurpose` and
host-specific built-ins; some hosts document scoped `Explore`, `Bash`, or `Browser`. Use only a
route this host reports, under its real identity and capability. The live Task catalog is
authoritative; CLI, App local, and App Cloud are separate hosts, and a CLI catalog reload requires
a new process. Explicit, automatic, parallel, and resume-by-agent-ID paths remain runtime-owned
options.

Cursor's official model contract says `model` is either `inherit` or an exact model ID, bracket
parameters carry options such as effort, and a custom subagent that omits `model` inherits the
parent; team policy, legacy-plan settings, or plan availability may force a compatible fallback.
Kaola pins no child model: the host's defaults and the user's configuration decide. Public
documentation does not establish one portable Task call schema, so a call is built only from the
live schema's flat fields; Kaola invents none, such as a parent-authored `subagentType.custom.name`.
When the host exposes `providerOptions.cursor.modelName`, that value is post-dispatch provider
evidence for the resolved child; the TUI child transcript alone is insufficient.

Kaola installing no profile is never evidence that Cursor lacks subagent capability. Dispatch or
inline work is decided per mission item, and a cohesive production owner does not absorb
independent research, test authorship, documentation, or review.

### Historical catalog probes

On 2026-08-27/28, before #1101, standalone CLI, local App/IDE, and App-started Cloud catalogs were
measured separately while Kaola still installed Cursor profiles. The native boundaries they
established still hold; details are in [runtime capabilities](runtime-capabilities.md#cursor).

- **Standalone CLI** `2026.08.25-3e8eec8`: writable `generalPurpose` appeared as
  `subagentType.unspecified`; parallel Tasks and one descendant dispatch generation worked. A
  project custom profile was reachable while a user file alone was not visible in an empty project,
  and reopening the CLI process with the same chat discovered an added project profile;
  same-process hot load remains unknown.
- **App local IDE** `3.17.21`: the live catalog exposed built-ins plus project custom types; the
  child model, effort, and profile source were not exposed, so App global discovery,
  project-materialization necessity, and reload remain unknown.
- **App-started Cloud**: without an installed environment Build the Task enum stayed built-in-only
  (`generalPurpose`, `explore`, `computerUse`, `videoReview`, `cursor-guide`, `bugbot`,
  `security-review`, `best-of-n-runner`), even with project files git-tracked on the selected
  branch or user-global files in a clean saved Build
  (`bld-20260827-1fd163c3-a8f2-475d-9603-7da988673ee3`). `generalPurpose` accepted omit-model,
  `inherit`, and resolver-listed `cursor-grok-4.6-high-fast`; `cursor-grok-4.6-high` was
  resolver-rejected. After the environment-setup Build
  `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2` materialized the selected repository and the
  user saved it, a new same-repository parent (`bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d`) visibly
  used that Build and exposed its project custom types. The Cloud child model remains unobservable.

Kaola's project install requires `--target DIR` and writes that project's `.cursor/commands`.
`--global` writes only `${CURSOR_HOME:-$HOME/.cursor}/commands` (un-nested) and its
`kaola-workflow/` support tree, and does **not** write an ambient Git repository; existing project
`.cursor` files are left untouched, and `--global` from a non-git cwd does not invent project
`.cursor`. A normal install renders the generated source into an isolated temporary staging root
and removes it after the transaction; only explicit `--regenerate` writes the in-repository
generated tree. Project carriers are never selected from the ambient cwd of a `--global` command.
Cloud user-global discovery alone is unsupported; the measured Cloud carrier is a receipt-owned
project materialization installed by its confirmed environment-setup Agent before the Build is
saved.

For the measured standalone CLI/local host only, Workflow `startup` and `resume` run Repo prep
through the installed helper
`${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js`
`--ensure-target <target>` with that edition's install-authority `--forge=` (`github` on
`scripts/kaola-workflow-claim.js` and the Codex COMMON_SCRIPTS copy, `gitlab` on
`kaola-gitlab-workflow-claim.js`, `gitea` on `kaola-gitea-workflow-claim.js`) and `--json`. `--forge`
is not a claim.js operator flag. The
`applyDemonstratedCursorCliHost` / `ensureCursorCliLocalPrep` path exists on all four claim trees
(canonical GitHub `scripts/kaola-workflow-claim.js`, COMMON_SCRIPTS Codex copy, GitLab hand-port,
Gitea hand-port). Generated Next keeps one `.cursor/commands/workflow-next.md`. Generated
startup/resume fences do not stamp `--product cli --host local`. The documented CLI-positive first
claim fence is unstamped
`node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"`. Explicit
`--product`/`--host` still win. When `--runtime cursor` and both are omitted, claim.js stamps
`product=cli`, `host=local`, and `cursorWorkspace=<opened dir>` in-process before the single claim,
and on resume without re-claim, only when a living ancestor is a CLI-shaped executable
(`…/YYYY.MM.DD-<hash>/index.js` or `cursor-agent`) **and** `--workspace <opened dir>` that shares
git identity with cwd; then ensure runs against that dir. Generic `--workspace` on an unrelated
tool is not CLI and skips ensure. `--worker-dir` present, with or without `--workspace`, is
App-like and skips ensure. No `--workspace` is unknown and skips. Darwin unquoted `ps args=`
reconstitutes `--workspace` as the remainder until the next `--<flag>` (full path including
spaces); Linux `/proc` NUL cmdline is unchanged. Real Cursor CLI `2026.09.02-c22c1a3` does not
export `CURSOR_PRODUCT`, `CURSOR_HOST`, `KAOLA_CURSOR_*`, or `CURSOR_WORKSPACE`. Operators do not
pre-export those names. There is no `cursorCliHostGateOpen`. Resume is one unstamped fence:
`kaola_script` / `CLAIM_JS=` outside any `if`, then `node "$CLAIM_JS" resume --runtime cursor`.
Those claim.js no longer `unknown_flag`. `--forge` is not a claim.js flag. Claim.js `<target>` is
`--cursor-workspace` when set (including the stamped opened dir), else recorded `main_root` on
resume, else invoking `getRoot()` (`git rev-parse --show-toplevel`) on first claim — not nested
cwd and not the write-worktree unless they are that demonstrated opened dir. Repo prep
materializes the project's commands, Rule, and hooks, never agents; there is no pre-dispatch
materialization before a child, and Finalize runs no `--ensure-target`. The premise that the CLI
needs this project materialization (CLI global discovery `unsupported`) was measured on
2026-08-27 against Kaola's named agents and has not been re-measured since #1101 removed them;
the behavior is kept unchanged until a new probe of commands, the Rule, and hooks decides it. The
helper derives project bytes only
from the receipt-verified global authority, returns `current` without writing when already fresh,
returns `materialized` when it safely writes (the claim/resume `cursor_prep` report carries
restart_boundary `new_process_same_chat`), and
fails before mutation on missing/stale authority, collision, symlink, invalid receipt, or modified
ownership. File-ready `materialized` bytes are not live Task catalog proof or same-process hot-load
proof. Cursor App local IDE and App-started Cloud do not inherit that CLI rule. Cloud uses the
confirmed environment-setup machine-plus-repository/install/save/same-repository-new-parent
lifecycle above. Recovery is owned separately: the global transaction writes the local CLI/App Rule
and explicitly materializes the Cloud selected-repository Rule. There is no `sessionStart`
materializer and no `--global` dual-write.

Compact recovery is Rule behavior. CLI project bytes are prepared at Workflow startup/resume from
all four claim trees when identity is `cursor`/`cli`/`local` after explicit argv or
`applyDemonstratedCursorCliHost` (CLI-shaped executable **and** `--workspace`; `--cursor-workspace`
when set, else recorded `main_root` on resume; first-claim fallback in claim.js is still invoking
`getRoot()`). The documented generated CLI-positive fence stays unstamped `--runtime cursor`.
The Rule supplies model-visible operation and dispatch instructions;
the main checkout's mission ledger (`kaola-workflow/.ledger/issue-<N>.jsonl`) remains durable run
authority after a local, CLI, or Cloud restart. On-disk
materialization is not live Task-catalog proof.

## Path selection

On the cursor edition, the router routes directly to the adaptive workflow. Generated commands
replace the runtime dispatch block with the pointer to the always-loaded Rule; canonical
`commands/*.md` is never touched.

## Installer

`install-cursor.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Cursor runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime on this computer" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the sixth
> leg of its nine-runtime sequence, with a per-runtime PASS/FAIL summary.
> `--global` inherits this installer's user-home-only Cursor layout: it is not
> permission to update every consumer repository. Project `.cursor` carriers
> need an explicit `--target` or `install-all.sh --project`. The installer no longer installs
> Kaola role profiles; see [Installation](installation.md) for upgrade and uninstall. Cursor Cloud
> must rebuild its saved environment before an upgrade takes effect there — an old Build keeps
> serving what it installed. It never installs or
> updates Cursor Cloud; that path begins only inside a confirmed Cursor Cloud
> environment-setup Agent and uses the installer directly. It stays a thin
> orchestrator — it does **not** fold Cursor into
> `install.sh`/`edition-sync.js`/`npm test`.

```bash
./install-cursor.sh --target /path/to/repo  # deploy into a specific project
./install-cursor.sh --global                # isolated render → ${CURSOR_HOME:-~/.cursor}; no ambient git write
./install-cursor.sh --doctor --json         # report product/host surface facts; does not install
./install-cursor.sh --regenerate            # refresh in-repo .cursor/ from canonical, then exit
./install-cursor.sh --global --uninstall    # remove the receipt-proven global edition
./install-cursor.sh --target DIR --uninstall # remove a receipt-proven project materialization
```

Add `--yes` for non-interactive use. `--no-scripts` skips writing support scripts and the hooks JSON
merge; the edition owns no persistent Rule. It retains receipt ownership for any skipped
managed assets that remain on disk, so later uninstall still removes unchanged bytes and exact hook
entries. A fresh
no-scripts authority is deliberately partial; a later default project install promotes it before
materializing default scripts without touching foreign hook entries. Normal install creates a transaction-scoped staging root and
invokes `sync-cursor-edition.js --write --tree-root=<absolute empty staging path>`; the cleanup trap
removes that source after success or failure. `--regenerate` alone resolves and refreshes the
main-checkout generated tree.

A receipt-less 10.0.1 global installation has a bounded migration path. Only exact published
per-forge hashes may be adopted; the three old command renders, two changed support scripts, and
retired ambient ensure files are pinned independently for GitHub, GitLab, and Gitea. The installer
preflights the complete target first, removes retired files and stale hook entries only when their
published hashes prove ownership, and writes the first authority receipt. Any modified byte,
symlink, non-regular carrier, or unknown path remains an unmanaged collision. Isolated live upgrade
probes passed for all three forges.

- **PROJECT** (`--target DIR`): commands land under `<project>/.cursor/commands` from the
  installed global authority. The empty Kaola
  mapping is **merged** into `<project>/.cursor/hooks.json`; this retires old Kaola prompt hooks while
  other events, e.g. `beforeShellExecution`, stay.
  A project install does **not** merge into `~/.cursor/hooks.json` — Cursor has
  project-scoped hooks. This is the explicit project materialization. It is never
  selected from ambient cwd of a `--global` command. The receipt
  `.cursor/kaola-workflow-materialization.json` binds target, forge/version, authority hash, and
  every managed file hash.
- **GLOBAL** (`--global`): commands land under `${CURSOR_HOME:-$HOME/.cursor}/commands`
  with **no** nested `.cursor/` directory. The empty Kaola mapping is merged into
  `${CURSOR_HOME:-$HOME/.cursor}/hooks.json`, preserving foreign entries.
  Running `--global` inside a Git work tree does **not** create or refresh that
  repository's `.cursor/` tree. Project `.cursor/` files that already exist are left untouched.
  `--global` from a directory with no git toplevel does not invent a project `.cursor/`
  tree. The authority receipt
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/cursor-authority.json` binds the exact managed
  files, modes, hashes, forge, and Kaola-Workflow version.
  The same receipt owns
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/templates/agents/runtime-capabilities.json`, copied
  byte-for-byte from the single adapter registry. The installed helper reads that file, so its
  doctor does not depend on a repository checkout.
  `--doctor` reports product (`cli`/`app`/`unknown`) and host (`local`/`cloud`/`unknown`)
  facts without installing and never infers one surface from a sibling binary. Its unqualified
  current `runtime_build` stays `unknown` without live observation; measured historical facts
  remain under `evidence_stamp` and `selected_host`.
- By default, support scripts land under
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`.
  `kaola-workflow-cursor-surface.js` is both the filesystem/evidence doctor and the explicit
  authority/materialization transaction. Its installed `--ensure-target DIR` mode has no
  ambient-target default. Standalone CLI/local Workflow `startup`/`resume` spawn that mode from
  all four claim trees after `applyDemonstratedCursorCliHost` when identity is `cursor`/`cli`/`local`
  (explicit argv, or omitted product/host plus a living CLI-shaped ancestor **and** `--workspace`
  that shares git identity with cwd), against `--cursor-workspace` when set, else recorded
  `main_root` on resume, else invoking `getRoot()` on first claim in claim.js. Generic `--workspace`
  on an unrelated tool, or `--worker-dir` present with or without `--workspace`, skips ensure. The
  documented generated CLI-positive fence is unstamped `--runtime cursor`; operators do not
  pre-export `CURSOR_PRODUCT`/`CURSOR_HOST`/`KAOLA_CURSOR_*`/`CURSOR_WORKSPACE`. Helper spawn is
  that edition's install-authority `--forge=` (`github` / `gitlab` / `gitea` on the matching
  claim tree); `--forge` is not a claim.js operator flag.

`--uninstall` removes only receipt-proven files whose current hash still matches and strips only
receipt-recorded Kaola entries from `hooks.json`. Modified, unmanaged, symlink, non-regular, and
invalid-receipt paths are preserved. It never deletes the user's `hooks.json` file.

## Machine-global recovery Rule and empty hooks

Cursor Rules are system-level prompt context. The global transaction's V2 Rule has
`alwaysApply: true` and contains the vendor-neutral contract, the durable-state operation reloader,
the mandatory dispatch contract, the Cursor adapter, and `KW-COMPACT-RECOVERY-V2`. It completely
reloads the installed Workflow Next or Finalization prompt after rereading the durable run files.

Local Cursor CLI and App share `$CURSOR_HOME/rules/kaola-workflow-global.mdc`; Cloud cannot inherit
that machine, so setup explicitly writes identical bytes to the selected repository's
`.cursor/rules/kaola-workflow-global.mdc`. Cloud does not support `sessionStart`, and `preCompact`
can report compaction but cannot inject or alter context. The edition installer safely retires the
old `kaola-workflow-compact-recovery.mdc` instead of maintaining a second Rule.

The generated `.cursor/hooks.json` is therefore `{ "version": 1, "hooks": {} }`. Install merges
that absence by removing only recognized legacy Kaola prompt-hook entries; it preserves every
foreign event. There is no compact wrapper, PreToolUse, PostToolUse, or Stop script. Ordinary tool
use adds 0 Kaola recovery bytes and starts 0 Kaola recovery subprocesses. Project materialization
(Repo prep) is still the separate fail-closed CLI transaction described above.
