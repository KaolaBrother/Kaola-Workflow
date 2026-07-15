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
    'stable ~/.codex/kaola-workflow/scripts resolver uses declarative Codex role defaults');
} finally {
  fs.rmSync(stableHookHome, { recursive: true, force: true });
}

// Every installed Kaola role has declarative reasoning/standard default metadata. A blank plan cell
// resolves through this map before dispatch, while the Codex child pair comes from the parent session.
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
  assert.strictEqual(model, pinned ? 'sonnet' : 'opus', `${role} declarative tier must match its Codex profile class`);
  const dispatch = schema.dispatchEffort(model);
  assert.strictEqual(dispatch.codex_model, null, `${role} must not select a Codex child model from tier metadata`);
  assert.strictEqual(dispatch.codex_reasoning_effort, null, `${role} must not select Codex effort from tier metadata`);
  assert.strictEqual(dispatch.codex_model_source, 'parent_session', `${role} model source is the parent session`);
  assert.strictEqual(dispatch.codex_reasoning_effort_source, 'parent_session', `${role} effort source is the parent session`);
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

  // Current Codex mode ignores a co-installed Claude manifest and returns declarative role metadata.
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
assert.strictEqual(typeof resolver.loadCodexSessionProof, 'function', 'loadCodexSessionProof is exported');
const tmpSessionHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-proof-'));
try {
  const sessionDir = path.join(tmpSessionHome, 'sessions', '2026', '07', '15');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'rollout.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-current' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'high' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:01:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(sessionDir, 'unrelated-malformed.jsonl'), '{not-json}\n');
  assert.deepStrictEqual(resolver.loadCodexSessionProof({ codexHome: tmpSessionHome, threadId: 'thread-current' }), {
    status: 'fresh', thread_id: 'thread-current', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh',
    observed_at: '2026-07-15T00:01:00Z', source: 'session_jsonl'
  }, 'session proof loader binds the requested rollout and latest turn context');
  assert.strictEqual(resolver.loadCodexSessionProof({ codexHome: tmpSessionHome, threadId: '' }).status, 'absent',
    'missing current-thread binding fails closed');
  const matchingMalformed = path.join(sessionDir, 'matching-malformed.jsonl');
  fs.writeFileSync(matchingMalformed, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-broken' } }),
    '{broken-turn'
  ].join('\n') + '\n');
  assert.strictEqual(resolver.loadCodexSessionProof({ codexHome: tmpSessionHome, threadId: 'thread-broken' }).status, 'absent',
    'uniquely bound malformed rollout fails closed');
  assert.ok(Number.isInteger(resolver.CODEX_SESSION_SCAN_MAX_FILES) && resolver.CODEX_SESSION_SCAN_MAX_FILES > 0,
    'session discovery exposes a finite candidate-file bound');
  assert.ok(Number.isInteger(resolver.CODEX_SESSION_SCAN_MAX_DEPTH) && resolver.CODEX_SESSION_SCAN_MAX_DEPTH > 0,
    'session discovery exposes a finite depth bound');
  assert.ok(Number.isInteger(resolver.CODEX_SESSION_SCAN_MAX_DIRS) && resolver.CODEX_SESSION_SCAN_MAX_DIRS > 0,
    'session discovery exposes a finite directory bound');
  assert.ok(Number.isInteger(resolver.CODEX_SESSION_SCAN_MAX_ENTRIES) && resolver.CODEX_SESSION_SCAN_MAX_ENTRIES > 0,
    'session discovery exposes a finite directory-entry bound');
  assert.ok(Number.isInteger(resolver.CODEX_SESSION_FILE_MAX_BYTES) && resolver.CODEX_SESSION_FILE_MAX_BYTES > 0,
    'bound candidate parsing exposes a finite file-size ceiling');
} finally {
  fs.rmSync(tmpSessionHome, { recursive: true, force: true });
}

const tmpSessionIoFailureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-io-failure-'));
try {
  const sessionDir = path.join(tmpSessionIoFailureHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'readable.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-io-failure' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'high' } }),
  ].join('\n') + '\n');
  const unreadableDuplicate = path.join(sessionDir, 'unreadable-duplicate.jsonl');
  fs.writeFileSync(unreadableDuplicate, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-io-failure' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:01:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');

  const originalOpenSync = fs.openSync;
  let ioFailureObserved = false;
  fs.openSync = function openSyncWithCandidateIoFailure(file, ...args) {
    if (path.resolve(String(file)) === path.resolve(unreadableDuplicate)) {
      ioFailureObserved = true;
      const error = new Error('deterministic candidate I/O failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalOpenSync.call(fs, file, ...args);
  };
  let proof;
  try {
    proof = resolver.loadCodexSessionProof({
      codexHome: tmpSessionIoFailureHome, threadId: 'thread-io-failure'
    });
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert.strictEqual(ioFailureObserved, true,
    'candidate I/O regression deterministically rejects access to the duplicate regular JSONL');
  assert.strictEqual(proof.status, 'absent',
    'candidate I/O failure makes session-binding discovery incomplete and unable to claim uniqueness');
} finally {
  fs.rmSync(tmpSessionIoFailureHome, { recursive: true, force: true });
}

const tmpSessionTypeRaceHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-type-race-'));
try {
  const sessionDir = path.join(tmpSessionTypeRaceHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'readable.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-type-race' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'high' } }),
  ].join('\n') + '\n');
  const replacedCandidate = path.join(sessionDir, 'replaced-duplicate.jsonl');
  const heldCandidate = path.join(tmpSessionTypeRaceHome, 'held-duplicate.jsonl');
  fs.writeFileSync(replacedCandidate, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-type-race' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:01:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');

  const originalOpenSync = fs.openSync;
  let typeReplaced = false;
  fs.openSync = function openSyncWithTypeRace(file, ...args) {
    if (!typeReplaced && path.resolve(String(file)) === path.resolve(replacedCandidate)) {
      fs.renameSync(replacedCandidate, heldCandidate);
      fs.mkdirSync(replacedCandidate);
      typeReplaced = true;
    }
    return originalOpenSync.call(fs, file, ...args);
  };
  let proof;
  try {
    proof = resolver.loadCodexSessionProof({
      codexHome: tmpSessionTypeRaceHome, threadId: 'thread-type-race'
    });
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert.strictEqual(typeReplaced, true,
    'type-race regression replaces a Dirent-classified regular JSONL with a directory before open');
  assert.strictEqual(proof.status, 'absent',
    'a regular JSONL candidate that opens as non-regular makes discovery incomplete');
} finally {
  fs.rmSync(tmpSessionTypeRaceHome, { recursive: true, force: true });
}

const tmpSessionSwapHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-swap-'));
try {
  const sessionDir = path.join(tmpSessionSwapHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  const rolloutPath = path.join(sessionDir, 'rollout.jsonl');
  const heldRolloutPath = path.join(tmpSessionSwapHome, 'held-rollout.jsonl');
  const replacementPath = path.join(tmpSessionSwapHome, 'replacement.jsonl');
  fs.writeFileSync(rolloutPath, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-swap' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'high' } }),
  ].join('\n') + '\n');
  fs.writeFileSync(replacementPath, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-swap' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:01:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');

  const originalOpenSync = fs.openSync;
  const originalReadSync = fs.readSync;
  let rolloutFd = null;
  let swapped = false;
  fs.openSync = function openSyncWithSwapProbe(file, ...args) {
    const fd = originalOpenSync.call(fs, file, ...args);
    if (path.resolve(String(file)) === path.resolve(rolloutPath)) rolloutFd = fd;
    return fd;
  };
  fs.readSync = function readSyncWithSwapProbe(fd, ...args) {
    const bytes = originalReadSync.call(fs, fd, ...args);
    if (fd === rolloutFd && !swapped) {
      fs.renameSync(rolloutPath, heldRolloutPath);
      fs.symlinkSync(replacementPath, rolloutPath);
      swapped = true;
    }
    return bytes;
  };
  let proof;
  try {
    proof = resolver.loadCodexSessionProof({ codexHome: tmpSessionSwapHome, threadId: 'thread-swap' });
  } finally {
    fs.openSync = originalOpenSync;
    fs.readSync = originalReadSync;
  }
  assert.strictEqual(swapped, true, 'swap regression replaces the discovered pathname after its prefix read');
  assert.strictEqual(proof.status, 'absent', 'descriptor stability rejects a renamed validated inode');
  assert.strictEqual(proof.reasoning_effort, null,
    'same-descriptor validation must not consume a replacement symlink opened after validation');
  assert.strictEqual(proof.observed_at, null, 'rejected pathname swap exposes no rollout timestamp');
} finally {
  fs.rmSync(tmpSessionSwapHome, { recursive: true, force: true });
}

const tmpSessionRewriteHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-rewrite-'));
try {
  const sessionDir = path.join(tmpSessionRewriteHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  const rolloutPath = path.join(sessionDir, 'rollout.jsonl');
  const originalContent = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-rewrite' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'high', padding: 'x' } }),
  ].join('\n') + '\n';
  const rewrittenContent = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-rewrite' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'xhigh', padding: '' } }),
  ].join('\n') + '\n';
  assert.strictEqual(Buffer.byteLength(rewrittenContent), Buffer.byteLength(originalContent),
    'in-place rewrite fixture must retain the exact byte length');
  fs.writeFileSync(rolloutPath, originalContent);

  const writerFd = fs.openSync(rolloutPath, 'r+');
  fs.futimesSync(writerFd, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
  const originalOpenSync = fs.openSync;
  const originalReadSync = fs.readSync;
  let rolloutFd = null;
  let rewritten = false;
  fs.openSync = function openSyncWithRewriteProbe(file, ...args) {
    const fd = originalOpenSync.call(fs, file, ...args);
    if (path.resolve(String(file)) === path.resolve(rolloutPath)) rolloutFd = fd;
    return fd;
  };
  fs.readSync = function readSyncWithRewriteProbe(fd, ...args) {
    const bytes = originalReadSync.call(fs, fd, ...args);
    if (fd === rolloutFd && !rewritten) {
      const replacement = Buffer.from(rewrittenContent);
      fs.writeSync(writerFd, replacement, 0, replacement.length, 0);
      fs.fsyncSync(writerFd);
      fs.futimesSync(writerFd, new Date('2021-01-01T00:00:00Z'), new Date('2021-01-01T00:00:00Z'));
      rewritten = true;
    }
    return bytes;
  };
  let proof;
  try {
    proof = resolver.loadCodexSessionProof({ codexHome: tmpSessionRewriteHome, threadId: 'thread-rewrite' });
  } finally {
    fs.openSync = originalOpenSync;
    fs.readSync = originalReadSync;
    fs.closeSync(writerFd);
  }
  assert.strictEqual(rewritten, true, 'rewrite regression mutates the retained inode after its prefix read');
  assert.strictEqual(proof.status, 'absent',
    'equal-size in-place rewrite after prefix classification must fail descriptor stability');
} finally {
  fs.rmSync(tmpSessionRewriteHome, { recursive: true, force: true });
}

const tmpSessionLimitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-limit-'));
try {
  const sessionDir = path.join(tmpSessionLimitHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, '0000-requested.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-limit' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');
  for (let i = 1; i < resolver.CODEX_SESSION_SCAN_MAX_FILES; i += 1) {
    fs.writeFileSync(path.join(sessionDir, `${String(i).padStart(4, '0')}-unrelated.jsonl`),
      `${JSON.stringify({ type: 'session_meta', payload: { id: `unrelated-${i}` } })}\n`);
  }
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionLimitHome, threadId: 'thread-limit'
  }).status, 'fresh', 'an exactly exhausted file budget is valid when directory traversal reaches EOF');

  const beyondFrontier = path.join(sessionDir, '9999-beyond-frontier.jsonl');
  fs.writeFileSync(beyondFrontier,
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'unrelated-beyond-frontier' } })}\n`);
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionLimitHome, threadId: 'thread-limit'
  }).status, 'absent', 'a file-bound-truncated scan cannot establish unique session binding');

  fs.writeFileSync(beyondFrontier, [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-limit' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:02:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'ultra' } }),
  ].join('\n') + '\n');
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionLimitHome, threadId: 'thread-limit'
  }).status, 'absent', 'a matching duplicate beyond the scanned frontier fails closed');
} finally {
  fs.rmSync(tmpSessionLimitHome, { recursive: true, force: true });
}

const tmpSessionPrefixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-session-prefix-'));
try {
  const sessionDir = path.join(tmpSessionPrefixHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'requested.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-prefix' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(sessionDir, 'duplicate-with-bounded-meta.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: {
      id: 'thread-prefix', padding: 'x'.repeat(64 * 1024)
    } }),
    JSON.stringify({ timestamp: '2026-07-15T00:01:00Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol', effort: 'ultra' } }),
  ].join('\n') + '\n');
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionPrefixHome, threadId: 'thread-prefix'
  }).status, 'absent', 'a metadata-prefix bound that prevents classifying another rollout fails closed');
} finally {
  fs.rmSync(tmpSessionPrefixHome, { recursive: true, force: true });
}

const tmpSessionMissingIdPrefixHome = fs.mkdtempSync(
  path.join(os.tmpdir(), 'kaola-codex-session-missing-id-prefix-')
);
try {
  const sessionDir = path.join(tmpSessionMissingIdPrefixHome, 'sessions');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'requested.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { id: 'thread-missing-id-prefix' } }),
    JSON.stringify({ timestamp: '2026-07-15T00:00:00Z', type: 'turn_context',
      payload: { model: 'gpt-5.6-sol', effort: 'xhigh' } }),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(sessionDir, 'fully-read-unrelated.jsonl'),
    `${JSON.stringify({ type: 'session_meta', payload: { id: 'other-thread' } })}\n`);
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionMissingIdPrefixHome, threadId: 'thread-missing-id-prefix'
  }).status, 'fresh', 'a fully read parseably unrelated rollout remains ignorable');

  const oversizedUnclassified = [
    JSON.stringify({ type: 'session_meta', payload: {} }),
    JSON.stringify({ type: 'turn_context', payload: { padding: 'x'.repeat(70 * 1024) } }),
  ].join('\n') + '\n';
  assert.ok(Buffer.byteLength(oversizedUnclassified) > 64 * 1024,
    'missing-id regression must exceed the bounded metadata prefix');
  fs.writeFileSync(path.join(sessionDir, 'oversized-missing-id.jsonl'), oversizedUnclassified);
  assert.strictEqual(resolver.loadCodexSessionProof({
    codexHome: tmpSessionMissingIdPrefixHome, threadId: 'thread-missing-id-prefix'
  }).status, 'absent',
    'an oversized prefix with session_meta but no valid id cannot establish complete discovery');
} finally {
  fs.rmSync(tmpSessionMissingIdPrefixHome, { recursive: true, force: true });
}

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
  const missingProof = resolver.enforceReasoningFloor('synthesizer', 'reasoning', {
    runtime: 'codex', currentThreadId: 'thread-current', sessionProof: { status: 'absent' }
  });
  assert.strictEqual(missingProof.ok, false, 'Codex floor role cannot pass on tier metadata alone');
  assert.strictEqual(missingProof.reason, 'reasoning_floor_proof_missing', 'missing Codex session proof has a typed refusal');
  const freshProof = {
    status: 'fresh', thread_id: 'thread-current', model: 'gpt-5.6-sol', reasoning_effort: 'xhigh',
    observed_at: '2026-07-15T00:00:00Z', source: 'session_jsonl'
  };
  assert.strictEqual(resolver.enforceReasoningFloor('synthesizer', 'reasoning', {
    runtime: 'codex', currentThreadId: 'thread-current', sessionProof: freshProof
  }).ok, true, 'fresh current-session Sol/xhigh proof satisfies the Codex floor');
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
