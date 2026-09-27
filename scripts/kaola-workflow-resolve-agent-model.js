#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// kaola-workflow-resolve-agent-model.js — reads the model and reasoning effort the CURRENT Codex
// session actually runs, from that session's own JSONL record under $CODEX_HOME/sessions.
//
// It no longer resolves any subagent model. Kaola-Workflow defines no subagent roles, role
// profiles, or model bindings (#1101, ADR 0029): the role->model map, the frontmatter/default
// resolution chain, and the `<agent-name>` CLI were retired with the roles. The basename is kept
// because every edition installs this module under it.
//
// Dependency-free so installed runtimes can use it without a schema sibling on disk.

const CODEX_SESSION_SCAN_MAX_FILES = 2048;
const CODEX_SESSION_SCAN_MAX_DEPTH = 8;
const CODEX_SESSION_SCAN_MAX_DIRS = 256;
const CODEX_SESSION_SCAN_MAX_ENTRIES = 8192;
const CODEX_SESSION_FILE_MAX_BYTES = 16 * 1024 * 1024;
const CODEX_SESSION_META_PREFIX_BYTES = 64 * 1024;

function closeSessionCandidate(candidate) {
  if (!candidate || candidate.fd === undefined) return;
  try { fs.closeSync(candidate.fd); } catch (_) {}
}

function sameDescriptorStat(left, right) {
  return Boolean(left && right && left.isFile() && right.isFile()
    && left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs);
}

function readSessionDescriptor(fd, size) {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const bytes = fs.readSync(fd, buffer, offset, size - offset, offset);
    if (bytes <= 0) break;
    offset += bytes;
  }
  return offset === size ? buffer.toString('utf8') : null;
}

function loadCodexSessionProof({ codexHome, threadId } = {}) {
  const requested = String(threadId || '').trim();
  const absent = () => ({ status: 'absent', thread_id: requested || null, model: null,
    reasoning_effort: null, observed_at: null, source: 'session_jsonl' });
  if (!requested || !codexHome) return absent();
  const root = path.join(codexHome, 'sessions');
  const stack = [{ dir: root, depth: 0 }];
  let filesSeen = 0;
  let dirsSeen = 0;
  let entriesSeen = 0;
  let scanComplete = true;
  let ambiguous = false;
  let candidate = null;
  while (stack.length && scanComplete && !ambiguous) {
    if (dirsSeen >= CODEX_SESSION_SCAN_MAX_DIRS) {
      scanComplete = false;
      break;
    }
    const current = stack.pop();
    let dir;
    try { dir = fs.opendirSync(current.dir); dirsSeen++; }
    catch (_) {
      scanComplete = false;
      continue;
    }
    try {
      while (scanComplete && !ambiguous) {
        let entry;
        try { entry = dir.readSync(); }
        catch (_) {
          scanComplete = false;
          break;
        }
        if (entry === null) break;
        if (entriesSeen >= CODEX_SESSION_SCAN_MAX_ENTRIES) {
          scanComplete = false;
          break;
        }
        entriesSeen++;
        const full = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (current.depth >= CODEX_SESSION_SCAN_MAX_DEPTH) scanComplete = false;
          else stack.push({ dir: full, depth: current.depth + 1 });
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          if (filesSeen >= CODEX_SESSION_SCAN_MAX_FILES) {
            scanComplete = false;
            break;
          }
          filesSeen++;
          let fd;
          let keepFd = false;
          try {
            if (typeof fs.constants.O_NOFOLLOW !== 'number'
                || typeof fs.constants.O_NONBLOCK !== 'number') {
              scanComplete = false;
              break;
            }
            fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
            const stat = fs.fstatSync(fd, { bigint: true });
            if (!stat.isFile()) {
              scanComplete = false;
              break;
            }
            const buffer = Buffer.alloc(Number(stat.size < BigInt(CODEX_SESSION_META_PREFIX_BYTES)
              ? stat.size : BigInt(CODEX_SESSION_META_PREFIX_BYTES)));
            const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
            const lines = buffer.subarray(0, bytes).toString('utf8').split(/\r?\n/);
            let metaId = null;
            let metaClassified = false;
            for (const line of lines) {
              if (!line.trim()) continue;
              let event;
              try { event = JSON.parse(line); } catch (_) { break; }
              if (event && event.type === 'session_meta') {
                const rawId = event.payload && event.payload.id;
                if (typeof rawId === 'string' && rawId.trim()) {
                  metaId = rawId;
                  metaClassified = true;
                }
                break;
              }
            }
            if (!metaClassified && BigInt(bytes) < stat.size) scanComplete = false;
            if (metaId === requested) {
              if (candidate) ambiguous = true;
              else {
                candidate = { fd, stat, path: full };
                keepFd = true;
              }
            }
          } catch (_) {
            // The dirent already identified a regular JSONL candidate. If it cannot be opened,
            // stat-checked, or prefix-read, discovery is incomplete and cannot prove a unique binding.
            scanComplete = false;
          }
          finally { if (fd !== undefined && !keepFd) try { fs.closeSync(fd); } catch (_) {} }
        }
      }
    } finally { try { dir.closeSync(); } catch (_) {} }
  }
  try {
    if (!scanComplete || ambiguous || !candidate
        || candidate.stat.size > BigInt(CODEX_SESSION_FILE_MAX_BYTES)) return absent();
    const beforeRead = fs.fstatSync(candidate.fd, { bigint: true });
    if (!sameDescriptorStat(candidate.stat, beforeRead)) return absent();
    const content = readSessionDescriptor(candidate.fd, Number(beforeRead.size));
    const afterRead = fs.fstatSync(candidate.fd, { bigint: true });
    if (content === null || !sameDescriptorStat(beforeRead, afterRead)) return absent();
    // fd ctime is not updated on rename on some kernels/overlay; the pathname
    // still moving out from under the held inode is the swap the suite pins.
    let named;
    try { named = fs.lstatSync(candidate.path, { bigint: true }); }
    catch (_) { return absent(); }
    if (!sameDescriptorStat(afterRead, named)) return absent();
    let metaSeen = false;
    let latest = null;
    try {
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (!metaSeen && event && event.type === 'session_meta') {
          if (!event.payload || event.payload.id !== requested) return absent();
          metaSeen = true;
        }
        if (event && event.type === 'turn_context' && event.payload) latest = event;
      }
    } catch (_) { return absent(); }
    if (!metaSeen || !latest || typeof latest.payload.model !== 'string' || !latest.payload.model.trim()
        || typeof latest.payload.effort !== 'string' || !latest.payload.effort.trim()
        || typeof latest.timestamp !== 'string' || !latest.timestamp.trim()) return absent();
    return { status: 'fresh', thread_id: requested, model: latest.payload.model,
      reasoning_effort: latest.payload.effort, observed_at: latest.timestamp, source: 'session_jsonl' };
  } catch (_) {
    return absent();
  } finally {
    closeSessionCandidate(candidate);
  }
}

module.exports = {
  loadCodexSessionProof,
  CODEX_SESSION_SCAN_MAX_FILES,
  CODEX_SESSION_SCAN_MAX_DEPTH,
  CODEX_SESSION_SCAN_MAX_DIRS,
  CODEX_SESSION_SCAN_MAX_ENTRIES,
  CODEX_SESSION_FILE_MAX_BYTES,
};
