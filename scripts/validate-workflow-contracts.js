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

function assertAgentOwnedInit(file) {
  const content = read(file);
  const retired = [
    ['kaola-workflow-project-instruction', 'templates.js'].join('-'),
    ['kaola-workflow-project', 'instructions.js'].join('-'),
    ['KW', 'AGENTS', 'MANAGED'].join('-'),
    ['KW', 'CLAUDE', 'OVERLAY', 'MANAGED'].join('-'),
  ];
  for (const token of retired) assert(!content.includes(token), file + ' retains retired prompt ownership: ' + token);
  assertConcept(file, 'Agent-owned project instructions', [
    'The Agent owns the meaning and prose of project instructions',
    'repository facts',
    'Global Workflow Contract already loaded by the runtime',
    'Before changing an existing user-authored or owner-authored instruction file',
    'fresh top-level Agent/session',
  ]);
}

function assertBefore(file, first, second) {
  const content = norm(read(file));
  const nf = norm(first), ns = norm(second);
  assert(content.indexOf(nf) >= 0, file + ' must include: ' + first);
  assert(content.indexOf(ns) >= 0, file + ' must include: ' + second);
  assert(content.indexOf(nf) < content.indexOf(ns), file + ' must put ' + first + ' before ' + second);
}

// #796: a routing surface that cites a section of the workflow-planner profile must cite one that
// EXISTS. The citation shape is `its own *<Name>* section` (a `*A* / *B*` list form is also parsed,
// since that is the shape a stale citation took). Every extracted <Name> must resolve to an h2/h3
// heading in the profile. This guards the CLASS, not a literal: the router shipped green for a full
// release citing two section names that had been deleted from the profile, because no assertion ever
// compared the two files. Normalized content, so a line-wrapped citation still parses.

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
  // Only the legacy session-lease 'can-handoff' compound stays retired (kept above).
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
  'commands/kaola-workflow-finalize.md'
];
// #1014: do not add workflow-next to phaseCommands — finalize is the only routed command
// with Agent cards, while workflow-next is a lightweight routing surface.

// #770: the retired path SELECTOR vocabulary — KAOLA_PATH/--workflow-path no longer select or
// refuse anything, and the reason codes they used to feed are gone. Scoped to these agent-facing
// prose surfaces ONLY (never the shared `retired` array): claim.js legitimately still reads
// `KAOLA_PATH` for the persisted diagnostic field and documents `--workflow-path` as an accepted
// no-op flag, and CLAUDE.md:71 still carries the pre-#770 principle text (rewritten separately).
const retiredPathSelector = ['KAOLA_PATH', ['--workflow', 'path'].join('-'), 'path_not_installed',
  'workflow_path_refused', 'bundle_requires_adaptive'];

// The retired DAG-executor vocabulary. ONE list, two consumers: the next surfaces below, and the
// injected consumer CLAUDE.md template region on the init surfaces. It was previously an inline
// literal at the next-surface loop alone, and the template lives ONLY on the init surfaces — so a
// template rewritten to teach the retired executor passed every guard in this repo. Hoisted rather
// than copied: two lists of one rule is the drift, not the fix.
const retiredExecutor = ['workflow-plan.md', 'Node Ledger', 'plan_hash', 'workflow-planner',
  'post-dominat', 'parallel_safe', 'running-set', 'fan-out cap'];

for (const file of phaseCommands) {
  assert(exists(file), file + ' is missing');
  assertIncludes(file, 'workflow-state.md');
  // The retired heading, in the SHORT form that subsumes the longer "… Contract" wording this
  // used to pin. "Badge" named a cosmetic effect, not the mechanism; the pin follows the
  // vocabulary it forbids, so a half-applied revert of the rename cannot ship one heading here
  // and the other in the skeleton.
  assertNotIncludes(file, 'Agent Model Badge');
  assertNotIncludes(file, 'kaola_agent_model');
  for (const token of retired) assertNotIncludes(file, token);
  for (const token of retiredPathSelector) assertNotIncludes(file, token);
}

// Routed-fix Agent blocks identify the role they invoke; model and effort are runtime metadata
// and may be inherited or selected task-sensitively.
const routedFixFiles = [
  'commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
  'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
];
for (const file of routedFixFiles) {
  assertIncludes(file, 'subagent_type="build-error-resolver"');
}

