#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const pluginRoot = 'plugins/kaola-workflow-gitea';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function listFiles(relativeDir, predicate) {
  const full = path.join(root, relativeDir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(relativeDir, entry.name))
    .filter(file => !predicate || predicate(file));
}

function listSkillFiles() {
  const dir = path.join(root, pluginRoot, 'skills');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(pluginRoot, 'skills', entry.name, 'SKILL.md'))
    .filter(file => exists(file));
}

function assertNoForbidden(file) {
  const text = read(file);
  const forbidden = [
    /\$HOME\/\.claude\/kaola-workflow\/scripts/,
    /(^|[^A-Za-z0-9_-])\.\/scripts([^A-Za-z0-9_-]|$)/,
    /plugins\/kaola-workflow\/scripts/,
    /\bglab\b/,
    /gitlab\.com/i,
    /api\.gitlab\.com/i,
    /GitLab/,
    /MR URL/,
    /MR number/,
    /merge request/i
  ];
  for (const re of forbidden) assert(!re.test(text), file + ' contains forbidden reference: ' + re);
}

// issue #276: whitespace-normalize multi-word needles for reflow tolerance
function norm(s) { return String(s).replace(/\s+/g, ' '); }

function assertIncludes(file, needle) {
  assert(norm(read(file)).includes(norm(needle)), file + ' must include: ' + needle);
}

function assertNotIncludes(file, needle) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}

function assertConcept(file, concept, terms) {
  const content = norm(read(file).toLowerCase());
  const missing = terms.filter(term => !content.includes(norm(term.toLowerCase())));
  assert(missing.length === 0,
    file + ' must document ' + concept + '; missing: ' + missing.join(', '));
}

function assertEveryDispatchHasModel(file) {
  const lines = read(file).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^Agent\(\s*$/.test(lines[i])) continue;
    let hasSubagent = false, hasModel = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\)\s*$/.test(lines[j])) break;
      if (/subagent_type="[^"]+"/.test(lines[j])) hasSubagent = true;
      if (/model="\{[A-Z_]+_MODEL\}"/.test(lines[j])) hasModel = true;
    }
    assert(!hasSubagent || hasModel,
      file + ' has an Agent( dispatch block at line ' + (i+1) + ' missing a model="{..._MODEL}" line');
  }
}

function extractClaudeTemplate(file) {
  const text = read(file);
  const START = '<!-- KW-CLAUDE-TEMPLATE-START -->';
  const END = '<!-- KW-CLAUDE-TEMPLATE-END -->';
  const startIdx = text.indexOf(START);
  const endIdx = text.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(file + ': missing KW-CLAUDE-TEMPLATE-START/END markers');
  }
  return text.slice(startIdx + START.length, endIdx).trim();
}

// issue #341: standalone, count-independent forbidden-token check. A forge-touching
// node runs this on just its changed files so a forge-CLI leak is caught at the node
// that wrote it, without the full contract chain (whose agent/command counts may be
// transiently stale mid-run). Accepts repo-root-relative or absolute paths. Unknown
// flags fail closed (exit 2) so a typo can never silently run the full chain instead.
const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  if (cliArgs[0] !== '--forbidden-only') {
    console.error('unknown argument: ' + cliArgs[0]);
    console.error('usage: node validate-kaola-workflow-gitea-contracts.js [--forbidden-only <file> ...]');
    process.exit(2);
  }
  const forbiddenOnlyFiles = cliArgs.slice(1);
  if (forbiddenOnlyFiles.length === 0) {
    console.error('usage: node validate-kaola-workflow-gitea-contracts.js --forbidden-only <file> [<file> ...]');
    process.exit(2);
  }
  for (const file of forbiddenOnlyFiles) {
    const rel = path.isAbsolute(file) ? path.relative(root, file) : file;
    assert(exists(rel), '--forbidden-only: file not found: ' + file);
    assertNoForbidden(rel);
  }
  console.log('Kaola-Workflow Gitea forbidden-only check passed (' + forbiddenOnlyFiles.length + ' file(s))');
  process.exit(0);
}

