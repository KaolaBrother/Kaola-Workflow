#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const pluginRoot = 'plugins/kaola-workflow-gitlab';

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
    /\bgh\b/,
    /github\.com/i,
    /api\.github\.com/i,
    /GitHub/,
    /PR URL/,
    /PR number/,
    /pull request/i,
    /\b[a-z]+glab\b/i
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
    console.error('usage: node validate-kaola-workflow-gitlab-contracts.js [--forbidden-only <file> ...]');
    process.exit(2);
  }
  const forbiddenOnlyFiles = cliArgs.slice(1);
  if (forbiddenOnlyFiles.length === 0) {
    console.error('usage: node validate-kaola-workflow-gitlab-contracts.js --forbidden-only <file> [<file> ...]');
    process.exit(2);
  }
  for (const file of forbiddenOnlyFiles) {
    const rel = path.isAbsolute(file) ? path.relative(root, file) : file;
    assert(exists(rel), '--forbidden-only: file not found: ' + file);
    assertNoForbidden(rel);
  }
  console.log('Kaola-Workflow GitLab forbidden-only check passed (' + forbiddenOnlyFiles.length + ' file(s))');
  process.exit(0);
}

const pluginJson = parseJson(pluginRoot + '/.codex-plugin/plugin.json');
assert(pluginJson.name === 'kaola-workflow-gitlab', 'GitLab Codex plugin name mismatch');
assert(pluginJson.skills === './skills/', 'GitLab Codex plugin must expose ./skills/');

const claudePluginJson = parseJson(pluginRoot + '/.claude-plugin/plugin.json');
assert(String(claudePluginJson.name || '').includes('gitlab'), 'GitLab Claude plugin name must identify GitLab');
assert(claudePluginJson.version === require(path.join(root, 'package.json')).version,
  'GitLab Claude plugin version must match package.json');

const marketplace = parseJson('.agents/plugins/marketplace.json');
assert(marketplace.plugins.some(plugin =>
  plugin.name === 'kaola-workflow-gitlab' &&
  plugin.source &&
  plugin.source.path === './plugins/kaola-workflow-gitlab'
), 'marketplace must include kaola-workflow-gitlab');

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

