#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(file, needle) {
  assert(norm(read(file)).includes(norm(needle)), file + ' must include: ' + needle);
}

// #407: the per-forge install allowlist is single-sourced from the install manifest (install.sh no
// longer carries literal SUPPORT_*_NAMES arrays). A script/hook is "in the install allowlist" iff the
// manifest emits it for SOME forge. These helpers re-target the old `assertIncludes('install.sh', …)`
// registration checks onto the manifest — same intent (this script ships in a manual install), correct
// source. Also (surface-undercount close): every per-forge plugin scripts/ SHARED script must be
// emitted by the manifest for that forge, so a new edition-named port can't dangle uninstalled.
const installManifest = require('./kaola-workflow-install-manifest.js');
function manifestEmitsScript(name) {
  return installManifest.FORGES.some(f => installManifest.supportScripts(f).includes(name));
}
function manifestEmitsHook(name) {
  return installManifest.FORGES.some(f => installManifest.supportHooks(f).includes(name));
}
function assertManifestScript(name) {
  assert(manifestEmitsScript(name), 'install manifest must emit support script for some forge: ' + name);
}
function assertManifestHook(name) {
  assert(manifestEmitsHook(name), 'install manifest must emit support hook for some forge: ' + name);
}

function assertNotIncludes(file, needle) {
  assert(!read(file).includes(needle), file + ' must not include: ' + needle);
}

function assertConcept(file, concept, terms) {
  const content = norm(read(file).toLowerCase());
  const missing = terms.filter(term => !content.includes(norm(term.toLowerCase())));
  assert(missing.length === 0, file + ' must document ' + concept + '; missing: ' + missing.join(', '));
}

function assertBefore(file, first, second) {
  const content = norm(read(file));
  const nf = norm(first), ns = norm(second);
  assert(content.indexOf(nf) >= 0, file + ' must include: ' + first);
  assert(content.indexOf(ns) >= 0, file + ' must include: ' + second);
  assert(content.indexOf(nf) < content.indexOf(ns), file + ' must put ' + first + ' before ' + second);
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

function assertWorkflowPlannerPromptSelfContained(file) {
  const content = read(file);
  const block = content.match(/Agent\(\n\s+subagent_type="workflow-planner",[\s\S]*?\n\)/);
  assert(block, file + ' must contain a literal workflow-planner Agent block');
  const prompt = block[0].match(/prompt="([^"]+)"/);
  assert(prompt, file + ' workflow-planner Agent block must contain a literal prompt');
  for (const term of ['Repository root:', 'Selected issue/set/project:', 'workflow-planner',
    'agents/workflow-planner.md', 'bounded durable handoff packet']) {
    assert(prompt[1].includes(term), file + ' workflow-planner literal prompt missing: ' + term);
  }
}

// issue #211: inline section slicer derived from
// scripts/kaola-workflow-classifier.js so the validator carries no classifier
// dependency. Returns the body of a `## {heading}` section, up to the next
// h2 heading (or EOF).
//
// issue #212/#213: the boundary test is h2-only (`^##\s`) so a `#`-prefixed
// line (e.g. a shell comment) inside a fenced code block in the section body
// must NOT truncate the slice — an h1 (`# `) line cannot legally open a
// sibling section inside a `## ` body, but it can appear inside a ```bash
// fence as a comment. Stopping only at h2 keeps the whole section body
// (including any fenced `#` comments) in the compared slice, so a cross-edition
// divergence below such a comment is not masked. The classifier's sectionBody
// (scripts/kaola-workflow-classifier.js) was aligned to the same h2-only
// boundary in #213.
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  let i = 0;
  for (; i < lines.length; i++) { if (headRe.test(lines[i])) { i++; break; } }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// issue #211: extract the resume clause as an isolated 2-line unit — the line
// carrying the marker plus exactly the next line. The enclosing `## Routing`
// section is NOT compared because a forge-specific `repair_script=`/```bash line
// sits ~2 lines below and would false-flag cross-forge parity.
function resumeClausePair(content) {
  const lines = String(content || '').split('\n');
  const idx = lines.findIndex(line => line.includes('On resume, extract and reassign'));
  return idx < 0 ? '' : lines[idx] + '\n' + (lines[idx + 1] || '');
}

// issue #276: whitespace-normalize multi-word needles for reflow tolerance
function norm(s) { return String(s).replace(/\s+/g, ' '); }

if (require.main !== module) {
  module.exports = { norm, assertIncludes, assertConcept, assertBefore };
  return;
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
  ['target', 'mismatch'].join('_'),
  // #372: the retired advisor-gate vocabulary — once removed from the workflow prose it must never
  // silently return. Concat-built (per house pattern) so this validator source carries no literal.
  ['Advisor', 'Gate'].join(' '),
  ['advisor', 'ideation', 'gate'].join(' '),
  ['advisor', 'plan', 'gate'].join(' '),
  ['advisor', 'critical', 'gate'].join(' '),
  ['closure', 'advisor', 'gate'].join(' ')
];

const phaseCommands = [
  'commands/kaola-workflow-finalize.md',
  'commands/kaola-workflow-adapt.md',
  'commands/kaola-workflow-plan-run.md'
];

// #770: the retired path SELECTOR vocabulary — KAOLA_PATH/--workflow-path no longer select or
// refuse anything, and the reason codes they used to feed are gone. Scoped to these agent-facing
// prose surfaces ONLY (never the shared `retired` array): claim.js legitimately still reads
// `KAOLA_PATH` for the persisted diagnostic field and documents `--workflow-path` as an accepted
// no-op flag, and CLAUDE.md:71 still carries the pre-#770 principle text (rewritten separately).
const retiredPathSelector = ['KAOLA_PATH', ['--workflow', 'path'].join('-'), 'path_not_installed',
  'workflow_path_refused', 'bundle_requires_adaptive'];

for (const file of phaseCommands) {
  assert(exists(file), file + ' is missing');
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, '## Agent Model Badge');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
  assertNotIncludes(file, 'Agent Model Badge Contract');
  assertNotIncludes(file, 'kaola_agent_model');
  for (const token of retired) assertNotIncludes(file, token);
  for (const token of retiredPathSelector) assertNotIncludes(file, token);
}

// #486: the question-shaped / bug-shaped authoring hint must propagate to ALL SIX adapt routing
// surfaces (#400) — the 3 edition `kaola-workflow-adapt.md` commands + the 3 Codex
// `kaola-workflow-adapt/SKILL.md` packs. A drop on any surface (the 4-of-6 gap the route-reachability
// contract guards against) fails here. The hint is forge-neutral (no script names / paths / CLI), so
// the pinned tokens are byte-identical across all six. This block runs in the claude chain (and its
// byte-mirror in the codex chain), reading every edition tree, so the whole 6-surface set is enforced.
const adaptSurfaces486 = [
  'commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md',
];
for (const file of adaptSurfaces486) {
  assertIncludes(file, 'Question-shaped & bug-shaped issues');
  assertIncludes(file, 'root cause or symptom mask'); // the bug-flavor guardrail token
}

// issue-152: routed-fix Agent blocks must carry explicit model placeholders
const routedFixFiles = [
  'commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
];
for (const file of routedFixFiles) {
  assertIncludes(file, 'model="{BUILD_ERROR_RESOLVER_MODEL}"');
  assertIncludes(file, 'subagent_type="build-error-resolver"');
}
for (const file of routedFixFiles.filter(f => /phase5|finalize/.test(f))) {
  assertIncludes(file, 'model="{TDD_GUIDE_MODEL}"');
}

assert(exists('commands/workflow-next.md'), 'workflow-next command is missing');
assert(!exists('commands/kaola-workflow.md'), 'legacy kaola-workflow command must not exist');
assertIncludes('commands/workflow-next.md', 'thin router');
assertIncludes('commands/workflow-next.md', 'active folders');
assertIncludes('commands/workflow-next.md', 'watch-pr');
assertIncludes('commands/workflow-next.md', '--target-issue');
assertIncludes('commands/workflow-next.md', '## Co-active Folders');
// issue #203: Select Project active-folder definition must include fast-summary.md (drift-guard A;
// the classifier's trap-2 tolerant fast-summary.md read survives retirement, so the router's
// active-folder detection still recognizes a legacy fast-summary.md marker).
assertIncludes('commands/workflow-next.md', '`workflow-plan.md` or a `workflow-state.md`');
// #380: the issue-scout auto-bundle entry must stay REACHABLE — Step 0 branches on whether the
// user named an issue, and the no-issue-named branch dispatches the scout (regression-locks the
// #380 unreachable-entry defect). Pin the branch marker + the env-wiring contract.
assertIncludes('commands/workflow-next.md', 'Branch first on whether the user named an issue');
assertIncludes('commands/workflow-next.md', 'issue-scout');
assertIncludes('commands/workflow-next.md', 'Output → env wiring');
for (const token of retired) assertNotIncludes('commands/workflow-next.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-next.md', token);
// #372: sweep the retired advisor-gate vocabulary over workflow-init.md too (the consult-mandate
// bullet lived here, inside the byte-locked KW-CLAUDE-TEMPLATE region).
for (const token of retired) assertNotIncludes('commands/workflow-init.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-init.md', token);

