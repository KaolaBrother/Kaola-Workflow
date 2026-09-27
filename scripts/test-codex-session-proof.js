#!/usr/bin/env node
'use strict';

// test-codex-session-proof.js — the Codex-session proof in kaola-workflow-resolve-agent-model.js.
//
// The module reads the model and effort the CURRENT Codex session actually runs from that session's
// own JSONL record. Its retired half — the role->model map and the frontmatter/default resolution
// chain (formerly pinned by test-agent-model-resolver.js) — left with the roles in #1101; the
// guard that it stays gone lives in test-issue-1101-native-only.js.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('./kaola-workflow-resolve-agent-model.js');

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

console.log('Codex session proof tests passed');
