#!/usr/bin/env node
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

function parseJson(file) {
  return JSON.parse(read(file));
}

const pluginRoot = 'plugins/kaola-workflow';
const pluginJsonPath = `${pluginRoot}/.codex-plugin/plugin.json`;
const marketplacePath = '.agents/plugins/marketplace.json';

assert(exists(pluginJsonPath), `${pluginJsonPath} is missing`);
assert(exists(marketplacePath), `${marketplacePath} is missing`);

const pluginJson = parseJson(pluginJsonPath);
assert(pluginJson.name === 'kaola-workflow', 'Codex plugin name must be kaola-workflow');
assert(pluginJson.skills === './skills/', 'Codex plugin must expose ./skills/');
assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'commands'), 'Codex plugin must not declare Claude commands');
assert(!JSON.stringify(pluginJson).includes('ECC'), 'Codex plugin must not depend on ECC');
assert(!JSON.stringify(pluginJson).includes('Claude Code'), 'Codex plugin metadata must stay Codex-only');
assert(JSON.stringify(pluginJson).includes('Kaola-Workflow for Codex'), 'Codex plugin metadata must be discoverable as Kaola-Workflow for Codex');
assert(JSON.stringify(pluginJson).includes('workflow-init'), 'Codex plugin metadata must include workflow-init for app search');

const marketplaceJson = parseJson(marketplacePath);
assert(marketplaceJson.name === 'kaolabrother-kaola-workflow', 'private marketplace name must stay stable');
assert(marketplaceJson.interface && marketplaceJson.interface.displayName === 'KaolaBrother Kaola-Workflow', 'marketplace display name must identify Kaola-Workflow');
assert(Array.isArray(marketplaceJson.plugins), 'marketplace must define plugins');
const entry = marketplaceJson.plugins.find(plugin => plugin.name === 'kaola-workflow');
assert(entry, 'marketplace must list kaola-workflow');
assert(entry.source && entry.source.source === 'local', 'kaola-workflow marketplace source must be local');
assert(entry.source.path === './plugins/kaola-workflow', 'kaola-workflow marketplace path must be repo-local');
assert(entry.policy && entry.policy.installation === 'AVAILABLE', 'kaola-workflow must be locally installable');

const skills = [
  'kaola-workflow-init',
  'kaola-workflow-next',
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-fast',
];

for (const skill of skills) {
  const file = `${pluginRoot}/skills/${skill}/SKILL.md`;
  assert(exists(file), `${file} is missing`);
  assertIncludes(file, `name: ${skill}`);
  assertIncludes(file, 'description: Use when');
  assertIncludes(file, 'kaola-workflow/');
  assertIncludes(file, 'workflow-state.md');
}

assertIncludes('scripts/kaola-workflow-claim.js', 'function cmdBootstrap');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'AGENTS.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Do not create or edit CLAUDE.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'next_skill');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '## Goal Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '## Autonomy Policy');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'generated project names');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'strongest available expert model/profile');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'kaola-workflow-repair-state.js');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '.codex/plugins/cache');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'startup');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'STARTUP_OUT');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'startup receipt');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'startup unavailable');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'stop for repair');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'claim: "none"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'can-handoff');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--force-live-takeover');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--runtime codex');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'CODEX_THREAD_ID');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'handoff --project');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, '## Goal Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'collision suffix');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'do not ask the user');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, '_phase1-pending');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'autonomous strategy selection');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'Select the advisor-reviewed recommended approach internally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'wait for user selection');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, 'Do not ask the user to approve routine internal workflow execution');
for (const phaseSkill of [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-fast',
]) {
  assertIncludes(`${pluginRoot}/skills/${phaseSkill}/SKILL.md`, '## Goal Contract');
  assertIncludes(`${pluginRoot}/skills/${phaseSkill}/SKILL.md`, 'Startup Receipt Guard');
  assertIncludes(`${pluginRoot}/skills/${phaseSkill}/SKILL.md`, '.startup.json');
  assertIncludes(`${pluginRoot}/skills/${phaseSkill}/SKILL.md`, 'verify-startup');
  assertIncludes(`${pluginRoot}/skills/${phaseSkill}/SKILL.md`, 'startup receipt does not authorize');
}
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Required Agent Compliance');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'RED');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'GREEN');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'codex review');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Documentation Docking');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Commit And Push');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '## Session Heartbeat');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'kaola-workflow-sink-pr.js');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'commit -m "chore: finalize ${KAOLA_PROJECT}"');
assertBefore(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'commit -m "chore: finalize ${KAOLA_PROJECT}"', 'kaola-workflow-sink-merge.js');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Session lifecycle');

