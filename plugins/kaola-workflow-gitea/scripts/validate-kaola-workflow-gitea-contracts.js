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

// issue #341: standalone, count-independent forbidden-token check. A forge-touching
// node runs this on just its changed files so a forge-CLI leak is caught at the node
// that wrote it, without the full contract chain (whose agent/command counts may be
// transiently stale mid-run). Accepts repo-root-relative or absolute paths. Unknown
// flags fail closed (exit 2) so a typo can never silently run the full chain instead.
const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  if (cliArgs[0] !== '--forbidden-only') {
    console.error('unknown argument: ' + cliArgs[0]);
    console.error('usage: node validate-kaola-workflow-gitea-contracts.js [--forbidden-only <file> ...]');
    process.exit(2);
  }
  const forbiddenOnlyFiles = cliArgs.slice(1);
  if (forbiddenOnlyFiles.length === 0) {
    console.error('usage: node validate-kaola-workflow-gitea-contracts.js --forbidden-only <file> [<file> ...]');
    process.exit(2);
  }
  for (const file of forbiddenOnlyFiles) {
    const rel = path.isAbsolute(file) ? path.relative(root, file) : file;
    assert(exists(rel), '--forbidden-only: file not found: ' + file);
    assertNoForbidden(rel);
  }
  console.log('Kaola-Workflow Gitea forbidden-only check passed (' + forbiddenOnlyFiles.length + ' file(s))');
  process.exit(0);
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

// issue #341: the forbidden-token scan runs BEFORE any count assertion, so a forge
// leak is never hidden behind a stale agent/command/skill count (the #328 latent
// defect: a `gh` leak in issue-scout.toml was masked by `agentFiles.length === 13`
// short-circuiting the chain until an unrelated count bump exposed it).
for (const file of [
  ...commandFiles, ...skillFiles, ...hookFiles, ...agentFiles,
  ...(exists(pluginRoot + '/config/agents.toml') ? [pluginRoot + '/config/agents.toml'] : [])
]) {
  assertNoForbidden(file);
}

