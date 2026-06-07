#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pluginRoot = 'plugins/kaola-workflow';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  assert(missing.length === 0, file + ' must document ' + concept + '; missing: ' + missing.join(', '));
}

function parseJson(file) {
  return JSON.parse(read(file));
}

const retired = [
  ...['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers'].map(name => '.' + name),
  ['heart', 'beat'].join(''),
  ['tick', 'er'].join(''),
  ['derive', 'session'].join('-'),
  ['verify', 'startup'].join('-'),
  ['can', 'hand' + 'off'].join('-'),
  // #255: the bare 'handoff' token is no longer retired — it is the live name of the
  // adaptive planner-to-first-node handoff (kaola-workflow-adaptive-handoff.js). Only the
  // legacy session-lease 'can-handoff' compound stays retired (kept above).
  ['startup', 'receipt'].join(' '),
  ['session', 'id'].join('_'),
  ['last', 'heart' + 'beat'].join('_'),
  '## ' + 'Lease',
  ['KAOLA', 'SESSION', 'ID'].join('_')
];

const pluginJson = parseJson(`${pluginRoot}/.codex-plugin/plugin.json`);
assert(pluginJson.name === 'kaola-workflow', 'Codex plugin name must be kaola-workflow');
assert(pluginJson.skills === './skills/', 'Codex plugin must expose ./skills/');
assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'commands'), 'Codex plugin must not declare Claude commands');
assert(JSON.stringify(pluginJson).includes('Kaola-Workflow for Codex'), 'Codex plugin metadata must identify Kaola-Workflow for Codex');

const marketplace = parseJson('.agents/plugins/marketplace.json');
const entry = marketplace.plugins.find(plugin => plugin.name === 'kaola-workflow');
assert(entry && entry.source && entry.source.path === './plugins/kaola-workflow', 'marketplace must point to the local Codex plugin');

const skills = [
  'kaola-workflow-init',
  'kaola-workflow-next',
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-fast',
  'kaola-workflow-adapt',
  'kaola-workflow-plan-run'
];

for (const skill of skills) {
  const file = `${pluginRoot}/skills/${skill}/SKILL.md`;
  assert(exists(file), file + ' is missing');
  assertIncludes(file, `name: ${skill}`);
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, 'kaola-workflow/');
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'active folders');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--target-issue');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'watch-pr');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'extract and reassign `delegation_policy:` alongside `phase` and `next_skill`');
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const nextSkill210 = `${pluginRoot}/skills/kaola-workflow-next/SKILL.md`;
assertNotIncludes(nextSkill210, 'Ask the user once at startup');
assertNotIncludes(nextSkill210, 'How should delegation be handled');
assertIncludes(nextSkill210, 'Codex subagent delegation is the default.');
assertIncludes(nextSkill210, 'The default `delegation_policy` is `delegate`');
assertIncludes(nextSkill210, 'KAOLA_DELEGATION_POLICY=delegate');
assertIncludes(nextSkill210, '.codex/agents/kaola-workflow/');
assertIncludes(nextSkill210, 'record `local-fallback-tool-unavailable` with a non-empty Evidence value');
assertIncludes(nextSkill210, 'only when the user explicitly');
assertIncludes(nextSkill210, 'default `delegation_policy` to `delegate` without prompting');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'KAOLA_CLAIM="$(node -e');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ]');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$KAOLA_PROJECT" --reason git-freshness-block');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
// Issue #190: M1 — Codex fast-path routing parity (RED guard)
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Startup Step 0a-1');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Branch: {branch from Sink block');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Workflow path: {fast|full');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Parallel decision: {green|yellow|red');
// issue #203 (#201 regression lock): Codex reconstruction ladder fast-summary rung (drift-guard)
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'fast-summary.md exists -> kaola-workflow-fast');
// issue #198: fast-path widening — Codex skill parity
const fastSkill198 = `${pluginRoot}/skills/kaola-workflow-fast/SKILL.md`;
assertIncludes(fastSkill198, 'mechanical');
assertIncludes(fastSkill198, '≤ 5');
assertIncludes(fastSkill198, 'design choice');
assertIncludes(fastSkill198, 'approach_ambiguity');
assertIncludes(fastSkill198, 'declared write set');
assertIncludes(fastSkill198, 'absolute backstop of 6');
assertIncludes(fastSkill198, '`code-reviewer` is mandatory');
assertNotIncludes(fastSkill198, '(≤ 2)');
assertNotIncludes(fastSkill198, '> 2 files');
// issue #207: fast-overlap parity (Codex) — Scope declares a `- Write Set:` line
// and the classifier reads that fast-summary.md Scope section.
assertIncludes(fastSkill198, '- Write Set:');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'fast-summary.md');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'sectionBody(');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, "'Scope'");
// issue #222: fast-path mid-flight escalation routing fix — Codex skill parity
assertIncludes(fastSkill198, 'workflow_path: full');
assertIncludes(fastSkill198, 'next_command: /kaola-workflow-phase1 {project}');
assertIncludes(fastSkill198, 'next_skill: kaola-workflow-research {project}');
assertIncludes(fastSkill198, 'status `ESCALATED` → escalation already committed');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'fast-summary.md status ESCALATED -> kaola-workflow-research');
const nextSkill198 = `${pluginRoot}/skills/kaola-workflow-next/SKILL.md`;
assertIncludes(nextSkill198, 'mechanical');
assertIncludes(nextSkill198, '≤ 5');
assertIncludes(nextSkill198, 'design choice');
assertNotIncludes(nextSkill198, '≤ 2 closely related files');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Active folder lifecycle');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Do not create or edit CLAUDE.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Required Agent Compliance');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'codex review');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Documentation Docking');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-worktree');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'metadata captured before archive');
// #277 M3: contractor-dispatch HANDLE lock (Codex edition). Codex has no command file — the
// finalize SKILL.md is the contractor seam. The node-4 rewrite made the contractor the SOLE HOME
// of the mechanical finalization and requires the session to delegate it (inline only on a logged
// local-fallback-tool-unavailable escape). Lock the delegation clause so the seam cannot drift back
// to inline-by-preference.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'The `contractor` Codex agent role is the SOLE HOME of this procedure and the session MUST delegate it');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'local-fallback-tool-unavailable');

