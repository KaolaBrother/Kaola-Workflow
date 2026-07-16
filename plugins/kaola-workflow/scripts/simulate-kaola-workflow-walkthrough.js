#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// The module-top KAOLA_ENABLE_ADAPTIVE pin is removed.

// #531 / #538: hermetic HOME — the classifier (cmdClassify) reads parallel_mode from
// ~/.config/kaola-workflow/config.json and bypasses to verdict:'green' when not 'auto'.
// Also resolveInstalledPaths reads installed_paths from this file (#538). Pin a process-wide
// sandbox HOME seeded with parallel_mode:'auto' + installed_paths:[] (adaptive-only default)
// so a dev-local config can't affect these tests. os.homedir() honors process.env.HOME.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto', installed_paths: [] }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
const installProfilesScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const nextSkill = path.join(pluginRoot, 'skills', 'kaola-workflow-next', 'SKILL.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runClaim(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'claim command failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function runClaimRaw(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  return { parsed: JSON.parse(result.stdout), exitStatus: result.status, stderr: result.stderr };
}

function assertNoLegacyCoordDirs(root) {
  for (const name of ['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers']) {
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', '.' + name)), 'legacy coordination dir must not exist: .' + name);
  }
}

function runInstallProfiles(target, extraEnv, extraArgs) {
  const args = (extraArgs && extraArgs.length) ? extraArgs : [];
  const result = spawnSync(process.execPath, [installProfilesScript, target, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: extraEnv ? Object.assign({}, process.env, extraEnv) : process.env
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'install profiles failed: ' + result.stderr);
  return result;
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-'));
  try {
    runInstallProfiles(fresh);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert(freshConfig.includes('[features]'), 'fresh install should include managed [features]');
    assert(freshConfig.includes('multi_agent = true'), 'fresh install should enable multi_agent');
    assert(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]',
      'goals = true',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      ''
    ].join('\n'));

    runInstallProfiles(existing);
    runInstallProfiles(existing);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert(countOccurrences(updated, /^\[features\]$/gm) === 1, 'existing config must contain exactly one [features] table');
    assert(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
  }
}

// AC1 (#284): hooks.json assertions — events, ids, token resolution, trust-step stdout,
// and idempotency with a pre-seeded user entry.
// #447: hooks are now GLOBAL (installer writes to HOME/.codex/hooks.json, not project .codex/).
// Both fresh and existing installs run under a temp HOME so the real ~/.codex is never touched.
function testAC1HooksJson() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-hooks-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-hooks-existing-'));
  const tempHomeFresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-home-fresh-'));
  const tempHomeExisting = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-home-existing-'));
  try {
    const freshHomeEnv = { HOME: tempHomeFresh, USERPROFILE: tempHomeFresh };
    const existingHomeEnv = { HOME: tempHomeExisting, USERPROFILE: tempHomeExisting };

    // Install once to the fresh dir and capture stdout.
    const freshResult = runInstallProfiles(fresh, freshHomeEnv);

    // AC1: trust-step line must be present in install stdout.
    // RED (transient demonstration): assert it does NOT exist in an empty string — that fails.
    // GREEN: assert it IS present in the real output.
    assert(freshResult.stdout.includes('/hooks'),
      'AC1: install stdout must contain the /hooks trust-step line');

    // #447 AC1: hooks land in the global HOME/.codex, NOT in the project dir.
    const hooksPath = path.join(tempHomeFresh, '.codex', 'hooks.json');
    assert(fs.existsSync(hooksPath), 'AC1: hooks.json must exist after fresh install');
    assert(!fs.existsSync(path.join(fresh, '.codex', 'hooks.json')),
      '#447 AC5: no hooks.json must be written to project .codex');

    // AC1: no literal __KW_PLUGIN_ROOT__ token must survive in the installed file.
    // RED (transient demonstration): the source template DOES contain the token.
    const sourceHooksTemplate = path.join(pluginRoot, 'config', 'hooks.json');
    const rawTemplate = fs.readFileSync(sourceHooksTemplate, 'utf8');
    assert(rawTemplate.includes('__KW_PLUGIN_ROOT__'),
      'AC1 RED-proof: source hooks template must contain __KW_PLUGIN_ROOT__ token (baseline)');
    const installedRaw = fs.readFileSync(hooksPath, 'utf8');
    assert(!installedRaw.includes('__KW_PLUGIN_ROOT__'),
      'AC1 GREEN: installed hooks.json must NOT contain literal __KW_PLUGIN_ROOT__');

    const parsed = JSON.parse(installedRaw);
    // #372: the PostToolUse phantom-advisor hook is retired — exactly 3 lifecycle events remain.
    const EVENTS = ['SessionStart', 'PreToolUse', 'SubagentStart'];
    for (const event of EVENTS) {
      const entries = (parsed.hooks || {})[event];
      assert(Array.isArray(entries) && entries.length > 0,
        'AC1: hooks.json must have entries for event ' + event);
      const managed = entries.filter(e => e.id && e.id.startsWith('kaola-workflow:'));
      assert(managed.length >= 1,
        'AC1: event ' + event + ' must have at least one kaola-workflow: managed entry');
    }
    assert(!(parsed.hooks || {}).PostToolUse,
      '#372: hooks.json must NOT carry a PostToolUse event (phantom-advisor retired)');

    // AC1: SessionStart entry with matcher "compact" must reference the compact-resume script.
    const sessionStart = (parsed.hooks || {}).SessionStart || [];
    const compactEntry = sessionStart.find(e => e.matcher === 'compact');
    assert(compactEntry !== undefined,
      'AC1: SessionStart must have an entry with matcher "compact"');
    const compactCmd = compactEntry.hooks && compactEntry.hooks[0] && compactEntry.hooks[0].command;
    assert(typeof compactCmd === 'string' && compactCmd.includes('kaola-workflow-codex-compact-resume.js'),
      'AC1: SessionStart compact entry command must reference kaola-workflow-codex-compact-resume.js, got: ' + compactCmd);

    // AC1 idempotency: seed a user-owned entry in SessionStart, then install a second time.
    // #447: hooks land in the global HOME/.codex (tempHomeExisting), not in the project .codex.
    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    // First install.
    runInstallProfiles(existing, existingHomeEnv);
    const globalHooksPath = path.join(tempHomeExisting, '.codex', 'hooks.json');
    assert(fs.existsSync(globalHooksPath), '#447: global HOME/.codex/hooks.json must exist after first install');
    assert(!fs.existsSync(path.join(existing, '.codex', 'hooks.json')),
      '#447 AC5: no hooks.json in project .codex after first install');
    const afterFirst = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
    // Seed a user entry (non-kaola id) into the SessionStart event.
    const USER_ENTRY = { id: 'user-custom-session-hook', matcher: '*', hooks: [{ type: 'command', command: 'echo user-custom' }] };
    afterFirst.hooks.SessionStart = (afterFirst.hooks.SessionStart || []).concat([USER_ENTRY]);
    fs.writeFileSync(globalHooksPath, JSON.stringify(afterFirst, null, 2) + '\n');
    // Second install.
    runInstallProfiles(existing, existingHomeEnv);
    assert(!fs.existsSync(path.join(existing, '.codex', 'hooks.json')),
      '#447 AC5: no hooks.json in project .codex after double-run');
    const afterSecond = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
    // Assert NO DUPLICATE managed entries after the 2nd install: each kaola-workflow: id appears
    // exactly once (an event MAY carry >1 distinct managed id — e.g. PreToolUse holds both
    // pre-commit-guard and the #376 write-lane hook — so the check is per-id, not per-event count).
    const idCounts = {};
    for (const event of Object.keys(afterSecond.hooks || {})) {
      for (const e of afterSecond.hooks[event]) {
        if (e.id && e.id.startsWith('kaola-workflow:')) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
      }
    }
    for (const id of Object.keys(idCounts)) {
      assert(idCounts[id] === 1, 'AC1 idempotency: managed id ' + id + ' must appear exactly once after 2nd install, got ' + idCounts[id]);
    }
    // Assert the user entry survived.
    const sessionStartAfter = (afterSecond.hooks || {}).SessionStart || [];
    const survivedUser = sessionStartAfter.find(e => e.id === 'user-custom-session-hook');
    assert(survivedUser !== undefined,
      'AC1 idempotency: user-custom-session-hook entry must survive a second install');

    console.log('testAC1HooksJson (#284 AC1): PASSED');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
    fs.rmSync(tempHomeFresh, { recursive: true, force: true });
    fs.rmSync(tempHomeExisting, { recursive: true, force: true });
  }
}

