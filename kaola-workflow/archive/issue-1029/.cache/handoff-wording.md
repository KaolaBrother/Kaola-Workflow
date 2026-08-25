<!-- PIN: main-authored-handoff -->
## Main-Authored Handoff

Before each named-role spawn, main writes a compact task-specific brief that the role can execute
from that brief, its installed profile, and the named repository evidence alone; inherited
conversation is never required. The role profile remains authoritative for universal role behavior.
Main retains product intent, value decisions, integration, acceptance of returned work, review
consequences, and the final done verdict.

Use these labels in this order:

- `Mission:` one result to produce or one question to answer.
- `Context:` the candidate/worktree and baseline identity, relevant measured facts, hypotheses
  labeled as hypotheses, and only the upstream evidence this task needs.
- `Authority:` decisions already settled, decisions the role may recommend but not make, and any
  unresolved user-owned decision.
- `Scope and custody:` the task's read/write boundary, explicit exclusions, test-versus-production
  ownership, and co-active ownership relevant to avoiding collisions.
- `Acceptance:` falsifiable conditions for this role's deliverable and its stopping boundary. State
  the required result and proof, not an implementation method. This is not the workflow's final done
  verdict.
- `Deliverable:` what returns and the exact path, commit, or evidence locator where the full result
  lands.
- `Stop and report:` task-specific contradictory evidence, ambiguity that changes the result, a
  capability gap, an out-of-scope finding, or a user-owned decision that must return to main rather
  than be silently assumed, expanded, or worked around.

Specialize only the task-specific content:

- Planning and design (`planner`, `code-architect`) receive the binding goal or design question,
  non-goals, constraints and invariants, and the permitted decision envelope; they return a plan or
  blueprint without editing product files.
- Investigation roles receive an exact question or claim, evidence surface, and authority or
  measurement standard.
- `tdd-guide` receives acceptance claims, the baseline, test custody, the production exclusion, and
  the required RED evidence; `implementer` receives the intended behavior, production custody, the
  test read-only boundary, acceptance evidence, and the appropriate verification expectation.
- Repair, convergence, documentation, and optimization roles receive the concrete candidate,
  failure, or input; permitted mutation boundary; preservation constraints; and the retest, docking,
  or metric stop condition.
- `code-reviewer` and `security-reviewer` receive the exact candidate, dispatched surface, and
  acceptance; `adversarial-verifier` receives exactly one claim and one surface.

Keep the packet sparse: include only task-specific facts, decisions, bounds, and evidence; do not
repeat the role profile. This is handoff guidance, not a new workflow record or a machine-graded
prompt schema. The mission list remains the recovery index: what went out, to whom, and where the
result will land.
<!-- /PIN -->
