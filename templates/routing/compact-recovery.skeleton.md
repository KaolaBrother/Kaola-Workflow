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
<!-- SLOT:runtime-dispatch-common -->

<!-- SLOT:runtime-delegation -->
<!-- KW-RUNTIME-DISPATCH-END -->
<!-- KW-COMPACT-RECOVERY-END -->
