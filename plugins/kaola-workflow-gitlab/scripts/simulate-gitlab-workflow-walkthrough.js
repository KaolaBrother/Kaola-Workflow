#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('simulate-gitlab-workflow-walkthrough'); } catch (_) { /* advisory only */ }

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

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned;
// point HOME/USERPROFILE at a throwaway sandbox so no subprocess reads or writes the developer's
// real one. Nothing is seeded: an absent config is the shape a fresh machine has.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const sinkMr = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr'));
const claimScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js');

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
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js'));
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
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: merge\n');
    fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'),
      '# Finalization Summary\n## Final Validation\nFinal Validation: pass\n');

    // Simulate cmdFinalize: archive the project dir
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive'), { recursive: true });
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'fb-project');
    fs.renameSync(liveDir, archiveDest);

    // #394: snapshot the summary BEFORE the chain (the state file is now LEGITIMATELY mutated by
    // sink-fallback — it flips sink:mr in the archive so the fallback chain has a home). The summary
    // (and any other non-state file) must stay byte-unchanged.
    const summarySnapshot = fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8');

    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated.
    // #394: it now writes a fallback receipt to the ARCHIVE .cache (was "skipping receipt write").
    const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
    // #394: the fallback receipt now lives in the archive .cache (durable home for the exit-3 chain).
    assert(fs.existsSync(path.join(archiveDest, '.cache', 'sink-fallback.json')),
      '#394: sink-merge writes the fallback receipt to the archive .cache');

    // Step 1: cmdSinkFallback — #394: archived project now OPERATES on the archived state (flips
    // sink:mr there) instead of the old no-op, so the broken fallback chain converges. Returns
    // updated:true + archived:true; the live dir is still never recreated.
    const fbResult = spawnSync(process.execPath,
      [claimScript, 'sink-fallback', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(fbResult.status, 0, 'sink-fallback should exit 0 on archived project');
    const fbParsed = JSON.parse(fbResult.stdout);
    assert.strictEqual(fbParsed.updated, true, '#394: sink-fallback now updates the archived state');
    assert.strictEqual(fbParsed.archived, true, '#394: sink-fallback reports it operated on the archive');
    assert.strictEqual(fbParsed.sink, 'mr', '#394: sink flipped to mr in the archived state');
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated by sink-fallback');
    const archivedStateAfter = fs.readFileSync(path.join(archiveDest, 'workflow-state.md'), 'utf8');
    assert(/^sink: mr$/m.test(archivedStateAfter), '#394: the archived state now reads sink: mr');

    // Step 2: appendSummary on the (absent) LIVE path — should return false, not recreate dir.
    const summaryFile = path.join(tmpRoot, 'kaola-workflow', 'fb-project', 'finalization-summary.md');
    const appendResult = sinkMr.appendSummary(summaryFile, 'https://gl.example/mr/99', 99);
    assert.strictEqual(appendResult, false, 'appendSummary should return false on absent live dir');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'fb-project')),
      'appendSummary must not recreate live dir');

    // Step 3: the archived SUMMARY (and other non-state artifacts) stays byte-unchanged.
    assert.strictEqual(fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8'), summarySnapshot,
      'archive finalization-summary.md must be unchanged (only workflow-state.md is the #394 fallback target)');

    console.log('testFallbackGuardsAfterArchive: PASSED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function testAuditAndRepairLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-audit-labels-'));
  const mockScript = path.join(tmp, 'glab-mock.js');
  const marker = path.join(tmp, 'label-removed.marker');

  try {
    // Mock script: handles glab issue list and glab issue update (unlabel)
    fs.writeFileSync(mockScript, [
      "'use strict';",
      "const fs = require('fs');",
      "const args = process.argv.slice(2);",
      "const joined = args.join(' ');",
      "if (joined.includes('issue update') && joined.includes('--unlabel')) {",
      "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
      "  process.stdout.write('{}\\n');",
      "} else if (joined.includes('issue list')) {",
      "  process.stdout.write('[{\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"state\":\"closed\",\"labels\":[\"workflow:in-progress\"]}]\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}",
      ""
    ].join('\n'));

    // Sub-case A: audit-labels — lists stale issues without removing
    {
      const r = spawnSync(process.execPath, [claimScript, 'audit-labels'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'audit-labels must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.stale.length, 1, 'audit-labels must return stale.length===1, got: ' + JSON.stringify(result.stale));
      assert(!fs.existsSync(marker), 'audit-labels must NOT write label-removed marker');
    }

    // Sub-case B: repair-labels without --execute — dry run
    {
      const r = spawnSync(process.execPath, [claimScript, 'repair-labels'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'repair-labels dry-run must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.dry_run, true, 'repair-labels without --execute must return dry_run:true, got: ' + result.dry_run);
      assert(Array.isArray(result.would_remove) && result.would_remove.length === 1,
        'repair-labels dry-run must return would_remove with 1 entry, got: ' + JSON.stringify(result.would_remove));
      assert(!fs.existsSync(marker), 'repair-labels dry-run must NOT write label-removed marker');
    }

    // Sub-case C: repair-labels --execute — removes the label
    {
      const r = spawnSync(process.execPath, [claimScript, 'repair-labels', '--execute'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'repair-labels --execute must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.dry_run, false, 'repair-labels --execute must return dry_run:false, got: ' + result.dry_run);
      assert(Array.isArray(result.removed) && result.removed.length === 1,
        'repair-labels --execute must return removed with 1 entry, got: ' + JSON.stringify(result.removed));
      assert(fs.existsSync(marker), 'repair-labels --execute must write label-removed marker');
    }

    console.log('testAuditAndRepairLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}



// ===========================================================================
// issue #342: bundle-lane E2E behavioral coverage for the GitLab edition.
// Mirrors the six root scenarios (simulate-workflow-walkthrough.js §#328) modulo
// forge nouns, driving the REAL gitlab edition CLIs via subprocess (no direct-call
// shims — the #292 io-shim lesson). Each scenario uses its own mkdtempSync root +
// try/finally cleanup. Forbidden-token discipline: the GitHub-CLI binary token must
// never appear here (the gitlab validator scans this file); we use glab-mock.js /
// glab-calls.log and write "mirrors the root walkthrough" in prose.
// ===========================================================================

function glInitGitRepo(tmp) {
  G.git(tmp, ['init', '-b', 'main'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  G.git(tmp, ['add', 'README.md'], { encoding: 'utf8' });
  G.git(tmp, ['commit', '-m', 'init'], { encoding: 'utf8' });
}

function glPlantRoadmapIssue(tmp, n) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + n + '.md'),
    ['issue: #' + n, 'title: bundle test issue ' + n, 'status: open',
     'workflow_project: —', 'next_step: ready', ''].join('\n'));
}

function glWriteProject(tmp, project, files) {
  const dir = path.join(tmp, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

// Mirrors the root writeBundleGhMockScript with glab arg shapes (kaola-gitlab-forge.js).
// opts: { logFile, openIssues: number[], closedIssues: number[] }
function writeBundleGlabMockScript(binDir, opts) {
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
    // repo view → gitlab project shape (id feeds projectApiRef, path_with_namespace feeds normalizeProject)
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({id:1,path_with_namespace:"test/repo",web_url:"https://gl.invalid/test/repo"}) + "\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  const state = closedIssues.has(n) ? "closed" : "opened";',
    '  process.stdout.write(JSON.stringify({iid:parseInt(n),state,title:"issue "+n,description:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("issue update") && a.includes("--label")) { const m = a.match(/issue update (\\d+)/); log("label-added:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("issue update") && a.includes("--unlabel")) { const m = a.match(/issue update (\\d+)/); log("label-removed:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    // POST/DELETE must precede the GET /notes check (all three contain /notes).
    'if (a.includes("api") && a.includes("--method POST") && a.includes("/notes")) { log("note:"); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("--method DELETE")) { process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("/notes")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("issue list")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'glab-mock.js'), script);
}

// Online runner mirroring the root walkthrough's pattern: spawn the real edition CLI
// with KAOLA_GLAB_MOCK_SCRIPT routed at the mock and adaptive switch ON. Returns the
// full spawnSync result (caller asserts status + parses the last JSON object line).
function glSpawnBundle(args, cwd, binDir, extraEnv) {
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '1',
      KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
    }, extraEnv || {})
  });
}

function glLastJson(stdout) {
  const lines = (stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  assert(lines.length > 0, 'expected a JSON object line, got: ' + stdout);
  return JSON.parse(lines[lines.length - 1]);
}

// S1: explicit bundle claim creates exactly ONE active folder + the three additive
// bundle fields in workflow-state.md. AC#2 + AC#3 E2E guard.
function testGitlabBundleClaimCreatesOneFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-claim-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'glab-calls.log');
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    writeBundleGlabMockScript(binDir, { logFile, openIssues: [42, 47, 53] });

    const result = glSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 0,
      'gitlab #342 S1: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitlab #342 S1: claim must be acquired, got ' + JSON.stringify(out.claim));
    assert.strictEqual(out.bundle_id, 'bundle-42-47-53', 'gitlab #342 S1: bundle_id must be bundle-42-47-53, got ' + JSON.stringify(out.bundle_id));
    assert.ok(Array.isArray(out.issue_numbers) && out.issue_numbers.length === 3,
      'gitlab #342 S1: issue_numbers must have 3 members, got ' + JSON.stringify(out.issue_numbers));

    const kwDir = path.join(tmp, 'kaola-workflow');
    const projects = fs.readdirSync(kwDir).filter(n => !n.startsWith('.') && n !== 'archive' && n !== 'ROADMAP.md');
    assert.ok(projects.length === 1 && projects[0] === 'bundle-42-47-53',
      'gitlab #342 S1: exactly one active folder (bundle-42-47-53) expected, got ' + projects.join(','));

    const state = fs.readFileSync(path.join(kwDir, 'bundle-42-47-53', 'workflow-state.md'), 'utf8');
    assert.ok(/^issue_iid:\s*42\s*$/m.test(state), 'gitlab #342 S1: state must have issue_iid: 42 (## GitLab)');
    assert.ok(/^issue_number:\s*42\s*$/m.test(state), 'gitlab #342 S1: state must have issue_number: 42 (## Sink primary)');
    assert.ok(/^issue_numbers:\s*42,47,53\s*$/m.test(state), 'gitlab #342 S1: state must have issue_numbers: 42,47,53');
    assert.ok(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state), 'gitlab #342 S1: state must have bundle_id: bundle-42-47-53');
    assert.ok(/^closure_policy:\s*all_or_nothing\s*$/m.test(state), 'gitlab #342 S1: state must have closure_policy: all_or_nothing');
    assert.ok(!/^closure_policy:/m.test(state.replace(/^closure_policy:\s*all_or_nothing\s*$/m, '')),
      'gitlab #342 S1: closure_policy must appear exactly once');
    assert.ok(/^branch:\s*workflow\/gitlab-bundle-42-47-53\s*$/m.test(state),
      'gitlab #342 S1: state must have branch: workflow/gitlab-bundle-42-47-53');

    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const added = calls.filter(c => c.startsWith('label-added:'));
    assert.ok(added.includes('label-added:42'), 'gitlab #342 S1: label added for member 42');
    assert.ok(added.includes('label-added:47'), 'gitlab #342 S1: label added for member 47');
    assert.ok(added.includes('label-added:53'), 'gitlab #342 S1: label added for member 53');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleClaimCreatesOneFolder: PASSED');
}

// DELETED: testGitlabPlannerAttestBackfill. It drove a bundle startup WITH --attest-planner-spawn
// and asserted the back-fill wrote a workflow-planner entry into dispatch-log.jsonl. The mandatory
// planner agent is gone and inline authoring is the design, so the gitlab claim port retired the
// whole producer chain with its canonical original — the flag parse, the back-fill writer, the
// checkDispatchAttestations probe and the claim_planner_attested field. Nothing else shared the
// fixture: the bundle claim itself is covered by testGitlabBundleClaimCreatesOneFolder above, on
// the identical fixture minus the flag, so nothing is lost by deleting the whole scenario.

// CONVERTED (was testGitlabAttestationWarningPersistence, the n6/#653 port): it seeded a role-only
// dispatch-log and asserted the ATTESTATION WARNING landed verbatim in the archived
// finalization-summary.md and the workflow-state.md ## Closure block. Every producer in that chain
// is retired — the gitlab claim port dropped checkDispatchAttestations, persistAttestationToSummary
// and the claim_planner_attested field with their canonical originals — so asserting the field is
// PRESENT is now asserting the retirement did not happen. Root's twin was DELETED outright; this
// scenario stays alive because it is also this suite's closure-persistence exercise: finalize still
// archives, the summary is still written, the ## Closure block still lands. Only the attestation
// expectations flip, into the reappearance guards below — the direction a retirement can actually
// regress in.
function testGitlabClosurePersistence() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-closure-')));
  try {
    glInitGitRepo(tmp);
    const project = 'issue-653gl';
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## GitLab', 'issue_iid: 653101', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/' + project, 'issue_number: 653101', 'sink: merge', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 653101);
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
      'gitlab closure persistence: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab closure persistence: status must be closed, got ' + JSON.stringify(out.status));
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab closure persistence: closure_receipt must be present');
    // DELETED: the `claim_planner_attested === 'missing'` pin. Nothing writes the field, so nothing
    // can assert it. Kept, and now the whole of what this stanza measures: neither retired
    // attestation field may REAPPEAR on any of the three persistence surfaces.
    assert.ok(!('claim_planner_attested' in receipt),
      'gitlab closure persistence: the retired planner attestation field must not reappear on the closure receipt, got ' + JSON.stringify(Object.keys(receipt)));
    assert.ok(!('finalize_contractor_attested' in receipt),
      'gitlab closure persistence: the retired finalize-seam attestation field must not reappear on the closure receipt, got ' + JSON.stringify(Object.keys(receipt)));

    assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab closure persistence: archive dest must exist');
    const finSummaryPath = path.join(out.dest, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'gitlab closure persistence: archived finalization-summary.md must exist');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(!/^claim_planner_attested:/m.test(finContent),
      'gitlab closure persistence: finalization-summary.md must not carry the retired claim_planner_attested field, got: ' + finContent);
    assert.ok(!/^## Attestation$/m.test(finContent),
      'gitlab closure persistence: finalization-summary.md must not carry a retired ## Attestation block, got: ' + finContent);

    const stateContent = fs.readFileSync(path.join(out.dest, 'workflow-state.md'), 'utf8');
    assert.ok(/^## Closure$/m.test(stateContent),
      'gitlab closure persistence: archived workflow-state.md must carry ## Closure');
    assert.ok(!/^claim_planner_attested:/m.test(stateContent),
      'gitlab closure persistence: archived workflow-state.md ## Closure block must not carry the retired claim_planner_attested field, got: ' + stateContent);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabClosurePersistence: PASSED');
}

// n6 (#653 finding D3, gitlab port): a selection-evidence.md docked pre-finalize (simulating the
// router's D2 docking) must be probed into closure_receipt.selection_evidence ('present'), and
// survive archival; a claim with no docked file reads 'absent'. Mirrors root's
// testSelectionEvidenceDocking modulo forge nouns.
function testGitlabSelectionEvidenceDocking() {
  const tmpPresent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-selev-present-')));
  const tmpAbsent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-selev-absent-')));
  try {
    for (const entry of [{ tmp: tmpPresent, seed: true, issue: 653201 }, { tmp: tmpAbsent, seed: false, issue: 653202 }]) {
      const { tmp, seed, issue } = entry;
      glInitGitRepo(tmp);
      const project = 'issue-' + issue + 'gl';
      glWriteProject(tmp, project, {
        'workflow-state.md': [
          '# Kaola-Workflow State', '',
          '## Project', 'name: ' + project, 'status: active', '',
          '## GitLab', 'issue_iid: ' + issue, 'path_with_namespace: test/repo', '',
          '## Sink', 'branch: workflow/' + project, 'issue_number: ' + issue, 'sink: merge', ''
        ].join('\n')
      });
      glPlantRoadmapIssue(tmp, issue);
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
        'gitlab #653 selection-evidence docking: exit 0 expected (seed=' + seed + '), got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      const out = glLastJson(result.stdout);
      assert.strictEqual(out.status, 'closed', 'gitlab #653 selection-evidence docking: status must be closed (seed=' + seed + ')');
      const receipt = out.closure_receipt;
      assert.ok(receipt != null, 'gitlab #653 selection-evidence docking: closure_receipt must be present (seed=' + seed + ')');
      assert.strictEqual(receipt.selection_evidence, seed ? 'present' : 'absent',
        'gitlab #653 selection-evidence docking: selection_evidence must be ' + (seed ? 'present' : 'absent') +
        ' (seed=' + seed + '), got ' + JSON.stringify(receipt.selection_evidence));

      if (seed) {
        assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab #653 selection-evidence docking: archive dest must exist');
        assert.ok(fs.existsSync(path.join(out.dest, '.cache', 'selection-evidence.md')),
          'gitlab #653 selection-evidence docking: selection-evidence.md must survive under the archived .cache/');
      }
    }
  } finally {
    fs.rmSync(tmpPresent, { recursive: true, force: true });
    fs.rmSync(tmpAbsent, { recursive: true, force: true });
  }
  console.log('testGitlabSelectionEvidenceDocking: PASSED');
}

// S2: a refused bundle claim (closed member #47) leaves NO active folder and applies
// ZERO labels (pre-mutation refusal). AC#5 + AC#6 guard.
function testGitlabBundleRefusalLeavesNoFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-refuse-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'glab-calls.log');
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    writeBundleGlabMockScript(binDir, { logFile, openIssues: [42, 53], closedIssues: [47] });

    const result = glSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 1,
      'gitlab #342 S2: exit 1 expected for closed member, got ' + result.status + '\nstdout: ' + result.stdout);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'target_set_has_closed_issue',
      'gitlab #342 S2: status must be target_set_has_closed_issue, got ' + JSON.stringify(out.status));
    assert.strictEqual(out.issue, 47, 'gitlab #342 S2: refused on issue 47, got ' + JSON.stringify(out.issue));

    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'bundle-42-47-53')),
      'gitlab #342 S2: no bundle-42-47-53 folder must exist after refusal');
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert.strictEqual(labelsAdded.length, 0,
      'gitlab #342 S2: no labels must be applied after pre-mutation refusal, got: ' + labelsAdded.join(', '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleRefusalLeavesNoFolder: PASSED');
}

// S3: a live bundle [42,47,53] blocks (a) a direct single-issue claim of member 47 and
// (b) an overlapping bundle claim [47,77]. Offline. AC#8 duplicate-block guard.
function testGitlabBundleDuplicateIssueBlocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-dup-')));
  try {
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 77);
    glWriteProject(tmp, 'bundle-42-47-53', {
      'workflow-state.md': [
        'name: bundle-42-47-53', 'status: active', 'phase: adaptive',
        'issue_iid: 42', 'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: bundle-42-47-53', 'closure_policy: all_or_nothing',
        'branch: workflow/gitlab-bundle-42-47-53', 'sink: merge', ''
      ].join('\n')
    });

    const offlineEnv = { KAOLA_WORKFLOW_OFFLINE: '1' };
    const r1 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '47'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    const o1 = JSON.parse(r1.stdout);
    assert.ok(o1.claim === 'owned' || o1.claim === 'none',
      'gitlab #342 S3 (a): claim must be owned or none for live bundle member 47, got ' + JSON.stringify(o1.claim));
    if (o1.claim === 'owned') {
      assert.strictEqual(o1.project, 'bundle-42-47-53',
        'gitlab #342 S3 (a): owned claim must resolve to bundle-42-47-53, got ' + JSON.stringify(o1.project));
    }

    const r2 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issues', '47,77', '--workflow-path', 'adaptive'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    assert.strictEqual(r2.status, 1,
      'gitlab #342 S3 (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert.strictEqual(o2.status, 'target_set_conflicts_active_work',
      'gitlab #342 S3 (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleDuplicateIssueBlocking: PASSED');
}


