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

function assertNotIncludes(file, needle) {
  const content = read(file);
  assert(!content.includes(needle), `${file} must not include: ${needle}`);
}

function assertBefore(file, first, second) {
  const content = read(file);
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  assert(firstIndex >= 0, `${file} must include: ${first}`);
  assert(secondIndex >= 0, `${file} must include: ${second}`);
  assert(firstIndex < secondIndex, `${file} must put ${first} before ${second}`);
}

const phaseCommands = [
  'commands/kaola-workflow-phase1.md',
  'commands/kaola-workflow-phase2.md',
  'commands/kaola-workflow-phase3.md',
  'commands/kaola-workflow-phase4.md',
  'commands/kaola-workflow-phase5.md',
  'commands/kaola-workflow-phase6.md',
];

for (const file of phaseCommands) {
  assert(exists(file), `${file} is missing`);
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, 'Required Agent Compliance');
}

assert(exists('commands/workflow-next.md'), 'commands/workflow-next.md is missing');
assert(!exists('commands/kaola-workflow.md'), 'commands/kaola-workflow.md must be renamed to workflow-next.md');
assertIncludes('commands/workflow-next.md', 'thin router');
assertIncludes('commands/workflow-next.md', 'next_command');
assertIncludes('commands/workflow-next.md', '/kaola-workflow-phase4');
assertIncludes('commands/workflow-next.md', '## State Bootstrap And Repair');
assertIncludes('commands/workflow-next.md', 'write repaired `workflow-state.md`');
assertIncludes('commands/workflow-next.md', 'kaola-workflow-repair-state.js');
assertIncludes('commands/workflow-next.md', 'Do not create `workflow-state.md` for brand-new work');
assertIncludes('README.md', 'State Bootstrap And Repair');
assertIncludes('README.md', 'kaola-workflow-repair-state.js');
assertIncludes('commands/workflow-init.md', 'State Bootstrap And Repair');

assertIncludes('README.md', '## Autonomy And Goal Contract');
assertIncludes('README.md', '/goal');
assertIncludes('README.md', 'prompt-based Stop-hook');
assertIncludes('README.md', 'Routine workflow bookkeeping is autonomous');
assertIncludes('README.md', 'Prompt the user only for true external authorization');
assertIncludes('commands/workflow-init.md', 'Use `/goal` or equivalent prompt-based Stop-hook wording');
assertIncludes('commands/workflow-init.md', 'Treat nonessential workflow bookkeeping as autonomous');
assertIncludes('commands/workflow-next.md', '## Goal-Driven Autonomy');
assertIncludes('commands/workflow-next.md', 'Use `/goal` or equivalent prompt-based Stop-hook wording');
assertIncludes('commands/workflow-next.md', 'generated project names');
assertIncludes('commands/workflow-next.md', 'collision suffixes');
assertIncludes('commands/workflow-next.md', 'Ask only for true external');
assertIncludes('commands/kaola-workflow-phase1.md', 'Do not ask the user to confirm generated project/folder names');
assertIncludes('commands/kaola-workflow-phase1.md', 'append the first available');
assertIncludes('commands/kaola-workflow-phase1.md', 'Do not ask for confirmation');
assertNotIncludes('commands/kaola-workflow-phase1.md', 'Confirm? (yes / rename to: ...)');
assertIncludes('commands/kaola-workflow-phase2.md', '## Step 3 - Internal Selection');
assertIncludes('commands/kaola-workflow-phase2.md', 'Choose the advisor-reviewed recommended option');
assertNotIncludes('commands/kaola-workflow-phase2.md', 'Wait for user selection');
assertIncludes('commands/kaola-workflow-phase3.md', '## Step 5 - Continue To Phase 4');
assertIncludes('commands/kaola-workflow-phase3.md', 'ask the user to confirm internal workflow execution');
assertNotIncludes('commands/kaola-workflow-phase3.md', 'user-confirm-phase4');
assertIncludes('commands/kaola-workflow-phase2.md', '.cache/advisor-ideation.md');
assertIncludes('commands/kaola-workflow-phase3.md', '.cache/advisor-plan.md');
assertIncludes('commands/kaola-workflow-phase3.md', 'architect-revision');