// issue #207: fast-overlap parity — trap-2 tolerant keep. The fast/full command surfaces are
// retired, but the classifier RETAINS its defensive fast-summary.md `## Scope` reader (readers
// ignore the now-legacy artifact; only the write side was removed). Pin the retained reader so the
// intentional keep cannot silently drift away.
assertIncludes('scripts/kaola-workflow-classifier.js', 'fast-summary.md');
assertIncludes('scripts/kaola-workflow-classifier.js', 'sectionBody(');
assertIncludes('scripts/kaola-workflow-classifier.js', "'Scope'");

assert(exists('scripts/kaola-workflow-active-folders.js'), 'active folder reader is missing');
assert(exists('scripts/kaola-workflow-claim.js'), 'claim script is missing');
assert(exists('scripts/kaola-workflow-classifier.js'), 'classifier script is missing');
assert(exists('scripts/kaola-workflow-repair-state.js'), 'repair script is missing');
assert(exists('scripts/kaola-workflow-sink-merge.js'), 'merge sink is missing');
assert(exists('scripts/kaola-workflow-sink-pr.js'), 'PR sink is missing');
assert(!exists('scripts/kaola-workflow-session-env.js'), 'session env hook script must be removed');

assertIncludes('scripts/kaola-workflow-claim.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-claim.js', 'archiveProjectDir');
assertIncludes('scripts/kaola-workflow-claim.js', 'claimExplicitTarget');
assertIncludes('scripts/kaola-workflow-claim.js', 'if (require.main === module)');
assertIncludes('scripts/kaola-workflow-claim.js', 'worktree_path');
assertIncludes('scripts/kaola-workflow-claim.js', 'mainRootFromCoord');
assertIncludes('scripts/kaola-workflow-claim.js', "stdio: ['ignore', 'ignore', 'ignore']");
assertIncludes('scripts/kaola-workflow-claim.js', "'workflow_path: ' + workflowPath");
assertIncludes('scripts/kaola-workflow-claim.js', 'removeLegacyStateBlocks');
assertIncludes('scripts/kaola-workflow-active-folders.js', 'excludeClosedIssues');
assertIncludes('scripts/kaola-workflow-classifier.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-classifier.js', 'kw:claim\\s+(project|sess)=');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'readActiveFolders');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'updateStateSinkBlock');
assertNotIncludes('scripts/kaola-workflow-sink-pr.js', 'patchLockFile');

