---
name: kaola-workflow-next
description: Use when starting, resuming, or running Kaola-Workflow for Codex work, also called kaola-workflow — claims the issue, writes the run's mission list, and runs it from that one file.
---
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-luna"` and `reasoning_effort: "max"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "high"`.

Standard-tier roles: `code-explorer`, `investigator`, `knowledge-lookup`, `tdd-guide`,
`implementer`, `doc-updater`, `metric-optimizer`.

Reasoning-tier roles: `planner`, `code-architect`, `build-error-resolver`, `code-reviewer`,
`security-reviewer`, `adversarial-verifier`, `synthesizer`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override either
tier's model or reasoning effort based on task breadth, latency, prior results, risk, availability,
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
reorganizing someone's issues — state what you propose and why, then wait for the answer.
Everything checkable is yours to decide and get on with.
<!-- /PIN -->

## Step 1 — Pick the work

You select the target. No script picks for you.

- **The user named an issue** — in the arguments or in the prompt ("work on #N") → that issue IS the
  target. Never substitute another, and never adopt an active folder's issue in its place.
- **The user described a task but named no issue** → resolve the description to the issue it
  belongs to, or file one, before claiming. The described task IS the target; priority tier
  never outranks the work the user asked for.
<!-- PIN: forge-is-the-backlog -->
- **The user named neither** — the common "work on the next issue" case → you read the backlog and
  rank it: the open issue list ordered by its `P0`–`P3` priority tier (`list-open`, below), any
  `kaola-workflow/.roadmap/_rules.md` standing rules, the active folders, and the archived summaries.
  Rank by that priority tier, then by scope.
<!-- /PIN -->
  Exclude what is not yours to take: issues already closed, already claimed, or occupied by another
  live session. **State the selection aloud before you claim it.** If you pass over the frontier
  issue, say which one and why.

**Everything before the claim is free.** Dispatch read-only agents, read whatever you need, and ask
the user when the pick is genuinely ambiguous. A clean selection — frontier honored, no ambiguity —
claims without asking.

A run normally carries **three to five issues**. One issue is the exception rather than the norm:
take it when the frontier genuinely offers nothing else, or when the issue is one that must run
alone. Three is a floor on what you take from what already exists — never a reason to invent work —
and eight remains the recommended ceiling.

Members are admissible when they are all open, unclaimed, and each **closeable on its own
evidence**: finishing one does not depend on how another turns out. Sharing a scope is one route to
that and buys a shared investigation; **disjoint write surfaces are the other, and buy real
concurrency**. Prefer disjoint when both are on offer. That is a shape judgement and nothing caps it.

An issue **runs alone** when it moves something the other members read — a schema, an envelope
shape, a routing skeleton, a shared constant; when closing it needs a value call from the user,
since all-or-nothing closure would hold every finished sibling behind that one decision; or when its
scope is not knowable until it has been investigated. Size is not the test: a large change inside one
module bundles fine, and a one-line change to a shared anchor does not.

Say which issues you bundled and why, and if you took fewer than three, say what you passed over.

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

If a Gitea remote and an authenticated `tea` are available, read the open issues:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" list-open
```

That returns every open issue, ordered by its `P0`–`P3` priority tier then by number — never
filtered or truncated to a single "winner"; ordering is not selecting. If the remote is unavailable,
or `KAOLA_WORKFLOW_OFFLINE=1` is set, it returns no issues: there is nothing local to rank, so name
an issue directly or resume an already-claimed active folder.

A run that ended by opening a review request instead of merging leaves its folder open until that
request lands. Sweep those once here, so a folder whose request has since merged or closed is
archived rather than mistaken for live work:

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" watch-pr >/dev/null 2>&1 || true
```

<!-- PIN: forge-is-the-backlog -->
Before claiming, read each shortlisted candidate's own body and comments — the handful you are
ranking for this claim, never the full list fetched above. Comments are current state: where a
comment contradicts the body, the comment wins, and you say so aloud when you state the selection.
<!-- /PIN -->

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node -e "try{const f=require(require('path').join(process.argv[1],'kaola-gitea-forge.js'));const n=process.argv[2];const p=f.discoverProject();const iss=f.viewIssue(n);const cm=f.listIssueComments(p,n);console.log(JSON.stringify({body:iss.body,comments:cm}));}catch(e){console.error(e.message)}" "$KAOLA_SCRIPTS" {N}
```

Repeat this once per shortlisted issue, substituting its number for `{N}`.

## Step 3 — Claim

The claim is bookkeeping: it records which issues, branch and worktree this run owns, in
`kaola-workflow/{project}/workflow-state.md`, so a successor knows what is already in flight.

Set `KAOLA_TARGET_ISSUES` to the set you selected — comma-separated, no spaces, as in `42,47,53` —
then run the startup transaction; the script validates the exact set and never reorders it. For a
run carrying a single issue, swap `--target-issues "$KAOLA_TARGET_ISSUES"` for `--target-issue 42`.

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow-gitea/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow-gitea/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" startup --runtime codex --target-issues "$KAOLA_TARGET_ISSUES"
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
about tool availability, not a choice to present as a question. Profile drift is not tool
unavailability and must not be recorded as one.

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

Each run implements one explicitly selected set of issues — normally three to five, sometimes one.
After finalization closes every issue in the set and archives the active folder, stop and await
explicit re-direction. Do not auto-route into the next issue in line.

A multi-issue closure is all-or-nothing: finalization closes every issue in the set, archives one
folder, and stops.