assert(exists('commands/workflow-next.md'), 'workflow-next command is missing');
assert(!exists('commands/kaola-workflow.md'), 'legacy kaola-workflow command must not exist');
// A review-request sink leaves its folder open until the request lands, so the router must still
// sweep those folders on entry — otherwise a merged request's folder is mistaken for live work
// forever. Forge-renamed, so the pin is the sweep's own noun.
assertIncludes('commands/workflow-next.md', 'watch-pr');
assertIncludes('commands/workflow-next.md', '## Co-active Folders');
assert(!phaseCommands.includes('commands/workflow-next.md')
  && !phaseCommands.some(f => /workflow-next/.test(f)),
  'phaseCommands must not include workflow-next (next has no Agent cards; do not fold it into the finalize model="{ loop)');
{
  const nextCommandCopies = [
    'commands/workflow-next.md',
    'plugins/kaola-workflow-gitlab/commands/workflow-next.md',
    'plugins/kaola-workflow-gitea/commands/workflow-next.md',
  ];
  for (const file of nextCommandCopies) {
    assertIncludes(file, 'Dispatch when it materially reduces main-context residue');
    assertIncludes(file, 'Keep one owner for the current cohesive production surface');
    assertNotIncludes(file, 'model="{');
  }
}
for (const token of retired) assertNotIncludes('commands/workflow-next.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-next.md', token);
// #372: sweep the retired advisor-gate vocabulary over workflow-init.md too (the consult-mandate
// bullet lived here, inside the byte-locked KW-AGENTS-TEMPLATE region).
for (const token of retired) assertNotIncludes('commands/workflow-init.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-init.md', token);

// The router's contract, pinned end to end across all six next surfaces. Every needle here is
// forge-neutral, so one needle set fits all six — and all six must carry it, because a rule that
// reaches four of six is a propagation gap wearing a green build.
const nextSurfaces = [
  'commands/workflow-next.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-next.md',
  'plugins/kaola-workflow-gitea/commands/workflow-next.md',
  'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md',
];
for (const file of nextSurfaces) {
  // SELECTION. A user-named issue outranks everything, and the branch list must SAY so.
  assertIncludes(file, 'The user named an issue');
  assertIncludes(file, 'Never substitute another, and never adopt an active folder');
  assertIncludes(file, 'The user described a task but named no issue');
  assertIncludes(file, 'priority tier');
  assertIncludes(file, 'State the selection aloud before you claim it');
  // Everything before the claim is free, and the claim itself is bookkeeping rather than a door.
  assertIncludes(file, 'Everything before the claim is free');
  assertIncludes(file, 'The claim is bookkeeping');
  assertIncludes(file, 'reports a fact about the target rather than a verdict');
  assertIncludes(file, '--target-issue');
  assertIncludes(file, '--target-issues');

  // THE MISSION LIST. It is the run's only coordination record, so the surface must name the file,
  // carry the format itself rather than pointing at it, and carry the three write moments. The
  // reader of an installed surface is in a consumer repo, where no path into this repository's
  // docs resolves — so the order/absence facts have to travel with the surface.
  assertIncludes(file, 'kaola-workflow/{project}/mission-list.md');
  assertIncludes(file, 'nothing depends on a stable ID');
  assertIncludes(file, 'absent fields are simply absent');
  assertIncludes(file, 'status: todo');
  assertIncludes(file, 'dispatched: self');
  // ORDER IS THE WHOLE POINT: `dispatched` is written BEFORE the work goes out. Written after, the
  // file records nothing about the window in which a process actually dies.
  assertIncludes(file, 'before the work goes');
  assertBefore(file, 'Write the mission list', 'Run it');
  // An item is a mission, not a specification — the control boundary, one level up.
  assertIncludes(file, 'mission, not a specification');

  // CONCURRENCY CARRIES NO MACHINERY. This is a subtraction made durable: without the sentence,
  // nothing stops a proof obligation from being reintroduced as "just a small check".
  assertIncludes(file, 'No dispatch count, cap, disjointness proof');
  assertIncludes(file, 'justification, or fallback stigma attaches to the judgment');
  assertIncludes(file, 'Workflow adds no separate approval requirement, and dispatch remains subject to the active host/session permission policy');
  assertIncludes(file, 'Subagents and worktrees are tools, offered and declinable');

  // RESUME. The property the whole design was sized to, and the rule that makes it work.
  assertIncludes(file, 'Look for the work, not for the worker');
  assertIncludes(file, 'if the output the dispatch promised has landed');

  // CONSENT. The durable valve is gone; this sentence is the entire mechanism.
  assertIncludes(file, 'Irreversible and value-laden calls belong to the user');

  // The retired vocabulary must not return on any surface.
  for (const gone of retiredExecutor) {
    assertNotIncludes(file, gone);
  }
}
// The skeleton is the single source of all six surfaces above; sweep it too so a dangling
// cross-reference is red at the source and not only in the rendered output.
assertNotIncludes('templates/routing/next.skeleton.md', 'Backlog Inventory');
assertNotIncludes('templates/routing/next.skeleton.md', 'What You May Read');

