#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// sync-hermes-edition.js — generate the Hermes Agent runtime edition from canonical.
//
// Hermes Agent (measured v0.22.5, 2026-10-28) is a coding-agent RUNTIME, not a
// forge. It is delivered the Hermes-native way: directory-form skills under
// `$HERMES_HOME/skills/<name>/SKILL.md` (frontmatter `name:` + `description:`),
// support scripts under `$HERMES_HOME/kaola-workflow/scripts`, and a managed
// machine-global contract region in `$HERMES_HOME/SOUL.md`.
//
// The repo-side `.kw-hermes*/` trees are KW build names, not native discovery
// claims. The name deliberately avoids `<root>/.hermes/skills`, which is a
// Hermes-native PROJECT skill root (#1124 P0 M3). It installs no prompt-lifecycle
// hooks, no Kaola role profiles, and no Hermes plugin (#1101, ADR 0029).
//
// Hermes keeps the common runtime dispatch contract INLINE in each rendered skill
// and replaces only the runtime-facts region (replaceRuntimeDelegationGuidance).
// It is NOT in RECOVERY_FULL_DISPATCH_RUNTIMES: P0 M5 measured that the invoked
// skill body is summarized away after compaction, so recovery is re-invoking the
// skill, not relying on an always-loaded dispatch carrier.
//
// FORGE AXIS (--forge=github|gitlab|gitea, default github). github writes
// `.kw-hermes/`; another forge writes `.kw-hermes-<forge>/`. Command sources come
// from the routing-surface registry via runtime-edition-forge.js, never a hand
// list. Deterministic, idempotent, parity-checked by test-hermes-edition.js.
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
  return '.kw-hermes' + forgeLayout.outSuffix(forge || DEFAULT_FORGE);
}

function skillRel(basename, forge) {
  return treeLabel(forge) + '/skills/' + basename + '/SKILL.md';
}

const { parseFrontmatter, yamlScalar } = forgeLayout;

// Hermes resolves global skills and the SOUL.md identity slot from HERMES_HOME
// (measured; see hermes_constants.py get_hermes_home). The default is ~/.hermes.
// The kaola_script() resolver probes the global support-script dir first and the
// self-dev repo dir second, mirroring the dsh/droid/devin/antigravity shape.
const HERMES_KAOLA_SCRIPT = `kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; _h="\${HERMES_HOME:-$HOME/.hermes}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_h/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\\n' "$_p"; return; }; done; else for _p in "$_h/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\\n' "$_p"; return; }; done; fi; return 1; }`;

function hermesKaolaScript(forge) {
  const selfDev = forgeLayout.selfDevScriptsDir(forge);
  return HERMES_KAOLA_SCRIPT.split('"./scripts/$_n"').join(`"${selfDev}/$_n"`);
}

function rewriteClaudeScriptPaths(text, forge) {
  return text.replace(/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm, (m, indent) => indent + hermesKaolaScript(forge));
}

// Hermes keeps the common dispatch contract INLINE: only the runtime-facts
// region is replaced with this adapter's facts. No Agent(...) cards remain in the
// canonical skeletons (#1101), and none may be introduced here.
function transformCommandBody(body, forge) {
  forge = forge || DEFAULT_FORGE;
  let text = body.split(/\r?\n/).join('\n');
  if (text.includes(adapterFacts.DELEGATION_GUIDANCE_START)) {
    text = adapterFacts.replaceRuntimeDelegationGuidance(text, 'hermes', forge);
  }
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/--runtime claude\b/g, '--runtime hermes');
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
      console.log('sync-hermes-edition: refreshed ' + refreshed.length + ' present tree(s): ' + refreshed.join(', ') + '.');
    }
    return;
  }
  const check = argv.includes('--check');
  if (!check && !argv.includes('--write')) throw new Error('use --write or --check');
  const bad = sync(root, forge, check);
  if (bad) {
    console.error('sync-hermes-edition: ' + bad + ' mismatch(es)');
    process.exit(1);
  }
  console.log('sync-hermes-edition[' + forge + ']: '
    + expected(forge).size + ' skill(s) in parity with canonical.');
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  renderSkill, transformCommandBody, expected, sync, treeLabel, skillRel,
  HERMES_KAOLA_SCRIPT, hermesKaolaScript, TREE_ROOT,
};
