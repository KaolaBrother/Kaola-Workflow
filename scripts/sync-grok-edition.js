#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-grok-edition.js — generate the Grok CLI runtime edition from canonical.
//
// Grok CLI is a coding-agent RUNTIME (like Codex/opencode/Kimi), not a git forge,
// and it does NOT ride the install.sh --forge= machinery. It is delivered the
// Grok-native way: named agents under `.grok/agents/<role>.md` (spawn_subagent
// types), flat slash commands under `.grok/commands/<name>.md`, and
// `.grok/hooks/` (payload-adapted dispatch-log + a generated hooks.json the
// installer copies into the Grok hooks dir). Deterministic, idempotent, and
// parity-checked by test-grok-edition.js.
//
// The session supplies the model, while each generated agent carries an effort
// derived from its canonical model class: sonnet/standard → medium and
// opus/reasoning → high. The spawn tool accepts an optional `model` and no
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
const reviewerGen = require('./generate-reviewer-profiles');
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

const REVIEWER_ROLES = new Set(reviewerGen.ROLES);
const ZERO_HASH = '0'.repeat(64);

const HOOK_SCRIPTS = [
  'kaola-workflow-subagent-dispatch-log.sh',
];

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
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
}

function listCanonCommands(forge) {
  return forgeLayout.commandSources(forge || DEFAULT_FORGE).map(s => s.basename).sort();
}

const GROK_MODEL_EFFORTS = Object.freeze({
  sonnet: 'medium',
  standard: 'medium',
  opus: 'high',
  reasoning: 'high',
});

function effortForModelToken(modelToken, agentName) {
  const token = String(modelToken == null ? '' : modelToken).trim();
  const effort = GROK_MODEL_EFFORTS[token.toLowerCase()];
  if (effort) return effort;
  const shown = token || '<absent>';
  throw new Error('sync-grok-edition: cannot derive Grok effort for role "'
    + agentName + '": unsupported canonical model token "' + shown
    + '" (expected sonnet, standard, opus, or reasoning)');
}

function canonCommandPath(basename, forge) {
  const src = forgeLayout.commandSources(forge || DEFAULT_FORGE).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge || DEFAULT_FORGE}`);
  return src.absPath;
}

function isReadOnlyRole(toolSet) {
  return !(toolSet.has('write') || toolSet.has('edit'));
}

function renderAgent(canonContent, agentName, forge) {
  forge = forge || DEFAULT_FORGE;
  const { fm, body } = parseFrontmatter(canonContent);
  const toolSet = lowerSet(parseTools(fm.tools));
  const isReviewer = REVIEWER_ROLES.has(agentName);
  const effort = effortForModelToken(fm.model, agentName);
  const lines = ['---'];
  lines.push('name: ' + agentName);
  lines.push('description: ' + yamlScalar(fm.description || ''));
  lines.push('prompt_mode: full');
  lines.push('model: inherit');
  lines.push('effort: ' + effort);
  lines.push('permission_mode: ' + (isReadOnlyRole(toolSet) ? 'plan' : 'default'));
  lines.push('agents_md: true');
  lines.push('---');
  lines.push('');
  if (isReviewer) {
    lines.push('<!-- grok-reviewer-identity:start -->');
    if (fm.behavior_contract_version) lines.push('behavior_contract_version: ' + fm.behavior_contract_version);
    if (fm.behavior_contract_hash) lines.push('behavior_contract_hash: ' + fm.behavior_contract_hash);
    lines.push('resolved_profile_hash: ' + ZERO_HASH);
    lines.push('<!-- grok-reviewer-identity:end -->');
    lines.push('');
  }
  const bodyText = rewriteClaudeScriptPaths(body, forge)
    .replace(/--runtime claude\b/g, '--runtime grok')
    .trim().replace(/\s+$/, '');
  lines.push(bodyText);
  let content = lines.join('\n') + '\n';
  if (isReviewer) {
    const normalized = reviewerGen.normalizeResolvedProfileHash(content);
    content = normalized.replace(ZERO_HASH, reviewerGen.sha256(normalized));
  }
  return content;
}

const GROK_MODEL_DISPATCH_GUIDANCE =
  'Omit a per-call model override; sub-agents inherit the session model. '
  + 'Their effort follows the canonical role class: sonnet/standard roles use medium, '
  + 'and opus/reasoning roles use high.';

const GROK_MODEL_DISPATCH_BLOCK = [
  '## Model is inherited; effort follows the role',
  '',
  'A subagent inherits the session model, while its effort follows the canonical role class.',
  'Generated agents pin effort: medium for sonnet/standard roles and high for opus/reasoning',
  'roles. Omit `model` on `spawn_subagent`; choose the named role and its pinned effort.',
  '',
  'Dispatch a role with `spawn_subagent` using `subagent_type: "<role>"`.',
  '',
].join('\n');

const MODEL_MENTION = /model=/;

function sentenceStart(text, at) {
  const re = /[.:]\s+(?=[A-Z`])/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null && m.index < at) start = m.index + m[0].length;
  return start;
}