assertIncludes('commands/kaola-workflow-phase4.md', 'NO INLINE PHASE 4 FIXES');
assertIncludes('commands/kaola-workflow-phase4.md', 'Failure Routing Ledger');
assertIncludes('commands/kaola-workflow-phase4.md', 'inline_emergency_fallback_authorized: no');
assertIncludes('commands/kaola-workflow-phase4.md', '## Validation Delegation Policy');
assertIncludes('commands/kaola-workflow-phase4.md', 'delegate expensive or noisy validation');
assertIncludes('commands/kaola-workflow-phase4.md', '## Validation De-Duplication');
assertIncludes('commands/kaola-workflow-phase4.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/kaola-workflow-phase4.md', 'one line or mechanically obvious');

assertIncludes('commands/kaola-workflow-phase5.md', 'review only; do not edit files');
assertIncludes('commands/kaola-workflow-phase5.md', '## Validation Delegation Policy');
assertIncludes('commands/kaola-workflow-phase5.md', '## Validation De-Duplication');
assertIncludes('commands/kaola-workflow-phase5.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/kaola-workflow-phase5.md', 'one line or mechanically obvious');
assertIncludes('commands/kaola-workflow-phase6.md', 'Final Validation Failure Ledger');
assertIncludes('commands/kaola-workflow-phase6.md', 'Do not repair inline');
assertIncludes('commands/kaola-workflow-phase6.md', '## Validation Delegation Policy');
assertIncludes('commands/kaola-workflow-phase6.md', 'delegate expensive or noisy validation');
assertIncludes('commands/kaola-workflow-phase6.md', '## Validation De-Duplication');
assertIncludes('commands/kaola-workflow-phase6.md', '## Trivial Inline Edit Exception');
assertIncludes('commands/kaola-workflow-phase6.md', 'one line or mechanically obvious');
assertIncludes('commands/kaola-workflow-phase6.md', '## Documentation Docking');
assertIncludes('commands/kaola-workflow-phase6.md', '.cache/doc-docking.md');
assertIncludes('commands/kaola-workflow-phase6.md', '## Closure Decision Gate');
assertIncludes('commands/kaola-workflow-phase6.md', '.cache/advisor-closure.md');
assertIncludes('commands/kaola-workflow-phase6.md', '## Step 8 - Commit Gate');
assertIncludes('commands/kaola-workflow-phase6.md', '## Step 9 - Sink');
assertBefore('commands/kaola-workflow-phase6.md', 'git commit -m "chore: finalize {project}"', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-sink-merge.js');
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
assertIncludes('commands/workflow-init.md', 'kaola_script(){ _n="$1"');
assertIncludes('commands/workflow-init.md', '$HOME/.claude/plugins/cache');
assertNotIncludes('commands/workflow-init.md', 'CLAUDE_PLUGIN_ROOT:-./');
assertNotIncludes('commands/workflow-init.md', 'CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow');
assertIncludes('install.sh', 'kaola-workflow-repair-state.js');
assertIncludes('install.sh', 'verify_installed_file');
assertIncludes('install.sh', 'verify_executable_file');
assertIncludes('install.sh', 'Verified Kaola-Workflow install files.');
assertIncludes('uninstall.sh', '.claude/kaola-workflow');

assert(exists('hooks/hooks.json'), 'hooks/hooks.json is missing');
assert(exists('scripts/kaola-workflow-compact-context.js'), 'compact context hook script is missing');
assert(exists('scripts/kaola-workflow-session-env.js'), 'session env hook script is missing');
assert(exists('scripts/kaola-workflow-repair-state.js'), 'state repair script is missing');
assert(exists('scripts/simulate-workflow-walkthrough.js'), 'workflow walkthrough simulation script is missing');
assertIncludes('hooks/hooks.json', 'SessionStart');
assertIncludes('hooks/hooks.json', 'compact');
assertIncludes('hooks/hooks.json', 'kaola-workflow-compact-context.js');
assertIncludes('hooks/hooks.json', 'kaola-workflow-session-env.js');
assertIncludes('hooks/hooks.json', 'startup|resume|clear|compact');

const pluginJson = JSON.parse(read('.claude-plugin/plugin.json'));
assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'hooks'), 'plugin.json must not declare hooks/hooks.json');

