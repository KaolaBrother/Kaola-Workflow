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
  ['KAOLA', 'SESSION', 'ID'].join('_'),
  // #372: retired advisor-gate vocabulary (concat-built; no literal in this source).
  ['Advisor', 'Gate'].join(' '),
  ['advisor', 'ideation', 'gate'].join(' '),
  ['advisor', 'plan', 'gate'].join(' '),
  ['advisor', 'critical', 'gate'].join(' '),
  ['closure', 'advisor', 'gate'].join(' ')
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
  'kaola-workflow-finalize',
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
// #287: planner-first control boundary pinned across all editions
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'planner_control_boundary_violation');

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
// #598 AC3: the delegation probe must also accept a global profile install — keep the
// project-local needle above GREEN (add, never remove) and pin the global path alongside it.
assertIncludes(nextSkill210, '~/.codex/agents/kaola-workflow/');
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
// the status-report `Workflow path:` line reports the adaptive workflow path (a
// non-adaptive KAOLA_PATH is refused by the claim's path_not_installed).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Workflow path: {adaptive; a non-adaptive KAOLA_PATH is refused');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Parallel decision: {green|yellow|red');
// issue #207: fast-overlap parity (Codex) — trap-2 tolerant keep. The fast/full SKILLs are retired,
// but the Codex classifier port RETAINS its defensive fast-summary.md `## Scope` reader (readers
// ignore the now-legacy artifact; only the write side was removed). Pin the retained reader.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'fast-summary.md');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'sectionBody(');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, "'Scope'");
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Active folder lifecycle');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Do not create or edit CLAUDE.md');
// #571: global-default regression locks — pin primary install is --global; forbid retired per-repo mandate.
const initSkill = `${pluginRoot}/skills/kaola-workflow-init/SKILL.md`;
assertIncludes(initSkill, 'install-codex-agent-profiles.js" --global');
assert(
  !/install-codex-agent-profiles\.js"?\s+"\$PWD"/.test(read(initSkill)),
  initSkill + ' must not mandate a per-repo "$PWD" agent install (#571)'
);
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Documentation Docking');
// #475: pin the consumer (non-npm) finalize gate prose so the dual-mode concept cannot drift out of the SKILL.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'final-validation.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'final_validation_unverified');
// #653: the consumer candidate binding (validated_candidate_hash) must reach BOTH consumer-recording
// surfaces — the plan-run All-done consumer block and the finalize gate prose.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'validated_candidate_hash');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'validated_candidate_hash');
// n5 (#653 finding D): selection-evidence docking must reach the next SKILL; the
// observed_gap_unseeded refusal and run-gap manual-seed prose must reach the finalize/plan-run SKILLs.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'selection-evidence');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'observed_gap_unseeded');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'run-gaps-manual.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'SINK_STATE_FILE="kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-worktree');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'metadata captured before archive');
// #336: keep-open partial-close sink lane (codex SKILL.md is the contractor seam — no command file).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'issue_action');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-issue-open');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'merge-sink-only');
// #277 M3: contractor-dispatch HANDLE lock (Codex edition). Codex has no command file — the
// finalize SKILL.md is the contractor seam. The node-4 rewrite made the contractor the SOLE HOME
// of the mechanical finalization and requires the session to delegate it (inline only on a logged
// local-fallback-tool-unavailable escape). Lock the delegation clause so the seam cannot drift back
// to inline-by-preference.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'The `contractor` Codex agent role is the SOLE HOME of this procedure and the session MUST delegate it');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'local-fallback-tool-unavailable');

// Issue #77: typed-acknowledgement delegation gate — remove ungated fallback language (the
// research/ideation/plan/execute/review/fast SKILLs are retired; only surviving gate SKILLs remain).
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs');

