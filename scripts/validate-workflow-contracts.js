#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(file, needle) {
  assert(read(file).includes(needle), file + ' must include: ' + needle);
}

function assertNotIncludes(file, needle) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}

function assertConcept(file, concept, terms) {
  const content = read(file).toLowerCase();
  const missing = terms.filter(term => !content.includes(term.toLowerCase()));
  assert(missing.length === 0, file + ' must document ' + concept + '; missing: ' + missing.join(', '));
}

function assertBefore(file, first, second) {
  const content = read(file);
  assert(content.indexOf(first) >= 0, file + ' must include: ' + first);
  assert(content.indexOf(second) >= 0, file + ' must include: ' + second);
  assert(content.indexOf(first) < content.indexOf(second), file + ' must put ' + first + ' before ' + second);
}

function assertEveryDispatchHasModel(file) {
  const lines = read(file).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^Agent\(\s*$/.test(lines[i])) continue;
    let hasSubagent = false, hasModel = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\)\s*$/.test(lines[j])) break;
      if (/subagent_type="[^"]+"/.test(lines[j])) hasSubagent = true;
      if (/model="\{[A-Z_]+_MODEL\}"/.test(lines[j])) hasModel = true;
    }
    assert(!hasSubagent || hasModel,
      file + ' has an Agent( dispatch block at line ' + (i+1) + ' missing a model="{..._MODEL}" line');
  }
}

const retired = [
  ...['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers'].map(name => '.' + name),
  ['heart', 'beat'].join(''),
  ['tick', 'er'].join(''),
  ['derive', 'session'].join('-'),
  ['verify', 'startup'].join('-'),
  ['can', 'hand' + 'off'].join('-'),
  'hand' + 'off',
  ['startup', 'receipt'].join(' '),
  ['session', 'id'].join('_'),
  ['last', 'heart' + 'beat'].join('_'),
  '## ' + 'Lease',
  ['KAOLA', 'SESSION', 'ID'].join('_')
];

const phaseCommands = [
  'commands/kaola-workflow-phase1.md',
  'commands/kaola-workflow-phase2.md',
  'commands/kaola-workflow-phase3.md',
  'commands/kaola-workflow-phase4.md',
  'commands/kaola-workflow-phase5.md',
  'commands/kaola-workflow-phase6.md',
  'commands/kaola-workflow-fast.md'
];

for (const file of phaseCommands) {
  assert(exists(file), file + ' is missing');
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, '## Agent Model Badge');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  assertNotIncludes(file, 'Agent Model Badge Contract');
  assertNotIncludes(file, 'kaola_agent_model');
  for (const token of retired) assertNotIncludes(file, token);
}

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

assert(exists('commands/workflow-next.md'), 'workflow-next command is missing');
assert(!exists('commands/kaola-workflow.md'), 'legacy kaola-workflow command must not exist');
assertIncludes('commands/workflow-next.md', 'thin router');
assertIncludes('commands/workflow-next.md', 'active folders');
assertIncludes('commands/workflow-next.md', 'watch-pr');
assertIncludes('commands/workflow-next.md', '--target-issue');
assertIncludes('commands/workflow-next.md', '## Co-active Folders');
for (const token of retired) assertNotIncludes('commands/workflow-next.md', token);

assert(exists('scripts/kaola-workflow-active-folders.js'), 'active folder reader is missing');
assert(exists('scripts/kaola-workflow-claim.js'), 'claim script is missing');
assert(exists('scripts/kaola-workflow-classifier.js'), 'classifier script is missing');
assert(exists('scripts/kaola-workflow-repair-state.js'), 'repair script is missing');
assert(exists('scripts/kaola-workflow-sink-merge.js'), 'merge sink is missing');
assert(exists('scripts/kaola-workflow-sink-pr.js'), 'PR sink is missing');
assert(!exists('scripts/kaola-workflow-session-env.js'), 'session env hook script must be removed');

assertIncludes('scripts/kaola-workflow-claim.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-claim.js', 'archiveProjectDir');
assertIncludes('scripts/kaola-workflow-claim.js', 'claimExplicitTarget');
assertIncludes('scripts/kaola-workflow-claim.js', 'if (require.main === module)');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree_path');
assertIncludes('scripts/kaola-workflow-claim.js', 'mainRootFromCoord');
assertIncludes('scripts/kaola-workflow-claim.js', "stdio: ['ignore', 'ignore', 'ignore']");
assertIncludes('scripts/kaola-workflow-claim.js', "'workflow_path: ' + workflowPath");
assertIncludes('scripts/kaola-workflow-claim.js', '/kaola-workflow-fast ');
assertIncludes('scripts/kaola-workflow-claim.js', 'removeLegacyStateBlocks');
assertIncludes('scripts/kaola-workflow-active-folders.js', 'excludeClosedIssues');
assertIncludes('scripts/kaola-workflow-classifier.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-classifier.js', 'kw:claim\\s+(project|sess)=');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'updateStateSinkBlock');
assertNotIncludes('scripts/kaola-workflow-sink-pr.js', 'patchLockFile');

