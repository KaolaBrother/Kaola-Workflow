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
  ['target', 'mismatch'].join('_')
];

const phaseCommands = [
  'commands/kaola-workflow-phase1.md',
  'commands/kaola-workflow-phase2.md',
  'commands/kaola-workflow-phase3.md',
  'commands/kaola-workflow-phase4.md',
  'commands/kaola-workflow-phase5.md',
  'commands/kaola-workflow-finalize.md',
  'commands/kaola-workflow-fast.md',
  'commands/kaola-workflow-adapt.md',
  'commands/kaola-workflow-plan-run.md'
];

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
}

// issue-152: routed-fix Agent blocks must carry explicit model placeholders
const routedFixFiles = [
  'commands/kaola-workflow-phase4.md',
  'commands/kaola-workflow-phase5.md',
  'commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md',
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
// issue #203: Select Project active-folder definition must include fast-summary.md (drift-guard A)
assertIncludes('commands/workflow-next.md', '`fast-summary.md` file, or a `workflow-state.md`');
// issue #203 (#201 regression lock): reconstruction ladder fast-summary rung (drift-guard B)
assertIncludes('commands/workflow-next.md', 'fast-summary.md exists -> /kaola-workflow-fast');
for (const token of retired) assertNotIncludes('commands/workflow-next.md', token);

// issue #198: fast-path widening — eligibility/hatch/review contract
const fastFile198 = 'commands/kaola-workflow-fast.md';
assertIncludes(fastFile198, 'mechanical');
assertIncludes(fastFile198, '≤ 5');
assertIncludes(fastFile198, 'design choice');
assertIncludes(fastFile198, 'approach_ambiguity');
assertIncludes(fastFile198, 'declared write set');
assertIncludes(fastFile198, 'absolute backstop of 6');
assertIncludes(fastFile198, '`code-reviewer` is mandatory');
assertNotIncludes(fastFile198, 'two closely related files');
assertNotIncludes(fastFile198, '≤ 2');
const nextFile198 = 'commands/workflow-next.md';
assertIncludes(nextFile198, 'mechanical');
assertIncludes(nextFile198, '≤ 5');
assertIncludes(nextFile198, 'design choice');
assertNotIncludes(nextFile198, '≤ 2 closely related files');

// issue #207: fast-overlap parity. The fast-summary.md `## Scope` must declare a
// machine-readable `- Write Set:` line, and the classifier must read that
// fast-summary.md Scope section, so a claimed fast project's in-flight files
// participate in parallel-overlap detection at parity with full projects. Both
// sides are locked so the template↔classifier coupling cannot silently drift.
assertIncludes(fastFile198, '- Write Set:');
assertIncludes('scripts/kaola-workflow-classifier.js', 'fast-summary.md');
assertIncludes('scripts/kaola-workflow-classifier.js', 'sectionBody(');
assertIncludes('scripts/kaola-workflow-classifier.js', "'Scope'");

// issue #222: fast-path mid-flight escalation routing fix
// Fast command must rewrite state on escalation and provide a forward route from Resume Detection.
assertIncludes(fastFile198, 'workflow_path: full');
assertIncludes(fastFile198, 'next_command: /kaola-workflow-phase1 {project}');
assertIncludes(fastFile198, 'next_skill: kaola-workflow-research {project}');
assertIncludes(fastFile198, 'status `ESCALATED` → escalation already committed');
// workflow-next reconstruction ladder must have escalation rung above the fast rung.
assertBefore(nextFile198, 'fast-summary.md status ESCALATED -> /kaola-workflow-phase1', 'fast-summary.md exists -> /kaola-workflow-fast');

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
assertIncludes('scripts/kaola-workflow-claim.js', '/kaola-workflow-fast ');
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
  'hooks/kaola-workflow-pre-commit.sh',
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
assertIncludes('hooks/kaola-workflow-pre-commit.sh', 'multiple kaola-workflow projects staged');
assertIncludes('install.sh', 'kaola-workflow-active-folders.js');
assertIncludes('install.sh', 'kaola-workflow-resolve-agent-model.js');
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
  'fast-summary.md',
  '.cache/'
]);
assertConcept('commands/workflow-init.md', 'generated CLAUDE durable state contract', [
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
  'testFastStartupState',
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

// issue #283: kaola-workflow-phase6.md hard-removed; kaola-workflow-finalize.md is the
// route-agnostic terminal routine. Assert canonical present + legacy absent.
assert(!exists('commands/kaola-workflow-phase6.md'),
  'commands/kaola-workflow-phase6.md must be absent (hard-removed by #283)'); // issue #283
assert(exists('commands/kaola-workflow-finalize.md'),
  'commands/kaola-workflow-finalize.md must be present (#283 terminal routine)');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-pr.js');
assertIncludes('commands/kaola-workflow-finalize.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"');
// #277 M3: --keep-worktree procedure relocated from phase6 inline body to agents/contractor.md;
// still asserted in the dispatch prompt string inside finalize.md (pass-through reference).
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-worktree');
assertIncludes('commands/kaola-workflow-finalize.md', 'Use the sink metadata captured before Step 8b');
// #277 M3: contractor-dispatch HANDLE lock — the mechanical finalization body moved to
// agents/contractor.md; the finalize command retains only the Agent(...) dispatch handle.
assertIncludes('commands/kaola-workflow-finalize.md', 'subagent_type="contractor"');
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
assertIncludes('scripts/kaola-workflow-claim.js', '--attest-contractor-spawn');
assertIncludes('agents/contractor.md', '--attest-contractor-spawn');
assertIncludes('install.sh', 'kaola-workflow-plan-validator.js');
assertIncludes('install.sh', '--enable-adaptive');
// #255: the adaptive-handoff script must be in install.sh's per-edition SUPPORT_SCRIPT_NAMES
// allowlist for every edition, or a manual (non-plugin) install omits it and the planner's
// `--project` handoff invocation fails at `$HOME/.claude/.../scripts/`. Guards the 5.4.0 omission.
assertIncludes('install.sh', 'kaola-workflow-adaptive-handoff.js');
assertIncludes('install.sh', 'kaola-gitlab-workflow-adaptive-handoff.js');
assertIncludes('install.sh', 'kaola-gitea-workflow-adaptive-handoff.js');
// #272: the adaptive-node aggregator must be in install.sh per-edition SUPPORT_SCRIPT_NAMES
// allowlist so a manual (non-plugin) install ships the per-node lifecycle script alongside
// adaptive-handoff and the plan-validator.
assertIncludes('install.sh', 'kaola-workflow-adaptive-node.js');
assertIncludes('install.sh', 'kaola-gitlab-workflow-adaptive-node.js');
assertIncludes('install.sh', 'kaola-gitea-workflow-adaptive-node.js');
// #266: Codex harness scripts (preflight, task-mirror, compact-resume) must be in
// install.sh per-edition SUPPORT_SCRIPT_NAMES allowlist. preflight is base-named (4-tree
// byte-identical); task-mirror is base-named in github/codex, edition-named in gitlab/gitea;
// compact-resume is codex-only (no claude scripts/ copy) — asserted in codex-only validator.
assert(exists('scripts/kaola-workflow-codex-preflight.js'), '#266 codex preflight script missing from scripts/');
assert(exists('scripts/kaola-workflow-task-mirror.js'), '#266 task-mirror script missing from scripts/');
assertIncludes('install.sh', 'kaola-workflow-codex-preflight.js');
assertIncludes('install.sh', 'kaola-workflow-task-mirror.js');
assertIncludes('install.sh', 'kaola-gitlab-workflow-task-mirror.js');
assertIncludes('install.sh', 'kaola-gitea-workflow-task-mirror.js');
// router 3-way selection: switch chooses branch AND default (adaptive is the default under ON;
// fast/full are explicit escapes). OFF preserves 2-way fast/full with typed refusal on adaptive.
assertConcept('commands/workflow-next.md', 'adaptive path selection', [
  'KAOLA_ENABLE_ADAPTIVE', 'adaptive', 'fast|full|adaptive', 'default', 'typed refusal'
]);
assertIncludes('commands/workflow-next.md', 'workflow-plan.md exists -> /kaola-workflow-plan-run');
// v5.1.0: the adaptive front-end ROUTING must stay enforced — the router skips its inline claim and
// routes a fresh adaptive run to the workflow-planner front end (commands/kaola-workflow-adapt.md).
// This surface was unlocked before, which let forge-edition router drift ship green on all 4 lanes.
assertIncludes('commands/workflow-next.md', 'kaola-workflow-adapt $KAOLA_TARGET_ISSUE');
assertIncludes('commands/workflow-next.md', 'Skip this entire step when `KAOLA_PATH=adaptive`');
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
  'read-only', 'test_thrash', 'FANOUT_CAP',
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
// claim toggle guard (via the schema module) + both resume surfaces emit the adaptive executor
assertIncludes('scripts/kaola-workflow-claim.js', 'resolveEnableAdaptive');
assertIncludes('scripts/kaola-workflow-claim.js', 'workflow_path_refused');
assertIncludes('scripts/kaola-workflow-claim.js', 'PLAN_RUN_COMMAND');
// the adaptive executor command literal + path whitelist live in the shared schema anchor
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', '/kaola-workflow-plan-run');
assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'resolveEnableAdaptive');
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
// #281: parallel-batch aggregator presence + install.sh registration
assert(exists('scripts/kaola-workflow-parallel-batch.js'), '#281 parallel-batch aggregator missing from scripts/');
assert(exists('plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js'), '#281 parallel-batch aggregator missing from claude plugin');
assertIncludes('install.sh', 'kaola-workflow-parallel-batch.js');
// #281: frontier-unit semantics in plan-run executor surface (added by plan-run-semantics node)
assertIncludes('commands/kaola-workflow-plan-run.md', 'frontier unit');
// #281: efficient-DAG instruction in workflow-planner profile (added by planner-profile node)
assertIncludes('agents/workflow-planner.md', 'EFFICIENT DAGs');

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

console.log('Workflow contract validation passed');