// Issue #77: typed-acknowledgement delegation gate — require new status vocabulary in the surviving
// delegation SKILLs (finalize + next).
const delegationSkills = [
  'kaola-workflow-finalize',
  'kaola-workflow-next',
];
for (const skill of delegationSkills) {
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'subagent-invoked');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-explicit');
  assertIncludes(`${pluginRoot}/skills/${skill}/SKILL.md`, 'local-fallback-tool-unavailable');
}
for (const skill of ['kaola-workflow-finalize']) {
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
  // #372: a NON-Codex-role workflow gate row carrying plain `invoked` (delegationPolicyCompliance
  // ignores non-role rows). Was the retired 'advisor ideation gate'; now a surviving non-role gate.
  ['documentation docking', 'invoked', '.cache/doc-docking.md', '']
], 'delegated Codex role row with a non-role workflow gate');
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
assertPolicyAllowed('tool-unavailable', [
  ['code-reviewer', 'subagent-invoked', '.cache/code-reviewer.md', '']
], 'mandatory named reviewer invocation under legacy tool-unavailable policy');
assertPolicyBlocked('tool-unavailable', [
  ['code-explorer', 'subagent-invoked', '.cache/code-explorer.md', '']
], 'ordinary subagent row under tool-unavailable policy');
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
  `${pluginRoot}/scripts/kaola-workflow-sink-pr.js`
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'archiveProjectDir');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'if (require.main === module)');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'mainRootFromCoord');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "stdio: ['ignore', 'ignore', 'ignore']");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, "'workflow_path: ' + workflowPath");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'removeLegacyStateBlocks');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'readActiveFolders');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'kw:claim\\s+(project|sess)=');
// #463 Slice 6 (AC11): token-pin the three write-overlap governance anchors (synthesizer reasoning floor,
// policy field, PROTECTED set) in the Codex plugin tree.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-resolve-agent-model.js`, 'REASONING_FLOOR_ROLES');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-schema.js`, 'WRITE_OVERLAP_POLICY_LEGAL');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'PROTECTED_BASENAMES');
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
  '.cache/'
]);
assertConcept(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Codex init durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  // #572: the injected block now re-grounds durable state on the adaptive plan, not phase files.
  'workflow-plan.md',
  '## Node Ledger',
  '.cache/{node-id}.md'
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
// #389 (#353/#354 completion): the plan-validator --freeze writer (plan_hash stamp + mid-run repair
// re-freeze carrying the ## Node Ledger) and the adaptive-handoff workflow-state Planning Evidence
// writer route through the crash-safe atomic replace.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'writeFileAtomicReplace(planPath');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-handoff.js`, 'writeFileAtomicReplace(fpath');

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

// #572 (AC4): the injected ## Kaola-Workflow template must be re-grounded on the adaptive
// DAG-of-roles model — NO retired 6-phase-as-default vocabulary may survive in the consumer
// block. #538 made adaptive the unconditional default, so a numbered `Phase <n>` token or the
// "phase file/artifact" durable-state framing in the injected block teaches a retired model.
// Ban both across every forge's extracted template (the consumer-facing region only — the
// surrounding command/skill prose may still say "six-phase opt-in path" etc.).
const PHASE_NUMBER_BAN = /Phase\s+\d/;                  // "Phase 1" … "Phase 4"
const PHASE_FILE_BAN = /phase file|phase artifact/i;   // "phase files" / "current phase file"
for (const file of initFiles) {
  const tpl = extractClaudeTemplate(file);
  assert(!PHASE_NUMBER_BAN.test(tpl),
    file + ': injected ## Kaola-Workflow template must not teach a numbered Phase <n> model (#572 — adaptive is the unconditional default)');
  assert(!PHASE_FILE_BAN.test(tpl),
    file + ': injected ## Kaola-Workflow template must not use "phase file/artifact" durable-state framing (#572)');
}

// #769: the two bans above are scoped to the injected consumer CLAUDE.md region, so the SHIPPED
// marketplace manifests were never inspected and carried retired six-phase copy past #538 / #572 /
// #573 / #725 / #765 unchallenged. Manifest text is the listing a user reads before installing, so
// it must describe the model the plugin actually runs: a planner authors and freezes a task-shaped
// DAG of role nodes in workflow-plan.md, then the executor runs it node-by-node via the running-set
// scheduler. Ban the retired grammar over every shipped plugin.json (Codex + forge Claude, all
// editions) and pin a positive adaptive anchor so blanked copy cannot pass the ban vacuously.
const MANIFEST_GRAMMAR_BANS = [
  [/\b(?:six|6)[-\s]?phase\b/i, 'six-phase / 6-phase'],
  [PHASE_FILE_BAN, 'phase file / phase artifact'],
  [/phase routing/i, 'phase routing'],
  [PHASE_NUMBER_BAN, 'numbered Phase <n>']
];
// listed explicitly (not globbed) so a manifest that stops shipping is a visible edit here;
// the canonical Claude edition ships commands from the repo root and has no manifest of its own.
const shippedManifests = [
  `${pluginRoot}/.codex-plugin/plugin.json`,
  'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json',
  'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json',
  `${pluginRoot}/.claude-plugin/plugin.json`,
  'plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json',
  'plugins/kaola-workflow-gitea/.claude-plugin/plugin.json'
].filter(exists);
assert(shippedManifests.length >= 5,
  '#769: expected at least 5 shipped plugin manifests to scan, found ' + shippedManifests.length);
for (const file of shippedManifests) {
  const manifestText = read(file);
  for (const [ban, label] of MANIFEST_GRAMMAR_BANS) {
    assert(!ban.test(manifestText),
      file + ': shipped plugin manifest must not advertise retired workflow grammar (' + label +
      ') — the workflow is adaptive-only (#769)');
  }
  assertConcept(file, 'the adaptive DAG-of-roles model', ['adaptive', 'DAG of role nodes']);
}

// #609: the injected ## Kaola-Workflow template must FORBID vendor-model embellishment of the
// role-routing bullets. Live sessions were authoring "planner (Opus)" into consumer CLAUDE.md
// files; a consumer block is read by EVERY runtime (Codex reads CLAUDE.md too), so a Claude model
// noun there is a first-class cross-runtime leak. The generated section must stay runtime-neutral
// (tier vocabulary), so the constraint sentence is pinned on all six workflow-init surfaces.
for (const file of initFiles) {
  assertIncludes(file, 'never by a vendor model name');
}

// #606: the Claude dispatch-posture config-audit line must be present in all three workflow-init
// COMMAND surfaces (root + gitlab + gitea) — outside the KW-CLAUDE-TEMPLATE region, so this check
// does not touch the initFiles SKILL entries (they stay byte-identical to their template blocks).
const workflowInitCommands606 = [
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  'plugins/kaola-workflow-gitea/commands/workflow-init.md',
];
for (const file of workflowInitCommands606) {
  assertIncludes(file, 'claude_dispatch_posture: teams | classic');
}

// #572 (AC5): cross-forge content parity. The three forges' injected templates must be
// byte-identical MODULO the single forge-noun line (GitHub/GitLab/Gitea issues are the roadmap
// source of truth …). The within-forge-pair byte checks above already prove cmd==skill per
// forge, so comparing the three cmd templates (normalizing the forge noun out) covers all six
// surfaces transitively — the #309 "one semantic change, mirrored verbatim" invariant.
function normalizeForgeNoun(tpl) {
  return tpl.replace(/^- (?:GitHub|GitLab|Gitea) issues are the roadmap source of truth/m,
    '- <FORGE> issues are the roadmap source of truth');
}
const githubTemplateNorm = normalizeForgeNoun(githubCmdTemplate);
assert(normalizeForgeNoun(gitlabCmdTemplate) === githubTemplateNorm,
  '#572: GitLab injected ## Kaola-Workflow template must match GitHub modulo the forge-noun line (#309)');
assert(normalizeForgeNoun(giteaCmdTemplate) === githubTemplateNorm,
  '#572: Gitea injected ## Kaola-Workflow template must match GitHub modulo the forge-noun line (#309)');

// issue #227: adaptive-path contract (Codex skills + byte-synced plugin scripts).
assert(exists(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`), 'codex adaptive plan validator missing');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-schema.js`), 'codex adaptive schema module missing');
// #538: adaptive is the UNCONDITIONAL default — there is no switch. The router SKILL honors an
// explicit `KAOLA_PATH` and the fast/full verbal escapes, else defaults to adaptive; a named-but-not-
// installed path is the claim's typed `path_not_installed` refusal (the SKILL does not read
// installed_paths — the claim front door owns that, per R2). Pin the new model's tokens.
assertConcept(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'adaptive path selection', [
  'KAOLA_PATH', 'adaptive', 'default', 'path_not_installed', 'fast', 'full'
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
for (const [surface, role, task] of [
  [`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'issue-scout', 'issue_scout'],
  [`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'workflow-planner', 'workflow_planner_<issue-or-project>']
]) {
  for (const token of ['agents.spawn_agent', `agent_type: "${role}"`, `task_name: "${task}"`,
    'fork_turns: "none"', 'isolated, self-contained control-plane brief', 'argument-shape refusal', 'exactly once']) {
    assertIncludes(surface, token);
  }
}
// #598 AC3: the adapt SKILL's delegation probe must accept a global profile install too — keep
// the project-local needle above GREEN (add, never remove) and pin the global path alongside it.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, '.codex/agents/kaola-workflow/');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, '~/.codex/agents/kaola-workflow/');
// #255: the checklist-backed handoff contract must stay enforced — the orchestrator reads the
// planner's handoff packet (it no longer runs a contractor classify/freeze chain). Lock the two
// terminal handoff statuses so the design cannot silently drift back to a pre-handoff approval gate.
// #272: token renamed from ready_to_dispatch_first_node → ready_to_run (plan-run owns node lifecycle).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'ready_to_run');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'plan_invalid');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-handoff.js`), '#255 adaptive handoff aggregator missing from Codex plugin');
assert(exists(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`), '#272 adaptive node aggregator missing from Codex plugin');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, 'would_orphan_in_progress'); // #343 mid-gate reopen
// #338: anti-drift pins — finalize sink row main-session-direct + contractor self-attest back-fill.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, 'main-session-direct');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'main-session-direct');
// #344: the Codex plan-run SKILL references $KAOLA_SCRIPTS for every lifecycle call; it must
// DEFINE KAOLA_SCRIPTS (plugin-cache find-fallback) before its first use — undefined outside
// this repo. Pin the assignment + the cache probe so removal regresses the chain.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, "-path '*/kaola-workflow/*/scripts/kaola-workflow-adaptive-node.js'");
// #360: script-owned consent-halt clear (clear-halt subcommand) replaces the contractor lockstep.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'clear-halt');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, "subcommand === 'clear-halt'");
for (const token of ['review-attempts.json', 'review_failed', 'lifecycle_settled',
  'repair_requires_replan', 'repair_limit_reached', "'--attempt-id'", 'uniqueMaximalReviewProducer']) {
  assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, token);
}
for (const token of ['evaluateEffectiveVerdict', 'canonicalLogicalGateIdentity', 'validateReviewJournal']) {
  assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-schema.js`, token);
}
// #683: the candidate-partition repair proof (P1-P5) + the append-only rebind ledger. These are the
// fail-closed refusals that replace a whole-plan DISCARD when two gates fail simultaneously; a port that
// silently drops one re-opens the dead-end.
for (const token of ['candidate_residue_changed', 'candidate_slice_changed', 'candidate_delta_unattributed',
  'rebind_base_rewrite_unsafe', 'rebind_limit_reached', 'rebind_replay_diverged',
  'review_journal_schema_upgrade_required', 'effectiveProducerBinding', 'buildSyntheticBase',
  'proveRebindAdmissible', 'reconcilePendingRebind', 'REVIEW_REPAIR_LIMIT']) {
  assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-node.js', token);
}
for (const token of ['candidate_declared', 'candidate_residue_digest', 'review_journal_rebind_malformed',
  'review_journal_rebind_chain_invalid', 'REVIEW_REBIND_LIMIT', 'effectiveCandidate']) {
  assertIncludes(pluginRoot + '/scripts/kaola-workflow-adaptive-schema.js', token);
}
// #446 (D-446-01): operator_hint registry + route-findings subcommand + --summary flag +
// findings-route.json output + VERDICT_ROLES table must be present in the Codex aggregators.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'OPERATOR_HINT_REGISTRY');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-commit-node.js`, 'OPERATOR_HINT_REGISTRY');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, 'OPERATOR_HINT_REGISTRY');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, "'route-findings'");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, "'--summary'");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, "'findings-route.json'");
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-node.js`, 'VERDICT_ROLES');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '--attest-contractor-spawn');
// #347: pin the planner self-attest back-fill flag (the #280 producer) — codex ships the canonical
// claim byte-for-byte; pinning here keeps the producer from regressing on this edition too.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '--attest-planner-spawn');
// the planner startup surfaces themselves must instruct the flag, not just the producer script.
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, '--attest-planner-spawn');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, '--attest-planner-spawn');
assertIncludes(`${pluginRoot}/agents/contractor.toml`, '--attest-contractor-spawn');
// #359: producer-attested evidence-token vocabulary in the codex agent profiles.
assertIncludes(`${pluginRoot}/agents/implementer.toml`, 'verification_tier');
assertIncludes(`${pluginRoot}/agents/tdd-guide.toml`, 'non-empty column-0 `RED:`');
// #634: producer-attested evidence-token vocabulary in the metric-optimizer Codex agent profile.
assertIncludes(`${pluginRoot}/agents/metric-optimizer.toml`, 'iterations_used');

// Codex 0.144 durable-result wall. Every DAG node profile writes its complete result directly to
// the exact seeded cache path, including roles that are logically read-only. Workflow-planner and
// contractor run outside the Node Ledger, so their canonical workflow artifacts are the durable
// full result (and they mirror into a seeded cache when supplied). Every parent-facing return is compact.
{
  const orchestrationRoles = new Set(['contractor', 'workflow-planner']);
  const roleTomls = fs.readdirSync(path.join(root, pluginRoot, 'agents'))
    .filter(file => file.endsWith('.toml'))
    .map(file => file.slice(0, -'.toml'.length))
    .sort();
  for (const role of roleTomls) {
    const tomlText = read(`${pluginRoot}/agents/${role}.toml`);
    assert(/FULL/i.test(tomlText) && /compact orchestrator summary/i.test(tomlText),
      `Codex agents/${role}.toml must carry the full-result + compact-summary contract`);
    if (orchestrationRoles.has(role)) {
      assert(/durable full result/i.test(tomlText),
        `Codex agents/${role}.toml must name its canonical durable full result`);
    } else {
      assert(tomlText.includes('dispatch.evidence_file') && tomlText.includes('evidence-binding'),
        `Codex agents/${role}.toml must carry the seeded full-cache binding contract`);
    }
  }
}
assertConcept(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'adaptive execution + governance', [
  '## Node Ledger', 'plan_hash', 'post-dominate', 'auto-run', 'provisional', 'halt for consent',
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput', 'test_thrash',
  'merge_conflict', 'synthesizer',
  // #303 anti-drift: pin the rolling-dispatch + crash-repair + opening-lifecycle primitives.
  'top-up', 'reconcile', 'opening',
  // #335 anti-drift: pin the mechanical main→worktree project-folder mirror step.
  'mirror-project'
]);
// #341: forge-neutral agent-profile authoring guidance pinned (planner toml + plan-run SKILL).
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'forge-neutral');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '--forbidden-only');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_task_name');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_dispatch_mode');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'reasoning_effort');

// #602: the canonical --summary invocation must document the dispatch-essentials one-liner it
// actually prints, the extended pre-dispatch card-acquisition rule, and the explicit
// no-improvise prohibition on every plan-run spawn.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'opened=<node-id> role=<role> task=<codex_task_name>');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, "take the dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`. Never dispatch without the card in view.");
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'Every spawn parameter comes from the dispatch card.');

// #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
// inline-fallback format, verbatim.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model}, effort {effort})');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '← {node_id} · {role} returned: {verdict or one-line outcome}');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '→ running {node_id} · {role} inline (…reason token…)');

// #605: required progress-echo line printed after every close-and-open-next.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '{node-id} → complete; opened: {next-id|—}');

// #603: the Codex startup surfaces (kaola-workflow-next / kaola-workflow-adapt) must detect the
// dispatch mode via the preflight doctor and thread it into the claim as an explicit flag.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Codex Dispatch Mode Detection');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--codex-dispatch-mode');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, '--codex-dispatch-mode');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'workflow_path: adaptive');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'disjointWriteSets');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-classifier.js`, 'readPlanNodes');
// #538: the named-but-not-installed-path refusal renamed `workflow_path_refused` -> `path_not_installed`.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'path_not_installed');
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
  // #285: pin the machine-readable verdict-block emission contract (the column-0 block
  // that --verdict-check reads at Finalization) so a Codex gate node always emits it.
  assertIncludes(reviewerBody, 'verdict: pass');
}

// issue #332: source agent-profile schema wall. require() the installer (the #325
// require.main guard means require() never runs main()) and assert its source-tree
// validator passes — every agents/*.toml has a matching non-empty top-level `name`,
// a description, valid nickname_candidates, inherited runtime-key omission plus declarative tier metadata,
// a non-blank developer_instructions, every
// config_file resolves, and every toml is referenced by exactly one [agents.*] entry.
// This is the AC2 wall: it FAILS on a tree that drifts a profile schema or leaves a
// new role file (the issue-scout class) unregistered.
const codexInstaller = require(path.join(root, pluginRoot, 'scripts', 'install-codex-agent-profiles.js'));
const codexProfiles = codexInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(codexProfiles.ok,
  'Codex source agent profiles fail schema validation:\n  - ' + codexProfiles.errors.join('\n  - '));
for (const role of codexProfiles.roles) {
  const profilePath = `${pluginRoot}/agents/${role}.toml`;
  assertIncludes(profilePath, 'FULL');
  assertIncludes(profilePath, 'compact orchestrator summary');
  if (codexInstaller.CODEX_ORCHESTRATION_ROLES.includes(role)) {
    assertIncludes(profilePath, 'durable full result');
  } else {
    assertIncludes(profilePath, 'dispatch.evidence_file');
    assertIncludes(profilePath, 'evidence-binding');
  }
}
const codexSchema = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
const codexPreflight = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js'));
const sorted = values => [...values].sort();
assert(JSON.stringify(sorted(codexInstaller.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sorted(codexSchema.CODEX_PINNED_STANDARD_ROLES)),
  'Codex installer role-metadata policy must match adaptive schema');
assert(JSON.stringify(sorted(codexInstaller.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sorted(codexSchema.CODEX_PINNED_REASONING_ROLES)),
  'Codex installer reasoning-role policy must match adaptive schema');
assert(JSON.stringify(sorted(codexPreflight.CODEX_PINNED_STANDARD_ROLES))
    === JSON.stringify(sorted(codexSchema.CODEX_PINNED_STANDARD_ROLES)),
  'Codex preflight role-metadata policy must match adaptive schema');
assert(JSON.stringify(sorted(codexPreflight.CODEX_PINNED_REASONING_ROLES))
    === JSON.stringify(sorted(codexSchema.CODEX_PINNED_REASONING_ROLES)),
  'Codex preflight reasoning-role policy must match adaptive schema');
assert(codexInstaller.CODEX_STANDARD_MODEL === 'gpt-5.6-sol'
    && codexInstaller.CODEX_STANDARD_EFFORT === 'medium'
    && codexPreflight.CODEX_STANDARD_MODEL === codexInstaller.CODEX_STANDARD_MODEL
    && codexPreflight.CODEX_STANDARD_EFFORT === codexInstaller.CODEX_STANDARD_EFFORT,
  'Codex installer/preflight historical standard migration pair must be gpt-5.6-sol/medium');
assert(codexInstaller.CODEX_REASONING_MODEL === 'gpt-5.6-sol'
    && codexInstaller.CODEX_REASONING_EFFORT === 'xhigh'
    && codexPreflight.CODEX_REASONING_MODEL === codexInstaller.CODEX_REASONING_MODEL
    && codexPreflight.CODEX_REASONING_EFFORT === codexInstaller.CODEX_REASONING_EFFORT,
  'Codex installer/preflight historical reasoning migration pair must be gpt-5.6-sol/xhigh');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-resolve-agent-model.js`, '.codex-plugin');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-resolve-agent-model.js`, 'isCodexPluginScriptDir');

// issue #332 (OWNER comment): README Codex role-catalog contract. Derive the role set from
// config/agents.toml, then pin README to it: the role-list block must equal the derived role set,
// and the retired `docs-lookup` must appear nowhere in that block. #451 retired the per-role
// reasoning-effort table, and #581 routes planner effort through per-spawn dispatch metadata instead
// of a profile matrix, so there is no effort row to pin.
function deriveCodexRoleCatalog() {
  const templateText = read(`${pluginRoot}/config/agents.toml`);
  const roles = [];
  const re = /^\[agents\.([a-z0-9-]+)\]/gm;
  let m;
  // The <role>-max variants remain retired. Base profiles inherit the parent-session runtime pair;
  // their declarative tier metadata remains separate while the catalog derives the role SET only.
  while ((m = re.exec(templateText)) !== null) {
    roles.push(m[1]);
  }
  return { roles };
}

const readmeText = read('README.md');
const { roles: catalogRoles } = deriveCodexRoleCatalog();

// Role-list block: the ```text block after the "installs Codex-native role profiles"
// sentence must contain exactly the derived role set (set equality).
const roleListAnchor = readmeText.indexOf('installs Codex-native role profiles');
assert(roleListAnchor !== -1, 'README must contain the Codex role-profile catalog anchor sentence');
const afterAnchor = readmeText.slice(roleListAnchor);
const blockMatch = afterAnchor.match(/```text\n([\s\S]*?)\n```/);
assert(blockMatch, 'README must contain the ```text role-list block after the catalog anchor');
const listedRoles = blockMatch[1].split('\n').map(s => s.trim()).filter(Boolean);
const missingFromReadme = catalogRoles.filter(r => !listedRoles.includes(r));
const extraInReadme = listedRoles.filter(r => !catalogRoles.includes(r));
assert(missingFromReadme.length === 0,
  'README role list missing roles from config/agents.toml: ' + missingFromReadme.join(', '));
assert(extraInReadme.length === 0,
  'README role list has roles not in config/agents.toml: ' + extraInReadme.join(', '));

// #451/#581: the per-role reasoning-effort table is retired (effort is per-node dispatch metadata,
// not a per-role pin), so the README no longer carries a `| Role | Reasoning effort |` table —
// there is nothing to pin here anymore.

// Retired role guard: the retired `docs-lookup` role must not be presented as an installable/active
// role inside the role-list catalog block. Documentation of docs-lookup as a *pruned/retired* file
// elsewhere in README (the durable upgrade flow) is allowed — that is the opposite of catalog drift,
// so the guard is scoped to the role-list block rather than the whole file.
assert(!blockMatch[1].includes('docs-lookup'),
  'README role catalog must not list the retired docs-lookup role');

// #340: registration-surface + forge-port parity checks and their authoring/dispatch prose
// (Codex edition surfaces). A dropped token reds this chain at the contract-validator step.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'agent-registration gap');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'forge-port ordering gap');
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'full accumulated root diff');
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'registration surface');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'full accumulated root diff');

