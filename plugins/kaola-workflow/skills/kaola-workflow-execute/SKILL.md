---
name: kaola-workflow-execute
description: Use when Phase 3 plan exists and Kaola-Workflow for Codex, also called kaola-workflow, needs TDD implementation, scoped validation, and failure routing.
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

# Kaola-Workflow Execute

Phase 4 implements the plan. Use the `tdd-guide` Codex agent role for assigned implementation tasks. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.


## Goal Contract

Continue until all Phase 3 tasks are complete, validation evidence is recorded
for each task, failure routing is resolved, and `workflow-state.md` points to
`next_skill: kaola-workflow-review {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.


## Guardrails

- Stay inside the active task write set.
- Use RED -> GREEN -> REFACTOR for behavior changes.
- Do not mark a task complete while validation fails.
- Route behavior/test failures to `tdd-guide`.
- Route build/type/lint/tooling failures to `build-error-resolver`.
- Record every command, result, and evidence path.

The mechanical bookkeeping below — creating or updating
`kaola-workflow/{project}/phase4-progress.md` from the template (the `## Tasks`,
`## Failure Routing Ledger`, and `## Required Agent Compliance` rows), the
per-task `workflow-state.md` pointer moves (preserving any existing `## Sink`
block byte-for-byte), the Failure Routing Ledger row transcriptions, and the
task-completion rows that mark a task complete and advance `workflow-state.md`
to `next_skill: kaola-workflow-review {project}` — is owned by the full-path
Phase 4 transaction script `kaola-workflow-phase4-advance.js`, not a
subagent. The script writes the durable bookkeeping files but copies the
classification, route, and validation verdict exactly as the session hands them
— it never classifies a failure, chooses a route, judges that validation
passed, dispatches `tdd-guide`, `build-error-resolver`, or any other role, acts
as a gate, or asks the user. It captures real exit codes and never gates on a
piped `| tail`. The current session keeps the `tdd-guide` and
`build-error-resolver` dispatches, the failure classification and routing
decision, and the validation-passed verdict.

Resolve `$KAOLA_SCRIPTS` once before the first transaction call:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-phase4-advance.js' -print -quit 2>/dev/null)")"
fi
```

## Progress File (script-owned transaction)

When `phase4-progress.md` is missing, stamp it from `phase3-plan.md` via the
transaction script. This is mechanical bookkeeping with no session judgment: the
script writes one `## Tasks` row and one `## Required Agent Compliance` `tdd-guide
executor task N` row per Phase 3 `### Task N:` block (all status `pending`; Build
Status `clean`; empty Failure Routing Ledger). It is create-only and idempotent —
it skips if the file already exists:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" init-progress \
  --project {project} --json
```

The script stamps this template:

```markdown
# Phase 4 - Progress: {project}

## Tasks
| # | Name | Status | Files Modified | Notes |
|---|------|--------|----------------|-------|
| 1 | name | pending | | |

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | pending | | |
```

## Per-Task Loop

1. Open the task. The script moves the `workflow-state.md` pointer to the task
   (a mechanical pointer move — no judgment, preserving any existing `## Sink`
   block byte-for-byte):

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" open-task \
     --task {n} --project {project} --json
   ```

2. RED: invoke the `tdd-guide` Codex agent role to write or update the focused
   test first, then run it and capture the expected failure.
3. GREEN: implement the minimal change and run the same test until it passes.
4. REFACTOR: clean only within scope while tests stay green.
5. Run or delegate the exact validation command from `phase3-plan.md`.
6. Save raw evidence to `.cache/tdd-task-{n}.md`.

If validation fails after GREEN or REFACTOR, the session **classifies** the
failure and **decides** the route, then records the mechanical Failure Routing
Ledger row directly via the transaction script before invoking the fix agent.
The classification and routing decision are the session's; the script only
transcribes the row verbatim (the row is deduped on re-run):

```bash
echo '{"failing_command":"<cmd>","classification":"<class>","routed_to":"<agent>","evidence":"<path>","status":"open"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" record-failure \
  --task {n} --project {project} --stdin --json
```

Routing (the session's decision):

- behavior, regression, coverage, or acceptance failure -> `tdd-guide`
- build, type, lint, dependency, formatting, or tooling failure -> `build-error-resolver`

Re-run validation after the routed fix. Keep the task `in_progress` until
validation passes.

Only after the session has **judged** that validation passed for the task does
it close the task via the transaction script. The "validation passed" verdict is
the session's; the script only transcribes the completion — it marks the task
`complete`, fills its Files Modified column, flips its `## Required Agent
Compliance` `tdd-guide executor task {n}` row to a resolved status with the
evidence path, sets Build Status and `Last Updated`, and moves the
`workflow-state.md` pointer to the next task or to
`next_skill: kaola-workflow-review {project}`, preserving any existing `## Sink`
block byte-for-byte. Pass the verified task result on stdin: the modified-file
list (from the verified `tdd-guide` evidence), the build status (`clean`, or the
failure detail), and optionally the evidence path (defaults to
`.cache/tdd-task-{n}.md`):

```bash
echo '{"files_modified":["<path>"],"build_status":"clean","evidence":".cache/tdd-task-{n}.md"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" close-task \
  --task {n} --project {project} --stdin --json
```

When all tasks are complete and compliance rows are resolved, the last
`close-task` advances `workflow-state.md` to
`next_skill: kaola-workflow-review {project}`.
