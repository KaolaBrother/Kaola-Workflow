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
try { require('./test-spawn-census').install('simulate-gitea-workflow-walkthrough'); } catch (_) { /* advisory only */ }

const { execFileSync } = require('child_process');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..', '..');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned;
// point HOME at a throwaway sandbox so no subprocess reads or writes the developer's real one.
// Nothing is seeded there: an absent config is the shape a fresh machine has.
// Also seed a .gitconfig with init.defaultBranch=main so git init creates 'main' (matching the
// finalize gate's `git diff main...HEAD` attribution sweep), independently of the dev machine's
// global gitconfig (which is no longer inherited once we override HOME).
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-sandbox-home-'));
fs.writeFileSync(
  path.join(kwSandboxHome, '.gitconfig'),
  '[init]\n\tdefaultBranch = main\n[user]\n\temail = test@example.com\n\tname = Test User\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const sinkPr = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr'));
const claimScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js');

// A run folder that is FINALIZE-READY and carries no plan. Everything this used to seed — a
// frozen `## Nodes` table, a `## Node Ledger`, a compliance table, a plan_hash bound into the
// state, a derived task mirror — existed for two doors that are gone: the
// `adaptive_plan_missing` refusal and the declared-write-set attribution sweep. What finalize
// still measures is the validation record, and it must be BOUND to the tree, so the hash comes
// from the same kernel function the door recomputes with.
//
// `writeSet` is retained and deliberately unused: it names the production paths each fixture
// commits, which is still the clearest local documentation of what the branch carries.
function seedAdaptiveFinalizeFixture(fixtureRoot, project, writeSet) {   // eslint-disable-line no-unused-vars
  const dir = path.join(fixtureRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js'));
  let cand = '';
  try { cand = schema.computeCodeTreeHash(fixtureRoot, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (err) {
    process.stderr.write('\n--- CHILD FAILURE: ' + script + ' ---\n');
    const out = tail30(err.stdout);
    if (out.trim()) process.stderr.write('stdout (last 30 lines):\n' + out + '\n');
    const errOut = tail30(err.stderr);
    if (errOut.trim()) process.stderr.write('stderr (last 30 lines):\n' + errOut + '\n');
    process.stderr.write('--- END CHILD OUTPUT ---\n');
    throw err;
  }
}

function testFallbackGuardsAfterArchive() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: pr\n');
    fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'),
      '# Finalization Summary\n## Final Validation\nFinal Validation: pass\n');

    // Simulate cmdFinalize: archive the project dir
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive'), { recursive: true });
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'fb-project');
    fs.renameSync(liveDir, archiveDest);

    // #394: snapshot the summary BEFORE the chain (the state file is now LEGITIMATELY mutated by
    // sink-fallback — it records the fallback in the archive so the chain has a home).
    const summarySnapshot = fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8');

    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated.
    // #394: it now writes a fallback receipt to the ARCHIVE .cache (was "skipping receipt write").
    const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
    assert(fs.existsSync(path.join(archiveDest, '.cache', 'sink-fallback.json')),
      '#394: sink-merge writes the fallback receipt to the archive .cache');

    // Step 1: cmdSinkFallback — #394: archived project now OPERATES on the archived state (records
    // the fallback there) instead of the old no-op. Returns updated:true + archived:true.
    const fbResult = spawnSync(process.execPath,
      [claimScript, 'sink-fallback', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(fbResult.status, 0, 'sink-fallback should exit 0 on archived project');
    const fbParsed = JSON.parse(fbResult.stdout);
    assert.strictEqual(fbParsed.updated, true, '#394: sink-fallback now updates the archived state');
    assert.strictEqual(fbParsed.archived, true, '#394: sink-fallback reports it operated on the archive');
    assert.strictEqual(fbParsed.sink, 'pr', '#394: sink recorded as pr in the archived state');
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated by sink-fallback');
    // #394: the archived state still reads sink: pr (the sink line is rewritten on the archived copy).
    const archivedStateAfter = fs.readFileSync(path.join(archiveDest, 'workflow-state.md'), 'utf8');
    assert(/^sink: pr$/m.test(archivedStateAfter), '#394: the archived state keeps sink: pr after the fallback rewrite');

    // Step 2: appendSummary on the (absent) LIVE path — should return false, not recreate dir.
    const summaryFile = path.join(tmpRoot, 'kaola-workflow', 'fb-project', 'finalization-summary.md');
    const appendResult = sinkPr.appendSummary(summaryFile, 'https://gitea.example/repo/pulls/99', 99);
    assert.strictEqual(appendResult, false, 'appendSummary should return false on absent live dir');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'fb-project')),
      'appendSummary must not recreate live dir');

    // Step 3: the archived SUMMARY stays byte-unchanged (only workflow-state.md is the #394 target).
    assert.strictEqual(fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8'), summarySnapshot,
      'archive finalization-summary.md must be unchanged');

    console.log('testFallbackGuardsAfterArchive: PASSED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

testFallbackGuardsAfterArchive();

function _initGitRepo(root) {
  let r = G.git(root, ['init'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  G.git(root, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  G.git(root, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  r = G.git(root, ['add', 'README.md'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  r = G.git(root, ['commit', '-m', 'init'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
}

function _writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function _teaMockEnv(binDir) {
  const jsPath = path.join(binDir, 'tea.js');
  return fs.existsSync(jsPath) ? { KAOLA_TEA_MOCK_SCRIPT: jsPath } : {};
}

function _runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKFLOW_OFFLINE: '0',
      ..._teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function testAuditAndRepairLabels() {
  // (a) audit-labels: lists stale issues without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-audit-labels-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['audit-labels'], tmp, binDir);
      assert(
        Array.isArray(result.stale) && result.stale.length === 1,
        'audit-labels must return stale array of length 1, got: ' + JSON.stringify(result.stale)
      );
      assert(
        result.count === 1,
        'audit-labels must return count:1, got: ' + result.count
      );
      assert(
        !fs.existsSync(marker),
        'audit-labels must NOT call --remove-labels (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (b) repair-labels dry-run (no --execute): reports would_remove without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-labels-dry-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['repair-labels'], tmp, binDir);
      assert(
        result.dry_run === true,
        'repair-labels without --execute must return dry_run:true, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.would_remove) && result.would_remove.length === 1,
        'repair-labels dry-run must return would_remove with 1 entry, got: ' + JSON.stringify(result.would_remove)
      );
      assert(
        !fs.existsSync(marker),
        'repair-labels dry-run must NOT call --remove-labels (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (c) repair-labels --execute: removes the label and returns removed list
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-labels-exec-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else if (a.includes('repo view')) {",
        "  process.stdout.write('{\"full_name\":\"owner/repo\",\"html_url\":\"http://x\"}\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['repair-labels', '--execute'], tmp, binDir);
      assert(
        result.dry_run === false,
        'repair-labels --execute must return dry_run:false, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.removed) && result.removed.includes(99),
        'repair-labels --execute must return removed containing 99, got: ' + JSON.stringify(result.removed)
      );
      assert(
        fs.existsSync(marker),
        'repair-labels --execute must call --remove-labels (marker must exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('testAuditAndRepairLabels: PASSED');
}

testAuditAndRepairLabels();


// issue #283: sink-pr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkPrUsesFinalizationSummary() {
  const sinkPrScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-sink-pr-fin-'));
  try {
    G.exec(tmp, ['init', '-b', 'main'], { encoding: 'utf8' });
    G.exec(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8', stdio: 'pipe' });
    G.exec(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8', stdio: 'pipe' });
    const kwDir = path.join(tmp, 'kaola-workflow', 'issue-2830');
    fs.mkdirSync(kwDir, { recursive: true });
    fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '## Project',
      'name: issue-2830',
      'status: active',
      '## Sink',
      'branch: workflow/issue-2830',
      'issue_number: 2830',
      'sink: pr',
      ''
    ].join('\n'));
    // Plant finalization-summary.md (the new canonical file)
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    G.exec(tmp, ['add', '-A'], { encoding: 'utf8', stdio: 'pipe' });
    G.exec(tmp, ['commit', '-m', 'initial'], { encoding: 'utf8', stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      sinkPrScript,
      '--branch', 'workflow/issue-2830',
      '--project', 'issue-2830',
      '--issue', '2830'
    ], {
      cwd: tmp,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0,
      'sink-pr (finalization-summary) offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);

    // finalization-summary.md must exist and contain PR URL
    const finSummaryPath = path.join(kwDir, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'sink-pr must write to finalization-summary.md, not phase6-summary.md');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(finContent.includes('PR URL:'),
      'finalization-summary.md must contain PR URL after sink-pr, got: ' + finContent);

    // phase6-summary.md must NOT be created
    assert.ok(!fs.existsSync(path.join(kwDir, 'phase6-summary.md')),
      'sink-pr must NOT create phase6-summary.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testSinkPrUsesFinalizationSummary: PASSED');
}

testSinkPrUsesFinalizationSummary();



// ===========================================================================
// issue #342: bundle-lane E2E behavioral coverage for the Gitea edition.
// Mirrors the six root scenarios (simulate-workflow-walkthrough.js §#328) modulo
// forge nouns, driving the REAL gitea edition CLIs via subprocess (no direct-call
// shims — the #292 io-shim lesson). Reuses the existing _initGitRepo helper. Each
// scenario uses its own mkdtempSync root + try/finally cleanup. Forbidden-token
// discipline: the GitLab-CLI binary token must never appear here (the gitea
// validator scans this file); we use tea.js / tea-calls.log.
// ===========================================================================

function gtPlantRoadmapIssue(tmp, n) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + n + '.md'),
    ['issue: #' + n, 'title: bundle test issue ' + n, 'status: open',
     'workflow_project: —', 'next_step: ready', ''].join('\n'));
}

function gtWriteProject(tmp, project, files) {
  const dir = path.join(tmp, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

// Mirrors the root writeBundleGhMockScript with tea arg shapes (kaola-gitea-forge.js).
// opts: { logFile, openIssues: number[], closedIssues: number[] }
function writeBundleTeaMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const openIssues = opts && opts.openIssues ? JSON.stringify(opts.openIssues) : '[]';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const openIssues = new Set(' + openIssues + '.map(String));',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'function log(msg) { if (!logFile) return; try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
    // repo view → gitea project shape (full_name feeds discoverProject early-return + comment URLs).
    // Required before any label call: addBundleLabel calls discoverProjectSafe() FIRST.
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({full_name:"owner/repo",html_url:"http://gt.invalid/owner/repo"}) + "\\n"); process.exit(0); }',
    'const viewM = a.match(/issues view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  const state = closedIssues.has(n) ? "closed" : "open";',
    '  process.stdout.write(JSON.stringify({number:parseInt(n),state,title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("issues edit") && a.includes("--add-labels")) { const m = a.match(/issues edit (\\d+)/); log("label-added:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("issues edit") && a.includes("--remove-labels")) { const m = a.match(/issues edit (\\d+)/); log("label-removed:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    // POST/DELETE must precede the GET /comments check (all three contain /comments).
    'if (a.includes("-X POST") && a.includes("/comments")) { log("comment:"); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("-X DELETE")) { process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("/comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("issues list")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'process.stdout.write("{}\\n"); process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'tea.js'), script);
}

// Online runner mirroring the root walkthrough's pattern: spawn the real edition CLI with
// KAOLA_TEA_MOCK_SCRIPT routed at the mock and adaptive switch ON. Returns the full spawnSync
// result so refusal scenarios can assert a non-zero exit (unlike _runClaimOnline which asserts 0).
function gtSpawnBundle(args, cwd, binDir, extraEnv) {
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js'),
    }, extraEnv || {})
  });
}

function gtLastJson(stdout) {
  const lines = (stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  assert(lines.length > 0, 'expected a JSON object line, got: ' + stdout);
  return JSON.parse(lines[lines.length - 1]);
}

// S1: explicit bundle claim creates exactly ONE active folder + the three additive
// bundle fields in workflow-state.md. AC#2 + AC#3 E2E guard.
function testGiteaBundleClaimCreatesOneFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-claim-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'tea-calls.log');
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    writeBundleTeaMockScript(binDir, { logFile, openIssues: [42, 47, 53] });

    const result = gtSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 0,
      'gitea #342 S1: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitea #342 S1: claim must be acquired, got ' + JSON.stringify(out.claim));
    assert.strictEqual(out.bundle_id, 'bundle-42-47-53', 'gitea #342 S1: bundle_id must be bundle-42-47-53, got ' + JSON.stringify(out.bundle_id));
    assert.ok(Array.isArray(out.issue_numbers) && out.issue_numbers.length === 3,
      'gitea #342 S1: issue_numbers must have 3 members, got ' + JSON.stringify(out.issue_numbers));

    const kwDir = path.join(tmp, 'kaola-workflow');
    const projects = fs.readdirSync(kwDir).filter(n => !n.startsWith('.') && n !== 'archive' && n !== 'ROADMAP.md');
    assert.ok(projects.length === 1 && projects[0] === 'bundle-42-47-53',
      'gitea #342 S1: exactly one active folder (bundle-42-47-53) expected, got ' + projects.join(','));

    const state = fs.readFileSync(path.join(kwDir, 'bundle-42-47-53', 'workflow-state.md'), 'utf8');
    assert.ok(/^issue_number:\s*42\s*$/m.test(state), 'gitea #342 S1: state must have issue_number: 42 (primary)');
    assert.ok(/^issue_numbers:\s*42,47,53\s*$/m.test(state), 'gitea #342 S1: state must have issue_numbers: 42,47,53');
    assert.ok(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state), 'gitea #342 S1: state must have bundle_id: bundle-42-47-53');
    assert.ok(/^closure_policy:\s*all_or_nothing\s*$/m.test(state), 'gitea #342 S1: state must have closure_policy: all_or_nothing');
    assert.ok(!/^closure_policy:/m.test(state.replace(/^closure_policy:\s*all_or_nothing\s*$/m, '')),
      'gitea #342 S1: closure_policy must appear exactly once');
    assert.ok(/^branch:\s*workflow\/gitea-bundle-42-47-53\s*$/m.test(state),
      'gitea #342 S1: state must have branch: workflow/gitea-bundle-42-47-53');

    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const added = calls.filter(c => c.startsWith('label-added:'));
    assert.ok(added.includes('label-added:42'), 'gitea #342 S1: label added for member 42');
    assert.ok(added.includes('label-added:47'), 'gitea #342 S1: label added for member 47');
    assert.ok(added.includes('label-added:53'), 'gitea #342 S1: label added for member 53');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleClaimCreatesOneFolder: PASSED');
}

// DELETED: testGiteaPlannerAttestBackfill. It drove a bundle startup WITH --attest-planner-spawn
// and asserted the back-fill wrote a workflow-planner entry into dispatch-log.jsonl. The mandatory
// planner agent is gone and inline authoring is the design, so the gitea claim port retired the
// whole producer chain with its canonical original — the flag parse, the back-fill writer, the
// checkDispatchAttestations probe and the claim_planner_attested field. Nothing else shared the
// fixture: the bundle claim itself is covered by testGiteaBundleClaimCreatesOneFolder above, on the
// identical fixture minus the flag, so nothing is lost by deleting the whole scenario.

// CONVERTED (was testGiteaAttestationWarningPersistence, the n6/#653 port): it seeded a role-only
// dispatch-log and asserted the ATTESTATION WARNING landed verbatim in the archived
// finalization-summary.md and the workflow-state.md ## Closure block. Every producer in that chain
// is retired — the gitea claim port dropped checkDispatchAttestations, persistAttestationToSummary
// and the claim_planner_attested field with their canonical originals — so asserting the field is
// PRESENT is now asserting the retirement did not happen. Root's twin was DELETED outright; this
// scenario stays alive because it is also this suite's closure-persistence exercise: finalize still
// archives, the summary is still written, the ## Closure block still lands. Only the attestation
// expectations flip, into the reappearance guards below — the direction a retirement can actually
// regress in.
function testGiteaClosurePersistence() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-653-closure-')));
  try {
    _initGitRepo(tmp);
    const project = 'issue-653gt';
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Sink', 'branch: workflow/' + project, 'issue_number: 653101', 'sink: pr', ''
      ].join('\n')
    });
    gtPlantRoadmapIssue(tmp, 653101);
    // This fixture jumps directly from claim state to finalize and intentionally
    // does not author an adaptive plan.
    seedAdaptiveFinalizeFixture(tmp, project);
    // DELETED with its mechanism: the role-only dispatch-log seeding. It existed solely so the
    // retired checkDispatchAttestations probe would find no workflow-planner entry and raise the
    // warning; no consumer reads the log on this path any more, so seeding it would be fixture
    // dressing for nobody.

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0,
      'gitea closure persistence: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitea closure persistence: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed', 'gitea closure persistence: status must be closed, got ' + JSON.stringify(out.status));
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitea closure persistence: closure_receipt must be present');
    // DELETED: the `claim_planner_attested === 'missing'` pin. Nothing writes the field, so nothing
    // can assert it. Kept, and now the whole of what this stanza measures: neither retired
    // attestation field may REAPPEAR on any of the three persistence surfaces.
    assert.ok(!('claim_planner_attested' in receipt),
      'gitea closure persistence: the retired planner attestation field must not reappear on the closure receipt, got ' + JSON.stringify(Object.keys(receipt)));
    assert.ok(!('finalize_contractor_attested' in receipt),
      'gitea closure persistence: the retired finalize-seam attestation field must not reappear on the closure receipt, got ' + JSON.stringify(Object.keys(receipt)));

    assert.ok(out.dest && fs.existsSync(out.dest), 'gitea closure persistence: archive dest must exist');
    const finSummaryPath = path.join(out.dest, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'gitea closure persistence: archived finalization-summary.md must exist');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(!/^claim_planner_attested:/m.test(finContent),
      'gitea closure persistence: finalization-summary.md must not carry the retired claim_planner_attested field, got: ' + finContent);
    assert.ok(!/^## Attestation$/m.test(finContent),
      'gitea closure persistence: finalization-summary.md must not carry a retired ## Attestation block, got: ' + finContent);

    const stateContent = fs.readFileSync(path.join(out.dest, 'workflow-state.md'), 'utf8');
    assert.ok(/^## Closure$/m.test(stateContent),
      'gitea closure persistence: archived workflow-state.md must carry ## Closure');
    assert.ok(!/^claim_planner_attested:/m.test(stateContent),
      'gitea closure persistence: archived workflow-state.md ## Closure block must not carry the retired claim_planner_attested field, got: ' + stateContent);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaClosurePersistence: PASSED');
}

