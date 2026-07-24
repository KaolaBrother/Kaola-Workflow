#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_AGENT_MODELS = {
  'code-explorer': 'sonnet',
  'knowledge-lookup': 'sonnet',
  planner: 'opus',
  // These defaults preserve each role's declarative reasoning/wait-budget class. Codex named
  // profiles inherit runtime strength from the parent session; this map never selects a child pair.
  'code-architect': 'opus',
  'tdd-guide': 'sonnet',
  'implementer': 'sonnet',
  'build-error-resolver': 'opus',
  'code-reviewer': 'opus',
  'security-reviewer': 'opus',
  'doc-updater': 'sonnet',
  'adversarial-verifier': 'opus',
  'issue-scout': 'sonnet',
  contractor: 'sonnet',
  // #634: metric-optimizer runs a bounded metric-ratchet loop; the per-iteration reasoning is small
  // (the change-gate verifier and reviewer carry the judgment), so its default is the standard tier.
  // A plan may raise it per node; it is NOT a reasoning-floor role.
  'metric-optimizer': 'sonnet',
  'workflow-planner': 'opus',
  // #463 (write-overlap): the synthesizer resolves real write-leg merge conflicts BY INTENT — a
  // reasoning-class task. Its default is opus; a plan may RAISE but never LOWER this floor (see
  // REASONING_FLOOR_ROLES). The post-G1 intent-verifier (adversarial-verifier on a merge) is held to
  // the same floor when it is dispatched on a synthesizer's output.
  synthesizer: 'opus'
};

// #463 (write-overlap): roles whose dispatch MUST resolve to a reasoning-class model (a non-reasoning
// tier is a freeze/dispatch refusal, never a silent downgrade). The synthesizer's conflict-resolution
// path reasons about intent; a non-reasoning tier would compose bytes without understanding them.
const REASONING_FLOOR_ROLES = new Set(['synthesizer']);
// #610: the reasoning-class tier is `reasoning` (neutral), whose only legacy alias is `opus`. Accept
// BOTH so a Claude-default `opus` AND a plan-authored `reasoning` tier satisfy the floor; `standard`/
// `sonnet` (or inherit) is non-reasoning → refuse. This mirrors the schema's normalizeTier() alias map
// (kaola-workflow-adaptive-schema.js is the canonical source), but is inlined DELIBERATELY: the
// subagent-dispatch-log hook copies THIS resolver standalone (no schema sibling on disk), so a require
// of the schema would break its isolated invocation — the resolver must stay dependency-free.
function isReasoningClass(model) {
  const m = String(model || '').trim().toLowerCase();
  return m === 'reasoning' || m === 'opus';
}

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
                candidate = { fd, stat };
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

// #463 Slice 1 (AC14): ENFORCE the reasoning-class floor. For a REASONING_FLOOR_ROLES role, the
// resolved model MUST be reasoning-class; a manifest/frontmatter override that LOWERS the floor — or an
// explicit `inherit` (empty), which could resolve to a non-reasoning session model — is a typed refusal,
// never a silent downgrade. A plan may RAISE but never LOWER the floor. Non-floor roles are unaffected.
// Returns { ok, role, model, floor } on pass; { ok:false, reason, role, model, floor, operator_hint }
// on a violation. ENFORCEMENT is opt-in via resolveAgentModel({enforceFloor:true}) / the CLI
// --enforce-floor flag, so the back-compat string-return contract is unchanged for existing callers;
// the step-4 synthesizer dispatch (and the post-G1 intent-verifier) opt in.
//
// #775 TIGHTEN-ONLY DERIVATION (CLAUDE.md First Principles — an axiom/change may only make a check
// STRICTER, never looser; this removal is a loosening on its face, so the derivation is recorded here
// verbatim): the Codex leg formerly below this comment proved the reasoning floor by reading the
// PARENT session's last observed model/effort (loadCodexSessionProof) and asserting the CHILD would
// inherit it. Under Codex 0.145's multi_agent_v2 re-baseline, Codex itself resolves the sub-agent's
// model/reasoning effort ([agents].default_subagent_model / default_subagent_reasoning_effort, or
// Codex's own default) — the parent no longer determines the child. The removed check therefore
// proved a property that no longer holds: it was not a real gate, it was a FALSE correctness signal
// that could pass or fail independent of the actual dispatched model. Removing a check that asserts
// a false thing is a tightening in substance (a broken lock is not a lock), even though it is a
// loosening in the literal code-diff sense — so this satisfies the tighten-only boundary. The
// non-codex early-return immediately below is UNCHANGED and stays correct (Claude/opencode still
// resolve the model directly, so isReasoningClass(model) alone is the right and sufficient check).
function enforceReasoningFloor(role, model, options) {
  const name = String(role || '').trim();
  if (!REASONING_FLOOR_ROLES.has(name)) return { ok: true, role: name, model: model || '', floor: null };
  if (!isReasoningClass(model)) {
    return {
      ok: false,
      reason: 'reasoning_floor_violation',
      role: name,
      model: model || '(inherit)',
      floor: options && options.runtime === 'codex' ? 'gpt-5.6-sol/xhigh' : 'opus',
      operator_hint: `Role '${name}' must resolve to a reasoning-class tier; resolved '${model || 'inherit'}'.`
    };
  }
  return { ok: true, role: name, model, floor: options && options.runtime === 'codex' ? 'gpt-5.6-sol/xhigh' : 'opus' };
}

function homeDir() {
  return process.env.HOME || os.homedir();
}

function defaultAgentDir() {
  return process.env.KAOLA_AGENT_DIR || path.join(homeDir(), '.claude', 'agents');
}

