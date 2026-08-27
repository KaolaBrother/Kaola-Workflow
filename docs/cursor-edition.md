# Kaola-Workflow · cursor Edition

The cursor edition makes Kaola-Workflow runnable from
[Cursor](https://cursor.com), the same way the Grok edition makes it runnable
from Grok CLI. Cursor is a coding-agent **runtime** (like Codex, opencode, Kimi,
and Grok), not a git forge, so this edition is delivered the Cursor-native way —
named **agents** under a generated `.cursor/agents/` tree, flat
slash **commands** under `.cursor/commands/`, hook scripts under `.cursor/hooks/`,
and a merged `.cursor/hooks.json` — and is fully **additive**: it touches none of
the existing `claude`/`codex`/`gitlab`/`gitea`/`opencode`/`kimi`/`grok` edition
machinery.

Cursor Cloud Agents may not fire `sessionStart` and may not load project hooks.
That gap is declared, not papered over; durable resume stays `mission-list.md`.
Cursor CLI and Cursor App are separate product surfaces; App local IDE and App-started Cloud are
different execution hosts and must not be inferred from each other or from a CLI binary.
Authenticated standalone CLI, local App/IDE, and Cloud saved-environment named dispatch were each
measured separately. Cloud does not use committed project profiles as its carrier: run the same
global installer inside the dashboard-managed remote environment, save and snapshot it, then start
a fresh Cloud parent. See
[runtime capabilities](runtime-capabilities.md#cursor).

## Agent-led Cloud installation

Cursor Cloud installation is a saved-environment workflow, not a command run once inside an
arbitrary task VM:

1. Open the target repository's environment setup in the Cursor Cloud Agents dashboard and ask the
   setup agent to configure `./install-cursor.sh --global --yes --forge=github` as the remote
   install command.
2. Have the setup agent run a test Build. It must verify the exact candidate, exit code, absence of
   an ambient repository `.cursor`, the user-global authority receipt, and the expected agent
   catalog; it then reports the exact Build ID.
3. The setup agent asks the user to click **Save** in Cursor. A green setup VM, snapshot, or draft
   Build is not a persisted production environment until that user action succeeds.
4. Start the working Cloud Agent from the saved Build's details page, or verify the new Agent page's
   **View build details** link equals the reported Build ID. Only then inspect the fresh parent's
   live catalog and continue work.

Do not assume the generic New Agent entry selected the environment that was just saved. More than
one personal environment can match the same repository, and the repository resolver may choose a
different active Build. The exact Build identity is the proof. This follows Cursor's documented
[environment resolution](https://cursor.com/docs/cloud-agent/setup) and
[Build lifecycle](https://cursor.com/docs/cloud-agent/builds).

Cursor reads root and nested `AGENTS.md` directly, combining parent guidance with more-specific
instructions. Kaola installs no project-instruction bridge for Cursor. Generated agent frontmatter,
workspace catalog rules, and hooks are Cursor adapter data, not a copy of the universal contract.
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
| `templates/agents/behavior-contracts.json` + Cursor adapter | `.cursor/agents/<name>.md` | 14 native profiles with `name`, `description`, intent-mapped `model: grok-4.6[effort=…]`, capability-derived `readonly`, shared behavior identity, and render-specific hash |
| `commands/<file>.md` | `.cursor/commands/<file>.md` | Flat slash **command** (not a Skill — Skills lack `$ARGUMENTS`, and `workflow-init` uses `$ARGUMENTS`). The marked next/finalize block becomes Cursor-native profile, live-schema/catalog, tier, route, and limit guidance; any concrete Claude dispatch cards are adapted. `--runtime claude` becomes `--runtime cursor`. Script resolver points at `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts`. `argument-hint` is preserved. |
| `hooks/<script>.sh` | `.cursor/hooks/<script>.sh` | No runtime-neutral dispatch hook is installed. Compact-context is wrapped as JSON `{additional_context}` for `sessionStart`. There is no ambient catalog materializer. |
| mapping | `.cursor/hooks.json` | Cursor loads this path (not `hooks/hooks.json`). `sessionStart` carries compact resume only. Project-shaped commands use `.cursor/hooks/…`; a `--global` install rewrites that prefix to `./hooks/`. |

Generated agents carry a model-and-effort pin derived from the runtime-neutral intent class.
`standard`, `reasoning`, and `heavy` are the behavior-source values; only the Cursor adapter maps
them to the raw, unquoted `grok-4.6[effort=medium]`, `grok-4.6[effort=high]`, and
`grok-4.6[effort=xhigh]` frontmatter values.

## Three-tier frontmatter pins — host-split native dispatch

The behavior source's `standard` roles receive the unquoted
`model: grok-4.6[effort=medium]` line, `reasoning` roles receive
`model: grok-4.6[effort=high]`, and `heavy` roles receive the raw, unquoted
`model: grok-4.6[effort=xhigh]`. Unknown intent tokens fail closed; the generator does not invent a
fallback roster. Generated dispatch guidance inspects the live Task enum first. When that enum contains a Kaola
role name, omit a per-call model and leave the named profile as the model/effort carrier. When the
enum is built-in-only, use only those members as themselves while establishing whether this host's
real carrier was installed and reloaded: writable `generalPurpose` for generic production/docs/tests the parent may
delegate, `explore` when this host reports it for read-heavy search, `cursor-guide` for Cursor
product questions. Never prompt a child to impersonate `implementer`, `tdd-guide`, or another
custody-bearing role. A resolver-listed live-schema model slug is then an effort lever, not a
violation of unpublished-field discipline; omit-model follows the parent and is not a profile pin.
Missing standalone-CLI project agents want `install-cursor.sh --target` then a new CLI session.
Missing Cloud names want the dashboard environment's global install, manual save/snapshot, then a
fresh Cloud parent whose visible Build link matches the saved Build ID before a capability gap can
be concluded.

If the current session exposes a Task call and named catalog, that live schema is the authority;
public documentation does not establish one portable JSON call schema, so Kaola does not invent
fields such as parent-authored `subagentType.custom.name`.

The same guidance exposes Cursor's host-dependent native alternatives rather than assuming one role
miss ends all dispatch. IDE documentation describes scoped `Explore`, `Bash`, and `Browser`. The
supported Cursor CLI probe below instead exposed writable `generalPurpose` plus specialist and
project custom types, and did not expose those scoped types. An unsaved Cloud negative control
exposed `explore` without Kaola names; the saved-environment positive control exposed all 14. The
live catalog wins. A generic or
specialist child remains itself and is never prompted to impersonate `implementer`, `tdd-guide`, or
another custody-bearing role. Explicit, automatic, parallel, and resume-by-agent-ID paths remain
runtime-owned options.

For each mission item, use the exact custom route when present, otherwise use a catalog route only
when its actual task, custody, evidence, and stop boundaries fit. Inline that item when no
adequate route exists, record the specific capability gap, and re-evaluate the next item. A cohesive
production owner does not absorb independent research, test authorship, documentation, or review.

### Supported CLI live probe

On 2026-08-27, authenticated standalone Cursor CLI `2026.08.25-3e8eec8` was re-run against an
isolated user carrier and a disposable project explicitly materialized by the current candidate:

- Candidate `--global --no-scripts` wrote a receipt-bound global authority; candidate
  `--target <consumer> --no-scripts` wrote a receipt-bound project materialization.
- The Task catalog contained exact project custom `implementer`.
- The parent omitted a model override. Raw stream JSON recorded
  `subagentType.custom.name = implementer` and resolved `cursor-grok-4.6-medium`.
- The child returned the requested read-only token; both Task and parent reported success and the
  consumer remained unchanged.

Earlier same-day CLI probes established the wider native boundary: writable `generalPurpose`
appeared as `subagentType.unspecified`; specialist built-ins and all 14 project roles were
present; medium/high/xhigh tier resolution, parallel Tasks, and one descendant dispatch generation
worked. A user profile alone was not visible in an empty project, while project materialization was
the reachable carrier. Reopening the CLI process with the same chat discovered an added project
profile; same-process hot load remains unknown.

### Cursor App local-IDE live probe

Cursor App `3.17.21` (`8f2a112cb2845a97b75fd932ea5c470579ca4060`) separately started a
`This Mac` Agent with project profiles already present. The live catalog exposed the built-ins and
all 14 Kaola types. Exact `implementer` dispatch succeeded without a per-call model override and
without tracked repository mutation. The App result did not expose the child model, effort, or
profile source, so App global discovery, project-materialization necessity, reload, and
profile-to-model binding remain unknown.

### Cloud saved-environment live probe

On 2026-08-27 two earlier Cursor Cloud parents (`cursor-grok-4.6-xhigh`) were measured. Neither
catalog included Kaola role names. The consumer already had 14 git-tracked project profiles; the
producer new chat had none. Both used live built-ins as themselves: `generalPurpose`
(omit-model, `inherit`, and resolver-listed `cursor-grok-4.6-high-fast`) and `explore`.
`cursor-grok-4.6-high` was resolver-rejected.

The fresh App-started Cloud negative control selected
`probe/cursor-cloud-1041-20260827a` at
`ead40c2741f4cae7e0a0cb473bba8a8a4a80c7a6` before send. That commit already tracked all 14
profiles. The new Cloud Task enum still contained only `generalPurpose`, `explore`,
`computerUse`, `videoReview`, `cursor-guide`, `bugbot`, `security-review`, and
`best-of-n-runner`. Exact `implementer` was absent, so the probe dispatched no substitute and
made no repository change. This proves committed project profiles are not the Cloud carrier; it
does not prove a runtime capability gap.

The positive control configured personal dashboard environment
`9116f5fb-a1f4-11f1-b532-320a589b8025` with
`./install-cursor.sh --global --yes --forge=github`, then manually saved it. Config-change build
`bld-20260827-aaac14bf-e980-4d1a-9600-e8b3fb2e031e` installed all 14 profiles under
`/home/ubuntu/.cursor/agents`, snapshotted, and warmed. Fresh Cloud parent
`bc-f2f0f15f-31d9-416a-9952-35243def5561` started from that saved build and exposed all 14 Kaola
names in its 23-type live Task catalog. It dispatched exact `implementer` once with no model or
other override; child `bc-63c79c19-f9fb-5892-970e-bb1606ad1a3b` returned exactly
`PROBE_OK_CURSOR_CLOUD_SAVED_ENV_IMPLEMENTER`. The Cloud child model/profile source remains
unobservable.

All 14 role bodies come from `templates/agents/behavior-contracts.json` through
`generate-agent-profiles.js`; `sync-cursor-edition.js` requests Cursor renders and owns only edition
layout, commands, hooks, and install packaging. Reviewer roles have no separate source or transform.

Cursor documents custom profiles at project `.cursor/agents/` and user `~/.cursor/agents/`, with
project definitions winning a conflict. Kaola's project install requires `--target DIR` and writes
that project location. `--global` writes only
`${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}` (un-nested) and does **not** write an ambient Git
repository; existing project `.cursor` files are left untouched, and `--global` from a non-git cwd
does not invent project `.cursor`. A normal install renders the generated source into an isolated
temporary staging root and removes it after the transaction; only explicit `--regenerate` writes
the in-repository generated tree. Project catalogs are never selected from the ambient cwd of a
`--global` command. Authenticated CLI evidence reached project profiles and did not reach a user
file alone; that CLI fact is not App or Cloud proof. Cloud instead uses the user-global carrier in
its own saved remote environment. Project files alone are insufficient there.

For the measured standalone CLI/local host only, generated workflow-next/finalize guidance invokes
the installed safe helper with `--ensure-target "$PWD"` immediately before a named dispatch. It
derives project bytes only from the receipt-verified global authority, returns `current` without
writing when already fresh, returns `materialized` and requires a new process when it safely
writes, and fails before mutation on missing/stale authority, collision, symlink, invalid receipt,
or modified ownership. Cursor App local IDE and App-started Cloud do not inherit that CLI rule.
Cloud uses the dashboard environment install/save/new-parent lifecycle above. `sessionStart`
performs compact resume only.

The official model contract is likewise bounded: `model` is either `inherit` or an exact model ID,
and bracket parameters carry options such as effort. Team policy, legacy-plan settings, or plan
availability may force a compatible fallback. On Path A, where the live enum contains the named
profile, generated dispatch guidance omits a per-call model and that profile is the model/effort
carrier. On Path B, a built-in-only enum has no profile pin: omit-model follows the parent, while a
resolver-listed live-schema model slug is the effort lever.

Compact resume remains edition hook behavior. CLI catalog synchronization is a point-of-use
next/finalize transaction, not a hook. Durable recovery never depends on either:
`mission-list.md` is the authority after a new local, CLI, or cloud session.

## Path selection

On the cursor edition, the router routes directly to the adaptive workflow. Generated commands
adapt the dispatch call syntax; Path A named-profile dispatch omits per-call model arguments so the
profile pin carries its tier, while Path B may use only a resolver-listed live-schema model slug.
Canonical `commands/*.md` is never touched. There is no canonical model-dispatch section to
substitute.

## Installer

`install-cursor.sh` is a standalone installer — it has its own `--forge` flag and
does not run through `install.sh --forge`.

> The Cursor runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the sixth
> leg of its seven-runtime sequence, with a per-runtime PASS/FAIL summary.
> `--global` inherits this installer's user-home-only Cursor layout: it is not
> permission to update every consumer repository. Project `.cursor` catalogs
> need an explicit `--target` or `install-all.sh --project`. It stays a thin
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

Add `--yes` for non-interactive use. `--no-scripts` skips support scripts, hook
scripts, and the hooks JSON merge. Normal install creates a transaction-scoped staging root and
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

- **PROJECT** (`--target DIR`): agents and commands land under
  `<project>/.cursor/{agents,commands}` from the installed global authority. Hook scripts land under
  `<project>/.cursor/hooks/` and mapping is **merged** into
  `<project>/.cursor/hooks.json` (other events, e.g. `beforeShellExecution`, stay).
  A project install does **not** merge into `~/.cursor/hooks.json` — Cursor has
  project-scoped hooks. This is the explicit project materialization. It is never
  selected from ambient cwd of a `--global` command. The receipt
  `.cursor/kaola-workflow-materialization.json` binds target, forge/version, authority hash, and
  every managed file hash.
- **GLOBAL** (`--global`): they land under `${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}`
  with **no** nested `.cursor/` directory. Mapping is merged into
  `${CURSOR_HOME:-$HOME/.cursor}/hooks.json` with command paths rewritten to `./hooks/`.
  Running `--global` inside a Git work tree does **not** create or refresh that
  repository's `.cursor/` tree. Project catalogs that already exist are left untouched.
  `--global` from a directory with no git toplevel does not invent a project `.cursor/`
  tree. The authority receipt
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/cursor-authority.json` binds the exact managed
  files, modes, hashes, forge, and Kaola-Workflow version. Live CLI evidence found those user files
  alone were not catalog-visible.
  `--doctor` reports product (`cli`/`app`/`unknown`) and host (`local`/`cloud`/`unknown`)
  facts without installing and never infers one surface from a sibling binary.
- Support scripts always land under
  `${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/{scripts,hooks}`.
  `kaola-workflow-cursor-surface.js` is both the effective-state doctor and the explicit
  authority/materialization transaction. Its installed `--ensure-target DIR` mode is the only
  automatic pre-dispatch materializer and has no ambient-target default.

`--uninstall` removes only receipt-proven files whose current hash still matches and strips only
receipt-recorded Kaola entries from `hooks.json`. Modified, unmanaged, symlink, non-regular, and
invalid-receipt paths are preserved. It never deletes the user's `hooks.json` file.

## Hooks

Cursor's hook model is a JSON mapping at `.cursor/hooks.json` (project) or
`~/.cursor/hooks.json` (global). This edition ships only the compact wrapper. It uses a five-second
timeout and is fail-open. Catalog materialization is not a hook; on the measured standalone CLI it
is the explicit fail-closed point-of-use transaction described above.

| Event | Claude payload | Cursor payload | Adaptation |
| --- | --- | --- | --- |
| `sessionStart` resume | compact stdout injected after compact | `additional_context` JSON, new session only | wrapper turns compact-context.js stdout into `{additional_context}`. `preCompact` cannot inject — declared as `session_start_resume_injection`. Durable resume is `mission-list.md`. |
