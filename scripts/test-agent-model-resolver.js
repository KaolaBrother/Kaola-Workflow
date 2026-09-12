#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('./kaola-workflow-resolve-agent-model.js');
const codexResolver = require('../plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js');
const schema = require('./kaola-workflow-adaptive-schema.js');
const behavior = require('../templates/agents/behavior-contracts.json');

// The behavior authority, not a resolver-local hand list, owns role membership. Runtime bindings
// may differ, but every profile/routing surface must start from this one roster. #1062 retired
// the tier axis: no role may carry an intent_class field.
const BEHAVIOR_ROLES = Object.freeze(Object.keys(behavior.roles).sort());
assert.strictEqual(BEHAVIOR_ROLES.length, 7,
  'behavior authority declares exactly the 7-role catalog');
for (const [role, contract] of Object.entries(behavior.roles)) {
  assert.ok(!('intent_class' in contract),
    `behavior authority must not carry a retired intent_class on ${role}`);
}

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

// Every installed Kaola role is on the one Codex pinned-role catalog, and the catalog declares
// the single subagent binding. A blank plan cell resolves through this map before dispatch.
assert.ok(Array.isArray(schema.CODEX_PINNED_ROLES) && schema.CODEX_PINNED_ROLES.length === 7,
  'production must export the 7-role CODEX_PINNED_ROLES catalog');
assert.deepStrictEqual([...schema.CODEX_PINNED_ROLES].sort(), BEHAVIOR_ROLES,
  'Codex pinned-role catalog is derived from the behavior authority roster');
assert.strictEqual(schema.CODEX_PINNED_MODEL, 'gpt-5.6-luna',
  'the single Codex subagent binding pins model gpt-5.6-luna');
assert.strictEqual(schema.CODEX_PINNED_EFFORT, 'max',
  'the single Codex subagent binding pins effort max');
assert.deepStrictEqual(
  [...schema.CODEX_PINNED_ROLES].sort(),
  Object.keys(resolver.DEFAULT_AGENT_MODELS).sort(),
  'the Codex pinned-role catalog must cover exactly the resolver role registry'
);

// The two tables answer different questions:
//   - DEFAULT_AGENT_MODELS is the Claude binding — every role ships the one `model: sonnet` pin.
//   - CODEX_PINNED_ROLES is the Codex role catalog — every TOML carries the one
//     gpt-5.6-luna/max subagent binding declared by CODEX_PINNED_MODEL/EFFORT.
for (const [role, model] of Object.entries(resolver.DEFAULT_AGENT_MODELS)) {
  assert.strictEqual(model, 'sonnet',
    `${role} must default to the single Claude subagent binding (sonnet)`);
  assert.ok(schema.CODEX_PINNED_ROLES.includes(role),
    `${role} must belong to the Codex pinned-role catalog`);
}

// Unknown-role / no-policy checks in preflight and the Codex installer must accept the single
// catalog. Do not keep a tier-partitioned closed universe.
const preflight = require('./kaola-workflow-codex-preflight.js');
const installer = require('../plugins/kaola-workflow/scripts/install-codex-agent-profiles.js');
assert.ok(Array.isArray(preflight.CODEX_PINNED_ROLES),
  'preflight must export CODEX_PINNED_ROLES');
assert.ok(Array.isArray(installer.CODEX_PINNED_ROLES),
  'installer must export CODEX_PINNED_ROLES');
assert.deepStrictEqual([...preflight.CODEX_PINNED_ROLES].sort(), [...schema.CODEX_PINNED_ROLES].sort(),
  'preflight pinned-role catalog must match schema');
assert.deepStrictEqual([...installer.CODEX_PINNED_ROLES].sort(), [...schema.CODEX_PINNED_ROLES].sort(),
  'installer pinned-role catalog must match schema');