function rewriteModelDispatchParagraph(para, guidance) {
  const at = para.search(MODEL_MENTION);
  if (at < 0) return para;
  return para.slice(0, sentenceStart(para, at)) + guidance;
}

function rewriteModelDispatchInstructions(text, guidance) {
  const out = [];
  let fenced = false;
  let para = [];
  function flushPara() {
    if (!para.length) return;
    out.push(rewriteModelDispatchParagraph(para.join('\n'), guidance));
    para = [];
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      flushPara();
      fenced = !fenced;
      out.push(line);
    } else if (fenced) {
      out.push(line);
    } else if (line.trim() === '') {
      flushPara();
      out.push(line);
    } else {
      para.push(line);
    }
  }
  flushPara();
  return out.join('\n');
}

function stripCardModelPlaceholders(text) {
  return text.replace(/^[ \t]*model="\{[^"\n]*\}",?[ \t]*\r?\n/gm, '');
}

function assertNoModelDispatchResidue(text, label) {
  const probe = text.split(GROK_MODEL_DISPATCH_GUIDANCE).join('');
  const problems = [];
  if (/(?<!`)``(?!`)/.test(probe)) problems.push('empty code span `` — a strip cut inside a code span');
  for (const line of probe.split(/\r?\n/)) {
    if (MODEL_MENTION.test(line)) problems.push('unrewritten model= instruction: ' + line.trim());
  }
  if (problems.length) {
    throw new Error('sync-grok-edition: a Claude-only `model=` instruction survived into '
      + (label || '(command)') + ' — this runtime inherits the session model and must not '
      + 'honour a per-dispatch override:\n  - ' + problems.join('\n  - '));
  }
}

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

const MODEL_DISPATCH_HEADING = /^##\s+Agent Model Dispatch\s*$/;
const MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/;

function assertModelDispatchAnchorMatched(canonBody, substituted, label) {
  if (substituted) return;
  const nearMiss = canonBody.split(/\r?\n/)
    .filter(l => MODEL_DISPATCH_HEADING_NEAR_MISS.test(l) && !MODEL_DISPATCH_HEADING.test(l))
    .map(l => l.trim());
  if (!nearMiss.length) return;
  throw new Error('sync-grok-edition: model-dispatch anchor missed in ' + (label || '(command)')
    + ' — canonical carries a section this transform did not substitute. Re-anchor '
    + 'MODEL_DISPATCH_HEADING to the heading canonical now uses:\n  - ' + nearMiss.join('\n  - '));
}

function transformCommandBody(body, forge, label) {
  forge = forge || DEFAULT_FORGE;
  const lines = rewriteModelDispatchInstructions(body, GROK_MODEL_DISPATCH_GUIDANCE).split(/\r?\n/);
  const out = [];
  let substitutedModelDispatch = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (MODEL_DISPATCH_HEADING.test(line)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      out.push(GROK_MODEL_DISPATCH_BLOCK.replace(/\s+$/, ''));
      out.push('');
      substitutedModelDispatch = true;
      i++;
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i++;
      continue;
    }
    out.push(line);
    i++;
  }
  assertModelDispatchAnchorMatched(body, substitutedModelDispatch, label);
  let text = out.join('\n');
  text = text.replace(/^Agent\(\n(\s+subagent_type=)/gm, 'spawn_subagent(\n$1');
  text = stripCardModelPlaceholders(text);
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime grok');
  text = rewriteClaudeScriptPaths(text, forge);
  assertNoModelDispatchResidue(text, label);
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
      SubagentStart: [{
        matcher: '*',
        hooks: [{
          type: 'command',
          command: 'bash "' + home + '/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh"',
          timeout: 5,
        }],
        id: 'kaola-workflow:subagent-dispatch-log',
      }],
    },
  }, null, 2) + '\n';
}

const HOOK_ADAPTATIONS = {
  'kaola-workflow-subagent-dispatch-log.sh': [
    ["p.agent_type||''", "(p.agent_type||p.agentType||p.subagentType||'')"],
    ["p.agent_id||''", "(p.agent_id||p.agentId||'')"],
  ],
};

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
  rewriteModelDispatchInstructions, rewriteModelDispatchParagraph, sentenceStart,
  stripCardModelPlaceholders, assertNoModelDispatchResidue, assertModelDispatchAnchorMatched,
  GROK_MODEL_DISPATCH_GUIDANCE, GROK_MODEL_DISPATCH_BLOCK, MODEL_DISPATCH_HEADING,
  renderGrokHooksJson, treeLabel, agentRel, commandRel, canonCommandPath, runCheck, runWrite,
  FORGES: forgeLayout.FORGES, DEFAULT_FORGE,
  adaptHookForGrok, HOOK_ADAPTATIONS,
  expectedHookFiles, retiredHookFiles, retiredAgentFiles, retiredCommandFiles,
  parseFrontmatter, parseTools, isReadOnlyRole, yamlScalar,
  listCanonAgents, listCanonCommands,
  CANON_AGENTS_DIR, CANON_HOOKS_DIR,
  REPO,
  HOOK_SCRIPTS,
};
