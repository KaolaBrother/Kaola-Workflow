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
  'agents directory must contain exactly the 14 generated role profiles');

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
  assert(content.includes('<!-- runtime-adapter:start -->')
    && content.includes('runtime: claude')
    && content.includes('<!-- runtime-adapter:end -->'),
  relativePath + ' must carry the Claude native adapter');
  generator.verifyResolvedProfileHash(content);
  const identity = generator.behaviorIdentityFromCore(content, root);
  assert(identity.role === role, relativePath + ' must bind its canonical behavior role');
  assert(provenance.roles[role], relativePath + ' must have external provenance metadata');
  assert(!/source-commit:|source-blob-sha:|source-sha256:|copyright:/i.test(content),
    relativePath + ' must not embed provenance inside runtime prompt bytes');
}

for (const record of Object.values(provenance.roles)) {
  if (record.source_kind === 'ecc_derived') {
    assert(record.source_commit === pinnedCommit,
      'ECC-derived provenance must remain pinned to ' + pinnedCommit);
  }
}

const installScript = read('install.sh');
assert(installScript.includes('install_agent_files'), 'install.sh must install generated agents');
assert(installScript.includes('.kaola-workflow-agent-manifest'),
  'install.sh must track managed agent hashes');
assert(installScript.includes('generate-agent-profiles.js" --check'),
  'install.sh must reject stale all-role sources before writing agents');
assert(installScript.includes('refresh_agent_resolved_profile_hash'),
  'install.sh must recompute every installed role self-hash after model inheritance rewrite');
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

console.log(`Generated agent validation passed for ${expectedAgents.length} roles at ${pinnedCommit}`);
