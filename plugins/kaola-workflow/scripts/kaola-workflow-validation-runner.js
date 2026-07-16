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

function isValidationInvisible(relativePath, extraConsumed) {
  const relative = String(relativePath || '').replace(/^\.\//, '');
  const consumed = new Set([...TEST_CONSUMED_PATHS, ...(Array.isArray(extraConsumed) ? extraConsumed.map(item => normalizeRepoRelative(item, 'test_consumed_path')) : [])]);
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
        if (!isValidationInvisible(relative, opts.test_consumed_paths)) records.push(Buffer.from(record));
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
  if (outputPath) fs.writeFileSync(path.resolve(outputPath), bytes);
  else process.stdout.write(bytes);
}

function usage() {
  return [
    'usage:',
    '  kaola-workflow-validation-runner.js run --command <command> --timeout-minutes <1..120> [--repo-root <path>] [--cwd <repo-relative>] [--repetitions <1..5>] [--env-allowlist <A,B>] [--output <path>]',
    '  kaola-workflow-validation-runner.js qualify-local --contract-hash <sha256> --context-hash <sha256> --claude-profile-hash <sha256> --codex-profile-hash <sha256> --invariant-classes <a,b> [--timeout-minutes <1..120>] [--output <path>]',
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
  normalizeFailureSignature,
  reduceRuns,
  buildValidationVector,
  computeReceiptSha256,
  runValidation,
  extractQualificationReport,
  qualificationInvocation,
  qualifyLocalReviewers,
};
