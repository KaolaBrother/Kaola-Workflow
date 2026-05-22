# Phase 3 - Plan: issue-152

## Blueprint

### Files to Create

None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `commands/kaola-workflow-phase4.md` | Insert build-error-resolver Agent block in Validation Delegation Policy | Prose-only; "documented above" dangling |
| `commands/kaola-workflow-phase5.md` | Insert tdd-guide + build-error-resolver Agent blocks in Validation Delegation Policy | Same gap; both blocks needed |
| `commands/kaola-workflow-phase6.md` | Insert tdd-guide + build-error-resolver Agent blocks in Validation Delegation Policy | Same gap; both blocks needed |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md` | Same edit as root phase4 | Plugin fork has identical gap |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md` | Same edit as root phase5 | Plugin fork has identical gap |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` | Same edit as root phase6 | Plugin fork has identical gap |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md` | Same edit as root phase4 | Plugin fork has identical gap |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md` | Same edit as root phase5 | Plugin fork has identical gap |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md` | Same edit as root phase6 | Plugin fork has identical gap |
| `scripts/validate-workflow-contracts.js` | Add 24 per-file placeholder-token assertions for all 9 command files | Guards missed-fork regression; no automated plugin sync |
| `scripts/test-install-model-rendering.js` | Add 4 render assertions for phase5/6 tdd-guide/build-error-resolver rendered as sonnet | Proves install.sh substitutes both placeholders correctly |

### Build Sequence

1. TASK A — phase4 build-error-resolver block (3 files, no deps)
2. TASK B — phase5 tdd-guide + build-error-resolver blocks (3 files, no deps)
3. TASK C — phase6 tdd-guide + build-error-resolver blocks (3 files, no deps)
4. TASK D — validate-workflow-contracts.js assertions (depends on A, B, C)
5. TASK E — test-install-model-rendering.js assertions (depends on A, B, C)
6. Validate — run `node scripts/validate-workflow-contracts.js && node scripts/test-install-model-rendering.js && node scripts/simulate-workflow-walkthrough.js`

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| Wave 1 | A, B, C | Disjoint files (phase4 vs phase5 vs phase6; each task also covers 3 files but they share no overlap) |
| Wave 2 | D, E | Disjoint scripts; both depend on Wave 1 |
| Wave 3 | validate | Sequential |

### External Dependencies

None. All edits are to local Markdown command files and Node.js scripts. No new imports.

## Insertion Content Reference

### Phase 4 — build-error-resolver block only

Insert between the prose line ending "for build/type/lint/tooling checks). Raw output goes to:" and the existing `validation-task-{n}.md` cache fence.

**old_string:**
```
for build/type/lint/tooling checks). Raw output goes to:

```text
kaola-workflow/{project}/.cache/validation-task-{n}.md
```
```

**new_string:**
```
for build/type/lint/tooling checks). Raw output goes to:

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly
as shown — do not omit the `model=` line.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/validation-task-{n}.md
```
```

### Phase 5 — tdd-guide + build-error-resolver blocks

Note: prose wraps as `Raw output goes\nto:` (not on one line).

**old_string:**
```
`build-error-resolver` for build/type/lint/tooling findings). Raw output goes
to:

```text
kaola-workflow/{project}/.cache/review-validation-{n}.md
```
```

**new_string:**
```
`build-error-resolver` for build/type/lint/tooling findings). Raw output goes
to:

Route behavior/test fixes to the Claude Code agent `tdd-guide`:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly
as shown — do not omit the `model=` line.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/review-validation-{n}.md
```
```

### Phase 6 — tdd-guide + build-error-resolver blocks

Anchor includes the full `.cache/final-validation.md` path to avoid substring collision with `final-validation-fix-{n}.md`.

**old_string:**
```
`build-error-resolver` for build/type/lint/tooling checks). Raw output goes to:

```text
kaola-workflow/{project}/.cache/final-validation.md
```
```