// #340 derived parity guard (enumeration-free): the codex-dispatch config/agents.toml must register
// exactly the agent profiles present in agents/ — both directions. A profile copied without its
// [agents.<name>] table is undispatchable (the #328 issue-scout miss); a table without its profile
// dangles. Derives both sides (no hardcoded names/counts), so a future agent addition never edits it.
{
  const configNames = new Set();
  const reCfg = /^\[agents\.([a-z0-9-]+)\]/gm;
  let cm;
  while ((cm = reCfg.exec(read(`${pluginRoot}/config/agents.toml`))) !== null) configNames.add(cm[1]);
  const dirNames = new Set(
    fs.readdirSync(path.join(root, pluginRoot, 'agents'))
      .filter(f => f.endsWith('.toml'))
      .map(f => f.slice(0, -5))
  );
  const missingTables = [...dirNames].filter(n => !configNames.has(n)).sort();
  const danglingTables = [...configNames].filter(n => !dirNames.has(n)).sort();
  assert(missingTables.length === 0 && danglingTables.length === 0,
    'config/agents.toml must register exactly the agent profiles in agents/ (#340)' +
    (missingTables.length ? ' — profiles missing a [agents.*] table: ' + missingTables.join(', ') : '') +
    (danglingTables.length ? ' — [agents.*] tables with no profile: ' + danglingTables.join(', ') : ''));
}

