#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const generator = require('./generate-agent-profiles.js');

const root = path.resolve(__dirname, '..');
const pinnedCommit = '922d2d8f8b64f4e50936e24465cb3bcac81ac0e1';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actualAgents = fs.readdirSync(path.join(root, 'agents'))
  .filter(name => name.endsWith('.md'))
  .sort();
const expectedAgents = generator.ROLES.map(role => role + '.md').sort();
assert(JSON.stringify(actualAgents) === JSON.stringify(expectedAgents),
  'agents directory must contain exactly the ' + generator.ROLES.length + ' generated role profiles');

const drift = generator.checkGeneratedProfiles(root);
assert(drift.length === 0, 'generated agent profiles must be current: ' + drift.join('; '));

const provenance = generator.loadProvenance(root);
for (const role of generator.ROLES) {
  const relativePath = `agents/${role}.md`;
  const content = read(relativePath);
  assert(content.startsWith('---\n'), relativePath + ' must start with YAML front matter');
  assert(content.includes(`name: ${role}`), relativePath + ' must carry its role name');
  assert(content.includes('kaola-workflow-managed-agent: true'),
    relativePath + ' must carry the managed installation marker');
  assert(!/[0-9a-f]{64}/.test(content) && !content.includes('runtime-adapter'),
    relativePath + ' must not carry receipt hashes in agent-visible text');
  assert(generator.sha256(content)
      === generator.manifestProfileEntry('claude', role, root).resolved_profile_sha256,
    relativePath + ' must match its generated manifest sidecar digest');
  const identity = generator.behaviorIdentityFromCore(content, root);
  assert(identity.role === role, relativePath + ' must bind its canonical behavior role');
  assert(provenance.roles[role], relativePath + ' must have external provenance metadata');
  assert(!/source-commit:|source-blob-sha:|source-sha256:|copyright:/i.test(content),
    relativePath + ' must not embed provenance inside runtime prompt bytes');
}

// Every current contract is Kaola-authored; a historical origin record, where one exists, stays
// pinned to the commit the earlier material was taken from so the history remains locatable.
for (const [role, record] of Object.entries(provenance.roles)) {
  assert(record.source_kind === 'kaola_authored', role + ' must be classified kaola_authored');
  if (record.history && record.history.origin === 'everything_claude_code') {
    assert(record.history.source_commit === pinnedCommit,
      role + ' historical origin must stay pinned to ' + pinnedCommit);
  }
}

const installScript = read('install.sh');
assert(installScript.includes('install_agent_files'), 'install.sh must install generated agents');
assert(installScript.includes('.kaola-workflow-agent-manifest'),
  'install.sh must track managed agent hashes');
assert(installScript.includes('generate-agent-profiles.js" --check'),
  'install.sh must reject stale all-role sources before writing agents');
assert(installScript.includes('manifestProfileEntry'),
  'install.sh must verify every role source against the generated manifest sidecar');
assert(installScript.includes('agent_manifest_metadata'),
  'install.sh must persist every role behavior, adapter, and resolved-profile identity');
assert(installScript.includes('filesystem bytes only; runtime prompt loading is not attested'),
  'install.sh must state the filesystem-only proof boundary');

const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('kaola-workflow-managed-agent: true'),
  'uninstall.sh must use the managed marker');
assert(uninstallScript.includes('.kaola-workflow-agent-manifest'),
  'uninstall.sh must clean the managed manifest');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.files.includes('agents/'), 'package files must include agents/');
assert(packageJson.files.includes('templates/'), 'package files must include templates/');
assert(packageJson.files.includes('scripts/'), 'package files must include scripts/');

console.log('Generated agent validation passed for ' + generator.ROLES.length + ' Kaola-authored roles (historical origin records pinned to ' + pinnedCommit.slice(0, 8) + ')');
