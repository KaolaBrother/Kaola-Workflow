#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reviewerGenerator = require('./generate-reviewer-profiles');
const pinnedCommit = '922d2d8f8b64f4e50936e24465cb3bcac81ac0e1';
// Vendored agents carry full upstream provenance (URL + blob-sha + sha256 + license).
const vendoredAgents = [
  'build-error-resolver',
  'code-architect',
  'code-explorer',
  'doc-updater',
  'planner',
  'tdd-guide',
];
// issue #227 + #279 follow-up: PROVENANCE-EXEMPT agents — name-pinned, but the
// upstream/blob-sha/sha256/license/copyright asserts and the agents-source.md vendored-table row
// do NOT apply. They still must be valid managed agents (front matter at byte 0, name, model,
// marker). Two sub-kinds: (a) locally-authored adaptive-path roles with no upstream blob
// (adversarial-verifier/implementer); (b) code-reviewer + security-reviewer,
// which were FORKED from ECC into local agents (#279 follow-up) so they can carry the
// Kaola-Workflow findings-emission contract in their bodies — they remain DERIVED from ECC (MIT,
// Affaan Mustafa), but that attribution is now honored at the project level in docs/agents-source.md
// rather than per-file, and they are no longer byte-tracked to upstream.
const localAgents = [
  'adversarial-verifier',
  'code-reviewer',
  'implementer',
  'investigator',
  'knowledge-lookup',
  'metric-optimizer',
  'security-reviewer',
  'synthesizer',
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

// Generated reviewer profiles are versioned artifacts, not provenance-exempt free-form files.
// The generator owns all twelve outputs; this wall binds the Claude source files to the same
// behavior identity and complete-byte self-hash later consumed by both installers.
const generatedReviewerErrors = reviewerGenerator.checkGeneratedProfiles(root);
assert(generatedReviewerErrors.length === 0,
  'generated reviewer profiles must be current: ' + generatedReviewerErrors.join('; '));
for (const relativePath of [
  'agents/code-reviewer.md',
  'agents/adversarial-verifier.md',
  'agents/security-reviewer.md',
]) {
  const content = read(relativePath);
  reviewerGenerator.verifyResolvedProfileHash(content);
  const identity = reviewerGenerator.behaviorIdentityFromCore(content);
  const topVersion = /^behavior_contract_version:\s*(\d+)$/m.exec(content);
  const topHash = /^behavior_contract_hash:\s*([0-9a-f]{64})$/m.exec(content);
  assert(topVersion && Number(topVersion[1]) === 2,
    relativePath + ' must carry behavior_contract_version 2');
  assert(topHash && topHash[1] === identity.behavior_contract_hash,
    relativePath + ' top-level behavior hash must bind its normalized behavior core');
  assert(identity.behavior_contract_version === 2,
    relativePath + ' behavior core must carry contract version 2');
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
assert(installScript.includes('generate-reviewer-profiles.js" --check'),
  'install.sh must reject stale generated reviewer sources before writing agents');
assert(installScript.includes('refresh_reviewer_resolved_profile_hash'),
  'install.sh must recompute the complete-byte reviewer self-hash after model inheritance rewrite');
assert(installScript.includes('reviewer_manifest_metadata'),
  'install.sh must persist reviewer behavior and resolved-profile identities in its managed manifest');
assert(installScript.includes('filesystem bytes only; runtime prompt loading is not attested'),
  'install.sh must state the filesystem-only proof boundary');

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

module.exports = {
};