// #451 (supersedes #405): the <role>-max xhigh effort-variant matrix is RETIRED. The per-node tier
// now drives a session reasoning-effort signal (the dispatch descriptor), so NO generated -max
// profile files and NO [agents.<role>-max] tables may survive in the source tree. Forbid both —
// a leftover -max artifact (a bad merge, a stale generator) reds this chain.
{
  const strayMaxFiles = fs.readdirSync(path.join(root, pluginRoot, 'agents'))
    .filter(f => f.endsWith('-max.toml'))
    .sort();
  assert(strayMaxFiles.length === 0,
    '#451: retired -max profile file(s) must be removed from agents/: ' + strayMaxFiles.join(', '));
  const maxTables = (read(`${pluginRoot}/config/agents.toml`).match(/^\[agents\.[a-z0-9-]+-max\]/gm) || []);
  assert(maxTables.length === 0,
    '#451: config/agents.toml must not register any [agents.<role>-max] table: ' + maxTables.join(', '));
}

// Current Codex compatibility: all known role profiles inherit the parent-session runtime pair.
// Transient per-spawn pair overrides are deliberately omitted because Codex 0.144 reloads the named
// role profile after applying them. Omission plus the profile-freshness preflight are the structural
// guarantee, so the surface documents parent-session inheritance without a runtime child probe.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'current parent session');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'Codex 0.144 durable-result override');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'fork_turns: "none"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'Omit both `model`');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'model: dispatch.codex_model');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'reasoning_effort: dispatch.codex_reasoning_effort');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_tier_unresolved');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_profile_tier_mismatch');
// Retirement lock: the runtime parent-equals-child child-JSONL probe is retired. Inherit-by-omission
// plus the profile-freshness preflight already guarantee the pair structurally, so re-proving it at
// runtime is redundant. These stay negative so a reintroduced probe fails closed here.
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_profile_runtime_mismatch');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'parent-equals-child inheritance proof');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'installed profile path');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '`sonnet`/absent');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'declarative reasoning/wait-budget metadata');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'child inherits the current parent session');
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'declarative tier metadata');
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'child inherits the current parent session');
assertNotIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'codex_profile_tier_mismatch');