assert(commandFiles.length === 11, 'expected 11 Gitea command files, got ' + commandFiles.length);
// #400: 9 base skills + kaola-workflow-adapt + kaola-workflow-plan-run (adaptive SKILL pack) = 11.
assert(skillFiles.length === 11, 'expected 11 Gitea skill files, got ' + skillFiles.length);
assert(exists(pluginRoot + '/hooks/hooks.json'), 'Gitea hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'Gitea pre-commit hook missing');
assert(!hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'Gitea phantom-advisor hook must be removed (#372)');
// #376: the write-lane containment hook ships in every edition (byte-identical, forge-neutral).
assert(hookFiles.some(file => file.endsWith('kaola-workflow-write-lane.sh')), 'Gitea write-lane hook missing');
// #405: 14 base roles + 6 generated <role>-max xhigh effort variants (OPUS_ELIGIBLE_ROLES) = 20.
assert(agentFiles.length === 20, 'expected 20 Gitea agent profiles (14 base + 6 <role>-max #405), got ' + agentFiles.length);
assert(exists(pluginRoot + '/config/agents.toml'), 'Gitea agents config missing');

// #340 derived parity guard (enumeration-free): the dispatch config/agents.toml must register
// exactly the agent profiles present in agents/ — both directions. A profile copied without its
// [agents.<name>] table is undispatchable (the #328 issue-scout miss); a table without its profile
// dangles. Derives both sides (no hardcoded names/counts), so a future agent addition never edits it.
{
  const configNames = new Set();
  const reCfg = /^\[agents\.([a-z0-9-]+)\]/gm;
  let cm;
  while ((cm = reCfg.exec(read(pluginRoot + '/config/agents.toml'))) !== null) configNames.add(cm[1]);
  const dirNames = new Set(agentFiles.map(f => path.basename(f, '.toml')));
  const missingTables = [...dirNames].filter(n => !configNames.has(n)).sort();
  const danglingTables = [...configNames].filter(n => !dirNames.has(n)).sort();
  assert(missingTables.length === 0 && danglingTables.length === 0,
    'config/agents.toml must register exactly the agent profiles in agents/ (#340)' +
    (missingTables.length ? ' — profiles missing a [agents.*] table: ' + missingTables.join(', ') : '') +
    (danglingTables.length ? ' — [agents.*] tables with no profile: ' + danglingTables.join(', ') : ''));
}

// #405 (#382 deferred half): the <role>-max xhigh effort-variant derivation guard (gitea port). Each
// committed agents/<role>-max.toml MUST byte-equal variantProfileText(base, role) for an
// OPUS_ELIGIBLE_ROLE, every eligible role must have its -max file + [agents.<role>-max] table, and no
// -max file may exist for a non-eligible role. Membership lives in the ×4 schema anchor.
{
  const { OPUS_ELIGIBLE_ROLES, variantProfileText } = require('./kaola-workflow-adaptive-schema.js');
  const configText = read(pluginRoot + '/config/agents.toml');
  for (const role of OPUS_ELIGIBLE_ROLES) {
    const baseFile = pluginRoot + '/agents/' + role + '.toml';
    const variantFile = pluginRoot + '/agents/' + role + '-max.toml';
    assert(exists(baseFile), '#405 gt: OPUS_ELIGIBLE_ROLE base profile missing: ' + baseFile);
    assert(exists(variantFile), '#405 gt: missing generated effort variant ' + variantFile + ' (--generate-variants)');
    assert(read(variantFile) === variantProfileText(read(baseFile), role),
      '#405 gt: ' + variantFile + ' is not the deterministic variantProfileText(' + role + ') derivation');
    assert(new RegExp('^\\[agents\\.' + role + '-max\\]', 'm').test(configText),
      '#405 gt: config/agents.toml missing [agents.' + role + '-max] table');
  }
  const strayMax = agentFiles
    .map(f => path.basename(f, '.toml'))
    .filter(n => n.endsWith('-max'))
    .map(n => n.slice(0, -'-max'.length))
    .filter(r => !OPUS_ELIGIBLE_ROLES.includes(r));
  assert(strayMax.length === 0, '#405 gt: -max profile(s) for non-eligible roles: ' + strayMax.join(', '));
}

for (const file of commandFiles.filter(file => path.basename(file).startsWith('kaola-workflow-'))) {
  assertIncludes(file, '## Agent Model Badge');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  assertNotIncludes(file, 'Agent Model Badge Contract');
  assertNotIncludes(file, 'kaola_agent_model');
}

// #372: the advisor-gate vocabulary is retired — ban it across command + skill files so the
// removed mandates cannot silently return (concat-built; no literal in this source).
const advisorGateTokens372 = [
  ['Advisor', 'Gate'].join(' '),
  ['advisor', 'ideation', 'gate'].join(' '),
  ['advisor', 'plan', 'gate'].join(' '),
  ['advisor', 'critical', 'gate'].join(' '),
  ['closure', 'advisor', 'gate'].join(' '),
];
for (const file of [...commandFiles, ...skillFiles]) {
  for (const token of advisorGateTokens372) assertNotIncludes(file, token);
}

const scriptFiles = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-plan-validator.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitea-workflow-walkthrough.js',
  'simulate-gitea-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-task-mirror.js',
  'kaola-gitea-workflow-codex-compact-resume.js',
  'kaola-gitea-workflow-parallel-batch.js',
  'kaola-gitea-workflow-run-chains.js',
  'kaola-gitea-workflow-gap-sweep.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

// #407: install.sh's per-forge SUPPORT_SCRIPT_NAMES is single-sourced from the install manifest
// (no literal arrays remain in install.sh). Assert the manifest emits each required Gitea support
// script for the gitea forge — same intent (this script ships in a manual install), correct source.
const giteaInstallManifest = require(path.join(root, 'scripts', 'kaola-workflow-install-manifest.js'));
const giteaManifestScripts = giteaInstallManifest.supportScripts('gitea');
const installSupportScripts = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-plan-validator.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-task-mirror.js',
  'kaola-gitea-workflow-codex-compact-resume.js',
  'kaola-gitea-workflow-parallel-batch.js',
  'kaola-gitea-workflow-run-chains.js',
  'kaola-gitea-workflow-gap-sweep.js'
];
for (const script of installSupportScripts) {
  assert(giteaManifestScripts.includes(script), 'install manifest must emit Gitea support script: ' + script);
}

