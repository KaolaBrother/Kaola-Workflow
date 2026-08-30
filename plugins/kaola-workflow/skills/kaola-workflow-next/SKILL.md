---
name: kaola-workflow-next
description: Use when starting, resuming, or running Kaola-Workflow for Codex work, also called kaola-workflow — claims the issue, writes the run's mission list, and runs it from that one file.
---
# Kaola-Workflow Next

This skill is the whole workflow: it claims the work, writes the run's mission list, and runs it.
Everything the run needs in order to survive an interruption lives in
`kaola-workflow/{project}/mission-list.md`, so a successor with no context at all resumes by
reading one file.

<!-- KW-COMPACT-RECOVERY-START -->
## Compact recovery contract

This whole block is part of the initial Workflow Next prompt. A compact-capable runtime re-injects
it once, after compact and before the next model turn. It is never injected by a tool-use hook.
Recovery marker: `KW-COMPACT-RECOVERY-V1`.

Read project-root `AGENTS.md` before acting; it is the universal project-rule source.
Resume from `workflow-state.md` and `mission-list.md`. Done results are known; reconcile in-flight
locators; todo items are the frontier. Keep failures inside the current custody and causal boundary.
Finalization, Issue closure, archive, and sink are not Mission List items. The last run mission
establishes readiness for finalization. The finalization summary, closure evidence, archive state,
and sink receipt own the transaction's truth. When every mission is done, transition explicitly to
Kaola-Workflow Finalization.

<!-- KW-RUNTIME-DISPATCH-START -->
## Delegation

**Runtime dispatch contract (always loaded).**

Choose dispatch or inline per item: re-evaluate the choice for every mission item; one item's choice
never establishes a run-wide default. The absence of an exact named role is not proof that all
native subagent dispatch is unavailable. Keep one owner for the current cohesive production surface
when handoff and integration cost exceed the benefit, but that scope does not absorb independent
research, test authorship, documentation, or review items. Dispatch when it materially reduces
main-context residue, supplies independent judgment, or enables genuinely independent parallel
work. Both modes are first-class; width follows the true work frontier. No dispatch count, cap,
disjointness proof, justification, approval, or fallback stigma attaches to the judgment.

Use the active runtime adapter as fact authority. Inspect its effective profile discovery and
precedence, live dispatch schema and verified call fields, standard/reasoning/heavy tier defaults,
model/effort/thought carrier or inheritance, tool boundary, and custody boundary. Preserve the
runtime's real background, parallel, resume, nesting, reload, and session limits; unknown fields
stay unknown and the live schema wins.

Use named, built-in, and generic routes only under their real identities. A default tier guides
selection; it never disables a task-sensitive model/effort/thought override exposed by the live
schema. If the exact named role is absent, inspect every adequate native route. Use one only when it
satisfies the mission's custody, evidence, and stop boundary; otherwise work inline, record the
specific `capability_gap`, and re-evaluate on the next item. Never let a generic route impersonate a
custody-bearing named role.

Before dispatch, write the mission's `dispatched` locator and send a bounded, self-sufficient brief
naming the outcome, evidence, worktree/commit, custody, and stop condition. Reconcile the promised
output, not the worker. Runtime-native dispatch facts end here.

<!-- KW-RUNTIME-DELEGATION-START -->
## Runtime adapter facts

Find the effective project or user `.codex/config.toml`, inspect its managed `[agents.<role>]` registration, then inspect the referenced `.codex/agents/kaola-workflow/<role>.toml` profile; `agents.toml` is installer source, not an installed lookup path.
Dispatch with the `spawn_agent` schema exposed by this Codex host and `agent_type: "<role>"`; on hosts that expose them, supply `model` and `reasoning_effort` when selecting the role's default tier, while preserving supported `fork_turns` and service-tier choices.

**Tier defaults:** standard — standard → `gpt-5.6-luna` with reasoning effort `max`; reasoning — reasoning → `gpt-5.6-sol` with reasoning effort `medium`; heavy — heavy → `gpt-5.6-sol` with reasoning effort `high`.
**Role roster:** standard — `code-explorer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `metric-optimizer`, `tdd-guide`; reasoning — `adversarial-verifier`, `build-error-resolver`, `code-reviewer`, `security-reviewer`, `synthesizer`; heavy — `code-architect`, `planner`.

The Codex host policy owns the actual tool boundary; the generated TOML profile owns the role behavior, not a duplicated tool list.
Native alternatives include the general `default`, implementation-owning `worker`, read-heavy `explorer`, and any other type the host reports; use each only under its real contract.
Honor the current session's multi-agent exposure, V1/V2 call schema, type catalog, history-fork choices, and host-owned nesting/concurrency limits; a missing custom `agent_type` does not hide other `spawn_agent` routes.


<!-- KW-RUNTIME-DELEGATION-END -->

<!-- KW-RUNTIME-DISPATCH-END -->

**First Principles.** When nothing already settles a situation, break the tie by the First
Principles axioms (the `## First Principles` block in workflow-init `AGENTS.md`), applied in
priority order. Recording a derivation is useful and never required.

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
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" list-open
node "$CLAIM_JS" watch-pr >/dev/null 2>&1 || true
```

If a GitHub remote and an authenticated `gh` are available, read the open issues:

```bash
gh issue view {N} --json body,comments
```

Repeat the detail read for each shortlisted `{N}`. Set `KAOLA_TARGET_ISSUES` to the selected
comma-separated set, then claim it (use `--target-issue N` for a singleton):

```bash
kaola_script(){ _n="$1"; _p="plugins/kaola-workflow/scripts/$_n"; [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; _p="$(find "$HOME/.codex/plugins/cache" -path "*/kaola-workflow/*/scripts/$_n" -print -quit 2>/dev/null)"; [ -n "$_p" ] && [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; return 1; }
CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"
node "$CLAIM_JS" startup --runtime codex --target-issues "$KAOLA_TARGET_ISSUES"
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
kaola-workflow-finalize
```

Before continuing or stopping print:

```text
Workflow project: {project}
Issue: {issue or set}
Branch: {branch from workflow-state.md, or TBD if not yet claimed}
Mission list: {n done / n in-flight / n todo}
Next: {the next skill, or the frontier item you are opening}
```

## Co-active Folders

Distinct active folders have separate state, branches, and worktrees. Keep their commits separate,
and never touch another session's branch, worktree, folder, or issues.

After finalization closes the whole set and archives the folder, stop and await explicit
redirection; never auto-route. Multi-issue closure is all-or-nothing.

<!-- KW-COMPACT-RECOVERY-END -->