const pluginJson = parseJson(pluginRoot + '/.codex-plugin/plugin.json');
assert(pluginJson.name === 'kaola-workflow-gitea', 'Gitea Codex plugin name mismatch');
assert(pluginJson.skills === './skills/', 'Gitea Codex plugin must expose ./skills/');

const claudePluginJson = parseJson(pluginRoot + '/.claude-plugin/plugin.json');
assert(String(claudePluginJson.name || '').includes('gitea'), 'Gitea Claude plugin name must identify Gitea');
assert(claudePluginJson.version === require(path.join(root, 'package.json')).version,
  'Gitea Claude plugin version must match package.json');

const marketplace = parseJson('.agents/plugins/marketplace.json');
assert(marketplace.plugins.some(plugin =>
  plugin.name === 'kaola-workflow-gitea' &&
  plugin.source &&
  plugin.source.path === './plugins/kaola-workflow-gitea'
), 'marketplace must include kaola-workflow-gitea');

const commandFiles = listFiles(pluginRoot + '/commands', file => file.endsWith('.md'));
const skillFiles = listSkillFiles();
const hookFiles = listFiles(pluginRoot + '/hooks');
const agentFiles = listFiles(pluginRoot + '/agents', file => file.endsWith('.toml'));

// issue #341: the forbidden-token scan runs BEFORE any count assertion, so a forge
// leak is never hidden behind a stale agent/command/skill count (the #328 latent
// defect: a `gh` leak in issue-scout.toml was masked by `agentFiles.length === 13`
// short-circuiting the chain until an unrelated count bump exposed it).
for (const file of [
  ...commandFiles, ...skillFiles, ...hookFiles, ...agentFiles,
  ...(exists(pluginRoot + '/config/agents.toml') ? [pluginRoot + '/config/agents.toml'] : [])
]) {
  assertNoForbidden(file);
}

