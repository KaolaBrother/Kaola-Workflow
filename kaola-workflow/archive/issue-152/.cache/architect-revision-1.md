# Architect Revision 1 — issue-152: TASK D validator coverage fix

## Revision Scope

TASK D only. All other tasks (A, B, C, E) unchanged.

## Problem

The original TASK D assertion loops covered only 3 root command files. Phase 2 committed to 15 assertions covering all 9 files (root + gitlab + gitea × phase4/5/6) because `validate-script-sync.js` does not cover plugin command file sync — the assertions are the only enforcement net for missed forks.

## Corrected TASK D

### scripts/validate-workflow-contracts.js

Replace the original 3-file loop with a 9-file array:

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

This produces 9×2 + 6×1 = 24 assertion calls covering:
- `{BUILD_ERROR_RESOLVER_MODEL}` and `subagent_type="build-error-resolver"` in all 9 files
- `{TDD_GUIDE_MODEL}` in the 6 phase5/6 files (3 root + 3 plugins)
- Phase4's `{TDD_GUIDE_MODEL}` pre-exists and is already covered by the existing generic `assertIncludes(file, 'model="{')` in the phaseCommands loop.

## Insert location

After the closing `}` of the existing `for (const file of phaseCommands)` loop (currently line 76 in `scripts/validate-workflow-contracts.js`), before `assert(exists('commands/workflow-next.md'), ...)`.

## All other tasks unchanged

TASK A, B, C (command file edits), TASK E (test-install-model-rendering.js) — unchanged from architect.md.
