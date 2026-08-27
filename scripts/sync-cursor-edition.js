#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-cursor-edition.js — generate the Cursor runtime edition from canonical.
//
// Cursor is a coding-agent RUNTIME (like Codex/opencode/Kimi/Grok), not a git forge,
// and it does NOT ride the install.sh --forge= machinery. It is delivered the
// Cursor-native way: named agents under `.cursor/agents/<role>.md` (Task
// types), flat slash commands under `.cursor/commands/<name>.md`, hook scripts
// under `.cursor/hooks/`, and `.cursor/hooks.json` (sessionStart resume inject).
// Deterministic, idempotent, and parity-checked
// by test-cursor-edition.js.
//
// Canonical model classes drive the generated agent tier pins: sonnet/standard
// render the raw `model: grok-4.6[effort=medium]` line, opus/reasoning
// render `model: grok-4.6[effort=high]`, and fable/heavy render
// `model: grok-4.6[effort=xhigh]`. Named-profile Task cards omit per-dispatch model overrides so
// the profile carries its tier. A built-in-only catalog-miss path uses live members as themselves
// and may use only a resolver-listed live model slug as an effort lever; the one-family allowlist
// applies to generated profile pins, not that live-schema fallback.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). github writes `.cursor/`;
// a forge writes `.cursor-<forge>/`. Command sources come from the routing-surface
// registry via runtime-edition-forge.js. The edition stays out of `npm test`,
// `edition-sync.js`, `install.sh`, and the routing-surface --check contract.
//
//   --forge=<f>  github (default) | gitlab | gitea.
//   --write   regenerate <tree>/agents + commands + hooks from canonical.
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
  return '.cursor' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

const MANAGED_ROLES = new Set(agentGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

// No runtime-neutral hook scripts are active in the Cursor edition. The generator retains ownership
// of the hooks directory so --write can prune stale dispatch artifacts.
const HOOK_SCRIPTS = [];
const COMPACT_WRAPPER = 'kaola-workflow-compact-context.sh';

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

function parseTools(raw) {
  if (!raw) return [];
  const inner = String(raw).replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function lowerSet(arr) {
  return new Set(arr.map(x => String(x).toLowerCase()));
}

// Quote descriptions that would not be a plain YAML scalar. An unquoted colon in
// knowledge-lookup's description made one runtime silently skip the file; quoting
// is cheap and keeps the Cursor tree loadable.
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

function copyListCanonAgents(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const names = new Set(listCanonAgents());
  for (const name of names) {
    const src = path.join(srcDir, name + '.md');
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(destDir, name + '.md'));
  }
}

function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}

