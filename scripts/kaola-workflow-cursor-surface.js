#!/usr/bin/env node
'use strict';

// Cursor install/materialization transaction and read-only surface doctor.
// Product/host facts remain distinct: this file never infers Cursor.app from a
// CLI binary, a CLI from Cursor.app, or a local host from an App Cloud run.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_SOURCE = path.join(ROOT, 'templates', 'agents', 'runtime-capabilities.json');
const AUTHORITY_RECEIPT_REL = path.join('kaola-workflow', 'cursor-authority.json');
const PROJECT_RECEIPT_REL = 'kaola-workflow-materialization.json';
const RECEIPT_SCHEMA = 1;
const ALLOWED_PRODUCT = new Set(['cli', 'app', 'unknown']);
const ALLOWED_HOST = new Set(['local', 'cloud', 'unknown']);
const ALLOWED_SCOPE = new Set(['global', 'project']);
const ALLOWED_FORGE = new Set(['github', 'gitlab', 'gitea']);

// Receipt-less global installs shipped by 10.0.1 are adoptable only when every
// changed managed path byte-matches that published edition. Equal-to-current
// files need no entry here. Anything else remains an unmanaged collision.
const LEGACY_10_0_1_GLOBAL_HASHES = Object.freeze({
  github: Object.freeze({
    'commands/kaola-workflow-finalize.md': 'c7f28964e3cdde50f324352d218bf3623af221a8c8b199e5dd57e73406f868aa',
    'commands/workflow-init.md': '1a63236967525b0edaad94f050a1fb42d6f0af73e7e4a5bbda1cf1e0fd8ee904',
    'commands/workflow-next.md': '79e9bd53c1146fc7af9557f4757f6c38de610f2d7ae2cde06c930f3e8ef3aa6c',
    'kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js': '32ce6ee0711d7b6a3ed83fec12bd6480ceb91103c7fe5257c427cd1a757bb048',
    'kaola-workflow/scripts/kaola-workflow-project-instructions.js': '45104e070377043c605dc69aabd043bc01786c706e7432d1e753632a9a585ed5',
  }),
  gitlab: Object.freeze({
    'commands/kaola-workflow-finalize.md': '47ac92786d6373f7b30d3a2486680324656e35deca28aa88564e3ed91544eb56',
    'commands/workflow-init.md': '143118242f829945e617b8e1fa6f98735d6cbcb128aa75c29796472b6c8f7c65',
    'commands/workflow-next.md': '6c061f53131f6327bbd3de27c896740d2a54425efb5ff999bab16b42229eb7e8',
    'kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js': '32ce6ee0711d7b6a3ed83fec12bd6480ceb91103c7fe5257c427cd1a757bb048',
    'kaola-workflow/scripts/kaola-workflow-project-instructions.js': '45104e070377043c605dc69aabd043bc01786c706e7432d1e753632a9a585ed5',
  }),
  gitea: Object.freeze({
    'commands/kaola-workflow-finalize.md': '9ccf56a2b9b8486111aa477a84588765be56beac2dde5529f5707f84cd1bac11',
    'commands/workflow-init.md': 'a5020aa480172e62150c57e48cbbed676a9cc78e5224ff93d47134ad5e999405',
    'commands/workflow-next.md': '88400438f8af7de2684c00e92bcce4ca27c6da7aab3fc868389dac4ce27cfa94',
    'kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js': '32ce6ee0711d7b6a3ed83fec12bd6480ceb91103c7fe5257c427cd1a757bb048',
    'kaola-workflow/scripts/kaola-workflow-project-instructions.js': '45104e070377043c605dc69aabd043bc01786c706e7432d1e753632a9a585ed5',
  }),
});
const LEGACY_10_0_1_RETIRED_HASHES = Object.freeze({
  github: Object.freeze({
    'kaola-workflow/scripts/kaola-workflow-ensure-cursor-catalog.js': '5fcf7a62de5704b5fa3cbd61bd920315ee7d15b53ced1584d6a460cb5659a9cf',
    'kaola-workflow/hooks/kaola-workflow-ensure-cursor-catalog.sh': '0270c37d2327fe078d5cf99e38f467ad1d4a0fb6c95911919c534444855b5dbb',
    'hooks/kaola-workflow-ensure-cursor-catalog.sh': '0270c37d2327fe078d5cf99e38f467ad1d4a0fb6c95911919c534444855b5dbb',
  }),
  gitlab: Object.freeze({
    'kaola-workflow/scripts/kaola-workflow-ensure-cursor-catalog.js': '5fcf7a62de5704b5fa3cbd61bd920315ee7d15b53ced1584d6a460cb5659a9cf',
    'kaola-workflow/hooks/kaola-workflow-ensure-cursor-catalog.sh': 'fc7c05c1b69d07fd26c957366868dc62c18b230e82e6befe46290d94086c2f02',
    'hooks/kaola-workflow-ensure-cursor-catalog.sh': 'fc7c05c1b69d07fd26c957366868dc62c18b230e82e6befe46290d94086c2f02',
  }),
  gitea: Object.freeze({
    'kaola-workflow/scripts/kaola-workflow-ensure-cursor-catalog.js': '5fcf7a62de5704b5fa3cbd61bd920315ee7d15b53ced1584d6a460cb5659a9cf',
    'kaola-workflow/hooks/kaola-workflow-ensure-cursor-catalog.sh': '8dc2ae61aa594e5f83fbc93867f4f0a740ffac70a94e65f99915454fa6e91047',
    'hooks/kaola-workflow-ensure-cursor-catalog.sh': '8dc2ae61aa594e5f83fbc93867f4f0a740ffac70a94e65f99915454fa6e91047',
  }),
});

