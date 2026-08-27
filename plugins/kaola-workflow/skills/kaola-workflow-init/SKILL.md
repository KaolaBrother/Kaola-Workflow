---
name: kaola-workflow-init
description: Use when setting up a project for Kaola-Workflow for Codex, also called kaola-workflow or workflow-init, or refreshing its Codex-specific guidance and documentation scaffold.
---

# Kaola-Workflow Init

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Initializing a repository, rewriting an existing instructions file that already carries the user's
own content, and editing runtime configuration under `$HOME` are all in that class: propose the
change, show the minimal diff, and wait for the answer. Creating a missing scaffold file is not —
get on with it.
<!-- /PIN -->

Bootstrap the current repo for repeated Kaola-Workflow for Codex cycles. Preserve existing project guidance and add only missing Codex-specific structure.

## Required Behavior

1. Read applicable `AGENTS.md` files first.
2. Inspect project state:

```bash
pwd
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
```

3. Reconcile `AGENTS.md` as the universal authority and preserve user-authored bytes outside the
   managed region.
4. Keep any runtime-native first-read instruction file as a thin bridge plus runtime-only overlay;
   never duplicate the universal sections there.

   Active folder lifecycle: `kaola-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-pr, and finalize/archive. No legacy coordination layer is used.

   Kaola-Workflow agent profiles live in `.codex/agents/kaola-workflow/` and are wired by the managed block in `.codex/config.toml`.

The executable consumer wording lives only in the adjacent
`kaola-workflow-project-instruction-templates.js` distribution module. Do not synthesize, paste, or
independently restate that universal contract in this surface; the helper below is its only writer.

5. Runtime/global installation is outside `workflow-init`. Do not install or update global agent
profiles, runtime configuration, or hooks here. Inspect their current state read-only and report any
separate installation or upgrade remediation without executing it; project initialization must leave
all runtime/global bytes unchanged.

Run an agent-guided Codex config audit before claiming role dispatch readiness:

```bash
codex features list | grep 'multi_agent_v2' || true
PREFLIGHT_JS="$(kaola_script kaola-workflow-codex-preflight.js)"
node "$PREFLIGHT_JS" --doctor --project-root "$PWD" --json
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
instruction authority returns `decision_required`: ask in conversation and make no write. Per managed
change the helper reports `authority_layout_equivalent`, `execution_default_change`,
`state_schema_incompatible`, or `unknown_or_mixed`. A compatible authority-layout migration may apply
during an active run; an execution-default change asks in conversation, leaves bare `apply`
non-mutating, and may apply only with the unchanged plan's exact ephemeral `consent.apply_args`; a
state/schema-incompatible change returns `active_run_preserved` with no consent bypass. Successful
reruns are idempotent and report `converged` with an empty write list.
## Initial File Bodies

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

If a GitHub issue is known, create the active workflow folder before starting:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"
[ -f "$CLAIM_JS" ] && node "$CLAIM_JS" claim \
  --project "{project}" --issue {N}
```

Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the GitHub issue number. If the issue number is unknown, omit `--issue`.

If `kaola-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local workflow artifacts.

---

## Legacy Backlog Layer

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

## Git And Issue Summary

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l AGENTS.md` and report the count against the recommended 200 lines. If it is over, offer to trim it with the user — the count fails nothing.
3. Summarize:
   - whether Git is initialized
   - whether a GitHub remote exists
   - whether the runtime-native bridge was created, updated, preserved, or needs an owner decision
   - whether AGENTS.md was created, was already conforming, or was migrated
   - the helper outcome for AGENTS.md and the runtime-native bridge
   - which docs files were created
   - whether a legacy backlog layer was found, and what was decided about it
   - whether GitHub issues were available for sync
4. Do not commit unless the user explicitly asks.

End with the next useful entry point:

```text
kaola-workflow-next
```
