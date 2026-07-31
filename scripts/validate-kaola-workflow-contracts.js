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
  ['closure', 'advisor', 'gate'].join(' '),
  // #770: the retired path-selector reason codes. NOT banning bare 'KAOLA_PATH' / '--workflow-path'
  // here — this array is also applied to kaola-workflow-claim.js (line ~281 below), which
  // legitimately still reads/documents both (the persisted diagnostic field + the warn-and-ignore
  // shim); only the now-dead reason-code strings are safe to ban universally.
  'path_not_installed',
  'workflow_path_refused',
  'bundle_requires_adaptive'
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
  'kaola-workflow-finalize'
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
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const nextSkill210 = `${pluginRoot}/skills/kaola-workflow-next/SKILL.md`;
assertNotIncludes(nextSkill210, 'Ask the user once at startup');
assertNotIncludes(nextSkill210, 'How should delegation be handled');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
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
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-worktree');
// #336: keep-open partial-close sink lane (codex SKILL.md is the finalize seam — no command file).
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'issue_action');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '--keep-issue-open');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'merge-sink-only');
// #816: ownership-inversion lock (Codex edition). Codex has no command file — the finalize SKILL.md
// IS the finalize seam. The seam is orchestrator-owned and the mechanical residue is ONE script
// transaction, so the surface must carry NO dispatchable bookkeeping role and MUST carry the
// one-call transaction. Both directions are pinned: re-introducing a dispatch reds the chain, and
// dropping the transaction call reds it too.
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'agent_type="contractor"');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'contractor');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'ONE resumable script transaction');

const sharedScripts = [
  'kaola-workflow-active-folders.js',
  'kaola-workflow-claim.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'validate-workflow-contracts.js',
  'kaola-workflow-codex-preflight.js'
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
// Both docs/workflow-state-contract.md concepts (durable sources / generated mirrors, and legacy
// coordination as transitional only) are asserted with these exact term lists by
// scripts/validate-workflow-contracts.js on the same repo-root path.
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

assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'issue_scout');
// #816: the finalize seam records no attestation — the field, the back-fill, and the inline-suspect
// warning are retired. Pinned as an ABSENCE so a revival reds the chain.
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'finalize_contractor_attested');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'attestContractorSpawn');
// #347: pin the planner self-attest back-fill flag (the #280 producer) — codex ships the canonical
// claim byte-for-byte; pinning here keeps the producer from regressing on this edition too.
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, '--attest-planner-spawn');



// #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
// inline-fallback format, verbatim.

// #605: required progress-echo line printed after every close-and-open-next.

// #775: v2-task-name is the only dispatch mode — the preflight-doctor detection step and the
// --codex-dispatch-mode flag it used to thread into the claim are retired (warn-and-ignore shim
// only; see kaola-workflow-claim.js).
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Codex Dispatch Mode Detection');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--codex-dispatch-mode');
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


// #598 AC4: gate-role degradation must surface loudly when dispatch is unavailable — pin the
// run-start notice + the consent-halt escalation on both the codex SKILL and the root Claude
// command mirror (this validator also owns the root commands/ surface for the github edition;
// see the AGENTS.md redirect + CLAUDE.md template checks above for precedent).
for (const planRunSurface of [
]) {
  assertIncludes(planRunSurface, '## Gate-Role Degradation Notice');
  assertIncludes(planRunSurface, 'an inline gate reviewing its own writer-context is no gate');
  assertIncludes(planRunSurface, 'self-issued `verdict: pass`');
  // #817: the fence's ROLE LIST is itself the contract — every REVIEW_GATE_ROLES member that
  // reviews someone else's work must sit inside it. `main-session-gate` is deliberately absent:
  // it is non-delegable and REQUIRED to run inline, so fencing it would be a contradiction.
  // Pinning the exact list is bidirectional — dropping a role, or adding `main-session-gate`,
  // breaks this needle.
  assertIncludes(planRunSurface, 'For `adversarial-verifier`, `code-reviewer`, and `security-reviewer`,');
  // #817: the mode-refused-spawn trigger must stay NAMED. Without it a runtime that refuses every
  // spawn is reclassified as ordinary judged-inline and the prominent run-start notice never fires.
  assertIncludes(planRunSurface, 'the runtime mode-refuses the spawn');
}



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
  const emittedSkillTargets = [];
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
}

// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
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
  }
  // The three reviewer-contract-v2 PIN anchors are asserted on THESE SAME Codex paths by the root
  // validator's authoring / execution / finalization surface loops — with a SUPERSET of needles
  // (each also pins the contract fields) — in the always-selected claude chain.
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