function canonCommandPath(basename, forge) {
  const src = forgeLayout.commandSources(forge || DEFAULT_FORGE).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge || DEFAULT_FORGE}`);
  return src.absPath;
}

function isReadOnlyRole(toolSet) {
  return !(toolSet.has('write') || toolSet.has('edit'));
}

const CURSOR_MODEL_CLASS_PINS = Object.freeze({
  sonnet: 'grok-4.6[effort=medium]',
  standard: 'grok-4.6[effort=medium]',
  opus: 'grok-4.6[effort=high]',
  reasoning: 'grok-4.6[effort=high]',
  fable: 'grok-4.6[effort=xhigh]',
  heavy: 'grok-4.6[effort=xhigh]',
});

function cursorModelPin(canonicalModel, agentName) {
  const token = String(canonicalModel == null ? '' : canonicalModel).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CURSOR_MODEL_CLASS_PINS, token)) {
    throw new Error('sync-cursor-edition: agent "' + (agentName || '(unnamed)')
      + '" requires a canonical model token sonnet, standard, opus, reasoning, fable, or heavy; received '
      + (token ? JSON.stringify(token) : '(absent)'));
  }
  return CURSOR_MODEL_CLASS_PINS[token];
}

function renderAgent(canonContent, agentName, forge) {
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-cursor-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('cursor', agentName).content;
}

const CURSOR_MODEL_DISPATCH_GUIDANCE =
  'Inspect the live Task enum first. Named Cursor agents carry generated frontmatter that pins '
  + 'standard, reasoning, or fable/heavy at medium, high, or xhigh (fable is grok-4.6[effort=xhigh]) '
  + 'only when that name is in the enum; omit per-call model then. A built-in-only enum uses those '
  + 'members as themselves. Do not claim IDE children display distinct effort.';

const CURSOR_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _gh="${CURSOR_HOME:-$HOME/.cursor}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_gh/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_gh/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

function cursorKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return CURSOR_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

function rewriteClaudeScriptPaths(text, forge) {
  forge = forge || DEFAULT_FORGE;
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + cursorKaolaScript(forge));
}

function cursorNativeDispatchProse(card) {
  if (card.includes('doc-updater')) {
    return 'Use exact `doc-updater` from the current Task catalog through the live Task schema '
      + 'when that name is present. Put the changed files, checklist, working directory, and custody '
      + 'boundary in its brief; omit model so the named profile carries its tier. If the live enum '
      + 'is built-in-only, do not impersonate `doc-updater`: dispatch `generalPurpose` only as itself '
      + 'for generic docs, or inline that item and record capability_gap.\n';
  }
  const role = card.includes('build-error-resolver') ? 'build-error-resolver' : 'tdd-guide';
  return 'Use exact `' + role + '` from the current Task catalog through the live Task schema '
    + 'when that name is present. Put the failure command, evidence path, working directory, and '
    + 'custody boundary in its brief; omit model so the named profile carries its tier. If the live '
    + 'enum is built-in-only, do not impersonate `' + role + '`: inline custody-bearing work and '
    + 'record capability_gap, or dispatch a live built-in only as itself when its real boundary fits.\n';
}

function cursorCliMaterializationProse(forge) {
  return [
    '## Cursor standalone CLI pre-dispatch materialization',
    '',
    'Apply this check only when the current execution product is the standalone Cursor CLI on the',
    'local host. Do not enter this branch merely because a sibling CLI binary exists. Cursor App',
    'local IDE Agent and App-started Cloud are separate hosts: inspect their live Task catalog and',
    'do not apply or infer this CLI materialization rule for either App host.',
    '',
    'Immediately before the first named Kaola child dispatch, run the installed transaction with',
    'the current workspace as an explicit target:',
    '',
    '```sh',
    'CURSOR_MATERIALIZER="${CURSOR_HOME:-$HOME/.cursor}/kaola-workflow/scripts/kaola-workflow-cursor-surface.js"',
    '[ -f "$CURSOR_MATERIALIZER" ] || { echo "capability_gap: Cursor global authority/helper missing; run ./install-cursor.sh --global --yes"; exit 1; }',
    'node "$CURSOR_MATERIALIZER" --ensure-target "$PWD" --forge=' + forge + ' --json',
    '```',
    '',
    'A `status: current` result is a no-op; continue by inspecting the live Task enum. A',
    '`status: materialized` result means safe project bytes or their receipt changed: stop named',
    'dispatch, start a new Cursor CLI process with the same chat at this workspace, and re-run the',
    'command before dispatch. The measured reload boundary is a new process, not same-process hot',
    'load. Missing or stale global authority, an unmanaged canonical-name collision, a symlink or',
    'nonregular carrier, invalid/copied receipt, or modified receipt-owned bytes fails closed before',
    'project mutation. Report the exact diagnostic and the explicit global-install or owner-file',
    'repair; never substitute an ambient cwd copier or a sessionStart materializer.',
  ].join('\n');
}

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    i++;
  }
  let text = out.join('\n');
  if (text.includes(agentGen.DELEGATION_GUIDANCE_START)) {
    text = agentGen.replaceRuntimeDelegationGuidance(text, 'cursor', forge);
  }
  text = text.replace(/^Agent\(\n[\s\S]*?^\)\n?/gm, cursorNativeDispatchProse);
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime cursor');
  text = rewriteClaudeScriptPaths(text, forge);
  const basename = path.posix.basename(label || '');
  if (basename === 'workflow-next.md' || basename === 'kaola-workflow-finalize.md') {
    text = text.trimEnd() + '\n\n' + cursorCliMaterializationProse(forge) + '\n';
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

// Project-shaped mapping. Cursor loads `<project>/.cursor/hooks.json` and does
// not expand ${VAR} in command fields. A --global install rewrites the prefix
// `.cursor/hooks/` → `./hooks/` (user hooks run from ~/.cursor/).
function renderCursorHooksJson() {
  return JSON.stringify({
    version: 1,
    hooks: {
      sessionStart: [
        {
          command: '.cursor/hooks/' + COMPACT_WRAPPER,
          timeout: 5,
        },
      ],
    },
  }, null, 2) + '\n';
}

function rewriteHooksJsonForGlobal(json) {
  return String(json).split('.cursor/hooks/').join('./hooks/');
}

function isKaolaHookEntry(entry) {
  return String((entry && entry.command) || '').includes('kaola-workflow-');
}

function mergeDestHooks(destPath, opts) {
  opts = opts || {};
  let mapping = renderCursorHooksJson();
  if (opts.global) mapping = rewriteHooksJsonForGlobal(mapping);
  const incoming = JSON.parse(mapping);
  let dest = { version: 1, hooks: {} };
  if (fs.existsSync(destPath)) {
    try { dest = JSON.parse(fs.readFileSync(destPath, 'utf8')); }
    catch (e) { throw new Error('hooks.json at ' + destPath + ' is not JSON: ' + e.message); }
  }
  dest.version = dest.version || 1;
  dest.hooks = dest.hooks || {};
  for (const [event, entries] of Object.entries(incoming.hooks || {})) {
    const existing = Array.isArray(dest.hooks[event]) ? dest.hooks[event] : [];
    dest.hooks[event] = existing.filter(e => !isKaolaHookEntry(e)).concat(entries);
  }
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, JSON.stringify(dest, null, 2) + '\n');
}

