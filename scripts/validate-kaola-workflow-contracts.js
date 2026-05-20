#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pluginRoot = 'plugins/kaola-workflow';

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

function parseJson(file) {
  return JSON.parse(read(file));
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

const pluginJson = parseJson(`${pluginRoot}/.codex-plugin/plugin.json`);
assert(pluginJson.name === 'kaola-workflow', 'Codex plugin name must be kaola-workflow');
assert(pluginJson.skills === './skills/', 'Codex plugin must expose ./skills/');
assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'commands'), 'Codex plugin must not declare Claude commands');
assert(JSON.stringify(pluginJson).includes('Kaola-Workflow for Codex'), 'Codex plugin metadata must identify Kaola-Workflow for Codex');

const marketplace = parseJson('.agents/plugins/marketplace.json');
const entry = marketplace.plugins.find(plugin => plugin.name === 'kaola-workflow');
assert(entry && entry.source && entry.source.path === './plugins/kaola-workflow', 'marketplace must point to the local Codex plugin');

const skills = [
  'kaola-workflow-init',
  'kaola-workflow-next',
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-fast'
];

for (const skill of skills) {
  const file = `${pluginRoot}/skills/${skill}/SKILL.md`;
  assert(exists(file), file + ' is missing');
  assertIncludes(file, `name: ${skill}`);
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, 'kaola-workflow/');
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'active folders');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--target-issue');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'watch-pr');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'extract and reassign `delegation_policy:` alongside `phase` and `next_skill`');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'KAOLA_CLAIM="$(node -e');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$KAOLA_PROJECT" --reason git-freshness-block');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Active folder lifecycle');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Do not create or edit CLAUDE.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Required Agent Compliance');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'codex review');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Documentation Docking');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-worktree');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'metadata captured before archive');

// Issue #77: typed-acknowledgement delegation gate — remove ungated fallback language
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'when subagents are available');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs');

// Issue #77: typed-acknowledgement delegation gate — require new status vocabulary in all phase skills + next
const delegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
];
for (const skill of delegationSkills) {
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'subagent-invoked');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-explicit');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-tool-unavailable');
}
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  assertIncludes(
    `${pluginRoot}/skills/${skill}/SKILL.md`,
    'Plain `invoked` is intentional for non-Codex-role workflow gates'
  );
}

// Issue #91: delegation_policy must be checked against phase compliance ledgers.
const repairState = require('./kaola-workflow-repair-state.js');
assert(
  typeof repairState.delegationPolicyCompliance === 'function',
  'kaola-workflow-repair-state.js must export delegationPolicyCompliance'
);

function complianceFixture(rows) {
  return [
    '# Phase Fixture',
    '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    ...rows.map(row => `| ${row[0]} | ${row[1]} | ${row[2] || ''} | ${row[3] || ''} |`)
  ].join('\n');
}

function policyState(policy) {
  return `# Kaola-Workflow State\n\ndelegation_policy: ${policy}\n`;
}

function assertPolicyAllowed(policy, rows, label) {
  const result = repairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = repairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['advisor ideation gate', 'invoked', '.cache/advisor-ideation.md', '']
], 'delegated Codex role row with advisor gate');
assertPolicyAllowed('delegate', [
  ['code-explorer', 'local-fallback-tool-unavailable', '.cache/code-explorer.md', '']
], 'delegate policy with all role rows unavailable and evidenced');
assertPolicyAllowed('local-authorized', [
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'explicit local authorization');
assertPolicyAllowed('tool-unavailable', [
  ['doc-updater', 'N/A', '.cache/doc-updater.md', 'No documentation changes needed.'],
  ['final validation', 'invoked', '.cache/final-validation.md', '']
], 'finalize non-role invoked rows with N/A doc-updater');
assertPolicyBlocked('delegate', [
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'local fallback under delegate policy');
assertPolicyBlocked('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'mixed local fallback under delegate policy');
assertPolicyBlocked('tool-unavailable', [
  ['code-reviewer', 'subagent-invoked', '.cache/code-reviewer.md', '']
], 'subagent row under tool-unavailable policy');

const sharedScripts = [
  'kaola-workflow-active-folders.js',
  'kaola-workflow-claim.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'validate-workflow-contracts.js'
];

for (const script of sharedScripts) {
  const rootScript = `scripts/${script}`;
  const pluginScript = `${pluginRoot}/scripts/${script}`;
  assert(exists(rootScript), rootScript + ' is missing');
  assert(exists(pluginScript), pluginScript + ' is missing');
  assert(read(rootScript) === read(pluginScript), pluginScript + ' must match ' + rootScript);
}

for (const file of [
  `${pluginRoot}/scripts/kaola-workflow-active-folders.js`,
  `${pluginRoot}/scripts/kaola-workflow-claim.js`,
  `${pluginRoot}/scripts/kaola-workflow-classifier.js`,
  `${pluginRoot}/scripts/kaola-workflow-repair-state.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-merge.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-pr.js`,
  `${pluginRoot}/hooks/kaola-workflow-pre-commit.sh`
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'archiveProjectDir');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'if (require.main === module)');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'mainRootFromCoord');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "stdio: ['ignore', 'ignore', 'ignore']");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "'workflow_path: ' + workflowPath");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '/kaola-workflow-fast ');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'removeLegacyStateBlocks');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'kw:claim\\s+(project|sess)=');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-sink-merge.js`, 'readActiveFolders');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-sink-pr.js`, 'patchLockFile');