function isCodexPluginScriptDir(scriptDir = __dirname) {
  const root = path.resolve(scriptDir, '..');
  const pluginBundle = fs.existsSync(path.join(root, '.codex-plugin', 'plugin.json'));
  const stableHookHome = path.basename(root) === 'kaola-workflow'
    && path.basename(path.dirname(root)) === '.codex';
  return pluginBundle || stableHookHome;
}

function extractFrontmatterModel(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return '';
  const modelLine = match[1].split(/\r?\n/).find(line => /^\s*model\s*:/.test(line));
  if (!modelLine) return '';
  return modelLine.replace(/^\s*model\s*:\s*/, '').trim().replace(/^['"]|['"]$/g, '');
}

function modelFromFile(agentName, agentDir) {
  try {
    return extractFrontmatterModel(fs.readFileSync(path.join(agentDir, `${agentName}.md`), 'utf8'));
  } catch {
    return '';
  }
}

function resolveAgentModelRaw(name, dir, options = {}) {
  // Keep Codex declarative role defaults independent of a co-installed Claude model manifest;
  // otherwise a Claude `higher`/`common` choice could silently flip tier metadata and wait budgets.
  if (options.staticDefaults && DEFAULT_AGENT_MODELS[name]) {
    const v = DEFAULT_AGENT_MODELS[name];
    return v.toLowerCase() === 'inherit' ? '' : v;
  }

  // 1. manifest: .kaola-agent-models.json in agentDir — written at install time
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.kaola-agent-models.json'), 'utf8'));
    if (manifest && Object.prototype.hasOwnProperty.call(manifest, name)) {
      const v = String(manifest[name] || '');
      return v.toLowerCase() === 'inherit' ? '' : v;
    }
  } catch { /* missing or unparseable — fall through */ }

  // 2. frontmatter, only if not 'inherit'
  const fm = modelFromFile(name, dir);
  if (fm && fm.toLowerCase() !== 'inherit') return fm;

  // 3. DEFAULT_AGENT_MODELS
  const def = DEFAULT_AGENT_MODELS[name];
  if (def) return def.toLowerCase() === 'inherit' ? '' : def;

  // 4. empty
  return '';
}

function resolveAgentModel(agentName, options = {}) {
  const name = String(agentName || '').trim();
  if (!name) return '';
  const dir = options.agentDir || defaultAgentDir();
  const staticDefaults = options.staticDefaults === true
    || (options.staticDefaults !== false && isCodexPluginScriptDir());
  const model = resolveAgentModelRaw(name, dir, { ...options, staticDefaults });
  // #463 Slice 1 (AC14): opt-in reasoning-class floor enforcement. A floor-role resolution that LOWERS
  // the floor is a typed refusal (thrown), surfaced fail-closed to the caller — never silently honored.
  if (options.enforceFloor) {
    const check = enforceReasoningFloor(name, model);
    if (!check.ok) {
      const err = new Error(check.operator_hint);
      err.reason = check.reason;
      err.role = check.role;
      err.model = check.model;
      err.floor = check.floor;
      throw err;
    }
  }
  return model;
}

function formatAgentArgument(model) {
  if (!model) return '';
  return `model="${String(model).replace(/"/g, '\\"')}",`;
}

function parseArgs(argv) {
  const args = {
    agent: '',
    format: 'raw',
    agentDir: '',
    enforceFloor: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--raw') {
      args.format = 'raw';
    } else if (arg === '--json') {
      args.format = 'json';
    } else if (arg === '--agent-arg') {
      args.format = 'agent-arg';
    } else if (arg === '--enforce-floor') {
      args.enforceFloor = true;
    } else if (arg === '--agent-dir') {
      args.agentDir = argv[i + 1] || '';
      i += 1;
    } else if (arg.startsWith('--agent-dir=')) {
      args.agentDir = arg.slice('--agent-dir='.length);
    } else if (!args.agent) {
      args.agent = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (!args.agent) {
    console.error('usage: kaola-workflow-resolve-agent-model.js <agent-name> [--raw|--json|--agent-arg] [--enforce-floor] [--agent-dir DIR]');
    process.exit(2);
  }

  // #463 Slice 1 (AC14): --enforce-floor surfaces a reasoning-floor violation as a typed refusal + a
  // non-zero exit, fail-closed, instead of silently emitting the lowered model.
  let model;
  try {
    model = resolveAgentModel(args.agent, { agentDir: args.agentDir || undefined, enforceFloor: args.enforceFloor });
  } catch (err) {
    if (err && err.reason === 'reasoning_floor_violation') {
      const refusal = { result: 'refuse', reason: err.reason, agent: args.agent, model: err.model, floor: err.floor, operator_hint: err.message };
      if (args.format === 'json') process.stdout.write(`${JSON.stringify(refusal)}\n`);
      else console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify({ agent: args.agent, model })}\n`);
  } else if (args.format === 'agent-arg') {
    const arg = formatAgentArgument(model);
    if (arg) process.stdout.write(`${arg}\n`);
  } else if (model) {
    process.stdout.write(`${model}\n`);
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_AGENT_MODELS,
  REASONING_FLOOR_ROLES,
  isReasoningClass,
  enforceReasoningFloor,
  loadCodexSessionProof,
  CODEX_SESSION_SCAN_MAX_FILES,
  CODEX_SESSION_SCAN_MAX_DEPTH,
  CODEX_SESSION_SCAN_MAX_DIRS,
  CODEX_SESSION_SCAN_MAX_ENTRIES,
  CODEX_SESSION_FILE_MAX_BYTES,
  extractFrontmatterModel,
  formatAgentArgument,
  isCodexPluginScriptDir,
  resolveAgentModel
};
