#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-zcode-edition.js — generate the ZCode runtime edition from canonical.
//
// ZCode (measured against ZCode 3.10.1) is a coding-agent RUNTIME (like
// opencode/Kimi/Grok/Cursor), not a git forge, and it does NOT ride the
// install.sh --forge= machinery or edition-sync.js. It is delivered the
// ZCode-native way: flat commands under `.zcode/commands/<name>.md`, an empty
// generated config, and support scripts under `.zcode/kaola-workflow/scripts`.
// It installs no prompt-lifecycle hooks.
// Deterministic, idempotent, parity-checked by test-zcode-edition.js.
//
// ZCode installs no Kaola role profiles by design (#1062): the edition renders
// command surfaces only, and dispatch cards become native-route instructions.
// Receipt-aware hook helpers remain only to remove exact rows and shells emitted by
// the retired interim design; they never create a current declaration.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). github writes
// `.zcode/`; a forge writes `.zcode-<forge>/`. Command sources come from the
// routing-surface registry via runtime-edition-forge.js, never a hand list.
//
//   --forge=<f>  github (default) | gitlab | gitea.
//   --write   regenerate the tree from canonical.
//   --check   assert the generated tree is in byte-parity with a fresh render.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const agentGen = require('./generate-agent-profiles');
const forgeLayout = require('./runtime-edition-forge');

const REPO = path.resolve(__dirname, '..');

const TREE_ROOT = (() => {
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const coord = schema.getCoordRoot(REPO);
  return path.basename(coord) === '.git' ? schema.mainRootFromCoord(coord) : REPO;
})();

const DEFAULT_FORGE = 'github';
const CANON_AGENTS_DIR = path.join(REPO, 'agents');
const CANON_HOOKS_DIR = path.join(REPO, 'hooks');

function treeLabel(forge) {
  return '.zcode' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

const HOOK_RECEIPT_SCHEMA = 'kaola-workflow-zcode-hooks-v1';
let atomicSequence = 0;

// No runtime-neutral hook shells are active in the ZCode edition. The generator retains ownership
// of the hook directory so --write can prune stale dispatch artifacts.
const HOOK_SHELLS = [];
// Exact legacy basenames/renderers are retained solely for ownership-safe migration.
const RUNTIME_WRAPPER = 'kaola-workflow-runtime-hook.sh';

// ZCode 3.10.1 hook events (measured). SubagentStart does NOT exist on ZCode.
const ZCODE_HOOK_EVENTS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'PostToolUseFailure', 'Stop',
]);

const { parseFrontmatter, yamlScalar } = forgeLayout;

function listCanonCommands(forge) {
  return forgeLayout.listCanonCommands(forge || DEFAULT_FORGE);
}

function canonCommandPath(basename, forge) {
  return forgeLayout.canonCommandPath(basename, forge || DEFAULT_FORGE);
}

const ZCODE_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _zh="${ZCODE_HOME:-$HOME/.zcode}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_zh/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_zh/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

function zcodeKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return ZCODE_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

function rewriteClaudeScriptPaths(text, forge) {
  forge = forge || DEFAULT_FORGE;
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + zcodeKaolaScript(forge));
}

// ZCode installs no Kaola role profiles by design (#1062): a canonical dispatch card becomes a
// native-route instruction, naming no Kaola role as dispatchable.
function zcodeNativeDispatchProse(card) {
  if (card.includes('doc-updater')) {
    return 'Use a native route or work inline for documentation work — full `general-purpose` or '
      + 'read-only `Explore` as the item\'s boundary requires. Put the changed files, checklist, '
      + 'working directory, and custody boundary in the brief.\n';
  }
  return 'Use a native route or work inline for this routed fix — full `general-purpose` or '
    + 'read-only `Explore` as the item\'s boundary requires. Put the failure command, evidence '
    + 'path, working directory, and custody boundary in the brief.\n';
}

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  let text = body.split(/\r?\n/).join('\n');
  if (text.includes(agentGen.DELEGATION_GUIDANCE_START)) {
    text = agentGen.replaceRuntimeDelegationGuidance(text, 'zcode', forge);
  }
  text = text.replace(/^Agent\(\n[\s\S]*?^\)\n?/gm, zcodeNativeDispatchProse);
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime zcode');
  text = rewriteClaudeScriptPaths(text, forge);
  return text;
}