// The commitment point does not refuse: the record is persisted and digested, and what the claim
// found is reported. Pin the durable anchor and the report, at the machine end that emits them.
assertIncludes('scripts/kaola-workflow-claim.js', 'selection_record_note');
assertIncludes('scripts/kaola-workflow-claim.js', 'selection_record_digest');

assert(exists('scripts/kaola-workflow-active-folders.js'), 'active folder reader is missing');
assert(exists('scripts/kaola-workflow-claim.js'), 'claim script is missing');
assert(exists('scripts/kaola-workflow-classifier.js'), 'classifier script is missing');
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
  'scripts/kaola-workflow-sink-merge.js',
  'scripts/kaola-workflow-sink-pr.js',
  'hooks/hooks.json',
  'install.sh',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md'
]) {
  for (const token of retired) assertNotIncludes(file, token);
}

assertIncludes('hooks/hooks.json', 'kaola-workflow-compact-recovery.md');
assertNotIncludes('hooks/hooks.json', 'compact-context.js');
assertNotIncludes('hooks/hooks.json', 'subagentStatusLine');
assertNotIncludes('hooks/hooks.json', 'kaola-workflow-subagent-statusline.js');
assertNotIncludes('hooks/hooks.json', 'session-env');
assertManifestScript('kaola-workflow-active-folders.js');     // #407: was install.sh literal
assertManifestScript('kaola-workflow-resolve-agent-model.js'); // #407: was install.sh literal
assertIncludes('uninstall.sh', 'subagentStatusLine');
assertNotIncludes('install.sh', 'kaola-workflow-session-env.js');
assert(exists('scripts/kaola-workflow-resolve-agent-model.js'), 'agent model resolver is missing');
assert(!exists('scripts/kaola-workflow-subagent-statusline.js'), 'subagent status line helper must not exist');

