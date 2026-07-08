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

function assertBefore(file, earlier, later) {
  const text = norm(read(file));
  const ne = norm(earlier), nl = norm(later);
  const ei = text.indexOf(ne), li = text.indexOf(nl);
  assert(ei !== -1, file + ' must include: ' + earlier);
  assert(li !== -1, file + ' must include: ' + later);
  assert(ei < li, file + ': "' + earlier + '" must appear before "' + later + '"');
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

assert(commandFiles.length === 11, 'expected 11 Gitea command files, got ' + commandFiles.length);
// #400: 9 base skills + kaola-workflow-adapt + kaola-workflow-plan-run (adaptive SKILL pack) = 11.
assert(skillFiles.length === 11, 'expected 11 Gitea skill files, got ' + skillFiles.length);
assert(exists(pluginRoot + '/hooks/hooks.json'), 'Gitea hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'Gitea pre-commit hook missing');
assert(!hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'Gitea phantom-advisor hook must be removed (#372)');
// #376: the write-lane containment hook ships in every edition (byte-identical, forge-neutral).
assert(hookFiles.some(file => file.endsWith('kaola-workflow-write-lane.sh')), 'Gitea write-lane hook missing');
// #451: 14 base role profiles (the 6 <role>-max xhigh effort variants are retired). #463: +synthesizer = 15.
// #634: +metric-optimizer = 16.
assert(agentFiles.length === 16, 'expected 16 Gitea agent profiles (14 base + synthesizer #463 + metric-optimizer #634; <role>-max retired #451), got ' + agentFiles.length);
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
  assertIncludes(file, '## Agent Model Badge');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  assertNotIncludes(file, 'Agent Model Badge Contract');
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
  'kaola-gitea-workflow-plan-validator.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitea-workflow-walkthrough.js',
  'simulate-gitea-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-task-mirror.js',
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
  'kaola-gitea-workflow-plan-validator.js',
  'kaola-gitea-workflow-repair-state.js',
  'kaola-gitea-workflow-roadmap.js',
  'kaola-gitea-workflow-sink-merge.js',
  'kaola-gitea-workflow-sink-pr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitea-workflow-task-mirror.js',
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
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('--keep-worktree') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('metadata captured before'),
  'Gitea Finalization command must capture sink metadata before archive and preserve worktree for the final commit'
);
// #277 M3: contractor-dispatch HANDLE lock — mechanical finalization body moved to
// agents/contractor.md; finalize retains only the Agent(...) dispatch handle.
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('subagent_type="contractor"'),
  'Gitea Finalization command must dispatch the mechanical finalization to the contractor subagent'
);
// #459: contractor-free routing enforcement (Gitea edition). The fast path (#456) and the full
// path's Phase 1-5 + Phase 4 mechanical transitions (#457/#458) are script-owned (ADR 0004); the
// contractor DISPATCH must not return to those migrated command surfaces. We forbid the dispatch
// (`subagent_type="contractor"`), not the bare word, so the allowed finalize-exception prose note
// is untouched. Finalization (asserted just above) stays the SOLE contractor-owned transition.
for (const cmd of ['fast', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5']) {
  assert(
    !read(pluginRoot + '/commands/kaola-workflow-' + cmd + '.md').includes('subagent_type="contractor"'),
    'Gitea ' + cmd + ' command must not dispatch the contractor for migrated mechanics (script-owned per #456/#457/#458)'
  );
}
// Migrated Codex SKILLs: research/ideation/plan/review/execute must be fully contractor-free; the
// fast SKILL keeps a finalize-exception boundary note, so forbid only the handoff phrasing there.
for (const sk of ['research', 'ideation', 'plan', 'review', 'execute']) {
  assert(
    !read(pluginRoot + '/skills/kaola-workflow-' + sk + '/SKILL.md').includes('contractor'),
    'Gitea ' + sk + ' skill must be contractor-free (script-owned per #457/#458)'
  );
}
assert(
  !read(pluginRoot + '/skills/kaola-workflow-fast/SKILL.md').includes('delegated to the contractor'),
  'Gitea fast skill must not delegate mechanics to the contractor (script-owned per #456)'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('mr|pr)'),
  'Gitea finalize skill must dispatch canonical pr sink (mr|pr) case)'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--keep-worktree') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('metadata captured before archive'),
  'Gitea finalize skill must capture sink metadata before archive and preserve worktree for the final commit'
);
// #475: the consumer (non-npm) finalize gate prose (final-validation.md) must not drift out of the SKILL.
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('final-validation.md') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('final_validation_unverified'),
  'Gitea finalize skill must document the consumer (non-npm) final-validation.md gate (#475)'
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
// #345: the adaptive four-gate merge barrier in the Finalization COMMAND must resolve the
// validator via the kaola_script resolver — a bare `node scripts/…` path is MODULE_NOT_FOUND
// in a consumer plugin install (no ./scripts dir), turning the only blocking pre-merge
// enforcement into a false BLOCK. (The finalize SKILL already used a find-fallback.)
{
  const finalizeCmd = read(pluginRoot + '/commands/kaola-workflow-finalize.md');
  assert(
    finalizeCmd.includes('VALIDATOR="$(kaola_script kaola-gitea-workflow-plan-validator.js)"') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --resume-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --gate-verify') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --barrier-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --verdict-check') &&
    !finalizeCmd.includes('node scripts/kaola-gitea-workflow-plan-validator.js "$PLAN" --resume-check'),
    'Gitea Finalization command must resolve the four-gate barrier validator via kaola_script (no bare scripts/ path) — #345'
  );
}
// #624: the forge-codex finalize SKILL must carry the adaptive prerequisite block ported from
// the canonical (github-codex) finalize SKILL — the workflow_path: adaptive branch and its
// four-gate barrier — not just the fast-path branch. A SKILL missing this block leaves an
// adaptive-path run with no script-enforced completion gate and a dangling `validator_script`
// reference in the Chain-Receipt Gate section below it.
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('workflow_path: adaptive') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('validator_script') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--resume-check') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--gate-verify') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--barrier-check') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--verdict-check'),
  'Gitea finalize skill must carry the adaptive prerequisite block (workflow_path: adaptive + the four-gate validator_script barrier) — #624'
);
for (const skill of listFiles(pluginRoot + '/skills', file => file.endsWith('SKILL.md'))) {
  assert(!read(skill).includes('*/kaola-workflow/*/scripts/kaola-gitea'), skill + ' must use the Gitea Codex plugin cache path');
}

