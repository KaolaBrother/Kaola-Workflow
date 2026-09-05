---
description: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, docs structure, and Git/GitHub issue conventions.
argument-hint: (optional project context)
---

# Workflow Init

Prepare the current repository for repeated Kaola-Workflow runs. Keep the result project-specific,
small, and grounded in repository facts.

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. This includes `git init`, runtime/global configuration, and rewriting an existing
owner-authored instruction file. Show the smallest useful change first.
Creating a missing project scaffold is reversible and needs no separate approval.
An authorization already given for this task remains valid within its stated scope. Ask again only
for a new, expanded, or materially different irreversible or value-laden decision; owner-authored
content remains protected unless that scope explicitly includes the change.
<!-- /PIN -->

Use `$ARGUMENTS` only as optional project context.

## Inspect

Read every applicable instruction file, then inspect the repository before writing:

```bash
pwd
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
for file in AGENTS.md CLAUDE.md; do
  test ! -f "$file" || { printf '\n--- %s ---\n' "$file"; cat "$file"; }
done
find docs -maxdepth 2 -type f 2>/dev/null | sort
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
```

If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that GitHub issue sync is pending until a GitHub remote exists.

If `gh` is available and a GitHub repo can be inferred from `origin`, inspect open issues:

```bash
gh issue list --limit 100
```

If there is no GitHub remote, or if `gh` is unavailable or unauthenticated, skip issue fetching immediately and note that GitHub issue sync is pending. Do not spend time retrying GitHub calls during init.


## Maintain project instructions

The Global Workflow Contract already loaded by the runtime is the universal authority.
`workflow-init` does not locate, execute, install, or repair runtime/global machinery, and it leaves
runtime/global bytes unchanged. If that contract is absent or inconsistent with the installed
surface, leave project rules in place and report a separate installation check from the release
tree.

The Agent owns the meaning and prose of project instructions. Derive useful local facts and stricter
constraints from the repository itself. Omit unknowns; do not persist placeholders. There are no required headings, order, wording, bytes, or length,
and no parser or writer owns the
result.

Preserve valid owner content. Before changing an existing user-authored or owner-authored instruction file,
show the minimal diff and obtain consent.
Keep one project-fact authority such as `AGENTS.md`; keep a runtime-native first-read file only as a
thin bridge plus genuine runtime-only facts. Do not copy the global workflow or dispatch contract
into the repository.

An active run is a reload warning, not a prompt-write lock. Reconcile in-flight custody before a
meaning-changing edit. After an edit, use a fresh top-level Agent/session for reliable validation
when the runtime does not reload instructions into the current context.

## Add only missing project structure

Create only artifacts the inspected repository actually needs. A normal first initialization may
add `kaola-workflow/archive/`, a concise documentation index and project docs, `docs/decisions/`, and
`CHANGELOG.md`. Never overwrite a useful file or fill one with generic boilerplate merely because a
path is listed here. Do not create an active `workflow-state.md` or `mission-list.md`; `/workflow-next`
owns the run.

## Legacy Backlog Layer

<!-- PIN: backlog-migration -->
If tracked `kaola-workflow/ROADMAP.md` or `.roadmap/issue-*.md` files exist, measure and report them;
init never deletes them and an upgrade never migrates them. Ask separately before moving priority to
forge labels, posting unresolved residue, deleting tracked files, or changing owner rules.

If migration is approved, preserve priority and unresolved residue first, then remove the retired
files in one tracked movement. Never `git rm --cached`, never delete only from disk, and never leave a
half-migrated layer. Declining is a complete answer: the frozen files are inert and may remain.
<!-- /PIN -->

## Git And Issue Summary

Re-read every instruction file changed, run `git status --short --branch`, and report:

- the repository and forge facts actually observed;
- whether the runtime-loaded global contract was available, and any separate installation check needed;
- which project instructions and missing artifacts changed, with consent status;
- unresolved unknowns or legacy-backlog decisions;
- whether a fresh top-level session is required.

Do not commit unless the user explicitly asks. End with the next useful entry point:

/workflow-next
