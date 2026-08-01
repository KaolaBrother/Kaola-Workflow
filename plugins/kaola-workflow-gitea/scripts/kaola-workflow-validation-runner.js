#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RECEIPT_SCHEMA_VERSION = 1;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const VERSION_PROBE_TIMEOUT_MS = 5000;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const INVARIANT_CLASS_RE = /^[a-z][a-z0-9_]{0,63}$/;
const TEST_CONSUMED_PATHS = Object.freeze([
  'README.md',
  'CHANGELOG.md',
  'docs/api.md',
  'docs/workflow-state-contract.md',
  'docs/agents-source.md',
]);

// #709: the TEST_CONSUMED_PATHS list is a SELF-HOST assumption — the four kaola-workflow test chains
// read + assert on these prose files. A CONSUMER repo (non-npm product repo — iOS/Xcode, Makefile,
// etc.) has no such chains, so a finalize-sink CHANGELOG/README/docs edit is validation-invisible
// there (matching isBarrierInvisible). Scoping the list to self-host repos (package.json declares a
// `test:kaola-workflow:<edition>` script — the exact predicate run-chains.js resolveChains uses)
// stops the self-host assumption from staling every certifier receipt in a consumer repo. Memoized
// per repoRoot (package.json does not change mid-run). Fail-closed: an indeterminate repo (present-
// but-unreadable / unparseable package.json) reads as self-host (the stricter band), so an uncertain
// probe never silently de-tiers to the consumer visibility. ENOENT (no package.json at all) is a
// genuine consumer — no npm scripts can exist.
const _selfHostCache = new Map();
function detectSelfHostNpm(repoRoot) {
  const key = String(repoRoot || '');
  if (_selfHostCache.has(key)) return _selfHostCache.get(key);
  let result;
  // #709: probe package.json at the root the CALLER resolved (computeLandableTreeDigest /
  // computeCodeTreeHash receive the git top-level from their callers, so no redundant git probe
  // here). ENOENT (no package.json) → genuine consumer. Unreadable/unparseable → fail-closed
  // (self-host, the stricter band). Memoized per root.
  try {
    const pkgRaw = fs.readFileSync(path.join(key || '.', 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
    result = ['claude', 'codex', 'gitlab', 'gitea'].some(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  } catch (e) {
    result = (e && e.code === 'ENOENT') ? false : true;
  }
  _selfHostCache.set(key, result);
  return result;
}
const TOOLCHAIN_FILES = Object.freeze([
  '.node-version',
  '.nvmrc',
  '.python-version',
  '.ruby-version',
  '.tool-versions',
  'Cargo.lock',
  'Gemfile.lock',
  'Pipfile.lock',
  'bun.lock',
  'bun.lockb',
  'go.mod',
  'go.sum',
  'npm-shrinkwrap.json',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'pyproject.toml',
  'rust-toolchain',
  'rust-toolchain.toml',
  'uv.lock',
  'yarn.lock',
]);
const SHELL_BUILTINS = new Set([
  '.', ':', '[', 'alias', 'break', 'cd', 'command', 'continue', 'echo', 'eval', 'exec',
  'exit', 'export', 'false', 'getopts', 'hash', 'jobs', 'kill', 'printf', 'pwd', 'read',
  'readonly', 'return', 'set', 'shift', 'test', 'times', 'trap', 'true', 'type', 'ulimit',
  'umask', 'unalias', 'unset', 'wait',
]);
const SHELL_KEYWORDS = new Set([
  'case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in',
  'select', 'then', 'time', 'until', 'while', '{', '}', '!',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function canonicalJson(value) {
  return encodeCanonical(value);
}

function encodeCanonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new TypeError('unsupported canonical value: numbers must be finite integers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(encodeCanonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => {
      if (value[key] === undefined) throw new TypeError(`unsupported canonical value at key "${key}"`);
      return JSON.stringify(key) + ':' + encodeCanonical(value[key]);
    }).join(',') + '}';
  }
  throw new TypeError(`unsupported canonical value of type ${typeof value}`);
}

function normalizeRepoRelative(value, field) {
  const raw = value === undefined || value === null || value === '' ? '.' : String(value);
  if (raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`${field || 'path'} must be a normalized repo-relative path`);
  }
  const segments = raw.split('/');
  if (segments.some(segment => segment === '..')) {
    throw new Error(`${field || 'path'} must not escape the repository`);
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error(`${field || 'path'} must not escape the repository`);
  }
  return normalized === '' ? '.' : normalized;
}

function normalizePolicy(input) {
  const source = input && typeof input === 'object' ? input : {};
  if (typeof source.command !== 'string' || source.command.trim() === '' || source.command.includes('\0')) {
    throw new Error('command must be a non-empty NUL-free string');
  }
  const repetitions = source.repetitions === undefined ? 1 : Number(source.repetitions);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new Error('repetitions must be an integer from 1 through 5');
  }
  const passRule = source.pass_rule === undefined ? 'all' : String(source.pass_rule);
  if (passRule !== 'all') throw new Error('pass_rule must be exactly "all"');
  const timeoutMinutes = Number(source.timeout_minutes);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 120) {
    throw new Error('timeout_minutes must be an integer from 1 through 120');
  }
  let allowlist = source.env_allowlist === undefined ? [] : source.env_allowlist;
  if (typeof allowlist === 'string') allowlist = allowlist.split(',').map(item => item.trim()).filter(Boolean);
  if (!Array.isArray(allowlist)) throw new Error('env_allowlist must be an array or comma-separated string');
  const normalizedAllowlist = [...new Set(allowlist.map(key => String(key).trim()))].sort();
  for (const key of normalizedAllowlist) {
    if (!ENV_KEY_RE.test(key)) throw new Error(`invalid environment key "${key}"`);
  }
  return Object.freeze({
    command: source.command,
    cwd: normalizeRepoRelative(source.cwd, 'cwd'),
    repetitions,
    pass_rule: passRule,
    timeout_minutes: timeoutMinutes,
    env_allowlist: Object.freeze(normalizedAllowlist),
  });
}

function valueFromEnvironment(source, key, platform) {
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  if (platform !== 'win32') return undefined;
  const wanted = key.toLowerCase();
  const actual = Object.keys(source).find(candidate => candidate.toLowerCase() === wanted);
  return actual === undefined ? undefined : source[actual];
}

function buildScrubbedEnvironment(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const source = opts.source_env && typeof opts.source_env === 'object' ? opts.source_env : {};
  const platform = opts.platform || process.platform;
  const allowlist = Array.isArray(opts.allowlist) ? opts.allowlist : [];
  const isolatedHome = String(opts.isolated_home || path.join(os.tmpdir(), 'kaola-workflow-validation', 'home'));
  const isolatedTmp = String(opts.isolated_tmp || path.join(os.tmpdir(), 'kaola-workflow-validation', 'tmp'));
  const env = Object.create(null);

  env.LANG = 'C';
  env.LC_ALL = 'C';
  env.TZ = 'UTC';
  env.HOME = isolatedHome;
  if (platform === 'win32') {
    env.TEMP = isolatedTmp;
    env.TMP = isolatedTmp;
    for (const key of ['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'WINDIR']) {
      const value = valueFromEnvironment(source, key, platform);
      if (value !== undefined) env[key] = String(value);
    }
  } else {
    env.TMPDIR = isolatedTmp;
    env.PATH = String(valueFromEnvironment(source, 'PATH', platform) || '/usr/bin:/bin');
  }

  const deterministic = new Set(Object.keys(env));
  for (const key of [...new Set(allowlist.map(String))].sort()) {
    if (!ENV_KEY_RE.test(key)) throw new Error(`invalid environment key "${key}"`);
    if (deterministic.has(key)) continue;
    const value = valueFromEnvironment(source, key, platform);
    if (value !== undefined) env[key] = String(value);
  }
  return env;
}

function digestEnvironment(environment) {
  return Object.keys(environment || {}).sort().map(key => ({ key, value_sha256: sha256(String(environment[key])) }));
}

function shellTokenize(command) {
  if (command.includes('`') || command.includes('$(')) {
    throw new Error('dynamic command substitution is unsupported');
  }
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  const pushCurrent = () => {
    if (current !== '') tokens.push({ type: 'word', value: current });
    current = '';
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\') escaped = true;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (/\s/.test(char)) {
      pushCurrent();
      if (char === '\n' || char === '\r') tokens.push({ type: 'operator', value: ';' });
      continue;
    }
    if (char === '&' || char === '|') {
      pushCurrent();
      const doubled = command[index + 1] === char;
      if (char === '&' && !doubled) throw new Error('background commands are unsupported');
      tokens.push({ type: 'operator', value: doubled ? char + char : char });
      if (doubled) index++;
      continue;
    }
    if (char === ';') {
      pushCurrent();
      tokens.push({ type: 'operator', value: ';' });
      continue;
    }
    if ('<>(){}'.includes(char)) throw new Error(`unsupported shell syntax "${char}"`);
    current += char;
  }
  if (quote !== null || escaped) throw new Error('unterminated shell quote or escape');
  pushCurrent();
  return tokens;
}

