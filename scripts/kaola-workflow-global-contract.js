#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'templates', 'global', 'kaola-workflow-global.md');
const DEFAULT_REGISTRY_PATH = path.join(ROOT, 'templates', 'global', 'runtime-contract-adapters.json');
const RECEIPT_SCHEMA = 1;
const START = '<!-- KW-GLOBAL-CONTRACT-MANAGED-START -->';
const END = '<!-- KW-GLOBAL-CONTRACT-MANAGED-END -->';

class TransactionError extends Error {
  constructor(status, message, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inspect(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return { topology: 'symbolic_link', stat, bytes: null };
    if (!stat.isFile()) return { topology: 'non_regular', stat, bytes: null };
    return { topology: 'regular', stat, bytes: fs.readFileSync(file) };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { topology: 'missing', stat: null, bytes: null };
    throw error;
  }
}

function readAuthority(file, label) {
  const state = inspect(file);
  if (state.topology !== 'regular') {
    throw new TransactionError('PREFLIGHT_BLOCKED', `${label} must be a regular file: ${file}`,
      [{ path: file, reason: state.topology }]);
  }
  return state.bytes;
}

function loadRegistry(env = process.env) {
  const file = env.KAOLA_GLOBAL_CONTRACT_REGISTRY || DEFAULT_REGISTRY_PATH;
  const bytes = readAuthority(file, 'runtime adapter registry');
  let registry;
  try { registry = JSON.parse(bytes.toString('utf8')); }
  catch (error) {
    throw new TransactionError('PREFLIGHT_BLOCKED', `invalid runtime adapter registry: ${error.message}`);
  }
  if (registry.schema_version !== 1 || registry.contract_schema_version !== 1
      || !Array.isArray(registry.targets) || registry.targets.length === 0) {
    throw new TransactionError('PREFLIGHT_BLOCKED', 'unsupported runtime adapter registry schema');
  }
  const ids = new Set();
  for (const target of registry.targets) {
    if (!target || typeof target.id !== 'string' || !target.id || ids.has(target.id)
        || typeof target.runtime !== 'string' || !target.discovery || !target.carrier
        || !target.carrier_group || !target.precedence || !target.reload
        || !Array.isArray(target.compatibility_reads)) {
      throw new TransactionError('PREFLIGHT_BLOCKED', `malformed or duplicate adapter target: ${target && target.id}`);
    }
    ids.add(target.id);
  }
  return { registry, bytes, file };
}

function renderContract({ source, target, nonce = '' }) {
  const sourceText = Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
  const persistentCompactCarrier = ['grok', 'cursor'].includes(target.runtime);
  const contractText = persistentCompactCarrier
    ? require('./generate-routing-surfaces.js').renderCompactRecoveryPrompt(
      target.runtime, 'github', { globalContract: sourceText })
    : sourceText;
  const meta = [
    `Contract schema: 1`,
    ...(nonce ? [`Contract nonce: ${nonce}`] : []),
  ].join('\n');
  const body = `${contractText.trimEnd()}\n\n${meta}\n`;
  if (target.carrier.format === 'mdc') {
    return Buffer.from([
      '---',
      'description: Global workflow contract and compact-safe operation recovery',
      'globs:',
      'alwaysApply: true',
      '---',
      '',
      body,
    ].join('\n'));
  }
  return Buffer.from(body);
}

function commandExists(name, env) {
  if (!name || name.includes('/') || name.includes('\\')) return false;
  for (const dir of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, name);
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; }
    catch (_) { /* continue */ }
  }
  return false;
}

function applicationExists(discovery, env) {
  const candidates = [];
  if (discovery.app_env && env[discovery.app_env]) candidates.push(env[discovery.app_env]);
  else for (const candidate of discovery.paths || []) candidates.push(candidate);
  return candidates.some(candidate => {
    try { return fs.statSync(candidate).isDirectory(); } catch (_) { return false; }
  });
}

function isInstalled(target, env) {
  const discovery = target.discovery;
  if (discovery.kind === 'remote_explicit') return false;
  const command = (discovery.commands || []).some(name => commandExists(name, env));
  const app = applicationExists(discovery, env);
  if (discovery.kind === 'command') return command;
  if (discovery.kind === 'application') return app;
  if (discovery.kind === 'command_or_application') return command || app;
  throw new TransactionError('PREFLIGHT_BLOCKED', `unknown discovery kind for ${target.id}`);
}

