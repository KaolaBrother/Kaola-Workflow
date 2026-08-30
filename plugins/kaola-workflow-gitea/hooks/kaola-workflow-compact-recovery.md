<!-- KW-COMPACT-RECOVERY-START -->
# Kaola-Workflow compact recovery

Recovery marker: `KW-COMPACT-RECOVERY-V1`.

This is the complete post-compact continuation prompt for this runtime. It is generated before
installation from one common core plus the measured runtime adapter; compact does not run a prompt
parser, binder, state machine, or tool-use hook.

Read project-root `AGENTS.md`, then the active run's `workflow-state.md` and `mission-list.md`.
Resume the recorded work instead of restarting intake or claim. Done results are known; reconcile
in-flight locators; todo items are the frontier. A completed item and its result are immutable, and one
dispatch has one result including FAIL/BLOCKED. A failed command, intermediate finding, repair
attempt, or review round does not by itself create a mission. Keep working within the current
promised outcome while custody and causal boundary remain unchanged. Append a mission only for a
new recoverable outcome that changes custody or for a newly discovered independent causal class.

If any mission is todo or in-flight, continue Workflow Next from that frontier. If every mission is
done, continue Kaola-Workflow Finalization from its existing receipts: freeze the candidate, treat
mutation as invalidating PASS evidence for changed bytes, validate and dock documentation, then ask
before irreversible or value-laden closure/sink choices. Finalization, Issue closure, archive, and
sink are not Mission List items. The last run mission establishes readiness for finalization. The
finalization summary, closure evidence, archive state, and sink receipt own the transaction's truth.

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