// Delegation policy checks
const giteaSkillsBase = `${pluginRoot}/skills`;
const delegationNegativeChecks = [
  [`${giteaSkillsBase}/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research'],
  [`${giteaSkillsBase}/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis'],
  [`${giteaSkillsBase}/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint'],
  [`${giteaSkillsBase}/kaola-workflow-execute/SKILL.md`, 'when subagents are available'],
  [`${giteaSkillsBase}/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor'],
  [`${giteaSkillsBase}/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally'],
  [`${giteaSkillsBase}/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally'],
  [`${giteaSkillsBase}/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs'],
];
for (const [file, needle] of delegationNegativeChecks) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}
const giteaDelegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
  'kaola-workflow-fast',
];
for (const skill of giteaDelegationSkills) {
  const skillFile = `${giteaSkillsBase}/${skill}/SKILL.md`;
  assert(read(skillFile).includes('subagent-invoked'), skillFile + ' must include: subagent-invoked');
  assert(read(skillFile).includes('local-fallback-explicit'), skillFile + ' must include: local-fallback-explicit');
  assert(read(skillFile).includes('local-fallback-tool-unavailable'), skillFile + ' must include: local-fallback-tool-unavailable');
}
assert(
  read(`${giteaSkillsBase}/kaola-workflow-next/SKILL.md`).includes('extract and reassign `delegation_policy:` alongside `phase` and `next_skill`'),
  'Gitea next skill must explicitly resume delegation_policy alongside phase and next_skill'
);
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const giteaNext210 = `${giteaSkillsBase}/kaola-workflow-next/SKILL.md`;
assert(!read(giteaNext210).includes('Ask the user once at startup'), giteaNext210 + ' must not prompt for a delegation policy at startup');
assert(!read(giteaNext210).includes('How should delegation be handled'), giteaNext210 + ' must not present a delegation menu');
assert(read(giteaNext210).includes('Codex subagent delegation is the default.'), giteaNext210 + ' must declare delegation the default');
assert(read(giteaNext210).includes('The default `delegation_policy` is `delegate`'), giteaNext210 + ' must default delegation_policy to delegate');
assert(read(giteaNext210).includes('KAOLA_DELEGATION_POLICY=delegate'), giteaNext210 + ' must set KAOLA_DELEGATION_POLICY=delegate');
assert(read(giteaNext210).includes('.codex/agents/kaola-workflow/'), giteaNext210 + ' must name the role-profile detection path');
// #598 AC3: the delegation probe must also accept a global profile install — keep the
// project-local needle above GREEN (add, never remove) and pin the global path alongside it.
assert(read(giteaNext210).includes('~/.codex/agents/kaola-workflow/'), giteaNext210 + ' must name the global role-profile detection path');
assert(read(giteaNext210).includes('record `local-fallback-tool-unavailable` with a non-empty Evidence value'), giteaNext210 + ' must record auto-detected tool-unavailable as evidence');
assert(read(giteaNext210).includes('only when the user explicitly'), giteaNext210 + ' must gate local-authorized behind explicit user request');
assert(read(giteaNext210).includes('default `delegation_policy` to `delegate` without prompting'), giteaNext210 + ' must default delegate on resume without prompting');
// Issue #174: Gitea next skill parity gaps
const giteaNextSkill = `${giteaSkillsBase}/kaola-workflow-next/SKILL.md`;
assertNotIncludes(giteaNextSkill, 'PICK_NEXT_PROJECT');
assertIncludes(giteaNextSkill, 'KAOLA_VERDICT=');
assertIncludes(giteaNextSkill, 'KAOLA_REASONING=');
assertIncludes(giteaNextSkill, 'target_unverified');
assertIncludes(giteaNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
assertIncludes(giteaNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
assertBefore(giteaNextSkill, '### Co-active Folders Advisory', '## Routing');
// Issue #190: M1 — Codex fast-path routing parity (RED guard)
assertIncludes(giteaNextSkill, 'Startup Step 0a-1');
assertIncludes(giteaNextSkill, 'Branch: {branch from Sink block');
// #538: the status-report `Workflow path:` line now leads with adaptive-by-default (fast|full only
// on an explicit escape) — the old `{fast|full` menu framing retired with the path switch.
assertIncludes(giteaNextSkill, 'Workflow path: {adaptive by default');
assertIncludes(giteaNextSkill, 'Parallel decision: {green|yellow|red');
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  const skillFile = `${giteaSkillsBase}/${skill}/SKILL.md`;
  assert(
    read(skillFile).includes('Plain `invoked` is intentional for non-Codex-role workflow gates'),
    skillFile + ' must explain intentional non-Codex-role invoked rows'
  );
}

// delegationPolicyCompliance must be exported from repair-state
const giteaRepairState = require('./kaola-gitea-workflow-repair-state.js');
assert(
  typeof giteaRepairState.delegationPolicyCompliance === 'function',
  'kaola-gitea-workflow-repair-state.js must export delegationPolicyCompliance'
);

function complianceFixture(rows) {
  return [
    '# Phase Fixture',
    '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    ...rows.map(row => `| ${row[0]} | ${row[1]} | ${row[2] || ''} | ${row[3] || ''} |`)
  ].join('\n');
}

function policyState(policy) {
  return `# Kaola-Workflow State\n\ndelegation_policy: ${policy}\n`;
}

function assertPolicyAllowed(policy, rows, label) {
  const result = giteaRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = giteaRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['documentation docking', 'invoked', '.cache/doc-docking.md', '']
], 'delegated Gitea Codex role row with a non-role workflow gate');
assertPolicyAllowed('delegate', [
  ['code-explorer', 'local-fallback-tool-unavailable', '.cache/code-explorer.md', '']
], 'delegate policy with all role rows unavailable and evidenced');
assertPolicyAllowed('local-authorized', [
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'explicit local authorization');
assertPolicyAllowed('tool-unavailable', [
  ['doc-updater', 'N/A', '.cache/doc-updater.md', 'No documentation changes needed.'],
  ['final validation', 'invoked', '.cache/final-validation.md', '']
], 'finalize non-role invoked rows with N/A doc-updater');
assertPolicyBlocked('delegate', [
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'local fallback under delegate policy');
assertPolicyBlocked('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['planner', 'local-fallback-explicit', '.cache/planner.md', '']
], 'mixed local fallback under delegate policy');
assertPolicyBlocked('tool-unavailable', [
  ['code-reviewer', 'subagent-invoked', '.cache/code-reviewer.md', '']
], 'subagent row under tool-unavailable policy');
// Issue #210: contract tests for the no-prompt default path and the explicit local fallback path.
assertPolicyAllowed('delegate', [
  ['code-explorer', 'local-fallback-tool-unavailable', '.codex/agents/kaola-workflow/ absent', '']
], 'issue #210 no-prompt default: delegate auto-detects evidenced tool-unavailable (regression lock)');
assertPolicyAllowed('local-authorized', [
  ['code-explorer', 'local-fallback-explicit', 'user disabled delegation', '']
], 'issue #210 explicit local fallback: local-authorized only on explicit user request');

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
assertConcept(giteaInitSkill, 'Gitea init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  // #572: the injected block now re-grounds durable state on the adaptive plan, not phase files.
  'workflow-plan.md',
  '## Node Ledger',
  '.cache/{node-id}.md'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'Gitea missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'Gitea atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  'updated: issue-'
]);
// #389 (#353/#354 completion): the plan-validator --freeze writer (plan_hash stamp + mid-run repair
// re-freeze carrying the ## Node Ledger) and the adaptive-handoff workflow-state Planning Evidence
// writer route through the crash-safe atomic replace.
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-plan-validator.js`, 'writeFileAtomicReplace(planPath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-adaptive-handoff.js`, 'writeFileAtomicReplace(fpath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, "sub === 'validate-remote'");
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'function validateRemote');
assertIncludes(`${pluginRoot}/scripts/kaola-gitea-workflow-roadmap.js`, 'cmdValidateRemote');
assertIncludes(`${pluginRoot}/scripts/test-gitea-workflow-scripts.js`, 'testGiteaRoadmapValidateRemote');
// #401 Part 1: the forge plan-validator refusal-matrix anchor must remain wired into the suite.
assertIncludes(`${pluginRoot}/scripts/test-gitea-workflow-scripts.js`, 'testGiteaPlanValidatorRefusalMatrix401');

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

// issue #198: fast-path widening — eligibility/hatch/review contract parity
const giteaFastCmd198 = pluginRoot + '/commands/kaola-workflow-fast.md';
const giteaFastSkill198 = pluginRoot + '/skills/kaola-workflow-fast/SKILL.md';
for (const fastFile of [giteaFastCmd198, giteaFastSkill198]) {
  assertIncludes(fastFile, 'mechanical');
  assertIncludes(fastFile, '≤ 5');
  assertIncludes(fastFile, 'design choice');
  assertIncludes(fastFile, 'approach_ambiguity');
  assertIncludes(fastFile, 'declared write set');
  assertIncludes(fastFile, 'absolute backstop of 6');
  assertIncludes(fastFile, '`code-reviewer` is mandatory');
}
assertNotIncludes(giteaFastCmd198, 'two closely related files');
assertNotIncludes(giteaFastCmd198, '≤ 2');
assertNotIncludes(giteaFastSkill198, '(≤ 2)');
assertNotIncludes(giteaFastSkill198, '> 2 files');
// issue #207: fast-overlap parity (Gitea) — Scope declares a `- Write Set:` line
// and the classifier reads that fast-summary.md Scope section.
for (const fastFile207 of [giteaFastCmd198, giteaFastSkill198]) assertIncludes(fastFile207, '- Write Set:');
const giteaClassifier207 = pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js';
assertIncludes(giteaClassifier207, 'fast-summary.md');
assertIncludes(giteaClassifier207, 'sectionBody(');
assertIncludes(giteaClassifier207, "'Scope'");
const giteaNextCmd198 = pluginRoot + '/commands/workflow-next.md';
const giteaNextSkill198 = pluginRoot + '/skills/kaola-workflow-next/SKILL.md';
for (const nextFile of [giteaNextCmd198, giteaNextSkill198]) {
  // #538: the fast-path eligibility rubric (`mechanical` / `≤ 5` / `design choice`) was Branch-A
  // content of the next router and is DELETED with Branch A (adaptive is the unconditional default).
  // The rubric concept stays machine-enforced on its correct surface — the fast cmd + SKILL (L595-597
  // above) — so dropping the next-router pins loses zero coverage; the negative-assert stays.
  assertNotIncludes(nextFile, '≤ 2 closely related files');
}

// #203: Select Project active-folder definition must include fast-summary.md (follow-up to #201).
const giteaNextCmd203 = pluginRoot + '/commands/workflow-next.md';
// Assertion A (Select Project drift-guard): the Startup Step 3 active-folder
// list must include fast-summary.md. Use the Select-Project-specific substring
// — a bare "fast-summary" already appears in the #201 reconstruction ladder.
assertIncludes(giteaNextCmd203, '`fast-summary.md` file, or a `workflow-state.md`');
// Assertion B (ladder drift-guard, regression lock for #201): keep the
// reconstruction-ladder fast-path entry present.
assertIncludes(giteaNextCmd203, 'fast-summary.md exists -> /kaola-workflow-fast');

// issue #222: fast-path mid-flight escalation routing fix — Gitea parity
for (const fastFile222 of [giteaFastCmd198, giteaFastSkill198]) {
  assertIncludes(fastFile222, 'workflow_path: full');
  assertIncludes(fastFile222, 'next_command: /kaola-workflow-phase1 {project}');
  assertIncludes(fastFile222, 'next_skill: kaola-workflow-research {project}');
  assertIncludes(fastFile222, 'status `ESCALATED` → escalation already committed');
}
assertBefore(giteaNextCmd203, 'fast-summary.md status ESCALATED -> /kaola-workflow-phase1', 'fast-summary.md exists -> /kaola-workflow-fast');
assertIncludes(giteaNextSkill198, 'fast-summary.md status ESCALATED -> kaola-workflow-research');

// issue #227: adaptive-path contract (Gitea fork command prose + renamed scripts).
assert(exists(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js'), 'Gitea adaptive plan validator missing');
assert(exists(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js'), 'Gitea adaptive schema module missing');
// #538: adaptive is the UNCONDITIONAL default — there is no switch. The router honors an explicit
// `KAOLA_PATH` and the fast/full verbal escapes, else defaults to adaptive; a named-but-not-installed
// path is the claim's typed `path_not_installed` refusal (the router does not read installed_paths —
// the claim front door owns that, per R2). Pin the new model's tokens.
assertConcept(pluginRoot + '/commands/workflow-next.md', 'adaptive path selection', [
  'KAOLA_PATH', 'adaptive', 'default', 'path_not_installed', 'fast', 'full'
]);
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'workflow-plan.md exists -> /kaola-workflow-plan-run');
// v5.1.0: the adaptive front-end ROUTING must stay enforced — the router skips its inline claim and
// routes fresh adaptive to the workflow-planner front end. The router surface was unlocked before,
// which let this forge edition ship green with the front end unreachable (inline-claim regression).
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'kaola-workflow-adapt $KAOLA_TARGET_ISSUE');
assertIncludes(pluginRoot + '/commands/workflow-next.md', 'Skip this entire step when `KAOLA_PATH=adaptive`');
// #277 M3: FANOUT_CAP and post-dominate relocated from commands/kaola-workflow-adapt.md
// (dispatch-handle-only) to agents/workflow-planner.md (sole home of authoring procedure).
// agents/workflow-planner.md is a shared repo-root file; use a root-relative path (no pluginRoot).
assertConcept('agents/workflow-planner.md', 'adaptive authoring', [
  'workflow-plan.md', '## Nodes', 'post-dominate', 'finalize', 'FANOUT_CAP', 'plan_hash', 'typed refusal'
]);
// v5.1.0: the workflow-planner dispatch must stay ENFORCED (Agent block + model badge), not inline prose.
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'subagent_type="workflow-planner"');
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'model="{WORKFLOW_PLANNER_MODEL}"');
// v5.1.0: the refusal consumer branch must stay FAIL-CLOSED (any non-acquired/owned verdict = refusal).
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'NOT `acquired` or `owned`');
assertIncludes(pluginRoot + '/commands/kaola-workflow-adapt.md', 'do not blind-read');
assertConcept(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'adaptive execution + governance', [
  '## Node Ledger', 'plan_hash', 'post-dominate', 'auto-run', 'provisional', 'halt for consent',
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput', 'test_thrash',
  'merge_conflict', 'synthesizer',
  // #303 anti-drift: pin the rolling-dispatch + crash-repair + opening-lifecycle primitives.
  'top-up', 'reconcile', 'opening',
  // #335 anti-drift: pin the mechanical main→worktree project-folder mirror step.
  'mirror-project'
]);
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'workflow_path: adaptive');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'disjointWriteSets');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'readPlanNodes');
// #463 Slice 6 (AC11): token-pin the three write-overlap governance anchors (synthesizer reasoning floor,
// policy field, PROTECTED set) in the Gitea edition tree.
assertIncludes(pluginRoot + '/scripts/kaola-workflow-resolve-agent-model.js', 'REASONING_FLOOR_ROLES');
assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js', 'WRITE_OVERLAP_POLICY_LEGAL');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'PROTECTED_BASENAMES');
// #492: pin the shared write-set classification anchors so a forge classifier port (a forge-specific
// SUPERSET, not a rename-normalized copy) cannot silently DROP a shared function. Body parity of the
// shared logic is verified out-of-band (legitimate forge divergence in areaForPath's own-plugin path).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'areaForPath');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'SHARED_INFRA');
// #538: the named-but-not-installed-path refusal renamed `workflow_path_refused` -> `path_not_installed`.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'path_not_installed');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'routeAdaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'enable_adaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'enable_adaptive');
// #343: mid-gate reopen fold + orphan guard must be carried by the Gitea adaptive-node port
// (not byte-checked by validate-script-sync; this pin is the anti-drift guard).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', 'would_orphan_in_progress');