for (const file of [
  'scripts/kaola-workflow-claim.js',
  'scripts/kaola-workflow-active-folders.js',
  'scripts/kaola-workflow-classifier.js',
  'scripts/kaola-workflow-repair-state.js',
  'scripts/kaola-workflow-sink-merge.js',
  'scripts/kaola-workflow-sink-pr.js',
  'hooks/hooks.json',
  'install.sh',
  'README.md',
  'CLAUDE.md'
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes('hooks/hooks.json', 'compact-context');
assertNotIncludes('hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes('hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assertNotIncludes('hooks/hooks.json', 'session-env');
// #542: pin the parallel-writes DEFAULT-ON opt-OUT resolver so a future edit cannot silently drop
// the seam that lets planner-proven-disjoint write frontiers co-open as isolated legs by default
// (D-542-01).
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'function parallelWritesDefaultOn');
// #463 Slice 6 (AC11): token-pin the three write-overlap governance anchors so a future edit cannot
// silently drop the synthesizer reasoning floor, the policy field, or the PROTECTED set.
assertIncludes('scripts/kaola-workflow-resolve-agent-model.js', 'REASONING_FLOOR_ROLES');
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'WRITE_OVERLAP_POLICY_LEGAL');
assertIncludes('scripts/kaola-workflow-classifier.js', 'PROTECTED_BASENAMES');
// #492: pin the shared write-set classification anchors so a forge classifier port (a forge-specific
// SUPERSET, not a rename-normalized copy) cannot silently DROP a shared function. Body parity of the
// shared logic is verified out-of-band (legitimate forge divergence in areaForPath's own-plugin path).
assertIncludes('scripts/kaola-workflow-classifier.js', 'areaForPath');
assertIncludes('scripts/kaola-workflow-classifier.js', 'SHARED_INFRA');
assertManifestScript('kaola-workflow-active-folders.js');     // #407: was install.sh literal
assertManifestScript('kaola-workflow-resolve-agent-model.js'); // #407: was install.sh literal
assertIncludes('uninstall.sh', 'subagentStatusLine');
assertNotIncludes('install.sh', 'kaola-workflow-session-env.js');
assert(exists('scripts/kaola-workflow-resolve-agent-model.js'), 'agent model resolver is missing');
assert(!exists('scripts/kaola-workflow-subagent-statusline.js'), 'subagent status line helper must not exist');

assert(exists('docs/workflow-state-contract.md'), 'detailed workflow state contract doc is missing');
assert(read('CLAUDE.md').split(/\r?\n/).length < 200, 'CLAUDE.md must stay below the 200-line target');
assertConcept('CLAUDE.md', 'compact durable state contract', [
  'kaola-workflow/.roadmap/issue-*.md',
  'do not purge',
  'kaola-workflow/{project}/',
  'workflow-state.md',
  '.cache/'
]);
assertConcept('commands/workflow-init.md', 'generated CLAUDE durable state contract', [
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
  'kept_open',
  '#162',
  '#163',
  '#164',
  '#165'
]);
// issue #194: audit-labels/repair-labels reached GitLab/Gitea parity; the docs
// must not re-assert the stale GitHub-only claim, and must describe parity.
assertNotIncludes('docs/api.md', '(GitHub only, issue #163)');
assertNotIncludes('docs/api.md', 'subcommands are GitHub-only');
assertNotIncludes('docs/api.md', 'subcommands remain GitHub-only');
assertConcept('docs/api.md', 'audit-labels/repair-labels forge parity', [
  'audit-labels',
  'repair-labels',
  'parity',
  'kaola-gitlab-workflow-claim.js',
  'kaola-gitea-workflow-claim.js'
]);
assertConcept('docs/workflow-state-contract.md', 'closure contract cross-reference', [
  'closure contract'
]);
assertConcept('scripts/kaola-workflow-roadmap.js', 'missing roadmap source safeguard', [
  'guardAgainstMissingRoadmapSource',
  'non-empty generated ROADMAP.md',
  'kaola-workflow/.roadmap is missing'
]);
assertConcept('scripts/kaola-workflow-roadmap.js', 'atomic roadmap writes and exclusive issue source creation', [
  'writeFileAtomicReplace',
  'createFileExclusive',
  "fs.openSync(tmp, 'wx')",
  'fs.renameSync(tmp, filePath)',
  "fs.openSync(filePath, 'wx')",
  'fs.fsyncSync(fd)'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'roadmap safeguard behavior', [
  'testRoadmapGenerateMissingSourceGuard',
  'preserve existing active roadmap rows'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'roadmap concurrency regression behavior', [
  'testRoadmapGenerateAtomicReplace',
  'testRoadmapInitIssueConcurrentExclusive',
  'concurrent init-issue should create exactly one source file',
  'final-path exclusivity'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'startup and cleanup hardening regressions', [
  'testStartupJsonAndSiblingWorktrees',
  'testClassifierCurrentClaimMarkerBlocks',
  'finalize should remove legacy lease blocks before archive'
]);
assertConcept('scripts/simulate-workflow-walkthrough.js', 'stale worktree validation', [
  'testStaleWorktreeCheck',
  'testStaleWorktreeCleanup',
  'stale_worktrees',
  'stale_branches',
  'dry_run'
]);
assertIncludes('README.md', 'Active folder coordination');
assertIncludes('README.md', 'Parallel active work');
assertIncludes('README.md', 'No lease/session layer remains.');
assertConcept('README.md', 'pointer to detailed state contract', [
  'docs/workflow-state-contract.md',
  'durable-state map',
  'active artifacts include'
]);
assertIncludes('CLAUDE.md', 'active folders');
assert(exists('AGENTS.md'), 'AGENTS.md must exist at repo root (dogfood redirect)');
assertIncludes('AGENTS.md', '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');
assertIncludes('commands/workflow-init.md', '> **MANDATORY — READ CLAUDE.md BEFORE ANY ACTION THIS SESSION.**');

// #606: the Claude dispatch-posture config-audit line must be present in the root workflow-init
// command, outside the KW-CLAUDE-TEMPLATE region (in the Codex-hooks-note area).
assertIncludes('commands/workflow-init.md', 'claude_dispatch_posture: teams | classic');

// #609: the injected ## Kaola-Workflow template must forbid vendor-model embellishment of the
// role-routing bullets. Live sessions were authoring "planner (Opus)" into consumer CLAUDE.md; the
// generated section must stay runtime-neutral (tier vocabulary), never a Claude model noun. Pin the
// constraint sentence on the root Claude workflow-init surface (the codex validator pins all six).
assertIncludes('commands/workflow-init.md', 'never by a vendor model name');

// issue #283: kaola-workflow-phase6.md hard-removed; kaola-workflow-finalize.md is the
// route-agnostic terminal routine. Assert canonical present + legacy absent.
assert(!exists('commands/kaola-workflow-phase6.md'),
  'commands/kaola-workflow-phase6.md must be absent (hard-removed by #283)'); // issue #283
assert(exists('commands/kaola-workflow-finalize.md'),
  'commands/kaola-workflow-finalize.md must be present (#283 terminal routine)');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-pr.js');
assertIncludes('commands/kaola-workflow-finalize.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"');
// #475: the consumer (non-npm) finalize gate must be documented — the agent's .cache/final-validation.md
// is the gate (not a chain receipt). Pin the distinctive typed refusal so the dual-mode prose cannot drift.
assertIncludes('commands/kaola-workflow-finalize.md', 'final-validation.md');
assertIncludes('commands/kaola-workflow-finalize.md', 'final_validation_unverified');
// #653: the consumer candidate binding (validated_candidate_hash) — the plan-run All-done consumer
// block must instruct recording the hash so the verdict is bound to the exact validated tree.
assertIncludes('commands/kaola-workflow-plan-run.md', 'validated_candidate_hash');
// #277 M3: --keep-worktree procedure relocated from phase6 inline body to agents/contractor.md;
// still asserted in the dispatch prompt string inside finalize.md (pass-through reference).
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-worktree');
assertIncludes('commands/kaola-workflow-finalize.md', 'Use the sink metadata captured before Step 8b');
// #277 M3: contractor-dispatch HANDLE lock — the mechanical finalization body moved to
// agents/contractor.md; the finalize command retains only the Agent(...) dispatch handle.
assertIncludes('commands/kaola-workflow-finalize.md', 'subagent_type="contractor"');

// #336: keep-open partial-close sink lane — pin the durable field, the sink-merge flag, and the
// merge-sink-only refusal prose (the exit-3 in-arm BLOCKED guard is shell prose no walkthrough
// executes, so this pin is its only mechanical enforcement).
assertIncludes('commands/kaola-workflow-finalize.md', 'issue_action');
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-issue-open');
assertIncludes('commands/kaola-workflow-finalize.md', 'merge-sink-only');
// #345: the adaptive four-gate merge barrier (the ONLY blocking pre-merge enforcement) must
// resolve the validator via the kaola_script resolver and run all four gates. A bare
// `node scripts/kaola-workflow-plan-validator.js …` path is MODULE_NOT_FOUND in a consumer
// plugin install (no ./scripts dir) → false BLOCK at the most safety-critical seam. Pin the
// resolved invocation + each gate flag, and ban the bare path so the regression fails the chain.
assertIncludes('commands/kaola-workflow-finalize.md', 'VALIDATOR="$(kaola_script kaola-workflow-plan-validator.js)"');
assertIncludes('commands/kaola-workflow-finalize.md', 'node "$VALIDATOR" "$PLAN" --resume-check');
assertIncludes('commands/kaola-workflow-finalize.md', 'node "$VALIDATOR" "$PLAN" --gate-verify');
assertIncludes('commands/kaola-workflow-finalize.md', 'node "$VALIDATOR" "$PLAN" --barrier-check');
assertIncludes('commands/kaola-workflow-finalize.md', 'node "$VALIDATOR" "$PLAN" --verdict-check');
assertNotIncludes('commands/kaola-workflow-finalize.md', 'node scripts/kaola-workflow-plan-validator.js "$PLAN" --resume-check');
// #277 M3: assertBefore calls for 'commit -m "chore: finalize {project}"' and
// 'node "$CLAIM_JS" finalize' DROPPED — those tokens relocated to agents/contractor.md;
// cross-file ordering is not expressible via assertBefore (single-file only).

const packageJson = JSON.parse(read('package.json'));
assert(Array.isArray(packageJson.files) && packageJson.files.includes('hooks/'), 'package files must include hooks/');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('scripts/'), 'package files must include scripts/');

const rootVersion = packageJson.version;
for (const edition of ['GitHub', 'GitLab', 'Gitea']) {
  assertIncludes(
    'README.md',
    'Claude Code command install, ' + edition + ' edition: `' + rootVersion + '`'
  );
}
for (const forge of ['gitlab', 'gitea']) {
  const manifest = JSON.parse(read('plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json'));
  assert(
    manifest.version === rootVersion,
    'plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json version (' +
      manifest.version + ') must match package.json version (' + rootVersion + ')'
  );
}

const codexManifests = [
  ['kaola-workflow', 'plugins/kaola-workflow/.codex-plugin/plugin.json'],
  ['kaola-workflow-gitlab', 'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json'],
  ['kaola-workflow-gitea', 'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json'],
].map(([name, file]) => {
  const manifest = JSON.parse(read(file));
  assert(manifest.name === name, file + ' must declare name ' + name);
  assertIncludes('README.md', 'Codex `' + name + '` plugin manifest: `' + manifest.version + '`');
  return { name, file, version: manifest.version };
});
const codexBaselineVersion = codexManifests[0].version;
for (const manifest of codexManifests.slice(1)) {
  assert(
    manifest.version === codexBaselineVersion,
    manifest.file + ' version (' + manifest.version +
      ') must match plugins/kaola-workflow/.codex-plugin/plugin.json version (' +
      codexBaselineVersion + ')'
  );
}

// issue #211: cross-forge parity for the kaola-workflow-next skill. The
// `## Delegation Contract` section body and the resume clause must byte-match
// across all three editions. github is the baseline; gitlab and gitea must
// match it exactly. This guards against a forge edition silently drifting in
// delegation policy or resume-reassignment semantics.
const nextSkillEditions = [
  ['github', 'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md'],
  ['gitlab', 'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md'],
  ['gitea', 'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md'],
];
// issue #212: pre-loop over EVERY edition (including the github baseline)
// before any byte-match comparison. (a) A missing edition file must surface an
// actionable contract message instead of a raw ENOENT stack trace. (b) Each
// edition must carry exactly one `## Delegation Contract` heading — a second,
// divergent section would otherwise be silently ignored because the slicer only
// compares the first occurrence.
for (const [name, file] of nextSkillEditions) {
  assert(
    exists(file),
    file + ' (kaola-workflow-next ' + name + ' edition) is required for the issue #211/#212 ' +
      'cross-forge parity check but is missing'
  );
  const editionContent = read(file);
  assert(
    (editionContent.match(/^##\s+Delegation Contract\s*$/gm) || []).length === 1,
    file + ' must contain exactly one "## Delegation Contract" heading (issue #212); a ' +
      'duplicated or divergent second section would defeat the cross-forge parity slice'
  );
}
const [, nextSkillBaselineFile] = nextSkillEditions[0];
const nextSkillBaseline = read(nextSkillBaselineFile);
const baselineDelegationContract = sectionBody(nextSkillBaseline, 'Delegation Contract');
const baselineResumeClause = resumeClausePair(nextSkillBaseline);
assert(
  baselineDelegationContract.length > 0 && baselineResumeClause.includes('On resume'),
  nextSkillBaselineFile + ' must define a "## Delegation Contract" section and an ' +
    '"On resume, extract and reassign" clause to anchor the issue #211 cross-forge parity baseline'
);
for (const [, file] of nextSkillEditions.slice(1)) {
  const content = read(file);
  assert(
    sectionBody(content, 'Delegation Contract') === baselineDelegationContract,
    file + ' "## Delegation Contract" section must byte-match the github baseline ' +
      nextSkillBaselineFile + ' (issue #211 cross-forge parity)'
  );
  assert(
    resumeClausePair(content) === baselineResumeClause,
    file + ' resume clause ("On resume, extract and reassign" line + next line) must byte-match the ' +
      'github baseline ' + nextSkillBaselineFile + ' (issue #211 cross-forge parity)'
  );
}

assert(
  read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
  'CHANGELOG.md must contain "## [' + rootVersion + ']" heading matching package.json version (' + rootVersion + ')'
);

if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
  const tagName = 'kaola-workflow--v' + rootVersion;
  let tagPresent = false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/' + tagName],
      { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    tagPresent = true;
  } catch (_) {
    tagPresent = false;
  }
  assert(
    tagPresent,
    'Git tag "' + tagName + '" must exist for package.json version (' + rootVersion +
      '). Create it locally with: git tag ' + tagName + ' <release-commit-sha>'
  );

  // issue #402: the tag's commit must be an ANCESTOR of HEAD. A bare tag-existence
  // check passes a tag orphaned by an origin-advance rebase of the release stack
  // (the tag keeps pointing at the pre-rebase commit; post-rebase content is
  // identical so the surface-drift check stays silent) — and a `gh release create`
  // run on an UNPUSHED tag creates the remote tag at the default-branch tip, a
  // different commit. Both are caught by requiring tag-target ⊆ HEAD's history.
  // INERT when the tag is absent (handled above) or ancestry is indeterminate
  // (shallow clone / git error); only a definitive "not an ancestor" reds.
  const { tagAncestry } = require('./release-surface-drift');
  const ancestry = tagAncestry(root, tagName, 'HEAD');
  assert(
    ancestry.ok,
    'Release tag "' + tagName + '" points at ' + (ancestry.tagSha || '<unknown>') +
      ', which is NOT an ancestor of HEAD (' + ancestry.reason + '). The release stack was ' +
      'likely rebased after tagging, orphaning the tag. Re-point it onto the current release ' +
      'commit with: git tag -f ' + tagName + ' <release-commit-sha>, and push the tag explicitly ' +
      'BEFORE `gh release create` (an unpushed tag makes gh create the remote tag at the ' +
      'default-branch tip, a different commit). After a rebase, force-push the re-pointed tag.'
  );

  // issue #193 (Branch A): the root tag owns the entire release surface, including
  // the independently-numbered Codex manifest versions. Fail when a Codex manifest
  // version moved after the tag — that surface must ride a new root version + tag.
  const { detectCodexReleaseSurfaceDrift } = require('./release-surface-drift');
  const surfaceDrift = detectCodexReleaseSurfaceDrift(root, tagName, codexManifests.map(m => m.file));
  assert(
    surfaceDrift.length === 0,
    'Release-surface drift: Codex manifest version(s) changed after tag "' + tagName + '" — ' +
      surfaceDrift.map(d => d.file + ' (tag=' + d.tagged + ', tree=' + d.tree + ')').join('; ') +
      '. The root tag owns the entire release surface (issue #193); a Codex manifest bump must ' +
      'ride a new root version + tag. Cut a new version + tag on the current commit, or revert the bump.'
  );
}

assertIncludes('scripts/simulate-workflow-walkthrough.js', 'Workflow walkthrough simulation passed');

// issue #227: adaptive-path contract. Locks the selection/execution prose + the spine.
assert(exists('scripts/kaola-workflow-plan-validator.js'), 'adaptive plan validator is missing');
assert(exists('scripts/kaola-workflow-adaptive-schema.js'), 'adaptive schema module is missing');
assert(exists('scripts/kaola-workflow-adaptive-node.js'), '#272 adaptive-node aggregator missing');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'would_orphan_in_progress'); // #343 mid-gate reopen
// #338: anti-drift pins — the finalize sink row is main-session-direct (not subagent-invoked),
// and the contractor self-attest back-fill flag is wired through claim.js + the contractor profile.
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'main-session-direct');
assertIncludes('commands/kaola-workflow-plan-run.md', 'main-session-direct');
// #344: every adaptive lifecycle call is `node "$KAOLA_SCRIPTS/…"`; $KAOLA_SCRIPTS must be
// DEFINED via the kaola_script() resolver before its first use — an undefined handle is
// MODULE_NOT_FOUND in a consumer plugin install (no local scripts dir). Pin the resolver + the
// assignment so removing either regresses the chain.
// #360: the consent-halt clear path is the script-owned `clear-halt` subcommand, not a contractor
// lockstep — pin its presence in the prose + the script so the prose mutation cannot return.
assertIncludes('commands/kaola-workflow-plan-run.md', 'clear-halt');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'clear-halt'");
// #434: revert-overflow + repair-node subcommands + their output tokens (anti-laundering signal +
// orient requires_redispatch field for absent-evidence detection).
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'revert-overflow'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'repair-node'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'requires_redispatch');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'baselineReused');
// Issue 682: authoritative review transaction and agent-selected direct repair contract.
for (const token of ['review-attempts.json', 'review_failed', 'lifecycle_settled',
  'repair_requires_replan', 'repair_limit_reached', "'--attempt-id'", 'uniqueMaximalReviewProducer']) {
  assertIncludes('scripts/kaola-workflow-adaptive-node.js', token);
}
for (const token of ['evaluateEffectiveVerdict', 'canonicalLogicalGateIdentity', 'validateReviewJournal']) {
  assertIncludes('scripts/kaola-workflow-adaptive-schema.js', token);
}
// #683: the candidate-partition repair proof (P1-P5) + the append-only rebind ledger. These are the
// fail-closed refusals that replace a whole-plan DISCARD when two gates fail simultaneously; a port that
// silently drops one re-opens the dead-end.
for (const token of ['candidate_residue_changed', 'candidate_slice_changed', 'candidate_delta_unattributed',
  'rebind_base_rewrite_unsafe', 'rebind_limit_reached', 'rebind_replay_diverged',
  'review_journal_schema_upgrade_required', 'effectiveProducerBinding', 'buildSyntheticBase',
  'proveRebindAdmissible', 'reconcilePendingRebind', 'REVIEW_REPAIR_LIMIT']) {
  assertIncludes('scripts/kaola-workflow-adaptive-node.js', token);
}
for (const token of ['candidate_declared', 'candidate_residue_digest', 'review_journal_rebind_malformed',
  'review_journal_rebind_chain_invalid', 'REVIEW_REBIND_LIMIT', 'effectiveCandidate']) {
  assertIncludes('scripts/kaola-workflow-adaptive-schema.js', token);
}
// #446 (D-446-01): operator_hint registry + route-findings subcommand + --summary flag +
// findings-route.json output + VERDICT_ROLES table must be present in the aggregators.
assertIncludes('scripts/kaola-workflow-plan-validator.js', 'OPERATOR_HINT_REGISTRY');
assertIncludes('scripts/kaola-workflow-commit-node.js', 'OPERATOR_HINT_REGISTRY');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'OPERATOR_HINT_REGISTRY');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "'route-findings'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "'--summary'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "'findings-route.json'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'VERDICT_ROLES');
assertIncludes('commands/kaola-workflow-plan-run.md', 'kaola_script(){');
assertIncludes('commands/kaola-workflow-plan-run.md', 'KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-adaptive-node.js)")"');
assertIncludes('scripts/kaola-workflow-claim.js', '--attest-contractor-spawn');
// #347: pin the planner self-attest back-fill flag (the #280 producer) so the forge-port asymmetry
// it surfaced cannot recur — the producer must exist on every edition that ships the consumer (#300).
assertIncludes('scripts/kaola-workflow-claim.js', '--attest-planner-spawn');
// the planner startup surface itself must instruct the flag, not just the producer script.
assertIncludes('agents/workflow-planner.md', '--attest-planner-spawn');
// persistence lock: a non-empty attestation warning must be transcribed into the durable summary.
assertIncludes('scripts/kaola-workflow-claim.js', '## Attestation');
assertIncludes('agents/contractor.md', '--attest-contractor-spawn');
// #399: the Step-8a artifact mirror must run the ledger-regression guard (forge-neutral
// kaola-workflow-ledger-compare.js) BEFORE its `cp -R`, and the finalization preamble must
// carry the sync-order recovery phrase (worktree->main BEFORE the mirror). Pin both so a prose
// mutation that drops the guard or the recovery note cannot silently return — the 2026-06-11
// audit reproduced the clobber live.
assertIncludes('agents/contractor.md', 'kaola-workflow-ledger-compare.js');
assertIncludes('agents/contractor.md', 'sync worktree->main FIRST');
// #353: durable-state writes must route through the crash-safe atomic replace (no torn
// workflow-plan.md/workflow-state.md/active-batch.json). Pin the helper + its adoption.
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'function writeFileAtomicReplace');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'writeFileAtomicReplace');
assertIncludes('scripts/kaola-workflow-claim.js', 'writeFileAtomicReplace');
// #354 (#353-rest): the two remaining workflow-state writers route through the atomic replace too.
assertIncludes('scripts/kaola-workflow-repair-state.js', 'writeFileAtomicReplace');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'writeFileAtomicReplace');
// #389 (#353/#354 completion): the two remaining bare durable writers route through the atomic
// replace too — the plan-validator --freeze writer (plan_hash stamp + mid-run repair re-freeze
// carrying the ## Node Ledger) and the adaptive-handoff workflow-state Planning Evidence writer.
assertIncludes('scripts/kaola-workflow-plan-validator.js', 'writeFileAtomicReplace(planPath');
assertIncludes('scripts/kaola-workflow-adaptive-handoff.js', 'writeFileAtomicReplace(fpath');
// #369: bundle all-or-nothing closure — sink-merge closes every member; finalize passes the set.
assertIncludes('scripts/kaola-workflow-sink-merge.js', '--issue-numbers');
assertIncludes('commands/kaola-workflow-finalize.md', 'SINK_ISSUE_NUMBERS');
assertIncludes('commands/kaola-workflow-finalize.md', '--issue-numbers');
assertIncludes('scripts/kaola-workflow-closure-contract.js', 'remote-members-closed');
// #429: resumable --sink transaction — step-receipt based pipeline, structured sink_blocked refusal.
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'isSinkMode');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink-receipt.json');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink_blocked');
// #354: the single fence-aware section slicer is the one home for all `## Node Ledger` /
// `## Required Agent Compliance` access; readers/writers route through it (no fence-blind indexOf).
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'function locateSection');
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'function spliceComplianceSection');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'locateSection');
// #359: the shape-gate evidence vocabulary must ORIGINATE in the producing agents' contracts
// (emission-side pin, the #290 pattern) — so the orchestrator transcribes verbatim, not synthesizes.
assertIncludes('agents/implementer.md', 'verification_tier');
assertIncludes('agents/implementer.md', 'smoke-integration');
assertIncludes('agents/tdd-guide.md', 'evidence block contains BOTH literal tokens');
assertManifestScript('kaola-workflow-plan-validator.js');   // #407: was install.sh literal
// The `--enable-adaptive` flag is warn-ignored: accepted for back-compat and sets nothing. Pin the
// notice so a regression that silently honors the flag (writes a field / branches on it) reds the chain.
assertIncludes('install.sh', '--enable-adaptive has no effect');
// #255: the adaptive-handoff script must be in the install allowlist (now the #407 manifest) for
// every edition, or a manual (non-plugin) install omits it and the planner's `--project` handoff
// invocation fails at `$HOME/.claude/.../scripts/`. Guards the 5.4.0 omission. (#407: manifest-sourced.)
assertManifestScript('kaola-workflow-adaptive-handoff.js');
assertManifestScript('kaola-gitlab-workflow-adaptive-handoff.js');
assertManifestScript('kaola-gitea-workflow-adaptive-handoff.js');
// #272: the adaptive-node aggregator must be in the install allowlist (#407 manifest) so a manual
// (non-plugin) install ships the per-node lifecycle script alongside adaptive-handoff and the
// plan-validator.
assertManifestScript('kaola-workflow-adaptive-node.js');
assertManifestScript('kaola-gitlab-workflow-adaptive-node.js');
assertManifestScript('kaola-gitea-workflow-adaptive-node.js');
// #266: Codex harness scripts (preflight, task-mirror, compact-resume) must be in the install
// allowlist (#407 manifest). preflight is base-named (4-tree byte-identical); task-mirror is
// base-named in github/codex, edition-named in gitlab/gitea; compact-resume is codex-only.
assert(exists('scripts/kaola-workflow-codex-preflight.js'), '#266 codex preflight script missing from scripts/');
assert(exists('scripts/kaola-workflow-task-mirror.js'), '#266 task-mirror script missing from scripts/');
assertManifestScript('kaola-workflow-codex-preflight.js');
assertManifestScript('kaola-workflow-task-mirror.js');
assertManifestScript('kaola-gitlab-workflow-task-mirror.js');
assertManifestScript('kaola-gitea-workflow-task-mirror.js');
// #770: adaptive is the ONLY workflow path — the path SELECTOR (KAOLA_PATH / --workflow-path /
// path_not_installed / the fast/full path names) is retired. There is nothing left to select; a
// stale request just runs adaptive. Pin the surviving vocabulary only.
assertConcept('commands/workflow-next.md', 'adaptive is the only path', [
  'adaptive', 'default'
]);
assertIncludes('commands/workflow-next.md', 'workflow-plan.md exists -> /kaola-workflow-plan-run');
// v5.1.0: the adaptive front-end ROUTING must stay enforced — the router skips its inline claim and
// routes a fresh adaptive run to the workflow-planner front end (commands/kaola-workflow-adapt.md).
// This surface was unlocked before, which let forge-edition router drift ship green on all 4 lanes.
assertIncludes('commands/workflow-next.md', 'kaola-workflow-adapt $KAOLA_TARGET_ISSUE');
assertIncludes('commands/workflow-next.md', 'Skip this entire step');
// #646: the issue-scout is dispatched PRE-CLAIM via router prose (Step 0, no-issue-named branch), not a
// fenced Agent() block — and commands/workflow-next.md is NOT in phaseCommands, so
// assertEveryDispatchHasModel never scans it. Pin the governed scout dispatch here explicitly: the
// tier must stay the install-rendered {ISSUE_SCOUT_MODEL} placeholder, never drift back to an
// ungoverned (model-less) prose dispatch (the #443 regression shape — an unrendered placeholder — is
// separately caught by test-install-model-rendering.js).
assertIncludes('commands/workflow-next.md', 'the governed issue-scout tier');
assertIncludes('commands/workflow-next.md', 'model="{ISSUE_SCOUT_MODEL}"');
assertIncludes('commands/workflow-next.md', 'isolated, self-contained control-plane brief');
assertIncludes('commands/workflow-next.md', 'argument-shape refusal');
// adapt (authoring) + plan-run (executor) prose: artifacts, gates, caps, governance
// #277 M3: FANOUT_CAP and post-dominate concepts relocated from commands/kaola-workflow-adapt.md
// (now a dispatch-handle-only file) to agents/workflow-planner.md (sole home of authoring procedure).
assertConcept('agents/workflow-planner.md', 'adaptive authoring', [
  'workflow-plan.md', '## Nodes', 'post-dominate', 'finalize', 'FANOUT_CAP', 'plan_hash', 'typed refusal'
]);
// the adaptive front-end dispatch must stay ENFORCED (a workflow-planner Agent block carrying its
// model badge), never drift back to advisory prose — the bug fixed in v5.1.0 where a skill-driven
// run claimed + authored inline in the main session.
assertIncludes('commands/kaola-workflow-adapt.md', 'subagent_type="workflow-planner"');
assertIncludes('commands/kaola-workflow-adapt.md', 'model="{WORKFLOW_PLANNER_MODEL}"');
assertIncludes('commands/kaola-workflow-adapt.md', 'isolated, self-contained control-plane brief');
assertIncludes('commands/kaola-workflow-adapt.md', 'argument-shape refusal');
for (const file of [
  'commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md'
]) assertWorkflowPlannerPromptSelfContained(file);
// v5.1.0: the refusal consumer branch must stay FAIL-CLOSED — any verdict that is not acquired/owned
// is a refusal, never a blind read of a missing workflow-state.md.
assertIncludes('commands/kaola-workflow-adapt.md', 'NOT `acquired` or `owned`');
assertIncludes('commands/kaola-workflow-adapt.md', 'do not blind-read');
// #255: the checklist-backed handoff contract must stay enforced — the orchestrator reads the
// planner's handoff packet (it no longer runs a contractor classify/freeze chain). Lock the two
// terminal handoff statuses so the design cannot silently drift back to a pre-handoff approval gate.
// #272: token renamed from ready_to_dispatch_first_node → ready_to_run (plan-run owns node lifecycle).
assertIncludes('commands/kaola-workflow-adapt.md', 'ready_to_run');
assertIncludes('commands/kaola-workflow-adapt.md', 'plan_invalid');
assertIncludes('agents/workflow-planner.md', 'NOT `acquired`/`owned`');
// #287: planner-first control boundary pinned across all editions
assertIncludes('commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
assertIncludes('plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
assertIncludes('plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md', 'planner_control_boundary_violation');
assertIncludes('agents/workflow-planner.md', 'planner_control_boundary_violation');
assertConcept('commands/kaola-workflow-plan-run.md', 'adaptive execution + governance', [
  '## Node Ledger', 'plan_hash', 'post-dominate', 'auto-run', 'provisional', 'halt for consent',
  'escalated_to_full: consent', 'typed refusal', 'quorum', 'tally-fn', 'validateNodeOutput',
  'read-only', 'test_thrash', 'merge_conflict', 'synthesizer', 'FANOUT_CAP',
  // #303 anti-drift: pin the rolling-dispatch + crash-repair + opening-lifecycle primitives so a
  // future edit cannot silently drop the parallel-fanout semantics from one edition.
  'top-up', 'reconcile', 'opening',
  // #335 anti-drift: pin the mechanical main→worktree project-folder mirror step so no edition
  // can silently revert to the brittle prose `cp -R` seam.
  'mirror-project'
]);
// classifier exports the adaptive primitives
assertIncludes('scripts/kaola-workflow-classifier.js', 'module.exports');
assertIncludes('scripts/kaola-workflow-classifier.js', 'disjointWriteSets');
assertIncludes('scripts/kaola-workflow-classifier.js', 'readPlanNodes');
// #725/#770: adaptive is the ONLY installed path — the `installed_paths` union /
// `resolveInstalledPaths` resolver are retired, and (#770) so is the path SELECTOR itself: the
// claim no longer gates on a requested path at all, and both resume surfaces emit the adaptive
// executor unconditionally.
assertIncludes('scripts/kaola-workflow-claim.js', 'PLAN_RUN_COMMAND');
// the adaptive executor command literal lives in the shared schema anchor
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', '/kaola-workflow-plan-run');
// repair-state recognizes + routes adaptive ahead of the phaseN ladder
assertIncludes('scripts/kaola-workflow-repair-state.js', 'routeAdaptive');
assertIncludes('scripts/kaola-workflow-repair-state.js', 'isAdaptiveWorkflowState');
// the switch gates SELECTION only — it must be ABSENT from resume + well-formedness
assertNotIncludes('scripts/kaola-workflow-repair-state.js', 'enable_adaptive');
assertNotIncludes('scripts/kaola-workflow-repair-state.js', 'KAOLA_ENABLE_ADAPTIVE');
assertNotIncludes('scripts/kaola-workflow-plan-validator.js', 'enable_adaptive');
assertNotIncludes('scripts/kaola-workflow-plan-validator.js', 'KAOLA_ENABLE_ADAPTIVE');
// finalize adaptive prerequisite (#283: phase6 renamed to finalize)
assertIncludes('commands/kaola-workflow-finalize.md', 'workflow_path: adaptive');

// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (CLAUDE edition — .md bodies). Removing the emission section from
// any of these files must fail npm test so a re-vendor or refactor cannot silently drop it.
for (const reviewerBody of [
  'agents/code-reviewer.md',
  'agents/security-reviewer.md',
  'agents/adversarial-verifier.md',
  'agents/profiles/higher/code-reviewer.md',
  'agents/profiles/higher/security-reviewer.md'
]) {
  assertIncludes(reviewerBody, 'finding: id=');
}
// #407 surface-undercount cross-check: every name the install manifest emits for a forge MUST be a
// real file in that forge's source scripts dir — so the manifest can never list a phantom (which the
// installer's fail-closed missing-source check would then abort on), and a renamed forge port that
// the manifest claims is guaranteed to exist. Closes the surface-map-undercount class at validate-time.
{
  const forgeScriptsDir = (forge) => forge === 'github'
    ? 'scripts'
    : `plugins/kaola-workflow-${forge}/scripts`;
  for (const forge of installManifest.FORGES) {
    const dir = forgeScriptsDir(forge);
    for (const name of installManifest.supportScripts(forge)) {
      assert(exists(`${dir}/${name}`),
        `#407: install manifest emits "${name}" for ${forge} but ${dir}/${name} does not exist`);
    }
    for (const hook of installManifest.supportHooks(forge)) {
      const hookDir = forge === 'github' ? 'hooks' : `plugins/kaola-workflow-${forge}/hooks`;
      assert(exists(`${hookDir}/${hook}`),
        `#407: install manifest emits hook "${hook}" for ${forge} but ${hookDir}/${hook} does not exist`);
    }
  }
}

// #281: frontier-unit semantics in plan-run executor surface (added by plan-run-semantics node)
assertIncludes('commands/kaola-workflow-plan-run.md', 'frontier unit');
// #281: efficient-DAG instruction in workflow-planner profile (added by planner-profile node)
assertIncludes('agents/workflow-planner.md', 'EFFICIENT DAGs');

// #341: forge-neutral agent-profile authoring guidance pinned in the planner profile +
// plan-run executor surface (the #328 gh-leak class).
assertIncludes('agents/workflow-planner.md', 'forge-neutral');
assertIncludes('commands/kaola-workflow-plan-run.md', '--forbidden-only');

// node-briefs channel relay + role-kind enumeration prose on the plan-run executor COMMAND
// surface (the Claude side of the Codex SKILL relay). The dispatch carries the node's brief as
// its task direction, instructs a consumer to read each upstream evidence file and record the
// consumed nonce, and derives the evidence-persistence kind from each role's tool manifest — no
// hand-list. The stale exclusive-contract enumerations (the hardcoded READ-ONLY / WRITE role
// lists) were replaced by the manifest-derived sentence; reintroducing either bold-header list
// reds the chain.
assertIncludes('commands/kaola-workflow-plan-run.md', '<!-- PIN: node-briefs-relay -->');
assertIncludes('commands/kaola-workflow-plan-run.md', 'carry it VERBATIM into the role dispatch');
assertIncludes('commands/kaola-workflow-plan-run.md', 'record a column-0 `upstream_read: <node-id> <nonce>` line');
assertIncludes('commands/kaola-workflow-plan-run.md', "derived from each role's tool manifest");
assertNotIncludes('commands/kaola-workflow-plan-run.md', '**READ-ONLY roles**');
assertNotIncludes('commands/kaola-workflow-plan-run.md', '**WRITE-role agents**');

// #340: registration-surface + forge-port parity checks and their authoring/dispatch prose
assertIncludes('scripts/kaola-workflow-plan-validator.js', 'agent-registration gap');
assertIncludes('scripts/kaola-workflow-plan-validator.js', 'forge-port ordering gap');
assertIncludes('agents/workflow-planner.md', 'full accumulated root diff');
assertIncludes('agents/workflow-planner.md', 'registration surface');
assertIncludes('commands/kaola-workflow-plan-run.md', 'full accumulated root diff');

// #340 derived parity guard (enumeration-free): uninstall.sh REQUIRED_AGENTS must match install.sh
// exactly, or uninstalling orphans an installed managed agent. Both lists are extracted from the
// single-line array literal — no hardcoded names/counts, so a future agent addition needs no edit here.
{
  const requiredAgentsList = (sh, label) => {
    const m = /REQUIRED_AGENTS=\(([^)]*)\)/.exec(read(sh));
    assert(m, label + ' must declare a REQUIRED_AGENTS=(...) array (#340)');
    return (m[1].match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
  };
  const installAgents = requiredAgentsList('install.sh', 'install.sh');
  const uninstallAgents = requiredAgentsList('uninstall.sh', 'uninstall.sh');
  assert(JSON.stringify(installAgents) === JSON.stringify(uninstallAgents),
    'uninstall.sh REQUIRED_AGENTS must match install.sh (#340) — a missing name orphans the installed agent on uninstall');
}

// #334: the non-delegable main-session-gate role token + its G3 freeze gate + authoring/dispatch
// prose. Pinned so a re-vendor/refactor cannot silently drop the built-in gate role.
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'MAIN_SESSION_GATE_ROLE');
assertIncludes('scripts/kaola-workflow-plan-validator.js', 'G3: main-session-gate');
assertIncludes('commands/kaola-workflow-plan-run.md', 'main-session-gate');
assertIncludes('agents/workflow-planner.md', 'main-session-gate');

// #607: gate instrumentation is provisioned upstream, never authored by the gate itself — the
// main-session-gate role stays read-only by construction; a probe/fixture the gate needs is
// authored inside an upstream writer node's declared write set, and the plan states whether the
// artifact is durable or ephemeral. Pinned on the planner's own authoring surfaces so the rule
// cannot silently drop from all of them at once (md↔toml parity for the toml twins is separately
// enforced by test-agent-profile-parity.js FEATURE_TOKENS).
assertIncludes('agents/workflow-planner.md', 'the gate never authors or deletes files');
const adaptSkillSurfacesGateProvisioning607 = [
  'plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md',
];
for (const file of adaptSkillSurfacesGateProvisioning607) {
  assertIncludes(file, 'the gate never authors or deletes files');
}

// #602: the canonical --summary invocation must document the dispatch-essentials one-liner it
// actually prints, the extended pre-dispatch card-acquisition rule, and the explicit
// no-improvise prohibition on every plan-run spawn.
assertIncludes('commands/kaola-workflow-plan-run.md', 'opened=<node-id> role=<role> task=<codex_task_name>');
assertIncludes('commands/kaola-workflow-plan-run.md', "take the dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`. Never dispatch without the card in view.");
assertIncludes('commands/kaola-workflow-plan-run.md', 'Every spawn parameter comes from the dispatch card.');

// #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
// inline-fallback format, verbatim.
assertIncludes('commands/kaola-workflow-plan-run.md', 'plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.');
assertIncludes('commands/kaola-workflow-plan-run.md', '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model}, effort {effort})');
assertIncludes('commands/kaola-workflow-plan-run.md', '← {node_id} · {role} returned: {verdict or one-line outcome}');
assertIncludes('commands/kaola-workflow-plan-run.md', '→ running {node_id} · {role} inline (…reason token…)');

// #605: required progress-echo line printed after every close-and-open-next.
assertIncludes('commands/kaola-workflow-plan-run.md', '{node-id} → complete; opened: {next-id|—}');

// #606: teammate-mode dispatch subsection must propagate to the 3 Claude command plan-run
// surfaces (Claude-runtime-only; the Codex SKILLs never carry this dispatch mode). Pin the
// sentinel sentence + the one-nudge idle-race rule so a drop on any surface fails here.
const planRunSurfaces606 = [
  'commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
];
for (const file of planRunSurfaces606) {
  assertIncludes(file, "spawn each node's role agent as a NAMED teammate");
  assertIncludes(file, 'send EXACTLY ONE request for the deliverable, then wait');
}

// #607/#768: the gate-instrumentation-provisioning block (a main-session-gate node body never
// instructs authoring files; instrumentation is provisioned upstream) must propagate to ALL SIX
// plan-run surfaces (#400) — a drop on any surface fails here. The KAOLA_GATE_WINDOW_FENCE runtime
// fence prose was retired (#768: mainline never had a tool-write interceptor for it once #725 Phase
// C deleted the hook; only the env-var-free scheduler hold survives) — banned below so it cannot
// silently re-creep.
const planRunSurfacesGateFence607 = [
  'commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
];
for (const file of planRunSurfacesGateFence607) {
  assertIncludes(file, '<!-- PIN: gate-instrumentation-provisioning -->');
  assertNotIncludes(file, 'KAOLA_GATE_WINDOW_FENCE');
}

// #611: the Codex dispatch prose mandates fork_turns:"none" for EVERY role dispatch (not only
// tiered nodes) — the "only for tiered nodes" qualifier is retired. Pin the unconditional mandate
// and ban the retired qualifier phrasing across the 3 Codex SKILL plan-run surfaces
// (Codex-runtime-only) so a partial drop reds this chain.
// #775: v2-task-name is the only dispatch mode, so the "applies identically to this dispatch
// mode" qualifier (a v1/v2 distinction) is itself retired prose.
const planRunSurfaces611ForkTurns = [
  'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
];
for (const file of planRunSurfaces611ForkTurns) {
  assertIncludes(file, 'on EVERY role dispatch');
  assertNotIncludes(file, 'the unconditional mandate applies identically to this dispatch mode');
  assertNotIncludes(file, 'not a valid path for tiered nodes');
}

// #611: the Codex Join Protocol — full A-F encoding (wait budget, drain-all join loop, escalation
// ladder, writer kill-safety, frontier slot awareness) lives in the three Codex SKILL packs
// (spawn_agent/wait_agent/close_agent lifecycle). Pin the anchor + the load-bearing tokens so a
// drop on any Codex SKILL pack reds this chain.
const codexJoinProtocolSurfaces611 = [
  'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
];
for (const file of codexJoinProtocolSurfaces611) {
  assertIncludes(file, '<!-- PIN: join-protocol -->');
  assertIncludes(file, 'dispatch.wait_budget_minutes');
  assertIncludes(file, 'NEVER interrupted before its wait budget expires');
  assertIncludes(file, 'delegation_outcome');
  assertIncludes(file, 'writerHalt');
}

// #611: the three Claude/forge plan-run COMMAND surfaces carry the runtime-appropriate equivalent
// of the Codex Join Protocol (SendMessage vocabulary instead of spawn_agent/wait_agent), still
// referencing the same dispatch-card wait_budget_minutes and writer-kill-safety verdict fields.
const claudeJoinProtocolSurfaces611 = [
  'commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
];
for (const file of claudeJoinProtocolSurfaces611) {
  assertIncludes(file, 'dispatch.wait_budget_minutes');
  assertIncludes(file, 'Writer kill-safety');
  assertIncludes(file, 'writerHalt');
  assertIncludes(file, 'delegation_outcome');
}
for (const file of [...codexJoinProtocolSurfaces611, ...claudeJoinProtocolSurfaces611]) {
  assertIncludes(file, 'dispatch card\'s frozen `wait_budget_minutes` value and source are authoritative');
  assertIncludes(file, '`planner_override` may extend but never shorten');
  assertIncludes(file, 'must not interrupt or re-nudge before that floor expires');
  assertIncludes(file, 'complete governed deliverable');
}

// #400: registry-driven route-reachability contract for the Claude command surface. Every
// route/command target a claim/startup/resume receipt emits MUST resolve to an installed command
// file in EACH Claude edition. require() the schema route constants (no hand-listed drift) + the
// static next_command fallbacks claim.js prints, and assert each resolves to a commands/<name>.md.
// The Codex twin lives in each validate-kaola-workflow-{,gitlab,gitea}-contracts.js (skills surface).
{
  const schema = require('./kaola-workflow-adaptive-schema.js');
  // Route values are emitted as `/<command> {project}`; reachability is the bare basename `.md`.
  const stripSlash = c => c.replace(/^\//, '');
  const emittedCommandTargets = [
    stripSlash(schema.PLAN_RUN_COMMAND),
    stripSlash(schema.ADAPT_COMMAND)
  ];
  const claudeCommandDirs = [
    'commands',
    'plugins/kaola-workflow-gitlab/commands',
    'plugins/kaola-workflow-gitea/commands'
  ];
  for (const dir of claudeCommandDirs) {
    const installed = new Set(
      fs.readdirSync(path.join(root, dir))
        .filter(f => f.endsWith('.md'))
        .map(f => f.slice(0, -'.md'.length))
    );
    for (const target of emittedCommandTargets) {
      assert(installed.has(target),
        '#400: route-reachability — receipt-emitted command target "/' + target + '" has no installed ' +
        dir + '/' + target + '.md (broken route)');
    }
  }
}

// #422.3: the md↔toml agent-profile token-pin contract (test-agent-profile-parity.js) must be wired
// into the claude test chain (mirrors how test-route-reachability.js guards the route surface).
{
  const claudeChain = (packageJson.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}

// #505 ITEM 1: pin the FOREIGN_ARCHIVE staging guard in the finalize command so a silent drop
// (the #294 fail-open class) turns the chain RED. npm test never executes the bash prose;
// these pins are its only mechanical enforcement (the bash-block-guards Test E covers runtime).
assertIncludes('commands/kaola-workflow-finalize.md', 'FOREIGN_ARCHIVE=$(git diff --cached');
assertIncludes('commands/kaola-workflow-finalize.md', 'BLOCKED: a foreign project\'s archive band is staged');
assertIncludes('commands/kaola-workflow-finalize.md', '## Staging Guard');

// n5 (#653 finding D): selection-evidence docking + run-gap manual-seed prose must reach the
// router + finalize/plan-run surfaces, and the observed_gap_unseeded refusal must be documented.
assertIncludes('commands/workflow-next.md', 'selection-evidence');
assertIncludes('commands/kaola-workflow-finalize.md', 'observed_gap_unseeded');
assertIncludes('commands/kaola-workflow-plan-run.md', 'run-gaps-manual.md');

// Re-plan edition contract: the installer mapping, executable CLI, shared vocabulary, and every
// generated routing surface are one behavior contract. The manual-install smoke runs only from the
// repository copy; this validator's byte-identical Codex-plugin twin still exercises its packaged
// script directly.
{
  const expectedNames = {
    github: 'kaola-workflow-replan.js',
    gitlab: 'kaola-gitlab-workflow-replan.js',
    gitea: 'kaola-gitea-workflow-replan.js',
  };
  for (const [forge, expectedName] of Object.entries(expectedNames)) {
    const emitted = installManifest.supportScripts(forge)
      .filter(name => /workflow-replan\.js$/.test(name));
    assert(JSON.stringify(emitted) === JSON.stringify([expectedName]),
      're-plan install mapping for ' + forge + ' must emit exactly ' + expectedName + ', got ' + JSON.stringify(emitted));
  }

  const replanRel = 'scripts/kaola-workflow-replan.js';
  assert(exists(replanRel), 'Claude/Codex re-plan aggregator is missing: ' + replanRel);
  const cli = require('child_process').spawnSync(process.execPath,
    [path.join(root, replanRel), 'status', '--project', 'n5-missing-project', '--json'],
    { cwd: root, encoding: 'utf8' });
  assert(cli.status !== 0, 're-plan status on a missing project must refuse');
  const cliResult = JSON.parse(String(cli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  assert(cliResult.reason === 'replan_authority_path_invalid',
    're-plan CLI must execute and return the typed missing-authority refusal, got ' + JSON.stringify(cliResult));

  const replanSchema = require('./kaola-workflow-adaptive-schema.js');
  assert(JSON.stringify(replanSchema.REPLAN_PHASES) === JSON.stringify([
    'prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed',
  ]), 're-plan phases must remain canonical across editions');
  assert(JSON.stringify(replanSchema.REPLAN_STATUSES) === JSON.stringify([
    'none', 'in_progress', 'candidate_changed', 'consent_halt',
  ]), 're-plan statuses must remain canonical across editions');
  assert(JSON.stringify(replanSchema.REPLAN_CAS_SEAMS) === JSON.stringify([
    'prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation',
  ]), 're-plan CAS seams must remain canonical across editions');

  const closure = require('./kaola-workflow-closure-contract.js');
  assert((closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('preserved')
      && (closure.CLOSURE_RECEIPT_FIELDS.epoch_lineage_preserved || []).includes('failed')
      && closure.CLOSURE_INVARIANTS.some(row => row.id === 'epoch-lineage-preserved'),
  'closure contract must retain the digest-verified epoch-lineage receipt and invariant');

  if (exists('install.sh')) {
    const tempHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kw-n5-claude-install-'));
    try {
      const installed = require('child_process').spawnSync('bash', [path.join(root, 'install.sh'),
        '--yes', '--no-settings-merge', '--forge=github'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
      });
      assert(installed.status === 0, 'Claude installer must ship the re-plan aggregator: ' + installed.stderr);
      const installedScript = path.join(tempHome, '.claude', 'kaola-workflow', 'scripts', expectedNames.github);
      assert(fs.existsSync(installedScript) && (fs.statSync(installedScript).mode & 0o111) !== 0,
        'Claude installed re-plan aggregator must be present and executable');
      const installedCli = require('child_process').spawnSync(process.execPath,
        [installedScript, 'status', '--project', 'n5-missing-project', '--json'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome } });
      const installedResult = JSON.parse(String(installedCli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
      assert(installedCli.status !== 0 && installedResult.reason === 'replan_authority_path_invalid',
        'installed Claude re-plan aggregator must execute the typed refusal contract');
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }

    const editions = [
      { prefix: '', aggregator: expectedNames.github },
      { prefix: 'plugins/kaola-workflow-gitlab/', aggregator: expectedNames.gitlab },
      { prefix: 'plugins/kaola-workflow-gitea/', aggregator: expectedNames.gitea },
    ];
    for (const edition of editions) {
      const surfaces = [
        edition.prefix + 'commands/kaola-workflow-plan-run.md',
        edition.prefix + 'commands/kaola-workflow-adapt.md',
        edition.prefix + 'commands/kaola-workflow-finalize.md',
        edition.prefix + 'commands/workflow-next.md',
        edition.prefix + (edition.prefix ? 'skills/' : 'plugins/kaola-workflow/skills/') + 'kaola-workflow-plan-run/SKILL.md',
        edition.prefix + (edition.prefix ? 'skills/' : 'plugins/kaola-workflow/skills/') + 'kaola-workflow-adapt/SKILL.md',
        edition.prefix + (edition.prefix ? 'skills/' : 'plugins/kaola-workflow/skills/') + 'kaola-workflow-finalize/SKILL.md',
        edition.prefix + (edition.prefix ? 'skills/' : 'plugins/kaola-workflow/skills/') + 'kaola-workflow-next/SKILL.md',
      ];
      for (const file of surfaces) {
        const control = sectionBody(read(file), 'In-progress re-plan control plane');
        assert(control.includes(edition.aggregator) && control.includes('resume --project {project} --json')
            && control.includes('workflow-plan.next.md') && control.includes('replan-planner-attestation.json'),
        file + ' must route the installed re-plan aggregator, planner child, and attestation');
        for (const forbiddenRoute of ['kaola-workflow-claim.js discard --project', 'discard+restart a fresh adaptive run',
          'auto-takeover', 'approval gate']) {
          assert(!control.includes(forbiddenRoute), file + ' re-plan control plane must not expose ' + forbiddenRoute);
        }
      }
    }
  }
}

// Reviewer-contract-v2 integration wall: the deterministic validation runner must ship in every
// manual edition, the lifecycle must expose one shared classifier/reducer contract, and all
// authoring/execution/finalization prompt families must retain their generated machine envelope.
assert(exists('scripts/kaola-workflow-validation-runner.js'),
  'canonical validation runner is missing');
assertManifestScript('kaola-workflow-validation-runner.js');
{
  const runner = require('./kaola-workflow-validation-runner.js');
  for (const name of ['normalizePolicy', 'collectExecutionIdentity', 'computeLandableTreeDigest',
    'reduceRuns', 'buildValidationVector', 'runValidation', 'qualifyLocalReviewers']) {
    assert(typeof runner[name] === 'function', 'validation runner must export ' + name);
  }
  const schema = require('./kaola-workflow-adaptive-schema.js');
  for (const name of ['deriveGateMode', 'buildReviewContext', 'validateReviewEvidenceBinding',
    'normalizeFindingSet', 'reduceReviewReceipts', 'compareValidationObligations',
    'assessReviewProgress', 'validateReviewJournalV2']) {
    assert(typeof schema[name] === 'function', 'adaptive schema must export reviewer-v2 API ' + name);
  }
  const validator = require('./kaola-workflow-plan-validator.js');
  for (const name of ['resolvePlanContract', 'buildPlanView', 'validateSchema2ReviewPlan',
    'verifyVerdictBlock']) {
    assert(typeof validator[name] === 'function', 'plan validator must export reviewer-v2 API ' + name);
  }
  const lifecycle = require('./kaola-workflow-adaptive-node.js');
  for (const name of ['buildDispatch', 'runRecordEvidence', 'runCloseNode', 'readReviewJournal',
    'computeReviewCandidateDigest']) {
    assert(typeof lifecycle[name] === 'function', 'adaptive lifecycle must export reviewer-v2 seam ' + name);
  }
  assertIncludes('scripts/kaola-workflow-repair-state.js', 'missing-or-stale-review-receipt');
}

const reviewerV2AuthoringSurfaces = [
  'commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md',
  'agents/workflow-planner.md',
  'plugins/kaola-workflow/agents/workflow-planner.toml',
  'plugins/kaola-workflow-gitlab/agents/workflow-planner.toml',
  'plugins/kaola-workflow-gitea/agents/workflow-planner.toml',
];
for (const file of reviewerV2AuthoringSurfaces) {
  assertIncludes(file, '<!-- PIN: reviewer-contract-v2-authoring -->');
  assertIncludes(file, 'plan_schema_version: 2');
  assertIncludes(file, 'contract_version: 1');
}
const reviewerV2ExecutionSurfaces = [
  'commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
];
for (const file of reviewerV2ExecutionSurfaces) {
  assertIncludes(file, '<!-- PIN: reviewer-contract-v2-execution -->');
  assertIncludes(file, 'review_context_hash');
  assertIncludes(file, '.cache/validation-vectors/');
}
const reviewerV2FinalizationSurfaces = [
  'commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
];
for (const file of reviewerV2FinalizationSurfaces) {
  assertIncludes(file, '<!-- PIN: reviewer-contract-v2-finalization -->');
  assertIncludes(file, 'resolved_profile_hash');
  assertIncludes(file, '.cache/validation-vectors/');
}
assert((packageJson.scripts || {})['test:kaola-workflow:claude'].includes('test-validation-runner.js'),
  'Claude validation chain must execute the deterministic validation-runner suite');

// PROVENANCE_BAN: agent-facing prompt surfaces (agents/*.md, commands/*.md) must not embed
// issue numbers (#NNN), decision IDs (D-NNN-NN), invariant tags (INV-NN), ADR citations, or
// PR/MR/AC refs. Only the rule belongs in prompts; provenance belongs in CHANGELOG.md,
// docs/decisions/, and commit messages. Allowed: #N/#<issue>/#<n> placeholders, runtime vars
// (KAOLA_TARGET_ISSUE=N, --target-issue <N>), grey-zone audit labels (G1/G3/AC7/M4 — no #).
// See docs/conventions.md.
{
  const PROVENANCE_BAN = /#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/;
  const claudePromptSurfaces = [
    { dir: 'agents', ext: '.md' },
    { dir: 'commands', ext: '.md' }
  ];
  for (const { dir, ext } of claudePromptSurfaces) {
    const files = fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(ext));
    for (const f of files) {
      const rel = dir + '/' + f;
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
}

console.log('Workflow contract validation passed');
