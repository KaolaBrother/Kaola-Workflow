#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const pluginRoot = 'plugins/kaola-workflow-gitea';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function listFiles(relativeDir, predicate) {
  const full = path.join(root, relativeDir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(relativeDir, entry.name))
    .filter(file => !predicate || predicate(file));
}

function listSkillFiles() {
  const dir = path.join(root, pluginRoot, 'skills');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(pluginRoot, 'skills', entry.name, 'SKILL.md'))
    .filter(file => exists(file));
}

function assertNoForbidden(file) {
  const text = read(file);
  const forbidden = [
    /\$HOME\/\.claude\/kaola-workflow\/scripts/,
    /(^|[^A-Za-z0-9_-])\.\/scripts([^A-Za-z0-9_-]|$)/,
    /plugins\/kaola-workflow\/scripts/,
    /\bglab\b/,
    /gitlab\.com/i,
    /api\.gitlab\.com/i,
    /GitLab/,
    /MR URL/,
    /MR number/,
    /merge request/i
  ];
  for (const re of forbidden) assert(!re.test(text), file + ' contains forbidden reference: ' + re);
}

function assertIncludes(file, needle) {
  assert(read(file).includes(needle), file + ' must include: ' + needle);
}

function assertNotIncludes(file, needle) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}

function assertBefore(file, earlier, later) {
  const text = read(file);
  const ei = text.indexOf(earlier), li = text.indexOf(later);
  assert(ei !== -1, file + ' must include: ' + earlier);
  assert(li !== -1, file + ' must include: ' + later);
  assert(ei < li, file + ': "' + earlier + '" must appear before "' + later + '"');
}

function assertConcept(file, concept, terms) {
  const content = read(file).toLowerCase();
  const missing = terms.filter(term => !content.includes(term.toLowerCase()));
  assert(missing.length === 0,
    file + ' must document ' + concept + '; missing: ' + missing.join(', '));
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

const pluginJson = parseJson(pluginRoot + '/.codex-plugin/plugin.json');
assert(pluginJson.name === 'kaola-workflow-gitea', 'Gitea Codex plugin name mismatch');
assert(pluginJson.skills === './skills/', 'Gitea Codex plugin must expose ./skills/');

const claudePluginJson = parseJson(pluginRoot + '/.claude-plugin/plugin.json');
assert(String(claudePluginJson.name || '').includes('gitea'), 'Gitea Claude plugin name must identify Gitea');
assert(claudePluginJson.version === require(path.join(root, 'package.json')).version,
  'Gitea Claude plugin version must match package.json');

const marketplace = parseJson('.agents/plugins/marketplace.json');
assert(marketplace.plugins.some(plugin =>
  plugin.name === 'kaola-workflow-gitea' &&
  plugin.source &&
  plugin.source.path === './plugins/kaola-workflow-gitea'
), 'marketplace must include kaola-workflow-gitea');

const commandFiles = listFiles(pluginRoot + '/commands', file => file.endsWith('.md'));
const skillFiles = listSkillFiles();
const hookFiles = listFiles(pluginRoot + '/hooks');
const agentFiles = listFiles(pluginRoot + '/agents', file => file.endsWith('.toml'));

assert(commandFiles.length === 9, 'expected 9 Gitea command files, got ' + commandFiles.length);
assert(skillFiles.length === 9, 'expected 9 Gitea skill files, got ' + skillFiles.length);
assert(exists(pluginRoot + '/hooks/hooks.json'), 'Gitea hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'Gitea pre-commit hook missing');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'Gitea advisor hook missing');
assert(agentFiles.length === 9, 'expected 9 Gitea agent profiles, got ' + agentFiles.length);
assert(exists(pluginRoot + '/config/agents.toml'), 'Gitea agents config missing');

for (const file of [...commandFiles, ...skillFiles, ...hookFiles, ...agentFiles, pluginRoot + '/config/agents.toml']) {
  assertNoForbidden(file);
}

for (const file of commandFiles.filter(file => path.basename(file).startsWith('kaola-workflow-'))) {
  assertIncludes(file, '## Agent Model Badge');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  assertNotIncludes(file, 'Agent Model Badge Contract');
  assertNotIncludes(file, 'kaola_agent_model');
}

const scriptFiles = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitea-workflow-walkthrough.js',
  'simulate-gitea-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

const installScript = read('install.sh');
const installSupportScripts = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-resolve-agent-model.js'
];
for (const script of installSupportScripts) {
  assert(installScript.includes(script), 'install.sh must install Gitea support script: ' + script);
}

const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');

assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('mr|pr)'),
  'Gitea Phase 6 command must dispatch canonical pr sink (mr|pr) case)'
);
assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"') &&
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('--keep-worktree') &&
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('Use the sink metadata captured before Step 8b'),
  'Gitea Phase 6 command must capture sink metadata before archive and preserve worktree for the final commit'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('mr|pr)'),
  'Gitea finalize skill must dispatch canonical pr sink (mr|pr) case)'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--keep-worktree') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('metadata captured before archive'),
  'Gitea finalize skill must capture sink metadata before archive and preserve worktree for the final commit'
);
for (const skill of listFiles(pluginRoot + '/skills', file => file.endsWith('SKILL.md'))) {
  assert(!read(skill).includes('*/kaola-workflow/*/scripts/kaola-gitea'), skill + ' must use the Gitea Codex plugin cache path');
}