const simulate = `${pluginRoot}/scripts/simulate-kaola-workflow-walkthrough.js`;
assert(exists(simulate), simulate + ' is missing');
assertIncludes(simulate, 'Kaola-Workflow walkthrough simulation passed');
for (const token of retired) assertNotIncludes(simulate, token);

const pkg = parseJson('package.json');
const testScript = pkg && pkg.scripts && pkg.scripts.test;
assert(typeof testScript === 'string', 'package.json must have a scripts.test string');
for (const edition of ['claude', 'codex', 'gitlab', 'gitea']) {
  assert(testScript.includes(`npm run test:kaola-workflow:${edition}`), `package.json scripts.test must chain test:kaola-workflow:${edition}`);
}
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
assertConcept(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Codex init durable state contract', [
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
assertConcept(`${pluginRoot}/scripts/kaola-workflow-roadmap.js`, 'missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-workflow-roadmap.js`, 'atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  "fs.openSync(tmp, 'wx')",
  'fs.renameSync(tmp, filePath)',
  "fs.openSync(filePath, 'wx')",
  'fs.fsyncSync(fd)'
]);

function extractRedirectBlock(file) {
  const text = read(file);
  const fenceOpen = '```markdown';
  const fenceClose = '\n```';
  let idx = 0;
  while (idx < text.length) {
    const fence = text.indexOf(fenceOpen, idx);
    if (fence === -1) break;
    const blockStart = fence + fenceOpen.length;
    const blockEnd = text.indexOf(fenceClose, blockStart);
    if (blockEnd === -1) break;
    const block = text.slice(blockStart, blockEnd + 1).trim();
    if (block.includes('# AGENTS.md') && block.includes('> **MANDATORY — READ CLAUDE.md')) {
      return block;
    }
    idx = blockEnd + fenceClose.length;
  }
  throw new Error(file + ': no AGENTS.md redirect block found (must contain # AGENTS.md and MANDATORY sentinel)');
}

function extractClaudeTemplate(file) {
  const text = read(file);
  const START = '<!-- KW-CLAUDE-TEMPLATE-START -->';
  const END = '<!-- KW-CLAUDE-TEMPLATE-END -->';
  const startIdx = text.indexOf(START);
  const endIdx = text.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(file + ': missing KW-CLAUDE-TEMPLATE-START/END markers');
  }
  return text.slice(startIdx + START.length, endIdx).trim();
}

// AGENTS.md redirect block must be byte-identical across all four init files
const initFiles = [
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  `${pluginRoot}/skills/kaola-workflow-init/SKILL.md`,
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md'
];
const redirectBlocks = initFiles.map(f => ({ file: f, block: extractRedirectBlock(f) }));
const referenceBlock = redirectBlocks[0].block;
for (const { file, block } of redirectBlocks.slice(1)) {
  assert(block === referenceBlock,
    'AGENTS.md redirect block must be byte-identical in ' + file + ' vs ' + redirectBlocks[0].file);
}

// CLAUDE.md template must be byte-identical within each forge pair
const githubCmdTemplate = extractClaudeTemplate('commands/workflow-init.md');
const githubSkillTemplate = extractClaudeTemplate(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`);
assert(githubCmdTemplate === githubSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitHub forge pair (commands/workflow-init.md vs GitHub SKILL.md)');

const gitlabCmdTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitlab/commands/workflow-init.md');
const gitlabSkillTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md');
assert(gitlabCmdTemplate === gitlabSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitLab forge pair');

console.log('Kaola-Workflow Codex contract validation passed');