assert(commandFiles.length === 11, 'expected 11 GitLab command files');
// #400: 9 base skills + kaola-workflow-adapt + kaola-workflow-plan-run (adaptive SKILL pack) = 11.
assert(skillFiles.length === 11, 'expected 11 GitLab skill files');
assert(exists(pluginRoot + '/hooks/hooks.json'), 'GitLab hooks.json missing');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes(pluginRoot + '/hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assert(hookFiles.some(file => file.endsWith('kaola-workflow-pre-commit.sh')), 'GitLab pre-commit hook missing');
assert(!hookFiles.some(file => file.endsWith('kaola-workflow-phantom-advisor.sh')), 'GitLab phantom-advisor hook must be removed (#372)');
// #376: the write-lane containment hook ships in every edition (byte-identical, forge-neutral).
assert(hookFiles.some(file => file.endsWith('kaola-workflow-write-lane.sh')), 'GitLab write-lane hook missing');
// #451: 14 base role profiles (the 6 <role>-max xhigh effort variants are retired). #463: +synthesizer = 15.
// #634: +metric-optimizer = 16.
assert(agentFiles.length === 16, 'expected 16 GitLab agent profiles (14 base + synthesizer #463 + metric-optimizer #634; <role>-max retired #451)');
assert(exists(pluginRoot + '/config/agents.toml'), 'GitLab agents config missing');

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

// #451 (supersedes #405): the <role>-max xhigh effort-variant matrix is RETIRED (gitlab port). No
// generated -max profile files and no [agents.<role>-max] tables may survive — the per-node tier
// drives a session reasoning-effort signal instead. Forbid both.
{
  const configText = read(pluginRoot + '/config/agents.toml');
  const strayMaxFiles = agentFiles.map(f => path.basename(f)).filter(n => n.endsWith('-max.toml')).sort();
  assert(strayMaxFiles.length === 0, '#451 gl: retired -max profile file(s) must be removed: ' + strayMaxFiles.join(', '));
  const maxTables = (configText.match(/^\[agents\.[a-z0-9-]+-max\]/gm) || []);
  assert(maxTables.length === 0, '#451 gl: config/agents.toml must not register [agents.<role>-max] tables: ' + maxTables.join(', '));
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
  'kaola-gitlab-forge.js',
  'kaola-gitlab-workflow-active-folders.js',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitlab-workflow-classifier.js',
  'kaola-gitlab-workflow-compact-context.js',
  'kaola-gitlab-workflow-plan-validator.js',
  'kaola-gitlab-workflow-replan.js',
  'kaola-gitlab-workflow-repair-state.js',
  'kaola-gitlab-workflow-roadmap.js',
  'kaola-gitlab-workflow-sink-merge.js',
  'kaola-gitlab-workflow-sink-mr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'simulate-gitlab-workflow-walkthrough.js',
  'simulate-gitlab-codex-workflow-walkthrough.js',
  'install-codex-agent-profiles.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitlab-workflow-task-mirror.js',
  'kaola-gitlab-workflow-codex-compact-resume.js',
  'kaola-gitlab-workflow-run-chains.js',
  'kaola-gitlab-workflow-gap-sweep.js'
];
for (const script of scriptFiles) assert(exists(pluginRoot + '/scripts/' + script), script + ' missing');

// #407: install.sh's per-forge SUPPORT_SCRIPT_NAMES is single-sourced from the install manifest
// (no literal arrays remain in install.sh). Assert the manifest emits each required GitLab support
// script for the gitlab forge — same intent (this script ships in a manual install), correct source.
const gitlabInstallManifest = require(path.join(root, 'scripts', 'kaola-workflow-install-manifest.js'));
const gitlabManifestScripts = gitlabInstallManifest.supportScripts('gitlab');
const installSupportScripts = [
  'kaola-gitlab-forge.js',
  'kaola-gitlab-workflow-active-folders.js',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitlab-workflow-classifier.js',
  'kaola-gitlab-workflow-compact-context.js',
  'kaola-gitlab-workflow-plan-validator.js',
  'kaola-gitlab-workflow-replan.js',
  'kaola-gitlab-workflow-repair-state.js',
  'kaola-gitlab-workflow-roadmap.js',
  'kaola-gitlab-workflow-sink-merge.js',
  'kaola-gitlab-workflow-sink-mr.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-gitlab-workflow-task-mirror.js',
  'kaola-gitlab-workflow-codex-compact-resume.js',
  'kaola-gitlab-workflow-run-chains.js',
  'kaola-gitlab-workflow-gap-sweep.js'
];
for (const script of installSupportScripts) {
  assert(gitlabManifestScripts.includes(script), 'install manifest must emit GitLab support script: ' + script);
}
assert(JSON.stringify(gitlabManifestScripts.filter(name => /workflow-replan\.js$/.test(name)))
    === JSON.stringify(['kaola-gitlab-workflow-replan.js']),
'GitLab install manifest must emit exactly the renamed re-plan aggregator');

// issue #283: kaola-workflow-phase6.md was removed; kaola-workflow-finalize.md is the terminal routine.
assert(!exists(pluginRoot + '/commands/kaola-workflow-phase6.md'),
  'GitLab legacy kaola-workflow-phase6.md must be absent (hard-removed by #283)');
assert(exists(pluginRoot + '/commands/kaola-workflow-finalize.md'),
  'GitLab kaola-workflow-finalize.md must be present');
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('mr|pr)'),
  'GitLab Finalization command must dispatch canonical mr sink plus pr compatibility alias'
);
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('--keep-worktree') &&
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('metadata captured before'),
  'GitLab Finalization command must capture sink metadata before archive and preserve worktree for the final commit'
);
// #277 M3: contractor-dispatch HANDLE lock — mechanical finalization body moved to
// agents/contractor.md; finalize retains only the Agent(...) dispatch handle.
assert(
  read(pluginRoot + '/commands/kaola-workflow-finalize.md').includes('subagent_type="contractor"'),
  'GitLab Finalization command must dispatch the mechanical finalization to the contractor subagent'
);
// #459: contractor-free routing enforcement (GitLab edition). The fast path (#456) and the full
// path's Phase 1-5 + Phase 4 mechanical transitions (#457/#458) are script-owned (ADR 0004); the
// contractor DISPATCH must not return to those migrated command surfaces. We forbid the dispatch
// (`subagent_type="contractor"`), not the bare word, so the allowed finalize-exception prose note
// is untouched. Finalization (asserted just above) stays the SOLE contractor-owned transition.
for (const cmd of ['fast', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5']) {
  assert(
    !read(pluginRoot + '/commands/kaola-workflow-' + cmd + '.md').includes('subagent_type="contractor"'),
    'GitLab ' + cmd + ' command must not dispatch the contractor for migrated mechanics (script-owned per #456/#457/#458)'
  );
}
// Migrated Codex SKILLs: research/ideation/plan/review/execute must be fully contractor-free; the
// fast SKILL keeps a finalize-exception boundary note, so forbid only the handoff phrasing there.
for (const sk of ['research', 'ideation', 'plan', 'review', 'execute']) {
  assert(
    !read(pluginRoot + '/skills/kaola-workflow-' + sk + '/SKILL.md').includes('contractor'),
    'GitLab ' + sk + ' skill must be contractor-free (script-owned per #457/#458)'
  );
}
assert(
  !read(pluginRoot + '/skills/kaola-workflow-fast/SKILL.md').includes('delegated to the contractor'),
  'GitLab fast skill must not delegate mechanics to the contractor (script-owned per #456)'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('mr|pr)'),
  'GitLab finalize skill must dispatch canonical mr sink plus pr compatibility alias'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('--keep-worktree') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('metadata captured before archive'),
  'GitLab finalize skill must capture sink metadata before archive and preserve worktree for the final commit'
);
// #475: the consumer (non-npm) finalize gate prose (final-validation.md) must not drift out of the SKILL.
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('final-validation.md') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('final_validation_unverified'),
  'GitLab finalize skill must document the consumer (non-npm) final-validation.md gate (#475)'
);
// #653: the consumer candidate binding (validated_candidate_hash) must reach BOTH consumer-recording
// surfaces — the plan-run All-done consumer block and the finalize gate prose.
assert(
  read(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md').includes('validated_candidate_hash') &&
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('validated_candidate_hash'),
  'GitLab plan-run + finalize skills must document the consumer validated_candidate_hash binding (#653)'
);
// n5 (#653 finding D): selection-evidence docking must reach the router (command + SKILL); the
// observed_gap_unseeded refusal and run-gap manual-seed prose must reach finalize/plan-run.
assert(
  read(pluginRoot + '/commands/workflow-next.md').includes('selection-evidence') &&
  read(pluginRoot + '/skills/kaola-workflow-next/SKILL.md').includes('selection-evidence'),
  'GitLab next command + skill must document selection-evidence docking (#653)'
);
assert(
  read(pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md').includes('observed_gap_unseeded'),
  'GitLab finalize skill must document the observed_gap_unseeded refusal (#653)'
);
assert(
  read(pluginRoot + '/commands/kaola-workflow-plan-run.md').includes('run-gaps-manual.md') &&
  read(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md').includes('run-gaps-manual.md'),
  'GitLab plan-run command + skill must document the run-gap manual-seed rule (#653)'
);
// #336: keep-open partial-close sink lane — command + skill must carry the durable field, the
// sink-merge flag, and the merge-sink-only refusal prose (the exit-3 in-arm BLOCKED guard's only
// mechanical enforcement).
for (const f of ['/commands/kaola-workflow-finalize.md', '/skills/kaola-workflow-finalize/SKILL.md']) {
  assert(
    read(pluginRoot + f).includes('issue_action') &&
    read(pluginRoot + f).includes('--keep-issue-open') &&
    read(pluginRoot + f).includes('merge-sink-only'),
    'GitLab ' + f + ' must document the keep-open partial-close lane (issue_action, --keep-issue-open, merge-sink-only)'
  );
}
// #345: the adaptive four-gate merge barrier in the Finalization COMMAND must resolve the
// validator via the kaola_script resolver — a bare `node scripts/…` path is MODULE_NOT_FOUND
// in a consumer plugin install (no ./scripts dir), turning the only blocking pre-merge
// enforcement into a false BLOCK. (The finalize SKILL already used a find-fallback.)
{
  const finalizeCmd = read(pluginRoot + '/commands/kaola-workflow-finalize.md');
  assert(
    finalizeCmd.includes('VALIDATOR="$(kaola_script kaola-gitlab-workflow-plan-validator.js)"') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --resume-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --gate-verify') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --barrier-check') &&
    finalizeCmd.includes('node "$VALIDATOR" "$PLAN" --verdict-check') &&
    !finalizeCmd.includes('node scripts/kaola-gitlab-workflow-plan-validator.js "$PLAN" --resume-check'),
    'GitLab Finalization command must resolve the four-gate barrier validator via kaola_script (no bare scripts/ path) — #345'
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
  'GitLab finalize skill must carry the adaptive prerequisite block (workflow_path: adaptive + the four-gate validator_script barrier) — #624'
);
for (const skill of listFiles(pluginRoot + '/skills', file => file.endsWith('SKILL.md'))) {
  assert(!read(skill).includes("*/kaola-workflow/*/scripts/kaola-gitlab"), skill + ' must use the GitLab Codex plugin cache path');
}

// Issue #77: typed-acknowledgement delegation gate — GitLab skills
const gitlabSkillsBase = `${pluginRoot}/skills`;
const delegationNegativeChecks = [
  [`${gitlabSkillsBase}/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research'],
  [`${gitlabSkillsBase}/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis'],
  [`${gitlabSkillsBase}/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint'],
  [`${gitlabSkillsBase}/kaola-workflow-execute/SKILL.md`, 'when subagents are available'],
  [`${gitlabSkillsBase}/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor'],
  [`${gitlabSkillsBase}/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally'],
  [`${gitlabSkillsBase}/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally'],
  [`${gitlabSkillsBase}/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs'],
];
for (const [file, needle] of delegationNegativeChecks) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}
const gitlabDelegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
  'kaola-workflow-fast',
];
for (const skill of gitlabDelegationSkills) {
  const skillFile = `${gitlabSkillsBase}/${skill}/SKILL.md`;
  assert(read(skillFile).includes('subagent-invoked'), skillFile + ' must include: subagent-invoked');
  assert(read(skillFile).includes('local-fallback-explicit'), skillFile + ' must include: local-fallback-explicit');
  assert(read(skillFile).includes('local-fallback-tool-unavailable'), skillFile + ' must include: local-fallback-tool-unavailable');
}
assert(
  read(`${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`).includes('extract and reassign `delegation_policy:` alongside `phase` and `next_skill`'),
  'GitLab next skill must explicitly resume delegation_policy alongside phase and next_skill'
);
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const gitlabNext210 = `${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`;
assert(!read(gitlabNext210).includes('Ask the user once at startup'), gitlabNext210 + ' must not prompt for a delegation policy at startup');
assert(!read(gitlabNext210).includes('How should delegation be handled'), gitlabNext210 + ' must not present a delegation menu');
assert(read(gitlabNext210).includes('Codex subagent delegation is the default.'), gitlabNext210 + ' must declare delegation the default');
assert(read(gitlabNext210).includes('The default `delegation_policy` is `delegate`'), gitlabNext210 + ' must default delegation_policy to delegate');
assert(read(gitlabNext210).includes('KAOLA_DELEGATION_POLICY=delegate'), gitlabNext210 + ' must set KAOLA_DELEGATION_POLICY=delegate');
assert(read(gitlabNext210).includes('.codex/agents/kaola-workflow/'), gitlabNext210 + ' must name the role-profile detection path');
// #598 AC3: the delegation probe must also accept a global profile install — keep the
// project-local needle above GREEN (add, never remove) and pin the global path alongside it.
assert(read(gitlabNext210).includes('~/.codex/agents/kaola-workflow/'), gitlabNext210 + ' must name the global role-profile detection path');
assert(read(gitlabNext210).includes('record `local-fallback-tool-unavailable` with a non-empty Evidence value'), gitlabNext210 + ' must record auto-detected tool-unavailable as evidence');
assert(read(gitlabNext210).includes('only when the user explicitly'), gitlabNext210 + ' must gate local-authorized behind explicit user request');
assert(read(gitlabNext210).includes('default `delegation_policy` to `delegate` without prompting'), gitlabNext210 + ' must default delegate on resume without prompting');
// Issue #174: GitLab next skill parity gaps
const gitlabNextSkill = `${gitlabSkillsBase}/kaola-workflow-next/SKILL.md`;
assertNotIncludes(gitlabNextSkill, 'PICK_NEXT_PROJECT');
assertIncludes(gitlabNextSkill, 'KAOLA_VERDICT=');
assertIncludes(gitlabNextSkill, 'KAOLA_REASONING=');
assertIncludes(gitlabNextSkill, 'target_unverified');
assertIncludes(gitlabNextSkill, 'Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING');
assertIncludes(gitlabNextSkill, 'kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md');
assertBefore(gitlabNextSkill, '### Co-active Folders Advisory', '## Routing');
// Issue #190: M1 — Codex fast-path routing parity (RED guard)
assertIncludes(gitlabNextSkill, 'Startup Step 0a-1');
assertIncludes(gitlabNextSkill, 'Branch: {branch from Sink block');
// #538: the status-report `Workflow path:` line now leads with adaptive-by-default (fast|full only
// on an explicit escape) — the old `{fast|full` menu framing retired with the path switch.
assertIncludes(gitlabNextSkill, 'Workflow path: {adaptive by default');
assertIncludes(gitlabNextSkill, 'Parallel decision: {green|yellow|red');
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  const skillFile = `${gitlabSkillsBase}/${skill}/SKILL.md`;
  assert(
    read(skillFile).includes('Plain `invoked` is intentional for non-Codex-role workflow gates'),
    skillFile + ' must explain intentional non-Codex-role invoked rows'
  );
}

// Issue #91: delegation_policy must be checked against GitLab phase compliance ledgers.
const gitlabRepairState = require('./kaola-gitlab-workflow-repair-state.js');
assert(
  typeof gitlabRepairState.delegationPolicyCompliance === 'function',
  'kaola-gitlab-workflow-repair-state.js must export delegationPolicyCompliance'
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
  const result = gitlabRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = gitlabRepairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['documentation docking', 'invoked', '.cache/doc-docking.md', '']
], 'delegated GitLab Codex role row with a non-role workflow gate');
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

const gitlabInitSkill = `${gitlabSkillsBase}/kaola-workflow-init/SKILL.md`;
assertNotIncludes(gitlabInitSkill, 'Do not create or edit CLAUDE.md');
assertIncludes(gitlabInitSkill, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes(gitlabInitSkill, 'plugin_root="plugins/kaola-workflow-gitlab"');
assert(
  !/plugin_root="plugins\/kaola-workflow"(?!-)/.test(read(gitlabInitSkill)),
  gitlabInitSkill + ' must not contain bare plugin_root="plugins/kaola-workflow" (without -gitlab suffix)'
);
assertIncludes(gitlabInitSkill, "*/kaola-workflow-gitlab/*/scripts/install-codex-agent-profiles.js");
assert(
  !/\*\/kaola-workflow\/\*\/scripts\/install-codex-agent-profiles\.js/.test(read(gitlabInitSkill)),
  gitlabInitSkill + ' must not contain bare */kaola-workflow/* find path (without -gitlab suffix)'
);
// #571: global-default regression locks — pin primary install is --global; forbid retired per-repo mandate.
assertIncludes(gitlabInitSkill, 'install-codex-agent-profiles.js" --global');
assert(
  !/install-codex-agent-profiles\.js"?\s+"\$PWD"/.test(read(gitlabInitSkill)),
  gitlabInitSkill + ' must not mandate a per-repo "$PWD" agent install (#571)'
);
assertConcept(gitlabInitSkill, 'GitLab init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  // #572: the injected block now re-grounds durable state on the adaptive plan, not phase files.
  'workflow-plan.md',
  '## Node Ledger',
  '.cache/{node-id}.md'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'GitLab missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'GitLab atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  'updated: issue-'
]);
// #389 (#353/#354 completion): the plan-validator --freeze writer (plan_hash stamp + mid-run repair
// re-freeze carrying the ## Node Ledger) and the adaptive-handoff workflow-state Planning Evidence
// writer route through the crash-safe atomic replace.
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-plan-validator.js`, 'writeFileAtomicReplace(planPath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-adaptive-handoff.js`, 'writeFileAtomicReplace(fpath');
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, "sub === 'validate-remote'");
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'function validateRemote');
assertIncludes(`${pluginRoot}/scripts/kaola-gitlab-workflow-roadmap.js`, 'cmdValidateRemote');
assertIncludes(`${pluginRoot}/scripts/test-gitlab-workflow-scripts.js`, 'testGitLabRoadmapValidateRemote');
// #401 Part 1: the forge plan-validator refusal-matrix anchor must remain wired into the suite.
assertIncludes(`${pluginRoot}/scripts/test-gitlab-workflow-scripts.js`, 'testGitlabPlanValidatorRefusalMatrix401');

// GitLab forge pair CLAUDE.md template must be byte-identical
const gitlabCmdTemplate = extractClaudeTemplate(`${pluginRoot}/commands/workflow-init.md`);
const gitlabSkillTemplate = extractClaudeTemplate(gitlabInitSkill);
assert(gitlabCmdTemplate === gitlabSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitLab forge pair');

// #606: the Claude dispatch-posture config-audit line must be present in the GitLab workflow-init
// command, outside the KW-CLAUDE-TEMPLATE region.
assertIncludes(`${pluginRoot}/commands/workflow-init.md`, 'claude_dispatch_posture: teams | classic');

for (const file of listFiles(pluginRoot + '/scripts', file =>
  file.endsWith('.js') && !file.endsWith('validate-kaola-workflow-gitlab-contracts.js')
)) {
  const text = read(file);
  const nonCommentText = text.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
  assert(!/\bgh\b/.test(nonCommentText), file + ' must not execute or mention gh');
  assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
}

const pkg = parseJson('package.json');
assert(!String(pkg.scripts['test:kaola-workflow:gitlab']).includes('pending #58'), 'GitLab test script must not be placeholder');

assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'watch-mr');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'bootstrap');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'if (OFFLINE) { output({ watched: 0, offline: true }); return; }');

assertConcept(pluginRoot + '/scripts/test-gitlab-workflow-scripts.js', 'GitLab stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);

// issue #198: fast-path widening — eligibility/hatch/review contract (GitLab parity)
const fastCmd198 = pluginRoot + '/commands/kaola-workflow-fast.md';
const fastSkill198 = pluginRoot + '/skills/kaola-workflow-fast/SKILL.md';
for (const fastFile198 of [fastCmd198, fastSkill198]) {
  assertIncludes(fastFile198, 'mechanical');
  assertIncludes(fastFile198, '≤ 5');
  assertIncludes(fastFile198, 'design choice');
  assertIncludes(fastFile198, 'approach_ambiguity');
  assertIncludes(fastFile198, 'declared write set');
  assertIncludes(fastFile198, 'absolute backstop of 6');
  assertIncludes(fastFile198, '`code-reviewer` is mandatory');
}
assertNotIncludes(fastCmd198, 'two closely related files');
assertNotIncludes(fastCmd198, '≤ 2');
assertNotIncludes(fastSkill198, '(≤ 2)');
assertNotIncludes(fastSkill198, '> 2 files');
// issue #207: fast-overlap parity (GitLab) — Scope declares a `- Write Set:` line
// and the classifier reads that fast-summary.md Scope section.
for (const fastFile207 of [fastCmd198, fastSkill198]) assertIncludes(fastFile207, '- Write Set:');
const classifier207 = pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js';
assertIncludes(classifier207, 'fast-summary.md');
assertIncludes(classifier207, 'sectionBody(');
assertIncludes(classifier207, "'Scope'");
const nextCmd198 = pluginRoot + '/commands/workflow-next.md';
const nextSkill198 = pluginRoot + '/skills/kaola-workflow-next/SKILL.md';
for (const nextFile198 of [nextCmd198, nextSkill198]) {
  // #538: the fast-path eligibility rubric (`mechanical` / `≤ 5` / `design choice`) was Branch-A
  // content of the next router and is DELETED with Branch A (adaptive is the unconditional default).
  // The rubric concept stays machine-enforced on its correct surface — the fast cmd + SKILL (L593-595
  // above) — so dropping the next-router pins loses zero coverage; the negative-assert stays.
  assertNotIncludes(nextFile198, '≤ 2 closely related files');
}

// issue #203: Select-Project active-folder definition must list fast-summary.md
// (follow-up to #201). Assertion A is the Select-Project drift-guard; Assertion B
// is a regression lock for the #201 reconstruction ladder (already present).
const nextCmd203 = pluginRoot + '/commands/workflow-next.md';
assertIncludes(nextCmd203, '`fast-summary.md` file, or a `workflow-state.md`');
assertIncludes(nextCmd203, 'fast-summary.md exists -> /kaola-workflow-fast');

// issue #222: fast-path mid-flight escalation routing fix — GitLab parity
for (const fastFile222 of [fastCmd198, fastSkill198]) {
  assertIncludes(fastFile222, 'workflow_path: full');
  assertIncludes(fastFile222, 'next_command: /kaola-workflow-phase1 {project}');
  assertIncludes(fastFile222, 'next_skill: kaola-workflow-research {project}');
  assertIncludes(fastFile222, 'status `ESCALATED` → escalation already committed');
}
assertBefore(nextCmd203, 'fast-summary.md status ESCALATED -> /kaola-workflow-phase1', 'fast-summary.md exists -> /kaola-workflow-fast');
assertIncludes(nextSkill198, 'fast-summary.md status ESCALATED -> kaola-workflow-research');

// issue #227: adaptive-path contract (GitLab fork command prose + renamed scripts).
assert(exists(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js'), 'GitLab adaptive plan validator missing');
assert(exists(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js'), 'GitLab adaptive schema module missing');
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
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'disjointWriteSets');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'readPlanNodes');
// #463 Slice 6 (AC11): token-pin the three write-overlap governance anchors (synthesizer reasoning floor,
// policy field, PROTECTED set) in the GitLab edition tree.
assertIncludes(pluginRoot + '/scripts/kaola-workflow-resolve-agent-model.js', 'REASONING_FLOOR_ROLES');
assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js', 'WRITE_OVERLAP_POLICY_LEGAL');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'PROTECTED_BASENAMES');
// #492: pin the shared write-set classification anchors so a forge classifier port (a forge-specific
// SUPERSET, not a rename-normalized copy) cannot silently DROP a shared function. Body parity of the
// shared logic is verified out-of-band (legitimate forge divergence in areaForPath's own-plugin path).
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'areaForPath');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'SHARED_INFRA');
// #538: the named-but-not-installed-path refusal renamed `workflow_path_refused` -> `path_not_installed`.
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'path_not_installed');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'routeAdaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'enable_adaptive');
assertNotIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js', 'enable_adaptive');
// #343: mid-gate reopen fold + orphan guard must be carried by the GitLab adaptive-node port
// (not byte-checked by validate-script-sync; this pin is the anti-drift guard).
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', 'would_orphan_in_progress');

// #338: anti-drift pins — finalize sink row main-session-direct + contractor self-attest back-fill.
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', 'main-session-direct');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-direct');
// #360: script-owned consent-halt clear (clear-halt subcommand) replaces the contractor lockstep.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'clear-halt');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', "subcommand === 'clear-halt'");
for (const token of ['review-attempts.json', 'review_failed', 'lifecycle_settled',
  'repair_requires_replan', 'repair_limit_reached', "'--attempt-id'", 'uniqueMaximalReviewProducer']) {
  assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', token);
}
for (const token of ['evaluateEffectiveVerdict', 'canonicalLogicalGateIdentity', 'validateReviewJournal']) {
  assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js', token);
}
// #683: the candidate-partition repair proof (P1-P5) + the append-only rebind ledger. These are the
// fail-closed refusals that replace a whole-plan DISCARD when two gates fail simultaneously; a port that
// silently drops one re-opens the dead-end.
for (const token of ['candidate_residue_changed', 'candidate_slice_changed', 'candidate_delta_unattributed',
  'rebind_base_rewrite_unsafe', 'rebind_limit_reached', 'rebind_replay_diverged',
  'review_journal_schema_upgrade_required', 'effectiveProducerBinding', 'buildSyntheticBase',
  'proveRebindAdmissible', 'reconcilePendingRebind', 'REVIEW_REPAIR_LIMIT']) {
  assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', token);
}
for (const token of ['candidate_declared', 'candidate_residue_digest', 'review_journal_rebind_malformed',
  'review_journal_rebind_chain_invalid', 'REVIEW_REBIND_LIMIT', 'effectiveCandidate']) {
  assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js', token);
}
// #344: every adaptive lifecycle call is `node "$KAOLA_SCRIPTS/…"`; $KAOLA_SCRIPTS must be
// DEFINED via the kaola_script() resolver before its first use — undefined in a consumer install.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'kaola_script(){');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitlab-workflow-adaptive-node.js)")"');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', '--attest-contractor-spawn');
// #347: the planner self-attest back-fill flag must be ported to the forge claim (the #280 producer
// was canonical-only while #300 ported its consumer — without this pin the asymmetry is invisible).
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', '--attest-planner-spawn');
// the planner startup surfaces themselves must instruct the flag, not just the producer script.
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', '--attest-planner-spawn');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', '--attest-planner-spawn');
// #359: producer-attested evidence-token vocabulary in the forge agent profiles.
assertIncludes(pluginRoot + '/agents/implementer.toml', 'verification_tier');
assertIncludes(pluginRoot + '/agents/tdd-guide.toml', 'non-empty column-0 `RED:`');
assertIncludes(pluginRoot + '/agents/contractor.toml', '--attest-contractor-spawn');
// #634: producer-attested evidence-token vocabulary in the metric-optimizer forge agent profile.
assertIncludes(pluginRoot + '/agents/metric-optimizer.toml', 'iterations_used');

// Codex 0.144 durable-result wall. Every DAG node profile writes its complete result directly to
// the exact seeded cache path, including roles that are logically read-only. Workflow-planner and
// contractor run outside the Node Ledger, so their canonical workflow artifacts are the durable
// full result (and they mirror into a seeded cache when supplied). Every parent-facing return is compact.
{
  const orchestrationRoles = new Set(['contractor', 'workflow-planner']);
  const roleTomls = agentFiles
    .map(file => path.basename(file, '.toml'))
    .sort();
  for (const role of roleTomls) {
    const tomlText = read(pluginRoot + '/agents/' + role + '.toml');
    assert(/FULL/i.test(tomlText) && /compact orchestrator summary/i.test(tomlText),
      'GitLab agents/' + role + '.toml must carry the full-result + compact-summary contract');
    if (orchestrationRoles.has(role)) {
      assert(/durable full result/i.test(tomlText),
        'GitLab agents/' + role + '.toml must name its canonical durable full result');
    } else {
      assert(tomlText.includes('dispatch.evidence_file') && tomlText.includes('evidence-binding'),
        'GitLab agents/' + role + '.toml must carry the seeded full-cache binding contract');
    }
  }
}

// #445/#446: operator_hint + route-findings + --summary pins (GitLab forge ports).
// OPERATOR_HINT_REGISTRY must exist in each aggregator (plan-validator, commit-node,
// adaptive-node). route-findings and --summary are adaptive-node-only (#446).
for (const aggregatorScript of [
  pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js',
  pluginRoot + '/scripts/kaola-gitlab-workflow-commit-node.js',
  pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js'
]) {
  assertIncludes(aggregatorScript, 'OPERATOR_HINT_REGISTRY');
}
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', "'route-findings'");
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-adaptive-node.js', "'--summary'");
// test-gitlab-workflow-scripts.js must exercise operator_hint + route-findings + --summary.
assertIncludes(pluginRoot + '/scripts/test-gitlab-workflow-scripts.js', 'testGitlabAdaptiveNodeOperatorHint445');

// #340: registration-surface + forge-port parity checks and their authoring/dispatch prose
// (GitLab edition surfaces). A dropped token reds this chain at the contract-validator step.
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js', 'agent-registration gap');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js', 'forge-port ordering gap');
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
  assertIncludes(planRunSurface, '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model}, effort {effort})');
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
for (const planRunSurface of [pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', pluginRoot + '/commands/kaola-workflow-plan-run.md']) {
  assertIncludes(planRunSurface, "dispatch card's frozen `wait_budget_minutes` value and source are authoritative");
  assertIncludes(planRunSurface, '`planner_override` may extend but never shorten');
  assertIncludes(planRunSurface, 'must not interrupt or re-nudge before that floor expires');
  assertIncludes(planRunSurface, 'complete governed deliverable');
}
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'planner_override');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'difficulty alone is not evidence');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'never inflate a budget to hide a wedged agent');

// #606: teammate-mode dispatch subsection — Claude-runtime block, command surface only.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', "spawn each node's role agent as a NAMED teammate");
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'send EXACTLY ONE request for the deliverable, then wait');
// #611: fork_turns:"none" unconditional mandate — Codex-dispatch block, SKILL surface only.
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'on EVERY role dispatch');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'the unconditional mandate applies identically to this dispatch mode');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'not a valid path for tiered nodes');

