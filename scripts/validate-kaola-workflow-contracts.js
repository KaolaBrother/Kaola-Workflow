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

function executableRuntimeInstalls(text) {
  return String(text || '').split(/\r?\n/).filter(line =>
    !/^\s*#/.test(line) && (
      /^\s*(?:node|bash|sh|zsh)\s+[^\n]*(?:install(?:-all|-\w+)?[^\s"']*|install-[^\s"']+)[^\n]*--global\b/i.test(line)
      || /^\s*\.\/install-all\.sh\b/.test(line)
    ));
}

function assertPortableInit(file, requireDeclaration = true) {
  const text = read(file);
  const invocations = executableRuntimeInstalls(text);
  assert(invocations.length === 0,
    file + ': workflow-init must not execute a runtime/global installer; got '
      + JSON.stringify(invocations));
  assert(!requireDeclaration || (/does not locate, execute, install, or repair runtime\/global machinery/.test(text)
      && /runtime\/global bytes unchanged/.test(text)),
    file + ': workflow-init must state the portable repository/runtime-install boundary');
  const injected = executableRuntimeInstalls(text
    + '\nnode "$plugin_root/scripts/install-codex-agent-profiles.js" --global\n');
  assert(injected.length === 1,
    file + ': portable-init detector must reject an injected global installer invocation');
}

function assertConcept(file, concept, terms) {
  const content = norm(read(file).toLowerCase());
  const missing = terms.filter(term => !content.includes(norm(term.toLowerCase())));
  assert(missing.length === 0, file + ' must document ' + concept + '; missing: ' + missing.join(', '));
}

function assertAgentOwnedInit(file) {
  const content = read(file);
  for (const token of [
    ['kaola-workflow-project-instruction', 'templates.js'].join('-'),
    ['kaola-workflow-project', 'instructions.js'].join('-'),
    ['KW', 'AGENTS', 'MANAGED'].join('-'),
    ['KW', 'CLAUDE', 'OVERLAY', 'MANAGED'].join('-'),
  ]) assert(!content.includes(token), file + ' retains retired prompt ownership: ' + token);
  assertConcept(file, 'Agent-owned project instructions', [
    'The Agent owns the meaning and prose of project instructions',
    'repository facts',
    'Global Workflow Contract already loaded by the runtime',
    'Before changing an existing user-authored or owner-authored instruction file',
    'fresh top-level Agent/session',
  ]);
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
  // #255: the bare 'handoff' token is not retired — it is ordinary vocabulary for passing work
  // between an agent and its successor, and surfaces use it that way. Only the legacy
  // session-lease 'can-handoff' compound stays retired (kept above).
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
  // #1054 item 27 (nx-claim-is-bookkeeping): 'workflow-state.md' on kaola-workflow-next's SKILL.md
  // specifically was proven duplicate by subtraction against required-blocks.js (removing it from
  // just that file independently reds test-route-reachability's own MANIFEST presence check — see
  // .cache/implementation-validators.md). Kept for init/finalize, which required-blocks.js does not
  // obligate for this token.
  if (skill !== 'kaola-workflow-next') assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, 'kaola-workflow/');
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'active folders');
// #1054 item 27 (nx-claim-is-bookkeeping): '--target-issue' here was proven duplicate by
// subtraction against required-blocks.js — see .cache/implementation-validators.md.
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'watch-pr');
// Issue #210: Codex defaults to delegated compliance — the startup delegate-vs-inline prompt is retired.
const nextSkill210 = `${pluginRoot}/skills/kaola-workflow-next/SKILL.md`;
assertNotIncludes(nextSkill210, 'Ask the user once at startup');
assertNotIncludes(nextSkill210, 'How should delegation be handled');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--project "$PICK_NEXT_PROJECT" --reason git-freshness-block');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Active folder lifecycle');
assertAgentOwnedInit(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`);
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'READ CLAUDE.md BEFORE ANY ACTION');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-init/SKILL.md`, 'Do not create or edit CLAUDE.md');
// #1039: workflow-init is a portable repository operation. Runtime installation
// remains installer-owned and cannot execute from either init consumer.
const initSkill = `${pluginRoot}/skills/kaola-workflow-init/SKILL.md`;
assertPortableInit(initSkill);
assertPortableInit('commands/workflow-init.md', false);
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
// AGENTS.md has no line budget (ADR 0023): nothing here measures or comments on its size.
// Both docs/workflow-state-contract.md concepts (durable sources, and legacy coordination as
// transitional only) are asserted with these exact term lists by scripts/validate-workflow-contracts.js
// on the same repo-root path.
assertConcept('docs/api.md', 'closure contract invariants and receipt schema', [
  '## Closure Contract',
  'closure invariants',
  'remote_issue_closed',
  'claim_label_removed',
  'kaola-workflow-closure-contract.js',
  '#162',
  '#163',
  '#164',
  '#165'
]);
const initFiles = [
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  'plugins/kaola-workflow-gitea/commands/workflow-init.md',
  `${pluginRoot}/skills/kaola-workflow-init/SKILL.md`,
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md'
];
// Agent-owned init outcomes remain present across all six generated carriers. No carrier may
// restore the retired phase-shaped project-prompt schema.
const PHASE_NUMBER_BAN = /Phase\s+\d/;                  // "Phase 1" … "Phase 4"
const PHASE_FILE_BAN = /phase file|phase artifact/i;   // "phase files" / "current phase file"
for (const file of initFiles) {
  assertAgentOwnedInit(file);
  const content = read(file);
  assert(!PHASE_NUMBER_BAN.test(content),
    file + ': workflow-init must not teach a numbered Phase <n> project model');
  assert(!PHASE_FILE_BAN.test(content),
    file + ': workflow-init must not use phase-file/artifact durable-state framing');
}