// #725: fast/full retired — the 6 fast/phase command+skill surfaces are deleted. Surviving surfaces
// are workflow-init + workflow-next + kaola-workflow-{finalize,adapt,plan-run} = 5.
assert(commandFiles.length === 3, 'expected 3 Gitea command files, got ' + commandFiles.length);
assert(skillFiles.length === 3, 'expected 3 Gitea skill files, got ' + skillFiles.length);
assert(exists(pluginRoot + '/hooks/hooks.json'), 'Gitea hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(!hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'Gitea phantom-advisor hook must be removed (#372)');
assert(exists(pluginRoot + '/config/agents.toml'), 'Gitea agents config missing');

// #340 derived parity guard (enumeration-free): the dispatch config/agents.toml must register
// exactly the agent profiles present in agents/ — both directions. A profile copied without its
// [agents.<name>] table is undispatchable (the #328 issue-scout miss); a table without its profile
// dangles. Derives both sides (no hardcoded names/counts), so a future agent addition never edits it.
{
  const configNames = new Set();
  const reCfg = /^\[agents\.([a-z0-9-]+)\]/gm;
  let cm;
  while ((cm = reCfg.exec(read(pluginRoot + '/config/agents.toml'))) !== null) configNames.add(cm[1]);
  const dirNames = new Set(agentFiles.map(f => path.basename(f, '.toml')));
  const missingTables = [...dirNames].filter(n => !configNames.has(n)).sort();
  const danglingTables = [...configNames].filter(n => !dirNames.has(n)).sort();
  assert(missingTables.length === 0 && danglingTables.length === 0,
    'config/agents.toml must register exactly the agent profiles in agents/ (#340)' +
    (missingTables.length ? ' — profiles missing a [agents.*] table: ' + missingTables.join(', ') : '') +
    (danglingTables.length ? ' — [agents.*] tables with no profile: ' + danglingTables.join(', ') : ''));
}

// #451 (supersedes #405): the <role>-max xhigh effort-variant matrix is RETIRED (gitea port). No
// generated -max profile files and no [agents.<role>-max] tables may survive — the per-node tier
// drives a session reasoning-effort signal instead. Forbid both.
{
  const configText = read(pluginRoot + '/config/agents.toml');
  const strayMaxFiles = agentFiles.map(f => path.basename(f)).filter(n => n.endsWith('-max.toml')).sort();
  assert(strayMaxFiles.length === 0, '#451 gt: retired -max profile file(s) must be removed: ' + strayMaxFiles.join(', '));
  const maxTables = (configText.match(/^\[agents\.[a-z0-9-]+-max\]/gm) || []);
  assert(maxTables.length === 0, '#451 gt: config/agents.toml must not register [agents.<role>-max] tables: ' + maxTables.join(', '));
}

for (const file of commandFiles.filter(file => path.basename(file).startsWith('kaola-workflow-'))) {
  assertIncludes(file, '## Agent Model Dispatch');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  // The retired heading, in the SHORT form that subsumes the longer "… Contract" wording this
  // used to pin. "Badge" named a cosmetic effect, not the mechanism; the pin follows the
  // vocabulary it forbids, so a half-applied revert of the rename cannot ship one heading here
  // and the other in the skeleton.
  assertNotIncludes(file, 'Agent Model Badge');
  assertNotIncludes(file, 'kaola_agent_model');
}

// #372: the advisor-gate vocabulary is retired — ban it across command + skill files so the
// removed mandates cannot silently return (concat-built; no literal in this source).
const advisorGateTokens372 = [
  ['Advisor', 'Gate'].join(' '),
  ['advisor', 'ideation', 'gate'].join(' '),
  ['advisor', 'plan', 'gate'].join(' '),
  ['advisor', 'critical', 'gate'].join(' '),
  ['closure', 'advisor', 'gate'].join(' '),
];
for (const file of [...commandFiles, ...skillFiles]) {
  for (const token of advisorGateTokens372) assertNotIncludes(file, token);
}

const scriptFiles = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitea-workflow-walkthrough.js',
  'simulate-gitea-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-codex-compact-resume.js',
  'kaola-gitea-workflow-run-chains.js',
  'kaola-gitea-workflow-gap-sweep.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

// #407: install.sh's per-forge SUPPORT_SCRIPT_NAMES is single-sourced from the install manifest
// (no literal arrays remain in install.sh). Assert the manifest emits each required Gitea support
// script for the gitea forge — same intent (this script ships in a manual install), correct source.
const giteaInstallManifest = require(path.join(root, 'scripts', 'kaola-workflow-install-manifest.js'));
const giteaManifestScripts = giteaInstallManifest.supportScripts('gitea');
const installSupportScripts = [
  'kaola-gitea-forge.js',
  'kaola-gitea-workflow-active-folders.js',
  'kaola-gitea-workflow-claim.js',
  'kaola-gitea-workflow-classifier.js',
  'kaola-gitea-workflow-closure-audit.js',
  'kaola-gitea-workflow-compact-context.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-codex-compact-resume.js',
  'kaola-gitea-workflow-run-chains.js',
  'kaola-gitea-workflow-gap-sweep.js'
];
for (const script of installSupportScripts) {
  assert(giteaManifestScripts.includes(script), 'install manifest must emit Gitea support script: ' + script);
}

const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');

// issue #283: kaola-workflow-phase6.md was removed; kaola-workflow-finalize.md is the terminal routine.
assert(!exists(pluginRoot + '/commands/kaola-workflow-phase6.md'),
  'Gitea legacy kaola-workflow-phase6.md must be absent (hard-removed by #283)');
assert(exists(pluginRoot + '/commands/kaola-workflow-finalize.md'),
  'Gitea kaola-workflow-finalize.md must be present');
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('mr|pr)'),
  'Gitea Finalization command must dispatch canonical pr sink (mr|pr) case)'
);
// #816: ownership-inversion lock — the finalize seam is orchestrator-owned and its mechanical
// residue is ONE script transaction, so no finalize surface may dispatch a bookkeeping role and
// every one MUST carry the transaction call. Pinned in BOTH directions.
assert(
  !read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('contractor') &&
  !read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('contractor'),
  'Gitea Finalization surfaces must carry NO dispatchable bookkeeping role'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('mr|pr)'),
  'Gitea finalize skill must dispatch canonical pr sink (mr|pr) case)'
);
assert(
  read(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js').includes('selection_record_note') &&
  read(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js').includes('selection_record_digest'),
  'Gitea claim port must report the selection record and stamp its digest'
);
// #336: keep-open partial-close sink lane — command + skill must carry the durable field, the
// sink-merge flag, and the merge-sink-only refusal prose (the exit-3 in-arm BLOCKED guard's only
// mechanical enforcement).
for (const f of ['/commands/kaola-workflow-finalize.md', '/skills/kaola-workflow-finalize/SKILL.md']) {
  assert(
    read(pluginRoot + f).includes('issue_action') &&
    read(pluginRoot + f).includes('--keep-issue-open') &&
    read(pluginRoot + f).includes('merge-sink-only'),
    'Gitea ' + f + ' must document the keep-open partial-close lane (issue_action, --keep-issue-open, merge-sink-only)'
  );
}
for (const skill of listFiles(pluginRoot + '/skills', file => file.endsWith('SKILL.md'))) {
  assert(!read(skill).includes('*/kaola-workflow/*/scripts/kaola-gitea'), skill + ' must use the Gitea Codex plugin cache path');
}


const giteaSkillsBase = `${pluginRoot}/skills`;
const giteaInitSkill = `${giteaSkillsBase}/kaola-workflow-init/SKILL.md`;
assertNotIncludes(giteaInitSkill, 'Do not create or edit CLAUDE.md');
assertIncludes(giteaInitSkill, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes(giteaInitSkill, 'plugin_root="plugins/kaola-workflow-gitea"');
assert(
  !/plugin_root="plugins\/kaola-workflow"(?!-)/.test(read(giteaInitSkill)),
  giteaInitSkill + ' must not contain bare plugin_root="plugins/kaola-workflow" (without -gitea suffix)'
);
assertIncludes(giteaInitSkill, "*/kaola-workflow-gitea/*/scripts/install-codex-agent-profiles.js");
assert(
  !/\*\/kaola-workflow\/\*\/scripts\/install-codex-agent-profiles\.js/.test(read(giteaInitSkill)),
  giteaInitSkill + ' must not contain bare */kaola-workflow/* find path (without -gitea suffix)'
);
// #571: global-default regression locks — pin primary install is --global; forbid retired per-repo mandate.
assertIncludes(giteaInitSkill, 'install-codex-agent-profiles.js" --global');
assert(
  !/install-codex-agent-profiles\.js"?\s+"\$PWD"/.test(read(giteaInitSkill)),
  giteaInitSkill + ' must not mandate a per-repo "$PWD" agent install (#571)'
);
// #401 Part 1: the forge plan-validator refusal-matrix anchor must remain wired into the suite.

// Gitea forge pair CLAUDE.md template must be byte-identical
const giteaCmdTemplate = extractClaudeTemplate(`${pluginRoot}/commands/workflow-init.md`);
const giteaSkillTemplate = extractClaudeTemplate(giteaInitSkill);
assert(giteaCmdTemplate === giteaSkillTemplate,
  'CLAUDE.md template must be byte-identical within Gitea forge pair');

// #606: the Claude dispatch-posture config-audit line must be present in the Gitea workflow-init
// command, outside the KW-CLAUDE-TEMPLATE region.
assertIncludes(`${pluginRoot}/commands/workflow-init.md`, 'claude_dispatch_posture: teams | classic');

for (const file of listFiles(pluginRoot + '/scripts', file =>
  file.endsWith('.js') && !file.endsWith('validate-kaola-workflow-gitea-contracts.js')
)) {
  const text = read(file);
  const nonCommentText = text.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
  assert(!/\bglab\b/.test(nonCommentText), file + ' must not execute or mention glab');
  assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
}

assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'bootstrap');

assertConcept(pluginRoot + '/scripts/test-gitea-workflow-scripts.js', 'Gitea stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);

// #203: Select Project active-folder definition still lists fast-summary.md (the classifier's
// tolerant read survives retirement, so the router recognizes a legacy fast-summary.md marker).
const giteaNextCmd203 = pluginRoot + '/commands/workflow-next.md';

assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'path_not_installed');
// The path SELECTOR (KAOLA_PATH / --workflow-path / path_not_installed) is retired; there is
// nothing left to select, so its vocabulary is pinned ABSENT from the router surface too.
assertNotIncludes(pluginRoot + '/commands/workflow-next.md', 'KAOLA_PATH');
assertNotIncludes(pluginRoot + '/commands/workflow-next.md', 'path_not_installed');
// #816: the finalize seam records no attestation — pinned as an ABSENCE so a revival reds the chain.
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'finalize_contractor_attested');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'attestContractorSpawn');
// #816: the folded transaction + the two typed guardrails that carry over.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', "reason: 'implementation_commit_missing',");
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'staging_guard_foreign_archive');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'staging_guard_multi_project');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', "reason: 'finalize_mirror_refused',");
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'if (!verdict.safe) {');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'finalize_transaction');
// Dispatch-log attestation is retired on the claim/author seam too. It asked whether a
// `workflow-planner` subagent had been spawned before the plan was frozen; there is no planner
// agent and no plan to freeze, and inline authoring is the design rather than the bypass the
// detector watched for. The gitea claim port drops the whole producer chain with its canonical
// original — pinned as an ABSENCE so a revival reds the chain. (The finalize-seam twin is swept
// above; its retained --attest-contractor-spawn warn-and-ignore note keeps that flag LITERAL
// legal, which is why that sweep pins identifiers only. The planner flag left no such note, so
// its literal is swept here outright.)
for (const gone of ['checkDispatchAttestations', 'persistAttestationToSummary',
  'claim_planner_attested', 'attestPlannerSpawn', 'attest-planner-spawn', '## Attestation']) {
  assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', gone);
}


