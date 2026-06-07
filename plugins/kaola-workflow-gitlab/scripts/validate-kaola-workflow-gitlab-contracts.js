#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const pluginRoot = 'plugins/kaola-workflow-gitlab';

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
    /\bgh\b/,
    /github\.com/i,
    /api\.github\.com/i,
    /GitHub/,
    /PR URL/,
    /PR number/,
    /pull request/i,
    /\b[a-z]+glab\b/i
  ];
  for (const re of forbidden) assert(!re.test(text), file + ' contains forbidden reference: ' + re);
}

// issue #276: whitespace-normalize multi-word needles for reflow tolerance
function norm(s) { return String(s).replace(/\s+/g, ' '); }

function assertIncludes(file, needle) {
  assert(norm(read(file)).includes(norm(needle)), file + ' must include: ' + needle);
}

function assertNotIncludes(file, needle) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}

function assertBefore(file, earlier, later) {
  const text = norm(read(file));
  const ne = norm(earlier), nl = norm(later);
  const ei = text.indexOf(ne), li = text.indexOf(nl);
  assert(ei !== -1, file + ' must include: ' + earlier);
  assert(li !== -1, file + ' must include: ' + later);
  assert(ei < li, file + ': "' + earlier + '" must appear before "' + later + '"');
}

function assertConcept(file, concept, terms) {
  const content = norm(read(file).toLowerCase());
  const missing = terms.filter(term => !content.includes(norm(term.toLowerCase())));
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
assert(pluginJson.name === 'kaola-workflow-gitlab', 'GitLab Codex plugin name mismatch');
assert(pluginJson.skills === './skills/', 'GitLab Codex plugin must expose ./skills/');

const claudePluginJson = parseJson(pluginRoot + '/.claude-plugin/plugin.json');
assert(String(claudePluginJson.name || '').includes('gitlab'), 'GitLab Claude plugin name must identify GitLab');
assert(claudePluginJson.version === require(path.join(root, 'package.json')).version,
  'GitLab Claude plugin version must match package.json');

const marketplace = parseJson('.agents/plugins/marketplace.json');
assert(marketplace.plugins.some(plugin =>
  plugin.name === 'kaola-workflow-gitlab' &&
  plugin.source &&
  plugin.source.path === './plugins/kaola-workflow-gitlab'
), 'marketplace must include kaola-workflow-gitlab');

const commandFiles = listFiles(pluginRoot + '/commands', file => file.endsWith('.md'));
const skillFiles = listSkillFiles();
const hookFiles = listFiles(pluginRoot + '/hooks');
const agentFiles = listFiles(pluginRoot + '/agents', file => file.endsWith('.toml'));

assert(commandFiles.length === 11, 'expected 11 GitLab command files');
assert(skillFiles.length === 9, 'expected 9 GitLab skill files');
assert(exists(pluginRoot + '/hooks/hooks.json'), 'GitLab hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'GitLab pre-commit hook missing');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'GitLab advisor hook missing');
assert(agentFiles.length === 13, 'expected 13 GitLab agent profiles');
assert(exists(pluginRoot + '/config/agents.toml'), 'GitLab agents config missing');

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
  'kaola-gitlab-forge.js',
  'kaola-gitlab-workflow-active-folders.js',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitlab-workflow-classifier.js',
  'kaola-gitlab-workflow-compact-context.js',
  'kaola-gitlab-workflow-plan-validator.js',
  'kaola-gitlab-workflow-repair-state.js',
  'kaola-gitlab-workflow-roadmap.js',
  'kaola-gitlab-workflow-sink-merge.js',
  'kaola-gitlab-workflow-sink-mr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitlab-workflow-walkthrough.js',
  'simulate-gitlab-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitlab-workflow-task-mirror.js',
  'kaola-gitlab-workflow-codex-compact-resume.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

const installScript = read('install.sh');
const installSupportScripts = [
  'kaola-gitlab-forge.js',
  'kaola-gitlab-workflow-active-folders.js',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitlab-workflow-classifier.js',
  'kaola-gitlab-workflow-compact-context.js',
  'kaola-gitlab-workflow-plan-validator.js',
  'kaola-gitlab-workflow-repair-state.js',
  'kaola-gitlab-workflow-roadmap.js',
  'kaola-gitlab-workflow-sink-merge.js',
  'kaola-gitlab-workflow-sink-mr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitlab-workflow-task-mirror.js',
  'kaola-gitlab-workflow-codex-compact-resume.js'
];
for (const script of installSupportScripts) {
  assert(installScript.includes(script), 'install.sh must install GitLab support script: ' + script);
}

assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('mr|pr)'),
  'GitLab Phase 6 command must dispatch canonical mr sink plus pr compatibility alias'
);
assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"') &&
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('--keep-worktree') &&
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('Use the sink metadata captured before Step 8b'),
  'GitLab Phase 6 command must capture sink metadata before archive and preserve worktree for the final commit'
);
// #277 M3: contractor-dispatch HANDLE lock — mechanical finalization body moved to
// agents/contractor.md; phase6 retains only the Agent(...) dispatch handle.
assert(
  read(pluginRoot + '/commands/kaola-workflow-phase6.md').includes('subagent_type="contractor"'),
  'GitLab Phase 6 command must dispatch the mechanical finalization to the contractor subagent'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('mr|pr)'),
  'GitLab finalize skill must dispatch canonical mr sink plus pr compatibility alias'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--keep-worktree') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('metadata captured before archive'),
  'GitLab finalize skill must capture sink metadata before archive and preserve worktree for the final commit'
);
for (const skill of listFiles(pluginRoot + '/skills', file => file.endsWith('SKILL.md'))) {
  assert(!read(skill).includes("*/kaola-workflow/*/scripts/kaola-gitlab"), skill + ' must use the GitLab Codex plugin cache path');
}