// Delegation policy checks
const giteaSkillsBase = `${pluginRoot}/skills`;
const delegationNegativeChecks = [
  [`${giteaSkillsBase}/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research'],
  [`${giteaSkillsBase}/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis'],
  [`${giteaSkillsBase}/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint'],
  [`${giteaSkillsBase}/kaola-workflow-execute/SKILL.md`, 'when subagents are available'],
  [`${giteaSkillsBase}/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor'],
  [`${giteaSkillsBase}/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally'],
  [`${giteaSkillsBase}/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally'],
  [`${giteaSkillsBase}/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs'],
];
for (const [file, needle] of delegationNegativeChecks) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}
const giteaDelegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
  'kaola-workflow-fast',
];
for (const skill of giteaDelegationSkills) {
  const skillFile = `${giteaSkillsBase}/${skill}/SKILL.md`;
  assert(read(skillFile).includes('subagent-invoked'), skillFile + ' must include: subagent-invoked');
  assert(read(skillFile).includes('local-fallback-explicit'), skillFile + ' must include: local-fallback-explicit');
  assert(read(skillFile).includes('local-fallback-tool-unavailable'), skillFile + ' must include: local-fallback-tool-unavailable');
}
assert(
  read(`${giteaSkillsBase}/kaola-workflow-next/SKILL.md`).includes('extract and reassign `delegation_policy:` alongside `phase` and `next_skill`'),
  'Gitea next skill must explicitly resume delegation_policy alongside phase and next_skill'
);
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const giteaNext210 = `${giteaSkillsBase}/kaola-workflow-next/SKILL.md`;
assert(!read(giteaNext210).includes('Ask the user once at startup'), giteaNext210 + ' must not prompt for a delegation policy at startup');
assert(!read(giteaNext210).includes('How should delegation be handled'), giteaNext210 + ' must not present a delegation menu');
assert(read(giteaNext210).includes('Codex subagent delegation is the default.'), giteaNext210 + ' must declare delegation the default');
assert(read(giteaNext210).includes('The default `delegation_policy` is `delegate`'), giteaNext210 + ' must default delegation_policy to delegate');
assert(read(giteaNext210).includes('KAOLA_DELEGATION_POLICY=delegate'), giteaNext210 + ' must set KAOLA_DELEGATION_POLICY=delegate');
assert(read(giteaNext210).includes('.codex/agents/kaola-workflow/'), giteaNext210 + ' must name the role-profile detection path');
assert(read(giteaNext210).includes('record `local-fallback-tool-unavailable` with a non-empty Evidence value'), giteaNext210 + ' must record auto-detected tool-unavailable as evidence');
assert(read(giteaNext210).includes('only when the user explicitly'), giteaNext210 + ' must gate local-authorized behind explicit user request');
assert(read(giteaNext210).includes('default `delegation_policy` to `delegate` without prompting'), giteaNext210 + ' must default delegate on resume without prompting');
// Issue #174: Gitea next skill parity gaps
const giteaNextSkill = `${giteaSkillsBase}/kaola-workflow-next/SKILL.md`;
assertNotIncludes(giteaNextSkill, 'PICK_NEXT_PROJECT');
assertIncludes(giteaNextSkill, 'KAOLA_VERDICT=');
assertIncludes(giteaNextSkill, 'KAOLA_REASONING=');
assertIncludes(giteaNextSkill, 'target_unverified');
assertIncludes(giteaNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
assertIncludes(giteaNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
assertBefore(giteaNextSkill, '### Co-active Folders Advisory', '## Routing');
// Issue #190: M1 — Codex fast-path routing parity (RED guard)
assertIncludes(giteaNextSkill, 'Startup Step 0a-1');
assertIncludes(giteaNextSkill, 'Branch: {branch from Sink block');
assertIncludes(giteaNextSkill, 'Workflow path: {fast|full');
assertIncludes(giteaNextSkill, 'Parallel decision: {green|yellow|red');
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  const skillFile = `${giteaSkillsBase}/${skill}/SKILL.md`;
  assert(
    read(skillFile).includes('Plain `invoked` is intentional for non-Codex-role workflow gates'),
    skillFile + ' must explain intentional non-Codex-role invoked rows'
  );
}

// delegationPolicyCompliance must be exported from repair-state
const giteaRepairState = require('./kaola-gitea-workflow-repair-state.js');
assert(
  typeof giteaRepairState.delegationPolicyCompliance === 'function',
  'kaola-gitea-workflow-repair-state.js must export delegationPolicyCompliance'
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
  const result = giteaRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = giteaRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['advisor ideation gate', 'invoked', '.cache/advisor-ideation.md', '']
], 'delegated Gitea Codex role row with advisor gate');
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
// Issue #210: contract tests for the no-prompt default path and the explicit local fallback path.
assertPolicyAllowed('delegate', [
  ['code-explorer', 'local-fallback-tool-unavailable', '.codex/agents/kaola-workflow/ absent', '']
], 'issue #210 no-prompt default: delegate auto-detects evidenced tool-unavailable (regression lock)');
assertPolicyAllowed('local-authorized', [
  ['code-explorer', 'local-fallback-explicit', 'user disabled delegation', '']
], 'issue #210 explicit local fallback: local-authorized only on explicit user request');

const giteaInitSkill = `${giteaSkillsBase}/kaola-workflow-init/SKILL.md`;
assertNotIncludes(giteaInitSkill, 'Do not create or edit CLAUDE.md');
assertIncludes(giteaInitSkill, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes(giteaInitSkill, 'plugin_root="plugins/kaola-workflow-gitea"');
assert(
  !/plugin_root="plugins\/kaola-workflow"(?!-)/.test(read(giteaInitSkill)),
  giteaInitSkill + ' must not contain bare plugin_root="plugins/kaola-workflow" (without -gitea suffix)'
);
assertIncludes(giteaInitSkill, "*/kaola-workflow-gitea/*/scripts/install-codex-agent-profiles.js");
assert(
  !/\*\/kaola-workflow\/\*\/scripts\/install-codex-agent-profiles\.js/.test(read(giteaInitSkill)),
  giteaInitSkill + ' must not contain bare */kaola-workflow/* find path (without -gitea suffix)'
);
assertConcept(giteaInitSkill, 'Gitea init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'Gitea missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'Gitea atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  'updated: issue-'
]);
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, "sub === 'validate-remote'");
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'function validateRemote');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'cmdValidateRemote');
assertIncludes(`${pluginRoot}/scripts/test-gitea-workflow-scripts.js`, 'testGiteaRoadmapValidateRemote');

// Gitea forge pair CLAUDE.md template must be byte-identical
const giteaCmdTemplate = extractClaudeTemplate(`${pluginRoot}/commands/workflow-init.md`);
const giteaSkillTemplate = extractClaudeTemplate(giteaInitSkill);
assert(giteaCmdTemplate === giteaSkillTemplate,
  'CLAUDE.md template must be byte-identical within Gitea forge pair');

for (const file of listFiles(pluginRoot + '/scripts', file =>
  file.endsWith('.js') && !file.endsWith('validate-kaola-workflow-gitea-contracts.js')
)) {
  const text = read(file);
  assert(!/\bglab\b/.test(text), file + ' must not execute or mention glab');
  assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
}

assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'bootstrap');

assertConcept(pluginRoot + '/scripts/test-gitea-workflow-scripts.js', 'Gitea stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);

// issue #198: fast-path widening — eligibility/hatch/review contract parity
const giteaFastCmd198 = pluginRoot + '/commands/kaola-workflow-fast.md';
const giteaFastSkill198 = pluginRoot + '/skills/kaola-workflow-fast/SKILL.md';
for (const fastFile of [giteaFastCmd198, giteaFastSkill198]) {
  assertIncludes(fastFile, 'mechanical');
  assertIncludes(fastFile, '≤ 5');
  assertIncludes(fastFile, 'design choice');
  assertIncludes(fastFile, 'approach_ambiguity');
  assertIncludes(fastFile, 'declared write set');
  assertIncludes(fastFile, 'absolute backstop of 6');
  assertIncludes(fastFile, '`code-reviewer` is mandatory');
}
assertNotIncludes(giteaFastCmd198, 'two closely related files');
assertNotIncludes(giteaFastCmd198, '≤ 2');
assertNotIncludes(giteaFastSkill198, '(≤ 2)');
assertNotIncludes(giteaFastSkill198, '> 2 files');
// issue #207: fast-overlap parity (Gitea) — Scope declares a `- Write Set:` line
// and the classifier reads that fast-summary.md Scope section.
for (const fastFile207 of [giteaFastCmd198, giteaFastSkill198]) assertIncludes(fastFile207, '- Write Set:');
const giteaClassifier207 = pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js';
assertIncludes(giteaClassifier207, 'fast-summary.md');
assertIncludes(giteaClassifier207, 'sectionBody(');
assertIncludes(giteaClassifier207, "'Scope'");
const giteaNextCmd198 = pluginRoot + '/commands/workflow-next.md';
const giteaNextSkill198 = pluginRoot + '/skills/kaola-workflow-next/SKILL.md';
for (const nextFile of [giteaNextCmd198, giteaNextSkill198]) {
  assertIncludes(nextFile, 'mechanical');
  assertIncludes(nextFile, '≤ 5');
  assertIncludes(nextFile, 'design choice');
  assertNotIncludes(nextFile, '≤ 2 closely related files');
}

// #203: Select Project active-folder definition must include fast-summary.md (follow-up to #201).
const giteaNextCmd203 = pluginRoot + '/commands/workflow-next.md';
// Assertion A (Select Project drift-guard): the Startup Step 3 active-folder
// list must include fast-summary.md. Use the Select-Project-specific substring
// — a bare "fast-summary" already appears in the #201 reconstruction ladder.
assertIncludes(giteaNextCmd203, '`fast-summary.md` file, or a `workflow-state.md`');
// Assertion B (ladder drift-guard, regression lock for #201): keep the
// reconstruction-ladder fast-path entry present.
assertIncludes(giteaNextCmd203, 'fast-summary.md exists -> /kaola-workflow-fast');

console.log('Kaola-Workflow Gitea contract validation passed');