// Issue #77: typed-acknowledgement delegation gate — remove ungated fallback language
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'when subagents are available');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs');

// Issue #77: typed-acknowledgement delegation gate — require new status vocabulary in all phase skills + next
const delegationSkills = [
  'kaola-workflow-research',
  'kaola-workflow-ideation',
  'kaola-workflow-plan',
  'kaola-workflow-execute',
  'kaola-workflow-review',
  'kaola-workflow-finalize',
  'kaola-workflow-next',
  'kaola-workflow-fast',
];
for (const skill of delegationSkills) {
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'subagent-invoked');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-explicit');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-tool-unavailable');
}
for (const skill of ['kaola-workflow-ideation', 'kaola-workflow-plan', 'kaola-workflow-finalize']) {
  assertIncludes(
    `${pluginRoot}/skills/${skill}/SKILL.md`,
    'Plain `invoked` is intentional for non-Codex-role workflow gates'
  );
}

// Issue #91: delegation_policy must be checked against phase compliance ledgers.
const repairState = require('./kaola-workflow-repair-state.js');
assert(
  typeof repairState.delegationPolicyCompliance === 'function',
  'kaola-workflow-repair-state.js must export delegationPolicyCompliance'
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
  const result = repairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(result.ok, `${label} should satisfy delegation_policy ${policy}: ${result.reason || 'blocked'}`);
}

function assertPolicyBlocked(policy, rows, label) {
  const result = repairState.delegationPolicyCompliance(complianceFixture(rows), policyState(policy));
  assert(!result.ok, `${label} should violate delegation_policy ${policy}`);
}

assertPolicyAllowed('delegate', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', ''],
  ['advisor ideation gate', 'invoked', '.cache/advisor-ideation.md', '']
], 'delegated Codex role row with advisor gate');
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

const sharedScripts = [
  'kaola-workflow-active-folders.js',
  'kaola-workflow-claim.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'validate-workflow-contracts.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-workflow-task-mirror.js'
];

for (const script of sharedScripts) {
  const rootScript = `scripts/${script}`;
  const pluginScript = `${pluginRoot}/scripts/${script}`;
  assert(exists(rootScript), rootScript + ' is missing');
  assert(exists(pluginScript), pluginScript + ' is missing');
  assert(read(rootScript) === read(pluginScript), pluginScript + ' must match ' + rootScript);
}

