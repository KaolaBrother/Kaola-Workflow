#!/usr/bin/env node
'use strict';

// test-finalize-door.js — the oracle for the REWRITTEN finalize door and the RELOCATED release gate.
//
// Written against kaola-workflow/issue-877/step3-extraction-spec.md `## Acceptance` (the authored
// contract), NOT against an implementation. Design of record: docs/decisions/0017-the-mission-list.md.
// Hand-rolled assert, no framework — repo style (see scripts/test-run-chains.js, the nearest
// neighbour). No `--shard`: the neighbouring standalone suites do not carry one.
//
// The seven acceptance clauses, and where each is pinned:
//   1. claim.js / run-chains.js no longer require the plan-validator            -> T1
//   2. a finalize over a green, fresh receipt passes with NO plan file anywhere  -> T2
//   3. a finalize over a stale / missing / red receipt STILL PASSES and reports
//      the typed finding twice — envelope `validation`, durable `## Validation`  -> T3
//        classification family: unverified > stale > empty > red > green
//   4. a diff no record describes PASSES, reports `changed_paths`, and lands
//      durably under `## Changed Paths` in finalization-summary.md               -> T4
//   5. run-chains.js --release-check reproduces every plan-validator refusal     -> T5
//   6. an archive that would drop a file refuses; a lossless one passes          -> T6
//   7. producer and gate compute the SAME codeTreeHash for the same tree         -> T7
//
// CLAUSES 3 AND 4 ARE THE SAME SHAPE, and it is the shape a conversion has to have: assert the
// PASS, assert the envelope field, assert the DURABLE write. ADR 0016 — a conversion that emits a
// verdict and drops the state is a DELETION, not a conversion — so the durable half is not
// optional decoration, it is the half that carries what the refusal used to freeze. Clauses 5 and
// 6 are deliberately NOT converted: the release gate is release tooling a human invokes before
// tagging, and a lossy archive is an operation refusing to destroy data rather than a workflow
// judging work. Those keep asserting non-zero exits.
//
// FIXTURE DISCIPLINE. Every fixture is a scratch git repo of its own under $TMPDIR — nothing is
// ever written inside THIS repository. A fixture that wrote inside the repo before claiming would
// silently exercise a different path than the one under test, and would leave residue behind.
// The mock gh script, the mock chain scripts and the gh call log all live OUTSIDE the fixture repo
// (a sibling `bin/` dir), because an untracked file inside the repo is captured by the code-tree
// snapshot (`git add -A` under a temp index) and would silently stale the receipt under test.
//
// SELF-HOST FIXTURES. The finalize validation arm is dual-mode by repo kind: self-host iff the git
// top-level package.json declares a `test:kaola-workflow:*` chain. Every finalize fixture here
// declares all four, so these tests exercise the CHAIN-RECEIPT arm (the one the spec keeps as a
// verdict). The declared chain commands are trivial no-ops so that nothing here can run a real
// suite even if a future argv change made a fixture fall through to a real chain dispatch.
//
// RECEIPT LOCATION. The spec ports the self-host arm to `evaluateChainReceipt(root, opts)` reading
// `.cache/chain-receipt.json` WITHOUT naming which `.cache` (today it is the plan-dir's; there is
// no plan any more). That is deliberately not frozen here: every fixture writes the SAME receipt
// bytes to BOTH the project folder's `.cache/` and the repo-root `.cache/`, so a correct
// implementation passes whichever it resolves, and a receipt-absent scenario removes both.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Git FIXTURE arrangement routes through the shared library — one process-boundary decision
// for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const runChainsScript = path.join(repoRoot, 'scripts', 'kaola-workflow-run-chains.js');
const adaptiveSchemaPath = path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js');
const validationRunnerScript = path.join(repoRoot, 'scripts', 'kaola-workflow-validation-runner.js');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + message); }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeBase(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-door-' + tag + '-'));
}

// A self-host git repo: package.json declaring all four edition chains (trivial no-ops), a
// gitignored repo-root `/.cache/` (as this repo has), and a little real "code" to hash.
function initSelfHostRepo(repo, opts) {
  const o = opts || {};
  fs.mkdirSync(repo, { recursive: true });
  G.init(repo, { branch: 'main' });
  const noop = 'node -e "process.exit(0)"';
  const scripts = {};
  for (const name of (o.chains || ['claude', 'codex', 'gitlab', 'gitea'])) {
    scripts['test:kaola-workflow:' + name] = noop;
  }
  fs.writeFileSync(path.join(repo, 'package.json'),
    JSON.stringify({ name: 'kw-finalize-door-fixture', version: '0.0.0', scripts }, null, 2) + '\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '/.cache/\n');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'app.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'note.md'), 'fixture doc\n');
  G.commitAll(repo, 'init');
}

// A PLAN-LESS project folder: workflow-state.md and nothing else. The whole point of clause 2 is
// that no workflow-plan.md exists anywhere, so this helper never writes one.
function writePlanlessProject(repo, project, issueNumber) {
  const dir = path.join(repo, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: complete',
    'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- finalization',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: folder_claimed',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: workflow/' + project,
    'issue_number: ' + issueNumber,
    'sink: merge',
    'run_posture: in-place',
    ''
  ].join('\n'));
  return dir;
}

function writeRoadmap(repo, issueNumber, project) {
  const roadmapDir = path.join(repo, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(roadmapDir, { recursive: true });
  fs.writeFileSync(path.join(roadmapDir, 'issue-' + issueNumber + '.md'), [
    'issue: #' + issueNumber,
    'title: Finalize door fixture ' + issueNumber,
    'status: active',
    'workflow_project: ' + project,
    'next_step: TBD'
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(repo, 'kaola-workflow', 'ROADMAP.md'),
    '# Kaola-Workflow Roadmap\n\n'
    + '| Issue | Title | Status | Project | Next Step |\n'
    + '|-------|-------|--------|---------|----------|\n'
    + '| #' + issueNumber + ' | Finalize door fixture ' + issueNumber + ' | active | ' + project + ' | TBD |\n');
}

// Minimal gh mock — offline-safe, same KAOLA_GH_MOCK_SCRIPT pattern the other finalize suites use.
function writeGhMock(binDir, closedIssues) {
  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const closed = new Set(' + JSON.stringify((closedIssues || []).map(String)) + ');',
    'if (a.includes("repo view")) {',
    '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
    '  process.exit(0);',
    '}',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  process.stdout.write(JSON.stringify({number:parseInt(n),state:closed.has(n)?"closed":"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("api") && a.includes("comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'process.stdout.write("\\n");',
    'process.exit(0);'
  ].join('\n');
  const p = path.join(binDir, 'gh.js');
  fs.writeFileSync(p, script);
  return p;
}

// A CONSUMER git repo: NO package.json anywhere, so classifyRepoKind reads `consumer` and the gate
// takes the final-validation arm instead of the chain-receipt one. README/CHANGELOG/docs are seeded
// deliberately — they are validation-INVISIBLE in a consumer repo, so their presence proves the
// candidate hash is addressing the code band and not the whole tree. `project` may be null (T8l
// claims its run folder in the linked worktree instead).
function initConsumerRepo(repo, project) {
  fs.mkdirSync(repo, { recursive: true });
  G.init(repo, { branch: 'main' });
  fs.writeFileSync(path.join(repo, '.gitignore'), '/.cache/\n');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'app.swift'), 'let x = 1\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# consumer app\n');
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'design.md'), 'design notes\n');
  G.commitAll(repo, 'init');
  if (project) fs.mkdirSync(path.join(repo, 'kaola-workflow', project, '.cache'), { recursive: true });
  return repo;
}

// The consumer arm's PRODUCER, driven as an operator drives it. The recipe is what is under test, so
// it goes through the real CLI from a real cwd: the candidate root the verb resolves is
// process.cwd()-driven, and an in-process call would supply that answer instead of measuring it.
function runRecord(cwd, args) {
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [validationRunnerScript, 'record', ...args], {
    cwd, encoding: 'utf8', timeout: 120000,
    // Set EXPLICITLY, never inherited: a fixture that takes whatever the parent process had is a
    // fixture whose environment nobody chose, and that is how a guard gets switched off unnoticed.
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0' }),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: lastJson(r) };
}

// A trivially-green mock chain command, written OUTSIDE the fixture repo.
function writeGreenChainMock(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const p = path.join(binDir, 'green-chain.js');
  fs.writeFileSync(p, '#!/usr/bin/env node\n\'use strict\';\nprocess.exit(0);\n', { mode: 0o755 });
  return p;
}

// The finalize door IS an argv -> handler -> envelope -> exit-code contract, and both halves of
// what these tests pin live at the process boundary: whether it exits non-zero, and what the
// emitted envelope says. An in-process call could not observe the exit code at all.
function runClaim(args, repo, ghMockPath, extraEnv) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '0',   // in-place posture: no git worktree ops in $TMPDIR
      KAOLA_GH_MOCK_SCRIPT: ghMockPath,
    }, extraEnv || {})
  });
}

// Same class, two uses: `--release-check` is a pure argv/envelope/exit-code verb (T5), and the
// receipt-producing runs (T2/T3/T4/T7) must go through the real CLI because the artifact under
// test is the one the PRODUCER stamps — a hand-built receipt would be the fixture agreeing with
// itself instead of the producer and the gate agreeing with each other.
function runChains(repo, args) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [runChainsScript, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120000,
    env: Object.assign({}, process.env, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial' })
  });
}