function runtimeRoot(target, env) {
  const carrier = target.carrier;
  if (carrier.root_env && env[carrier.root_env]) return path.resolve(env[carrier.root_env]);
  const home = env.HOME;
  if (!home || !path.isAbsolute(home)) {
    throw new TransactionError('PREFLIGHT_BLOCKED', `HOME must be absolute for ${target.id}`);
  }
  return path.join(home, ...carrier.default_root.split('/'));
}

function resolveCarrier(target, env, cloudRoot = null) {
  if (target.carrier.kind === 'cloud_project_rule') {
    if (!cloudRoot) throw new TransactionError('PREFLIGHT_BLOCKED', 'Cursor Cloud target needs an explicit repository');
    const root = path.resolve(cloudRoot);
    return { root, path: path.join(root, ...target.carrier.relative_path.split('/')) };
  }
  const root = runtimeRoot(target, env);
  return { root, path: path.join(root, ...target.carrier.relative_path.split('/')) };
}

function allIndexes(bytes, token) {
  const out = [];
  let offset = 0;
  while (offset <= bytes.length - token.length) {
    const found = bytes.indexOf(token, offset);
    if (found < 0) break;
    out.push(found);
    offset = found + token.length;
  }
  return out;
}

function managedRegion(bytes) {
  bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '');
  const startToken = Buffer.from(START);
  const endToken = Buffer.from(END);
  const starts = allIndexes(bytes, startToken);
  const ends = allIndexes(bytes, endToken);
  if (starts.length === 0 && ends.length === 0) return { kind: 'absent' };
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) return { kind: 'malformed' };
  return { kind: 'managed', start: starts[0], end: ends[0] + endToken.length };
}

function managedBytes(rendered) {
  return Buffer.concat([Buffer.from(`${START}\n`), rendered, Buffer.from(`${END}`)]);
}

function buildManaged(before, rendered, priorRow) {
  const current = before || Buffer.alloc(0);
  const region = managedRegion(current);
  if (region.kind === 'malformed') {
    throw new TransactionError('PREFLIGHT_BLOCKED', 'malformed or duplicate managed contract markers');
  }
  const replacement = managedBytes(rendered);
  if (region.kind === 'managed') {
    const existing = current.subarray(region.start, region.end);
    const priorOwns = priorRow && priorRow.install_sha256 === sha256(current);
    if (!existing.equals(replacement) && !priorOwns) {
      throw new TransactionError('OWNER_CONFLICT', 'managed contract region differs without a matching receipt');
    }
    return {
      after: Buffer.concat([current.subarray(0, region.start), replacement, current.subarray(region.end)]),
      origin: priorRow && priorRow.managed_origin ? priorRow.managed_origin : {
        kind: 'managed', insert_prefix_bytes: 0, insert_suffix_bytes: 0,
      },
    };
  }
  const prefix = current.length > 0 && current[current.length - 1] !== 0x0a ? Buffer.from('\n') : Buffer.alloc(0);
  const suffix = Buffer.from('\n');
  return {
    after: Buffer.concat([current, prefix, replacement, suffix]),
    origin: { kind: 'absent', insert_prefix_bytes: prefix.length, insert_suffix_bytes: suffix.length },
  };
}

function stripManaged(current, row) {
  const region = managedRegion(current);
  if (region.kind !== 'managed') {
    throw new TransactionError('OWNER_CONFLICT', `managed carrier markers missing at ${row.path}`);
  }
  const origin = row.managed_origin || { kind: 'managed', insert_prefix_bytes: 0, insert_suffix_bytes: 0 };
  let start = region.start;
  let end = region.end;
  if (origin.kind === 'absent') {
    start = Math.max(0, start - Number(origin.insert_prefix_bytes || 0));
    end = Math.min(current.length, end + Number(origin.insert_suffix_bytes || 0));
  }
  return Buffer.concat([current.subarray(0, start), current.subarray(end)]);
}

