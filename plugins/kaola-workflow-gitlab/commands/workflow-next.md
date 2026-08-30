---
description: Workflow Next. Claims the work, writes the run's mission list, and runs it. Resumable from that one file.
argument-hint: (optional project name, issue number, or task description)
---
# Workflow Next

`/workflow-next` is the whole workflow: it claims the work, writes the run's mission list, and
runs it. Everything the run needs in order to survive an interruption lives in
`kaola-workflow/{project}/mission-list.md`, so a successor with no context at all resumes by
reading one file.

<!-- KW-COMPACT-RECOVERY-START -->
## Workflow Next operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Workflow Next procedure.
After compact, the native V2 carrier restores global contract and dispatch, rereads durable state,
then completely reloads this prompt; no tool-use hook injects it. Read project `AGENTS.md` for local
facts and stricter constraints, resume the recorded frontier, and transition to Kaola-Workflow
Finalization only when every mission is done.

<!-- KW-RUNTIME-DISPATCH-START -->
## Delegation

**Runtime dispatch contract (always loaded).**

Choose dispatch or inline per item: re-evaluate the choice for every mission item; one item's
choice never establishes a run-wide default. The absence of an exact named role is not proof that
all native subagent dispatch is unavailable. Keep one owner for the current cohesive production
surface when handoff and integration cost exceed the benefit, but that scope does not absorb
independent research, test authorship, documentation, or review items. Dispatch when it materially
reduces main-context residue, supplies independent judgment, or enables genuinely independent
parallel work. Both modes are first-class; width follows the true work frontier. No dispatch count,
cap, disjointness proof, justification, approval, or fallback stigma attaches to the judgment.

Treat the active runtime adapter below as fact authority. Inspect its effective profile discovery
and precedence, live call schema and verified fields, standard/reasoning/heavy defaults,
model/effort/thought carrier or inheritance, tool and custody boundaries, and native background,
parallel, resume, nesting, reload, and session limits. Unknown fields stay unknown; live schema wins.

Use named, built-in, and generic routes only under their real identities. A default tier guides
selection but never disables a task-sensitive override the host actually exposes. If an exact role
is absent, inspect adequate native routes; use one only when it satisfies custody, evidence, and
stop boundaries. Otherwise work inline, record the specific `capability_gap`, and re-evaluate the
next item. Never let a generic route impersonate a custody-bearing named role.

Before dispatch, write the mission's `dispatched` locator. Send a bounded, self-sufficient brief
naming the outcome, evidence, worktree or commit, custody, and stop condition. Reconcile the
promised output, not the worker.

<!-- KW-RUNTIME-DELEGATION-START -->
## Runtime adapter facts

Find named profiles in project `.claude/agents/`, user `~/.claude/agents/`, plugin `agents/`, managed settings, or the current session's `--agents`; managed/session/project/user/plugin precedence remains Claude-owned, and the Kaola installer uses the user directory by default.
Dispatch with `Agent` and `subagent_type: "<role>"`; installed Kaola profiles use `model: inherit`, so pass the role tier's model on the call when preserving its default tier.