function fail(message, code) {
  const error = new Error(message);
  error.exitCode = code || 1;
  throw error;
}

function takeValue(argv, index, flag) {
  if (index + 1 >= argv.length || String(argv[index + 1]).startsWith('--')) {
    fail(flag + ' requires a value', 2);
  }
  return argv[index + 1];
}

function parseArgs(argv) {
  const out = {
    action: 'doctor', json: false, product: 'unknown', host: 'unknown',
    forge: 'github', scope: null, target: '', sourceTree: '', supportSource: '',
    noScripts: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--doctor') out.action = 'doctor';
    else if (arg === '--install') out.action = 'install';
    else if (arg === '--uninstall') out.action = 'uninstall';
    else if (arg === '--ensure-target') {
      out.action = 'ensure';
      out.target = takeValue(argv, i, arg);
      i++;
    }
    else if (arg === '--json') out.json = true;
    else if (arg === '--no-scripts') out.noScripts = true;
    else if (arg === '--product') { out.product = takeValue(argv, i, arg); i++; }
    else if (arg === '--host') { out.host = takeValue(argv, i, arg); i++; }
    else if (arg === '--forge') { out.forge = takeValue(argv, i, arg); i++; }
    else if (arg.startsWith('--forge=')) out.forge = arg.slice('--forge='.length);
    else if (arg === '--scope') { out.scope = takeValue(argv, i, arg); i++; }
    else if (arg === '--target') { out.target = takeValue(argv, i, arg); i++; }
    else if (arg === '--source-tree') { out.sourceTree = takeValue(argv, i, arg); i++; }
    else if (arg === '--support-source') { out.supportSource = takeValue(argv, i, arg); i++; }
    else if (arg === '--help' || arg === '-h') out.help = true;
    else fail('unknown argument ' + JSON.stringify(arg), 2);
  }
  if (!ALLOWED_PRODUCT.has(out.product)) fail('--product must be cli, app, or unknown', 2);
  if (!ALLOWED_HOST.has(out.host)) fail('--host must be local, cloud, or unknown', 2);
  if (!ALLOWED_FORGE.has(out.forge)) fail('--forge must be github, gitlab, or gitea', 2);
  if ((out.action === 'install' || out.action === 'uninstall') && !ALLOWED_SCOPE.has(out.scope)) {
    fail('--scope must be global or project', 2);
  }
  if (out.scope === 'project' && !out.target) fail('--target is required for project scope', 2);
  return out;
}

function loadCursorAdapter() {
  const source = JSON.parse(fs.readFileSync(ADAPTER_SOURCE, 'utf8'));
  const adapter = source.runtimes && source.runtimes.cursor;
  if (!adapter || adapter.runtime !== 'cursor') fail('cursor adapter missing from runtime-capabilities.json');
  return adapter;
}

function loadVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version : 'unknown';
  } catch (_) { return 'unknown'; }
}

function cursorHome() {
  return path.resolve(process.env.CURSOR_HOME || path.join(process.env.HOME || '', '.cursor'));
}

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function isSafeRelative(rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('\\')) return false;
  const normalized = path.posix.normalize(rel);
  return normalized === rel && normalized !== '..' && !normalized.startsWith('../');
}

function inspectPath(file) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error && error.code === 'ENOENT') return { status: 'missing' };
    return { status: 'unreadable', error: error.message };
  }
  if (stat.isSymbolicLink()) return { status: 'symlink' };
  if (stat.isDirectory()) return { status: 'directory' };
  if (!stat.isFile()) return { status: 'nonregular' };
  try {
    const bytes = fs.readFileSync(file);
    return { status: 'regular', sha256: sha256(bytes), bytes, mode: stat.mode & 0o777 };
  } catch (error) { return { status: 'unreadable', error: error.message }; }
}