// #338: anti-drift pins — finalize sink row main-session-direct + contractor self-attest back-fill.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', 'main-session-direct');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-direct');
// #360: script-owned consent-halt clear (clear-halt subcommand) replaces the contractor lockstep.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'clear-halt');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', "subcommand === 'clear-halt'");
// #344: every adaptive lifecycle call is `node "$KAOLA_SCRIPTS/…"`; $KAOLA_SCRIPTS must be
// DEFINED via the kaola_script() resolver before its first use — undefined in a consumer install.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'kaola_script(){');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-adaptive-node.js)")"');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', '--attest-contractor-spawn');
// #347: the planner self-attest back-fill flag must be ported to the forge claim (the #280 producer
// was canonical-only while #300 ported its consumer — without this pin the asymmetry is invisible).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', '--attest-planner-spawn');
// #359: producer-attested evidence-token vocabulary in the forge agent profiles.
assertIncludes(pluginRoot + '/agents/implementer.toml', 'verification_tier');
assertIncludes(pluginRoot + '/agents/tdd-guide.toml', 'literal tokens RED');
assertIncludes(pluginRoot + '/agents/contractor.toml', '--attest-contractor-spawn');
// #634: producer-attested evidence-token vocabulary in the metric-optimizer forge agent profile.
assertIncludes(pluginRoot + '/agents/metric-optimizer.toml', 'iterations_used');

