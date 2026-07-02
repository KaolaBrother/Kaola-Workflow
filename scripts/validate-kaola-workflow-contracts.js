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
// #538: the status-report `Workflow path:` line now leads with adaptive-by-default (fast|full only
// on an explicit escape) — the old `{fast|full` menu framing retired with the path switch.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Workflow path: {adaptive by default');
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
// #538: the fast-path eligibility rubric (`mechanical` / `≤ 5` / `design choice`) was Branch-A
// content of the next SKILL and is DELETED with Branch A (adaptive is the unconditional default).
// The rubric concept stays machine-enforced on its correct surface — the fast SKILL (L129-131) — so
// dropping the next-SKILL pins loses zero coverage; the negative-assert below stays.
assertNotIncludes(nextSkill198, '≤ 2 closely related files');
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
assertIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Required Agent Compliance');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'codex review');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'Documentation Docking');
// #475: pin the consumer (non-npm) finalize gate prose so the dual-mode concept cannot drift out of the SKILL.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'final-validation.md');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'final_validation_unverified');
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

// Issue #77: typed-acknowledgement delegation gate — remove ungated fallback language
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-research/SKILL.md`, 'when subagents are available; otherwise perform the same read-only research');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-ideation/SKILL.md`, 'when subagents are available; otherwise perform the same strategy analysis');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan/SKILL.md`, 'when subagents are available; otherwise produce the same blueprint');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'when subagents are available');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-execute/SKILL.md`, 'Use the current Codex session as the fallback executor');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'otherwise perform a review stance locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-review/SKILL.md`, 'or perform the same security review locally');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'subagents are available; otherwise update docs');

// #459: contractor-free routing enforcement (Codex github edition). The fast (#456) and full
// Phase 1-5 + Phase 4 (#457/#458) mechanical transitions are script-owned (ADR 0004); only
// Finalization stays contractor-owned. The migrated research/ideation/plan/review/execute SKILLs
// must be fully contractor-free; the fast SKILL keeps a finalize-exception boundary note, so we
// forbid only the handoff phrasing there (not the bare word).
for (const sk of ['research', 'ideation', 'plan', 'review', 'execute']) {
  assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-${sk}/SKILL.md`, 'contractor');
}
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-fast/SKILL.md`, 'delegated to the contractor');

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
  'fast-summary.md',
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
assertIncludes(`${pluginRoot}/agents/contractor.toml`, '--attest-contractor-spawn');
// #359: producer-attested evidence-token vocabulary in the codex agent profiles.
assertIncludes(`${pluginRoot}/agents/implementer.toml`, 'verification_tier');
assertIncludes(`${pluginRoot}/agents/tdd-guide.toml`, 'literal tokens RED');
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
// a description, valid nickname_candidates, an optional model_reasoning_effort, a non-blank developer_instructions, every
// config_file resolves, and every toml is referenced by exactly one [agents.*] entry.
// This is the AC2 wall: it FAILS on a tree that drifts a profile schema or leaves a
// new role file (the issue-scout class) unregistered.
const codexInstaller = require(path.join(root, pluginRoot, 'scripts', 'install-codex-agent-profiles.js'));
const codexProfiles = codexInstaller.validateSourceProfiles(path.join(root, pluginRoot));
assert(codexProfiles.ok,
  'Codex source agent profiles fail schema validation:\n  - ' + codexProfiles.errors.join('\n  - '));

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
  // #451/#581: the <role>-max effort variants are retired (no -max tables remain). Base profiles no
  // longer carry model_reasoning_effort (it is OPTIONAL — per-node effort is a dispatch override),
  // so the catalog derives the role SET only; the README effort table is gone.
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

// #451/#582: the plan-run SKILL no longer selects a `<role>-max` variant. The per-node tier maps
// to per-spawn reasoning-effort on the dispatch descriptor (agent_type = base role; opus -> xhigh,
// sonnet -> high). Tiered dispatch must use proven override mechanics or refuse.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '`model: sonnet` -> `high`');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'fork_turns: "none"');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'reasoning_effort: dispatch.codex_reasoning_effort');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'fresh child-session effort proof');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, 'codex_effort_override_unavailable');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-plan-run/SKILL.md`, '`sonnet`/absent');

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
  // Skill targets emitted by claim.js next_skill (output()/resume): the adaptive route constants +
  // the static fast/full fallbacks. Values are emitted as `<skill> {project}`; reachability is the
  // bare skill name. (Commands are the Claude-edition surface, asserted in validate-workflow-contracts.)
  const emittedSkillTargets = [
    schema.PLAN_RUN_SKILL,
    schema.ADAPT_SKILL,
    'kaola-workflow-fast',      // isFast fallback (claim.js:520)
    'kaola-workflow-research'   // full fallback (claim.js:520)
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

console.log('Kaola-Workflow Codex contract validation passed');
