---
name: kaola-workflow-research
description: Use when beginning Phase 1 of Kaola-Workflow for Codex, also called kaola-workflow, and gathering facts before strategy or implementation.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, re-plan,
or real dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
one enabled installed Kaola edition from `codex plugin list --json`, then execute
the bundled `kaola-workflow-codex-preflight.js` from that edition's exact
marketplace/name/version cache tuple.
Never search `$PWD/plugins` or select the lexically first cache entry:

```bash
if ! KAOLA_CODEX_PLUGIN_LIST_OUT="$(codex plugin list --json 2>&1)"; then
  printf 'profile_preflight_refused: plugin metadata unavailable: %s\n' "$KAOLA_CODEX_PLUGIN_LIST_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PLUGIN_META="$(node -e '
const value=JSON.parse(process.argv[1]);
const allowed=new Set(["kaola-workflow","kaola-workflow-gitlab","kaola-workflow-gitea"]);
const rows=(Array.isArray(value.installed)?value.installed:[]).filter(row => row && row.installed === true && row.enabled === true && allowed.has(row.name));
if(rows.length!==1)throw new Error(`expected exactly one enabled installed Kaola edition; got ${rows.length}`);
const row=rows[0];
for(const [label,item] of [["marketplace",row.marketplaceName],["name",row.name],["version",row.version]])if(typeof item!=="string"||item==="."||item===".."||!/^[A-Za-z0-9._-]+$/.test(item))throw new Error(`unsafe ${label}`);
if(row.pluginId!==`${row.name}@${row.marketplaceName}`)throw new Error("plugin identity mismatch");
process.stdout.write([row.marketplaceName,row.name,row.version].join("\t"));
' "$KAOLA_CODEX_PLUGIN_LIST_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: invalid plugin metadata: %s\n' "$KAOLA_CODEX_PLUGIN_META" >&2
  exit 1
fi
IFS=$'\t' read -r KAOLA_CODEX_MARKETPLACE KAOLA_CODEX_PLUGIN_NAME KAOLA_CODEX_PLUGIN_VERSION <<< "$KAOLA_CODEX_PLUGIN_META"
KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"
if ! KAOLA_CODEX_PREFLIGHT="$(node -e '
const fs=require("fs"),path=require("path");
const [home,base,marketplace,name,version]=process.argv.slice(1);
const resolvedHome=path.resolve(home),resolvedBase=path.resolve(base);
if(resolvedBase!==path.join(resolvedHome,".codex","plugins","cache"))throw new Error("plugin cache root escapes HOME");
let cursor=resolvedHome;
const homeStat=fs.lstatSync(cursor);
if(homeStat.isSymbolicLink()||!homeStat.isDirectory())throw new Error("HOME is unsafe");
const parts=[".codex","plugins","cache",marketplace,name,version,"scripts","kaola-workflow-codex-preflight.js"];
for(let index=0;index<parts.length;index+=1){
  cursor=path.join(cursor,parts[index]);
  const stat=fs.lstatSync(cursor);
  if(stat.isSymbolicLink())throw new Error(`symlink cache component: ${cursor}`);
  if(index<parts.length-1&&!stat.isDirectory())throw new Error(`non-directory cache component: ${cursor}`);
  if(index===parts.length-1&&!stat.isFile())throw new Error(`preflight is not a regular file: ${cursor}`);
}
process.stdout.write(cursor);
' "$HOME" "$KAOLA_CODEX_CACHE_ROOT" "$KAOLA_CODEX_MARKETPLACE" "$KAOLA_CODEX_PLUGIN_NAME" "$KAOLA_CODEX_PLUGIN_VERSION" 2>&1)"; then
  printf 'profile_preflight_refused: exact active preflight unavailable: %s\n' "$KAOLA_CODEX_PREFLIGHT" >&2
  exit 1
fi
KAOLA_CODEX_PREFLIGHT_ARGS=(--project-root "$PWD" --no-autofix --json)
if [ -n "${KAOLA_CODEX_PREFLIGHT_PLAN:-}" ]; then
  KAOLA_CODEX_PREFLIGHT_ARGS+=(--plan "$KAOLA_CODEX_PREFLIGHT_PLAN")
fi
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" "${KAOLA_CODEX_PREFLIGHT_ARGS[@]}" 2>&1)"; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PREFLIGHT_STATUS="$(node -e 'const v=JSON.parse(process.argv[1]);if(typeof v.status!=="string")throw new Error("missing status");process.stdout.write(v.status)' "$KAOLA_CODEX_PREFLIGHT_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: malformed preflight result: %s\n' "$KAOLA_CODEX_PREFLIGHT_STATUS" >&2
  exit 1
fi
if [ "$KAOLA_CODEX_PREFLIGHT_STATUS" != ok ]; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
```

The exact active cache root is
`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`.
The base invocation is `--project-root "$PWD" --no-autofix --json`; the gate
merges persisted config from HOME through the repository root to `"$PWD"`. When this
skill owns a frozen adaptive plan, set `KAOLA_CODEX_PREFLIGHT_PLAN` to that
exact plan before running the block so `--plan` is also enforced. Continue only
after exit 0 and parsed `status: "ok"`. Exact-byte drift such as
`profile_bytes_mismatch` is `profile_preflight_refused`: STOP before any
`agents.spawn_agent` call, never record `subagent-invoked`, and do not relabel
profile/config drift as tool unavailability or local fallback. Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Kaola-Workflow Research