**new_string:**
```
`build-error-resolver` for build/type/lint/tooling checks). Raw output goes to:

Route behavior/test fixes to the Claude Code agent `tdd-guide`:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly
as shown — do not omit the `model=` line.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/final-validation.md
```
```

## Task List

### Task 1: Phase 4 command files — build-error-resolver block
- Files: `commands/kaola-workflow-phase4.md`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md`, `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md`
- Test File: `scripts/validate-workflow-contracts.js` (Task 4), `scripts/test-install-model-rendering.js` (Task 5)
- Write Set: 3 phase4 command files
- Depends On: none
- Parallel Group: Wave 1
- Action: MODIFY
- Implement: Insert build-error-resolver block using old_string/new_string above; apply identically to all 3 copies
- Mirror: Phase 4 Step 1 Delegate Task pattern (`commands/kaola-workflow-phase4.md:238-250`)
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 2: Phase 5 command files — tdd-guide + build-error-resolver blocks
- Files: `commands/kaola-workflow-phase5.md`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md`, `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md`
- Test File: `scripts/validate-workflow-contracts.js` (Task 4), `scripts/test-install-model-rendering.js` (Task 5)
- Write Set: 3 phase5 command files
- Depends On: none
- Parallel Group: Wave 1
- Action: MODIFY
- Implement: Insert both blocks using old_string/new_string above; apply identically to all 3 copies. Note prose line-wrap.
- Mirror: Phase 4 Step 1 pattern
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 3: Phase 6 command files — tdd-guide + build-error-resolver blocks
- Files: `commands/kaola-workflow-phase6.md`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md`, `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md`
- Test File: `scripts/validate-workflow-contracts.js` (Task 4), `scripts/test-install-model-rendering.js` (Task 5)
- Write Set: 3 phase6 command files
- Depends On: none
- Parallel Group: Wave 1
- Action: MODIFY
- Implement: Insert both blocks using old_string/new_string above; apply identically to all 3 copies. Use full `.cache/final-validation.md` anchor.
- Mirror: Phase 4 Step 1 pattern
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 4: validate-workflow-contracts.js — routed-fix assertions
- File: `scripts/validate-workflow-contracts.js`
- Test File: self-validating
- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: Tasks 1, 2, 3
- Parallel Group: Wave 2
- Action: MODIFY
- Implement: Insert the 9-file `routedFixFiles` array and two assertion loops after the existing `for (const file of phaseCommands)` loop (after line 76), before the `assert(exists('commands/workflow-next.md'), ...)` line:
  ```javascript
  // issue-152: routed-fix Agent blocks must carry explicit model placeholders
  const routedFixFiles = [
    'commands/kaola-workflow-phase4.md',
    'commands/kaola-workflow-phase5.md',
    'commands/kaola-workflow-phase6.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md',
  ];
  for (const file of routedFixFiles) {
    assertIncludes(file, 'model="{BUILD_ERROR_RESOLVER_MODEL}"');
    assertIncludes(file, 'subagent_type="build-error-resolver"');
  }
  for (const file of routedFixFiles.filter(f => /phase[56]/.test(f))) {
    assertIncludes(file, 'model="{TDD_GUIDE_MODEL}"');
  }
  ```
- Mirror: Existing `for (const file of phaseCommands)` assertion pattern (`scripts/validate-workflow-contracts.js:67-75`)
- Validate: `node scripts/validate-workflow-contracts.js`

### Task 5: test-install-model-rendering.js — rendered-sonnet assertions
- File: `scripts/test-install-model-rendering.js`
- Test File: self-validating (runs install.sh into a temp HOME)
- Write Set: `scripts/test-install-model-rendering.js`
- Depends On: Tasks 1, 2, 3
- Parallel Group: Wave 2
- Action: MODIFY
- Implement: Insert 4 assertions after the existing `assert(phase6.includes('model="haiku",'), ...)` line (currently line 42):
  ```javascript
  assert(
    phase5.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'phase5 routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    phase6.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'phase6 routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    phase5.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'phase5 routed-fix tdd-guide block should render as sonnet'
  );
  assert(
    phase6.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'phase6 routed-fix tdd-guide block should render as sonnet'
  );
  ```
- Mirror: Existing `assert(phase4.includes('model="sonnet",'), ...)` pattern (`scripts/test-install-model-rendering.js:40`)
- Validate: `node scripts/test-install-model-rendering.js`

## Advisor Notes

- Advisor confirmed blueprint is sound and anchors are solid.
- Revision 1 corrects TASK D to cover all 9 files (not just 3 root files), matching Phase 2 commitment that validator catches missed plugin forks.
- Phase 5 prose wrap (`goes\nto:`) and phase6 `final-validation` substring collision handled as specified.
- `test-install-model-rendering.js` assertions use full multi-line `subagent_type=...\n  model="sonnet",` pattern (stronger than bare `model="sonnet",` check).
- `description="Routed fix: task {n}"` is template-shaped; not filled in with concrete text per Phase 2 out-of-scope decision.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | TASK D plugin coverage fix |
