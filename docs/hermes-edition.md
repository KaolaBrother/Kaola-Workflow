# Hermes edition

Kaola-Workflow delivers its workflow commands to Hermes Agent the Hermes-native way: directory-form
skills under `${HERMES_HOME:-~/.hermes}/skills/<name>/SKILL.md`, support scripts under
`${HERMES_HOME:-~/.hermes}/kaola-workflow/scripts`, and a managed machine-global contract region in
`${HERMES_HOME:-~/.hermes}/SOUL.md`. The support boundary is the measured local CLI (Hermes Agent
v0.22.5, issue #1124); ACP-driven KW runs are P3 and are not implemented here.

D1–D5 for this edition are owner-settled in #1124:

- **D1 = KW native delivery.** KW installs its own skills and support scripts; KPM does not install
  the same `$HERMES_HOME/skills/<name>` paths.
- **D2 = G-a.** The global contract is the `SOUL.md` managed region. Hermes has no
  `~/.hermes/AGENTS.md` global carrier; `SOUL.md` is its only always-loaded global file.
- **D3 = single forge + P1 resolver guard.**
- **D4 = global install only.** Project scope would require the owner to trust the repository in
  `skills.trusted_project_dirs`, and this installer never writes the owner's `config.yaml`.
- **D5 = `.kw-hermes[-<forge>]/` build trees.** Never `<repo>/.hermes/`, which is a Hermes-native
  project skill root.

## Measured roots (Hermes 0.22.5, 2026-10-28)

- `${HERMES_HOME:-~/.hermes}/skills/<name>/SKILL.md` — global skills. A flat top-level
  `skills/<name>/SKILL.md` is discovered. `name` and `description` frontmatter are accepted; the
  directory name is the fallback when `name` is absent.
- `${HERMES_HOME:-~/.hermes}/SOUL.md` — the identity slot, loaded independently and always. The
  installer writes only a `KW-GLOBAL-CONTRACT-MANAGED-*` region and preserves every owner byte
  outside it.
- `${HERMES_HOME:-~/.hermes}/kaola-workflow/scripts` — KW support scripts (the install-manifest
  set, including `kaola-workflow-forge-resolve.js`).
- `SOUL.md` is not a project file. Hermes also loads one project-instruction type, first found:
  `.hermes.md`/`HERMES.md` (walking up to the git root) → `AGENTS.md` chain → `CLAUDE.md` →
  `.cursorrules`.

## P0 facts this edition absorbs (MacBook, #1124)

- **M1 / instructions.** Project `AGENTS.md` loads directly; the git-root-to-cwd chain loads both
  root and nested files. **`HERMES.md` shadows `AGENTS.md`.** This edition never creates `HERMES.md`;
  a repository that keeps one should expect its `AGENTS.md` not to load. With an `AGENTS.md`
  present, `CLAUDE.md` is not read. The real KW worktree instructions loaded without a `BLOCKED`
  marker.
- **M2 / SOUL.** A managed region in `SOUL.md` entered both `-z` and chat sessions; `--ignore-rules`
  and `--safe-mode` skipped it. A user-authored `SOUL.md` line matching an injection rule warned
  but was loaded anyway because it is the owner's own file. The P0 probe file was restored
  byte-identically.
- **M3 / skills.** Flat skills were discovered; `/skill-name` expanded in CLI and ACP. A name that
  collides with a bundled skill in the same tier becomes ambiguous and the slash command is
  unavailable. The three KW names (`workflow-init`, `workflow-next`, `kaola-workflow-finalize`) do
  not collide with Hermes bundled names at v0.22.5 (source-checked against the installed tree; P0
  did not record this as a live row).
- **M4 / curator and update.** Copied KW skills have no provenance marker and are reported as
  **unmanaged**: the curator never auto-stales or archives them. `hermes update` seeds/updates only
  bundled-manifest skills, so it does not reseed or prune a non-bundled KW skill.
- **M5 / compaction.** A real `/compress` reduced 54 messages to 12. The `SOUL.md` region and project
  `AGENTS.md` survived; the **invoked skill body did not** survive verbatim. Recovery is explicit
  skill re-invocation (`/workflow-next` or `/kaola-workflow-finalize`), which resumes from the
  durable mission ledger and workflow state. The edition therefore keeps the dispatch contract
  inline in the skill and is not an always-loaded dispatch-recovery runtime.
- **M9 / home and profile.** `hermes config path`, `hermes profile list` (the `◆` marker), and the
  plain `~/.hermes/active_profile` file identify the effective home/profile without secrets. When
  `HERMES_HOME` is unset and a non-default profile is sticky-active, Hermes warns that it would fall
  back to the default home; this installer refuses instead of guessing.

## Install, check, uninstall

```sh
./install-hermes.sh --global --yes --forge=github   # only supported scope
./install-hermes.sh --global --check                # verify owned artifacts only
./install-hermes.sh --global --uninstall            # remove only Kaola-deployed artifacts
node scripts/kaola-workflow-global-contract.js check --runtime hermes --json
```

`--check` compares only Kaola-owned skills and support scripts; unrelated user skills never
drift-fail it. A missing or drifted KW skill does. Uninstall removes skills by rendered directory
name, support scripts by manifest name, and this runtime's own managed region through its per-target
global-contract record. An owner-edited region is refused and left in place. The installer never
writes `config.yaml`, `.env`, credentials, hooks, or a Hermes plugin. `--project`/`--target` is
refused by design (D4).

The installer resolves the home as `${HERMES_HOME:-$HOME/.hermes}` and requires an absolute path.
The generated skill resolver probes the same root first and the self-dev repo second. Tests relocate
the install by overriding `HOME` and `HERMES_HOME`; the real owner home is never touched.

## Build trees and project-skill collision

The repo-side build tree is `.kw-hermes/skills/<name>/SKILL.md` for github and
`.kw-hermes-<forge>/skills/<name>/SKILL.md` for gitlab/gitea. It is gitignored and is a KW build
name, not a Hermes discovery path. Do not use `.hermes/`: Hermes treats `<repo>/.hermes/skills` as
a native project skill root once the repository is trusted, so a generated tree there would become
live content.

Hermes also reads `<repo>/.agents/skills` for a trusted project. That directory is the Antigravity
`--project` root and a Droid global-compatibility root, so a same-name KW skill there can collide
with the profile copy. P0 measured two project roots holding the same name as **ambiguous**:
`skill_view` refused to choose and path-form names were not found. P1 keeps installation global-only
and avoids relying on project-local copies.

## Forge posture (#1123 P3)

**Single-forge.** The native skill namespace (`skills/<name>/SKILL.md`) is flat and the three topics
use the same basenames for every forge, so a second forge's global install would overwrite the entry
rather than add an independent one. The installer copies the selected forge's support scripts and
does **not** delete another forge's renamed scripts; the active entry is still single-forge. The
**P1 resolver guard** refuses a repository that resolves to a different forge before any forge CLI
call, so the single-forge posture is safe; reinstall with `--forge=<github|gitlab|gitea>` to switch.
The issue #1123 P3 union-scripts + multi-entry layout is therefore not used here.

## Identity slot and ownership edge cases

- **SOUL.md is required before install.** The installer refuses a missing, empty, or whitespace-only
  `SOUL.md`; it never creates or seeds the identity slot. Hermes seeds its own default identity only
  while the file is missing or a known legacy template. Run `hermes` once (or write an owner
  identity), then rerun the installer. This prevents KW from replacing the default persona or
  minting an identity marker for a mistyped/new profile.
- **Owner edits and uninstall.** A changed managed region is refused. Uninstall now exits non-zero
  when the carrier is left in place; it does not report success over a refused owner conflict. The
  installer writes the carrier last by design, so a conflict discovered at that step means skills and
  support scripts were already refreshed; resolve the carrier conflict and rerun.
- **Known host-side ownership edges (informational).** `hermes profile create --clone` copies a
  `SOUL.md` containing the KW region into a profile without a KW ownership record;
  a distribution-owned `SOUL.md` is replaced on `hermes profile update`; and a dashboard atomic
  write racing this installer's read-modify-write has a vanishingly small lost-update window.
  These are host behaviors, not KW claims; `install-hermes.sh --check` reports drift rather than
  guessing ownership.

## Boundaries

- No `plugins/hermes`: Hermes' plugin system is an executable extension surface and is outside the
  native-only design ([ADR 0029](decisions/0029-native-subagents-only.md)).
- No hooks, no Kaola role profiles, no model or effort bindings. The live `delegate_task` schema is
  recorded as a fact only ([ADR 0030](decisions/0030-forge-and-engineering-lifecycle.md)).
- ACP is a P3 integration point, not a P1 implementation. P0 measured `hermes acp` protocol
  version 1, slash expansion, cwd discovery, permission behavior, model read-back, viewer-close
  continuation, and cancel/load; the edition ships no ACP client, adapter, or `platform.yaml`.
- `install-all.sh` invokes Hermes only in global scope. A remote machine (Mac mini, Mac Studio) needs
  its own measured install and verification; MacBook evidence never transfers.
