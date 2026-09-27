#!/usr/bin/env node
'use strict';

// A relative TMPDIR/TMP/TEMP resolves against the CURRENT DIRECTORY: `os.tmpdir()` returns the
// value VERBATIM, so every fixture root this process or its children build — the HOME sandboxes
// created at MODULE LOAD included — would land in the checkout, and a measured full run under
// `TMPDIR=.` modified a tracked file (and left a new untracked artifact) under
// kaola-workflow/archive/ before failing (#976).
// Normalised HERE, first, because nothing loaded earlier can do it. Absolute-or-/tmp is the
// established shape (tmpBase() in test-install-all.js, KW_TMPDIR in install-all.sh); the two
// look-alike idioms are measured dead — realpathSync(mkdtempSync(…)) absolutises the STRING
// after the directory already landed in the cwd, and path.resolve of a relative TMPDIR IS the
// cwd. Children inherit the normalised value, so one statement covers the whole process tree;
// scripts/test-relative-tmpdir-escape.js pins the result for the root walkthrough.
for (const k of ['TMPDIR', 'TMP', 'TEMP']) {
  if (process.env[k] && !require('path').isAbsolute(process.env[k])) process.env[k] = '/tmp';
}

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

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned;
// point HOME/USERPROFILE at a throwaway sandbox so no subprocess reads or writes the developer's
// real one. Nothing is seeded: an absent config is the shape a fresh machine has.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

// #1101: Kaola-Workflow defines no subagent roles and installs no Codex role profiles
// (docs/decisions/0029-native-subagents-only.md). The Codex preflight sets no version floor and
// requires no dispatch mode, so the shared sandbox HOME stays exactly as a fresh machine has it;
// a test about the enabled multi_agent_v2 posture seeds it itself (enableMultiAgentV2 below).

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
// Entry-point name kept (install-all.sh, the preflight and older plugin caches invoke it). It
// installs the hooks, their version-less home and the global contract, and RETIRES — never
// installs — role profiles and their config registration, only on ownership proof.
const installProfilesScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const nextSkill = path.join(pluginRoot, 'skills', 'kaola-workflow-next', 'SKILL.md');
const { MANIFEST_BASENAME, RETIRED_PROFILE_FILES } =
  require(path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
// A real pre-#1101 Codex project install — seven role profiles, their ownership record and the
// managed `# BEGIN/END kaola-workflow agents` registration block — frozen as documented in
// scripts/fixtures/issue-1101/PROVENANCE.md. Leading-dot names are stored as `dot-<name>`.
const RELEASED_CODEX_SCOPE_FIXTURE = path.join(repoRoot, 'scripts', 'fixtures', 'issue-1101',
  'v12.2.6-46fbe12d', 'home', 'proj', 'dot-codex');
const BEGIN_AGENTS_MARKER = '# BEGIN kaola-workflow agents';
const END_AGENTS_MARKER = '# END kaola-workflow agents';
// The installer's retirement report lines (install-codex-agent-profiles.js), in ONE place: the
// wording is shared with the other runtimes' retirement and may still move with it.
const REMOVED_LINE = 'Removed retired Kaola-Workflow agent: ';
const REMOVED_RECORD_LINE = 'Removed retired Kaola-Workflow agent record: ';
const REMOVED_REGISTRATIONS_LINE = 'Removed retired Kaola-Workflow agent registrations: ';
const PRESERVED_LINE = reason => `Preserved retired Kaola-Workflow agent (${reason}): `;

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

// Copy the released install into <scopeRoot>/.codex, mapping the fixture's `dot-` record name back.
function seedReleasedCodexScope(scopeRoot) {
  const codexDir = path.join(scopeRoot, '.codex');
  fs.cpSync(RELEASED_CODEX_SCOPE_FIXTURE, codexDir, { recursive: true });
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');
  fs.renameSync(path.join(agentsDir, 'dot-kaola-managed-profiles.json'), path.join(agentsDir, MANIFEST_BASENAME));
  return { codexDir, agentsDir, configPath: path.join(codexDir, 'config.toml') };
}

// Plant profiles the way an earlier installer left them: each file plus an ownership-record row
// holding its digest — the manifest+digest proof the installer retires on. Replaces any record.
function plantRecordedProfiles(scopeRoot, files) {
  const agentsDir = path.join(scopeRoot, '.codex', 'agents', 'kaola-workflow');
  fs.mkdirSync(agentsDir, { recursive: true });
  const record = { schema_version: 1, files: {} };
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(agentsDir, name), body);
    record.files[name] = 'sha256:' + createHash('sha256').update(body).digest('hex');
  }
  fs.writeFileSync(path.join(agentsDir, MANIFEST_BASENAME), JSON.stringify(record, null, 2) + '\n');
  return agentsDir;
}

// multi_agent_v2 is a host fact the preflight and the installer REPORT; Kaola-Workflow neither
// requires nor writes it (#775 D2, #1101). Tests about the enabled posture seed it themselves,
// PREPENDED so the file's existing tables keep their order.
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

// ADR 0018 §5 retired the offline claim-evidence path — a not-yet-active issue no longer
// classifies as anything but target_unverified offline, so acquiring a fresh target now drives
// the real classifier online against a gh mock instead of planting a local roadmap source.
function runClaimOnlineAcquire(args, cwd) {
  const binDir = path.join(cwd, 'bin');
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
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'g' + 'h.js') })
  });
  if (result.error) throw result.error;
  assert(result.status === 0,
    'online claim command failed: exit ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function assertNoLegacyCoordDirs(root) {
  for (const name of ['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers']) {
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', '.' + name)), 'legacy coordination dir must not exist: .' + name);
  }
}