const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');

// issue #283: kaola-workflow-phase6.md was removed; kaola-workflow-finalize.md is the terminal routine.
assert(!exists(pluginRoot + '/commands/kaola-workflow-phase6.md'),
  'Gitea legacy kaola-workflow-phase6.md must be absent (hard-removed by #283)');
assert(exists(pluginRoot + '/commands/kaola-workflow-finalize.md'),
  'Gitea kaola-workflow-finalize.md must be present');
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('mr|pr)'),
  'Gitea Finalization command must dispatch canonical pr sink (mr|pr) case)'
);
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('--keep-worktree') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('metadata captured before'),
  'Gitea Finalization command must capture sink metadata before archive and preserve worktree for the final commit'
);
// #277 M3: contractor-dispatch HANDLE lock — mechanical finalization body moved to
// agents/contractor.md; finalize retains only the Agent(...) dispatch handle.
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('subagent_type="contractor"'),
  'Gitea Finalization command must dispatch the mechanical finalization to the contractor subagent'
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
// #336: keep-open partial-close sink lane — command + skill must carry the durable field, the
// sink-merge flag, and the merge-sink-only refusal prose (the exit-3 in-arm BLOCKED guard's only
// mechanical enforcement).
for (const f of ['/commands/kaola-workflow-finalize.md', '/skills/kaola-workflow-finalize/SKILL.md']) {
  assert(
    read(pluginRoot + f).includes('issue_action') &&
    read(pluginRoot + f).includes('--keep-issue-open') &&
    read(pluginRoot + f).includes('merge-sink-only'),
    'Gitea ' + f + ' must document the keep-open partial-close lane (issue_action, --keep-issue-open, merge-sink-only)'
  );
}
// #345: the adaptive four-gate merge barrier in the Finalization COMMAND must resolve the
// validator via the kaola_script resolver — a bare `node scripts/…` path is MODULE_NOT_FOUND
// in a consumer plugin install (no ./scripts dir), turning the only blocking pre-merge
// enforcement into a false BLOCK. (The finalize SKILL already used a find-fallback.)
{
  const finalizeCmd = read(pluginRoot + '/commands/kaola-workflow-finalize.md');
  assert(
    finalizeCmd.includes('VALIDATOR="$(kaola_script kaola-gitea-workflow-plan-validator.js)"') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --resume-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --gate-verify') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --barrier-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --verdict-check') &&
    !finalizeCmd.includes('node scripts/kaola-gitea-workflow-plan-validator.js "$PLAN" --resume-check'),
    'Gitea Finalization command must resolve the four-gate barrier validator via kaola_script (no bare scripts/ path) — #345'
  );
}
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
  ['documentation docking', 'invoked', '.cache/doc-docking.md', '']
], 'delegated Gitea Codex role row with a non-role workflow gate');
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
// #389 (#353/#354 completion): the plan-validator --freeze writer (plan_hash stamp + mid-run repair
// re-freeze carrying the ## Node Ledger) and the adaptive-handoff workflow-state Planning Evidence
// writer route through the crash-safe atomic replace.
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-plan-validator.js`, 'writeFileAtomicReplace(planPath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-adaptive-handoff.js`, 'writeFileAtomicReplace(fpath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, "sub === 'validate-remote'");
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'function validateRemote');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'cmdValidateRemote');
assertIncludes(`${pluginRoot}/scripts/test-gitea-workflow-scripts.js`, 'testGiteaRoadmapValidateRemote');
// #401 Part 1: the forge plan-validator refusal-matrix anchor must remain wired into the suite.
assertIncludes(`${pluginRoot}/scripts/test-gitea-workflow-scripts.js`, 'testGiteaPlanValidatorRefusalMatrix401');

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