Phase 1 discovers facts only. Do not choose a solution or edit implementation files.

<!-- PIN: adaptive-default-contract -->
**Adaptive-default contract.** Adaptive is the **unconditional default and path selection is a non-decision** — do NOT orient, read sibling path skills, deliberate, advisor-consult, or self-route here on issue size. `fast`/`full` are **install-time opt-ins** (`--with-fast` / `--with-full`); once installed they fire only on an explicit user escape (a "fast path" / "full path" verbal, or `KAOLA_PATH` / `--workflow-path`). Naming a path that is not installed is refused at the claim front door (`path_not_installed`) — never silently substituted with adaptive. There is no on/off switch and no automatic fallback between paths.

## Goal Contract

Continue until Phase 1 has parsed requirements, recorded research evidence,
selected a safe workflow project name, written `phase1-research.md`, and updated
`workflow-state.md` with `next_skill: kaola-workflow-ideation {project}`. Stop
only for true external authorization, materially user-owned choices, or
ambiguity that blocks correctness.


## Steps


1. Parse the request:
   - deliverable
   - user value
   - affected area
   - success criteria
   - linked issue, or `none`
2. Generate a deterministic 2-4 word kebab-case project name from the linked
   issue title or task description. If `kaola-workflow/{name}/` exists, append
   the first available collision suffix such as `{name}-2`; do not ask the user
   to confirm routine generated names.
   If a linked GitHub issue number `N` is known and no `## Sink` block exists
   yet, add a lightweight `## Sink` block to `workflow-state.md` with
   `branch: TBD`, `issue_number: N`, `claimed_at: N/A`, and `sink: merge` so
   later sessions can recognize the active issue before `phase1-research.md`
   exists.
3. Inspect relevant files, tests, config, docs, and issues. Use the `code-explorer` Codex agent role for this step. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.
4. Use the `knowledge-lookup` Codex agent role only when current external behavior matters; otherwise record why docs lookup is N/A.
5. Write raw notes to `.cache/code-explorer.md` and `.cache/knowledge-lookup.md` when used.
6. Score completeness from 0-10. Stop and ask if below 7.
7. Write `kaola-workflow/{project}/phase1-research.md` and update `workflow-state.md`. Preserve any existing `## Sink` blocks exactly; never replace the whole state file with phase-only fields.

## Phase File

```markdown
# Phase 1 - Research: {project}

## Deliverable
...

## Why
...

## Affected Area
...

## Key Patterns Found
1. path:line - fact

## Test Patterns
- Framework:
- Location:
- Structure:

## External Docs
links or none

## Completeness Score
X/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/code-explorer.md | |
| knowledge-lookup | invoked/N/A | .cache/knowledge-lookup.md or docs-impact check | reason if N/A |
```

## Mechanical Checkpoint (script-owned transaction)

`phase1-research.md` is the current session's research synthesis — already written on
disk above (this script never authors or edits it). The deterministic bookkeeping —
the `workflow-state.md` checkpoint write — is owned by the full-path transaction
script `kaola-workflow-full-advance.js`, not a subagent. The current
session runs it directly; it refuses if `phase1-research.md` is absent (typed
refusal, zero mutation) and is idempotent on resume. The current session keeps
requirement parsing, the research dispatches, the completeness gate, the
`phase1-research.md` synthesis, the verdict, and the branch decision; the script
only transcribes the checkpoint it is handed and never authors the
`phase1-research.md` synthesis, never invokes code-explorer/knowledge-lookup, and
never judges.

Resolve `$KAOLA_SCRIPTS` once, then run the checkpoint (no stdin packet —
`phase1-complete` is a checkpoint only):

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-full-advance.js' -print -quit 2>/dev/null)")"
fi

node "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" phase1-complete \
  --project {project} --json
```

This advances the state pointer to phase `1` / step `complete` with
`next_skill: kaola-workflow-ideation {project}`, PRESERVING any existing `## Sink`
block byte-for-byte. The per-issue roadmap `init-issue` creation/staging (Step 8)
and the `patch-branch` Sink backfill (Step 9) below stay the current session's own
separate direct script calls — they are not part of this checkpoint transaction.

8. If a GitHub issue is linked, run `init-issue` to create the roadmap tracking file:

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
fi
roadmap_script="$(dirname "$claim_script")/kaola-workflow-roadmap.js"
node "$roadmap_script" init-issue \
  --issue "$ISSUE_NUMBER" \
  --title "$ISSUE_TITLE" \
  --status open \
  --workflow-project "$KAOLA_PROJECT" \
  --next-step "ready"
```

9. If a branch has been cut, patch the Sink block with the branch name:

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
fi
node "$claim_script" patch-branch \
  --project "$KAOLA_PROJECT" \
  --branch "$(git rev-parse --abbrev-ref HEAD)"
```

State next pointer: `next_skill: kaola-workflow-ideation {project}`. Preserve
any existing `## Sink` blocks during this update.
