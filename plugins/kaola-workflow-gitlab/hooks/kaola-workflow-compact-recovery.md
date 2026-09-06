<!-- KW-COMPACT-RECOVERY-START -->
# Kaola-Workflow compact recovery

Recovery marker: `KW-COMPACT-RECOVERY-V2`.

# Global Workflow Contract

Universal contract. Project instructions supplement verified local facts and constraints. A
project exception must state its scope and must not weaken higher-priority instructions or host
safety boundaries.

## First Principles

1. Correct first; never trade correctness for speed or cost.
2. Then save human time without weakening correctness.
3. Then spend as little as possible.
4. Machines decide facts; humans decide values. Continue inside already-granted authorization and
   scope. Unauthorized irreversible or value-laden calls still go to the user.
5. Own your own verdicts. Local evidence, not an external system, decides done.

## Premise and evidence

- Measure current truth before an earlier claim shapes work; carry corrections forward.
- Read the target before writing. Distinguish evidence, inference, and unknown. Verify at the
  scope of the change.
- Keep changes surgical. Serve the user's goal and proven problems; avoid speculative mechanisms. A
  user-requested feature is not refused for lack of a prior observed failure.

## Backlog and durable state

- The forge's open issue list is backlog truth; later comments with explicit corrections win.
- `kaola-workflow/.roadmap/_rules.md` is the one optional local roadmap file that survives. Nothing
  else is generated or tracked under `.roadmap/`; there is no local backlog mirror to refresh.
- Declare top-priority labels in `kaola-workflow/config.json` under `priority_top_tier_labels`.
- `kaola-workflow/{project}/workflow-state.md` records the claim;
  `kaola-workflow/{project}/mission-list.md` records the run.
- Organizing issues does not auto-claim and does not auto-create a Mission List. Daily governance
  does not auto-create a run; when an active run exists, other operations respect it.

## Mission List

- One run has one Mission List with `item`, `status`, `dispatched`, and `result`.
- Use three write moments: create; write `dispatched` before the work goes out, including where the
  output will land; then write `result`. A completed item and its result are immutable. One dispatch
  has one result, including `FAIL` or `BLOCKED`.
- A mission is a recoverable outcome. A failed command, intermediate finding, repair attempt, or
  review round does not create another mission. `BLOCKED` means the current owner cannot safely or
  legitimately continue.
- Resume by trusting done results, reconciling in-flight locators, and continuing the frontier: the
  list minus done minus in-flight.
- Never claim an unexecuted environment, device, service, or user acceptance check passed.
  Mutation invalidates affected PASS evidence.
- Finalization, issue closure, archive, and sink are not Mission List items. The last mission only
  establishes readiness; lifecycle records own the transaction's final truth.

## Resume the active operation

Read project `AGENTS.md`, active `workflow-state.md`, and `mission-list.md`. With open work,
completely reload the installed Workflow Next prompt and resume its frontier without intake or
claim. When all missions are done,
completely reload the installed Kaola-Workflow Finalization prompt and continue from its receipts.

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
<!-- KW-COMPACT-RECOVERY-END -->