function renderCommand(canonContent, commandName, forge) {
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  lines.push('name: ' + commandName);
  lines.push('description: ' + yamlScalar(fm.description || ''));
  if (fm['argument-hint']) lines.push('argument-hint: ' + fm['argument-hint']);
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body, forge, commandRel(commandName, forge)).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// config.json — the ZCode 3.10.1 hook mapping. Hooks live under the top-level
// `hooks` object, require "enabled": true, and matcher rows live under its
// `events` object. Project-shaped commands are repo-relative; a --global
// install rewrites the edition prefix to ./kaola-workflow/.
// ---------------------------------------------------------------------------
function renderZcodeConfigJson(forge) {
  forgeLayout.assertForge(forge || DEFAULT_FORGE);
  return '{}\n';
}

function rewriteConfigJsonForGlobal(json, forge) {
  const parsed = JSON.parse(String(json));
  const prefix = 'sh ' + treeLabel(forge) + '/kaola-workflow/';
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.forEach(rewrite);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'command' && typeof child === 'string' && child.startsWith(prefix)) {
        const rest = child.slice(prefix.length);
        const match = rest.match(/^(\S+)([\s\S]*)$/);
        if (match) {
          value[key] = 'sh "${ZCODE_HOME:-$HOME/.zcode}/kaola-workflow/'
            + match[1] + '"' + match[2];
        }
      } else {
        rewrite(child);
      }
    }
  };
  rewrite(parsed && parsed.hooks);
  return JSON.stringify(parsed, null, 2) + '\n';
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRegularOrMissing(file, label) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  if (stat.isSymbolicLink()) {
    throw new Error((label || file) + ' is a symbolic link; refusing to follow or replace it');
  }
  if (!stat.isFile()) throw new Error((label || file) + ' is not a regular file');
  return stat;
}

function atomicWriteFile(file, bytes, mode) {
  ensureDir(path.dirname(file));
  const existing = assertRegularOrMissing(file, file);
  const publishMode = mode == null
    ? (existing ? existing.mode & 0o777 : 0o600)
    : mode & 0o777;
  const temp = path.join(path.dirname(file), '.' + path.basename(file) + '.kw-'
    + process.pid + '-' + Date.now() + '-' + (++atomicSequence) + '.tmp');
  let fd = null;
  try {
    fd = fs.openSync(temp, 'wx', publishMode);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.chmodSync(temp, publishMode);
    fs.renameSync(temp, file);
  } catch (e) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) { /* best-effort temp cleanup */ }
    }
    try { fs.unlinkSync(temp); } catch (_) { /* best-effort temp cleanup */ }
    throw e;
  }
}

function readJsonFile(file, label) {
  assertRegularOrMissing(file, label || file);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error((label || file) + ' is not JSON: ' + e.message); }
}

function defaultReceiptPath(destPath) {
  return destPath + '.kaola-workflow-hooks-state.json';
}

function hookRows(hooks) {
  const direct = Object.entries(hooks || {}).flatMap(([event, entries]) =>
    event === 'enabled' || event === 'events' || !Array.isArray(entries)
      ? []
      : entries.map(entry => ({ event, entry })));
  const wrapped = hooks && hooks.events && typeof hooks.events === 'object'
    && !Array.isArray(hooks.events)
    ? Object.entries(hooks.events).flatMap(([event, entries]) =>
      !Array.isArray(entries) ? [] : entries.map(entry => ({ event, entry })))
    : [];
  return direct.concat(wrapped);
}

function readReceipt(receiptPath, destPath) {
  const stat = assertRegularOrMissing(receiptPath, 'ZCode hook receipt at ' + receiptPath);
  if (!stat) return null;
  const receipt = readJsonFile(receiptPath, 'ZCode hook receipt at ' + receiptPath);
  if (!receipt || receipt.schema !== HOOK_RECEIPT_SCHEMA
      || receipt.destination !== path.resolve(destPath)
      || !Array.isArray(receipt.added)
      || !receipt.priorEnabled || typeof receipt.priorEnabled.present !== 'boolean') {
    throw new Error('ZCode hook receipt at ' + receiptPath + ' is not a recognized exact ownership receipt');
  }
  return receipt;
}