// S5: finalize on a bundle project removes ALL member .roadmap/issue-N.md files, regenerates
// the mirror once, archives ONE folder, and the closure receipt carries the bundle fields.
// THIS IS THE SCENARIO THAT WOULD HAVE CAUGHT THE #328 CR1 FORGE-FINALIZATION DEFECT.
// AC#11 + AC#12 + AC#13 E2E guard.
function testGitlabBundleFinalizeRoadmapCleanup() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-finalize-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-42-47-53';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/gitlab-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), [
      '# Kaola-Workflow Roadmap', '',
      '| Issue | Title | Status |', '|-------|-------|--------|',
      '| #42 | Test 42 | active |', '| #47 | Test 47 | active |', '| #53 | Test 53 | active |', ''
    ].join('\n'));
    writeBundleGlabMockScript(binDir, { closedIssues: [42, 47, 53] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
      })
    });
    assert.strictEqual(result.status, 0,
      'gitlab #342 S5: finalize exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab #342 S5: status must be closed, got ' + JSON.stringify(out.status));
    assert.ok(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated',
      'gitlab #342 S5: receipt.roadmap_regenerated must be "regenerated", got ' +
      JSON.stringify(out.closure_receipt && out.closure_receipt.roadmap_regenerated));

    for (const n of [42, 47, 53]) {
      assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')),
        'gitlab #342 S5: issue-' + n + '.md roadmap source must be removed after finalize');
    }
    assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab #342 S5: archive folder must exist at dest');
    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', project)),
      'gitlab #342 S5: live project folder must be gone after finalize');

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #342 S5: closure_receipt must be present');
    assert.ok(Array.isArray(receipt.roadmap_sources_removed) && receipt.roadmap_sources_removed.length === 3,
      'gitlab #342 S5: roadmap_sources_removed must have 3 entries, got ' + JSON.stringify(receipt.roadmap_sources_removed));
    for (const n of [42, 47, 53]) {
      assert.ok(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
        'gitlab #342 S5: roadmap_sources_removed must include issue-' + n + '.md');
    }
    assert.ok(Array.isArray(receipt.closed_issues), 'gitlab #342 S5: receipt must have closed_issues array');
    assert.ok(Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0,
      'gitlab #342 S5: failed_issue_closures must be empty when all probes succeed, got ' + JSON.stringify(receipt.failed_issue_closures));
    assert.ok(Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length === 3,
      'gitlab #342 S5: receipt must have issue_numbers with 3 members, got ' + JSON.stringify(receipt.issue_numbers));

    const inv = out.closure_invariants;
    assert.ok(inv && inv.ok === true,
      'gitlab #342 S5: closure_invariants must pass; violations: ' + JSON.stringify(inv && inv.violations));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleFinalizeRoadmapCleanup: PASSED');
}