function stableJson(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n'); }

function atomicWrite(file, bytes, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), '.' + path.basename(file)
    + '.kw-' + process.pid + '-' + crypto.randomBytes(8).toString('hex'));
  let fd = null;
  try {
    fd = fs.openSync(temporary, 'wx', mode == null ? 0o644 : mode);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (mode != null) fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, file);
  } finally {
    if (fd != null) try { fs.closeSync(fd); } catch (_) { /* best effort */ }
    try { fs.unlinkSync(temporary); } catch (_) { /* renamed or absent */ }
  }
}

function validateCarrier(root, rels) {
  const rootState = inspectPath(root);
  if (rootState.status !== 'missing' && rootState.status !== 'directory') {
    return [{ path: root, reason: 'install_root_' + rootState.status }];
  }
  const collisions = [];
  const seen = new Set();
  for (const rel of rels) {
    const parts = rel.split('/').slice(0, -1);
    let current = root;
    for (const part of parts) {
      current = path.join(current, part);
      if (seen.has(current)) continue;
      seen.add(current);
      const state = inspectPath(current);
      if (state.status !== 'missing' && state.status !== 'directory') {
        collisions.push({ path: current, reason: 'non_directory_carrier_' + state.status });
      }
    }
  }
  return collisions;
}

function parseReceipt(file, kind) {
  const state = inspectPath(file);
  if (state.status === 'missing') return { status: 'missing', path: file, receipt: null };
  if (state.status !== 'regular') {
    return { status: 'invalid', path: file, reason: 'receipt_' + state.status, receipt: null };
  }
  let receipt;
  try { receipt = JSON.parse(state.bytes.toString('utf8')); }
  catch (_) { return { status: 'invalid', path: file, reason: 'receipt_invalid_json', receipt: null }; }
  if (!receipt || receipt.schema_version !== RECEIPT_SCHEMA || receipt.kind !== kind
      || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) {
    return { status: 'invalid', path: file, reason: 'receipt_invalid_schema', receipt: null };
  }
  for (const [rel, record] of Object.entries(receipt.files)) {
    if (!isSafeRelative(rel) || !record || !/^[a-f0-9]{64}$/.test(String(record.sha256 || ''))
        || !Number.isInteger(record.mode) || record.mode < 0 || record.mode > 0o777) {
      return { status: 'invalid', path: file, reason: 'receipt_invalid_file_record', receipt: null };
    }
  }
  const hooksValid = receipt.hook_entries && typeof receipt.hook_entries === 'object'
    && !Array.isArray(receipt.hook_entries)
    && Object.entries(receipt.hook_entries).every(([event, entries]) => event
      && Array.isArray(entries)
      && entries.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry)
        && typeof entry.command === 'string' && entry.command.length > 0));
  if (!ALLOWED_FORGE.has(receipt.forge)
      || typeof receipt.kaola_workflow_version !== 'string' || !receipt.kaola_workflow_version.trim()
      || !hooksValid) {
    return { status: 'invalid', path: file, reason: 'receipt_invalid_metadata', receipt: null };
  }
  if (kind === 'cursor_project_materialization'
      && (typeof receipt.target !== 'string' || !path.isAbsolute(receipt.target)
        || !/^[a-f0-9]{64}$/.test(String(receipt.authority_receipt_sha256 || '')))) {
    return { status: 'invalid', path: file, reason: 'receipt_invalid_project_metadata', receipt: null };
  }
  return { status: 'valid', path: file, sha256: state.sha256, receipt };
}

function desiredRecord(bytes, mode) {
  return { bytes, sha256: sha256(bytes), mode: mode == null ? 0o644 : mode };
}

function sourceRegular(file, label) {
  const state = inspectPath(file);
  if (state.status !== 'regular') fail(label + ' is not a regular file: ' + file + ' (' + state.status + ')');
  return state.bytes;
}

function hookEntries(mappingText, global) {
  const sync = require('./sync-cursor-edition.js');
  const body = global ? sync.rewriteHooksJsonForGlobal(mappingText) : String(mappingText);
  return (JSON.parse(body).hooks || {});
}

function isKaolaHookEntry(entry) {
  return /(?:^|\/)kaola-workflow-(?:compact-context|ensure-cursor-catalog|subagent-dispatch-log)\.sh$/
    .test(String((entry && entry.command) || ''));
}

