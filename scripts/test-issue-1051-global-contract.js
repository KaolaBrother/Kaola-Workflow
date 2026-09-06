#!/usr/bin/env node
'use strict';

// issue #1051 — compact the machine-global Workflow contract while keeping daily
// governance, a complete run-record, recovery, and the named semantic boundaries.
// Word/byte counts are a measurement helper only; they are not a pass/fail gate.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GLOBAL = path.join(ROOT, 'templates', 'global', 'kaola-workflow-global.md');
const NEXT = path.join(ROOT, 'templates', 'routing', 'next.skeleton.md');
const FINALIZE = path.join(ROOT, 'templates', 'routing', 'finalize.skeleton.md');
const DISPATCH = path.join(ROOT, 'templates', 'routing', 'dispatch-contract.md');
const COMPACT = path.join(ROOT, 'templates', 'routing', 'compact-recovery.skeleton.md');
const ROLES = path.join(ROOT, 'templates', 'agents', 'behavior-contracts.json');
const CONFIG_FILE = path.join(ROOT, 'kaola-workflow', 'config.json');

let passed = 0;
let failed = 0;
function ok(value, message) {
  if (value) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error('FAIL: ' + message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function norm(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}
function englishWordCount(text) {
  return (String(text).match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
}
function byteLength(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

const globalRaw = read(GLOBAL);
const nextRaw = read(NEXT);
const finalizeRaw = read(FINALIZE);
const dispatchRaw = read(DISPATCH);
const compactRaw = read(COMPACT);
const rolesRaw = read(ROLES);
const global = norm(globalRaw);
const next = norm(nextRaw);
const finalize = norm(finalizeRaw);
const dispatch = norm(dispatchRaw);
const compact = norm(compactRaw);
const roles = norm(rolesRaw);
const execution = next + ' ' + dispatch + ' ' + roles;

const lines = globalRaw.split(/\r?\n/).length;
const words = englishWordCount(globalRaw);
const bytes = byteLength(globalRaw);
console.log(
  `issue-1051 measurement helper (not a gate): lines=${lines} english_words=${words} bytes=${bytes}`);

function teachesFullClaimPath(text) {
  return String(text).includes('kaola-workflow/{project}/workflow-state.md');
}
function teachesFullRunPath(text) {
  return String(text).includes('kaola-workflow/{project}/mission-list.md');
}
function teachesForgeBacklog(text) {
  return /The forge's open issue list is backlog truth/i.test(text);
}
function teachesExplicitCommentCorrections(text) {
  return /later comments/i.test(text) && /explicit corrections?/i.test(text);
}
function teachesRoadmapLocation(text) {
  return String(text).includes('kaola-workflow/.roadmap/_rules.md')
    && /no local backlog mirror/i.test(text);
}
function teachesPriorityConfig(text) {
  return String(text).includes('kaola-workflow/config.json')
    && String(text).includes('priority_top_tier_labels');
}
function teachesOrganizingDoesNotClaim(text) {
  return /organiz(?:e|ing) issues/i.test(text)
    && /does not auto-claim|do not auto-claim/i.test(text);
}
function teachesOrganizingDoesNotCreateMissionList(text) {
  return /organiz(?:e|ing) issues/i.test(text)
    && /Mission List/i.test(text)
    && /does not auto-create/i.test(text);
}
function teachesDailyGovernanceDoesNotCreateRun(text) {
  return /does not auto-create a run/i.test(text);
}
function teachesActiveRunRespected(text) {
  return /active run/i.test(text) && /respect/i.test(text);
}
function teachesFourFields(text) {
  return ['item', 'status', 'dispatched', 'result'].every(field => String(text).includes(field));
}
function teachesThreeWrites(text) {
  return /three write moments/i.test(text)
    && /before the work goes out/i.test(text)
    && /output will land/i.test(text);
}
function teachesImmutableResults(text) {
  return /completed item and its result are immutable/i.test(text)
    && /FAIL/i.test(text) && /BLOCKED/i.test(text);
}
function teachesRecoverableOutcome(text) {
  return /mission is a recoverable outcome/i.test(text)
    && /failed command, intermediate finding, repair attempt, or review round does not create another mission/i.test(text);
}
function teachesLifecycleOutsideList(text) {
  return /Finalization, issue closure, archive, and sink are not Mission List items/i.test(text);
}
function teachesMissionEnumeration(text) {
  return /not a specification, selector/i.test(text)
    && /independent causal class/i.test(text);
}
function teachesIndependentAcceptance(text) {
  return /implementer may not delete, weaken, or reinterpret that acceptance/i.test(text)
    || /never weakens, deletes, skips, or changes the behavior they accept/i.test(text)
    || /What you may never do is change what a test accepts/i.test(text);
}
function teachesGrantedScopeContinue(text) {
  return /already[- ]granted|granted (?:authorization|scope)/i.test(text)
    && /continue/i.test(text);
}
function teachesUnauthorizedStillEscalate(text) {
  return /irreversible/i.test(text) && /value-laden/i.test(text) && /\buser\b/i.test(text);
}
function keepsObservedFailureGate(text) {
  return /Add only what an observed failure demands/i.test(text);
}
function teachesRequestedWorkWithoutPriorFailure(text) {
  return /user-requested|requested (?:new )?feature|user'?s goal/i.test(text)
    && !keepsObservedFailureGate(text);
}
function keepsProjectOnlyStricter(text) {
  return /Project instructions add only verified local facts and stricter constraints/i.test(text);
}
function teachesProjectExceptionScope(text) {
  return /project exception/i.test(text)
    && /scope/i.test(text)
    && /higher-priority/i.test(text);
}
function teachesEvidenceInferenceUnknown(text) {
  return /\bevidence\b/i.test(text) && /\binference\b/i.test(text) && /\bunknown/i.test(text);
}
function teachesCorrectnessOrder(text) {
  return /Correct first/i.test(text)
    && /Then save human time/i.test(text)
    && /Then spend as little as possible/i.test(text);
}
function teachesMeasureCurrentTruth(text) {
  return /Measure current truth/i.test(text) && /Read the target/i.test(text);
}
function teachesLocalVerdicts(text) {
  return /Own your own verdicts/i.test(text);
}
function teachesNoUnexecutedClaims(text) {
  return /Never claim an unexecuted environment, device, service, or user acceptance/i.test(text);
}
function teachesReverifyAfterMutation(text) {
  return /Mutation invalidates affected PASS evidence/i.test(text)
    || (/re-verif/i.test(text) && /scope of the change/i.test(text));
}
function teachesVerifyAtChangeScope(text) {
  return /scope of the change/i.test(text) || /verify at the scope/i.test(text);
}
function teachesResumeFrontier(text) {
  return /list minus done minus in-flight/i.test(text)
    && /in-flight/i.test(text);
}
function teachesNoReclaimInFlight(text) {
  return /without intake or claim/i.test(text);
}

ok(teachesForgeBacklog(global),
  'A1: global teaches forge open issues as backlog truth');
ok(teachesExplicitCommentCorrections(global),
  'A1: global teaches later comments with explicit corrections win');
ok(teachesRoadmapLocation(global),
  'A1: global keeps .roadmap/_rules.md and no local backlog mirror');
ok(teachesPriorityConfig(global),
  'A1: global keeps kaola-workflow/config.json / priority_top_tier_labels');
ok(teachesFullClaimPath(global),
  'A1: global names kaola-workflow/{project}/workflow-state.md as the claim path');
ok(teachesFullRunPath(global),
  'A1: global names kaola-workflow/{project}/mission-list.md as the run path');
ok(teachesOrganizingDoesNotClaim(global),
  'A1: organizing issues does not auto-claim');
ok(teachesOrganizingDoesNotCreateMissionList(global),
  'A1: organizing issues does not auto-create a Mission List');
ok(teachesDailyGovernanceDoesNotCreateRun(global),
  'A1: daily governance does not auto-create a run');
ok(teachesActiveRunRespected(global),
  'A1: other operations respect an active run');
ok(!fs.existsSync(CONFIG_FILE),
  'A1: producer tree keeps the config.json interface convention only (do not create the file)');

for (const token of [
  "The forge's open issue list is backlog truth",
  'kaola-workflow/.roadmap/_rules.md',
  'priority_top_tier_labels',
  'kaola-workflow/config.json',
]) {
  ok(global.includes(token), `A1: backlog/governance token stays in global: ${token}`);
}

ok(teachesFourFields(global), 'A2: global keeps the four Mission List fields');
ok(teachesThreeWrites(global), 'A2: global keeps the three write moments including output landing');
ok(teachesImmutableResults(global), 'A2: global keeps immutable completed results including FAIL/BLOCKED');
ok(teachesRecoverableOutcome(global), 'A2: global keeps recoverable-outcome and no-attempt-mission');
ok(teachesLifecycleOutsideList(global), 'A2: global keeps finalization/closure/archive/sink outside the list');
ok(/Finalization/i.test(finalize) && /not a Mission List item/i.test(finalize),
  'A2: Finalize owns lifecycle operations');
ok(teachesMissionEnumeration(next),
  'A2: Next keeps the mission-is-not enumeration and causal-class append judgment');
ok(teachesIndependentAcceptance(execution),
  'A2: independent acceptance duty remains reachable from Next + role surfaces');
ok(/tdd-guide/i.test(roles) && /implementer/i.test(roles),
  'A2: tdd-guide and implementer role contracts remain present');

const routing = require(path.join(ROOT, 'scripts', 'generate-routing-surfaces.js'));
const compactPrompts = ['claude', 'codex', 'grok', 'cursor']
  .map(runtime => routing.renderCompactRecoveryPrompt(runtime, 'github'));
ok(compactPrompts.length === 4 && compactPrompts.every(Boolean),
  'A3: measured compact-capable runtimes still render recovery prompts');
ok(compactPrompts.every(text => text.split(globalRaw.trim()).length - 1 === 1),
  'A3: every compact prompt embeds the exact global contract once');
ok(teachesResumeFrontier(global) && teachesNoReclaimInFlight(compact),
  'A3: recovery recognizes done/in-flight/remaining and does not re-claim in flight');
ok(!/opencode|kimi|zcode/i.test(compactRaw),
  'A3: compact skeleton does not invent unmeasured runtime recovery');

ok(teachesGrantedScopeContinue(global),
  'A4: global continues inside already-granted authorization');
ok(teachesUnauthorizedStillEscalate(global),
  'A4: unauthorized irreversible / value-laden calls still go to the user');
ok(!keepsObservedFailureGate(global),
  'A4: global drops the overly-narrow observed-failure-only add gate');
ok(teachesRequestedWorkWithoutPriorFailure(global),
  'A4: a user-requested feature is not refused for lack of a prior observed failure');
ok(!keepsProjectOnlyStricter(global),
  'A4: global no longer says project instructions add only stricter constraints');
ok(teachesProjectExceptionScope(global),
  'A4: a project exception must state its scope and not weaken higher-priority instructions');
ok(teachesCorrectnessOrder(global), 'A4: correctness then human time then cost');
ok(teachesMeasureCurrentTruth(global), 'A4: measure current truth and read the target');
ok(teachesEvidenceInferenceUnknown(global),
  'A4: distinguish evidence / inference / unknown');
ok(teachesLocalVerdicts(global), 'A4: own local verdicts');
ok(teachesNoUnexecutedClaims(global), 'A4: never claim unexecuted env/device/service/UAT');
ok(teachesIndependentAcceptance(execution),
  'A4: do not weaken/reinterpret acceptance to pass (Next + roles)');
ok(teachesReverifyAfterMutation(global + ' ' + next),
  'A4: mutation invalidates affected PASS evidence');
ok(teachesVerifyAtChangeScope(global),
  'A4: verify at the scope of the change');

ok(/there is no local backlog mirror/i.test(global) && !/\bMCP\b/.test(globalRaw),
  'A5: global keeps the no-local-backlog-mirror rule and adds no MCP machinery');
ok(teachesFourFields(global) && !/`effort`/.test((global.split('Mission List')[1] || '')),
  'A5: run-record format stays the four fields (no new field machinery in the Mission List section)');

{
  ok(!teachesFullClaimPath('`workflow-state.md` records the claim; `kaola-workflow/{project}/mission-list.md` records the run.'),
    'A6 mutation RED: a short workflow-state.md path is not the full claim path');

  ok(keepsObservedFailureGate('Add only what an observed failure demands; build no speculative gates.'),
    'A6 mutation RED: restoring the observed-failure add gate is detected');

  ok(keepsProjectOnlyStricter('Project instructions add only verified local facts and stricter constraints.'),
    'A6 mutation RED: restoring stricter-constraints-only is detected');

  const autoCreate = 'Organizing issues auto-creates a Mission List and auto-claims the work.';
  ok(!teachesOrganizingDoesNotClaim(autoCreate)
      && !teachesOrganizingDoesNotCreateMissionList(autoCreate),
    'A6 mutation RED: auto-creating a Mission List from daily organizing is rejected');

  const dropPriority = global.replace(/priority_top_tier_labels/g, '');
  ok(!teachesPriorityConfig(dropPriority),
    'A6 mutation RED: dropping priority_top_tier_labels is detected');

  const nextOnlyBacklogGlobal = global
    .replace("The forge's open issue list is backlog truth", '')
    .replace('kaola-workflow/.roadmap/_rules.md', '')
    .replace('priority_top_tier_labels', '')
    .replace('kaola-workflow/config.json', '');
  const nextOnlyBacklogNext = next
    + " The forge's open issue list is backlog truth kaola-workflow/.roadmap/_rules.md priority_top_tier_labels kaola-workflow/config.json ";
  ok(!teachesForgeBacklog(nextOnlyBacklogGlobal)
      || !teachesPriorityConfig(nextOnlyBacklogGlobal)
      || !teachesRoadmapLocation(nextOnlyBacklogGlobal),
    'A6 mutation RED: moving backlog rules out of global into Next-only is detected');
  ok(teachesForgeBacklog(nextOnlyBacklogNext),
    'A6 mutation setup: the Next-only mutant still contains the moved backlog words');

  ok(compactPrompts.every((text) => {
    const omitted = text.replace(globalRaw.trim(), '');
    return omitted.split(globalRaw.trim()).length - 1 !== 1;
  }), 'A6 mutation RED: omitting the global source from compact recovery is detected');

  const guttedNext = next.replace(
    /The test author owns acceptance meaning\.[\s\S]*?acceptance to pass\./,
    '');
  ok(teachesIndependentAcceptance(next),
    'A6 setup: live Next currently carries independent acceptance');
  ok(!/implementer may not delete, weaken, or reinterpret that acceptance/i.test(guttedNext),
    'A6 mutation RED: deleting independent-acceptance language from Next is detected');

  const blanketEscalate = 'Escalate every irreversible or value-laden choice, including already-granted work.';
  ok(!teachesGrantedScopeContinue(blanketEscalate),
    'A6 mutation RED: a blanket escalate-everything rule is not granted-scope continuation');
}

try {
  assert.ok(failed === 0, `${failed} issue-1051 live/mutation assertions failed`);
} catch (error) {
  console.error(`issue-1051 global-contract acceptance: ${passed} passed, ${failed} failed`);
  throw error;
}
console.log(`issue-1051 global-contract acceptance: ${passed} passed`);
