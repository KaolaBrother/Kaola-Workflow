---
name: kaola-workflow-next
description: Use when starting, resuming, or running Kaola-Workflow for Codex work, also called kaola-workflow — claims the issue, writes the run's mission list, and runs it from that one file.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, or real
dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
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
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" --project-root "$PWD" --no-autofix --json 2>&1)"; then
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
merges persisted config from HOME through the repository root to `"$PWD"`. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact about the install, never a judgement about the work, so
record it as what it is. Re-run the gate if the installed profile set changes.
<!-- /PIN -->
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override a
standard-tier role's model or reasoning effort based on task breadth, latency, prior results, risk,
or any other condition. The role classification remains unchanged.
<!-- /PIN -->

# Kaola-Workflow Next

This skill is the whole workflow: it claims the work, writes the run's mission list, and runs it.
Everything the run needs in order to survive an interruption lives in
`kaola-workflow/{project}/mission-list.md`, so a successor with no context at all resumes by
reading one file.

**First Principles.** When nothing already settles a situation, break the tie by the First
Principles axioms (the `## First Principles` block in your project's workflow-init `CLAUDE.md`),
applied in priority order. Recording a one-line derivation alongside the work is useful and never
required.

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one. There is no durable valve and nothing collects an approval on your behalf: this rule is
the whole mechanism, so it lives or dies with your judgement. A destructive Git operation, a
deployment, a credential action, a schema or public-API change, deleting working capability,
reorganizing someone's issues or roadmap — state what you propose and why, then wait for the answer.
Everything checkable is yours to decide and get on with.
<!-- /PIN -->

## Step 1 — Pick the work

You select the target. No script picks for you.

- **The user named an issue** — in the arguments or in the prompt ("work on #N") → that issue IS the
  target. Never substitute another, and never adopt an active folder's issue in its place.
- **The user described a task but named no issue** → resolve the description to the issue it
  belongs to, or file one, before claiming. The described task IS the target; roadmap priority
  never outranks the work the user asked for.
- **The user named neither** — the common "work on the next issue" case → you read the backlog and
  rank it: `kaola-workflow/ROADMAP.md` (its `## Active Work` table's `Next Step` column and any
  `### Project rules` block), each `kaola-workflow/.roadmap/issue-*.md`, the open issue list, the
  active folders, and the archived summaries. Rank by the roadmap priority frontier, then by scope.
  Exclude what is not yours to take: issues already closed, already claimed, or occupied by another
  live session. **State the selection aloud before you claim it.** If you pass over the frontier
  issue, say which one and why.

**Everything before the claim is free.** Dispatch read-only agents, read whatever you need, and ask
the user when the pick is genuinely ambiguous. A clean selection — frontier honored, no ambiguity —
claims without asking.

A run normally carries one issue. Several issues may share one run when they are all open,
unclaimed, and share a coherent scope; that is a shape judgement and nothing caps it. Say which
issues you bundled and why.

**Goal context.** When `KAOLA_GOAL` is exported, treat it as a soft filter inside the chosen
priority tier: note the alignment, never exclude on mismatch, and never let it outrank an open,
actionable frontier issue. Finalization records that a goal was DECLARED — never that it was met.

## Step 2 — Freshness, before the claim

Classify local and remote state and settle it before anything is claimed, so a dirty or behind
checkout never orphans a worktree:

```bash
git status --short --branch
git fetch --prune
git rev-list --left-right --count @{u}...HEAD
```

Continue when synchronized, ahead-only, or with no remote; fast-forward (`git pull --ff-only`) when
clean and behind-only. Stop before any merge, rebase, stash, reset, or dirty-worktree sync and ask
the user — that is their uncommitted work, not yours.

If a GitLab remote and an authenticated `glab` are available, read the open issues:

```bash
glab issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

If GitLab is unavailable, or `KAOLA_WORKFLOW_OFFLINE=1` is set, continue from the local
roadmap sources and say why the remote read was skipped.

`kaola-workflow/ROADMAP.md` is generated from `kaola-workflow/.roadmap/issue-*.md`; check it is
current, and do not hand-edit the mirror:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
[ -f "$KAOLA_SCRIPTS/kaola-gitlab-workflow-roadmap.js" ] && node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-roadmap.js" validate
```

A stale mirror is a warning, not a stop: say so and continue. Do not run `generate` automatically
and do not stage or commit the mirror here — closure owns that.

A run that ended by opening a review request instead of merging leaves its folder open until that
request lands. Sweep those once here, so a folder whose request has since merged or closed is
archived rather than mistaken for live work:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" watch-mr >/dev/null 2>&1 || true
```

## Step 3 — Claim

The claim is bookkeeping: it records which issue, branch and worktree this run owns, in
`kaola-workflow/{project}/workflow-state.md`, so a successor knows what is already in flight.

Set `KAOLA_TARGET_ISSUE` to the issue you selected, then run the startup transaction. For a run
carrying several issues, swap `--target-issue "$KAOLA_TARGET_ISSUE"` for
`--target-issues 42,47,53` — comma-separated, no spaces; the script validates the exact set and
never reorders it.

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitlab/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitlab/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" startup --runtime codex --target-issue "$KAOLA_TARGET_ISSUE"
```

It atomically creates the project folder and its `workflow-state.md`, and provisions a repo-local
worktree at `<repo-root>/.kw/worktrees/<project>/` unless `KAOLA_WORKTREE_NATIVE=0` disables it.
The worktree is a tool: decline it and the run still finishes.

Read the emitted envelope. `owned` or `acquired` means you have the folder — go on. Anything else
reports a fact about the target rather than a verdict about you: act on the fact. Fix the argument,
retry, work offline, or re-state your reason and claim something else. If the report is about the
user's own uncommitted work, ask the user the question it carries and act on the answer. Do not
read a state file the claim did not write, and do not silently adopt an unrelated folder.

If an active folder for this target already exists, **resume it** rather than claiming again — go
straight to Step 6.

## Step 4 — Write the mission list

`kaola-workflow/{project}/mission-list.md` is the run's coordination record and the one file a
successor needs. Write it immediately after the claim, before any work goes out. No script owns this
file; you write it.

An H1 carrying the goal in one line, then one item per mission:

```markdown
# <the goal, one line>

- item: <the mission, one line of prose>
  status: todo

- item: <the mission>
  status: in-flight
  dispatched: <what went out and to whom, and where its output was to land>

- item: <the mission>
  status: done
  dispatched: <what went out and to whom, and where its output was to land>
  result: <where the outcome landed — a path, or a few lines inline>
```

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

Items are identified by their order in the file; nothing depends on a stable ID. Fields appear in
the order above and absent fields are simply absent — a `todo` item has no `dispatched`, an
`in-flight` item has no `result`.

An item is a **mission, not a specification**. One line of prose: what to achieve, plus the hints
and facts you already know. It carries no role, no file list, no dependency edge, no model, no
cardinality and no shape, because you decide all of that when you reach it, with everything you have
learned by then. Carrying evidence is the point — *"investigate whether X still holds; the claim is
at `foo.js:120`"* is an item. Dictating a conclusion is not, and neither is a schedule.

Items may be added at any time. New work discovered mid-run is appended the same way.

## Step 5 — Run it

Read the list. The frontier is not computed — it is the list minus done minus in-flight, visible by
reading. Pick from it.

**Decide the shape then, not before.** When you reach an item, decide whether to dispatch subagents
or do the work yourself, and at what width. Nothing inspects that decision: no disjointness proof,
no evidence line, no cap, no approval. Independent work runs concurrently because that is faster;
work that genuinely feeds other work runs in order because it has to. You can already tell the
difference, and the frontier is in front of you.

Subagents and worktrees are tools, offered and declinable. Delegating production is usually right —
a handoff costs once, while everything you keep inline taxes every later decision — but a tool you
cannot decline and still finish would be a gate wearing a tool's name, and there are none here.

**Three write moments.** These are the whole discipline:

1. **Created** — write `item` and `status: todo`.
2. **Dispatched** — write `dispatched` and flip `status` to `in-flight`, **before the work goes
   out**. Writing it afterwards is precisely the failure this file exists to prevent: everything
   between dispatch and return is exactly the window in which a process dies and takes the only
   record of what was in flight with it. Name **where the output was to land** — that locator is
   what makes recovery possible at all.
3. **Closed** — write `result` and flip `status` to `done`.

Work you do yourself is still an item: it goes `in-flight` with `dispatched: self`.

## Step 6 — Resume

A successor with no context reads the file top to bottom. The H1 is the goal; `done` items with
their `result` are what is already known; `todo` items are what remains. The `in-flight` items are
the only decision to make.

**Look for the work, not for the worker.** `dispatched` records what went out, not whether it is
still running, and you usually cannot probe the liveness of a process you did not start. So check
the locator: if the output the dispatch promised has landed — the file exists, the commit is in git
— close the item and write its `result`. If it has not, re-dispatch, unless you can positively show
the dispatch is still alive. Re-dispatching read-only work costs a little time; waiting on a worker
that died costs the run.

If `workflow-state.md` is missing or unreadable but the folder's contents identify the run
unambiguously, reconstruct it conservatively and say that you did. If it is genuinely ambiguous, ask.

## Step 7 — Finish

When every item is `done`, hand off to finalization:

```text
kaola-workflow-finalize
```

## Co-active Folders

Distinct active folders run independently, each with its own `workflow-state.md` and its own
branch and worktree. Keep their commits separate — a commit spanning two folders makes neither
one's diff attributable. Another session's folder is not yours: leave its branch, its worktree and
its issues alone.

## Delegation

Subagent delegation is the default posture and is established without asking the user. Invoke the
installed role agents for delegated work. For every spawn, follow the Codex Per-Spawn Model Routing
contract above and pass both `model` and `reasoning_effort` explicitly on the spawn call as the pair
selected by the role's existing tier. Per-task model or reasoning-effort exceptions are not allowed.
If the runtime genuinely cannot spawn a role agent, do the work inline and say so — that is a fact
about tool availability, not a choice to present as a question. The Codex Profile Freshness Gate
above is authoritative for profile availability; profile drift is not tool unavailability and must
not be recorded as one.

## Required output

Before continuing or stopping, print:

```text
Workflow project: {project}
Issue: {issue or set}
Branch: {branch from workflow-state.md, or TBD if not yet claimed}
Mission list: {n done / n in-flight / n todo}
Next: {the next skill, or the frontier item you are opening}
```

## Completion contract

Each run implements exactly one issue, or one explicitly selected same-scope set. After finalization
closes the issue (or every issue in the set) and archives the active folder, stop and await explicit
re-direction. Do not auto-route into the next issue in line.

A multi-issue closure is all-or-nothing: finalization closes every issue in the set, removes every
matching `.roadmap/issue-N.md` source, regenerates the roadmap mirror once, archives one folder, and
stops.