function mergeHooks(existingFile, incoming) {
  let current = { version: 1, hooks: {} };
  const state = inspectPath(existingFile);
  if (state.status !== 'missing') {
    if (state.status !== 'regular') fail('hooks.json is ' + state.status + ': ' + existingFile);
    try { current = JSON.parse(state.bytes.toString('utf8')); }
    catch (_) { fail('hooks.json is not valid JSON: ' + existingFile); }
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) fail('hooks.json root is not an object');
  current.version = current.version || 1;
  if (!current.hooks || typeof current.hooks !== 'object' || Array.isArray(current.hooks)) current.hooks = {};
  for (const [event, entries] of Object.entries(incoming || {})) {
    const prior = Array.isArray(current.hooks[event]) ? current.hooks[event] : [];
    current.hooks[event] = prior.filter(entry => !isKaolaHookEntry(entry)).concat(entries);
  }
  return stableJson(current);
}

function removeRecordedHooks(existingFile, recorded) {
  const state = inspectPath(existingFile);
  if (state.status !== 'regular') return false;
  let current;
  try { current = JSON.parse(state.bytes.toString('utf8')); }
  catch (_) { return false; }
  if (!current.hooks || typeof current.hooks !== 'object') return false;
  let changed = false;
  for (const [event, entries] of Object.entries(recorded || {})) {
    if (!Array.isArray(current.hooks[event])) continue;
    const tokens = new Set((entries || []).map(entry => JSON.stringify(entry)));
    const kept = current.hooks[event].filter(entry => {
      if (!tokens.has(JSON.stringify(entry))) return true;
      changed = true;
      return false;
    });
    if (kept.length) current.hooks[event] = kept;
    else delete current.hooks[event];
  }
  if (changed) atomicWrite(existingFile, stableJson(current), state.mode);
  return changed;
}

function buildGlobalDesired(opts) {
  if (!opts.sourceTree) fail('--source-tree is required to install global authority', 2);
  const sync = require('./sync-cursor-edition.js');
  const manifest = require('./kaola-workflow-install-manifest.js');
  const desired = {};
  for (const name of sync.listCanonAgents()) {
    const rel = 'agents/' + name + '.md';
    desired[rel] = desiredRecord(sourceRegular(path.join(opts.sourceTree, rel), 'agent authority'), 0o644);
  }
  for (const file of sync.listCanonCommands(opts.forge)) {
    const rel = 'commands/' + file;
    desired[rel] = desiredRecord(sourceRegular(path.join(opts.sourceTree, rel), 'command authority'), 0o644);
  }
  let hooks = {};
  if (!opts.noScripts) {
    for (const name of manifest.supportScripts(opts.forge)) {
      const preferred = opts.supportSource ? path.join(opts.supportSource, name) : '';
      const source = preferred && inspectPath(preferred).status === 'regular'
        ? preferred : path.join(ROOT, 'scripts', name);
      desired['kaola-workflow/scripts/' + name] = desiredRecord(sourceRegular(source, 'support script'), 0o755);
    }
    desired['kaola-workflow/scripts/kaola-workflow-cursor-surface.js'] = desiredRecord(
      sourceRegular(__filename, 'Cursor materialization helper'), 0o755);
    for (const name of sync.expectedHookFiles()) {
      const bytes = sourceRegular(path.join(opts.sourceTree, 'hooks', name), 'Cursor hook');
      desired['kaola-workflow/hooks/' + name] = desiredRecord(bytes, 0o755);
      if (!opts.authorityOnly) desired['hooks/' + name] = desiredRecord(bytes, 0o755);
    }
    hooks = hookEntries(sourceRegular(path.join(opts.sourceTree, 'hooks.json'), 'Cursor hooks mapping'), true);
  }
  return { desired, hooks };
}

function validateManagedPreflight(root, desired, receiptInfo, legacyHashes) {
  const collisions = validateCarrier(root, Object.keys(desired));
  const prior = receiptInfo.status === 'valid' ? receiptInfo.receipt.files : {};
  if (receiptInfo.status === 'invalid') collisions.push({ path: receiptInfo.path, reason: receiptInfo.reason });
  for (const [rel, wanted] of Object.entries(desired)) {
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'missing') continue;
    if (state.status !== 'regular') {
      collisions.push({ path: file, reason: 'managed_basename_' + state.status });
      continue;
    }
    const old = prior[rel];
    if (old && state.sha256 === old.sha256) continue;
    if (state.sha256 === wanted.sha256) continue;
    if (receiptInfo.status === 'missing' && legacyHashes && legacyHashes[rel] === state.sha256) continue;
    collisions.push({ path: file, reason: old ? 'managed_file_modified' : 'unmanaged_collision' });
  }
  return collisions;
}