// issue #222: fast-path mid-flight escalation routing fix — Gitea parity
for (const fastFile222 of [giteaFastCmd198, giteaFastSkill198]) {
  assertIncludes(fastFile222, 'workflow_path: full');
  assertIncludes(fastFile222, 'next_command: /kaola-workflow-phase1 {project}');
  assertIncludes(fastFile222, 'next_skill: kaola-workflow-research {project}');
  assertIncludes(fastFile222, 'status `ESCALATED` → escalation already committed');
}
assertBefore(giteaNextCmd203, 'fast-summary.md status ESCALATED -> /kaola-workflow-phase1', 'fast-summary.md exists -> /kaola-workflow-fast');
assertIncludes(giteaNextSkill198, 'fast-summary.md status ESCALATED -> kaola-workflow-research');

// issue #227: adaptive-path contract (Gitea fork command prose + renamed scripts).
assert(exists(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js'), 'Gitea adaptive plan validator missing');
assert(exists(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js'), 'Gitea adaptive schema module missing');
// router 3-way selection: switch chooses branch AND default (adaptive is the default under ON;
// fast/full are explicit escapes). OFF preserves 2-way fast/full with typed refusal on adaptive.
assertConcept(pluginRoot + '/commands/workflow-next.md', 'adaptive path selection', [
  'KAOLA_ENABLE_ADAPTIVE', 'adaptive', 'fast|full|adaptive', 'default', 'typed refusal'
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
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput', 'test_thrash',
  // #303 anti-drift: pin the rolling-dispatch + crash-repair + opening-lifecycle primitives.
  'top-up', 'reconcile', 'opening',
  // #335 anti-drift: pin the mechanical main→worktree project-folder mirror step.
  'mirror-project'
]);
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'workflow_path: adaptive');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'disjointWriteSets');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'readPlanNodes');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'workflow_path_refused');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'routeAdaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'enable_adaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'enable_adaptive');
// #343: mid-gate reopen fold + orphan guard must be carried by the Gitea adaptive-node port
// (not byte-checked by validate-script-sync; this pin is the anti-drift guard).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', 'would_orphan_in_progress');

// #338: anti-drift pins — finalize sink row main-session-direct + contractor self-attest back-fill.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', 'main-session-direct');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-direct');
// #360: script-owned consent-halt clear (clear-halt subcommand) replaces the contractor lockstep.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'clear-halt');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', "subcommand === 'clear-halt'");
// #344: every adaptive lifecycle call is `node "$KAOLA_SCRIPTS/…"`; $KAOLA_SCRIPTS must be
// DEFINED via the kaola_script() resolver before its first use — undefined in a consumer install.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'kaola_script(){');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-adaptive-node.js)")"');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', '--attest-contractor-spawn');
// #347: the planner self-attest back-fill flag must be ported to the forge claim (the #280 producer
// was canonical-only while #300 ported its consumer — without this pin the asymmetry is invisible).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', '--attest-planner-spawn');
// #359: producer-attested evidence-token vocabulary in the forge agent profiles.
assertIncludes(pluginRoot + '/agents/implementer.toml', 'verification_tier');
assertIncludes(pluginRoot + '/agents/tdd-guide.toml', 'literal tokens RED');
assertIncludes(pluginRoot + '/agents/contractor.toml', '--attest-contractor-spawn');

// #340: registration-surface + forge-port parity checks and their authoring/dispatch prose
// (Gitea edition surfaces). A dropped token reds this chain at the contract-validator step.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'agent-registration gap');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'forge-port ordering gap');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'full accumulated root diff');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'registration surface');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'full accumulated root diff');

// #334: the non-delegable main-session-gate role token + its G3 freeze gate + authoring/dispatch
// prose, pinned in the Gitea edition surfaces (port validator, plan-run command, planner TOML).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'G3: main-session-gate');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-gate');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'main-session-gate');

// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (Gitea edition — .toml bodies). Removing the emission section from
// any of these files must fail npm test so a re-vendor or refactor cannot silently drop it.
for (const reviewerBody of [
  pluginRoot + '/agents/code-reviewer.toml',
  pluginRoot + '/agents/security-reviewer.toml',
  pluginRoot + '/agents/adversarial-verifier.toml'
]) {
  assertIncludes(reviewerBody, 'finding: id=');
  // #285: pin the machine-readable verdict-block emission contract (the column-0 block
  // that --verdict-check reads at Finalization) so a gate node always emits it.
  assertIncludes(reviewerBody, 'verdict: pass');
}
// #281: frontier-unit semantics in Gitea plan-run command (added by plan-run-semantics node)
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit');
// #281: efficient-DAG instruction in Gitea workflow-planner profile (added by planner-profile node)
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'EFFICIENT DAGs');