// #769: the two bans above are scoped to the injected consumer CLAUDE.md region, so the SHIPPED
// marketplace manifests were never inspected and carried retired six-phase copy past #538 / #572 /
// #573 / #725 / #765 unchallenged. Manifest text is the listing a user reads before installing, so
// it must describe the model the plugin actually runs. Ban the retired grammar over every shipped
// plugin.json (Codex + forge Claude, all editions) and pin a positive anchor so blanked copy cannot
// pass the ban vacuously.
//
// #882: ADR 0017 (docs/decisions/0017-the-mission-list.md) retired the frozen
// task-shaped DAG of role nodes, its workflow-plan.md record, and the running-set scheduler that
// executed it node-by-node, replacing all of it with the mission list: one file per run, four fields
// per item, written and read by the orchestrator directly — no script owns it, nothing freezes. The
// positive anchor below was still requiring every manifest to advertise the retired DAG grammar, and
// the retired terms had no ban here at all, so a manifest reverting to them stayed green. Ban the
// retired grammar the same way the six-phase copy above is banned, and anchor on the model that
// actually ships.
const MANIFEST_GRAMMAR_BANS = [
  [/\b(?:six|6)[-\s]?phase\b/i, 'six-phase / 6-phase'],
  [PHASE_FILE_BAN, 'phase file / phase artifact'],
  [/phase routing/i, 'phase routing'],
  [PHASE_NUMBER_BAN, 'numbered Phase <n>'],
  [/workflow-plan\.md/i, 'workflow-plan.md'],
  [/\brole nodes?\b/i, 'role node(s)'],
  [/\bfreez(?:e|es|ing)\b/i, 'freeze / freezes / freezing'],
  [/running-set scheduler/i, 'running-set scheduler'],
  [/DAG[-\s]of[-\s]role/i, 'DAG of role nodes / DAG-of-roles']
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
  assertConcept(file, 'the adaptive mission-ledger model', ['adaptive', 'mission ledger']);
}

// #1047: runtime dispatch posture belongs to installed adapters and diagnostics, not project init.
const workflowInitCommands606 = [
  'commands/workflow-init.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-init.md',
  'plugins/kaola-workflow-gitea/commands/workflow-init.md',
];
for (const file of workflowInitCommands606) {
  assertNotIncludes(file, 'claude_dispatch_posture: teams | classic');
}

assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'issue_scout');
// #816: the finalize seam records no attestation — the field, the back-fill, and the inline-suspect
// warning are retired. Pinned as an ABSENCE so a revival reds the chain.
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'finalize_contractor_attested');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'attestContractorSpawn');
// Dispatch-log attestation is retired on BOTH seams — codex ships the canonical claim byte-for-byte,
// so pin the absence here too and a revival reds this edition's chain as well.
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'claim_planner_attested');
assertNotIncludes(`${pluginRoot}/scripts/kaola-workflow-claim.js`, 'attestPlannerSpawn');



// #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
// inline-fallback format, verbatim.

