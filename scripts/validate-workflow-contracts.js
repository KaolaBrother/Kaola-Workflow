#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(file, needle) {
  const content = read(file);
  assert(content.includes(needle), `${file} must include: ${needle}`);
}

const phaseCommands = [
  'commands/claude-workflow-phase1.md',
  'commands/claude-workflow-phase2.md',
  'commands/claude-workflow-phase3.md',
  'commands/claude-workflow-phase4.md',
  'commands/claude-workflow-phase5.md',
  'commands/claude-workflow-phase6.md',
];

for (const file of phaseCommands) {
  assert(exists(file), `${file} is missing`);
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, 'Required Agent Compliance');
}

assert(exists('commands/workflow-next.md'), 'commands/workflow-next.md is missing');
assert(!exists('commands/claude-workflow.md'), 'commands/claude-workflow.md must be renamed to workflow-next.md');
assertIncludes('commands/workflow-next.md', 'thin router');
assertIncludes('commands/workflow-next.md', 'next_command');
assertIncludes('commands/workflow-next.md', '/claude-workflow-phase4');
assertIncludes('commands/workflow-next.md', '## State Bootstrap And Repair');
assertIncludes('commands/workflow-next.md', 'write repaired `workflow-state.md`');
assertIncludes('commands/workflow-next.md', 'claude-workflow-repair-state.js');
assertIncludes('commands/workflow-next.md', 'Do not create `workflow-state.md` for brand-new work');
assertIncludes('README.md', 'State Bootstrap And Repair');
assertIncludes('README.md', 'claude-workflow-repair-state.js');
assertIncludes('commands/workflow-init.md', 'State Bootstrap And Repair');

assertIncludes('commands/claude-workflow-phase1.md', 'temporary Phase 1 capture');
assertIncludes('commands/claude-workflow-phase2.md', '.cache/advisor-ideation.md');
assertIncludes('commands/claude-workflow-phase3.md', '.cache/advisor-plan.md');
assertIncludes('commands/claude-workflow-phase3.md', 'architect-revision');

assertIncludes('commands/claude-workflow-phase4.md', 'NO INLINE PHASE 4 FIXES');
assertIncludes('commands/claude-workflow-phase4.md', 'Failure Routing Ledger');
assertIncludes('commands/claude-workflow-phase4.md', 'inline_emergency_fallback_authorized: no');
assertIncludes('commands/claude-workflow-phase4.md', '## Validation Delegation Policy');
assertIncludes('commands/claude-workflow-phase4.md', 'delegate expensive or noisy validation');
assertIncludes('commands/claude-workflow-phase4.md', '## Validation De-Duplication');
assertIncludes('commands/claude-workflow-phase4.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/claude-workflow-phase4.md', 'one line or mechanically obvious');