function parseSimpleCommandHeads(command) {
  if (typeof command !== 'string' || command.trim() === '') throw new Error('command is empty');
  const tokens = shellTokenize(command);
  const heads = [];
  let needHead = true;
  for (const token of tokens) {
    if (token.type === 'operator') {
      if (needHead) throw new Error('unsupported empty shell command segment');
      needHead = true;
      continue;
    }
    if (!needHead) continue;
    const head = token.value;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) {
      throw new Error('leading shell assignments are unsupported');
    }
    if (head.includes('$') || head.includes('`')) throw new Error('dynamic command heads are unsupported');
    if (SHELL_BUILTINS.has(head) || SHELL_KEYWORDS.has(head)) {
      throw new Error(`shell builtin or keyword command head "${head}" is unsupported`);
    }
    heads.push(head);
    needHead = false;
  }
  if (needHead || heads.length === 0) throw new Error('unsupported incomplete shell command');
  return heads;
}

function resolveExecutable(commandHead, cwd, environment, platform) {
  const actualPlatform = platform || process.platform;
  const hasSlash = commandHead.includes('/') || (actualPlatform === 'win32' && commandHead.includes('\\'));
  const candidates = [];
  if (hasSlash) {
    candidates.push(path.isAbsolute(commandHead) ? commandHead : path.resolve(cwd, commandHead));
  } else {
    const pathValue = valueFromEnvironment(environment || {}, 'PATH', actualPlatform) || '';
    const extensions = actualPlatform === 'win32'
      ? String(valueFromEnvironment(environment || {}, 'PATHEXT', actualPlatform) || '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
    for (const directory of String(pathValue).split(path.delimiter).filter(Boolean)) {
      if (actualPlatform === 'win32' && path.extname(commandHead)) candidates.push(path.join(directory, commandHead));
      else for (const extension of extensions) candidates.push(path.join(directory, commandHead + extension));
    }
  }
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      if (actualPlatform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (_) {}
  }
  return null;
}

function identityForPath(file, commandHead, environment, cwd, options) {
  const opts = options || {};
  let real;
  let stat;
  try {
    real = fs.realpathSync(file);
    stat = fs.statSync(real);
  } catch (_) {
    return { comparable: false, reason: 'realpath_unresolved', identity: null };
  }
  const probeArgs = Array.isArray(opts.version_args) ? opts.version_args : ['--version'];
  const result = spawnSync(real, probeArgs, {
    cwd,
    env: environment,
    encoding: 'buffer',
    timeout: opts.timeout_ms || VERSION_PROBE_TIMEOUT_MS,
    maxBuffer: opts.max_buffer || MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr || '');
  if (result.error || result.signal || result.status !== 0) {
    return { comparable: false, reason: result.error && result.error.code === 'ETIMEDOUT' ? 'version_probe_timeout' : 'version_probe_failed', identity: null };
  }
  return {
    comparable: true,
    reason: null,
    identity: {
      command_head: commandHead,
      realpath_sha256: sha256(real),
      mode: stat.mode,
      version_output_sha256: sha256(Buffer.concat([stdout, Buffer.from([0]), stderr])),
    },
  };
}

function collectToolchainIdentities(repoRoot, cwdAbs) {
  const root = fs.realpathSync(repoRoot);
  const cwd = fs.realpathSync(cwdAbs);
  const relative = path.relative(root, cwd);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('cwd resolves outside repo_root');
  }
  const directories = [root];
  if (relative) {
    let cursor = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      directories.push(cursor);
    }
  }
  const records = [];
  const seen = new Set();
  for (const directory of directories) {
    for (const name of TOOLCHAIN_FILES) {
      const file = path.join(directory, name);
      let stat;
      try { stat = fs.lstatSync(file); } catch (_) { continue; }
      if (!stat.isFile()) throw new Error(`toolchain identity is not a regular file: ${name}`);
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (seen.has(rel)) continue;
      seen.add(rel);
      records.push({ path: rel, mode: stat.mode, content_sha256: sha256(fs.readFileSync(file)) });
    }
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  return records;
}

function computeCommandId(identity) {
  const value = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    policy: identity.policy,
    effective_environment: identity.effective_environment,
    runner_node: identity.runner_node,
    execution_shell: identity.execution_shell,
    executables: identity.executables,
    toolchains: identity.toolchains,
  };
  return sha256(canonicalJson(value));
}

function defaultShellPath(environment, platform) {
  if ((platform || process.platform) === 'win32') {
    return valueFromEnvironment(environment || {}, 'ComSpec', 'win32') || 'C:\\Windows\\System32\\cmd.exe';
  }
  return '/bin/sh';
}

function collectExecutionIdentity(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const policy = normalizePolicy(opts.policy || opts);
  const repoRoot = fs.realpathSync(opts.repo_root || process.cwd());
  const cwdAbs = path.resolve(repoRoot, policy.cwd);
  const environment = opts.environment || buildScrubbedEnvironment({
    source_env: opts.source_env || process.env,
    allowlist: policy.env_allowlist,
    platform: opts.platform,
    isolated_home: opts.isolated_home,
    isolated_tmp: opts.isolated_tmp,
  });
  const reasons = [];
  let heads = [];
  try { heads = parseSimpleCommandHeads(policy.command); } catch (_) { reasons.push('command_shape_unsupported'); }

  const nodeResult = identityForPath(process.execPath, 'node', environment, cwdAbs, { version_args: ['--version'] });
  if (!nodeResult.comparable) reasons.push('runner_node_' + nodeResult.reason);
  const shellPath = defaultShellPath(environment, opts.platform);
  const shellResult = identityForPath(shellPath, 'execution-shell', environment, cwdAbs, { version_args: ['--version'] });
  if (!shellResult.comparable) reasons.push('execution_shell_' + shellResult.reason);

  const executables = [];
  for (const head of [...new Set(heads)].sort()) {
    const resolved = resolveExecutable(head, cwdAbs, environment, opts.platform);
    if (!resolved) {
      reasons.push('executable_unresolved');
      executables.push({ command_head: head, realpath_sha256: null, mode: null, version_output_sha256: null });
      continue;
    }
    const result = identityForPath(resolved, head, environment, cwdAbs, {});
    if (!result.comparable) {
      reasons.push('executable_' + result.reason);
      executables.push({ command_head: head, realpath_sha256: null, mode: null, version_output_sha256: null });
    } else {
      executables.push(result.identity);
    }
  }

  let toolchains = [];
  try { toolchains = collectToolchainIdentities(repoRoot, cwdAbs); } catch (_) { reasons.push('toolchain_identity_unresolved'); }
  const commandIdentity = {
    policy,
    effective_environment: digestEnvironment(environment),
    runner_node: nodeResult.identity,
    execution_shell: shellResult.identity,
    executables,
    toolchains,
  };
  const comparable = reasons.length === 0 && heads.length > 0;
  const executionCore = {
    runner_node: commandIdentity.runner_node,
    execution_shell: commandIdentity.execution_shell,
    executables: commandIdentity.executables,
    toolchains: commandIdentity.toolchains,
  };
  return {
    comparable,
    incomparability_classes: [...new Set(reasons)].sort(),
    digest: comparable ? sha256(canonicalJson(executionCore)) : null,
    command_id: computeCommandId(commandIdentity),
    command_identity: commandIdentity,
    shell_path: shellPath,
  };
}