// n6 (#653 finding D3, gitea port): a selection-evidence.md docked pre-finalize (simulating the
// router's D2 docking) must be probed into closure_receipt.selection_evidence ('present'), and
// survive archival; a claim with no docked file reads 'absent'. Mirrors root's
// testSelectionEvidenceDocking modulo forge nouns.
function testGiteaSelectionEvidenceDocking() {
  const tmpPresent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-653-selev-present-')));
  const tmpAbsent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-653-selev-absent-')));
  try {
    for (const entry of [{ tmp: tmpPresent, seed: true, issue: 653201 }, { tmp: tmpAbsent, seed: false, issue: 653202 }]) {
      const { tmp, seed, issue } = entry;
      _initGitRepo(tmp);
      const project = 'issue-' + issue + 'gt';
      gtWriteProject(tmp, project, {
        'workflow-state.md': [
          '# Kaola-Workflow State', '',
          '## Project', 'name: ' + project, 'status: active', '',
          '## Sink', 'branch: workflow/' + project, 'issue_number: ' + issue, 'sink: pr', ''
        ].join('\n')
      });
      gtPlantRoadmapIssue(tmp, issue);
      seedAdaptiveFinalizeFixture(tmp, project);
      if (seed) {
        const cacheDir = path.join(tmp, 'kaola-workflow', project, '.cache');
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'selection-evidence.md'),
          'selection_mode: single-issue\n\n```json\n{"recommended_bundle":{"primary_issue":' + issue + ',"issues":[' + issue + '],"confidence":"low"}}\n```\n');
      }

      const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
        cwd: tmp, encoding: 'utf8', timeout: 60000,
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
      });
      assert.strictEqual(result.status, 0,
        'gitea #653 selection-evidence docking: exit 0 expected (seed=' + seed + '), got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      assert.ok(lines.length > 0, 'gitea #653 selection-evidence docking: expected JSON output (seed=' + seed + ')');
      const out = JSON.parse(lines[lines.length - 1]);
      assert.strictEqual(out.status, 'closed', 'gitea #653 selection-evidence docking: status must be closed (seed=' + seed + ')');
      const receipt = out.closure_receipt;
      assert.ok(receipt != null, 'gitea #653 selection-evidence docking: closure_receipt must be present (seed=' + seed + ')');
      assert.strictEqual(receipt.selection_evidence, seed ? 'present' : 'absent',
        'gitea #653 selection-evidence docking: selection_evidence must be ' + (seed ? 'present' : 'absent') +
        ' (seed=' + seed + '), got ' + JSON.stringify(receipt.selection_evidence));

      if (seed) {
        assert.ok(out.dest && fs.existsSync(out.dest), 'gitea #653 selection-evidence docking: archive dest must exist');
        assert.ok(fs.existsSync(path.join(out.dest, '.cache', 'selection-evidence.md')),
          'gitea #653 selection-evidence docking: selection-evidence.md must survive under the archived .cache/');
      }
    }
  } finally {
    fs.rmSync(tmpPresent, { recursive: true, force: true });
    fs.rmSync(tmpAbsent, { recursive: true, force: true });
  }
  console.log('testGiteaSelectionEvidenceDocking: PASSED');
}