// test-gitea-workflow-scripts.js must exercise operator_hint + route-findings + --summary.


// The one-request teammate rule on this edition's plan-run COMMAND, and the fork_turns
// unconditional mandate plus its two retired-qualifier bans on this edition's plan-run SKILL, are
// asserted on THESE SAME EDITION PATHS by the root validator's three-command and three-SKILL
// plan-run loops, in the always-selected claude chain.

// #775: v2-task-name is the only dispatch mode — the preflight-doctor detection step and the
// --codex-dispatch-mode flag it used to thread into the claim are retired (warn-and-ignore shim
// only; see kaola-workflow-claim.js).
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'Codex Dispatch Mode Detection');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', '--codex-dispatch-mode');



// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (Gitea edition — .toml bodies). Removing the emission section from
// any of these files must fail npm test so a re-vendor or refactor cannot silently drop it.
for (const reviewerBody of [
  pluginRoot + '/agents/code-reviewer.toml',
  pluginRoot + '/agents/security-reviewer.toml',
  pluginRoot + '/agents/adversarial-verifier.toml'
]) {
  assertIncludes(reviewerBody, 'finding: id=');
  // #285: pin the machine-readable verdict-block emission contract (the column-0 block
  // that --verdict-check reads at Finalization) so a gate node always emits it.
  assertIncludes(reviewerBody, 'verdict: pass');
}