for (const file of [
  `${pluginRoot}/scripts/kaola-workflow-active-folders.js`,
  `${pluginRoot}/scripts/kaola-workflow-claim.js`,
  `${pluginRoot}/scripts/kaola-workflow-classifier.js`,
  `${pluginRoot}/scripts/kaola-workflow-repair-state.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-merge.js`,
  `${pluginRoot}/scripts/kaola-workflow-sink-pr.js`,
  `${pluginRoot}/hooks/kaola-workflow-pre-commit.sh`
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'archiveProjectDir');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'if (require.main === module)');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'mainRootFromCoord');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "stdio: ['ignore', 'ignore', 'ignore']");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "'workflow_path: ' + workflowPath");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '/kaola-workflow-fast ');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'removeLegacyStateBlocks');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'kw:claim\\s+(project|sess)=');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-sink-merge.js`, 'readActiveFolders');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-sink-pr.js`, 'patchLockFile');

const simulate = `${pluginRoot}/scripts/simulate-kaola-workflow-walkthrough.js`;
assert(exists(simulate), simulate + ' is missing');
assertIncludes(simulate, 'Kaola-Workflow walkthrough simulation passed');
for (const token of retired) assertNotIncludes(simulate, token);

const pkg = parseJson('package.json');
const testScript = pkg && pkg.scripts && pkg.scripts.test;
assert(typeof testScript === 'string', 'package.json must have a scripts.test string');
for (const edition of ['claude', 'codex', 'gitlab', 'gitea']) {
  assert(testScript.includes(`npm run test:kaola-workflow:${edition}`), `package.json scripts.test must chain test:kaola-workflow:${edition}`);
}
assert(exists('docs/workflow-state-contract.md'), 'detailed workflow state contract doc is missing');
assert(read('CLAUDE.md').split(/\r?\n/).length < 200, 'CLAUDE.md must stay below the 200-line target');
assertConcept('CLAUDE.md', 'compact durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Codex init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  'fast-summary.md',
  '.cache/'
]);
assertConcept('docs/workflow-state-contract.md', 'durable sources and generated mirrors', [
  'durable sources',
  'kaola-workflow/.roadmap/issue-*.md',
  'workflow-state.md',
  'generated mirrors',
  'fast-summary.md'
]);
assertConcept('docs/workflow-state-contract.md', 'legacy coordination as transitional only', [
  'legacy or transitional',
  '.locks/',
  '.sessions/',
  '.tickers/',
  'not document legacy coordination folders as permanent'
]);
assertConcept('docs/api.md', 'closure contract invariants and receipt schema', [
  '## Closure Contract',
  'closure invariants',
  'roadmap_source_removed',
  'remote_issue_closed',
  'claim_label_removed',
  'kaola-workflow-closure-contract.js',
  '#162',
  '#163',
  '#164',
  '#165'
]);
assertConcept('docs/workflow-state-contract.md', 'closure contract cross-reference', [
  'closure contract'
]);
assertConcept(`${pluginRoot}/scripts/kaola-workflow-roadmap.js`, 'missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept(`${pluginRoot}/scripts/kaola-workflow-roadmap.js`, 'atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  "fs.openSync(tmp, 'wx')",
  'fs.renameSync(tmp, filePath)',
  "fs.openSync(filePath, 'wx')",
  'fs.fsyncSync(fd)'
]);