// S2: a refused bundle claim (closed member #47) leaves NO active folder and applies
// ZERO labels (pre-mutation refusal). AC#5 + AC#6 guard.
function testGiteaBundleRefusalLeavesNoFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-refuse-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'tea-calls.log');
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    writeBundleTeaMockScript(binDir, { logFile, openIssues: [42, 53], closedIssues: [47] });

    const result = gtSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 1,
      'gitea #342 S2: exit 1 expected for closed member, got ' + result.status + '\nstdout: ' + result.stdout);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.status, 'target_set_has_closed_issue',
      'gitea #342 S2: status must be target_set_has_closed_issue, got ' + JSON.stringify(out.status));
    assert.strictEqual(out.issue, 47, 'gitea #342 S2: refused on issue 47, got ' + JSON.stringify(out.issue));

    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'bundle-42-47-53')),
      'gitea #342 S2: no bundle-42-47-53 folder must exist after refusal');
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert.strictEqual(labelsAdded.length, 0,
      'gitea #342 S2: no labels must be applied after pre-mutation refusal, got: ' + labelsAdded.join(', '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleRefusalLeavesNoFolder: PASSED');
}

// S3: a live bundle [42,47,53] blocks (a) a direct single-issue claim of member 47 and
// (b) an overlapping bundle claim [47,77]. Offline. AC#8 duplicate-block guard.
function testGiteaBundleDuplicateIssueBlocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-dup-')));
  try {
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 77);
    gtWriteProject(tmp, 'bundle-42-47-53', {
      'workflow-state.md': [
        'name: bundle-42-47-53', 'status: active', 'phase: adaptive',
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: bundle-42-47-53', 'closure_policy: all_or_nothing',
        'branch: workflow/gitea-bundle-42-47-53', 'sink: merge', ''
      ].join('\n')
    });

    const offlineEnv = { KAOLA_WORKFLOW_OFFLINE: '1' };
    const r1 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '47'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    const o1 = JSON.parse(r1.stdout);
    assert.ok(o1.claim === 'owned' || o1.claim === 'none',
      'gitea #342 S3 (a): claim must be owned or none for live bundle member 47, got ' + JSON.stringify(o1.claim));
    if (o1.claim === 'owned') {
      assert.strictEqual(o1.project, 'bundle-42-47-53',
        'gitea #342 S3 (a): owned claim must resolve to bundle-42-47-53, got ' + JSON.stringify(o1.project));
    }

    const r2 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issues', '47,77', '--workflow-path', 'adaptive'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    assert.strictEqual(r2.status, 1,
      'gitea #342 S3 (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert.strictEqual(o2.status, 'target_set_conflicts_active_work',
      'gitea #342 S3 (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleDuplicateIssueBlocking: PASSED');
}


