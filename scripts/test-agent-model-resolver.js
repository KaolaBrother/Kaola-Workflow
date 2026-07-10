#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('./kaola-workflow-resolve-agent-model.js');
const codexResolver = require('../plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js');
const schema = require('./kaola-workflow-adaptive-schema.js');

assert.strictEqual(resolver.isCodexPluginScriptDir(), false, 'root resolver is not inside a Codex plugin');
assert.strictEqual(codexResolver.isCodexPluginScriptDir(), true, 'plugin resolver detects .codex-plugin in source/cache shape');
const stableHookHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-stable-resolver-'));
try {
  const stableScripts = path.join(stableHookHome, '.codex', 'kaola-workflow', 'scripts');
  fs.mkdirSync(stableScripts, { recursive: true });
  assert.strictEqual(resolver.isCodexPluginScriptDir(stableScripts), true,
    'stable ~/.codex/kaola-workflow/scripts resolver uses Codex static defaults');
} finally {
  fs.rmSync(stableHookHome, { recursive: true, force: true });
}

// Every installed Kaola role has a static reasoning/standard fallback. A blank plan cell resolves
// through this map before dispatch; no role default may degrade to a null Codex pair.
assert.deepStrictEqual(
  [...schema.CODEX_PINNED_STANDARD_ROLES, ...schema.CODEX_PINNED_REASONING_ROLES].sort(),
  Object.keys(resolver.DEFAULT_AGENT_MODELS).sort(),
  'Codex profile classes must cover exactly the resolver role registry'
);
for (const [role, model] of Object.entries(resolver.DEFAULT_AGENT_MODELS)) {
  assert.ok(model === 'opus' || model === 'sonnet', `${role} must default to reasoning or standard`);
  const pinned = schema.CODEX_PINNED_STANDARD_ROLES.includes(role);
  const reasoning = schema.CODEX_PINNED_REASONING_ROLES.includes(role);
  assert.ok(pinned !== reasoning, `${role} must belong to exactly one Codex profile class`);
  assert.strictEqual(model, pinned ? 'sonnet' : 'opus', `${role} static tier must match its Codex profile class`);
  const dispatch = schema.dispatchEffort(model);
  assert.ok(dispatch.codex_model, `${role} must resolve a non-null Codex model`);
  assert.ok(dispatch.codex_reasoning_effort, `${role} must resolve a non-null Codex reasoning effort`);
  assert.strictEqual(dispatch.codex_model, 'gpt-5.6-sol', `${role} must use the Sol model`);
  assert.strictEqual(dispatch.codex_reasoning_effort, pinned ? 'medium' : 'xhigh',
    `${role} effort must match its profile class`);
}