// #445/#446: operator_hint + route-findings + --summary pins (Gitea forge ports).
// OPERATOR_HINT_REGISTRY must exist in each aggregator (plan-validator, commit-node,
// adaptive-node). route-findings and --summary are adaptive-node-only (#446).
for (const aggregatorScript of [
  pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js',
  pluginRoot + '/scripts/kaola-gitea-workflow-commit-node.js',
  pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js'
]) {
  assertIncludes(aggregatorScript, 'OPERATOR_HINT_REGISTRY');
}
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', "'route-findings'");
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-adaptive-node.js', "'--summary'");
// test-gitea-workflow-scripts.js must exercise operator_hint + route-findings + --summary.
assertIncludes(pluginRoot + '/scripts/test-gitea-workflow-scripts.js', 'testGiteaAdaptiveNodeOperatorHint445');

// #340: registration-surface + forge-port parity checks and their authoring/dispatch prose
// (Gitea edition surfaces). A dropped token reds this chain at the contract-validator step.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'agent-registration gap');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'forge-port ordering gap');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'full accumulated root diff');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'registration surface');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'full accumulated root diff');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_task_name');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_dispatch_mode');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'reasoning_effort');

// #602: the canonical --summary invocation must document the dispatch-essentials one-liner it
// actually prints, the extended pre-dispatch card-acquisition rule, and the explicit
// no-improvise prohibition on every plan-run spawn — pinned on BOTH the command and SKILL surfaces.
for (const planRunSurface of [
  pluginRoot + '/commands/kaola-workflow-plan-run.md',
  pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md'
]) {
  assertIncludes(planRunSurface, 'opened=<node-id> role=<role> task=<codex_task_name>');
  assertIncludes(planRunSurface, "take the dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`. Never dispatch without the card in view.");
  assertIncludes(planRunSurface, 'Every spawn parameter comes from the dispatch card.');

  // #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
  // inline-fallback format, verbatim.
  assertIncludes(planRunSurface, 'plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.');
  assertIncludes(planRunSurface, '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model|default}, effort {effort|inherit})');
  assertIncludes(planRunSurface, '← {node_id} · {role} returned: {verdict or one-line outcome}');
  assertIncludes(planRunSurface, '→ running {node_id} · {role} inline (…reason token…)');

  // #605: required progress-echo line printed after every close-and-open-next.
  assertIncludes(planRunSurface, '{node-id} → complete; opened: {next-id|—}');

  // #607: gate-instrumentation-provisioning block — a main-session-gate node body never
  // instructs authoring files; instrumentation is provisioned upstream; the runtime
  // gate-window fence backs it. Pinned on BOTH the command and SKILL surfaces.
  assertIncludes(planRunSurface, '<!-- PIN: gate-instrumentation-provisioning -->');
  assertIncludes(planRunSurface, 'KAOLA_GATE_WINDOW_FENCE=0');

  // #611: the Codex Join Protocol reference — dispatch-card wait budget, delegation outcome, and
  // writer-kill-safety verdict, present on BOTH the command (runtime-appropriate equivalent) and
  // SKILL (full A-F encoding) surfaces.
  assertIncludes(planRunSurface, 'dispatch.wait_budget_minutes');
  assertIncludes(planRunSurface, 'delegation_outcome');
  assertIncludes(planRunSurface, 'writerHalt');
}