assertIncludes('commands/claude-workflow-phase5.md', 'review only; do not edit files');
assertIncludes('commands/claude-workflow-phase5.md', '## Validation Delegation Policy');
assertIncludes('commands/claude-workflow-phase5.md', '## Validation De-Duplication');
assertIncludes('commands/claude-workflow-phase5.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/claude-workflow-phase5.md', 'one line or mechanically obvious');
assertIncludes('commands/claude-workflow-phase6.md', 'Final Validation Failure Ledger');
assertIncludes('commands/claude-workflow-phase6.md', 'Do not repair inline');
assertIncludes('commands/claude-workflow-phase6.md', '## Validation Delegation Policy');
assertIncludes('commands/claude-workflow-phase6.md', 'delegate expensive or noisy validation');
assertIncludes('commands/claude-workflow-phase6.md', '## Validation De-Duplication');
assertIncludes('commands/claude-workflow-phase6.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/claude-workflow-phase6.md', 'one line or mechanically obvious');
assertIncludes('commands/claude-workflow-phase6.md', '## Documentation Docking');
assertIncludes('commands/claude-workflow-phase6.md', '.cache/doc-docking.md');
assertIncludes('commands/claude-workflow-phase6.md', '## Closure Decision Gate');
assertIncludes('commands/claude-workflow-phase6.md', '.cache/advisor-closure.md');
assertIncludes('commands/claude-workflow-phase6.md', '## Step 8 - Commit And Push');
assertIncludes('commands/claude-workflow-phase6.md', 'git push');
assertIncludes('commands/claude-workflow-phase6.md', 'clean and synced');
assertIncludes('README.md', 'Avoid redundant validation runs');
assertIncludes('README.md', '/workflow-next');
assertIncludes('README.md', 'documentation docking');
assertIncludes('README.md', 'commit and push');
assertIncludes('README.md', '## ECC Hook Policy');
assertIncludes('README.md', 'ECC_HOOK_PROFILE=minimal');
assertIncludes('commands/workflow-init.md', 'Use `/workflow-next` as the workflow entrypoint and router.');
assertIncludes('commands/workflow-init.md', 'commit and push');
assertIncludes('commands/workflow-init.md', '## ECC Hook Policy');
assertIncludes('commands/workflow-init.md', 'ECC_HOOK_PROFILE=minimal');
assertIncludes('install.sh', 'claude-workflow-repair-state.js');
assertIncludes('uninstall.sh', '.claude/claude-workflow');

assert(exists('hooks/hooks.json'), 'hooks/hooks.json is missing');
assert(exists('scripts/claude-workflow-compact-context.js'), 'compact context hook script is missing');
assert(exists('scripts/claude-workflow-repair-state.js'), 'state repair script is missing');
assert(exists('scripts/simulate-workflow-walkthrough.js'), 'workflow walkthrough simulation script is missing');
assertIncludes('hooks/hooks.json', 'SessionStart');
assertIncludes('hooks/hooks.json', 'compact');
assertIncludes('hooks/hooks.json', 'claude-workflow-compact-context.js');

const pluginJson = JSON.parse(read('.claude-plugin/plugin.json'));
assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'hooks'), 'plugin.json must not declare hooks/hooks.json');

const marketplaceJson = JSON.parse(read('.claude-plugin/marketplace.json'));
assert(marketplaceJson.name === 'kaolabrother-claude-workflow', 'marketplace name must stay stable for install commands');
assert(Array.isArray(marketplaceJson.plugins), 'marketplace.json must define plugins');
const workflowPlugin = marketplaceJson.plugins.find(plugin => plugin.name === 'claude-workflow');
assert(workflowPlugin, 'marketplace.json must list claude-workflow');
assert(workflowPlugin.source === './', 'claude-workflow marketplace source must point at the repo root plugin');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.version === pluginJson.version, 'package.json and plugin.json versions must match');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('hooks/'), 'package.json files must include hooks/');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('scripts/'), 'package.json files must include scripts/');

const routerLines = read('commands/workflow-next.md').split(/\r?\n/).length;
assert(routerLines <= 220, `commands/workflow-next.md must remain a thin router; found ${routerLines} lines`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-workflow-contract-'));
try {
  const stateDir = path.join(tmp, 'claude-workflow', 'demo');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'workflow-state.md'), [
    '# Claude Workflow State',
    '',
    '## Project',
    'name: demo',
    'status: active',
    '',
    '## Current Position',
    'phase: 4',
    'step: route-failure',
    'next_command: /claude-workflow-phase4 demo',
    '',
    '## Ownership Rules',
    'inline_emergency_fallback_authorized: no',
    ''
  ].join('\n'));

  const output = execFileSync(process.execPath, [path.join(root, 'scripts/claude-workflow-compact-context.js')], {
    cwd: tmp,
    encoding: 'utf8'
  });

  assert(output.includes('/claude-workflow-phase4 demo'), 'compact hook output must include next command');
  assert(output.includes('do not repair inline'), 'compact hook output must include inline repair guardrail');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Workflow contract validation passed');
