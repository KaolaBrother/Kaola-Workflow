#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('./kaola-workflow-resolve-agent-model.js');

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
  writeManifest(tmpManifest, { 'code-architect': 'sonnet', 'security-reviewer': 'opus' });
  writeAgent(tmpManifest, 'code-architect', 'inherit');
  // manifest says sonnet; frontmatter says inherit — manifest must win
  assert.strictEqual(resolver.resolveAgentModel('code-architect', { agentDir: tmpManifest }), 'sonnet');

  // NEW CASE 2: higher-profile security-reviewer via manifest
  writeAgent(tmpManifest, 'security-reviewer', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('security-reviewer', { agentDir: tmpManifest }), 'opus');
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

console.log('Agent model resolver tests passed');
