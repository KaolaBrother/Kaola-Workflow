<!-- SLOT:nx-frontmatter -->
<!-- SLOT:nx-h1 -->

<!-- SLOT:nx-intro -->

<!-- KW-COMPACT-RECOVERY-START -->
## Workflow Next operation authority

Recovery marker: `KW-COMPACT-RECOVERY-V2`. This complete prompt owns Workflow Next procedure. Read
project `AGENTS.md`. Resume the recorded frontier, and transition to Kaola-Workflow Finalization
only when every mission is done.

<!-- KW-RUNTIME-DISPATCH-START -->
<!-- SLOT:runtime-dispatch-common -->

<!-- SLOT:runtime-delegation -->

<!-- KW-RUNTIME-DISPATCH-END -->

**First Principles.** When nothing already settles a situation, break the tie by the numbered First
Principles in the loaded machine-global workflow contract, applied in priority order. Project
`AGENTS.md` adds only local facts and constraints.

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
before the claim is free**: perform read-only measurement or ask when the pick is genuinely
ambiguous.

**Task clarity.** When the intended outcome and its acceptance basis are already clear and
authorized, continue. When a fact is missing, read the code, reproduce, or look it up first;
implementation detail inside an authorized scope is your own judgment. Ask the user only about an
unresolved choice that would change scope, authorization, or the meaning of acceptance, and keep
doing the investigation that does not depend on the answer. When authorized to maintain the issue,
express the observable outcome and its verification basis in plain language, and cite what is
already sufficient instead of restating it. A research or design request authorizes research or
design only; it does not authorize product implementation, forge writes, or a claim.

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

The claim is bookkeeping — `workflow-state.md` carries it.
`owned`/`acquired` continues; an existing active folder resumes; user dirt or an irreversible
choice goes back to the user.

## Resume

On resume, read the mission ledger top to bottom and reconcile in-flight locators.
Look for the work, not for the worker. Check the locator: if the output the dispatch promised has
landed, close it; otherwise re-dispatch, unless you can positively show the dispatch is alive.

## Write the mission ledger

Create the ledger immediately after claim at the claim's `ledger_path`:
`<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`, with `main_root` and `issue_number` from
`workflow-state.md`. It lives only in the main checkout — never write it inside a worktree — and it
is gitignored; if the claim reports `ledger_not_gitignored`, tell the user. One JSON object per line,
one line per mission, keys exactly in this order and nothing else:

| key | content |
|---|---|
| `n` | the mission number: 1, 2, 3 … by position, never renumbered |
| `name` | the mission — one line |
| `details` | hints and facts; at dispatch add who took it and **where the output will land**; at close add where the outcome landed |
| `status` | `todo` \| `in-flight` \| `done` \| `failed` \| `blocked` |

```jsonl
{"n":1,"name":"Implement the fix","details":"dispatched: self — output lands on the run branch","status":"in-flight"}
```

Only you write it, rewriting the whole file. Create every line with `status` `todo`; before the work
goes out, set `in-flight` and add the locator to `details`; close with `done` or `failed` and where
the result landed. A `done` or `failed` line never changes again; `blocked` waits on a ruling and may
return to `in-flight`. Inline work records `dispatched: self`.
An item is a mission — a recoverable outcome. A failed command, intermediate finding, repair
attempt, or review round does not by itself create a mission. Keep working within the current
promised outcome while custody and causal boundary remain unchanged. Append a mission only for a
new recoverable outcome that changes custody or for a newly discovered independent causal class. Do
not return `BLOCKED` merely because work remains.

## Run it

Choose one frontier item. The orchestrator holds issue selection and decomposition, design, the
reading of acceptance meaning, the final verdict on a candidate it has read, and finalization.
Custody answers who may decide meaning. Failure frontier, then freeze: focused acceptance, affected
inventory, causal repair, exact-candidate review; any mutation invalidates prior PASS evidence for
changed bytes.
When a `tdd-guide` holds the acceptance tests, the implementer does not delete, weaken, or
reinterpret them to pass; when you wrote the tests yourself, you hold that meaning. Writing the
tests, implementing, and reviewing yourself are all legitimate paths; an independent review is an
optional clean-context check on a frozen candidate whose findings come back to you for the verdict.
Decide how much to explain by what communication needs, and how much to verify by behavioral impact
and the existing requirements; a short explanation or a small change never lowers acceptance, and
sufficient existing evidence may be cited rather than reproduced.

When all items are done, transition explicitly to:

<!-- SPLICE:nx-finalize-route -->

Before continuing or stopping print:

```text
Workflow project: {project}
Issue: {issue or set}
Branch: {branch from workflow-state.md, or TBD if not yet claimed}
Mission ledger: {n done / n in-flight / n todo}
<!-- SPLICE:nx-required-next -->
```

## Co-active Folders

Distinct active folders have separate state, branches, and worktrees. Keep their commits separate,
and never touch another session's branch, worktree, folder, or issues. After finalization, stop and
await explicit redirection; never auto-route.

<!-- KW-COMPACT-RECOVERY-END -->