// #603: the Codex startup surfaces (kaola-workflow-next / kaola-workflow-adapt) must detect the
// dispatch mode via the preflight doctor and thread it into the claim as an explicit flag.
assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', 'Codex Dispatch Mode Detection');
assertIncludes(pluginRoot + '/skills/kaola-workflow-next/SKILL.md', '--codex-dispatch-mode');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', '--codex-dispatch-mode');
// Current Codex adapter: all known role profiles inherit the parent-session runtime pair.
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'fork_turns: "none"');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'parent-equals-child inheritance proof');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'installed profile path');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'Codex 0.144 durable-result override');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'dispatch.codex_profile_mode');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'Omit both `model`');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'model: dispatch.codex_model');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'reasoning_effort: dispatch.codex_reasoning_effort');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_tier_unresolved');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_profile_tier_mismatch');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'codex_profile_runtime_mismatch');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'parent-equals-child inheritance proof');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', '`sonnet`/absent');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'declarative reasoning/wait-budget metadata');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'child inherits the current parent session');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'declarative tier metadata');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'child inherits the current parent session');
assertNotIncludes(pluginRoot + '/agents/workflow-planner.toml', 'codex_profile_tier_mismatch');

// #334: the non-delegable main-session-gate role token + its G3 freeze gate + authoring/dispatch
// prose, pinned in the GitLab edition surfaces (port validator, plan-run command, planner TOML).
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-plan-validator.js', 'G3: main-session-gate');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'main-session-gate');
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'main-session-gate');

