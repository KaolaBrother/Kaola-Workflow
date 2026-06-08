# Node Evidence — pin-contracts (implementer) — issue #287

## task
Add `assertIncludes` token pins to 3 contract validator files to lock the `planner_control_boundary_violation` token (introduced by the prior `author-boundary` node) so future docs cannot blur the planner/main-session split. AC6 of issue #287.

## non_tdd_reason
Characterization/regression pins: adding `assertIncludes` assertions to existing contract validators against tokens the prior node (`author-boundary`) introduced. No RED-first behavior is possible — the tokens genuinely exist in all targets and the pins pass on first run by construction. Category: glue/wiring (connecting existing tokens to existing validators without adding behavioral logic).

## write_set
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js (cp mirror of scripts/validate-workflow-contracts.js)
- scripts/validate-kaola-workflow-contracts.js

## diff hunks

### scripts/validate-workflow-contracts.js (lines 580–585, after `assertIncludes('agents/workflow-planner.md', 'NOT \`acquired\`/\`owned\`')`)

```diff
+// #287: planner-first control boundary pinned across all editions
+assertIncludes('commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
+assertIncludes('plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
+assertIncludes('plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
+assertIncludes('agents/workflow-planner.md', 'planner_control_boundary_violation');
```

### plugins/kaola-workflow/scripts/validate-workflow-contracts.js
Byte-for-byte copy of `scripts/validate-workflow-contracts.js` via `cp`. Identical diff hunk.

### scripts/validate-kaola-workflow-contracts.js (after skills loop closing brace, before `assertIncludes(…kaola-workflow-next…)`)

```diff
+// #287: planner-first control boundary pinned across all editions
+assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'planner_control_boundary_violation');
```

## verification_commands

### 1. Byte-identity check
```
cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js && echo BYTE-IDENTICAL
```
Output: `BYTE-IDENTICAL` — Exit: 0

### 2. validate-script-sync.js
```
node scripts/validate-script-sync.js
```
Output: `OK: 18 common scripts and 7 byte-identical file group in sync.` — Exit: 0

### 3. validate-workflow-contracts.js
```
node scripts/validate-workflow-contracts.js
```
Output: `Workflow contract validation passed` — Exit: 0

### 4. validate-kaola-workflow-contracts.js
```
node scripts/validate-kaola-workflow-contracts.js
```
Output: `Kaola-Workflow Codex contract validation passed` — Exit: 0

## build-green
All 4 verification commands passed (exit 0). The 4 new pins in the Claude validator + 1 pin in the Codex validator all find `planner_control_boundary_violation` in their respective targets. File1 (scripts/) ≡ File2 (plugins/kaola-workflow/scripts/) byte-identical confirmed by both `cmp` and `validate-script-sync.js`.

## before_result
Baseline: `validate-workflow-contracts.js` and `validate-kaola-workflow-contracts.js` both passed (no assertions for `planner_control_boundary_violation` existed). The `author-boundary` node's evidence records `grep -rl` exit 0 confirming the token is present in all 5 target files prior to these pins being added.

## after_result
All 3 files edited; all 4 verification commands green; byte-mirror enforced and confirmed.
