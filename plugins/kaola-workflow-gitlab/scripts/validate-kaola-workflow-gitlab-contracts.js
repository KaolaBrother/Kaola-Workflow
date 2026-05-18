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
    /pull request/i
  ];
  for (const re of forbidden) assert(!re.test(text), file + ' contains forbidden reference: ' + re);
}

const pluginJson = parseJson(pluginRoot + '/.codex-plugin/plugin.json');
assert(pluginJson.name === 'kaola-workflow-gitlab', 'GitLab Codex plugin name mismatch');
assert(pluginJson.skills === './skills/', 'GitLab Codex plugin must expose ./skills/');

const claudePluginJson = parseJson(pluginRoot + '/.claude-plugin/plugin.json');
assert(String(claudePluginJson.name || '').includes('gitlab'), 'GitLab Claude plugin name must identify GitLab');

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

assert(commandFiles.length === 9, 'expected 9 GitLab command files');
assert(skillFiles.length === 9, 'expected 9 GitLab skill files');
assert(exists(pluginRoot + '/hooks/hooks.json'), 'GitLab hooks.json missing');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'GitLab pre-commit hook missing');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'GitLab advisor hook missing');
assert(agentFiles.length === 9, 'expected 9 GitLab agent profiles');
assert(exists(pluginRoot + '/config/agents.toml'), 'GitLab agents config missing');

for (const file of [...commandFiles, ...skillFiles, ...hookFiles, ...agentFiles, pluginRoot + '/config/agents.toml']) {
  assertNoForbidden(file);
}

const scriptFiles = [
  'kaola-gitlab-forge.js',
  'kaola-gitlab-workflow-active-folders.js',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitlab-workflow-classifier.js',
  'kaola-gitlab-workflow-compact-context.js',
  'kaola-gitlab-workflow-repair-state.js',
  'kaola-gitlab-workflow-roadmap.js',
  'kaola-gitlab-workflow-sink-merge.js',
  'kaola-gitlab-workflow-sink-mr.js',
  'simulate-gitlab-workflow-walkthrough.js',
  'simulate-gitlab-codex-workflow-walkthrough.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

for (const file of listFiles(pluginRoot + '/scripts', file =>
  file.endsWith('.js') && !file.endsWith('validate-kaola-workflow-gitlab-contracts.js')
)) {
  const text = read(file);
  assert(!/\bgh\b/.test(text), file + ' must not execute or mention gh');
  assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
}

const pkg = parseJson('package.json');
assert(!String(pkg.scripts['test:kaola-workflow:gitlab']).includes('pending #58'), 'GitLab test script must not be placeholder');

console.log('Kaola-Workflow GitLab contract validation passed');
