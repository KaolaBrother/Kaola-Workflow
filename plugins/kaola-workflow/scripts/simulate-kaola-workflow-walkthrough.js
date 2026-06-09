#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

function runInstallProfiles(target) {
  const result = spawnSync(process.execPath, [installProfilesScript, target], {
    cwd: repoRoot,
    encoding: 'utf8'
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
function testAC1HooksJson() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-hooks-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-hooks-existing-'));
  try {
    // Install once to the fresh dir and capture stdout.
    const freshResult = runInstallProfiles(fresh);

    // AC1: trust-step line must be present in install stdout.
    // RED (transient demonstration): assert it does NOT exist in an empty string — that fails.
    // GREEN: assert it IS present in the real output.
    assert(freshResult.stdout.includes('/hooks'),
      'AC1: install stdout must contain the /hooks trust-step line');

    const hooksPath = path.join(fresh, '.codex', 'hooks.json');
    assert(fs.existsSync(hooksPath), 'AC1: hooks.json must exist after fresh install');

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
    const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStart'];
    for (const event of EVENTS) {
      const entries = (parsed.hooks || {})[event];
      assert(Array.isArray(entries) && entries.length > 0,
        'AC1: hooks.json must have entries for event ' + event);
      const managed = entries.filter(e => e.id && e.id.startsWith('kaola-workflow:'));
      assert(managed.length >= 1,
        'AC1: event ' + event + ' must have at least one kaola-workflow: managed entry');
    }

    // AC1: SessionStart entry with matcher "compact" must reference the compact-resume script.
    const sessionStart = (parsed.hooks || {}).SessionStart || [];
    const compactEntry = sessionStart.find(e => e.matcher === 'compact');
    assert(compactEntry !== undefined,
      'AC1: SessionStart must have an entry with matcher "compact"');
    const compactCmd = compactEntry.hooks && compactEntry.hooks[0] && compactEntry.hooks[0].command;
    assert(typeof compactCmd === 'string' && compactCmd.includes('kaola-workflow-codex-compact-resume.js'),
      'AC1: SessionStart compact entry command must reference kaola-workflow-codex-compact-resume.js, got: ' + compactCmd);

    // AC1 idempotency: seed a user-owned entry in SessionStart, then install a second time.
    // Existing target starts from a copy of the fresh install.
    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    // First install.
    runInstallProfiles(existing);
    const afterFirst = JSON.parse(fs.readFileSync(path.join(existing, '.codex', 'hooks.json'), 'utf8'));
    // Seed a user entry (non-kaola id) into the SessionStart event.
    const USER_ENTRY = { id: 'user-custom-session-hook', matcher: '*', hooks: [{ type: 'command', command: 'echo user-custom' }] };
    afterFirst.hooks.SessionStart = (afterFirst.hooks.SessionStart || []).concat([USER_ENTRY]);
    fs.writeFileSync(path.join(existing, '.codex', 'hooks.json'), JSON.stringify(afterFirst, null, 2) + '\n');
    // Second install.
    runInstallProfiles(existing);
    const afterSecond = JSON.parse(fs.readFileSync(path.join(existing, '.codex', 'hooks.json'), 'utf8'));
    // Assert exactly ONE managed entry per event (no duplicates).
    for (const event of EVENTS) {
      const entries = (afterSecond.hooks || {})[event] || [];
      const managedCount = entries.filter(e => e.id && e.id.startsWith('kaola-workflow:')).length;
      assert(managedCount === 1,
        'AC1 idempotency: event ' + event + ' must have exactly 1 kaola-workflow: entry after 2nd install, got ' + managedCount);
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
  }
}

// AC3 (#284): positive attestation — seeded dispatch-log → 'attested' on both fields.
// Demonstrates RED (no-seed → 'missing') is already proven by the existing main() test;
// this function proves GREEN (seeded → 'attested').
function testAC3AttestationSeeded() {
  // Use an isolated tmp to avoid touching the live kaola-workflow folder.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-284-attest-'));
  try {
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

    console.log('testAC3AttestationSeeded (#284 AC3): PASSED');
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

// #325: updateHooks() hardening — R1 (metacharacter pluginRoot can't break JSON), R2 ($schema carry
// on fresh install, existing wins), R3 (sweep ALL events for orphaned kaola-workflow: entries).
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

  // R2: a fresh install carries the managed $schema; an existing user $schema still wins.
  assert(mergeHooks({ hooks: {} }, built).$schema === built.$schema, '#325 R2: fresh install carries the template $schema');
  assert(mergeHooks({ $schema: 'user-schema', hooks: {} }, built).$schema === 'user-schema', '#325 R2: existing user $schema wins');

  // R3: a re-install after the managed-event set shrinks leaves no orphaned kaola-workflow: entry,
  // while preserving non-managed entries under that event.
  const shrunk = { $schema: built.$schema, hooks: { SessionStart: built.hooks.SessionStart } }; // PostToolUse no longer managed
  const existingOrphan = { hooks: { PostToolUse: [{ id: 'kaola-workflow:phantom-advisor', matcher: 'Write' }, { id: 'user:keep', matcher: 'Edit' }] } };
  const swept = mergeHooks(existingOrphan, shrunk);
  const post = swept.hooks.PostToolUse || [];
  assert(!post.some(e => e.id && e.id.startsWith('kaola-workflow:')), '#325 R3: orphaned kaola-workflow: entry under a now-unmanaged event is swept');
  assert(post.some(e => e.id === 'user:keep'), '#325 R3: non-managed user entry under that event is preserved');

  // R2 black-box: a fresh install writes .codex/hooks.json carrying $schema.
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-325-schema-'));
  try {
    runInstallProfiles(freshDir);
    const installed = JSON.parse(fs.readFileSync(path.join(freshDir, '.codex', 'hooks.json'), 'utf8'));
    assert(typeof installed.$schema === 'string' && installed.$schema.length > 0, '#325 R2 (black-box): fresh-install hooks.json carries $schema');
  } finally {
    fs.rmSync(freshDir, { recursive: true, force: true });
  }
  console.log('testUpdateHooksHardening325: PASSED');
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
function runVal(args, cwd) { return spawnSync(process.execPath, [codexValidator, ...args], { cwd, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } }); }
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
      fs.writeFileSync(planPath, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | Dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
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
  console.log('Codex adaptive #238/#239 coverage: PASSED');
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
  // Build a fully-installed fixture to start from
  const root266 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-266-preflight-'));
  try {
    // Install all 13 profiles into the fixture
    const installResult = spawnSync(process.execPath, [installProfilesScript, root266], {
      cwd: repoRoot, encoding: 'utf8'
    });
    if (installResult.error) throw installResult.error;
    assert(installResult.status === 0, 'preflight fixture install failed: ' + installResult.stderr);

    // --- GREEN: fresh fixture must pass preflight ---
    const freshResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], {});
    assert(freshResult.status === 0,
      '#266 case1 RED-discriminator: fresh fixture must exit 0, got ' + freshResult.status + '\n' + freshResult.stdout);
    const freshJson = JSON.parse(freshResult.stdout);
    assert(freshJson.status === 'ok',
      '#266 case1 RED-discriminator: fresh fixture must return status:ok, got ' + freshJson.status);

    // --- Case 1 RED: corrupt the managed block (remove a role entry) → config_stale ---
    const configPath = path.join(root266, '.codex', 'config.toml');
    const origConfig = fs.readFileSync(configPath, 'utf8');
    // Replace [agents.workflow-planner] inside the block — makes that role missing from block
    const staleConfig = origConfig.replace('[agents.workflow-planner]', '[agents.STALE-workflow-planner]');
    fs.writeFileSync(configPath, staleConfig);

    const staleResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], {});
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
        ['--project-root', autofixRoot, '--json'], {});
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
      ['--project-root', root266, '--no-autofix', '--json'], {});
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
      ['--project-root', root266, '--no-autofix', '--json'], {});
    assert(restoredResult.status === 0,
      '#266 case2 GREEN: restored fixture must pass, got ' + restoredResult.status);

    // --- Case 5 RED: absent profile → preflight REFUSES, stdout must NOT contain subagent-invoked or local-fallback ---
    fs.unlinkSync(wpToml);
    const refusalResult = runScript(preflightScript,
      ['--project-root', root266, '--no-autofix', '--json'], {});
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
    testCodexAdaptiveCuratedAndBarrier();
    testCodexPreflight266();
    testCodexTaskMirror266();
    testCodexCompactResume266();
    testAC1HooksJson();
    testUpdateHooksHardening325();
    testAC3AttestationSeeded();
    testAC2CompactPlainStdout();
    testAC4SubagentDispatchLog();

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