function isValidationInvisible(relativePath, extraConsumed, opts) {
  const relative = String(relativePath || '').replace(/^\.\//, '');
  // #709: the self-host TEST_CONSUMED_PATHS list applies ONLY to self-host repos. A consumer repo
  // (no test:kaola-workflow:* chains) has no prose the chains read, so CHANGELOG/README/docs.api are
  // validation-invisible there (matching isBarrierInvisible). Default self_host=true is fail-closed.
  const selfHost = !(opts && opts.self_host === false);
  const baseConsumed = selfHost ? TEST_CONSUMED_PATHS : [];
  const consumed = new Set([...baseConsumed, ...(Array.isArray(extraConsumed) ? extraConsumed.map(item => normalizeRepoRelative(item, 'test_consumed_path')) : [])]);
  if (consumed.has(relative)) return false;
  if (relative === 'README.md' || relative === 'CHANGELOG.md' || relative.startsWith('docs/')) return true;
  if (relative.startsWith('kaola-workflow/')) return true;
  return false;
}

function runGit(root, args, environment, encoding) {
  return spawnSync('git', ['-C', root, ...args], {
    env: environment || process.env,
    encoding: encoding === undefined ? 'buffer' : encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function computeLandableTreeDigest(repoRoot, options) {
  const opts = options && typeof options === 'object' ? options : {};
  // #709: auto-detect self_host (consumer repos exclude CHANGELOG/README/docs from the candidate
  // digest). An explicit opts.self_host overrides the probe (test seam + deterministic calls).
  const selfHost = opts.self_host !== undefined ? opts.self_host : detectSelfHostNpm(repoRoot);
  let root;
  try { root = fs.realpathSync(repoRoot); } catch (_) { return null; }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-index-'));
  const indexPath = path.join(temp, 'index');
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: indexPath });
  try {
    const hasHead = runGit(root, ['rev-parse', '--verify', 'HEAD'], env, 'utf8');
    const seed = runGit(root, hasHead.status === 0 ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], env, 'utf8');
    if (seed.status !== 0) return null;
    const add = runGit(root, ['add', '-A'], env, 'utf8');
    if (add.status !== 0) return null;
    const tree = runGit(root, ['write-tree'], env, 'utf8');
    if (tree.status !== 0) return null;
    const treeId = String(tree.stdout || '').trim();
    if (!treeId) return null;
    const listingResult = runGit(root, ['ls-tree', '-r', '-z', treeId], env, undefined);
    if (listingResult.status !== 0 || !Buffer.isBuffer(listingResult.stdout)) return null;
    const records = [];
    let start = 0;
    const bytes = listingResult.stdout;
    for (let index = 0; index <= bytes.length; index++) {
      if (index !== bytes.length && bytes[index] !== 0) continue;
      if (index > start) {
        const record = bytes.subarray(start, index);
        const tab = record.indexOf(9);
        if (tab < 0) return null;
        const relative = record.subarray(tab + 1).toString('utf8');
        if (!isValidationInvisible(relative, opts.test_consumed_paths, { self_host: selfHost })) records.push(Buffer.from(record));
      }
      start = index + 1;
    }
    records.sort(Buffer.compare);
    const hash = crypto.createHash('sha256');
    for (const record of records) hash.update(record).update(Buffer.from([0]));
    return hash.digest('hex');
  } catch (_) {
    return null;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

// Current landable blob entries for an EXPLICIT set of repo-relative paths.
// Builds the same landable tree as computeLandableTreeDigest (HEAD + all working
// tree changes) and returns { path: '<mode> <sha>' } — the SAME per-path form the
// review journal's candidate_declared map stores (computeReviewCandidateDigest),
// so an interior review gate's certified surface can be compared byte-exactly
// between its seal-time attempt and the current tree WITHOUT re-hashing the whole
// candidate. Only requested paths present in the tree appear in the result; an
// absent path is simply omitted (an absent seal-vs-current pair compares equal
// via `=== undefined`). Returns null on any git failure (caller falls back to the
// whole-candidate binding — fail-closed). No validation-invisible / self-host
// filtering: the caller passes concrete declared code paths, and candidate_declared
// records those paths verbatim, so the two maps are directly comparable.
function computeLandableBlobEntries(repoRoot, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const want = new Set((Array.isArray(opts.paths) ? opts.paths : [])
    .map(p => String(p || '').replace(/^\.\//, '')).filter(Boolean));
  if (!want.size) return {};
  let root;
  try { root = fs.realpathSync(repoRoot); } catch (_) { return null; }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validation-blobs-'));
  const indexPath = path.join(temp, 'index');
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: indexPath });
  try {
    const hasHead = runGit(root, ['rev-parse', '--verify', 'HEAD'], env, 'utf8');
    const seed = runGit(root, hasHead.status === 0 ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], env, 'utf8');
    if (seed.status !== 0) return null;
    if (runGit(root, ['add', '-A'], env, 'utf8').status !== 0) return null;
    const tree = runGit(root, ['write-tree'], env, 'utf8');
    if (tree.status !== 0) return null;
    const treeId = String(tree.stdout || '').trim();
    if (!treeId) return null;
    const listingResult = runGit(root, ['ls-tree', '-r', '-z', treeId], env, undefined);
    if (listingResult.status !== 0 || !Buffer.isBuffer(listingResult.stdout)) return null;
    const out = Object.create(null);
    const bytes = listingResult.stdout;
    let start = 0;
    for (let index = 0; index <= bytes.length; index++) {
      if (index !== bytes.length && bytes[index] !== 0) continue;
      if (index > start) {
        const record = bytes.subarray(start, index).toString('utf8');
        const tab = record.indexOf('\t');
        if (tab >= 0) {
          const relative = record.slice(tab + 1);
          if (want.has(relative)) {
            // `<mode> <type> <sha>` before the tab — keep '<mode> <sha>' (mode carries the exec/symlink/
            // gitlink bit; type is a pure function of the mode), matching computeReviewCandidateDigest.
            const meta = record.slice(0, tab).trim().split(/\s+/);
            const mode = meta[0] || '';
            const blob = meta[2] || '';
            if (/^[0-7]{6}$/.test(mode) && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(blob)) {
              out[relative] = mode + ' ' + blob;
            } else {
              return null; // unparsable entry — fail closed rather than mis-compare
            }
          }
        }
      }
      start = index + 1;
    }
    return out;
  } catch (_) {
    return null;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function normalizeOutputText(value, absolutePaths) {
  let text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
  text = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  text = text.replace(/\r\n?/g, '\n');
  const explicit = [...new Set((absolutePaths || []).filter(Boolean).map(String))].sort((a, b) => b.length - a.length);
  for (const absolute of explicit) text = text.split(absolute).join('<ABS_PATH>');
  text = text.replace(/\b[A-Za-z]:\\(?:[^\s:'"<>|]+\\)*[^\s:'"<>|]*/g, '<ABS_PATH>');
  text = text.replace(/\/(?:[^\s:'"<>]+\/)+[^\s:'"<>]*/g, '<ABS_PATH>');
  text = text.split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n');
  return text;
}

function normalizeFailureSignature(stdout, stderr, options) {
  const paths = options && Array.isArray(options.absolute_paths) ? options.absolute_paths : [];
  const value = {
    stdout: normalizeOutputText(stdout, paths),
    stderr: normalizeOutputText(stderr, paths),
  };
  const normalized = canonicalJson(value);
  return { normalized, digest: sha256(normalized) };
}

function reduceRuns(runs, candidateDigest, executionIdentity) {
  const reasons = [];
  if (!Array.isArray(runs) || runs.length === 0) reasons.push('missing_runs');
  if (!HASH_RE.test(String(candidateDigest || ''))) reasons.push('candidate_identity_missing');
  if (!executionIdentity || executionIdentity.comparable !== true || !HASH_RE.test(String(executionIdentity.digest || ''))) {
    reasons.push('execution_identity_incomparable');
  }
  const expectedIdentity = executionIdentity && executionIdentity.digest;
  const exitCodes = [];
  const signatures = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run.timed_out === true) reasons.push('timeout');
    if (run.signal !== null && run.signal !== undefined && run.signal !== '') reasons.push('signal');
    if (run.pre_candidate_digest !== candidateDigest || run.post_candidate_digest !== candidateDigest) reasons.push('candidate_mutation');
    if (run.execution_identity_digest !== expectedIdentity) reasons.push('execution_identity_changed');
    if (!Number.isInteger(run.exit_code)) reasons.push('missing_exit_code');
    else exitCodes.push(run.exit_code);
    if (!HASH_RE.test(String(run.failure_signature_sha256 || ''))) reasons.push('failure_signature_missing');
    else signatures.push(run.failure_signature_sha256);
  }
  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) return { outcome: 'inconclusive', reasons: uniqueReasons };
  if (exitCodes.every(code => code === 0)) return { outcome: 'pass', reasons: [] };
  if (exitCodes.every(code => code !== 0) && new Set(signatures).size === 1) return { outcome: 'fail', reasons: [] };
  return { outcome: 'inconclusive', reasons: ['mixed_results_or_failure_signatures'] };
}

function buildValidationVector(input, auditRuns) {
  const executionIdentity = input.execution_identity || { comparable: false, digest: null };
  const reduction = reduceRuns(input.runs, input.candidate_digest, executionIdentity);
  const semantic = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    kind: 'validation_vector',
    command_id: input.command_id,
    candidate_digest: input.candidate_digest,
    execution_identity: {
      comparable: executionIdentity.comparable === true,
      digest: executionIdentity.digest || null,
      incomparability_classes: Array.isArray(executionIdentity.incomparability_classes)
        ? [...new Set(executionIdentity.incomparability_classes.map(String))].sort() : [],
    },
    runs: input.runs,
    outcome: reduction.outcome,
    reduction_reasons: reduction.reasons,
  };
  const vectorId = sha256(canonicalJson(semantic));
  const receipt = Object.assign({}, semantic, {
    vector_id: vectorId,
    audit: { runs: Array.isArray(auditRuns) ? auditRuns : [] },
  });
  return Object.assign({}, receipt, { receipt_sha256: computeReceiptSha256(receipt) });
}

function computeReceiptSha256(receipt) {
  const withoutSelfHash = {};
  for (const key of Object.keys(receipt || {})) {
    if (key !== 'receipt_sha256') withoutSelfHash[key] = receipt[key];
  }
  return sha256(canonicalJson(withoutSelfHash) + '\n');
}

function defaultExecute(options) {
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', options.policy.command]
    : ['-c', options.policy.command];
  const result = spawnSync(options.shell_path, args, {
    cwd: options.cwd_abs,
    env: options.environment,
    encoding: 'buffer',
    timeout: options.policy.timeout_minutes * 60 * 1000,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  return {
    exit_code: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    timed_out: !!(result.error && result.error.code === 'ETIMEDOUT'),
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || ''),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr || ''),
    execution_error_sha256: result.error ? sha256(String(result.error.code || result.error.message || 'execution_error')) : null,
  };
}

function defaultSandboxPaths(repoRoot, policy) {
  const seed = sha256(canonicalJson({ repo_root_sha256: sha256(path.resolve(repoRoot)), policy }));
  const root = path.join(os.tmpdir(), 'kaola-workflow-validation', seed);
  return { root, home: path.join(root, 'home'), tmp: path.join(root, 'tmp') };
}

function prepareSandbox(paths, explicit) {
  if (!explicit) fs.rmSync(paths.root, { recursive: true, force: true });
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.tmp, { recursive: true });
}

async function runValidation(options, adapters) {
  const opts = options && typeof options === 'object' ? options : {};
  const injected = adapters && typeof adapters === 'object' ? adapters : {};
  const policy = normalizePolicy(opts.policy || opts);
  const repoRoot = path.resolve(opts.repo_root || process.cwd());
  const cwdAbs = path.resolve(repoRoot, policy.cwd);
  const relative = path.relative(repoRoot, cwdAbs);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('cwd resolves outside repo_root');
  const defaults = defaultSandboxPaths(repoRoot, policy);
  const explicitSandbox = !!(opts.isolated_home || opts.isolated_tmp);
  const sandbox = {
    root: defaults.root,
    home: opts.isolated_home || defaults.home,
    tmp: opts.isolated_tmp || defaults.tmp,
  };
  if (typeof injected.prepare_sandbox === 'function') injected.prepare_sandbox(sandbox);
  else if (!injected.execute && !injected.collect_execution_identity) prepareSandbox(sandbox, explicitSandbox);
  const environment = buildScrubbedEnvironment({
    source_env: opts.source_env || process.env,
    allowlist: policy.env_allowlist,
    platform: opts.platform,
    isolated_home: sandbox.home,
    isolated_tmp: sandbox.tmp,
  });
  const collectIdentity = injected.collect_execution_identity || (() => collectExecutionIdentity({
    repo_root: repoRoot,
    policy,
    environment,
    platform: opts.platform,
    isolated_home: sandbox.home,
    isolated_tmp: sandbox.tmp,
  }));
  const computeCandidate = injected.compute_candidate_digest || (() => computeLandableTreeDigest(repoRoot, {
    test_consumed_paths: opts.test_consumed_paths,
  }));
  const execute = injected.execute || defaultExecute;
  const now = injected.now || Date.now;
  const toIso = injected.to_iso || (milliseconds => new Date(milliseconds).toISOString());

  const initialIdentity = await collectIdentity({ repetition: 1, phase: 'pre' });
  const commandIdentity = initialIdentity.command_identity || {
    policy,
    effective_environment: digestEnvironment(environment),
    runner_node: null,
    execution_shell: null,
    executables: [],
    toolchains: [],
  };
  const commandId = initialIdentity.command_id || computeCommandId(commandIdentity);
  const candidateDigest = await computeCandidate({ phase: 'vector' });
  const runs = [];
  const auditRuns = [];
  let currentIdentity = initialIdentity;
  for (let index = 1; index <= policy.repetitions; index++) {
    if (index > 1) currentIdentity = await collectIdentity({ repetition: index, phase: 'pre' });
    const preCandidate = await computeCandidate({ repetition: index, phase: 'pre' });
    const startedMs = Number(await now());
    const result = await execute({
      index,
      policy,
      repo_root: repoRoot,
      cwd_abs: cwdAbs,
      environment,
      shell_path: currentIdentity.shell_path || defaultShellPath(environment, opts.platform),
    });
    const endedMs = Number(await now());
    const postCandidate = await computeCandidate({ repetition: index, phase: 'post' });
    const stdout = result && result.stdout !== undefined ? result.stdout : '';
    const stderr = result && result.stderr !== undefined ? result.stderr : '';
    const failure = normalizeFailureSignature(stdout, stderr, {
      absolute_paths: [repoRoot, cwdAbs, sandbox.home, sandbox.tmp],
    });
    runs.push({
      index,
      exit_code: result && Number.isInteger(result.exit_code) ? result.exit_code : null,
      signal: result && result.signal ? String(result.signal) : null,
      timed_out: !!(result && result.timed_out),
      stdout_sha256: sha256(stdout),
      stderr_sha256: sha256(stderr),
      failure_signature_sha256: failure.digest,
      pre_candidate_digest: preCandidate || null,
      post_candidate_digest: postCandidate || null,
      execution_identity_digest: currentIdentity && currentIdentity.comparable ? currentIdentity.digest : null,
      execution_error_sha256: result && result.execution_error_sha256 ? result.execution_error_sha256 : null,
    });
    auditRuns.push({
      index,
      started_at: toIso(startedMs),
      ended_at: toIso(endedMs),
      duration_ms: Math.max(0, Math.round(endedMs - startedMs)),
    });
  }
  const vector = buildValidationVector({
    command_id: commandId,
    candidate_digest: candidateDigest || null,
    execution_identity: {
      comparable: initialIdentity.comparable === true,
      digest: initialIdentity.digest || null,
      incomparability_classes: Array.isArray(initialIdentity.incomparability_classes)
        ? initialIdentity.incomparability_classes : [],
    },
    runs,
  }, auditRuns);
  const receipt = Object.assign({}, vector, {
    command_identity: commandIdentity,
    execution_identity_incomparability_classes: Array.isArray(initialIdentity.incomparability_classes)
      ? initialIdentity.incomparability_classes : [],
  });
  receipt.receipt_sha256 = computeReceiptSha256(receipt);
  return receipt;
}

function validateQualificationOptions(options) {
  const opts = options && typeof options === 'object' ? options : {};
  for (const [name, value] of [['contract_hash', opts.contract_hash], ['context_hash', opts.context_hash]]) {
    if (!HASH_RE.test(String(value || ''))) throw new Error(`${name} must be 64 lowercase hexadecimal characters`);
  }
  if (!opts.profile_hashes || typeof opts.profile_hashes !== 'object') throw new Error('profile_hashes are required');
  for (const runtime of ['claude', 'codex']) {
    if (!HASH_RE.test(String(opts.profile_hashes[runtime] || ''))) throw new Error(`${runtime} profile hash must be 64 lowercase hexadecimal characters`);
  }
  if (!Array.isArray(opts.invariant_classes) || opts.invariant_classes.length === 0) throw new Error('at least one invariant class is required');
  const classes = [...new Set(opts.invariant_classes.map(String))].sort();
  for (const invariantClass of classes) {
    if (!INVARIANT_CLASS_RE.test(invariantClass)) throw new Error(`invalid invariant class "${invariantClass}"`);
  }
  return {
    contract_hash: opts.contract_hash,
    context_hash: opts.context_hash,
    profile_hashes: { claude: opts.profile_hashes.claude, codex: opts.profile_hashes.codex },
    invariant_classes: classes,
    timeout_minutes: Number.isInteger(Number(opts.timeout_minutes)) ? Number(opts.timeout_minutes) : 10,
  };
}

function qualificationReportFromValue(value, depth) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if (typeof value.contract_hash === 'string' && typeof value.context_hash === 'string'
      && typeof value.profile_hash === 'string' && value.invariant_classes && typeof value.invariant_classes === 'object') return value;
    for (const child of Object.values(value)) {
      const found = qualificationReportFromValue(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const candidates = [value.trim()];
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const firstBrace = value.indexOf('{');
  const lastBrace = value.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(value.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      const found = qualificationReportFromValue(parsed, depth + 1);
      if (found) return found;
    } catch (_) {}
  }
  return null;
}

function extractQualificationReport(stdout) {
  const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || '');
  const direct = qualificationReportFromValue(text, 0);
  if (direct) return direct;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const found = qualificationReportFromValue(JSON.parse(line), 0);
      if (found) return found;
    } catch (_) {}
  }
  return null;
}

function qualificationInvocation(runtime, prompt) {
  if (runtime === 'claude') {
    return {
      executable: 'claude',
      args: ['--print', '--output-format', 'json', '--no-session-persistence', '--permission-mode', 'dontAsk', '--tools', '', prompt],
    };
  }
  if (runtime === 'codex') {
    return {
      executable: 'codex',
      args: ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--ignore-rules', prompt],
    };
  }
  throw new Error(`unsupported qualification runtime "${runtime}"`);
}

function defaultQualificationAdapter(runtime, timeoutMinutes) {
  return async payload => {
    const prompt = [
      'Evaluate only the supplied machine-checkable invariant classes.',
      'Return one JSON object with contract_hash, context_hash, profile_hash, and invariant_classes.',
      'Each invariant class value must be pass, fail, or inconclusive. Do not compare prose with another runtime.',
      canonicalJson(payload),
    ].join('\n');
    const invocation = qualificationInvocation(runtime, prompt);
    const result = spawnSync(invocation.executable, invocation.args, {
      env: process.env,
      cwd: process.cwd(),
      encoding: 'buffer',
      timeout: timeoutMinutes * 60 * 1000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
    return {
      exit_code: Number.isInteger(result.status) ? result.status : null,
      signal: result.signal || null,
      timed_out: !!(result.error && result.error.code === 'ETIMEDOUT'),
      stdout,
      stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr || ''),
      report: extractQualificationReport(stdout),
    };
  };
}

async function qualifyLocalReviewers(options, processAdapters) {
  const normalized = validateQualificationOptions(options);
  if (normalized.timeout_minutes < 1 || normalized.timeout_minutes > 120) throw new Error('qualification timeout_minutes must be from 1 through 120');
  const adapters = processAdapters && typeof processAdapters === 'object' ? processAdapters : {};
  const runtimes = [];
  for (const runtime of ['claude', 'codex']) {
    const adapter = typeof adapters[runtime] === 'function'
      ? adapters[runtime]
      : defaultQualificationAdapter(runtime, normalized.timeout_minutes);
    const payload = {
      contract_hash: normalized.contract_hash,
      context_hash: normalized.context_hash,
      profile_hash: normalized.profile_hashes[runtime],
      invariant_classes: normalized.invariant_classes,
    };
    let result;
    try { result = await adapter(payload); } catch (_) { result = { exit_code: null, signal: null, timed_out: false, stdout: '', stderr: '', report: null }; }
    const report = result && result.report && typeof result.report === 'object'
      ? result.report : extractQualificationReport(result && result.stdout);
    const identityMatch = !!report
      && report.contract_hash === payload.contract_hash
      && report.context_hash === payload.context_hash
      && report.profile_hash === payload.profile_hash;
    const invariantClasses = {};
    for (const name of normalized.invariant_classes) {
      const value = report && report.invariant_classes ? report.invariant_classes[name] : null;
      invariantClasses[name] = ['pass', 'fail', 'inconclusive'].includes(value) ? value : 'inconclusive';
    }
    runtimes.push({
      runtime,
      expected_identities: {
        contract_hash: payload.contract_hash,
        context_hash: payload.context_hash,
        profile_hash: payload.profile_hash,
      },
      reported_identities: report ? {
        contract_hash: report.contract_hash || null,
        context_hash: report.context_hash || null,
        profile_hash: report.profile_hash || null,
      } : null,
      identity_match: identityMatch,
      execution: {
        exit_code: result && Number.isInteger(result.exit_code) ? result.exit_code : null,
        signal: result && result.signal ? String(result.signal) : null,
        timed_out: !!(result && result.timed_out),
      },
      invariant_classes: invariantClasses,
      stdout_sha256: sha256(result && result.stdout !== undefined ? result.stdout : ''),
      stderr_sha256: sha256(result && result.stderr !== undefined ? result.stderr : ''),
    });
  }
  const anyFailure = runtimes.some(runtime => Object.values(runtime.invariant_classes).includes('fail'));
  const anyInconclusive = runtimes.some(runtime => {
    const executionComplete = runtime.execution.exit_code === 0 && !runtime.execution.signal && !runtime.execution.timed_out;
    return !executionComplete || !runtime.identity_match || Object.values(runtime.invariant_classes).includes('inconclusive');
  });
  const outcome = anyFailure ? 'fail' : (anyInconclusive ? 'inconclusive' : 'pass');
  const semantic = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    kind: 'local_reviewer_qualification',
    contract_hash: normalized.contract_hash,
    context_hash: normalized.context_hash,
    invariant_classes: normalized.invariant_classes,
    runtimes,
    outcome,
  };
  return Object.assign({}, semantic, { qualification_id: sha256(canonicalJson(semantic)) });
}

// ── the consumer arm's final-validation producer ────────────────────────────────────────────────
// A consumer repo (no test:kaola-workflow:* chains) owns its own verification, and the finalize gate
// reads that ownership out of `kaola-workflow/<project>/.cache/final-validation.md`: a column-0
// `verdict: pass` AND a column-0 `validated_candidate_hash:` equal to a FRESHLY recomputed code-tree
// hash. The verdict was always writable by hand; the hash was not — no shipped command printed it, so
// a consumer following the recorded recipe verbatim earned `final_validation_unbound` on a run whose
// tests all passed. This verb is that missing producer.
//
// Two things it must not get wrong, both of them measured rather than reasoned:
//   • THE FUNCTION. The hash comes from the adaptive-schema's computeCodeTreeHash with the gate's own
//     default band, READ from the shared constant rather than re-typed. This script's own
//     computeLandableTreeDigest is a DIFFERENT algorithm over the same visibility band (records joined
//     by NUL and sorted as Buffers, against the schema's '\n' join) and yields a different value on the
//     same tree; recording that one buys `final_validation_stale`. There is one answer and it lives in
//     the cross-edition anchor.
//   • THE TREE, and — separately — THE FOLDER. The gate reads the two halves out of two places: the
//     record from the finalize authority's `.cache/`, and the hash over the git top level of the shell
//     the finalize ran in. In the standard worktree lane those are different trees (the authority is
//     main's run folder, which the Step-8a mirror copies from; the hashed tree is the linked worktree),
//     and main and a worktree agree ONLY while the branch carries nothing main lacks — i.e. they differ
//     across exactly the pre-merge window a finalize happens in. So the hash follows the invoking tree
//     and the record follows the run folder (resolveRecordFolder), and BOTH are reported, so a reader can
//     see which tree got bound and where the binding landed rather than trust that either was right.
//     Requiring one tree to satisfy both is the defect this pairing replaced: it left the documented
//     invocation site with nowhere to write, and the only writable checkout binding the wrong tree.
const FINAL_VALIDATION_FILE = 'final-validation.md';
// The column-0 field lines this verb OWNS. Everything else in the file is the agent's own evidence and
// survives byte-for-byte. Ownership is by field name at column zero ANYWHERE in the file, fenced or
// not, because the gate's parser is `^`-anchored and fence-blind: a field line inside a code fence is
// already a live binding, so leaving one behind would leave a second answer in the file.
const RECORD_FIELDS = Object.freeze(['verdict', 'validation_command', 'validated_candidate_hash']);

// Same rule as the shared run-folder name check: one path segment, no separators, no NUL, not a dot
// entry. Kept inline rather than imported so this ×4 byte-identical module keeps its single sibling
// require.
function isSafeProjectSegment(name) {
  return typeof name === 'string' && name.length > 0
    && !name.includes('/') && !name.includes('\\')
    && !name.includes('\0') && name !== '.' && name !== '..';
}

function gitTopLevel(dir) {
  const result = runGit(dir, ['rev-parse', '--show-toplevel'], null, 'utf8');
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

// The candidate root: THE INVOKING SHELL'S GIT TOP LEVEL, which is the tree the gate hashes. Returns ''
// when no git working tree resolves at all — reported, never guessed at.
//
// The resolveFinalizeCheckRoot call is a deliberate pass-through, and it resolves nothing today: it
// redirects only when its argument's top level differs from cwd's, and `planRoot` was just derived from
// cwd, so the two are equal by construction and it returns `planRoot` on the first branch. It is kept
// because it is the same call the gate makes over the same value, so a producer/gate divergence cannot be
// introduced there without both sides moving together — NOT because it covers a divergence. It cannot:
// the gate's redirect fires when its root came from somewhere other than cwd (a source-missing resume),
// and no argument this verb accepts can produce that.
function resolveCandidateRoot(schema) {
  const planRoot = gitTopLevel(process.cwd());
  if (!planRoot) return '';
  return gitTopLevel(schema.resolveFinalizeCheckRoot(planRoot));
}

// WHERE THE RECORD LANDS — which is not always the tree it BINDS, and requiring one tree to be both is
// unsatisfiable in the standard worktree lane. There, the run folder is resident in MAIN and the linked
// worktree does not carry it (the finalize transaction's Step 8a copies main→worktree), while the gate
// hashes the tree its own shell is in. So standing in the worktree there is nowhere to write, and
// standing in main the hash binds the wrong tree — main and a linked worktree agree only while the branch
// carries nothing main lacks, i.e. they differ across exactly the pre-merge window a finalize happens in.
// The gate itself reads the two halves from two places: the record out of the finalize authority's
// `.cache/` (in this topology main's run folder, the source the mirror copies from) and the hash over the
// invoking tree. This resolver is the write half of that pair: this tree first, then MAIN via the same
// resolver claim.js uses. It never reaches the other way — a run folder that lives only in a linked
// worktree is NOT written from main, because binding main's hash to it is the wrong tree, and the typed
// report that says so is the honest answer. `dir` is null when no live folder exists at either place, and
// `searched` carries what was looked at so the report can name it.
function resolveRecordFolder(root, project, schema) {
  const searched = [];
  const liveDir = candidate => {
    const dir = path.join(candidate, 'kaola-workflow', project);
    searched.push(dir);
    let stat = null;
    try { stat = fs.statSync(dir); } catch (_) { stat = null; }
    return stat && stat.isDirectory() ? dir : '';
  };
  const local = liveDir(root);
  if (local) return { dir: local, root, mainResident: false, searched };
  let main = '';
  try { main = schema.resolveMainRoot(root) || ''; } catch (_) { main = ''; }
  if (main && path.resolve(main) !== path.resolve(root)) {
    const inMain = liveDir(main);
    if (inMain) return { dir: inMain, root: main, mainResident: true, searched };
  }
  return { dir: null, root: '', mainResident: false, searched };
}

// Other working trees of the same repository that ALSO carry this project's run folder. Under a
// worktree run the folder exists twice (the finalize transaction mirrors worktree→main), and the gate
// binds whichever tree its own shell is in — so a record written from one checkout and a finalize run
// from the other disagree by construction. Not a refusal: the resolution above is unambiguous, and this
// is the fact a reader needs to keep it that way. null means the probe could not run.
function otherProjectRoots(root, project) {
  const listed = runGit(root, ['worktree', 'list', '--porcelain'], null, 'utf8');
  if (listed.status !== 0) return null;
  let here = root;
  try { here = fs.realpathSync(root); } catch (_) {}
  const found = [];
  for (const line of String(listed.stdout || '').split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const tree = line.slice('worktree '.length).trim();
    if (!tree) continue;
    let real = tree;
    try { real = fs.realpathSync(tree); } catch (_) {}
    if (real === here) continue;
    let stat = null;
    try { stat = fs.statSync(path.join(tree, 'kaola-workflow', project)); } catch (_) {}
    if (stat && stat.isDirectory()) found.push(tree);
  }
  found.sort();
  return found;
}

// ── the durable archive band is never a write target ───────────────────────────────────────────────
// `kaola-workflow/archive/**` holds CLOSED evidence: the record of a run the finalize transaction has
// already accounted for. Nothing this verb produces may land inside it — not the record, not the
// `--output` JSON. A stray file there is worse than litter: the closure audit walks every directory
// under the band, so `kaola-workflow/archive/.cache/` reads as a phantom project missing its
// workflow-state.md — permanent drift with nothing to repair.
//
// The question is asked of the LOCATION, never of a name. `archive` is a structurally valid single path
// segment and nothing about the string disqualifies it; what disqualifies a path is that it resolves to
// the band. Four routes there were measured, and a name check sees only the first: the literal spelling
// (`--project archive`); a `..` segment inside an `--output` path; a symlink whose target is in the
// band; and a case-variant spelling, which on a case-INsensitive filesystem is the very same directory
// while `fs.realpathSync` (measured on darwin) does NOT canonicalize the case. So the literal
// comparison is made over a `..`-normalized, symlink-followed path, and the case route is caught by
// filesystem IDENTITY instead of by string — which is also why a case-SENSITIVE filesystem, where
// `Archive/` is a genuinely different directory, keeps recording there.
function archiveBandRoot(root) {
  return path.join(root, 'kaola-workflow', 'archive');
}

// Resolve `.`/`..`, then follow symlinks for as much of the path as exists; a not-yet-created tail stays
// literal. `path.resolve` alone cannot see through a symlinked parent, and this verb is handed paths
// whose last segment is the file it is about to write.
function realResolve(target) {
  let head = path.resolve(target);
  let tail = '';
  for (;;) {
    try {
      const real = fs.realpathSync(head);
      return tail ? path.join(real, tail) : real;
    } catch (_) { /* head does not exist yet — climb */ }
    const parent = path.dirname(head);
    if (parent === head) return path.resolve(target);
    tail = tail ? path.join(path.basename(head), tail) : path.basename(head);
    head = parent;
  }
}

function isSameDirectory(a, b) {
  let left = null;
  let right = null;
  try { left = fs.statSync(a); } catch (_) { return false; }
  try { right = fs.statSync(b); } catch (_) { return false; }
  return left.dev === right.dev && left.ino === right.ino;
}

// True iff `target` IS the archive band of `root`, or sits anywhere inside it.
function isArchiveBandPath(root, target) {
  const band = realResolve(archiveBandRoot(root));
  const abs = realResolve(target);
  if (abs === band || abs.startsWith(band + path.sep)) return true;
  for (let dir = abs, previous = ''; dir !== previous; previous = dir, dir = path.dirname(dir)) {
    if (isSameDirectory(dir, band)) return true;
  }
  return false;
}

// The working tree that OWNS a path — its own git top level, found from the deepest ancestor that
// exists (the path itself is usually a file about to be created). '' when the path belongs to no
// repository. `--output` is checked against this root rather than against the record's candidate root,
// because the two are not the same band: under a worktree run the finalize transaction lands the archive
// in MAIN first, so `--output <main>/kaola-workflow/archive/…` written from the linked worktree reaches
// the durable band by a route the candidate root cannot see (measured).
function owningWorkingTree(target) {
  let dir = realResolve(target);
  for (;;) {
    let stat = null;
    try { stat = fs.statSync(dir); } catch (_) { stat = null; }
    if (stat && stat.isDirectory()) return gitTopLevel(dir);
    const parent = path.dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
}

// Archived run folders for this project — the SAME search the finalize authority resolver performs:
// `kaola-workflow/archive/<project>` or a `<project>.archived-*` sibling, looked for in this working
// tree AND in main (the finalize transaction lands the archive in main first, so a caller standing in
// the linked worktree may only find it there). Read-only, and deliberately NOT a write target: an
// archived record is closed evidence. The absence of a live folder means two very different things —
// "you are standing in the wrong checkout" and "this run is already finalized" — and only the second
// one is answered by not recording at all.
function archivedProjectPaths(root, project, schema) {
  const roots = [root];
  try {
    const main = schema.resolveMainRoot(root);
    if (main && path.resolve(main) !== path.resolve(root)) roots.push(main);
  } catch (_) {}
  const found = [];
  const seen = new Set();
  for (const candidate of roots) {
    const archiveBase = archiveBandRoot(candidate);
    let names = [];
    try { names = fs.readdirSync(archiveBase); } catch (_) { continue; }
    for (const name of names) {
      if (name !== project && !name.startsWith(project + '.archived-')) continue;
      const abs = path.resolve(archiveBase, name);
      if (seen.has(abs)) continue;
      let stat = null;
      try { stat = fs.statSync(abs); } catch (_) {}
      if (!stat || !stat.isDirectory()) continue;
      seen.add(abs);
      found.push(abs);
    }
  }
  found.sort();
  return found;
}

// PURE. Merge the owned field lines into whatever the file already holds. Every owned line is dropped
// wherever it sat and the fresh block is appended once, so re-recording is byte-idempotent (the file
// does not grow, and no superseded binding survives below the new one to win last-match-wins).
function renderFinalValidationRecord(existingText, fields) {
  const owned = new RegExp('^(?:' + RECORD_FIELDS.join('|') + '):');
  const kept = String(existingText || '').split('\n').filter(line => !owned.test(line));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  const block = RECORD_FIELDS.map(name => name + ': ' + fields[name]).join('\n');
  return (kept.length ? kept.join('\n') + '\n\n' + block : block) + '\n';
}

function recordFinalValidation(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const project = opts.project === undefined || opts.project === null ? '' : String(opts.project);
  const verdict = opts.verdict === undefined || opts.verdict === null ? '' : String(opts.verdict);
  const command = (opts.command === undefined || opts.command === null ? '' : String(opts.command)).trim();
  if (!isSafeProjectSegment(project)) throw new Error('--project must name one run folder segment under kaola-workflow/ (no separators, no NUL, not "." or "..")');
  if (verdict !== 'pass' && verdict !== 'fail') throw new Error('--verdict must be exactly "pass" or "fail"');
  if (command === '' || /[\r\n\0]/.test(command)) throw new Error('--command must be the exact validation command you ran, as a non-empty single-line NUL-free string');

  const schema = require('./kaola-workflow-adaptive-schema');
  const base = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    kind: 'final_validation_record',
    project,
    verdict,
    validation_command: command,
  };
  const inconclusive = (reason, hint) => Object.assign({}, base, {
    outcome: 'inconclusive',
    reasons: [reason],
    candidate_root: null,
    other_candidate_roots: [],
    validated_candidate_hash: null,
    record_path: null,
    operator_hint: hint,
  });

  const candidateRoot = resolveCandidateRoot(schema);
  if (!candidateRoot) {
    return inconclusive('candidate_root_unresolved',
      'No git working tree resolves from this directory, so the candidate the verdict would bind to cannot be identified. Run this from inside the checkout you validated.');
  }
  const projectPath = path.join(candidateRoot, 'kaola-workflow', project);
  // The band check needs the resolved root, so it sits here rather than beside the argument checks
  // above — it asks where `--project` POINTS, and that is not knowable from the segment alone. Same
  // register as those checks: a `--project` that names the band is a usage error, not an inconclusive
  // measurement, because no checkout and no re-run can turn the band into a run folder.
  if (isArchiveBandPath(candidateRoot, projectPath)) {
    throw new Error('--project must name a live run folder under kaola-workflow/, and ' + projectPath
      + ' resolves into the durable archive band (kaola-workflow/archive/**) — an archived run\'s record is closed'
      + ' evidence, never a write target. Record the validation against the live run folder, before finalize archives it.');
  }
  const folder = resolveRecordFolder(candidateRoot, project, schema);
  if (!folder.dir) {
    const archived = archivedProjectPaths(candidateRoot, project, schema);
    const hint = archived.length
      ? 'No live run folder at ' + projectPath + ' — this run is already archived at ' + archived.join(', ')
        + '. The binding belongs in the record BEFORE finalize, as part of the validation step that produces the verdict;'
        + ' once the transaction has archived the run its record is closed evidence and must not be edited retroactively.'
        + ' The finding on the archived run stands as recorded — a bound validation for this work is a fresh run, not an amendment to this one.'
      : 'No live run folder for this project at any of the places the finalize transaction reads one from: '
        + folder.searched.join(', ') + '. The binding has to land in that folder, and there is none.'
        + ' If the run is claimed in another linked worktree, record from that worktree; otherwise check the project name,'
        + ' or claim the run first.';
    return Object.assign(inconclusive('project_folder_missing', hint),
      { candidate_root: candidateRoot, archived_project_paths: archived });
  }
  // Read the band from the constant the gate reads, never a literal: the gate substitutes
  // VALIDATION_TEST_CONSUMES whenever it is handed no array, so the day that constant stops being
  // empty a hardcoded [] here would silently address a narrower band than the gate does.
  const hash = schema.computeCodeTreeHash(candidateRoot, project, schema.VALIDATION_TEST_CONSUMES);
  if (!hash) {
    return Object.assign(inconclusive('candidate_hash_unresolved',
      'The code-tree hash over ' + candidateRoot + ' could not be computed (git snapshot failed), so no binding can be recorded. Fix the git failure and re-record.'),
    { candidate_root: candidateRoot });
  }
  // The run-state tree is validation-invisible, so writing this file cannot move the hash it records —
  // and when the folder is main-resident the write is not even in the hashed tree.
  const recordPath = path.join(folder.dir, '.cache', FINAL_VALIDATION_FILE);
  // The band rule follows the WRITE, not a proxy for it: the destination may be another tree's folder,
  // and that tree has its own band.
  if (isArchiveBandPath(folder.root, recordPath)) {
    throw new Error('--project must name a live run folder, and ' + recordPath
      + ' resolves into the durable archive band (kaola-workflow/archive/**) — an archived run\'s record is closed'
      + ' evidence, never a write target.');
  }
  let existing = '';
  try { existing = fs.readFileSync(recordPath, 'utf8'); } catch (_) { existing = ''; }
  schema.writeFileAtomicReplace(recordPath, renderFinalValidationRecord(existing, {
    verdict,
    validation_command: command,
    validated_candidate_hash: hash,
  }));
  const others = otherProjectRoots(candidateRoot, project);
  return Object.assign({}, base, {
    outcome: 'recorded',
    candidate_root: candidateRoot,
    other_candidate_roots: others || [],
    validated_candidate_hash: hash,
    record_path: recordPath,
    operator_hint: folder.mainResident
      // The split is the normal worktree lane, not a fault — but it is surprising enough that saying
      // nothing would read as a bug, and the operator must not "help" by creating the folder here: a
      // worktree-side run folder changes the finalize authority topology this record depends on.
      ? 'This run folder lives in the main checkout, not in this working tree, so the record was written to '
        + recordPath + ' while the hash binds THIS tree (' + candidateRoot + ') — which is the pair the finalize'
        + ' gate reads: it hashes the tree its own shell is in and reads the record out of the main-resident run'
        + ' folder. Run finalize from this working tree, and do not create the run folder here by hand.'
      : (others && others.length)
        ? 'This project also has a run folder in ' + others.join(', ') + '. The finalize gate hashes the working tree its own shell is in, so run finalize from ' + candidateRoot + ' — or re-record there — or the recorded hash will read as stale.'
        : null,
  });
}

function parseCli(argv) {
  const args = [...argv];
  const subcommand = args.shift();
  const values = Object.create(null);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument "${arg}"`);
    const equals = arg.indexOf('=');
    const key = (equals >= 0 ? arg.slice(2, equals) : arg.slice(2)).replace(/-/g, '_');
    const value = equals >= 0 ? arg.slice(equals + 1) : args[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key.replace(/_/g, '-')} requires a value`);
    if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`duplicate argument --${key.replace(/_/g, '-')}`);
    values[key] = value;
  }
  return { subcommand, values };
}

function writeCliResult(result, outputPath) {
  const bytes = canonicalJson(result) + '\n';
  // `--output` is how a validation VECTOR is durably recorded, and a vector is a kernel Evidence
  // record: the receipt binding command, environment digests, repeated results and candidate that an
  // inherited validation obligation is satisfied against. A torn vector does not read as absent — it
  // reads as non-canonical, which the consumer reports as `validation_vector_not_canonical` and which
  // no re-run can repair, because the run it attests to is over. So it takes the atomic replace.
  if (outputPath) {
    require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace(path.resolve(outputPath), bytes);
  } else {
    process.stdout.write(bytes);
  }
}

function usage() {
  return [
    'usage:',
    '  kaola-workflow-validation-runner.js run --command <command> --timeout-minutes <1..120> [--repo-root <path>] [--cwd <repo-relative>] [--repetitions <1..5>] [--env-allowlist <A,B>] [--output <path>]',
    '  kaola-workflow-validation-runner.js qualify-local --contract-hash <sha256> --context-hash <sha256> --claude-profile-hash <sha256> --codex-profile-hash <sha256> --invariant-classes <a,b> [--timeout-minutes <1..120>] [--output <path>]',
    '  kaola-workflow-validation-runner.js record --project <run-folder> --verdict pass|fail --command "<exact validation command>" [--output <path>]',
  ].join('\n');
}

async function main(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage() + '\n');
    return;
  }
  const parsed = parseCli(argv);
  if (parsed.subcommand === 'run') {
    const values = parsed.values;
    const result = await runValidation({
      repo_root: values.repo_root || process.cwd(),
      policy: {
        command: values.command,
        cwd: values.cwd || '.',
        repetitions: values.repetitions === undefined ? 1 : Number(values.repetitions),
        pass_rule: 'all',
        timeout_minutes: Number(values.timeout_minutes),
        env_allowlist: values.env_allowlist || '',
      },
      source_env: process.env,
    });
    writeCliResult(result, values.output);
    if (result.outcome !== 'pass') process.exitCode = 1;
    return;
  }
  if (parsed.subcommand === 'qualify-local') {
    const values = parsed.values;
    const result = await qualifyLocalReviewers({
      contract_hash: values.contract_hash,
      context_hash: values.context_hash,
      profile_hashes: { claude: values.claude_profile_hash, codex: values.codex_profile_hash },
      invariant_classes: String(values.invariant_classes || '').split(',').map(item => item.trim()).filter(Boolean),
      timeout_minutes: values.timeout_minutes === undefined ? 10 : Number(values.timeout_minutes),
    });
    writeCliResult(result, values.output);
    if (result.outcome !== 'pass') process.exitCode = 1;
    return;
  }
  if (parsed.subcommand === 'record') {
    const values = parsed.values;
    // `--output` is checked BEFORE the record is written, not after: the band must not receive this
    // verb's JSON either, and a refusal that arrived after the write would leave a bound record whose
    // result was never reported. Nothing has happened yet at this point, so the exit is a clean usage
    // error with an empty stdout.
    const outputRoot = values.output ? owningWorkingTree(values.output) : '';
    if (outputRoot && isArchiveBandPath(outputRoot, values.output)) {
      throw new Error('--output must not resolve inside the durable archive band (kaola-workflow/archive/**) — an'
        + ' archived run\'s record is closed evidence, never a write target; ' + realResolve(values.output)
        + ' is inside it. Write the JSON outside the band.');
    }
    const result = recordFinalValidation({
      project: values.project,
      verdict: values.verdict,
      command: values.command,
    });
    // Exit 0 means THE RECORD WAS WRITTEN, not that the validation passed: a `--verdict fail` record is
    // a successful write of a failing verdict, and the gate classifies it final_validation_failed from
    // the file. Exit 1 is reserved for "no binding could be recorded" — read `reasons`.
    writeCliResult(result, values.output);
    if (result.outcome !== 'recorded') process.exitCode = 1;
    return;
  }
  throw new Error(`unknown subcommand "${parsed.subcommand || ''}"`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`validation-runner: ${error.message}\n${usage()}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  RECEIPT_SCHEMA_VERSION,
  TEST_CONSUMED_PATHS,
  detectSelfHostNpm,
  TOOLCHAIN_FILES,
  sha256,
  canonicalJson,
  normalizePolicy,
  buildScrubbedEnvironment,
  digestEnvironment,
  parseSimpleCommandHeads,
  resolveExecutable,
  collectToolchainIdentities,
  collectExecutionIdentity,
  computeCommandId,
  isValidationInvisible,
  computeLandableTreeDigest,
  computeLandableBlobEntries,
  normalizeFailureSignature,
  reduceRuns,
  buildValidationVector,
  computeReceiptSha256,
  runValidation,
  extractQualificationReport,
  qualificationInvocation,
  qualifyLocalReviewers,
  FINAL_VALIDATION_FILE,
  RECORD_FIELDS,
  renderFinalValidationRecord,
  recordFinalValidation,
};