const repairScript = `${pluginRoot}/scripts/kaola-workflow-repair-state.js`;
const simulateScript = `${pluginRoot}/scripts/simulate-kaola-workflow-walkthrough.js`;
const installAgentsScript = `${pluginRoot}/scripts/install-codex-agent-profiles.js`;
const pluginLocalSharedScripts = [
  `${pluginRoot}/scripts/kaola-workflow-claim.js`,
  `${pluginRoot}/scripts/kaola-workflow-classifier.js`,
  `${pluginRoot}/scripts/kaola-workflow-roadmap.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-merge.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-pr.js`,
];
assert(exists(repairScript), `${repairScript} is missing`);
assert(exists(simulateScript), `${simulateScript} is missing`);
assert(exists(installAgentsScript), `${installAgentsScript} is missing`);
for (const script of pluginLocalSharedScripts) {
  assert(exists(script), `${script} is missing`);
  const rootScript = script.replace(`${pluginRoot}/scripts/`, 'scripts/');
  assert(read(script) === read(rootScript), `${script} must match ${rootScript}`);
}
assertIncludes(repairScript, 'kaola-workflow');
assertIncludes(repairScript, 'next_skill');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'function extractFilePaths');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'plugins/kaola-workflow');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'CODEX_THREAD_ID');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'function cmdHandoff');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'function cmdCanHandoff');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'function cmdVerifyStartup');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'claudeSessionPathForRoot');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'RECENT_CLAUDE_SESSION_MS');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '--force-live-takeover');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'bootstrap: --target-issue <N> is required');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'function cmdStartup');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'startupReceiptPath');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'syncIssuesToRoadmap');
// Phase B contracts: pick-next startup receipt + finalize cleanup
assertIncludes('scripts/kaola-workflow-claim.js', "claim: 'acquired'");
assertIncludes('scripts/kaola-workflow-claim.js', 'writeStartupReceipt');
assertIncludes('scripts/kaola-workflow-claim.js', 'archiveProjectDir');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "claim: 'acquired'");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'writeStartupReceipt');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'archiveProjectDir');
assertIncludes(simulateScript, 'real parallel bootstrap coordination and claim-race retry');
assertIncludes(simulateScript, 'parallel explicit-target bootstrap splits across independent issues');
assertIncludes(simulateScript, 'can-handoff must reject live owner');
assertIncludes(simulateScript, 'claim:none receipt must not authorize phase work');
assertIncludes(simulateScript, '--target-issue');
assertIncludes('scripts/kaola-workflow-claim.js', 'claimExplicitTarget');
assertIncludes('scripts/kaola-workflow-claim.js', "'no_target'");
assertIncludes('scripts/kaola-workflow-claim.js', "'target_occupied'");
assertIncludes('scripts/kaola-workflow-claim.js', "'user_target_blocked'");
assertIncludes('scripts/kaola-workflow-claim.js', "'target_mismatch'");
assertIncludes(simulateScript, 'Workflow walkthrough simulation passed');
assertNotIncludes(simulateScript, '../../../scripts/kaola-workflow-claim.js');
assertIncludes(installAgentsScript, 'BEGIN kaola-workflow agents');

const codexAgentRoles = [
  'code-explorer',
  'docs-lookup',
  'planner',
  'code-architect',
  'tdd-guide',
  'build-error-resolver',
  'code-reviewer',
  'security-reviewer',
  'doc-updater',
];

const codexAgentReasoningEfforts = {
  'code-explorer': 'medium',
  'docs-lookup': 'medium',
  'planner': 'xhigh',
  'code-architect': 'high',
  'tdd-guide': 'medium',
  'build-error-resolver': 'medium',
  'code-reviewer': 'high',
  'security-reviewer': 'high',
  'doc-updater': 'low',
};

const agentConfigTemplate = `${pluginRoot}/config/agents.toml`;
assert(exists(agentConfigTemplate), `${agentConfigTemplate} is missing`);
assertIncludes(agentConfigTemplate, '[features]');
assertIncludes(agentConfigTemplate, 'multi_agent = true');

for (const role of codexAgentRoles) {
  const file = `${pluginRoot}/agents/${role}.toml`;
  assert(exists(file), `${file} is missing`);
  assert(!/^model\s*=/m.test(read(file)), `${file} must not pin a model name`);
  assertIncludes(file, `model_reasoning_effort = "${codexAgentReasoningEfforts[role]}"`);
  assertIncludes(file, 'developer_instructions');
  assertIncludes(file, 'Kaola-Workflow for Codex');
  assertIncludes(agentConfigTemplate, `[agents.${role}]`);
  assertIncludes(agentConfigTemplate, `config_file = "./agents/kaola-workflow/${role}.toml"`);
}

assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'install-codex-agent-profiles.js');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'code-explorer');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'docs-lookup');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'planner');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, 'code-architect');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'tdd-guide');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'build-error-resolver');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'security-reviewer');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'doc-updater');

assertIncludes('package.json', 'test:kaola-workflow:codex');

// Issue #46: single-issue completion contract — Codex skill surfaces
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '## Completion Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'single-issue completion contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'await explicit re-direction');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '## Completion Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'single-issue completion contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'await explicit re-direction');

console.log('Kaola-Workflow contract validation passed');