function validateLegacyRetired(root, receiptInfo, retiredHashes) {
  if (receiptInfo.status !== 'missing') return [];
  const collisions = [];
  for (const [rel, expected] of Object.entries(retiredHashes || {})) {
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'missing') continue;
    if (state.status !== 'regular' || state.sha256 !== expected) {
      collisions.push({ path: file, reason: state.status === 'regular'
        ? 'legacy_retired_file_modified' : 'legacy_retired_' + state.status });
    }
  }
  return collisions;
}

function removeLegacyRetired(root, receiptInfo, retiredHashes) {
  if (receiptInfo.status !== 'missing') return [];
  const removed = [];
  for (const [rel, expected] of Object.entries(retiredHashes || {})) {
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'regular' && state.sha256 === expected) {
      fs.unlinkSync(file);
      removeEmptyParents(root, rel);
      removed.push(rel);
    }
  }
  return removed;
}

function applyManaged(root, desired) {
  for (const [rel, wanted] of Object.entries(desired).sort(([a], [b]) => a.localeCompare(b))) {
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'regular' && state.sha256 === wanted.sha256 && state.mode === wanted.mode) continue;
    atomicWrite(file, wanted.bytes, wanted.mode);
  }
}

function removeRetiredManaged(root, desired, receiptInfo, preservedPrefixes) {
  if (receiptInfo.status !== 'valid') return;
  const prefixes = preservedPrefixes || [];
  for (const [rel, record] of Object.entries(receiptInfo.receipt.files)) {
    if (Object.prototype.hasOwnProperty.call(desired, rel)
        || prefixes.some(prefix => rel.startsWith(prefix))) continue;
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'regular' && state.sha256 === record.sha256) fs.unlinkSync(file);
  }
}

function recordsFor(desired) {
  const records = {};
  for (const rel of Object.keys(desired).sort()) {
    records[rel] = { sha256: desired[rel].sha256, mode: desired[rel].mode };
  }
  return records;
}

function verifyDesired(root, desired) {
  for (const [rel, wanted] of Object.entries(desired)) {
    const state = inspectPath(path.join(root, ...rel.split('/')));
    if (state.status !== 'regular' || state.sha256 !== wanted.sha256) fail('post-install verification failed for ' + rel);
  }
}

function installGlobal(opts) {
  const home = cursorHome();
  const receiptPath = path.join(home, AUTHORITY_RECEIPT_REL);
  const receiptInfo = parseReceipt(receiptPath, 'cursor_global_authority');
  const built = buildGlobalDesired(opts);
  const legacyHashes = LEGACY_10_0_1_GLOBAL_HASHES[opts.forge] || {};
  const retiredHashes = opts.noScripts ? {} : (LEGACY_10_0_1_RETIRED_HASHES[opts.forge] || {});
  const collisions = validateManagedPreflight(home, built.desired, receiptInfo, legacyHashes)
    .concat(validateLegacyRetired(home, receiptInfo, retiredHashes));
  const hooksFile = path.join(home, 'hooks.json');
  let mergedHooks = null;
  if (!opts.noScripts && !opts.authorityOnly) {
    try { mergedHooks = mergeHooks(hooksFile, built.hooks); }
    catch (error) { collisions.push({ path: hooksFile, reason: error.message }); }
  }
  if (collisions.length) {
    fail('global install preflight refused collision/unmanaged state:\n'
      + collisions.map(item => '  - ' + item.path + ': ' + item.reason).join('\n'));
  }
  applyManaged(home, built.desired);
  if (mergedHooks) atomicWrite(hooksFile, mergedHooks, 0o644);
  const adoptedLegacyRetired = removeLegacyRetired(home, receiptInfo, retiredHashes);
  removeRetiredManaged(home, built.desired, receiptInfo, opts.noScripts
    ? ['kaola-workflow/scripts/', 'kaola-workflow/hooks/', 'hooks/'] : []);
  verifyDesired(home, built.desired);
  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    kind: 'cursor_global_authority',
    kaola_workflow_version: loadVersion(),
    forge: opts.forge,
    files: recordsFor(built.desired),
    hook_entries: built.hooks,
  };
  atomicWrite(receiptPath, stableJson(receipt), 0o644);
  return { scope: 'global', root: home, receipt: receiptPath, files: Object.keys(built.desired).length,
    adopted_legacy_release: receiptInfo.status === 'missing' ? '10.0.1-if-byte-matched' : null,
    removed_legacy_files: adoptedLegacyRetired };
}