// #341: forge-neutral agent-profile authoring guidance pinned (planner toml + plan-run command).
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'forge-neutral');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', '--forbidden-only');

// issue #332: source agent-profile schema wall (AC2). require() THIS tree's own
// installer copy (require.main guard means require() never runs main()) and assert its
// source-tree validator passes for the Gitea plugin tree — every agents/*.toml has a
// matching non-empty top-level `name`, a legal model_reasoning_effort, a non-blank
// developer_instructions, every config_file resolves, and every toml is referenced by
// exactly one [agents.*] entry (catches the issue-scout class of omission forever).
const giteaInstaller = require('./install-codex-agent-profiles.js');
const giteaProfiles = giteaInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(giteaProfiles.ok,
  'Gitea source agent profiles fail schema validation:\n  - ' + giteaProfiles.errors.join('\n  - '));

// issue #332: edition byte-parity guard (the #291/#254 "edition port missed" class).
// The agent role profiles + config/agents.toml are forge-neutral and MUST stay
// byte-identical to the codex (plugins/kaola-workflow/) tree — a per-edition divergence
// (e.g. the historical workflow-planner.toml #272 drift) is illegal. Reference = codex.
function assertByteParity(relPath) {
  const ours = fs.readFileSync(path.join(root, pluginRoot, relPath));
  const ref = fs.readFileSync(path.join(root, 'plugins/kaola-workflow', relPath));
  assert(ours.equals(ref),
    'Gitea ' + relPath + ' must be byte-identical to the codex (plugins/kaola-workflow/) copy');
}
assertByteParity('config/agents.toml');
for (const tomlFile of fs.readdirSync(path.join(root, pluginRoot, 'agents')).filter(f => f.endsWith('.toml')).sort()) {
  assertByteParity(path.join('agents', tomlFile));
}

// #400: registry-driven route-reachability contract (the forge-codex dead zone). The schema emits
// kaola-workflow-plan-run / kaola-workflow-adapt as resume/route targets and the forge claim.js
// routes adaptive unconditionally — but the forge skills/ tree shipped neither SKILL, so the route
// resolved to nothing. require() the schema route constants (no hand-listed drift) + the static
// next_skill fallbacks gitea claim.js prints, and assert each resolves to an installed
// skills/<name>/SKILL.md. listSkillFiles() only enumerates what EXISTS (a blind spot for an absent
// REQUIRED skill); this is the required-target registry that closes it.
{
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const emittedSkillTargets = [
    schema.PLAN_RUN_SKILL,
    schema.ADAPT_SKILL,
    'kaola-workflow-fast',
    'kaola-workflow-research'
  ];
  const installedSkills = new Set(
    fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => exists(pluginRoot + '/skills/' + name + '/SKILL.md'))
  );
  for (const target of emittedSkillTargets) {
    assert(installedSkills.has(target),
      '#400: route-reachability — receipt-emitted skill target "' + target + '" has no installed ' +
      pluginRoot + '/skills/' + target + '/SKILL.md (broken route, the forge-codex #400 dead zone)');
  }
  // Content-reachability tier (catches #369/#380): a mirrored SKILL must carry the command's
  // route/wiring tokens or the route resolves to a hollow surface.
  assertIncludes(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md', 'issue_numbers');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md', '--issue-numbers');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'workflow-plan.md exists -> kaola-workflow-plan-run');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'auto-bundle');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'close-and-open-next');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'kaola-workflow-plan-run');
  // #405: the forge-codex plan-run SKILL inherits the tier→profile dispatch prose (the cluster-C
  // #405 "all three codex editions" AC was blocked on this SKILL existing).
  assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', '<role>-max');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'model_variant_missing');
}

// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}

console.log('Kaola-Workflow Gitea contract validation passed');