// #598 AC4: gate-role degradation must surface loudly when dispatch is unavailable — pin the
// run-start notice + the consent-halt escalation on both the codex SKILL and the root Claude
// command mirror (this validator also owns the root commands/ surface for the github edition;
// see the AGENTS.md redirect + CLAUDE.md template checks above for precedent).
for (const planRunSurface of [
  `${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`,
  'commands/kaola-workflow-plan-run.md'
]) {
  assertIncludes(planRunSurface, '## Gate-Role Degradation Notice');
  assertIncludes(planRunSurface, 'an inline gate reviewing its own writer-context is no gate');
  assertIncludes(planRunSurface, 'self-issued `verdict: pass`');
  assertIncludes(planRunSurface, 'write-halt --reason consent');
}

// #611: fork_turns:"none" is now mandated for EVERY role dispatch (not only tiered nodes) — pin
// the unconditional mandate and ban the retired tiered-only qualifier on the Codex SKILL surface
// (Codex-runtime-only; this validator's Claude command surface never carries this dispatch mode).
for (const planRunSurface of [
  `${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`
]) {
  assertIncludes(planRunSurface, 'on EVERY role dispatch');
  assertIncludes(planRunSurface, 'the unconditional mandate applies identically to this dispatch mode');
  assertNotIncludes(planRunSurface, 'not a valid path for tiered nodes');
}