// Issue #77: typed-acknowledgement delegation gate — GitLab skills
const gitlabSkillsBase = `${pluginRoot}/skills`;
const delegationNegativeChecks = [
  [`${gitlabSkillsBase}/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research'],
  [`${gitlabSkillsBase}/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis'],
  [`${gitlabSkillsBase}/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint'],
  [`${gitlabSkillsBase}/kaola-workflow-execute/SKILL.md`, 'when subagents are available'],
  [`${gitlabSkillsBase}/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor'],
  [`${gitlabSkillsBase}/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally'],
  [`${gitlabSkillsBase}/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally'],
  [`${gitlabSkillsBase}/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs'],
];
for (const [file, needle] of delegationNegativeChecks) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}
const gitlabDelegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
  'kaola-workflow-fast',
];
for (const skill of gitlabDelegationSkills) {
  const skillFile = `${gitlabSkillsBase}/${skill}/SKILL.md`;
  assert(read(skillFile).includes('subagent-invoked'), skillFile + ' must include: subagent-invoked');
  assert(read(skillFile).includes('local-fallback-explicit'), skillFile + ' must include: local-fallback-explicit');
  assert(read(skillFile).includes('local-fallback-tool-unavailable'), skillFile + ' must include: local-fallback-tool-unavailable');
}
assert(
  read(`${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`).includes('extract and reassign `delegation_policy:` alongside `phase` and `next_skill`'),
  'GitLab next skill must explicitly resume delegation_policy alongside phase and next_skill'
);
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const gitlabNext210 = `${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`;
assert(!read(gitlabNext210).includes('Ask the user once at startup'), gitlabNext210 + ' must not prompt for a delegation policy at startup');
assert(!read(gitlabNext210).includes('How should delegation be handled'), gitlabNext210 + ' must not present a delegation menu');
assert(read(gitlabNext210).includes('Codex subagent delegation is the default.'), gitlabNext210 + ' must declare delegation the default');
assert(read(gitlabNext210).includes('The default `delegation_policy` is `delegate`'), gitlabNext210 + ' must default delegation_policy to delegate');
assert(read(gitlabNext210).includes('KAOLA_DELEGATION_POLICY=delegate'), gitlabNext210 + ' must set KAOLA_DELEGATION_POLICY=delegate');
assert(read(gitlabNext210).includes('.codex/agents/kaola-workflow/'), gitlabNext210 + ' must name the role-profile detection path');
assert(read(gitlabNext210).includes('record `local-fallback-tool-unavailable` with a non-empty Evidence value'), gitlabNext210 + ' must record auto-detected tool-unavailable as evidence');
assert(read(gitlabNext210).includes('only when the user explicitly'), gitlabNext210 + ' must gate local-authorized behind explicit user request');
assert(read(gitlabNext210).includes('default `delegation_policy` to `delegate` without prompting'), gitlabNext210 + ' must default delegate on resume without prompting');
// Issue #174: GitLab next skill parity gaps
const gitlabNextSkill = `${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`;
assertNotIncludes(gitlabNextSkill, 'PICK_NEXT_PROJECT');
assertIncludes(gitlabNextSkill, 'KAOLA_VERDICT=');
assertIncludes(gitlabNextSkill, 'KAOLA_REASONING=');
assertIncludes(gitlabNextSkill, 'target_unverified');
assertIncludes(gitlabNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
assertIncludes(gitlabNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
assertBefore(gitlabNextSkill, '### Co-active Folders Advisory', '## Routing');
// Issue #190: M1 — Codex fast-path routing parity (RED guard)
assertIncludes(gitlabNextSkill, 'Startup Step 0a-1');
assertIncludes(gitlabNextSkill, 'Branch: {branch from Sink block');
assertIncludes(gitlabNextSkill, 'Workflow path: {fast|full');
assertIncludes(gitlabNextSkill, 'Parallel decision: {green|yellow|red');
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  const skillFile = `${gitlabSkillsBase}/${skill}/SKILL.md`;
  assert(
    read(skillFile).includes('Plain `invoked` is intentional for non-Codex-role workflow gates'),
    skillFile + ' must explain intentional non-Codex-role invoked rows'
  );
}

// Issue #91: delegation_policy must be checked against GitLab phase compliance ledgers.
const gitlabRepairState = require('./kaola-gitlab-workflow-repair-state.js');
assert(
  typeof gitlabRepairState.delegationPolicyCompliance === 'function',
  'kaola-gitlab-workflow-repair-state.js must export delegationPolicyCompliance'
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
  const result = gitlabRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = gitlabRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['advisor ideation gate', 'invoked', '.cache/advisor-ideation.md', '']
], 'delegated GitLab Codex role row with advisor gate');
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

const gitlabInitSkill = `${gitlabSkillsBase}/kaola-workflow-init/SKILL.md`;
assertNotIncludes(gitlabInitSkill, 'Do not create or edit CLAUDE.md');
assertIncludes(gitlabInitSkill, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes(gitlabInitSkill, 'plugin_root="plugins/kaola-workflow-gitlab"');
assert(
  !/plugin_root="plugins\/kaola-workflow"(?!-)/.test(read(gitlabInitSkill)),
  gitlabInitSkill + ' must not contain bare plugin_root="plugins/kaola-workflow" (without -gitlab suffix)'
);
assertIncludes(gitlabInitSkill, "*/kaola-workflow-gitlab/*/scripts/install-codex-agent-profiles.js");
assert(
  !/\*\/kaola-workflow\/\*\/scripts\/install-codex-agent-profiles\.js/.test(read(gitlabInitSkill)),
  gitlabInitSkill + ' must not contain bare */kaola-workflow/* find path (without -gitlab suffix)'
);
assertConcept(gitlabInitSkill, 'GitLab init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'GitLab missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'GitLab atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  'updated: issue-'
]);
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, "sub === 'validate-remote'");
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'function validateRemote');
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'cmdValidateRemote');
assertIncludes(`${pluginRoot}/scripts/test-gitlab-workflow-scripts.js`, 'testGitLabRoadmapValidateRemote');

// GitLab forge pair CLAUDE.md template must be byte-identical
const gitlabCmdTemplate = extractClaudeTemplate(`${pluginRoot}/commands/workflow-init.md`);
const gitlabSkillTemplate = extractClaudeTemplate(gitlabInitSkill);
assert(gitlabCmdTemplate === gitlabSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitLab forge pair');

for (const file of listFiles(pluginRoot + '/scripts', file =>
  file.endsWith('.js') && !file.endsWith('validate-kaola-workflow-gitlab-contracts.js')
)) {
  const text = read(file);
  assert(!/\bgh\b/.test(text), file + ' must not execute or mention gh');
  assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
}

const pkg = parseJson('package.json');
assert(!String(pkg.scripts['test:kaola-workflow:gitlab']).includes('pending #58'), 'GitLab test script must not be placeholder');

assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'watch-mr');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'bootstrap');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'if (OFFLINE) { output({ watched: 0, offline: true }); return; }');

assertConcept(pluginRoot + '/scripts/test-gitlab-workflow-scripts.js', 'GitLab stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);

// issue #198: fast-path widening — eligibility/hatch/review contract (GitLab parity)
const fastCmd198 = pluginRoot + '/commands/kaola-workflow-fast.md';
const fastSkill198 = pluginRoot + '/skills/kaola-workflow-fast/SKILL.md';
for (const fastFile198 of [fastCmd198, fastSkill198]) {
  assertIncludes(fastFile198, 'mechanical');
  assertIncludes(fastFile198, '≤ 5');
  assertIncludes(fastFile198, 'design choice');
  assertIncludes(fastFile198, 'approach_ambiguity');
  assertIncludes(fastFile198, 'declared write set');
  assertIncludes(fastFile198, 'absolute backstop of 6');
  assertIncludes(fastFile198, '`code-reviewer` is mandatory');
}
assertNotIncludes(fastCmd198, 'two closely related files');
assertNotIncludes(fastCmd198, '≤ 2');
assertNotIncludes(fastSkill198, '(≤ 2)');
assertNotIncludes(fastSkill198, '> 2 files');
// issue #207: fast-overlap parity (GitLab) — Scope declares a `- Write Set:` line
// and the classifier reads that fast-summary.md Scope section.
for (const fastFile207 of [fastCmd198, fastSkill198]) assertIncludes(fastFile207, '- Write Set:');
const classifier207 = pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js';
assertIncludes(classifier207, 'fast-summary.md');
assertIncludes(classifier207, 'sectionBody(');
assertIncludes(classifier207, "'Scope'");
const nextCmd198 = pluginRoot + '/commands/workflow-next.md';
const nextSkill198 = pluginRoot + '/skills/kaola-workflow-next/SKILL.md';
for (const nextFile198 of [nextCmd198, nextSkill198]) {
  assertIncludes(nextFile198, 'mechanical');
  assertIncludes(nextFile198, '≤ 5');
  assertIncludes(nextFile198, 'design choice');
  assertNotIncludes(nextFile198, '≤ 2 closely related files');
}

// issue #203: Select-Project active-folder definition must list fast-summary.md
// (follow-up to #201). Assertion A is the Select-Project drift-guard; Assertion B
// is a regression lock for the #201 reconstruction ladder (already present).
const nextCmd203 = pluginRoot + '/commands/workflow-next.md';
assertIncludes(nextCmd203, '`fast-summary.md` file, or a `workflow-state.md`');
assertIncludes(nextCmd203, 'fast-summary.md exists -> /kaola-workflow-fast');

// issue #222: fast-path mid-flight escalation routing fix — GitLab parity
for (const fastFile222 of [fastCmd198, fastSkill198]) {
  assertIncludes(fastFile222, 'workflow_path: full');
  assertIncludes(fastFile222, 'next_command: /kaola-workflow-phase1 {project}');
  assertIncludes(fastFile222, 'next_skill: kaola-workflow-research {project}');
  assertIncludes(fastFile222, 'status `ESCALATED` → escalation already committed');
}
assertBefore(nextCmd203, 'fast-summary.md status ESCALATED -> /kaola-workflow-phase1', 'fast-summary.md exists -> /kaola-workflow-fast');
assertIncludes(nextSkill198, 'fast-summary.md status ESCALATED -> kaola-workflow-research');

// issue #227: adaptive-path contract (GitLab fork command prose + renamed scripts).
assert(exists(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js'), 'GitLab adaptive plan validator missing');
assert(exists(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js'), 'GitLab adaptive schema module missing');
assertConcept(pluginRoot + '/commands/workflow-next.md', 'adaptive path selection', [
  'KAOLA_ENABLE_ADAPTIVE', 'adaptive', 'fast|full|adaptive', 'flag-only', 'typed refusal'
]);
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'workflow-plan.md exists -> /kaola-workflow-plan-run');
// v5.1.0: the adaptive front-end ROUTING must stay enforced — the router skips its inline claim and
// routes fresh adaptive to the workflow-planner front end. The router surface was unlocked before,
// which let this forge edition ship green with the front end unreachable (inline-claim regression).
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'kaola-workflow-adapt $KAOLA_TARGET_ISSUE');
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'Skip this entire step when `KAOLA_PATH=adaptive`');
// #277 M3: FANOUT_CAP and post-dominate relocated from commands/kaola-workflow-adapt.md
// (dispatch-handle-only) to agents/workflow-planner.md (sole home of authoring procedure).
// agents/workflow-planner.md is a shared repo-root file; use a root-relative path (no pluginRoot).
assertConcept('agents/workflow-planner.md', 'adaptive authoring', [
  'workflow-plan.md', '## Nodes', 'post-dominate', 'finalize', 'FANOUT_CAP', 'plan_hash', 'typed refusal'
]);
// v5.1.0: the workflow-planner dispatch must stay ENFORCED (Agent block + model badge), not inline prose.
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'subagent_type="workflow-planner"');
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'model="{WORKFLOW_PLANNER_MODEL}"');
// v5.1.0: the refusal consumer branch must stay FAIL-CLOSED (any non-acquired/owned verdict = refusal).
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'NOT `acquired` or `owned`');
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'do not blind-read');
assertConcept(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'adaptive execution + governance', [
  '## Node Ledger', 'plan_hash', 'post-dominate', 'auto-run', 'provisional', 'halt for consent',
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput', 'test_thrash'
]);
assertIncludes(pluginRoot + '/commands/kaola-workflow-phase6.md', 'workflow_path: adaptive');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'disjointWriteSets');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'readPlanNodes');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'workflow_path_refused');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'routeAdaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'enable_adaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js', 'enable_adaptive');

console.log('Kaola-Workflow GitLab contract validation passed');