function incomingHooksMapping(opts) {
  const forge = (opts && opts.forge) || DEFAULT_FORGE;
  let mapping = renderZcodeConfigJson(forge);
  if (opts && opts.global) mapping = rewriteConfigJsonForGlobal(mapping, forge);
  return JSON.parse(mapping).hooks;
}

function mergeDestHooks(destPath, opts) {
  opts = opts || {};
  const incoming = incomingHooksMapping(opts);
  const receiptPath = opts.receipt || defaultReceiptPath(destPath);
  const destStat = assertRegularOrMissing(destPath, 'config.json at ' + destPath);
  assertRegularOrMissing(receiptPath, 'ZCode hook receipt at ' + receiptPath);
  let dest = {};
  if (destStat) dest = readJsonFile(destPath, 'config.json at ' + destPath);
  if (!Object.prototype.hasOwnProperty.call(dest, 'hooks')) dest.hooks = {};
  if (!dest.hooks || typeof dest.hooks !== 'object' || Array.isArray(dest.hooks)) {
    throw new Error('config.json at ' + destPath + ' has a non-object hooks value');
  }
  let receipt = readReceipt(receiptPath, destPath);
  const foreignRows = hookRows(dest.hooks).filter(row =>
    !receipt || !receipt.added.some(owned =>
      owned.event === row.event && sameJsonValue(owned.entry, row.entry)));
  if (dest.hooks.enabled === false && foreignRows.length > 0) {
    throw new Error('refusing to enable ZCode hooks: hooks.enabled is false and '
      + foreignRows.length + ' foreign hook entr' + (foreignRows.length === 1 ? 'y is' : 'ies are')
      + ' dormant in the shared user config');
  }
  if (!receipt) {
    receipt = {
      schema: HOOK_RECEIPT_SCHEMA,
      destination: path.resolve(destPath),
      priorEnabled: {
        present: Object.prototype.hasOwnProperty.call(dest.hooks, 'enabled'),
        value: dest.hooks.enabled,
      },
      priorEvents: {
        present: Object.prototype.hasOwnProperty.call(dest.hooks, 'events'),
      },
      added: [],
    };
  } else if (!receipt.priorEvents || typeof receipt.priorEvents.present !== 'boolean') {
    // Receipts written before the 3.10.1 envelope did not record whether an
    // events object already existed. Preserve that observable shape when the
    // exact owned direct rows are migrated, so uninstall cannot erase a
    // user-owned empty events container.
    receipt.priorEvents = {
      present: Object.prototype.hasOwnProperty.call(dest.hooks, 'events'),
    };
  }
  // A pre-3.10.1 receipt may own direct hooks.<event> rows. Those exact rows
  // are retired, not copied into hooks.events: the old `{ command, timeout }`
  // shape is not a 3.10.1 matcher row. The canonical incoming matcher row is
  // added below. Unreceipted direct rows remain user-owned and untouched.
  if (!dest.hooks.events || typeof dest.hooks.events !== 'object' || Array.isArray(dest.hooks.events)) {
    dest.hooks.events = {};
  }
  const incomingEvents = incoming.events && typeof incoming.events === 'object'
    && !Array.isArray(incoming.events) ? incoming.events : {};
  const stillOwned = [];
  for (const owned of receipt.added) {
    const remainsCanonical = Array.isArray(incomingEvents[owned.event])
      && incomingEvents[owned.event].some(entry => sameJsonValue(entry, owned.entry));
    if (remainsCanonical) {
      stillOwned.push(owned);
      continue;
    }
    for (const container of [dest.hooks, dest.hooks.events]) {
      const entries = container && container[owned.event];
      if (!Array.isArray(entries)) continue;
      container[owned.event] = entries.filter(entry => !sameJsonValue(entry, owned.entry));
      if (container[owned.event].length === 0) delete container[owned.event];
    }
  }
  receipt.added = stillOwned;
  dest.hooks.enabled = true; // Safe here: no dormant foreign hook is activated.
  for (const [event, entries] of Object.entries(incomingEvents)) {
    const existing = Array.isArray(dest.hooks.events[event]) ? dest.hooks.events[event] : [];
    dest.hooks.events[event] = existing.slice();
    for (const entry of entries) {
      if (dest.hooks.events[event].some(candidate => sameJsonValue(candidate, entry))) continue;
      dest.hooks.events[event].push(entry);
      receipt.added.push({ event, entry });
    }
  }
  const originalBytes = destStat ? fs.readFileSync(destPath) : null;
  const originalMode = destStat ? destStat.mode & 0o777 : null;
  atomicWriteFile(destPath, JSON.stringify(dest, null, 2) + '\n', originalMode);
  try {
    atomicWriteFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 0o600);
  } catch (e) {
    try {
      if (originalBytes === null) fs.unlinkSync(destPath);
      else atomicWriteFile(destPath, originalBytes, originalMode);
    } catch (rollbackError) {
      e.message += '; config rollback also failed: ' + rollbackError.message;
    }
    throw e;
  }
}