function runInstallProfiles(target, extraEnv, extraArgs) {
  const args = (extraArgs && extraArgs.length) ? extraArgs : [];
  // spawn-class: environment
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

// #775 → #1101: the installer writes no Codex config. It never wrote the multi_agent flag (owner
// decision D2) and now registers no roles either (the managed [agents.*] block it used to install
// is retired), so a scope with nothing to retire gets no .codex at all, the global install creates
// no ~/.codex/config.toml, and an existing user config — an unrelated [features] table, a trusted
// project, a user [agents.<name>] table, the user's own model — is byte-identical after repeated
// installs. Neither `[agents] enabled` nor a subagent model binding is ever written.
function testInstallerWritesNoCodexConfig() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-'));
  const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-home-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-'));
  const existingHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-home-'));
  try {
    runInstallProfiles(fresh, { HOME: freshHome, USERPROFILE: freshHome });
    assert(!fs.existsSync(path.join(fresh, '.codex')),
      '#1101: a project install with nothing to retire must create no project .codex (no config.toml, no agents/)');
    runInstallProfiles('--global', { HOME: freshHome, USERPROFILE: freshHome });
    assert(!fs.existsSync(path.join(freshHome, '.codex', 'config.toml')),
      '#775/#1101: the global install must not create ~/.codex/config.toml (no [features], no [agents], no model)');
    assert(!fs.existsSync(path.join(freshHome, '.codex', 'agents')),
      '#1101: the global install must not create ~/.codex/agents');

    const userConfig = [
      'model = "gpt-user-choice"',
      '',
      '[features]',
      'goals = true',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      '',
      '[agents.my-reviewer]',
      'description = "user-defined role"',
      'config_file = "./agents/my-reviewer.toml"',
      ''
    ].join('\n');
    const existingConfigPath = path.join(existing, '.codex', 'config.toml');
    const existingHomeConfigPath = path.join(existingHome, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(existingConfigPath), { recursive: true });
    fs.mkdirSync(path.dirname(existingHomeConfigPath), { recursive: true });
    fs.writeFileSync(existingConfigPath, userConfig);
    fs.writeFileSync(existingHomeConfigPath, userConfig);

    const existingEnv = { HOME: existingHome, USERPROFILE: existingHome };
    runInstallProfiles(existing, existingEnv);
    runInstallProfiles(existing, existingEnv);
    runInstallProfiles('--global', existingEnv);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert(updated === userConfig,
      '#775/#1101: an existing project config must be byte-identical after two installs, got:\n' + updated);
    assert(countOccurrences(updated, /^\[features\]$/gm) === 1 && updated.includes('goals = true'),
      '#775: the existing [features] table must be preserved exactly once');
    assert(!updated.includes(BEGIN_AGENTS_MARKER) && !/default_subagent_model|^\s*enabled\s*=/m.test(updated),
      '#1101: no managed block, no [agents] enabled and no default_subagent_model may be written');
    assert(fs.readFileSync(existingHomeConfigPath, 'utf8') === userConfig,
      '#775/#1101: the global install must leave ~/.codex/config.toml byte-identical');
    console.log('testInstallerWritesNoCodexConfig (#775/#1101): PASSED');
  } finally {
    for (const d of [fresh, freshHome, existing, existingHome]) fs.rmSync(d, { recursive: true, force: true });
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
    // pre-commit-guard and write-lane hooks are also retired; the dispatch-log
    // SubagentStart hook is retired too — SessionStart is the surviving lifecycle event.
    const EVENTS = ['SessionStart'];
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

    // AC1: SessionStart entry with matcher "compact" must print the generated prompt directly.
    const sessionStart = (parsed.hooks || {}).SessionStart || [];
    const compactEntry = sessionStart.find(e => e.matcher === 'compact');
    assert(compactEntry !== undefined,
      'AC1: SessionStart must have an entry with matcher "compact"');
    const compactCmd = compactEntry.hooks && compactEntry.hooks[0] && compactEntry.hooks[0].command;
    assert(typeof compactCmd === 'string'
      && /\bcat\b/.test(compactCmd)
      && compactCmd.includes('hooks/kaola-workflow-codex-compact-recovery.md')
      && !/\bnode\b|\.js\b/.test(compactCmd),
      'AC1: SessionStart compact entry must cat the generated prompt without JS, got: ' + compactCmd);

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

// NARROWED (was testAC3AttestationSeeded, #284 AC3). It seeded a workflow-planner dispatch-log
// entry and asserted claim_planner_attested === 'attested' — the positive half of the warn-first
// attestation probe. claim.js retired the whole producer chain (the --attest-planner-spawn flag,
// checkDispatchAttestations, persistAttestationToSummary and the receipt field), and the codex
// edition runs the byte-identical claim.js, so nothing writes the field on this path either.
//
// What is KEPT is the #333 claim that merely shared the fixture and never depended on attestation:
// a real codex-runtime startup claim finalizes to status:closed, archives exactly one folder, and
// preserves the claim/sink facts needed to identify the finished run. Plus the reappearance guard
// for both retired attestation fields — the one direction a retirement can still regress in.
function testCodexFinalizeArchivesClaimFacts333() {
  // Use an isolated tmp to avoid touching the live kaola-workflow folder.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-attest-'));
  try {
    initGitRepo(root);
    // Claim (startup) to create the project state.
    const acquired = runClaimOnlineAcquire(['startup', '--target-issue', '284', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired.claim === 'acquired', 'AC3 setup: startup must acquire issue-284, got: ' + JSON.stringify(acquired));
    seedAdaptiveFinalizeFixture(root, 'issue-284');

    // DELETED with its mechanism: the dispatch-log seeding. It existed solely so the retired
    // checkDispatchAttestations probe would find a workflow-planner entry; no consumer reads the
    // log on this path any more, so seeding it would be fixture dressing for nobody.

    // Finalize — offline mode.
    const finalizeResult = runClaim(['finalize', '--project', 'issue-284'], root);
    assert(finalizeResult.status === 'closed',
      'finalize must return status:closed, got: ' + JSON.stringify(finalizeResult));
    assert(finalizeResult.closure_receipt && !('claim_planner_attested' in finalizeResult.closure_receipt),
      'the retired planner attestation field must not reappear on the codex closure receipt, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && Object.keys(finalizeResult.closure_receipt)));
    assert(finalizeResult.closure_receipt && !('finalize_contractor_attested' in finalizeResult.closure_receipt),
      '#816: the finalize seam emits no attestation field, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && Object.keys(finalizeResult.closure_receipt)));

    // #333: the archived state remains the compact identity anchor for the finished claim.
    const archived284 = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-284'));
    assert(archived284.length === 1, '#333: finalize must archive issue-284');
    const arch284State = fs.readFileSync(path.join(root, 'kaola-workflow', 'archive', archived284[0], 'workflow-state.md'), 'utf8');
    assert(arch284State.includes('status: closed'), '#333: archived claim must be terminal');
    assert(arch284State.includes('issue_number: 284') && arch284State.includes('sink: pr'),
      '#333: archived claim must preserve issue and sink identity, got: ' + arch284State);

    console.log('testCodexFinalizeArchivesClaimFacts333: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// DELETED: testAttestationWarningPersistenceCodex, the codex twin of the canonical suite's
// testAttestationWarningPersistence (deleted there for the same reason). It seeded a role-only
// dispatch-log so the planner seam would surface `ATTESTATION WARNING: no workflow-planner dispatch
// found in dispatch-log`, then asserted that warning and the claim_planner_attested field landed in
// the archived finalization-summary.md and the workflow-state.md ## Closure block. Every producer in
// that chain is retired — the mandatory planner agent is gone, inline authoring is the design, and
// claim.js dropped checkDispatchAttestations, persistAttestationToSummary and the field itself. The
// warning string has no producer anywhere outside test sources.
//
// UNCOVERED (codex edition): that the archived finalization-summary.md exists at all. Nothing else
// in THIS suite reads that file; the ## Closure block it also covered is still asserted by the
// keep-open archive scenario below. The finalize path that writes both is byte-identical claim.js,
// covered by the canonical suite, so this is an edition-local coverage gap rather than a repo-wide
// one — but it is a real one and it is named here rather than papered over.

// n5 (#653 finding D3, codex edition): selection-evidence probe. Case (a) seeds
// .cache/selection-evidence.md pre-finalize (simulating the router's D2 docking) ->
// closure_receipt.selection_evidence must read 'present' and the file must survive under the
// archived project's .cache/. Case (b), a separate project with no docked file, must read 'absent'.
function testSelectionEvidenceDockingCodex() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-selection-evidence-codex-'));
  try {
    initGitRepo(root);
    const acquired = runClaimOnlineAcquire(['startup', '--target-issue', '653203', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired.claim === 'acquired', 'selection-evidence (codex): startup must acquire issue-653203, got: ' + JSON.stringify(acquired));
    seedAdaptiveFinalizeFixture(root, 'issue-653203');

    const cacheDir = path.join(root, 'kaola-workflow', 'issue-653203', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'selection-evidence.md'),
      'selection_mode: single-issue\n\n```json\n{"recommended_bundle":{"primary_issue":653203,"issues":[653203],"confidence":"low"}}\n```\n');

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
    const acquired2 = runClaimOnlineAcquire(['startup', '--target-issue', '653204', '--runtime', 'codex', '--sink', 'pr'], root);
    assert(acquired2.claim === 'acquired', 'selection-evidence (codex): second startup must acquire issue-653204, got: ' + JSON.stringify(acquired2));
    seedAdaptiveFinalizeFixture(root, 'issue-653204');

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

// #333: keep-open partial-close archive stamp (codex edition). Plant a compact active claim,
// finalize with --keep-open, and assert the archived closure disposition.
function testKeepOpenArchiveStamp333() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-333-keepopen-'));
  try {
    initGitRepo(root);
    const projDir = path.join(root, 'kaola-workflow', 'issue-333');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: issue-333', 'status: active', '',
      '## Sink',
      'branch: workflow/issue-333',
      'issue_number: 333',
      'sink: merge',
      'main_root: ' + root,
      'session_marker: walkthrough-333',
      'claim_ts: 2020-01-01T00:00:00.000Z', ''
    ].join('\n'));
    // #1089: the run's mission ledger lives in the main checkout's gitignored .ledger/.
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.ledger'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', '.ledger', 'issue-333.jsonl'),
      JSON.stringify({ n: 1, name: 'archive the finished claim while leaving the issue open',
        details: 'dispatched: main orchestrator | result: closure disposition recorded', status: 'done' }) + '\n');
    seedAdaptiveFinalizeFixture(root, 'issue-333');
    const result = runClaim(['finalize', '--project', 'issue-333', '--keep-open'], root);
    assert(result.status === 'closed', '#333: keep-open finalize should report closed');
    assert(result.issue_disposition === 'kept-open',
      '#333: JSON output issue_disposition must be kept-open, got: ' + JSON.stringify(result.issue_disposition));
    const archived = fs.readdirSync(path.join(root, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-333'));
    assert(archived.length === 1, '#333: keep-open finalize should archive folder');
    const st = fs.readFileSync(path.join(root, 'kaola-workflow', 'archive', archived[0], 'workflow-state.md'), 'utf8');
    assert(st.includes('status: closed'), '#333: keep-open archived state must be closed');
    assert(result.closure_receipt && result.closure_receipt.mission_ledger === 'moved',
      '#1089: finalize must report the ledger move on closure_receipt.mission_ledger, got: '
      + JSON.stringify(result.closure_receipt && result.closure_receipt.mission_ledger));
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', archived[0], 'mission-ledger.jsonl'))
      && !fs.existsSync(path.join(root, 'kaola-workflow', '.ledger', 'issue-333.jsonl')),
      '#1089: finalize must move the live ledger into the archive');
    assert(st.includes('session_marker: walkthrough-333') && st.includes('claim_ts: 2020-01-01T00:00:00.000Z'),
      '#333: keep-open archive must preserve claim liveness identity, got: ' + st);
    assert(/^## Closure$/m.test(st), '#333: keep-open archived state must carry a ## Closure block');
    assert(st.includes('issue_disposition: kept-open'),
      '#333: keep-open archived ## Closure must record issue_disposition: kept-open');
    console.log('testKeepOpenArchiveStamp333: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// AC2 (#1044): the installed compact carrier is the exact generated, complete runtime prompt.
// There is no compact-time parser, operation selector, state packet, or JS subprocess.
function testAC2StaticCompactPrompt() {
  const routing = require(path.join(repoRoot, 'scripts', 'generate-routing-surfaces.js'));
  const promptPath = path.join(pluginRoot, 'hooks', 'kaola-workflow-codex-compact-recovery.md');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  assert(prompt === routing.renderCompactRecoveryPrompt('codex', 'github'),
    'AC2: installed Codex prompt must equal the generation-time runtime rendering');
  assert(prompt.includes('Recovery marker: `KW-COMPACT-RECOVERY-V2`.')
    && prompt.includes('already carries the full runtime dispatch contract')
    && !prompt.includes('KW-RUNTIME-DISPATCH-START')
    && /completely reload the installed Workflow\s+Next prompt/.test(prompt)
    && /completely\s+reload the installed Kaola-Workflow Finalization prompt/.test(prompt),
    'AC2: V2 prompt must carry complete operation reload plus the dispatch contract');
  assert(!/\bnode\b|\.js\b|PreToolUse|PostToolUse/.test(prompt),
    'AC2: prompt must not require compact-time JS or tool-use injection');
  console.log('testAC2StaticCompactPrompt (#1044 AC2): PASSED');
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
    assert(commandCount >= 1, '#409: expected at least one surviving managed hook command, saw ' + commandCount);

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

function git(args, cwd) { return spawnSync('git', args, { cwd, encoding: 'utf8' }); }
function initGitRepo(tmp) {
  git(['init', '-b', 'main'], tmp); git(['config', 'user.email', 't@t.t'], tmp); git(['config', 'user.name', 't'], tmp);
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n'); git(['add', '-A'], tmp); git(['commit', '-m', 'init'], tmp);
  const remote = tmp + '-remote'; git(['init', '--bare', remote], path.dirname(tmp)); git(['remote', 'add', 'origin', remote], tmp); git(['push', '-u', 'origin', 'main'], tmp);
}
function plantRoadmap(tmp, issue, body) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issue + '.md'), ['issue: #' + issue, 'title: t', 'status: open', 'workflow_project: —', 'next_step: ready', body, ''].join('\n'));
}
// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the Codex preflight. Each case proves a
// discriminating RED (wrong fixture → typed refusal / wrong JSON) then GREEN (correct fixture →
// ok / correct JSON). Native-only since #1101: the gate checks config-layer safety, REPORTS the
// effective multi_agent_v2 / dispatch posture / bounds, and refuses only retired-role residue.
// ---------------------------------------------------------------------------

const preflightScript   = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
function runScript(scriptPath, args, opts) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    ...opts
  });
}

// Case 1 + Case 2 + Case 5 (#266), native-only since #1101. What each case proves now:
//   fresh  — a trusted project with no Kaola residue passes (exit 0 ok) whatever multi_agent_v2
//            says and whatever --codex-version says: no dispatch-mode requirement (was exit 7
//            codex_multi_agent_v2_required) and no version floor (a5bb3385);
//   case 1 — the retired `# BEGIN/END kaola-workflow agents` block, stale or not, is
//            retired_role_residue (exit 1; was config_stale) naming config.toml and the exact
//            scoped installer command; autofix strips a released block (exit 0 autofixed) and
//            leaves an edited one byte-for-byte, reported as residue for the user (exit 1,
//            autofix_attempted);
//   case 2 — a retired profile file inside agents/kaola-workflow/ is residue naming that file
//            (was: a MISSING profile was profiles_missing); removing it passes again;
//   case 5 — a residue refusal never falls back: stdout carries neither subagent-invoked nor
//            local-fallback;
//   scope  — only exact retired names inside the Kaola-owned directory count: a user file outside
//            agents/kaola-workflow/, an unknown file inside it, and a user [agents.<name>] table
//            outside the markers are never residue.
function testCodexPreflight266() {
  // #571: hermetic-HOME retrofit — every preflight call runs under an empty temp HOME.
  const emptyHome266 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-hermetic-home-'));
  const h266 = { env: { ...process.env, HOME: emptyHome266, USERPROFILE: emptyHome266 } };
  const root266 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-'));
  const scopedRepair266 = 'node ' + installProfilesScript + ' ' + root266;
  function preflight266(extraArgs) {
    const r = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json', ...(extraArgs || [])], h266);
    return { r, j: JSON.parse(r.stdout) };
  }
  try {
    trustCodexProject(emptyHome266, root266);

    // --- GREEN: a fresh machine — nothing installed, multi_agent_v2 off in every layer ---
    let { r, j } = preflight266();
    assert(r.status === 0 && j.status === 'ok',
      '#266 fresh RED-discriminator: a trusted project with no residue must exit 0 ok, got ' + r.status + '\n' + r.stdout);
    assert(j.multi_agent_v2_enabled === false && j.dispatch_mode === null && j.dispatch_posture === 'none',
      '#1101: a clean home with multi_agent_v2 off must pass and REPORT multi_agent_v2_enabled:false, '
      + 'dispatch_mode:null (no v1 fallback) and posture none, got ' + JSON.stringify({
        multi_agent_v2_enabled: j.multi_agent_v2_enabled, dispatch_mode: j.dispatch_mode, dispatch_posture: j.dispatch_posture }));
    ({ r, j } = preflight266(['--codex-version', '0.140.0']));
    assert(r.status === 0 && j.status === 'ok',
      'a5bb3385: a below-0.145 --codex-version must no longer refuse, got ' + r.status + '\n' + r.stdout);
    // Running the installer for this project places nothing, and the gate still passes.
    runInstallProfiles(root266, { HOME: emptyHome266, USERPROFILE: emptyHome266 });
    assert(!fs.existsSync(path.join(root266, '.codex')),
      '#1101: the project install must place no profile, record, or config');
    ({ r, j } = preflight266());
    assert(r.status === 0 && j.status === 'ok',
      '#266 GREEN: the fixture must still pass after an install, got ' + r.status + '\n' + r.stdout);

    // From here the HOME layer enables multi_agent_v2; the project layer is written per case.
    enableMultiAgentV2(emptyHome266);
    const configPath = path.join(root266, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const origConfig = '';
    function configWithAgentsEnabled(extraLines) {
      return '[features.multi_agent_v2]\nenabled = true\n' + (extraLines ? extraLines + '\n' : '') + '\n' + origConfig;
    }
    // #775: dispatch mode is binary — the 0.142/0.144 transport-mode grammar is retired. #1101: it
    // is a REPORTED host fact, never a refusal, so both answers exit 0; there is no v1 fallback
    // either way (dispatch_mode is null, not a fabricated v1 mode, when v2 is off).
    function assertDispatchModeForConfig(body, expectedEnabled, label, checkDoctor) {
      fs.writeFileSync(configPath, body);
      const result = runScript(preflightScript,
        ['--project-root', root266, '--no-autofix', '--json'], h266);
      assert(result.status === 0,
        label + ': multi_agent_v2 is reported, never required — must exit 0 (was exit 7 when disabled), got '
        + result.status + '\n' + result.stdout);
      const json = JSON.parse(result.stdout);
      assert(json.status === 'ok', label + ': expected status ok, got ' + json.status);
      assert(json.multi_agent_v2_enabled === expectedEnabled,
        label + ': multi_agent_v2_enabled mismatch, got ' + json.multi_agent_v2_enabled);
      assert(json.dispatch_mode === (expectedEnabled ? 'v2-task-name' : null),
        label + ': dispatch_mode must be v2-task-name when enabled and null otherwise (no v1 fallback), got ' + json.dispatch_mode);
      if (checkDoctor) {
        const doctorResult = runScript(preflightScript,
          ['--doctor', '--project-root', root266, '--json'], h266);
        const doctorJson = JSON.parse(doctorResult.stdout);
        const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
        assert(doctorResult.status === 0 && projectScope && projectScope.dispatch_mode === 'v2-task-name',
          label + ': doctor project scope expected v2-task-name at exit 0, got ' + doctorResult.status + ' ' + JSON.stringify(projectScope));
      }
    }
    // The overlay is HOME then project, key-by-key: a project layer that does NOT set `enabled`
    // inherits HOME's true; only an EXPLICIT project-layer `enabled = false` turns it back off.
    assertDispatchModeForConfig(origConfig, true, '#775 no project-layer table -> inherits enabled=true from HOME', false);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, false, '#775 project layer explicitly overrides enabled=false', false);
    assertDispatchModeForConfig(configWithAgentsEnabled(), true, '#775 [features.multi_agent_v2]\\nenabled = true', true);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, false,
      '#775 warning suppression alone must not enable v2', false);
    assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\nmulti_agent_v2 = true\n\n' + origConfig, false,
      '#775 a retired top-level multi_agent_v2 key is not read (no more [features] grammar)', false);

    // #598 AC2: effort-gated dispatch POSTURE — reported, never a failure (#1101: including
    // `none`, which used to coincide with the retired v2 refusal).
    function assertDispatchPostureForConfig(body, expectedPosture, label) {
      fs.writeFileSync(configPath, body);
      const result = runScript(preflightScript,
        ['--project-root', root266, '--no-autofix', '--json'], h266);
      assert(result.status === 0,
        label + ': the dispatch posture is reported, never enforced — must exit 0, got ' + result.status + '\n' + result.stdout);
      const json = JSON.parse(result.stdout);
      assert(json.dispatch_posture === expectedPosture,
        label + ': expected dispatch_posture ' + expectedPosture + ', got ' + json.dispatch_posture);
      assert((json.dispatch_posture_warning === null) === (expectedPosture === 'proactive'),
        label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
    }
    assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 base fixture (v2 enabled via HOME layer, no effort)');
    assertDispatchPostureForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + origConfig, 'none',
      '#1101 v2 disabled -> posture none, reported at exit 0');
    assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
      '#598 effort=ultra with v2 enabled -> proactive');
    assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
      '#598 effort=xhigh (below ultra) stays explicitRequestOnly');
    assertDispatchPostureForConfig(configWithAgentsEnabled(), 'explicitRequestOnly',
      '#775 v2 enabled at the project layer too, no effort -> explicitRequestOnly');
    assertDispatchPostureForConfig(
      configWithAgentsEnabled('model_reasoning_effort = "ultra"'),
      'explicitRequestOnly', '#775 effort INSIDE the [features.multi_agent_v2] table is not a root key -> ignored');

    // --- Case 1 RED: the retired managed block → retired_role_residue ---
    const userAgentTable = '[agents.my-reviewer]\ndescription = "user-defined role"\n';
    const releasedConfig = fs.readFileSync(path.join(RELEASED_CODEX_SCOPE_FIXTURE, 'config.toml'), 'utf8')
      + '\n' + userAgentTable;
    // Rename a registered role inside the block: the block is no longer one any release wrote. The
    // assertion is about the block, not about which role is in it.
    const staleConfig = releasedConfig.replace('[agents.implementer]', '[agents.STALE-implementer]');
    assert(staleConfig !== releasedConfig,
      '#266 case1 fixture: the stale-block rename must actually change the config');
    for (const [label, body] of [['released', releasedConfig], ['stale', staleConfig]]) {
      fs.writeFileSync(configPath, body);
      ({ r, j } = preflight266());
      assert(r.status === 1 && j.status === 'retired_role_residue',
        '#266 case1/#1101 (' + label + ' block): the managed block must be retired_role_residue at exit 1 (was config_stale), got '
        + r.status + ' ' + j.status);
      assert(j.residue_paths.includes(configPath) && j.residue.length === 1 && j.residue[0].managed_block === 'present',
        '#266 case1 (' + label + ' block): residue must name the project config.toml, got ' + JSON.stringify(j.residue));
      assert(j.repair.includes(scopedRepair266),
        '#266 case1 (' + label + ' block): repair must carry the exact scoped installer command, got ' + j.repair);
    }
    fs.writeFileSync(configPath, origConfig);

    // --- Case 1 GREEN (autofix): the installer strips a released block, keeps an edited one ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-autofix-'));
    try {
      trustCodexProject(emptyHome266, autofixRoot);
      const autofixConfig = path.join(autofixRoot, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(autofixConfig), { recursive: true });
      fs.writeFileSync(autofixConfig, releasedConfig);
      let autofixResult = runScript(preflightScript, ['--project-root', autofixRoot, '--json'], h266);
      assert(autofixResult.status === 0,
        '#266 case1 autofix: preflight with autofix must exit 0 after repair, got ' + autofixResult.status + '\n' + autofixResult.stdout);
      let autofixJson = JSON.parse(autofixResult.stdout);
      assert(autofixJson.status === 'ok' && autofixJson.autofixed === true
        && autofixJson.autofixed_residue_paths.includes(autofixConfig),
        '#266 case1 autofix: must return status:ok autofixed:true naming config.toml, got ' + JSON.stringify(autofixJson));
      const repaired = fs.readFileSync(autofixConfig, 'utf8');
      assert(!repaired.includes(BEGIN_AGENTS_MARKER) && !repaired.includes('[agents.implementer]') && repaired.includes(userAgentTable),
        '#266 case1 autofix: the released block must be gone and the user table outside it kept, got:\n' + repaired);

      fs.writeFileSync(autofixConfig, staleConfig);
      autofixResult = runScript(preflightScript, ['--project-root', autofixRoot, '--json'], h266);
      autofixJson = JSON.parse(autofixResult.stdout);
      // The repair names the managed block to remove and never tells the user to delete
      // config.toml (it holds their model, MCP servers, and other settings) — neither at the top
      // level nor in any per-scope repair.
      const repairs = [autofixJson.repair, ...(autofixJson.residue || []).map(entry => entry.repair)];
      for (const text of repairs) {
        assert(!/delete (?:it|each one|them) by hand/.test(text) && !/delete[^.]*config\.toml/.test(text),
          '#1101 N2: a preflight repair must never tell the user to delete config.toml, got: ' + text);
      }
      assert(repairs.some(text => text.includes(BEGIN_AGENTS_MARKER) && /config\.toml/.test(text)),
        '#1101 N2: the repair names the "' + BEGIN_AGENTS_MARKER + '" block in config.toml as what to remove');
      assert(autofixResult.status === 1 && autofixJson.status === 'retired_role_residue'
        && autofixJson.autofix_attempted === true,
        '#1101 case1 autofix: an edited block is not provably Kaola\'s — the installer keeps it and the gate reports '
        + 'it as residue for the user (exit 1, autofix_attempted), not an installer failure, got '
        + autofixResult.status + ' ' + JSON.stringify(autofixJson));
      assert(fs.readFileSync(autofixConfig, 'utf8') === staleConfig,
        '#1101 case1 autofix: the edited block must be left byte-for-byte');
    } finally {
      fs.rmSync(autofixRoot, { recursive: true, force: true });
    }

    // --- Case 2 RED: a retired profile file inside agents/kaola-workflow/ → residue naming it ---
    const kwAgentsDir = path.join(root266, '.codex', 'agents', 'kaola-workflow');
    const wpToml = path.join(kwAgentsDir, 'implementer.toml');
    assert(RETIRED_PROFILE_FILES.includes('implementer.toml'), '#266 case2 fixture: implementer.toml must be a retired profile name');
    fs.mkdirSync(kwAgentsDir, { recursive: true });
    fs.writeFileSync(wpToml, 'name = "implementer"\ndeveloper_instructions = """x"""\n');
    const missingResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], h266);
    assert(missingResult.status === 1,
      '#266 case2/#1101: a planted agents/kaola-workflow/implementer.toml must exit 1, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert(missingJson.status === 'retired_role_residue',
      '#266 case2/#1101: status must be retired_role_residue (was profiles_missing), got ' + missingJson.status);
    assert(missingJson.residue_paths.includes(wpToml)
      && missingJson.residue[0].retired_profile_files.includes(wpToml),
      '#266 case2: residue must name the retired profile file, got ' + JSON.stringify(missingJson.residue));

    // --- Case 5 RED: a residue refusal never falls back ---
    assert(!missingResult.stdout.includes('subagent-invoked'),
      '#266 case5: preflight refusal must NOT emit subagent-invoked, got: ' + missingResult.stdout);
    assert(!missingResult.stdout.includes('local-fallback'),
      '#266 case5: preflight refusal must NOT emit local-fallback, got: ' + missingResult.stdout);

    // --- Case 2 GREEN: removed → fresh again ---
    fs.unlinkSync(wpToml);
    ({ r, j } = preflight266());
    assert(r.status === 0 && j.status === 'ok',
      '#266 case2 GREEN: with the retired profile gone the fixture must pass, got ' + r.status + '\n' + r.stdout);

    // --- Scope: never residue ---
    fs.writeFileSync(path.join(root266, '.codex', 'agents', 'implementer.toml'), 'name = "implementer"\n');
    fs.writeFileSync(path.join(kwAgentsDir, 'my-custom.toml'), 'name = "my-custom"\n');
    fs.writeFileSync(configPath, '[agents.implementer]\ndescription = "mine"\nconfig_file = "./agents/implementer.toml"\n');
    ({ r, j } = preflight266());
    assert(r.status === 0 && j.status === 'ok',
      '#1101: a user file outside agents/kaola-workflow/, an unknown file inside it, and a user [agents.x] table '
      + 'are never residue — must exit 0 ok, got ' + r.status + '\n' + r.stdout);

    console.log('testCodexPreflight266 (#266 cases 1,2,5; #1101 native-only): PASSED');
  } finally {
    fs.rmSync(root266, { recursive: true, force: true });
    fs.rmSync(emptyHome266, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #598 AC1: installer dispatch-posture REPORT. ATTESTATION-STYLE / NON-FATAL — the installer
// REPORTS the effective effort-gated posture it reads from config.toml and this NEVER changes the
// install's own exit code.
// ---------------------------------------------------------------------------
// #775 D2 / #1101: the installer never writes multi_agent_v2, `[agents] enabled`, or a model or
// effort, and Kaola-Workflow no longer requires any of them — so a fresh install reports posture
// `none` / multi_agent_v2 not enabled, points at no preflight refusal, and still ends
// `status: ok`. The report text is the host fact plus the module's own exported wording; the #601
// "lead with the in-session ask, then the ultra effort clause" remediation existed to get Kaola
// roles dispatched and is retired with them.
function testCodexDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-598-posture-proj-'));
  try {
    const mod = require(installProfilesScript);
    const postureEnv = { HOME: postureHome, USERPROFILE: postureHome };
    const fresh = runInstallProfiles(postureProj, postureEnv);
    assert(fresh.stdout.trim().split('\n').pop() === 'status: ok',
      '#598 AC1: the install must still end with "status: ok": ' + fresh.stdout);
    assert(/^Kaola-Workflow Codex multi_agent_v2: not enabled/m.test(fresh.stdout),
      '#775/#1101 AC1: a fresh install (Kaola never writes the flag) must report multi_agent_v2 not enabled: ' + fresh.stdout);
    assert(!/codex_multi_agent_v2_required/.test(fresh.stdout),
      '#1101: the report must not point at the retired codex_multi_agent_v2_required refusal: ' + fresh.stdout);
    assert(/^Kaola-Workflow Codex dispatch posture: none\b/m.test(fresh.stdout),
      '#775 AC1: a fresh install with v2 off must report posture none: ' + fresh.stdout);
    assert(fresh.stdout.includes('Kaola-Workflow Codex dispatch posture: ' + mod.dispatchPostureRemediation('none')),
      '#598 AC1: a non-proactive posture must print its posture note: ' + fresh.stdout);
    assert(fresh.stdout.includes(mod.DISPATCH_POSTURE_VERSION_NOTE) && /0\.145\.0/.test(mod.DISPATCH_POSTURE_VERSION_NOTE),
      '#598 AC1/AC2: report must carry the observed-version note (0.145.0): ' + fresh.stdout);
    assert(!fs.existsSync(path.join(postureProj, '.codex')),
      '#775 D2/#1101: reporting the posture must write no project config');

    // The USER enables v2 with effort="ultra"; a re-install must report proactive and leave the
    // user's config exactly as written (model_reasoning_effort is a user-owned choice).
    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(postureConfigPath), { recursive: true });
    const ultraConfig = 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n';
    fs.writeFileSync(postureConfigPath, ultraConfig);
    const reinstalled = runInstallProfiles(postureProj, postureEnv);
    assert(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#775 AC1: v2 enabled + effort=ultra must report proactive posture: ' + reinstalled.stdout);
    // #842: the label reports STATE and must not credit the RETIRED key for it. The fixture
    // enables V2 through [features.multi_agent_v2]; `[agents] enabled = true` is not what enabled it.
    assert(/Kaola-Workflow Codex multi_agent_v2: enabled/.test(reinstalled.stdout),
      '#775 AC1: enabled config must report multi_agent_v2 enabled: ' + reinstalled.stdout);
    assert(!/multi_agent_v2: enabled \([^)]*\[agents\]/.test(reinstalled.stdout),
      '#842 AC1: ...and must NOT attribute it to [agents]: ' + reinstalled.stdout);
    assert(!reinstalled.stdout.includes(mod.dispatchPostureRemediation('none'))
      && !reinstalled.stdout.includes(mod.dispatchPostureRemediation('explicitRequestOnly')),
      '#598 AC1: a proactive posture must NOT print a non-proactive posture note: ' + reinstalled.stdout);
    assert(fs.readFileSync(postureConfigPath, 'utf8') === ultraConfig,
      '#598/#1101: the installer never writes model_reasoning_effort or multi_agent_v2 — the config must be byte-identical');

    // Pure-function unit coverage on the exported deriveDispatchPosture (same module the
    // installer's REPORT step calls).
    const none = mod.deriveDispatchPosture('[features.multi_agent_v2]\nenabled = false\n');
    assert(none.dispatch_posture === 'none', '#775: v2 enabled=false must derive none, got ' + JSON.stringify(none));
    assert(none.dispatch_posture_warning !== null, '#598: a non-proactive posture must carry its note');
    const proactive = mod.deriveDispatchPosture('model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n');
    assert(proactive.dispatch_posture === 'proactive', '#775: effort=ultra + v2 enabled must derive proactive, got ' + JSON.stringify(proactive));
    assert(proactive.dispatch_posture_warning === null, '#598: a proactive posture must carry NO note');

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
// max_concurrent_threads_per_session. The installer never writes the enable flag itself (D2).
// #1101: the note used to RECOMMEND a config "for Kaola-Workflow dispatch"; Kaola now neither
// requires nor writes any of it, so a fresh install prints the module's own note describing how
// Codex bounds the feature, with no concrete width line.
function testCodexMultiAgentV2Bounds611() {
  const boundsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-home-'));
  const boundsProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-611-bounds-proj-'));
  try {
    const mod = require(installProfilesScript);
    const fresh = runInstallProfiles(boundsProj, { HOME: boundsHome, USERPROFILE: boundsHome });
    assert(/status: ok/.test(fresh.stdout), '#611 AC6: existing "status: ok" output must be unchanged: ' + fresh.stdout);
    // v2 not enabled by default (Kaola never writes it) -> the bounds note is always printed, but no
    // concrete width line (nothing to report yet).
    assert(fresh.stdout.includes('Kaola-Workflow Codex multi_agent_v2: ' + mod.MULTI_AGENT_V2_BOUNDS_NOTE),
      'AC6: fresh install must print the [features.multi_agent_v2] bounds note: ' + fresh.stdout);
    assert(/neither requires nor writes/.test(mod.MULTI_AGENT_V2_BOUNDS_NOTE)
      && !/Recommended \[features\.multi_agent_v2\] config for Kaola-Workflow/.test(fresh.stdout),
      '#1101 AC6: the note must say Kaola-Workflow neither requires nor writes the feature, and no longer '
      + 'recommend a config for Kaola dispatch: ' + fresh.stdout);
    // The note itself now explains "effective subagent width" in prose; the concrete report line is
    // the phrase followed by a number.
    assert(!/effective subagent width \d/.test(fresh.stdout),
      '#611 AC6: v2 not enabled -> must NOT print a concrete effective-width line: ' + fresh.stdout);
    assert(/0\.145\.0/.test(fresh.stdout), '#775 AC6: report must carry the source-verified version (0.145.0): ' + fresh.stdout);
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

    // The USER enables v2 with explicit bounds; re-install — the report must now print the
    // concrete width + every configured bound. (#1101: the install wrote no project config.)
    const boundsConfigPath = path.join(boundsProj, '.codex', 'config.toml');
    assert(!fs.existsSync(boundsConfigPath), '#1101: the fresh install must write no project config.toml');
    fs.mkdirSync(path.dirname(boundsConfigPath), { recursive: true });
    const beforeV2 = '';
    fs.writeFileSync(boundsConfigPath, '[features.multi_agent_v2]\nenabled = true\n'
      + 'max_concurrent_threads_per_session = 3\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\n'
      + 'default_wait_timeout_ms = 60000\n\n' + beforeV2);
    const v2Install = runInstallProfiles(boundsProj, { HOME: boundsHome, USERPROFILE: boundsHome });
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
    const aliasInstall = runInstallProfiles(boundsProj, { HOME: boundsHome, USERPROFILE: boundsHome });
    assert(/effective subagent width 3 \(max_concurrent_threads_per_session=4 \[observed_default\]\)/.test(aliasInstall.stdout),
      'AC6: stray max_threads must NOT set the v2 cap — it falls back to the observed default: ' + aliasInstall.stdout);

    // Pure-function unit coverage on the exported deriveMultiAgentV2Bounds (same module the
    // installer's REPORT step calls) — the observed default (absent key) case.
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
// #571: global-first — install once to ~/.codex, every repo passes. Native-only since #1101: a
// global install places no profile, so "the global scope satisfies the gate" now means a clean
// HOME passes for any project without a project .codex being created, and what fails closed is
// retired-role residue in the global scope (a clean project can never shadow it).
// ---------------------------------------------------------------------------
function testCodexPreflight571() {
  // --- Test (a): positional HOME install ⇒ gate passes, no project .codex is created ---
  const tempHome571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571a-home-'));
  try {
    const env571a = { ...process.env, HOME: tempHome571a, USERPROFILE: tempHome571a };
    // The POSITIONAL form (node installer "$HOME") — the scope root is HOME itself.
    runInstallProfiles(tempHome571a, { HOME: tempHome571a, USERPROFILE: tempHome571a });
    assert(!fs.existsSync(path.join(tempHome571a, '.codex', 'agents')),
      '#571 test(a)/#1101: the positional HOME install must place no profile');
    enableMultiAgentV2(tempHome571a);

    const emptyProject571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571a-proj-'));
    try {
      const r = runScript(preflightScript,
        ['--project-root', emptyProject571a, '--no-autofix', '--json'],
        { env: env571a });
      assert(r.status === 0,
        '#571 test(a): a global-only setup must pass preflight for any project, got ' + r.status + '\n' + r.stdout);
      const j = JSON.parse(r.stdout);
      assert(j.status === 'ok', '#571 test(a): status must be ok, got ' + j.status);
      assert(Array.isArray(j.scopes_checked) && j.scopes_checked[0] === path.join(tempHome571a, '.codex'),
        '#571 test(a): the global scope must be the first scope checked, got ' + JSON.stringify(j.scopes_checked));
      assert(j.multi_agent_v2_enabled === true,
        '#571 test(a): the global layer is part of the effective runtime the gate reports, got ' + j.multi_agent_v2_enabled);
      assert(!fs.existsSync(path.join(emptyProject571a, '.codex')),
        '#571 test(a): no project .codex must be created when the global scope satisfies the gate');
    } finally {
      fs.rmSync(emptyProject571a, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571a, { recursive: true, force: true });
  }

  // --- Test (b): nothing installed anywhere, multi_agent_v2 off ⇒ passes (was: fail-closed
  //     profiles_missing — there is no profile left to be missing) ---
  const tempHome571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571b-home-'));
  const emptyProject571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571b-proj-'));
  try {
    const r = runScript(preflightScript,
      ['--project-root', emptyProject571b, '--no-autofix', '--json'],
      { env: { ...process.env, HOME: tempHome571b, USERPROFILE: tempHome571b } });
    const j = JSON.parse(r.stdout);
    assert(r.status === 0 && j.status === 'ok' && j.multi_agent_v2_enabled === false,
      '#571 test(b)/#1101: a clean home with multi_agent_v2 off must exit 0 and report multi_agent_v2_enabled:false, got '
      + r.status + '\n' + r.stdout);
  } finally {
    fs.rmSync(tempHome571b, { recursive: true, force: true });
    fs.rmSync(emptyProject571b, { recursive: true, force: true });
  }

  // --- Test (c): global residue does NOT short-circuit to ok for a clean project ---
  const tempHome571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571c-home-'));
  try {
    const env571c = { ...process.env, HOME: tempHome571c, USERPROFILE: tempHome571c };
    const globalAgents = plantRecordedProfiles(tempHome571c, { 'implementer.toml': 'name = "implementer"\n' });
    const emptyProject571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571c-proj-'));
    try {
      let r = runScript(preflightScript,
        ['--project-root', emptyProject571c, '--no-autofix', '--json'],
        { env: env571c });
      let j = JSON.parse(r.stdout);
      assert(r.status === 1 && j.status === 'retired_role_residue',
        '#571 test(c): global residue must refuse even for a clean project, got ' + r.status + '\n' + r.stdout);
      assert(j.residue.length === 1 && j.residue[0].scope === 'global'
        && j.residue_paths.includes(path.join(globalAgents, 'implementer.toml')),
        '#571 test(c): the residue must be attributed to the global scope, got ' + JSON.stringify(j.residue));
      assert(j.repair.includes('node ' + installProfilesScript + ' --global'),
        '#571 test(c): the global repair must be the exact --global installer command, got ' + j.repair);
      // Autofix runs exactly that command; the recorded profile is proven and removed.
      r = runScript(preflightScript, ['--project-root', emptyProject571c, '--json'], { env: env571c });
      j = JSON.parse(r.stdout);
      assert(r.status === 0 && j.status === 'ok' && j.autofixed === true,
        '#571 test(c): autofix must retire the recorded global profile and pass, got ' + r.status + '\n' + r.stdout);
      assert(!fs.existsSync(path.join(globalAgents, 'implementer.toml')) && !fs.existsSync(path.join(globalAgents, MANIFEST_BASENAME)),
        '#571 test(c): the recorded global profile and its record must be gone after autofix');
      assert(!fs.existsSync(path.join(emptyProject571c, '.codex')),
        '#571 test(c): a global repair must not create a project .codex');
    } finally {
      fs.rmSync(emptyProject571c, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571c, { recursive: true, force: true });
  }

  // --- Test (a2): the --global flag targets os.homedir() ---
  const tempHome571flag = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-571flag-home-'));
  try {
    const flagAgents = plantRecordedProfiles(tempHome571flag, { 'implementer.toml': 'name = "implementer"\n' });
    const globalFlagInstall = runInstallProfiles('--global', { HOME: tempHome571flag, USERPROFILE: tempHome571flag });
    assert(fs.existsSync(path.join(tempHome571flag, '.codex', 'hooks.json')),
      '#571 test(a2): --global must install hooks into tempHome/.codex');
    assert(!fs.existsSync(path.join(flagAgents, 'implementer.toml')),
      '#571 test(a2)/#1101: --global must retire the recorded profile in tempHome/.codex/agents/kaola-workflow/');
    assert(globalFlagInstall.stdout.includes(REMOVED_LINE + path.join(flagAgents, 'implementer.toml')),
      '#571 test(a2): the retirement must be reported: ' + globalFlagInstall.stdout);
    assert(!fs.existsSync(path.join(tempHome571flag, '.codex', 'config.toml')),
      '#571 test(a2)/#1101: --global must not write tempHome/.codex/config.toml');
  } finally {
    fs.rmSync(tempHome571flag, { recursive: true, force: true });
  }

  console.log('testCodexPreflight571 (#571 global-scope gate): PASSED');
}

// ---------------------------------------------------------------------------
// #332 AC3-AC6/AC9 → #1101: installer retirement. The installer used to place the shipped roster
// with an ownership record (.kaola-managed-profiles.json) and prune retired or stale-managed files
// through it. It now places nothing, and that record — or a byte-exact released profile or block
// body — is the ONLY proof on which it removes what earlier releases placed:
//   AC3     — a fresh install places no profile, no record, no agents/ dir, and no role roster or
//             pinned subagent model/effort remains to place; stdout still ends `status: ok`;
//   AC4/AC9 — upgrading over a real pre-#1101 install removes every recorded digest-matching
//             profile, the record, and the released registration block, keeping the user's config
//             outside the markers; a retired NAME with unprovable bytes is preserved and reported
//             (#1101 H2 — it used to be pruned by name);
//   AC5     — a second run is stable: nothing more removed, the same file set, the same config bytes;
//   AC6     — a user TOML inside agents/kaola-workflow/ survives and is reported;
//   ghost   — a record-listed file with its recorded digest is removed; one whose bytes changed
//             survives byte-for-byte, reported modified_since_install;
//   future  — a future-schema record proves nothing (#1101 H9): the install no longer refuses (was
//             exit 1 manifest_schema_unsupported), removes nothing, and reports the record.
// ---------------------------------------------------------------------------
function listScopeFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

function testInstallRetiresProvenProfiles332() {
  // --- AC3: fresh install places nothing role-shaped ---
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-fresh-'));
  try {
    const r = runInstallProfiles(fresh);
    assert(!fs.existsSync(path.join(fresh, '.codex', 'agents')),
      '#332 AC3/#1101: a fresh install must place no profile and no ownership record');
    const lastLine = r.stdout.trim().split('\n').pop();
    assert(lastLine === 'status: ok', '#332 AC3: installer stdout must end with `status: ok`, got: ' + lastLine);
    assert(!fs.existsSync(path.join(pluginRoot, 'agents')) && !fs.existsSync(path.join(pluginRoot, 'config', 'agents.toml')),
      '#1101: the plugin must ship no role profiles and no agents.toml registration template');
    const installerExports = require(installProfilesScript);
    const kernel = require(path.join(pluginRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
    assert(!('CODEX_PINNED_ROLES' in installerExports) && !('CODEX_PINNED_MODEL' in kernel) && !('CODEX_PINNED_EFFORT' in kernel),
      '#332 AC3 (#1062) → #1101: no pinned role roster, subagent model, or effort may remain');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // --- AC4 + AC9: upgrade over a real released install ---
  const upgrade = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-upgrade-'));
  try {
    const { agentsDir, configPath } = seedReleasedCodexScope(upgrade);
    const userTable = '[agents.my-reviewer]\ndescription = "user-defined role"\n';
    fs.appendFileSync(configPath, '\n' + userTable);
    const releasedProfiles = listScopeFiles(agentsDir).filter(f => f.endsWith('.toml'));
    assert(releasedProfiles.length === 7, '#332 AC4 fixture: the released install carries seven profiles, got ' + releasedProfiles.length);
    const editedDocsLookup = 'model_reasoning_effort = "medium"\ndeveloper_instructions = """retired role body"""\n';
    fs.writeFileSync(path.join(agentsDir, 'docs-lookup.toml'), editedDocsLookup);

    const r = runInstallProfiles(upgrade);
    assert(r.status === 0, '#332 AC4: upgrade reinstall must exit 0');
    for (const f of releasedProfiles) {
      assert(!fs.existsSync(path.join(agentsDir, f)), '#332 AC4/#1101: recorded released profile ' + f + ' must be removed');
      assert(r.stdout.includes(REMOVED_LINE + path.join(agentsDir, f)), '#332 AC4: stdout must report the removal of ' + f);
    }
    assert(!fs.existsSync(path.join(agentsDir, MANIFEST_BASENAME))
      && r.stdout.includes(REMOVED_RECORD_LINE + path.join(agentsDir, MANIFEST_BASENAME)),
      '#332 AC4/#1101: the ownership record must be removed and reported once it has been used');
    assert(fs.readFileSync(path.join(agentsDir, 'docs-lookup.toml'), 'utf8') === editedDocsLookup
      && r.stdout.includes(PRESERVED_LINE('no_ownership_record') + path.join(agentsDir, 'docs-lookup.toml')),
      '#332 AC4/#1101 H2: an unrecorded, unreleased docs-lookup.toml must be preserved byte-for-byte and reported: ' + r.stdout);
    const cfg = fs.readFileSync(configPath, 'utf8');
    assert(!cfg.includes(BEGIN_AGENTS_MARKER) && !cfg.includes(END_AGENTS_MARKER) && !cfg.includes('config_file = "./agents/kaola-workflow/'),
      '#332 AC9/#1101: the released block must be gone — it registers no role at all, got:\n' + cfg);
    assert(cfg.includes(userTable), '#332 AC9: the user table outside the markers must be kept');
    assert(r.stdout.includes(REMOVED_REGISTRATIONS_LINE + configPath), '#332 AC9: stdout must report the block removal');

    // --- AC5: double-run idempotency ---
    const before = listScopeFiles(agentsDir);
    const r2 = runInstallProfiles(upgrade);
    assert(!r2.stdout.includes('Removed retired'), '#332 AC5: a second run must remove nothing: ' + r2.stdout);
    assert(JSON.stringify(listScopeFiles(agentsDir)) === JSON.stringify(before), '#332 AC5: file set must be stable across reruns');
    assert(fs.readFileSync(configPath, 'utf8') === cfg, '#332 AC5: config bytes must be stable across reruns');
    assert(countOccurrences(cfg, new RegExp(BEGIN_AGENTS_MARKER, 'g')) === 0, '#332 AC5: no managed block');
  } finally {
    fs.rmSync(upgrade, { recursive: true, force: true });
  }

  // --- AC6: unknown user TOML preserved + reported ---
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-custom-'));
  try {
    const agentsDir = path.join(custom, '.codex', 'agents', 'kaola-workflow');
    fs.mkdirSync(agentsDir, { recursive: true });
    const customBytes = 'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n';
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'), customBytes);
    const r = runInstallProfiles(custom);
    assert(fs.readFileSync(path.join(agentsDir, 'my-custom.toml'), 'utf8') === customBytes, '#332 AC6: user TOML must survive install');
    assert(r.stdout.includes(PRESERVED_LINE('no_ownership_record') + path.join(agentsDir, 'my-custom.toml')),
      '#332 AC6: stdout must report the preserved user file: ' + r.stdout);
  } finally {
    fs.rmSync(custom, { recursive: true, force: true });
  }

  // --- stale-managed prune via the record ---
  const ghost = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-ghost-'));
  try {
    const agentsDir = plantRecordedProfiles(ghost, {
      'ghost.toml': 'name = "ghost"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n',
      'foreign-ghost.toml': 'previous managed bytes\n',
    });
    const foreignGhostBytes = Buffer.from('name = "foreign-ghost"\ndeveloper_instructions = """user customized"""\n');
    fs.writeFileSync(path.join(agentsDir, 'foreign-ghost.toml'), foreignGhostBytes);
    const r = runInstallProfiles(ghost);
    assert(!fs.existsSync(path.join(agentsDir, 'ghost.toml')), '#332: record-listed ghost.toml with its recorded digest must be pruned');
    assert(r.stdout.includes(REMOVED_LINE + path.join(agentsDir, 'ghost.toml')), '#332: stdout must report the ghost prune');
    assert(fs.readFileSync(path.join(agentsDir, 'foreign-ghost.toml')).equals(foreignGhostBytes),
      '#332: a record digest mismatch must preserve the customized profile bytes');
    assert(r.stdout.includes(PRESERVED_LINE('modified_since_install') + path.join(agentsDir, 'foreign-ghost.toml')),
      '#332: the preserved digest mismatch must be reported: ' + r.stdout);
  } finally {
    fs.rmSync(ghost, { recursive: true, force: true });
  }

  // --- future record schema: proves nothing, refuses nothing ---
  const future = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-install-future-'));
  try {
    const agentsDir = plantRecordedProfiles(future, { 'implementer.toml': 'name = "implementer"\n' });
    const manifestPath = path.join(agentsDir, MANIFEST_BASENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schema_version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const r = runInstallProfiles(future);
    assert(r.stdout.trim().split('\n').pop() === 'status: ok',
      '#332/#1101 H9: a future record schema must no longer refuse the install (was exit 1 manifest_schema_unsupported)');
    assert(fs.existsSync(manifestPath) && fs.existsSync(path.join(agentsDir, 'implementer.toml')),
      '#332/#1101 H9: a future-schema record proves nothing — the record and the profile it lists must be kept');
    assert(r.stdout.includes(PRESERVED_LINE('unsupported_record') + manifestPath),
      '#332/#1101 H9: the unreadable record must be reported: ' + r.stdout);
  } finally {
    fs.rmSync(future, { recursive: true, force: true });
  }

  console.log('testInstallRetiresProvenProfiles332 (#332 AC3-AC6,AC9 → #1101): PASSED');
}

// ---------------------------------------------------------------------------
// #332 AC7-AC11 → #1101: preflight residue + doctor. The profile freshness contract (exact source
// bytes, required fields, the canonical managed block, the record schema, the plugin-cache profile
// copy) retired with the profiles. What survives:
//   AC7/AC8 — any retired profile or the record in a project's agents/kaola-workflow/ is residue
//             (exit 1) carrying the exact scoped installer command; autofix runs that installer,
//             which removes what the record proves and keeps an edited profile byte-for-byte, so
//             the gate reports it as residue (exit 1, autofix_attempted) until the user deletes it;
//   AC7b    — a recorded docs-lookup.toml is residue and autofix prunes it;
//   AC9     — an unbalanced marker pair: autofix refuses before any write (exit 4 autofix_unsafe),
//             and the doctor reports the scope's managed_block as invalid;
//   AC6     — an unknown user TOML inside agents/kaola-workflow/ keeps status ok;
//   AC10    — doctor: user-scope residue exits 1 with the exact HOME-scoped installer command, the
//             project scope is clean, and the doctor is read-only (the residue is still on disk);
//             that command clears it and the doctor exits 0;
//   AC11    — the plugin-cache profile scope is gone with the profiles; the doctor still reports
//             the plugin identity it runs from and refuses plugin_identity_invalid (exit 2) from a
//             tree with no plugin manifest.
// ---------------------------------------------------------------------------
function testCodexPreflight332() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-preflight-'));
  const scopedRepair = 'node ' + installProfilesScript + ' ' + root;
  try {
    trustCodexProject(kwSandboxHome, root);
    const agentsDir = plantRecordedProfiles(root, {
      'code-reviewer.toml': 'name = "code-reviewer"\ndeveloper_instructions = """Code reviewer. Independently examines"""\n',
      'code-explorer.toml': 'name = "code-explorer"\ndeveloper_instructions = """x"""\n',
    });
    const reviewer = path.join(agentsDir, 'code-reviewer.toml');
    const ce = path.join(agentsDir, 'code-explorer.toml');
    // Exact-byte drift: the reviewer no longer matches its recorded digest.
    const editedReviewer = fs.readFileSync(reviewer, 'utf8').replace(
      'Code reviewer. Independently examines', 'Code reviewer. Modified: independently examines');
    fs.writeFileSync(reviewer, editedReviewer);

    let r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    let j = JSON.parse(r.stdout);
    assert(r.status === 1 && j.status === 'retired_role_residue',
      '#332 AC7/#1101: retired profiles in the project scope must refuse as retired_role_residue (was profiles_stale), got ' + r.status + ' ' + j.status);
    for (const p of [reviewer, ce, path.join(agentsDir, MANIFEST_BASENAME)]) {
      assert(j.residue_paths.includes(p), '#332 AC7: residue_paths must name ' + p + ', got ' + JSON.stringify(j.residue_paths));
    }
    assert(j.repair.includes(scopedRepair),
      '#332 AC7: project repair must carry the exact scoped installer command; got ' + j.repair);

    // AC8: autofix runs that installer: the proven profile and the record go, the edited one stays.
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 1 && j.status === 'retired_role_residue' && j.autofix_attempted === true
      && JSON.stringify(j.residue_paths) === JSON.stringify([reviewer]),
      '#332 AC8/#1101: autofix must remove only what the record proves; the edited profile keeps the gate refusing, got '
      + r.status + ' ' + JSON.stringify(j));
    assert(!fs.existsSync(ce) && !fs.existsSync(path.join(agentsDir, MANIFEST_BASENAME)),
      '#332 AC8: the recorded code-explorer.toml and the record must be removed by autofix');
    assert(fs.readFileSync(reviewer, 'utf8') === editedReviewer,
      '#332 AC8/#1101: the edited profile must survive byte-for-byte (never deleted without proof)');
    fs.unlinkSync(reviewer);   // the user's own review-and-delete, as the repair text says
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 0 && j.status === 'ok', '#332 AC8: with the residue gone the gate must pass, got ' + r.status + '\n' + r.stdout);

    // AC7b: a recorded docs-lookup.toml → residue; autofix prunes it.
    const docsLookup = path.join(plantRecordedProfiles(root, { 'docs-lookup.toml': 'name = "docs-lookup"\n' }), 'docs-lookup.toml');
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 1 && j.residue_paths.includes(docsLookup),
      '#332 AC7b: docs-lookup.toml must be residue, got ' + r.status + ' ' + JSON.stringify(j.residue_paths));
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 0 && j.status === 'ok' && j.autofixed === true, '#332 AC7b: autofix must prune docs-lookup and exit 0 autofixed');
    assert(!fs.existsSync(docsLookup), '#332 AC7b: docs-lookup.toml must be pruned by autofix');

    // AC9: an unbalanced marker pair is a manual repair: autofix refuses before any write.
    const cfgPath = path.join(root, '.codex', 'config.toml');
    const unbalanced = BEGIN_AGENTS_MARKER + '\n[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n';
    fs.writeFileSync(cfgPath, unbalanced);
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 1 && j.residue[0].managed_block === 'invalid' && j.safe_autofix === false,
      '#332 AC9: unbalanced markers must be residue with safe_autofix:false, got ' + r.status + ' ' + JSON.stringify(j.residue));
    r = runScript(preflightScript, ['--project-root', root, '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 4 && j.status === 'autofix_unsafe',
      '#332 AC9: autofix over unbalanced markers must refuse exit 4 autofix_unsafe, got ' + r.status + '/' + j.status);
    assert(fs.readFileSync(cfgPath, 'utf8') === unbalanced, '#332 AC9: the refused autofix must write nothing');
    const doctorResult = runScript(preflightScript, ['--doctor', '--project-root', root, '--json'], {});
    const doctorJson = JSON.parse(doctorResult.stdout);
    const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
    assert(doctorResult.status === 1 && projectScope && projectScope.managed_block === 'invalid'
      && projectScope.residue_paths.includes(cfgPath),
      '#332 AC9: doctor must report the project scope\'s invalid managed block, got ' + JSON.stringify(projectScope));
    fs.writeFileSync(cfgPath, '');

    // AC6: an unknown user TOML inside agents/kaola-workflow/ is not residue. (The autofix above
    // removed the emptied directory.)
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'),
      'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    r = runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json'], {});
    j = JSON.parse(r.stdout);
    assert(r.status === 0 && j.status === 'ok', '#332 AC6: an unknown user TOML must keep status ok, got ' + r.status + '\n' + r.stdout);
    fs.unlinkSync(path.join(agentsDir, 'my-custom.toml'));

    // AC10 + AC11: doctor — user-scope residue, clean project, read-only.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-doctor-home-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-doctor-proj-'));
    try {
      trustCodexProject(home, proj);
      const homeDocsLookup = path.join(plantRecordedProfiles(home, { 'docs-lookup.toml': 'name = "docs-lookup"\n' }), 'docs-lookup.toml');
      r = runScript(preflightScript, ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
      assert(r.status === 1, '#332 AC10: doctor must exit 1 when the user scope holds residue, got ' + r.status);
      j = JSON.parse(r.stdout);
      const userScope = j.scopes.find(s => s.scope === 'user');
      const projScope = j.scopes.find(s => s.scope === 'project');
      assert(userScope.retired_role_residue === true && userScope.residue_paths.includes(homeDocsLookup),
        '#332 AC10: user scope must report docs-lookup, got ' + JSON.stringify(userScope));
      const homeRepair = 'HOME=' + home + ' node ' + installProfilesScript + ' --global';
      assert(typeof userScope.repair === 'string' && userScope.repair.includes(homeRepair),
        '#332 AC10: user scope must carry the exact HOME-scoped installer command; got ' + userScope.repair);
      assert(projScope && projScope.retired_role_residue === false && projScope.residue_paths.length === 0,
        '#332 AC10: project scope must be clean, got ' + JSON.stringify(projScope));
      assert(fs.existsSync(homeDocsLookup), '#332 AC10: the doctor is read-only — it must never remove residue');
      const pluginIdentity = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      assert(j.plugin && j.plugin.name === pluginIdentity.name && j.plugin.version === pluginIdentity.version,
        '#332 AC11: the doctor must report the plugin identity it runs from, got ' + JSON.stringify(j.plugin));

      // The printed repair clears it; both scopes clean → exit 0.
      runInstallProfiles('--global', { HOME: home, USERPROFILE: home });
      r = runScript(preflightScript, ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
      assert(r.status === 0 && !fs.existsSync(homeDocsLookup),
        '#332 AC10: after the repair command the doctor must exit 0, got ' + r.status + '\n' + r.stdout);

      // AC11: a preflight copy with no plugin manifest beside it refuses its identity.
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-332-doctor-bare-'));
      try {
        const bareScripts = path.join(bare, 'scripts');
        fs.mkdirSync(bareScripts);
        for (const f of ['kaola-workflow-codex-preflight.js', 'kaola-workflow-adaptive-schema.js']) {
          fs.copyFileSync(path.join(pluginRoot, 'scripts', f), path.join(bareScripts, f));
        }
        r = runScript(path.join(bareScripts, 'kaola-workflow-codex-preflight.js'),
          ['--doctor', '--home', home, '--project-root', proj, '--json'], {});
        j = JSON.parse(r.stdout);
        assert(r.status === 2 && j.status === 'plugin_identity_invalid',
          '#332 AC11: a doctor with no plugin manifest must refuse exit 2 plugin_identity_invalid, got ' + r.status + '/' + j.status);
      } finally {
        fs.rmSync(bare, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }

    console.log('testCodexPreflight332 (#332 AC7-AC11 → #1101): PASSED');
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

    const acquired = runClaimOnlineAcquire(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
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

    // DELETED with its mechanism: the two M2 (#277) assertions that the codex closure receipt
    // CARRIES claim_planner_attested and that its value is one of missing|attested. claim.js
    // retired the whole producer chain — the --attest-planner-spawn flag, checkDispatchAttestations,
    // persistAttestationToSummary and the receipt field — and the codex edition runs the
    // byte-identical claim.js, so there is no producer to pin. Asserting the field is PRESENT is
    // now asserting the retirement did not happen.
    //
    // What survives is the direction a live mechanism can still regress in — neither retired field
    // may REAPPEAR — plus the half of the warn-first contract that never depended on attestation: a
    // codex finalize with no dispatch-log at all still closes with closure_invariants.ok.
    seedAdaptiveFinalizeFixture(tmp, 'issue-163');
    plantRoadmap(tmp, 163, '');
    const finalizeResult = runClaim(['finalize', '--project', 'issue-163'], tmp);
    assert(finalizeResult.status === 'closed', 'Codex finalize must return status:closed');
    assert(
      finalizeResult.closure_receipt && !('claim_planner_attested' in finalizeResult.closure_receipt),
      'Codex closure_receipt must NOT carry the retired planner attestation field, got: ' +
      JSON.stringify(finalizeResult.closure_receipt && Object.keys(finalizeResult.closure_receipt))
    );
    assert(
      finalizeResult.closure_receipt && !('finalize_contractor_attested' in finalizeResult.closure_receipt),
      '#816: Codex closure_receipt must NOT carry a retired finalize-seam attestation field'
    );
    assert(
      finalizeResult.closure_invariants && finalizeResult.closure_invariants.ok === true,
      'Codex closure_invariants.ok must be true with no dispatch-log present'
    );

    const skill = fs.readFileSync(nextSkill, 'utf8');
    assert(skill.includes('active folders'), 'next skill should route via active folders');
    assert(!skill.includes(['verify', 'startup'].join('-')), 'next skill should not require startup verifier');
    assert(!skill.includes(['can', 'hand' + 'off'].join('-')), 'next skill should not describe old transfer flow');

    const validator = path.join(repoRoot, 'scripts', 'validate-kaola-workflow-contracts.js');
    assert(fs.existsSync(validator), 'Codex contract validator must exist');

    testInstallerWritesNoCodexConfig();
    testInstallRetiresProvenProfiles332();
    testCodexPreflight266();
    testCodexDispatchPosture598();
    testCodexMultiAgentV2Bounds611();
    testCodexPreflight571();
    testCodexPreflight332();
    testAC1HooksJson();
    testUpdateHooksHardening325();
    test409StableHomeSurvivesDirDeletion();   // #409
    testCodexFinalizeArchivesClaimFacts333();
    testSelectionEvidenceDockingCodex();
    testKeepOpenArchiveStamp333();   // #333
    testAC2StaticCompactPrompt();
    testCodexFinalizeArchiveVerifiesBeforeDelete();  // #426
    testCodexFinalizeClosesIssueBundleMembers();      // #427
    testCodexBundleFinalizeAllOpenCloseIsPending();   // #508
    // testCodexFinalizeRoadmapResidueDetection() DELETED (#428) — see comment at its former definition site.

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

// DELETED: testCodexFinalizeRoadmapResidueDetection (#428). Its entire premise was the
// dual-root roadmap receipt (roadmap_removed / roadmap_removed_by_root) and .roadmap/issue-N.md
// source removal on finalize — ADR 0018 §5 retires both with the roadmap.js mirror itself; no
// producer emits either field or removes a roadmap source anymore. Nothing else in the scenario
// (a plain single-issue finalize to closed) survives it as a distinct case — that path is already
// covered by testCodexFinalizeNeutralizesArchivedResume333 and the bundle finalize tests above.


main();
