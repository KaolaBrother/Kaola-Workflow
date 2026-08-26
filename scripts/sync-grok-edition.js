#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-grok-edition.js — generate the Grok CLI runtime edition from canonical.
//
// Grok CLI is a coding-agent RUNTIME (like Codex/opencode/Kimi), not a git forge,
// and it does NOT ride the install.sh --forge= machinery. It is delivered the
// Grok-native way: named agents under `.grok/agents/<role>.md` (spawn_subagent
// types), flat slash commands under `.grok/commands/<name>.md`, and
// `.grok/hooks/` (payload-adapted hooks + a generated hooks.json the
// installer copies into the Grok hooks dir). Deterministic, idempotent, and
// parity-checked by test-grok-edition.js.
//
// The session supplies the model, while each generated agent carries an effort
// derived from its canonical model class: sonnet/standard → medium,
// opus/reasoning → high, and fable/heavy → xhigh. The spawn tool accepts an optional `model` and no
// per-call effort; generated command surfaces omit the model override while
// generated agents retain `model: inherit` plus their role effort pin.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). github writes `.grok/`;
// a forge writes `.grok-<forge>/`. Command sources come from the routing-surface
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
  return '.grok' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

const MANAGED_ROLES = new Set(agentGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

// No runtime-neutral hook scripts are active in the Grok edition. The generator retains ownership
// of the hooks directory so --write can prune stale dispatch artifacts.
const HOOK_SCRIPTS = [];

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

// Grok's agent YAML parser is strict: an unquoted `description: … facts: use …` is
// silently dropped (measured: knowledge-lookup vanished from `grok inspect` until
// the description was JSON-quoted). Quote when the value would not be a plain YAML
// scalar.
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
  if (!MANAGED_ROLES.has(agentName)) throw new Error('sync-grok-edition: unknown role ' + agentName);
  return agentGen.renderRuntimeRole('grok', agentName).content;
}

const GROK_MODEL_DISPATCH_GUIDANCE =
  'Omit a per-call model override; sub-agents inherit the session model. '
  + 'Their effort follows the canonical role class: sonnet/standard roles use medium, '
  + 'opus/reasoning roles use high, and fable/heavy roles use xhigh.';

const GROK_MODEL_DISPATCH_BLOCK = [
  '## Model is inherited; effort follows the role',
  '',
  'A subagent inherits the session model, while its effort follows the canonical role class.',
  'Generated agents pin effort: medium for sonnet/standard roles, high for opus/reasoning',
  'roles, and xhigh for fable/heavy roles. Planner-class is the heavy roster. Omit `model` on',
  '`spawn_subagent`; choose the named role and its pinned effort.',
  '',
  'Dispatch a role with `spawn_subagent` using `subagent_type: "<role>"`.',
  '',
].join('\n');

const GROK_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _gh="${GROK_HOME:-$HOME/.grok}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_gh/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_gh/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

function grokKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return GROK_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

function rewriteClaudeScriptPaths(text, forge) {
  forge = forge || DEFAULT_FORGE;
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + grokKaolaScript(forge));
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
  text = text.replace(/^Agent\(\n(\s+subagent_type=)/gm, 'spawn_subagent(\n$1');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime grok');
  text = rewriteClaudeScriptPaths(text, forge);
  return text;
}

function renderCommand(canonContent, commandName, forge) {
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const lines = ['---'];
  lines.push('name: ' + commandName);
  lines.push('description: ' + yamlScalar(fm.description || ''));
  lines.push('---');
  lines.push('');
  lines.push(transformCommandBody(body, forge, commandRel(commandName, forge)).trim().replace(/\s+$/, ''));
  return lines.join('\n') + '\n';
}

function renderGrokHooksJson(forge) {
  const compactJs = forgeLayout.scriptName('kaola-workflow-compact-context.js', forge || DEFAULT_FORGE);
  // Grok expands ${VAR} in hook command fields and also loads project
  // `.grok/hooks/*.json`. A placeholder the installer forgot to substitute
  // would be executed literally, so the generated file uses the same expansion
  // Grok already understands.
  const home = '${GROK_HOME:-$HOME/.grok}';
  return JSON.stringify({
    hooks: {
      SessionStart: [{
        matcher: 'compact',
        hooks: [{
          type: 'command',
          command: 'node "' + home + '/kaola-workflow/scripts/' + compactJs + '"',
          timeout: 5,
        }],
        id: 'kaola-workflow:compact-context',
      }],
    },
  }, null, 2) + '\n';
}

const HOOK_ADAPTATIONS = {};