// #605: required progress-echo line printed after every close-and-open-next.

// #775: v2-task-name is the only dispatch mode — the preflight-doctor detection step and the
// --codex-dispatch-mode flag it used to thread into the claim are retired (warn-and-ignore shim
// only; see kaola-workflow-claim.js).
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'Codex Dispatch Mode Detection');
assertNotIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--codex-dispatch-mode');
// #1044: Codex compact recovery is a generated prompt artifact, not a JavaScript selector.
assert(exists(`${pluginRoot}/hooks/kaola-workflow-codex-compact-recovery.md`),
  '#1044 generated Codex compact-recovery prompt missing from plugin');
assert(!exists(`${pluginRoot}/scripts/kaola-workflow-codex-compact-resume.js`),
  '#1044 retired Codex compact-resume JavaScript must stay absent');

// issue #290/#288 + #285, REVISED for #1054 owner ruling (19:03 heartbeat): the fixed machine
// column-zero `finding: id=...` row and the `verdict: pass` receipt line are retired procedure
// ritual — #1054's role redesign bans the rigid finding-row/review_conclusion protocol from role
// bodies. The real `.cache/final-validation.md` machine consumer still needs its own verdict
// mechanism, but that is pinned where it is actually produced/consumed, not in these reviewer role
// prompts. No pin on the three reviewer `.toml` bodies' CURRENT wording replaces it: assertConcept
// is norm+includes, so it reds on an equivalent rephrasing — a new wording gate, not a behavior
// check. #1101 retired the reviewer role bodies themselves.

// #1101: Codex ships no role profile. The three plugins carry no agents/ directory and no
// config/agents.toml, the kernel carries no pinned role policy, and the preflight reports
// Kaola-owned leftovers instead of validating profiles.
const codexSchema = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
const codexPreflight = require(path.join(root, pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js'));
for (const edition of ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea']) {
  assert(!exists('plugins/' + edition + '/agents'), 'plugins/' + edition + '/agents must stay retired (#1101)');
  assert(!exists('plugins/' + edition + '/config/agents.toml'),
    'plugins/' + edition + '/config/agents.toml must stay retired (#1101)');
}
for (const retired of ['CODEX_PINNED_ROLES', 'CODEX_PINNED_MODEL', 'CODEX_PINNED_EFFORT', 'validateProfileText']) {
  assert(!(retired in codexSchema), 'the kernel must not export ' + retired + ' (#1101)');
  assert(!(retired in codexPreflight), 'the Codex preflight must not export ' + retired + ' (#1101)');
}
assert(Array.isArray(codexSchema.RETIRED_PROFILE_FILES) && codexSchema.RETIRED_PROFILE_FILES.length === 24
    && codexSchema.MANIFEST_BASENAME === '.kaola-managed-profiles.json',
  'the kernel keeps the 24-name retired profile inventory and the ownership manifest basename');
assert(codexPreflight.RETIRED_ROLE_RESIDUE_STATUS === 'retired_role_residue'
    && typeof codexPreflight.inspectRetiredRoleResidue === 'function',
  'the Codex preflight reports retired-role residue');
assertIncludes(`${pluginRoot}/scripts/kaola-workflow-resolve-agent-model.js`, 'loadCodexSessionProof');

// The dispatch contract hands model and effort to the host; the workflow policy must not turn them
// into a fixed per-spawn model/effort pair or reviewer escalation rule.
const routingSkels = [
  'templates/routing/next.skeleton.md',
  'templates/routing/finalize.skeleton.md',
];
const dispatchContract = read('templates/routing/dispatch-contract.md');
const normalizedDispatchContract = norm(dispatchContract);
const HOST_DECIDES = /let its own defaults, limits, and permissions[\s\S]*decide model, effort/i;
assert(/dispatch when it materially reduces main-context residue/i.test(normalizedDispatchContract),
  'shared dispatch contract must carry the execution-economics judgment');
assert(HOST_DECIDES.test(normalizedDispatchContract),
  'shared dispatch contract must leave model/effort selection to the host and the user');
for (const rel of routingSkels) {
  const text = read(rel);
  assert((text.match(/<!-- SLOT:runtime-dispatch-common -->/g) || []).length === 1,
    rel + ' must consume the shared dispatch contract exactly once');
  assert(!/model="\{[A-Z_]+_MODEL\}"/.test(text),
    rel + ' must not pin a workflow-owned per-spawn model placeholder');
}
for (const rel of ['commands/workflow-next.md', 'commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
  'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md']) {
  const rendered = norm(read(rel));
  assert(/dispatch when it materially reduces main-context residue/i.test(rendered),
    rel + ' must render the shared execution-economics judgment');
  assert(HOST_DECIDES.test(rendered), rel + ' must render the host-owned model-selection rule');
}

// #400: registry-driven route-reachability contract. Every route/skill target a claim/startup/resume
// receipt can emit MUST resolve to an installed surface — the Codex dead zone (#400) was the schema
// emitting kaola-workflow-plan-run / kaola-workflow-adapt to skills that did not exist on the forge
// plugins. require() the schema route constants (no hand-listed drift) and assert each resolves to a
// `skills/<name>/SKILL.md` dir. A missing skill reds the chain with the unreachable target named.
//
// The claim no longer emits an executable next-skill target. Generated skill surfaces are checked
// by their own routing/edition parity generators; workflow state remains claim/sink/liveness data.

// #1033 / #1101: runtime architecture acceptance and the native-only guard run in the
// producer-selected chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-issue-1101-native-only.js'),
    '#1101: scripts."test:kaola-workflow:claude" must run the native-only guard');
  assert(claudeChain.includes('test-runtime-agent-architecture.js'),
    '#1033: scripts."test:kaola-workflow:claude" must run runtime architecture acceptance');
}