function stripDestHooks(destPath, opts) {
  opts = opts || {};
  const receiptPath = opts.receipt || defaultReceiptPath(destPath);
  const destStat = assertRegularOrMissing(destPath, 'config.json at ' + destPath);
  assertRegularOrMissing(receiptPath, 'ZCode hook receipt at ' + receiptPath);
  if (!destStat) return;
  const receipt = readReceipt(receiptPath, destPath);
  if (!receipt) return; // No exact proof means no ownership and therefore no mutation.
  const dest = readJsonFile(destPath, 'config.json at ' + destPath);
  if (!Object.prototype.hasOwnProperty.call(dest, 'hooks')) dest.hooks = {};
  if (!dest.hooks || typeof dest.hooks !== 'object' || Array.isArray(dest.hooks)) {
    throw new Error('config.json at ' + destPath + ' has a non-object hooks value');
  }
  for (const owned of receipt.added) {
    const containers = [dest.hooks.events, dest.hooks];
    for (const container of containers) {
      if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
      const entries = container[owned.event];
      if (!Array.isArray(entries)) continue;
      container[owned.event] = entries.filter(entry => !sameJsonValue(entry, owned.entry));
      if (container[owned.event].length === 0) delete container[owned.event];
    }
  }
  if (dest.hooks.events && typeof dest.hooks.events === 'object'
      && !Array.isArray(dest.hooks.events) && Object.keys(dest.hooks.events).length === 0) {
    if (!(receipt.priorEvents && receipt.priorEvents.present === true)) delete dest.hooks.events;
  }
  if (dest.hooks.enabled === true) {
    if (receipt.priorEnabled.present) dest.hooks.enabled = receipt.priorEnabled.value;
    else delete dest.hooks.enabled;
  }
  atomicWriteFile(destPath, JSON.stringify(dest, null, 2) + '\n', destStat.mode & 0o777);
  fs.unlinkSync(receiptPath);
}

// ---------------------------------------------------------------------------
// Hook shells + support-script launchers under <tree>/kaola-workflow/.
// ---------------------------------------------------------------------------

const HOOK_ADAPTATIONS = {};

