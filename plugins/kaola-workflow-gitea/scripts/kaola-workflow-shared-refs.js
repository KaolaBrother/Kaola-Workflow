#!/usr/bin/env node
// #1087 (#1086 F2): the shared reference registry. A shared block is anything more than one runtime
// installer relies on (the runtime-neutral ~/.config/kaola-workflow/config.json first). Each runtime
// registers a reference when it installs and deregisters it when it uninstalls; a block is cleaned
// only when its last reference goes. References are keyed by runtime id (set semantics: reinstalling
// the same runtime never adds a second reference). A runtime installed in several scopes (global plus
// project directories) holds ONE reference that carries its scopes; it is released when its last
// scope deregisters.
//
// The registry store (~/.config/kaola-workflow/shared-refs.json) is itself a shared block: created by
// the first registration and removed only after every block has reached zero references. An operator
// override (explicit machine-wide removal) cleans every known block regardless of references.
//
// Cleanup runs only on a RELEASE: when a deregistration removes the last reference a runtime actually
// held. A block nobody ever registered (a machine installed before this registry existed) is never
// cleaned by a deregistration — without a record no uninstaller can prove it is the last user.
//
// CLI (for shell uninstallers):
//   node kaola-workflow-shared-refs.js register   --block <id> --runtime <id> [--scope global|project --target DIR]
//   node kaola-workflow-shared-refs.js deregister --block <id> --runtime <id> [--scope global|project --target DIR]
//   node kaola-workflow-shared-refs.js list       [--block <id>]
//   node kaola-workflow-shared-refs.js remove-all --operator-override
// Every command prints one JSON object and exits 0; a refused command exits 1 with {error}.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 1;
const CONFIG_BLOCK_ID = 'kaola-config';
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function configDir(home) {
  return path.join(home || os.homedir(), '.config', 'kaola-workflow');
}

function registryPath(home) {
  return path.join(configDir(home), 'shared-refs.json');
}

function lstatIfPresent(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertId(kind, value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new Error(`invalid ${kind} id: ${JSON.stringify(value)}`);
  }
}

// The directory and the store must be real (non-symlink) entries: every write below is a
// Kaola-owned path, and following a link would write or delete outside it.
function assertNotLink(file, kind) {
  const stat = lstatIfPresent(file);
  if (stat && stat.isSymbolicLink()) throw new Error(`${file} is a symlink; refusing to use it as ${kind}`);
  return stat;
}

function readStore(home) {
  const dirStat = assertNotLink(configDir(home), 'the shared config directory');
  if (dirStat && !dirStat.isDirectory()) throw new Error(`${configDir(home)} is not a directory`);
  const file = registryPath(home);
  const stat = assertNotLink(file, 'the shared reference registry');
  if (!stat) return { schema_version: SCHEMA_VERSION, blocks: {} };
  if (!stat.isFile()) throw new Error(`${file} is not a regular file`);
  let store;
  try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`malformed shared reference registry ${file}: ${error.message}`);
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)
      || store.schema_version !== SCHEMA_VERSION
      || !store.blocks || typeof store.blocks !== 'object' || Array.isArray(store.blocks)) {
    throw new Error(`unsupported shared reference registry schema in ${file}`);
  }
  return store;
}