// issue #332: source agent-profile schema wall (AC2). require() THIS tree's own
// installer copy (require.main guard means require() never runs main()) and assert its
// source-tree validator passes for the Gitea plugin tree — every agents/*.toml has a
// matching non-empty top-level `name`, a description, valid nickname_candidates, inherited
// runtime-key omission, declarative tier metadata, non-blank developer_instructions, every config_file resolves, and every toml is referenced by
// exactly one [agents.*] entry (catches the issue-scout class of omission forever).
const giteaInstaller = require('./install-codex-agent-profiles.js');
const giteaProfiles = giteaInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(giteaProfiles.ok,
  'Gitea source agent profiles fail schema validation:\n  - ' + giteaProfiles.errors.join('\n  - '));
const giteaSchema = require('./kaola-workflow-adaptive-schema.js');
const giteaPreflight = require('./kaola-workflow-codex-preflight.js');
const sortGiteaPolicy = values => [...values].sort();
assert(JSON.stringify(sortGiteaPolicy(giteaInstaller.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sortGiteaPolicy(giteaSchema.CODEX_PINNED_STANDARD_ROLES)),
  'Gitea installer role-metadata policy must match adaptive schema');
assert(JSON.stringify(sortGiteaPolicy(giteaInstaller.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sortGiteaPolicy(giteaSchema.CODEX_PINNED_REASONING_ROLES)),
  'Gitea installer reasoning-role policy must match adaptive schema');
assert(JSON.stringify(sortGiteaPolicy(giteaPreflight.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sortGiteaPolicy(giteaSchema.CODEX_PINNED_STANDARD_ROLES)),
  'Gitea preflight role-metadata policy must match adaptive schema');
assert(JSON.stringify(sortGiteaPolicy(giteaPreflight.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sortGiteaPolicy(giteaSchema.CODEX_PINNED_REASONING_ROLES)),
  'Gitea preflight reasoning-role policy must match adaptive schema');
assert(giteaInstaller.CODEX_STANDARD_MODEL === 'gpt-5.6-sol'
    && giteaInstaller.CODEX_STANDARD_EFFORT === 'medium'
    && giteaPreflight.CODEX_STANDARD_MODEL === giteaInstaller.CODEX_STANDARD_MODEL
    && giteaPreflight.CODEX_STANDARD_EFFORT === giteaInstaller.CODEX_STANDARD_EFFORT,
  'Gitea installer/preflight historical standard migration pair must be gpt-5.6-sol/medium');
assert(giteaInstaller.CODEX_REASONING_MODEL === 'gpt-5.6-sol'
    && giteaInstaller.CODEX_REASONING_EFFORT === 'xhigh'
    && giteaPreflight.CODEX_REASONING_MODEL === giteaInstaller.CODEX_REASONING_MODEL
    && giteaPreflight.CODEX_REASONING_EFFORT === giteaInstaller.CODEX_REASONING_EFFORT,
  'Gitea installer/preflight historical reasoning migration pair must be gpt-5.6-sol/xhigh');
assertIncludes(pluginRoot + '/scripts/kaola-workflow-resolve-agent-model.js', '.codex-plugin');
assertIncludes(pluginRoot + '/scripts/kaola-workflow-resolve-agent-model.js', 'isCodexPluginScriptDir');

// issue #332: edition byte-parity guard (the #291/#254 "edition port missed" class).
// The agent role profiles + config/agents.toml are forge-neutral and MUST stay
// byte-identical to the codex (plugins/kaola-workflow/) tree — a per-edition divergence
// (e.g. the historical workflow-planner.toml #272 drift) is illegal. Reference = codex.
function assertByteParity(relPath) {
  const ours = fs.readFileSync(path.join(root, pluginRoot, relPath));
  const ref = fs.readFileSync(path.join(root, 'plugins/kaola-workflow', relPath));
  assert(ours.equals(ref),
    'Gitea ' + relPath + ' must be byte-identical to the codex (plugins/kaola-workflow/) copy');
}
assertByteParity('config/agents.toml');
for (const tomlFile of fs.readdirSync(path.join(root, pluginRoot, 'agents')).filter(f => f.endsWith('.toml')).sort()) {
  assertByteParity(path.join('agents', tomlFile));
}

// #400: registry-driven route-reachability contract (the forge-codex dead zone). The schema emits
// kaola-workflow-plan-run / kaola-workflow-adapt as resume/route targets and the forge claim.js
// routes adaptive unconditionally — but the forge skills/ tree shipped neither SKILL, so the route
// resolved to nothing. require() the schema route constants (no hand-listed drift) + the static
// next_skill fallbacks gitea claim.js prints, and assert each resolves to an installed
// skills/<name>/SKILL.md. listSkillFiles() only enumerates what EXISTS (a blind spot for an absent
// REQUIRED skill); this is the required-target registry that closes it.
{
  const schema = require('./kaola-workflow-adaptive-schema.js');
  // #883: the retired plan-run / adapt / fast / research targets left this list EMPTY, so the loop
  // below had nothing to iterate and the assertion could not run. The route survived the retirement:
  // gitea claim.js still builds `next_skill` from the schema constant, so that target is what the
  // contract is derived from, and the list is fenced against going empty again.
  const emittedSkillTargets = [schema.NEXT_SKILL];
  // Vacuity fence — the failure this check actually suffered. An empty list, or an entry that is not
  // a usable skill name (a deleted schema constant reads as `undefined`), makes the loop below assert
  // nothing at all; that must red here rather than pass silently.
  assert(emittedSkillTargets.length > 0 &&
    emittedSkillTargets.every(t => typeof t === 'string' && t.length > 0),
    '#883: the receipt-emitted skill target list must be non-empty and name only resolvable skills — ' +
    'the route-reachability loop asserts nothing otherwise; got ' + JSON.stringify(emittedSkillTargets));
  // The derivation above is only sound while claim.js emits next_skill FROM the schema constant; if
  // it ever inlines a literal, this list becomes a parallel hand-kept one and stops tracking the route.
  assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'adaptiveSchema.NEXT_SKILL');
  assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js',
    "'next_skill: ' + (data.next_skill || adaptiveSkill)");
  const installedSkills = new Set(
    fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => exists(pluginRoot + '/skills/' + name + '/SKILL.md'))
  );
  for (const target of emittedSkillTargets) {
    assert(installedSkills.has(target),
      '#400: route-reachability — receipt-emitted skill target "' + target + '" has no installed ' +
      pluginRoot + '/skills/' + target + '/SKILL.md (broken route, the forge-codex #400 dead zone)');
  }
}

// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}

// Reviewer-contract-v2 edition wall: prove generated source identity, exact installed-profile
// enforcement, read-only-but-gating cache inspection, validation-runner distribution, shared
// lifecycle exports, and the complete authoring/execution/finalization guidance family.
{
  const generator = require(path.join(root, 'scripts', 'generate-reviewer-profiles.js'));
  const generatedErrors = generator.checkGeneratedProfiles(root);
  assert(generatedErrors.length === 0,
    'generated reviewer profiles must be current: ' + generatedErrors.join('; '));

  const installerFile = pluginRoot + '/scripts/install-codex-agent-profiles.js';
  const installer = require(path.join(root, installerFile));
  const sourceCheck = installer.validateSourceProfiles(path.join(root, pluginRoot));
  assert(sourceCheck.ok,
    pluginRoot + ' profile source contract failed: ' + sourceCheck.errors.join('; '));
  for (const role of generator.ROLES) {
    const entry = sourceCheck.entries.find(candidate => candidate.role === role);
    assert(entry && entry.profileContract
      && entry.profileContract.behavior_contract_version === generator.REVIEWER_BEHAVIOR_CONTRACT_VERSION,
    pluginRoot + ' must expose reviewer contract version '
      + generator.REVIEWER_BEHAVIOR_CONTRACT_VERSION + ' for ' + role);
    assert(/^[0-9a-f]{64}$/.test(entry.profileContract.behavior_contract_hash)
      && /^[0-9a-f]{64}$/.test(entry.profileContract.resolved_profile_hash),
    pluginRoot + ' must bind behavior and resolved profile hashes for ' + role);
    assert(!/^model(?:_reasoning_effort)?\s*=/m.test(entry.sourceText),
      pluginRoot + ' reviewer profiles must inherit the parent model by omission');
  }
  assertIncludes(installerFile, 'profile_contracts');
  assertIncludes(installerFile, 'profile_source_repair');

  const preflightFile = pluginRoot + '/scripts/kaola-workflow-codex-preflight.js';
  assertIncludes(preflightFile, "scope: 'repository'");
  assertIncludes(preflightFile, "scope: 'plugin_cache'");
  assertIncludes(preflightFile, 'profile_bytes_mismatch');
  assertIncludes(preflightFile, 'pluginCacheStale');

  const runnerFile = pluginRoot + '/scripts/kaola-workflow-validation-runner.js';
  assert(exists(runnerFile), runnerFile + ' is missing');
  assert(read(runnerFile) === read('scripts/kaola-workflow-validation-runner.js'),
    runnerFile + ' must be byte-identical to the canonical validation runner');
  const installManifest = require(path.join(root, 'scripts', 'kaola-workflow-install-manifest.js'));
  assert(installManifest.supportScripts('gitea').includes('kaola-workflow-validation-runner.js'),
    'manual edition install must ship the deterministic validation runner');


  // The three reviewer-contract-v2 PIN anchors are asserted on THESE SAME EDITION PATHS by the root
  // validator's authoring / execution / finalization surface loops — with a SUPERSET of needles
  // (each also pins the contract fields) — in the always-selected claude chain.
}

// #505 ITEM 1 / #816: the foreign-archive staging guard moved from bash prose INTO the finalize
// transaction as a typed refusal. Pin the refusal in this edition's producer script (a silent drop
// is the #294 fail-open class) and the surviving pointer in the command, so neither half can vanish.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', "band && band !== project && band.indexOf(project + '.archived-') !== 0");

// #505 ITEM 3: forge shared-function-presence guard. The hand-ported claim/sink-merge/classifier
// ports must carry the shared top-level functions that define the data layer.
// Pinning by function name (the #492 assertIncludes approach) means a silent DROP turns chain RED.
// Each validator pins its OWN edition's ports only.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'closeIssueIdempotent');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'buildBranchName');
// checkDispatchAttestations left the shared set with the planner-attestation retirement; it is
// now swept as an ABSENCE with the rest of that chain, above.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-sink-merge.js', 'deriveMemberSet');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-sink-merge.js', 'readStateIssueNumbers');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-sink-merge.js', 'probeIssueClosed');


// PROVENANCE_BAN: Gitea prompt surfaces (agents/*.toml, commands/*.md, skills/*/SKILL.md) must
// not embed issue numbers (#NNN), decision IDs (D-NNN-NN), invariant tags (INV-NN), ADR citations,
// or PR/MR/AC refs. Only the rule belongs in prompts; provenance belongs in CHANGELOG.md,
// docs/decisions/, and commit messages. Allowed: #N/#<issue>/#<n> placeholders, runtime vars
// (KAOLA_TARGET_ISSUE=N, --target-issue <N>), grey-zone audit labels (G1/G3/AC7/M4 — no #).
// See docs/conventions.md.
{
  const PROVENANCE_BAN = /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/;
  for (const rel of [...agentFiles, ...commandFiles, ...skillFiles]) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(PROVENANCE_BAN);
      if (m) {
        assert(false,
          rel + ':' + (i + 1) + ': PROVENANCE_BAN — provenance token "' + m[0] +
          '" must not appear in agent-facing prompt surfaces; see docs/conventions.md');
      }
    }
  }
}