function inspectAuthority(forge, expectedVersion) {
  const home = cursorHome();
  const receiptPath = path.join(home, AUTHORITY_RECEIPT_REL);
  const info = parseReceipt(receiptPath, 'cursor_global_authority');
  const result = {
    root: home, receipt_path: receiptPath, receipt_status: info.status,
    receipt_sha256: info.sha256 || null, freshness: info.status === 'valid' ? 'current' : info.status,
    files: {},
  };
  if (info.reason) result.reason = info.reason;
  if (info.status !== 'valid') return { info, result };
  const requiredVersion = expectedVersion === undefined ? loadVersion() : expectedVersion;
  if (requiredVersion != null && info.receipt.kaola_workflow_version !== requiredVersion) {
    result.freshness = 'stale_version';
  }
  if (info.receipt.forge !== forge) result.freshness = 'stale_forge';
  for (const [rel, record] of Object.entries(info.receipt.files)) {
    const state = inspectPath(path.join(home, ...rel.split('/')));
    const status = state.status === 'regular' && state.sha256 === record.sha256
      ? 'current' : (state.status === 'regular' ? 'hash_mismatch' : state.status);
    result.files[rel] = { expected_sha256: record.sha256, actual_sha256: state.sha256 || null, status };
    if (status !== 'current' && result.freshness === 'current') result.freshness = 'stale_files';
  }
  return { info, result };
}

function projectDesiredFromAuthority(authorityReceipt, noScripts) {
  const home = cursorHome();
  const desired = {};
  for (const [rel, record] of Object.entries(authorityReceipt.files)) {
    let projectRel = null;
    if (rel.startsWith('agents/')) projectRel = rel;
    else if (rel.startsWith('commands/')) projectRel = rel;
    else if (!noScripts && rel.startsWith('kaola-workflow/hooks/')) projectRel = 'hooks/' + path.posix.basename(rel);
    if (!projectRel) continue;
    const state = inspectPath(path.join(home, ...rel.split('/')));
    if (state.status !== 'regular' || state.sha256 !== record.sha256) {
      fail('installed global authority is stale or missing: ' + rel);
    }
    desired[projectRel] = desiredRecord(state.bytes, record.mode);
  }
  if (!Object.prototype.hasOwnProperty.call(desired, 'agents/implementer.md')) {
    fail('installed global authority has no managed implementer profile');
  }
  return desired;
}

function installProject(opts) {
  const target = path.resolve(opts.target);
  const targetState = inspectPath(target);
  if (targetState.status !== 'missing' && targetState.status !== 'directory') {
    fail('project materialization target is a non-directory carrier (' + targetState.status + '): ' + target);
  }
  let authority = inspectAuthority(opts.forge, opts.installedHelper ? null : undefined);
  if (authority.info.status === 'missing') {
    if (opts.installedHelper) fail('installed global Cursor authority is missing; run install-cursor.sh --global');
    installGlobal(Object.assign({}, opts, { authorityOnly: true }));
    authority = inspectAuthority(opts.forge);
  }
  if (authority.info.status !== 'valid' || authority.result.freshness !== 'current') {
    fail('installed global Cursor authority is missing or stale (' + authority.result.freshness + ')');
  }
  const layout = path.join(target, '.cursor');
  const receiptPath = path.join(layout, PROJECT_RECEIPT_REL);
  const receiptInfo = parseReceipt(receiptPath, 'cursor_project_materialization');
  if (receiptInfo.status === 'valid' && receiptInfo.receipt.target !== target) {
    fail('project receipt target mismatch: expected ' + target + ', recorded ' + receiptInfo.receipt.target);
  }
  if (opts.idempotent) {
    const existing = inspectProject(target, authority);
    if (existing.freshness === 'current') {
      return { status: 'current', scope: 'project', root: layout, target,
        receipt: receiptPath, files: Object.keys(existing.files).length };
    }
  }
  const desired = projectDesiredFromAuthority(authority.info.receipt, opts.noScripts);
  const collisions = validateManagedPreflight(layout, desired, receiptInfo);
  let projectHooks = null;
  let mergedHooks = null;
  const hooksFile = path.join(layout, 'hooks.json');
  if (!opts.noScripts) {
    projectHooks = {};
    for (const [event, entries] of Object.entries(authority.info.receipt.hook_entries || {})) {
      projectHooks[event] = entries.map(entry => {
        const copy = Object.assign({}, entry);
        copy.command = String(copy.command || '').replace(/^\.\/hooks\//, '.cursor/hooks/');
        return copy;
      });
    }
    try { mergedHooks = mergeHooks(hooksFile, projectHooks); }
    catch (error) { collisions.push({ path: hooksFile, reason: error.message }); }
  }
  if (collisions.length) {
    fail('project materialization preflight refused collision/unmanaged state:\n'
      + collisions.map(item => '  - ' + item.path + ': ' + item.reason).join('\n'));
  }
  applyManaged(layout, desired);
  if (mergedHooks) atomicWrite(hooksFile, mergedHooks, 0o644);
  removeRetiredManaged(layout, desired, receiptInfo, opts.noScripts ? ['hooks/'] : []);
  verifyDesired(layout, desired);
  const receiptFiles = recordsFor(desired);
  if (opts.noScripts && receiptInfo.status === 'valid') {
    for (const [rel, record] of Object.entries(receiptInfo.receipt.files)) {
      if (rel.startsWith('hooks/')) receiptFiles[rel] = record;
    }
  }
  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    kind: 'cursor_project_materialization',
    kaola_workflow_version: authority.info.receipt.kaola_workflow_version,
    forge: opts.forge,
    target,
    authority_receipt_sha256: authority.result.receipt_sha256,
    files: receiptFiles,
    hook_entries: projectHooks || (receiptInfo.status === 'valid' ? receiptInfo.receipt.hook_entries || {} : {}),
  };
  atomicWrite(receiptPath, stableJson(receipt), 0o644);
  return { status: 'materialized', scope: 'project', root: layout, target,
    receipt: receiptPath, files: Object.keys(desired).length };
}

