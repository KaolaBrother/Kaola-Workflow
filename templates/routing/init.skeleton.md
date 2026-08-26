<!-- SLOT:in-frontmatter -->

<!-- SLOT:in-h1 -->

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Initializing a repository, rewriting an existing instructions file that already carries the user's
own content, and editing runtime configuration under `$HOME` are all in that class: propose the
change, show the minimal diff, and wait for the answer. Creating a missing scaffold file is not —
get on with it.
<!-- /PIN -->
<!-- REGION:command — only this surface has an argument channel: its frontmatter declares an `argument-hint` and its body reads `$ARGUMENTS`, which the skill surface cannot receive -->

Prepare the current project for repeated `/workflow-next` implementation cycles.

This command is a bootstrapper. It should preserve existing project instructions and docs, add only missing workflow guidance, and avoid replacing user-authored content.

## Inputs

Use `$ARGUMENTS` as optional project context.

---

## Step 1 — Scan Project State

Inspect the project root:
<!-- /REGION -->
<!-- REGION:skill — the counterpart opening for a surface with no argument channel: no `## Inputs`, and the body opens as a Required-Behavior list instead of a `$ARGUMENTS`-fed Step 1 -->

Bootstrap the current repo for repeated Kaola-Workflow for Codex cycles. Preserve existing project guidance and add only missing Codex-specific structure.

## Required Behavior

1. Read applicable `AGENTS.md` files first.
2. Inspect project state:
<!-- /REGION -->

