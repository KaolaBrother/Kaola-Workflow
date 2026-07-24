<!-- SLOT:nx-frontmatter -->

<!-- REGION:skill -->
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
<!-- /REGION -->

<!-- SLOT:nx-h1 -->

**First Principles.** When no shipped rule, gate, or refusal already settles a
situation, break the tie by the First Principles axioms (the `## First Principles`
block in your project's workflow-init CLAUDE.md), applied in priority order, and
record a one-line derivation in the node's `.cache` evidence — OPTIONAL, never
blocks a gate. An axiom may only make you stricter:
never cite one to skip a typed gate, refusal, or barrier.

<!-- SLOT:nx-replan-control-plane -->

<!-- REGION:command -->
`/workflow-next` is the thin router for the workflow commands. It owns
startup, Git/roadmap freshness, project selection, resume detection, and
routing. It does not perform workflow work directly.

## Inputs

Use `$ARGUMENTS` as either:
- an existing workflow project name
<!-- SPLICE:nx-cmd-001 -->
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase agents from this router. (Exception — `issue-scout`: a pre-claim,
  read-only backlog survey dispatched in Step 0 when the user did not name an issue. It
  is not a phase agent — it claims nothing, writes nothing, and only recommends the next
  target/bundle — so dispatching it does not break the router's dispatch-free contract.)
- Do not advance the run while any `Required Agent Compliance` row is
  `pending`, missing, or lacks evidence/skip reason.
- Prefer `workflow-state.md` for exact resume position.
- If `workflow-state.md` is missing or stale, reconstruct conservatively from
  node evidence and cache files.
- If exact intra-phase position is ambiguous, stop and ask the user instead of
  guessing.
- When the next command is identified, either continue by following the matching
  command content if available in this session, or print the exact command
  the user must run.

## Goal-Driven Autonomy

Keep going (via `/goal` or equivalent Stop-hook wording) until the phase objective and completion
audit pass. Decide nonessential bookkeeping autonomously; ask only for true external authorization or
materially user-owned choices. The `/goal` template must NOT imply cross-issue continuation — each run
targets exactly one issue or one selected same-scope bundle.

**Finishing an issue INCLUDES capturing its run-discovered defects** — each gap is FILED (`filed: #N`
in `finalization-summary.md`'s `## Run gaps`) or justified `noise: <reason>`, else the `gaps_unswept`
finalize gate refuses.

## Startup Step 0 - Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

**Branch first on whether the user named an issue:**

- **User named a specific issue** — `$ARGUMENTS` carries an issue number/project, or
  the prompt names one (e.g. "work on #N") → use the single-issue selection
  (steps 1–4 below), byte-unchanged.
- **User did NOT name an issue** — the common "work on the next issue" / no-argument
  case → this is the **auto-bundle entry**. Resolve the path intent first (Step 0a-1),
  then dispatch the read-only **`issue-scout`** agent (Step 0c, *Auto-bundle entry*)
  and adopt its recommendation: set `KAOLA_TARGET_ISSUES` for a high-confidence
  same-scope bundle **when the resolved path is adaptive**, otherwise set
  `KAOLA_TARGET_ISSUE` to the scout's `primary_issue` (single-issue, or any
  medium/low-confidence outcome). STATE the selected set aloud, then continue to
  validation (step 3) and startup. (Dispatching the scout here is explicitly
  permitted — see Router Rules; it is a pre-claim read-only survey, not a phase agent.)

On the no-issue-named branch, **`issue-scout` is the SOLE backlog reader** — the
router does NOT re-scan the backlog. The scout already reads `ROADMAP.md`, the forge
issue list, active folders, and archived summaries (its *Backlog Inventory* / *What You
May Read*); the router only ADOPTS the scout's recommendation, then validates + claims
it. Do not duplicate the scan here.

1. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
<!-- SPLICE:nx-cmd-003 -->
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
2. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
<!-- SPLICE:nx-cmd-004 -->
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
4. State the selected issue number aloud before calling startup.

If no actionable issue is found (all blocked, red, or occupied), stop and explain.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup Step 0c — Bundle Lane (Multi-Issue)

The bundle lane is additive: `--target-issue N` / `KAOLA_TARGET_ISSUE` single-issue
behavior is unchanged. Use the bundle lane only when the user explicitly names
several issues or when auto-bundle mode identifies a high-confidence same-scope
set (see below).

### Explicit-bundle entry

When the user names several issues, set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces)
and pass `--target-issues 42,47,53` (project/branch `bundle-42-47-53`, sorted
+ deduplicated; the script validates the exact set, never reorders). The bundle lane runs on `workflow_path: adaptive`.
`--target-issue` keeps single-issue behavior; never set both (`target_ambiguity`).

### Auto-bundle entry

This is the **no-issue-named branch of Step 0**: whenever the user does not name
a specific issue — including the everyday "work on the next issue" entry — dispatch the
read-only **`issue-scout`** agent to inspect the backlog before claiming anything. The
scout is the SOLE backlog reader; it surveys the sources listed in its own *What You May
Read* (roadmap sources, remote open issues + dependency labels, active folders, archived
summaries) — the router does not re-list or re-scan them here.

It returns one recommended same-scope bundle **plus a `primary_issue` and a `confidence`**
(or no bundle). **The main orchestrator STATES the selected issue set aloud before calling
startup.** Scripts validate but never select or substitute issues.

issue-scout is read-only: it cannot claim issues, write repository files, author
`workflow-plan.md`, close issues, or dispatch other agents.

Dispatch it with `model="{ISSUE_SCOUT_MODEL}"` — the governed issue-scout tier.
The model above is resolved at install time; the router does not substitute it.

**Isolated control-plane dispatch.** Give issue-scout an isolated, self-contained control-plane brief;
never inherit the full main-session conversation. The native `Agent(...)` prompt must state the
repository root, the selected issue/issue-set request (including goal context when present), the
issue-scout profile/read-only contract, and the bounded durable return (the complete recommendation
JSON). Keep the established issue-scout identity/header convention and isolated prompt. Treat a
spawn argument-shape refusal as correctable arguments: retry the same issue-scout role and bounded
brief exactly once; never perform issue selection inline. Tool-unavailable fallback remains reserved
for genuinely unavailable agent tooling.

<!-- REGION:github -->
**Goal context (`KAOLA_GOAL`).** When set, pass it to the scout as a soft filter (it adds a
`goal_alignment` field, never excludes on mismatch); it also flows into `cmdFinalize` as
`goal_check: satisfied`. Export once before `/workflow-next`.

<!-- /REGION -->
**Output → env wiring:** map the scout's recommendation into the startup env exactly:
- high-confidence same-scope bundle → set
  `KAOLA_TARGET_ISSUES` from `recommended_bundle.issues` (e.g. `KAOLA_TARGET_ISSUES=42,47,53`);
- otherwise (single-issue recommendation, `confidence: medium`/`low`)
  → set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`.
- Never set both (`target_ambiguity`).

**Selection Evidence Docking.** On this no-issue-named branch, once the target project's active
folder exists — after claim completes (the adaptive front end's claim inside
`/kaola-workflow-adapt`), before dispatching the executor — persist the
issue-scout's ENTIRE JSON reply verbatim, fenced, to
`kaola-workflow/{project}/.cache/selection-evidence.md`, prefixed with a one-line header
`selection_mode: auto-bundle` (bundle recommendation adopted) or `selection_mode: single-issue`
(the scout fell back to a single `primary_issue`). This durable selection evidence archives
automatically with the project when the run finalizes. Skip this step entirely on the
user-named-issue branch — a user-named claim legitimately has no selection evidence.

Auto-bundle emits a bundle only when all candidates are open + unclaimed, no dependency is unresolved
outside the set, they share a coherent scope signal, and the count is ≤ `KAOLA_BUNDLE_MAX_ISSUES`
(default 4). Otherwise the scout returns a single `primary_issue` → single-issue selection via
`KAOLA_TARGET_ISSUE`; do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
<!-- SPLICE:nx-cmd-005 -->
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

<!-- SPLICE:nx-cmd-006 -->

<!-- SPLICE:nx-cmd-007 -->
The `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates it.
Keyword matching is agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Adaptive is the only workflow path — there is nothing to select. Proceed directly to Step 0a-2.
State the path:

```text
Path: adaptive
```

## Startup Step 0a-2 — Adaptive front-end entry

The starting contract always moves into the adaptive front end: do NOT run
the Step 0b inline startup. The `workflow-planner` subagent — dispatched by
`/kaola-workflow-adapt`, never by this router — runs the claim itself, so the router only selects +
validates the issue (Step 0), then hands off. This keeps the router free of *phase-agent* and
*claim* dispatch (Router Rules) — the only router-side dispatch is the pre-claim, read-only
`issue-scout` survey in Step 0 (no-issue-named branch), which claims and writes nothing — while the
Opus front end owns the claim + the DAG authoring:

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
<!-- SPLICE:nx-cmd-009 -->
   route to `/kaola-workflow-plan-run {project}` and stop — the same `workflow-plan.md exists ->
   /kaola-workflow-plan-run` rule as Resume Detection. The front end is for FRESH adaptive work only.
<!-- SPLICE:nx-cmd-010 -->
   `/kaola-workflow-adapt $KAOLA_TARGET_ISSUE`. The adapt command's `workflow-planner` runs
<!-- SPLICE:nx-cmd-011 -->
   (the claim + worktree + `workflow-state.md`); git-freshness (Startup Step 1) runs INSIDE adapt against MAIN **before** the planner claims
   (so a dirty/behind main never orphans a worktree); the roadmap check (Startup Step 2) runs in adapt too.
   Do NOT run Startup Step 0b / 1 / 2 in the router for this path.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `/kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
   "Startup Step 0c — Bundle Lane" above for selection, and the Bundle Lane section
   of `kaola-workflow-adapt.md` for the planner's claim contract.

## Startup Step 0b - Startup Transaction

**Skip this entire step** — the adaptive front end (Step 0a-2) always claims via the
`workflow-planner`, not here. This step never runs; it is retained only for the shared
typed-refusal classification below.

Run `node "$CLAIM_JS" startup --runtime claude` with the agent-selected
`--target-issue` (and `--sink` when set); it atomically creates
`kaola-workflow/{project}/workflow-state.md`. Verdict `owned`/`acquired` routes the folder,
`no_target` re-selects per Step 0, `claim: "none"` stops normal routing (do not adopt an unrelated
folder). Print the refusal diagnostics:

```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

<!-- PIN: claim-escalate -->
If startup returns a typed refusal, read the `reasoning` field and classify by `result`:
- `result: refuse` (`target_occupied`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
  no plan/ledger exists yet at claim time.
If startup is unavailable or malformed, stop for repair.
<!-- SPLICE:nx-cmd-016 -->
before selecting new work.

## Startup Step 1 - Git Freshness

Classify local/remote state (`git status --short --branch`, `git fetch --prune`,
`git rev-list --left-right --count @{u}...HEAD`). Continue when synchronized, ahead-only, or with no
remote; fast-forward (`git pull --ff-only`) when clean and behind-only. Stop before any merge, rebase,
stash, reset, or dirty-worktree sync. If a claimed folder cannot fast-forward, release it before
stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

## Startup Step 2 - Roadmap

<!-- SPLICE:nx-cmd-017 -->

```bash
<!-- SPLICE:nx-cmd-018 -->
```

<!-- SPLICE:nx-cmd-019 -->
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
<!-- SPLICE:nx-cmd-020 -->
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
<!-- SPLICE:nx-cmd-021 -->
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
<!-- SPLICE:nx-cmd-022 -->

## Startup Step 3 - Select Project

If `$ARGUMENTS` names an existing `kaola-workflow/{project}/` directory, use
that project.

Otherwise list active workflow folders under `kaola-workflow/` that contain a
frozen `workflow-plan.md` or a `workflow-state.md` with `status: active`.
Skip `archive/`.

If no active project is selected and no target was named in Startup Step 0,
ask the user what to implement. New work starts with:

```text
/kaola-workflow-adapt <task description or issue>
```

## Co-active Folders

Distinct active folders run independently, each with its own `workflow-state.md` and branch/worktree
metadata. Do NOT merge, interleave, or batch commits across folders; the pre-commit guard blocks
staging multiple project folders together. If the same file appears in multiple active write sets,
stop and resolve the conflict.

## Resume Detection

Read `workflow-state.md` first; if valid (its `next_command` is `/kaola-workflow-plan-run`, pending
gates match the `Required Agent Compliance` table), use it as authoritative. Otherwise run the repair
helper (`node "$REPAIR_JS" "$ARGUMENTS"` when available), then reconstruct:

```text
finalization-summary.md exists -> workflow complete; show summary and stop
workflow-plan.md exists -> /kaola-workflow-plan-run {project}   (adaptive; a tampered/unparseable plan is a typed refusal, never a silent fallback)
no workflow-plan.md and no finalization-summary.md -> /kaola-workflow-adapt <task description or issue>
```

## State Bootstrap And Repair

When `workflow-state.md` is missing/stale/invalid but node evidence identifies exactly one safe next
command, write a conservative repaired state (`step: router-reconstructed`, `task: N/A` unless proven,
pending gates mirroring unresolved `Required Agent Compliance` rows,
`last_result: state_repaired_from_artifacts`) before routing. Do NOT fabricate state for brand-new
work, ambiguous/contradictory projects, or unresolved compliance gates. Phase commands own exact
intra-phase step detection.

## Required Output Before Routing

Print this before continuing or stopping:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step from workflow-state.md or reconstructed}
Pending gates: {list or none}
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {adaptive}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
Next command: {next_command}
```

When `claim: "none"` or a typed refusal occurred during startup, also print the
refusal diagnostics on the next line:

```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

If nested slash-command execution is supported in the current Claude Code
environment, continue by applying the matching command. Otherwise stop after
printing the next command.

## Completion Contract

Each `/workflow-next` run implements exactly one issue **or one explicitly selected
same-scope bundle**. After Finalization closes the issue (or every issue in the bundle)
and archives the active folder, the agent must stop and await explicit re-direction from
the user. Do not auto-route into the next issue in line.

A bundle closure is all-or-nothing: Finalization closes EVERY issue in `issue_numbers`,
removes every matching `.roadmap/issue-N.md` source, regenerates `ROADMAP.md` once,
archives one bundle folder, and then stops. To start additional work, the user must
invoke `/workflow-next` again.
<!-- /REGION -->
<!-- REGION:skill -->
This is the thin router. It owns startup checks, roadmap freshness, active project selection, state repair, and routing. It does not perform workflow work directly unless it routes into the next skill.

## Goal Contract

Continue until the phase objective is satisfied, evidence is recorded, and `workflow-state.md` points
to the correct `next_skill`. Decide nonessential bookkeeping autonomously; stop only for external
authorization, risky Git operations, materially user-owned choices, or correctness-blocking ambiguity.

## Run-Gap Capture (Goal Completion Rule)

**Finishing an issue INCLUDES capturing its run-discovered defects** — each gap is FILED (`filed: #N`
in `finalization-summary.md`'s `## Run gaps`) or justified `noise: <reason>`, else the `gaps_unswept`
finalize gate refuses.

## Delegation Contract

Codex subagent delegation is the default. The session delegation policy defaults to `delegate` and is established without prompting the user; the workflow complies with its delegated-role contract automatically rather than asking the user to choose.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**

The default `delegation_policy` is `delegate`: invoke the Codex subagent roles (code-explorer, planner, code-architect, tdd-guide, code-reviewer, security-reviewer, doc-updater) for delegated work and record `subagent-invoked` in each compliance ledger. Do not ask the user to choose a delegation policy.

Tool availability is auto-detected, not a user choice. The Codex Profile Freshness Gate above is authoritative for profile/config availability: it validates a higher-precedence project Kaola override before accepting a fresh global install. Missing, stale, malformed, or shadowed profiles are `profile_preflight_refused`: STOP before phase work and never record them as a local fallback. Only after a successful gate may a genuinely unavailable runtime agent tool or a model-refused spawn count as tool unavailability. In that case keep `delegation_policy: delegate` and, for each affected Codex role row, record `local-fallback-tool-unavailable` with non-empty runtime evidence. An empty Evidence cell fails the repair-state cross-check, so always write the evidence. Never present tool-unavailability as a question.

For every affected row, record `local-fallback-tool-unavailable` with a non-empty Evidence value.

The profile detection paths are the project override at `.codex/agents/kaola-workflow/` and the global default at `~/.codex/agents/kaola-workflow/`; only the precedence/trust-aware freshness gate decides which one is active.

Set `delegation_policy: local-authorized` (recording `local-fallback-explicit` in each Codex role row) only when the user explicitly asks to disable delegation or authorizes an inline local fallback. Do not select `local-authorized` on your own initiative.

**Write order** — three steps, in sequence:

1. Set `KAOLA_DELEGATION_POLICY=delegate` without asking; use `local-authorized` only on the user's explicit request to disable delegation.
2. Call the startup script (this creates `workflow-state.md`).
3. After startup succeeds and `workflow-state.md` exists, patch the delegation policy into the file:

```bash
printf '\ndelegation_policy: %s\n' "$KAOLA_DELEGATION_POLICY" >> "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
```

Where `KAOLA_DELEGATION_POLICY` is `delegate` by default and `local-authorized` only on the user's explicit request to disable delegation. `tool-unavailable` remains a valid `delegation_policy:` value, but runs detect tool absence as per-row `local-fallback-tool-unavailable` evidence under `delegate`.

Do not re-ask during the session. Re-establish the default only if `workflow-state.md` is absent.

## Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

**Branch first on whether the user named an issue:**

- **User named a specific issue** — `$ARGUMENTS` carries an issue number/project, or
  the prompt names one → use the single-issue selection (steps below), byte-unchanged.
- **User did NOT name an issue** — the common "work on the next issue" / no-argument
  case → this is the **auto-bundle entry**. Resolve the path intent first
  (Startup Step 0a-1), then dispatch the read-only **`issue-scout`** agent role
  (*Auto-bundle entry* below) and adopt its recommendation: set `KAOLA_TARGET_ISSUES`
  for a high-confidence same-scope bundle **when the resolved path is adaptive**,
  otherwise set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`. STATE the selected
  set aloud, then continue to validation and startup. (Dispatching the read-only scout
  here is permitted — it is a pre-claim survey, not a phase agent role.)

On the no-issue-named branch, **`issue-scout` is the SOLE backlog reader** — the
router does NOT re-scan the backlog. The scout already reads `ROADMAP.md`, the forge
issue list, active folders, and archived summaries (its *Backlog Inventory* / *What You
May Read*); the router only ADOPTS the scout's recommendation, then validates + claims
it. Do not duplicate the scan here.

1. If exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
<!-- SPLICE:nx-sk-002 -->
   if [ ! -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-003 -->
   fi
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
<!-- SPLICE:nx-sk-004 -->
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
3. State the selected issue number before calling startup.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Agent Issue Selection — Bundle Lane (Multi-Issue)

The bundle lane is additive: `KAOLA_TARGET_ISSUE` / `--target-issue N` single-issue
behavior is unchanged. Use the bundle lane only when the user explicitly names
several issues or when auto-bundle mode identifies a high-confidence same-scope set
(see below).

### Explicit-bundle entry

When the user names several issues, set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces)
and pass `--target-issues 42,47,53` (project/branch `bundle-42-47-53`, sorted
+ deduplicated; the script validates the exact set, never reorders). The bundle lane runs on `workflow_path: adaptive`.
`--target-issue` keeps single-issue behavior; never set both (`target_ambiguity`).

### Auto-bundle entry

This is the **no-issue-named branch of Agent Issue Selection**: whenever the user
does not name a specific issue — including the everyday "work on the next issue" entry —
dispatch the read-only **`issue-scout`** agent role to inspect the backlog before
claiming anything. The scout is the SOLE backlog reader; it surveys the sources listed in
its own *What You May Read* (roadmap sources, remote open issues + dependency labels,
active folders, archived summaries) — the router does not re-list or re-scan them here.

It returns one recommended same-scope bundle **plus a `primary_issue` and a `confidence`**
(or no bundle). **The main orchestrator STATES the selected issue set aloud before calling
startup.** Scripts validate but never select or substitute issues.

issue-scout is read-only: it cannot claim issues, write repository files, author
`workflow-plan.md`, close issues, or dispatch other agents.

On Codex v2, use the direct `agents.spawn_agent` tool for issue-scout; never use the server-reserved
`collaboration.spawn_agent` name and never dispatch through `functions.exec` or Code Mode. If preflight reports
`codex_v2_encrypted_transport_unsafe` or `codex_v2_role_transport_unsafe`, refuse before the scout
spawn. Do not retry an encrypted-output decode or reserved-schema failure and do not fall back to a
default role: the same transport/schema mismatch will fail deterministically again.

Use this literal v2 argument shape (with the repository and request values filled in); omit transient
`model` and `reasoning_effort` fields:

```yaml
agents.spawn_agent:
  task_name: "issue_scout"
  agent_type: "issue-scout"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Selected issue/set request: <request>. Apply the issue-scout skill/profile read-only contract. Return only the bounded durable recommendation JSON required below."
```

This is an isolated, self-contained control-plane brief: it includes repository root, selected
issue/set/project context, the required skill/profile contract, and the expected durable return.
Codex v1 likewise uses `fork_turns: "none"` and preserves the established identity/header convention.
No control-plane dispatch uses `fork_turns: "all"`.

The rejection `Full-history forked agents inherit the parent agent type, model, and reasoning effort; omit agent_type, model, and reasoning_effort, or spawn without a full-history fork.` is an
**argument-shape refusal**, not capacity or unavailable tooling. Correct the arguments to the literal
shape above and retry the same issue-scout role, task identity, isolated brief, and bounded durable
return exactly once. Never select issues inline. Reserve `local-fallback-tool-unavailable` for agent
tooling that is genuinely unavailable.

**Output → env wiring:** map the scout's recommendation into the startup env exactly:
- high-confidence same-scope bundle → set `KAOLA_TARGET_ISSUES`
  from `recommended_bundle.issues` (e.g. `KAOLA_TARGET_ISSUES=42,47,53`);
- otherwise (single-issue recommendation, `confidence: medium`/`low`)
  → set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`. Never set both (`target_ambiguity`).

**Selection Evidence Docking.** On this no-issue-named branch, once the target project's active
folder exists — after claim completes (the adaptive front end's claim inside
`kaola-workflow-adapt`), before dispatching the executor — persist the
issue-scout's ENTIRE JSON reply verbatim, fenced, to
`kaola-workflow/{project}/.cache/selection-evidence.md`, prefixed with a one-line header
`selection_mode: auto-bundle` (bundle recommendation adopted) or `selection_mode: single-issue`
(the scout fell back to a single `primary_issue`). This durable selection evidence archives
automatically with the project when the run finalizes. Skip this step entirely on the
user-named-issue branch — a user-named claim legitimately has no selection evidence.

Auto-bundle emits a bundle only when all candidates are open + unclaimed, no dependency is unresolved
outside the set, they share a coherent scope signal, and the count is ≤ `KAOLA_BUNDLE_MAX_ISSUES`
(default 4). Otherwise the scout returns a single `primary_issue` → single-issue selection via
`KAOLA_TARGET_ISSUE`; do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
<!-- SPLICE:nx-sk-005 -->
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

<!-- SPLICE:nx-sk-006 -->

<!-- SPLICE:nx-sk-007 -->

If the prompt contains any of the following (case-insensitive):
<!-- SPLICE:nx-sk-008 -->

<!-- SPLICE:nx-sk-009 -->
`${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates
this value without modification.

Do not set `KAOLA_SINK` if none of the keywords match. Keyword matching is
agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Adaptive is the only workflow path — there is nothing to select. Proceed directly to the
Adaptive front-end entry. State the path:

```text
Path: adaptive
```

## Startup — Adaptive front-end entry

The starting contract always moves into the adaptive front end: do NOT run
the Startup transaction below. The `workflow-planner` agent role — delegated by
`kaola-workflow-adapt`, never by this router — runs the claim itself, so the router only selects +
validates the issue, then hands off (keeping the router free of phase-agent and claim dispatch — the
only router-side dispatch is the pre-claim, read-only `issue-scout` survey in the no-issue-named
branch, which claims and writes nothing):

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
<!-- SPLICE:nx-sk-010 -->
   route to `kaola-workflow-plan-run {project}` and stop (the same `workflow-plan.md exists ->
   kaola-workflow-plan-run` rule as resume reconstruction). The front end is for FRESH adaptive
   work only.
<!-- SPLICE:nx-sk-011 -->
   --target-issue $KAOLA_TARGET_ISSUE` (the claim + worktree + `workflow-state.md`);
   git-freshness runs inside adapt against MAIN **before** the planner claims (so a dirty/behind main
   never orphans a worktree); the roadmap check runs in adapt too. Do NOT run
   the Startup transaction / git-freshness / roadmap steps in the router for this path.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
<!-- SPLICE:nx-sk-012 -->

## Codex Dispatch Mode Detection

Before the Startup transaction, detect the Codex spawn-tooling shape so the claim can persist
it for later dispatch cards. Reuse the preflight doctor (the same script the Delegation
Contract's tool-availability check above already relies on) rather than re-deriving the config
parse:

```bash
<!-- SPLICE:nx-sk-013 -->
if [ ! -f "$preflight_script" ]; then
<!-- SPLICE:nx-sk-014 -->
fi
KAOLA_CODEX_DISPATCH_MODE=""
if [ -f "$preflight_script" ]; then
  DOCTOR_OUT="$(node "$preflight_script" --doctor --project-root "$PWD" --json 2>/dev/null)" || true
  KAOLA_CODEX_DISPATCH_MODE="$(node -e "try{const j=JSON.parse(process.argv[1]);const byScope=(j.scopes||[]).reduce((m,s)=>{m[s.scope]=s;return m;},{});const s=(byScope.project&&byScope.project.exists)?byScope.project:byScope.user;process.stdout.write(s&&s.dispatch_mode&&s.dispatch_mode!=='n/a'?s.dispatch_mode:'')}catch(e){}" "$DOCTOR_OUT" 2>/dev/null)" || true
fi
```

An absent or failed detection leaves `KAOLA_CODEX_DISPATCH_MODE` empty — the Startup call below
omits `--codex-dispatch-mode` and the claim keeps its fail-closed `v1-thread-id` default. Never
fabricate a mode; only pass a value the doctor actually reported.

## Startup

**Skip this transaction** — the adaptive front end (above) always claims via the
`workflow-planner`, not here. This transaction never runs; it is retained only for the shared
typed-refusal classification below.

Run the startup transaction with the agent-selected target. Startup validates
<!-- SPLICE:nx-sk-015 -->
creates or reuses `kaola-workflow/{project}/workflow-state.md`.

```bash
<!-- SPLICE:nx-sk-016 -->
if [ ! -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-017 -->
fi

if [ -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-018 -->
  KAOLA_SINK_FLAG=""
  [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
  KAOLA_TARGET_FLAG=""
  [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
  KAOLA_DISPATCH_MODE_FLAG=""
  [ -n "${KAOLA_CODEX_DISPATCH_MODE:-}" ] && KAOLA_DISPATCH_MODE_FLAG="--codex-dispatch-mode $KAOLA_CODEX_DISPATCH_MODE"
  STARTUP_OUT=$(node "$claim_script" startup \
    --runtime codex \
    $KAOLA_SINK_FLAG \
    $KAOLA_TARGET_FLAG \
    $KAOLA_DISPATCH_MODE_FLAG 2>/dev/null) || true
  KAOLA_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
else
  echo "BLOCKED: kaola-workflow startup unavailable; cannot select issue-backed work." >&2
  exit 1
fi
```

If `STARTUP_OUT` has `verdict: "owned"`, route that project. If startup returns
`verdict: no_target`, the agent must select a target and re-run. <!-- PIN: claim-escalate -->
If startup returns a typed refusal, read the `reasoning` field and classify by `result`:
- `result: refuse` (`target_occupied`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
<!-- SPLICE:nx-sk-019 -->

<!-- REGION:gitlab -->
Before stopping, print the refusal diagnostics:

<!-- /REGION -->
<!-- REGION:gitea -->
Before stopping, print the refusal diagnostics:

<!-- /REGION -->
```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

<!-- REGION:github -->
Do not inspect active project folders unless the user explicitly names the project to resume. If a
claimed folder cannot fast-forward, release it before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

Distinct active folders run independently; do not merge, interleave, or batch commits across them.

<!-- /REGION -->
<!-- REGION:gitea -->
If the startup script is unavailable, stop for repair. If startup returns `claim: "none"`, stop
normal routing.

<!-- /REGION -->
Classify local and remote Git state:

```bash
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git fetch --prune
git status --short --branch
git rev-list --left-right --count @{u}...HEAD
```

Fast-forward only when clean and behind-only. Stop before merge, rebase, stash, reset, conflict resolution, or dirty-worktree sync.

<!-- SPLICE:nx-sk-020 -->

<!-- REGION:gitlab -->
If startup succeeds (folder claimed, worktree provisioned) but the Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), attempt fast-forward:

<!-- /REGION -->
<!-- REGION:gitea -->
If startup succeeds (folder claimed, worktree provisioned) but the Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), attempt fast-forward:

<!-- /REGION -->
```bash
<!-- SPLICE:nx-sk-021 -->
```

<!-- REGION:gitlab -->
If the block persists (merge/rebase required, dirty worktree), release the claimed folder
(`node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block`) and ask the
user to resolve the Git state before retrying. Distinct active folders run independently; do not merge
or batch commits across them. If GitLab is available, refresh open issues with `glab issue list`.

<!-- /REGION -->
<!-- REGION:gitea -->
If the block persists (merge/rebase required, dirty worktree), release the claimed folder
(`node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block`) and ask the
user to resolve the Git state before retrying. Distinct active folders run independently; do not merge
or batch commits across them. If Gitea is available, refresh open issues with `tea issues list`.

<!-- /REGION -->
Keep `kaola-workflow/ROADMAP.md` as a compact mirror of active unfinished work.

## Routing

Read `kaola-workflow/{project}/workflow-state.md` first. If missing or stale, run:

On resume, extract and reassign `delegation_policy:` alongside `phase` and `next_skill`;
if it is absent, default `delegation_policy` to `delegate` without prompting and continue.

```bash
<!-- SPLICE:nx-sk-022 -->
if [ ! -f "$repair_script" ]; then
<!-- SPLICE:nx-sk-023 -->
fi
test -f "$repair_script"
node "$repair_script" {project-or-empty}
```

Use the repaired state only when it identifies exactly one safe `next_skill`.
Treat a `kaola-workflow/{project}/workflow-state.md` with `status: active` as
active work. If there is one
<!-- SPLICE:nx-sk-024 -->
the user to confirm the generated workflow folder name.

Manual reconstruction order:

```text
finalization-summary.md exists -> workflow complete
workflow-plan.md exists -> kaola-workflow-plan-run   (adaptive; a tampered/unparseable plan is a typed refusal, never a silent fallback)
no workflow-plan.md and no finalization-summary.md -> kaola-workflow-adapt
```

## Required Output

Before continuing or stopping, print:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step}
Pending gates: {list or none}
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {adaptive}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
Next skill: {next_skill}
```

## Completion Contract

Each kaola-workflow-next run implements exactly one issue **or one explicitly selected
same-scope bundle**. After kaola-workflow-finalize closes the issue (or every issue in
the bundle) and releases the lease, the completion contract is satisfied. Stop and await
explicit re-direction. Do not auto-route into the next issue in line.

A bundle closure is all-or-nothing: finalization closes EVERY issue in `issue_numbers`,
<!-- SPLICE:nx-sk-025 -->
<!-- /REGION -->