// S5: finalize on a bundle project removes ALL member .roadmap/issue-N.md files, regenerates
// the mirror once, archives ONE folder, and the closure receipt carries the bundle fields.
// THIS IS THE SCENARIO THAT WOULD HAVE CAUGHT THE #328 CR1 FORGE-FINALIZATION DEFECT.
// AC#11 + AC#12 + AC#13 E2E guard.
function testGiteaBundleFinalizeRoadmapCleanup() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-finalize-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-42-47-53';
  try {
    _initGitRepo(tmp);
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## Gitea', 'issue_number: 42', 'full_name: owner/repo', '',
        '## Sink', 'branch: workflow/gitea-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), [
      '# Kaola-Workflow Roadmap', '',
      '| Issue | Title | Status |', '|-------|-------|--------|',
      '| #42 | Test 42 | active |', '| #47 | Test 47 | active |', '| #53 | Test 53 | active |', ''
    ].join('\n'));
    writeBundleTeaMockScript(binDir, { closedIssues: [42, 47, 53] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js'),
      })
    });
    assert.strictEqual(result.status, 0,
      'gitea #342 S5: finalize exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitea #342 S5: status must be closed, got ' + JSON.stringify(out.status));
    assert.ok(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated',
      'gitea #342 S5: receipt.roadmap_regenerated must be "regenerated", got ' +
      JSON.stringify(out.closure_receipt && out.closure_receipt.roadmap_regenerated));

    for (const n of [42, 47, 53]) {
      assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')),
        'gitea #342 S5: issue-' + n + '.md roadmap source must be removed after finalize');
    }
    assert.ok(out.dest && fs.existsSync(out.dest), 'gitea #342 S5: archive folder must exist at dest');
    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', project)),
      'gitea #342 S5: live project folder must be gone after finalize');

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitea #342 S5: closure_receipt must be present');
    assert.ok(Array.isArray(receipt.roadmap_sources_removed) && receipt.roadmap_sources_removed.length === 3,
      'gitea #342 S5: roadmap_sources_removed must have 3 entries, got ' + JSON.stringify(receipt.roadmap_sources_removed));
    for (const n of [42, 47, 53]) {
      assert.ok(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
        'gitea #342 S5: roadmap_sources_removed must include issue-' + n + '.md');
    }
    assert.ok(Array.isArray(receipt.closed_issues), 'gitea #342 S5: receipt must have closed_issues array');
    assert.ok(Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0,
      'gitea #342 S5: failed_issue_closures must be empty when all probes succeed, got ' + JSON.stringify(receipt.failed_issue_closures));
    assert.ok(Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length === 3,
      'gitea #342 S5: receipt must have issue_numbers with 3 members, got ' + JSON.stringify(receipt.issue_numbers));

    const inv = out.closure_invariants;
    assert.ok(inv && inv.ok === true,
      'gitea #342 S5: closure_invariants must pass; violations: ' + JSON.stringify(inv && inv.violations));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleFinalizeRoadmapCleanup: PASSED');
}

