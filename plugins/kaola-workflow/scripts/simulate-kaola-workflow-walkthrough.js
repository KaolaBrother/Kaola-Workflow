#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('simulate-kaola-workflow-walkthrough'); } catch (_) { /* advisory only */ }

const fs = require('fs');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// The module-top KAOLA_ENABLE_ADAPTIVE pin is removed.

// #531 / #538: hermetic HOME — the classifier (cmdClassify) reads parallel_mode from
// ~/.config/kaola-workflow/config.json and bypasses to verdict:'green' when not 'auto'.
// Adaptive is the only workflow path (the fast/full opt-ins were retired); a stale installed_paths
// field is tolerated on read but never written. Pin a process-wide sandbox HOME seeded with
// parallel_mode:'auto' so a dev-local config can't affect these tests. os.homedir() honors HOME.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto', installed_paths: [] }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

// #775: no sandbox running this suite has a `codex` binary on PATH, so every
// kaola-workflow-codex-preflight.js invocation needs a version-floor attestation or it would
// refuse codex_version_unsupported before any other check runs. Pinned globally (like HOME above)
// so every spawnSync call in this file that merges ...process.env inherits it automatically.
process.env.KAOLA_CODEX_VERSION = '0.145.0';

// #775: seed [agents] enabled=true into the shared sandbox HOME too — owner decision D2 means
// preflight would otherwise refuse codex_multi_agent_v2_required (exit 7) before reaching any of
// the profile-freshness checks the tests below that reuse kwSandboxHome are actually about.
fs.mkdirSync(path.join(kwSandboxHome, '.codex'), { recursive: true });
fs.writeFileSync(path.join(kwSandboxHome, '.codex', 'config.toml'), '[features.multi_agent_v2]\nenabled = true\n\n');

const pluginRoot = path.resolve(__dirname, '..');
// The role roster the plugin SHIPS, derived rather than typed. The installer's contract is
// "place exactly this roster, no more and no less" — and because the source (plugins/*/agents/)
// and the install target (.codex/agents/kaola-workflow/) are DIFFERENT locations, comparing the
// two is a real assertion, not a tautology. A hand-typed integer here went stale the moment the
// mandatory planner left the roster, and would go stale again on the next role change.
const ROSTER_TOMLS = fs.readdirSync(path.join(pluginRoot, 'agents'))
  .filter(f => f.endsWith('.toml')).sort();
