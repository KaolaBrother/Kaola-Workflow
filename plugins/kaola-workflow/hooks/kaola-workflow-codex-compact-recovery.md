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

Find the effective project or user `.codex/config.toml`, inspect its managed `[agents.<role>]` registration, then inspect the referenced `.codex/agents/kaola-workflow/<role>.toml` profile; `agents.toml` is installer source, not an installed lookup path.
Dispatch with the `spawn_agent` schema exposed by this Codex host and `agent_type: "<role>"`; on hosts that expose them, supply `model` and `reasoning_effort` when selecting the role's default tier, while preserving supported `fork_turns` and service-tier choices.

**Tier defaults:** standard — standard → `gpt-5.6-luna` with reasoning effort `max`; reasoning — reasoning → `gpt-5.6-sol` with reasoning effort `medium`; heavy — heavy → `gpt-5.6-sol` with reasoning effort `high`.
**Role roster:** standard — `code-explorer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `metric-optimizer`, `tdd-guide`; reasoning — `adversarial-verifier`, `build-error-resolver`, `code-reviewer`, `security-reviewer`, `synthesizer`; heavy — `code-architect`, `planner`.

The Codex host policy owns the actual tool boundary; the generated TOML profile owns the role behavior, not a duplicated tool list.
Native alternatives include the general `default`, implementation-owning `worker`, read-heavy `explorer`, and any other type the host reports; use each only under its real contract.
Honor the current session's multi-agent exposure, V1/V2 call schema, type catalog, history-fork choices, and host-owned nesting/concurrency limits; a missing custom `agent_type` does not hide other `spawn_agent` routes.


<!-- KW-RUNTIME-DELEGATION-END -->
<!-- KW-RUNTIME-DISPATCH-END -->
<!-- KW-COMPACT-RECOVERY-END -->