// #611: the Codex Join Protocol's full A-F encoding is Codex-SKILL-specific (spawn_agent /
// wait_agent / close_agent lifecycle) — pin the anchor + the wait-budget floor rule there only.
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', '<!-- PIN: join-protocol -->');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'NEVER interrupted before its wait budget expires');
// #611: the command surface's runtime-appropriate equivalent uses SendMessage vocabulary and the
// "Writer kill-safety" heading instead of the Codex A-F lettering.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'Writer kill-safety');

// #606: teammate-mode dispatch subsection — Claude-runtime block, command surface only.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', "spawn each node's role agent as a NAMED teammate");
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'send EXACTLY ONE request for the deliverable, then wait');
// #611: fork_turns:"none" unconditional mandate — Codex-dispatch block, SKILL surface only.
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'on EVERY dispatch, tiered or not');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'the unconditional mandate applies identically to this dispatch mode');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'not a valid path for tiered nodes');

// #603: the Codex startup surfaces (kaola-workflow-next / kaola-workflow-adapt) must detect the
// dispatch mode via the preflight doctor and thread it into the claim as an explicit flag.
assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'Codex Dispatch Mode Detection');
assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', '--codex-dispatch-mode');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', '--codex-dispatch-mode');
// #610: the primary mapping is neutral-token-first; the legacy `opus`/`sonnet` aliases must still
// be documented resolving to the same efforts (alias-aware, not just neutral-token-aware).
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', '`model: standard` -> `high`');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'legacy `model: opus` -> `xhigh` / `model: sonnet` -> `high` aliases resolve identically');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'fork_turns: "none"');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'reasoning_effort: dispatch.codex_reasoning_effort');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'fresh child-session effort proof');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_effort_override_unavailable');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', '`sonnet`/absent');