function writeAgent(dir, name, model) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.md`),
    [
      '---',
      `name: ${name}`,
      `model: ${model}`,
      '---',
      '',
      'Test agent.'
    ].join('\n')
  );
}

function writeManifest(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.kaola-agent-models.json'), JSON.stringify(obj));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-'));
try {
  assert.strictEqual(resolver.resolveAgentModel('tdd-guide', { agentDir: tmp }), 'sonnet');
  // #634: the metric-optimizer default resolves to the standard tier (sonnet) — no agent file, no
  // manifest, so it falls through to DEFAULT_AGENT_MODELS. It is NOT a reasoning-floor role.
  assert.strictEqual(resolver.resolveAgentModel('metric-optimizer', { agentDir: tmp }), 'sonnet');

  writeAgent(tmp, 'code-reviewer', 'opus');
  assert.strictEqual(resolver.resolveAgentModel('code-reviewer', { agentDir: tmp }), 'opus');
  assert.strictEqual(resolver.formatAgentArgument('opus'), 'model="opus",');

  writeAgent(tmp, 'doc-updater', '"haiku"');
  assert.strictEqual(resolver.resolveAgentModel('doc-updater', { agentDir: tmp }), 'haiku');

  // NEW CASE 3: inherit frontmatter + no manifest entry → falls through to DEFAULT_AGENT_MODELS
  // (old behavior returned ''; new behavior returns the DEFAULT value 'opus')
  writeAgent(tmp, 'planner', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('planner', { agentDir: tmp }), 'opus');
  assert.strictEqual(resolver.formatAgentArgument(''), '');

  assert.strictEqual(resolver.extractFrontmatterModel('no frontmatter'), '');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// NEW CASE 1: manifest hit wins over inherit frontmatter
const tmpManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-manifest-'));
try {
  writeManifest(tmpManifest, { 'code-architect': 'sonnet', 'security-reviewer': 'opus', 'code-explorer': 'opus' });
  writeAgent(tmpManifest, 'code-architect', 'inherit');
  // manifest says sonnet; frontmatter says inherit — manifest must win
  assert.strictEqual(resolver.resolveAgentModel('code-architect', { agentDir: tmpManifest }), 'sonnet');

  // NEW CASE 2: higher-profile security-reviewer via manifest
  writeAgent(tmpManifest, 'security-reviewer', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('security-reviewer', { agentDir: tmpManifest }), 'opus');

  // Current Codex mode ignores a co-installed Claude manifest and returns the static profile class.
  assert.strictEqual(resolver.resolveAgentModel('code-architect', { agentDir: tmpManifest, staticDefaults: true }), 'opus');
  assert.strictEqual(resolver.resolveAgentModel('code-explorer', { agentDir: tmpManifest, staticDefaults: true }), 'sonnet');
} finally {
  fs.rmSync(tmpManifest, { recursive: true, force: true });
}

// NEW CASE 4: missing manifest file entirely → falls through to frontmatter/DEFAULT without throwing
const tmpNoManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-nomf-'));
try {
  // no manifest file at all; no agent file either → DEFAULT
  assert.doesNotThrow(() => resolver.resolveAgentModel('planner', { agentDir: tmpNoManifest }));
  assert.strictEqual(resolver.resolveAgentModel('planner', { agentDir: tmpNoManifest }), 'opus');
} finally {
  fs.rmSync(tmpNoManifest, { recursive: true, force: true });
}

// NEW CASE 5: unparseable manifest → falls through without throwing
const tmpBadManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-badmf-'));
try {
  fs.mkdirSync(tmpBadManifest, { recursive: true });
  fs.writeFileSync(path.join(tmpBadManifest, '.kaola-agent-models.json'), 'NOT VALID JSON }{');
  assert.doesNotThrow(() => resolver.resolveAgentModel('planner', { agentDir: tmpBadManifest }));
  assert.strictEqual(resolver.resolveAgentModel('planner', { agentDir: tmpBadManifest }), 'opus');
} finally {
  fs.rmSync(tmpBadManifest, { recursive: true, force: true });
}

// CONTRACTOR CASE 1: no manifest, no agent file → DEFAULT fallback must return 'sonnet'
const tmpContractorDefault = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-contractor-'));
try {
  // empty dir — no manifest, no agent file
  assert.strictEqual(resolver.resolveAgentModel('contractor', { agentDir: tmpContractorDefault }), 'sonnet');
} finally {
  fs.rmSync(tmpContractorDefault, { recursive: true, force: true });
}

// CONTRACTOR CASE 2: manifest maps contractor: 'sonnet', agent file has inherit → manifest wins
const tmpContractorManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-contractor-mf-'));
try {
  writeManifest(tmpContractorManifest, { contractor: 'sonnet' });
  writeAgent(tmpContractorManifest, 'contractor', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('contractor', { agentDir: tmpContractorManifest }), 'sonnet');
} finally {
  fs.rmSync(tmpContractorManifest, { recursive: true, force: true });
}

// #463 Slice 1 (AC14): reasoning-class floor ENFORCEMENT. The synthesizer (a REASONING_FLOOR_ROLE)
// resolves real write-leg merge conflicts BY INTENT — a reasoning-class task. A manifest/frontmatter
// override that LOWERS the floor (or an explicit inherit) is a TYPED REFUSAL, never a silent downgrade.
// A plan may RAISE but never LOWER this floor. The default path (opus) always passes.
assert.strictEqual(typeof resolver.enforceReasoningFloor, 'function', 'enforceReasoningFloor is exported');

// Default path: synthesizer -> opus default -> floor satisfied (with and without enforcement).
const tmpFloorOk = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-floor-ok-'));
try {
  assert.strictEqual(resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorOk }), 'opus');
  assert.strictEqual(resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorOk, enforceFloor: true }), 'opus',
    'enforceFloor passes the opus default through unchanged');
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', 'opus').ok, true, 'opus satisfies the synthesizer floor');
  // #610: the floor check normalizes — a plan-authored NEUTRAL `reasoning` tier satisfies the floor
  // exactly as the legacy `opus` alias does; the non-reasoning `standard`/`sonnet` tokens do NOT.
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', 'reasoning').ok, true, 'neutral reasoning tier satisfies the floor');
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', 'standard').ok, false, 'neutral standard tier violates the floor');
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', 'sonnet').ok, false, 'legacy sonnet violates the floor');
  // A non-floor role is NEVER constrained by the floor.
  assert.strictEqual(resolver.enforceReasoningFloor('code-reviewer', 'sonnet').ok, true, 'non-floor role unaffected');
  assert.strictEqual(resolver.resolveAgentModel('code-reviewer', { agentDir: tmpFloorOk, enforceFloor: true }), 'opus',
    'enforceFloor leaves non-floor roles alone');
} finally {
  fs.rmSync(tmpFloorOk, { recursive: true, force: true });
}

// A manifest override that LOWERS the synthesizer to a non-reasoning tier:
//  - WITHOUT enforceFloor: the (wrong) lowered model still returns (back-compat unchanged)
//  - WITH enforceFloor: resolveAgentModel THROWS a typed reasoning_floor_violation
//  - enforceReasoningFloor reports ok:false with the typed reason
const tmpFloorLower = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-floor-lower-'));
try {
  writeManifest(tmpFloorLower, { synthesizer: 'sonnet' });
  assert.strictEqual(resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorLower }), 'sonnet',
    'back-compat: without enforceFloor a lowered synthesizer still returns');
  const v = resolver.enforceReasoningFloor('synthesizer', 'sonnet');
  assert.strictEqual(v.ok, false, 'enforceReasoningFloor refuses a lowered synthesizer');
  assert.strictEqual(v.reason, 'reasoning_floor_violation', 'typed reason');
  assert.strictEqual(v.floor, 'opus', 'reports the floor');
  let threw = null;
  try { resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorLower, enforceFloor: true }); }
  catch (e) { threw = e; }
  assert.ok(threw, 'enforceFloor throws on a lowered synthesizer');
  assert.strictEqual(threw.reason, 'reasoning_floor_violation', 'typed reason on the thrown error');
} finally {
  fs.rmSync(tmpFloorLower, { recursive: true, force: true });
}

// An explicit inherit on a floor role is ALSO a violation under enforceFloor (inherit may resolve to a
// non-reasoning session model — the floor must not be silently surrendered).
const tmpFloorInherit = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-floor-inherit-'));
try {
  writeManifest(tmpFloorInherit, { synthesizer: 'inherit' });
  assert.strictEqual(resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorInherit }), '',
    'inherit resolves to empty without enforcement');
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', '').ok, false, 'inherit (empty) violates the floor');
  let threwI = null;
  try { resolver.resolveAgentModel('synthesizer', { agentDir: tmpFloorInherit, enforceFloor: true }); }
  catch (e) { threwI = e; }
  assert.ok(threwI && threwI.reason === 'reasoning_floor_violation', 'enforceFloor throws on inherit for a floor role');
} finally {
  fs.rmSync(tmpFloorInherit, { recursive: true, force: true });
}

console.log('Agent model resolver tests passed');
