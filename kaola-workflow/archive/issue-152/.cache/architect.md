# Code Architect — issue-152: Explicit model-bearing Agent blocks for routed-fix agents

## Design Decisions

- **Option A confirmed:** Insert canonical `Agent(...)` blocks in the Validation Delegation Policy section (above the cache-path fence). Makes "exactly as documented above" references accurate without prose rewording.
- **Full Phase 4 envelope used:** Each new block uses `Invoke the Claude Code agent` line + `You MUST pass model=...` + fenced `Agent(...)` block.
- **`description` template:** `description="Routed fix: task {n}"` for all new blocks. `prompt="..."` stays template-shaped.
- **`old_string` spans prose-line-through-closing-fence** for uniqueness (critical for phase6 where bare `final-validation.md` substring is ambiguous).
- **Same Edit pair reused across 3 copies** of each phase (byte-identical across root, gitlab, gitea anchor regions).
- **Placeholders:** `{TDD_GUIDE_MODEL}` and `{BUILD_ERROR_RESOLVER_MODEL}` — not literals. First-ever use of `{BUILD_ERROR_RESOLVER_MODEL}` in any .md.

## Files to Create

None.

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `commands/kaola-workflow-phase4.md` | Insert build-error-resolver block only (tdd-guide already in Step 1) |
| 2 | `commands/kaola-workflow-phase5.md` | Insert tdd-guide + build-error-resolver blocks |
| 3 | `commands/kaola-workflow-phase6.md` | Insert tdd-guide + build-error-resolver blocks |
| 4 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md` | Same edit as #1 |
| 5 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md` | Same edit as #2 |
| 6 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` | Same edit as #3 |
| 7 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md` | Same edit as #1 |
| 8 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md` | Same edit as #2 |
| 9 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md` | Same edit as #3 |
| 10 | `scripts/validate-workflow-contracts.js` | Per-file placeholder-token assertions |
| 11 | `scripts/test-install-model-rendering.js` | Rendered-sonnet assertions for the new blocks |

## Exact Insertion Content

### Phase 4 — build-error-resolver block only

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

**old_string (note the prose wraps "Raw output goes\nto:"):**
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

**old_string (anchor on full path to avoid final-validation vs final-validation-fix collision):**
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

## Validator Script Changes

### scripts/validate-workflow-contracts.js

Add after the existing `for (const file of phaseCommands)` loop (after line 76):

```javascript
// issue-152: routed-fix Agent blocks must carry explicit model placeholders
for (const file of ['commands/kaola-workflow-phase4.md', 'commands/kaola-workflow-phase5.md', 'commands/kaola-workflow-phase6.md']) {
  assertIncludes(file, 'model="{BUILD_ERROR_RESOLVER_MODEL}"');
  assertIncludes(file, 'subagent_type="build-error-resolver"');
}
for (const file of ['commands/kaola-workflow-phase5.md', 'commands/kaola-workflow-phase6.md']) {
  assertIncludes(file, 'model="{TDD_GUIDE_MODEL}"');
}
```

### scripts/test-install-model-rendering.js

Add after the existing phase5/6 assertions (after line 42):

```javascript
  // issue-152: routed-fix blocks must render build-error-resolver as sonnet in phase5/6
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

## Build Sequence

1. TASK A — phase4 build-error-resolver block (3 files, no deps)
2. TASK B — phase5 two blocks (3 files, no deps)
3. TASK C — phase6 two blocks (3 files, no deps)
4. TASK D — validate-workflow-contracts.js assertions (depends on A, B, C)
5. TASK E — test-install-model-rendering.js assertions (depends on A, B, C)
6. Validate — run validators + walkthrough simulation

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| Wave 1 | A, B, C | disjoint files (phase4 vs phase5 vs phase6) |
| Wave 2 | D, E | disjoint files (two different scripts), both depend on Wave 1 |
| Wave 3 | validate | sequential |

## Implementer Cautions

- Phase 5 prose wraps differently: anchor is `...Raw output goes\nto:` (newline between "goes" and "to:").
- Phase 6 fence-string collision: anchor on full multi-line span including `.cache/final-validation.md`; never bare string.
- Phase 4 gets ONE block (build-error-resolver only). Do not add second tdd-guide block.
- Trailing blank line preserved in new_string before reproduced fence.

## Validation Command

```bash
node scripts/validate-workflow-contracts.js && node scripts/test-install-model-rendering.js && node scripts/simulate-workflow-walkthrough.js
```
