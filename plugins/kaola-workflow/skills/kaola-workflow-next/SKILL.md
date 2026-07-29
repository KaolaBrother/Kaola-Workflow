---
name: kaola-workflow-next
description: Use when resuming, routing, or starting a Kaola-Workflow for Codex project, also called kaola-workflow, from kaola-workflow state and node evidence.
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
exact plan before running the block so `--plan` is also enforced. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact, not tool unavailability, so record it as what it is.
Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Kaola-Workflow Next

**First Principles.** When no shipped rule, gate, or refusal already settles a
situation, break the tie by the First Principles axioms (the `## First Principles`
block in your project's workflow-init CLAUDE.md), applied in priority order, and
record a one-line derivation in the node's `.cache` evidence — OPTIONAL, never
blocks a gate. An axiom may only make you stricter:
never cite one to skip a typed gate, refusal, or barrier.

## In-progress re-plan control plane

<!-- PIN: replan-next -->

This fence outranks every normal startup, mirror, scheduler, handoff, validation, and
finalization route. Before any such action, read the project state and transaction status. When
either reports `replan_in_progress`, do not mutate or replace the frozen parent
`workflow-plan.md`. Read-only orientation must report the exact `replan_phase`,
`transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and
`last_cas_result`; never reconstruct them from memory.

The single legal mutation while the fence is active is the edition-local re-plan resume command:

```bash
REPLAN_SCRIPT="./plugins/kaola-workflow/scripts/kaola-workflow-replan.js"
if [ ! -f "$REPLAN_SCRIPT" ]; then
  REPLAN_SCRIPT="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-replan.js' -print -quit 2>/dev/null)"
fi
[ -n "$REPLAN_SCRIPT" ] && [ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

The installed aggregator is `kaola-workflow-replan.js`. Do not run mirror/open/record/close/run-chains,
ordinary adaptive handoff, claim archive, task-mirror refresh, or finalize while an intermediate
phase remains. `decision:ask` remains advisory and never adds a pause or gate.

If resume returns `replan_planner_dispatch_required`, dispatch the genuine
`workflow-planner` profile in its Re-plan dispatch mode with an isolated brief containing only
the repository root, project, `transaction_id`, `dispatch_nonce`, profile identity, the exact
`.cache/replan-planner-packet.json` path, and the packet's reason/source evidence. No role
sequence, node ids, dependencies, write sets, cardinality, shape, model, or exact DAG fragment may
be supplied by the orchestrator; an attempt earns `planner_control_boundary_violation`. The
planner alone writes the seeded `workflow-plan.next.md` and
`.cache/replan-planner-attestation.json`, then returns through this same resume command. Missing,
stale, replayed, or mismatched dispatch proof/attestation is
`replan_planner_attestation_invalid`; main must never synthesize either artifact.

An invalid unfrozen child uses the bounded unfrozen child-repair loop: re-dispatch the same planner
with the verbatim validator errors and its own child draft, then resume. The main session never
repairs the child DAG. At the retry bound, stop with the typed evidence; do not create a competing
plan, restart the claim, or route to another path. A verified legacy-v1 parent follows this same
transaction into a schema-2 child; legacy normal startup behavior otherwise stays unchanged.

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

Tool availability is auto-detected, not a user choice. The Codex Profile Freshness Gate above is authoritative for profile/config availability: it validates a higher-precedence project Kaola override before accepting a fresh global install. Missing, stale, malformed, or shadowed profiles report `profile_preflight_refused` — profile drift, which is not a local fallback and should not be recorded as one. A genuinely unavailable runtime agent tool or a model-refused spawn is what tool unavailability means. In that case keep `delegation_policy: delegate` and, for each affected Codex role row, record `local-fallback-tool-unavailable` with non-empty runtime evidence. An empty Evidence cell fails the repair-state cross-check, so always write the evidence. Never present tool-unavailability as a question.

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
  the prompt names one → use the single-issue selection (steps below). That issue IS
  the target: never substitute another, and never adopt an active folder's issue in
  its place.
- **User described a task but named no issue** — a free-form description of the work
  → leave `KAOLA_TARGET_ISSUE` / `KAOLA_TARGET_ISSUES` UNSET and route to
  `kaola-workflow-adapt <the task description, verbatim>`. The described task IS the
  target: adapt resolves it to exactly one issue before claiming, and the backlog
  survey NEVER runs on this branch, so roadmap priority cannot outrank the work the
  user asked for. Skip the numbered steps below.
- **User named neither an issue nor a task** — the common "work on the next issue" /
  no-argument case → this is the **auto-bundle entry**. Resolve the path intent first
  (Startup Step 0a-1), then leave `KAOLA_TARGET_ISSUE` / `KAOLA_TARGET_ISSUES` UNSET and
  route straight to the Adaptive front-end entry (*Auto-bundle entry* below documents
  the selection contract): YOU rank the backlog and select — one issue by default, or a
  high-confidence same-scope bundle when every bundle rule is met — record the selection
  in a typed selection record, and route to `kaola-workflow-adapt` carrying the resolved
  target, the record path, and the reconnaissance evidence paths. The `workflow-planner`
  role then claims + authors + freezes in ONE dispatch. Skip the numbered steps below on
  this branch — there is no router-VALIDATED target to state; you state the SELECTED one
  instead.

On the no-target branch (the user named neither an issue nor a task), **the ORCHESTRATOR is
the backlog reader** — selection is orchestrator-owned and is never delegated to the
planner. Read `ROADMAP.md` (its `## Active Work` table's `Next Step` column and any
`### Project rules` block), each `kaola-workflow/.roadmap/issue-*.md`, the forge issue
list, active folders and each non-owned lane's `lane_bucket`, and archived summaries.
Rank them by the precedence in the Bundle Lane section below, claim through Gate 1, then
delegate the `workflow-planner` role with the resolved target, the selection record, and
the reconnaissance evidence PATHS. The planner shapes what you selected — its own
*Origin inputs* section states what it consumes and what it refuses — and never ranks the
backlog itself.

1. If the user named a specific issue number or project — in `$ARGUMENTS` or in the prompt — set `KAOLA_TARGET_ISSUE` to THAT issue and go to step 3. A named target is never substituted: do not read, adopt, or fall back to an active folder's issue in its place.
2. ONLY when the user named no issue and no project: if exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call. If a target WAS named and it differs from the active folder's issue, keep the named target — co-active folders are supported, and the named issue gets its own lane.

   ```bash
   claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
   if [ ! -f "$claim_script" ]; then
     claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
   fi
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
3. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.
   - Online: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
4. State the selected issue number before calling startup.

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
`--target-issue` keeps single-issue behavior; pass exactly one (both answers `target_ambiguity`).

### Auto-bundle entry

**Single-issue is the default here.** On this branch the ORCHESTRATOR selects ONE issue unless
EVERY bundle rule below is met; it never manufactures a bundle. The heading names the entry
point, not the expected outcome.

This is the **no-target branch of Agent Issue Selection** — the user named neither an issue
nor a task. The router delegates no phase agent, but it DOES own the selection: read the
backlog sources (roadmap sources, remote open issues + dependency labels, active folders,
archived summaries), rank by the precedence below, and settle a single `primary_issue` — or a
high-confidence same-scope bundle when every rule below holds. Then claim through Gate 1 and
route to the Adaptive front-end entry, where the `workflow-planner` role authors + freezes in
ONE dispatch.

A bundle requires ALL of: every candidate open + unclaimed, no dependency unresolved outside
the set, a shared coherent scope signal, and a count the orchestrator judges shippable as ONE
plan (8 or fewer is the recommended shape; nothing enforces it). If any rule fails, or confidence is not high, select a single `primary_issue` →
single-issue selection.

**The main orchestrator STATES the selected issue set aloud BEFORE it claims.**
Scripts validate but never select or substitute issues.

### Ranking candidates

Rank by the roadmap priority frontier (`### Project rules` and the `Next Step` drive-order), then
group by scope. Say in the selection record what you skipped and why. Exclude what is not yours to
take: issues closed or already claimed, or classified red against active work.

### Co-Tenant Mode: Disjoint Issue Selection

When reading active folders, each non-owned lane carries a `lane_bucket` classification in the
claim-status report. Use it to shape the candidate pool before any other selection step:

- **`mine`** — this session owns the lane; operate normally.
- **`live`** — another live session is working in this lane. Leave it entirely untouched and exclude
  all of its issues from the candidate pool.
- **`stale`** — a resumable leftover from a prior, inactive session. Treat its issues as ordinary
  unclaimed candidates for overlap purposes.
- **`ambiguous`** — liveness cannot be determined. Do not include this lane's issues in any
  recommendation; record the ambiguity and ask.

**Per-lane precedence ladder (first match wins, applied independently per lane):**
1. An explicit per-issue resume instruction (e.g. "resume issue N") makes the lane `stale` (resumable)
   regardless of marker age — this beats all other signals.
2. A blanket co-tenant signal in the user prompt (e.g. "another session is working") makes all
   non-owned, non-explicitly-resumed lanes `live`.
3. The liveness heuristic from `lane_bucket`: a fresh marker → `ambiguous`; an old or absent marker →
   `stale`.
4. No signal → ask.

Combine the `live`-lane issue exclusion with the write-set overlap verdict when building the candidate
pool: a bundle is eligible only when its issues are not occupied by any `live` lane AND its write areas
do not conflict with active work. When all candidates are occupied by `live` or `ambiguous` lanes, emit
the `backlog_empty` verdict rather than recommending occupied work.

### Bundle Selection Rules

**Default: single issue.** Bundle only when the issues are open, unclaimed, share a scope signal, and
their write areas fit one adaptive DAG. The ceiling is `KAOLA_BUNDLE_MAX_ISSUES` (default 8) and the
claim enforces it.

If you pass over the frontier issue, say which one and why in `selection_priority_basis`, and list it
in `selection_rejected`. An unexplained substitution is the failure mode; an explained one is a
judgement call you are entitled to make.

### Empty backlog / indeterminate selection — the pre-claim verdicts

Selection runs BEFORE any claim, so an empty or ambiguous backlog must fail closed WITHOUT claiming or
writing any state. State the typed verdict and STOP:

- **`backlog_empty`** — after the full survey there is no claimable, unblocked, same-scope bundle:
  every open issue is already claimed, classified red, has an unresolved external dependency, is
  occupied by a `live`/`ambiguous` lane, or the backlog has no open issues at all. Do NOT emit this
  merely because confidence is low or the bundles are suboptimal — only when no issue passes all bundle
  rules.
- **`selection_indeterminate`** — selection cannot be resolved determinately (e.g. an `ambiguous`
  co-tenant lane blocks the frontier, or the priority signal is genuinely contradictory).

Both are pre-claim survey verdicts (`result: 'escalate'`, `claim: 'none'`) — nothing is written and
the user is asked. A CLEAN
selection — frontier honored, no ambiguity — claims autonomously; only ambiguity or a policy conflict
asks the user first.

### The typed selection record at claim
**Selection record.** The selection is the orchestrator's, so the orchestrator persists it. Author a
JSON record with six fields — `selection_mode`, `selection_bundle`,
`selection_priority_basis`, `selection_rejected`, `selection_disjointness`, and `clarifications` (the
questions asked and the answers received, or `none`) — and pass it to the claim as
`--target-source orchestrator_selected --selection-record <path>`. Startup never grades the record
and never refuses over it: what parses is persisted byte-for-byte as authored, and a claim arriving
without a usable record gets the canonical "none recorded" record in its place (persisted only
if the claim acquires) plus a
`selection_record_note` on the emitted envelope naming what was found. Claiming is bookkeeping — the
record is the evidence, not the door. On an acquiring claim startup copies the record verbatim to
`kaola-workflow/{project}/.cache/origin/selection-record.json`, stamps its sha256 into
`workflow-state.md` as `selection_record_digest:`, and folds any pre-claim reconnaissance staged under
`kaola-workflow/.origin/<target-key>/` into that same `.cache/origin/` directory (`<target-key>` is the
project name the claim resolves to). A user-named claim passes neither flag and startup writes the
canonical record (`selection_mode: explicit-target`) itself, so the durable field is never optional.

Everything BEFORE that claim is free: dispatch read-only agents, read what you need, and ask the user
when the pick is genuinely ambiguous — just land the findings in files under
`kaola-workflow/.origin/<target-key>/`, never only in run context. Nothing is regulated at the
commitment point either — it records what it was handed and reports what it found. The
router may also dock a human-readable `kaola-workflow/{project}/.cache/selection-evidence.md` with a
leading `selection_mode: auto-bundle|single-issue` line; the orchestrator is that sidecar's only
writer, so it exists only on this no-target branch — a user-named claim legitimately has none.


### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
(all-or-nothing). There is one merge/PR sink per bundle. The finalization step
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

## Startup Step 0a — PR Intent Capture

Before the startup transaction, check the user's initial prompt for PR sink intent.

If the prompt contains any of the following (case-insensitive):
- "open a PR"
- "create a PR"
- "pull request"
- "sink=pr"
- "KAOLA_SINK=pr"
- "PR sink"

Then export `KAOLA_SINK=pr` before the startup call. The existing
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
validates the issue when the user named one, or passes NO target on the auto-bundle entry, then
hands off either way (keeping the router free of phase-agent and claim dispatch — there is no
router-side dispatch at all, on either branch):

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then
   route to `kaola-workflow-plan-run {project}` and stop (the same `workflow-plan.md exists ->
   kaola-workflow-plan-run` rule as resume reconstruction). The front end is for FRESH adaptive
   work only.
2. **Fresh adaptive.** Run `watch-pr` once, then route to `kaola-workflow-adapt $KAOLA_TARGET_ISSUE`.
   The adapt skill's `workflow-planner` runs `kaola-workflow-claim.js startup
   --target-issue $KAOLA_TARGET_ISSUE` (the claim + worktree + `workflow-state.md`);
   git-freshness runs inside adapt against MAIN **before** the planner claims (so a dirty/behind main
   never orphans a worktree); the roadmap check runs in adapt too. Do NOT run
   the Startup transaction / git-freshness / roadmap steps in the router for this path.

   **Task description (no issue number):** when the user described the work but named no
   issue (the described-task branch), route to `kaola-workflow-adapt <the task
   description, verbatim>`. Adapt resolves the description to exactly one issue before the
   claim and dispatches the planner in explicit-target mode with that issue plus the
   description verbatim. The no-target backlog survey does NOT run on this route, so roadmap
   priority cannot outrank the described task.

   **No target (auto-bundle entry):** when neither `KAOLA_TARGET_ISSUE` nor
   `KAOLA_TARGET_ISSUES` was set and the user described no task (the no-issue-named branch),
   route to `kaola-workflow-adapt` carrying the target YOU selected, the `--selection-record`
   path, and the reconnaissance evidence paths. The orchestrator owns the selection; the
   planner role runs the claim and authors — see "Agent Issue
   Selection — Bundle Lane" above, *Auto-bundle entry*.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
   "Agent Issue Selection — Bundle Lane" above for selection, and the Bundle Lane
   section of `kaola-workflow-adapt` for the planner's claim contract.

## Startup

**Skip this transaction** — the adaptive front end (above) always claims via the
`workflow-planner`, not here. This transaction never runs; it is retained only for the shared
claim-outcome classification below.

Run the startup transaction with the agent-selected target. Startup validates
the explicit issue, refreshes PR-backed folders with `watch-pr`, and atomically
creates or reuses `kaola-workflow/{project}/workflow-state.md`.

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
fi

if [ -f "$claim_script" ]; then
  node "$claim_script" watch-pr >/dev/null 2>&1 || true
  KAOLA_SINK_FLAG=""
  [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
  KAOLA_TARGET_FLAG=""
  [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
  STARTUP_OUT=$(node "$claim_script" startup \
    --runtime codex \
    $KAOLA_SINK_FLAG \
    $KAOLA_TARGET_FLAG 2>/dev/null) || true
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
When startup does not acquire, read the `reasoning` field and classify by `result`:
- `result: answer` (`no_target`, `target_ambiguity`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`, `target_indeterminate`): nothing was written and the
  claim did not happen. Act on the fact — fix the argv, retry, go offline, or re-state the reason
  and claim a different target. Do not blind-read a missing state file.
- `result: consent` (`dirty_tree_refused`): the subject is the user's own uncommitted work. **ASK
  THE USER the `ask` on the envelope verbatim** and act on the answer (commit, stash, or worktree).
- `result: refuse` (`target_occupied`, `user_target_closed`, `target_set_*` other than the
  indeterminate one): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_set_indeterminate`): the bundle classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
  no plan/ledger exists yet at claim time.
If the startup script is unavailable, stop for repair. If startup returns `claim: "none"`, stop normal routing. Before
stopping, print the refusal diagnostics:

```text
Startup outcome: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

Do not inspect active project folders unless the user explicitly names the project to resume. If a
claimed folder cannot fast-forward, release it before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

Distinct active folders run independently; do not merge, interleave, or batch commits across them.

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

If GitHub is available, refresh open issues:

```bash
gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

Keep `kaola-workflow/ROADMAP.md` as a compact mirror of active unfinished work.

## Routing

Read `kaola-workflow/{project}/workflow-state.md` first. If missing or stale, run:

On resume, extract and reassign `delegation_policy:` alongside `phase` and `next_skill`;
if it is absent, default `delegation_policy` to `delegate` without prompting and continue.

```bash
repair_script="plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js"
if [ ! -f "$repair_script" ]; then
  repair_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-repair-state.js' -print -quit 2>/dev/null)"
fi
test -f "$repair_script"
node "$repair_script" {project-or-empty}
```

Use the repaired state only when it identifies exactly one safe `next_skill`.
Treat a `kaola-workflow/{project}/workflow-state.md` with `status: active` as
active work. If there is one
unambiguous open GitHub issue and no active project, select it without asking
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
removes every matching `.roadmap/issue-N.md` source, regenerates `ROADMAP.md` once,
archives one bundle folder, and then stops. To start additional work, the user must
invoke kaola-workflow-next again.