```bash
pwd
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
<!-- REGION:command — the overflow policy routes optional content to `.claude/rules/*.md` and `CLAUDE.local.md`, config locations that exist only on this runtime; the skill's counterpart names `.codex/agents/` and `.codex/config.toml` instead -->
test -f package.json && node -e "const p=require('./package.json'); console.log('package scripts:', Object.keys(p.scripts||{}).join(', ')||'none')"
find . -maxdepth 2 \( -name 'Makefile' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' \) -print
```

<!-- SPLICE:in-cmd-001 -->

<!-- SPLICE:in-cmd-002 -->

```bash
<!-- SPLICE:in-cmd-003 -->
```

<!-- SPLICE:in-cmd-004 -->

---

## Step 2 — Reconcile project instructions

Make `AGENTS.md` the universal project contract. A runtime-native instruction file may exist only as
the smallest bridge to `AGENTS.md` plus that runtime's genuine overlay. Preserve user-authored content
byte-for-byte outside managed regions; never replace an owner-only file on inference.

Resolve and run the installed `kaola-workflow-project-instructions.js` helper in `plan` mode first.
If it reports `decision_required`, ask in conversation and write nothing. If an active run was claimed
under an older installed version, preserve both instruction files unchanged. `apply` is atomic and
idempotent: a second apply must be a no-op, while `check` verifies convergence without writing.

Recommended universal size: under 200 lines. This is a recommendation, not a limit. Move long detail
to documentation or runtime-specific overlays rather than duplicating the universal contract.

Use this policy:

| Section | Required | Purpose |
|---------|----------|---------|
| Project Snapshot | yes | What this project is, stack, and main architecture in 2-5 bullets |
| Commands | yes | Install, test, lint/typecheck/build, dev server commands; use `unknown` when not detected |
| Non-Negotiable Rules | yes | Stable constraints agents must follow every session |
| Validation Policy | yes | Treat background hooks as advisory and avoid duplicate validation |
| Kaola-Workflow | yes | Orchestrator, backlog, compliance, and archive rules in concise form |
| Project Conventions | optional | Only real detected or user-provided conventions |
| Known Gotchas | optional | Only repeated hazards that would waste time |
| Documentation Map | yes | Pointers to docs, not embedded docs |
| Maintenance | yes | Rules for keeping universal guidance concise |

Optional content belongs elsewhere unless it must be read in every session:
- Put path-specific rules in `.claude/rules/*.md`.
- Put private machine/user notes in `CLAUDE.local.md`.
- Put long procedures in skills or command files.
- Put API details, decisions, architecture, and changelog entries in `docs/` and `CHANGELOG.md`.
- Use plain path references for optional docs. Do not use `@path` imports unless the content must always enter context.

### Executable template authority

Append equivalent missing sections only. Treat headings with the same meaning as equivalent; do not duplicate. Replace bracketed placeholders with detected values; do not leave placeholder text in `AGENTS.md`. Omit optional sections when there is no real content.
<!-- /REGION -->
<!-- REGION:skill — the counterpart placement: role profiles live in `.codex/agents/kaola-workflow/` and are wired by the managed block in `.codex/config.toml`, paths that exist only on this runtime -->
```

3. Reconcile `AGENTS.md` as the universal authority and preserve user-authored bytes outside the
   managed region.
4. Keep any runtime-native first-read instruction file as a thin bridge plus runtime-only overlay;
   never duplicate the universal sections there.

<!-- SPLICE:in-sk-001 -->

   Kaola-Workflow agent profiles live in `.codex/agents/kaola-workflow/` and are wired by the managed block in `.codex/config.toml`.
<!-- /REGION -->

The executable consumer wording lives only in the adjacent
`kaola-workflow-project-instruction-templates.js` distribution module. Do not synthesize, paste, or
independently restate that universal contract in this surface; the helper below is its only writer.

<!-- REGION:command — the posture probe reads `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and this session's settings env block, which exist only on this runtime; the skill's counterpart audits its own runtime's config and reports `dispatch_posture` instead -->
> **Claude dispatch posture note:** Audit dispatch posture for this session before claiming
> role-dispatch readiness: probe the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable
> first; if unset, fall back to the session settings env block. Report
> `claude_dispatch_posture: teams | classic` — `teams` when the flag resolves truthy, `classic`
> otherwise. This audit is report-only: never write or edit user settings/config to flip the
> flag. Remediation leads with the classic path — the synchronous dispatch flow is always
> available and requires no flag — and only then notes that agent teams is an experimental,
> flag-gated alternative for a session that has explicitly opted in.

Keep the working-principle bullets concise.

If an existing `CLAUDE.md` is bloated or duplicates the sections above, do not silently replace it. Add a short `## Maintenance Note` with the proposed consolidation and ask before destructive rewriting.

---

## Step 3 — Create `AGENTS.md`
<!-- /REGION -->
<!-- REGION:skill — the profile install and the config audit act on `~/.codex/agents/`, `~/.codex/config.toml` and the `codex` CLI, and `install-codex-agent-profiles.js` ships only in the plugin trees this surface can reach; none of it resolves on the command runtime -->
5. Agent role profiles are a one-time GLOBAL install — `workflow-init` does NOT install them per repo.

Profiles install once into `~/.codex` and are available in every repo (parity with Claude global agents). `workflow-init` only scaffolds the project. If not yet installed (or after upgrade), run the one-time global install:

```bash
<!-- SPLICE:in-sk-002 -->
if [ ! -f "$plugin_root/scripts/install-codex-agent-profiles.js" ]; then
<!-- SPLICE:in-sk-003 -->
  plugin_root="$(dirname "$(dirname "$script_path")")"
fi
test -f "$plugin_root/scripts/install-codex-agent-profiles.js"
node "$plugin_root/scripts/install-codex-agent-profiles.js" --global
```

Writes `~/.codex/agents/kaola-workflow/*.toml` + the managed block in `~/.codex/config.toml`, refreshes global hooks — one install, all repos. The preflight gate accepts the global scope. (To pin to one repo instead, pass the repo path positionally — `… "$PWD"` — optional override.)

Run an agent-guided Codex config audit before claiming role dispatch readiness:

```bash
codex features list | grep 'multi_agent_v2' || true
node "$plugin_root/scripts/kaola-workflow-codex-preflight.js" --doctor --project-root "$PWD" --json
```

Read the doctor JSON's `codex_version` field first — it gates everything else.
Codex >=0.145.0 stabilized MultiAgentV2, but it stays **opt-in and off by
default** — only V1 `multi_agent` is on by default — so
`features.multi_agent_v2.enabled = true` must be written for Codex to expose the
V2 task-name spawn tools at all; an unsupported version returns a typed
`codex_version_unsupported` refusal (repair: upgrade Codex) before any
profile/config check runs. Once the version floor is met, read the
per-scope `dispatch_posture` field alongside the existing checks — it is the
effort-gated Kaola dispatch posture, distinct from Codex's general default:
`none` (Kaola's explicit V2 attestation is absent-or-false), `explicitRequestOnly`
(tools exposed, but the runtime model-refuses a spawn unless explicitly
asked), or `proactive` (`model_reasoning_effort = "ultra"` — the
runtime accepts a spawn with no per-session ask). Classify the result:

- `ok`: `multi_agent_v2_enabled` reads `true` (`features.multi_agent_v2.enabled
  = true`), generated role profiles are fresh, agent limits are absent or
  sufficient, AND `dispatch_posture` reads `proactive`.
- `explicit_request_only`: `multi_agent_v2_enabled` reads `true` and profiles
  are fresh, but `dispatch_posture` reads `explicitRequestOnly` — report the
  doctor's `dispatch_posture_warning` remediation verbatim (leads with an
  explicit in-session ask for sub-agents/delegation/parallel work — always
  available and always documented — and only then, if your Codex exposes an
  `ultra` reasoning effort for your model/plan (undocumented as of Codex
  >=0.145.0; check the `/model` picker), `model_reasoning_effort = "ultra"` in
  `~/.codex/config.toml` or per-session `codex -c model_reasoning_effort=ultra`).
  NEVER report this state as `ok` — enablement alone is not dispatch-ready.
- `warning_only`: only `[notice].suppress_unstable_features_warning = true`
  differs; this is optional warning posture, not dispatch proof.
- `needs_update`: `features.multi_agent_v2.enabled` is missing or false, or
  `dispatch_posture` reads `none`. Preserve the typed
  `codex_multi_agent_v2_required` refusal and show its repair diff verbatim —
  Kaola does not write this flag for you.
- `blocked`: config is malformed, policy-managed, or conflicts with a
  user/admin constraint.

The switch is `features.multi_agent_v2.enabled`, accepted in three shapes: a
`[features.multi_agent_v2]` table, the inline `multi_agent_v2 = { enabled =
true, ... }` under `[features]`, and a bare `multi_agent_v2 = true`. A
top-level `[agents] enabled = true` does NOT enable it — `[agents]` configures
roles and limits, and Codex 0.145.0 loads such a config clean with the feature
still off, so set the switch in one of the three shapes above instead.
`features.multi_agent_v2.max_concurrent_threads_per_session` governs
sub-agent concurrency: the cap is inclusive of the root session, so sub-agent
width is the configured cap minus one. Do NOT also set `agents.max_threads` —
it is a separate `[agents]` key, not an alias, and it does not raise the
MultiAgentV2 cap; Codex 0.145.0 accepts the key rather than complaining, so a
stray one leaves the cap where it was instead of erroring. Warning suppression is
independent: never treat `[notice].suppress_unstable_features_warning = true`
as evidence that MultiAgentV2 is enabled. Kaola does not silently edit
`~/.codex/config.toml`'s `[features]` table on the user's behalf — satisfying
Kaola's explicit V2 attestation is a hand edit the user makes from the
`codex_multi_agent_v2_required` refusal's diff; Kaola also never writes or
overrides `agents.default_subagent_model` /
`agents.default_subagent_reasoning_effort` — Codex resolves the sub-agent's own
model/reasoning effort independently. After a config change, require a fresh
Codex session. Do not claim effort-safe dispatch from config text alone; a
tiered fallback still needs a child-session effort proof — for Codex, that
proof is the doctor's `dispatch_posture` field, not the feature flags alone.

Trust the hooks once with `/hooks` in Codex. If a project-local `.codex/hooks.json`
already exists, remove it (or run `uninstall.sh`) to avoid double-firing.

### How a run is coordinated

One file per run, not one per issue. A run claims its set of issues — normally three to five,
sometimes one — then writes `kaola-workflow/{project}/mission-list.md`. There is nothing to select
or configure, and no script owns the file.

A stale workflow-path request from an old session or script is silently ignored; there is only one
way to run.

6. Create only missing scaffold files:

```text
kaola-workflow/
  archive/
docs/
  README.md
  architecture.md
  api.md
  conventions.md
  decisions/
CHANGELOG.md
```

7. Do not create `kaola-workflow/{project}/workflow-state.md` during init. State belongs to an active workflow project.

## Create `AGENTS.md`
<!-- /REGION -->

Resolve the installed project-instruction helper beside the claim script and run:

```bash
INSTRUCTIONS_JS="$(kaola_script kaola-workflow-project-instructions.js)"
node "$INSTRUCTIONS_JS" plan --project-root "$PWD" --json
node "$INSTRUCTIONS_JS" apply --project-root "$PWD" --json
node "$INSTRUCTIONS_JS" check --project-root "$PWD" --json
```

The helper owns only `<!-- KW-AGENTS-MANAGED-START -->` through its matching END and the runtime
overlay's own managed region. Known legacy managed redirects may be migrated; mixed files preserve
every owner byte outside those regions byte-for-byte. Unknown, malformed, duplicate, or owner-only
instruction authority returns `decision_required`: ask in conversation and make no write. A project
claimed under an older installed version returns `active_run_preserved`. Successful reruns are
idempotent and report `converged` with an empty write list.
<!-- REGION:command — KNOWN RESIDUAL, structural shape and NOT a capability difference: both surfaces carry this same scaffold tree, under a numbered Step heading here and as item 6 of a Required-Behavior list on the skill. Nothing about either runtime forces that. It is kept rather than collapsed because collapsing costs a real surface: either the command loses its Step 1 to 5 numbering, or it loses the tree itself. A damaged surface is a worse trade than a divergence that says out loud what it is. Collapse it the day the command's Step numbering is reworked for another reason. -->
```

---

## Step 4 — Create Missing Workflow Structure

Create only missing directories/files. Do not overwrite existing content.

Required structure:

```text
kaola-workflow/
  archive/
docs/
  README.md
  architecture.md
  api.md
  conventions.md
  decisions/
CHANGELOG.md
```

Use these initial file bodies when a file is missing.
<!-- /REGION -->
<!-- REGION:skill — KNOWN RESIDUAL, the counterpart of the region above and the same admission: item 6 already stated the scaffold tree, so the file bodies open under a plain heading rather than a Step 4. Same content, different structural heading, no runtime capability behind it. These two are the only regions in these skeletons NOT justified by a capability difference; every other one names a path, tool or channel that exists on one runtime and not the other. -->
```

## Initial File Bodies
<!-- /REGION -->

### `docs/README.md`

```markdown
# Documentation Index

- [Architecture](architecture.md)
- [API](api.md)
- [Conventions](conventions.md)
- [Decisions](decisions/)
- [Changelog](../CHANGELOG.md)
```

### `docs/architecture.md`

```markdown
# Architecture

Document system boundaries, major components, data flow, and deployment shape.
```

### `docs/api.md`

```markdown
# API

Document public APIs, endpoints, schemas, events, and integration contracts.
```

### `docs/conventions.md`

```markdown
# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.
```

### `CHANGELOG.md`

```markdown
# Changelog

## Unreleased

- Initialized Kaola-Workflow documentation structure.
```

## Active Folder Initialization

<!-- SPLICE:in-shared-007 -->

```bash
<!-- SLOT:in-claim-resolver -->
[ -f "$CLAIM_JS" ] && node "$CLAIM_JS" claim \
  --project "{project}" --issue {N}
```

<!-- SPLICE:in-shared-008 -->

<!-- SPLICE:in-shared-009 -->

---

<!-- SPLICE:in-migration-heading -->

<!-- PIN: backlog-migration -->
Step 1's scan may find `kaola-workflow/ROADMAP.md` or `kaola-workflow/.roadmap/issue-*.md`. That is a **retired** local backlog layer: nothing generates, validates, reads or updates it any more, and `_rules.md` is the one file under `.roadmap/` that survives. Init never deletes it, and installing or upgrading never migrates it. **Diagnose, report, ask, and act only on the answer** — migration is a deliberate movement of its own, and keeping it out of the upgrade is what stops a repo from being left halfway through one.

**Diagnose.** Read-only, and complete before anything is reported:

```bash
git ls-files -- 'kaola-workflow/.roadmap/issue-*.md' 'kaola-workflow/ROADMAP.md'
git ls-files -z -- 'kaola-workflow/.roadmap/issue-*.md' 'kaola-workflow/ROADMAP.md' | xargs -0 wc -c | tail -1
git log -1 --format=%H
git grep -Iln -e 'ROADMAP\.md' -e '\.roadmap/issue-' -- . ':!kaola-workflow/'
```

**Report** — and make it worth reading even when the owner declines:

- **The manifest.** How many files, how many bytes, and the commit SHA above. Every byte is preserved by that commit, so deletion loses no content; what it loses is *findability*.
- **The tier.** Where each open issue's priority lives today. If it lives only in this layer's prose, it has nowhere to be after deletion.
- **The residue.** Diff each source against its own issue's thread and against the repo. Nearly all of it is a digest of material held elsewhere — but *elsewhere* is often **another issue**, so resolve each fact against the whole tracker, not the issue it was filed under. What resolves nowhere is the only content migration must preserve.
- **The citations.** Every file the `git grep` found. These are the consumer's own documents and tests; this command does not touch them.
- **The owner-owned rules.** Any rule in `CLAUDE.md`, `AGENTS.md` or `_rules.md` that asserts the layer exists — a finalize check that counts `issue-*.md` against the open-issue count becomes self-failing the moment the sources go, and a rule pointing readers at a per-row tag in the mirror dangles the same way. Quote the line, propose the replacement, and edit nothing: those files are the owner's.

**Ask.** Creating labels on someone's tracker, posting comments on their issues, deleting tracked files, and editing their rule files are four separate decisions. Put them to the user in conversation and act only on the answer.

**Act, in this order** — the order is forced, and each step's reason is a failure that has been measured:

1. **Tier first.** Priority labels exist and carry each open issue's tier *before* anything is deleted. Deletion removes the prose those tiers physically live in.
2. **Residue second.** Post the homeless content as comments, only on the issues it belongs to. Content still readable elsewhere needs no comment.
3. **Deletion third, as one movement.** `git rm` the mirror and the per-issue sources together and commit, keeping `_rules.md`. **Never `git rm --cached`, and never delete from disk alone.** Both halves are wrong, in different ways: a mirror off the index but still on disk is untracked content in the main root and **refuses every sink**; sources gone from disk but still in the index leave index and worktree disagreeing, with the deletion uncommitted and undone by any stray checkout — a migration you then have to remember to finish. The dangerous state is not *un*-migrated — a tracked, frozen layer is inert and harmless — it is *half*-migrated.
4. **Citations and rule files last**, by the owner, once the deletion has landed.

**Declining is a complete answer.** A frozen layer is read by nothing, blocks nothing, and can be migrated any time. Say so plainly and move on — do not re-offer on the next run.
<!-- /PIN -->

---

<!-- SPLICE:in-summary-heading -->

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l CLAUDE.md` and report the count against the recommended 200 lines. If it is over, offer to trim it with the user — the count fails nothing.
3. Summarize:
   - whether Git is initialized
<!-- SPLICE:in-shared-010 -->
   - whether `CLAUDE.md` was created or updated
   - whether AGENTS.md was created, was already conforming, or was migrated
   - which required `CLAUDE.md` sections are present
   - which docs files were created
   - whether a legacy backlog layer was found, and what was decided about it
<!-- SPLICE:in-shared-011 -->
4. Do not commit unless the user explicitly asks.

End with the next useful entry point:

```text
<!-- SPLICE:in-next-route -->
```
