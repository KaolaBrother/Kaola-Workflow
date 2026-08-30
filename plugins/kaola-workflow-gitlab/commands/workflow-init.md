---
description: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, docs structure, and Git/GitLab issue conventions.
argument-hint: (optional project context)
---

# Workflow Init

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. Nothing collects that approval on your behalf, so this rule is the whole mechanism.
Initializing a repository, rewriting an existing instructions file that already carries the user's
own content, and editing runtime configuration under `$HOME` are all in that class: propose the
change, show the minimal diff, and wait for the answer. Creating a missing scaffold file is not —
get on with it.
<!-- /PIN -->

Prepare the current project for repeated `/workflow-next` implementation cycles.

This command is a bootstrapper. It should preserve existing project instructions and docs, add only missing workflow guidance, and avoid replacing user-authored content.

## Inputs

Use `$ARGUMENTS` as optional project context.

---

## Step 1 — Scan Project State

Inspect the project root:

```bash
pwd
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md missing"
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
find docs -maxdepth 3 -type f 2>/dev/null | sort
test -f package.json && node -e "const p=require('./package.json'); console.log('package scripts:', Object.keys(p.scripts||{}).join(', ')||'none')"
find . -maxdepth 2 \( -name 'Makefile' -o -name 'pyproject.toml' -o -name 'Cargo.toml' -o -name 'go.mod' -o -name 'requirements.txt' \) -print
```

If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that GitLab issue sync is pending until a GitLab remote exists.

If `glab` is available and a GitLab repo can be inferred from `origin`, inspect open issues:

```bash
glab issue list --limit 100
```

If there is no GitLab remote, or if `glab` is unavailable or unauthenticated, skip issue fetching immediately and note that GitLab issue sync is pending. Do not spend time retrying GitLab calls during init.

---

## Step 2 — Reconcile project instructions

Keep `AGENTS.md` as the project contract: verified project facts, commands, constraints, validation,
documentation pointers, gotchas, and local overrides only. Universal workflow behavior belongs to
the compatible machine-global contract already loaded by the active runtime. A runtime-native
project instruction file may exist only as the smallest bridge to `AGENTS.md` plus a genuine local
overlay. Preserve user-authored content byte-for-byte outside managed regions; never replace an
owner-only file on inference.

Resolve and run the installed `kaola-workflow-project-instructions.js` helper in `plan` mode first.
It verifies the machine-global receipt before proposing project bytes. An absent, stale, malformed,
or incompatible receipt returns `decision_required`: run the release's `install-all.sh`, start a fresh
runtime session, and retry init. `workflow-init` never installs global bytes itself. Any active run
returns `active_run_preserved` and writes nothing; finish or archive that run before changing project
instructions. A safe inactive migration is atomic and idempotent, while `check` verifies convergence
without writing.

Use this policy:

| Section | Required | Purpose |
|---------|----------|---------|
| Project Snapshot | yes | What this project is, stack, and main architecture in 2-5 bullets |
| Commands | yes | Install, test, lint/typecheck/build, dev server commands; use `unknown` when not detected |
| Project Constraints | yes | Security, public-contract, compatibility, or generated-file constraints unique to this repository |
| Validation Policy | yes | Focused, integration, environment, and service acceptance specific to this project |
| Documentation Map | yes | Pointers to docs, not embedded docs |
| Local Overrides | yes | Real project-only precedence, exceptions, or repeated gotchas; use `none` or `unknown` honestly |

Optional content belongs elsewhere unless it must be read in every session:
- Put path-specific rules in `.claude/rules/*.md`.
- Put private machine/user notes in `CLAUDE.local.md`.
- Put long procedures in skills or command files.
- Put API details, decisions, architecture, and changelog entries in `docs/` and `CHANGELOG.md`.
- Use plain path references for optional docs. Do not use `@path` imports unless the content must always enter context.

### Executable template authority

Do not edit either instruction file independently of the helper's reported outcome. The adjacent
distribution module supplies the complete project wording. `decision_required` means the global
receipt or project ownership boundary is not safe, so no instruction file is written.
`active_run_preserved` means the project bytes stay frozen until the run closes. There is no consent
or schema bypass for either result.

The executable project wording lives only in the adjacent
`kaola-workflow-project-instruction-templates.js` distribution module. Do not synthesize, paste, or
independently restate the global contract in this surface; the helper below is the project carrier's
only writer.

> **Claude dispatch posture note:** Audit dispatch posture for this session before claiming
> role-dispatch readiness: probe the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable
> first; if unset, fall back to the session settings env block. Report
> `claude_dispatch_posture: teams | classic` — `teams` when the flag resolves truthy, `classic`
> otherwise. This audit is report-only: never write or edit user settings/config to flip the
> flag. Remediation leads with the classic path — the synchronous dispatch flow is always
> available and requires no flag — and only then notes that agent teams is an experimental,
> flag-gated alternative for a session that has explicitly opted in.

Keep the working-principle bullets concise. If the helper reports ambiguous owner authority, ask in
conversation and leave both instruction files unchanged.

---

## Step 3 — Create `AGENTS.md`

Resolve the installed project-instruction helper beside the claim script and run:

```bash
INSTRUCTIONS_JS="$(kaola_script kaola-workflow-project-instructions.js)"
node "$INSTRUCTIONS_JS" plan --project-root "$PWD" --json
node "$INSTRUCTIONS_JS" apply --project-root "$PWD" --json
node "$INSTRUCTIONS_JS" check --project-root "$PWD" --json
```

The helper owns only `<!-- KW-AGENTS-MANAGED-START -->` through its matching END and the runtime
overlay's own managed region. It writes only after a compatible machine-global receipt is present.
The exact released full-template prefix may migrate to the project-only layout while preserving a
suffix of owner bytes; mixed legacy, unknown, malformed, duplicate, or owner-only authority returns
`decision_required` and writes nothing. Any active run returns `active_run_preserved` with no bypass.
Successful inactive reruns are idempotent and report `converged` with an empty write list.
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

If a GitLab issue is known, create the active workflow folder before starting:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
[ -f "$CLAIM_JS" ] && node "$CLAIM_JS" claim \
  --project "{project}" --issue {N}
```

Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the GitLab issue number. If the issue number is unknown, omit `--issue`.

If `kaola-gitlab-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local workflow artifacts.

---

## Step 5 — Legacy Backlog Layer

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

## Step 6 — Git And Issue Summary

After edits:

1. Run `git status --short --branch`.
2. Run `wc -l AGENTS.md` and report the count against the recommended 200 lines. If it is over, offer to trim it with the user — the count fails nothing.
3. Summarize:
   - whether Git is initialized
   - whether a GitLab remote exists
   - whether the runtime-native bridge was created, updated, preserved, or needs an owner decision
   - whether AGENTS.md was created, was already conforming, or was migrated
   - the helper outcome for AGENTS.md and the runtime-native bridge
   - which docs files were created
   - whether a legacy backlog layer was found, and what was decided about it
   - whether GitLab issues were available for sync
4. Do not commit unless the user explicitly asks.

End with the next useful entry point:

```text
/workflow-next
```