function ensureProject(opts) {
  return installProject(Object.assign({}, opts, {
    noScripts: true,
    installedHelper: true,
    idempotent: true,
  }));
}

function removeEmptyParents(root, rel) {
  let current = path.dirname(path.join(root, ...rel.split('/')));
  while (current !== root && current.startsWith(root + path.sep)) {
    try { fs.rmdirSync(current); } catch (_) { break; }
    current = path.dirname(current);
  }
}

function uninstallManaged(root, receiptPath, kind, hooksFile) {
  const info = parseReceipt(receiptPath, kind);
  if (info.status !== 'valid') return { scope: kind, root, receipt_status: info.status, removed: 0, preserved: 'all' };
  let removed = 0;
  let preserved = 0;
  for (const [rel, record] of Object.entries(info.receipt.files)) {
    const file = path.join(root, ...rel.split('/'));
    const state = inspectPath(file);
    if (state.status === 'regular' && state.sha256 === record.sha256) {
      fs.unlinkSync(file);
      removeEmptyParents(root, rel);
      removed++;
    } else if (state.status !== 'missing') preserved++;
  }
  removeRecordedHooks(hooksFile, info.receipt.hook_entries || {});
  if (inspectPath(receiptPath).status === 'regular') fs.unlinkSync(receiptPath);
  return { scope: kind, root, receipt_status: 'valid', removed, preserved };
}

function uninstall(opts) {
  if (opts.scope === 'global') {
    const home = cursorHome();
    return uninstallManaged(home, path.join(home, AUTHORITY_RECEIPT_REL),
      'cursor_global_authority', path.join(home, 'hooks.json'));
  }
  const layout = path.join(path.resolve(opts.target), '.cursor');
  return uninstallManaged(layout, path.join(layout, PROJECT_RECEIPT_REL),
    'cursor_project_materialization', path.join(layout, 'hooks.json'));
}

function inspectProject(target, authority) {
  const resolved = path.resolve(target);
  const layout = path.join(resolved, '.cursor');
  const receiptPath = path.join(layout, PROJECT_RECEIPT_REL);
  const info = parseReceipt(receiptPath, 'cursor_project_materialization');
  const result = {
    target: resolved, layout, receipt_path: receiptPath, receipt_status: info.status,
    receipt_sha256: info.sha256 || null,
    authority_receipt_sha256: info.status === 'valid' ? info.receipt.authority_receipt_sha256 || null : null,
    freshness: info.status === 'valid' ? 'current' : 'unmaterialized', files: {}, collisions: [],
  };
  if (info.reason) result.reason = info.reason;
  if (info.status === 'invalid') result.freshness = 'invalid_receipt';
  if (info.status === 'valid') {
    if (info.receipt.target !== resolved) {
      result.freshness = 'receipt_target_mismatch';
      result.collisions.push({ path: receiptPath, reason: 'receipt_target_mismatch' });
    }
    if (authority.result.freshness !== 'current'
        || info.receipt.authority_receipt_sha256 !== authority.result.receipt_sha256) result.freshness = 'stale_authority';
    for (const [rel, record] of Object.entries(info.receipt.files)) {
      const state = inspectPath(path.join(layout, ...rel.split('/')));
      const status = state.status === 'regular' && state.sha256 === record.sha256
        ? 'current' : (state.status === 'regular' ? 'modified_hash_mismatch' : state.status);
      result.files[rel] = { expected_sha256: record.sha256, actual_sha256: state.sha256 || null, status };
      if (status !== 'current') {
        result.freshness = status.includes('modified') ? 'modified_mismatch' : 'stale_files';
        result.collisions.push({ path: path.join(layout, ...rel.split('/')), reason: status });
      }
    }
  } else if (authority.info.status === 'valid' && authority.result.freshness === 'current') {
    let desired = {};
    try { desired = projectDesiredFromAuthority(authority.info.receipt, false); } catch (_) { /* reported by authority */ }
    for (const [rel, wanted] of Object.entries(desired)) {
      const file = path.join(layout, ...rel.split('/'));
      const state = inspectPath(file);
      if (state.status === 'missing') continue;
      if (state.status !== 'regular' || state.sha256 !== wanted.sha256) {
        result.collisions.push({ path: file, reason: state.status === 'regular'
          ? 'unmanaged_collision' : 'managed_basename_' + state.status });
      }
    }
    if (result.collisions.length) result.freshness = 'unmanaged_collision';
  }
  return result;
}