function stripDestHooks(destPath) {
  if (!fs.existsSync(destPath)) return;
  let dest;
  try { dest = JSON.parse(fs.readFileSync(destPath, 'utf8')); }
  catch { return; }
  dest.hooks = dest.hooks || {};
  for (const event of Object.keys(dest.hooks)) {
    if (!Array.isArray(dest.hooks[event])) continue;
    dest.hooks[event] = dest.hooks[event].filter(e => !isKaolaHookEntry(e));
    if (dest.hooks[event].length === 0) delete dest.hooks[event];
  }
  fs.writeFileSync(destPath, JSON.stringify(dest, null, 2) + '\n');
}

function renderCompactWrapper(forge) {
  forge = forge || DEFAULT_FORGE;
  const compactJs = forgeLayout.scriptName('kaola-workflow-compact-context.js', forge);
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return [
    '#!/bin/sh',
    '# cursor-edition: wrap compact-context.js stdout as sessionStart additional_context.',
    '# Generated by scripts/sync-cursor-edition.js; do not hand-edit.',
    '# Cursor sessionStart injects JSON additional_context; the canonical script prints',
    '# plain text. preCompact cannot inject into the agent — that gap is declared as',
    '# session_start_resume_injection.',
    '',
    'HOOK_INPUT="$(cat)"',
    '_n="' + compactJs + '"',
    '_self=""',
    '[ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"',
    '_ch="${CURSOR_HOME:-$HOME/.cursor}"',
    'COMPACT=""',
    'if [ "$_self" = "kaola-workflow" ]; then',
    '  for _p in "' + selfDev + '/$_n" "$_ch/kaola-workflow/scripts/$_n"; do',
    '    [ -f "$_p" ] && { COMPACT="$_p"; break; }',
    '  done',
    'else',
    '  for _p in "$_ch/kaola-workflow/scripts/$_n" "' + selfDev + '/$_n"; do',
    '    [ -f "$_p" ] && { COMPACT="$_p"; break; }',
    '  done',
    'fi',
    '[ -z "$COMPACT" ] && { printf \'%s\\n\' \'{}\'; exit 0; }',
    'TEXT="$(printf \'%s\' "$HOOK_INPUT" | node "$COMPACT" 2>/dev/null || true)"',
    'if [ -z "$TEXT" ]; then',
    '  printf \'%s\\n\' \'{}\'',
    '  exit 0',
    'fi',
    'printf \'%s\' "$TEXT" | node -e \'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{process.stdout.write(JSON.stringify({additional_context:d}))})\'',
    '',
  ].join('\n');
}

const HOOK_ADAPTATIONS = {};

