#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-antigravity-edition.js — generate the Antigravity runtime edition from canonical.
//
// Antigravity (the `agy` CLI, measured 1.4.7) is a coding-agent RUNTIME, not a git
// forge. It is delivered the Antigravity-native way: directory-form skills under
// `.antigravity/skills/<name>/SKILL.md` (frontmatter `name:` + `description:`) and
// support scripts under `.gemini/config/kaola-workflow/scripts` at install time.
// The repo-side `.antigravity*/` trees are KW build names, not native discovery
// claims. It installs no prompt-lifecycle hooks and no Kaola role profiles (#1101).
//
// Unlike the always-loaded-carrier runtimes, Antigravity keeps the common runtime
// dispatch contract INLINE in each rendered skill and replaces only the
// runtime-facts region (replaceRuntimeDelegationGuidance) — it is NOT in
// RECOVERY_FULL_DISPATCH_RUNTIMES, so the full dispatch prose must travel with the
// skill body.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). github writes
// `.antigravity/`; a forge writes `.antigravity-<forge>/`. Command sources come
// from the routing-surface registry via runtime-edition-forge.js, never a hand
// list. Deterministic, idempotent, parity-checked by test-antigravity-edition.js.
//
//   --forge=<f>        github (default) | gitlab | gitea.
//   --write            regenerate the tree from canonical.
//   --check            assert the generated tree is in byte-parity with a fresh render.
//   --refresh-present  regenerate every forge tree that already exists; create none.
//   --tree-root DIR    write/check the tree under DIR instead of the resolved main root.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const adapterFacts = require('./runtime-adapter-facts.js');
const forgeLayout = require('./runtime-edition-forge.js');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FORGE = 'github';

// The tree lands beside the main checkout's canonical sources (see
// sync-opencode-edition.js TREE_ROOT for the full rationale); an explicit
// KAOLA_EDITION_TREE_ROOT bound to this checkout wins.
const TREE_ROOT = (() => {
  const override = forgeLayout.editionTreeRootOverride(REPO);
  if (override) return override;
  const schema = require('./kaola-workflow-adaptive-schema.js');
  const coord = schema.getCoordRoot(REPO);
  return path.basename(coord) === '.git' ? schema.mainRootFromCoord(coord) : REPO;
})();

function treeLabel(forge) {
  return '.antigravity' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

function skillRel(basename, forge) {
  return treeLabel(forge) + '/skills/' + basename + '/SKILL.md';
}

const { parseFrontmatter, yamlScalar } = forgeLayout;

// Antigravity resolves skills and the machine-global carrier from ~/.gemini/config
// (no root override is measured; do not invent one). The kaola_script() resolver
// probes the global support-script dir first and the self-dev repo dir second,
// mirroring the dsh/droid/devin resolver shape.
const AGY_KAOLA_SCRIPT =
  'kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+\'/package.json\').name||\'\')}catch(e){}" 2>/dev/null)"; _ag="$HOME/.gemini/config"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_ag/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; else for _p in "$_ag/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf \'%s\\n\' "$_p"; return; }; done; fi; return 1; }';

function agyKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return AGY_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

function rewriteClaudeScriptPaths(text, forge) {
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + agyKaolaScript(forge));
}

// Antigravity keeps the common dispatch contract INLINE: only the runtime-facts
// region is replaced with this adapter's facts. No Agent(...) cards remain in the
// canonical skeletons (#1101), and none may be introduced here.
function transformCommandBody(body, forge) {
  forge = forge || DEFAULT_FORGE;
  let text = body.split(/\r?\n/).join('\n');
  if (text.includes(adapterFacts.DELEGATION_GUIDANCE_START)) {
    text = adapterFacts.replaceRuntimeDelegationGuidance(text, 'antigravity', forge);
  }
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime antigravity');
  text = rewriteClaudeScriptPaths(text, forge);
  return text;
}

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
    '---',
    '',
    transformCommandBody(body, forge).trim(),
    '',
  ];
  return lines.join('\n') + '\n';
}

function expected(forge) {
  const files = new Map();
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
  const root = rootArg ? path.resolve(rootArg.slice(12)) : TREE_ROOT;
  if (argv.includes('--refresh-present')) {
    const refreshed = [];
    for (const candidate of forgeLayout.FORGES) {
      if (fs.existsSync(path.join(root, treeLabel(candidate)))) {
        sync(root, candidate, false);
        refreshed.push(treeLabel(candidate));
      }
    }
    if (refreshed.length) {
      console.log('sync-antigravity-edition: refreshed ' + refreshed.length + ' present tree(s): ' + refreshed.join(', ') + '.');
    }
    return;
  }
  const check = argv.includes('--check');
  if (!check && !argv.includes('--write')) throw new Error('use --write or --check');
  const bad = sync(root, forge, check);
  if (bad) {
    console.error('sync-antigravity-edition: ' + bad + ' mismatch(es)');
    process.exit(1);
  }
  console.log('sync-antigravity-edition[' + forge + ']: '
    + expected(forge).size + ' skill(s) in parity with canonical.');
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  renderSkill, transformCommandBody, expected, sync, treeLabel, skillRel,
  AGY_KAOLA_SCRIPT, agyKaolaScript, TREE_ROOT,
};
