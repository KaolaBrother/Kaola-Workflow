# Node Evidence — author-boundary (implementer) — issue #287

## task
Author the planner-first control boundary refusal contract (`planner_control_boundary_violation`) into the 5 declared files for issue #287 "adaptive: enforce planner-first entry before DAG shaping". Behavioral prose + refusal contract in agent/command/skill markdown; no runtime code path.

## non_tdd_reason
Behavioral agent-prose refusal contract: no script ever receives the planner dispatch prompt — only the planner reads its own prompt — so no unit-testable script surface exists in this harness and no meaningful RED test can be written. The deliverable is behavioral prose in existing agent/command/skill markdown files that enforces an invariant at the orchestration layer; a ceremonial failing unit test cannot be authored because there is no runtime code path to test.

## write_set
- agents/workflow-planner.md
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md

## verification_commands

### Token presence (all 5 files)
```
grep -rl "planner_control_boundary_violation" agents/workflow-planner.md commands/kaola-workflow-adapt.md plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
```
Exit code: 0. All 5 files listed.

### Provenance preserved (lines 1-14)
```
sed -n '1,14p' agents/workflow-planner.md
```
Output: frontmatter (name, description, tools, model) intact at lines 1-5; provenance comment (kaola-workflow-managed-agent: true, locally-authored: true, note) intact at lines 7-14.

### Existing pinned tokens survived
- `EFFICIENT DAGs` found at line 89 of agents/workflow-planner.md (unchanged)
- `NOT \`acquired\`/\`owned\`` found at line 123 of agents/workflow-planner.md (unchanged)
- `subagent_type="workflow-planner"` found at line 97 of commands/kaola-workflow-adapt.md (unchanged)
- `model="{WORKFLOW_PLANNER_MODEL}"` found at lines 92+98 of commands/kaola-workflow-adapt.md (unchanged)
- `do not blind-read` / `blind-read` found at line 111 of commands/kaola-workflow-adapt.md (unchanged)
- `ready_to_run` appears in commands/kaola-workflow-adapt.md (presence confirmed; count increased by insertions, pin is presence-based)
- `plan_invalid` appears in commands/kaola-workflow-adapt.md (presence confirmed; count increased by insertions, pin is presence-based)

### Byte-identity of inserted prose across adapt forks
Python3 regex extraction confirmed: boundary paragraph byte-identical in all 4 adapt files (f2==f3, f2==f4, f2==f5); task-list paragraph byte-identical in all 4 adapt files.

## smoke-integration
All 5 declared files contain `planner_control_boundary_violation` (grep -rl exit 0). Inserted prose is forge-neutral (no kaola-*-workflow-*.js script names inside inserted paragraphs). Byte-identity confirmed across the three adapt command forks + SKILL.md.

## before_result
No pre-edit baseline check run (behavioral prose only — no test suite run was appropriate before editing documentation-only files with no behavioral logic). The recon node's barrier-base is recorded at kaola-workflow/issue-287/.cache/barrier-base-author-boundary.

## after_result
Token present in all 5 files; existing pinned tokens confirmed surviving; byte-identity confirmed across forks.

## per-file summary

### agents/workflow-planner.md
- Lines 33-50 "Hard boundary" section: added "Planner-first control boundary (issue #287)" bullet listing the three forbidden prompt patterns and the `planner_control_boundary_violation` refusal.
- Lines 105-111 "Overwrite-guard carve-out": added "Carve-out for the planner-first boundary" sub-bullet stating the `AUTHOR EXACTLY` / pre-shaped-DAG prompt is allowed ONLY after `handoff_status: plan_invalid` on an UNFROZEN plan.
- Line 140 "Durable return contract": updated header from "three modes" to "four modes".
- "Durable return contract" section: added fourth bullet for `planner_control_boundary_violation` mode (nothing authored, nothing written, re-dispatch with clean brief required).
- "Output contract — the structured return": added new first object for `planner_control_boundary_violation` (before claim refusal), with `planner_control_boundary_violation: true`, `reason`, and `guidance` fields.
- Provenance comment lines 7-14 PRESERVED exactly.

### commands/kaola-workflow-adapt.md
- After "Once main is clean, summon the workflow-planner" paragraph (~line 88): added "Planner-first control boundary (issue #287)" paragraph stating the main session must NOT pre-author the DAG and earns `planner_control_boundary_violation` if it does, with the repair-loop carve-out.
- "Establish the task list" section (~line 128): prepended task-list gate paragraph requiring `handoff_status: ready_to_run` before creating the task list, and replaced "After freeze" opener.
- All existing pinned tokens preserved.

### plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- Same two insertions as File 2, byte-identical prose.

### plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- Same two insertions as File 2, byte-identical prose.

### plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- After "delegate to workflow-planner" block (~line 139): added same "Planner-first control boundary (issue #287)" paragraph (byte-identical to adapt commands).
- Before "Establish the task list" (~line 156): added task-list gate paragraph (byte-identical to adapt commands).