// #611: the Codex Join Protocol — full A-F encoding lives in the Codex SKILL pack; the root
// Claude command mirror carries the runtime-appropriate equivalent (SendMessage vocabulary).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '<!-- PIN: join-protocol -->');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'dispatch.wait_budget_minutes');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'NEVER interrupted before its wait budget expires');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'delegation_outcome');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'writerHalt');
assertIncludes('commands/kaola-workflow-plan-run.md', 'dispatch.wait_budget_minutes');
assertIncludes('commands/kaola-workflow-plan-run.md', 'Writer kill-safety');
assertIncludes('commands/kaola-workflow-plan-run.md', 'writerHalt');
assertIncludes('commands/kaola-workflow-plan-run.md', 'delegation_outcome');
for (const file of [`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'commands/kaola-workflow-plan-run.md']) {
  assertIncludes(file, "dispatch card's frozen `wait_budget_minutes` value and source are authoritative");
  assertIncludes(file, '`planner_override` may extend but never shorten');
  assertIncludes(file, 'must not interrupt or re-nudge before that floor expires');
  assertIncludes(file, 'complete governed deliverable');
}
for (const file of ['agents/workflow-planner.md', `${pluginRoot}/agents/workflow-planner.toml`]) {
  assertIncludes(file, 'planner_override');
  assertIncludes(file, 'difficulty alone is not evidence');
  assertIncludes(file, 'never inflate a budget to hide a wedged agent');
}

// #334: the non-delegable main-session-gate role token + its G3 freeze gate + authoring/dispatch
// prose, pinned in the codex copies (schema, validator, plan-run SKILL, planner TOML).
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-adaptive-schema.js`, 'MAIN_SESSION_GATE_ROLE');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-plan-validator.js`, 'G3: main-session-gate');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'main-session-gate');
assertIncludes(`${pluginRoot}/agents/workflow-planner.toml`, 'main-session-gate');

// #400: registry-driven route-reachability contract. Every route/skill target a claim/startup/resume
// receipt can emit MUST resolve to an installed surface — the Codex dead zone (#400) was the schema
// emitting kaola-workflow-plan-run / kaola-workflow-adapt to skills that did not exist on the forge
// plugins. require() the schema route constants (no hand-listed drift) + the static next_skill
// fallbacks claim.js prints, and assert each resolves to a `skills/<name>/SKILL.md` dir. A missing
// skill reds the chain with the unreachable target named.
{
  const schema = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
  // Skill targets emitted by claim.js next_skill (output()/resume): the adaptive route constants.
  // Values are emitted as `<skill> {project}`; reachability is the bare skill name. (Commands are
  // the Claude-edition surface, asserted in validate-workflow-contracts.)
  const emittedSkillTargets = [
    schema.PLAN_RUN_SKILL,
    schema.ADAPT_SKILL
  ];
  const installedSkills = new Set(
    fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => exists(`${pluginRoot}/skills/${name}/SKILL.md`))
  );
  for (const target of emittedSkillTargets) {
    assert(installedSkills.has(target),
      `#400: route-reachability — receipt-emitted skill target "${target}" has no installed ` +
      `skills/${target}/SKILL.md in ${pluginRoot} (broken route, the #400 dead zone)`);
  }
  // Content-reachability tier (catches #369/#380): an installed SKILL that mirrors a command must
  // carry the command's route/wiring tokens, or the route resolves to a hollow surface. finalize
  // SKILL must wire the bundle member-set flag (#369); next SKILL must carry the adaptive route +
  // auto-bundle restructure (#380); plan-run/adapt must carry the executor/front-end route tokens.
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'issue_numbers');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--issue-numbers');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'workflow-plan.md exists -> kaola-workflow-plan-run');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'auto-bundle');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'close-and-open-next');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`, 'kaola-workflow-plan-run');
}

// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}