const marketplaceJson = JSON.parse(read('.claude-plugin/marketplace.json'));
assert(marketplaceJson.name === 'kaolabrother-kaola-workflow', 'marketplace name must stay stable for install commands');
assert(Array.isArray(marketplaceJson.plugins), 'marketplace.json must define plugins');
const workflowPlugin = marketplaceJson.plugins.find(plugin => plugin.name === 'kaola-workflow');
assert(workflowPlugin, 'marketplace.json must list kaola-workflow');
assert(workflowPlugin.source === './', 'kaola-workflow marketplace source must point at the repo root plugin');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.version === pluginJson.version, 'package.json and plugin.json versions must match');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('hooks/'), 'package.json files must include hooks/');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('scripts/'), 'package.json files must include scripts/');

const routerLines = read('commands/workflow-next.md').split(/\r?\n/).length;
assert(routerLines <= 250, `commands/workflow-next.md must remain a thin router; found ${routerLines} lines`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-contract-'));
try {
  const stateDir = path.join(tmp, 'kaola-workflow', 'demo');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: demo',
    'status: active',
    '',
    '## Current Position',
    'phase: 4',
    'step: route-failure',
    'next_command: /kaola-workflow-phase4 demo',
    '',
    '## Ownership Rules',
    'inline_emergency_fallback_authorized: no',
    ''
  ].join('\n'));

  const output = execFileSync(process.execPath, [path.join(root, 'scripts/kaola-workflow-compact-context.js')], {
    cwd: tmp,
    encoding: 'utf8'
  });

  assert(output.includes('/kaola-workflow-phase4 demo'), 'compact hook output must include next command');
  assert(output.includes('do not repair inline'), 'compact hook output must include inline repair guardrail');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// multi-session-substrate assertions
assert(exists('scripts/kaola-workflow-claim.js'), 'scripts/kaola-workflow-claim.js is missing');
assert(exists('hooks/kaola-workflow-pre-commit.sh'), 'hooks/kaola-workflow-pre-commit.sh is missing');
assertIncludes('.gitignore', 'kaola-workflow/.locks/');
assertIncludes('.gitignore', 'kaola-workflow/.sessions/');
assertIncludes('hooks/hooks.json', 'PreToolUse');
assertIncludes('install.sh', 'kaola-workflow-claim.js');
assertIncludes('install.sh', 'kaola-workflow-session-env.js');
assertIncludes('install.sh', 'kaola-workflow-sink-merge.js');
assertIncludes('scripts/kaola-workflow-claim.js', 'workflow/issue-');
assertIncludes('scripts/kaola-workflow-claim.js', 'CODEX_THREAD_ID');
assertIncludes('scripts/kaola-workflow-claim.js', 'function cmdHandoff');
assertIncludes('scripts/kaola-workflow-claim.js', 'function runBootstrapClaimFirstAvailable');
assertIncludes('scripts/simulate-workflow-walkthrough.js', 'Epic Case 13: true parallel bootstrap coordination');
assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/workflow-next.md', 'Branch:');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'MAX_AUTOMERGE_RETRIES');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'KAOLA_WORKFLOW_OFFLINE');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'KAOLA_WORKFLOW_FORCE_FF_FAIL');
assertIncludes('commands/kaola-workflow-phase1.md', 'git status --porcelain');
assertIncludes('commands/kaola-workflow-phase1.md', 'git checkout -b');
assertIncludes('commands/kaola-workflow-phase1.md', 'patch-branch');
assertIncludes('install.sh', 'kaola-workflow-pre-commit.sh');
assertIncludes('commands/workflow-next.md', 'Startup Step 0');
assertIncludes('commands/workflow-next.md', 'kaola_script(){ _n="$1"');
assertIncludes('commands/workflow-next.md', '$HOME/.claude/plugins/cache');
assertNotIncludes('commands/workflow-next.md', 'CLAUDE_PLUGIN_ROOT:-./');
assertNotIncludes('commands/workflow-next.md', 'CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow');
for (const file of phaseCommands) {
  assertIncludes(file, 'Session Heartbeat');
  assertIncludes(file, 'kaola_script(){ _n="$1"');
  assertIncludes(file, '$HOME/.claude/plugins/cache');
  assertNotIncludes(file, 'CLAUDE_PLUGIN_ROOT:-./');
  assertNotIncludes(file, 'CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow');
}