function adaptHookForZcode(script, content) {
  const rules = HOOK_ADAPTATIONS[script] || [];
  let out = content;
  for (const pair of rules) {
    const anchor = pair[0];
    const replacement = pair[1];
    if (!out.includes(anchor)) {
      throw new Error('zcode hook adaptation anchor not found in canonical ' + script + ': ' + anchor);
    }
    if (out.indexOf(anchor) !== out.lastIndexOf(anchor)) {
      throw new Error('zcode hook adaptation anchor is not unique in canonical ' + script + ': ' + anchor);
    }
    out = out.replace(anchor, replacement);
  }
  if (rules.length) {
    const comment = '# zcode-edition: payload-adapted copy (ZCode hook field names) — generated by\n'
      + '# scripts/sync-zcode-edition.js from canonical hooks/' + script + '; do not hand-edit.\n';
    // ZCode execs these files. The shebang must stay line 1; a generated
    // comment in front of `#!` makes the copy not a script.
    const shebang = out.match(/^(#![^\n]*\n)/);
    out = shebang ? shebang[1] + comment + out.slice(shebang[1].length) : comment + out;
  }
  return out;
}

function renderRuntimeHookWrapper() {
  return [
    '#!/bin/sh',
    '# zcode-edition: matcher-row adapter for kaola-workflow-runtime.js.',
    '# ZCode 3.10.1 passes a JSON payload; identity and operation are projected',
    '# only when explicit fields are present. Generated by sync-zcode-edition.js.',
    '# UserPromptSubmit activates only /workflow-next and /kaola-workflow-finalize.',
    '',
    'PHASE="${1:-pre-tool}"',
    '_zh="${ZCODE_HOME:-$HOME/.zcode}"',
    '_adapter="${KAOLA_WORKFLOW_RUNTIME_HOOK:-$_zh/kaola-workflow/scripts/kaola-workflow-runtime-hook.js}"',
    'if [ ! -f "$_adapter" ] && [ -f "./scripts/kaola-workflow-runtime-hook.js" ]; then',
    '  _adapter="./scripts/kaola-workflow-runtime-hook.js"',
    'fi',
    '[ -f "$_adapter" ] || exit 0',
    'exec node "$_adapter" --runtime zcode --phase "$PHASE"',
    '',
  ].join('\n');
}

// The generated tree carries a NAME-PER-MANIFEST-ENTRY launcher per support
// script, not a copy: the real support scripts live where the installer
// deploys them ($ZCODE_HOME/kaola-workflow/scripts, or this checkout when
// running self-dev). The launcher resolves one of those and execs it, so the
// generated tree stays free of edition-hostile prose the real scripts carry.
function renderSupportLauncher(basename, forge) {
  forge = forge || DEFAULT_FORGE;
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return [
    '#!/usr/bin/env node',
    '\'use strict\';',
    '// zcode-edition support launcher (generated by scripts/sync-zcode-edition.js; do not',
    '// hand-edit). Resolves the real support script — installed under the ZCode home, or this',
    '// checkout when running self-dev — and runs it with the arguments given here.',
    'const fs = require(\'fs\');',
    'const os = require(\'os\');',
    'const path = require(\'path\');',
    'const { spawnSync } = require(\'child_process\');',
    'const NAME = ' + JSON.stringify(basename) + ';',
    'const SELF_DEV = ' + JSON.stringify(selfDev) + ';',
    'const home = process.env.ZCODE_HOME || path.join(os.homedir(), \'.zcode\');',
    'let self = \'\';',
    'try { self = require(path.join(process.cwd(), \'package.json\')).name; } catch (e) { /* not a node repo */ }',
    'const installed = path.join(home, \'kaola-workflow\', \'scripts\', NAME);',
    'const selfDevPath = path.join(process.cwd(), SELF_DEV, NAME);',
    'const resolved = (self === \'kaola-workflow\' ? [selfDevPath, installed] : [installed, selfDevPath])',
    '  .find(p => fs.existsSync(p));',
    'if (!resolved) {',
    '  console.error(\'kaola-workflow (zcode edition): support script not found: \' + NAME);',
    '  process.exit(1);',
    '}',
    'const r = spawnSync(process.execPath, [resolved].concat(process.argv.slice(2)), { stdio: \'inherit\' });',
    'process.exit(r.status === null ? 1 : r.status);',
    '',
  ].join('\n');
}

function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}
function treePath(rel) {
  return path.join(TREE_ROOT, rel);
}
function readTree(rel) {
  return fs.readFileSync(treePath(rel), 'utf8');
}
function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function commandRel(name, forge) {
  return forgeLayout.commandRel(treeLabel, name, forge);
}
function configRel(forge) {
  return treeLabel(forge) + '/config.json';
}

function expectedCommandFiles(forge) {
  return listCanonCommands(forge).map(f => f.slice(0, -3));
}
function expectedHookFiles() {
  return [];
}
function expectedPromptFiles() {
  return [];
}
function manifestSupportScripts(forge) {
  const manifest = require('./kaola-workflow-install-manifest.js');
  return manifest.supportScripts(forge || DEFAULT_FORGE);
}

function retiredAgentFiles(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'agents'));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort();
}

function retiredCommandFiles(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'commands'));
  if (!fs.existsSync(dir)) return [];
  const expected = new Set(expectedCommandFiles(forge).map(n => n + '.md'));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md') && !expected.has(e.name))
    .map(e => e.name)
    .sort();
}