// Re-plan edition contract: exercise the packaged Codex aggregator and its pure authority/fence
// seams. These assertions inspect returned behavior rather than counting labels in source text.
{
  const scriptsDir = path.join(root, pluginRoot, 'scripts');
  const replanPath = path.join(scriptsDir, 'kaola-workflow-replan.js');
  assert(fs.existsSync(replanPath), 'Codex re-plan aggregator must be packaged');

  const manifest = require(path.join(scriptsDir, 'kaola-workflow-install-manifest.js'));
  assert(JSON.stringify(manifest.supportScripts('github').filter(name => /workflow-replan\.js$/.test(name)))
      === JSON.stringify(['kaola-workflow-replan.js']),
  'Codex package manifest must resolve the canonical re-plan script name exactly once');

  const cli = require('child_process').spawnSync(process.execPath,
    [replanPath, 'status', '--project', 'n5-missing-codex-project', '--json'],
    { cwd: root, encoding: 'utf8' });
  const cliResult = JSON.parse(String(cli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  assert(cli.status !== 0 && cliResult.reason === 'replan_authority_path_invalid',
    'Codex re-plan CLI must execute and return the typed missing-authority refusal');

  const schema = require(path.join(scriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const replan = require(replanPath);
  const handoff = require(path.join(scriptsDir, 'kaola-workflow-adaptive-handoff.js'));
  const adaptiveNode = require(path.join(scriptsDir, 'kaola-workflow-adaptive-node.js'));
  assert(JSON.stringify(schema.REPLAN_PHASES) === JSON.stringify([
    'prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed',
  ]) && JSON.stringify(schema.REPLAN_STATUSES) === JSON.stringify([
    'none', 'in_progress', 'candidate_changed', 'consent_halt',
  ]) && JSON.stringify(schema.REPLAN_CAS_SEAMS) === JSON.stringify([
    'prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation',
  ]), 'Codex schema must expose the canonical re-plan phases/statuses/CAS seams');

  // R6-699-03: buildPlannerPacket reads transaction.snapshot.{authority_projection,authority_digest},
  // so the fixture transaction must carry a real projection built the way prepareReplan does (via the
  // exported buildSnapshotAuthorityProjection) and its canonical digest, not a hand-typed placeholder.
  const n5Transaction = {
    transaction_id: '8'.repeat(64), transition_reason: 'review_repair_requires_replan',
    parent: {
      claim_identity: { repository_id: 'repo', worktree_path: root },
      claim_identity_digest: '1'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      plan_epoch: 1, plan_hash: '3'.repeat(64),
      plan_digest: schema.sha256Hex(Buffer.from('n5-contract-plan')),
      task_mirror_exact_digest: schema.sha256Hex(Buffer.from('n5-contract-task-mirror')),
      ledger_digest: schema.sha256Hex(Buffer.from('n5-contract-ledger')),
      state_authority_digest: schema.sha256Hex(Buffer.from('n5-contract-state-authority')),
    },
    epoch_lineage_id: '4'.repeat(64),
    source: {
      source_attempt_ids: ['review:1'], source_reason: 'review_repair_requires_replan',
      source_evidence_digest: '5'.repeat(64), producer_slice: [], findings: [], rebind: [],
      inherited_frontier_classes: ['code'], validation_obligations: [],
      journal_digest: schema.sha256Hex(Buffer.from('n5-contract-journal')),
    },
    cas: { prepare: { candidate_digest: '6'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      inherited_frontier_digest: '7'.repeat(64) } },
    budget: {
      count_before: 0, ceiling: 2, transition_cost: 1, case_b_exemption: false,
      case_b_proof: null, consent_ledger_digest: '9'.repeat(64),
    },
    planner: { profile_identity: 'workflow-planner-replan-v1', dispatch_nonce: 'dispatch-n5' },
  };
  n5Transaction.snapshot = {
    authority_projection: replan.buildSnapshotAuthorityProjection(n5Transaction),
  };
  n5Transaction.snapshot.authority_digest = schema.sha256Canonical(n5Transaction.snapshot.authority_projection);
  const packet = replan.buildPlannerPacket({ project: 'issue-n5-contract' }, n5Transaction);
  const packetKeys = new Set();
  (function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(collect);
    for (const [key, child] of Object.entries(value)) { packetKeys.add(key); collect(child); }
  })(packet);
  for (const forbiddenKey of ['nodes', 'node_ids', 'roles', 'depends_on', 'declared_write_set',
    'write_set', 'cardinality', 'shape', 'model', 'build_order']) {
    assert(!packetKeys.has(forbiddenKey), 'planner packet must not carry orchestrator-authored DAG key: ' + forbiddenKey);
  }
  assert(packet.child_output_path === 'workflow-plan.next.md',
    'planner packet must bind the sole child-authoring path');

  const childPath = path.join(require('os').tmpdir(), 'kw-n5-codex-attestation', 'workflow-plan.next.md');
  let childWrites = 0;
  const unattested = handoff.runReplanHandoff({
    childPath, childContent: 'planner draft\n', transactionId: 'a'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: 'a'.repeat(64), child_path: childPath,
      child_digest: schema.sha256Hex(Buffer.from('planner draft\n')), dispatch_nonce: 'dispatch-n5',
    },
    expected: { child_path: childPath, planner_binding: 'dispatch-n5' },
    writeFile: () => { childWrites++; },
  });
  assert(unattested.reason === 'replan_child_authority_unverified' && childWrites === 0,
    'missing planner attestation must refuse before any child write');

  const orientation = adaptiveNode.replanOrientation({
    reason: 'replan_in_progress', phase: 'planner_pending', transaction_id: 'a'.repeat(64),
    legal_mutation: 'replan resume', transaction: {
      transaction_id: 'a'.repeat(64), phase: 'planner_pending',
      parent: { plan_hash: 'b'.repeat(64) }, child: {}, cas: {},
    },
  }, 'issue-n5-contract');
  assert(orientation.resume_command ===
    'node scripts/kaola-workflow-replan.js resume --project issue-n5-contract --json',
  'Codex orientation must expose only the canonical edition-local resume command');

  const closure = require(path.join(scriptsDir, 'kaola-workflow-closure-contract.js'));
  assert((closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('preserved')
      && (closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('failed')
      && closure.CLOSURE_INVARIANTS.some(row => row.id === 'epoch-lineage-preserved'),
  'Codex closure contract must preserve the recursive epoch-lineage receipt');

  for (const skill of ['kaola-workflow-plan-run', 'kaola-workflow-adapt',
    'kaola-workflow-finalize', 'kaola-workflow-next']) {
    const file = `${pluginRoot}/skills/${skill}/SKILL.md`;
    const text = read(file);
    const match = /(?:^|\n)## In-progress re-plan control plane\s*\n([\s\S]*?)(?=\n## |$)/.exec(text);
    assert(match && match[1].includes('kaola-workflow-replan.js')
        && match[1].includes('resume --project {project} --json')
        && match[1].includes('workflow-plan.next.md')
        && match[1].includes('replan-planner-attestation.json'),
    file + ' must route the canonical Codex re-plan transaction');
    for (const forbiddenRoute of ['kaola-workflow-claim.js discard --project',
      'discard+restart a fresh adaptive run', 'auto-takeover', 'approval gate']) {
      assert(!match[1].includes(forbiddenRoute), file + ' must not expose ' + forbiddenRoute + ' during re-plan');
    }
  }
}

// Reviewer-contract-v2 repository/install wall. Generated sources, all three Codex installer
// editions, the root/plugin-cache preflight, validation-runner distribution, and reviewer-v2
// lifecycle APIs must agree before any installed-scope compliance claim can be made.
{
  const generator = require('./generate-reviewer-profiles.js');
  const generatedErrors = generator.checkGeneratedProfiles(root);
  assert(generatedErrors.length === 0,
    'generated reviewer profiles must be current: ' + generatedErrors.join('; '));

  const editionRoots = [
    'plugins/kaola-workflow',
    'plugins/kaola-workflow-gitlab',
    'plugins/kaola-workflow-gitea',
  ];
  const installerFiles = [];
  for (const edition of editionRoots) {
    const installerFile = edition + '/scripts/install-codex-agent-profiles.js';
    installerFiles.push(read(installerFile));
    const installer = require(path.join(root, installerFile));
    const sourceCheck = installer.validateSourceProfiles(path.join(root, edition));
    assert(sourceCheck.ok, edition + ' reviewer/profile source contract failed: ' + sourceCheck.errors.join('; '));
    assert(sourceCheck.repair === null, edition + ' current source must not carry a repair command');
    for (const role of generator.ROLES) {
      const entry = sourceCheck.entries.find(candidate => candidate.role === role);
      assert(entry && entry.profileContract,
        edition + ' must expose generated reviewer identity for ' + role);
      assert(entry.profileContract.behavior_contract_version === 2,
        edition + ' must bind behavior contract version 2 for ' + role);
      assert(/^[0-9a-f]{64}$/.test(entry.profileContract.behavior_contract_hash)
        && /^[0-9a-f]{64}$/.test(entry.profileContract.resolved_profile_hash),
      edition + ' must bind behavior and resolved profile hashes for ' + role);
      assert(!/^model(?:_reasoning_effort)?\s*=/m.test(entry.sourceText),
        edition + ' reviewer profiles must inherit the parent model by omission');
    }
  }
  assert(new Set(installerFiles).size === 1,
    'all three Codex profile installers must remain byte-identical');

  const preflightFiles = [
    'scripts/kaola-workflow-codex-preflight.js',
    ...editionRoots.map(edition => edition + '/scripts/kaola-workflow-codex-preflight.js'),
  ].map(read);
  assert(new Set(preflightFiles).size === 1,
    'root and all three Codex preflights must remain byte-identical');
  assert(preflightFiles[0].includes("scope: 'repository'")
    && preflightFiles[0].includes("scope: 'plugin_cache'")
    && preflightFiles[0].includes('pluginCacheStale'),
  'Codex doctor must fail closed over repository and read-only plugin-cache profile drift');

  const runnerFiles = [
    'scripts/kaola-workflow-validation-runner.js',
    ...editionRoots.map(edition => edition + '/scripts/kaola-workflow-validation-runner.js'),
  ].map(read);
  assert(new Set(runnerFiles).size === 1,
    'canonical validation runner and all three installed copies must remain byte-identical');
  const manifest = require('./kaola-workflow-install-manifest.js');
  for (const forge of manifest.FORGES) {
    assert(manifest.supportScripts(forge).includes('kaola-workflow-validation-runner.js'),
      'install manifest must ship the validation runner for ' + forge);
  }

  for (const edition of editionRoots) {
    const schema = require(path.join(root, edition, 'scripts', 'kaola-workflow-adaptive-schema.js'));
    for (const name of ['deriveGateMode', 'buildReviewContext', 'validateReviewEvidenceBinding',
      'reduceReviewReceipts', 'compareValidationObligations', 'validateReviewJournalV2']) {
      assert(typeof schema[name] === 'function', edition + ' adaptive schema must export ' + name);
    }
  }
  for (const file of [
    `${pluginRoot}/skills/kaola-workflow-adapt/SKILL.md`,
    `${pluginRoot}/agents/workflow-planner.toml`,
  ]) assertIncludes(file, '<!-- PIN: reviewer-contract-v2-authoring -->');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`,
    '<!-- PIN: reviewer-contract-v2-execution -->');
  assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`,
    '<!-- PIN: reviewer-contract-v2-finalization -->');
}

// PROVENANCE_BAN: Codex prompt surfaces (agents/*.toml, skills/*/SKILL.md) must not embed
// issue numbers (#NNN), decision IDs (D-NNN-NN), invariant tags (INV-NN), ADR citations, or
// PR/MR/AC refs. Only the rule belongs in prompts; provenance belongs in CHANGELOG.md,
// docs/decisions/, and commit messages. Allowed: #N/#<issue>/#<n> placeholders, runtime vars
// (KAOLA_TARGET_ISSUE=N, --target-issue <N>), grey-zone audit labels (G1/G3/AC7/M4 — no #).
// See docs/conventions.md.
{
  const PROVENANCE_BAN = /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/;
  const codexAgentFiles = fs.readdirSync(path.join(root, pluginRoot, 'agents'))
    .filter(f => f.endsWith('.toml'))
    .map(f => pluginRoot + '/agents/' + f);
  const codexSkillFiles = fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => pluginRoot + '/skills/' + e.name + '/SKILL.md')
    .filter(f => exists(f));
  for (const rel of [...codexAgentFiles, ...codexSkillFiles]) {
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

// B2 model-noun purge (#609, the codex twin of #537; #610 renamed the plan vocabulary to neutral
// tier tokens with legacy aliases): Codex prompt surfaces (agents/*.toml, config/agents.toml,
// skills/*/SKILL.md) must not use Claude model NOUNS (Opus/Sonnet/haiku) as if they were this
// runtime's models ("the Opus orchestrator", "reasoning-class (Opus)", "no haiku", "opus ~= 5x
// sonnet"). Those read as nonsense on the Codex runtime, where the plan tier tokens translate at
// dispatch to a per-spawn reasoning_effort. The ONLY permitted opus/sonnet are the B1 LEGACY-ALIAS
// mentions: the closed `{opus|sonnet}` set literal (pre-#610 frozen plans), the `model: opus`/
// `model: sonnet` -> effort mapping tokens, and the `opus`/`sonnet` legacy-alias-pair notation the
// #610 rename introduced (e.g. "the legacy `opus`/`sonnet` aliases remain accepted"). Strip those,
// then any surviving opus/sonnet/haiku is a B2 leak. (Claude-edition commands/*.md legitimately
// name models and are out of scope — this validator does not scan them.)
{
  const B2_MODEL_NOUN = /\b(?:opus|sonnet|haiku)\b/i;
  const scrubB1TierTokens = line => line
    .replace(/\{opus\|sonnet\}/g, '')            // the closed model-column set literal (rank tokens)
    .replace(/model:\s*(?:opus|sonnet)\b/g, '')  // the `model: opus`/`model: sonnet` effort-map tokens
    .replace(/`opus`\/`sonnet`/g, '');            // #610: the legacy-alias-pair mention
  const b2AgentFiles = fs.readdirSync(path.join(root, pluginRoot, 'agents'))
    .filter(f => f.endsWith('.toml'))
    .map(f => pluginRoot + '/agents/' + f);
  const b2SkillFiles = fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => pluginRoot + '/skills/' + e.name + '/SKILL.md')
    .filter(f => exists(f));
  const b2Surfaces = [
    ...b2AgentFiles,
    ...(exists(`${pluginRoot}/config/agents.toml`) ? [`${pluginRoot}/config/agents.toml`] : []),
    ...b2SkillFiles
  ];
  for (const rel of b2Surfaces) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = scrubB1TierTokens(lines[i]).match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          rel + ':' + (i + 1) + ': B2 model-noun "' + m[0] + '" — a Claude model name must not appear ' +
          'as runtime-model prose on a Codex surface; use tier/effort vocabulary (only the B1 ' +
          '`{opus|sonnet}` column-token set, the `model: opus`/`model: sonnet` effort mapping, and the ' +
          '`opus`/`sonnet` legacy-alias-pair mention are allowed). See docs/conventions.md.');
      }
    }
  }
}

console.log('Kaola-Workflow Codex contract validation passed');
