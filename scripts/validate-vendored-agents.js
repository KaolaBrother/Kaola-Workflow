#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pinnedCommit = '922d2d8f8b64f4e50936e24465cb3bcac81ac0e1';
// Vendored agents carry full upstream provenance (URL + blob-sha + sha256 + license).
const vendoredAgents = [
  'build-error-resolver',
  'code-architect',
  'code-explorer',
  'code-reviewer',
  'doc-updater',
  'docs-lookup',
  'planner',
  'security-reviewer',
  'tdd-guide',
];
// issue #227: locally-authored agents (the adaptive-path roles) are name-pinned but
// PROVENANCE-EXEMPT — they have no upstream blob, so the upstream/blob-sha/sha256/
// license/copyright asserts and the agents-source.md vendored-table row do NOT apply.
// They still must be valid managed agents (front matter at byte 0, name, model, marker).
const localAgents = [
  'adversarial-verifier',
  'contractor',
];
const allAgents = [...vendoredAgents, ...localAgents];

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
  assert(read(file).includes(needle), `${file} must include: ${needle}`);
}

assert(exists('agents'), 'agents directory is missing');

const actualAgents = fs.readdirSync(path.join(root, 'agents'))
  .filter(name => name.endsWith('.md'))
  .sort();
const expectedAgents = allAgents.map(name => `${name}.md`).sort();

assert(
  JSON.stringify(actualAgents) === JSON.stringify(expectedAgents),
  `agents directory must contain exactly: ${expectedAgents.join(', ')}`
);

// Vendored agents: full provenance + agents-source.md table row.
for (const agentName of vendoredAgents) {
  const fileName = `${agentName}.md`;
  const relativePath = `agents/${fileName}`;
  const content = read(relativePath);

  assert(content.startsWith('---\n'), `${relativePath} must preserve YAML front matter at byte 0`);
  const frontMatterEnd = content.indexOf('\n---\n', 4);
  assert(frontMatterEnd > 0, `${relativePath} must close YAML front matter`);

  const attributionStart = content.indexOf('<!--\nkaola-workflow-managed-agent: true', frontMatterEnd);
  assert(attributionStart > frontMatterEnd, `${relativePath} must put Kaola attribution after front matter`);
  assert(content.includes(`upstream: https://github.com/affaan-m/everything-claude-code/blob/${pinnedCommit}/agents/${fileName}`), `${relativePath} must record upstream URL`);
  assert(content.includes(`source-commit: ${pinnedCommit}`), `${relativePath} must record pinned commit`);
  assert(/source-blob-sha: [0-9a-f]{40}/.test(content), `${relativePath} must record upstream blob SHA`);
  assert(/source-sha256: [0-9a-f]{64}/.test(content), `${relativePath} must record source SHA-256`);
  assert(content.includes('license: MIT License'), `${relativePath} must record MIT license`);
  assert(content.includes('copyright: Copyright (c) 2026 Affaan Mustafa'), `${relativePath} must record upstream copyright`);
  assert(content.includes(`name: ${agentName}`), `${relativePath} front matter must name the agent`);
}

// Local agents (issue #227): provenance-exempt — assert only that they are valid
// managed agents (front matter at byte 0, name, model, the managed marker). No
// upstream/blob/sha256/license asserts and no agents-source.md vendored-table row.
for (const agentName of localAgents) {
  const relativePath = `agents/${agentName}.md`;
  const content = read(relativePath);
  assert(content.startsWith('---\n'), `${relativePath} must preserve YAML front matter at byte 0`);
  const frontMatterEnd = content.indexOf('\n---\n', 4);
  assert(frontMatterEnd > 0, `${relativePath} must close YAML front matter`);
  assert(content.includes(`name: ${agentName}`), `${relativePath} front matter must name the agent`);
  assert(/^model:\s*\S+/m.test(content), `${relativePath} front matter must set a model`);
  assert(content.includes('kaola-workflow-managed-agent: true'), `${relativePath} must carry the managed marker`);
}

assertIncludes('docs/agents-source.md', pinnedCommit);
for (const agentName of vendoredAgents) {
  assertIncludes('docs/agents-source.md', `agents/${agentName}.md`);
}

const readme = read('README.md');
assert(!readme.includes('Install ECC first'), 'README.md must not tell users to install ECC first');
assert(!readme.includes('This plugin requires ECC to be installed'), 'README.md must not present ECC as a prerequisite');
assert(readme.includes('docs/agents-source.md'), 'README.md must link vendored agent source documentation');

const installScript = read('install.sh');
assert(!installScript.includes('Continue installation anyway'), 'install.sh must not prompt for missing ECC');
assert(!installScript.includes('Install ECC:'), 'install.sh must not print ECC install instructions');
assert(installScript.includes('install_agent_files'), 'install.sh must install vendored agents');
assert(installScript.includes('.kaola-workflow-agent-manifest'), 'install.sh must track managed agent hashes');

const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('kaola-workflow-managed-agent: true'), 'uninstall.sh must use the managed marker');
assert(uninstallScript.includes('.kaola-workflow-agent-manifest'), 'uninstall.sh must clean the managed manifest');

const packageJson = JSON.parse(read('package.json'));
assert(Array.isArray(packageJson.files) && packageJson.files.includes('agents/'), 'package files must include agents/');
assert(
  Array.isArray(packageJson.files) && packageJson.files.includes('docs/agents-source.md'),
  'package files must include docs/agents-source.md'
);
assert(!packageJson.peerDependencies || !packageJson.peerDependencies['ecc-universal'], 'package.json must not present ecc-universal as a peer dependency');

console.log(`Vendored agent validation passed for ${expectedAgents.length} agents at ${pinnedCommit}`);