function writeStore(home, store) {
  const file = registryPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function holdersOf(store, blockId) {
  const refs = store.blocks[blockId];
  return refs && typeof refs === 'object' ? Object.keys(refs).sort() : [];
}

// ---------------------------------------------------------------------------------------------
// Zero-reference cleanup hooks. The config block's hook is built in; another block's owner
// installs its own with onZeroRefs(blockId, fn) before deregistering. A hook receives { home }
// and only removes what its block owns — never the registry, never the directory wholesale.

function removeFileIfPresent(file) {
  const stat = assertNotLink(file, 'a shared block file');
  if (!stat) return false;
  if (!stat.isFile()) throw new Error(`${file} is not a regular file; leaving it in place`);
  fs.unlinkSync(file);
  return true;
}

const cleanupHooks = new Map([
  [CONFIG_BLOCK_ID, ({ home }) => removeFileIfPresent(path.join(configDir(home), 'config.json'))],
]);

function onZeroRefs(blockId, fn) {
  assertId('block', blockId);
  if (typeof fn !== 'function') throw new Error('onZeroRefs requires a function');
  cleanupHooks.set(blockId, fn);
}

function runCleanup(blockId, home) {
  const hook = cleanupHooks.get(blockId);
  return hook ? Boolean(hook({ home })) : false;
}

// With no block left holding a reference, the registry — the last shared block — goes, and then
// the directory if (and only if) nothing else remains in it.
function finishIfEmpty(home, store) {
  const anyHeld = Object.keys(store.blocks).some(id => holdersOf(store, id).length > 0);
  if (anyHeld) {
    writeStore(home, store);
    return false;
  }
  removeFileIfPresent(registryPath(home));
  try { fs.rmdirSync(configDir(home)); } catch (_) { /* non-empty or absent: keep it */ }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Public contract.

// registerSharedRef(blockId, runtimeId, meta?, opts?) -> { refs, added }
//   meta.scope (optional string) joins the runtime's scope set; other meta keys are recorded as-is.
//   Re-registering an existing runtime only merges meta/scope: `added` is false and `refs` unchanged.
function registerSharedRef(blockId, runtimeId, meta = {}, opts = {}) {
  assertId('block', blockId);
  assertId('runtime', runtimeId);
  const home = opts.home;
  const store = readStore(home);
  const refs = store.blocks[blockId] || (store.blocks[blockId] = {});
  const added = !Object.prototype.hasOwnProperty.call(refs, runtimeId);
  const prev = refs[runtimeId] || { scopes: [] };
  const { scope, ...rest } = meta || {};
  const scopes = new Set(Array.isArray(prev.scopes) ? prev.scopes : []);
  if (typeof scope === 'string' && scope) scopes.add(scope);
  refs[runtimeId] = {
    ...prev,
    ...rest,
    scopes: [...scopes].sort(),
    registered_at: prev.registered_at || new Date().toISOString(),
  };
  writeStore(home, store);
  return { refs: holdersOf(store, blockId), added };
}

// deregisterSharedRef(blockId, runtimeId, opts?) -> { remaining, holders, released, cleaned, registryRemoved }
//   opts.scope removes only that scope; the reference is released when no scope is left (or when
//   no scope is given). A release that leaves zero references runs the block's cleanup hook.
function deregisterSharedRef(blockId, runtimeId, opts = {}) {
  assertId('block', blockId);
  assertId('runtime', runtimeId);
  const home = opts.home;
  if (!lstatIfPresent(registryPath(home))) {
    return { remaining: 0, holders: [], released: false, cleaned: false, registryRemoved: false };
  }
  const store = readStore(home);
  const refs = store.blocks[blockId] || {};
  let released = false;
  if (Object.prototype.hasOwnProperty.call(refs, runtimeId)) {
    const entry = refs[runtimeId];
    const scopes = Array.isArray(entry.scopes) ? entry.scopes : [];
    const left = typeof opts.scope === 'string' && opts.scope ? scopes.filter(s => s !== opts.scope) : [];
    if (left.length > 0) {
      refs[runtimeId] = { ...entry, scopes: left };
    } else {
      delete refs[runtimeId];
      released = true;
    }
  }
  const holders = holdersOf(store, blockId);
  let cleaned = false;
  if (released && holders.length === 0) {
    cleaned = runCleanup(blockId, home);
    delete store.blocks[blockId];
  }
  const registryRemoved = finishIfEmpty(home, store);
  return { remaining: holders.length, holders, released, cleaned, registryRemoved };
}

// listRefs(blockId?, opts?) -> { [runtimeId]: entry } for one block, or { [blockId]: {...} } for all.
function listRefs(blockId, opts = {}) {
  const store = readStore(opts.home);
  if (blockId === undefined || blockId === null) return store.blocks;
  assertId('block', blockId);
  return store.blocks[blockId] || {};
}

// Operator override: explicit machine-wide removal. Ignores references, runs every known block's
// cleanup hook, then removes the registry and (if empty) the directory.
function operatorRemoveAll(opts = {}) {
  if (opts.operatorOverride !== true) {
    throw new Error('operatorRemoveAll requires { operatorOverride: true }');
  }
  const home = opts.home;
  const store = readStore(home);
  const blocks = new Set([...Object.keys(store.blocks), ...cleanupHooks.keys()]);
  const cleaned = [];
  for (const blockId of [...blocks].sort()) {
    if (runCleanup(blockId, home)) cleaned.push(blockId);
  }
  finishIfEmpty(home, { schema_version: SCHEMA_VERSION, blocks: {} });
  return { cleaned, registryRemoved: !lstatIfPresent(registryPath(home)) };
}

// Install-side helper for runtime installers: the config block already present (created by any
// earlier install or by sink-pr's first read) is never recreated or rewritten — installs only
// record the reference. -> { refs, added, configPresent }
function installSharedConfigBlock(runtimeId, meta = {}, opts = {}) {
  const result = registerSharedRef(CONFIG_BLOCK_ID, runtimeId, meta, opts);
  return { ...result, configPresent: Boolean(lstatIfPresent(path.join(configDir(opts.home), 'config.json'))) };
}

module.exports = {
  registerSharedRef,
  deregisterSharedRef,
  listRefs,
  onZeroRefs,
  operatorRemoveAll,
  installSharedConfigBlock,
  registryPath,
  CONFIG_BLOCK_ID,
};

// ---------------------------------------------------------------------------------------------
// CLI

function parseCli(argv) {
  const args = { command: argv[0] };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined) throw new Error(`${a} requires a value`);
      i += 1;
      return argv[i];
    };
    if (a === '--block') args.block = value();
    else if (a === '--runtime') args.runtime = value();
    else if (a === '--scope') args.scopeKind = value();
    else if (a === '--target') args.target = value();
    else if (a === '--operator-override') args.operatorOverride = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.scopeKind === 'global') args.scope = 'global';
  else if (args.scopeKind === 'project') {
    if (!args.target) throw new Error('--scope project requires --target DIR');
    args.scope = 'project:' + path.resolve(args.target);
  } else if (args.scopeKind !== undefined) {
    throw new Error(`--scope must be global or project, got ${args.scopeKind}`);
  }
  return args;
}

function cli(argv) {
  const args = parseCli(argv);
  switch (args.command) {
    case 'register':
      return registerSharedRef(args.block, args.runtime, args.scope ? { scope: args.scope } : {});
    case 'deregister':
      return deregisterSharedRef(args.block, args.runtime, args.scope ? { scope: args.scope } : {});
    case 'list':
      return listRefs(args.block);
    case 'remove-all':
      return operatorRemoveAll({ operatorOverride: args.operatorOverride === true });
    default:
      throw new Error('usage: kaola-workflow-shared-refs.js register|deregister|list|remove-all ...');
  }
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error.message }) + '\n');
    process.exit(1);
  }
}