function assertSafePath(file, boundary) {
  const root = path.resolve(boundary);
  const target = path.resolve(file);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new TransactionError('PREFLIGHT_BLOCKED', `carrier escapes its declared root: ${target}`);
  }
  let cursor = root;
  const relative = path.relative(root, target).split(path.sep).filter(Boolean);
  for (let i = 0; i < relative.length; i += 1) {
    cursor = path.join(cursor, relative[i]);
    const state = inspect(cursor);
    if (state.topology === 'missing') continue;
    if (state.topology === 'symbolic_link') {
      throw new TransactionError('PREFLIGHT_BLOCKED', `symlink is not a safe contract carrier: ${cursor}`);
    }
    if (i < relative.length - 1 && !fs.lstatSync(cursor).isDirectory()) {
      throw new TransactionError('PREFLIGHT_BLOCKED', `non-directory carrier ancestor: ${cursor}`);
    }
  }
}

function receiptPath(env) {
  if (env.KAOLA_GLOBAL_CONTRACT_RECEIPT) return path.resolve(env.KAOLA_GLOBAL_CONTRACT_RECEIPT);
  if (!env.HOME || !path.isAbsolute(env.HOME)) {
    throw new TransactionError('PREFLIGHT_BLOCKED', 'HOME must be absolute for the global receipt');
  }
  return path.join(env.HOME, '.config', 'kaola-workflow', 'global-contract-receipt.json');
}

function loadReceipt(file) {
  const state = inspect(file);
  if (state.topology === 'missing') return null;
  if (state.topology !== 'regular') {
    throw new TransactionError('PREFLIGHT_BLOCKED', `receipt is not a regular file: ${file}`);
  }
  let receipt;
  try { receipt = JSON.parse(state.bytes.toString('utf8')); }
  catch (error) { throw new TransactionError('PREFLIGHT_BLOCKED', `invalid receipt: ${error.message}`); }
  if (!Number.isInteger(receipt.schema_version) || receipt.schema_version > RECEIPT_SCHEMA) {
    throw new TransactionError('PREFLIGHT_BLOCKED', `unsupported future receipt schema: ${receipt.schema_version}`);
  }
  if (receipt.schema_version !== RECEIPT_SCHEMA || !Array.isArray(receipt.targets)) {
    throw new TransactionError('PREFLIGHT_BLOCKED', 'unsupported receipt schema');
  }
  return receipt;
}

function rowForPath(receipt, file) {
  if (!receipt) return null;
  return receipt.targets.find(row => row && row.path === file && row.install_sha256) || null;
}

function planTargets({ registry, source, env, nonce, cloudRoot = null, onlyCloud = false }) {
  const rows = [];
  const physical = new Map();
  const selected = onlyCloud
    ? registry.targets.filter(target => target.id === 'cursor-cloud')
    : registry.targets.filter(target => target.id !== 'cursor-cloud');
  for (const target of registry.targets) {
    if (onlyCloud && target.id !== 'cursor-cloud') continue;
    if (!onlyCloud && target.id === 'cursor-cloud') {
      rows.push({ id: target.id, runtime: target.runtime, host: target.host, status: 'REMOTE_REQUIRED',
        carrier: target.carrier.kind, precedence: target.precedence, reload: target.reload });
      continue;
    }
    const installed = onlyCloud || isInstalled(target, env);
    if (!installed) {
      rows.push({ id: target.id, runtime: target.runtime, host: target.host, status: 'NOT_INSTALLED',
        carrier: target.carrier.kind, precedence: target.precedence, reload: target.reload });
      continue;
    }
    const resolved = resolveCarrier(target, env, cloudRoot);
    const rendered = renderContract({ source, target, nonce });
    rows.push({ id: target.id, runtime: target.runtime, host: target.host, status: 'PLANNED',
      path: resolved.path, root: resolved.root, carrier: target.carrier.kind,
      carrier_group: target.carrier_group, precedence: target.precedence, reload: target.reload,
      source_sha256: sha256(source), render_sha256: sha256(rendered) });
    const prior = physical.get(resolved.path);
    if (prior) {
      if (prior.group !== target.carrier_group || !prior.rendered.equals(rendered)) {
        throw new TransactionError('PREFLIGHT_BLOCKED', `duplicate physical carrier has conflicting owners: ${resolved.path}`);
      }
      prior.targetIds.push(target.id);
    } else {
      physical.set(resolved.path, {
        path: resolved.path, root: resolved.root, group: target.carrier_group,
        carrier: target.carrier.kind, rendered, targetIds: [target.id], target,
      });
    }
  }
  return { rows, physical };
}

