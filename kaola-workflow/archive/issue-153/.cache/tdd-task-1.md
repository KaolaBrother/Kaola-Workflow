# tdd-task-1 — install.sh inherit-rewrite + F2 test (plan T1+T2)
agent aca4ed4a92ce13dbb, model=sonnet, 2026-05-22.

## Files modified (within write set)
- install.sh: added `agent_source_file()` + `install_managed_agent()` helpers before install_agent_files;
  both copy sites (managed-update ~292, first-install ~301) now call install_managed_agent; resolver pivot
  (now line 388) reads `extract_agent_model "$(agent_source_file "$agent")"`. awk fail-fast intact. sha256
  at line 311 unchanged (F1 ordering preserved — rewrite runs in-loop before it).
- scripts/test-install-model-rendering.js: added F2 loop (lines 67-77) asserting each of 9 installed agents
  has `model: inherit` in frontmatter + retains managed marker.

## RED evidence (before install.sh change)
`node scripts/test-install-model-rendering.js` →
`AssertionError: code-explorer installed frontmatter must be model: inherit` at line 73, exit 1.
(Installed agents still carried concrete `model: sonnet`.)

## GREEN evidence (after install.sh change)
`node scripts/test-install-model-rendering.js` → "Install model rendering tests passed", exit 0.
Independently re-confirmed by orchestrator: exit 0.
Command files still render concrete model="opus|sonnet|haiku" (existing assertions pass) AND installed
agents now `model: inherit` + managed marker preserved.

## Syntax / smoke
`bash -n install.sh` → exit 0 (orchestrator re-confirmed).
`node scripts/simulate-workflow-walkthrough.js` → exit 0 (agent-reported).

## Deviations
None. Variable names (SOURCE_AGENTS_DIR/AGENTS_DIR/tmp/fs/path/assert) and copy-site logic matched the brief.
Line numbers shifted ~25 after inserting helpers; logic targets correct.

## Diff verified by orchestrator: surgical, within write set, matches plan exactly.