// AC3 (#284): positive attestation — seeded dispatch-log → 'attested' on both fields.
// Demonstrates RED (no-seed → 'missing') is already proven by the existing main() test;
// this function proves GREEN (seeded → 'attested').
function testAC3AttestationSeeded() {
  // Use an isolated tmp to avoid touching the live kaola-workflow folder.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-attest-'));
  try {
    initGitRepo(root);
    // Seed local roadmap evidence so the offline classifier can verify the target.
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-284.md'),
      'issue: #284\ntitle: —\nstatus: open\nworkflow_project: issue-284\nnext_step: ready\n'
    );
    // Claim (startup) to create the project state.
    const acquired = runClaim(['startup', '--target-issue', '284', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired.claim === 'acquired', 'AC3 setup: startup must acquire issue-284, got: ' + JSON.stringify(acquired));

    // Seed the dispatch-log BEFORE finalize.  finalize archives the folder (moves it), then
    // checkDispatchAttestations checks archive-first — so seeding the live cache is correct.
    const cacheDir = path.join(root, 'kaola-workflow', 'issue-284', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const ts = '2026-06-09T00:00:00Z';
    fs.writeFileSync(path.join(cacheDir, 'dispatch-log.jsonl'),
      JSON.stringify({ ts, agent_type: 'workflow-planner', agent_id: 'test-planner', cwd: root }) + '\n' +
      JSON.stringify({ ts, agent_type: 'contractor', agent_id: 'test-contractor', cwd: root }) + '\n'
    );

    // Plant roadmap entry (finalize reads it for roadmap cleanup).
    plantRoadmap(root, 284, '');

    // Finalize — offline mode.
    const finalizeResult = runClaim(['finalize', '--project', 'issue-284'], root);
    assert(finalizeResult.status === 'closed',
      'AC3: finalize must return status:closed, got: ' + JSON.stringify(finalizeResult));
    assert(finalizeResult.closure_receipt && finalizeResult.closure_receipt.claim_planner_attested === 'attested',
      'AC3 GREEN: claim_planner_attested must be "attested" when dispatch-log is seeded, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && finalizeResult.closure_receipt.claim_planner_attested));
    assert(finalizeResult.closure_receipt && finalizeResult.closure_receipt.finalize_contractor_attested === 'attested',
      'AC3 GREEN: finalize_contractor_attested must be "attested" when dispatch-log is seeded, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && finalizeResult.closure_receipt.finalize_contractor_attested));

    // #333: the archived state must not advertise an active resume command. startup seeds
    // next_command: /kaola-workflow-phase1 issue-284; the archive must neutralize it.
    const archived284 = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-284'));
    assert(archived284.length === 1, '#333: finalize must archive issue-284');
    const arch284State = fs.readFileSync(path.join(root, 'kaola-workflow', 'archive', archived284[0], 'workflow-state.md'), 'utf8');
    assert(arch284State.includes('next_command: none (archived)'),
      '#333: archived state next_command must be neutralized, got: ' + arch284State);
    assert(!/next_command:.*(kaola-workflow-plan-run|kaola-workflow-phase)/.test(arch284State),
      '#333: archived state must not retain an active plan-run/phase resume command');

    console.log('testAC3AttestationSeeded (#284 AC3): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Attestation warning durable persistence (codex edition): a non-empty ATTESTATION WARNING must
// land in the archived finalization-summary.md and workflow-state.md ## Closure block, not just
// stdout JSON. Seed a contractor-only dispatch-log (no workflow-planner entry).
function testAttestationWarningPersistenceCodex() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-attest-persist-codex-'));
  try {
    initGitRepo(root);
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-653102.md'),
      'issue: #653102\ntitle: —\nstatus: open\nworkflow_project: issue-653102\nnext_step: ready\n'
    );
    const acquired = runClaim(['startup', '--target-issue', '653102', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired.claim === 'acquired', 'attestation persistence (codex): startup must acquire issue-653102, got: ' + JSON.stringify(acquired));

    // Seed dispatch-log with ONLY a contractor entry (no workflow-planner).
    const cacheDir = path.join(root, 'kaola-workflow', 'issue-653102', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'dispatch-log.jsonl'),
      JSON.stringify({ ts: '2026-06-09T00:00:00Z', agent_type: 'contractor', agent_id: 'test-contractor', cwd: root }) + '\n');

    plantRoadmap(root, 653102, '');

    const finalizeResult = runClaim(['finalize', '--project', 'issue-653102'], root);
    assert(finalizeResult.status === 'closed',
      'attestation persistence (codex): finalize must return status:closed, got: ' + JSON.stringify(finalizeResult));
    assert(finalizeResult.closure_receipt && finalizeResult.closure_receipt.claim_planner_attested === 'missing',
      'attestation persistence (codex): claim_planner_attested must be missing, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && finalizeResult.closure_receipt.claim_planner_attested));

    const archived = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-653102'));
    assert(archived.length === 1, 'attestation persistence (codex): finalize must archive issue-653102');
    const archiveDir = path.join(root, 'kaola-workflow', 'archive', archived[0]);

    const summaryPath = path.join(archiveDir, 'finalization-summary.md');
    assert(fs.existsSync(summaryPath), 'attestation persistence (codex): archived finalization-summary.md must exist');
    const summary = fs.readFileSync(summaryPath, 'utf8');
    assert(/^claim_planner_attested: missing$/m.test(summary),
      'attestation persistence (codex): archived finalization-summary.md must carry column-0 claim_planner_attested: missing, got: ' + summary);
    assert(summary.includes('ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log'),
      'attestation persistence (codex): archived finalization-summary.md must carry the verbatim ATTESTATION WARNING, got: ' + summary);

    const state = fs.readFileSync(path.join(archiveDir, 'workflow-state.md'), 'utf8');
    assert(/^## Closure$/m.test(state), 'attestation persistence (codex): archived workflow-state.md must carry ## Closure block');
    assert(/^claim_planner_attested: missing$/m.test(state),
      'attestation persistence (codex): archived workflow-state.md ## Closure block must carry claim_planner_attested, got: ' + state);

    console.log('testAttestationWarningPersistenceCodex: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// n5 (#653 finding D3, codex edition): selection-evidence probe. Case (a) seeds
// .cache/selection-evidence.md pre-finalize (simulating the router's D2 docking) ->
// closure_receipt.selection_evidence must read 'present' and the file must survive under the
// archived project's .cache/. Case (b), a separate project with no docked file, must read 'absent'.
function testSelectionEvidenceDockingCodex() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-selection-evidence-codex-'));
  try {
    initGitRepo(root);
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-653203.md'),
      'issue: #653203\ntitle: —\nstatus: open\nworkflow_project: issue-653203\nnext_step: ready\n'
    );
    const acquired = runClaim(['startup', '--target-issue', '653203', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired.claim === 'acquired', 'selection-evidence (codex): startup must acquire issue-653203, got: ' + JSON.stringify(acquired));

    const cacheDir = path.join(root, 'kaola-workflow', 'issue-653203', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'selection-evidence.md'),
      'selection_mode: single-issue\n\n```json\n{"recommended_bundle":{"primary_issue":653203,"issues":[653203],"confidence":"low"}}\n```\n');

    plantRoadmap(root, 653203, '');

    const finalizeResult = runClaim(['finalize', '--project', 'issue-653203'], root);
    assert(finalizeResult.status === 'closed',
      'selection-evidence (codex): finalize must return status:closed, got: ' + JSON.stringify(finalizeResult));
    assert(finalizeResult.closure_receipt && finalizeResult.closure_receipt.selection_evidence === 'present',
      'selection-evidence (codex): seeded selection-evidence.md must read closure_receipt.selection_evidence === present, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && finalizeResult.closure_receipt.selection_evidence));

    const archived = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-653203'));
    assert(archived.length === 1, 'selection-evidence (codex): finalize must archive issue-653203');
    const archivedEvidencePath = path.join(root, 'kaola-workflow', 'archive', archived[0], '.cache', 'selection-evidence.md');
    assert(fs.existsSync(archivedEvidencePath),
      'selection-evidence (codex): selection-evidence.md must survive under the archived project .cache/, expected at ' + archivedEvidencePath);

    // (b) absent — a second project with no docked selection-evidence file.
    const roadmapDir2 = path.join(root, 'kaola-workflow', '.roadmap');
    fs.writeFileSync(
      path.join(roadmapDir2, 'issue-653204.md'),
      'issue: #653204\ntitle: —\nstatus: open\nworkflow_project: issue-653204\nnext_step: ready\n'
    );
    const acquired2 = runClaim(['startup', '--target-issue', '653204', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired2.claim === 'acquired', 'selection-evidence (codex): second startup must acquire issue-653204, got: ' + JSON.stringify(acquired2));

    plantRoadmap(root, 653204, '');

    const finalizeResult2 = runClaim(['finalize', '--project', 'issue-653204'], root);
    assert(finalizeResult2.status === 'closed',
      'selection-evidence (codex): second finalize must return status:closed, got: ' + JSON.stringify(finalizeResult2));
    assert(finalizeResult2.closure_receipt && finalizeResult2.closure_receipt.selection_evidence === 'absent',
      'selection-evidence (codex): a claim with no docked selection-evidence.md must read closure_receipt.selection_evidence === absent, got: ' +
      JSON.stringify(finalizeResult2.closure_receipt && finalizeResult2.closure_receipt.selection_evidence));

    console.log('testSelectionEvidenceDockingCodex: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #333: keep-open partial-close archive stamp (codex edition). Plant an active project, finalize
// with --keep-open, assert last_result: closed_keep_open + issue_disposition: kept-open.
function testKeepOpenArchiveStamp333() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-333-keepopen-'));
  try {
    const projDir = path.join(root, 'kaola-workflow', 'issue-333');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: issue-333', 'status: active', '',
      '## Current Position',
      'phase: adaptive', 'workflow_path: adaptive', 'step: start',
      'next_command: /kaola-workflow-plan-run issue-333',
      'next_skill: kaola-workflow-plan-run issue-333', '',
      '## Pending Gates', '- workflow-plan', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', '2020-01-01T00:00:00.000Z', '',
      '## Sink', 'branch: workflow/issue-333', 'issue_number: 333', 'sink: merge', ''
    ].join('\n'));
    plantRoadmap(root, 333, '');
    const result = runClaim(['finalize', '--project', 'issue-333', '--keep-open'], root);
    assert(result.status === 'closed', '#333: keep-open finalize should report closed');
    assert(result.issue_disposition === 'kept-open',
      '#333: JSON output issue_disposition must be kept-open, got: ' + JSON.stringify(result.issue_disposition));
    const archived = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-333'));
    assert(archived.length === 1, '#333: keep-open finalize should archive folder');
    const st = fs.readFileSync(path.join(root, 'kaola-workflow', 'archive', archived[0], 'workflow-state.md'), 'utf8');
    assert(st.includes('status: closed'), '#333: keep-open archived state must be closed');
    assert(st.includes('last_result: closed_keep_open'),
      '#333: keep-open archived last_result must be closed_keep_open, got: ' + st);
    assert(st.includes('next_command: none (archived)'),
      '#333: keep-open archived next_command must be neutralized');
    assert(/^## Closure$/m.test(st), '#333: keep-open archived state must carry a ## Closure block');
    assert(st.includes('issue_disposition: kept-open'),
      '#333: keep-open archived ## Closure must record issue_disposition: kept-open');
    console.log('testKeepOpenArchiveStamp333: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// AC2 (#284): compact-resume stdout is PLAIN TEXT, not a JSON envelope.
// Extends testCodexCompactResume266: asserts the already-GREEN output is plain-text,
// not wrapped in { "hookSpecificOutput": ... }.
function testAC2CompactPlainStdout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-compact-plain-'));
  try {
    const projectName = 'issue-284-compact-plain';
    const projDir = path.join(root, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# State', '',
      '## Project',
      'name: ' + projectName,
      'status: active', '',
      '## Sink',
      'branch: workflow/issue-284',
      'issue_number: 284',
      'next_command: /kaola-workflow-plan-run',
      'next_skill: kaola-workflow-next',
      ''
    ].join('\n'));

    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), FIXTURE_PLAN);

    const tasksJson = JSON.stringify({
      source_plan_hash: FIXTURE_PLAN_HASH,
      tasks: [
        { id: 'explore', role: 'code-explorer', status: 'completed', ledger_status: 'complete' },
        { id: 'impl', role: 'implementer', status: 'in_progress', ledger_status: 'in_progress' },
        { id: 'gate', role: 'code-reviewer', status: 'pending', ledger_status: 'pending' },
        { id: 'done', role: 'finalize', status: 'completed', ledger_status: 'n/a' }
      ],
      last_synced_from_ledger: '2026-06-09T00:00:00.000Z'
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(projDir, 'workflow-tasks.json'), tasksJson);

    const input = JSON.stringify({ cwd: root });
    const r = runScript(compactResumeScript, [], { input, encoding: 'utf8' });
    assert(r.status === 0, 'AC2: compact-resume must exit 0, got ' + r.status + '\n' + r.stderr);

    // AC2 GREEN: output must NOT start with '{' (not a JSON object) and must NOT contain
    // the Codex hookSpecificOutput envelope key.
    // RED demonstration: if the script emitted a JSON envelope, the first char would be '{'.
    assert(!r.stdout.startsWith('{'),
      'AC2: compact-resume stdout must NOT be a JSON object (plain text expected), got: ' + r.stdout.slice(0, 80));
    assert(!r.stdout.includes('"hookSpecificOutput"'),
      'AC2: compact-resume stdout must NOT contain hookSpecificOutput envelope, got: ' + r.stdout.slice(0, 200));

    // Assert the expected plain-text packet lines ARE present.
    assert(r.stdout.includes('Kaola-Workflow compact resume:'),
      'AC2: packet must include the header line');
    assert(r.stdout.includes('active project:'),
      'AC2: packet must include active project line');
    assert(r.stdout.includes('next skill/command:'),
      'AC2: packet must include next skill/command line');
    assert(r.stdout.includes('in-progress node:'),
      'AC2: packet must include in-progress node line');
    assert(r.stdout.includes('pending gates:'),
      'AC2: packet must include pending gates line');
    assert(r.stdout.includes('consent-halt markers:'),
      'AC2: packet must include consent-halt markers line');
    assert(r.stdout.includes('task mirror:'),
      'AC2: packet must include task mirror line');

    console.log('testAC2CompactPlainStdout (#284 AC2): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #325/#525: updateHooks() hardening — R1 (metacharacter pluginRoot can't break JSON), R2 (output is
// { hooks } ONLY — no $schema; Codex's strict parser rejects unknown top-level keys, and an existing
// $schema self-heals), R3 (sweep ALL events for orphaned kaola-workflow: entries).
// pluginRoot derives from __dirname, not argv, so R1/R3 are exercised via the exported pure helpers.
function testUpdateHooksHardening325() {
  const { buildManagedHooks, mergeHooks } = require(installProfilesScript);
  const tmplText = JSON.stringify({
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    hooks: {
      SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'node "__KW_PLUGIN_ROOT__/scripts/x.js"', timeout: 5 }], id: 'kaola-workflow:compact' }],
    },
  });

  // R1: a pluginRoot with metacharacters (backslash + quote, the Windows case) must NOT throw, must
  // substitute verbatim, and must round-trip through JSON (proving JSON.stringify re-escapes it).
  let built;
  try { built = buildManagedHooks(tmplText, 'C:\\plug"in'); }
  catch (e) { assert(false, '#325 R1: buildManagedHooks must not throw on a metacharacter pluginRoot, threw: ' + e.message); }
  const cmd = built.hooks.SessionStart[0].hooks[0].command;
  assert(cmd === 'node "C:\\plug"in/scripts/x.js"', '#325 R1: pluginRoot substituted verbatim, got ' + cmd);
  assert(!cmd.includes('__KW_PLUGIN_ROOT__'), '#325 R1: token fully substituted');
  let round; try { round = JSON.parse(JSON.stringify(built)); } catch (e) { assert(false, '#325 R1: built hooks must re-serialize to valid JSON'); }
  assert(round.hooks.SessionStart[0].hooks[0].command === cmd, '#325 R1: command round-trips through JSON');

  // R2 (#525): output is { hooks } ONLY — no $schema (Codex's parser rejects unknown top-level keys),
  // and an existing $schema is dropped (self-heal), not carried.
  const freshMerge = mergeHooks({ hooks: {} }, built);
  assert(freshMerge.$schema === undefined, '#525: fresh-install merge carries NO $schema');
  assert(Object.keys(freshMerge).join(',') === 'hooks', '#525: merged output has only the hooks key');
  assert(mergeHooks({ $schema: 'user-schema', hooks: {} }, built).$schema === undefined, '#525: an existing $schema is dropped (self-heal), not carried');

  // R3: a re-install after the managed-event set shrinks leaves no orphaned kaola-workflow: entry,
  // while preserving non-managed entries under that event.
  const shrunk = { hooks: { SessionStart: built.hooks.SessionStart } }; // PostToolUse no longer managed
  const existingOrphan = { hooks: { PostToolUse: [{ id: 'kaola-workflow:retired-orphan', matcher: 'Write' }, { id: 'user:keep', matcher: 'Edit' }] } };
  const swept = mergeHooks(existingOrphan, shrunk);
  const post = swept.hooks.PostToolUse || [];
  assert(!post.some(e => e.id && e.id.startsWith('kaola-workflow:')), '#325 R3: orphaned kaola-workflow: entry under a now-unmanaged event is swept');
  assert(post.some(e => e.id === 'user:keep'), '#325 R3: non-managed user entry under that event is preserved');

  // R2 black-box (#525): a fresh install writes hooks.json with ONLY a hooks key, no $schema.
  // #447: hooks land in global HOME/.codex, not in the project dir — use a temp HOME.
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-325-schema-'));
  const tempHome325 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-325-home-'));
  try {
    runInstallProfiles(freshDir, { HOME: tempHome325, USERPROFILE: tempHome325 });
    // #447 AC1: hooks land in the global HOME/.codex, NOT in the project dir.
    const globalHooksPath = path.join(tempHome325, '.codex', 'hooks.json');
    const projectHooksPath = path.join(freshDir, '.codex', 'hooks.json');
    assert(fs.existsSync(globalHooksPath), '#447 AC1: hooks.json must be written to global HOME/.codex, not found at: ' + globalHooksPath);
    assert(!fs.existsSync(projectHooksPath), '#447 AC5: no hooks.json must be written to project .codex, found at: ' + projectHooksPath);
    const installed = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
    assert(installed.$schema === undefined && Object.keys(installed).join(',') === 'hooks', '#525 (black-box): fresh-install hooks.json has only the hooks key, no $schema');
  } finally {
    fs.rmSync(freshDir, { recursive: true, force: true });
    fs.rmSync(tempHome325, { recursive: true, force: true });
  }
  console.log('testUpdateHooksHardening325: PASSED');
}

// #409: the LIVE-BUG regression test. Before the fix, install-codex-agent-profiles.js
// substituted `path.resolve(__dirname,'..')` (the run-time install source) into
// __KW_PLUGIN_ROOT__ and copied ZERO hook scripts to a stable home, so hooks.json
// pointed straight back at the install source dir. When that dir was an ephemeral /tmp
// worktree (purged) or a version-pinned plugin-cache dir (GC'd on the next release),
// every hook fired exit 127. This test installs FROM a throwaway copy of the plugin
// tree, DELETES that copy, then asserts every hooks.json command still resolves to an
// existing executable script in a version-LESS home — and that reinstall sweeps a
// planted stale script. It goes RED against the pre-#409 installer (commands point at
// the deleted source) and GREEN against the stable-home fix.
function recursiveCopyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) recursiveCopyDir(s, d);
    else if (entry.isFile()) { fs.copyFileSync(s, d); fs.chmodSync(d, fs.statSync(s).mode); }
  }
}

function test409StableHomeSurvivesDirDeletion() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-409-stable-home-'));
  // #447: hooks + stable home go to global HOME/.codex; use a temp HOME so the test
  // never writes to the real ~/.codex.
  const tempHome409 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-409-home-'));
  try {
    // 1. Copy the plugin tree into a throwaway install SOURCE, then run the installer
    //    FROM that copy (so __dirname/.. resolves to the throwaway, exactly the live bug).
    const installSrc = path.join(work, 'ephemeral-src');
    recursiveCopyDir(pluginRoot, installSrc);
    const srcInstaller = path.join(installSrc, 'scripts', 'install-codex-agent-profiles.js');
    const target = path.join(work, 'target');
    fs.mkdirSync(target, { recursive: true });

    const homeEnv409 = { HOME: tempHome409, USERPROFILE: tempHome409 };
    const first = spawnSync(process.execPath, [srcInstaller, target], {
      cwd: installSrc, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (first.error) throw first.error;
    assert(first.status === 0, '#409: install from ephemeral source must succeed: ' + first.stderr);

    // 2. DELETE the install source — the macOS /tmp-purge / version-bump scenario.
    fs.rmSync(installSrc, { recursive: true, force: true });

    // 3. #447 AC1: hooks land in global HOME/.codex, not in the project dir.
    const globalHooks409Path = path.join(tempHome409, '.codex', 'hooks.json');
    assert(fs.existsSync(globalHooks409Path), '#447/#409: hooks.json must be in global HOME/.codex after install');
    assert(!fs.existsSync(path.join(target, '.codex', 'hooks.json')), '#447 AC5: no hooks.json must be in project .codex');

    // Every hooks.json command must still resolve to an existing, executable file,
    // must NOT reference the deleted source, and must NOT be version-pinned.
    const hooks = JSON.parse(fs.readFileSync(globalHooks409Path, 'utf8'));
    let commandCount = 0;
    for (const event of Object.keys(hooks.hooks || {})) {
      for (const entry of (hooks.hooks[event] || [])) {
        for (const h of (entry.hooks || [])) {
          if (typeof h.command !== 'string') continue;
          commandCount++;
          // Extract the quoted script path argument (bash "..." / node "...").
          const m = h.command.match(/"([^"]+)"/);
          assert(m, '#409: hook command must carry a quoted script path: ' + h.command);
          const scriptPath = m[1];
          assert(fs.existsSync(scriptPath),
            '#409 GREEN: hook script must exist after the install source is deleted: ' + scriptPath);
          // Owner-executable bit must be set (we chmod 0o755 on copy).
          assert((fs.statSync(scriptPath).mode & 0o100) !== 0,
            '#409: hook script must be executable: ' + scriptPath);
          assert(!scriptPath.includes('ephemeral-src'),
            '#409: hook command must NOT point at the deleted install source: ' + scriptPath);
          // No version-pinned `/3.` (or `/N.M.K/`) plugin-cache segment.
          assert(!/\/\d+\.\d+\.\d+\//.test(scriptPath),
            '#409: hook script path must NOT be version-pinned: ' + scriptPath);
        }
      }
    }
    assert(commandCount >= 4, '#409: expected the four managed hook commands, saw ' + commandCount);

    // 4. Reinstall sweeps a planted stale script (no orphan left in the stable home).
    // #447: stable home lives in global HOME/.codex/kaola-workflow, not in the project .codex.
    const globalStableHome409 = path.join(tempHome409, '.codex', 'kaola-workflow');
    const planted = path.join(globalStableHome409, 'hooks', 'kaola-workflow-stale-orphan.sh');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    fs.writeFileSync(planted, '#!/usr/bin/env bash\nexit 0\n');
    assert(fs.existsSync(planted), '#409: planted stale script must exist before reinstall');
    const second = spawnSync(process.execPath, [installProfilesScript, target], {
      cwd: repoRoot, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (second.error) throw second.error;
    assert(second.status === 0, '#409: reinstall must succeed: ' + second.stderr);
    assert(!fs.existsSync(planted),
      '#409: reinstall must sweep the stale planted script from the stable home');

    console.log('test409StableHomeSurvivesDirDeletion (#409): PASSED');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(tempHome409, { recursive: true, force: true });
  }
}

// AC4 (#284): producer test — spawn the bash dispatch-log hook with valid JSON stdin and
// assert it writes exactly one JSONL line containing "agent_type":"workflow-planner" to the
// active project's .cache/dispatch-log.jsonl.  Also asserts exit 0 on empty stdin (fail-open).
function testAC4SubagentDispatchLog() {
  const dispatchLogScript = path.join(pluginRoot, 'hooks', 'kaola-workflow-subagent-dispatch-log.sh');
  assert(fs.existsSync(dispatchLogScript), 'AC4: dispatch-log hook script must exist at ' + dispatchLogScript);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-dispatch-'));
  try {
    // AC4: git init the tmp repo — the hook resolves the repo root via
    // `git rev-parse --show-toplevel` using the PROCESS CWD, not the JSON cwd.
    git(['init', '-b', 'main'], tmp);
    git(['config', 'user.email', 't@t.t'], tmp);
    git(['config', 'user.name', 't'], tmp);

    // Plant an active project so the hook finds a workflow-state.md with status: active.
    const projectName = 'issue-284-dispatchlog';
    plantFolder(tmp, projectName, 284, null);
    const cacheDir = path.join(tmp, 'kaola-workflow', projectName, '.cache');
    const logPath = path.join(cacheDir, 'dispatch-log.jsonl');

    // AC4 GREEN: valid JSON stdin → exactly one line in dispatch-log.jsonl
    const hookInput = JSON.stringify({ agent_type: 'workflow-planner', agent_id: 'test-x', cwd: tmp });
    const r1 = spawnSync('bash', [dispatchLogScript], {
      cwd: tmp,
      input: hookInput,
      encoding: 'utf8'
    });
    assert(r1.status === 0, 'AC4: dispatch-log hook must exit 0 on valid stdin, stderr: ' + r1.stderr);
    assert(fs.existsSync(logPath), 'AC4: dispatch-log.jsonl must be created after valid spawn');
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.trim().split('\n').filter(Boolean);
    assert(logLines.length === 1,
      'AC4: dispatch-log.jsonl must have exactly 1 line after one hook run, got ' + logLines.length);
    assert(logLines[0].includes('"agent_type":"workflow-planner"'),
      'AC4: dispatch-log line must contain agent_type workflow-planner, got: ' + logLines[0]);

    // AC4: exit 0 on EMPTY stdin (fail-open).
    // First remove the log to verify no new line is written.
    fs.unlinkSync(logPath);
    const r2 = spawnSync('bash', [dispatchLogScript], {
      cwd: tmp,
      input: '',
      encoding: 'utf8'
    });
    assert(r2.status === 0, 'AC4: dispatch-log hook must exit 0 on empty stdin, stderr: ' + r2.stderr);
    assert(!fs.existsSync(logPath),
      'AC4: dispatch-log.jsonl must NOT be created on empty stdin (fail-open)');

    console.log('testAC4SubagentDispatchLog (#284 AC4): PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// v3.21.0 (critic-1): the default Codex edition ships the #238/#239 adaptive production code (its
// classifier / plan-validator / adaptive-schema are byte-identical to root, sync-enforced), but this
// self-test previously exercised NONE of it. These cases run the CODEX scripts and lock the same
// soundness the root suite does — the curated-root candidate-side normalization (#238) and the
// per-node tree-diff barrier (#239: over-attribution, --base rejection, idempotent base).
const codexValidator = path.join(pluginRoot, 'scripts', 'kaola-workflow-plan-validator.js');
const codexClassifier = path.join(pluginRoot, 'scripts', 'kaola-workflow-classifier.js');
function git(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8' }); }
function initGitRepo(tmp) {
  git(['init', '-b', 'main'], tmp); git(['config', 'user.email', 't@t.t'], tmp); git(['config', 'user.name', 't'], tmp);
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n'); git(['add', '-A'], tmp); git(['commit', '-m', 'init'], tmp);
  const remote = tmp + '-remote'; git(['init', '--bare', remote], path.dirname(tmp)); git(['remote', 'add', 'origin', remote], tmp); git(['push', '-u', 'origin', 'main'], tmp);
}
function stampVerifiedLegacyCodexPlan(planPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  if (/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(content)
      || /^plan_schema_version:\s*2\s*$/m.test(content)) return;
  const validator = require(codexValidator);
  const hash = validator.computePlanHash(content);
  fs.writeFileSync(planPath, '<!-- plan_hash: ' + hash + ' -->\n\n' + content);
}
function runVal(args, cwd) {
  // These historical walkthrough fixtures are byte-preserved, already-adopted v1 plans.
  // New field-absent drafts remain refused by production; stamp only before their legacy freeze.
  if (args.includes('--freeze') && args[0] && fs.existsSync(args[0])) stampVerifiedLegacyCodexPlan(args[0]);
  return spawnSync(process.execPath, [codexValidator, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
}
function classifyOffline(tmp, issue) {
  const r = spawnSync(process.execPath, [codexClassifier, 'classify', '--issue', String(issue)], { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  assert(r.status === 0, 'codex classifier exit 0 expected, got ' + r.status + '\n' + r.stderr);
  return JSON.parse(r.stdout.trim());
}
function plantFolder(tmp, project, issue, phase3Body) {
  const dir = path.join(tmp, 'kaola-workflow', project); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), ['# State', '', '## Project', 'name: ' + project, 'status: active', '', '## Sink', 'branch: workflow/issue-' + issue, 'issue_number: ' + issue, 'sink: merge', ''].join('\n'));
  if (phase3Body != null) fs.writeFileSync(path.join(dir, 'phase3-plan.md'), phase3Body);
}
function plantRoadmap(tmp, issue, body) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issue + '.md'), ['issue: #' + issue, 'title: t', 'status: open', 'workflow_project: —', 'next_step: ready', body, ''].join('\n'));
}
const CODEX_PLAN = ['# Workflow Plan — issue #971', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
  '| ex | code-explorer | — | — | 1 | sequence |',
  '| a | tdd-guide | ex | aaa/x.js | 1 | fanout(impl) |',
  '| b | tdd-guide | ex | bbb/y.js | 1 | fanout(impl) |',
  '| rv | code-reviewer | a,b | — | 1 | sequence |',
  '| done | finalize | rv | — | 1 | sequence |', '',
  '## Node Ledger', '', '| id | status |', '|---|---|',
  '| ex | complete |', '| a | complete |', '| b | complete |', '| rv | complete |', '| done | complete |', ''].join('\n');

function testCodexAdaptiveCuratedAndBarrier() {
  // ---- #238 candidate-side curated normalization (punctuation must still route to yellow) ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-curated-'));
    try {
      plantFolder(tmp, 'curated-claimed', 330, null);
      const planPath = path.join(tmp, 'kaola-workflow', 'curated-claimed', 'workflow-plan.md');
      // #501: Dockerfile is now a sensitive surface requiring a G2 security-reviewer post-dominator.
      fs.writeFileSync(planPath, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | Dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| sec | security-reviewer | review | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |', ''].join('\n'));
      assert(runVal([planPath, '--freeze'], tmp).status === 0, 'codex: freeze curated plan');
      for (const [num, body] of [[331, 'body: edits the Dockerfile. also src/server.js'], [332, 'body: tweak ./Dockerfile and src/server.js'], [333, 'body: edits the dockerfile. also src/server.js']]) {
        plantRoadmap(tmp, num, body);
        const r = classifyOffline(tmp, num);
        // 333 is lowercase "dockerfile." — case-insensitive curated match (v3.21.0).
        assert(r.verdict === 'yellow' && /curated root file "Dockerfile"/.test(r.reasoning), 'codex #238: punctuated/case-insensitive curated overlap must be yellow ("' + body + '"), got ' + JSON.stringify(r));
      }
      // claimed-PROSE side (no frozen plan): a curated overlap declared only in prose is still yellow.
      plantFolder(tmp, 'prose-claimed', 360, '# Phase 3\nWe will edit the Dockerfile.\n');
      plantRoadmap(tmp, 361, 'body: also edits the Dockerfile and src/app.js');
      assert(classifyOffline(tmp, 361).verdict === 'yellow', 'codex F9: claimed-prose curated overlap must be yellow');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // green control needs ISOLATION (no other claimed project naming Dockerfile), or it would overlap.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-curated-green-'));
    try {
      plantFolder(tmp, 'overblock-claimed', 350, null);
      plantRoadmap(tmp, 351, 'body: edits the Dockerfile only, nothing else');
      assert(classifyOffline(tmp, 351).verdict === 'green', 'codex F10: candidate-only curated vs phase<=2 claimed must stay green');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // ---- #239 per-node tree-diff barrier (over-attribution, --base reject, idempotent) ----
  const mkRepo = () => {
    const grepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-barrier-'));
    initGitRepo(grepo);
    const proj = path.join(grepo, 'kaola-workflow', 'issue-971'); fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md'); fs.writeFileSync(planPath, CODEX_PLAN);
    assert(runVal([planPath, '--freeze'], grepo).status === 0, 'codex: freeze barrier plan');
    git(['add', '-A'], grepo); git(['commit', '-m', 'plan'], grepo);
    return { grepo, planPath };
  };
  const cu = g => { fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(g + '-remote', { recursive: true, force: true }); };
  const w = (g, rel, c) => { const p = path.join(g, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  // over-attribution: stray untracked at base must NOT be attributed to the node
  { const { grepo, planPath } = mkRepo(); try {
      w(grepo, 'stray/leftover.js', 's\n');
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'aaa/x.js', 'x\n');
      const r = runVal([planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass', 'codex #239: stray untracked must NOT be over-attributed, got ' + r.stdout);
    } finally { cu(grepo); } }
  // overflow into sibling lane must refuse
  { const { grepo, planPath } = mkRepo(); try {
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'aaa/x.js', 'x\n'); w(grepo, 'bbb/y.js', 'y\n');
      const r = runVal([planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 1 && /bbb\/y\.js/.test(r.stdout), 'codex #239: overflow into sibling lane must refuse, got ' + r.stdout);
    } finally { cu(grepo); } }
  // --base rejected per-node + idempotent record-base
  { const { grepo, planPath } = mkRepo(); try {
      assert(runVal([planPath, '--record-base', '--node-id', 'a'], grepo).status === 0, 'codex: record-base a');
      w(grepo, 'bbb/y.js', 'y\n');
      const rb = runVal([planPath, '--barrier-check', '--node-id', 'a', '--base', 'HEAD', '--json'], grepo);
      assert(rb.status === 1 && /--base/.test(rb.stdout), 'codex #239: --base must be rejected per-node, got ' + rb.stdout);
      const rb2 = runVal([planPath, '--record-base', '--node-id', 'a', '--json'], grepo);
      assert(rb2.status === 0 && JSON.parse(rb2.stdout).reused === true, 'codex #239: re-record must reuse the baseline, got ' + rb2.stdout);
    } finally { cu(grepo); } }
  // ---- #340 freeze-time write-set completeness (CODEX byte copy) ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-340-'));
    try {
      const planAt = (rows) => { const p = path.join(tmp, 'plan.md'); fs.writeFileSync(p, ['# Plan', '', '## Meta', 'labels: enhancement', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', ...rows, ''].join('\n')); return p; };
      // A1-shaped: agent add omitting the surface, anchor planted -> refuse naming the surface.
      fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'scripts', 'validate-vendored-agents.js'), '// anchor\n');
      let r = runVal([planAt([
        '| scout | implementer | ex | agents/new-scout.md | 1 | sequence |',
        '| ex | code-explorer | — | — | 1 | sequence |',
        '| rv | code-reviewer | scout | — | 1 | sequence |',
        '| done | finalize | rv | — | 1 | sequence |',
      ]), '--json'], tmp);
      let out = JSON.parse(r.stdout);
      assert(out.result === 'refuse' && /agent-registration gap:.*validate-vendored-agents\.js/.test((out.errors || []).join('\n')) && /agent-registration gap:.*uninstall\.sh/.test((out.errors || []).join('\n')),
        'codex #340 A1: agent add omitting the surface must refuse naming validate-vendored-agents.js + uninstall.sh, got ' + r.stdout);
      // A4-shaped: a port parallel to its root edit -> refuse (forge-port ordering gap; fs-free).
      r = runVal([planAt([
        '| ex | code-explorer | — | — | 1 | sequence |',
        '| rootedit | tdd-guide | ex | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/' + 'scripts/kaola-workflow-claim.js | 1 | sequence |',
        '| port | implementer | ex | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
        '| rv | code-reviewer | rootedit,port | — | 1 | sequence |',
        '| done | finalize | rv | — | 1 | sequence |',
      ]), '--json'], tmp);
      out = JSON.parse(r.stdout);
      assert(out.result === 'refuse' && /forge-port ordering gap/.test((out.errors || []).join('\n')),
        'codex #340 A4: a port parallel to its root edit must refuse with forge-port ordering gap, got ' + r.stdout);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // ---- #334 non-delegable main-session-gate (CODEX byte copy) ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-334-'));
    try {
      const g3Plan = (ledgerRows) => { const projDir = path.join(tmp, 'kaola-workflow', 'issue-334'); fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true }); const p = path.join(projDir, 'workflow-plan.md'); fs.writeFileSync(p, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| impl | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| done | finalize | vgate | — | 1 | sequence |', '', '## Node Ledger', '', '| id | status |', '|---|---|', ...ledgerRows, ''].join('\n')); return { p, projDir }; };
      // in-grammar control: a post-dominating main-session-gate freezes.
      let r = runVal([g3Plan(['| impl | pending |', '| rv | pending |', '| vgate | pending |', '| done | pending |']).p, '--json'], tmp);
      assert(JSON.parse(r.stdout).result === 'in-grammar', 'codex #334: post-dominating main-session-gate must be in-grammar, got ' + r.stdout);
      // G3 freeze refusal: a side-branch gate (does not post-dominate impl) refuses /G3/.
      { const p = path.join(tmp, 'g3side.md'); fs.writeFileSync(p, ['# Plan', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ex | code-explorer | — | — | 1 | sequence |', '| impl | implementer | ex | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| vgate | main-session-gate | ex | — | 1 | sequence |', '| done | finalize | rv,vgate | — | 1 | sequence |', ''].join('\n'));
        r = runVal([p, '--json'], tmp);
        assert(JSON.parse(r.stdout).result === 'refuse' && /G3/.test((JSON.parse(r.stdout).errors || []).join(';')), 'codex #334: side-branch gate must refuse (G3), got ' + r.stdout); }
      // --gate-verify: impl complete + gate PENDING -> exit 1 (the regression scenario).
      assert(runVal([g3Plan(['| impl | complete |', '| rv | complete |', '| vgate | pending |', '| done | pending |']).p, '--gate-verify', '--json'], tmp).status === 1, 'codex #334: --gate-verify exit 1 when gate pending');
      // --gate-verify: gate n/a -> exit 1 (cannot be skipped).
      assert(runVal([g3Plan(['| impl | complete |', '| rv | complete |', '| vgate | n/a |', '| done | complete |']).p, '--gate-verify', '--json'], tmp).status === 1, 'codex #334: --gate-verify exit 1 when gate n/a');
      // pass control: gate complete + .cache verdicts -> --gate-verify AND --verdict-check exit 0.
      { const { p, projDir } = g3Plan(['| impl | complete |', '| rv | complete |', '| vgate | complete |', '| done | complete |']);
        fs.writeFileSync(path.join(projDir, '.cache', 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
        fs.writeFileSync(path.join(projDir, '.cache', 'vgate.md'), 'verdict: pass\nfindings_blocking: 0\nGPU true-black confirmed\n');
        assert(runVal([p, '--gate-verify', '--json'], tmp).status === 0, 'codex #334: --gate-verify exit 0 when gate complete + post-dominates');
        assert(runVal([p, '--verdict-check', '--json'], tmp).status === 0, 'codex #334: --verdict-check exit 0 when gate records verdict: pass'); }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // ---- #509 (CODEX byte copy): --verdict-check is SCOPED to CHANGE-GATE adversarial-verifiers ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-509-'));
    try {
      const mkAv = (nodes, ledger, labels) => { const projDir = path.join(tmp, 'kaola-workflow', 'issue-509'); fs.rmSync(path.join(projDir, '.cache'), { recursive: true, force: true }); fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true }); const p = path.join(projDir, 'workflow-plan.md'); fs.writeFileSync(p, ['# Plan', '', '## Meta', 'labels: ' + (labels || 'question'), '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', ...nodes, '', '## Node Ledger', '', '| id | status |', '|---|---|', ...ledger, ''].join('\n')); return { p, projDir }; };
      // (a-seq) investigation adversarial-verifier (post-dominates no code/sensitive) emitting refuted -> PASS (exit 0).
      let av = mkAv(['| probe | code-explorer | — | — | 1 | sequence |', '| assume | knowledge-lookup | probe | — | 1 | sequence |', '| critique | adversarial-verifier | assume | — | 1 | sequence |', '| done | finalize | critique | — | 1 | sequence |'], ['| probe | complete |', '| assume | complete |', '| critique | complete |', '| done | complete |']);
      fs.writeFileSync(path.join(av.projDir, '.cache', 'critique.md'), 'verdict: refuted\nfindings_blocking: 2\nwrong\n');
      assert(runVal([av.p, '--verdict-check', '--json'], tmp).status === 0, 'codex #509(a-seq): investigation adversarial-verifier (no code/sensitive post-dominance) emitting refuted must PASS --verdict-check (exit 0)');
      // (a-fanout) read-only majority-refute investigation fanout -> PASS (exit 0, exempt regardless of shape).
      av = mkAv(['| assume | knowledge-lookup | — | — | 1 | sequence |', '| crit1 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| crit2 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| crit3 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| done | finalize | crit1,crit2,crit3 | — | 1 | sequence |'], ['| assume | complete |', '| crit1 | complete |', '| crit2 | complete |', '| crit3 | complete |', '| done | complete |']);
      fs.writeFileSync(path.join(av.projDir, '.cache', 'adversarial-verifier-crit1.md'), 'verdict: refuted\nfindings_blocking: 1\n');
      fs.writeFileSync(path.join(av.projDir, '.cache', 'adversarial-verifier-crit2.md'), 'verdict: refuted\nfindings_blocking: 1\n');
      fs.writeFileSync(path.join(av.projDir, '.cache', 'adversarial-verifier-crit3.md'), 'verdict: pass\nfindings_blocking: 0\n');
      assert(runVal([av.p, '--verdict-check', '--json'], tmp).status === 0, 'codex #509(a-fanout): read-only majority-refute investigation fanout must PASS --verdict-check (exit 0) — exemption keys on post-dominance, not shape');
      // (b) CHANGE-GATE adversarial-verifier (post-dominates a code-producing impl) emitting refuted -> STILL BLOCK (exit 1).
      av = mkAv(['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| critique | adversarial-verifier | rv | — | 1 | sequence |', '| done | finalize | critique | — | 1 | sequence |'], ['| impl | complete |', '| rv | complete |', '| critique | complete |', '| done | complete |'], 'feature');
      fs.writeFileSync(path.join(av.projDir, '.cache', 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
      fs.writeFileSync(path.join(av.projDir, '.cache', 'critique.md'), 'verdict: refuted\nfindings_blocking: 3\nbroken\n');
      assert(runVal([av.p, '--verdict-check', '--json'], tmp).status === 1, 'codex #509(b): a CHANGE-GATE adversarial-verifier (post-dominates code) emitting refuted must STILL BLOCK --verdict-check (exit 1) — the gate stays strong');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // ---- #501 (CODEX byte copy): high-blast-radius surfaces require the internal G2 security-reviewer ----
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-501-'));
    try {
      const mkSp = (writeSet, nodes) => { const p = path.join(tmp, 'sp.md'); fs.writeFileSync(p, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', ...nodes, ''].join('\n')); return p; };
      for (const sp of ['.env', '.env.local', 'Dockerfile', '.github/workflows/deploy.yml', '.gitlab-ci.yml']) {
        // no security-reviewer -> refuse (G2).
        let r = runVal([mkSp(sp, ['| impl | tdd-guide | — | ' + sp + ' | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |']), '--json'], tmp);
        assert(JSON.parse(r.stdout).result === 'refuse' && /G2/.test((JSON.parse(r.stdout).errors || []).join(';')), 'codex #501: sensitive surface "' + sp + '" with no security-reviewer must refuse (G2), got ' + r.stdout);
        // CONTROL: with a security-reviewer post-dominator -> in-grammar.
        r = runVal([mkSp(sp, ['| impl | tdd-guide | — | ' + sp + ' | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| sec | security-reviewer | review | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |']), '--json'], tmp);
        assert(JSON.parse(r.stdout).result === 'in-grammar', 'codex #501 CONTROL: sensitive surface "' + sp + '" WITH a security-reviewer must freeze green, got ' + r.stdout);
      }
      // NEG-CONTROL: lookalike benign paths must NOT be swept into G2.
      const rn = runVal([mkSp('x', ['| impl | tdd-guide | — | src/environment.js, lib/Dockerfileutil.js | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |']), '--json'], tmp);
      assert(JSON.parse(rn.stdout).result === 'in-grammar' && !/G2/.test((JSON.parse(rn.stdout).errors || []).join(';')), 'codex #501 NEG-CONTROL: benign environment.js / Dockerfileutil.js must NOT be flagged sensitive (no G2), got ' + rn.stdout);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log('Codex adaptive #238/#239 coverage: PASSED');
}

// #425/#431 (codex byte copy): ledger-header freeze-wall + generated-aggregator port-split
// freeze-wall on the CODEX copy of the plan-validator. Exercises the byte-identical copy to
// confirm the freeze-wall behaviors are present in the codex edition.
function testCodexLedgerHeaderInvalid425() {
  const pv = require(codexValidator);
  const planBody = [
    '# Plan', '',
    '## Meta',
    'plan_schema_version: 2',
    'labels: chore',
    'code_certifier: review',
    'security_certifier: none',
    'inherited_frontier_digest: none',
    'inherited_frontier_classes: none',
    'validation_command: node --check scripts/kaola-workflow-plan-validator.js',
    'validation_timeout_minutes: 5', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| impl | tdd-guide | — | lib/foo.js | 1 | sequence | — | — | — | — |',
    '| review | code-reviewer | impl | — | 1 | sequence | review-change | code-tree | sequence | — |',
    '| done | finalize | review | — | 1 | sequence | — | — | — | — |',
    '',
    '## Node Ledger', '',
    '| node | status |',
    '|---|---|',
    '| impl | pending |',
    '| review | pending |',
    '| done | pending |',
    '',
  ].join('\n');

  // (1) validatePlan must refuse with ledger_header_invalid.
  const v = pv.validatePlan(planBody);
  assert(v.result === 'refuse',
    'codex #425: plan with `| node |` ledger header must refuse at freeze, got: ' + JSON.stringify(v.result));
  assert(Array.isArray(v.errors) && v.errors.some(e => /ledger_header_invalid/.test(e)),
    'codex #425: refusal errors must name ledger_header_invalid, got: ' + JSON.stringify(v.errors));

  // (2) --repair via CLI: --freeze --repair must normalize and surface header_normalized:true.
  const repairTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-425-'));
  try {
    const planPath = path.join(repairTmp, 'plan.md');
    fs.writeFileSync(planPath, planBody);
    const r = spawnSync(process.execPath, [codexValidator, planPath, '--freeze', '--repair', '--json'], {
      cwd: repairTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(r.status === 0,
      'codex #425: --freeze --repair must exit 0, got ' + r.status + ' stderr: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert(out.result === 'in-grammar',
      'codex #425: --freeze --repair must freeze to in-grammar, got: ' + JSON.stringify(out.result));
    assert(out.header_normalized === true,
      'codex #425: --freeze --repair must surface header_normalized:true, got: ' + JSON.stringify(out.header_normalized));
  } finally { fs.rmSync(repairTmp, { recursive: true, force: true }); }

  console.log('testCodexLedgerHeaderInvalid425: PASSED');
}

function testCodexGeneratedPortSplit431() {
  // The codex copy of plan-validator loads `editionSync = null` (edition-sync.js is a root-only
  // module not copied to plugin trees), so the generated_port_split check is intentionally inert
  // in the codex validator. This test verifies the correct anchoring behaviour:
  // (a) codex copy is inert (split plan passes — zero false positives in codex installs), and
  // (b) the canonical root copy fires the split-wall (root is where edition-sync.js lives).
  const codexPv = require(codexValidator);
  const rootPv = require(path.join(repoRoot, 'scripts', 'kaola-workflow-plan-validator.js'));

  const splitPlan = [
    '# Plan', '',
    '## Meta', 'labels: chore', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| impl | implementer | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/' + 'scripts/kaola-workflow-plan-validator.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| done | finalize | review | — | 1 | sequence |',
    '',
  ].join('\n');

  // (a) codex copy is inert for generated_port_split: must NOT refuse on missing forge ports.
  const codexResult = codexPv.validatePlan(splitPlan);
  assert(!(Array.isArray(codexResult.errors) && codexResult.errors.some(e => /generated_port_split/.test(e))),
    'codex #431 anchor: codex validator must NOT fire generated_port_split (inert in codex tree), got: ' + JSON.stringify(codexResult.errors));

  // (b) canonical root copy fires the split-wall with repoRoot as the anchor.
  const splitResult = rootPv.validatePlan(splitPlan, { root: repoRoot });
  assert(splitResult.result === 'refuse',
    'codex #431 root: split plan (canonical+codex only) must refuse via root validator, got: ' + JSON.stringify(splitResult.result));
  assert(Array.isArray(splitResult.errors) && splitResult.errors.some(e => /generated_port_split/.test(e)),
    'codex #431 root: root validator refusal must name generated_port_split, got: ' + JSON.stringify(splitResult.errors));

  // (c) bundled plan (all 4 editions) must freeze in-grammar via root validator.
  const bundledPlan = [
    '# Plan', '',
    '## Meta', 'labels: chore', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| impl | implementer | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/' + 'scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| done | finalize | review | — | 1 | sequence |',
    '',
  ].join('\n');
  const bundledResult = rootPv.validatePlan(bundledPlan, { root: repoRoot });
  assert(bundledResult.result === 'in-grammar',
    'codex #431 root: bundled plan (all 4 editions) must freeze in-grammar, got: ' + JSON.stringify(bundledResult.result));

  console.log('testCodexGeneratedPortSplit431: PASSED');
}

// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the 3 new scripts.
// Each case proves discriminating RED (wrong fixture → typed refusal / wrong JSON)
// then GREEN (correct fixture → ok / correct JSON).
// ---------------------------------------------------------------------------

const preflightScript   = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
const taskMirrorScript  = path.join(pluginRoot, 'scripts', 'kaola-workflow-task-mirror.js');
const compactResumeScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-compact-resume.js');

// Shared frozen plan fixture (used by task-mirror + compact-resume tests)
const FIXTURE_PLAN_HASH = 'f59d3465f4ca7584eba5f7d04446bf2914e019ba1aa4511c5a25f4e65a80497e';
const FIXTURE_PLAN = [
  '# Workflow Plan',
  `<!-- plan_hash: ${FIXTURE_PLAN_HASH} -->`,
  '',
  '## Meta',
  'labels: enhancement',
  '',
  '## Nodes',
  '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| impl | implementer | explore | src/x.js | 1 | sequence |',
  '| gate | code-reviewer | impl | — | 1 | sequence |',
  '| done | finalize | gate | — | 1 | sequence |',
  '',
  '## Node Ledger',
  '',
  '| id | status |',
  '|---|---|',
  '| explore | complete |',
  '| impl | in_progress |',
  '| gate | pending |',
  '| done | n/a |',
  'consent_halt: pending',
  ''
].join('\n');

function runScript(scriptPath, args, opts) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    ...opts
  });
}

// Case 1 + Case 2 + Case 5: preflight tests (stale config, missing profiles, no-silent-fallback)
function testCodexPreflight266() {
  // #571: hermetic-HOME retrofit — spawn each preflight call with an empty temp HOME so the
  // new global-first short-circuit finds no ~/.codex and falls through to project-scope assertions.
  const emptyHome266 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-hermetic-home-'));
  const h266 = { env: { ...process.env, HOME: emptyHome266, USERPROFILE: emptyHome266 } };
  // Build a fully-installed fixture to start from
  const root266 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-'));
  try {
    // Install all 16 profiles into the fixture (14 base + synthesizer #463 + metric-optimizer #634)
    const installResult = spawnSync(process.execPath, [installProfilesScript, root266], {
      cwd: repoRoot, encoding: 'utf8'
    });
    if (installResult.error) throw installResult.error;
    assert(installResult.status === 0, 'preflight fixture install failed: ' + installResult.stderr);

    // --- GREEN: fresh fixture must pass preflight ---
    const freshResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(freshResult.status === 0,
      '#266 case1 RED-discriminator: fresh fixture must exit 0, got ' + freshResult.status + '\n' + freshResult.stdout);
        const freshJson = JSON.parse(freshResult.stdout);
        assert(freshJson.status === 'ok',
          '#266 case1 RED-discriminator: fresh fixture must return status:ok, got ' + freshJson.status);

        // --- Case 1 RED: corrupt the managed block (remove a role entry) → config_stale ---
        const configPath = path.join(root266, '.codex', 'config.toml');
        const origConfig = fs.readFileSync(configPath, 'utf8');
        function configWithFeatureLine(line) {
          return origConfig.replace('multi_agent = true', 'multi_agent = true\n' + line);
        }
        const roleSafeV2Inline = 'multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true }';
        const roleSafeV2Table = '[features.multi_agent_v2]\nenabled = true\ntool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true';
        function assertDispatchModeForConfig(body, expectedMode, label, checkDoctor) {
          fs.writeFileSync(configPath, body);
          const result = runScript(preflightScript,
            ['--project-root', root266, '--no-autofix', '--json'], h266);
          assert(result.status === 0,
            label + ': preflight must pass, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert(json.dispatch_mode === expectedMode,
            label + ': expected dispatch_mode ' + expectedMode + ', got ' + json.dispatch_mode);
          assert(json.multi_agent_v2_enabled === (expectedMode === 'v2-task-name'),
            label + ': multi_agent_v2_enabled mismatch, got ' + json.multi_agent_v2_enabled);
          if (checkDoctor) {
            const doctorResult = runScript(preflightScript,
              ['--doctor', '--project-root', root266, '--json'], h266);
            const doctorJson = JSON.parse(doctorResult.stdout);
            const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
            assert(projectScope && projectScope.dispatch_mode === expectedMode,
              label + ': doctor project scope expected ' + expectedMode + ', got ' + JSON.stringify(projectScope));
          }
        }
        assertDispatchModeForConfig(origConfig, 'v1-thread-id', '#584 no multi_agent_v2 key', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Inline), 'v2-task-name', '#650 role-safe inline', true);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = false'), 'v1-thread-id', '#584 boolean false', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Inline), 'v2-task-name', '#650 inline role transport ready', true);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = false, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), 'v1-thread-id', '#584 inline object enabled false', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Table), 'v2-task-name', '#650 table role transport ready', true);
        assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = false'), 'v1-thread-id', '#584 table enabled false', false);
        assertDispatchModeForConfig(configWithFeatureLine('["features.multi_agent_v2"]\nenabled = true'), 'v1-thread-id', '#647 basic quoted literal dotted table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[\'features.multi_agent_v2\']\nenabled = true'), 'v1-thread-id', '#647 literal quoted dotted table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[[features.multi_agent_v2]]\nenabled = true'), 'v1-thread-id', '#647 R2 array-of-table dotted v2 table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[[features."multi_agent_v2"]]\nenabled = true'), 'v1-thread-id', '#647 R2 quoted-segment array-of-table v2 table must not enable v2', false);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[projects."/tmp/kaola-project"]\nenabled = true\n\n[plugins."sample@test"]\nenabled = true'),
          'v2-task-name', '#647 quoted project/plugin tables after dotted v2 table reset parser state', true);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[[plugins.\'sample@test\'.mcp_servers]]\nenabled = true'),
          'v2-task-name', '#647 array-of-table literal quoted segment after dotted v2 table resets parser state', false);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[[features.multi_agent_v2]]\nenabled = false'),
          'v2-task-name', '#647 R2 exact array-of-table after dotted v2 table resets parser state', false);
        assertDispatchModeForConfig('[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, 'v1-thread-id', '#584 warning suppression only', false);
        assertDispatchModeForConfig('multi_agent_v2 = true\n\n' + origConfig, 'v1-thread-id', '#584 top-level key ignored', false);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { hide_spawn_agent_metadata = false }'), 'v1-thread-id', '#584 inline object missing enabled fails closed', false);

        // #598 AC2: effort-gated MultiAgentMode dispatch-POSTURE (distinct from dispatch_mode
        // above — posture reflects whether the runtime will REFUSE a spawn, not just whether the
        // tools are exposed). ATTESTATION-STYLE / NON-FATAL: every case must still exit 0.
        function assertDispatchPostureForConfig(body, expectedPosture, label) {
          fs.writeFileSync(configPath, body);
          const result = runScript(preflightScript,
            ['--project-root', root266, '--no-autofix', '--json'], h266);
          assert(result.status === 0,
            label + ': dispatch-posture WARN must never fail preflight, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert(json.dispatch_posture === expectedPosture,
            label + ': expected dispatch_posture ' + expectedPosture + ', got ' + json.dispatch_posture);
          assert((json.dispatch_posture_warning === null) === (expectedPosture === 'proactive'),
            label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
        }
        assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 base fixture (multi_agent=true, no effort)');
        assertDispatchPostureForConfig(origConfig.replace('multi_agent = true', 'multi_agent = false'), 'none',
          '#598 multi_agent=false, no multi_agent_v2 -> none');
        assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
          '#598 effort=ultra with multi_agent=true -> proactive');
        assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
          '#598 effort=xhigh (below ultra) stays explicitRequestOnly');
        assertDispatchPostureForConfig(configWithFeatureLine(roleSafeV2Inline), 'explicitRequestOnly',
          '#598 multi_agent_v2=true, no effort -> explicitRequestOnly');
        assertDispatchPostureForConfig(
          origConfig.replace('multi_agent = true', 'multi_agent = true\nmodel_reasoning_effort = "ultra"'),
          'explicitRequestOnly', '#598 effort AFTER the first [table] is not a valid TOML root key -> ignored');

        fs.writeFileSync(configPath, origConfig);
        // Replace [agents.workflow-planner] inside the block — makes that role missing from block
        const staleConfig = origConfig.replace('[agents.workflow-planner]', '[agents.STALE-workflow-planner]');
        fs.writeFileSync(configPath, staleConfig);

    const staleResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(staleResult.status !== 0,
      '#266 case1: stale managed block must cause non-zero exit, got ' + staleResult.status);
    const staleJson = JSON.parse(staleResult.stdout);
    assert(staleJson.status === 'config_stale',
      '#266 case1: stale managed block must return status:config_stale, got ' + staleJson.status);
    assert(Array.isArray(staleJson.missing_roles) && staleJson.missing_roles.includes('workflow-planner'),
      '#266 case1: missing_roles must include workflow-planner, got ' + JSON.stringify(staleJson.missing_roles));

    // --- Case 1 GREEN (autofix): without --no-autofix the installer repairs the block ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-autofix-'));
    try {
      fs.mkdirSync(path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow'), { recursive: true });
      fs.writeFileSync(path.join(autofixRoot, '.codex', 'config.toml'), staleConfig);
      // Copy all profile toml files so the installer only needs to fix the block
      const srcAgentsDir = path.join(root266, '.codex', 'agents', 'kaola-workflow');
      const dstAgentsDir = path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow');
      for (const f of fs.readdirSync(srcAgentsDir)) {
        fs.copyFileSync(path.join(srcAgentsDir, f), path.join(dstAgentsDir, f));
      }
      const autofixResult = runScript(preflightScript,
        ['--project-root', autofixRoot, '--json'], h266);
      assert(autofixResult.status === 0,
        '#266 case1 autofix: preflight with autofix must exit 0 after repair, got ' + autofixResult.status + '\n' + autofixResult.stdout);
      const autofixJson = JSON.parse(autofixResult.stdout);
      assert(autofixJson.status === 'ok' && autofixJson.autofixed === true,
        '#266 case1 autofix: must return status:ok autofixed:true, got ' + JSON.stringify(autofixJson));
    } finally {
      fs.rmSync(autofixRoot, { recursive: true, force: true });
    }

    // Restore config for case 2
    fs.writeFileSync(configPath, origConfig);

    // --- Case 2 RED: remove a profile toml file → profiles_missing ---
    const wpToml = path.join(root266, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml');
    const savedToml = fs.readFileSync(wpToml);
    fs.unlinkSync(wpToml);

    const missingResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(missingResult.status !== 0,
      '#266 case2: missing profile toml must cause non-zero exit, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert(missingJson.status === 'profiles_missing',
      '#266 case2: missing profile toml must return status:profiles_missing, got ' + missingJson.status);
    assert(Array.isArray(missingJson.missing_roles) && missingJson.missing_roles.includes('workflow-planner'),
      '#266 case2: missing_roles must include workflow-planner, got ' + JSON.stringify(missingJson.missing_roles));

    // Restore toml
    fs.writeFileSync(wpToml, savedToml);

    // --- Case 2 GREEN: restored → fresh again ---
    const restoredResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(restoredResult.status === 0,
      '#266 case2 GREEN: restored fixture must pass, got ' + restoredResult.status);

    // --- Case 5 RED: absent profile → preflight REFUSES, stdout must NOT contain subagent-invoked or local-fallback ---
    fs.unlinkSync(wpToml);
    const refusalResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(refusalResult.status !== 0,
      '#266 case5 RED: absent profile must cause non-zero exit, got ' + refusalResult.status);
    assert(!refusalResult.stdout.includes('subagent-invoked'),
      '#266 case5: preflight refusal must NOT emit subagent-invoked, got: ' + refusalResult.stdout);
    assert(!refusalResult.stdout.includes('local-fallback'),
      '#266 case5: preflight refusal must NOT emit local-fallback, got: ' + refusalResult.stdout);
    // Restore
    fs.writeFileSync(wpToml, savedToml);

    console.log('testCodexPreflight266 (#266 cases 1,2,5): PASSED');
  } finally {
    fs.rmSync(root266, { recursive: true, force: true });
    fs.rmSync(emptyHome266, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #598 AC1: installer dispatch-posture REPORT. ATTESTATION-STYLE / NON-FATAL — the
// installer must REPORT the effective effort-gated MultiAgentMode posture and, when
// non-proactive, the exact remediation, and this must NEVER change the install's own
// exit code (an otherwise-good install must never be reddened by this report).
// ---------------------------------------------------------------------------
function testCodexDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-proj-'));
  try {
    const fresh = runInstallProfiles(postureProj, { HOME: postureHome });
    assert(/status: ok/.test(fresh.stdout), '#598 AC1: existing "status: ok" output must be unchanged: ' + fresh.stdout);
    assert(/Kaola-Workflow Codex dispatch posture: explicitRequestOnly/.test(fresh.stdout),
      '#598 AC1: fresh install (multi_agent=true, no effort configured) must report explicitRequestOnly: ' + fresh.stdout);
    assert(/model_reasoning_effort = "ultra"/.test(fresh.stdout),
      '#598 AC1: non-proactive posture must print the exact remediation naming model_reasoning_effort="ultra": ' + fresh.stdout);
    assert(/codex -c model_reasoning_effort=ultra/.test(fresh.stdout),
      '#598 AC1: remediation must also name the per-session codex -c override: ' + fresh.stdout);
    assert(/0\.142\.5/.test(fresh.stdout), '#598 AC1/AC2: report must carry the version-guard note (0.142.5): ' + fresh.stdout);
    // #601: the remediation must LEAD with the always-available, always-documented in-session
    // ask, before the effort-gated (undocumented/server-gated) ultra clause.
    const askIdx601 = fresh.stdout.indexOf('explicitly ask for sub-agents');
    const ultraIdx601 = fresh.stdout.indexOf('model_reasoning_effort = "ultra"');
    assert(askIdx601 !== -1 && ultraIdx601 !== -1 && askIdx601 < ultraIdx601,
      '#601: remediation must lead with the in-session ask before the effort-gated ultra clause: ' + fresh.stdout);

    // Flip to effort="ultra" ahead of the managed block, re-install (idempotent update) —
    // the posture must flip to proactive and the non-proactive remediation must disappear.
    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    const beforeUltra = fs.readFileSync(postureConfigPath, 'utf8');
    fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n' + beforeUltra);
    const reinstalled = runInstallProfiles(postureProj, { HOME: postureHome });
    assert(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#598 AC1: effort=ultra must report proactive posture: ' + reinstalled.stdout);
    assert(!/refuse sub-agent spawns/.test(reinstalled.stdout),
      '#598 AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstalled.stdout);

    // Pure-function unit coverage on the exported deriveDispatchPosture (same module the
    // installer's REPORT step calls).
    const mod = require(installProfilesScript);
    const none = mod.deriveDispatchPosture('[features]\nmulti_agent = false\n');
    assert(none.dispatch_posture === 'none', '#598: multi_agent=false with no v2 must derive none, got ' + JSON.stringify(none));
    assert(none.dispatch_posture_warning !== null, '#598: a non-proactive posture must carry a remediation string');
    const proactive = mod.deriveDispatchPosture('model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = true\n');
    assert(proactive.dispatch_posture === 'proactive', '#598: effort=ultra + multi_agent=true must derive proactive, got ' + JSON.stringify(proactive));
    assert(proactive.dispatch_posture_warning === null, '#598: a proactive posture must carry NO remediation');

    console.log('testCodexDispatchPosture598 (#598 AC1 installer report): PASSED');
  } finally {
    fs.rmSync(postureProj, { recursive: true, force: true });
    fs.rmSync(postureHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #611 AC6: MultiAgentV2 concurrency + wait-timeout bounds — extends the #598
// dispatch-posture report above with the effective v2 slot budget and wait-timeout
// knobs, version-guarded the same way. ATTESTATION-STYLE / NON-FATAL: every case
// below must still exit 0 and must NEVER change the install's own exit code.
// ---------------------------------------------------------------------------
function testCodexMultiAgentV2Bounds611() {
  const boundsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-home-'));
  const boundsProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-proj-'));
  try {
    const fresh = runInstallProfiles(boundsProj, { HOME: boundsHome });
    assert(/status: ok/.test(fresh.stdout), '#611 AC6: existing "status: ok" output must be unchanged: ' + fresh.stdout);
    // v2 not enabled by default -> the recommended-config note (documentation) is always
    // printed, but no concrete width line (nothing to report yet).
    assert(/multi_agent_v2:.*Recommended \[features\.multi_agent_v2\] config/.test(fresh.stdout),
      '#611 AC6: fresh install must document the recommended [features.multi_agent_v2] config: ' + fresh.stdout);
    assert(!/effective subagent width/.test(fresh.stdout),
      '#611 AC6: v2 not enabled -> must NOT print a concrete effective-width line: ' + fresh.stdout);
    assert(/0\.142\.5/.test(fresh.stdout), '#611 AC6: report must carry the version-guard note (0.142.5): ' + fresh.stdout);
    assert(/\[agents\]\.max_threads.*cannot be set/.test(fresh.stdout),
      '#611 AC6: note must state agents.max_threads is invalid under v2: ' + fresh.stdout);

    // Enable v2 with explicit bounds ahead of the managed block, re-install (idempotent
    // update) — the report must now print the concrete width + every configured bound.
    const boundsConfigPath = path.join(boundsProj, '.codex', 'config.toml');
    const beforeV2 = fs.readFileSync(boundsConfigPath, 'utf8');
    fs.writeFileSync(boundsConfigPath, beforeV2 + '\n[features.multi_agent_v2]\nenabled = true\n'
      + 'tool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true\n'
      + 'max_concurrent_threads_per_session = 3\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\n'
      + 'default_wait_timeout_ms = 60000\n');
    const v2Install = runInstallProfiles(boundsProj, { HOME: boundsHome });
    assert(/effective subagent width 2 \(max_concurrent_threads_per_session=3 \[config\]\)/.test(v2Install.stdout),
      '#611 AC6: configured threads=3 must report width=2 (threads-1) and source=config: ' + v2Install.stdout);
    assert(/min_wait_timeout_ms=1000/.test(v2Install.stdout), '#611 AC6: must report configured min_wait_timeout_ms: ' + v2Install.stdout);
    assert(/max_wait_timeout_ms=1800000/.test(v2Install.stdout), '#611 AC6: must report configured max_wait_timeout_ms: ' + v2Install.stdout);
    assert(/default_wait_timeout_ms=60000/.test(v2Install.stdout), '#611 AC6: must report configured default_wait_timeout_ms: ' + v2Install.stdout);

    // Pure-function unit coverage on the exported deriveMultiAgentV2Bounds (same module the
    // installer's REPORT step calls) — the observed default (absent key) case.
    const mod = require(installProfilesScript);
    const notApplicable = mod.deriveMultiAgentV2Bounds('[features]\nmulti_agent_v2 = false\n', false);
    assert(notApplicable.max_concurrent_threads_per_session === null,
      '#611: v2 disabled must derive max_concurrent_threads_per_session null, got ' + JSON.stringify(notApplicable));
    const observedDefault = mod.deriveMultiAgentV2Bounds('[features]\nmulti_agent_v2 = true\n', true);
    assert(observedDefault.max_concurrent_threads_per_session === 4 && observedDefault.effective_subagent_width === 3,
      '#611: absent threads value must derive the observed default 4 (width 3), got ' + JSON.stringify(observedDefault));
    const quotedUnrelated = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = true\n\n[mcp_servers."srv"]\nmax_concurrent_threads_per_session = 99\n', true);
    assert(quotedUnrelated.max_concurrent_threads_per_session === 4
      && quotedUnrelated.max_concurrent_threads_per_session_source === 'observed_default'
      && quotedUnrelated.effective_subagent_width === 3,
      '#647: quoted unrelated table after dotted v2 table must not over-collect bounds, got ' + JSON.stringify(quotedUnrelated));
    const basicQuotedLiteral = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = true\n\n["features.multi_agent_v2"]\nmax_concurrent_threads_per_session = 99\n', true);
    assert(basicQuotedLiteral.max_concurrent_threads_per_session === 4
      && basicQuotedLiteral.max_concurrent_threads_per_session_source === 'observed_default'
      && basicQuotedLiteral.effective_subagent_width === 3,
      '#647: basic quoted literal dotted table after dotted v2 table must not over-collect bounds, got ' + JSON.stringify(basicQuotedLiteral));
    const literalQuotedLiteral = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = true\n\n[\'features.multi_agent_v2\']\nmax_concurrent_threads_per_session = 99\n', true);
    assert(literalQuotedLiteral.max_concurrent_threads_per_session === 4
      && literalQuotedLiteral.max_concurrent_threads_per_session_source === 'observed_default'
      && literalQuotedLiteral.effective_subagent_width === 3,
      '#647: literal quoted dotted table after dotted v2 table must not over-collect bounds, got ' + JSON.stringify(literalQuotedLiteral));
    const arrayTableLiteral = mod.deriveMultiAgentV2Bounds('[[features.multi_agent_v2]]\nmax_concurrent_threads_per_session = 99\n', true);
    assert(arrayTableLiteral.max_concurrent_threads_per_session === 4
      && arrayTableLiteral.max_concurrent_threads_per_session_source === 'observed_default'
      && arrayTableLiteral.effective_subagent_width === 3,
      '#647 R2: array-of-table dotted v2 table must not collect bounds, got ' + JSON.stringify(arrayTableLiteral));
    const quotedArrayTableLiteral = mod.deriveMultiAgentV2Bounds('[[features."multi_agent_v2"]]\nmax_concurrent_threads_per_session = 99\n', true);
    assert(quotedArrayTableLiteral.max_concurrent_threads_per_session === 4
      && quotedArrayTableLiteral.max_concurrent_threads_per_session_source === 'observed_default'
      && quotedArrayTableLiteral.effective_subagent_width === 3,
      '#647 R2: quoted-segment array-of-table v2 table must not collect bounds, got ' + JSON.stringify(quotedArrayTableLiteral));

    console.log('testCodexMultiAgentV2Bounds611 (#611 AC6 installer report): PASSED');
  } finally {
    fs.rmSync(boundsProj, { recursive: true, force: true });
    fs.rmSync(boundsHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #571: global-first preflight gate — install once to ~/.codex, all repos pass.
// ---------------------------------------------------------------------------
function testCodexPreflight571() {
  // --- Test (a): global-only install ⇒ gate PASSES (scope:'global') ---
  // Setup: install profiles to tempHome571a using the POSITIONAL form (node installer tempHome571a).
  // os.homedir() in child processes = tempHome571a (HOME override), so the preflight's
  // globalCodexDir = tempHome571a/.codex — which has the fresh profiles.
  //
  // RED-first discriminator: old gate checks project scope only. Project absent → profiles_missing,
  // exit 1. `r.status===0` assertion FAILS (RED).
  // GREEN after gate change: global-first short-circuit fires (status:'ok', scope:'global', exit 0).
  const tempHome571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571a-home-'));
  try {
    const env571a = { ...process.env, HOME: tempHome571a, USERPROFILE: tempHome571a };
    const setupInstall = spawnSync(process.execPath, [installProfilesScript, tempHome571a], {
      cwd: repoRoot, encoding: 'utf8', env: env571a
    });
    assert(setupInstall.status === 0,
      '#571 test(a): positional-form install to tempHome must exit 0: ' + setupInstall.stderr);

    const emptyProject571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571a-proj-'));
    try {
      const r = runScript(preflightScript,
        ['--project-root', emptyProject571a, '--no-autofix', '--json'],
        { env: env571a });
      // RED-discriminator: old gate returns non-zero (project absent → profiles_missing).
      assert(r.status === 0,
        '#571 test(a) RED-discriminator: global-only install must pass preflight, got ' +
        r.status + '\n' + r.stdout);
      const j = JSON.parse(r.stdout);
      assert(j.status === 'ok',
        '#571 test(a): status must be ok, got ' + j.status);
      assert(j.scope === 'global',
        '#571 test(a): scope must be global, got ' + j.scope);
      assert(!fs.existsSync(path.join(emptyProject571a, '.codex')),
        '#571 test(a): no project .codex must be created when global scope satisfies the gate');
    } finally {
      fs.rmSync(emptyProject571a, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571a, { recursive: true, force: true });
  }

  // --- Test (b): neither scope valid ⇒ FAILS CLOSED (proves no regression hole) ---
  const tempHome571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571b-home-'));
  const emptyProject571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571b-proj-'));
  try {
    const r = runScript(preflightScript,
      ['--project-root', emptyProject571b, '--no-autofix', '--json'],
      { env: { ...process.env, HOME: tempHome571b, USERPROFILE: tempHome571b } });
    assert(r.status !== 0,
      '#571 test(b): neither scope valid must fail closed, got exit ' + r.status);
    const j = JSON.parse(r.stdout);
    assert(j.status === 'profiles_missing' || j.status === 'config_stale',
      '#571 test(b): fail-closed must return profiles_missing or config_stale, got ' + j.status);
  } finally {
    fs.rmSync(tempHome571b, { recursive: true, force: true });
    fs.rmSync(emptyProject571b, { recursive: true, force: true });
  }

  // --- Test (c): stale global does NOT short-circuit (locks scopeIsFresh && s.exists) ---
  // Setup: install to tempHome571c via positional form, then delete one role toml.
  const tempHome571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571c-home-'));
  try {
    const env571c = { ...process.env, HOME: tempHome571c, USERPROFILE: tempHome571c };
    const setupC = spawnSync(process.execPath, [installProfilesScript, tempHome571c], {
      cwd: repoRoot, encoding: 'utf8', env: env571c
    });
    assert(setupC.status === 0, '#571 test(c): setup install must exit 0: ' + setupC.stderr);
    // Delete one role toml → stale global; scopeIsFresh must return false.
    fs.unlinkSync(
      path.join(tempHome571c, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml'));

    const emptyProject571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571c-proj-'));
    try {
      const r = runScript(preflightScript,
        ['--project-root', emptyProject571c, '--no-autofix', '--json'],
        { env: env571c });
      assert(r.status !== 0,
        '#571 test(c): stale global must not short-circuit, got exit ' + r.status);
    } finally {
      fs.rmSync(emptyProject571c, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571c, { recursive: true, force: true });
  }

  // --- Test (a2): --global installer flag targets os.homedir() (exercises installer change) ---
  const tempHome571flag = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571flag-home-'));
  try {
    const envFlag = { ...process.env, HOME: tempHome571flag, USERPROFILE: tempHome571flag };
    const globalFlagInstall = spawnSync(process.execPath, [installProfilesScript, '--global'], {
      cwd: repoRoot, encoding: 'utf8', env: envFlag
    });
    assert(globalFlagInstall.status === 0,
      '#571 test(a2): --global flag install must exit 0: ' + globalFlagInstall.stderr);
    assert(
      fs.existsSync(path.join(tempHome571flag, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml')),
      '#571 test(a2): --global flag must write workflow-planner.toml to tempHome/.codex/agents/kaola-workflow/');
    assert(
      fs.existsSync(path.join(tempHome571flag, '.codex', 'config.toml')),
      '#571 test(a2): --global flag must write config.toml to tempHome/.codex');
  } finally {
    fs.rmSync(tempHome571flag, { recursive: true, force: true });
  }

  console.log('testCodexPreflight571 (#571 global-scope gate): PASSED');
}

// ---------------------------------------------------------------------------
// #332: installer schema + prune + manifest + sentinel (AC3-AC6).
// ---------------------------------------------------------------------------
const NAME_RE = /^name\s*=\s*"([^"]+)"\s*$/m;

function listTomls(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.toml')).sort();
}

function testInstallSchemaPruneManifest332() {
  const manifestBase = '.kaola-managed-profiles.json';

  // --- AC3: fresh install = current set, no docs-lookup, every profile has name,
  //     manifest written, stdout ends with `status: ok` ---
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-fresh-'));
  try {
    const r = runInstallProfiles(fresh);
    const agentsDir = path.join(fresh, '.codex', 'agents', 'kaola-workflow');
    const tomls = listTomls(agentsDir);
    // #451: 14 base role profiles (the <role>-max effort variants are retired).
    assert(tomls.length === 16, '#463 AC: fresh install must place exactly 16 *.toml (14 base + synthesizer + metric-optimizer; <role>-max retired), got ' + tomls.length);
    assert(!tomls.includes('docs-lookup.toml'), '#332 AC3: docs-lookup.toml must not be installed');
    const profilePolicy = require(installProfilesScript);
    for (const f of tomls) {
      const role = f.replace(/\.toml$/, '');
      const body = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      const m = body.match(NAME_RE);
      assert(m && m[1] === role, '#332 AC3: ' + f + ' must have name = "' + role + '"');
      const pinned = profilePolicy.CODEX_PINNED_STANDARD_ROLES.includes(role);
      const reasoning = profilePolicy.CODEX_PINNED_REASONING_ROLES.includes(role);
      assert(pinned !== reasoning, '#332 AC3: ' + role + ' must belong to exactly one profile class');
      assert(!/^model\s*=/m.test(body) && !/^model_reasoning_effort\s*=/m.test(body),
        '#332 AC3: ' + role + ' must inherit the parent session by omitting both runtime keys');
    }
    const manifestPath = path.join(agentsDir, manifestBase);
    assert(fs.existsSync(manifestPath), '#332 AC3: manifest must be written');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(manifest.schema_version === 1, '#332 AC3: manifest schema_version must be 1');
    assert(Array.isArray(manifest.roles) && manifest.roles.length === 16, '#463 AC: manifest must list 16 roles (14 base + synthesizer + metric-optimizer)');
    assert(manifest.files && Object.keys(manifest.files).length === 16
      && Object.values(manifest.files).every(v => /^sha256:[0-9a-f]{64}$/.test(v)),
      '#463 AC: manifest.files must carry 16 sha256 entries (14 base + synthesizer + metric-optimizer)');
    for (const role of ['code-reviewer', 'adversarial-verifier']) {
      const file = role + '.toml';
      const sourceBytes = fs.readFileSync(path.join(pluginRoot, 'agents', file));
      const installedBytes = fs.readFileSync(path.join(agentsDir, file));
      assert(sourceBytes.equals(installedBytes),
        'reviewer contract: installed ' + file + ' must byte-match the selected source');
      const text = installedBytes.toString('utf8');
      const expectedIdentity = {
        behavior_contract_version: Number(text.match(/^behavior_contract_version = (\d+)$/m)[1]),
        behavior_contract_hash: text.match(/^behavior_contract_hash = "([0-9a-f]{64})"$/m)[1],
        resolved_profile_hash: text.match(/^resolved_profile_hash = "([0-9a-f]{64})"$/m)[1],
      };
      assert(JSON.stringify(manifest.profile_contracts[file]) === JSON.stringify(expectedIdentity),
        'reviewer contract: manifest must bind behavior/profile identity for ' + file);
    }
    const lastLine = r.stdout.trim().split('\n').pop();
    assert(lastLine === 'status: ok', '#332 AC3: installer stdout must end with `status: ok`, got: ' + lastLine);
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // --- AC4 + AC9 write-path: upgrade-over-old-state repairs malformed/retired files ---
  const upgrade = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-upgrade-'));
  try {
    const agentsDir = path.join(upgrade, '.codex', 'agents', 'kaola-workflow');
    fs.mkdirSync(agentsDir, { recursive: true });
    // seed a no-name code-explorer.toml + a retired docs-lookup.toml
    fs.writeFileSync(path.join(agentsDir, 'code-explorer.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """stale no-name body"""\n');
    fs.writeFileSync(path.join(agentsDir, 'docs-lookup.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """retired role body"""\n');
    // seed an old managed block that registers the retired [agents.docs-lookup]
    fs.mkdirSync(path.join(upgrade, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(upgrade, '.codex', 'config.toml'), [
      '# BEGIN kaola-workflow agents',
      '[features]',
      'multi_agent = true',
      '[agents.docs-lookup]',
      'config_file = "./agents/kaola-workflow/docs-lookup.toml"',
      '# END kaola-workflow agents',
      ''
    ].join('\n'));

    const r = runInstallProfiles(upgrade);
    assert(r.status === 0, '#332 AC4: upgrade reinstall must exit 0');
    const tomls = listTomls(agentsDir);
    assert(!tomls.includes('docs-lookup.toml'), '#332 AC4: retired docs-lookup.toml must be pruned');
    const ce = fs.readFileSync(path.join(agentsDir, 'code-explorer.toml'), 'utf8');
    assert(NAME_RE.test(ce) && ce.match(NAME_RE)[1] === 'code-explorer',
      '#332 AC4: code-explorer.toml must be rewritten with name');
    assert(fs.existsSync(path.join(agentsDir, manifestBase)), '#332 AC4: manifest must be written on upgrade');
    const cfg = fs.readFileSync(path.join(upgrade, '.codex', 'config.toml'), 'utf8');
    assert(cfg.includes('[agents.knowledge-lookup]'), '#332 AC9: block must now register knowledge-lookup');
    assert(!cfg.includes('[agents.docs-lookup]'), '#332 AC9: block must no longer register docs-lookup');
    assert(r.stdout.includes('docs-lookup.toml (retired)'), '#332 AC4: stdout must report the retired prune');

    // --- AC5: double-run idempotency (toml set stable, manifest stable modulo installed_at) ---
    const before = listTomls(agentsDir);
    const m1 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    runInstallProfiles(upgrade);
    const after = listTomls(agentsDir);
    assert(JSON.stringify(before) === JSON.stringify(after), '#332 AC5: toml set must be stable across reruns');
    const m2 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    assert(JSON.stringify(m1.files) === JSON.stringify(m2.files), '#332 AC5: manifest.files must be stable across reruns');
    const cfg2 = fs.readFileSync(path.join(upgrade, '.codex', 'config.toml'), 'utf8');
    assert(countOccurrences(cfg2, /# BEGIN kaola-workflow agents/g) === 1, '#332 AC5: exactly one managed block');
  } finally {
    fs.rmSync(upgrade, { recursive: true, force: true });
  }

  // --- AC6: unknown user TOML preserved + reported as unmanaged ---
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-custom-'));
  try {
    runInstallProfiles(custom);
    const agentsDir = path.join(custom, '.codex', 'agents', 'kaola-workflow');
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'), 'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const r = runInstallProfiles(custom);
    assert(fs.existsSync(path.join(agentsDir, 'my-custom.toml')), '#332 AC6: user TOML must survive install');
    assert(r.stdout.includes('unmanaged extra profiles left in place: my-custom.toml'),
      '#332 AC6: stdout must report the unmanaged extra');
  } finally {
    fs.rmSync(custom, { recursive: true, force: true });
  }

  // --- stale-managed prune via manifest (a non-retired ghost listed in the manifest) ---
  const ghost = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-ghost-'));
  try {
    runInstallProfiles(ghost);
    const agentsDir = path.join(ghost, '.codex', 'agents', 'kaola-workflow');
    const manifestPath = path.join(agentsDir, manifestBase);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files['ghost.toml'] = 'sha256:' + '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(agentsDir, 'ghost.toml'), 'name = "ghost"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const r = runInstallProfiles(ghost);
    assert(!fs.existsSync(path.join(agentsDir, 'ghost.toml')), '#332: manifest-listed ghost.toml must be pruned');
    assert(r.stdout.includes('ghost.toml (stale-managed)'), '#332: stdout must report stale-managed prune');
  } finally {
    fs.rmSync(ghost, { recursive: true, force: true });
  }

  // --- manifest_schema_unsupported: a future schema_version refuses BEFORE any write ---
  const future = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-future-'));
  try {
    runInstallProfiles(future);
    const agentsDir = path.join(future, '.codex', 'agents', 'kaola-workflow');
    const manifestPath = path.join(agentsDir, manifestBase);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schema_version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const r = spawnSync(process.execPath, [installProfilesScript, future], { cwd: repoRoot, encoding: 'utf8' });
    assert(r.status === 1, '#332: future manifest schema must make installer exit 1, got ' + r.status);
    assert(r.stderr.includes('manifest_schema_unsupported'), '#332: stderr must name manifest_schema_unsupported');
  } finally {
    fs.rmSync(future, { recursive: true, force: true });
  }

  console.log('testInstallSchemaPruneManifest332 (#332 AC3-AC6,AC9-path): PASSED');
}

// ---------------------------------------------------------------------------
// #332: preflight schema/stale/manifest/doctor (AC7-AC11).
// ---------------------------------------------------------------------------
function testCodexPreflight332() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-preflight-'));
  try {
    runInstallProfiles(root);
    const agentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
    const ce = path.join(agentsDir, 'code-explorer.toml');
    const savedCe = fs.readFileSync(ce, 'utf8');

    // Exact-byte drift is stale even when the TOML remains parseable. Repair is scope-specific.
    const reviewer = path.join(agentsDir, 'code-reviewer.toml');
    const reviewerSource = path.join(pluginRoot, 'agents', 'code-reviewer.toml');
    fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace(
      'Precision-first code review specialist', 'Precision-first modified code review specialist'));
    let r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    let j = JSON.parse(r.stdout);
    assert(r.status !== 0 && j.status === 'profiles_stale',
      'reviewer contract: modified project profile must refuse as profiles_stale');
    assert(j.repair === `node ${installProfilesScript} ${root}`,
      'reviewer contract: project repair must be the exact scoped installer command; got ' + j.repair);
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    assert(r.status === 0, 'reviewer contract: autofix must repair project profile drift');
    assert(fs.readFileSync(reviewer).equals(fs.readFileSync(reviewerSource)),
      'reviewer contract: project autofix must restore exact selected source bytes');

    // AC7a: malformed (name stripped) → profiles_malformed under --no-autofix
    fs.writeFileSync(ce, savedCe.replace(/^name = "code-explorer"\n/m, ''));
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    assert(r.status !== 0, '#332 AC7a: malformed profile must refuse');
    j = JSON.parse(r.stdout);
    assert(j.status === 'profiles_malformed', '#332 AC7a: status must be profiles_malformed, got ' + j.status);
    assert(j.malformed[0].role === 'code-explorer', '#332 AC7a: malformed[0].role must be code-explorer');

    // AC8: same fixture WITHOUT --no-autofix → autofix repairs, status ok autofixed
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    assert(r.status === 0, '#332 AC8: autofix must exit 0 after repair');
    j = JSON.parse(r.stdout);
    assert(j.status === 'ok' && j.autofixed === true, '#332 AC8: must be ok autofixed:true');
    assert(NAME_RE.test(fs.readFileSync(ce, 'utf8')), '#332 AC8: code-explorer.toml must be repaired with name');

    // AC7b: stale docs-lookup.toml in target → profiles_stale
    fs.copyFileSync(ce, path.join(agentsDir, 'docs-lookup.toml'));
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status !== 0 && j.status === 'profiles_stale', '#332 AC7b: status must be profiles_stale, got ' + j.status);
    assert(j.stale_files.includes('docs-lookup.toml'), '#332 AC7b: stale_files must include docs-lookup.toml');
    // autofix prunes it
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    assert(r.status === 0, '#332 AC7b: autofix must prune docs-lookup and exit 0');
    assert(!fs.existsSync(path.join(agentsDir, 'docs-lookup.toml')), '#332 AC7b: docs-lookup.toml must be pruned by autofix');

    // AC9: full current set + [agents.docs-lookup] inside markers → managed_block_stale
    const cfgPath = path.join(root, '.codex', 'config.toml');
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    fs.writeFileSync(cfgPath, cfg.replace('# END kaola-workflow agents',
      '[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n\n# END kaola-workflow agents'));
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status !== 0 && j.status === 'managed_block_stale', '#332 AC9: status must be managed_block_stale, got ' + j.status);
    assert(j.stale_roles_in_block.includes('docs-lookup'), '#332 AC9: stale_roles_in_block must include docs-lookup');
    // repair via autofix
    runScript(preflightScript, ['--project-root', root, '--json'], {});

    // schema_version 2 → exit 6, profile_schema_version_unsupported (autofix refused)
    const manifestPath = path.join(agentsDir, '.kaola-managed-profiles.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schema_version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 6 && j.status === 'profile_schema_version_unsupported',
      '#332: future manifest must exit 6 / profile_schema_version_unsupported, got ' + r.status + '/' + j.status);
    manifest.schema_version = 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // AC6 field: extra unmanaged TOML keeps status ok + lists it
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'),
      'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 0 && j.status === 'ok', '#332 AC6: extra unmanaged must keep status ok');
    assert(j.extra_unmanaged.includes('my-custom.toml'), '#332 AC6: extra_unmanaged must list my-custom.toml');
    fs.unlinkSync(path.join(agentsDir, 'my-custom.toml'));

    // AC10 + AC11: doctor — stale user scope, clean project, cache evidence-only
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-doctor-home-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-doctor-proj-'));
    try {
      runInstallProfiles(home);
      runInstallProfiles(proj);
      // make user scope stale (seed docs-lookup)
      fs.copyFileSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'code-explorer.toml'),
        path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      r = runScript(preflightScript, ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
      assert(r.status === 1, '#332 AC10: doctor must exit 1 when user scope is stale, got ' + r.status);
      j = JSON.parse(r.stdout);
      const userScope = j.scopes.find(s => s.scope === 'user');
      const projScope = j.scopes.find(s => s.scope === 'project');
      assert(userScope.stale_files.includes('docs-lookup.toml'), '#332 AC10: user scope must report docs-lookup');
      assert(userScope.repair === `node ${installProfilesScript} ${home}`,
        '#332 AC10: user scope must carry the exact scoped installer command; got ' + userScope.repair);
      assert(projScope.stale_files.length === 0 && projScope.malformed.length === 0, '#332 AC10: project scope must be clean');

      // clean both → exit 0
      fs.unlinkSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      runInstallProfiles(home);
      r = runScript(preflightScript, ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
      assert(r.status === 0, '#332 AC10: doctor must exit 0 when both scopes clean, got ' + r.status);

      // AC11: plugin-cache source drift is read-only but fail-closed and carries the exact
      // refresh command. The doctor never mutates the cache itself.
      const cacheAgents = path.join(home, '.codex', 'plugins', 'cache', 'm', 'p', '1.0.0', 'agents');
      fs.mkdirSync(cacheAgents, { recursive: true });
      fs.copyFileSync(path.join(pluginRoot, 'agents', 'code-reviewer.toml'),
        path.join(cacheAgents, 'code-reviewer.toml'));
      const cachedReviewer = path.join(cacheAgents, 'code-reviewer.toml');
      fs.writeFileSync(cachedReviewer, fs.readFileSync(cachedReviewer, 'utf8').replace(
        'Precision-first code review specialist', 'Precision-first cached code review specialist'));
      r = runScript(preflightScript, ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
      assert(r.status === 1, '#332 AC11: stale plugin_cache must fail doctor, got ' + r.status);
      j = JSON.parse(r.stdout);
      const cacheScope = j.scopes.find(s => s.scope === 'plugin_cache');
      assert(cacheScope && cacheScope.read_only === true, '#332 AC11: plugin_cache scope must be read_only');
      assert(cacheScope.stale_profiles.length > 0,
        '#332 AC11: plugin_cache scope must report the stale cached reviewer profile');
      assert(cacheScope.repair === 'codex plugin remove p@m && codex plugin add p@m  # refresh plugin cache',
        '#332 AC11: plugin_cache scope must carry the exact refresh command; got ' + cacheScope.repair);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }

    fs.writeFileSync(ce, savedCe);
    console.log('testCodexPreflight332 (#332 AC7-AC11): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Case 3: task-mirror regeneration
function testCodexTaskMirror266() {
  const root266m = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-taskmirror-'));
  try {
    const projectName = 'issue-266-mirror';
    const projDir = path.join(root266m, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), FIXTURE_PLAN);

    const NOW = '2026-06-07T12:00:00.000Z';

    // --- GREEN: run task-mirror → produces correct JSON ---
    const r1 = runScript(taskMirrorScript,
      ['--project', projectName, '--now', NOW, '--json'],
      { cwd: root266m });
    assert(r1.status === 0,
      '#266 case3: task-mirror must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const mirror1 = JSON.parse(r1.stdout);
    assert(mirror1.source_plan_hash === FIXTURE_PLAN_HASH,
      '#266 case3: source_plan_hash mismatch, got ' + mirror1.source_plan_hash);
    assert(Array.isArray(mirror1.tasks) && mirror1.tasks.length === 4,
      '#266 case3: expected 4 tasks, got ' + mirror1.tasks.length);
    assert(mirror1.last_synced_from_ledger === NOW,
      '#266 case3: last_synced_from_ledger mismatch, got ' + mirror1.last_synced_from_ledger);

    // --- Verify ledger→status mappings (all 4) ---
    const byId = Object.fromEntries(mirror1.tasks.map(t => [t.id, t]));
    assert(byId.explore.status === 'completed' && byId.explore.ledger_status === 'complete',
      '#266 case3: explore must be completed/complete, got ' + JSON.stringify(byId.explore));
    assert(byId.impl.status === 'in_progress' && byId.impl.ledger_status === 'in_progress',
      '#266 case3: impl must be in_progress/in_progress, got ' + JSON.stringify(byId.impl));
    assert(byId.gate.status === 'pending' && byId.gate.ledger_status === 'pending',
      '#266 case3: gate must be pending/pending, got ' + JSON.stringify(byId.gate));
    // n/a → completed with ledger_status "n/a"
    assert(byId.done.status === 'completed' && byId.done.ledger_status === 'n/a',
      '#266 case3: done (n/a) must be completed with ledger_status n/a, got ' + JSON.stringify(byId.done));

    // --- Determinism: same --now ⇒ identical output ---
    const r2 = runScript(taskMirrorScript,
      ['--project', projectName, '--now', NOW, '--json'],
      { cwd: root266m });
    assert(r2.status === 0, '#266 case3 det: second run must exit 0');
    assert(r1.stdout === r2.stdout,
      '#266 case3 det: two runs with same --now must produce identical stdout');

    // --- RED discriminator: wrong/missing hash → plan_not_frozen → non-zero exit ---
    const unfrozenPlan = FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${FIXTURE_PLAN_HASH} -->`, '');
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), unfrozenPlan);
    const rUnfrozen = runScript(taskMirrorScript,
      ['--project', projectName, '--now', NOW, '--json'],
      { cwd: root266m });
    assert(rUnfrozen.status !== 0,
      '#266 case3 RED: unfrozen plan must cause non-zero exit, got ' + rUnfrozen.status);

    // --- Stale-hash regeneration: changing plan_hash forces new source_plan_hash in output ---
    const FAKE_HASH = 'a'.repeat(64);
    const staleHashPlan = FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${FIXTURE_PLAN_HASH} -->`,
      `<!-- plan_hash: ${FAKE_HASH} -->`);
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), staleHashPlan);
    const rStale = runScript(taskMirrorScript,
      ['--project', projectName, '--now', NOW, '--json'],
      { cwd: root266m });
    assert(rStale.status === 0, '#266 case3 stale-hash: must exit 0, got ' + rStale.status + '\n' + rStale.stderr);
    const mirrorStale = JSON.parse(rStale.stdout);
    assert(mirrorStale.source_plan_hash === FAKE_HASH,
      '#266 case3 stale-hash: output hash must reflect new plan_hash, got ' + mirrorStale.source_plan_hash);
    assert(mirrorStale.source_plan_hash !== FIXTURE_PLAN_HASH,
      '#266 case3 stale-hash: stale mirror must NOT carry the old hash');

    console.log('testCodexTaskMirror266 (#266 case 3): PASSED');
  } finally {
    fs.rmSync(root266m, { recursive: true, force: true });
  }
}

// Case 4: compact/resume packet
function testCodexCompactResume266() {
  const root266c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-compact-'));
  try {
    const projectName = 'issue-266-compact';
    const projDir = path.join(root266c, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });

    // workflow-state.md
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# State', '',
      '## Project',
      'name: issue-266-compact',
      'status: active', '',
      '## Sink',
      'branch: workflow/issue-266',
      'issue_number: 266',
      'next_command: /kaola-workflow-plan-run',
      'next_skill: kaola-workflow-next',
      ''
    ].join('\n'));

    // workflow-plan.md (with in-progress node + pending gate + consent_halt)
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), FIXTURE_PLAN);

    // workflow-tasks.json
    const tasksJson = JSON.stringify({
      source_plan_hash: FIXTURE_PLAN_HASH,
      tasks: [
        { id: 'explore', role: 'code-explorer', status: 'completed', ledger_status: 'complete' },
        { id: 'impl',    role: 'implementer',   status: 'in_progress', ledger_status: 'in_progress' },
        { id: 'gate',    role: 'code-reviewer', status: 'pending',    ledger_status: 'pending' },
        { id: 'done',    role: 'finalize',       status: 'completed',  ledger_status: 'n/a' }
      ],
      last_synced_from_ledger: '2026-06-07T12:00:00.000Z'
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(projDir, 'workflow-tasks.json'), tasksJson);

    const input = JSON.stringify({ cwd: root266c });

    // --- GREEN: run compact-resume → deterministic 7-line packet ---
    const r1 = runScript(compactResumeScript, [], { input, encoding: 'utf8' });
    assert(r1.status === 0,
      '#266 case4: compact-resume must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const lines1 = r1.stdout.trim().split('\n');
    assert(lines1.length === 7,
      '#266 case4: packet must have 7 lines, got ' + lines1.length + '\n' + r1.stdout);

    // Section 1: header
    assert(lines1[0] === 'Kaola-Workflow compact resume:',
      '#266 case4: line[0] must be header, got ' + lines1[0]);
    // Section 2: active project
    assert(lines1[1].startsWith('active project:'),
      '#266 case4: line[1] must be active project, got ' + lines1[1]);
    assert(lines1[1].includes('issue-266-compact'),
      '#266 case4: active project must include project name, got ' + lines1[1]);
    // Section 3: next skill/command
    assert(lines1[2].startsWith('next skill/command:'),
      '#266 case4: line[2] must be next skill/command, got ' + lines1[2]);
    // Section 4: in-progress node
    assert(lines1[3].startsWith('in-progress node:'),
      '#266 case4: line[3] must be in-progress node, got ' + lines1[3]);
    assert(lines1[3].includes('impl'),
      '#266 case4: in-progress node must include impl, got ' + lines1[3]);
    assert(lines1[3].includes('implementer'),
      '#266 case4: in-progress node must include role, got ' + lines1[3]);
    // Section 5: pending gates (gate node has role code-reviewer which IS a gate-verdict role)
    assert(lines1[4].startsWith('pending gates:'),
      '#266 case4: line[4] must be pending gates, got ' + lines1[4]);
    assert(lines1[4].includes('gate'),
      '#266 case4: pending gates must include gate node, got ' + lines1[4]);
    // Section 6: consent-halt markers
    assert(lines1[5].startsWith('consent-halt markers:'),
      '#266 case4: line[5] must be consent-halt markers, got ' + lines1[5]);
    assert(lines1[5].includes('consent_halt=pending'),
      '#266 case4: consent-halt must show pending, got ' + lines1[5]);
    // Section 7: task-mirror summary
    assert(lines1[6].startsWith('task mirror:'),
      '#266 case4: line[6] must be task mirror, got ' + lines1[6]);
    assert(lines1[6].includes('completed: 2'),
      '#266 case4: task mirror must show completed:2, got ' + lines1[6]);
    assert(lines1[6].includes('in_progress: 1'),
      '#266 case4: task mirror must show in_progress:1, got ' + lines1[6]);
    assert(lines1[6].includes('pending: 1'),
      '#266 case4: task mirror must show pending:1, got ' + lines1[6]);

    // --- #334 case4b: a pending main-session-gate must appear in the pending-gates packet line.
    // Separate root + small fixture (NOT FIXTURE_PLAN, whose hash is asserted elsewhere). RED before
    // the GATE_VERDICT_ROLES edit: the role was not in the set → the line read 'none'.
    { const root334 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-334-compact-'));
      try {
        const pj = 'issue-334-vgate';
        const pd = path.join(root334, 'kaola-workflow', pj);
        fs.mkdirSync(pd, { recursive: true });
        fs.writeFileSync(path.join(pd, 'workflow-state.md'), ['# State', '', '## Project', 'name: ' + pj, 'status: active', '', '## Sink', 'branch: workflow/issue-334', 'issue_number: 334', 'next_command: /kaola-workflow-plan-run', 'next_skill: kaola-workflow-next', ''].join('\n'));
        fs.writeFileSync(path.join(pd, 'workflow-plan.md'), ['# Plan', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| impl | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| done | finalize | vgate | — | 1 | sequence |', '', '## Node Ledger', '', '| id | status |', '|---|---|', '| impl | complete |', '| rv | complete |', '| vgate | pending |', '| done | pending |', ''].join('\n'));
        const r334 = runScript(compactResumeScript, [], { input: JSON.stringify({ cwd: root334 }), encoding: 'utf8' });
        assert(r334.status === 0, '#334 case4b: compact-resume must exit 0, got ' + r334.status + '\n' + r334.stderr);
        const gateLine = r334.stdout.trim().split('\n').find(l => l.startsWith('pending gates:'));
        assert(gateLine && /\bvgate\b/.test(gateLine),
          '#334 case4b: a pending main-session-gate (vgate) must appear in the pending-gates line, got: ' + gateLine);
      } finally { fs.rmSync(root334, { recursive: true, force: true }); }
    }

    // --- Determinism: two runs → identical stdout ---
    const r2 = runScript(compactResumeScript, [], { input, encoding: 'utf8' });
    assert(r1.stdout === r2.stdout,
      '#266 case4 det: two compact-resume runs must produce identical stdout');

    // --- RED discriminator: no workflow-state → no output (empty stdout) ---
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-compact-empty-'));
    try {
      // No kaola-workflow/ dir at all → script returns silently (no output, exit 0)
      const rEmpty = runScript(compactResumeScript, [],
        { input: JSON.stringify({ cwd: emptyRoot }), encoding: 'utf8' });
      assert(rEmpty.status === 0, '#266 case4 RED: empty root must exit 0, got ' + rEmpty.status);
      assert(rEmpty.stdout.trim() === '',
        '#266 case4 RED: no workflow dir must produce no output, got: ' + rEmpty.stdout);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    console.log('testCodexCompactResume266 (#266 case 4): PASSED');
  } finally {
    fs.rmSync(root266c, { recursive: true, force: true });
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-active-folders-'));
  try {
    initGitRepo(tmp);
    // No-evidence offline case must return target_unverified (post-#169 contract).
    const unverified = runClaimRaw(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(unverified.exitStatus === 1,
      'startup with no local evidence must exit 1, got ' + unverified.exitStatus);
    assert(unverified.parsed.verdict === 'target_unverified',
      'no-evidence startup must return target_unverified, got: ' + unverified.parsed.verdict);
    assert(unverified.parsed.claim === 'none',
      'no-evidence startup must report claim=none, got: ' + unverified.parsed.claim);
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-163')),
      'kaola-workflow/issue-163 must NOT be created when target is unverified');

    // Seed local roadmap evidence so the offline classifier can verify the target.
    const roadmapDir = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-163.md'),
      'issue: #163\ntitle: —\nstatus: open\nworkflow_project: issue-163\nnext_step: ready\n'
    );

    const acquired = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(acquired.claim === 'acquired', 'Codex startup should acquire explicit issue');
    assert(acquired.project === 'issue-163', 'Codex startup should derive project from issue');
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-163', 'workflow-state.md');
    const state = fs.readFileSync(stateFile, 'utf8');
    assert(state.includes('issue_number: 163'), 'state should record issue number');
    assert(state.includes('sink: pr'), 'state should record PR sink');
    assert(/^run_posture: (worktree|in-place)$/m.test(state), 'M4 (#277): Codex state must contain run_posture: worktree or in-place');
    assert(!state.includes('## ' + 'Lease'), 'state should not contain a retired ownership block');
    assertNoLegacyCoordDirs(tmp);

    const owned = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex'], tmp);
    assert(owned.claim === 'owned', 'Codex startup should reuse active folder');

    const status = runClaim(['status'], tmp);
    assert(status.count === 1, 'status should report one active folder');

    // M2 (#277): warn-first attestation — finalize must emit closure_receipt with
    // claim_planner_attested and finalize_contractor_attested; both 'missing' in offline test
    // (no dispatch-log), but closure_invariants.ok must still be true (warn-first contract).
    plantRoadmap(tmp, 163, '');
    const finalizeResult = runClaim(['finalize', '--project', 'issue-163'], tmp);
    assert(finalizeResult.status === 'closed', 'M2 (#277): Codex finalize must return status:closed');
    assert(
      finalizeResult.closure_receipt && 'claim_planner_attested' in finalizeResult.closure_receipt,
      'M2 (#277): Codex closure_receipt must have claim_planner_attested field'
    );
    assert(
      finalizeResult.closure_receipt && 'finalize_contractor_attested' in finalizeResult.closure_receipt,
      'M2 (#277): Codex closure_receipt must have finalize_contractor_attested field'
    );
    assert(
      finalizeResult.closure_receipt.claim_planner_attested === 'missing' ||
      finalizeResult.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): Codex claim_planner_attested must be missing or attested'
    );
    assert(
      finalizeResult.closure_receipt.finalize_contractor_attested === 'missing' ||
      finalizeResult.closure_receipt.finalize_contractor_attested === 'attested',
      'M2 (#277): Codex finalize_contractor_attested must be missing or attested'
    );
    assert(
      finalizeResult.closure_invariants && finalizeResult.closure_invariants.ok === true,
      'M2 (#277): Codex closure_invariants.ok must be true (warn-first: attestation miss is not a hard violation)'
    );

    const skill = fs.readFileSync(nextSkill, 'utf8');
    assert(skill.includes('active folders'), 'next skill should route via active folders');
    assert(!skill.includes(['verify', 'startup'].join('-')), 'next skill should not require startup verifier');
    assert(!skill.includes(['can', 'hand' + 'off'].join('-')), 'next skill should not describe old transfer flow');

    const validator = path.join(repoRoot, 'scripts', 'validate-kaola-workflow-contracts.js');
    assert(fs.existsSync(validator), 'Codex contract validator must exist');

    testInstallProfilesFeaturesTableHandling();
    testInstallSchemaPruneManifest332();
    testCodexAdaptiveCuratedAndBarrier();
    testCodexLedgerHeaderInvalid425();
    testCodexGeneratedPortSplit431();
    testCodexPreflight266();
    testCodexDispatchPosture598();
    testCodexMultiAgentV2Bounds611();
    testCodexPreflight571();
    testCodexPreflight332();
    testCodexTaskMirror266();
    testCodexCompactResume266();
    testAC1HooksJson();
    testUpdateHooksHardening325();
    test409StableHomeSurvivesDirDeletion();   // #409
    testAC3AttestationSeeded();
    testAttestationWarningPersistenceCodex();
    testSelectionEvidenceDockingCodex();
    testKeepOpenArchiveStamp333();   // #333
    testAC2CompactPlainStdout();
    testAC4SubagentDispatchLog();
    testCodexFinalizeArchiveVerifiesBeforeDelete();  // #426
    testCodexFinalizeClosesIssueBundleMembers();      // #427
    testCodexBundleFinalizeAllOpenCloseIsPending();   // #508
    testCodexFinalizeRoadmapResidueDetection();       // #428
    testCodexBundleStateIncoherent();                 // #430
    testCodexBundle424432433NodeSeeding();            // #424/#432/#433 n9-walkthrough
    testCodexInstalledPathsPartition543();            // #543 --with-fast/--with-full opt-in partition
    testCodexReplanEditionContract699();

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #426: verifyArchiveComplete returns archive_incomplete:true when copy is missing
// workflow-state.md, and source directory is NOT deleted (copy-then-verify-then-delete).
// Uses the codex-edition claim script exported archiveProjectDir.
// ---------------------------------------------------------------------------
function testCodexFinalizeArchiveVerifiesBeforeDelete() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-archive-verify-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-426cx');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-426cx', '--', wtPath, 'HEAD'], {
      cwd: tmp, encoding: 'utf8'
    });
    // Project dir with NO workflow-state.md — verifyArchiveComplete fails, source must survive.
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426cx');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');

    const claim = require(claimScript);
    const result = claim.archiveProjectDir(wtPath, 'issue-426cx', 'closed', undefined, {});

    assert(
      fs.existsSync(projDir),
      'codex #426 verify-before-delete: source dir must NOT be deleted when archive is incomplete'
    );
    assert(
      result.archive_incomplete === true,
      'codex #426 verify-before-delete: archiveProjectDir must return archive_incomplete:true, got: ' + JSON.stringify(result)
    );
    assert(
      result.snapshot_error === 'state_missing',
      'codex #426 verify-before-delete: malformed source must fail the authority preflight (same contract as the canonical twin), got: ' + JSON.stringify(result)
    );
    console.log('testCodexFinalizeArchiveVerifiesBeforeDelete: PASSED');
  } finally {
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #427: finalize offline on a bundle project emits closure_receipt.closure.skipped_offline
// containing the bundle member issue numbers (42,47). closure.closed is empty offline.
// ---------------------------------------------------------------------------
function testCodexFinalizeClosesIssueBundleMembers() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-427-closure-')));
  const project = 'bundle-42-47';
  try {
    initGitRepo(tmp);
    const stateLines = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Pending Gates', '- none', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42',
      'issue_numbers: 42,47',
      'bundle_id: ' + project,
      'closure_policy: all_or_nothing',
      'sink: merge', 'run_posture: in-place', ''
    ].join('\n');
    const dir = path.join(tmp, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateLines);
    plantRoadmap(tmp, 42, '');
    plantRoadmap(tmp, 47, '');

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });

    assert(result.status === 0,
      'codex #427 offline bundle close: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, 'codex #427 offline bundle close: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert(out.status === 'closed',
      'codex #427 offline bundle close: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    assert(closure != null, 'codex #427 offline bundle close: closure_receipt.closure must be present');
    assert(
      Array.isArray(closure.skipped_offline) && closure.skipped_offline.includes(42) && closure.skipped_offline.includes(47),
      'codex #427 offline bundle close: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert(
      Array.isArray(closure.closed) && closure.closed.length === 0,
      'codex #427 offline bundle close: closure.closed must be empty, got: ' + JSON.stringify(closure.closed)
    );
    console.log('testCodexFinalizeClosesIssueBundleMembers: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #508: bundle finalize on merge-lane (--keep-worktree): when all bundle members probe
// as OPEN online, the close is deferred to sink-merge and remote_issue_closed must be
// 'close_pending' (not 'partial') and closed_issues must be []. Parity test for the
// codex edition (mirrors claude testBundleFinalizeAllOpenCloseIsPending).
// ---------------------------------------------------------------------------
function testCodexBundleFinalizeAllOpenCloseIsPending() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-508-fin-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-508-71-72';
  try {
    initGitRepo(tmp);
    const stateLines = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Pending Gates', '- none', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 71',
      'issue_numbers: 71,72',
      'bundle_id: ' + project,
      'closure_policy: all_or_nothing',
      'sink: merge', 'run_posture: in-place', ''
    ].join('\n');
    const dir = path.join(tmp, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateLines);
    plantRoadmap(tmp, 71, '');
    plantRoadmap(tmp, 72, '');

    // Forge mock: both members probe as OPEN (not closed yet — close deferred to sink-merge).
    fs.mkdirSync(binDir, { recursive: true });
    const ghMockScript = [
      "'use strict';",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write(JSON.stringify({owner:{login:'test'},name:'repo'}) + '\\n'); process.exit(0); }",
      "const m = a.match(/issue view (\\d+)/);",
      "if (m) { process.stdout.write(JSON.stringify({number:parseInt(m[1]),state:'open',title:'issue '+m[1],body:'',labels:[]}) + '\\n'); process.exit(0); }",
      "process.stdout.write('\\n'); process.exit(0);"
    ].join('\n');
    fs.writeFileSync(path.join(binDir, 'g' + 'h.js'), ghMockScript);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'g' + 'h.js'),
      })
    });

    assert(result.status === 0,
      'codex #508 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, 'codex #508 finalize: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert(out.status === 'closed', 'codex #508 finalize: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert(receipt != null, 'codex #508 finalize: closure_receipt must be present');
    assert(receipt.remote_issue_closed === 'close_pending',
      'codex #508 finalize: remote_issue_closed must be close_pending (all members open, deferred to sink-merge), got ' + JSON.stringify(receipt.remote_issue_closed));
    assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
      'codex #508 finalize: closed_issues must be [] (no pre-sink remote close), got ' + JSON.stringify(receipt.closed_issues));
    assert(Array.isArray(receipt.open_issues) && receipt.open_issues.length === 2,
      'codex #508 finalize: open_issues must contain both members (no pre-sink close fired), got ' + JSON.stringify(receipt.open_issues));
    assert(receipt.open_issues.includes(71) && receipt.open_issues.includes(72),
      'codex #508 finalize: open_issues must include both 71 and 72, got ' + JSON.stringify(receipt.open_issues));

    console.log('testCodexBundleFinalizeAllOpenCloseIsPending: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #428: reconcileRoadmapForClosure emits roadmap_removed_by_root on the receipt.
// After a successful in-place finalize the receipt carries the dual-root map field
// and the roadmap source file is removed (no residue on disk).
// ---------------------------------------------------------------------------
function testCodexFinalizeRoadmapResidueDetection() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-428-residue-')));
  try {
    initGitRepo(tmp);
    plantFolder(tmp, 'issue-428cx', 428, null);
    plantRoadmap(tmp, 428, '');

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-428cx'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });

    assert(result.status === 0,
      'codex #428 residue: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, 'codex #428 residue: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert(out.status === 'closed', 'codex #428 residue: status must be closed, got ' + JSON.stringify(out.status));
    const receipt = out.closure_receipt;
    assert(receipt != null, 'codex #428 residue: closure_receipt must be present');
    // The dual-root roadmap removal map must be present on the receipt.
    assert(
      receipt.roadmap_removed !== undefined || receipt.roadmap_removed_by_root !== undefined,
      'codex #428 residue: closure_receipt must carry roadmap_removed or roadmap_removed_by_root field'
    );
    // The source must be removed (no residue on disk).
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')),
      'codex #428 residue: .roadmap/issue-428.md must be removed after finalize'
    );
    console.log('testCodexFinalizeRoadmapResidueDetection: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #430: orient subcommand refuses with bundle_state_incoherent when bundle_id
// is present but issue_numbers is absent or mismatches the bundle_id.
// Uses the codex-edition adaptive-node script (same as root).
// ---------------------------------------------------------------------------
function testCodexBundleStateIncoherent() {
  const codexAdaptiveNode = path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-node.js');
  const codexPlanVal = path.join(pluginRoot, 'scripts', 'kaola-workflow-plan-validator.js');

  // (a) bundle_id present, issue_numbers absent.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-430a-'));
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    try {
      const project = 'bundle-42-47';
      const dir = path.join(tmp, 'kaola-workflow', project);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- workflow-plan', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Sink', 'branch: workflow/' + project,
        'issue_number: 42',
        'bundle_id: ' + project,   // NO issue_numbers line
        'closure_policy: all_or_nothing', 'sink: merge', ''
      ].join('\n'));
      // Freeze a minimal plan for orient.
      const planPath = path.join(dir, 'workflow-plan.md');
      fs.writeFileSync(planPath, [
        '# Workflow Plan — ' + project, '',
        '## Meta', 'labels: chore', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| explore | code-explorer | — | — | 1 | sequence |',
        '| done | finalize | explore | — | 1 | sequence |', ''
      ].join('\n'));
      stampVerifiedLegacyCodexPlan(planPath);
      const fr = spawnSync(process.execPath, [codexPlanVal, planPath, '--freeze'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert(fr.status === 0, 'codex #430 (a): plan freeze must exit 0, stderr: ' + fr.stderr);

      const r = spawnSync(process.execPath, [codexAdaptiveNode, 'orient', '--project', project, '--json'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert(r.status !== 0,
        'codex #430 (a): orient must exit non-zero when bundle_id present but issue_numbers absent, got ' + r.status);
      const o = JSON.parse(r.stdout);
      assert(o.result === 'refuse', 'codex #430 (a): result must be refuse, got ' + JSON.stringify(o.result));
      assert(o.reason === 'bundle_state_incoherent',
        'codex #430 (a): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // (b) bundle_id mismatches issue_numbers.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-430b-'));
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    try {
      const project = 'bundle-42-47';
      const dir = path.join(tmp, 'kaola-workflow', project);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- workflow-plan', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Sink', 'branch: workflow/' + project,
        'issue_number: 42',
        'issue_numbers: 42,53',      // says 42,53 → expected bundle-42-53
        'bundle_id: bundle-42-47',   // MISMATCH
        'closure_policy: all_or_nothing', 'sink: merge', ''
      ].join('\n'));
      const planPath = path.join(dir, 'workflow-plan.md');
      fs.writeFileSync(planPath, [
        '# Workflow Plan — ' + project, '',
        '## Meta', 'labels: chore', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| explore | code-explorer | — | — | 1 | sequence |',
        '| done | finalize | explore | — | 1 | sequence |', ''
      ].join('\n'));
      stampVerifiedLegacyCodexPlan(planPath);
      const fr = spawnSync(process.execPath, [codexPlanVal, planPath, '--freeze'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert(fr.status === 0, 'codex #430 (b): plan freeze must exit 0, stderr: ' + fr.stderr);

      const r = spawnSync(process.execPath, [codexAdaptiveNode, 'orient', '--project', project, '--json'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert(r.status !== 0,
        'codex #430 (b): orient must exit non-zero when bundle_id mismatches issue_numbers, got ' + r.status);
      const o = JSON.parse(r.stdout);
      assert(o.result === 'refuse', 'codex #430 (b): result must be refuse, got ' + JSON.stringify(o.result));
      assert(o.reason === 'bundle_state_incoherent',
        'codex #430 (b): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  console.log('testCodexBundleStateIncoherent: PASSED');
}

// ---------------------------------------------------------------------------
// bundle #424/#432/#433 n4-node-evidence + n9-walkthrough (codex edition):
// evidence seeding (D-433-01 §2) and doc-updater .md-target barrier (D-424-01 allowband).
// Mirrors scripts/ testBundle424432433NodeSeeding with codex edition substitutions.
// ---------------------------------------------------------------------------
function testCodexBundle424432433NodeSeeding() {
  const pvScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-plan-validator.js');
  const nodeScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-node.js');
  const pv = require(pvScript);

  // --- scenario 7: doc-updater .md targets (pure barrierCheck) -------
  {
    const PLAN_DOC = ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| doc | doc-updater | — | docs/guide.md, README.md | 1 | sequence |',
      '| done | finalize | doc | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| doc | in_progress |', '| done | pending |', ''].join('\n');

    // (7a) declared docs/guide.md + README.md are in the allowband → barrier must PASS.
    const r7a = pv.barrierCheck(PLAN_DOC, ['docs/guide.md', 'README.md'], { nodeId: 'doc' });
    assert(r7a.result === 'pass',
      'codex #424 (7a): doc-updater writing declared docs/guide.md + README.md must pass the barrier (allowband), got ' + JSON.stringify(r7a));

    // (7b) undeclared docs/ depth still in allowband → pass.
    const r7b = pv.barrierCheck(PLAN_DOC, ['docs/arch/design.md'], { nodeId: 'doc' });
    assert(r7b.result === 'pass',
      'codex #424 (7b): undeclared docs/arch/design.md (allowband) must pass the barrier, got ' + JSON.stringify(r7b));

    // (7c) behavioral agents/*.md OUTSIDE allowband → write_set_overflow.
    const r7c = pv.barrierCheck(PLAN_DOC, ['agents/workflow-planner.md'], { nodeId: 'doc' });
    assert(r7c.result === 'refuse' && r7c.reason === 'write_set_overflow',
      'codex #424 (7c): agents/*.md outside allowband must refuse write_set_overflow, got ' + JSON.stringify(r7c));
  }

  // --- scenario 6: evidence seeding via open-next CLI (requires a real git repo) ----
  {
    const SEED_PLAN = ['# Workflow Plan — issue #433-seed-cx', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | lib/impl.js | 1 | sequence |',
      '| rv | code-reviewer | n1 | — | 1 | sequence |',
      '| done | finalize | rv | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | pending |', '| rv | pending |', '| done | pending |', ''].join('\n');

    const grepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cx-433seed-'));
    initGitRepo(grepo);
    git(['checkout', '-b', 'workflow/issue-433-seed-cx'], grepo);
    const proj = path.join(grepo, 'kaola-workflow', 'issue-433-seed-cx');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, SEED_PLAN);
    stampVerifiedLegacyCodexPlan(planPath);
    const fz = spawnSync(process.execPath, [pvScript, planPath, '--freeze'],
      { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert(fz.status === 0, 'codex #433 (6): freeze should exit 0, got ' + fz.status + ' ' + fz.stderr);
    git(['add', '-A'], grepo);
    git(['commit', '-m', 'frozen plan'], grepo);
    const cacheDir = path.join(proj, '.cache');

    try {
      // (6a) open-next seeds .cache/n1.md with the evidence-binding header + role stubs.
      const on = spawnSync(process.execPath,
        [nodeScript, 'open-next', '--project', 'issue-433-seed-cx', '--json'],
        { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert(on.status === 0, 'codex #433 (6a): open-next must exit 0, got ' + on.status + '\nstderr: ' + on.stderr + '\nstdout: ' + on.stdout);
      const onOut = JSON.parse(on.stdout);
      assert(onOut.result === 'ok', 'codex #433 (6a): open-next result must be ok, got ' + JSON.stringify(onOut));
      assert(onOut.opened && onOut.opened.id === 'n1', 'codex #433 (6a): opened.id must be n1, got ' + JSON.stringify(onOut.opened));

      // (6b) The seeded evidence file must exist with the expected binding line.
      const evidencePath = path.join(cacheDir, 'n1.md');
      assert(fs.existsSync(evidencePath), 'codex #433 (6b): open-next must create .cache/n1.md');
      const evidenceContent = fs.readFileSync(evidencePath, 'utf8');
      const firstLine = evidenceContent.split('\n')[0];
      assert(/^evidence-binding: n1 [0-9a-f]{12}$/.test(firstLine),
        'codex #433 (6b): first line must be "evidence-binding: n1 <12-hex-nonce>", got ' + JSON.stringify(firstLine));

      // (6c) tdd-guide role stubs present.
      assert(/^RED: /m.test(evidenceContent) || /^<!-- RED/.test(evidenceContent),
        'codex #433 (6c): tdd-guide stub must contain RED token');
      assert(/^GREEN: /m.test(evidenceContent) || /^<!-- GREEN/.test(evidenceContent),
        'codex #433 (6c): tdd-guide stub must contain GREEN token');

      // (6d) JSON response carries evidence_file + required_tokens.
      assert(onOut.opened.evidence_file === '.cache/n1.md',
        'codex #433 (6d): opened.evidence_file must be .cache/n1.md, got ' + JSON.stringify(onOut.opened.evidence_file));
      assert(Array.isArray(onOut.opened.required_tokens) && onOut.opened.required_tokens.includes('RED'),
        'codex #433 (6d): required_tokens must include RED for tdd-guide, got ' + JSON.stringify(onOut.opened.required_tokens));

      // (6e) Crash-resume: a second open-next must not overwrite the evidence file.
      const contentBefore = fs.readFileSync(evidencePath, 'utf8');
      spawnSync(process.execPath,
        [nodeScript, 'open-next', '--project', 'issue-433-seed-cx', '--json'],
        { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      const contentAfter = fs.readFileSync(evidencePath, 'utf8');
      assert(contentBefore === contentAfter,
        'codex #433 (6e): crash-resume open-next must NOT overwrite the seeded evidence file');
    } finally {
      fs.rmSync(grepo, { recursive: true, force: true });
      try { fs.rmSync(grepo + '-remote', { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testCodexBundle424432433NodeSeeding: PASSED');
}

// #543: the Codex installer --with-fast/--with-full opt-in partition. Adaptive is the unconditional
// default; fast/full are install-time opt-ins recorded via UNION into ~/.config/kaola-workflow/config.json
// installed_paths (the field the runtime legality gate reads via adaptive-schema resolveInstalledPaths).
// Each sub-case uses a FRESH mkdtempSync HOME (NOT the shared module-top kwSandboxHome, which is seeded
// once and would leak installed_paths across sub-cases). Mirrors install.sh D4 + install-opencode.sh
// seed_kaola_config byte-semantically (node-native port).
function testCodexInstalledPathsPartition543() {
  const cfgPath = home => path.join(home, '.config', 'kaola-workflow', 'config.json');
  const readCfg = home => JSON.parse(fs.readFileSync(cfgPath(home), 'utf8'));
  // This file's assert(cond, msg) is hand-rolled (no node assert module), so compare arrays via
  // JSON.stringify and include the actual value in the failure message.
  const eqArr = (actual, expected, msg) =>
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      msg + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')');
  const freshHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kw-543-home-'));
  const freshTarget = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kw-543-target-'));
  const homeEnv = home => ({ HOME: home, USERPROFILE: home });
  const rm = (...dirs) => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); };

  // (a) default install → installed_paths:[] (adaptive-only; fast/full unreachable until opted in).
  {
    const home = freshHome(), target = freshTarget();
    try {
      const r = runInstallProfiles(target, homeEnv(home));
      assert(r.status === 0, '#543(a): default install must exit 0');
      const cfg = readCfg(home);
      eqArr(cfg.installed_paths, [], '#543(a): default install installed_paths must be []');
      assert(cfg.parallel_mode === 'auto', '#543(a): parallel_mode setdefault auto');
    } finally { rm(home, target); }
  }

  // (b) --with-fast → installed_paths:["fast"].
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home), ['--with-fast']);
      eqArr(readCfg(home).installed_paths, ['fast'], '#543(b): --with-fast → ["fast"]');
    } finally { rm(home, target); }
  }

  // (c) --with-full → installed_paths:["full"].
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home), ['--with-full']);
      eqArr(readCfg(home).installed_paths, ['full'], '#543(c): --with-full → ["full"]');
    } finally { rm(home, target); }
  }

  // (d) both flags → installed_paths:["fast","full"] in canonical order.
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home), ['--with-full', '--with-fast']);
      eqArr(readCfg(home).installed_paths, ['fast', 'full'],
        '#543(d): both flags → ["fast","full"] canonical order (regardless of arg order)');
    } finally { rm(home, target); }
  }

  // (e) UNION never removes: --with-fast then a bare re-install (no flags) PRESERVES fast.
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home), ['--with-fast']);
      eqArr(readCfg(home).installed_paths, ['fast'], '#543(e) seed: ["fast"]');
      runInstallProfiles(target, homeEnv(home));  // bare re-install
      eqArr(readCfg(home).installed_paths, ['fast'],
        '#543(e): UNION never removes — bare re-install must preserve prior ["fast"]');
    } finally { rm(home, target); }
  }

  // (f) reinstall-after-uninstall resets to [] (simulate uninstall by deleting the config dir, then
  // a bare reinstall → adaptive-only []). Proves reset = uninstall→reinstall (#538).
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home), ['--with-fast']);
      eqArr(readCfg(home).installed_paths, ['fast'], '#543(f) seed: ["fast"]');
      // uninstall removes the shared config (mirrors uninstall.sh).
      fs.rmSync(path.dirname(cfgPath(home)), { recursive: true, force: true });
      runInstallProfiles(target, homeEnv(home));  // bare reinstall after uninstall
      eqArr(readCfg(home).installed_paths, [],
        '#543(f): reinstall-after-uninstall must reset installed_paths to []');
    } finally { rm(home, target); }
  }

  // (g) enable_adaptive migration: a pre-seeded {enable_adaptive:true} is migrated away + installed_paths [].
  {
    const home = freshHome(), target = freshTarget();
    try {
      fs.mkdirSync(path.dirname(cfgPath(home)), { recursive: true });
      fs.writeFileSync(cfgPath(home), JSON.stringify({ enable_adaptive: true, parallel_mode: 'auto' }) + '\n');
      runInstallProfiles(target, homeEnv(home));
      const cfg = readCfg(home);
      assert(cfg.enable_adaptive === undefined, '#543(g): enable_adaptive must be migrated away (absent)');
      eqArr(cfg.installed_paths, [], '#543(g): installed_paths must be []');
    } finally { rm(home, target); }
  }

  // (h) corrupt JSON → WARN-first: exit 0, file left UNTOUCHED (byte-identical).
  {
    const home = freshHome(), target = freshTarget();
    try {
      const corrupt = 'not valid json {{{\n';
      fs.mkdirSync(path.dirname(cfgPath(home)), { recursive: true });
      fs.writeFileSync(cfgPath(home), corrupt);
      const r = runInstallProfiles(target, homeEnv(home));
      assert(r.status === 0, '#543(h): corrupt config must NOT abort the install (WARN-first, exit 0)');
      assert(fs.readFileSync(cfgPath(home), 'utf8') === corrupt,
        '#543(h): corrupt config file must be left byte-untouched');
    } finally { rm(home, target); }
  }

  // (i) non-object "[]" → WARN-first: exit 0, file left UNTOUCHED.
  {
    const home = freshHome(), target = freshTarget();
    try {
      const nonObj = '[]\n';
      fs.mkdirSync(path.dirname(cfgPath(home)), { recursive: true });
      fs.writeFileSync(cfgPath(home), nonObj);
      const r = runInstallProfiles(target, homeEnv(home));
      assert(r.status === 0, '#543(i): non-object config must NOT abort the install (WARN-first, exit 0)');
      assert(fs.readFileSync(cfgPath(home), 'utf8') === nonObj,
        '#543(i): non-object config file must be left byte-untouched');
    } finally { rm(home, target); }
  }

  // (j) parallel_mode setdefault: {} → "auto"; {"parallel_mode":"off"} → stays "off" (never overwrite).
  {
    const home = freshHome(), target = freshTarget();
    try {
      runInstallProfiles(target, homeEnv(home));
      assert(readCfg(home).parallel_mode === 'auto', '#543(j): empty config → parallel_mode setdefault "auto"');
    } finally { rm(home, target); }
  }
  {
    const home = freshHome(), target = freshTarget();
    try {
      fs.mkdirSync(path.dirname(cfgPath(home)), { recursive: true });
      fs.writeFileSync(cfgPath(home), JSON.stringify({ parallel_mode: 'off' }) + '\n');
      runInstallProfiles(target, homeEnv(home));
      assert(readCfg(home).parallel_mode === 'off',
        '#543(j): setdefault must NOT overwrite a user parallel_mode value (stays "off")');
    } finally { rm(home, target); }
  }

  // Export-surface lock: seedKaolaConfig is exported + returns a discriminating status (unit-level).
  {
    const mod = require(installProfilesScript);
    assert(typeof mod.seedKaolaConfig === 'function', '#543: seedKaolaConfig must be exported for unit tests');
    const home = freshHome();
    try {
      const res = mod.seedKaolaConfig(home, true, false);
      assert(res.status === 'updated' && JSON.stringify(res.installed_paths) === JSON.stringify(['fast']),
        '#543: seedKaolaConfig fast → {status:"updated", installed_paths:["fast"]}, got ' + JSON.stringify(res));
      eqArr(readCfg(home).installed_paths, ['fast'], '#543: seedKaolaConfig wrote the file');
    } finally { rm(home); }
  }

  console.log('testCodexInstalledPathsPartition543 (#543): PASSED');
}

function testCodexReplanEditionContract699() {
  const scriptsDir = path.join(pluginRoot, 'scripts');
  const replanScript = path.join(scriptsDir, 'kaola-workflow-replan.js');
  const adaptiveNodeScript = path.join(scriptsDir, 'kaola-workflow-adaptive-node.js');
  const handoffScript = path.join(scriptsDir, 'kaola-workflow-adaptive-handoff.js');
  const validatorScript = path.join(scriptsDir, 'kaola-workflow-plan-validator.js');
  const schema = require(path.join(scriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const replan = require(replanScript);
  const adaptiveNode = require(adaptiveNodeScript);
  const handoff = require(handoffScript);
  const claim = require(claimScript);
  const manifest = require(path.join(scriptsDir, 'kaola-workflow-install-manifest.js'));

  assert(JSON.stringify(manifest.supportScripts('github').filter(name => /workflow-replan\.js$/.test(name)))
      === JSON.stringify(['kaola-workflow-replan.js']),
  'Codex re-plan smoke: manifest must install exactly the canonical aggregator');
  assert(JSON.stringify(schema.REPLAN_PHASES) === JSON.stringify([
    'prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed',
  ]) && JSON.stringify(schema.REPLAN_STATUSES) === JSON.stringify([
    'none', 'in_progress', 'candidate_changed', 'consent_halt',
  ]) && JSON.stringify(schema.REPLAN_CAS_SEAMS) === JSON.stringify([
    'prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation',
  ]), 'Codex re-plan smoke: schema vocabulary must be canonical');

  const missingCli = spawnSync(process.execPath,
    [replanScript, 'status', '--project', 'n5-missing-codex-smoke', '--json'],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  const missingResult = JSON.parse(String(missingCli.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
  assert(missingCli.status !== 0 && missingResult.reason === 'replan_authority_path_invalid',
    'Codex re-plan smoke: packaged aggregator must execute its typed missing-authority refusal');

  const packet = replan.buildPlannerPacket({ project: 'issue-n5-codex' }, {
    transaction_id: '8'.repeat(64), transition_reason: 'review_repair_requires_replan',
    parent: {
      claim_identity: { repository_id: 'repo', worktree_path: repoRoot },
      claim_identity_digest: '1'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      plan_epoch: 1, plan_hash: '3'.repeat(64),
    },
    epoch_lineage_id: '4'.repeat(64),
    source: {
      source_attempt_ids: ['review:1'], source_reason: 'review_repair_requires_replan',
      source_evidence_digest: '5'.repeat(64), producer_slice: [], findings: [], rebind: [],
      inherited_frontier_classes: ['code'], validation_obligations: [],
    },
    cas: { prepare: { candidate_digest: '6'.repeat(64), inherited_frontier_digest: '7'.repeat(64) } },
    budget: {
      count_before: 0, ceiling: 2, transition_cost: 1, case_b_exemption: false,
      case_b_proof: null, consent_ledger_digest: '9'.repeat(64),
    },
    planner: { profile_identity: 'workflow-planner-replan-v1', dispatch_nonce: 'dispatch-n5' },
  });
  const packetKeys = new Set();
  (function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(collect);
    for (const [key, child] of Object.entries(value)) { packetKeys.add(key); collect(child); }
  })(packet);
  for (const forbiddenKey of ['nodes', 'node_ids', 'roles', 'depends_on', 'declared_write_set',
    'write_set', 'cardinality', 'shape', 'model', 'build_order']) {
    assert(!packetKeys.has(forbiddenKey),
      'Codex re-plan smoke: planner packet must omit main-authored DAG key ' + forbiddenKey);
  }
  assert(packet.child_output_path === 'workflow-plan.next.md',
    'Codex re-plan smoke: planner packet must bind the exact child path');

  const childPath = path.join(os.tmpdir(), 'kw-n5-codex-attestation', 'workflow-plan.next.md');
  let unattestedWrites = 0;
  const unattested = handoff.runReplanHandoff({
    childPath, childContent: 'planner draft\n', transactionId: 'a'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: 'a'.repeat(64), child_path: childPath,
      child_digest: schema.sha256Hex(Buffer.from('planner draft\n')), dispatch_nonce: 'dispatch-n5',
    },
    expected: { child_path: childPath, planner_binding: 'dispatch-n5' },
    writeFile: () => { unattestedWrites++; },
  });
  assert(unattested.reason === 'replan_child_authority_unverified' && unattestedWrites === 0,
    'Codex re-plan smoke: missing planner attestation must refuse before writing');

  const orientation = adaptiveNode.replanOrientation({
    reason: 'replan_in_progress', phase: 'planner_pending', transaction_id: 'a'.repeat(64),
    legal_mutation: 'replan resume', transaction: {
      transaction_id: 'a'.repeat(64), phase: 'planner_pending',
      parent: { plan_hash: 'b'.repeat(64) }, child: {}, cas: {},
    },
  }, 'issue-n5-codex');
  assert(orientation.resume_command ===
    'node scripts/kaola-workflow-replan.js resume --project issue-n5-codex --json',
  'Codex re-plan smoke: orientation must expose only the canonical resume command');

  const fenceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-n5-codex-fence-')));
  try {
    spawnSync('git', ['init', '-q'], { cwd: fenceRoot, encoding: 'utf8' });
    const project = 'issue-n5-codex-fence';
    const projectDir = path.join(fenceRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const stateBytes = Buffer.from([
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Epoch Lineage', 'replan_status: in_progress', 'replan_phase: planner_pending',
      'replan_transaction_id: ' + 'c'.repeat(64), '',
    ].join('\n'));
    const planBytes = Buffer.from('# deliberately invalid frozen parent\n');
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), stateBytes);
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), planBytes);
    fs.writeFileSync(path.join(cacheDir, 'replan-transaction.json'), '{}\n');
    const beforeCache = new Map(fs.readdirSync(cacheDir).map(name =>
      [name, fs.readFileSync(path.join(cacheDir, name))]));
    const calls = [
      [adaptiveNodeScript, ['open-next', '--project', project, '--json']],
      [handoffScript, ['--project', project, '--json']],
      [validatorScript, [path.join(projectDir, 'workflow-plan.md'), '--finalize-check', '--json']],
      [claimScript, ['finalize', '--project', project, '--json']],
    ];
    for (const [script, args] of calls) {
      const run = spawnSync(process.execPath, [script, ...args], {
        cwd: fenceRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      });
      const out = JSON.parse(String(run.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());
      assert(run.status !== 0 && out.reason === 'replan_transaction_invalid',
        'Codex re-plan smoke: half-transition must fence ' + path.basename(script) + ', got ' + JSON.stringify(out));
    }
    assert(fs.readFileSync(path.join(projectDir, 'workflow-state.md')).equals(stateBytes)
        && fs.readFileSync(path.join(projectDir, 'workflow-plan.md')).equals(planBytes),
    'Codex re-plan smoke: scheduler/finalize refusals must preserve parent state and plan bytes');
    assert(JSON.stringify(fs.readdirSync(cacheDir).sort()) === JSON.stringify([...beforeCache.keys()].sort()),
      'Codex re-plan smoke: half-transition refusals must not add cache side effects');
    for (const [name, bytes] of beforeCache) {
      assert(fs.readFileSync(path.join(cacheDir, name)).equals(bytes),
        'Codex re-plan smoke: half-transition refusal mutated cache file ' + name);
    }
    assert(!fs.existsSync(path.join(cacheDir, 'scheduler.lock'))
        && !fs.existsSync(path.join(cacheDir, 'orient-envelope.json'))
        && !fs.existsSync(path.join(fenceRoot, 'kaola-workflow', 'archive')),
    'Codex re-plan smoke: scheduler/finalize fence must create no lock, envelope, or archive');
  } finally { fs.rmSync(fenceRoot, { recursive: true, force: true }); }

  const archiveRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-n5-codex-archive-')));
  try {
    const project = 'issue-n5-codex-archive';
    const projectDir = path.join(archiveRoot, 'kaola-workflow', project);
    const epochDir = path.join(projectDir, '.cache', 'epochs', '1');
    const filesDir = path.join(epochDir, 'files', '.cache');
    fs.mkdirSync(filesDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Sink', 'issue_number: 699', 'sink: merge', '',
    ].join('\n'));
    const rebindBytes = Buffer.from('{"attempts":[{"attempt_id":"review:1","rebind":[]}]}\n');
    const rebindPath = path.join(filesDir, 'review-attempts.json');
    fs.writeFileSync(rebindPath, rebindBytes);
    const stat = fs.statSync(rebindPath);
    const snapshot = {
      schema_version: 1, parent_plan_epoch: 1, epoch_lineage_id: 'd'.repeat(64),
      transaction_id: 'e'.repeat(64), claim_root_base_digest: 'f'.repeat(64),
      files: [{ path: '.cache/review-attempts.json', size: stat.size,
        mode: (stat.mode & 0o777).toString(8).padStart(3, '0'), digest: schema.sha256Hex(rebindBytes) }],
    };
    snapshot.manifest_self_digest = schema.snapshotManifestDigest(snapshot);
    fs.writeFileSync(path.join(epochDir, 'manifest.json'), schema.canonicalJson(snapshot) + '\n');
    assert(replan.verifyAllEpochSnapshots(projectDir).ok,
      'Codex re-plan smoke: live epoch snapshot must digest-verify before archive');
    const archived = claim.archiveProjectDir(archiveRoot, project, 'closed');
    assert(archived.archived === true && fs.readFileSync(path.join(archived.dest, '.cache', 'epochs', '1',
      'files', '.cache', 'review-attempts.json')).equals(rebindBytes),
    'Codex re-plan smoke: final archive must retain exact nested rebind-ledger bytes');
    assert(replan.verifyAllEpochSnapshots(archived.dest).ok,
      'Codex re-plan smoke: archived epoch snapshot must remain digest-verifiable');
  } finally { fs.rmSync(archiveRoot, { recursive: true, force: true }); }

  console.log('testCodexReplanEditionContract699: PASSED');
}

main();
