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

// #796: a routing surface that cites a section of the workflow-planner profile must cite one that
// EXISTS. The citation shape is `its own *<Name>* section` (a `*A* / *B*` list form is also parsed,
// since that is the shape a stale citation took). Every extracted <Name> must resolve to an h2/h3
// heading in the profile. This guards the CLASS, not a literal: the router shipped green for a full
// release citing two section names that had been deleted from the profile, because no assertion ever
// compared the two files. Normalized content, so a line-wrapped citation still parses.
function assertProfileSectionCitations(file, profile) {
  const cited = [];
  for (const run of norm(read(file)).matchAll(/its own ((?:\*[^*\n]+\*(?:\s*(?:\/|,|and)\s*)?)+)/g)) {
    for (const name of run[1].matchAll(/\*([^*]+)\*/g)) cited.push(name[1].trim());
  }
  assert(cited.length > 0,
    file + ' must cite at least one ' + profile + ' section as `its own *<Name>* section`');
  const headings = new Set();
  for (const line of read(profile).split('\n')) {
    if (!/^#{2,3}\s/.test(line)) continue;
    const text = line.replace(/^#{2,3}\s+/, '').trim();
    headings.add(text);
    // a heading may carry a trailing `— gloss`; the citable title is the part before it
    headings.add(text.split(/\s+[—–-]\s+/)[0].trim());
  }
  for (const name of cited) {
    assert(headings.has(name), file + ' cites a ' + profile + ' section that does not exist: ' + name);
  }
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
assertIncludes('commands/workflow-next.md', 'watch-pr');
assertIncludes('commands/workflow-next.md', '## Co-active Folders');
// issue #203: Select Project active-folder definition must include fast-summary.md (drift-guard A;
// the classifier's trap-2 tolerant fast-summary.md read survives retirement, so the router's
// active-folder detection still recognizes a legacy fast-summary.md marker).
assertIncludes('commands/workflow-next.md', '`workflow-plan.md` or a `workflow-state.md`');
// #380/#789: the auto-bundle entry must stay REACHABLE — Step 0 branches on whether the user
// named an issue, and the no-issue-named branch routes to the adaptive front end with no target
// (regression-locks the #380 unreachable-entry defect; #789 retired the issue-scout hop in favor
// of the workflow-planner's own no-target survey mode). Pin the branch marker + the no-target
// hand-off contract.
assertIncludes('commands/workflow-next.md', 'Branch first on whether the user named an issue');
assertIncludes('commands/workflow-next.md', 'auto-bundle entry');
assertIncludes('commands/workflow-next.md', 'No target (auto-bundle entry)');
for (const token of retired) assertNotIncludes('commands/workflow-next.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-next.md', token);
// #372: sweep the retired advisor-gate vocabulary over workflow-init.md too (the consult-mandate
// bullet lived here, inside the byte-locked KW-CLAUDE-TEMPLATE region).
for (const token of retired) assertNotIncludes('commands/workflow-init.md', token);
for (const token of retiredPathSelector) assertNotIncludes('commands/workflow-init.md', token);

// #796: the router's issue-selection contract is now pinned end to end across all six next
// surfaces. Every needle here was unasserted before, which is exactly how a cross-reference to two
// deleted profile sections survived a release: correct-looking prose with nothing checking it.
// The tokens are forge-neutral, so one needle set fits all six (same shape as the #486 loop above).
const nextSurfaces796 = [
  'commands/workflow-next.md',
  'plugins/kaola-workflow-gitlab/commands/workflow-next.md',
  'plugins/kaola-workflow-gitea/commands/workflow-next.md',
  'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
  'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md',
  'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md',
];
for (const file of nextSurfaces796) {
  // A user-named issue outranks an active folder, and the numbered procedure must SAY so before it
  // reaches the active-folder step. Order is half the fix (a reader following top-to-bottom hit the
  // unconditional active-folder adoption first); the explicit match condition is the other half.
  assertBefore(file, 'A named target is never substituted', 'if exactly one active folder is already present');
  assertIncludes(file, 'do not read, adopt, or fall back to an active folder');
  // The described-task branch and the guarantee that makes it worth having: no survey, so the
  // roadmap frontier cannot outrank the work the user actually asked for.
  assertIncludes(file, 'User described a task but named no issue');
  assertIncludes(file, 'the backlog survey NEVER runs on this branch');
  // The no-target entry states its default in its FIRST paragraph, not after the bundle prose.
  assertIncludes(file, 'Single-issue is the default here');
  // The selection-evidence sidecar has a NAMED writer, so surface prose, the claim-side probe, and
  // the walkthrough legs tell one story instead of asserting a file nobody was told to write.
  // #825 re-homed that writer: selection is orchestrator-owned, so the router IS the writer now.
  assertIncludes(file, 'the orchestrator is that sidecar');
  assertIncludes(file, 'selection_mode: auto-bundle|single-issue');
  // #825 (B2): the ranking rules MOVED here from the planner profile — one wording, re-homed, not
  // paraphrased. Pin the load-bearing literals so a later reword cannot quietly soften them, and
  // pin the retired heading's absence so the survey block cannot creep back onto the router.
  for (const relocated of ['Bundle Selection Rules', 'lane_bucket', '### Project rules']) {
    assertIncludes(file, relocated);
  }
  // The orchestrator authors the record, so the surface must name the flag it passes and the
  // note it gets back when the claim had to synthesize one instead.
  assertIncludes(file, '--selection-record');
  assertIncludes(file, 'selection_record_note');
  assertIncludes(file, 'selection_mode');
  assertNotIncludes(file, "planner's no-target survey mode");
  // The FRONT-END-ENTRY enumeration must carry the described-task case too — not just the Step 0
  // selection branch above. These are different sections, and pinning only the selection branch is
  // what let the gap ship: the three SKILL surfaces kept the selection branch but never gained the
  // entry case, so the described-task state fell through to the no-target case below it and routed
  // to adapt with NO argument, silently dropping the description into the backlog survey.
  assertIncludes(file, 'Task description (no issue number)');
  // Order is load-bearing: the described-task case must be reachable BEFORE the no-target case,
  // because the no-target case would otherwise match the described-task state first.
  assertBefore(file, 'Task description (no issue number)', 'No target (auto-bundle entry)');
  // ...and the no-target case must exclude the described-task state explicitly, so the two cases
  // cannot both match a single state on a top-to-bottom read.
  assertIncludes(file, 'and the user described no task');
  // The two section names the router used to cite are headings in no profile; they must not return.
  assertNotIncludes(file, 'Backlog Inventory');
  assertNotIncludes(file, 'What You May Read');
  // ...and the structural guard for the whole class, not just those two literals.
  assertProfileSectionCitations(file, 'agents/workflow-planner.md');
}
// The skeleton is the single source of all six surfaces above; sweep it too so a dangling
// cross-reference is red at the source and not only in the rendered output.
assertNotIncludes('templates/routing/next.skeleton.md', 'Backlog Inventory');
assertNotIncludes('templates/routing/next.skeleton.md', 'What You May Read');

// #796: the adapt entry contract. The surface must document the entry shapes it can receive, carry
// the planner dispatch's binding-scope field, and render a defined no-target target slot — before
// this, adapt documented no entry shape but an issue number, so the described-task route had no
// receiving end at all. Same six surfaces as the #486 loop; the tokens are forge-neutral.
for (const file of adaptSurfaces486) {
  assertIncludes(file, 'Entry contract');
  assertIncludes(file, 'Binding scope:');
  // #825: the no-target slot renders the ORCHESTRATOR-selected issue now, not an instruction to
  // the planner to go survey.
  assertIncludes(file, 'the orchestrator-owned no-target survey selected');
  // #825 (B3/B4): evidence flows in as PATHS and the planner has a typed way to say
  // under-determined. Both must reach all six adapt surfaces or one runtime loses the channel.
  assertIncludes(file, '.cache/origin/');
  assertIncludes(file, 'clarification_required');
  assertIncludes(file, 'planner_control_boundary_violation');
}

// #825 (B3 + B5): the planner is a SYNTHESIST — selection left the profile for the orchestrator
// surfaces. The re-pin is bidirectional in ONE diff: the retired lock is asserted ABSENT from
// every planner profile (a positive pin alone would let the old block creep back beside the new
// prose), and the two obligations that replace it are asserted PRESENT. Node-level
// non-redundancy is deliberately NOT asserted anywhere: it is not mechanically decidable, so it
// stays a prose obligation and never becomes a validator refusal code.
const plannerProfiles825 = [
  'agents/workflow-planner.md',
  'plugins/kaola-workflow/agents/workflow-planner.toml',
  'plugins/kaola-workflow-gitlab/agents/workflow-planner.toml',
  'plugins/kaola-workflow-gitea/agents/workflow-planner.toml',
];
for (const profile of plannerProfiles825) {
  assertNotIncludes(profile, 'No-target survey mode');
  assertIncludes(profile, 'do not author a node to re-derive it');
  assertIncludes(profile, 'Consume evidence, never accept a conclusion');
  assertIncludes(profile, 'clarification_required');
  // The control boundary is UNCHANGED and stays load-bearing: narrowing the planner must not
  // open it to a pre-authored DAG.
  assertIncludes(profile, 'planner_control_boundary_violation');
}
assertNotIncludes('agents/workflow-planner.md', 'surveys the backlog itself');
assertNotIncludes('agents/workflow-planner.md', 'selects a bundle jointly with how it decomposes');
// The commitment point does not refuse: the record is persisted and digested, and what the claim
// found is reported. Pin the durable anchor and the report, at the machine end that emits them.
assertIncludes('scripts/kaola-workflow-claim.js', 'selection_record_note');
assertIncludes('scripts/kaola-workflow-claim.js', 'selection_record_digest');
assertIncludes('scripts/kaola-workflow-adaptive-handoff.js', 'clarification_required');
// The CHANNEL is pinned; the CAP is not, because there is no longer a cap. `round`/`prior_rounds`
// ride the return as data and no threshold fires against them — a bound on how many times an agent
// may ask a question is exactly the kind of harness this design retires. Retiring a token retires
// its needle in the same diff, or the pin outlives the thing it was pinning.
assertIncludes('scripts/kaola-workflow-adaptive-handoff.js', 'prior_rounds');
assertIncludes('scripts/kaola-workflow-claim.js', 'probeSelectionEvidence');
assertIncludes('scripts/kaola-workflow-claim.js', 'selection-evidence.md');

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
assertIncludes('commands/kaola-workflow-finalize.md', 'final_validation_unverified');
// #653: the consumer candidate binding (validated_candidate_hash) — the plan-run All-done consumer
// block must instruct recording the hash so the verdict is bound to the exact validated tree.
assertIncludes('commands/kaola-workflow-plan-run.md', 'validated_candidate_hash');
assertIncludes('commands/kaola-workflow-finalize.md', '--keep-worktree');
assertIncludes('commands/kaola-workflow-finalize.md', 'Use the sink metadata captured before Step 8b');
// #816: ownership-inversion lock — the finalize seam is orchestrator-owned and the mechanical
// residue is ONE script transaction, so the command must carry NO dispatchable bookkeeping role
// and MUST carry the one-call transaction. Both directions are pinned: re-introducing a dispatch
// reds the chain, and dropping the transaction call reds it too.
assertNotIncludes('commands/kaola-workflow-finalize.md', 'subagent_type="contractor"');
assertNotIncludes('commands/kaola-workflow-finalize.md', 'contractor');
assertIncludes('commands/kaola-workflow-finalize.md', 'ONE resumable script transaction');
assertIncludes('commands/kaola-workflow-finalize.md', 'node "$CLAIM_JS" finalize \\\n  --project {project} --keep-worktree $SINK_KEEP_OPEN_FLAG');
assertIncludes('commands/kaola-workflow-finalize.md', 'implementation_commit_missing');
assertIncludes('commands/kaola-workflow-finalize.md', 'staging_guard_multi_project');
assertIncludes('commands/kaola-workflow-finalize.md', 'finalize_mirror_refused');

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
// assertBefore calls for 'commit -m "chore: finalize {project}"' and 'node "$CLAIM_JS" finalize'
// DROPPED: the finalize commit is no longer a prompt-authored bash step whose ORDER a command file
// could express. `cmdFinalize` owns it inside the one mechanical transaction, so the ordering is
// enforced by the code path (and its suite), not by token order in a command surface.

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
// #338: anti-drift pin — the finalize sink row is main-session-direct (not subagent-invoked).
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'main-session-direct');
assertIncludes('commands/kaola-workflow-plan-run.md', 'main-session-direct');
// #344: every adaptive lifecycle call is `node "$KAOLA_SCRIPTS/…"`; $KAOLA_SCRIPTS must be
// DEFINED via the kaola_script() resolver before its first use — an undefined handle is
// MODULE_NOT_FOUND in a consumer plugin install (no local scripts dir). Pin the resolver + the
// assignment so removing either regresses the chain.
// #360: the consent-halt clear path is the script-owned `clear-halt` subcommand, not an agent
// lockstep — pin its presence in the prose + the script so the prose mutation cannot return.
assertIncludes('commands/kaola-workflow-plan-run.md', 'clear-halt');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'clear-halt'");
// #434: repair-node subcommand + its output tokens (anti-laundering signal + orient
// requires_redispatch field for absent-evidence detection). The discard verb that used to be pinned
// alongside it is gone: the overflow verdict it existed to clear is a report now, so the only path
// that unlinked a production file the agent had just written has no caller and no reason to exist.
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
// #816: the finalize seam records no attestation — the field, the back-fill, and the inline-suspect
// warning are retired. Pinned as an ABSENCE so a revival reds the chain, alongside the POSITIVE pin
// on the folded transaction below (the two directions of the same invariant).
assertNotIncludes('scripts/kaola-workflow-claim.js', 'finalize_contractor_attested');
assertNotIncludes('scripts/kaola-workflow-claim.js', 'attestContractorSpawn');
// #347: pin the planner self-attest back-fill flag (the #280 producer) so the forge-port asymmetry
// it surfaced cannot recur — the producer must exist on every edition that ships the consumer (#300).
assertIncludes('scripts/kaola-workflow-claim.js', '--attest-planner-spawn');
// the planner startup surface itself must instruct the flag, not just the producer script.
assertIncludes('agents/workflow-planner.md', '--attest-planner-spawn');
// persistence lock: a non-empty attestation warning must be transcribed into the durable summary.
assertIncludes('scripts/kaola-workflow-claim.js', '## Attestation');
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
// #789: issue-scout is fully retired — the router no longer dispatches PRE-CLAIM at all; the
// no-issue-named branch instead routes to the adaptive front end with NO target, and the
// workflow-planner's own no-target survey mode owns the backlog survey. Pin the no-target
// hand-off contract and assert the retired scout vocabulary never resurfaces.
assertIncludes('commands/workflow-next.md', 'No target (auto-bundle entry)');
// #825: the survey is the ORCHESTRATOR's now — the router states the selection contract itself
// instead of pointing at a planner section that no longer exists.
assertIncludes('commands/workflow-next.md', 'the ORCHESTRATOR is the');
assertNotIncludes('commands/workflow-next.md', 'issue-scout');
assertNotIncludes('commands/workflow-next.md', 'ISSUE_SCOUT_MODEL');
// adapt (authoring) + plan-run (executor) prose: artifacts, gates, caps, governance
// #277 M3: FANOUT_CAP and post-dominate concepts relocated from commands/kaola-workflow-adapt.md
// (now a dispatch-handle-only file) to agents/workflow-planner.md (sole home of authoring procedure).
assertConcept('agents/workflow-planner.md', 'adaptive authoring', [
  'workflow-plan.md', '## Nodes', 'post-dominate', 'finalize', 'FANOUT_CAP', 'plan_hash', 'typed refusal'
]);
// Where a workflow-planner dispatch block is documented it must stay COMPLETE (the Agent block AND
// its model badge) — a block missing its badge is a broken call. This pins the SHAPE of the block,
// never that one is taken: running the planner role in-session instead is a free choice.
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
assertNotIncludes('commands/kaola-workflow-plan-run.md', "derived from each role's tool manifest");
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

// #604: dispatch visibility announcement contract — run-start, pre-spawn, on-return, and the
// inline-fallback format, verbatim.

// #605: required progress-echo line printed after every close-and-open-next.

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
  assertNotIncludes(file, 'the unconditional mandate applies identically to this dispatch mode');
  assertNotIncludes(file, 'not a valid path for tiered nodes');
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

// #505 ITEM 1 / #816: the foreign-archive staging guard is no longer bash prose — it moved INTO
// the finalize transaction as a typed refusal. Pin the refusal in the producer script (a silent
// drop is the #294 fail-open class) and the surviving pointer in the finalize command, so neither
// half can vanish unnoticed.
assertIncludes('scripts/kaola-workflow-claim.js', "band && band !== project && band.indexOf(project + '.archived-') !== 0");
assertIncludes('commands/kaola-workflow-finalize.md', 'staging_guard_foreign_archive');
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
// tier aliases (schema TIER_ALIASES), a closed machine vocabulary, not prose about a vendor.
{
  const VENDOR_MODEL_NOUN_BAN =
    /\b(Opus|Sonnet|Haiku|Gemini|Llama|Mistral|Grok|Qwen|DeepSeek|GPT-[0-9][\w.-]*|GLM-[0-9][\w.-]*)\b/;

  const editions = ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'];
  const promptSurfaceRoots = [
    { dir: 'commands' },
    { dir: 'agents' },
    // Shipped by install.sh into every forge's support dir; the plan-run command routes into them,
    // so they are read as prompt text at runtime exactly like a command body.
    { dir: 'docs/plan-run-cards' },
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
  assert(scanned.length >= 90,
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

console.log('Workflow contract validation passed');
