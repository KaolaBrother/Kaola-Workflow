#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-zcode-edition.js — generate the ZCode runtime edition from canonical.
//
// ZCode (measured against ZCode 3.9.1) is a coding-agent RUNTIME (like
// opencode/Kimi/Grok/Cursor), not a git forge, and it does NOT ride the
// install.sh --forge= machinery or edition-sync.js. It is delivered the
// ZCode-native way: named agents under `.zcode/agents/<role>.md` (Agent
// dispatch types), flat commands under `.zcode/commands/<name>.md`, a merged
// user-scope `${ZCODE_HOME:-$HOME/.zcode}/cli/config.json` whose top-level `hooks` object requires
// `"enabled": true` and offers exactly seven events (SessionStart,
// UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse,
// PostToolUseFailure, Stop — there is no SubagentStart), and support
// scripts/hook shells under `.zcode/kaola-workflow/{scripts,hooks}`.
// Deterministic, idempotent, parity-checked by test-zcode-edition.js.
//
// ZCode discovers subagents and executable hook configuration ONLY at user scope,
// so the installer additionally syncs the staged agent roster and merges the hooks
// into the live user configuration.
//
// Canonical model classes drive the generated agent tier pins (measured on
// ZCode 3.9.1): every agent renders `model: GLM-5.3` plus exactly one
// camelCase `thoughtLevel:` field — sonnet/standard (standard tier) → high,
// opus/reasoning (reasoning tier) → max, fable/heavy (heavy tier) → max.
// The frontmatter key is `thoughtLevel`, NOT `reasoningEffort`/`effort`, and
// it only takes effect together with an explicit `model`. Agent dispatch
// cards stay model-free: the tier travels with the named type.
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

const MANAGED_ROLES = new Set(agentGen.ROLES);
const ZERO_HASH = '0'.repeat(64);
const HOOK_RECEIPT_SCHEMA = 'kaola-workflow-zcode-hooks-v1';
let atomicSequence = 0;

// No runtime-neutral hook shells are active in the ZCode edition. The generator retains ownership
// of the hook directory so --write can prune stale dispatch artifacts.
const HOOK_SHELLS = [];
const COMPACT_WRAPPER = 'kaola-workflow-compact-context.sh';

// ZCode 3.9.1 hook events (measured). SubagentStart does NOT exist on ZCode.
const ZCODE_HOOK_EVENTS = Object.freeze([
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest',
  'PostToolUse', 'PostToolUseFailure', 'Stop',
]);

function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return { fm, body: m[2] };
}