// #607: gate instrumentation is provisioned upstream, never authored by the gate itself — pinned
// on the GitLab edition planner TOML and its kaola-workflow-adapt SKILL (md↔toml parity for the
// TOML twin is separately enforced by the shared test-agent-profile-parity.js FEATURE_TOKENS).
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'the gate never authors or deletes files');
assertIncludes(pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md', 'the gate never authors or deletes files');

// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (GitLab edition — .toml bodies). Removing the emission section from
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
// #281: frontier-unit semantics in GitLab plan-run command (added by plan-run-semantics node)
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit');
// #281: efficient-DAG instruction in GitLab workflow-planner profile (added by planner-profile node)
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'EFFICIENT DAGs');

// #341: forge-neutral agent-profile authoring guidance pinned (planner toml + plan-run command).
assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'forge-neutral');
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', '--forbidden-only');

// issue #332: source agent-profile schema wall (AC2). require() THIS tree's own
// installer copy (require.main guard means require() never runs main()) and assert its
// source-tree validator passes for the GitLab plugin tree — every agents/*.toml has a
// matching non-empty top-level `name`, a description, valid nickname_candidates, inherited
// runtime-key omission, declarative tier metadata, non-blank developer_instructions, every config_file resolves, and every toml is referenced by
// exactly one [agents.*] entry (catches the issue-scout class of omission forever).
const gitlabInstaller = require('./install-codex-agent-profiles.js');
const gitlabProfiles = gitlabInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(gitlabProfiles.ok,
  'GitLab source agent profiles fail schema validation:\n  - ' + gitlabProfiles.errors.join('\n  - '));