function retiredEditionFiles(forge) {
  const out = [];
  const base = treePath(path.join(treeLabel(forge), 'kaola-workflow'));
  const hooksDir = path.join(base, 'hooks');
  if (fs.existsSync(hooksDir)) {
    const expected = new Set(expectedHookFiles());
    for (const e of fs.readdirSync(hooksDir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.sh') && !expected.has(e.name)) out.push('hooks/' + e.name);
    }
  }
  const scriptsDir = path.join(base, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const expected = new Set(manifestSupportScripts(forge));
    for (const e of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.js') && !expected.has(e.name)) out.push('scripts/' + e.name);
    }
  }
  const promptsDir = path.join(base, 'prompts');
  if (fs.existsSync(promptsDir)) {
    const expected = new Set(expectedPromptFiles());
    for (const e of fs.readdirSync(promptsDir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.md') && !expected.has(e.name)) out.push('prompts/' + e.name);
    }
  }
  return out.sort();
}

function pruneTree(forge) {
  let removed = 0;
  for (const f of retiredAgentFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'agents', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/agents/' + f + ' (retired surface)');
    removed++;
  }
  for (const f of retiredCommandFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'commands', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/commands/' + f + ' (retired surface)');
    removed++;
  }
  for (const f of retiredEditionFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'kaola-workflow', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/kaola-workflow/' + f + ' (retired artifact)');
    removed++;
  }
  return removed;
}

function writeCommands(forge) {
  let wrote = 0;
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const out = renderCommand(canon, name, forge);
    const rel = commandRel(name, forge);
    const dest = treePath(rel);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== out) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, out);
      console.log('generated  ' + rel);
      wrote++;
    }
  }
  return wrote;
}

function writeEditionDir(forge) {
  let wrote = 0;
  const hooksDir = treePath(path.join(treeLabel(forge), 'kaola-workflow', 'hooks'));
  ensureDir(hooksDir);
  for (const script of HOOK_SHELLS) {
    const dest = path.join(hooksDir, script);
    const content = adaptHookForZcode(script, fs.readFileSync(path.join(CANON_HOOKS_DIR, script), 'utf8'));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log((HOOK_ADAPTATIONS[script] ? 'adapted    ' : 'copied     ') + treeLabel(forge) + '/kaola-workflow/hooks/' + script);
      wrote++;
    }
  }
  const scriptsDir = treePath(path.join(treeLabel(forge), 'kaola-workflow', 'scripts'));
  ensureDir(scriptsDir);
  for (const base of manifestSupportScripts(forge)) {
    const dest = path.join(scriptsDir, base);
    const content = renderSupportLauncher(base, forge);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log('generated  ' + treeLabel(forge) + '/kaola-workflow/scripts/' + base);
      wrote++;
    }
  }
  return wrote;
}

function writeConfig(forge) {
  const json = renderZcodeConfigJson(forge);
  const dest = treePath(configRel(forge));
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== json) {
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, json);
    console.log('generated  ' + configRel(forge));
    return 1;
  }
  return 0;
}