// Last JSON object printed on stdout (the emitted envelope).
function lastJson(result) {
  const lines = String((result && result.stdout) || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}

function projectReceiptPath(repo, project) {
  return path.join(repo, 'kaola-workflow', project, '.cache', 'chain-receipt.json');
}
function rootReceiptPath(repo) {
  return path.join(repo, '.cache', 'chain-receipt.json');
}

// Read whichever receipt the producer wrote (project-scoped first).
function readReceipt(repo, project) {
  for (const p of [projectReceiptPath(repo, project), rootReceiptPath(repo)]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { /* next */ }
  }
  return null;
}

// Write the SAME bytes to both candidate receipt locations; `raw === null` removes both.
function putReceiptEverywhere(repo, project, raw) {
  for (const p of [projectReceiptPath(repo, project), rootReceiptPath(repo)]) {
    if (raw === null) { try { fs.unlinkSync(p); } catch (_) {} continue; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, raw);
  }
}

// Produce a REAL receipt with the producer, at the project folder, over one green mock chain.
// Using the producer (rather than a hand-built receipt) is the point: the freshness key under test
// is whatever the producer stamped, so the fixture can never disagree with it by construction.
function produceGreenReceipt(repo, project, greenMock) {
  const r = runChains(repo, ['--project', project, '--chains', 'claude', '--mock-chain', 'claude:' + greenMock, '--json']);
  const receipt = readReceipt(repo, project);
  if (receipt) putReceiptEverywhere(repo, project, JSON.stringify(receipt));
  return { result: r, receipt };
}

// The typed token this refusal carries, wherever the envelope puts it. The finalize door wraps an
// inner validation refusal (today as finalize_gate_unverified + inner_reason); the spec pins the
// TOKEN, not the wrapper shape, so accept it at either level or in the errors list.
function carriesToken(out, token) {
  if (!out || typeof out !== 'object') return false;
  if (out.reason === token || out.inner_reason === token) return true;
  if (Array.isArray(out.errors) && out.errors.some(e => String(e) === token)) return true;
  return false;
}

function refusedWith(result, out, token, label) {
  assert(result.status !== 0, label + ': exits non-zero; got ' + result.status
    + '\nstdout: ' + String(result.stdout || '').slice(0, 600));
  assert(carriesToken(out, token), label + ': carries the typed token ' + token
    + '; got ' + JSON.stringify(out && { result: out.result, reason: out.reason, inner_reason: out.inner_reason }));
}

// The typed FINDING the envelope's `validation` carries. The spec pins the field name
// (`validation`) and the token vocabulary, and says the value is an object — but not which key
// inside it holds the token, so a small band of plausible keys is accepted. The band still
// discriminates every member of the family from every other, which is the property under test;
// what it deliberately does not do is freeze a payload shape the spec never fixed.
function findingCarries(validation, token) {
  if (validation == null) return false;
  if (typeof validation === 'string') return validation === token;
  if (typeof validation !== 'object') return false;
  for (const key of ['finding', 'reason', 'result', 'classification', 'verdict', 'status']) {
    if (validation[key] === token) return true;
  }
  return false;
}

// The clause-3 / clause-4 conversion shape, asserted whole: it PASSED, it reached terminal closure,
// it reported the finding on the envelope, and it wrote the SAME finding durably. Reporting without
// the durable half is the deletion ADR 0016 names; asserting only the durable half would miss a
// door that still slams. Both, every time.
function passedWithFinding(ctx, result, out, token, label) {
  assert(result.status !== 0 ? false : true, label + ': finalize EXITS 0 — a receipt finding is not a refusal; got '
    + result.status + '\nstdout: ' + String(result.stdout || '').slice(0, 700)
    + '\nstderr: ' + String(result.stderr || '').slice(0, 300));
  assert(out !== null, label + ': finalize emits a JSON envelope');
  assert(out && out.result !== 'refuse', label + ': the envelope is not a refusal; got '
    + JSON.stringify(out && { result: out.result, reason: out.reason, inner_reason: out.inner_reason }));
  assert(out && out.status === 'closed', label + ': closure still completes over the finding; got '
    + JSON.stringify(out && out.status));
  assert(out && findingCarries(out.validation, token),
    label + ': the envelope reports validation finding ' + token + '; got validation='
    + JSON.stringify(out && out.validation));
  const summary = readFinalizationSummary(ctx.repo, ctx.project, out && out.dest);
  assert(summary !== null, label + ': finalization-summary.md exists after finalize (live or archived)');
  if (summary) {
    const body = sectionBody(summary.text, '## Validation');
    assert(body !== null, label + ': finalization-summary.md carries a `## Validation` heading ('
      + summary.path + ')');
    if (body !== null) {
      assert(body.includes(token),
        label + ': the durable `## Validation` section records ' + token + '; got '
        + JSON.stringify(body.slice(0, 400)));
    }
  }
}

// Every file under `dir`, recursively, as repo-relative-ish paths.
function walkFiles(dir, rel, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return acc; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walkFiles(abs, r, acc);
    else acc.push(r);
  }
  return acc;
}