for (const role of gitlabProfiles.roles) {
  assertIncludes(pluginRoot + '/agents/' + role + '.toml', 'FULL');
  assertIncludes(pluginRoot + '/agents/' + role + '.toml', 'compact orchestrator summary');
  if (gitlabInstaller.CODEX_ORCHESTRATION_ROLES.includes(role)) {
    assertIncludes(pluginRoot + '/agents/' + role + '.toml', 'durable full result');
  } else {
    assertIncludes(pluginRoot + '/agents/' + role + '.toml', 'dispatch.evidence_file');
    assertIncludes(pluginRoot + '/agents/' + role + '.toml', 'evidence-binding');
  }
}
const gitlabSchema = require('./kaola-workflow-adaptive-schema.js');
const gitlabPreflight = require('./kaola-workflow-codex-preflight.js');
const sortGitlabPolicy = values => [...values].sort();
assert(JSON.stringify(sortGitlabPolicy(gitlabInstaller.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sortGitlabPolicy(gitlabSchema.CODEX_PINNED_STANDARD_ROLES)),
  'GitLab installer role-metadata policy must match adaptive schema');
assert(JSON.stringify(sortGitlabPolicy(gitlabInstaller.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sortGitlabPolicy(gitlabSchema.CODEX_PINNED_REASONING_ROLES)),
  'GitLab installer reasoning-role policy must match adaptive schema');
assert(JSON.stringify(sortGitlabPolicy(gitlabPreflight.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sortGitlabPolicy(gitlabSchema.CODEX_PINNED_STANDARD_ROLES)),
  'GitLab preflight role-metadata policy must match adaptive schema');
assert(JSON.stringify(sortGitlabPolicy(gitlabPreflight.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sortGitlabPolicy(gitlabSchema.CODEX_PINNED_REASONING_ROLES)),
  'GitLab preflight reasoning-role policy must match adaptive schema');
assert(gitlabInstaller.CODEX_STANDARD_MODEL === 'gpt-5.6-sol'
    && gitlabInstaller.CODEX_STANDARD_EFFORT === 'medium'
    && gitlabPreflight.CODEX_STANDARD_MODEL === gitlabInstaller.CODEX_STANDARD_MODEL
    && gitlabPreflight.CODEX_STANDARD_EFFORT === gitlabInstaller.CODEX_STANDARD_EFFORT,
  'GitLab installer/preflight historical standard migration pair must be gpt-5.6-sol/medium');
assert(gitlabInstaller.CODEX_REASONING_MODEL === 'gpt-5.6-sol'
    && gitlabInstaller.CODEX_REASONING_EFFORT === 'xhigh'
    && gitlabPreflight.CODEX_REASONING_MODEL === gitlabInstaller.CODEX_REASONING_MODEL
    && gitlabPreflight.CODEX_REASONING_EFFORT === gitlabInstaller.CODEX_REASONING_EFFORT,
  'GitLab installer/preflight historical reasoning migration pair must be gpt-5.6-sol/xhigh');
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
    'GitLab ' + relPath + ' must be byte-identical to the codex (plugins/kaola-workflow/) copy');
}
assertByteParity('config/agents.toml');
for (const tomlFile of fs.readdirSync(path.join(root, pluginRoot, 'agents')).filter(f => f.endsWith('.toml')).sort()) {
  assertByteParity(path.join('agents', tomlFile));
}

// #400: registry-driven route-reachability contract (the forge-codex dead zone). The schema emits
// kaola-workflow-plan-run / kaola-workflow-adapt as resume/route targets and the forge claim.js
// routes adaptive unconditionally — but the forge skills/ tree shipped neither SKILL, so the route
// resolved to nothing. require() the schema route constants (no hand-listed drift) + the static
// next_skill fallbacks gitlab claim.js prints, and assert each resolves to an installed
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
  // run-start notice + the consent-halt escalation on both the GitLab command and SKILL mirror.
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
  for (const role of ['code-reviewer', 'adversarial-verifier']) {
    const entry = sourceCheck.entries.find(candidate => candidate.role === role);
    assert(entry && entry.profileContract && entry.profileContract.behavior_contract_version === 2,
      pluginRoot + ' must expose reviewer contract version 2 for ' + role);
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
  assert(installManifest.supportScripts('gitlab').includes('kaola-workflow-validation-runner.js'),
    'manual edition install must ship the deterministic validation runner');

  const schema = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
  for (const name of ['deriveGateMode', 'buildReviewContext', 'validateReviewEvidenceBinding',
    'reduceReviewReceipts', 'compareValidationObligations', 'validateReviewJournalV2']) {
    assert(typeof schema[name] === 'function', pluginRoot + ' adaptive schema must export ' + name);
  }
  const planValidator = require(path.join(root, pluginRoot, 'scripts',
    'kaola-gitlab-workflow-plan-validator.js'));
  for (const name of ['resolvePlanContract', 'buildPlanView', 'validateSchema2ReviewPlan',
    'verifyVerdictBlock']) {
    assert(typeof planValidator[name] === 'function', pluginRoot + ' plan validator must export ' + name);
  }

  for (const file of [
    pluginRoot + '/commands/kaola-workflow-adapt.md',
    pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md',
    pluginRoot + '/agents/workflow-planner.toml',
  ]) assertIncludes(file, '<!-- PIN: reviewer-contract-v2-authoring -->');
  for (const file of [
    pluginRoot + '/commands/kaola-workflow-plan-run.md',
    pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md',
  ]) assertIncludes(file, '<!-- PIN: reviewer-contract-v2-execution -->');
  for (const file of [
    pluginRoot + '/commands/kaola-workflow-finalize.md',
    pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md',
  ]) assertIncludes(file, '<!-- PIN: reviewer-contract-v2-finalization -->');
}

// #505 ITEM 1: pin the FOREIGN_ARCHIVE staging guard in the GitLab finalize command so a silent
// drop (the #294 fail-open class) turns this chain RED. Pins own edition's file only.
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'FOREIGN_ARCHIVE=$(git diff --cached');
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', 'BLOCKED: a foreign project\'s archive band is staged');
assertIncludes(pluginRoot + '/commands/kaola-workflow-finalize.md', '## Staging Guard');