function buildPhysicalPlans({ physical, priorReceipt }) {
  const plans = [];
  for (const item of physical.values()) {
    assertSafePath(item.path, item.root);
    const state = inspect(item.path);
    if (state.topology === 'symbolic_link' || state.topology === 'non_regular') {
      throw new TransactionError('PREFLIGHT_BLOCKED', `unsafe carrier topology at ${item.path}`);
    }
    const before = state.bytes || Buffer.alloc(0);
    const priorRow = rowForPath(priorReceipt, item.path);
    let after;
    let managedOrigin = null;
    if (item.carrier === 'managed_region') {
      const built = buildManaged(before, item.rendered, priorRow);
      after = built.after;
      managedOrigin = built.origin;
    } else {
      const priorOwns = priorRow && priorRow.install_sha256 === sha256(before);
      if (state.topology === 'regular' && !before.equals(item.rendered) && !priorOwns) {
        throw new TransactionError('OWNER_CONFLICT', `dedicated carrier contains owner bytes: ${item.path}`);
      }
      after = item.rendered;
    }
    plans.push({ ...item, state, before, after, managedOrigin });
  }
  return plans;
}

function atomicWrite(file, bytes, priorStat = null) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = priorStat ? priorStat.mode & 0o777 : 0o644;
  const temp = `${file}.kw-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  try {
    fs.writeFileSync(temp, bytes, { mode });
    fs.chmodSync(temp, mode);
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (_) { /* best effort */ }
    throw error;
  }
}

function restoreFile(backup) {
  if (backup.existed) atomicWrite(backup.path, backup.bytes, backup.stat);
  else {
    try { fs.unlinkSync(backup.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function commitWrites(writes) {
  const backups = [];
  try {
    for (const write of writes) {
      const state = inspect(write.path);
      backups.push({ path: write.path, existed: state.topology === 'regular', bytes: state.bytes, stat: state.stat });
      if (write.remove) {
        if (state.topology === 'regular') fs.unlinkSync(write.path);
      } else {
        atomicWrite(write.path, write.bytes, state.stat);
      }
    }
  } catch (error) {
    for (const backup of backups.reverse()) {
      try { restoreFile(backup); } catch (_) { /* preserve original error */ }
    }
    throw new TransactionError('PREFLIGHT_BLOCKED', `transaction write failed and was rolled back: ${error.message}`);
  }
}

function materializeRows(rows, plans, status, priorReceipt = null) {
  const byPath = new Map(plans.map(plan => [plan.path, plan]));
  const priorById = new Map((priorReceipt && priorReceipt.targets || []).map(row => [row.id, row]));
  return rows.map(row => {
    const plan = row.path && byPath.get(row.path);
    if (!plan) return row;
    const prior = priorById.get(row.id);
    const convergedPrior = prior && plan.before.equals(plan.after)
      && prior.install_sha256 === sha256(plan.before);
    return {
      ...row, status,
      install_sha256: sha256(plan.after),
      before_sha256: convergedPrior ? prior.before_sha256 : sha256(plan.before),
      ...(plan.managedOrigin ? {
        managed_origin: convergedPrior && prior.managed_origin
          ? prior.managed_origin : plan.managedOrigin,
      } : {}),
    };
  });
}

function makeReceipt({ rows, source, registryBytes, nonce, kind = 'local_batch', candidateSha = null,
  installedAt = null }) {
  return {
    schema_version: RECEIPT_SCHEMA,
    contract_schema_version: 1,
    kind,
    status: 'CURRENT',
    source_sha256: sha256(source),
    registry_sha256: sha256(registryBytes),
    nonce: nonce || null,
    candidate_sha: candidateSha,
    installed_at: installedAt || new Date().toISOString(),
    targets: rows,
  };
}

function candidateSha(env = process.env) {
  const explicit = env.KAOLA_CANDIDATE_SHA;
  if (explicit && /^[0-9a-f]{40}$/i.test(explicit)) return explicit.toLowerCase();
  const result = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', env,
  });
  const value = result.status === 0 ? String(result.stdout || '').trim() : '';
  return /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function execute(options = {}) {
  const mode = options.mode || 'check';
  const env = options.env || process.env;
  const nonce = options.nonce || '';
  const source = readAuthority(SOURCE_PATH, 'global contract source');
  const { registry, bytes: registryBytes } = loadRegistry(env);
  const onlyCloud = mode.endsWith('-cloud') || mode === 'install-cloud';
  const baseMode = mode.replace(/-cloud$/, '').replace(/^install-cloud$/, 'install');
  const cloudRoot = options.target ? path.resolve(options.target) : null;
  if (onlyCloud) {
    if (!cloudRoot || !fs.existsSync(cloudRoot) || !fs.statSync(cloudRoot).isDirectory()
        || !fs.existsSync(path.join(cloudRoot, '.git'))) {
      throw new TransactionError('PREFLIGHT_BLOCKED', 'Cursor Cloud needs an explicit initialized Git repository');
    }
  }
  const receiptFile = onlyCloud
    ? path.join(cloudRoot, '.cursor', 'kaola-workflow', 'global-contract-receipt.json')
    : receiptPath(env);
  const receiptBoundary = onlyCloud ? cloudRoot : path.dirname(receiptFile);
  assertSafePath(receiptFile, receiptBoundary);
  const priorReceipt = loadReceipt(receiptFile);

  if (baseMode === 'uninstall') {
    if (!priorReceipt) {
      return { schema_version: 1, status: 'NOT_INSTALLED', receipt_path: receiptFile, targets: [] };
    }
    const allowed = new Map();
    for (const target of registry.targets) {
      if (onlyCloud !== (target.id === 'cursor-cloud')) continue;
      const resolved = resolveCarrier(target, env, cloudRoot);
      allowed.set(target.id, {
        path: resolved.path,
        root: resolved.root,
        carrier: target.carrier.kind,
        carrier_group: target.carrier_group,
      });
    }
    const unique = new Map();
    for (const row of priorReceipt.targets) {
      if (!row || row.status !== 'INSTALLED') continue;
      const expected = allowed.get(row.id);
      if (!expected || row.path !== expected.path || row.carrier !== expected.carrier
          || row.carrier_group !== expected.carrier_group) {
        throw new TransactionError('OWNER_CONFLICT',
          `receipt target no longer matches the runtime registry: ${row.id || '<missing>'}`);
      }
      assertSafePath(row.path, expected.root);
      const duplicate = unique.get(row.path);
      if (duplicate) {
        if (duplicate.install_sha256 !== row.install_sha256
            || duplicate.carrier !== row.carrier
            || JSON.stringify(duplicate.managed_origin || null)
              !== JSON.stringify(row.managed_origin || null)) {
          throw new TransactionError('OWNER_CONFLICT',
            `duplicate receipt rows disagree for carrier: ${row.path}`);
        }
        continue;
      }
      unique.set(row.path, row);
    }
    const writes = [];
    for (const row of unique.values()) {
      const state = inspect(row.path);
      if (state.topology !== 'regular' || sha256(state.bytes) !== row.install_sha256) {
        throw new TransactionError('OWNER_CONFLICT', `receipt-owned carrier changed: ${row.path}`);
      }
      if (row.carrier === 'managed_region') {
        writes.push({ path: row.path, bytes: stripManaged(state.bytes, row) });
      } else {
        writes.push({ path: row.path, remove: true });
      }
    }
    writes.push({ path: receiptFile, remove: true });
    commitWrites(writes);
    return { schema_version: 1, status: 'UNINSTALLED', receipt_path: receiptFile,
      targets: priorReceipt.targets };
  }

  const planned = planTargets({ registry, source, env, nonce, cloudRoot, onlyCloud });
  const plans = buildPhysicalPlans({ physical: planned.physical, priorReceipt });
  const projectedRows = materializeRows(planned.rows, plans, 'INSTALLED', priorReceipt);
  const expectedReceipt = makeReceipt({ rows: projectedRows, source, registryBytes, nonce,
    kind: onlyCloud ? 'cursor_cloud' : 'local_batch', candidateSha: candidateSha(env),
    installedAt: priorReceipt && priorReceipt.installed_at });

  if (baseMode === 'check') {
    let current = !!priorReceipt
      && priorReceipt.contract_schema_version === expectedReceipt.contract_schema_version
      && priorReceipt.source_sha256 === expectedReceipt.source_sha256
      && priorReceipt.registry_sha256 === expectedReceipt.registry_sha256
      && (priorReceipt.nonce || '') === (nonce || '');
    const priorById = new Map((priorReceipt && priorReceipt.targets || []).map(row => [row.id, row]));
    const checkedRows = projectedRows.map(row => {
      if (row.status !== 'INSTALLED') return row;
      const before = plans.find(plan => plan.path === row.path).before;
      const prior = priorById.get(row.id);
      const rowCurrent = before.equals(plans.find(plan => plan.path === row.path).after)
        && prior && prior.install_sha256 === sha256(before);
      if (!rowCurrent) current = false;
      return { ...row, status: rowCurrent ? 'CURRENT' : 'DRIFT' };
    });
    return { schema_version: 1, status: current ? 'CURRENT' : 'DRIFT',
      receipt_path: receiptFile, source_sha256: sha256(source), targets: checkedRows };
  }

  if (baseMode !== 'install') throw new TransactionError('PREFLIGHT_BLOCKED', `unknown mode: ${mode}`);
  const rows = projectedRows;
  const receipt = makeReceipt({ rows, source, registryBytes, nonce,
    kind: onlyCloud ? 'cursor_cloud' : 'local_batch', candidateSha: candidateSha(env),
    installedAt: priorReceipt && priorReceipt.installed_at });
  const writes = plans.map(plan => ({ path: plan.path, bytes: plan.after }));
  writes.push({ path: receiptFile, bytes: Buffer.from(JSON.stringify(receipt, null, 2) + '\n') });
  commitWrites(writes);
  return {
    schema_version: 1,
    status: plans.length === 0 ? 'NO_TARGETS' : 'INSTALLED',
    receipt_path: receiptFile,
    source_sha256: sha256(source),
    registry_sha256: sha256(registryBytes),
    ...(onlyCloud ? { target: rows[0] } : {}),
    targets: rows,
  };
}

function parseArgs(argv) {
  const mode = argv[2];
  const json = argv.includes('--json');
  let nonce = '';
  let target = null;
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === '--json') continue;
    if (argv[i] === '--nonce' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      nonce = argv[++i]; continue;
    }
    if (argv[i] === '--target' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      target = argv[++i]; continue;
    }
    throw new TransactionError('PREFLIGHT_BLOCKED', `unknown or incomplete argument: ${argv[i]}`);
  }
  if (!json || !['install', 'check', 'uninstall', 'install-cloud', 'check-cloud', 'uninstall-cloud'].includes(mode)) {
    throw new TransactionError('PREFLIGHT_BLOCKED',
      'usage: kaola-workflow-global-contract.js install|check|uninstall|install-cloud|check-cloud|uninstall-cloud --json [--nonce VALUE] [--target REPO]');
  }
  if (mode.endsWith('-cloud') || mode === 'install-cloud') {
    if (!target) throw new TransactionError('PREFLIGHT_BLOCKED', `${mode} requires --target REPO`);
  } else if (target) {
    throw new TransactionError('PREFLIGHT_BLOCKED', '--target is only valid for Cursor Cloud modes');
  }
  return { mode, nonce, target };
}

function main(argv) {
  let envelope;
  let exitCode = 0;
  try {
    envelope = execute(parseArgs(argv));
    if (envelope.status === 'DRIFT') exitCode = 3;
  } catch (error) {
    const status = error instanceof TransactionError ? error.status : 'PREFLIGHT_BLOCKED';
    envelope = { schema_version: 1, status, error: error.message, details: error.details || [] };
    exitCode = status === 'DRIFT' ? 3 : 2;
  }
  process.stdout.write(JSON.stringify(envelope) + '\n');
  process.exit(exitCode);
}

module.exports = {
  START, END, SOURCE_PATH, DEFAULT_REGISTRY_PATH,
  renderContract, managedRegion, execute, loadRegistry,
};

if (require.main === module) main(process.argv);