// The body of a `## Heading` section, up to the next `## ` heading or EOF.
function sectionBody(text, heading) {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex(l => l.trim() === heading);
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// finalization-summary.md, wherever finalize left it (live folder, or the archive it moved to).
function readFinalizationSummary(repo, project, dest) {
  const candidates = [];
  if (dest) candidates.push(path.join(dest, 'finalization-summary.md'));
  candidates.push(path.join(repo, 'kaola-workflow', project, 'finalization-summary.md'));
  const archiveBase = path.join(repo, 'kaola-workflow', 'archive');
  try {
    for (const name of fs.readdirSync(archiveBase)) {
      candidates.push(path.join(archiveBase, name, 'finalization-summary.md'));
    }
  } catch (_) { /* no archive dir */ }
  for (const p of candidates) {
    try { return { path: p, text: fs.readFileSync(p, 'utf8') }; } catch (_) { /* next */ }
  }
  return null;
}

function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// A complete, PLAN-LESS finalize fixture: a self-host git repo, a run folder holding only
// workflow-state.md, a roadmap source + mirror, an offline gh mock, and a green mock chain.
// Every clause-2/3/4 case gets its OWN fixture, because a finalize that passes is terminal — it
// archives the run folder — so cases can no longer share one repo the way refusals could.
function buildFinalizeFixture(tag, project, issueNumber) {
  const base = makeBase(tag);
  const repo = path.join(base, 'repo');
  const binDir = path.join(base, 'bin');
  initSelfHostRepo(repo);
  writePlanlessProject(repo, project, issueNumber);
  writeRoadmap(repo, issueNumber, project);
  return {
    base, repo, binDir, project, issueNumber,
    gh: writeGhMock(binDir, [issueNumber]),
    greenMock: writeGreenChainMock(binDir),
    finalize: extraArgs => {
      const r = runClaim(['finalize', '--project', project, ...(extraArgs || [])],
        repo, path.join(binDir, 'gh.js'));
      return { r, out: lastJson(r) };
    },
  };
}

// Prove the fixture premise clause 2 rests on: no plan file anywhere under the fixture.
function assertNoPlanAnywhere(repo, label) {
  const plans = walkFiles(repo, '', []).filter(p => /(^|\/)workflow-plan(\.next)?\.md$/.test(p));
  assert(plans.length === 0, label + ': fixture premise — no plan file anywhere; found ' + JSON.stringify(plans));
}

// ---------------------------------------------------------------------------
// T1 (clause 1) — the dying host is unreachable from the two survivors.
//
// The plan-validator is the retiring host. `claim.js` requires it today (parseGoal / parseLedger /
// the shelled --finalize-check) and `run-chains.js` requires it today (computeCodeTreeHash /
// parseValidationTestConsumes). Both requires must be gone: a survivor that still loads the dying
// host has not been extracted, it has been aliased.
// ---------------------------------------------------------------------------
(function T1_noPlanValidatorRequire() {
  console.log('T1: neither claim.js nor run-chains.js requires the plan-validator');
  const RE = /require\(\s*['"][^'"]*kaola-workflow-plan-validator[^'"]*['"]\s*\)/;
  for (const rel of ['kaola-workflow-claim.js', 'kaola-workflow-run-chains.js']) {
    const abs = path.join(repoRoot, 'scripts', rel);
    let src = '';
    try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { src = ''; }
    assert(src.length > 0, 'T1: ' + rel + ' is readable');
    const m = src.match(RE);
    assert(!m, 'T1: ' + rel + ' must not require kaola-workflow-plan-validator.js; found ' + JSON.stringify(m && m[0]));
  }
})();

// ---------------------------------------------------------------------------
// T2 (clause 2) — a green, fresh receipt finalizes with NO plan file present anywhere.
//
// `adaptive_plan_missing` is deleted: a plan is not a finalize precondition. This is the clause the
// whole extraction exists to serve, so the fixture asserts plan-absence itself before running.
// ---------------------------------------------------------------------------
(function T2_planlessGreenFinalizePasses() {
  console.log('T2: finalize passes over a green, fresh receipt with no plan file present anywhere');
  const fx = buildFinalizeFixture('t2', 'issue-9002', 9002);
  try {
    // The receipt is produced LAST, after every fixture file is in place, so it is fresh over the
    // exact tree finalize will re-address.
    const produced = produceGreenReceipt(fx.repo, fx.project, fx.greenMock);
    assert(produced.receipt !== null, 'T2: the producer wrote a chain receipt'
      + '\nstdout: ' + String(produced.result.stdout || '').slice(0, 400)
      + '\nstderr: ' + String(produced.result.stderr || '').slice(0, 400));
    assert(produced.receipt && Array.isArray(produced.receipt.chains) && produced.receipt.chains.length > 0
      && produced.receipt.chains.every(c => c.exitCode === 0),
      'T2: the produced receipt is all-green; got ' + JSON.stringify(produced.receipt && produced.receipt.chains));

    assertNoPlanAnywhere(fx.repo, 'T2');

    const { r, out } = fx.finalize();
    assert(!carriesToken(out, 'adaptive_plan_missing'),
      'T2: a plan-less finalize must not refuse adaptive_plan_missing (the refusal is deleted); got '
      + JSON.stringify(out && { reason: out.reason, inner_reason: out.inner_reason }));
    // `chains_green` is the terminal member of the classification family, so the green case is
    // reported exactly like every other one — the measurement is emitted whatever it says.
    passedWithFinding(fx, r, out, 'chains_green', 'T2 (green, fresh receipt)');
    assert(!fs.existsSync(path.join(fx.repo, 'kaola-workflow', fx.project)),
      'T2: the live run folder was archived');
  } finally { rm(fx.base); }
})();

// ---------------------------------------------------------------------------
// T3 (clause 3) — the chain-receipt family is a MEASUREMENT, not a verdict.
//
// A stale / missing / red receipt STILL PASSES. The refusal is deleted; what survives is the
// classification, reported twice — on the envelope as `validation`, and durably in
// finalization-summary.md under `## Validation`. Each case therefore asserts the full conversion
// shape (pass + closure + envelope + durable), not merely "it did not exit 1": a door that passed
// but reported nothing would be a deletion of the measurement, which is the failure mode ADR 0016
// names by name.
//
// Precedence pinned, as an ordering over FINDINGS:
//   chains_unverified > chains_stale > chains_empty > chains_red   (> chains_green, in T2)
//
// One fixture per case — a passing finalize is terminal (it archives the run folder), so the
// receipt can no longer be mutated in place across runs the way a refusing door allowed.
// ---------------------------------------------------------------------------
(function T3_chainReceiptFindingFamily() {
  console.log('T3: a stale / missing / red receipt PASSES and reports the typed finding twice');

  // Each case: how to mutate the produced green receipt, whether to stale the tree with a real
  // commit first, and the finding the classification must land on.
  const cases = [
    { id: 'T3a', label: 'missing receipt', stale: false, receipt: () => null,
      expect: 'chains_unverified' },
    { id: 'T3b', label: 'fresh receipt, red chain', stale: false,
      receipt: g => JSON.stringify(Object.assign({}, g, {
        chains: [{ name: 'claude', exitCode: 1, accepted_red: false, timed_out: false }] })),
      expect: 'chains_red' },
    // The observable half of `chains_empty > chains_red`: over an empty array the red filter is
    // vacuously satisfied, so "no red chains" would otherwise be indistinguishable from "no chains
    // ran at all" — and a green finding over zero verified chains is the one classification that
    // would actively mislead the orchestrator now that nothing refuses.
    { id: 'T3c', label: 'fresh receipt, empty chains[]', stale: false,
      receipt: g => JSON.stringify(Object.assign({}, g, { chains: [] })),
      expect: 'chains_empty' },
    { id: 'T3d', label: 'stale receipt', stale: true, receipt: g => JSON.stringify(g),
      expect: 'chains_stale' },
    { id: 'T3e', label: 'precedence: stale beats red', stale: true,
      receipt: g => JSON.stringify(Object.assign({}, g, {
        chains: [{ name: 'claude', exitCode: 1, accepted_red: false, timed_out: false }] })),
      expect: 'chains_stale' },
    { id: 'T3f', label: 'precedence: stale beats empty', stale: true,
      receipt: g => JSON.stringify(Object.assign({}, g, { chains: [] })),
      expect: 'chains_stale' },
    { id: 'T3g', label: 'precedence: unverified beats stale', stale: true,
      receipt: () => '{ this is not json', expect: 'chains_unverified' },
  ];

  let issue = 9030;
  for (const c of cases) {
    const project = 'issue-' + (++issue);
    const fx = buildFinalizeFixture('t3', project, issue);
    try {
      const produced = produceGreenReceipt(fx.repo, fx.project, fx.greenMock);
      assert(produced.receipt !== null, c.id + ': the producer wrote a chain receipt'
        + '\nstderr: ' + String(produced.result.stderr || '').slice(0, 300));
      const green = produced.receipt || {};

      if (c.stale) {
        // Stale the tree with a REAL commit of a code file the receipt never covered.
        fs.writeFileSync(path.join(fx.repo, 'src', 'later.js'), 'module.exports = 2;\n');
        G.commitAll(fx.repo, 'code after the chains ran');
      }
      putReceiptEverywhere(fx.repo, fx.project, c.receipt(green));
      assertNoPlanAnywhere(fx.repo, c.id);

      const { r, out } = fx.finalize();
      passedWithFinding(fx, r, out, c.expect, c.id + ' (' + c.label + ')');
      // A finding does not withhold closure: the roadmap source is still retired.
      assert(!fs.existsSync(path.join(fx.repo, 'kaola-workflow', '.roadmap', project + '.md')),
        c.id + ': closure completes over the finding (roadmap source retired)');
    } finally { rm(fx.base); }
  }
})();

// ---------------------------------------------------------------------------
// T4 (clause 4) — the attribution sweep becomes a REPORT that must not refuse.
//
// ADR 0016: when a refusal becomes a report, the report must durably capture what the refusal was
// freezing; a conversion that emits a verdict and drops the state is a DELETION, not a conversion.
// So the durable write is asserted, not only the envelope field.
//
// `src/orphan.js` is a code path no record describes. `docs/note.md` and `CHANGELOG.md` are
// bookkeeping paths the sweep must DROP (isBookkeepingPath), so their presence in the diff proves
// the filter runs rather than the list being an unfiltered `git diff`.
// ---------------------------------------------------------------------------
(function T4_unattributedDiffReportsRatherThanRefuses() {
  console.log('T4: a diff no record describes PASSES, reports changed_paths, and lands durably');
  const base = makeBase('t4');
  const repo = path.join(base, 'repo');
  const binDir = path.join(base, 'bin');
  const project = 'issue-9004';
  try {
    initSelfHostRepo(repo);
    // Diverge from main so `git diff main...HEAD` is non-empty.
    G.checkout(repo, 'workflow/' + project, { create: true });
    fs.writeFileSync(path.join(repo, 'src', 'orphan.js'), 'module.exports = "orphan";\n');
    fs.writeFileSync(path.join(repo, 'docs', 'note.md'), 'fixture doc, edited\n');
    fs.appendFileSync(path.join(repo, 'CHANGELOG.md'), '\n- a narrative line\n');
    G.commitAll(repo, 'work no record describes');

    writePlanlessProject(repo, project, 9004);
    writeRoadmap(repo, 9004, project);
    const gh = writeGhMock(binDir, [9004]);
    const greenMock = writeGreenChainMock(binDir);
    // Receipt LAST: fresh over the tree that already carries the orphan commit.
    const produced = produceGreenReceipt(repo, project, greenMock);
    assert(produced.receipt !== null, 'T4: the producer wrote a chain receipt');

    const result = runClaim(['finalize', '--project', project, '--base', 'main'], repo, gh);
    const out = lastJson(result);

    assert(result.status === 0, 'T4: a finalize whose diff touches undescribed paths PASSES; got ' + result.status
      + '\nstdout: ' + String(result.stdout || '').slice(0, 900)
      + '\nstderr: ' + String(result.stderr || '').slice(0, 400));
    assert(out !== null, 'T4: finalize emits a JSON envelope');
    assert(!carriesToken(out, 'unattributed_change'),
      'T4: unattributed_change is deleted — an undescribed path must never refuse; got '
      + JSON.stringify(out && { reason: out.reason, inner_reason: out.inner_reason }));
    assert(out && out.result !== 'refuse',
      'T4: finalize does not refuse; got ' + JSON.stringify(out && { result: out.result, reason: out.reason }));

    // (a) the envelope reports it
    assert(out && Array.isArray(out.changed_paths),
      'T4: the envelope carries a changed_paths array; got ' + JSON.stringify(out && out.changed_paths));
    const cp = (out && Array.isArray(out.changed_paths)) ? out.changed_paths.map(String) : [];
    assert(cp.includes('src/orphan.js'),
      'T4: changed_paths reports the undescribed code path; got ' + JSON.stringify(cp));
    // The raw `git diff main...HEAD` for this fixture is exactly
    // [CHANGELOG.md, docs/note.md, src/orphan.js], so each negative below distinguishes a
    // bookkeeping-FILTERED list from an unfiltered diff. `cp.length > 0` is folded into each so
    // none of them can pass vacuously on an empty (or absent) list.
    assert(cp.length > 0 && !cp.includes('docs/note.md'),
      'T4: bookkeeping docs/** is dropped from changed_paths; got ' + JSON.stringify(cp));
    assert(cp.length > 0 && !cp.includes('CHANGELOG.md'),
      'T4: repo-root CHANGELOG.md is dropped from changed_paths; got ' + JSON.stringify(cp));
    assert(cp.length > 0 && !cp.some(p => p.startsWith('kaola-workflow/' + project + '/')),
      'T4: the active project tree is dropped from changed_paths; got ' + JSON.stringify(cp));

    // (b) the report is DURABLE — the state the refusal used to freeze survives the run
    const summary = readFinalizationSummary(repo, project, out && out.dest);
    assert(summary !== null, 'T4: finalization-summary.md exists after finalize (live or archived)');
    if (summary) {
      const body = sectionBody(summary.text, '## Changed Paths');
      assert(body !== null,
        'T4: finalization-summary.md carries a `## Changed Paths` heading (' + summary.path + ')');
      if (body !== null) {
        assert(body.includes('src/orphan.js'),
          'T4: the durable `## Changed Paths` section records the undescribed path; got ' + JSON.stringify(body.slice(0, 400)));
      }
    }
  } finally { rm(base); }
})();

// ---------------------------------------------------------------------------
// T5 (clause 5) — `run-chains.js --release-check` reproduces EVERY plan-validator release refusal.
//
// The release gate is a live, load-bearing pre-tag gate whose host dies. Every documented delta
// from the finalize arm gets one scenario: strict headSha equality, a missing/`unknown` headSha, a
// dirty-stamped receipt, any waiver, a subset receipt, and an unresolvable chain set. A PASS case
// is included so the whole set cannot be satisfied by a gate that only ever refuses.
//
// Strict headSha equality is the ONLY binding: #881's release-prep carry-over is gone (#888
// measured that the sink's archive commit always interposed off-surface paths, so it could not
// fire), and the four-chain run at the release commit is mandatory every time.
// ---------------------------------------------------------------------------
(function T5_releaseCheck() {
  console.log('T5: run-chains.js --release-check reproduces every release refusal');
  const base = makeBase('t5');
  const repo = path.join(base, 'repo');
  try {
    initSelfHostRepo(repo);
    const head = G.head(repo);
    const allFour = ['claude', 'codex', 'gitlab', 'gitea'];
    const chainRows = names => names.map(n => ({ name: n, exitCode: 0, accepted_red: false, timed_out: false }));
    const writeRootReceipt = obj => {
      const p = rootReceiptPath(repo);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    const releaseCheck = (cwd) => {
      const r = runChains(cwd || repo, ['--release-check', '--json']);
      return { r, out: lastJson(r) };
    };
    const base_ = {
      headSha: head,
      workTreeHash: 'clean',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      chains: chainRows(allFour)
    };

    // --- T5a: the legal path is green (a gate that only refuses proves nothing) ---
    writeRootReceipt(base_);
    let x = releaseCheck();
    assert(x.r.status === 0, 'T5a: a clean, all-green, unwaived, complete receipt at the candidate PASSES; got '
      + x.r.status + '\nstdout: ' + String(x.r.stdout || '').slice(0, 500) + '\nstderr: ' + String(x.r.stderr || '').slice(0, 300));
    assert(x.out && x.out.result === 'pass',
      'T5a: emits result pass; got ' + JSON.stringify(x.out && { result: x.out.result, reason: x.out.reason }));

    // --- T5b: sha MISMATCH -> chains_stale (strict equality; no codeTreeHash relaxation) ---
    writeRootReceipt(Object.assign({}, base_, { headSha: '0'.repeat(40) }));
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_stale', 'T5b (headSha != candidate)');

    // --- T5c: headSha MISSING -> chains_stale ---
    const noHead = Object.assign({}, base_); delete noHead.headSha;
    writeRootReceipt(noHead);
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_stale', 'T5c (headSha missing)');

    // --- T5d: headSha "unknown" -> chains_stale (an unbound receipt proves nothing) ---
    writeRootReceipt(Object.assign({}, base_, { headSha: 'unknown' }));
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_stale', 'T5d (headSha "unknown")');

    // --- T5e: DIRTY-stamped receipt -> chains_stale ---
    writeRootReceipt(Object.assign({}, base_, { workTreeHash: 'deadbeefdeadbeef' }));
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_stale', 'T5e (dirty-stamped receipt)');

    // --- T5f: any WAIVER -> chains_waived (legal at finalize, never for a tag) ---
    const waived = Object.assign({}, base_, {
      chains: chainRows(allFour).map(c => c.name === 'gitea'
        ? { name: 'gitea', exitCode: 1, accepted_red: true, accepted_red_issue: '123', timed_out: false }
        : c)
    });
    writeRootReceipt(waived);
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_waived', 'T5f (waived chain)');

    // --- T5g: SUBSET receipt -> chains_incomplete ---
    writeRootReceipt(Object.assign({}, base_, { chains: chainRows(['claude']) }));
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_incomplete', 'T5g (subset receipt)');

    // --- T5h: UNRESOLVABLE chain set -> repo_kind_undetermined (fail closed; never a vacuous
    // coverage pass over an empty expected set). Its own repo: package.json declares no chains. ---
    const repo2 = path.join(base, 'repo-nochains');
    fs.mkdirSync(repo2, { recursive: true });
    G.init(repo2, { branch: 'main' });
    fs.writeFileSync(path.join(repo2, 'package.json'),
      JSON.stringify({ name: 'no-chains', version: '0.0.0', scripts: { build: 'true' } }, null, 2) + '\n');
    fs.writeFileSync(path.join(repo2, '.gitignore'), '/.cache/\n');
    G.commitAll(repo2, 'init');
    const head2 = G.head(repo2);
    const p2 = path.join(repo2, '.cache', 'chain-receipt.json');
    fs.mkdirSync(path.dirname(p2), { recursive: true });
    fs.writeFileSync(p2, JSON.stringify(Object.assign({}, base_, { headSha: head2 })));
    x = releaseCheck(repo2);
    refusedWith(x.r, x.out, 'repo_kind_undetermined', 'T5h (unresolvable chain set)');

    // --- T5i: NO receipt -> chains_unverified (the family's head, unchanged from the old verb) ---
    try { fs.unlinkSync(rootReceiptPath(repo)); } catch (_) {}
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_unverified', 'T5i (no receipt)');

    // --- T5j: NO SECOND BINDING ROUTE. An ANCESTOR receipt whose entire intervening diff lies
    // inside the release-prep surface (RELEASE_FILES, version-only JSON) still refuses. That is the
    // exact shape #881's carry-over accepted and #888 deleted. It is pinned BEHAVIOURALLY rather
    // than by envelope shape because run-chains.js rebuilds the pass envelope key by key, so a
    // re-added route's `binding`/`carryOver` keys never reach stdout and a key-set assertion here
    // could never go red. ---
    writeRootReceipt(base_);                       // green receipt still stamped at `head`
    const pkgPath = path.join(repo, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = '0.0.1';                         // version-only bump: the release-prep shape
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## [0.0.1] - 2026-01-01\n');
    G.commitPaths(repo, ['package.json', 'CHANGELOG.md'], 'release prep');
    assert(G.head(repo) !== head, 'T5j: the release-prep commit advanced HEAD (the fixture is real)');
    x = releaseCheck();
    refusedWith(x.r, x.out, 'chains_stale', 'T5j (ancestor receipt, release-prep-only diff)');

  } finally { rm(base); }
})();

// ---------------------------------------------------------------------------
// T6 (clause 6) — archive completeness is a MEASUREMENT, not a derivation.
//
// The old proof derived a required set from the ledger (`complete` row implies `.cache/<id>.md`)
// and dies with the ledger. The replacement property: the archive is complete IFF every file
// present under the run folder before the move is present after it. Stronger (it covers files no
// ledger row implied), declaration-free, and still a refusal — losing a durable record during an
// archive move is exactly the irreversible harm a refusal is for.
// ---------------------------------------------------------------------------
(function T6_archiveCompleteness() {
  console.log('T6: an archive that drops a file refuses; one that moves everything passes');
  const base = makeBase('t6');
  let verifyArchiveComplete = null;
  try {
    verifyArchiveComplete = require('./kaola-workflow-claim').verifyArchiveComplete;
  } catch (e) {
    assert(false, 'T6: claim.js exports verifyArchiveComplete; require failed: ' + (e && e.message));
  }
  try {
    if (typeof verifyArchiveComplete !== 'function') {
      assert(false, 'T6: verifyArchiveComplete is exported as a function');
      return;
    }
    const mkRun = (name, opts) => {
      const o = opts || {};
      const dir = path.join(base, name);
      fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'workflow-state.md'), '# state\nname: ' + name + '\n');
      fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# summary\n');
      fs.writeFileSync(path.join(dir, '.cache', 'n1.md'), 'evidence n1\n');
      fs.writeFileSync(path.join(dir, '.cache', 'run-notes.md'), 'notes\n');
      if (o.plan) fs.writeFileSync(path.join(dir, 'workflow-plan.md'), o.plan);
      // #901: the fixed finalize/machinery sidecars, planted only where a case asks for them so
      // T6a-T6f keep measuring exactly what they measured before.
      for (const name of (o.sidecars || [])) {
        fs.writeFileSync(path.join(dir, '.cache', name), 'sidecar ' + name + '\n');
      }
      return dir;
    };
    const copyRun = (src, destName, drop) => {
      const dest = path.join(base, destName);
      fs.mkdirSync(dest, { recursive: true });
      for (const rel of walkFiles(src, '', [])) {
        if (drop && drop.includes(rel)) continue;
        const to = path.join(dest, ...rel.split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(src, ...rel.split('/')), to);
      }
      return dest;
    };

    // --- T6a: a LOSSLESS move passes ---
    const src1 = mkRun('src1');
    const dest1 = copyRun(src1, 'dest1');
    let v = verifyArchiveComplete(src1, dest1);
    assert(v && v.ok === true, 'T6a: a copy carrying every source file is complete; got ' + JSON.stringify(v));

    // --- T6b: dropping per-node evidence refuses ---
    const src2 = mkRun('src2');
    const dest2 = copyRun(src2, 'dest2', ['.cache/n1.md']);
    v = verifyArchiveComplete(src2, dest2);
    assert(v && v.ok === false, 'T6b: a copy that dropped .cache/n1.md refuses; got ' + JSON.stringify(v));
    assert(v && Array.isArray(v.missing) && v.missing.includes('.cache/n1.md'),
      'T6b: the dropped path is named; got ' + JSON.stringify(v && v.missing));

    // --- T6c: dropping ANY file under the run folder refuses, ledger or no ledger. `run-notes.md`
    // is a file no ledger row would ever imply — the "stronger than the old check" half. ---
    const src3 = mkRun('src3');
    const dest3 = copyRun(src3, 'dest3', ['.cache/run-notes.md']);
    v = verifyArchiveComplete(src3, dest3);
    assert(v && v.ok === false,
      'T6c: a copy that dropped a file no ledger row implied refuses; got ' + JSON.stringify(v));

    // --- T6d: the state file itself ---
    const src4 = mkRun('src4');
    const dest4 = copyRun(src4, 'dest4', ['workflow-state.md']);
    v = verifyArchiveComplete(src4, dest4);
    assert(v && v.ok === false, 'T6d: a copy that dropped workflow-state.md refuses; got ' + JSON.stringify(v));

    // --- T6e: the DERIVATION is gone. A ledger row naming evidence the SOURCE never held must not
    // be demanded of the destination — the property is "every file present before the move", and a
    // file that was never present cannot have been lost by the move. The legacy ledger-derived
    // option is passed explicitly so a surviving derivation is caught rather than merely unused. ---
    const src5 = mkRun('src5', {
      plan: ['# Workflow Plan', '', '## Node Ledger', '', '| id | status |', '|---|---|',
        '| n1 | complete |', '| ghost | complete |', ''].join('\n')
    });
    const dest5 = copyRun(src5, 'dest5');
    v = verifyArchiveComplete(src5, dest5, { requireLedgerEvidence: true });
    assert(v && v.ok === true,
      'T6e: a lossless move passes even though a ledger row names evidence the source never held; got '
      + JSON.stringify(v));

    // --- T6f: an EXTRA file in the destination is not a loss ---
    const src6 = mkRun('src6');
    const dest6 = copyRun(src6, 'dest6');
    fs.writeFileSync(path.join(dest6, '.cache', 'extra.md'), 'added by the archiver\n');
    v = verifyArchiveComplete(src6, dest6);
    assert(v && v.ok === true, 'T6f: a destination holding MORE than the source is still complete; got ' + JSON.stringify(v));

    // --- T6g (#901): THE EXEMPTION IS THE GAP, stated as a measurement -------------------------
    //
    // verifyArchiveComplete deliberately EXEMPTS the fixed finalize/machinery `.cache/*.md`
    // sidecars from its comparison (claim.js:5126 skips them in the source walk, and
    // listSourceEvidenceFiles:5074 subtracts them from the required set). So for those names it
    // answers a question it was never asked: `ok: true` over a destination that does not hold them.
    // That is not a bug in this function — the archive contract makes those sidecars optional — but
    // it IS the reason a separate PRESENCE re-check has to exist before the delete, because `ok:
    // true` here is what authorizes destroying the live source.
    //
    // Every name is driven separately rather than as one set, because the exemption is by exact
    // basename: a set-membership bug that dropped one name would be invisible to a single-name arm.
    // If a name is ever REMOVED from the shipped set this arm reds (the file becomes required, so
    // `ok` goes false) — stale-loud, not stale-silent. The reverse drift, a name ADDED to the set,
    // is caught by the source-text pin below rather than by behaviour.
    const claimSrc901 = fs.readFileSync(path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js'), 'utf8');
    const setBlock901 = claimSrc901.match(/ARCHIVE_CACHE_SIDECAR_MD\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    const shipped901 = setBlock901
      ? (setBlock901[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1))
      : null;
    const EXPECTED_SIDECARS_901 = ['final-validation.md', 'run-gaps-manual.md',
      'selection-evidence.md', 'doc-docking.md', 'doc-updater.md'];
    assert(shipped901 !== null, 'T6g: the ARCHIVE_CACHE_SIDECAR_MD set is readable from claim.js');
    assert(shipped901 !== null && shipped901.length === EXPECTED_SIDECARS_901.length
      && EXPECTED_SIDECARS_901.every(n => shipped901.includes(n)),
      'T6g: the exempt-sidecar set is exactly the five names the arms below drive. A name added here '
      + 'without an arm is an exemption nothing measures; got ' + JSON.stringify(shipped901));

    const drivenSidecars901 = shipped901 || EXPECTED_SIDECARS_901;
    drivenSidecars901.forEach((sidecar, i) => {
      const src = mkRun('src901-' + i, { sidecars: drivenSidecars901 });
      const dest = copyRun(src, 'dest901-' + i, ['.cache/' + sidecar]);
      const r = verifyArchiveComplete(src, dest);
      assert(r && r.ok === true,
        'T6g[' + sidecar + ']: a destination missing this EXEMPT sidecar still reports complete — '
        + 'which is exactly why byte-completeness alone cannot authorize the delete for these five '
        + 'names; got ' + JSON.stringify(r));
      assert(r && Array.isArray(r.missing) && !r.missing.includes('.cache/' + sidecar),
        'T6g[' + sidecar + ']: and it is not even NAMED in missing[], so no caller can recover the '
        + 'fact from this return value; got ' + JSON.stringify(r && r.missing));
    });

    // --- T6h: the DISCRIMINATING CONTROL, on the identical fixture shape ------------------------
    // Without this, T6g proves nothing: a fixture broken in any way that made everything pass would
    // read the same. Same builder, same sidecars present, one NON-exempt `.cache/*.md` dropped
    // instead — and the answer must flip. A control that agreed with T6g would mean the control is
    // wrong, not that the exemption is wide.
    const src901c = mkRun('src901c', { sidecars: drivenSidecars901 });
    const dest901c = copyRun(src901c, 'dest901c', ['.cache/n1.md']);
    v = verifyArchiveComplete(src901c, dest901c);
    assert(v && v.ok === false && Array.isArray(v.missing) && v.missing.includes('.cache/n1.md'),
      'T6h control: on the SAME shape, dropping a NON-exempt .cache/*.md must refuse and name it — '
      + 'so T6g\'s `ok: true` is caused by the exemption and not by a fixture that cannot fail; got '
      + JSON.stringify(v));

    // --- T6i: the exemption's SCOPE — silent about the sidecar even while already refusing --------
    // Drop one exempt sidecar AND one non-exempt file together. The refusal fires for the non-exempt
    // file only, and missing[] stays silent about the sidecar. This is the sharpest form of the gap:
    // even on a return value that is already `ok: false`, a caller cannot learn that a sidecar was
    // lost, so it cannot be recovered downstream from this signal at all.
    const src901d = mkRun('src901d', { sidecars: drivenSidecars901 });
    const dest901d = copyRun(src901d, 'dest901d', ['.cache/n1.md', '.cache/final-validation.md']);
    v = verifyArchiveComplete(src901d, dest901d);
    assert(v && v.ok === false && Array.isArray(v.missing)
      && v.missing.includes('.cache/n1.md') && !v.missing.includes('.cache/final-validation.md'),
      'T6i: missing[] names the non-exempt loss and stays silent about the exempt one even when it is '
      + 'already refusing; got ' + JSON.stringify(v));
  } finally { rm(base); }
})();

// ---------------------------------------------------------------------------
// T7 (clause 7) — the producer and the gate compute the SAME codeTreeHash.
//
// One shared constant, one shared helper, no second copy. The producer's value is taken from a
// REAL receipt it stamped; the gate's value is recomputed through the relocated helper on the
// survivor module. Two copies of this computation is exactly the #710 candidate-band mismatch the
// shared reference was introduced to resolve, and the relocation must not reintroduce it.
// ---------------------------------------------------------------------------
(function T7_producerAndGateAgreeOnCodeTreeHash() {
  console.log('T7: producer and gate compute the same codeTreeHash from one shared helper + constant');
  const base = makeBase('t7');
  const repo = path.join(base, 'repo');
  const binDir = path.join(base, 'bin');
  const project = 'issue-9007';
  let schema = null;
  try { schema = require(adaptiveSchemaPath); } catch (e) { schema = null; }
  try {
    assert(schema !== null, 'T7: kaola-workflow-adaptive-schema.js is requireable');

    // The relocation surface the spec names by destination. These are the symbols the finalize door
    // and the release gate are rebuilt on; a missing one means the extraction did not land where
    // the cross-edition drift anchor can hold it.
    assert(schema && typeof schema.computeCodeTreeHash === 'function',
      'T7: adaptive-schema exports computeCodeTreeHash');
    assert(schema && typeof schema.isBookkeepingPath === 'function',
      'T7: adaptive-schema exports isBookkeepingPath (the renamed isBarrierInvisible)');
    assert(schema && typeof schema.evaluateChainReceipt === 'function',
      'T7: adaptive-schema exports evaluateChainReceipt');
    assert(schema && typeof schema.evaluateReleaseReceipt === 'function',
      'T7: adaptive-schema exports evaluateReleaseReceipt');
    assert(schema && Array.isArray(schema.VALIDATION_TEST_CONSUMES),
      'T7: adaptive-schema exports VALIDATION_TEST_CONSUMES as an array; got '
      + JSON.stringify(schema && schema.VALIDATION_TEST_CONSUMES));
    assert(schema && Array.isArray(schema.VALIDATION_TEST_CONSUMES) && schema.VALIDATION_TEST_CONSUMES.length === 0,
      'T7: VALIDATION_TEST_CONSUMES is [] — the relocation is behaviour-preserving; got '
      + JSON.stringify(schema && schema.VALIDATION_TEST_CONSUMES));
    // `Object.isFrozen(undefined)` is `true`, so the Array.isArray guard is load-bearing: without
    // it this assertion passes on a module that exports nothing at all.
    assert(schema && Array.isArray(schema.VALIDATION_TEST_CONSUMES) && Object.isFrozen(schema.VALIDATION_TEST_CONSUMES),
      'T7: VALIDATION_TEST_CONSUMES is frozen — one shared reference both readers cannot mutate apart');

    // isBookkeepingPath: behaviour unchanged from isBarrierInvisible (path SHAPE, not suffix).
    if (schema && typeof schema.isBookkeepingPath === 'function') {
      const bk = schema.isBookkeepingPath;
      assert(bk('CHANGELOG.md') === true, 'T7: repo-root CHANGELOG.md is bookkeeping');
      assert(bk('README.md') === true, 'T7: repo-root README.md is bookkeeping');
      assert(bk('docs/decisions/0017-the-mission-list.md') === true, 'T7: docs/** at any depth is bookkeeping');
      assert(bk('kaola-workflow/issue-877/workflow-state.md', 'issue-877') === true,
        'T7: the active project tree is bookkeeping');
      assert(bk('src/app.js') === false, 'T7: production code is NOT bookkeeping');
      assert(bk('plugins/kaola-workflow/README.md') === false,
        'T7: a nested README.md is NOT repo-root and NOT bookkeeping');
      assert(bk('agents/test-author.md') === false, 'T7: a behavioural agents/*.md is NOT bookkeeping');
      assert(bk('kaola-workflow/issue-999/x.md', 'issue-877') === false,
        'T7: a FOREIGN project tree is not the active project band');
    }

    initSelfHostRepo(repo);
    const greenMock = writeGreenChainMock(binDir);
    const produced = produceGreenReceipt(repo, project, greenMock);
    assert(produced.receipt !== null, 'T7: the producer wrote a chain receipt'
      + '\nstderr: ' + String(produced.result.stderr || '').slice(0, 400));
    const stamped = produced.receipt && produced.receipt.codeTreeHash;
    assert(typeof stamped === 'string' && /^[0-9a-f]{64}$/.test(stamped),
      'T7: the producer stamps a sha256 codeTreeHash; got ' + JSON.stringify(stamped));

    if (schema && typeof schema.computeCodeTreeHash === 'function') {
      const gateHash = schema.computeCodeTreeHash(repo, project, schema.VALIDATION_TEST_CONSUMES);
      assert(gateHash === stamped,
        'T7: the gate recomputes the producer\'s codeTreeHash over the same tree; producer='
        + JSON.stringify(stamped) + ' gate=' + JSON.stringify(gateHash));
      // The shared constant is the band: reading it and passing [] must agree today, which is what
      // makes the relocation behaviour-preserving rather than a silent widening.
      assert(schema.computeCodeTreeHash(repo, project, []) === gateHash,
        'T7: VALIDATION_TEST_CONSUMES and [] address the same band today');
      // And the hash is a real content address, not a constant: a code edit must flip it.
      fs.writeFileSync(path.join(repo, 'src', 'app.js'), 'module.exports = 99;\n');
      assert(schema.computeCodeTreeHash(repo, project, schema.VALIDATION_TEST_CONSUMES) !== gateHash,
        'T7: a code edit flips the code-tree hash (it is a content address, not a constant)');
    }
  } finally { rm(base); }
})();

// ---------------------------------------------------------------------------
// T8 (#900) — the CONSUMER arm's producer and the gate agree, and the producer binds THE TREE IT IS
// STANDING IN.
//
// T7 pins producer==gate for the SELF-HOST arm, where the producer is run-chains.js. The consumer arm
// had NO producer at all: the gate demands a column-0 `validated_candidate_hash` equal to a freshly
// recomputed code-tree hash, and no shipped command printed that value — so an agent following the
// recorded recipe verbatim earned `final_validation_unbound` on a run whose own tests all passed.
// `kaola-workflow-validation-runner.js record` is that missing producer, and this is its twin of T7.
//
// THE RECIPE IS THE THING UNDER TEST, so every leg drives the real CLI from a shell: no internal
// require() of the hash function, and no hand-copied value anywhere. A test that computed the hash
// itself and wrote it into the file would be measuring the test.
//
// TWO WAYS TO GET THIS WRONG, and a negative control for each, because a leg that only asserts
// "green" cannot tell a right answer from a lucky one:
//   * THE FUNCTION. This module's own computeLandableTreeDigest is a DIFFERENT algorithm over the
//     same visibility band and yields a different value on the same tree. T8e records that value
//     and requires `final_validation_stale`.
//   * THE TREE. main and a linked worktree agree only while the branch carries nothing main lacks —
//     i.e. they differ across exactly the pre-merge window a finalize happens in. T8l builds that
//     divergence and requires the recorded value to be provably the WORKTREE's: the same bytes read
//     with the gate standing in main must come back stale.
// ---------------------------------------------------------------------------
(function T8_consumerRecorderAndGateAgree() {
  console.log('T8: the consumer arm\'s `record` producer and the finalize gate agree on one candidate hash');
  const base = makeBase('t8');
  const project = 'issue-9008';
  let schema = null;
  try { schema = require(adaptiveSchemaPath); } catch (_) { schema = null; }
  let runnerMod = null;
  try { runnerMod = require(validationRunnerScript); } catch (_) { runnerMod = null; }
  try {
    assert(schema !== null && runnerMod !== null,
      'T8: adaptive-schema and validation-runner are both requireable');
    if (!schema || !runnerMod) return;

    // --- the CONSUMER fixture: no package.json anywhere, so the gate takes the final-validation arm.
    const repo = fs.realpathSync(initConsumerRepo(path.join(base, 'repo'), project));
    const cacheDir = path.join(repo, 'kaola-workflow', project, '.cache');
    const fvPath = path.join(cacheDir, 'final-validation.md');
    const gate = root => schema.evaluateChainReceipt(root, { cacheDir, project });
    assert(gate(repo).mode === 'final-validation',
      'T8 premise: a repo with no package.json is a CONSUMER repo, so the gate reads '
      + '.cache/final-validation.md and not a chain receipt; got mode=' + JSON.stringify(gate(repo).mode));

    // --- T8a: the PRE-#900 recipe — a verdict and the command, no hash. This is the state the issue
    // reports, and it is also the positive control for the whole leg: the fixture provably reaches
    // the arm under test and provably refuses there.
    fs.writeFileSync(fvPath, 'verdict: pass\nvalidation_command: swift test\n');
    let g = gate(repo);
    assert(g.classification === 'final_validation_unbound' && g.green === false,
      'T8a: a hand-written verdict with no hash is UNBOUND — the recipe was unusable, which is what '
      + '#900 exists to fix; got ' + JSON.stringify({ classification: g.classification, green: g.green }));
    assert(typeof g.operator_hint === 'string' && /\brecord\b/.test(g.operator_hint)
      && /--verdict/.test(g.operator_hint),
      'T8a: the unbound hint must NAME the producer that fixes it — a remediation hint for a command '
      + 'that does not exist is the defect, not the cure; got ' + JSON.stringify(g.operator_hint));

    // --- T8b: the shipped recipe, VERBATIM, through the real CLI. This is the acceptance criterion.
    let rec = runRecord(repo, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(rec.status === 0 && rec.json && rec.json.outcome === 'recorded',
      'T8b: `record` exits 0 having written the binding; got status=' + rec.status
      + ' json=' + JSON.stringify(rec.json) + ' stderr=' + String(rec.stderr || '').slice(0, 300));
    g = gate(repo);
    assert(g.classification === 'chains_green' && g.green === true,
      'T8b: following the shipped recipe VERBATIM must earn a receipt the gate ACCEPTS — no internal '
      + 'require(), no hand-copied hash; got ' + JSON.stringify({ classification: g.classification, green: g.green, detail: g.detail }));
    assert(g.mode === 'final-validation',
      'T8b: and it is accepted on the consumer arm, not by falling through to the chain-receipt arm; got '
      + JSON.stringify(g.mode));

    // --- T8c: PRODUCER == GATE (T7's property, consumer arm). Three values, one answer: what the
    // producer printed, what landed at column zero, and what the gate recomputed.
    // The sentinel is not defensive decoration: on a build where nothing was recorded every leg
    // below must still run and red on ITS OWN assertion, rather than the first missing field
    // crashing the suite and hiding every other arm behind one stack trace.
    const producerHash = (rec.json && rec.json.validated_candidate_hash) || '(nothing was recorded)';
    const gateHash = schema.computeCodeTreeHash(repo, project, schema.VALIDATION_TEST_CONSUMES);
    assert(/^[0-9a-f]{64}$/.test(String(producerHash)),
      'T8c: the producer prints a sha256; got ' + JSON.stringify(producerHash));
    assert(producerHash === gateHash,
      'T8c: the producer and the gate reach the SAME shared computeCodeTreeHash over the same tree — '
      + 'a second copy of this computation is a second answer; producer=' + JSON.stringify(producerHash)
      + ' gate=' + JSON.stringify(gateHash));
    assert(g.validated_candidate_hash === producerHash,
      'T8c: and the value the gate accepted is that same one; got ' + JSON.stringify(g.validated_candidate_hash));
    assert(rec.json && rec.json.candidate_root === repo,
      'T8c: the verb REPORTS which working tree it hashed, so a reader can see that rather than trust it; got '
      + JSON.stringify(rec.json && rec.json.candidate_root));

    // The PLAIN-REPO regression guard (V1 pin 21). Everything off the worktree lane must be
    // byte-for-byte unchanged by a fix aimed at that lane: one tree, the run folder local, so there is
    // no split to report and no sibling tree to warn about. `operator_hint: null` is the observable
    // that says "nothing to tell you" — a fallback that fired here, or a hint that appeared, would both
    // show up as a non-null value.
    assert(rec.json && rec.json.record_path === fvPath,
      'T8c(plain repo): with the folder local the record stays local — the main fallback must not fire '
      + 'when it has nothing to resolve; got ' + JSON.stringify(rec.json && rec.json.record_path));
    assert(rec.json && rec.json.operator_hint === null,
      'T8c(plain repo): and there is nothing to report — a non-null hint here means the worktree-lane '
      + 'message leaked into the ordinary case; got ' + JSON.stringify(rec.json && rec.json.operator_hint));
    assert(rec.json && Array.isArray(rec.json.other_candidate_roots)
      && rec.json.other_candidate_roots.length === 0,
      'T8c(plain repo): no sibling working tree carries this run; got '
      + JSON.stringify(rec.json && rec.json.other_candidate_roots));

    // --- T8d: NEGATIVE — a well-formed but WRONG hash. Without this, T8b passes on a gate that
    // accepts any 64 hex digits.
    const bound = fs.readFileSync(fvPath, 'utf8');
    fs.writeFileSync(fvPath, bound.replace(producerHash, '0'.repeat(64)));
    g = gate(repo);
    assert(g.classification === 'final_validation_stale',
      'T8d: a well-formed hash that is not THIS tree\'s must read stale; got ' + JSON.stringify(g.classification));
    assert(g.recorded_candidate_hash === '0'.repeat(64) && g.current_candidate_hash === producerHash,
      'T8d: both hashes are carried so a reader can check the claim instead of taking it on trust; got '
      + JSON.stringify({ recorded: g.recorded_candidate_hash, current: g.current_candidate_hash }));

    // --- T8e: NEGATIVE — THE WRONG FUNCTION. computeLandableTreeDigest is the plausible mistake: it
    // is exported by the very module `record` lives in, addresses the same visibility band, and
    // returns a well-formed 64-hex value. It is a different algorithm, and the gate must say so.
    const landable = runnerMod.computeLandableTreeDigest(repo);
    assert(/^[0-9a-f]{64}$/.test(String(landable)) && landable !== producerHash,
      'T8e: the runner\'s own computeLandableTreeDigest is a DIFFERENT algorithm over the same band — '
      + 'if these two ever coincided this control would be vacuous; landable=' + JSON.stringify(landable)
      + ' shared=' + JSON.stringify(producerHash));
    fs.writeFileSync(fvPath, bound.replace(producerHash, landable));
    g = gate(repo);
    assert(g.classification === 'final_validation_stale',
      'T8e: recording the runner\'s own digest instead of the shared one buys stale — which is why the '
      + 'band must be read from the shared constant and the hash from the shared helper; got '
      + JSON.stringify(g.classification));

    // --- T8f: NEGATIVE — COLUMN ZERO is load-bearing. The gate's parser is `^`-anchored, so an
    // indented field is silently no binding at all. An assertion that merely grepped the field name
    // would pass on this file.
    fs.writeFileSync(fvPath, bound.replace(/^validated_candidate_hash:/m, '  validated_candidate_hash:'));
    g = gate(repo);
    assert(g.classification === 'final_validation_unbound',
      'T8f: an INDENTED hash line is not a binding — the parser is `^`-anchored, so the producer '
      + 'writing at column zero is a correctness requirement, not formatting; got ' + JSON.stringify(g.classification));

    // --- T8g: NEGATIVE — a 63-hex value is present but malformed, and must not read as bound.
    fs.writeFileSync(fvPath, bound.replace(producerHash, producerHash.slice(0, 63)));
    g = gate(repo);
    assert(g.classification === 'final_validation_unbound',
      'T8g: a 63-hex value is present but malformed and must fail closed exactly as an absent one; got '
      + JSON.stringify(g.classification));

    // --- T8h: the loop CLOSES. The hint told the operator to re-record; doing that returns to green.
    rec = runRecord(repo, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(rec.status === 0 && gate(repo).classification === 'chains_green',
      'T8h: re-running the recorded remediation returns the gate to green — a hint whose own '
      + 'instruction does not close the loop is not a remediation; got status=' + rec.status
      + ' classification=' + JSON.stringify(gate(repo).classification));

    // --- T8i: the binding is a LIVE content address. A code edit must break it, and re-recording
    // must repair it.
    fs.writeFileSync(path.join(repo, 'src', 'app.swift'), 'let x = 2\n');
    g = gate(repo);
    assert(g.classification === 'final_validation_stale',
      'T8i: a code edit after recording must break the binding — otherwise the hash is a constant, '
      + 'not a content address; got ' + JSON.stringify(g.classification));
    const rec2 = runRecord(repo, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(rec2.status === 0 && rec2.json && rec2.json.validated_candidate_hash !== producerHash
      && gate(repo).classification === 'chains_green',
      'T8i: and re-recording over the changed tree binds the NEW candidate; got '
      + JSON.stringify({ status: rec2.status, hash: rec2.json && rec2.json.validated_candidate_hash }));

    // --- T8j: MERGE, NEVER CLOBBER, and byte-idempotent — over a file the agent already wrote prose
    // into, which is the shape a real consumer run has.
    fs.writeFileSync(fvPath, [
      '# Final Validation', '',
      '## Command', '```', 'swift test', '```', '',
      '## Result', 'All 412 tests passed on 2026-08-01.', ''
    ].join('\n'));
    const recProse = runRecord(repo, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(recProse.status === 0, 'T8j: recording over agent prose exits 0; got ' + recProse.status);
    const withProse = fs.readFileSync(fvPath, 'utf8');
    assert(withProse.includes('# Final Validation') && withProse.includes('All 412 tests passed on 2026-08-01.'),
      'T8j: the agent\'s own evidence survives byte-for-byte; got ' + JSON.stringify(withProse));
    assert(gate(repo).classification === 'chains_green',
      'T8j: and the gate still accepts it — the prose does not shadow the binding; got '
      + JSON.stringify(gate(repo).classification));
    runRecord(repo, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(fs.readFileSync(fvPath, 'utf8') === withProse,
      'T8j: re-recording is BYTE-IDENTICAL — the file does not grow and no superseded binding is left '
      + 'below the new one to win last-match-wins');

    // --- T8k: exit 0 means THE RECORD WAS WRITTEN. A `fail` verdict is a successful write of a
    // bound failure, and the gate reads it as such.
    const recFail = runRecord(repo, ['--project', project, '--verdict', 'fail', '--command', 'swift test']);
    assert(recFail.status === 0 && recFail.json && recFail.json.verdict === 'fail',
      'T8k: a `--verdict fail` record is a successful WRITE, not a non-zero exit — read `verdict` for '
      + 'the validation outcome; got status=' + recFail.status + ' json=' + JSON.stringify(recFail.json));
    assert(gate(repo).classification === 'final_validation_failed',
      'T8k: and the gate classifies the recorded failure from the file; got '
      + JSON.stringify(gate(repo).classification));
  } finally { rm(base); }
})();

// ---------------------------------------------------------------------------
// T8l (#900) — THE LINKED-WORKTREE BINDING. Its own fixture, because the property needs two working
// trees of one repository whose code-tree hashes genuinely differ.
//
// The gate hashes the tree ITS OWN shell is in. Under a worktree run the run folder exists twice, so
// a record written from one checkout and a finalize run from the other disagree by construction — and
// they differ across exactly the pre-merge window a finalize happens in. Asserting only "green from
// the worktree" passes on a recorder that hashes main, so the load-bearing half is the inverse: the
// SAME bytes, read with the gate standing in main, must come back stale naming main's hash.
// ---------------------------------------------------------------------------
(function T8l_recordBindsTheTreeItStandsIn() {
  console.log('T8l: `record` binds the working tree it was invoked from, provably not the other one');
  const base = makeBase('t8l');
  const project = 'issue-9009';
  let schema = null;
  try { schema = require(adaptiveSchemaPath); } catch (_) { schema = null; }
  try {
    assert(schema !== null, 'T8l: adaptive-schema is requireable');
    if (!schema) return;
    // The worktree is a SIBLING of the main checkout, never nested inside it: a nested worktree
    // enters main's own snapshot as a gitlink and the divergence being measured becomes an artifact
    // of the fixture rather than a fact about the two trees.
    const mainRoot = fs.realpathSync(initConsumerRepo(path.join(base, 'main'), null));
    const wtRoot = path.join(base, 'wt');
    G.git(mainRoot, ['worktree', 'add', '-q', '-b', 'workflow/' + project, wtRoot],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    const wt = fs.realpathSync(wtRoot);
    // ONE un-merged code commit on the branch — without it the two trees are byte-identical and the
    // whole leg is vacuous.
    fs.writeFileSync(path.join(wt, 'src', 'feature.swift'), 'let feature = true\n');
    G.commitAll(wt, 'feat: branch-only code');
    const wtProject = path.join(wt, 'kaola-workflow', project);
    fs.mkdirSync(path.join(wtProject, '.cache'), { recursive: true });

    const mainHash = schema.computeCodeTreeHash(mainRoot, project, schema.VALIDATION_TEST_CONSUMES);
    const wtHash = schema.computeCodeTreeHash(wt, project, schema.VALIDATION_TEST_CONSUMES);
    assert(/^[0-9a-f]{64}$/.test(String(mainHash)) && mainHash !== wtHash,
      'T8l premise: the two working trees must genuinely DIVERGE, or nothing below discriminates; main='
      + JSON.stringify(mainHash) + ' worktree=' + JSON.stringify(wtHash));

    // Recorded from the WORKTREE.
    const rec = runRecord(wt, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(rec.status === 0 && rec.json && rec.json.candidate_root === wt,
      'T8l: `record` invoked from the linked worktree resolves THAT tree as the candidate; got status='
      + rec.status + ' json=' + JSON.stringify(rec.json) + ' stderr=' + String(rec.stderr || '').slice(0, 300));
    assert(rec.json && rec.json.validated_candidate_hash === wtHash,
      'T8l: it binds the WORKTREE\'s hash, not main\'s; recorded='
      + JSON.stringify(rec.json && rec.json.validated_candidate_hash) + ' worktree=' + JSON.stringify(wtHash)
      + ' main=' + JSON.stringify(mainHash));
    const wtCache = path.join(wtProject, '.cache');
    let g = schema.evaluateChainReceipt(wt, { cacheDir: wtCache, project });
    assert(g.classification === 'chains_green' && g.green === true,
      'T8l: the gate standing in the worktree accepts it; got ' + JSON.stringify(g.classification));

    // THE LOAD-BEARING INVERSE. Mirror the run folder into main exactly as the finalize transaction's
    // Step 8a does, so the file the gate reads is byte-identical — then stand in main.
    const mainProject = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(mainProject, '.cache'), { recursive: true });
    const wtRecord = path.join(wtCache, 'final-validation.md');
    const mainRecord = path.join(mainProject, '.cache', 'final-validation.md');
    assert(fs.existsSync(wtRecord),
      'T8l: there must BE a record to mirror — the inverse below is a statement about the same bytes '
      + 'read from two trees, and it has no subject if the producer wrote nothing');
    if (fs.existsSync(wtRecord)) {
      fs.copyFileSync(wtRecord, mainRecord);
      assert(fs.readFileSync(wtRecord, 'utf8') === fs.readFileSync(mainRecord, 'utf8'),
        'T8l: the two copies are byte-identical, so only the READER\'s tree varies below');
      g = schema.evaluateChainReceipt(mainRoot, { cacheDir: path.join(mainProject, '.cache'), project });
      assert(g.classification === 'final_validation_stale',
        'T8l: the SAME bytes read with the gate standing in MAIN come back stale — which is what proves '
        + 'the recorded value was the worktree\'s and not main\'s; got ' + JSON.stringify(g.classification));
      assert(g.recorded_candidate_hash === wtHash && g.current_candidate_hash === mainHash,
        'T8l: and it names both trees\' hashes, so the claim is checkable; got '
        + JSON.stringify({ recorded: g.recorded_candidate_hash, current: g.current_candidate_hash }));
    }

    // Standing in the WRONG checkout does not silently bind it. main now carries the mirrored folder,
    // so the refusal is measured on a project claimed only in the worktree.
    //
    // THE FALLBACK IS ONE-DIRECTIONAL, AND THIS ARM IS WHAT KEEPS IT THAT WAY. `record` resolves the
    // run folder in this tree and then in MAIN, so a main-resident folder IS reachable from a linked
    // worktree (T8m below). The reverse must never be added: main's hash bound to a worktree-resident
    // run folder is the wrong tree, in mirror image, and a symmetric fallback would reintroduce
    // exactly the wrong-tree binding T8l exists to forbid. Do not relax this into a success case.
    const unclaimed = 'issue-9009b';
    fs.mkdirSync(path.join(wt, 'kaola-workflow', unclaimed, '.cache'), { recursive: true });
    const wrongTree = runRecord(mainRoot, ['--project', unclaimed, '--verdict', 'pass', '--command', 'swift test']);
    assert(wrongTree.status === 1 && wrongTree.json
      && Array.isArray(wrongTree.json.reasons) && wrongTree.json.reasons.includes('project_folder_missing'),
      'T8l: recording from main for a run claimed only in the worktree REFUSES rather than hashing '
      + 'whatever tree the shell is in — a plausible-looking hash bound to the wrong candidate is worse '
      + 'than none; got status=' + wrongTree.status + ' json=' + JSON.stringify(wrongTree.json));
    assert(wrongTree.json && wrongTree.json.validated_candidate_hash === null,
      'T8l: and it writes no binding at all; got '
      + JSON.stringify(wrongTree.json && wrongTree.json.validated_candidate_hash));
    assert(!fs.existsSync(path.join(mainRoot, 'kaola-workflow', unclaimed)),
      'T8l: the refusal creates nothing in the wrong checkout');
  } finally {
    try {
      const mainRoot = path.join(base, 'main');
      G.git(mainRoot, ['worktree', 'remove', '--force', path.join(base, 'wt')],
        { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (_) { /* the rm below takes it either way */ }
    rm(base);
  }
})();

// ---------------------------------------------------------------------------
// T8m (#900 / V1) — THE WORKTREE LANE. The hash follows the INVOKING tree; the record follows the
// RUN FOLDER; they are resolved separately because the gate reads them separately.
//
// In the standard worktree lane the run folder is resident in MAIN and the linked worktree does not
// carry it (Step 8a copies main→worktree later). Requiring one tree to be both is unsatisfiable
// there: standing in the worktree there was nowhere to write (`record` exited 1 on a hint that told
// you to record from the tree you were already standing in — the loop), and standing in main the
// hash binds the wrong tree. So `record` from the worktree now hashes the WORKTREE and writes into
// MAIN's run folder, which is precisely the pair the gate reads.
//
// T8l pins that the binding follows the invoking tree. This arm pins the write half, and its control
// is the same inverse: if the recorded value read green from anywhere, the pair would be meaningless.
// ---------------------------------------------------------------------------
(function T8m_worktreeLaneRecordsIntoMainAndBindsThisTree() {
  console.log('T8m: `record` from a linked worktree hashes THAT tree and writes into main\'s run folder');
  const base = makeBase('t8m');
  const project = 'issue-9010';
  let schema = null;
  try { schema = require(adaptiveSchemaPath); } catch (_) { schema = null; }
  try {
    assert(schema !== null, 'T8m: adaptive-schema is requireable');
    if (!schema) return;
    const mainRoot = fs.realpathSync(initConsumerRepo(path.join(base, 'main'), null));
    const wtRoot = path.join(base, 'wt');
    G.git(mainRoot, ['worktree', 'add', '-q', '-b', 'workflow/' + project, wtRoot],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    const wt = fs.realpathSync(wtRoot);
    fs.writeFileSync(path.join(wt, 'src', 'feature.swift'), 'let feature = true\n');
    G.commitAll(wt, 'feat: branch-only code');

    // MAIN-RESIDENT ONLY — the topology the lane is named for. The worktree carries no run folder,
    // and the claim record is what makes `finalize --check` able to read this as a worktree run.
    const mainProject = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(mainProject, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainProject, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'runtime: claude', 'step: complete', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 9010',
      'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wt,
      'main_root: ' + mainRoot, 'session_marker: fixture-t8m', 'claim_ts: 2026-01-01T00:00:00Z', ''
    ].join('\n'));

    const mainHash = schema.computeCodeTreeHash(mainRoot, project, schema.VALIDATION_TEST_CONSUMES);
    const wtHash = schema.computeCodeTreeHash(wt, project, schema.VALIDATION_TEST_CONSUMES);
    assert(/^[0-9a-f]{64}$/.test(String(wtHash)) && mainHash !== wtHash,
      'T8m premise: the two trees must genuinely diverge, or nothing below discriminates; main='
      + JSON.stringify(mainHash) + ' worktree=' + JSON.stringify(wtHash));
    assert(!fs.existsSync(path.join(wt, 'kaola-workflow', project)),
      'T8m premise: the worktree does NOT carry the run folder — that is the lane');

    // --- W1: record from the worktree.
    const rec = runRecord(wt, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(rec.status === 0 && rec.json && rec.json.outcome === 'recorded',
      'T8m(W1): `record` from the worktree must now SUCCEED — exiting 1 here was the dead end, and the '
      + 'hint told you to record from the tree you were already in; got status=' + rec.status
      + ' json=' + JSON.stringify(rec.json) + ' stderr=' + String(rec.stderr || '').slice(0, 300));
    assert(rec.json && rec.json.record_path === path.join(mainProject, '.cache', 'final-validation.md'),
      'T8m(W1): the record lands in MAIN\'s run folder — the one the finalize authority reads; got '
      + JSON.stringify(rec.json && rec.json.record_path));
    assert(rec.json && rec.json.candidate_root === wt,
      'T8m(W1): while the candidate root stays THIS tree; got ' + JSON.stringify(rec.json && rec.json.candidate_root));
    assert(rec.json && rec.json.validated_candidate_hash === wtHash
      && rec.json.validated_candidate_hash !== mainHash,
      'T8m(W1): and the bound hash is the WORKTREE\'s, not the hash of the tree it wrote into — "fix it '
      + 'by hashing main" is the wrong answer this asserts against; recorded='
      + JSON.stringify(rec.json && rec.json.validated_candidate_hash)
      + ' worktree=' + JSON.stringify(wtHash) + ' main=' + JSON.stringify(mainHash));
    assert(!fs.existsSync(path.join(wt, 'kaola-workflow', project)),
      'T8m(W1): and NO run folder is created in the worktree — a worktree-side folder would change the '
      + 'finalize authority topology this record depends on, so the workaround is deliberately not taken');
    assert(typeof (rec.json && rec.json.operator_hint) === 'string'
      && rec.json.operator_hint.includes(mainProject) && rec.json.operator_hint.includes(wt),
      'T8m(W1): the split is surprising enough that saying nothing would read as a bug — the hint names '
      + 'BOTH the folder written and the tree hashed; got '
      + JSON.stringify(rec.json && rec.json.operator_hint));

    // --- W2: the gate's own pair.
    const mainCache = path.join(mainProject, '.cache');
    let g = schema.evaluateChainReceipt(wt, { cacheDir: mainCache, project });
    assert(g.classification === 'chains_green' && g.green === true,
      'T8m(W2): the gate\'s own pair — hash over the invoking worktree, record out of main\'s .cache/ — '
      + 'must read green; got ' + JSON.stringify({ classification: g.classification, green: g.green }));

    // --- W3: THE CONTROL THAT MAKES W2 NON-VACUOUS. Same bytes, gate standing in main.
    g = schema.evaluateChainReceipt(mainRoot, { cacheDir: mainCache, project });
    assert(g.classification === 'final_validation_stale',
      'T8m(W3 control): the SAME bytes read with the gate standing in MAIN must be STALE. Without this, '
      + 'W2 also passes on a value that reads green from anywhere — which is what a recorder that hashed '
      + 'its write destination would produce; got ' + JSON.stringify(g.classification));
    assert(g.recorded_candidate_hash === wtHash && g.current_candidate_hash === mainHash,
      'T8m(W3 control): and it names both trees\' hashes, so the claim is checkable rather than trusted; '
      + 'got ' + JSON.stringify({ recorded: g.recorded_candidate_hash, current: g.current_candidate_hash }));

    // --- END TO END through the real finalize door, from the worktree.
    const ghMock = writeGhMock(path.join(base, 'bin'), [9010]);
    const chk = runClaim(['finalize', '--project', project, '--keep-worktree', '--check', '--json'],
      wt, ghMock);
    const chkJson = lastJson(chk);
    assert(chk.status === 0 && chkJson && chkJson.ok === true
      && Array.isArray(chkJson.reasons) && chkJson.reasons.length === 0,
      'T8m(E2E): `finalize --check` from the worktree must now report finalize-ready — it used to exit 1 '
      + 'on a validation finding whose only remedy looped; got status=' + chk.status
      + ' json=' + JSON.stringify(chkJson) + ' stderr=' + String(chk.stderr || '').slice(0, 300));
    assert(chkJson && chkJson.authority && chkJson.authority.source === 'pending_mirror',
      'T8m(E2E): over the pending_mirror topology exactly — the lane this fix is about; got '
      + JSON.stringify(chkJson && chkJson.authority));
    assert(chkJson && chkJson.checks && chkJson.checks.validation === 'chains_green',
      'T8m(E2E): and the measurement the recorder produced is what the door reads; got '
      + JSON.stringify(chkJson && chkJson.checks && chkJson.checks.validation));

    // --- W5: idempotent in the main-resident lane too. Guarded so a build that recorded NOTHING reds
    // on its own assertion rather than crashing the suite and hiding T8n behind one stack trace.
    const recordedAt = (rec.json && rec.json.record_path) || '';
    const readRecord = () => { try { return fs.readFileSync(recordedAt, 'utf8'); } catch (_) { return null; } };
    const bytes = readRecord();
    const again = runRecord(wt, ['--project', project, '--verdict', 'pass', '--command', 'swift test']);
    assert(bytes !== null && again.status === 0 && readRecord() === bytes,
      'T8m(W5): re-recording across trees is byte-identical — the merge policy does not change with the '
      + 'destination; got status=' + again.status + ' record_path=' + JSON.stringify(recordedAt));
  } finally {
    try {
      G.git(path.join(base, 'main'), ['worktree', 'remove', '--force', path.join(base, 'wt')],
        { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (_) { /* the rm below takes it either way */ }
    rm(base);
  }
})();

// ---------------------------------------------------------------------------
// T8n (#900 / V1) — the two things the FALLBACK itself had to get right.
//
// W9 is a defect the V1 fix CREATED and then closed: resolving the run folder in main made main's
// durable archive band reachable from a worktree that has no local band, by a route the local path
// check could not see. So the band rule follows the WRITE — the resolved destination is checked
// against its own root. W7 is the loop the old hint was: it named one path while you stood in it.
// ---------------------------------------------------------------------------
(function T8n_fallbackBandAndTwoPathHint() {
  console.log('T8n: the fallback must not open a route into main\'s archive band, and must name what it searched');
  const base = makeBase('t8n');
  try {
    const mainRoot = fs.realpathSync(initConsumerRepo(path.join(base, 'main'), null));
    const wtRoot = path.join(base, 'wt');
    G.git(mainRoot, ['worktree', 'add', '-q', '-b', 'workflow/issue-9011', wtRoot],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    const wt = fs.realpathSync(wtRoot);

    // --- W9: main has an archive band; this worktree has none.
    const mainBand = path.join(mainRoot, 'kaola-workflow', 'archive');
    fs.mkdirSync(path.join(mainBand, 'issue-old', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainBand, 'issue-old', 'workflow-state.md'), 'status: closed\n');
    assert(!fs.existsSync(path.join(wt, 'kaola-workflow', 'archive')) && fs.existsSync(mainBand),
      'T8n(W9) premise: the band exists ONLY in main — that is what makes it reachable solely through '
      + 'the fallback, and invisible to a check on the local path');
    const bandBefore = walkFiles(mainBand, '', []).sort().join('|');
    const w9 = runRecord(wt, ['--project', 'Archive', '--verdict', 'pass', '--command', 'swift test']);
    assert(w9.status === 2,
      'T8n(W9): a `--project` that resolves into the durable archive band is a USAGE error — no checkout '
      + 'and no re-run turns the band into a run folder, so it is exit 2 and not an inconclusive '
      + 'measurement; got ' + w9.status + ' stdout=' + String(w9.stdout || '').slice(0, 200));
    assert(/archive band/i.test(String(w9.stderr || '')),
      'T8n(W9): and it says so; got stderr=' + JSON.stringify(String(w9.stderr || '').slice(0, 240)));
    assert(walkFiles(mainBand, '', []).sort().join('|') === bandBefore,
      'T8n(W9): NOTHING is written into main\'s band — an archived run\'s record is closed evidence. '
      + 'This is the route the fallback opened, so the band check has to follow the resolved '
      + 'destination and not the local path; band was ' + JSON.stringify(bandBefore)
      + ' now ' + JSON.stringify(walkFiles(mainBand, '', []).sort().join('|')));

    // --- W7: no run folder at either place — the hint must name BOTH searched paths.
    const missing = 'issue-9012';
    const w7 = runRecord(wt, ['--project', missing, '--verdict', 'pass', '--command', 'swift test']);
    assert(w7.status === 1 && w7.json && Array.isArray(w7.json.reasons)
      && w7.json.reasons.includes('project_folder_missing'),
      'T8n(W7): no folder at either place is inconclusive, not a usage error; got status=' + w7.status
      + ' json=' + JSON.stringify(w7.json));
    const hint = String((w7.json && w7.json.operator_hint) || '');
    assert(hint.includes(path.join(wt, 'kaola-workflow', missing))
      && hint.includes(path.join(mainRoot, 'kaola-workflow', missing)),
      'T8n(W7): the hint must name BOTH places the transaction reads a run folder from. Naming only one '
      + 'is how the loop existed — it told an operator standing in the worktree to record from the '
      + 'worktree; got ' + JSON.stringify(hint.slice(0, 300)));
  } finally {
    try {
      G.git(path.join(base, 'main'), ['worktree', 'remove', '--force', path.join(base, 'wt')],
        { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (_) { /* the rm below takes it either way */ }
    rm(base);
  }
})();

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('finalize-door tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('finalize-door tests passed (' + passed + ' assertions)');
}