// Installed-copy wall: the three Codex installer editions, the root and plugin preflights, and the
// validation runner stay byte-identical, and the install manifest ships the runner.
{
  const editionRoots = [
    'plugins/kaola-workflow',
    'plugins/kaola-workflow-gitlab',
    'plugins/kaola-workflow-gitea',
  ];
  const installerFiles = editionRoots.map(edition => read(edition + '/scripts/install-codex-agent-profiles.js'));
  assert(new Set(installerFiles).size === 1,
    'all three Codex installers must remain byte-identical');

  const preflightFiles = [
    'scripts/kaola-workflow-codex-preflight.js',
    ...editionRoots.map(edition => edition + '/scripts/kaola-workflow-codex-preflight.js'),
  ].map(read);
  assert(new Set(preflightFiles).size === 1,
    'root and all three Codex preflights must remain byte-identical');

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
}

// PROVENANCE_BAN: Codex prompt surfaces (skills/*/SKILL.md) must not embed
// issue numbers (#NNN), decision IDs (D-NNN-NN), invariant tags (INV-NN), ADR citations, or
// PR/MR/AC refs. Only the rule belongs in prompts; provenance belongs in CHANGELOG.md,
// docs/decisions/, and commit messages. Allowed: #N/#<issue>/#<n> placeholders, runtime vars
// (KAOLA_TARGET_ISSUE=N, --target-issue <N>), grey-zone audit labels (G1/G3/AC7/M4 — no #).
// See docs/conventions.md.
{
  const PROVENANCE_BAN = /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/;
  const codexSkillFiles = fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => pluginRoot + '/skills/' + e.name + '/SKILL.md')
    .filter(f => exists(f));
  for (const rel of codexSkillFiles) {
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
// tokens with legacy aliases): Codex prompt surfaces (skills/*/SKILL.md) must not use Claude model NOUNS (Opus/Sonnet/haiku) as if they were this
// runtime's models ("the Opus orchestrator", "reasoning-class (Opus)", "no haiku", "opus ~= 5x
// sonnet"). Those read as nonsense on the Codex runtime, where the plan tokens translate at
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
  const b2SkillFiles = fs.readdirSync(path.join(root, pluginRoot, 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => pluginRoot + '/skills/' + e.name + '/SKILL.md')
    .filter(f => exists(f));
  const b2Surfaces = [...b2SkillFiles];
  for (const rel of b2Surfaces) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = scrubB1TierTokens(lines[i]).match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          rel + ':' + (i + 1) + ': B2 model-noun "' + m[0] + '" — a Claude model name must not appear ' +
          'as runtime-model prose on a Codex surface; use capability/effort vocabulary (only the B1 ' +
          '`{opus|sonnet}` column-token set, the `model: opus`/`model: sonnet` effort mapping, and the ' +
          '`opus`/`sonnet` legacy-alias-pair mention are allowed). See docs/conventions.md.');
      }
    }
  }
}

console.log('Kaola-Workflow Codex contract validation passed');