// Quote descriptions that would not be a plain YAML scalar (a colon in
// knowledge-lookup's description makes at least one runtime silently skip
// the file; quoting is cheap and keeps the ZCode tree loadable).
function yamlScalar(value) {
  const s = String(value == null ? '' : value);
  if (s === '' || /[:#{}[\],&*!|>'"%@`\n]/.test(s) || /^(true|false|null|~)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function listCanonAgents() {
  return [...agentGen.ROLES];
}

function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}

function canonCommandPath(basename, forge) {
  const src = forgeLayout.commandSources(forge || DEFAULT_FORGE).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge || DEFAULT_FORGE}`);
  return src.absPath;
}

function renderAgent(canonContent, agentName, forge) {
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-zcode-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('zcode', agentName).content;
}

const ZCODE_MODEL_DISPATCH_GUIDANCE =
  'Use the named role as `subagent_type`. Generated agent frontmatter already pins the canonical '
  + 'tier — model GLM-5.3 plus the tier-selected thoughtLevel — so dispatch cards carry no '
  + 'per-call model override.';

const ZCODE_MODEL_DISPATCH_BLOCK = [
  '## Agent Model Dispatch',
  '',
  'ZCode dispatches subagents through the same `Agent(` card used everywhere: the named role as',
  '`subagent_type`, no per-call model override. Every generated agent pins `model: GLM-5.3` in',
  'frontmatter plus exactly one `thoughtLevel:` field selected by its canonical tier — standard',
  'high, reasoning max, heavy (fable) max — so the tier travels with the named type and is not',
  'restated on the card.',
  '',
  'Dispatch a role with `Agent` using `subagent_type: "<role>"` only. Never substitute a generic',
  'type plus a prompt costume; impersonation is the bug. The dispatch prompt is the mission and',
  'locator; do not paste the role contract onto a named type. Card shape:',
  '',
  'Agent(',
  '  prompt="<the mission and locator>",',
  '  subagent_type="<role>"',
  ')',
  '',
  'The reviewer heavy re-dispatch carve-out does not apply on this runtime: a per-dispatch tier',
  'escalation is not expressible here, so a reviewer-class re-dispatch runs at the pinned tier of',
  'its named type. If the pinned tier cannot finish the review, run the review pass inline and',
  'record what happened in the mission list.',
  '',
  'If the named role cannot be spawned, do the work inline and say so — that is tool unavailability.',
  '',
].join('\n');

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

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  const block = ZCODE_MODEL_DISPATCH_BLOCK.replace(/\s+$/, '');
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    i++;
  }
  let text = out.join('\n');
  // ZCode's dispatch tool is also Agent( — the canonical Agent( cards stay verbatim.
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime zcode');
  text = rewriteClaudeScriptPaths(text, forge);
  // A command with no dispatch section of its own (workflow-init) still names
  // the card shape, so every generated command carries a line-start Agent(
  // reference while card-for-card parity with canonical is preserved.
  if (!/^Agent\(/m.test(text)) {
    text = text.replace(/\s+$/, '') + '\n\n'
      + 'Named dispatch uses the `Agent(` card with the named role as `subagent_type`:\n\n'
      + 'Agent(\n  prompt="<the mission and locator>",\n  subagent_type="<role>"\n)\n';
  }
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
// config.json — the ZCode hook mapping. Hooks live under the top-level
// `hooks` object, require "enabled": true, and offer exactly seven events
// (measured on ZCode 3.9.1; there is no SubagentStart). Project-shaped
// commands are repo-relative; a --global install rewrites the edition prefix
// to ./kaola-workflow/ (user hooks run from ~/.zcode/).
// ---------------------------------------------------------------------------
function renderZcodeConfigJson(forge) {
  const label = treeLabel(forge);
  return JSON.stringify({
    hooks: {
      enabled: true,
      SessionStart: [{
        command: 'sh ' + label + '/kaola-workflow/hooks/' + COMPACT_WRAPPER,
        timeout: 5,
      }],
    },
  }, null, 2) + '\n';
}

function rewriteConfigJsonForGlobal(json, forge) {
  const parsed = JSON.parse(String(json));
  const prefix = 'sh ' + treeLabel(forge) + '/kaola-workflow/';
  for (const entries of Object.values((parsed && parsed.hooks) || {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry.command !== 'string' || !entry.command.startsWith(prefix)) continue;
      entry.command = 'sh "${ZCODE_HOME:-$HOME/.zcode}/kaola-workflow/'
        + entry.command.slice(prefix.length) + '"';
    }
  }
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
  return Object.entries(hooks || {}).flatMap(([event, entries]) =>
    event === 'enabled' || !Array.isArray(entries)
      ? []
      : entries.map(entry => ({ event, entry })));
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
  dest.hooks = dest.hooks || {};
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
      added: [],
    };
  }
  dest.hooks.enabled = true; // Safe here: no dormant foreign hook is activated.
  for (const [event, entries] of Object.entries(incoming)) {
    if (event === 'enabled') continue;
    const existing = Array.isArray(dest.hooks[event]) ? dest.hooks[event] : [];
    dest.hooks[event] = existing.slice();
    for (const entry of entries) {
      if (dest.hooks[event].some(candidate => sameJsonValue(candidate, entry))) continue;
      dest.hooks[event].push(entry);
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
  dest.hooks = dest.hooks || {};
  for (const owned of receipt.added) {
    const entries = dest.hooks[owned.event];
    if (!Array.isArray(entries)) continue;
    dest.hooks[owned.event] = entries.filter(entry => !sameJsonValue(entry, owned.entry));
    if (dest.hooks[owned.event].length === 0) delete dest.hooks[owned.event];
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

function renderCompactWrapper(forge) {
  forge = forge || DEFAULT_FORGE;
  const compactJs = forgeLayout.scriptName('kaola-workflow-compact-context.js', forge);
  return [
    '#!/bin/sh',
    '# zcode-edition: SessionStart resume-context wrapper. Feeds the hook payload to the',
    '# compact-context support script (resolved via the generated tree launcher) and lets',
    '# its stdout through. Generated by scripts/sync-zcode-edition.js; do not hand-edit.',
    '',
    'HOOK_INPUT="$(cat)"',
    'SCRIPT="${ZCODE_HOME:-$HOME/.zcode}/kaola-workflow/scripts/' + compactJs + '"',
    '[ -f "$SCRIPT" ] || exit 0',
    'printf \'%s\' "$HOOK_INPUT" | node "$SCRIPT" 2>/dev/null || true',
    'exit 0',
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

function agentRel(name, forge) {
  return treeLabel(forge) + '/agents/' + name + '.md';
}
function commandRel(name, forge) {
  return treeLabel(forge) + '/commands/' + name + '.md';
}
function configRel(forge) {
  return treeLabel(forge) + '/config.json';
}

function expectedAgentFiles(forge) {
  return listCanonAgents();
}
function expectedCommandFiles(forge) {
  return listCanonCommands(forge).map(f => f.slice(0, -3));
}
function expectedHookFiles() {
  return HOOK_SHELLS.concat([COMPACT_WRAPPER]);
}
function manifestSupportScripts(forge) {
  const manifest = require('./kaola-workflow-install-manifest.js');
  return manifest.supportScripts(forge || DEFAULT_FORGE);
}

function retiredAgentFiles(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'agents'));
  if (!fs.existsSync(dir)) return [];
  const expected = new Set(expectedAgentFiles(forge).map(n => n + '.md'));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md') && !expected.has(e.name))
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

function writeAgents(forge) {
  let wrote = 0;
  for (const name of listCanonAgents()) {
    const canon = fs.readFileSync(path.join(CANON_AGENTS_DIR, name + '.md'), 'utf8');
    const out = renderAgent(canon, name, forge);
    const rel = agentRel(name, forge);
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
  const wrapperDest = path.join(hooksDir, COMPACT_WRAPPER);
  const wrapper = renderCompactWrapper(forge);
  if (!fs.existsSync(wrapperDest) || fs.readFileSync(wrapperDest, 'utf8') !== wrapper) {
    fs.writeFileSync(wrapperDest, wrapper);
    fs.chmodSync(wrapperDest, 0o755);
    console.log('generated  ' + treeLabel(forge) + '/kaola-workflow/hooks/' + COMPACT_WRAPPER);
    wrote++;
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
  const a = writeAgents(forge);
  const c = writeCommands(forge);
  const e = writeEditionDir(forge);
  const j = writeConfig(forge);
  const p = pruneTree(forge);
  const total = a + c + e + j + p;
  console.log('sync-zcode-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

function refreshOne(forge) {
  return writeAgents(forge) + writeCommands(forge) + writeEditionDir(forge)
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
  for (const name of listCanonAgents()) {
    const canon = read('agents/' + name + '.md');
    const rel = agentRel(name, forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated agent' });
      continue;
    }
    if (readTree(rel) !== renderAgent(canon, name, forge)) mismatches.push({ rel, reason: 'stale — regenerate' });
  }
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
  {
    const rel = tree + '/kaola-workflow/hooks/' + COMPACT_WRAPPER;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated compact wrapper' });
    } else if (readTree(rel) !== renderCompactWrapper(forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
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
    mismatches.push({ rel: tree + '/agents/' + f, reason: 'retired surface not in canonical — prune (--write removes it)' });
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
  const na = listCanonAgents().length;
  const nc = listCanonCommands(forge).length;
  console.log('sync-zcode-edition[' + forge + ']: ' + na + ' agent(s) + ' + nc + ' command(s) + '
    + (expectedHookFiles().length + manifestSupportScripts(forge).length) + ' support/hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-zcode-edition.js (--write | --refresh-present | --check)'
    + ' [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .zcode/;\n'
    + '               gitlab/gitea write .zcode-<forge>/\n'
    + '  --write   regenerate the forge tree agents + commands + hooks from canonical\n'
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
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, ZCODE_KAOLA_SCRIPT, zcodeKaolaScript,
  ZCODE_MODEL_DISPATCH_GUIDANCE, ZCODE_MODEL_DISPATCH_BLOCK,
  renderZcodeConfigJson, rewriteConfigJsonForGlobal, mergeDestHooks, stripDestHooks,
  renderCompactWrapper, COMPACT_WRAPPER, adaptHookForZcode, HOOK_ADAPTATIONS,
  renderSupportLauncher, manifestSupportScripts,
  treeLabel, agentRel, commandRel, configRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  ZCODE_HOOK_EVENTS,
  HOOK_RECEIPT_SCHEMA, defaultReceiptPath, atomicWriteFile,
  expectedHookFiles, retiredHookFiles: retiredEditionFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, yamlScalar,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SHELLS,
};