for (const file of [
  'scripts/kaola-workflow-claim.js',
  'scripts/kaola-workflow-active-folders.js',
  'scripts/kaola-workflow-classifier.js',
  'scripts/kaola-workflow-repair-state.js',
  'scripts/kaola-workflow-sink-merge.js',
  'scripts/kaola-workflow-sink-pr.js',
  'hooks/kaola-workflow-pre-commit.sh',
  'hooks/hooks.json',
  'install.sh',
  'README.md',
  'CLAUDE.md'
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes('hooks/hooks.json', 'compact-context');
assertNotIncludes('hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes('hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assertNotIncludes('hooks/hooks.json', 'session-env');
assertIncludes('hooks/kaola-workflow-pre-commit.sh', 'multiple kaola-workflow projects staged');
assertIncludes('install.sh', 'kaola-workflow-active-folders.js');
assertIncludes('install.sh', 'kaola-workflow-resolve-agent-model.js');
assertIncludes('uninstall.sh', 'subagentStatusLine');
assertNotIncludes('install.sh', 'kaola-workflow-session-env.js');
assert(exists('scripts/kaola-workflow-resolve-agent-model.js'), 'agent model resolver is missing');
assert(!exists('scripts/kaola-workflow-subagent-statusline.js'), 'subagent status line helper must not exist');

assert(exists('docs/workflow-state-contract.md'), 'detailed workflow state contract doc is missing');
assert(read('CLAUDE.md').split(/\r?\n/).length < 200, 'CLAUDE.md must stay below the 200-line target');
assertConcept('CLAUDE.md', 'compact durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept('commands/workflow-init.md', 'generated CLAUDE durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept('docs/workflow-state-contract.md', 'durable sources and generated mirrors', [
  'durable sources',
  'kaola-workflow/.roadmap/issue-*.md',
  'workflow-state.md',
  'generated mirrors',
  'fast-summary.md'
]);
assertConcept('docs/workflow-state-contract.md', 'legacy coordination as transitional only', [
  'legacy or transitional',
  '.locks/',
  '.sessions/',
  '.tickers/',
  'not document legacy coordination folders as permanent'
]);
assertConcept('docs/api.md', 'closure contract invariants and receipt schema', [
  '## Closure Contract',
  'closure invariants',
  'roadmap_source_removed',
  'remote_issue_closed',
  'claim_label_removed',
  'kaola-workflow-closure-contract.js',
  '#162',
  '#163',
  '#164',
  '#165'
]);
// issue #194: audit-labels/repair-labels reached GitLab/Gitea parity; the docs
// must not re-assert the stale GitHub-only claim, and must describe parity.
assertNotIncludes('docs/api.md', '(GitHub only, issue #163)');
assertNotIncludes('docs/api.md', 'subcommands are GitHub-only');
assertNotIncludes('docs/api.md', 'subcommands remain GitHub-only');
assertConcept('docs/api.md', 'audit-labels/repair-labels forge parity', [
  'audit-labels',
  'repair-labels',
  'parity',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitea-workflow-claim.js'
]);
assertConcept('docs/workflow-state-contract.md', 'closure contract cross-reference', [
  'closure contract'
]);
assertConcept('scripts/kaola-workflow-roadmap.js', 'missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept('scripts/kaola-workflow-roadmap.js', 'atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  "fs.openSync(tmp, 'wx')",
  'fs.renameSync(tmp, filePath)',
  "fs.openSync(filePath, 'wx')",
  'fs.fsyncSync(fd)'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'roadmap safeguard behavior', [
  'testRoadmapGenerateMissingSourceGuard',
  'preserve existing active roadmap rows'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'roadmap concurrency regression behavior', [
  'testRoadmapGenerateAtomicReplace',
  'testRoadmapInitIssueConcurrentExclusive',
  'concurrent init-issue should create exactly one source file',
  'final-path exclusivity'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'startup and cleanup hardening regressions', [
  'testStartupJsonAndSiblingWorktrees',
  'testFastStartupState',
  'testClassifierCurrentClaimMarkerBlocks',
  'finalize should remove legacy lease blocks before archive'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);
assertIncludes('README.md', 'Active folder coordination');
assertIncludes('README.md', 'Parallel active work');
assertIncludes('README.md', 'No lease/session layer remains.');
assertConcept('README.md', 'pointer to detailed state contract', [
  'docs/workflow-state-contract.md',
  'durable-state map',
  'active artifacts include'
]);
assertIncludes('CLAUDE.md', 'active folders');
assert(exists('AGENTS.md'), 'AGENTS.md must exist at repo root (dogfood redirect)');
assertIncludes('AGENTS.md', '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes('commands/workflow-init.md', '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');

assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/kaola-workflow-phase6.md', 'kaola-workflow-sink-pr.js');
assertIncludes('commands/kaola-workflow-phase6.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"');
assertIncludes('commands/kaola-workflow-phase6.md', '--keep-worktree');
assertIncludes('commands/kaola-workflow-phase6.md', 'Use the sink metadata captured before Step 8b');
assertBefore('commands/kaola-workflow-phase6.md', 'commit -m "chore: finalize {project}"', 'kaola-workflow-sink-merge.js');
assertBefore('commands/kaola-workflow-phase6.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"', 'node "$CLAIM_JS" finalize');

const packageJson = JSON.parse(read('package.json'));
assert(Array.isArray(packageJson.files) && packageJson.files.includes('hooks/'), 'package files must include hooks/');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('scripts/'), 'package files must include scripts/');

const rootVersion = packageJson.version;
for (const edition of ['GitHub', 'GitLab', 'Gitea']) {
  assertIncludes(
    'README.md',
    'Claude Code command install, ' + edition + ' edition: `' + rootVersion + '`'
  );
}
for (const forge of ['gitlab', 'gitea']) {
  const manifest = JSON.parse(read('plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json'));
  assert(
    manifest.version === rootVersion,
    'plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json version (' +
      manifest.version + ') must match package.json version (' + rootVersion + ')'
  );
}

const codexManifests = [
  ['kaola-workflow', 'plugins/kaola-workflow/.codex-plugin/plugin.json'],
  ['kaola-workflow-gitlab', 'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json'],
  ['kaola-workflow-gitea', 'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json'],
].map(([name, file]) => {
  const manifest = JSON.parse(read(file));
  assert(manifest.name === name, file + ' must declare name ' + name);
  assertIncludes('README.md', 'Codex `' + name + '` plugin manifest: `' + manifest.version + '`');
  return { name, file, version: manifest.version };
});
const codexBaselineVersion = codexManifests[0].version;
for (const manifest of codexManifests.slice(1)) {
  assert(
    manifest.version === codexBaselineVersion,
    manifest.file + ' version (' + manifest.version +
      ') must match plugins/kaola-workflow/.codex-plugin/plugin.json version (' +
      codexBaselineVersion + ')'
  );
}

assert(
  read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
  'CHANGELOG.md must contain "## [' + rootVersion + ']" heading matching package.json version (' + rootVersion + ')'
);

if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
  const tagName = 'kaola-workflow--v' + rootVersion;
  let tagPresent = false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/' + tagName],
      { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    tagPresent = true;
  } catch (_) {
    tagPresent = false;
  }
  assert(
    tagPresent,
    'Git tag "' + tagName + '" must exist for package.json version (' + rootVersion +
      '). Create it locally with: git tag ' + tagName + ' <release-commit-sha>'
  );

  // issue #193 (Branch A): the root tag owns the entire release surface, including
  // the independently-numbered Codex manifest versions. Fail when a Codex manifest
  // version moved after the tag — that surface must ride a new root version + tag.
  const { detectCodexReleaseSurfaceDrift } = require('./release-surface-drift');
  const surfaceDrift = detectCodexReleaseSurfaceDrift(root, tagName, codexManifests.map(m => m.file));
  assert(
    surfaceDrift.length === 0,
    'Release-surface drift: Codex manifest version(s) changed after tag "' + tagName + '" — ' +
      surfaceDrift.map(d => d.file + ' (tag=' + d.tagged + ', tree=' + d.tree + ')').join('; ') +
      '. The root tag owns the entire release surface (issue #193); a Codex manifest bump must ' +
      'ride a new root version + tag. Cut a new version + tag on the current commit, or revert the bump.'
  );
}

assertIncludes('scripts/simulate-workflow-walkthrough.js', 'Workflow walkthrough simulation passed');

console.log('Workflow contract validation passed');