assert(exists('docs/workflow-state-contract.md'), 'detailed workflow state contract doc is missing');
// Root instructions dogfood the Agent-owned project contract. The validator pins repository facts,
// never headings, ordering, bytes, or a length target.
assertConcept('AGENTS.md', 'compact durable state contract', [
  'kaola-workflow/.roadmap/_rules.md',
  'only optional local roadmap file',
  'kaola-workflow/<run>/',
  'workflow-state.md',
  'mission-list.md'
]);
assertConcept('templates/global/kaola-workflow-global.md', 'machine-global Mission List contract', [
  'Mission List',
  'item',
  'status',
  'dispatched',
  'result',
  'in-flight',
]);
assertConcept('templates/routing/compact-recovery.skeleton.md', 'compact durable-state route', [
  'AGENTS.md',
  'workflow-state.md',
  'mission-list.md',
  'Workflow Next',
  'Finalization',
]);
assertConcept('docs/workflow-state-contract.md', 'durable sources', [
  'durable sources',
  'workflow-state.md',
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
assertIncludes('README.md', 'docs/workflow-state-contract.md');
assert(exists('AGENTS.md'), 'AGENTS.md must exist at repo root as the project authority');
assertNotIncludes('AGENTS.md', 'READ CLAUDE.md BEFORE ANY ACTION');
assertNotIncludes('AGENTS.md', ['KW', 'AGENTS', 'MANAGED'].join('-'));
assertNotIncludes('AGENTS.md', 'Correct first; never trade correctness for speed or cost');
assert(read('CLAUDE.md').split(/\r?\n/).filter(line => line.trim() === '@AGENTS.md').length === 1,
  'CLAUDE.md must carry exactly one effective @AGENTS.md bridge');
assertNotIncludes('CLAUDE.md', ['KW', 'CLAUDE', 'OVERLAY', 'MANAGED'].join('-'));
assertNotIncludes('CLAUDE.md', '## The mission list');
assertAgentOwnedInit('commands/workflow-init.md');

// #1047: runtime dispatch posture belongs to installed adapters and diagnostics, not project init.
assertNotIncludes('commands/workflow-init.md', 'claude_dispatch_posture: teams | classic');

// #1047: project instructions are Agent-maintained prose grounded in the repository. The shipped
// init surfaces define outcomes and consent, but own no canonical project prompt bytes or parser.
// Universal mission and routing behavior remains load-bearing in the global/dispatch sources.
{
  const globalContract = norm(read('templates/global/kaola-workflow-global.md'));
  const dispatchContract = norm(read('templates/routing/dispatch-contract.md'));
  for (const file of ['commands/workflow-init.md', 'templates/routing/init.skeleton.md']) assertAgentOwnedInit(file);
  for (const taught of ['Mission List', '`item`', '`status`', '`dispatched`', '`result`',
    'three write moments']) {
    assert(globalContract.includes(norm(taught)),
      'the machine-global contract must teach mission behavior — missing "' + taught + '"');
  }
  const runtimeRoutingVocabulary = ['Runtime dispatch contract (always loaded)',
    'named, built-in, and generic routes only under their real identities',
    'custody, evidence, and stop boundaries',
    'Never let a generic route impersonate a custody-bearing named role',
    'record the specific `capability_gap`'];
  for (const taught of runtimeRoutingVocabulary) {
    assert(dispatchContract.includes(norm(taught)),
      'the always-loaded dispatch source must teach honest item-local routing — missing "'
      + taught + '"');
  }
  const noImpersonation = 'Never let a generic route impersonate a custody-bearing named role';
  const impersonatingMutation = dispatchContract.replace(norm(noImpersonation), '');
  assert(!impersonatingMutation.includes(norm(noImpersonation)),
    'the consumer routing guard mutation removes no-impersonation before testing the oracle');
  assert(runtimeRoutingVocabulary.some(taught => !impersonatingMutation.includes(norm(taught))),
    'the consumer routing guard must reject a generic child that can impersonate a missing named role');
  const runtimeBrandOf = content => String(content).match(
    /\b(?:Claude|Codex|OpenCode|Kimi|Grok|Cursor|ZCode)\b/i);
  const runtimeBrand = runtimeBrandOf(globalContract + ' ' + dispatchContract);
  assert(!runtimeBrand,
    'the global and dispatch contracts must stay vendor-neutral'
    + (runtimeBrand ? ' — found "' + runtimeBrand[0] + '"' : ''));
  assert(!!runtimeBrandOf(globalContract + ' Cursor'),
    'the global routing guard mutation proves a vendor name would trip the neutral-authority oracle');
}

// issue #283: kaola-workflow-phase6.md hard-removed; kaola-workflow-finalize.md is the
// route-agnostic terminal routine. Assert canonical present + legacy absent.
assert(!exists('commands/kaola-workflow-phase6.md'),
  'commands/kaola-workflow-phase6.md must be absent (hard-removed by #283)'); // issue #283
assert(exists('commands/kaola-workflow-finalize.md'),
  'commands/kaola-workflow-finalize.md must be present (#283 terminal routine)');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-merge.js');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-sink-pr.js');
// #971: the assertIncludes for 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"' is
// DROPPED. It froze the one token that had to change. That path is cwd-relative and Step 9 carries
// no cd, so on a worktree run — operator standing in the linked worktree, run record resident in
// MAIN — every read in the capture misses and SINK_BRANCH reaches the sink EMPTY at exit 0. The pin
// blocked its own repair, and nothing static replaces it, because the property is "the capture binds
// the sink metadata whichever tree the operator stands in" and that is a runtime property of a shell
// block. Both shapes of valid fix were measured and they share no text: rooting the path deletes
// this spelling, prepending a cd to the main checkout leaves it byte-identical. A substring check
// must therefore reject one of them, which is inspecting the route rather than checking the result.
// So the capture is asserted by EXECUTION instead — test-bash-block-guards.js Test F runs the
// shipped block from both trees across all six rendered finalize surfaces and reads back what it
// bound. That also widens the surface: this line only ever looked at the GitHub command.
// The consumer (non-npm) arm must stay documented — the agent's own .cache/final-validation.md is
// what finalize reads there, not a chain receipt.
assertIncludes('commands/kaola-workflow-finalize.md', '.cache/final-validation.md');
assertIncludes('commands/kaola-workflow-finalize.md', 'verdict: pass');
// #900: the two pins above were GREEN while the recipe they defend was unusable. The gate also
// requires a column-0 validated_candidate_hash, so a record carrying only the file and the verdict is
// classified final_validation_unbound — a threshold cannot see a rule beneath its bar. Both halves are
// pinned, because either alone is insufficient: naming the field without naming a producer leaves the
// reader to reproduce a content address by hand, and naming the producer without the field lets a
// later edit drop the requirement the producer exists to satisfy. The invocation needle is split at
// the line continuation, so it pins the verb attached to the script AND the flags that make the
// record land bound.
assertIncludes('commands/kaola-workflow-finalize.md', 'validated_candidate_hash');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-validation-runner.js" record');
assertIncludes('commands/kaola-workflow-finalize.md', '--project {project} --verdict pass --command');
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-worktree');
// The compressed surface no longer carries numbered steps. Pin the outcome: sink metadata is
// captured before archive, while the active workflow-state file still exists.
assertIncludes('commands/kaola-workflow-finalize.md',
  'Capture branch, sink kind, issue and `issue_numbers` before archive');
// #816: ownership-inversion lock — the finalize seam is orchestrator-owned and the mechanical
// residue is ONE script transaction, so the command must carry NO dispatchable bookkeeping role
// and MUST carry the one-call transaction. Both directions are pinned: re-introducing a dispatch
// reds the chain, and dropping the transaction call reds it too.
assertNotIncludes('commands/kaola-workflow-finalize.md', 'subagent_type="contractor"');
assertNotIncludes('commands/kaola-workflow-finalize.md', 'contractor');
assertIncludes('commands/kaola-workflow-finalize.md', 'ONE resumable script transaction');
assertIncludes('commands/kaola-workflow-finalize.md',
  '(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG)');
// The two things the transaction will NOT do for the agent, in prose: it never authors the
// implementation commit, and it owns the worktree->main sync itself. Both were the recurring
// recovery mistakes, so both stay pinned.
assertIncludes('commands/kaola-workflow-finalize.md', 'never authors implementation commits');
assertIncludes('commands/kaola-workflow-finalize.md', 'worktree-to-main project-folder sync');
assertIncludes('commands/kaola-workflow-finalize.md', 'never hand-copy a staler main copy');

// #336: keep-open partial-close sink lane — pin the durable field, the sink-merge flag, and the
// merge-sink-only refusal prose (the exit-3 in-arm BLOCKED guard is shell prose no walkthrough
// executes, so this pin is its only mechanical enforcement).
assertIncludes('commands/kaola-workflow-finalize.md', 'issue_action');
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-issue-open');
assertIncludes('commands/kaola-workflow-finalize.md', 'merge-sink-only');
// THE VALIDATION REPORT — the finalize door measures and reports; it does not refuse. Both halves
// are pinned, because a conversion that emits a verdict and drops the durable state is a deletion
// rather than a conversion: the finding lands on the envelope AND under a heading in the summary.
assertIncludes('commands/kaola-workflow-finalize.md', 'It does not refuse');
assertIncludes('commands/kaola-workflow-finalize.md', 'under `validation`');
assertIncludes('commands/kaola-workflow-finalize.md', '## Validation');
assertIncludes('commands/kaola-workflow-finalize.md', '`changed_paths`');
assertIncludes('commands/kaola-workflow-finalize.md', '## Changed Paths');
// ...and the one hard stop that is NOT a gate: an archive that would lose a file.
assertIncludes('commands/kaola-workflow-finalize.md', 'fails loudly if it would lose a file');
// The retired executor vocabulary must not return on the finalize command.
for (const gone of ['workflow-plan.md', 'Node Ledger', 'plan_hash', '--verdict-check',
  '--gate-verify', '--barrier-check', '--resume-check', 'plan-validator']) {
  assertNotIncludes('commands/kaola-workflow-finalize.md', gone);
}
// assertBefore calls for 'commit -m "chore: finalize {project}"' and 'node "$CLAIM_JS" finalize'
// DROPPED: the finalize commit is no longer a prompt-authored bash step whose ORDER a command file
// could express. `cmdFinalize` owns it inside the one mechanical transaction, so the ordering is
// enforced by the code path (and its suite), not by token order in a command surface.

const packageJson = JSON.parse(read('package.json'));
assert(Array.isArray(packageJson.files) && packageJson.files.includes('hooks/'), 'package files must include hooks/');
assert(Array.isArray(packageJson.files) && packageJson.files.includes('scripts/'), 'package files must include scripts/');

const rootVersion = packageJson.version;
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
    (editionContent.match(/^##\s+Delegation\s*$/gm) || []).length === 1,
    file + ' must contain exactly one "## Delegation" heading (issue #212); a ' +
      'duplicated or divergent second section would defeat the cross-forge parity slice'
  );
}
const [, nextSkillBaselineFile] = nextSkillEditions[0];
const nextSkillBaseline = read(nextSkillBaselineFile);
const baselineDelegationContract = sectionBody(nextSkillBaseline, 'Delegation');
const baselineResumeClause = sectionBody(nextSkillBaseline, 'Resume');
assert(
  baselineDelegationContract.length > 0 && baselineResumeClause.includes('Look for the work'),
  nextSkillBaselineFile + ' must define a "## Delegation" section and a resume section carrying ' +
    'the look-for-the-work rule, to anchor the cross-forge parity baseline'
);
for (const [, file] of nextSkillEditions.slice(1)) {
  const content = read(file);
  assert(
    sectionBody(content, 'Delegation') === baselineDelegationContract,
    file + ' "## Delegation" section must byte-match the github baseline ' +
      nextSkillBaselineFile + ' (issue #211 cross-forge parity)'
  );
  assert(
    sectionBody(content, 'Resume') === baselineResumeClause,
    file + ' resume section must byte-match the github baseline ' + nextSkillBaselineFile +
      ' (cross-forge parity)'
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

// Every routed script call is `node "$KAOLA_SCRIPTS/…"`, and $KAOLA_SCRIPTS must be DEFINED via
// the kaola_script() resolver before its first use — an undefined handle is MODULE_NOT_FOUND in a
// consumer plugin install, which has no local scripts dir.
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola_script(){');
assertIncludes('commands/kaola-workflow-finalize.md', 'KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"');
assertIncludes('commands/workflow-next.md', 'kaola_script(){');
assertIncludes('commands/workflow-next.md', 'KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"');
// Dispatch-log attestation is retired on BOTH seams. It asked whether a `workflow-planner` subagent
// had been spawned before the plan was frozen; there is no planner agent and no plan to freeze, and
// inline authoring is the design rather than the bypass the detector watched for. Pinned as an
// ABSENCE so a revival reds the chain.
assertNotIncludes('scripts/kaola-workflow-claim.js', 'finalize_contractor_attested');
assertNotIncludes('scripts/kaola-workflow-claim.js', 'attestContractorSpawn');
assertNotIncludes('scripts/kaola-workflow-claim.js', 'claim_planner_attested');
assertNotIncludes('scripts/kaola-workflow-claim.js', 'attestPlannerSpawn');
assertNotIncludes('scripts/kaola-workflow-claim.js', '## Attestation');
// #816: the retired bookkeeping role must not come back as a file on any runtime.
assert(!exists('agents/contractor.md'), 'agents/contractor.md must be retired');
for (const forge of ['', '-gitlab', '-gitea']) {
  assert(!exists('plugins/kaola-workflow' + forge + '/agents/contractor.toml'),
    'plugins/kaola-workflow' + forge + '/agents/contractor.toml must be retired');
}
// #399/#816: the Step-8a artifact mirror lives INSIDE cmdFinalize and must still run the
// ledger-regression guard BEFORE the copy. #837 SUBTRACTS the operator obligation the guard used to
// raise (the "sync worktree→main FIRST" recovery phrase): the transaction performs that sync itself,
// and the refusal survives only for a sync the script cannot perform. Pin the guard, the retained
// top-level reason, and the re-typed inner reason, so a change that drops the guard or silently
// re-opens the operator obligation cannot pass — the 2026-06-11 audit reproduced the clobber live.
assertIncludes('scripts/kaola-workflow-claim.js', 'kaola-workflow-ledger-compare.js');
assertIncludes('scripts/kaola-workflow-claim.js', "reason: 'finalize_mirror_refused',");
assertIncludes('scripts/kaola-workflow-claim.js', 'if (!verdict.safe) {');
assertIncludes('scripts/kaola-workflow-claim.js', "inner_reason: 'mirror_sync_failed',");
// #816: the folded transaction — mirror, archive/close, roadmap staging, commit gate — plus the
// two typed guardrails that carry over. Dropping any of them reds the chain.
assertIncludes('scripts/kaola-workflow-claim.js', "reason: 'implementation_commit_missing',");
assertIncludes('scripts/kaola-workflow-claim.js', 'staging_guard_foreign_archive');
assertIncludes('scripts/kaola-workflow-claim.js', 'staging_guard_multi_project');
assertIncludes('scripts/kaola-workflow-claim.js', "'chore: finalize ' + args.project");
assertIncludes('scripts/kaola-workflow-claim.js', 'finalize_transaction');
assertIncludes('scripts/kaola-workflow-claim.js', 'writeFileAtomicReplace');
assertIncludes('scripts/kaola-workflow-sink-pr.js', 'writeFileAtomicReplace');
// #369: bundle all-or-nothing closure — sink-merge closes every member; finalize passes the set.
assertIncludes('scripts/kaola-workflow-sink-merge.js', '--issue-numbers');
assertIncludes('commands/kaola-workflow-finalize.md', 'SINK_ISSUE_NUMBERS');
assertIncludes('scripts/kaola-workflow-closure-contract.js', 'remote-members-closed');
// #429: resumable --sink transaction — step-receipt based pipeline, structured sink_blocked refusal.
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'isSinkMode');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink-receipt.json');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink_blocked');
assertIncludes('agents/implementer.md', 'smoke-integration');
// The `--enable-adaptive` flag is warn-ignored: accepted for back-compat and sets nothing. Pin the
// notice so a regression that silently honors the flag (writes a field / branches on it) reds the chain.
assertIncludes('install.sh', '--enable-adaptive has no effect');
// #266: the Codex preflight harness remains in the install allowlist. Compact recovery is a
// generated prompt artifact and must not re-enter the support-script manifest.
assert(exists('scripts/kaola-workflow-codex-preflight.js'), '#266 codex preflight script missing from scripts/');
assertManifestScript('kaola-workflow-codex-preflight.js');
assert(!installManifest.SUPPORT_SCRIPTS.some(name => /compact-(?:context|resume)\.js$/.test(name)),
  '#1044 compact recovery must not install a JavaScript prompt carrier');
assertIncludes('scripts/kaola-workflow-classifier.js', 'module.exports');
// #725/#770: adaptive is the ONLY installed path — the `installed_paths` union /
// `resolveInstalledPaths` resolver and the persisted next-work command are retired. Resumption
// follows the claim facts and the mission list instead of an executable state field.
// finalize adaptive prerequisite (#283: phase6 renamed to finalize)

// issue #290 / #288: pin the machine-readable findings-emission contract presence in all
// reviewer agent bodies (CLAUDE edition — .md bodies). Removing the emission section from
// any of these files must fail npm test so a re-vendor or refactor cannot silently drop it.
for (const reviewerBody of [
  'agents/code-reviewer.md',
  'agents/security-reviewer.md',
  'agents/adversarial-verifier.md'
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
// #281: efficient-DAG instruction in workflow-planner profile (added by planner-profile node)

// #341: forge-neutral agent-profile authoring guidance pinned in the planner profile +
// plan-run executor surface (the #328 gh-leak class).

// node-briefs channel relay + role-kind enumeration prose on the plan-run executor COMMAND
// surface (the Claude side of the Codex SKILL relay). The dispatch carries the node's brief as
// its task direction, instructs a consumer to read each upstream evidence file and record the
// consumed nonce, and derives the evidence-persistence kind from each role's tool manifest — no
// hand-list. The stale exclusive-contract enumerations (the hardcoded READ-ONLY / WRITE role
// lists) were replaced by the manifest-derived sentence; reintroducing either bold-header list
// reds the chain.


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

// Registry-driven route-reachability for the Claude command surface. Every routed command target
// MUST resolve to an installed command file in EACH Claude edition. The target set is DERIVED from
// the generated-surface registry — the same TOPICS table that renders the surfaces — so a hand-typed
// list can never disagree with what ships. The Codex twin lives in each
// validate-kaola-workflow-{,gitlab,gitea}-contracts.js (skills surface).
{
  const { TOPICS } = require('./generate-routing-surfaces.js');
  const emittedCommandTargets = Object.values(TOPICS).map(t => t.command_basename);
  assert(emittedCommandTargets.length >= 3,
    'route-reachability: the routing registry must carry the whole command surface');
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
        'route-reachability — routed command target "/' + target + '" has no installed ' +
        dir + '/' + target + '.md (broken route)');
    }
    // ...and the retired topics must NOT come back as orphan surfaces.
    for (const retiredTarget of ['kaola-workflow-plan-run', 'kaola-workflow-adapt']) {
      assert(!installed.has(retiredTarget),
        'route-reachability — ' + dir + '/' + retiredTarget + '.md is a retired routing surface');
    }
  }
}

// #1033: runtime-native profiles are checked from the one behavioral authority and architecture
// acceptance is wired into the producer-selected chain.
{
  const claudeChain = (packageJson.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('generate-agent-profiles.js --check'),
    '#1033: scripts."test:kaola-workflow:claude" must check generated runtime-native profiles');
  assert(claudeChain.includes('test-runtime-agent-architecture.js'),
    '#1033: scripts."test:kaola-workflow:claude" must run runtime architecture acceptance');
}

// #505 ITEM 1 / #816: the foreign-archive staging guard is no longer bash prose — it moved INTO
// the finalize transaction as a typed refusal. Pin the refusal in the producer script (a silent
// drop is the #294 fail-open class) and the surviving pointer in the finalize command, so neither
// half can vanish unnoticed.
assertIncludes('scripts/kaola-workflow-claim.js', "band && band !== project && band.indexOf(project + '.archived-') !== 0");
assertIncludes('commands/kaola-workflow-finalize.md', 'Stage only this project');

// n5 (#653 finding D): selection-evidence docking + run-gap manual-seed prose must reach the
// router + finalize/plan-run surfaces, and the observed_gap_unseeded refusal must be documented.
assertIncludes('commands/kaola-workflow-finalize.md', 'run-gaps-manual.md');

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

// VENDOR_MODEL_NOUN_BAN: no agent-facing prompt surface, in ANY edition, may name a vendor's
// model by brand. A prompt describes the reasoning class it needs — `reasoning tier`,
// `reasoning-floor`, `standard tier` — never "Opus"/"Sonnet"/"GPT-5". A brand noun is wrong on
// three of the four runtimes that read the same wording, and it silently re-teaches a rule the
// portable plan vocabulary already states.
//
// This is the ALWAYS-ON half of the rule. Neutral wording used to be produced by per-runtime
// rewrite transforms applied on the way out; those are retired, because generated text must be
// runtime-neutral AT THE SOURCE. With the transforms gone, this scan is the only thing standing
// between a brand noun and four shipped editions, so it lives here — inside the claude chain —
// rather than in a runtime suite that no chain runs.
//
// EXEMPT-LIST, NOT ALLOWLIST. Every .md/.toml under every declared root is scanned; a newly-added
// prompt surface is guarded the moment it lands, with no registration step. Only an explicitly
// named path with a stated reason is skipped. History is out of scope by construction — it is not
// under these roots: docs/decisions/, docs/investigations/, docs/audits/, and CHANGELOG.md record
// what was decided and when, and rewriting them would falsify the record.
//
// Lowercase `opus`/`sonnet` are DELIBERATELY not matched: they are the portable plan `model`-column
// tier tokens, a closed machine vocabulary, not prose about a vendor. Their live carriers are the
// resolver's DEFAULT_AGENT_MODELS and the agent frontmatter it is pinned against
// (kaola-workflow-resolve-agent-model.js).
{
  const VENDOR_MODEL_NOUN_BAN =
    /\b(Opus|Sonnet|Haiku|Gemini|Llama|Mistral|Grok|Qwen|DeepSeek|GPT-[0-9][\w.-]*|GLM-[0-9][\w.-]*)\b/;

  const editions = ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'];
  const promptSurfaceRoots = [
    { dir: 'commands' },
    { dir: 'agents' },
    ...editions.flatMap(edition => [
      // The github Codex plugin ships SKILL packs rather than command files; the two forge plugins
      // ship both. A root that is absent for that structural reason is declared optional here, so
      // a root that goes missing for ANY OTHER reason still fails closed.
      { dir: 'plugins/' + edition + '/commands', optional: edition === 'kaola-workflow' },
      { dir: 'plugins/' + edition + '/skills' },
      { dir: 'plugins/' + edition + '/agents' }
    ])
  ];

  // Paths intentionally allowed to carry a brand noun, each with the reason it must. Empty is the
  // correct steady state: an entry here is a documented exception, never a parking spot for a
  // surface someone did not want to fix.
  const VENDOR_NOUN_EXEMPT = new Map([]);

  const scanned = [];
  for (const { dir, optional } of promptSurfaceRoots) {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) {
      assert(optional === true,
        'VENDOR_MODEL_NOUN_BAN — declared prompt-surface root "' + dir + '" is missing; the guard ' +
        'cannot scan it. Restore the directory, or mark the root optional with a stated reason.');
      continue;
    }
    const stack = [absolute];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(md|toml)$/.test(entry.name)) scanned.push(path.relative(root, full));
      }
    }
  }

  // A guard that scans nothing passes everything. Assert the walk actually reached the surfaces.
  assert(scanned.length >= 60,
    'VENDOR_MODEL_NOUN_BAN — expected to scan every prompt surface across all editions, but only ' +
    scanned.length + ' file(s) were reached; the root list or the directory walk is broken.');

  for (const rel of scanned.sort()) {
    if (VENDOR_NOUN_EXEMPT.has(rel)) continue;
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(VENDOR_MODEL_NOUN_BAN);
      if (m) {
        assert(false,
          rel + ':' + (i + 1) + ': VENDOR_MODEL_NOUN_BAN — vendor model noun "' + m[0] +
          '" must not appear in an agent-facing prompt surface. Name the reasoning class instead ' +
          '(e.g. "reasoning tier", "reasoning-floor", "standard tier"); the lowercase `opus`/' +
          '`sonnet` plan-column aliases are unaffected. See docs/conventions.md.');
      }
    }
  }

  // Stale-exemption sweep: an exemption that no longer names a real file, or names a file that no
  // longer needs it, is deleted rather than carried. Bidirectional by construction.
  for (const [rel, reason] of VENDOR_NOUN_EXEMPT) {
    assert(typeof reason === 'string' && reason.trim().length > 0,
      'VENDOR_MODEL_NOUN_BAN — exemption "' + rel + '" must state a one-line reason');
    assert(exists(rel),
      'VENDOR_MODEL_NOUN_BAN — exemption "' + rel + '" names a file that does not exist; delete it');
    assert(VENDOR_MODEL_NOUN_BAN.test(read(rel)),
      'VENDOR_MODEL_NOUN_BAN — exemption "' + rel + '" is stale: the file carries no vendor model ' +
      'noun. Delete the exemption so the surface is guarded again.');
  }
}

// #1047: workflow-init no longer owns a fixed consumer docs tree. The Agent derives useful
// project documentation from repository facts, so a parser that equates one canned tree with
// every valid consumer path is retired with that mechanism.

console.log('Workflow contract validation passed');