// B2 model-noun purge (#609, the forge-codex twin of #537; #610 renamed the plan vocabulary to
// neutral tier tokens with legacy aliases): forge-codex prompt surfaces (agents/*.toml,
// config/agents.toml, skills/*/SKILL.md) must not use Claude model NOUNS (Opus/Sonnet/haiku) as
// runtime-model prose ("the Opus orchestrator", "reasoning-class (Opus)", "no haiku"). The plan
// tier tokens translate to a per-spawn reasoning_effort at dispatch, so a Claude model name reads
// as nonsense here. The ONLY permitted opus/sonnet are the B1 LEGACY-ALIAS mentions: the closed
// `{opus|sonnet}` set literal (pre-#610 frozen plans), the `model: opus`/`model: sonnet` -> effort
// mapping tokens, and the `opus`/`sonnet` legacy-alias-pair notation the #610 rename introduced.
// Strip those, then any surviving noun is a B2 leak. commands/*.md are Claude-edition ports that
// legitimately name models and are deliberately NOT scanned.
{
  const B2_MODEL_NOUN = /\b(?:opus|sonnet|haiku)\b/i;
  const scrubB1TierTokens = line => line
    .replace(/\{opus\|sonnet\}/g, '')
    .replace(/model:\s*(?:opus|sonnet)\b/g, '')
    .replace(/`opus`\/`sonnet`/g, ''); // #610: the legacy-alias-pair mention
  const b2Surfaces = [
    ...agentFiles,
    ...(exists(pluginRoot + '/config/agents.toml') ? [pluginRoot + '/config/agents.toml'] : []),
    ...skillFiles
  ];
  for (const rel of b2Surfaces) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = scrubB1TierTokens(lines[i]).match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          rel + ':' + (i + 1) + ': B2 model-noun "' + m[0] + '" — a Claude model name must not appear ' +
          'as runtime-model prose on a forge-codex surface; use tier/effort vocabulary (only the B1 ' +
          '`{opus|sonnet}` set, the `model: opus`/`model: sonnet` mapping, and the `opus`/`sonnet` ' +
          'legacy-alias-pair mention are allowed).');
      }
    }
  }
}

console.log('Kaola-Workflow Gitea contract validation passed');
