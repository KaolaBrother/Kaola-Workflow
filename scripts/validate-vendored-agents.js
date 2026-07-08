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
  'doc-updater',
  'planner',
  'tdd-guide',
];
// issue #227 + #279 follow-up: PROVENANCE-EXEMPT agents — name-pinned, but the
// upstream/blob-sha/sha256/license/copyright asserts and the agents-source.md vendored-table row
// do NOT apply. They still must be valid managed agents (front matter at byte 0, name, model,
// marker). Two sub-kinds: (a) locally-authored adaptive-path roles with no upstream blob
// (adversarial-verifier/contractor/implementer/workflow-planner); (b) code-reviewer + security-reviewer,
// which were FORKED from ECC into local agents (#279 follow-up) so they can carry the
// Kaola-Workflow findings-emission contract in their bodies — they remain DERIVED from ECC (MIT,
// Affaan Mustafa), but that attribution is now honored at the project level in docs/agents-source.md
// rather than per-file, and they are no longer byte-tracked to upstream.
const localAgents = [
  'adversarial-verifier',
  'code-reviewer',
  'contractor',
  'implementer',
  'issue-scout',
  'knowledge-lookup',
  'metric-optimizer',
  'security-reviewer',
  'synthesizer',
  'workflow-planner',
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

// ---------------------------------------------------------------------------
// Future-agent wall (per-role evidence contract). Every node-role agent — the managed roster
// MINUS the orchestration roles (the contractor drives claim/finalize bookkeeping; the
// workflow-planner authors the plan; neither is a node-role evidence producer) — must carry BOTH
// halves of the evidence contract, so the NEXT agent added to the roster cannot silently ship
// without it:
//   (a) a ROLE_TOKEN_REGISTRY row naming >=2 evidence tokens, OR a PRESENCE_ONLY_RATIONALE entry
//       (a one-line reason a single-token role is admitted). The allowlist ships EMPTY.
//   (b) a role-kind evidence needle whose KIND is DERIVED from the agent's own front-matter tool
//       manifest — never a hand-maintained list. A profile that can Write or Edit SELF-WRITES its
//       .cache evidence (needle: SELF-WRITE + evidence-binding); every other profile RETURNS its
//       deliverable for orchestrator persistence (needle: RETURN + record-evidence).
const { ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator');

const NON_NODE_ROLES = new Set(['contractor', 'workflow-planner']);

// role -> one-line reason a node-role agent may ship with fewer than two registry tokens. EMPTY:
// every current node role reaches the >=2-token floor. A future presence-only role (whose evidence
// is a single content token) is admitted ONLY by an explicit rationale entry here.
const PRESENCE_ONLY_RATIONALE = {};

// KIND derivation from the front-matter tool manifest (inline-array form:
// `tools: [Read, Write]` or `tools: ["Read", "Write"]`). Write OR Edit present => write-kind,
// else read-kind. Never a hand-list.
function agentWritesEvidence(frontMatter) {
  const m = /^tools:\s*(.+)$/m.exec(frontMatter);
  return m ? /\b(Write|Edit)\b/.test(m[1]) : false;
}

// The wall. agentsDir: absolute path to an agents/ dir; registry: role -> token-class array;
// presenceOnly: role -> reason map; readFile: (absPath) -> string. Throws a TYPED refusal on the
// first violation. Node roles are DERIVED from the directory listing (a new *.md agent is covered
// automatically), minus the orchestration roles.
function checkFutureAgentWall(agentsDir, registry, presenceOnly, readFile) {
  const roles = fs.readdirSync(agentsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => name.slice(0, -'.md'.length))
    .filter(role => !NON_NODE_ROLES.has(role))
    .sort();
  for (const role of roles) {
    const content = readFile(path.join(agentsDir, `${role}.md`));
    const fmEnd = content.indexOf('\n---\n', 4);
    const frontMatter = fmEnd > 0 ? content.slice(0, fmEnd) : '';
    // (a) registry row with >=2 tokens OR a presence-only allowlist entry.
    const tokens = registry[role];
    const hasTwoTokens = Array.isArray(tokens) && tokens.length >= 2;
    if (!hasTwoTokens && !Object.prototype.hasOwnProperty.call(presenceOnly, role)) {
      throw new Error(`agent_contract_registry_missing: node-role agent "${role}" needs a ` +
        `ROLE_TOKEN_REGISTRY row with >=2 tokens or a PRESENCE_ONLY_RATIONALE entry`);
    }
    // (b) manifest-derived role-kind evidence needle.
    if (agentWritesEvidence(frontMatter)) {
      assert(content.includes('SELF-WRITE') && content.includes('evidence-binding'),
        `agent_contract_needle_missing: write-kind agent "${role}" must carry the ` +
        `SELF-WRITE + evidence-binding evidence contract`);
    } else {
      assert(content.includes('RETURN') && content.includes('record-evidence'),
        `agent_contract_needle_missing: read-kind agent "${role}" must carry the ` +
        `RETURN + record-evidence evidence contract`);
    }
  }
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

// Future-agent wall: every node-role agent carries both halves of its evidence contract.
checkFutureAgentWall(
  path.join(root, 'agents'),
  ROLE_TOKEN_REGISTRY,
  PRESENCE_ONLY_RATIONALE,
  filePath => fs.readFileSync(filePath, 'utf8')
);

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

module.exports = { checkFutureAgentWall, agentWritesEvidence, PRESENCE_ONLY_RATIONALE, NON_NODE_ROLES };