// #334: the non-delegable main-session-gate role token + its G3 freeze gate + authoring/dispatch
// prose, pinned in the Gitea edition surfaces (port validator, plan-run command, planner TOML).
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-plan-validator.js', 'G3: main-session-gate');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-gate');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'main-session-gate');

// #607: gate instrumentation is provisioned upstream, never authored by the gate itself — pinned
// on the Gitea edition planner TOML and its kaola-workflow-adapt SKILL (md↔toml parity for the
// TOML twin is separately enforced by the shared test-agent-profile-parity.js FEATURE_TOKENS).
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'the gate never authors or deletes files');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'the gate never authors or deletes files');

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
// #281: frontier-unit semantics in Gitea plan-run command (added by plan-run-semantics node)
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit');
// #281: efficient-DAG instruction in Gitea workflow-planner profile (added by planner-profile node)
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'EFFICIENT DAGs');

// #341: forge-neutral agent-profile authoring guidance pinned (planner toml + plan-run command).
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'forge-neutral');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', '--forbidden-only');

// issue #332: source agent-profile schema wall (AC2). require() THIS tree's own
// installer copy (require.main guard means require() never runs main()) and assert its
// source-tree validator passes for the Gitea plugin tree — every agents/*.toml has a
// matching non-empty top-level `name`, a description, valid nickname_candidates, an optional
// model_reasoning_effort, a non-blank developer_instructions, every config_file resolves, and every toml is referenced by
// exactly one [agents.*] entry (catches the issue-scout class of omission forever).
const giteaInstaller = require('./install-codex-agent-profiles.js');
const giteaProfiles = giteaInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(giteaProfiles.ok,
  'Gitea source agent profiles fail schema validation:\n  - ' + giteaProfiles.errors.join('\n  - '));

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
  const emittedSkillTargets = [
    schema.PLAN_RUN_SKILL,
    schema.ADAPT_SKILL,
    'kaola-workflow-fast',
    'kaola-workflow-research'
  ];
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
  // Content-reachability tier (catches #369/#380): a mirrored SKILL must carry the command's
  // route/wiring tokens or the route resolves to a hollow surface.
  assertIncludes(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md', 'issue_numbers');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md', '--issue-numbers');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'workflow-plan.md exists -> kaola-workflow-plan-run');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'auto-bundle');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'close-and-open-next');
  // #463 (AC11): pin the synthesizer role in the forge-codex SKILL too (the #400 dead-zone surface).
  assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'synthesizer');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'kaola-workflow-plan-run');
  // #598 AC3: the adapt SKILL's delegation probe must accept a global profile install too — keep
  // the project-local needle GREEN (add, never remove) and pin the global path alongside it.
  assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', '.codex/agents/kaola-workflow/');
  assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', '~/.codex/agents/kaola-workflow/');
  // #598 AC4: gate-role degradation must surface loudly when dispatch is unavailable — pin the
  // run-start notice + the consent-halt escalation on both the Gitea command and SKILL mirror.
  for (const planRunSurface of [
    pluginRoot + '/commands/kaola-workflow-plan-run.md',
    pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md'
  ]) {
    assertIncludes(planRunSurface, '## Gate-Role Degradation Notice');
    assertIncludes(planRunSurface, 'an inline gate reviewing its own writer-context is no gate');
    assertIncludes(planRunSurface, 'self-issued `verdict: pass`');
    assertIncludes(planRunSurface, 'write-halt --reason consent');
  }
  // #451/#582: the forge-codex plan-run SKILL no longer selects a `<role>-max` variant — the
  // per-node tier maps to per-spawn reasoning-effort on the dispatch descriptor, and unproven
  // tiered v1 dispatch fails closed.
}

// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}

// #505 ITEM 1: pin the FOREIGN_ARCHIVE staging guard in the Gitea finalize command so a silent
// drop (the #294 fail-open class) turns this chain RED. Pins own edition's file only.
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'FOREIGN_ARCHIVE=$(git diff --cached');
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'BLOCKED: a foreign project\'s archive band is staged');
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', '## Staging Guard');

// #505 ITEM 3: forge shared-function-presence guard. The hand-ported claim/sink-merge/classifier/
// roadmap/repair-state ports must carry the shared top-level functions that define the data layer.
// Pinning by function name (the #492 assertIncludes approach) means a silent DROP turns chain RED.
// Each validator pins its OWN edition's ports only.
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'closeIssueIdempotent');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'buildBranchName');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-claim.js', 'checkDispatchAttestations');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'isSharedInfra');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'isProtected');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-classifier.js', 'readPlanNodes');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'isAdaptiveWorkflowState');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'adaptiveStateValid');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-repair-state.js', 'isSafeName');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-roadmap.js', 'readRoadmapIssues');
assertIncludes(pluginRoot + '/scripts/kaola-gitea-workflow-roadmap.js', 'roadmapDir');
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
