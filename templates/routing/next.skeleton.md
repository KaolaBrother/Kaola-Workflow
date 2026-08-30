<!-- SLOT:nx-frontmatter -->
<!-- SLOT:nx-h1 -->

<!-- SLOT:nx-intro -->

<!-- KW-COMPACT-RECOVERY-START -->
## Workflow Next operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Workflow Next procedure.
After compact, the native V2 carrier restores global contract and dispatch, rereads durable state,
then completely reloads this prompt; no tool-use hook injects it. Read project `AGENTS.md` for local
facts and stricter constraints, resume the recorded frontier, and transition to Kaola-Workflow
Finalization only when every mission is done.

<!-- KW-RUNTIME-DISPATCH-START -->
<!-- SLOT:runtime-dispatch-common -->

<!-- SLOT:runtime-delegation -->

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
<!-- SLOT:nx-scripts-resolver -->
node "$CLAIM_JS" list-open
<!-- SPLICE:nx-watch-run -->
```

<!-- SPLICE:nx-issue-fetch -->

```bash
<!-- REGION:gitea — tea has no porcelain comments view; the installed forge adapter reads comments -->
<!-- SLOT:nx-scripts-resolver -->
<!-- /REGION -->
<!-- SPLICE:nx-issue-detail-fetch -->
```

Repeat the detail read for each shortlisted `{N}`. Set `KAOLA_TARGET_ISSUES` to the selected
comma-separated set, then claim it (use `--target-issue N` for a singleton):

```bash
<!-- SLOT:nx-scripts-resolver -->
<!-- SPLICE:nx-claim-run -->
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

<!-- SPLICE:nx-finalize-route -->

Before continuing or stopping print:

```text
Workflow project: {project}
Issue: {issue or set}
Branch: {branch from workflow-state.md, or TBD if not yet claimed}
Mission list: {n done / n in-flight / n todo}
<!-- SPLICE:nx-required-next -->
```

## Co-active Folders

Distinct active folders have separate state, branches, and worktrees. Keep their commits separate,
and never touch another session's branch, worktree, folder, or issues.

After finalization closes the whole set and archives the folder, stop and await explicit
redirection; never auto-route. Multi-issue closure is all-or-nothing.

<!-- KW-COMPACT-RECOVERY-END -->
