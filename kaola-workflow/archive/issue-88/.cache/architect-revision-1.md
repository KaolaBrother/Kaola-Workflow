# Architect Revision 1 — Issue #88: Gap 5 (stateContent Ownership Block)

## Scope

Narrowly covers Gap 5 only. All other Task A and Task B steps remain as specified in `.cache/architect.md`.

## Change 1 + 2: Updated `stateContent()` (complete replacement)

Replace lines 300–339 of `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`:

```javascript
function stateContent(routeResult, existingContent) {
  const relativePhaseFile = path.relative(routeResult.root, routeResult.phaseFile);
  const delegationPolicy = field(existingContent || '', 'delegation_policy');
  const preserved = ['GitLab', 'Sink']
    .map(section => extractSection(existingContent || '', section))
    .filter(Boolean);
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + routeResult.project,
    'status: active',
    '',
    '## Current Position',
    'phase: ' + routeResult.phase,
    'phase_name: ' + routeResult.phaseName,
    'step: ' + routeResult.step,
    'task: ' + routeResult.task,
    'next_command: ' + routeResult.nextCommand,
    'next_skill: ' + routeResult.nextSkill,
    ...(delegationPolicy ? ['delegation_policy: ' + delegationPolicy] : []),
    '',
    '## Pending Gates',
    ...(
      routeResult.pendingGates && routeResult.pendingGates.length > 0
        ? routeResult.pendingGates.map(row => '- ' + row.requirement + ': ' + (row.status || 'missing'))
        : ['- none']
    ),
    '',
    '## Ownership Rules',
    'main_session_role: orchestrator',
    'implementation_owner: ' + (routeResult.phase === 4 ? 'tdd-guide' : 'N/A'),
    'fix_owner: ' + (routeResult.phase >= 4 ? 'tdd-guide or build-error-resolver' : 'N/A'),
    'inline_emergency_fallback_authorized: no',
    '',
    '## Last Evidence',
    'phase_file: ' + relativePhaseFile,
    'cache_file: N/A',
    'last_command: repair-state',
    'last_result: state_repaired_from_artifacts',
    '',
    '## Last Updated',
    new Date().toISOString()
  ];
  return lines.concat('', preserved).join('\n') + '\n';
}
```

Key changes:
- `## Ownership Rules` block inserted between `## Pending Gates` and `## Last Evidence`
- Phase-conditional: phase 4 → `tdd-guide`/`tdd-guide or build-error-resolver`; phases 5-6 → `N/A`/`tdd-guide or build-error-resolver`; phases 1-3 → `N/A`/`N/A`
- Blank line before `## Last Evidence` preserved (the `''` after `inline_emergency_fallback_authorized`)
- `last_result` renamed from `reconstructed` → `state_repaired_from_artifacts` (rename verified safe: no test assertion on this string)

## Change 3: No module.exports change needed

`stateContent` is already exported at line 370 of the file.

## Gap 5 Test Blocks (append to Task B test section in `test-gitlab-workflow-scripts.js`)

Insert the following three blocks before the async tail (before `testGitLabRoadmapInitIssueExclusiveAndUpdate()` call):

```javascript
{
  const route4 = {
    root: '/tmp',
    phaseFile: '/tmp/phase4-tdd.md',
    project: 'gap5-project',
    phase: 4,
    phaseName: 'TDD',
    step: 'implement',
    task: 'write tests',
    nextCommand: '/kaola-workflow-phase4 gap5-project',
    nextSkill: 'kaola-workflow-execute gap5-project',
    pendingGates: []
  };
  const out4 = repair.stateContent(route4, '');
  assert(out4.includes('## Ownership Rules'), 'Gap5/phase4: output should include ## Ownership Rules section');
  assert(out4.includes('implementation_owner: tdd-guide'), 'Gap5/phase4: implementation_owner should be tdd-guide');
  assert(out4.includes('fix_owner: tdd-guide or build-error-resolver'), 'Gap5/phase4: fix_owner should be tdd-guide or build-error-resolver');
  assert(out4.includes('inline_emergency_fallback_authorized: no'), 'Gap5/phase4: inline_emergency_fallback_authorized should be no');
  assert(out4.includes('last_result: state_repaired_from_artifacts'), 'Gap5/phase4: last_result should be state_repaired_from_artifacts');
}

{
  const route2 = {
    root: '/tmp',
    phaseFile: '/tmp/phase2-research.md',
    project: 'gap5-project',
    phase: 2,
    phaseName: 'Research',
    step: 'gather',
    task: 'read docs',
    nextCommand: '/kaola-workflow-phase2 gap5-project',
    nextSkill: 'kaola-workflow-research gap5-project',
    pendingGates: []
  };
  const out2 = repair.stateContent(route2, '');
  assert(out2.includes('implementation_owner: N/A'), 'Gap5/phase2: implementation_owner should be N/A');
  assert(out2.includes('fix_owner: N/A'), 'Gap5/phase2: fix_owner should be N/A');
}

{
  const routePos = {
    root: '/tmp',
    phaseFile: '/tmp/phase3-plan.md',
    project: 'gap5-project',
    phase: 3,
    phaseName: 'Plan',
    step: 'plan',
    task: 'write plan',
    nextCommand: '/kaola-workflow-phase3 gap5-project',
    nextSkill: 'kaola-workflow-plan gap5-project',
    pendingGates: []
  };
  const outPos = repair.stateContent(routePos, '');
  const idxPending = outPos.indexOf('## Pending Gates');
  const idxOwnership = outPos.indexOf('## Ownership Rules');
  const idxEvidence = outPos.indexOf('## Last Evidence');
  assert(idxOwnership >= 0, 'Gap5/position: ## Ownership Rules must be present');
  assert(idxPending >= 0, 'Gap5/position: ## Pending Gates must be present');
  assert(idxEvidence >= 0, 'Gap5/position: ## Last Evidence must be present');
  assert(idxOwnership > idxPending, 'Gap5/position: ## Ownership Rules must appear after ## Pending Gates');
  assert(idxOwnership < idxEvidence, 'Gap5/position: ## Ownership Rules must appear before ## Last Evidence');
}
```

## Notes

- Blank-line separator: the `''` entry after `'inline_emergency_fallback_authorized: no'` preserves the one-blank-line section separator pattern.
- Test fixtures supply all fields referenced by `stateContent` to avoid silent `undefined` in rendered output.
- Task B scope only: no changes to `repair()`, `reconstruct()`, `complianceRows()`, or any classifier functions.
