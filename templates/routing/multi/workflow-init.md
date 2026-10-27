---
description: Initialize a project for Kaola-Workflow with AGENTS.md guidance, docs structure, and Git forge issue conventions.
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
<!-- /PIN -->

Use `$ARGUMENTS` only as optional project context.

## Inspect

Read every applicable instruction file, then inspect the repository before writing:

```bash
pwd
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
test ! -f AGENTS.md || { printf '\n--- AGENTS.md ---\n'; cat AGENTS.md; }
for file in CLAUDE.md .claude/CLAUDE.md CLAUDE.local.md; do
  test ! -f "$file" || printf '\nSHADOWING INSTRUCTION FILE (hides AGENTS.md from Claude Code): %s\n' "$file"
done
find docs -maxdepth 2 -type f 2>/dev/null | sort
test -d kaola-workflow && find kaola-workflow -maxdepth 3 -type f | sort
```

If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that forge issue sync is pending until a remote exists.

If a forge CLI is available and a repository can be inferred from `origin`, inspect open issues:

```bash
kaola_script_github(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
kaola_script_gitlab(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
kaola_script_gitea(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }

_claim_github="$(kaola_script_github kaola-workflow-claim.js)" || _claim_github=""
_claim_gitlab="$(kaola_script_gitlab kaola-gitlab-workflow-claim.js)" || _claim_gitlab=""
_claim_gitea="$(kaola_script_gitea kaola-gitea-workflow-claim.js)" || _claim_gitea=""
_dir_github=""; [ -n "$_claim_github" ] && _dir_github="$(dirname "$_claim_github")"
_dir_gitlab=""; [ -n "$_claim_gitlab" ] && _dir_gitlab="$(dirname "$_claim_gitlab")"
_dir_gitea=""; [ -n "$_claim_gitea" ] && _dir_gitea="$(dirname "$_claim_gitea")"
_installed=""
[ -n "$_claim_github" ] && _installed="github"
[ -n "$_claim_gitlab" ] && _installed="${_installed:+$_installed,}gitlab"
[ -n "$_claim_gitea" ] && _installed="${_installed:+$_installed,}gitea"

_forge_resolver=""
for _d in "$_dir_github" "$_dir_gitlab" "$_dir_gitea"; do
  [ -n "$_d" ] && [ -f "$_d/kaola-workflow-forge-resolve.js" ] && { _forge_resolver="$_d/kaola-workflow-forge-resolve.js"; break; }
done
if [ -z "$_installed" ] || [ -z "$_forge_resolver" ]; then
  echo "Kaola-Workflow: no installed forge scripts found" >&2
  CLAIM_JS=""
  return 1 2>/dev/null || exit 1
elif _resolved="$(node "$_forge_resolver" resolve --shell --installed "$_installed" \
    --scripts-dir-github "$_dir_github" --scripts-dir-gitlab "$_dir_gitlab" --scripts-dir-gitea "$_dir_gitea")"; then
  eval "$_resolved"
else
  echo "Kaola-Workflow: forge resolution refused — the reason is on stderr above" >&2
  CLAIM_JS=""
  return 1 2>/dev/null || exit 1
fi
case "$KW_FORGE" in
  github)
    gh issue list --limit 100
    ;;
  gitlab)
    glab issue list --limit 100
    ;;
  gitea)
    tea issues list --limit 100
    ;;
esac
```

If there is no matching remote, or if the forge CLI is unavailable or unauthenticated, skip issue fetching immediately and note that forge issue sync is pending. Do not spend time retrying forge calls during init.

## Maintain project instructions

The Global Workflow Contract already loaded by the runtime is the universal authority.
`workflow-init` does not locate, execute, install, or repair runtime/global machinery, and it leaves
runtime/global bytes unchanged. If that contract is absent or inconsistent with the installed
surface, leave project rules in place and report a separate installation check from the release
tree.

The Agent owns the meaning and prose of project instructions. Derive useful local facts and stricter
constraints from the repository itself. Omit unknowns; do not persist placeholders. There are
no required headings, order, wording, bytes, or length, and no parser or writer owns the result.

Preserve valid owner content.
Before changing an existing user-authored or owner-authored instruction file, show the minimal
diff and obtain consent. Keep `AGENTS.md` as the single project-fact authority for every supported
runtime. Claude Code (≥ 2.1.277) reads it directly, so do not create a `CLAUDE.md`,
`.claude/CLAUDE.md`, or `CLAUDE.local.md`: any repository `CLAUDE.md` shadows `AGENTS.md` for
Claude Code. If the inspection reported one, treat it as a shadowing file — when it holds only an
`@AGENTS.md` import, propose deleting it; when it holds owner content, propose moving the
Claude-specific facts into `AGENTS.md` and deleting it. Both proposals need owner authorization
before the write. Do not copy the global workflow or dispatch contract into the repository.

An active run is a reload warning, not a prompt-write lock. Reconcile in-flight custody before a
meaning-changing edit. After an edit, use a fresh top-level Agent/session for reliable validation
when the runtime does not reload instructions into the current context.

## Add only missing project structure

Create only artifacts the inspected repository actually needs. A normal first initialization may
add `kaola-workflow/archive/`, a concise documentation index and project docs, `docs/decisions/`, and
`CHANGELOG.md`. Never overwrite a useful file or fill one with generic boilerplate merely because a
path is listed here. Do not create an active `workflow-state.md` or a mission ledger; Workflow Next
owns the run. Ensure `.gitignore` carries `kaola-workflow/.ledger/`, the main checkout's live mission
ledgers; archive moves each one into the tracked run archive.

## Legacy Backlog Layer

<!-- PIN: backlog-migration -->
If tracked `kaola-workflow/ROADMAP.md` or `kaola-workflow/.roadmap/issue-*.md` files exist, measure
and report them; init never deletes them and an upgrade never migrates them. Ask separately before
moving priority to forge labels, posting unresolved residue, deleting tracked files, or changing
owner rules.

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