function adaptHookForCursor(script, content) {
  const rules = HOOK_ADAPTATIONS[script] || [];
  let out = content;
  for (const pair of rules) {
    const anchor = pair[0];
    const replacement = pair[1];
    if (!out.includes(anchor)) {
      throw new Error('cursor hook adaptation anchor not found in canonical ' + script + ': ' + anchor);
    }
    if (out.indexOf(anchor) !== out.lastIndexOf(anchor)) {
      throw new Error('cursor hook adaptation anchor is not unique in canonical ' + script + ': ' + anchor);
    }
    out = out.replace(anchor, replacement);
  }
  if (rules.length) {
    const comment = '# cursor-edition: payload-adapted copy (Cursor hook field names) — generated by\n'
      + '# scripts/sync-cursor-edition.js from canonical hooks/' + script + '; do not hand-edit.\n';
    // Cursor execs these files. The kernel shebang must stay line 1; a
    // generated comment in front of `#!` makes the copy not a script.
    const shebang = out.match(/^(#![^\n]*\n)/);
    out = shebang ? shebang[1] + comment + out.slice(shebang[1].length) : comment + out;
  }
  return out;
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

function mappingRel(forge) {
  return treeLabel(forge) + '/hooks.json';
}

function expectedAgentFiles(forge) {
  return listCanonAgents();
}
function expectedCommandFiles(forge) {
  return listCanonCommands(forge).map(f => f.slice(0, -3));
}
function expectedHookFiles() {
  return HOOK_SCRIPTS.concat([COMPACT_WRAPPER]);
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

function retiredHookFiles(forge) {
  const dir = treePath(path.join(treeLabel(forge), 'hooks'));
  if (!fs.existsSync(dir)) return [];
  const expected = new Set(expectedHookFiles());
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => ['.sh', '.json'].includes(path.extname(n)) && !expected.has(n))
    .sort();
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
  for (const f of retiredHookFiles(forge)) {
    fs.rmSync(treePath(path.join(treeLabel(forge), 'hooks', f)), { force: true });
    console.log('pruned     ' + treeLabel(forge) + '/hooks/' + f + ' (retired artifact)');
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

function writeHooks(forge) {
  const outDir = treePath(path.join(treeLabel(forge), 'hooks'));
  ensureDir(outDir);
  let wrote = 0;
  for (const script of HOOK_SCRIPTS) {
    const dest = path.join(outDir, script);
    const content = adaptHookForCursor(script, fs.readFileSync(path.join(CANON_HOOKS_DIR, script), 'utf8'));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log((HOOK_ADAPTATIONS[script] ? 'adapted    ' : 'copied     ') + treeLabel(forge) + '/hooks/' + script);
      wrote++;
    }
  }
  const wrapperDest = path.join(outDir, COMPACT_WRAPPER);
  const wrapper = renderCompactWrapper(forge);
  if (!fs.existsSync(wrapperDest) || fs.readFileSync(wrapperDest, 'utf8') !== wrapper) {
    fs.writeFileSync(wrapperDest, wrapper);
    fs.chmodSync(wrapperDest, 0o755);
    console.log('generated  ' + treeLabel(forge) + '/hooks/' + COMPACT_WRAPPER);
    wrote++;
  }
  const json = renderCursorHooksJson();
  const jsonDest = treePath(mappingRel(forge));
  if (!fs.existsSync(jsonDest) || fs.readFileSync(jsonDest, 'utf8') !== json) {
    ensureDir(path.dirname(jsonDest));
    fs.writeFileSync(jsonDest, json);
    console.log('generated  ' + mappingRel(forge));
    wrote++;
  }
  return wrote;
}

function runWrite(forge) {
  forge = forgeLayout.assertForge(forge || DEFAULT_FORGE);
  const a = writeAgents(forge);
  const c = writeCommands(forge);
  const h = writeHooks(forge);
  const p = pruneTree(forge);
  const total = a + c + h + p;
  console.log('sync-cursor-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
    + (total === 0 ? ' — tree already in sync' : '') + ').');
}

function runRefreshPresent() {
  const refreshed = [];
  let changed = 0;
  for (const forge of forgeLayout.FORGES) {
    if (!fs.existsSync(treePath(treeLabel(forge)))) continue;
    changed += writeAgents(forge);
    changed += writeCommands(forge);
    changed += writeHooks(forge);
    changed += pruneTree(forge);
    refreshed.push(treeLabel(forge));
  }
  if (refreshed.length) {
    console.log('sync-cursor-edition: refreshed ' + refreshed.length + ' present tree(s): '
      + refreshed.join(', ') + '.');
  }
  if (changed > 0 && TREE_ROOT !== REPO) {
    console.error('sync-cursor-edition: NOTE — ' + changed
      + ' change(s) in a checkout that is not this one.');
    console.error('  ' + refreshed.join(', ') + ' under ' + TREE_ROOT);
    console.error('  now render THIS checkout\'s canonical sources (' + REPO
      + '), including anything uncommitted here.');
    console.error('  Verify from that root: node scripts/test-cursor-edition.js');
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
  for (const script of HOOK_SCRIPTS) {
    const rel = tree + '/hooks/' + script;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing hook script copy' });
      continue;
    }
    if (readTree(rel) !== adaptHookForCursor(script, read('hooks/' + script))) {
      mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
    }
  }
  {
    const rel = tree + '/hooks/' + COMPACT_WRAPPER;
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated compact wrapper' });
    } else if (readTree(rel) !== renderCompactWrapper(forge)) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  {
    const rel = mappingRel(forge);
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated hooks.json' });
    } else if (readTree(rel) !== renderCursorHooksJson()) {
      mismatches.push({ rel, reason: 'stale — regenerate' });
    }
  }
  for (const f of retiredAgentFiles(forge)) {
    mismatches.push({ rel: tree + '/agents/' + f, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  for (const f of retiredCommandFiles(forge)) {
    mismatches.push({ rel: tree + '/commands/' + f, reason: 'retired surface not in canonical — prune (--write removes it)' });
  }
  for (const f of retiredHookFiles(forge)) {
    mismatches.push({ rel: tree + '/hooks/' + f, reason: 'retired artifact no longer emitted — prune (--write removes it)' });
  }
  if (mismatches.length) {
    console.error('sync-cursor-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-cursor-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands(forge).length;
  console.log('sync-cursor-edition[' + forge + ']: ' + na + ' agent(s) + ' + nc + ' command(s) + '
    + expectedHookFiles().length + ' hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-cursor-edition.js (--write | --refresh-present | --check)'
    + ' [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .cursor/;\n'
    + '               gitlab/gitea write .cursor-<forge>/\n'
    + '  --write   regenerate the forge tree agents + commands + hooks from canonical\n'
    + '  --refresh-present  regenerate every forge tree that already exists; create none (ignores --forge)\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
    + '  --print-tree-root  print the directory the generated trees land in; write nothing\n'
    + '  --merge-hooks --dest=PATH [--global]  merge kaola entries into a live hooks.json\n'
    + '  --strip-hooks --dest=PATH             remove kaola entries from a live hooks.json\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const forge = forgeArg ? forgeArg.slice('--forge='.length) : DEFAULT_FORGE;
  try {
    forgeLayout.assertForge(forge);
  } catch (e) {
    console.error('sync-cursor-edition: ' + e.message);
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
      console.error('sync-cursor-edition: ' + arg + ' requires --dest=PATH');
      process.exitCode = 2;
      return;
    }
    const dest = destArg.slice('--dest='.length);
    try {
      if (arg === '--merge-hooks') mergeDestHooks(dest, { global: flags.includes('--global') });
      else stripDestHooks(dest);
    } catch (e) {
      console.error('sync-cursor-edition: ' + e.message);
      process.exitCode = 1;
    }
    return;
  }
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, CURSOR_KAOLA_SCRIPT, cursorKaolaScript,
  CURSOR_MODEL_DISPATCH_GUIDANCE,
  cursorCliMaterializationProse,
  renderCursorHooksJson, rewriteHooksJsonForGlobal, mergeDestHooks, stripDestHooks,
  renderCompactWrapper, COMPACT_WRAPPER, mappingRel,
  treeLabel, agentRel, commandRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForCursor, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, parseTools, isReadOnlyRole, yamlScalar,
  listCanonAgents, copyListCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