// S6: AC#1 contamination guard — a single-issue claim must NOT write the bundle fields. Offline.
function testGitlabBundleSingleIssueStateHasNoBundleFields() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-single-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 601);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '601'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitlab #342 S6: single-issue startup must acquire, got ' + JSON.stringify(out.claim));
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-601', 'workflow-state.md'), 'utf8');
    assert.ok(!/^issue_numbers:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain issue_numbers line');
    assert.ok(!/^bundle_id:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain bundle_id line');
    assert.ok(!/^closure_policy:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain closure_policy line');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleSingleIssueStateHasNoBundleFields: PASSED');
}

// M1 (#277): dispatch-log hook must be installed in the gitlab plugin hooks directory.
function testGitlabDispatchHookExists() {
  const hooksDir = path.join(root, 'plugins/kaola-workflow-gitlab/hooks');
  const dispatchLog = path.join(hooksDir, 'kaola-workflow-subagent-dispatch-log.sh');
  assert.ok(fs.existsSync(dispatchLog), 'M1 (#277): gitlab hooks/kaola-workflow-subagent-dispatch-log.sh must exist');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  assert.ok(fs.existsSync(hooksJson), 'M1 (#277): gitlab hooks/hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const subagentHooks = (hooks.hooks && hooks.hooks.SubagentStart) || [];
  assert.ok(
    subagentHooks.some(e => e.id === 'kaola-workflow:subagent-dispatch-log'),
    'M1 (#277): gitlab hooks.json must have a SubagentStart entry with id: kaola-workflow:subagent-dispatch-log'
  );
  console.log('testGitlabDispatchHookExists: PASSED');
}


// issue #283: sink-mr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkMrUsesFinalizationSummary() {
  const sinkMrScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sink-mr-fin-'));
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
      'sink: merge',
      ''
    ].join('\n'));
    // Plant finalization-summary.md (the new canonical file)
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    G.exec(tmp, ['add', '-A'], { encoding: 'utf8', stdio: 'pipe' });
    G.exec(tmp, ['commit', '-m', 'initial'], { encoding: 'utf8', stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      sinkMrScript,
      '--branch', 'workflow/issue-2830',
      '--project', 'issue-2830',
      '--issue', '2830'
    ], {
      cwd: tmp,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0,
      'sink-mr (finalization-summary) offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);

    // finalization-summary.md must exist and contain MR URL
    const finSummaryPath = path.join(kwDir, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'sink-mr must write to finalization-summary.md, not phase6-summary.md');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(finContent.includes('MR URL:'),
      'finalization-summary.md must contain MR URL after sink-mr, got: ' + finContent);

    // phase6-summary.md must NOT be created
    assert.ok(!fs.existsSync(path.join(kwDir, 'phase6-summary.md')),
      'sink-mr must NOT create phase6-summary.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testSinkMrUsesFinalizationSummary: PASSED');
}

testFallbackGuardsAfterArchive();
testAuditAndRepairLabels();
testSinkMrUsesFinalizationSummary();
testGitlabDispatchHookExists();

// issue #342: bundle-lane E2E behavioral coverage (mirrors root §#328 modulo forge nouns).
testGitlabBundleClaimCreatesOneFolder();
testGitlabClosurePersistence();
testGitlabSelectionEvidenceDocking();
testGitlabBundleRefusalLeavesNoFolder();
testGitlabBundleDuplicateIssueBlocking();
testGitlabBundleFinalizeRoadmapCleanup();
testGitlabBundleSingleIssueStateHasNoBundleFields();

// bundle-426-427-428-430 regression tests (mirrors root walkthrough §testFinalizeArchiveVerifiesBeforeDelete etc.).
testGitlabFinalizeArchiveVerifiesBeforeDelete();
testGitlabFinalizeClosesIssueBundleMembers();
testGitlabBundleFinalizeAllOpenCloseIsPending();  // #508
testGitlabFinalizeRoadmapResidueDetection();

// bundle-424-432-433 n9-walkthrough (gitlab edition):
// evidence seeding (D-433-01 §2) and doc-updater .md-target barrier (D-424-01 allowband).

// The `## Acceptance` surface: the freeze wall + the bounded-repair fence, driven through the REAL
// gitlab-edition CLIs.

run('test-gitlab-forge-helpers.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');
run('test-gitlab-run-chains.js');  // #550: forge run-chains failing-path (isTransientFetchStderr export must be callable)

console.log('GitLab workflow walkthrough simulation passed');


// ---------------------------------------------------------------------------
// #426: verifyArchiveComplete + copy-then-verify-then-delete ordering.
// Source dir must survive when archive is missing workflow-state.md.
// ---------------------------------------------------------------------------
function testGitlabFinalizeArchiveVerifiesBeforeDelete() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-archive-verify-')));
  const kwRoot = tmp + '.kw';
  try {
    glInitGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-426gl');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-426gl', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    // Project dir with NO workflow-state.md.
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426gl');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');

    const claim = require(claimScript);
    const result = claim.archiveProjectDir(wtPath, 'issue-426gl', 'closed', undefined, {});

    assert.ok(
      fs.existsSync(projDir),
      'gitlab #426: source dir must NOT be deleted when archive is incomplete'
    );
    assert.strictEqual(result.archive_incomplete, true,
      'gitlab #426: archiveProjectDir must return archive_incomplete:true, got: ' + JSON.stringify(result));
    assert.ok(Array.isArray(result.missing) && result.missing.includes('workflow-state.md'),
      'gitlab #426: the refusal must NAME the missing state file (the epoch-authority preflight it used to route through is retired; the surviving archive reports the absent file directly), got: ' + JSON.stringify(result));
    console.log('testGitlabFinalizeArchiveVerifiesBeforeDelete: PASSED');
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #427: finalize offline on a bundle project emits closure_receipt.closure.skipped_offline.
// ---------------------------------------------------------------------------
function testGitlabFinalizeClosesIssueBundleMembers() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-427-closure-')));
  const project = 'bundle-42-47';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/' + project,
        'issue_number: 42',
        'issue_numbers: 42,47',
        'bundle_id: ' + project,
        'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, project);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #427 offline bundle close: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitlab #427 offline bundle close: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed',
      'gitlab #427 offline bundle close: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    assert.ok(closure != null, 'gitlab #427: closure_receipt.closure must be present');
    assert.ok(
      Array.isArray(closure.skipped_offline) && closure.skipped_offline.includes(42) && closure.skipped_offline.includes(47),
      'gitlab #427: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert.ok(
      Array.isArray(closure.closed) && closure.closed.length === 0,
      'gitlab #427: closure.closed must be empty offline, got: ' + JSON.stringify(closure.closed)
    );
    console.log('testGitlabFinalizeClosesIssueBundleMembers: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #508: bundle finalize on merge-lane (--keep-worktree): when all bundle members probe
// as OPEN online, the close is deferred to sink-merge and remote_issue_closed must be
// 'close_pending' (not 'partial') and closed_issues must be []. Parity test for the
// gitlab edition (mirrors claude testBundleFinalizeAllOpenCloseIsPending).
// ---------------------------------------------------------------------------
function testGitlabBundleFinalizeAllOpenCloseIsPending() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-508-fin-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-508-71-72';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 71', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/gitlab-' + project,
        'issue_number: 71', 'issue_numbers: 71,72',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 71);
    glPlantRoadmapIssue(tmp, 72);
    // Both members probe as OPEN (close deferred to sink-merge on merge-lane).
    writeBundleGlabMockScript(binDir, { openIssues: [71, 72] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
      })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #508 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab #508 finalize: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #508 finalize: closure_receipt must be present');
    assert.strictEqual(receipt.remote_issue_closed, 'close_pending',
      'gitlab #508 finalize: remote_issue_closed must be close_pending (all members open, deferred to sink-merge), got ' + JSON.stringify(receipt.remote_issue_closed));
    assert.ok(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
      'gitlab #508 finalize: closed_issues must be [] (no pre-sink remote close), got ' + JSON.stringify(receipt.closed_issues));
    assert.ok(Array.isArray(receipt.open_issues) && receipt.open_issues.length === 2,
      'gitlab #508 finalize: open_issues must contain both members (no pre-sink close fired), got ' + JSON.stringify(receipt.open_issues));
    assert.ok(receipt.open_issues.includes(71) && receipt.open_issues.includes(72),
      'gitlab #508 finalize: open_issues must include both 71 and 72, got ' + JSON.stringify(receipt.open_issues));

    console.log('testGitlabBundleFinalizeAllOpenCloseIsPending: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #428: closure_receipt carries roadmap_removed_by_root (dual-root map); source removed.
// ---------------------------------------------------------------------------
function testGitlabFinalizeRoadmapResidueDetection() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-428-residue-')));
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, 'issue-428gl', {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: issue-428gl', 'status: active', '',
        '## GitLab', 'issue_iid: 428', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/issue-428gl', 'issue_number: 428', 'sink: merge', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, 'issue-428gl');
    glPlantRoadmapIssue(tmp, 428);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-428gl'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #428 residue: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitlab #428 residue: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed', 'gitlab #428 residue: status must be closed');
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #428 residue: closure_receipt must be present');
    assert.ok(
      receipt.roadmap_removed !== undefined || receipt.roadmap_removed_by_root !== undefined,
      'gitlab #428 residue: closure_receipt must carry roadmap_removed or roadmap_removed_by_root'
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')),
      'gitlab #428 residue: .roadmap/issue-428.md must be removed after finalize'
    );
    console.log('testGitlabFinalizeRoadmapResidueDetection: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}