function runWrite(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const c = writeCommands(forge);
  const e = writeEditionDir(forge);
  const j = writeConfig(forge);
  const p = pruneTree(forge);
  const total = c + e + j + p;
  console.log('sync-zcode-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

function refreshOne(forge) {
  return writeCommands(forge) + writeEditionDir(forge)
    + writeConfig(forge) + pruneTree(forge);
}

function runRefreshPresent() {
  const refreshed = [];
  let changed = 0;
  for (const forge of forgeLayout.FORGES) {
    if (!fs.existsSync(treePath(treeLabel(forge)))) continue;
    changed += refreshOne(forge);
    refreshed.push(treeLabel(forge));
  }
  if (refreshed.length) {
    console.log('sync-zcode-edition: refreshed ' + refreshed.length + ' present tree(s): '
      + refreshed.join(', ') + '.');
  }
  if (changed > 0 && TREE_ROOT !== REPO) {
    console.error('sync-zcode-edition: NOTE — ' + changed
      + ' change(s) in a checkout that is not this one.');
    console.error('  ' + refreshed.join(', ') + ' under ' + TREE_ROOT);
    console.error('  now render THIS checkout\'s canonical sources (' + REPO
      + '), including anything uncommitted here.');
    console.error('  Verify from that root: node scripts/test-zcode-edition.js');
  }
}

function runCheck(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const tree = treeLabel(forge);
  const mismatches = [];
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const rel = commandRel(name, forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated command' });
      continue;
    }
    if (readTree(rel) !== renderCommand(canon, name, forge)) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
  for (const script of HOOK_SHELLS) {
    const rel = tree + '/kaola-workflow/hooks/' + script;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (readTree(rel) !== adaptHookForZcode(script, read('hooks/' + script))) {
      mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
    }
  }
  for (const base of manifestSupportScripts(forge)) {
    const rel = tree + '/kaola-workflow/scripts/' + base;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing support-script launcher' });
      continue;
    }
    if (readTree(rel) !== renderSupportLauncher(base, forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  {
    const rel = configRel(forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated config.json' });
    } else if (readTree(rel) !== renderZcodeConfigJson(forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  for (const f of retiredAgentFiles(forge)) {
    mismatches.push({ rel: tree + '/agents/' + f, reason: 'retired surface — ZCode installs no Kaola role profiles; prune (--write removes it)' });
  }
  for (const f of retiredCommandFiles(forge)) {
    mismatches.push({ rel: tree + '/commands/' + f, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  for (const f of retiredEditionFiles(forge)) {
    mismatches.push({ rel: tree + '/kaola-workflow/' + f, reason: 'retired artifact no longer emitted — prune (--write removes it)' });
  }
  if (mismatches.length) {
    console.error('sync-zcode-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-zcode-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
  const nc = listCanonCommands(forge).length;
  console.log('sync-zcode-edition[' + forge + ']: ' + nc + ' command(s) + '
    + (expectedHookFiles().length + expectedPromptFiles().length + manifestSupportScripts(forge).length)
    + ' support/hook/prompt file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-zcode-edition.js (--write | --refresh-present | --check)'
    + ' [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .zcode/;\n'
    + '               gitlab/gitea write .zcode-<forge>/\n'
    + '  --write   regenerate the forge tree commands + hooks from canonical\n'
    + '  --refresh-present  regenerate every forge tree that already exists; create none (ignores --forge)\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
    + '  --print-tree-root  print the directory the generated trees land in; write nothing\n'
    + '  --merge-hooks --dest=PATH [--receipt=PATH] [--global]  merge with an exact receipt\n'
    + '  --strip-hooks --dest=PATH [--receipt=PATH]             remove receipt-owned entries\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const forge = forgeArg ? forgeArg.slice('--forge='.length) : DEFAULT_FORGE;
  try {
    forgeLayout.assertForge(forge);
  } catch (e) {
    console.error('sync-zcode-edition: ' + e.message);
    process.exitCode = 2;
    return;
  }
  const flags = argv.filter(a => !a.startsWith('--forge='));
  const arg = flags[0];
  if (arg === '--write') return runWrite(forge);
  if (arg === '--refresh-present') return runRefreshPresent();
  if (arg === '--check') return runCheck(forge);
  if (arg === '--print-tree-root') { process.stdout.write(TREE_ROOT + '\n'); return; }
  if (arg === '--merge-hooks' || arg === '--strip-hooks') {
    const destArg = flags.find(a => a.startsWith('--dest='));
    if (!destArg) {
      console.error('sync-zcode-edition: ' + arg + ' requires --dest=PATH');
      process.exitCode = 2;
      return;
    }
    const dest = destArg.slice('--dest='.length);
    const receiptArg = flags.find(a => a.startsWith('--receipt='));
    const receipt = receiptArg ? receiptArg.slice('--receipt='.length) : undefined;
    try {
      if (arg === '--merge-hooks') mergeDestHooks(dest, { forge, global: flags.includes('--global'), receipt });
      else stripDestHooks(dest, { forge, receipt });
    } catch (e) {
      console.error('sync-zcode-edition: ' + e.message);
      process.exitCode = 1;
    }
    return;
  }
  usage();
}

if (require.main === module) main();

module.exports = {
  renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, ZCODE_KAOLA_SCRIPT, zcodeKaolaScript,
  renderZcodeConfigJson, rewriteConfigJsonForGlobal, mergeDestHooks, stripDestHooks,
  renderRuntimeHookWrapper, RUNTIME_WRAPPER,
  expectedPromptFiles,
  adaptHookForZcode, HOOK_ADAPTATIONS,
  renderSupportLauncher, manifestSupportScripts,
  treeLabel, commandRel, configRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  ZCODE_HOOK_EVENTS,
  HOOK_RECEIPT_SCHEMA, defaultReceiptPath, atomicWriteFile,
  expectedHookFiles, retiredHookFiles: retiredEditionFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, yamlScalar,
  listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SHELLS,
};
