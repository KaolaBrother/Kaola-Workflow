#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const agentGen = require('./generate-agent-profiles.js');
const forgeLayout = require('./runtime-edition-forge.js');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FORGE = 'github';

function treeLabel(forge) {
  return '.devin' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

function skillRel(basename, forge) {
  return treeLabel(forge) + '/skills/' + basename + '/SKILL.md';
}

const { parseFrontmatter, yamlScalar } = forgeLayout;

const DEVIN_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _dh="${DEVIN_CONFIG_DIR:-$HOME/.config/devin}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_dh/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_dh/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

function devinKaolaScript() { return DEVIN_KAOLA_SCRIPT; }

function rewriteClaudeScriptPaths(text) {
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + devinKaolaScript());
}

// Devin installs no Kaola role profiles by design (#1062): a canonical dispatch card becomes a
// native-route instruction, naming no Kaola role as dispatchable.
function devinNativeDispatchProse(card) {
  if (card.includes('doc-updater')) {
    return 'Use a native route or work inline for documentation work — `run_subagent` with the '
      + 'built-in `subagent_general` or a user-owned profile from the session-start catalog. Put '
      + 'the changed files, checklist, working directory, and custody boundary in the brief.\n';
  }
  return 'Use a native route or work inline for this routed fix — `run_subagent` with the built-in '
    + '`subagent_general` or a user-owned profile from the session-start catalog. Put the failure '
    + 'command, evidence path, working directory, and custody boundary in the brief.\n';
}

function transformCommandBody(body, forge) {
  forge = forge || DEFAULT_FORGE;
  let text = body.split(/\r?\n/).join('\n');
  if (text.includes(agentGen.DELEGATION_GUIDANCE_START)) {
    text = agentGen.replaceRuntimeDelegationGuidance(text, 'devin', forge);
  }
  text = text.replace(/^Agent\(\n[\s\S]*?^\)\n?/gm, devinNativeDispatchProse);
  text = rewriteClaudeScriptPaths(text);
  text = text.replace(/--runtime claude\b/g, '--runtime devin');
  text = text.replace(/[ \t]+\n/g, '\n');
  return text;
}

// Devin keeps skill descriptions in context across compaction (#1058 F11), so the description
// carries the command's own sentence verbatim plus when to invoke it.
function skillDescription(baseDescription, name) {
  const base = String(baseDescription || '').trim().replace(/\.$/, '');
  const lead = base || `Kaola "/${name}" workflow command`;
  return `${lead}. Invoke when the user asks for /${name} or when continuing a Kaola workflow mission.`;
}

function renderSkill(canon, name, forge = DEFAULT_FORGE) {
  const { fm, body } = parseFrontmatter(canon);
  const lines = [
    '---',
    'name: ' + name,
    'description: ' + yamlScalar(skillDescription(fm.description, name)),
    'triggers:',
    '  - user',
    '  - model',
    '---',
    '',
    transformCommandBody(body, forge).trim(),
    '',
  ];
  return lines.join('\n') + '\n';
}

function expected(forge) {
  const files = new Map();
  const label = treeLabel(forge);
  for (const source of forgeLayout.commandSources(forge)) {
    const name = source.basename.replace(/\.md$/, '');
    files.set(skillRel(name, forge), renderSkill(fs.readFileSync(source.absPath, 'utf8'), name, forge));
  }
  return files;
}

function sync(root, forge, check) {
  let bad = 0;
  for (const [rel, bytes] of expected(forge)) {
    const abs = path.join(root, rel);
    if (check) {
      if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8') !== bytes) bad++;
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    }
  }
  return bad;
}

function main(argv) {
  const forgeArg = argv.find(a => a.startsWith('--forge='));
  const rootArg = argv.find(a => a.startsWith('--tree-root='));
  const forge = forgeArg ? forgeArg.slice(8) : DEFAULT_FORGE;
  forgeLayout.assertForge(forge);
  const root = rootArg ? path.resolve(rootArg.slice(12)) : REPO;
  if (argv.includes('--refresh-present')) {
    for (const candidate of forgeLayout.FORGES) {
      if (fs.existsSync(path.join(root, treeLabel(candidate)))) sync(root, candidate, false);
    }
    return;
  }
  const check = argv.includes('--check');
  if (!check && !argv.includes('--write')) throw new Error('use --write or --check');
  const bad = sync(root, forge, check);
  if (bad) {
    console.error('sync-devin-edition: ' + bad + ' mismatch(es)');
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { renderSkill, transformCommandBody, expected, sync, treeLabel, skillRel };