const repoRoot = path.resolve(pluginRoot, '..', '..');
const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
const installProfilesScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const nextSkill = path.join(pluginRoot, 'skills', 'kaola-workflow-next', 'SKILL.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A run folder that is FINALIZE-READY and carries no plan. Everything this used to seed — a
// frozen `## Nodes` table, a `## Node Ledger`, a compliance table, a plan_hash bound into the
// state, a derived task mirror — existed for two doors that are gone: the
// `adaptive_plan_missing` refusal and the declared-write-set attribution sweep. What finalize
// still measures is the validation record, and it must be BOUND to the tree, so the hash comes
// from the same kernel function the door recomputes with.
//
// `writeSet` is retained and deliberately unused: it names the production paths each fixture
// commits, which is still the clearest local documentation of what the branch carries.
function seedAdaptiveFinalizeFixture(root, project, writeSet) {   // eslint-disable-line no-unused-vars
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  const schema = require(path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
  let cand = '';
  try { cand = schema.computeCodeTreeHash(root, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

function trustCodexProject(homeRoot, projectRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const prefix = existing.length === 0 ? '' : existing.replace(/\s*$/, '\n\n');
  fs.writeFileSync(configPath,
    prefix + '[projects.' + JSON.stringify(path.resolve(projectRoot)) + ']\ntrust_level = "trusted"\n');
}

// #775: fixtures below expect preflight to pass at exit 0 for a "fresh, fully working" install —
// that now additionally requires the top-level [agents] table's enabled=true (owner decision D2:
// Kaola never writes this itself). PREPENDED, never appended: TOML forbids re-declaring a bare
// [agents] header once an [agents.<role>] sub-table has already opened it, and the managed block
// (when present, e.g. a project config after install-codex-agent-profiles.js) opens exactly that.
function enableMultiAgentV2(homeRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  fs.writeFileSync(configPath, '[features.multi_agent_v2]\nenabled = true\n\n' + existing);
}

function runClaim(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  assert(result.status === 0,
    'claim command failed: exit ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
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

// #775: the installer no longer writes any [features]/multi_agent flag at all — owner decision D2
// keeps `[agents].enabled` a user hand-edit reported (never written) by preflight. This test now
// verifies only that the installer leaves an existing UNRELATED [features] table untouched while
// still installing the managed [agents.*] block (managedBlock() is the raw bundled template with
// no [features] prefix at all).
function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-'));
  try {
    runInstallProfiles(fresh);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert(!freshConfig.includes('[features]'), '#775: fresh install must NOT write any [features] table');
    assert(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');
    assert(freshConfig.includes('[agents.code-explorer]'), 'fresh install should include managed [agents.*] entries');

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
    // #372: the PostToolUse phantom-advisor hook is retired. #725: the PreToolUse
    // pre-commit-guard and write-lane hooks are also retired — exactly 2 lifecycle events remain.
    const EVENTS = ['SessionStart', 'SubagentStart'];
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
    assert(!(parsed.hooks || {}).PreToolUse,
      '#725: hooks.json must NOT carry a PreToolUse event (pre-commit-guard/write-lane retired)');

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
    // exactly once (an event MAY carry >1 distinct managed id, so the check is per-id, not
    // per-event count).
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
    seedAdaptiveFinalizeFixture(root, 'issue-284');

    // Seed the dispatch-log BEFORE finalize.  finalize archives the folder (moves it), then
    // checkDispatchAttestations checks archive-first — so seeding the live cache is correct.
    const cacheDir = path.join(root, 'kaola-workflow', 'issue-284', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const ts = '2026-06-09T00:00:00Z';
    fs.writeFileSync(path.join(cacheDir, 'dispatch-log.jsonl'),
      JSON.stringify({ ts, agent_type: 'workflow-planner', agent_id: 'test-planner', cwd: root }) + '\n'
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
    assert(finalizeResult.closure_receipt && !('finalize_contractor_attested' in finalizeResult.closure_receipt),
      '#816: the finalize seam emits no attestation field, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && Object.keys(finalizeResult.closure_receipt)));

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
// stdout JSON. Seed a role-only dispatch-log (no workflow-planner entry).
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
    seedAdaptiveFinalizeFixture(root, 'issue-653102');

    // Seed dispatch-log with ONLY a role entry (no workflow-planner).
    const cacheDir = path.join(root, 'kaola-workflow', 'issue-653102', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'dispatch-log.jsonl'),
      JSON.stringify({ ts: '2026-06-09T00:00:00Z', agent_type: 'tdd-guide', agent_id: 'test-role', cwd: root }) + '\n');

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
    seedAdaptiveFinalizeFixture(root, 'issue-653203');

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
    seedAdaptiveFinalizeFixture(root, 'issue-653204');

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
    initGitRepo(root);
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
    seedAdaptiveFinalizeFixture(root, 'issue-333');
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

// AC2 (#284): compact-resume stdout is PLAIN TEXT, not a JSON envelope — and the packet it emits
// is derived from the RUN RECORD.
//
// Two properties, one scenario, and only one of them moved. The #284 subject — plain text rather
// than a `{ "hookSpecificOutput": ... }` envelope — is a runtime-shape property with no connection
// to the record format, and survives the re-point untouched. The packet-CONTENT needles did move:
// they used to read `in-progress node:` / `pending gates:` / `consent-halt markers:` / `task mirror:`
// off a frozen plan, a `## Node Ledger` and a derived workflow-tasks.json. Those are gone; the
// packet now comes from mission-list.md, and the assertions below are derived from the format in
// docs/mission-list.md rather than from the script.
//
// The load-bearing one is the in-flight line WITH its dispatched locator. ADR 0017 sizes this whole
// file to one observed failure — an orchestrator losing what was in flight — so a resume packet that
// names an in-flight item but not where its work was to land would restate the problem the record
// exists to solve.
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
      ''
    ].join('\n'));

    // One item per status, so the packet cannot pass by reporting a single hard-coded shape.
    fs.writeFileSync(path.join(projDir, 'mission-list.md'), [
      '# Retire the node executor',
      '',
      '- item: strip the node lifecycle from the walkthrough',
      '  status: done',
      '  dispatched: tdd-guide',
      '  result: 216 scenarios remain',
      '',
      '- item: re-point compact-resume at the mission list',
      '  status: in-flight',
      '  dispatched: demolish-scripts, output to plugins/*/scripts/*compact-resume.js',
      '',
      '- item: author behavioural coverage for the new packet',
      '  status: todo',
      ''
    ].join('\n'));

    const input = JSON.stringify({ cwd: root });
    const r = runScript(compactResumeScript, [], { input, encoding: 'utf8' });
    assert(r.status === 0, 'AC2: compact-resume must exit 0, got ' + r.status + '\n' + r.stderr);

    // --- The #284 subject, unchanged: plain text, never a Codex JSON envelope. ---
    assert(!r.stdout.startsWith('{'),
      'AC2: compact-resume stdout must NOT be a JSON object (plain text expected), got: ' + r.stdout.slice(0, 80));
    assert(!r.stdout.includes('"hookSpecificOutput"'),
      'AC2: compact-resume stdout must NOT contain hookSpecificOutput envelope, got: ' + r.stdout.slice(0, 200));

    // --- Non-vacuity: a well-formed run must not produce an empty packet. This is the failure
    // --- mode a wiring test is structurally blind to, so it is asserted before any content needle.
    assert(r.stdout.trim().length > 0,
      'AC2: a run with a readable mission list must emit a NON-EMPTY packet — silently emitting '
      + 'nothing is the one failure the hook cannot report on its own');

    assert(r.stdout.includes('Kaola-Workflow compact resume:'),
      'AC2: packet must include the header line');
    assert(r.stdout.includes('active project: ' + projectName),
      'AC2: packet must name the active project, got: ' + r.stdout);

    // --- The record-derived half, per docs/mission-list.md. ---
    assert(r.stdout.includes('Retire the node executor'),
      'AC2: the H1 is the goal and must reach the packet, got: ' + r.stdout);
    assert(/in-flight:.*re-point compact-resume at the mission list/.test(r.stdout),
      'AC2: the in-flight item is the decision a successor has to make and must be named, got: ' + r.stdout);
    assert(/dispatched:.*demolish-scripts/.test(r.stdout),
      'AC2: the in-flight item must carry its DISPATCHED locator — without it the packet restates '
      + 'the loss the record exists to prevent, got: ' + r.stdout);
    assert(/done: 1/.test(r.stdout) && /in-flight: 1/.test(r.stdout) && /todo: 1/.test(r.stdout),
      'AC2: the packet must report the frontier counts (done/in-flight/todo), got: ' + r.stdout);

    // --- Discrimination: the CLOSED item's prose must not be presented as the open decision.
    // --- Without this, a packet that dumped the whole file verbatim would satisfy every needle above.
    const inFlightLine = r.stdout.split('\n').find(l => l.startsWith('in-flight:')) || '';
    assert(!inFlightLine.includes('strip the node lifecycle'),
      'AC2: the in-flight line must carry the IN-FLIGHT item, not a done one — a verbatim dump of '
      + 'the file would otherwise pass every assertion above; got: ' + inFlightLine);

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
    assert(commandCount >= 2, '#409: expected the two managed hook commands, saw ' + commandCount);

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
function injectSpineForm(content) {
  if (/^[ \t]*plan_form[ \t]*:/m.test(content)) return content;
  // Fence-aware: inject after the FIRST genuine (non-fenced) `## Meta` header, skipping any decoy
  // `## Meta` inside a ``` / ~~~ code fence. Return unchanged when there is no genuine Meta header.
  const lines = content.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([`~]{3,})/);
    if (m) {
      if (fence === null) fence = m[1][0].repeat(m[1].length);
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence === null && /^## Meta[ \t]*$/.test(line)) {
      lines.splice(i + 1, 0, 'plan_form: spine');
      return lines.join('\n');
    }
  }
  // No genuine `## Meta` header: synthesize a minimal Meta block before the first `## Nodes`.
  fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([`~]{3,})/);
    if (m) {
      if (fence === null) fence = m[1][0].repeat(m[1].length);
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence === null && /^## Nodes[ \t]*$/.test(line)) {
      lines.splice(i, 0, '## Meta', 'plan_form: spine', '');
      return lines.join('\n');
    }
  }
  return content;
}
// #790: a frozen plan requires a non-empty `## Design` section at the freeze wall. Inject a minimal
// prose block when absent — BEFORE `## Node Ledger` (so the hash-neutral ledger tail is preserved for
// fixtures that append a row / halt marker to it), fence-aware. No-op when a `## Design` heading exists.
function injectDesignSection(content) {
  if (/^##[ \t]+Design[ \t]*$/m.test(content)) return content;
  const block = '## Design\n\nDecompose the frozen spine into its concrete role nodes; every sequence '
    + 'edge is a real data dependency (S1 — the downstream node consumes the upstream node\'s change) '
    + 'or a gate ordering, and any co-opened write legs touch disjoint paths. Done means the review gate '
    + 'clears and validation_command passes.\n';
  const lines = content.split('\n');
  let fence = null, ledgerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([`~]{3,})/);
    if (m) { if (fence === null) fence = m[1][0].repeat(m[1].length); else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null; continue; }
    if (fence === null && /^##[ \t]+Node Ledger[ \t]*$/.test(lines[i])) { ledgerIdx = i; break; }
  }
  if (ledgerIdx >= 0) { lines.splice(ledgerIdx, 0, block, ''); return lines.join('\n'); }
  return content.replace(/\n*$/, '\n') + '\n' + block;
}
function stampVerifiedLegacyCodexPlan(planPath) {
  const raw = fs.readFileSync(planPath, 'utf8');
  if (/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(raw)
      || /^plan_schema_version:\s*2\s*$/m.test(raw)) return;
  const content = injectDesignSection(injectSpineForm(raw)); // #765 spine + #790 design at the freeze wall
  const validator = require(codexValidator);
  const hash = validator.computePlanHash(content);
  fs.writeFileSync(planPath, '<!-- plan_hash: ' + hash + ' -->\n\n' + content);
}
function runVal(args, cwd) {
  // #765: a fresh (not yet hash-stamped) fixture that hits the freeze-wall grammar is migrated to a
  // concrete spine (plan_form: spine). resume-check validates the dag-tolerant path, and a pre-stamped
  // fixture keeps its authoritative hash — both are left untouched.
  if (args[0] && !args[0].startsWith('--') && fs.existsSync(args[0]) && !args.includes('--resume-check')) {
    const raw = fs.readFileSync(args[0], 'utf8');
    if (!/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(raw)) {
      const migrated = injectDesignSection(injectSpineForm(raw)); // #765 spine + #790 design
      if (migrated !== raw) fs.writeFileSync(args[0], migrated);
    }
  }
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




// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the 3 new scripts.
// Each case proves discriminating RED (wrong fixture → typed refusal / wrong JSON)
// then GREEN (correct fixture → ok / correct JSON).
// ---------------------------------------------------------------------------

const preflightScript   = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
const taskMirrorScript  = path.join(pluginRoot, 'scripts', 'kaola-workflow-task-mirror.js');
const compactResumeScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-compact-resume.js');


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
    trustCodexProject(emptyHome266, root266);
    enableMultiAgentV2(emptyHome266);
    // Install all 15 profiles into the fixture (13 base + synthesizer #463 + metric-optimizer #634; issue-scout retired #789, investigator added #798)
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
        // #775: config/agents.toml's managed block no longer opens with [features] — managedBlock()
        // is the raw bundled template, so there is nothing to strip here. `configWithAgentsEnabled`
        // PREPENDS a user-owned [agents] table (TOML forbids re-declaring [agents] once the managed
        // block's [agents.<role>] sub-tables have already opened it).
        function configWithAgentsEnabled(extraLines) {
          return '[features.multi_agent_v2]\nenabled = true\n' + (extraLines ? extraLines + '\n' : '') + '\n' + origConfig;
        }
        // #775: dispatch mode is binary now — the whole 0.142/0.144 transport-mode grammar
        // (tool_namespace / hide_spawn_agent_metadata / non_code_mode_only, the dotted/quoted/
        // array-of-table [features.multi_agent_v2] parsing edge cases, the codex_v2_*_transport_unsafe
        // refusals) is retired along with the [features.multi_agent_v2] table shape; the ONLY
        // question left is whether the top-level [agents] table's `enabled` is true (v2-task-name,
        // exit 0) or not (codex_multi_agent_v2_required, exit 7 — there is no v1 fallback).
        function assertDispatchModeForConfig(body, expectedEnabled, label, checkDoctor) {
          fs.writeFileSync(configPath, body);
          const result = runScript(preflightScript,
            ['--project-root', root266, '--no-autofix', '--json'], h266);
          if (!expectedEnabled) {
            assert(result.status === 7,
              label + ': v2-disabled config must refuse with exit 7, got ' + result.status + '\n' + result.stdout);
            const json = JSON.parse(result.stdout);
            assert(json.status === 'codex_multi_agent_v2_required',
              label + ': expected codex_multi_agent_v2_required, got ' + json.status);
            assert(json.multi_agent_v2_enabled === false,
              label + ': multi_agent_v2_enabled mismatch, got ' + json.multi_agent_v2_enabled);
            assert(json.dispatch_mode === null,
              label + ': dispatch_mode must be null when v2 is disabled (no v1 fallback), got ' + json.dispatch_mode);
            return;
          }
          assert(result.status === 0,
            label + ': v2-enabled config must pass preflight, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert(json.dispatch_mode === 'v2-task-name',
            label + ': expected dispatch_mode v2-task-name, got ' + json.dispatch_mode);
          assert(json.multi_agent_v2_enabled === true,
            label + ': multi_agent_v2_enabled mismatch, got ' + json.multi_agent_v2_enabled);
          if (checkDoctor) {
            const doctorResult = runScript(preflightScript,
              ['--doctor', '--project-root', root266, '--json'], h266);
            const doctorJson = JSON.parse(doctorResult.stdout);
            const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
            assert(projectScope && projectScope.dispatch_mode === 'v2-task-name',
              label + ': doctor project scope expected v2-task-name, got ' + JSON.stringify(projectScope));
          }
        }
        // NOTE: this fixture's HOME layer already has [agents].enabled = true seeded (so the
        // "GREEN: fresh fixture must pass preflight" check above passes) — the overlay is HOME then
        // project, key-by-key, so a project layer that does NOT set `enabled` inherits HOME's true;
        // only an EXPLICIT project-layer `enabled = false` can override it back off.
        assertDispatchModeForConfig(origConfig, true, '#775 no project-layer [agents] table -> inherits enabled=true from HOME', false);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, false, '#775 project layer explicitly overrides enabled=false', false);
        assertDispatchModeForConfig(configWithAgentsEnabled(), true, '#775 [agents]\\nenabled = true', true);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, false,
          '#775 warning suppression alone must not enable v2', false);
        assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\nmulti_agent_v2 = true\n\n' + origConfig, false,
          '#775 a retired top-level multi_agent_v2 key is not read (no more [features] grammar)', false);

        // #598 AC2: effort-gated MultiAgentMode dispatch-POSTURE (distinct from dispatch_mode
        // above — posture reflects whether the runtime will REFUSE a spawn, not just whether the
        // tools are exposed). #775: 'none' now ALWAYS coincides with the codex_multi_agent_v2_required
        // refusal (proven above), so every case here uses a v2-enabled config and must still exit 0
        // (a non-proactive posture is a WARN, never a preflight failure once v2 itself is enabled).
        function assertDispatchPostureForConfig(body, expectedPosture, label) {
          fs.writeFileSync(configPath, body);
          const result = runScript(preflightScript,
            ['--project-root', root266, '--no-autofix', '--json'], h266);
          assert(result.status === 0,
            label + ': dispatch-posture WARN must never fail preflight once v2 is enabled, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert(json.dispatch_posture === expectedPosture,
            label + ': expected dispatch_posture ' + expectedPosture + ', got ' + json.dispatch_posture);
          assert((json.dispatch_posture_warning === null) === (expectedPosture === 'proactive'),
            label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
        }
        assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 base fixture ([agents] enabled via HOME layer, no effort)');
        // NOTE: a 'none' posture ALWAYS now coincides with codex_multi_agent_v2_required (exit 7,
        // proven above) — there is no longer a passing-preflight case that reports posture 'none'.
        assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
          '#598 effort=ultra with [agents] enabled -> proactive');
        assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
          '#598 effort=xhigh (below ultra) stays explicitRequestOnly');
        assertDispatchPostureForConfig(configWithAgentsEnabled(), 'explicitRequestOnly',
          '#775 [agents] enabled=true at the project layer too, no effort -> explicitRequestOnly');
        assertDispatchPostureForConfig(
          configWithAgentsEnabled('model_reasoning_effort = "ultra"'),
          'explicitRequestOnly', '#775 effort INSIDE the [agents] table is not a valid TOML root key -> ignored');

        fs.writeFileSync(configPath, origConfig);
        // Rename a managed role's table inside the block so that role goes missing from it. The
        // vehicle used to be workflow-planner; that role is retired, so the rename silently matched
        // nothing and the 'stale block' fixture was no longer stale. Any SHIPPED role proves the
        // same thing — the assertion is about the block, not about which role is in it.
        const staleConfig = origConfig.replace('[agents.implementer]', '[agents.STALE-implementer]');
        assert(staleConfig !== origConfig,
          '#266 case1 fixture: the stale-block rename must actually change the config (it names a role the install places)');
        fs.writeFileSync(configPath, staleConfig);

    const staleResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(staleResult.status !== 0,
      '#266 case1: stale managed block must cause non-zero exit, got ' + staleResult.status);
    const staleJson = JSON.parse(staleResult.stdout);
    assert(staleJson.status === 'config_stale',
      '#266 case1: stale managed block must return status:config_stale, got ' + staleJson.status);
    assert(Array.isArray(staleJson.missing_roles) && staleJson.missing_roles.includes('implementer'),
      '#266 case1: missing_roles must name the role whose table went stale, got ' + JSON.stringify(staleJson.missing_roles));

    // --- Case 1 GREEN (autofix): without --no-autofix the installer repairs the block ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-autofix-'));
    try {
      trustCodexProject(emptyHome266, autofixRoot);
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
    const wpToml = path.join(root266, '.codex', 'agents', 'kaola-workflow', 'implementer.toml');
    const savedToml = fs.readFileSync(wpToml);
    fs.unlinkSync(wpToml);

    const missingResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(missingResult.status !== 0,
      '#266 case2: missing profile toml must cause non-zero exit, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert(missingJson.status === 'profiles_missing',
      '#266 case2: missing profile toml must return status:profiles_missing, got ' + missingJson.status);
    assert(Array.isArray(missingJson.missing_roles) && missingJson.missing_roles.includes('implementer'),
      '#266 case2: missing_roles must name the role whose profile file is absent, got ' + JSON.stringify(missingJson.missing_roles));

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
// #775: the installer NEVER writes [agents] enabled=true (owner decision D2) — a fresh install
// therefore now reports posture 'none' and multi_agent_v2 'NOT enabled', unconditionally, since
// there is no more auto-seeded [features] multi_agent flag for it to derive explicitRequestOnly
// from. The installer itself still always exits 0 (unconditional profile install); only the later
// PREFLIGHT dispatch-time check refuses via codex_multi_agent_v2_required.
function testCodexDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-proj-'));
  try {
    const fresh = runInstallProfiles(postureProj, { HOME: postureHome });
    assert(/status: ok/.test(fresh.stdout), '#598 AC1: existing "status: ok" output must be unchanged: ' + fresh.stdout);
    assert(/Kaola-Workflow Codex multi_agent_v2: NOT enabled \(see codex_multi_agent_v2_required at preflight\)/.test(fresh.stdout),
      '#775 AC1: a fresh install (no [agents] enabled=true; Kaola never writes it per D2) must report multi_agent_v2 not enabled: ' + fresh.stdout);
    assert(/Kaola-Workflow Codex dispatch posture: none/.test(fresh.stdout),
      '#775 AC1: a fresh install with no [agents] enabled=true must report posture none: ' + fresh.stdout);
    assert(/0\.145\.0/.test(fresh.stdout), '#598 AC1/AC2: report must carry the version-guard note (0.145.0): ' + fresh.stdout);

    // Enable [agents] with effort="ultra" ahead of the managed block, re-install (idempotent
    // update) — the posture must flip to proactive and the non-proactive remediation must disappear.
    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    const beforeUltra = fs.readFileSync(postureConfigPath, 'utf8');
    fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n\n' + beforeUltra);
    const reinstalled = runInstallProfiles(postureProj, { HOME: postureHome });
    assert(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#775 AC1: v2 enabled + effort=ultra must report proactive posture: ' + reinstalled.stdout);
    // #842: the label reports STATE and must not credit the RETIRED key for it. The fixture two
    // lines above enables V2 through [features.multi_agent_v2]; `[agents] enabled = true` is not
    // what enabled it, and does not enable it anywhere. Same predicates as AC1 in
    // scripts/test-install-model-rendering.js — one claim, one wording, across all four chains that
    // pinned the old label.
    assert(/Kaola-Workflow Codex multi_agent_v2: enabled/.test(reinstalled.stdout),
      '#775 AC1: enabled config must report multi_agent_v2 enabled: ' + reinstalled.stdout);
    assert(!/multi_agent_v2: enabled \([^)]*\[agents\]/.test(reinstalled.stdout),
      '#842 AC1: ...and must NOT attribute it to [agents]: ' + reinstalled.stdout);
    assert(!/refuse sub-agent spawns/.test(reinstalled.stdout),
      '#598 AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstalled.stdout);
    // #601: the remediation (still printed while posture is non-proactive, i.e. the FIRST fresh
    // install above) must LEAD with the always-available, always-documented in-session ask, before
    // the effort-gated (undocumented/server-gated) ultra clause.
    const askIdx601 = fresh.stdout.indexOf('explicitly ask for sub-agents');
    const ultraIdx601 = fresh.stdout.indexOf('model_reasoning_effort = "ultra"');
    assert(askIdx601 !== -1 && ultraIdx601 !== -1 && askIdx601 < ultraIdx601,
      '#601: remediation must lead with the in-session ask before the effort-gated ultra clause: ' + fresh.stdout);

    // Pure-function unit coverage on the exported deriveDispatchPosture (same module the
    // installer's REPORT step calls).
    const mod = require(installProfilesScript);
    const none = mod.deriveDispatchPosture('[features.multi_agent_v2]\nenabled = false\n');
    assert(none.dispatch_posture === 'none', '#775: [agents] enabled=false must derive none, got ' + JSON.stringify(none));
    assert(none.dispatch_posture_warning !== null, '#598: a non-proactive posture must carry a remediation string');
    const proactive = mod.deriveDispatchPosture('model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n');
    assert(proactive.dispatch_posture === 'proactive', '#775: effort=ultra + [agents] enabled=true must derive proactive, got ' + JSON.stringify(proactive));
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
// #775: the concurrency/wait-timeout arithmetic itself is UNCHANGED (cap INCLUSIVE of the root
// session; width = cap-1; observed default 4 -> width 3) — the bounds are read from
// `features.multi_agent_v2`, and `max_threads` is NOT an alias for
// max_concurrent_threads_per_session (Codex rejects it once V2 is on). The installer
// never writes the enable flag itself (D2), so a fresh install always reports the
// documentation-only recommended-config note with no concrete width line.
function testCodexMultiAgentV2Bounds611() {
  const boundsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-home-'));
  const boundsProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-proj-'));
  try {
    const fresh = runInstallProfiles(boundsProj, { HOME: boundsHome });
    assert(/status: ok/.test(fresh.stdout), '#611 AC6: existing "status: ok" output must be unchanged: ' + fresh.stdout);
    // v2 not enabled by default (Kaola never writes [agents] enabled=true) -> the recommended-config
    // note (documentation) is always printed, but no concrete width line (nothing to report yet).
    assert(/multi_agent_v2:.*Recommended \[features\.multi_agent_v2\] config/.test(fresh.stdout),
      'AC6: fresh install must document the recommended [features.multi_agent_v2] config: ' + fresh.stdout);
    assert(!/effective subagent width/.test(fresh.stdout),
      '#611 AC6: v2 not enabled -> must NOT print a concrete effective-width line: ' + fresh.stdout);
    assert(/0\.145\.0/.test(fresh.stdout), '#775 AC6: report must carry the version-guard note (0.145.0): ' + fresh.stdout);
    // #842: this note keeps its ADVICE about agents.max_threads and loses its false MECHANISM. It
    // used to be required to quote "agents.max_threads cannot be set when multi_agent_v2 is enabled"
    // VERBATIM as "the real Codex constraint" — from this chain, while scripts/test-install-model-
    // rendering.js required the identical quote from the claude chain. Two independently authored
    // assertions in two chains, both labelled verbatim, both holding a sentence that does not exist.
    // MEASURED on the installed codex-cli 0.145.0, isolated CODEX_HOME, read-only probes:
    //   * `[features.multi_agent_v2] enabled = true` + `[agents] max_threads = 6` loads CLEAN —
    //     `codex doctor --summary` reports "config loaded", `codex features list` exits 0 with
    //     multi_agent_v2 stable true. ACCEPTED, not rejected.
    //   * Non-vacuity: an UNRECOGNISED [agents] scalar in the same position IS refused
    //     (`invalid type: integer 6, expected struct AgentRoleToml`, exit 1), so that acceptance is
    //     a real acceptance and not an unchecked path.
    //   * The quoted error is absent from the shipped binary — neither "cannot be set when" nor
    //     "multi_agent_v2 is enabled" occurs in the 271MB Mach-O — so no Codex code path can print
    //     it at config load, session start, or spawn.
    // Same predicates as AC1 in scripts/test-install-model-rendering.js, deliberately: one claim,
    // one wording, and the two chains must not be able to disagree about it again.
    assert(/agents\.max_threads/.test(fresh.stdout),
      'AC6: note must name agents.max_threads — the advice to leave it out is correct, and a reader '
      + 'who has already set it deserves to learn it does nothing: ' + fresh.stdout);
    assert(!/cannot be set when multi_agent_v2 is enabled/.test(fresh.stdout),
      'AC6 (#842): the note must NOT quote "agents.max_threads cannot be set when multi_agent_v2 is '
      + 'enabled". That string exists in no Codex 0.145.0 binary; printing it tells the operator '
      + 'their config will be refused when it loads clean: ' + fresh.stdout);
    assert(/not an alias/i.test(fresh.stdout),
      'AC6 (#842): the note must state the ACCURATE relationship — agents.max_threads is a separate '
      + 'key and NOT an alias for the V2 budget, which comes from '
      + 'features.multi_agent_v2.max_concurrent_threads_per_session alone: ' + fresh.stdout);

    // Enable [agents] with explicit bounds ahead of the managed block, re-install (idempotent
    // update) — the report must now print the concrete width + every configured bound.
    const boundsConfigPath = path.join(boundsProj, '.codex', 'config.toml');
    const beforeV2 = fs.readFileSync(boundsConfigPath, 'utf8');
    fs.writeFileSync(boundsConfigPath, '[features.multi_agent_v2]\nenabled = true\n'
      + 'max_concurrent_threads_per_session = 3\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\n'
      + 'default_wait_timeout_ms = 60000\n\n' + beforeV2);
    const v2Install = runInstallProfiles(boundsProj, { HOME: boundsHome });
    assert(/effective subagent width 2 \(max_concurrent_threads_per_session=3 \[config\]\)/.test(v2Install.stdout),
      '#611 AC6: configured threads=3 must report width=2 (threads-1) and source=config: ' + v2Install.stdout);
    assert(/min_wait_timeout_ms=1000/.test(v2Install.stdout), '#611 AC6: must report configured min_wait_timeout_ms: ' + v2Install.stdout);
    assert(/max_wait_timeout_ms=1800000/.test(v2Install.stdout), '#611 AC6: must report configured max_wait_timeout_ms: ' + v2Install.stdout);
    assert(/default_wait_timeout_ms=60000/.test(v2Install.stdout), '#611 AC6: must report configured default_wait_timeout_ms: ' + v2Install.stdout);

    // max_threads is NOT an alias for max_concurrent_threads_per_session, so a stray one must leave
    // the cap at the observed default rather than silently setting it. That is a property of THIS
    // parser and is unaffected by #842: the comment here used to add that Codex REJECTS
    // agents.max_threads once multi_agent_v2 is enabled, which is false (measured on 0.145.0 — see
    // the AC6 note assertions above), but the key being inert for this cap math is true either way.
    fs.writeFileSync(boundsConfigPath, '[features.multi_agent_v2]\nenabled = true\nmax_threads = 6\n\n' + beforeV2);
    const aliasInstall = runInstallProfiles(boundsProj, { HOME: boundsHome });
    assert(/effective subagent width 3 \(max_concurrent_threads_per_session=4 \[observed_default\]\)/.test(aliasInstall.stdout),
      'AC6: stray max_threads must NOT set the v2 cap — it falls back to the observed default: ' + aliasInstall.stdout);

    // Pure-function unit coverage on the exported deriveMultiAgentV2Bounds (same module the
    // installer's REPORT step calls) — the observed default (absent key) case.
    const mod = require(installProfilesScript);
    const notApplicable = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = false\n', false);
    assert(notApplicable.max_concurrent_threads_per_session === null,
      '#611: v2 disabled must derive max_concurrent_threads_per_session null, got ' + JSON.stringify(notApplicable));
    const observedDefault = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = true\n', true);
    assert(observedDefault.max_concurrent_threads_per_session === 4 && observedDefault.effective_subagent_width === 3,
      '#611: absent threads value must derive the observed default 4 (width 3), got ' + JSON.stringify(observedDefault));
    const strayMaxThreads = mod.deriveMultiAgentV2Bounds('[features.multi_agent_v2]\nenabled = true\nmax_threads = 6\n', true);
    assert(strayMaxThreads.max_concurrent_threads_per_session === 4 && strayMaxThreads.effective_subagent_width === 3,
      'max_threads is NOT an alias for max_concurrent_threads_per_session — must stay at the observed default, got ' + JSON.stringify(strayMaxThreads));

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
    enableMultiAgentV2(tempHome571a);

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
    // #775: seed [agents] enabled=true so this test still reaches the profile-availability check
    // it was designed to prove, rather than short-circuiting on codex_multi_agent_v2_required.
    enableMultiAgentV2(tempHome571b);
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
      path.join(tempHome571c, '.codex', 'agents', 'kaola-workflow', 'implementer.toml'));

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
      fs.existsSync(path.join(tempHome571flag, '.codex', 'agents', 'kaola-workflow', 'implementer.toml')),
      '#571 test(a2): --global flag must write a role profile to tempHome/.codex/agents/kaola-workflow/');
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
    // #451: 13 base role profiles (the <role>-max effort variants are retired; issue-scout
    // retired #789; investigator added #798; contractor retired #816).
    assert(tomls.length === ROSTER_TOMLS.length,
      '#463 AC: the installer must place exactly the roster the plugin ships (' + ROSTER_TOMLS.length + '), got ' + tomls.length);
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
    assert(Array.isArray(manifest.roles) && manifest.roles.length === ROSTER_TOMLS.length,
      '#463 AC: manifest must list the same roles the install placed (' + ROSTER_TOMLS.length + '), got ' + (manifest.roles || []).length);
    assert(manifest.files && Object.keys(manifest.files).length === ROSTER_TOMLS.length
      && Object.values(manifest.files).every(v => /^sha256:[0-9a-f]{64}$/.test(v)),
      '#463 AC: manifest.files must carry one sha256 entry per shipped role (' + ROSTER_TOMLS.length + ')');
    for (const role of ['code-reviewer', 'adversarial-verifier', 'security-reviewer']) {
      const file = role + '.toml';
      const sourceBytes = fs.readFileSync(path.join(pluginRoot, 'agents', file));
      const installedBytes = fs.readFileSync(path.join(agentsDir, file));
      assert(sourceBytes.equals(installedBytes),
        'reviewer contract: installed ' + file + ' must byte-match the selected source');
      const text = installedBytes.toString('utf8');
      const expectedIdentity = {
        behavior_contract_version: Number(text.match(/^behavior_contract_version: (\d+)$/m)[1]),
        behavior_contract_hash: text.match(/^behavior_contract_hash: ([0-9a-f]{64})$/m)[1],
        resolved_profile_hash: text.match(/^resolved_profile_hash: ([0-9a-f]{64})$/m)[1],
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
    const ghostBytes = Buffer.from('name = "ghost"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const foreignGhostBytes = Buffer.from('name = "foreign-ghost"\ndeveloper_instructions = """user customized"""\n');
    manifest.files['ghost.toml'] = 'sha256:' + createHash('sha256').update(ghostBytes).digest('hex');
    manifest.files['foreign-ghost.toml'] = 'sha256:'
      + createHash('sha256').update('previous managed bytes\n').digest('hex');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(agentsDir, 'ghost.toml'), ghostBytes);
    fs.writeFileSync(path.join(agentsDir, 'foreign-ghost.toml'), foreignGhostBytes);
    const r = runInstallProfiles(ghost);
    assert(!fs.existsSync(path.join(agentsDir, 'ghost.toml')), '#332: manifest-listed ghost.toml must be pruned');
    assert(r.stdout.includes('ghost.toml (stale-managed)'), '#332: stdout must report stale-managed prune');
    assert(fs.readFileSync(path.join(agentsDir, 'foreign-ghost.toml')).equals(foreignGhostBytes),
      '#332: manifest hash mismatch must preserve foreign-customized profile bytes');
    assert(r.stdout.includes('foreign-ghost.toml'),
      '#332: preserved manifest hash mismatch must be reported as unmanaged');
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
    trustCodexProject(kwSandboxHome, root);
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

    // AC9: an injected retired role also changes the canonical managed bytes, so
    // config_stale wins the typed-refusal precedence; doctor retains the role detail.
    const cfgPath = path.join(root, '.codex', 'config.toml');
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    fs.writeFileSync(cfgPath, cfg.replace('# END kaola-workflow agents',
      '[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n\n# END kaola-workflow agents'));
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status !== 0 && j.status === 'config_stale',
      '#332 AC9: canonical managed-block drift must return config_stale, got ' + j.status);
    const doctorResult = runScript(preflightScript,
      ['--doctor', '--project-root', root, '--json'], {});
    const doctorJson = JSON.parse(doctorResult.stdout);
    const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
    assert(doctorResult.status !== 0 && projectScope && projectScope.managed_block_drift === true,
      '#332 AC9: doctor must report canonical managed-block drift');
    assert(projectScope.stale_roles_in_block.includes('docs-lookup'),
      '#332 AC9: doctor stale_roles_in_block must include docs-lookup');
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
      enableMultiAgentV2(home);
      runInstallProfiles(proj);
      trustCodexProject(home, proj);
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
      const pluginIdentity = JSON.parse(fs.readFileSync(
        path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      const cacheRoot = path.join(home, '.codex', 'plugins', 'cache', 'm',
        pluginIdentity.name, pluginIdentity.version);
      const cacheAgents = path.join(cacheRoot, 'agents');
      fs.mkdirSync(cacheRoot, { recursive: true });
      fs.cpSync(path.join(pluginRoot, 'agents'), cacheAgents, { recursive: true });
      fs.cpSync(path.join(pluginRoot, 'config'), path.join(cacheRoot, 'config'), { recursive: true });
      fs.cpSync(path.join(pluginRoot, '.codex-plugin'), path.join(cacheRoot, '.codex-plugin'),
        { recursive: true });
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
      const expectedRefresh = 'codex plugin remove ' + pluginIdentity.name + '@m && codex plugin add '
        + pluginIdentity.name + '@m  # refresh plugin cache';
      assert(cacheScope.repair === expectedRefresh,
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



function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-active-folders-'));
  try {
    initGitRepo(tmp);
    // No-evidence offline case ANSWERS target_unverified (post-#169 contract) at exit 0 — the
    // finding rides the envelope, nothing was written, and the caller acts on it.
    const unverified = runClaimRaw(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(unverified.exitStatus === 0,
      'startup with no local evidence must ANSWER at exit 0, got ' + unverified.exitStatus);
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
    // claim_planner_attested; 'missing' in offline test
    // (no dispatch-log), but closure_invariants.ok must still be true (warn-first contract).
    seedAdaptiveFinalizeFixture(tmp, 'issue-163');
    plantRoadmap(tmp, 163, '');
    const finalizeResult = runClaim(['finalize', '--project', 'issue-163'], tmp);
    assert(finalizeResult.status === 'closed', 'M2 (#277): Codex finalize must return status:closed');
    assert(
      finalizeResult.closure_receipt && 'claim_planner_attested' in finalizeResult.closure_receipt,
      'M2 (#277): Codex closure_receipt must have claim_planner_attested field'
    );
    assert(
      finalizeResult.closure_receipt && !('finalize_contractor_attested' in finalizeResult.closure_receipt),
      '#816: Codex closure_receipt must NOT carry a retired finalize-seam attestation field'
    );
    assert(
      finalizeResult.closure_receipt.claim_planner_attested === 'missing' ||
      finalizeResult.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): Codex claim_planner_attested must be missing or attested'
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
    testCodexPreflight266();
    testCodexDispatchPosture598();
    testCodexMultiAgentV2Bounds611();
    testCodexPreflight571();
    testCodexPreflight332();
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
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-426cx', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
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
      Array.isArray(result.missing) && result.missing.includes('workflow-state.md'),
      'codex #426 verify-before-delete: malformed source must fail the authority preflight (same contract as the canonical twin), got: ' + JSON.stringify(result)
    );
    console.log('testCodexFinalizeArchiveVerifiesBeforeDelete: PASSED');
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
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
    seedAdaptiveFinalizeFixture(tmp, project);
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

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
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
    seedAdaptiveFinalizeFixture(tmp, 'issue-428cx');
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




main();