function extractRedirectBlock(file) {
  const text = read(file);
  const fenceOpen = '```markdown';
  const fenceClose = '\n```';
  let idx = 0;
  while (idx < text.length) {
    const fence = text.indexOf(fenceOpen, idx);
    if (fence === -1) break;
    const blockStart = fence + fenceOpen.length;
    const blockEnd = text.indexOf(fenceClose, blockStart);
    if (blockEnd === -1) break;
    const block = text.slice(blockStart, blockEnd + 1).trim();
    if (block.includes('# AGENTS.md') && block.includes('> **MANDATORY — READ CLAUDE.md')) {
      return block;
    }
    idx = blockEnd + fenceClose.length;
  }
  throw new Error(file + ': no AGENTS.md redirect block found (must contain # AGENTS.md and MANDATORY sentinel)');
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

// AGENTS.md redirect block must be byte-identical across all forge init files
const initFiles = [
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  'plugins/kaola-workflow-gitea/commands/workflow-init.md',
  `${pluginRoot}/skills/kaola-workflow-init/SKILL.md`,
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md'
];
const redirectBlocks = initFiles.map(f => ({ file: f, block: extractRedirectBlock(f) }));
const referenceBlock = redirectBlocks[0].block;
for (const { file, block } of redirectBlocks.slice(1)) {
  assert(block === referenceBlock,
    'AGENTS.md redirect block must be byte-identical in ' + file + ' vs ' + redirectBlocks[0].file);
}

// CLAUDE.md template must be byte-identical within each forge pair
const githubCmdTemplate = extractClaudeTemplate('commands/workflow-init.md');
const githubSkillTemplate = extractClaudeTemplate(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`);
assert(githubCmdTemplate === githubSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitHub forge pair (commands/workflow-init.md vs GitHub SKILL.md)');

const gitlabCmdTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitlab/commands/workflow-init.md');
const gitlabSkillTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md');
assert(gitlabCmdTemplate === gitlabSkillTemplate,
  'CLAUDE.md template must be byte-identical within GitLab forge pair');

const giteaCmdTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitea/commands/workflow-init.md');
const giteaSkillTemplate = extractClaudeTemplate('plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md');
assert(giteaCmdTemplate === giteaSkillTemplate,
  'CLAUDE.md template must be byte-identical within Gitea forge pair');

// issue #227: adaptive-path contract (Codex skills + byte-synced plugin scripts).
assert(exists(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`), 'codex adaptive plan validator missing');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-schema.js`), 'codex adaptive schema module missing');
assertConcept(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'adaptive path selection', [
  'KAOLA_ENABLE_ADAPTIVE', 'adaptive', 'fast|full|adaptive', 'flag-only', 'typed refusal'
]);
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'workflow-plan.md exists -> kaola-workflow-plan-run');
// v5.1.0: the adaptive front-end routing must stay enforced in the router SKILL mirror too — the
// skill routes a fresh adaptive run to the workflow-planner front end (kaola-workflow-adapt skill).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'kaola-workflow-adapt $KAOLA_TARGET_ISSUE');
assertConcept(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'adaptive authoring', [
  'workflow-plan.md', '## Nodes', 'post-dominate', 'finalize', 'FANOUT_CAP', 'plan_hash', 'typed refusal'
]);
// the adaptive front-end delegation must stay ENFORCED in the skill mirror (the v5.1.0 fix) — an
// advisory-prose skill is the exact bug that ran claim + authoring inline in the main session.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'workflow-planner');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'MUST delegate');
// #255: the checklist-backed handoff contract must stay enforced — the orchestrator reads the
// planner's handoff packet (it no longer runs a contractor classify/freeze chain). Lock the two
// terminal handoff statuses so the design cannot silently drift back to a pre-handoff approval gate.
// #272: token renamed from ready_to_dispatch_first_node → ready_to_run (plan-run owns node lifecycle).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'ready_to_run');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'plan_invalid');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-handoff.js`), '#255 adaptive handoff aggregator missing from Codex plugin');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`), '#272 adaptive node aggregator missing from Codex plugin');
// #281: parallel-batch aggregator claude-plugin copy presence
assert(exists(`${pluginRoot}/scripts/kaola-workflow-parallel-batch.js`), '#281 parallel-batch aggregator missing from Codex plugin');
assertConcept(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'adaptive execution + governance', [
  '## Node Ledger', 'plan_hash', 'post-dominate', 'auto-run', 'provisional', 'halt for consent',
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput', 'test_thrash'
]);
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'workflow_path: adaptive');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'disjointWriteSets');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'readPlanNodes');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'workflow_path_refused');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-repair-state.js`, 'routeAdaptive');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-repair-state.js`, 'enable_adaptive');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'enable_adaptive');
// #266: Codex-only compact/resume hook — no claude scripts/ copy; codex plugin tree only.
assert(exists(`${pluginRoot}/scripts/kaola-workflow-codex-compact-resume.js`), '#266 codex compact-resume hook missing from Codex plugin');

// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (Codex edition — .toml bodies). Removing the emission section from
// any of these files must fail npm test so a re-vendor or refactor cannot silently drop it.
for (const reviewerBody of [
  `${pluginRoot}/agents/code-reviewer.toml`,
  `${pluginRoot}/agents/security-reviewer.toml`,
  `${pluginRoot}/agents/adversarial-verifier.toml`
]) {
  assertIncludes(reviewerBody, 'finding: id=');
}

console.log('Kaola-Workflow Codex contract validation passed');