function report(opts) {
  const adapter = loadCursorAdapter();
  const surfaces = adapter.surfaces || null;
  const selected = surfaces && opts.product !== 'unknown' && surfaces[opts.product]
    ? (surfaces[opts.product].execution_hosts && surfaces[opts.product].execution_hosts[opts.host]) || null : null;
  const authority = inspectAuthority(opts.forge);
  const project = opts.target ? inspectProject(opts.target, authority) : null;
  let effectiveScope = 'none';
  if (project && project.freshness === 'current') effectiveScope = 'project_materialized';
  else if (selected && selected.global_discovery === 'supported' && authority.result.freshness === 'current') effectiveScope = 'global';
  return {
    runtime: 'cursor', product_surface: opts.product, execution_host: opts.host,
    kaola_workflow_version: loadVersion(),
    runtime_build: selected && selected.stamp ? selected.stamp.runtime_build || 'unknown' : 'unknown',
    inferred_from_sibling_binary: false, ambient_repository_write: false,
    project_materialization: 'explicit --target DIR', project_target: project ? project.target : null,
    global_root: authority.result.root,
    global_discovery: selected ? selected.global_discovery : 'unknown',
    required_project_materialization: selected ? selected.required_project_materialization : 'unknown',
    named_catalog: selected ? selected.named_catalog : 'unknown', reload: selected ? selected.reload : 'unknown',
    restart_boundary: selected ? selected.reload : 'unknown', effective_profile_scope: effectiveScope,
    freshness: project ? project.freshness : authority.result.freshness,
    collisions: project ? project.collisions : [], authority: authority.result,
    materialization_receipt: project, evidence_stamp: selected && selected.stamp ? selected.stamp : null,
    capability_gap: selected && selected.named_catalog === 'built_in_only' ? 'catalog_miss' : null,
    surfaces, selected_host: selected,
    note: 'Product and host are explicit inputs. Unknown stays unknown; sibling surfaces are never inferred.',
  };
}

function usage() {
  process.stdout.write(
    'Usage: node scripts/kaola-workflow-cursor-surface.js --doctor [--json] [--target DIR] '
    + '[--product cli|app|unknown] [--host local|cloud|unknown]\n'
    + '       node scripts/kaola-workflow-cursor-surface.js --install --scope global|project '
    + '[--target DIR] --source-tree DIR [--support-source DIR]\n'
    + '       node scripts/kaola-workflow-cursor-surface.js --uninstall --scope global|project [--target DIR]\n'
    + '       node scripts/kaola-workflow-cursor-surface.js --ensure-target DIR [--forge github|gitlab|gitea]\n'
  );
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { usage(); return 0; }
    let body;
    if (args.action === 'install') body = args.scope === 'global' ? installGlobal(args) : installProject(args);
    else if (args.action === 'uninstall') body = uninstall(args);
    else if (args.action === 'ensure') body = ensureProject(args);
    else body = report(args);
    if (args.json || args.action !== 'doctor') process.stdout.write(JSON.stringify(body, null, 2) + '\n');
    else process.stdout.write('runtime=cursor product=' + body.product_surface + ' host=' + body.execution_host
      + ' scope=' + body.effective_profile_scope + ' freshness=' + body.freshness + '\n');
    return 0;
  } catch (error) {
    process.stderr.write('cursor-surface: ' + error.message + '\n');
    return error.exitCode || 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  report, loadCursorAdapter, parseArgs, installGlobal, installProject, ensureProject, uninstall,
  inspectAuthority, inspectProject, AUTHORITY_RECEIPT_REL, PROJECT_RECEIPT_REL,
  LEGACY_10_0_1_GLOBAL_HASHES, LEGACY_10_0_1_RETIRED_HASHES,
  validateManagedPreflight, validateLegacyRetired, removeLegacyRetired,
};