function adaptHookForGrok(script, content) {
  const rules = HOOK_ADAPTATIONS[script] || [];
  let out = content;
  for (const pair of rules) {
    const anchor = pair[0];
    const replacement = pair[1];
    if (!out.includes(anchor)) {
      throw new Error('grok hook adaptation anchor not found in canonical ' + script + ': ' + anchor);
    }
    if (out.indexOf(anchor) !== out.lastIndexOf(anchor)) {
      throw new Error('grok hook adaptation anchor is not unique in canonical ' + script + ': ' + anchor);
    }
    out = out.replace(anchor, replacement);
  }
  if (rules.length) {
    out = '# grok-edition: payload-adapted copy (Grok hook field names) — generated by\n'
      + '# scripts/sync-grok-edition.js from canonical hooks/' + script + '; do not hand-edit.\n'
      + out;
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

function expectedAgentFiles(forge) {
  return listCanonAgents();
}
function expectedCommandFiles(forge) {
  return listCanonCommands(forge).map(f => f.slice(0, -3));
}
function expectedHookFiles() {
  return HOOK_SCRIPTS.concat(['hooks.json']);
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
    const content = adaptHookForGrok(script, fs.readFileSync(path.join(CANON_HOOKS_DIR, script), 'utf8'));
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      fs.writeFileSync(dest, content);
      fs.chmodSync(dest, 0o755);
      console.log((HOOK_ADAPTATIONS[script] ? 'adapted    ' : 'copied     ') + treeLabel(forge) + '/hooks/' + script);
      wrote++;
    }
  }
  const json = renderGrokHooksJson(forge);
  const jsonDest = path.join(outDir, 'hooks.json');
  if (!fs.existsSync(jsonDest) || fs.readFileSync(jsonDest, 'utf8') !== json) {
    fs.writeFileSync(jsonDest, json);
    console.log('generated  ' + treeLabel(forge) + '/hooks/hooks.json');
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
  console.log('sync-grok-edition[' + forge + ']: write complete (' + total + ' file(s) updated'
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
    console.log('sync-grok-edition: refreshed ' + refreshed.length + ' present tree(s): '
      + refreshed.join(', ') + '.');
  }
  if (changed > 0 && TREE_ROOT !== REPO) {
    console.error('sync-grok-edition: NOTE — ' + changed
      + ' change(s) in a checkout that is not this one.');
    console.error('  ' + refreshed.join(', ') + ' under ' + TREE_ROOT);
    console.error('  now render THIS checkout\'s canonical sources (' + REPO
      + '), including anything uncommitted here.');
    console.error('  Verify from that root: node scripts/test-grok-edition.js');
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
    if (readTree(rel) !== adaptHookForGrok(script, read('hooks/' + script))) {
      mismatches.push({ rel, reason: 'drifted from canonical hooks/ (post-adaptation)' });
    }
  }
  {
    const rel = tree + '/hooks/hooks.json';
    if (!fs.existsSync(treePath(rel))) {
      mismatches.push({ rel, reason: 'missing generated hooks.json' });
    } else if (readTree(rel) !== renderGrokHooksJson(forge)) {
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
    console.error('sync-grok-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-grok-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
  const na = listCanonAgents().length;
  const nc = listCanonCommands(forge).length;
  console.log('sync-grok-edition[' + forge + ']: ' + na + ' agent(s) + ' + nc + ' command(s) + '
    + expectedHookFiles().length + ' hook file(s) in parity with canonical.');
}

function usage() {
  process.stdout.write(
    'usage: node scripts/sync-grok-edition.js (--write | --refresh-present | --check)'
    + ' [--forge=github|gitlab|gitea]\n'
    + '  --forge=<f>  which forge to render (default github). github writes .grok/;\n'
    + '               gitlab/gitea write .grok-<forge>/\n'
    + '  --write   regenerate the forge tree agents + commands + hooks from canonical\n'
    + '  --refresh-present  regenerate every forge tree that already exists; create none (ignores --forge)\n'
    + '  --check   assert the generated tree is in byte-parity with a fresh render\n'
    + '  --print-tree-root  print the directory the generated trees land in; write nothing\n'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const forge = forgeArg ? forgeArg.slice('--forge='.length) : DEFAULT_FORGE;
  try {
    forgeLayout.assertForge(forge);
  } catch (e) {
    console.error('sync-grok-edition: ' + e.message);
    process.exitCode = 2;
    return;
  }
  const arg = argv.filter(a => !a.startsWith('--forge='))[0];
  if (arg === '--write') return runWrite(forge);
  if (arg === '--refresh-present') return runRefreshPresent();
  if (arg === '--check') return runCheck(forge);
  if (arg === '--print-tree-root') { process.stdout.write(TREE_ROOT + '\n'); return; }
  usage();
}

if (require.main === module) main();

module.exports = {
  renderAgent, renderCommand, transformCommandBody,
  rewriteClaudeScriptPaths, GROK_KAOLA_SCRIPT, grokKaolaScript,
  GROK_MODEL_DISPATCH_GUIDANCE, GROK_MODEL_DISPATCH_BLOCK,
  renderGrokHooksJson, treeLabel, agentRel, commandRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForGrok, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, parseTools, yamlScalar,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