// #1054 item 29 (TEST-AUTHOR EDIT, not implementer): `validateProfileText` and the
// CODEX_PINNED_* constants (including the unknown-role / "no Codex profile policy" check)
// moved to the one forge-neutral authoring source, scripts/kaola-workflow-adaptive-schema.js (4
// byte-identical kernel copies) — preflight and the installer now `require()` them from the
// kernel instead of each declaring their own copy, so the check text is absent from those two
// files BY DESIGN. Repoint the probe: assert the kernel carries the check once (over
// CODEX_PINNED_ROLES), and that each consumer requires the kernel rather than redeclaring
// the constant locally.
const kernelSource = fs.readFileSync(path.join(__dirname, 'kaola-workflow-adaptive-schema.js'), 'utf8');
{
  const idx = kernelSource.indexOf('no Codex profile policy');
  assert.ok(idx >= 0, 'kaola-workflow-adaptive-schema.js still has the unknown-role / no-policy check');
  assert.strictEqual(kernelSource.indexOf('no Codex profile policy', idx + 1), -1,
    'kaola-workflow-adaptive-schema.js carries the unknown-role / no-policy check exactly once');
  const window = kernelSource.slice(Math.max(0, idx - 500), idx + 80);
  assert.ok(/CODEX_PINNED_ROLES/.test(window),
    'kernel unknown-role check must accept CODEX_PINNED_ROLES');
  assert.ok(/module\.exports\s*=\s*{[\s\S]*\bCODEX_PINNED_ROLES\b/.test(kernelSource),
    'kernel exports CODEX_PINNED_ROLES');
}
function unknownRoleCheckSourcedFromKernel(src, label) {
  assert.ok(!/const\s+CODEX_PINNED_ROLES\s*=/.test(src),
    `${label} must not declare its own CODEX_PINNED_ROLES — it requires the kernel instead`);
  assert.ok(!src.includes('no Codex profile policy'),
    `${label} must not carry its own copy of the unknown-role / no-policy check text — the kernel is the one authoring source`);
  assert.ok(/require\((['"])\.?\/?(?:\.\.\/)*kaola-workflow-adaptive-schema\1\)/.test(src)
      && /CODEX_PINNED_ROLES/.test(src),
    `${label} must require CODEX_PINNED_ROLES from the kernel (./kaola-workflow-adaptive-schema)`);
}
unknownRoleCheckSourcedFromKernel(
  fs.readFileSync(path.join(__dirname, 'kaola-workflow-codex-preflight.js'), 'utf8'),
  'preflight');
unknownRoleCheckSourcedFromKernel(
  fs.readFileSync(path.join(__dirname, '../plugins/kaola-workflow/scripts/install-codex-agent-profiles.js'), 'utf8'),
  'install-codex');

// INSTALL-INVARIANT BINDING. The installer rewrites every installed agent's frontmatter to
// `model: inherit`, so the resolver's frontmatter step can never fire for an installed agent and
// DEFAULT_AGENT_MODELS alone decides its binding. The source frontmatter still governs one case —
// an ad-hoc dispatch pointed at the source tree — so the two must agree or the SAME role runs at
// different bindings depending only on which directory it was dispatched from. This is the check
// that makes the retired install-time model axis unrecoverable: with the manifest gone there is
// no third carrier left to paper over a disagreement.
for (const [role, model] of Object.entries(resolver.DEFAULT_AGENT_MODELS)) {
  const source = path.join(__dirname, '..', 'agents', `${role}.md`);
  assert.ok(fs.existsSync(source), `registered role ${role} must have a source agent file`);
  const frontmatter = resolver.extractFrontmatterModel(fs.readFileSync(source, 'utf8'));
  assert.strictEqual(frontmatter, model,
    `${role} source frontmatter (${frontmatter || 'none'}) must equal its DEFAULT_AGENT_MODELS binding (${model}) — `
      + 'installed agents resolve through the default map alone, so a divergence silently re-binds the role');
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

// Plants the RETIRED install-time model manifest. Resolution must ignore it entirely:
// the chain is plan column -> frontmatter -> DEFAULT_AGENT_MODELS, with no fourth input.
function plantRetiredManifest(dir, obj) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.kaola-agent-models.json'), JSON.stringify(obj));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-'));
try {
  assert.strictEqual(resolver.resolveAgentModel('tdd-guide', { agentDir: tmp }), 'sonnet');
  // #1062: metric-optimizer is retired — not in DEFAULT_AGENT_MODELS, so the resolver returns the
  // empty string (unknown role), not a fabricated binding.
  assert.strictEqual(resolver.resolveAgentModel('metric-optimizer', { agentDir: tmp }), '');

  writeAgent(tmp, 'code-reviewer', 'opus');
  assert.strictEqual(resolver.resolveAgentModel('code-reviewer', { agentDir: tmp }), 'opus');
  assert.strictEqual(resolver.formatAgentArgument('opus'), 'model="opus",');

  writeAgent(tmp, 'doc-updater', '"haiku"');
  assert.strictEqual(resolver.resolveAgentModel('doc-updater', { agentDir: tmp }), 'haiku');

  // NEW CASE 3: inherit frontmatter + no manifest entry → falls through to DEFAULT_AGENT_MODELS
  // (old behavior returned ''; new behavior returns the DEFAULT value 'sonnet')
  writeAgent(tmp, 'investigator', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('investigator', { agentDir: tmp }), 'sonnet');
  assert.strictEqual(resolver.formatAgentArgument(''), '');

  assert.strictEqual(resolver.extractFrontmatterModel('no frontmatter'), '');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// RETIRED-MANIFEST INERTNESS (#794 AC5): the precedence chain is provably THREE steps
// (plan column -> frontmatter -> DEFAULT_AGENT_MODELS). A `.kaola-agent-models.json`
// planted in the agent dir — the file older installs wrote — has NO effect on any
// resolution, in either direction (it can neither raise nor lower a role).
const tmpManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-manifest-'));
try {
  plantRetiredManifest(tmpManifest, {
    'code-reviewer': 'haiku',        // would LOWER if honored
    investigator: 'haiku',           // would LOWER if honored
    'code-explorer': 'opus',         // would RAISE if honored
    implementer: 'opus',             // would RAISE if honored
    'doc-updater': 'haiku'           // would LOWER if honored
  });
  // inherit frontmatter + planted manifest -> the static default answers, not the manifest
  writeAgent(tmpManifest, 'code-reviewer', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('code-reviewer', { agentDir: tmpManifest }), 'sonnet');
  writeAgent(tmpManifest, 'investigator', 'inherit');
  assert.strictEqual(resolver.resolveAgentModel('investigator', { agentDir: tmpManifest }), 'sonnet');
  // no agent file at all + planted manifest -> still the static default
  assert.strictEqual(resolver.resolveAgentModel('code-explorer', { agentDir: tmpManifest }), 'sonnet');
  assert.strictEqual(resolver.resolveAgentModel('implementer', { agentDir: tmpManifest }), 'sonnet');
  // a real frontmatter value still wins over the static default, and the manifest is still inert
  writeAgent(tmpManifest, 'doc-updater', 'opus');
  assert.strictEqual(resolver.resolveAgentModel('doc-updater', { agentDir: tmpManifest }), 'opus');
  // Codex static-defaults mode is likewise unaffected.
  assert.strictEqual(resolver.resolveAgentModel('code-reviewer', { agentDir: tmpManifest, staticDefaults: true }), 'sonnet');
  assert.strictEqual(resolver.resolveAgentModel('code-explorer', { agentDir: tmpManifest, staticDefaults: true }), 'sonnet');
} finally {
  fs.rmSync(tmpManifest, { recursive: true, force: true });
}

// No manifest file at all → frontmatter/DEFAULT without throwing.
const tmpNoManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-nomf-'));
try {
  assert.doesNotThrow(() => resolver.resolveAgentModel('implementer', { agentDir: tmpNoManifest }));
  assert.strictEqual(resolver.resolveAgentModel('implementer', { agentDir: tmpNoManifest }), 'sonnet');
} finally {
  fs.rmSync(tmpNoManifest, { recursive: true, force: true });
}

// An UNPARSEABLE planted manifest is equally inert — it is never read, so it cannot throw.
const tmpBadManifest = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-badmf-'));
try {
  fs.mkdirSync(tmpBadManifest, { recursive: true });
  fs.writeFileSync(path.join(tmpBadManifest, '.kaola-agent-models.json'), 'NOT VALID JSON }{');
  assert.doesNotThrow(() => resolver.resolveAgentModel('implementer', { agentDir: tmpBadManifest }));
  assert.strictEqual(resolver.resolveAgentModel('implementer', { agentDir: tmpBadManifest }), 'sonnet');
} finally {
  fs.rmSync(tmpBadManifest, { recursive: true, force: true });
}

// REGISTERED ROLE: no agent file → DEFAULT fallback must return 'sonnet'.
const tmpStandardDefault = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-standard-'));
try {
  assert.strictEqual(resolver.resolveAgentModel('implementer', { agentDir: tmpStandardDefault }), 'sonnet');
} finally {
  fs.rmSync(tmpStandardDefault, { recursive: true, force: true });
}

// #816: the RETIRED bookkeeping role is not in DEFAULT_AGENT_MODELS — the resolver must return the
// empty string (unknown role), not a fabricated tier.
const tmpRetiredRole = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-model-retired-'));
try {
  assert.strictEqual(resolver.resolveAgentModel('contractor', { agentDir: tmpRetiredRole }), '');
} finally {
  fs.rmSync(tmpRetiredRole, { recursive: true, force: true });
}

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

console.log('Agent model resolver tests passed');