// roadmap-per-issue-regenerator
assert(exists('scripts/kaola-workflow-roadmap.js'), 'scripts/kaola-workflow-roadmap.js is missing');
assert(exists('scripts/kaola-workflow-classifier.js'), 'scripts/kaola-workflow-classifier.js is missing');
assertIncludes('scripts/kaola-workflow-classifier.js', 'function extractFilePaths');
assertIncludes('scripts/kaola-workflow-classifier.js', 'plugins\\/kaola-workflow');
assertIncludes('install.sh', 'kaola-workflow-roadmap.js');
assertIncludes('install.sh', 'kaola-workflow-classifier.js');
assertIncludes('hooks/kaola-workflow-pre-commit.sh', '\\.roadmap/');
assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-roadmap.js');
assertIncludes('commands/kaola-workflow-phase1.md', 'init-issue');
assertIncludes('commands/workflow-next.md', 'kaola-workflow-roadmap.js');
assertIncludes('commands/workflow-next.md', 'kaola-workflow-classifier.js');
assertIncludes('commands/workflow-next.md', 'Sweep, Classify, And Claim');
assertIncludes('commands/workflow-next.md', 'Parallel decision:');
assertIncludes('commands/workflow-next.md', 'handoff --project');
assertIncludes('README.md', 'CODEX_THREAD_ID');
assertIncludes('README.md', 'SessionStart.session_id');
assertIncludes('README.md', 'Recovery is never triggered implicitly');

// pr-sink assertions
assert(exists('scripts/kaola-workflow-sink-pr.js'), 'scripts/kaola-workflow-sink-pr.js is missing');
assertIncludes('install.sh', 'kaola-workflow-sink-pr.js');
assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-sink-pr.js');
assertIncludes('commands/kaola-workflow-phase6.md', 'SINK_KIND');
assert(exists('commands/workflow-next-pr.md'), 'commands/workflow-next-pr.md is missing');
const routerPrLines = read('commands/workflow-next-pr.md').split(/\r?\n/).length;
assert(routerPrLines <= 40, `commands/workflow-next-pr.md must be ≤40 lines; found ${routerPrLines}`);
assertIncludes('scripts/kaola-workflow-claim.js', 'watch-pr');
assertIncludes('scripts/kaola-workflow-claim.js', 'releaseSession');
assertIncludes('scripts/kaola-workflow-claim.js', 'sink:');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'KAOLA_WORKFLOW_OFFLINE');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'OFFLINE_PLACEHOLDER');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'pr_auto_merge');
assertIncludes('commands/workflow-next.md', 'watch-pr');
assertIncludes('commands/workflow-next.md', 'KAOLA_SINK');

console.log('Workflow contract validation passed');