// #505 ITEM 3: forge shared-function-presence guard. The hand-ported claim/sink-merge/classifier/
// roadmap/repair-state ports must carry the shared top-level functions that define the data layer.
// Pinning by function name (the #492 assertIncludes approach) means a silent DROP turns chain RED.
// Each validator pins its OWN edition's ports only.
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'closeIssueIdempotent');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'buildBranchName');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'checkDispatchAttestations');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'isSharedInfra');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'isProtected');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-classifier.js', 'readPlanNodes');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'isAdaptiveWorkflowState');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'adaptiveStateValid');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-repair-state.js', 'isSafeName');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-roadmap.js', 'readRoadmapIssues');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-roadmap.js', 'roadmapDir');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-sink-merge.js', 'deriveMemberSet');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-sink-merge.js', 'readStateIssueNumbers');
assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-sink-merge.js', 'probeIssueClosed');

// Re-plan edition contract: require the renamed port, execute its refusal path, prove planner
// attestation is mandatory, and verify the manual installer exposes the same executable name.
{
  const scriptsDir = path.join(root, pluginRoot, 'scripts');
  const replanName = 'kaola-gitlab-workflow-replan.js';
  const replanPath = path.join(scriptsDir, replanName);
  const schema = require(path.join(scriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const replan = require(replanPath);
  const handoff = require(path.join(scriptsDir, 'kaola-gitlab-workflow-adaptive-handoff.js'));
  const adaptiveNode = require(path.join(scriptsDir, 'kaola-gitlab-workflow-adaptive-node.js'));

  const cli = require('child_process').spawnSync(process.execPath,
    [replanPath, 'status', '--project', 'n5-missing-gitlab-project', '--json'],
    { cwd: root, encoding: 'utf8' });
  const cliResult = JSON.parse(String(cli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  assert(cli.status !== 0 && cliResult.reason === 'replan_authority_path_invalid',
    'GitLab renamed re-plan CLI must execute the typed missing-authority refusal');
  assert(JSON.stringify(schema.REPLAN_PHASES) === JSON.stringify([
    'prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed',
  ]) && JSON.stringify(schema.REPLAN_STATUSES) === JSON.stringify([
    'none', 'in_progress', 'candidate_changed', 'consent_halt',
  ]) && JSON.stringify(schema.REPLAN_CAS_SEAMS) === JSON.stringify([
    'prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation',
  ]), 'GitLab schema must expose the canonical re-plan phases/statuses/CAS seams');

  const childPath = path.join(require('os').tmpdir(), 'kw-n5-gitlab-attestation', 'workflow-plan.next.md');
  let writes = 0;
  const unattested = handoff.runReplanHandoff({
    childPath, childContent: 'planner draft\n', transactionId: 'a'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: 'a'.repeat(64), child_path: childPath,
      child_digest: schema.sha256Hex(Buffer.from('planner draft\n')), dispatch_nonce: 'dispatch-n5',
    },
    expected: { child_path: childPath, planner_binding: 'dispatch-n5' },
    writeFile: () => { writes++; },
  });
  assert(unattested.reason === 'replan_child_authority_unverified' && writes === 0,
    'GitLab child handoff must refuse missing planner attestation before writing');
  assert(typeof replan.buildPlannerPacket === 'function' && typeof replan.verifyAllEpochSnapshots === 'function',
    'GitLab re-plan port must expose planner packet and recursive snapshot behavior');

  const orientation = adaptiveNode.replanOrientation({
    reason: 'replan_in_progress', phase: 'planner_pending', transaction_id: 'a'.repeat(64),
    legal_mutation: 'replan resume', transaction: {
      transaction_id: 'a'.repeat(64), phase: 'planner_pending', parent: { plan_hash: 'b'.repeat(64) },
      child: {}, cas: {},
    },
  }, 'issue-n5-contract');
  assert(orientation.resume_command ===
    'node scripts/kaola-gitlab-workflow-replan.js resume --project issue-n5-contract --json',
  'GitLab orientation must expose only the renamed edition-local resume command');

  const closure = require(path.join(scriptsDir, 'kaola-workflow-closure-contract.js'));
  assert((closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('preserved')
      && (closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('failed')
      && closure.CLOSURE_INVARIANTS.some(row => row.id === 'epoch-lineage-preserved'),
  'GitLab closure contract must preserve the recursive epoch-lineage receipt');

  for (const file of [
    pluginRoot + '/commands/kaola-workflow-plan-run.md', pluginRoot + '/commands/kaola-workflow-adapt.md',
    pluginRoot + '/commands/kaola-workflow-finalize.md', pluginRoot + '/commands/workflow-next.md',
    pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', pluginRoot + '/skills/kaola-workflow-adapt/SKILL.md',
    pluginRoot + '/skills/kaola-workflow-finalize/SKILL.md', pluginRoot + '/skills/kaola-workflow-next/SKILL.md',
  ]) {
    const match = /(?:^|\n)## In-progress re-plan control plane\s*\n([\s\S]*?)(?=\n## |$)/.exec(read(file));
    assert(match && match[1].includes(replanName) && match[1].includes('resume --project {project} --json')
        && match[1].includes('workflow-plan.next.md') && match[1].includes('replan-planner-attestation.json'),
    file + ' must route the renamed GitLab re-plan transaction');
    for (const forbiddenRoute of ['kaola-workflow-claim.js discard --project',
      'discard+restart a fresh adaptive run', 'auto-takeover', 'approval gate']) {
      assert(!match[1].includes(forbiddenRoute), file + ' must not expose ' + forbiddenRoute + ' during re-plan');
    }
  }

  const tempHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kw-n5-gitlab-install-'));
  try {
    const installed = require('child_process').spawnSync('bash', [path.join(root, 'install.sh'),
      '--yes', '--no-settings-merge', '--forge=gitlab'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
    });
    assert(installed.status === 0, 'GitLab installer must ship the renamed re-plan aggregator: ' + installed.stderr);
    const installedScript = path.join(tempHome, '.claude', 'kaola-workflow-gitlab', 'scripts', replanName);
    assert(fs.existsSync(installedScript) && (fs.statSync(installedScript).mode & 0o111) !== 0,
      'installed GitLab re-plan aggregator must be present and executable');
    const installedCli = require('child_process').spawnSync(process.execPath,
      [installedScript, 'status', '--project', 'n5-missing-gitlab-project', '--json'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome } });
    const installedResult = JSON.parse(String(installedCli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
    assert(installedCli.status !== 0 && installedResult.reason === 'replan_authority_path_invalid',
      'installed GitLab re-plan aggregator must execute its typed refusal contract');
  } finally { fs.rmSync(tempHome, { recursive: true, force: true }); }
}

// PROVENANCE_BAN: GitLab prompt surfaces (agents/*.toml, commands/*.md, skills/*/SKILL.md) must
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

console.log('Kaola-Workflow GitLab contract validation passed');