**Tier defaults:** standard — standard → `sonnet`; effort is not pinned and uses the runtime's default effort; reasoning — reasoning → `opus`; effort is not pinned and uses the runtime's default effort; heavy — heavy → `fable`; effort is not pinned and uses the runtime's default effort.
**Role roster:** standard — `code-explorer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `metric-optimizer`, `tdd-guide`; reasoning — `adversarial-verifier`, `build-error-resolver`, `code-reviewer`, `security-reviewer`, `synthesizer`; heavy — `code-architect`, `planner`.

The named profile's native `tools` allowlist carries the role tool boundary.
Native alternatives include the full `general-purpose` agent, read-only `Explore` and `Plan`, catch-all `claude`, background or isolated children, and optional agent teams; use only the route whose real capability fits the current item.
Inspect the current Agent/Task type catalog and effective precedence. Claude currently permits recursive subagents to its native depth limit, which can be configured by the host; do not infer total child unavailability from one missing custom name.


<!-- KW-RUNTIME-DELEGATION-END -->

<!-- KW-RUNTIME-DISPATCH-END -->

**First Principles.** When nothing already settles a situation, break the tie by the numbered First
Principles in the loaded machine-global workflow contract, applied in priority order. Project
`AGENTS.md` adds only local facts and stricter constraints. Recording a derivation is useful and
never required.

<!-- PIN: consent-in-conversation -->
**Consent.** Irreversible and value-laden calls belong to the user — ask, in conversation, before
taking one.
State the proposed destructive Git, deploy, credential, schema/public-API, capability deletion, or
forge-reorganization action and why; wait. Everything checkable remains yours to execute.
<!-- /PIN -->

## Intake, freshness, claim, and resume

- **The user named an issue**: select it exactly. Never substitute another, and never adopt an active folder's issue in its place.
- **The user described a task but named no issue**: resolve or file its issue; priority never outranks the requested work.
- If neither is named, rank the open issue list ordered by its `P0`–`P3` priority tier (`list-open`,
  below), then apply `.roadmap/_rules.md`, active folders, and archived summaries. Rank by that
  priority tier, then by scope. A shared contract/schema runs alone; otherwise prefer a closeable three-to-five issue
  set when the frontier offers it.

State the selection aloud before you claim it, including any skipped frontier item. **Everything
before the claim is free**: perform read-only measurement or ask when the pick is genuinely ambiguous.

<!-- PIN: forge-is-the-backlog -->
Establish freshness with status, fetch/prune, and upstream divergence. Continue when synchronized,
ahead-only, or no-remote; fast-forward only a clean behind-only checkout. Ask before merge, rebase,
stash, reset, or moving user dirt. Before claim, read each shortlisted candidate's own body and comments.
Comments are current state: where a comment contradicts the body, the comment wins.
<!-- /PIN -->

Observe the backlog and claim through the existing forge-specific script:

```bash
git status --short --branch
git fetch --prune
git rev-list --left-right --count @{u}...HEAD
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" list-open
node "$CLAIM_JS" watch-mr >/dev/null 2>&1 || true
```

If a GitLab remote and an authenticated `glab` are available, read the open issues:

```bash
glab issue view {N} --comments -F json
```

Repeat the detail read for each shortlisted `{N}`. Set `KAOLA_TARGET_ISSUES` to the selected
comma-separated set, then claim it (use `--target-issue N` for a singleton):

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" startup --runtime claude --target-issues "$KAOLA_TARGET_ISSUES"
```

The claim is bookkeeping: `workflow-state.md` records issues, branch, and worktree. Its typed output
reports a fact about the target rather than a verdict. `owned`/`acquired` continues; an existing active folder resumes; user
dirt or an irreversible choice goes back to the user. Never adopt an unrelated active folder.

## Resume

On resume, read `mission-list.md` top to bottom. Done results are known, todo items are the frontier,
and in-flight locators must be reconciled. Look for the work, not for the worker. Check the locator:
if the output the dispatch promised has landed, close it; otherwise re-dispatch, unless you can
positively show the dispatch is alive.

## Write the mission list

Create `kaola-workflow/{project}/mission-list.md` immediately after claim: one H1 goal and ordered
entries. Items are positional; nothing depends on a stable ID, and absent fields are simply absent.

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

Three writes only: create with `status: todo`; before the work goes out, set `in-flight` and write
the locator; close with `done` and result. Inline work uses `dispatched: self`. A completed item and
its result are immutable; one dispatch has one result, including FAIL/BLOCKED.

An item is a mission, not a specification. A failed command, intermediate finding, repair attempt,
or review round does not by itself create a mission. Keep working within the current promised
outcome while custody and causal boundary remain unchanged. Append a mission only for a new
recoverable outcome that changes custody or for a newly discovered independent causal class. Do
not return `BLOCKED` merely because work remains;
`BLOCKED` means the current owner cannot safely or legitimately continue.

## Run it

Read list minus done minus in-flight and choose one frontier item. Custody answers who may decide
meaning. Failure frontier, then freeze: focused acceptance, affected inventory, causal repair,
exact-candidate review; any mutation invalidates prior PASS evidence for changed bytes. The test
author owns acceptance meaning. An implementer may not delete, weaken, or reinterpret that
acceptance to pass. Finalization, closure, archive, and sink are never mission items.
No dispatch count, cap, disjointness proof, justification, approval, or fallback stigma attaches to
the judgment. Subagents and worktrees are tools, offered and declinable.

When all items are done, transition explicitly to:

```text
/kaola-workflow-finalize {project}
```

Before continuing or stopping print:

```text
Workflow project: {project}
Issue: {issue or set}
Branch: {branch from workflow-state.md, or TBD if not yet claimed}
Mission list: {n done / n in-flight / n todo}
Next: {the next command, or the frontier item you are opening}
```

## Co-active Folders

Distinct active folders have separate state, branches, and worktrees. Keep their commits separate,
and never touch another session's branch, worktree, folder, or issues.

After finalization closes the whole set and archives the folder, stop and await explicit
redirection; never auto-route. Multi-issue closure is all-or-nothing.

<!-- KW-COMPACT-RECOVERY-END -->