// S6: AC#1 contamination guard — a single-issue claim must NOT write the bundle fields. Offline.
function testGiteaBundleSingleIssueStateHasNoBundleFields() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-single-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 601);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '601'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitea #342 S6: single-issue startup must acquire, got ' + JSON.stringify(out.claim));
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-601', 'workflow-state.md'), 'utf8');
    assert.ok(!/^issue_numbers:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain issue_numbers line');
    assert.ok(!/^bundle_id:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain bundle_id line');
    assert.ok(!/^closure_policy:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain closure_policy line');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleSingleIssueStateHasNoBundleFields: PASSED');
}

// M1 (#277): dispatch-log hook must be installed in the gitea plugin hooks directory.
function testGiteaDispatchHookExists() {
  const hooksDir = path.join(root, 'plugins/kaola-workflow-gitea/hooks');
  const dispatchLog = path.join(hooksDir, 'kaola-workflow-subagent-dispatch-log.sh');
  assert.ok(fs.existsSync(dispatchLog), 'M1 (#277): gitea hooks/kaola-workflow-subagent-dispatch-log.sh must exist');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  assert.ok(fs.existsSync(hooksJson), 'M1 (#277): gitea hooks/hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const subagentHooks = (hooks.hooks && hooks.hooks.SubagentStart) || [];
  assert.ok(
    subagentHooks.some(e => e.id === 'kaola-workflow:subagent-dispatch-log'),
    'M1 (#277): gitea hooks.json must have a SubagentStart entry with id: kaola-workflow:subagent-dispatch-log'
  );
  console.log('testGiteaDispatchHookExists: PASSED');
}

testGiteaDispatchHookExists();

// issue #342: bundle-lane E2E behavioral coverage (mirrors root §#328 modulo forge nouns).
testGiteaBundleClaimCreatesOneFolder();
testGiteaClosurePersistence();
testGiteaSelectionEvidenceDocking();
testGiteaBundleRefusalLeavesNoFolder();
testGiteaBundleDuplicateIssueBlocking();
testGiteaBundleFinalizeRoadmapCleanup();
testGiteaBundleSingleIssueStateHasNoBundleFields();

// bundle-426-427-428-430 regression tests (mirrors root walkthrough §testFinalizeArchiveVerifiesBeforeDelete etc.).
testGiteaFinalizeArchiveVerifiesBeforeDelete();
testGiteaFinalizeClosesIssueBundleMembers();
testGiteaBundleFinalizeAllOpenCloseIsPending();  // #508
testGiteaFinalizeRoadmapResidueDetection();

// bundle-424-432-433 n9-walkthrough (gitea edition):
// evidence seeding (D-433-01 §2) and doc-updater .md-target barrier (D-424-01 allowband).

// The `## Acceptance` surface: the freeze wall + the bounded-repair fence, driven through the REAL
// gitea-edition CLIs.

run('test-gitea-forge-helpers.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');
run('test-gitea-run-chains.js');  // #550: forge run-chains failing-path (isTransientFetchStderr export must be callable)

console.log('Gitea workflow walkthrough simulation passed');


// ---------------------------------------------------------------------------
// #426: verifyArchiveComplete + copy-then-verify-then-delete ordering.
// Source dir must survive when archive is missing workflow-state.md.
// ---------------------------------------------------------------------------
function testGiteaFinalizeArchiveVerifiesBeforeDelete() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-archive-verify-')));
  const kwRoot = tmp + '.kw';
  try {
    _initGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-426gt');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-426gt', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    // Project dir with NO workflow-state.md.
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426gt');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');

    const claim = require(claimScript);
    const result = claim.archiveProjectDir(wtPath, 'issue-426gt', 'closed', undefined, {});

    assert.ok(
      fs.existsSync(projDir),
      'gitea #426: source dir must NOT be deleted when archive is incomplete'
    );
    assert.strictEqual(result.archive_incomplete, true,
      'gitea #426: archiveProjectDir must return archive_incomplete:true, got: ' + JSON.stringify(result));
    assert.ok(Array.isArray(result.missing) && result.missing.includes('workflow-state.md'),
      'gitea #426: the refusal must NAME the missing state file (the epoch-authority preflight it used to route through is retired; the surviving archive reports the absent file directly), got: ' + JSON.stringify(result));
    console.log('testGiteaFinalizeArchiveVerifiesBeforeDelete: PASSED');
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #427: finalize offline on a bundle project emits closure_receipt.closure.skipped_offline.
// ---------------------------------------------------------------------------
function testGiteaFinalizeClosesIssueBundleMembers() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-427-closure-')));
  const project = 'bundle-42-47';
  try {
    _initGitRepo(tmp);
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
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
        'sink: pr', 'run_posture: in-place', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, project);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });

    assert.strictEqual(result.status, 0,
      'gitea #427 offline bundle close: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitea #427 offline bundle close: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed',
      'gitea #427 offline bundle close: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    assert.ok(closure != null, 'gitea #427: closure_receipt.closure must be present');
    assert.ok(
      Array.isArray(closure.skipped_offline) && closure.skipped_offline.includes(42) && closure.skipped_offline.includes(47),
      'gitea #427: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert.ok(
      Array.isArray(closure.closed) && closure.closed.length === 0,
      'gitea #427: closure.closed must be empty offline, got: ' + JSON.stringify(closure.closed)
    );
    console.log('testGiteaFinalizeClosesIssueBundleMembers: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #508: bundle finalize on merge-lane (--keep-worktree): when all bundle members probe
// as OPEN online, the close is deferred to sink-merge and remote_issue_closed must be
// 'close_pending' (not 'partial') and closed_issues must be []. Parity test for the
// gitea edition (mirrors claude testBundleFinalizeAllOpenCloseIsPending).
// ---------------------------------------------------------------------------
function testGiteaBundleFinalizeAllOpenCloseIsPending() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-508-fin-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-508-71-72';
  try {
    _initGitRepo(tmp);
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## Gitea', 'issue_number: 71', 'full_name: owner/repo', '',
        '## Sink', 'branch: workflow/gitea-' + project,
        'issue_number: 71', 'issue_numbers: 71,72',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    gtPlantRoadmapIssue(tmp, 71);
    gtPlantRoadmapIssue(tmp, 72);
    // Both members probe as OPEN (close deferred to sink-merge on merge-lane).
    writeBundleTeaMockScript(binDir, { openIssues: [71, 72] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js'),
      })
    });

    assert.strictEqual(result.status, 0,
      'gitea #508 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitea #508 finalize: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitea #508 finalize: closure_receipt must be present');
    assert.strictEqual(receipt.remote_issue_closed, 'close_pending',
      'gitea #508 finalize: remote_issue_closed must be close_pending (all members open, deferred to sink-merge), got ' + JSON.stringify(receipt.remote_issue_closed));
    assert.ok(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
      'gitea #508 finalize: closed_issues must be [] (no pre-sink remote close), got ' + JSON.stringify(receipt.closed_issues));
    assert.ok(Array.isArray(receipt.open_issues) && receipt.open_issues.length === 2,
      'gitea #508 finalize: open_issues must contain both members (no pre-sink close fired), got ' + JSON.stringify(receipt.open_issues));
    assert.ok(receipt.open_issues.includes(71) && receipt.open_issues.includes(72),
      'gitea #508 finalize: open_issues must include both 71 and 72, got ' + JSON.stringify(receipt.open_issues));

    console.log('testGiteaBundleFinalizeAllOpenCloseIsPending: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #428: closure_receipt carries roadmap_removed_by_root; source removed after finalize.
// ---------------------------------------------------------------------------
function testGiteaFinalizeRoadmapResidueDetection() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-428-residue-')));
  try {
    _initGitRepo(tmp);
    gtWriteProject(tmp, 'issue-428gt', {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: issue-428gt', 'status: active', '',
        '## Sink', 'branch: workflow/issue-428gt', 'issue_number: 428', 'sink: pr', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, 'issue-428gt');
    gtPlantRoadmapIssue(tmp, 428);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-428gt'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });

    assert.strictEqual(result.status, 0,
      'gitea #428 residue: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitea #428 residue: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed', 'gitea #428 residue: status must be closed');
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitea #428 residue: closure_receipt must be present');
    assert.ok(
      receipt.roadmap_removed !== undefined || receipt.roadmap_removed_by_root !== undefined,
      'gitea #428 residue: closure_receipt must carry roadmap_removed or roadmap_removed_by_root'
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')),
      'gitea #428 residue: .roadmap/issue-428.md must be removed after finalize'
    );
    console.log('testGiteaFinalizeRoadmapResidueDetection: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}


