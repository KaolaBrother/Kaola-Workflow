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
      // A finding does not withhold closure — passedWithFinding already asserts
      // out.status === 'closed' (set once, at the very end of cmdFinalize's
      // transaction) for every c.expect case reached here. The former secondary
      // witness — asserting the local roadmap source was removed by closure —
      // died with reconcileRoadmapForClosure and the roadmap-source layer (ADR
      // 0018); the subject it stood in for is still covered above.
      passedWithFinding(fx, r, out, c.expect, c.id + ' (' + c.label + ')');
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

    // --- W6: PAST `--check`. The E2E leg above stops at the read-only door, and a read-only door is a
    // different program from the transaction: `--check` reads the recorder and reports, while the
    // transaction MIRRORS the run folder, ARCHIVES it, regenerates the roadmap and closes. The
    // self-host worktree lane is already driven whole elsewhere; the CONSUMER worktree lane — where the
    // validation classification comes from `.cache/final-validation.md` rather than a chain receipt —
    // was driven only to `--check`.
    //
    // The gap is not hypothetical in shape, and two measured mutants say so. Reading the validation
    // AFTER the archive turns `chains_green` into `final_validation_unverified` on a run whose
    // recorder was measured green three assertions ago. Resolving the archive destination against the
    // INVOKING root rather than main's — the pre-#832 shape — writes the run's whole evidence trail
    // into the tree the sink is about to delete, and leaves main's live folder standing as a phantom
    // claim. `--check` sees neither, because it never moves anything; and the in-place legs above see
    // neither of the second one's halves, because in-place IS the invoking root.
    //
    // Must run LAST in this scenario: finalize is terminal, and it archives the folder every assertion
    // above reads.
    const fin = runClaim(['finalize', '--project', project, '--keep-worktree', '--json'], wt, ghMock);
    const finJson = lastJson(fin);
    assert(fin.status === 0, 'T8m(W6): the consumer worktree lane must finalize whole, not only --check; got '
      + fin.status + '\nstdout: ' + String(fin.stdout || '').slice(-700)
      + '\nstderr: ' + String(fin.stderr || '').slice(-400));
    assert(finJson && finJson.status === 'closed',
      'T8m(W6): and reach terminal closure; got ' + JSON.stringify(finJson && finJson.status));

    // THE DELTA. `--check` said chains_green from the recorder; the transaction must still say it,
    // after moving the file that carries it.
    assert(finJson && finJson.validation && finJson.validation.classification === 'chains_green',
      'T8m(W6): the CONSUMER arm\'s measurement must survive the transaction — the same recorder the '
      + '--check leg read green, read again by a run that moves the folder holding it. Anything else '
      + 'here is a run reporting unverified over evidence it had just been handed; got '
      + JSON.stringify(finJson && finJson.validation));

    // The archive lands in MAIN's band, never the worktree's, and the run's evidence goes with it.
    // Asserted on DISK at the dest the envelope names, so the envelope cannot be the only witness.
    const finDest = finJson && finJson.dest;
    assert(typeof finDest === 'string' && finDest.indexOf(path.join(mainRoot, 'kaola-workflow', 'archive')) === 0,
      'T8m(W6): the archive destination is under MAIN\'s band — the worktree is the tree being torn '
      + 'down, so an archive written there is evidence with a demolition date; got ' + JSON.stringify(finDest));
    assert(finDest && fs.existsSync(path.join(finDest, 'workflow-state.md')),
      'T8m(W6): the archived run record is ON DISK at the dest the envelope names; got ' + JSON.stringify(finDest));
    assert(finDest && fs.existsSync(path.join(finDest, '.cache', 'final-validation.md')),
      'T8m(W6): and the recorder\'s own file travelled with it — it is the only account of how this '
      + 'consumer run was verified, and losing it in the move is losing the verification; dest='
      + JSON.stringify(finDest));
    assert(!fs.existsSync(mainProject),
      'T8m(W6): the live folder in MAIN is gone — an archive that leaves the live copy standing leaves '
      + 'a phantom active claim a successor reads as unfinished work; ' + mainProject + ' still exists');

    // The durable half, on the same footing the converted findings get: the archived summary carries
    // the measurement, so a successor reading the run record sees what the terminal saw.
    const finSummary = readFinalizationSummary(mainRoot, project, finDest);
    assert(finSummary !== null, 'T8m(W6): finalization-summary.md exists after the transaction');
    if (finSummary) {
      const body = sectionBody(finSummary.text, '## Validation');
      assert(body !== null && body.indexOf('chains_green') >= 0,
        'T8m(W6): and the durable `## Validation` section records the consumer arm\'s measurement; got '
        + JSON.stringify(body === null ? finSummary.text.slice(0, 400) : body.slice(0, 400)));
    }
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
// T9 (#907) — THE FALSE GREEN. A hazard-named file beside the deliverable must not silently cost
// the finalize commit.
//
// MEASURED, end to end, one axis: two fixtures differing only by the presence of a file named
// `notes.md ` (one trailing space). The control committed `chore: finalize <project>` and carried
// `src/pending-good.js` into it. The hazard leg exited 0, reported `status: "closed"`,
// `closure_invariants.ok: true` and `finalize_transaction.finalize_commit: "nothing_to_commit"`,
// authored NO commit, and left `src/pending-good.js` — an ordinary healthy file — uncommitted. A
// second run was byte-identical: it does not converge, and the archived run record carries no trace
// that anything was dropped.
//
// The chain: `git status --porcelain` quotes the name, the shared parser strips the quotes without
// unescaping and then `.trim()`s the value, the mangled path goes into `git add -A -- ...residue`,
// git exits 128 on the whole invocation, `catch (_) {}` swallows it, and `git diff --cached --quiet`
// then honestly reports that nothing is staged.
//
// REACHABILITY IS THE FIXTURE'S WHOLE JOB. The staging block is nested inside `if (args.keepWorktree)`
// and a linked-worktree-only test (`mainRoot !== linkedRoot`). An in-place finalize returns
// `finalize_commit: "skipped"` and never executes it — the first attempt at this reproduction failed
// exactly that way and proved nothing. So every leg below is a LINKED WORKTREE finalized with
// `--keep-worktree`, which is this project's own documented finishing sequence.
//
// POSTURE: REPORT, NOT REFUSE. Exit stays 0 and closure still completes; what must change is that the
// deliverable is committed and that a staging failure is said out loud instead of read as
// `nothing_to_commit`.
//
// WHICH NAMES ARE ACTUALLY RED, measured on the baseline rather than assumed — the table below is
// mixed on purpose and the difference is not cosmetic:
//   * trailing space, non-ASCII, embedded newline -> RED. The escaped form git printed
//     (`trail.md` after the trim, `n\303\266te.md`, `new\nline.md`) matches no pathspec.
//   * embedded `"` and `\`                        -> ALREADY GREEN, by accident: the escaped form
//     git printed happens to match the real file, so the add succeeds. They stay in the table as
//     REGRESSION pins — whatever the parse becomes must not break the two cases that work today.
// ---------------------------------------------------------------------------

// The claim script of every edition. The GitLab and Gitea ports are HAND-ported and policed by
// nothing — absent from COMMON_SCRIPTS and from the rename-normalized families — so a fix applied to
// three copies and missed on the fourth is caught here or not at all. (Same table as
// scripts/test-forge-bundle-lane.js; kept local so requiring that suite's module, which builds
// fixtures at load time, is not a side effect of running this one.)
const CLAIM_EDITIONS = Object.freeze([
  { name: 'root', claim: path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js') },
  { name: 'codex', claim: path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js') },
  { name: 'gitlab', claim: path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js') },
  { name: 'gitea', claim: path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js') },
]);

// A linked-worktree run, ready to finalize. `hazard` is a file name created UNTRACKED in the
// worktree root, or null for the control. `src/pending-good.js` is the deliverable every leg asserts
// on: an ordinary, perfectly stageable file whose only distinction is that it sits beside the hazard.
function buildWorktreeRun(tag, project, hazard) {
  const base = makeBase(tag);
  const mainRoot = fs.realpathSync(initConsumerRepo(path.join(base, 'main'), null));
  const wtRoot = path.join(base, 'wt');
  G.git(mainRoot, ['worktree', 'add', '-q', '-b', 'workflow/' + project, wtRoot],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const wt = fs.realpathSync(wtRoot);
  const dir = path.join(wt, 'kaola-workflow', project, '.cache');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'evidence.md'), 'run evidence\n');
  fs.writeFileSync(path.join(wt, 'kaola-workflow', project, 'workflow-state.md'), [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'runtime: claude', 'step: complete', '',
    '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 9070',
    'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wt, 'main_root: ' + mainRoot, ''
  ].join('\n'));
  fs.writeFileSync(path.join(wt, 'src', 'feature.js'), 'module.exports = 2;\n');
  G.commitAll(wt, 'feat: implementation');
  // The deliverable, and the hazard beside it. Both untracked — this is the Finalization residue the
  // transaction's Step 8 exists to carry into one commit.
  fs.writeFileSync(path.join(wt, 'src', 'pending-good.js'), 'module.exports = "carry me";\n');
  if (hazard) fs.writeFileSync(path.join(wt, hazard), 'hazard\n');
  return { base, mainRoot, wt, project, gh: writeGhMock(path.join(base, 'bin'), [9070]) };
}

function removeWorktreeFixture(fx) {
  try {
    G.git(fx.mainRoot, ['worktree', 'remove', '--force', path.join(fx.base, 'wt')],
      { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) { /* the rm below takes it either way */ }
  rm(fx.base);
}

// Raw committed paths on the worktree's branch — read with `-z` so the ASSERTION is never subject to
// the quoting the code under test gets wrong.
function committedPaths(repo) {
  const r = G.git(repo, ['ls-tree', '-r', '-z', '--name-only', 'HEAD'], { encoding: 'utf8' });
  return String(r.stdout || '').split('\0').filter(Boolean);
}

// Does the envelope SAY a path could not be staged? The token vocabulary and the field are the
// implementer's; what is pinned is that something machine-readable names it. `changed_paths` is
// excluded from the band on purpose: it is derived from what WAS committed, so a hit there would be
// evidence of success, not of a report.
//
// THE BAND IS WALKED AS PARSED STRUCTURE, never as `JSON.stringify(item)`. Serialising the haystack
// escapes exactly the characters the T9b table is built from — inside JSON text a newline is `\n`, a
// quote is `\"` and a backslash is `\\` — so a raw needle carrying one of them could not match an
// envelope that named the path perfectly. MEASURED, on the five T9b names against the envelope the
// implementation emits: only `notes.md ` and `nöte.md`, whose escaping is the identity, survived the
// round trip; `new\nline.md`, `qu"ote.md` and `back\slash.md` matched nothing no matter what the
// report said. That is not a weak observation, it is an unsatisfiable one — for those three the
// "or NAMED on the envelope" half of T9b's assertion could never be true, leaving it demanding that
// the hazard be COMMITTED, which is a different assertion from the one written there. It stayed
// invisible while the implementation committed the hazard and surfaced the moment #975 started
// reporting it instead.
//
// Comparing VALUES rather than a rendering of them removes the whole class: no escaping sits between
// the needle and the string the envelope carries, whatever the character. It is also strictly
// tighter than the stringify form, which could match across the `","` seam between two neighbouring
// entries; a hit here is always inside one scalar or one key.
function envelopeNames(out, needle) {
  if (!out || typeof out !== 'object') return false;
  const band = [out.finalize_transaction, out.errors, out.warnings, out.findings, out.validation,
    out.staging, out.reason, out.result, out.operator_hint];
  for (const key of Object.keys(out)) {
    if (/stag|error|warn|finding|residue|uncommitted|dropped|skip/i.test(key)) band.push(out[key]);
  }
  // Substring, not equality: naming the path inside a sentence of prose is still naming it, and the
  // wording of that sentence is the implementer's to choose. Keys count for the same reason — a
  // report keyed BY the path names it as machine-readably as one that lists it.
  const namesIt = (node) => {
    if (node === null || node === undefined) return false;
    if (Array.isArray(node)) return node.some(namesIt);
    if (typeof node === 'object') {
      return Object.keys(node).some(k => k.indexOf(needle) >= 0 || namesIt(node[k]));
    }
    return String(node).indexOf(needle) >= 0;
  };
  return band.some(namesIt);
}

function runFinalizeKeepWorktree(fx, claimScriptPath) {
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath,
    [claimScriptPath, 'finalize', '--project', fx.project, '--keep-worktree', '--json'], {
      cwd: fx.wt, encoding: 'utf8', timeout: 120000,
      // Set EXPLICITLY. OFFLINE is pinned to the same value on EVERY leg including the control, so it
      // cannot be what suppressed a commit — the control leg commits under exactly this environment,
      // which is what makes the hazard leg's silence attributable to the hazard alone.
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GH_MOCK_SCRIPT: fx.gh,
      }),
    });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: lastJson(r) };
}

(function T9_hazardNamedResidueDoesNotEatTheFinalizeCommit() {
  console.log('T9: a hazard-named file must not silently cost the finalize commit');

  // --- T9a: THE CONTROL. No hazard file. This is what "the transaction works" looks like, under the
  // identical environment every hazard leg below runs in.
  {
    const fx = buildWorktreeRun('t9-control', 'issue-9070', null);
    try {
      const r = runFinalizeKeepWorktree(fx, claimScript);
      const out = r.json;
      assert(r.status === 0, 'T9a(control): finalize exits 0; got ' + r.status
        + ' stderr=' + String(r.stderr || '').slice(0, 300));
      assert(out && out.finalize_transaction && out.finalize_transaction.finalize_commit === 'committed',
        'T9a(control): the transaction authors `chore: finalize` — if this leg does not commit, every '
        + 'hazard assertion below is vacuous because nothing ever committed in this fixture; got '
        + JSON.stringify(out && out.finalize_transaction));
      assert(committedPaths(fx.wt).indexOf('src/pending-good.js') >= 0,
        'T9a(control): and the deliverable is IN the tree; got ' + JSON.stringify(committedPaths(fx.wt)));
    } finally { removeWorktreeFixture(fx); }
  }

  // --- T9b: the hazard table. Each leg differs from T9a by exactly one file.
  const HAZARDS = [
    ['a trailing space', 'notes.md ', true],
    ['non-ASCII', 'nöte.md', true],
    ['an embedded newline', 'new\nline.md', true],
    ['an embedded double-quote', 'qu"ote.md', false],
    ['a backslash', 'back\\slash.md', false],
  ];
  for (const [label, hazard, redOnBaseline] of HAZARDS) {
    const fx = buildWorktreeRun('t9-' + Buffer.from(hazard).toString('hex').slice(0, 12), 'issue-9070', hazard);
    const tag = 'T9b(' + label + (redOnBaseline ? '' : ', regression pin') + ')';
    try {
      // FIXTURE PREMISE: the filesystem kept the literal name. Without it a normalising filesystem
      // would make every assertion below a statement about a file that is not there.
      assert(fs.readdirSync(fx.wt).indexOf(hazard) >= 0,
        tag + ' premise: the fixture stores the literal name ' + JSON.stringify(hazard));

      const r = runFinalizeKeepWorktree(fx, claimScript);
      const out = r.json;
      const tx = (out && out.finalize_transaction) || {};
      const tree = committedPaths(fx.wt);

      assert(r.status === 0, tag + ': finalize still EXITS 0 — the posture is report, not refuse; got '
        + r.status + ' stderr=' + String(r.stderr || '').slice(0, 300));
      assert(out && out.status === 'closed', tag + ': and closure still completes; got '
        + JSON.stringify(out && out.status));

      // THE ACCEPTANCE ASSERTION. One badly-named sibling must not cost the deliverable.
      assert(tree.indexOf('src/pending-good.js') >= 0,
        tag + ': the healthy deliverable beside the hazard MUST be committed. It is not the hazard '
        + 'file that is lost — a single bad pathspec aborts the whole `git add`, so an ordinary file '
        + 'is dropped, the run reports `closed` with `closure_invariants.ok: true`, and a re-run '
        + 'reproduces it byte for byte; got HEAD tree=' + JSON.stringify(tree)
        + ' finalize_transaction=' + JSON.stringify(tx)
        + ' stderr=' + JSON.stringify(String(r.stderr || '').slice(0, 300)));
      assert(tx.finalize_commit !== 'nothing_to_commit',
        tag + ': and `nothing_to_commit` is the FALSE GREEN itself — it is the transaction reporting '
        + 'honestly about an index that a swallowed failure left empty; got '
        + JSON.stringify(tx.finalize_commit));

      // The hazard file is residue too. Committing it is the natural outcome of parsing the name
      // correctly; dropping it silently is the same evidence loss in a smaller costume. Either
      // outcome is acceptable — being SILENT about dropping it is not.
      assert(tree.indexOf(hazard) >= 0 || envelopeNames(out, path.basename(hazard).trim()),
        tag + ': the hazard file is either committed with the rest of the residue, or NAMED on the '
        + 'envelope as something the transaction did not carry. What it must not be is absent from '
        + 'both; got HEAD tree=' + JSON.stringify(tree)
        + ' finalize_transaction=' + JSON.stringify(tx));
    } finally { removeWorktreeFixture(fx); }
  }

  // --- T9c: THE OTHER HALF — a staging failure with NO parsing involved. Fixing the parse alone
  // leaves every other cause of a failed `git add` exactly as silent as it is today, and silence is
  // what turned #900's brick into something worse: a run that completes and reports closed.
  //
  // The forced failure is an unreadable file: `git status` reports it, `git add` exits 128 on it, and
  // no amount of correct parsing changes that. It is deliberately a cause the parse fix cannot cure.
  //
  // ONE assertion set, applied to every edition, so no hand-port can end up guarded more weakly than
  // the canonical copy. The parse half lives in the ×4 byte-identical kernel and therefore reaches
  // all four editions for free; THIS half is an edit to claim.js, which is hand-ported per forge with
  // nothing comparing the copies. That asymmetry is exactly why it is driven per edition.
  function assertStagingFailureIsReported(claimScriptPath, tag) {
    const fx = buildWorktreeRun('t9c-' + path.basename(claimScriptPath, '.js').slice(-12), 'issue-9070', null);
    try {
      const locked = path.join(fx.wt, 'locked.md');
      fs.writeFileSync(locked, 'unreadable\n');
      fs.chmodSync(locked, 0o000);
      // FIXTURE PREMISE, proven rather than assumed: running as root, or on a filesystem that ignores
      // the mode, this file stages fine and the whole leg would pass while measuring nothing.
      const probe = G.git(fx.wt, ['add', '-A', '--', 'locked.md'], { encoding: 'utf8' });
      G.git(fx.wt, ['reset', '-q'], { stdio: ['ignore', 'ignore', 'ignore'] });
      assert(probe.status !== 0,
        tag + ' premise: the fixture must genuinely produce a staging failure — `git add` on the '
        + 'unreadable file exits non-zero. It does not when the suite runs as root, and this leg '
        + 'would then be vacuous; got status=' + probe.status
        + ' stderr=' + JSON.stringify(String(probe.stderr || '').slice(0, 200)));

      const r = runFinalizeKeepWorktree(fx, claimScriptPath);
      const out = r.json;
      assert(r.status === 0, tag + ': a staging failure still exits 0 — report, not refuse; got ' + r.status);
      assert(envelopeNames(out, 'locked.md'),
        tag + ': a `git add` that failed must be REPORTED on the envelope, naming what could not be '
        + 'staged. Caught and discarded, the only surviving trace is git\'s own line on inherited '
        + 'stderr — which the archived run record does not keep; got '
        + 'finalize_transaction=' + JSON.stringify(out && out.finalize_transaction)
        + ' errors=' + JSON.stringify(out && out.errors));
      const summary = readFinalizationSummary(fx.mainRoot, fx.project, out && out.dest);
      assert(summary !== null, tag + ': finalization-summary.md exists after finalize');
      assert(summary !== null && summary.text.indexOf('locked.md') >= 0,
        tag + ': and it is recorded DURABLY — an envelope is read once by whoever is at the terminal, '
        + 'while the archived run record is what a successor has. Reporting to one and not the other '
        + 'is the deletion ADR 0016 names; summary at ' + (summary && summary.path) + ' was '
        + JSON.stringify(summary && summary.text.slice(0, 600)));
    } finally { removeWorktreeFixture(fx); }
  }
  assertStagingFailureIsReported(claimScript, 'T9c');

  // --- T9d: EVERY EDITION. The two forge ports are hand-maintained with no parity check, so a fix
  // that lands on three copies is invisible until a GitLab or Gitea user hits it. One hazard name is
  // enough per edition for the parse half: the defect is uniform, and what is unwitnessed is the
  // PORT, not the case.
  for (const edition of CLAIM_EDITIONS) {
    if (edition.name === 'root') continue;   // T9a/T9b/T9c already drove it, at full width
    const tag = 'T9d(' + edition.name + ')';
    if (!fs.existsSync(edition.claim)) {
      assert(false, tag + ': the edition claim script exists at ' + edition.claim);
      continue;
    }
    // Control first, so a red below cannot be explained by "this edition's finalize does not work
    // in this fixture at all".
    const ctl = buildWorktreeRun('t9d-ctl-' + edition.name, 'issue-9070', null);
    try {
      const r = runFinalizeKeepWorktree(ctl, edition.claim);
      assert(r.status === 0 && r.json && r.json.finalize_transaction
        && r.json.finalize_transaction.finalize_commit === 'committed',
        tag + ' control: this edition commits the residue in the clean case; got status=' + r.status
        + ' tx=' + JSON.stringify(r.json && r.json.finalize_transaction)
        + ' stderr=' + String(r.stderr || '').slice(0, 300));
      assert(committedPaths(ctl.wt).indexOf('src/pending-good.js') >= 0,
        tag + ' control: and the deliverable is in the tree');
    } finally { removeWorktreeFixture(ctl); }

    const fx = buildWorktreeRun('t9d-haz-' + edition.name, 'issue-9070', 'notes.md ');
    try {
      const r = runFinalizeKeepWorktree(fx, edition.claim);
      const tx = (r.json && r.json.finalize_transaction) || {};
      assert(r.status === 0, tag + ': exits 0; got ' + r.status);
      assert(committedPaths(fx.wt).indexOf('src/pending-good.js') >= 0,
        tag + ': the deliverable survives the hazard on this hand-ported edition too — nothing '
        + 'compares these copies, so this is the only place a missed port shows up; got HEAD tree='
        + JSON.stringify(committedPaths(fx.wt)) + ' tx=' + JSON.stringify(tx));
      assert(tx.finalize_commit !== 'nothing_to_commit',
        tag + ': and it does not report the false green; got ' + JSON.stringify(tx.finalize_commit));
    } finally { removeWorktreeFixture(fx); }

    // The reporting half, on the same footing as the canonical copy. This is the arm that catches a
    // fix applied to `scripts/kaola-workflow-claim.js` and not carried into the forge port.
    assertStagingFailureIsReported(edition.claim, tag + ' unstageable');
  }
})();

// ---------------------------------------------------------------------------
// T10 / T11 — the MAIN-RESIDENT worktree posture. Both findings below live in it, and neither is
// reachable from T9's fixture, which claims the run folder in the WORKTREE. This is the posture this
// project's own runs use: the run folder is resident in MAIN, the linked worktree carries the branch,
// and Step 8a mirrors main -> worktree at the top of every finalize.
// ---------------------------------------------------------------------------

// A self-host repo whose run folder lives in MAIN, plus a linked worktree on the branch.
// `opts.implCommit` adds a committed implementation (so the transaction reaches Step 8);
// `opts.residue` writes the untracked deliverable Step 8 exists to carry.
function buildMainResidentRun(tag, project, issue, opts) {
  const o = opts || {};
  const base = makeBase(tag);
  initSelfHostRepo(path.join(base, 'main'));
  const mainRoot = fs.realpathSync(path.join(base, 'main'));
  // #989: the `archive_stage` candidate list is `['kaola-workflow/.roadmap']`, and this fixture used
  // to leave that directory absent — so `existingPaths` was STRUCTURALLY empty and T11's
  // `roadmap_staged === false` held for a reason that had nothing to do with the gate it names.
  // Measured, one mutation at a time: hardcoding `roadmap_staged = true` WAS caught, but removing the
  // `archiveAddOk &&` gate was NOT. An assertion that cannot fail on the thing it describes is not
  // watching it.
  //
  // `_rules.md` is what closes that, and it is NOT the ruled-out move of planting roadmap-shaped
  // content to manufacture a green. ADR 0018 retired the generated mirror and the per-issue sources;
  // `kaola-workflow/.roadmap/_rules.md` is the one file under that directory the Durable State
  // Contract keeps, and it is tracked in this very repository. So the fixture now carries what a real
  // post-retirement repo carries, and the gate is reachable for the same reason it is reachable in
  // production. Committed BEFORE the worktree add below, scoped to its own path so the main-resident
  // run folder written after it stays uncommitted — that residue is the premise of every leg here.
  const rulesRel = path.join('kaola-workflow', '.roadmap', '_rules.md');
  fs.mkdirSync(path.join(mainRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(mainRoot, rulesRel), '# Project rules\n\nStanding project-local rules.\n');
  G.git(mainRoot, ['add', '--', rulesRel], { stdio: ['ignore', 'ignore', 'ignore'] });
  G.git(mainRoot, ['commit', '-m', 'chore: seed surviving .roadmap/_rules.md'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const mainProj = path.join(mainRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(mainProj, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(mainProj, '.cache', 'evidence.md'), 'run evidence\n');
  fs.writeFileSync(path.join(mainProj, 'mission-list.md'), '# goal\n\n- item: x\n  status: done\n  result: y\n');
  fs.writeFileSync(path.join(mainProj, 'workflow-state.md'), [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'runtime: claude', 'step: complete', '',
    '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: ' + issue,
    'sink: merge', 'run_posture: worktree', 'worktree_path: ' + path.join(base, 'wt'),
    'main_root: ' + mainRoot, ''
  ].join('\n'));
  G.git(mainRoot, ['worktree', 'add', '-q', '-b', 'workflow/' + project, path.join(base, 'wt')],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const wt = fs.realpathSync(path.join(base, 'wt'));
  if (o.implCommit) {
    fs.writeFileSync(path.join(wt, 'src', 'feature.js'), 'module.exports = 2;\n');
    G.commitAll(wt, 'feat: implementation');
  }
  if (o.residue) fs.writeFileSync(path.join(wt, 'src', 'pending-good.js'), 'module.exports = "carry me";\n');
  const binDir = path.join(base, 'bin');
  return {
    base, mainRoot, wt, project, mainProj,
    gh: writeGhMock(binDir, [issue]),
    greenMock: writeGreenChainMock(binDir),
  };
}

function removeMainResidentRun(fx) {
  try {
    G.git(fx.mainRoot, ['worktree', 'remove', '--force', path.join(fx.base, 'wt')],
      { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) { /* the rm below takes it either way */ }
  rm(fx.base);
}

function readJsonFile(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function fileRows(p) { try { return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).length; } catch (_) { return 0; } }
function fileText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; } }

// ---------------------------------------------------------------------------
// T10 (#910 review R1) — THE MIRROR MUST NOT DESTROY A NEWER TREE-BOUND ARTIFACT.
//
// `run-chains --project` writes the receipt into MAIN's run folder. Step 8a then copies main's
// `.cache/` FORWARD over the worktree's, and `mergeCopyDir` drops its keep-set in its own recursion,
// so every file under `.cache/` was overwritten unconditionally. The sequence that turns that into a
// false verdict is ordinary, not exotic:
//
//   A  run the chains from the worktree      -> the receipt lands in MAIN (the worktree has no folder)
//   B  finalize, implementation not yet committed -> REFUSES, but Step 8a already created the
//      worktree's run folder, which flips run-chains' local-first resolution
//   C  the operator commits and re-runs the chains -> the FRESH receipt now lands in the WORKTREE
//   D  finalize -> the mirror copies main's OLD receipt over the fresh one
//
// Step D then reports `chains_stale` — "code changed since the chains ran" — over a tree the chains
// had just run green on, and the ARCHIVE ends up carrying a receipt bound to a tree that no longer
// exists. Step B is a designed refusal: the machinery deliberately never authors the implementation
// commit, so a finalize run before the orchestrator commits is the ordinary retry lane.
//
// Assertion 4 is the one a naive test misses. A pin that stops at the classification passes on a
// build that reports green and still archives the stale receipt — and the archive is what a successor
// reads.
// ---------------------------------------------------------------------------
(function T10_mirrorPreservesTreeBoundArtifacts() {
  console.log('T10: the Step 8a mirror must not overwrite a receipt or an outcome log the worktree authored');
  const project = 'issue-9100';
  const fx = buildMainResidentRun('t10', project, 9100, {});
  const mainReceipt = path.join(fx.mainProj, '.cache', 'chain-receipt.json');
  const wtProj = path.join(fx.wt, 'kaola-workflow', project);
  const wtReceipt = path.join(wtProj, '.cache', 'chain-receipt.json');
  const chains = () => runChains(fx.wt, ['--project', project, '--chains', 'claude',
    '--mock-chain', 'claude:' + fx.greenMock, '--json']);
  const finalize = () => {
    const r = runClaim(['finalize', '--project', project, '--keep-worktree', '--json'], fx.wt, fx.gh);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: lastJson(r) };
  };
  try {
    // --- A: the chains run from the worktree, which carries no run folder yet.
    chains();
    const hashA = (readJsonFile(mainReceipt) || {}).codeTreeHash;
    assert(typeof hashA === 'string' && hashA.length > 0,
      'T10(A) premise: the first chain run lands its receipt in MAIN — that is the #910 resolution '
      + 'this finding is downstream of, and without it the whole sequence has no subject; got '
      + JSON.stringify(hashA));

    // --- B: a finalize that MIRRORS and then refuses.
    fs.writeFileSync(path.join(fx.wt, 'src', 'pending-good.js'), 'module.exports = "carry me";\n');
    const b = finalize();
    assert(b.status === 1 && b.json && b.json.reason === 'implementation_commit_missing',
      'T10(B) premise: the finalize refuses because the implementation is not committed — a DESIGNED '
      + 'refusal, and the trigger is any refusal downstream of Step 8a; got status=' + b.status
      + ' reason=' + JSON.stringify(b.json && b.json.reason));
    assert(fs.existsSync(wtProj),
      'T10(B) premise: and Step 8a nonetheless created the worktree run folder — that is what flips '
      + 'run-chains\' local-first resolution for step C');

    // --- C: the operator commits and re-runs the chains. The fresh receipt lands in the WORKTREE.
    fs.writeFileSync(path.join(fx.wt, 'src', 'app.js'), 'module.exports = 2;\n');
    G.commitAll(fx.wt, 'feat: implementation');
    chains();
    const hashC_wt = (readJsonFile(wtReceipt) || {}).codeTreeHash;
    const hashC_main = (readJsonFile(mainReceipt) || {}).codeTreeHash;
    assert(hashC_main === hashA && typeof hashC_wt === 'string' && hashC_wt !== hashA,
      'T10(C) premise: the two trees now hold DIFFERENT receipts — main\'s is the stale one from step '
      + 'A and the worktree\'s covers the committed tree. If they were equal, every assertion below '
      + 'would pass on a mirror that clobbers; got main=' + JSON.stringify(hashC_main)
      + ' worktree=' + JSON.stringify(hashC_wt) + ' stepA=' + JSON.stringify(hashA));

    // The outcome log is APPEND-ONLY and belongs to the tree that wrote it. It is EMPTY in this
    // fixture, and an assertion over two empty files passes against a mirror that overwrites — that
    // vacuity was measured, not guessed. So both trees are seeded with DISTINGUISHABLE content and
    // the assertion below reads for the worktree's tag and against main's.
    const wtLog = path.join(wtProj, '.cache', 'outcome-log.jsonl');
    const mainLog = path.join(fx.mainProj, '.cache', 'outcome-log.jsonl');
    fs.writeFileSync(wtLog, ['{"tag":"WT","n":1}', '{"tag":"WT","n":2}', '{"tag":"WT","n":3}'].join('\n') + '\n');
    fs.writeFileSync(mainLog, '{"tag":"MAIN","n":1}\n');
    const wtRowsBefore = fileRows(wtLog);
    assert(wtRowsBefore === 3 && fileRows(mainLog) === 1,
      'T10(C) premise: the two outcome logs are seeded with DIFFERENT content, so the assertion below '
      + 'can tell "kept" from "overwritten". Two empty logs make it vacuous — measured; got wt='
      + wtRowsBefore + ' main=' + fileRows(mainLog));

    // --- D: the finalize that used to copy main's stale receipt forward.
    const d = finalize();
    assert(d.status === 0 && d.json && d.json.status === 'closed',
      'T10(D): the finalize completes; got status=' + d.status
      + ' stderr=' + String(d.stderr || '').slice(0, 300));
    assert(d.json && d.json.validation && d.json.validation.classification === 'chains_green',
      'T10(D): the gate must report chains_green over the tree the chains JUST ran on. `chains_stale` '
      + 'here is a false verdict manufactured by the mirror, and its remedy — "re-run the chains" — '
      + 'is what the operator had already done; got '
      + JSON.stringify(d.json && d.json.validation));

    // THE ASSERTION A NAIVE PIN MISSES. The classification is read once, by whoever is at the
    // terminal; the ARCHIVE is what every later reader has.
    const dest = (d.json && d.json.dest) || path.join(fx.mainRoot, 'kaola-workflow', 'archive', project);
    const archived = readJsonFile(path.join(dest, '.cache', 'chain-receipt.json'));
    assert(archived && archived.codeTreeHash === hashC_wt,
      'T10(D): the ARCHIVE must carry the receipt bound to the FINALIZED tree. Archiving main\'s '
      + 'older one leaves a durable record attesting to a tree that no longer exists, and the receipt '
      + 'that did cover the finalized tree is then gone from every copy; got '
      + JSON.stringify(archived && archived.codeTreeHash) + ' want ' + JSON.stringify(hashC_wt));

    // The same rule, second artifact: an append-only log is a record of what happened IN a tree, so
    // one checkout cannot hold it on another's behalf. Read from the ARCHIVED copy — a successful
    // finalize removes the live worktree folder, so reading that would measure the archive step
    // instead of the mirror.
    const archLog = path.join(dest, '.cache', 'outcome-log.jsonl');
    const archText = fileText(archLog);
    assert(fileRows(archLog) === wtRowsBefore && archText.indexOf('"WT"') >= 0 && archText.indexOf('"MAIN"') < 0,
      'T10(D): the worktree\'s outcome log survives the mirror with ITS OWN rows — not main\'s. An '
      + 'append-only log overwritten by another tree\'s copy is not stale, it is wrong; got rows='
      + fileRows(archLog) + ' want ' + wtRowsBefore + ' text=' + JSON.stringify(archText.slice(0, 200)));
  } finally { removeMainResidentRun(fx); }
})();

// T10b — THE GREEN CONTROL. The identical fixture and the identical final tree, with step B (the
// mirrored-then-refused finalize) OMITTED. It reports chains_green on the broken build too, and that
// is exactly its job: it shows the single axis in T10 is the refused finalize, not the fixture, the
// mock chain, or the main-resident posture.
(function T10b_greenControlWithoutTheRefusedFinalize() {
  console.log('T10b: the same sequence WITHOUT the refused finalize is green — the axis is step B');
  const project = 'issue-9101';
  const fx = buildMainResidentRun('t10b', project, 9101, { implCommit: true, residue: true });
  try {
    const chains = runChains(fx.wt, ['--project', project, '--chains', 'claude',
      '--mock-chain', 'claude:' + fx.greenMock, '--json']);
    assert(chains.status === 0, 'T10b: the chain run exits 0; got ' + chains.status
      + ' stderr=' + String(chains.stderr || '').slice(0, 300));
    const r = runClaim(['finalize', '--project', project, '--keep-worktree', '--json'], fx.wt, fx.gh);
    const out = lastJson(r);
    assert(r.status === 0 && out && out.status === 'closed',
      'T10b: the finalize completes; got status=' + r.status
      + ' stderr=' + String(r.stderr || '').slice(0, 300));
    assert(out && out.validation && out.validation.classification === 'chains_green',
      'T10b: and reports chains_green — with no refused finalize in front of it there is nothing in '
      + 'main for the mirror to push forward, which is why this leg passed even on the broken build; '
      + 'got ' + JSON.stringify(out && out.validation && out.validation.classification));
  } finally { removeMainResidentRun(fx); }
})();

// ---------------------------------------------------------------------------
// T11 (#907 review R2) — THE FALSE GREEN SURVIVES THROUGH THE PROBE THAT FEEDS THE FIXED CALL.
//
// T9 converted the residue `git add`. The `git status --porcelain` probe that PRODUCES that call's
// pathspec list still swallowed, as did the archive-staging calls beside it — so a fault in any of
// them reproduced the original signature exactly: exit 0, `closure_invariants.ok: true`,
// `residue_stage: "skipped"` (documented as "no residue to stage", which is a false statement about a
// probe that failed), `finalize_commit: "nothing_to_commit"`, no commits authored, the healthy
// deliverable uncommitted, and an archived record that reads exactly as clean as a finalize that
// committed everything.
//
// The fault is driven by corrupting the linked worktree's index, which is a real if uncommon fault;
// the structural point does not depend on that choice, because the same catch discards a held index
// lock, a permission fault and a full disk. The premise is asserted, so a fixture where git still
// answers reds here rather than passing silently.
//
// `nothing_to_stage` is the third leg and it is not decoration: `git diff --cached --quiet` exits 1
// for "there ARE staged changes" and 128 for "git failed", and reading the second as the first is the
// original bug's mechanism. That leg pins the exit-1 arm as an ANSWER while `statusfail` pins a
// non-1 exit as a FAULT — neither leg alone distinguishes them.
//
// ALL FOUR EDITIONS. The forge ports never received #832's scoped archive staging: they stage with a
// single unscoped `git add`, so their archive-staging shape genuinely differs and a canonical-only
// pin cannot witness them.
// ---------------------------------------------------------------------------
(function T11_unprobeableStatusIsReportedNotSwallowed() {
  console.log('T11: a failed `git status` probe must not read as "no residue to stage"');
  const LEGS_R2 = ['control', 'statusfail', 'nothing_to_stage'];
  for (const edition of CLAIM_EDITIONS) {
    if (!fs.existsSync(edition.claim)) {
      assert(false, 'T11(' + edition.name + '): the edition claim script exists at ' + edition.claim);
      continue;
    }
    for (const leg of LEGS_R2) {
      const tag = 'T11(' + edition.name + ' ' + leg + ')';
      const project = 'issue-9070';
      const fx = buildMainResidentRun('t11-' + edition.name + '-' + leg, project, 9070,
        { implCommit: true, residue: leg !== 'nothing_to_stage' });
      try {
        if (leg === 'statusfail') {
          // Corrupt the LINKED WORKTREE's index. `git status --porcelain` then exits 128, and that is
          // the probe whose catch produced the false `residue_stage: "skipped"`.
          const rel = String(G.git(fx.wt, ['rev-parse', '--git-path', 'index'], { encoding: 'utf8' }).stdout || '').trim();
          const idx = path.isAbsolute(rel) ? rel : path.join(fx.wt, rel);
          fs.writeFileSync(idx, 'GARBAGEGARBAGE');
          const probe = G.git(fx.wt, ['status', '--porcelain'], { encoding: 'utf8' });
          assert(probe.status !== 0,
            tag + ' premise: the fixture must genuinely make `git status --porcelain` fail, or this '
            + 'leg measures nothing; got status=' + probe.status
            + ' stderr=' + JSON.stringify(String(probe.stderr || '').slice(0, 200)));
        }

        // THE EDITION'S OWN SCRIPT. `runClaim` always shells the canonical one, so using it inside a
        // per-edition loop runs the same file four times and reads as four independent witnesses —
        // measured, by a canonical-only mutant reddening all four legs.
        const r = runFinalizeKeepWorktree(fx, edition.claim);
        const out = r.json;
        const tx = (out && out.finalize_transaction) || {};
        const dest = (out && out.dest) || path.join(fx.mainRoot, 'kaola-workflow', 'archive', project);
        const summary = fileText(path.join(dest, 'finalization-summary.md'));
        const findings = Array.isArray(tx.findings) ? tx.findings : [];

        assert(r.status === 0 && out && out.status === 'closed',
          tag + ': exit stays 0 and closure completes — the posture is report, not refuse; got status='
          + r.status + ' stderr=' + String(r.stderr || '').slice(0, 300));

        if (leg === 'statusfail') {
          assert(tx.residue_stage !== 'skipped',
            tag + ': `skipped` is documented as "no residue to stage" — a claim about the WORKING TREE '
            + 'that a failed probe cannot support. This is the false statement the whole finding is '
            + 'about; got ' + JSON.stringify(tx.residue_stage));
          assert(tx.finalize_commit !== 'nothing_to_commit',
            tag + ': and `nothing_to_commit` is equally a claim about the working tree — the run could '
            + 'not enumerate what to stage, so it does not know; got ' + JSON.stringify(tx.finalize_commit));
          // #989 PREMISE. The assertion below distinguishes the OUTCOME from the PRESENCE, so it can
          // only distinguish them where the path is actually present. With `.roadmap` absent,
          // `existingPaths` is empty, `roadmap_staged` is false whatever the gate does, and the
          // assertion passes while watching nothing — which is what it did until this fixture carried
          // `_rules.md`. Assert the presence, so a fixture that stops providing it reds HERE and says
          // why, instead of quietly restoring the vacuum.
          assert(fs.existsSync(path.join(fx.wt, 'kaola-workflow', '.roadmap')),
            tag + ' premise: the worktree must carry `kaola-workflow/.roadmap`, or `existingPaths` is '
            + 'empty and the `roadmap_staged` assertion below cannot reach the `archiveAddOk` gate it '
            + 'names — it would pass on a run that had no gate at all');
          assert(tx.roadmap_staged === false,
            tag + ': `roadmap_staged` must follow the OUTCOME of the staging, not the presence of the '
            + 'paths on disk — the candidate IS present here and git still staged nothing, so a value '
            + 'derived from the candidate list rather than the add\'s exit status reads true and lies; '
            + 'got ' + JSON.stringify(tx.roadmap_staged));
          assert(findings.length > 0,
            tag + ': the envelope must carry at least one typed finding; got ' + JSON.stringify(tx));
          assert(summary.indexOf('## Finalize Findings') >= 0,
            tag + ': and the ARCHIVED record must say so. An envelope is read once by whoever is at '
            + 'the terminal; the archived record is what a successor has, and it read exactly as clean '
            + 'as a finalize that committed everything; got summary='
            + JSON.stringify(summary.slice(0, 400)));
          assert(committedPaths(fx.wt).indexOf('src/pending-good.js') < 0
            || tx.finalize_commit === 'committed',
            tag + ': non-vacuity — either the deliverable is genuinely uncommitted (and the run says '
            + 'so above) or it was committed and the transaction reports that; what must not happen '
            + 'is a silent loss; got finalize_commit=' + JSON.stringify(tx.finalize_commit));
        } else if (leg === 'control') {
          // THE LOAD-BEARING CONTROL: the new reporting must not fire on a healthy run.
          assert(tx.finalize_commit === 'committed',
            tag + ': a healthy run commits the residue; got ' + JSON.stringify(tx.finalize_commit));
          assert(tx.residue_stage === 'staged',
            tag + ': and says the residue was staged; got ' + JSON.stringify(tx.residue_stage));
          assert(findings.length === 0,
            tag + ': and carries NO findings — a report that fires on a good run is noise, and would '
            + 'make every assertion in the statusfail leg satisfiable by a build that always reports; '
            + 'got ' + JSON.stringify(findings));
          assert(summary.indexOf('## Finalize Findings') < 0,
            tag + ': and the archived record carries no findings section either; got summary='
            + JSON.stringify(summary.slice(0, 300)));
          assert(committedPaths(fx.wt).indexOf('src/pending-good.js') >= 0,
            tag + ': and the deliverable IS in the tree; got ' + JSON.stringify(committedPaths(fx.wt)));
          // #989's other half. The statusfail leg pins the FALSE outcome; on its own that is
          // satisfiable by a build whose `roadmap_staged` is never true — including one that stopped
          // listing `kaola-workflow/.roadmap` as a candidate at all, which is a real regression this
          // suite would otherwise wave through. A healthy run over a repo that carries the surviving
          // `.roadmap` stages it, so say so.
          assert(tx.roadmap_staged === true,
            tag + ': a healthy run DOES stage the surviving `kaola-workflow/.roadmap` — without this '
            + 'the statusfail leg\'s `false` is satisfiable by never staging it at all; got '
            + JSON.stringify(tx.roadmap_staged));
        } else {
          // THE EXIT-1 ARM. `git diff --cached --quiet` exits 1 when there ARE staged changes and 0
          // when there are none; a non-1 non-0 exit is a FAULT. With no residue to carry, "nothing to
          // commit" is the true answer and must still be reported as one — a build that treated every
          // non-1 exit as a fault would report a finding here and be just as wrong in the other
          // direction.
          assert(tx.finalize_commit === 'nothing_to_commit',
            tag + ': with no residue, `nothing_to_commit` is the TRUE answer and must survive as one — '
            + 'the exit-1 arm of the probe is an answer, not a fault; got '
            + JSON.stringify(tx.finalize_commit));
          assert(findings.length === 0,
            tag + ': and no finding is manufactured for an ordinary empty index; got '
            + JSON.stringify(findings));
          assert(tx.finalize_commit_probe !== 'failed' && tx.archive_commit_probe !== 'failed',
            tag + ': neither staged-ness probe may report a fault on a healthy tree; got '
            + JSON.stringify({ finalize: tx.finalize_commit_probe, archive: tx.archive_commit_probe }));
        }
      } finally { removeMainResidentRun(fx); }
    }
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

// ---------------------------------------------------------------------------
// T12 — a refusing finalize must name the route that GIVES THE CLAIM BACK
// ---------------------------------------------------------------------------
//
// APPENDED AFTER THIS FILE'S OWN SUMMARY FOOTER, deliberately, and it re-reports and re-sets the
// exit code from the same counters at the bottom. A second author was editing this file
// concurrently in the same worktree; an append is the only edit shape that cannot silently drop
// their work, and the footer above has already run by the time these assertions execute, so a red
// here would otherwise be swallowed by an exit code computed before they existed.
//
// WHAT WAS MEASURED, and what it is NOT. Every refusal door in cmdFinalize returns BEFORE the
// claim-clearing loop, so both claim artifacts — the `workflow:in-progress` label and the `kw:claim`
// marker — stay held across a refusal. That is CORRECT: a run whose finalize refused still owns its
// work, and a door that released the claim on the way out would hand a live run to the next caller.
// Nothing here asks for that to change.
//
// THE RESIDUAL IS ROUTING. `release` is the recovery that clears BOTH artifacts, and it works even
// on a condition that permanently blocks finalize — but no refusal envelope names it, so an operator
// who cannot satisfy the door has been told what is wrong and not what to do instead. "Missing is a
// routing problem": the way out exists and nothing points at it.
//
// AND THE ROUTE HAS A TRAP. `release` refuses with `refusing to discard current working directory`
// when cwd is inside the project folder (cmdRelease's cwdInside guard) — which is exactly where an
// operator finalizing a run is standing. Naming the command without naming where to run it hands
// them a second dead end, so the guidance must also name the main root/checkout.
//
// WHICH DOORS ARE PINNED — the four that CARRY `operator_hint`:
//   finalize_mirror_refused · finalize_gate_unverified · implementation_commit_missing ·
//   staging_guard_multi_project
// The two archive doors (`archive_refused` / `archive_incomplete`) carry NO `operator_hint` at all —
// they put their guidance in `reasoning` — so they are outside this pin: the field to pin is the
// one that already exists, and inventing a hint field on those two is a design decision this test
// is not entitled to make.
//
// THE MAIN-ROOT CUE IS MIXED, on purpose, and the difference is not cosmetic:
//   * finalize_mirror_refused    -> ALREADY GREEN. Its hint says "the main checkout" for its own
//     unrelated reason. It stays in the table as a REGRESSION pin — whatever the hint becomes must
//     not lose it.
//   * the other three            -> RED. They name no tree at all.
//
// PER EDITION, because these hint strings are HAND-PORTED into three more claim.js copies that
// `validate-script-sync.js` compares to nothing for the two forge ports. A fix applied to canonical
// and missed on a port ships silently.

(function T12_refusalNamesTheGiveTheClaimBackRoute() {
  console.log('T12: a refusing finalize names `release` as the route that gives the claim back');

  const missionList = statuses => {
    const lines = ['# T12 fixture', ''];
    statuses.forEach((s, i) => {
      lines.push('- item: mission ' + (i + 1));
      lines.push('  status: ' + s);
      if (s !== 'todo') lines.push('  dispatched: agent-' + (i + 1) + ', output to out/' + (i + 1) + '.md');
      if (s === 'done') lines.push('  result: out/' + (i + 1) + '.md');
      lines.push('');
    });
    return lines.join('\n');
  };

  // Each door: a fixture that reaches it, the refusal it must produce, and whether the main-root
  // cue is a new demand or a regression pin. `run` returns the finalize result; `clean` tears down.
  const DOORS = [
    {
      reason: 'finalize_gate_unverified',
      mainRootCue: 'red',
      // An in-place run against a project folder that does not exist: Step 8a mirrors nothing and
      // the authority resolves to archive_authority_missing. The cheapest door there is.
      build(tag) {
        const base = makeBase(tag);
        G.init(base, { branch: 'main' });
        fs.mkdirSync(path.join(base, 'kaola-workflow', '.roadmap'), { recursive: true });
        fs.writeFileSync(path.join(base, 'README.md'), '# fixture\n');
        G.commitAll(base, 'init');
        return { base, project: 'issue-9071' };
      },
      run(fx, claimPath) {
        // spawn-class: cli-contract
        const r = spawnSync(process.execPath,
          [claimPath, 'finalize', '--project', fx.project, '--json'],
          { cwd: fx.base, encoding: 'utf8', timeout: 120000,
            env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
        return { status: r.status, stderr: r.stderr, json: lastJson(r) };
      },
      clean(fx) { rm(fx.base); }
    },
    {
      reason: 'finalize_mirror_refused',
      mainRootCue: 'regression',
      // A main copy that is BOTH staler than the worktree's ledger and unwritable: the transaction
      // owns that sync, cannot perform it, and refuses fail-closed before any side effect.
      build(tag) {
        const fx = buildWorktreeRun(tag, 'issue-9070', null);
        fs.writeFileSync(path.join(fx.wt, 'kaola-workflow', fx.project, 'mission-list.md'),
          missionList(['done', 'done', 'done']));
        const mainProj = path.join(fx.mainRoot, 'kaola-workflow', fx.project);
        fs.mkdirSync(path.join(mainProj, '.cache'), { recursive: true });
        fs.writeFileSync(path.join(mainProj, 'workflow-state.md'), 'stale\n');
        fs.writeFileSync(path.join(mainProj, 'mission-list.md'), missionList(['done', 'todo', 'todo']));
        fs.chmodSync(path.join(mainProj, 'mission-list.md'), 0o444);
        fs.chmodSync(path.join(mainProj, 'workflow-state.md'), 0o444);
        fs.chmodSync(path.join(mainProj, '.cache'), 0o555);
        fs.chmodSync(mainProj, 0o555);
        fx.locked = mainProj;
        return fx;
      },
      run(fx, claimPath) { return runFinalizeKeepWorktree(fx, claimPath); },
      clean(fx) {
        // Restore the modes first or the teardown cannot remove the tree it locked.
        try { fs.chmodSync(fx.locked, 0o755); fs.chmodSync(path.join(fx.locked, '.cache'), 0o755); } catch (_) {}
        removeWorktreeFixture(fx);
      }
    },
    {
      reason: 'implementation_commit_missing',
      mainRootCue: 'red',
      // The same worktree run with its implementation commit rolled back into the working tree:
      // implementation-shaped changes uncommitted, no implementation commit on the branch.
      build(tag) {
        const fx = buildWorktreeRun(tag, 'issue-9070', null);
        G.git(fx.wt, ['reset', '--mixed', 'HEAD~1'], { stdio: ['ignore', 'ignore', 'ignore'] });
        return fx;
      },
      run(fx, claimPath) { return runFinalizeKeepWorktree(fx, claimPath); },
      clean(fx) { removeWorktreeFixture(fx); }
    },
    {
      reason: 'staging_guard_multi_project',
      mainRootCue: 'red',
      // Two projects' workflow state in one index. The run's own folder is already committed by the
      // fixture, so it is TOUCHED and re-staged — one staged project alone is not a split.
      build(tag) {
        const fx = buildWorktreeRun(tag, 'issue-9070', null);
        const foreign = path.join(fx.wt, 'kaola-workflow', 'issue-8888');
        fs.mkdirSync(foreign, { recursive: true });
        fs.writeFileSync(path.join(foreign, 'workflow-state.md'), '# foreign run state\nname: issue-8888\n');
        fs.appendFileSync(path.join(fx.wt, 'kaola-workflow', fx.project, 'workflow-state.md'), '\n# touched\n');
        G.git(fx.wt, ['add', 'kaola-workflow/issue-8888', 'kaola-workflow/' + fx.project],
          { stdio: ['ignore', 'ignore', 'ignore'] });
        return fx;
      },
      run(fx, claimPath) { return runFinalizeKeepWorktree(fx, claimPath); },
      clean(fx) { removeWorktreeFixture(fx); }
    },
  ];

  for (const edition of CLAIM_EDITIONS) {
    if (!fs.existsSync(edition.claim)) {
      assert(false, 'T12(' + edition.name + '): the edition claim script exists at ' + edition.claim);
      continue;
    }
    for (const door of DOORS) {
      const tag = 'T12(' + edition.name + ' ' + door.reason + ')';
      const fx = door.build('t12-' + edition.name + '-' + door.reason.slice(0, 12));
      try {
        const r = door.run(fx, edition.claim);
        // REACHABILITY IS THE FIXTURE'S WHOLE JOB. A fixture that stopped reaching its door reds
        // HERE rather than passing vacuously through the guidance assertions behind it.
        assert(r.status !== 0 && r.json && r.json.reason === door.reason,
          tag + ': the fixture must still reach this door; got status=' + r.status
          + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 300));
        if (!r.json || r.json.reason !== door.reason) continue;

        const hint = String(r.json.operator_hint || '');
        assert(hint.length > 0,
          tag + ': this door carries operator_hint — an empty one means the field moved and this '
          + 'pin is reading the wrong place; got ' + JSON.stringify(r.json.operator_hint));

        // The route itself. `release` clears BOTH claim artifacts and works on a condition that
        // permanently blocks finalize; an operator who cannot satisfy this door has no other way to
        // hand the issue back, and today nothing tells them it exists.
        assert(/\brelease\b/.test(hint),
          tag + ': the refusal must name `release` as the way to give the claim back — the door '
          + 'correctly keeps holding the label and the kw:claim marker, so an operator who cannot '
          + 'satisfy it is stuck with no named way out; got operator_hint=' + JSON.stringify(hint));

        // And where to run it. Run from inside the project folder, `release` refuses with
        // `refusing to discard current working directory` — the operator is standing in exactly
        // that folder when finalize refuses.
        const cueLabel = door.mainRootCue === 'regression'
          ? ': the main-root cue is ALREADY present here and must not be lost'
          : ': naming `release` without naming the main root/checkout hands the operator a second '
            + 'dead end — from inside the project folder it refuses `refusing to discard current '
            + 'working directory`';
        assert(/\bmain (root|checkout)\b/i.test(hint), tag + cueLabel + '; got operator_hint='
          + JSON.stringify(hint));
      } finally {
        door.clean(fx);
      }
    }
  }
})();

// ---------------------------------------------------------------------------
// Final result — RE-REPORTED. See the T12 header: this block is appended after the footer above,
// which has already run against the counters as they stood before these assertions.
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('finalize-door tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('finalize-door tests passed (' + passed + ' assertions)');
}

// ---------------------------------------------------------------------------
// T12b — the same route, on the two doors that carry NO `operator_hint`
// ---------------------------------------------------------------------------
//
// A SECOND ATOMIC APPEND, for the same reason as T12: this file is shared and an append is the only
// edit shape that cannot drop another author's work. The footer below is the authoritative one —
// the counters are cumulative, so T12's footer prints an intermediate total and this one prints the
// final. Nothing above line 2215 has been touched by either append.
//
// T12 deliberately stopped at the four doors carrying `operator_hint` and left the archive pair
// alone, because giving them a hint field they do not have is an ADDITION and that was not a call a
// test author gets to make. It has now been ruled: name the route in the `reasoning` field these two
// ALREADY emit. Amending existing text adds nothing; a new field would. So the assertions are T12's,
// read off `reasoning` instead of `operator_hint`.
//
// THE TWO DOORS, and the lever each needs — neither is reachable by ordinary fixture arrangement:
//   * archive_refused (:4384) — `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1`, the deterministic refusal
//     seam that fires before terminal stamping and leaves the live source untouched. The envelope's
//     `reason` is the seam's own `archive_forced_refusal`, NOT the literal `archive_refused`: that
//     door emits `result.reason || 'archive_refused'`, and this result carries one.
//   * archive_incomplete (:4419) — a SYMLINK inside the live run folder. verifyArchiveComplete walks
//     the source and pushes any entry it cannot reduce to bytes into `invalid[]`, which seeds
//     `mismatched[]`; unlike the env seam this is a property of the tree, so it survives a re-run.
//     Measured: `mismatched: [".cache/evidence-link.md"]`, `missing: []` — which is exactly why the
//     door reports BOTH halves.
//
// THE MAIN-ROOT CUE IS AGAIN MIXED, and again not cosmetic:
//   * archive_incomplete -> ALREADY GREEN. archiveIncompleteRemedy already says "the one in the main
//     checkout" while explaining where a named file may be hiding. REGRESSION pin.
//   * archive_refused    -> RED. Its one sentence names no tree and no next move at all.

(function T12b_archiveDoorsNameTheGiveTheClaimBackRoute() {
  console.log('T12b: the two archive doors name `release` in the `reasoning` they already emit');

  const DOORS = [
    {
      label: 'archive_refused',
      reason: 'archive_forced_refusal',
      mainRootCue: 'red',
      env: { KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL: '1' },
      arrange() { /* the seam is the whole arrangement */ }
    },
    {
      label: 'archive_incomplete',
      reason: 'archive_incomplete',
      mainRootCue: 'regression',
      env: {},
      arrange(fx) {
        const cache = path.join(fx.wt, 'kaola-workflow', fx.project, '.cache');
        fs.symlinkSync(path.join(cache, 'evidence.md'), path.join(cache, 'evidence-link.md'));
      }
    },
  ];

  for (const edition of CLAIM_EDITIONS) {
    if (!fs.existsSync(edition.claim)) {
      assert(false, 'T12b(' + edition.name + '): the edition claim script exists at ' + edition.claim);
      continue;
    }
    for (const door of DOORS) {
      const tag = 'T12b(' + edition.name + ' ' + door.label + ')';
      const fx = buildWorktreeRun('t12b-' + edition.name + '-' + door.label.slice(8), 'issue-9070', null);
      try {
        door.arrange(fx);
        // spawn-class: cli-contract
        const raw = spawnSync(process.execPath,
          [edition.claim, 'finalize', '--project', fx.project, '--keep-worktree', '--json'], {
            cwd: fx.wt, encoding: 'utf8', timeout: 120000,
            env: Object.assign({}, process.env, {
              KAOLA_WORKFLOW_OFFLINE: '0',
              KAOLA_WORKTREE_NATIVE: '0',
              KAOLA_GH_MOCK_SCRIPT: fx.gh,
            }, door.env),
          });
        const r = { status: raw.status, stderr: raw.stderr, json: lastJson(raw) };

        // REACHABILITY FIRST, as in T12: a fixture that stopped reaching its door reds here rather
        // than passing vacuously through the guidance assertions behind it.
        assert(r.status !== 0 && r.json && r.json.reason === door.reason,
          tag + ': the fixture must still reach this door; got status=' + r.status
          + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 300));
        if (!r.json || r.json.reason !== door.reason) continue;

        const reasoning = String(r.json.reasoning || '');
        // The field-has-not-moved pin. These two doors carry NO operator_hint by design — the route
        // belongs in the text they already emit, and a reader that found operator_hint here would be
        // reading a field the ruling said not to add.
        assert(reasoning.length > 0,
          tag + ': this door carries its guidance in `reasoning` — an empty one means the field moved '
          + 'and this pin is reading the wrong place; got ' + JSON.stringify(r.json.reasoning));

        assert(/\brelease\b/.test(reasoning),
          tag + ': the refusal must name `release` as the way to give the claim back — this door also '
          + 'returns before the claim-clearing loop, so the label and the kw:claim marker are both '
          + 'still held and the operator has no named way out; got reasoning=' + JSON.stringify(reasoning));

        const cueLabel = door.mainRootCue === 'regression'
          ? ': the main-root cue is ALREADY present here and must not be lost'
          : ': naming `release` without naming the main root/checkout hands the operator a second '
            + 'dead end — from inside the project folder it refuses `refusing to discard current '
            + 'working directory`';
        assert(/\bmain (root|checkout)\b/i.test(reasoning), tag + cueLabel + '; got reasoning='
          + JSON.stringify(reasoning));
      } finally {
        removeWorktreeFixture(fx);
      }
    }
  }
})();

// ---------------------------------------------------------------------------
// T13 (#991) — finalize's archive staging must not sweep up a disk-only deletion under `.roadmap/`.
//
// REACHABILITY, ESTABLISHED BY RUNNING. #991 was filed from READING `git add -A --
// kaola-workflow/.roadmap` and reasoning about the flag's semantics, and its own body says so: a
// defect found by reading has not established reachability. This leg is that missing step. It went
// RED on the pre-fix build — the deletion WAS staged and committed — and that red is the evidence
// the filing lacked, not a formality performed after the decision.
//
// The population is narrow and worth naming, because it is what makes the breadth wrong rather than
// merely broad: an owner part-way through the ADR 0018 §8 step 6 migration, who has deleted the
// retired per-issue sources from disk intending to review the deletion before committing it. The
// next unrelated finalize commits it for them, inside a `chore: archive` attributed to a run that
// has nothing to do with the migration.
//
// The CONTROL is the other half and is load-bearing: `_rules.md` — the one file under that directory
// the Durable State Contract keeps — must still be carried. A build that fixed this by staging
// NOTHING would satisfy the hazard leg alone, and that is a real regression, not a fix.
// ---------------------------------------------------------------------------
(function T13_archiveStagingDoesNotSweepDiskOnlyRoadmapDeletion() {
  console.log('T13: archive staging carries `_rules.md` but never a disk-only `.roadmap/` deletion');
  for (const edition of CLAIM_EDITIONS) {
    if (!fs.existsSync(edition.claim)) {
      assert(false, 'T13(' + edition.name + '): the edition claim script exists at ' + edition.claim);
      continue;
    }
    const tag = 'T13(' + edition.name + ')';
    const project = 'issue-9910';
    const fx = buildMainResidentRun('t12-' + edition.name, project, 9910,
      { implCommit: true, residue: true });
    try {
      // A retired per-issue source, TRACKED — the shape an unmigrated consumer still carries. Commit
      // it in main before touching the worktree, so both trees agree it is tracked.
      // Committed in the LINKED WORKTREE, which is the tree finalize runs over and stages against.
      // Seeding it in main instead would leave the worktree's own index without the entry, and there
      // would be nothing for the staging to sweep — the premise below catches exactly that mistake.
      const legacyRel = 'kaola-workflow/.roadmap/issue-4242.md';
      fs.mkdirSync(path.join(fx.wt, 'kaola-workflow', '.roadmap'), { recursive: true });
      fs.writeFileSync(path.join(fx.wt, legacyRel), '# 4242\n\nnext_step: [P1] something\n');
      G.git(fx.wt, ['add', '--', legacyRel], { stdio: ['ignore', 'ignore', 'ignore'] });
      G.git(fx.wt, ['commit', '-m', 'chore: seed a retired roadmap source'],
        { stdio: ['ignore', 'ignore', 'ignore'] });

      // PREMISE. Both files must be tracked in the worktree, or this leg measures nothing.
      const tracked0 = committedPaths(fx.wt);
      assert(tracked0.indexOf(legacyRel) >= 0,
        tag + ' premise: the retired source must be TRACKED in the worktree before the deletion, or '
        + 'there is no index entry for the staging to sweep; got '
        + JSON.stringify(tracked0.filter(p => p.indexOf('.roadmap') >= 0)));
      assert(tracked0.indexOf('kaola-workflow/.roadmap/_rules.md') >= 0,
        tag + ' premise: `_rules.md` must be tracked too, or the control below is vacuous; got '
        + JSON.stringify(tracked0.filter(p => p.indexOf('.roadmap') >= 0)));

      // THE HAZARD: deleted from DISK ONLY. This is the exact half-migrated state, and the one
      // command that produces it.
      fs.unlinkSync(path.join(fx.wt, legacyRel));
      // And a real `_rules.md` EDIT, so the control asserts a carry that had something to carry.
      fs.writeFileSync(path.join(fx.wt, 'kaola-workflow/.roadmap/_rules.md'),
        '# Project rules\n\nStanding project-local rules, amended by this run.\n');

      const r = runFinalizeKeepWorktree(fx, edition.claim);
      const out = r.json;
      assert(r.status === 0 && out && out.status === 'closed',
        tag + ': exit stays 0 and closure completes; got status=' + r.status
        + ' stderr=' + String(r.stderr || '').slice(0, 300));

      // THE FINDING. The deletion must not have reached the index or a commit.
      const stagedNow = String(G.git(fx.wt, ['diff', '--cached', '--name-only'],
        { encoding: 'utf8' }).stdout || '');
      assert(stagedNow.indexOf(legacyRel) < 0,
        tag + ': finalize must not STAGE a disk-only deletion of a retired roadmap source — an owner '
        + 'part-way through migration deletes from disk to review before committing, and `git add -A` '
        + 'over the whole directory takes that decision away; got staged=' + JSON.stringify(stagedNow));
      assert(committedPaths(fx.wt).indexOf(legacyRel) >= 0,
        tag + ': and must not COMMIT it either — the file is still tracked at HEAD after finalize, '
        + 'because nothing in this run was about that file; got tracked='
        + JSON.stringify(committedPaths(fx.wt).filter(p => p.indexOf('.roadmap') >= 0)));

      // THE CONTROL. Narrowing must not become "stage nothing".
      const tx = (out && out.finalize_transaction) || {};
      assert(tx.roadmap_staged === true,
        tag + ' control: the surviving `_rules.md` IS still carried — a build that fixed the hazard by '
        + 'staging nothing at all would pass the assertions above and be a regression; got '
        + JSON.stringify(tx.roadmap_staged));
    } finally {
      removeMainResidentRun(fx);
    }
  }
})();

// ---------------------------------------------------------------------------
// T14 (#993/#994) — THE DEGRADATION PAIR. "nothing was filed" and "what was filed could not be
// measured" are different facts, and a field that renders both as `0` destroys the difference
// silently — the successor reading the archived run sees a confident zero and has no way to learn it
// was never measured. This is the house's oldest rule about closure fields (`finalize_commit:
// 'unknown'`, `changed_paths_probe: 'unavailable'`, `issue_disposition: 'unknown'`): a value that
// could not be MEASURED degrades to a named token, never to a plausible number.
//
// THE TWO HALVES ARE ASSERTED AS A PAIR, deliberately. Either one alone is satisfiable by a build
// that is wrong about the other: an implementation that always says `unknown` passes the absent leg,
// one that always says `0` passes the empty leg, and the final assertion — that the two legs DISAGREE
// — is the only one neither can satisfy. That assertion is the field's whole reason to exist.
//
// WHY THE `## Run gaps` SECTION IS THE SOURCE. `run-gaps.json` carries the swept classes but no issue
// numbers; the filing refs live only in the summary's `## Run gaps` prose, under the strict grammar
// `- <class> (<sample>): filed: #N`. So "unmeasurable" here means the count could not be READ off that
// prose, and LOCATING the heading is not reading it. Measured over this repository's own 154 archived
// summaries: 6 sections carry 18 `filed: #N` refs the scan accounted for none of, and every one of
// them stamps a confident `0` (or an undercount) today. Their three shapes — mapping rows with no
// parenthesised sample, a strict-grammar row wrapped across physical lines, and a section written as
// a markdown table — each have a leg below, taken verbatim from the archived run that exhibits them.
//
// FREE TEXT AND PROSE ARE NOT UNREADABLE. `- none`, and a paragraph saying the sweep was clean, are
// ignored BY DESIGN for back-compat (parseGapSection says so and deliberately does not even warn on
// them), so such a section carries zero filings — a MEASUREMENT, and the same answer as an empty one.
// An implementation counting `- ` bullets reads 1 on `- none` and is wrong twice over. Prose is the
// LARGEST population in the archive and all of it is correct today, which is why the degradation must
// key on filings the parse did not account for and never on "the section had content I did not
// parse": those two rules agree on every leg below except the prose one, and that leg is the control.
//
// FOUR EDITIONS, like T13: the GitLab and Gitea claim ports are hand-mirrored and policed by nothing,
// so a fix applied to three copies and missed on the fourth is caught here or not at all.
// ---------------------------------------------------------------------------

// The `## Closure` block of the archived state this finalize wrote, as a field map.
function closureBlockOf(dest) {
  let s = '';
  try { s = fs.readFileSync(path.join(String(dest), 'workflow-state.md'), 'utf8'); } catch (_) { return null; }
  const m = s.match(/^## Closure$/m);
  if (!m) return null;
  const rest = s.slice(m.index + m[0].length);
  const end = rest.indexOf('\n## ');
  const fields = {};
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

(function T14_closureDeltaDegradesToATokenNeverToZero() {
  console.log('T14: an unmeasurable follow-up count degrades to `unknown`, and a measured zero stays `0`');

  // `summary` is the finalization-summary.md this run's orchestrator left behind, or null for the run
  // that left none. Returns the archived ## Closure block.
  function legFields(edition, tag, project, issue, summary) {
    const fx = buildMainResidentRun(tag, project, issue, { implCommit: true, residue: true });
    try {
      if (summary !== null) {
        fs.writeFileSync(path.join(fx.mainProj, 'finalization-summary.md'), summary);
      }
      const r = runFinalizeKeepWorktree(fx, edition.claim);
      const out = r.json;
      assert(r.status === 0 && out && out.status === 'closed',
        tag + ': exit stays 0 and closure completes — an unmeasurable field is a REPORT, and nothing '
        + 'here refuses; got status=' + r.status + ' stderr=' + String(r.stderr || '').slice(0, 300));
      const fields = out && out.dest ? closureBlockOf(out.dest) : null;
      assert(fields !== null,
        tag + ': the archived state must carry a parseable ## Closure block; dest='
        + JSON.stringify(out && out.dest));
      return fields || {};
    } finally {
      removeMainResidentRun(fx);
    }
  }

  for (const edition of CLAIM_EDITIONS) {
    if (!fs.existsSync(edition.claim)) {
      assert(false, 'T14(' + edition.name + '): the edition claim script exists at ' + edition.claim);
      continue;
    }
    const base = 'T14(' + edition.name + ')';

    // ---- ABSENT: this run wrote no summary at all, so finalize's own `## Validation` /
    // `## Changed Paths` writer creates one with no `## Run gaps` heading anywhere in it.
    const absent = legFields(edition, base + ' absent', 'issue-9931', 9931, null);
    assert(absent.follow_ups_filed === 'unknown',
      base + ' absent: there is no `## Run gaps` section to read, so the number of follow-ups this '
      + 'run filed was never measured. `0` here is a claim — "this run filed nothing" — that nobody '
      + 'made and nothing checked, and the archived record is the last place that claim can be '
      + 'corrected; got ' + JSON.stringify(absent.follow_ups_filed));
    assert(absent.net_backlog_delta === 'unknown',
      base + ' absent: the delta is arithmetic over a term that was not measured, so it is not '
      + 'measured either — an implementation that treats the missing count as zero reports a '
      + 'confident `-1` for a run whose net effect on the backlog is simply not known; got '
      + JSON.stringify(absent.net_backlog_delta));
    // THE THIRD DEGRADED FIELD. It is here because it was the one value in this block resting on
    // prose alone: the field spec enumerates `<a,b,c>|none` and offers no third token, so the
    // shipped `unknown` was chosen but pinned by nothing, and a later reader "restoring" it to the
    // documented `none` — or dropping the line, since a list of nothing looks like nothing to
    // render — would have stayed green forever. `none` is a MEASUREMENT ("we looked; nobody filed
    // anything"), and this lane did not look.
    assert(absent.follow_up_numbers === 'unknown',
      base + ' absent: the number list degrades with its count. `none` here would assert that this '
      + 'run filed nothing, over a section nobody could read — the same false confidence '
      + '`follow_ups_filed: unknown` exists to refuse, one field to its left; got '
      + JSON.stringify(absent.follow_up_numbers));
    // The measured half of the SAME block still reads normally: degradation is scoped to the term
    // that could not be read, and does not spread to the one that could.
    assert(absent.issues_closed === '1',
      base + ' absent: `issues_closed` comes from the claimed set, not from the summary, so an '
      + 'unreadable gap section must not degrade it too; got ' + JSON.stringify(absent.issues_closed));

    // ---- EMPTY: the heading is there and carries nothing. Somebody looked and found no gaps.
    const empty = legFields(edition, base + ' empty', 'issue-9932', 9932,
      '# Finalization Summary\n\n## Run gaps\n\n');
    assert(empty.follow_ups_filed === '0',
      base + ' empty: a `## Run gaps` section that is present and carries no filing is a measurement '
      + 'whose answer is zero, and it must read as a number; got '
      + JSON.stringify(empty.follow_ups_filed));
    assert(empty.follow_up_numbers === 'none',
      base + ' empty: with nothing filed the list reads `none` — an empty value would be '
      + 'indistinguishable from a field that failed to render; got '
      + JSON.stringify(empty.follow_up_numbers));
    assert(empty.net_backlog_delta === '-1',
      base + ' empty: one issue closed and nothing filed is a backlog one shorter, and with both '
      + 'terms measured the delta is too; got ' + JSON.stringify(empty.net_backlog_delta));

    // ---- FREE TEXT: `- none` under the heading. parseGapSection ignores it by design and does not
    // even warn, so this is the same measured zero — not a third answer, and not `1`.
    const freeText = legFields(edition, base + ' freetext', 'issue-9933', 9933,
      '# Finalization Summary\n\n## Run gaps\n\n- none\n');
    assert(freeText.follow_ups_filed === '0',
      base + ' freetext: `- none` is a free-text bullet the gap grammar ignores by design, so the '
      + 'section carries zero FILINGS — counting bullets rather than `filed:` refs reads 1; got '
      + JSON.stringify(freeText.follow_ups_filed));
    assert(freeText.follow_up_numbers === 'none',
      base + ' freetext: and no numbers to list; got ' + JSON.stringify(freeText.follow_up_numbers));

    // ---- THE UNREADABLE LEGS (#997). Three shapes, all four editions. Every fixture below is a
    // VERBATIM `## Run gaps` section from this repository's own archive — not an invented near-miss.
    // The shape #997 hypothesised (a bullet that nearly matches the parenthesised form, which the
    // parser's own advisory at gap-sweep.js:275 detects) occurs ZERO times in 154 archived summaries;
    // the advisory has never fired. These three are what actually loses refs, and none of them trips
    // that advisory — which is exactly why a fix keyed to it would change nothing and why these
    // fixtures, not that one, are what this leg drives.
    //
    // ASSERTED ON THE STAMP ONLY. How the parser comes to know it could not account for the section
    // — a third return state, the state it already has for an unlocatable one, a count carried out
    // alongside the rows — is the implementation's to choose, and nothing below can see the
    // difference. These read the archived `## Closure` block and nothing else.

    // NO SAMPLE GROUP. Five unambiguous `manual:<class>` -> `filed: #N` mappings, none carrying the
    // parenthesised sample the grammar requires. Fails strict (needs `\S+\s+\(`) and fails the
    // advisory too (needs a `(`), so the parser drops five filings without knowing it dropped
    // anything. Archive: bundle-904-905-906-907-908-909-910, the largest single loss in the corpus.
    const noSample = legFields(edition, base + ' nosample', 'issue-9934', 9934,
      '# Finalization Summary\n\n'
      + '## Run gaps\n'
      + '\n'
      + '- manual:relative-plan-receipt-placement: filed: #911\n'
      + '- manual:forge-sinkpreflight-divergence: filed: #912\n'
      + '- manual:env-allowlist-silently-discarded: filed: #913\n'
      + '- manual:keep-output-run-folder-band: filed: #915\n'
      + '- manual:finding-type-count-divergence: filed: #914\n');
    assert(noSample.follow_ups_filed === 'unknown',
      base + ' nosample: the section names five filings in plain sight and the parse accounted for '
      + 'none of them. `0` here is the same false claim the absent leg forbids, made over a section '
      + 'that is present — and it is the MORE dangerous of the two, because a reader who opens the '
      + 'summary finds the numbers right there and no reason to doubt the count; got '
      + JSON.stringify(noSample.follow_ups_filed));
    assert(noSample.follow_up_numbers === 'unknown',
      base + ' nosample: and the list with it. `none` would assert this run filed nothing while '
      + '#911, #912, #913, #915 and #914 sit unread in the section it was computed from; got '
      + JSON.stringify(noSample.follow_up_numbers));
    assert(noSample.net_backlog_delta === 'unknown',
      base + ' nosample: the delta is arithmetic over a term that was not measured, so it is not '
      + 'measured either; got ' + JSON.stringify(noSample.net_backlog_delta));
    assert(noSample.issues_closed === '1',
      base + ' nosample: `issues_closed` comes from the claimed set, not from the summary, so an '
      + 'unreadable gap section must not degrade it too; got '
      + JSON.stringify(noSample.issues_closed));

    // WRAPPED — THE PARTIAL CASE, and the leg that discriminates the shipped rule from the cheaper
    // one. Rows 1 and 3 are written in the EXACT strict grammar and fail only because the scan is
    // line-based and their continuation lines do not begin with `- `. Row 2 is single-line and
    // parses. So SOMETHING mapped: a rule that degrades only when the whole section failed reads
    // this as a measured `1` and reports #512 as the run's only filing, silently dropping #509. A
    // partial read is not a measurement of the whole. Archive: issue-500.
    const wrapped = legFields(edition, base + ' wrapped', 'issue-9935', 9935,
      '# Finalization Summary\n\n'
      + '## Run gaps\n'
      + '- manual:verdict-check-vs-486-adversarial-verifier (n4 emitted verdict:refuted, the correct #486\n'
      + '  investigation outcome, but adversarial-verifier ∈ GATE_VERDICT_ROLES so --verdict-check blocked\n'
      + '  the run until the gate-verdict was reframed to the deliverable-soundness axis): filed: #509\n'
      + '- deferred_red_chain (claude:512): filed: #512\n'
      + '- manual:run-chains-600s-timeout (claude chain ~574s standalone exit 0, but run-chains\' hardcoded\n'
      + '  600s spawnSync timeout records it red at finalize; waived via --accept-known-red claude:512 with\n'
      + '  standalone-green evidence): filed: #512\n');
    assert(wrapped.follow_ups_filed === 'unknown',
      base + ' wrapped: one of three mapping rows parsed, so `1` is not the number of follow-ups '
      + 'this run filed — it is the number the scan happened to reach. An undercount rendered as a '
      + 'plain integer is worse than no count: it is a measurement that is wrong, and nothing '
      + 'downstream can tell it from one that is right; got ' + JSON.stringify(wrapped.follow_ups_filed));
    assert(wrapped.follow_up_numbers === 'unknown',
      base + ' wrapped: and the list must not name #512 alone while #509 is recorded one row above '
      + 'it in the same section; got ' + JSON.stringify(wrapped.follow_up_numbers));
    assert(wrapped.net_backlog_delta === 'unknown',
      base + ' wrapped: a partial count makes the delta wrong by exactly as much, and it renders as '
      + 'a confident `0` — the run looks backlog-neutral; got '
      + JSON.stringify(wrapped.net_backlog_delta));

    // TABLE. Heading, nine content rows, seven filings, ZERO bullets — so the section is located,
    // the scan reads no `- ` line, and the result is indistinguishable from a section carrying
    // nothing. This is the shape that proves an empty parse cannot mean "measured zero": no bullet
    // was malformed here because there was never a bullet, and a test written around malformed
    // bullets would never reach it. Archive: issue-725.
    const table = legFields(edition, base + ' table', 'issue-9936', 9936,
      '# Finalization Summary\n\n'
      + '## Run gaps\n'
      + '\n'
      + '| Gap | Disposition |\n'
      + '|---|---|\n'
      + '| discard/release structurally unavailable for schema-2 projects (`state_compliance_authority_invalid`) | filed: #735 |\n'
      + '| replan prepare evidence check reads legacy `body`/`receipt_sha256`, refuses schema-2 receipts | filed: #734 |\n'
      + '| schema-2 freeze omits one-row-per-node compliance pre-seed (+ stale task mirror at fold) | filed: #719 (workaround applied) |\n'
      + '| replan prepare candidate-digest false positive on schema-2 attempts | filed: #720 (workaround applied) |\n'
      + '| epoch activation lacks cross-epoch review-journal rotation | filed: #722 (workaround applied) |\n'
      + '| finalize attribution sweep not epoch-lineage-aware | filed: #724 (workaround applied, evidence above) |\n'
      + '| proxy EADDRNOTAVAIL on rapid gh bursts (claim escalation ×5) | noise: environmental flake, recovered by retry |\n'
      + '| sink-merge FF-race gate red: detectReviewRuntime misclassifies a default-named (`kaola-workflow`) self-dev checkout as opencode → `#712[self-dev]` fails in the main root (pre-existing; reproduced on pristine main `7c40f33b`; sink completed manually against the green worktree receipt) | filed: #736 |\n'
      + '| GAP-5/6/7 unowned-file discoveries (required-blocks.js, forge sinks tests, test-bundle-finalize) | resolved in-run: owned + fixed by the epoch-2 repair (n1-repair write set) |\n');
    assert(table.follow_ups_filed === 'unknown',
      base + ' table: seven filings are written under the heading in a form the scan does not read, '
      + 'and "I found no bullets" is not "the operator filed nothing"; got '
      + JSON.stringify(table.follow_ups_filed));
    assert(table.follow_up_numbers === 'unknown',
      base + ' table: and the list with it; got ' + JSON.stringify(table.follow_up_numbers));
    assert(table.net_backlog_delta === 'unknown',
      base + ' table: and the delta, which today reports this run as having SHORTENED the backlog by '
      + 'one while it in fact filed seven; got ' + JSON.stringify(table.net_backlog_delta));

    // PROSE — THE CONTROL, and the reason the three legs above mean what they say. A `## Run gaps`
    // section carrying only a prose "nothing to map" statement is the single largest population in
    // the archive and every one of them is CORRECT today: somebody looked, there were no gaps, and
    // zero is the measurement. Without this leg, a build that degrades whenever the section has
    // content and the parse produced no entries passes all three legs above and reds nothing — while
    // converting the archive's largest correct population into `unknown`. Note what this fixture
    // carries: parentheses, backticks, a colon before a bracket, and the token `deferred-red`. What
    // it does NOT carry is a filing. Archive: bundle-587-589.
    const prose = legFields(edition, base + ' prose', 'issue-9937', 9937,
      '# Finalization Summary\n\n'
      + '## Run gaps\n'
      + '\n'
      + '**none** — gap sweep clean. `kaola-workflow/bundle-587-589/.cache/run-gaps.json` has\n'
      + '`sweptClasses: []` (no repairs, halts, or deferred-red to map).\n');
    assert(prose.follow_ups_filed === '0',
      base + ' prose: a section that says in prose that the sweep was clean is a section somebody '
      + 'read and answered — the same measured zero as an empty one, not a third answer. This is the '
      + 'assertion that stops "unreadable" from widening into "not in the grammar"; got '
      + JSON.stringify(prose.follow_ups_filed));
    assert(prose.follow_up_numbers === 'none',
      base + ' prose: and nothing to list; got ' + JSON.stringify(prose.follow_up_numbers));
    assert(prose.net_backlog_delta === '-1',
      base + ' prose: both terms measured, so the delta is too; got '
      + JSON.stringify(prose.net_backlog_delta));

    // The second pair, on the same footing as the first. `table` is the sharpest partner for `empty`
    // because the two are IDENTICAL to the parse — heading located, no row read — and opposite in
    // fact: one section carries nothing, the other carries seven filings.
    assert(table.follow_ups_filed !== empty.follow_ups_filed,
      base + ': "the section was read and carried nothing" and "the section could not be read" must '
      + 'not render the same. Locating a heading is not measuring what is under it. Both read '
      + JSON.stringify(empty.follow_ups_filed));

    // ---- THE PAIR. Neither constant satisfies this one.
    assert(absent.follow_ups_filed !== empty.follow_ups_filed,
      base + ': "nobody measured" and "measured, and it was zero" must not render the same. This is '
      + 'the assertion the field exists for: an implementation that always says `unknown` passes the '
      + 'absent leg, one that always says `0` passes the empty leg, and only a build that actually '
      + 'distinguishes the two passes here. Both read '
      + JSON.stringify(absent.follow_ups_filed));
    assert(absent.net_backlog_delta !== empty.net_backlog_delta,
      base + ': and the delta inherits the distinction — a run whose effect on the backlog is '
      + 'unknown must not be recorded as the same fact as a run that measurably shortened it by one. '
      + 'Both read ' + JSON.stringify(absent.net_backlog_delta));
    assert(absent.follow_up_numbers !== empty.follow_up_numbers,
      base + ': and so does the list. The regression this forbids is the plausible one — the field '
      + 'spec enumerates `<a,b,c>|none` and no third token, so collapsing the unmeasured lane onto '
      + 'the documented `none` looks like tidying and is the conflation itself. Both read '
      + JSON.stringify(absent.follow_up_numbers));
  }
})();

// ---------------------------------------------------------------------------
// T15 (#1002) — a `chains_stale` finding reaches BOTH finalize consumers CARRYING ITS CULPRITS.
//
// T3d already pins that a stale receipt reports its TOKEN twice. The token is where the report
// stops: `chains_stale` names a condition and names nothing that caused it, so a reader holding the
// envelope cannot tell a CHANGELOG edit from a code change, and the two answers demand opposite
// actions (regenerate the receipt vs. go look at what changed). The producer already computed the
// difference — the finding object `evaluateChainReceipt` returns carries `stale_paths` and
// `stale_kind` — and two consumers throw it away. This block pins that they stop.
//
// Field names are the PAYLOAD'S OWN, at both sites: `stale_paths`, `stale_kind`,
// `stale_paths_truncated`. One wording, so nobody has to learn a second spelling for the same fact.
//
// WHAT IS DELIBERATELY NOT CHANGED. `checks.validation` stays the bare classification STRING. It is
// a documented envelope contract with live readers (docs/api.md, `finalize --check`), and reshaping
// it into an object would break them to carry a fact that fits perfectly well in sibling keys. So
// the diagnostics arrive ALONGSIDE it, exactly as `changed_paths` and `dirty_paths` already do — and
// T15 asserts the string is still a string, so a fix that reshapes it fails here.
//
// `checks.stale_paths` IS NOT `checks.changed_paths`. They answer different questions over different
// intervals — "what moved since the chains ran" vs "what this branch changed since its base" — and in
// the run that filed #1002 they genuinely disagreed. The code leg below asserts that disagreement
// directly, so an implementation that aliases one onto the other cannot pass.
//
// THE WORKING CONTROL. The finalize TRANSACTION envelope (the `validation` object on the finalize
// emit) assigns the whole finding and already carries everything. Every leg asserts it. That is not
// spare coverage: without it a red on the two consumers could equally mean "the fixture never
// produced diagnostics at all", and the pins would be measuring the fixture instead of the drop.
//
// ABSENCE IS A VALUE. `computeChainsStaleDiagnostics` declines to answer when the receipt is not
// bound to a resolvable clean commit (no headSha, or a dirty-stamped worktree), and the two degrade
// legs pin that the consumers say NOTHING there rather than emitting `[]` — an empty list reads as
// "measured, and nothing changed", which over a stale receipt is a claim the code never made.
// ---------------------------------------------------------------------------
(function T15_chainsStaleCarriesItsCulprits() {
  console.log('T15: a chains_stale finding carries its culprit paths onto `--check` and into `## Validation`');

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  // The `## Validation` body as trimmed, non-empty lines — the section is a key/value block plus
  // free paragraphs, and every assertion below is about a LINE, never about a substring that could
  // land inside an interpolated hash or hint sentence.
  const bodyLines = body => String(body || '').split('\n').map(l => l.trim()).filter(Boolean);

  // One leg. Stales a fixture, then reads the SAME finding through all three consumers: the
  // read-only `--check` envelope, the finalize transaction envelope (control), and the durable
  // `## Validation` section. `mutateReceipt` is for the degrade legs; `staleTree` commits the drift.
  function leg(spec) {
    const fx = buildFinalizeFixture('t15', spec.project, spec.issue);
    try {
      const produced = produceGreenReceipt(fx.repo, fx.project, fx.greenMock);
      assert(produced.receipt !== null, spec.label + ': the producer wrote a chain receipt'
        + '\nstderr: ' + String(produced.result.stderr || '').slice(0, 300));
      if (!produced.receipt) return;
      if (spec.mutateReceipt) {
        putReceiptEverywhere(fx.repo, fx.project, JSON.stringify(spec.mutateReceipt(produced.receipt)));
      }
      spec.staleTree(fx.repo);
      G.commitAll(fx.repo, 'drift after the chains ran');

      // (1) THE READ-ONLY PRE-FLIGHT — drop site 1.
      const chk = fx.finalize(['--check', '--json']);
      const checks = (chk.out && chk.out.checks) || null;
      assert(chk.r.status === 0 && checks !== null,
        spec.label + ': `finalize --check --json` emits a checks envelope and exits 0 — a receipt '
        + 'finding is state, never an unmet precondition; got status=' + chk.r.status
        + ' stdout=' + String(chk.r.stdout || '').slice(0, 500));
      if (!checks) return;
      assert(checks.validation === 'chains_stale',
        spec.label + ': the pre-flight classifies the receipt chains_stale, and `validation` is still '
        + 'the BARE TOKEN STRING the documented envelope promises — a fix that reshapes it into an '
        + 'object breaks every existing reader; got ' + JSON.stringify(checks.validation));

      // (2) THE TRANSACTION ENVELOPE — the working control, green before the fix.
      const fin = fx.finalize();
      const v = (fin.out && fin.out.validation) || null;
      assert(fin.r.status === 0 && v && v.classification === 'chains_stale',
        spec.label + ' [control]: finalize passes over the stale receipt and its envelope carries the '
        + 'finding OBJECT; got status=' + fin.r.status + ' validation=' + JSON.stringify(v));
      if (!v) return;

      // (3) THE DURABLE COPY — drop site 2.
      const summary = readFinalizationSummary(fx.repo, fx.project, fin.out && fin.out.dest);
      assert(summary !== null, spec.label + ': finalization-summary.md exists after finalize');
      const lines = summary ? bodyLines(sectionBody(summary.text, '## Validation')) : null;
      assert(lines !== null && lines.length > 0,
        spec.label + ': the archived summary carries a non-empty `## Validation` section');

      spec.check({ label: spec.label, checks, control: v, lines: lines || [] });
    } finally { rm(fx.base); }
  }

  // ---- CODE-stale: one new source file, committed after the receipt was stamped.
  leg({
    project: 'issue-9101', issue: 9101, label: 'T15a (code-stale)',
    staleTree: repo => fs.writeFileSync(path.join(repo, 'newcode.js'), 'module.exports = 1002;\n'),
    check: ({ label, checks, control, lines }) => {
      assert(eq(control.stale_paths, ['newcode.js']) && control.stale_kind === 'code',
        label + ' [control]: the finding itself names the culprit — if this fails the FIXTURE is '
        + 'wrong, not the consumers; got ' + JSON.stringify({ p: control.stale_paths, k: control.stale_kind }));
      assert(eq(checks.stale_paths, ['newcode.js']),
        label + ': `checks.stale_paths` carries the culprit path the finding computed, verbatim; got '
        + JSON.stringify(checks.stale_paths));
      assert(checks.stale_kind === 'code',
        label + ': `checks.stale_kind` says the drift is CODE; got ' + JSON.stringify(checks.stale_kind));
      // The anti-aliasing pin. `changed_paths` is measured against the branch base and is EMPTY here
      // (this fixture never left main), while `stale_paths` is measured against the receipt's own
      // commit and is not. Satisfying stale_paths by pointing it at changed_paths fails here.
      assert(!(checks.changed_paths || []).includes('newcode.js')
        && (checks.stale_paths || []).includes('newcode.js'),
        label + ': `stale_paths` and `changed_paths` answer DIFFERENT questions and disagree here — '
        + 'the first is drift since the receipt, the second is this branch against its base; got '
        + 'changed_paths=' + JSON.stringify(checks.changed_paths)
        + ' stale_paths=' + JSON.stringify(checks.stale_paths));
      assert(lines.includes('stale_kind: code'),
        label + ': the durable `## Validation` records `stale_kind: code` on its own line; got '
        + JSON.stringify(lines));
      assert(lines.includes('stale_paths:') && lines.includes('- newcode.js'),
        label + ': and lists the culprit under a `stale_paths:` label, one `- <path>` bullet per '
        + 'path — the same rendering `## Changed Paths` already uses; got ' + JSON.stringify(lines));
      // Negative half of the discrimination this issue is about: a code-stale record must not read
      // like the prose-only one below.
      assert(!lines.includes('stale_kind: prose-only'),
        label + ': and never claims prose-only; got ' + JSON.stringify(lines));
    }
  });

  // ---- PROSE-ONLY-stale: CHANGELOG.md is in SELF_HOST_TEST_CONSUMED, so it is code-VISIBLE (it
  // stales the receipt) yet classified prose. THE PIN THAT MATTERS MOST: before the fix this leg's
  // `--check` envelope and `## Validation` section were byte-identical to T15a's, which is exactly
  // the indistinguishability #1002 names.
  leg({
    project: 'issue-9102', issue: 9102, label: 'T15b (prose-only-stale)',
    staleTree: repo => fs.appendFileSync(path.join(repo, 'CHANGELOG.md'), '\n- a narrative line\n'),
    check: ({ label, checks, control, lines }) => {
      assert(eq(control.stale_paths, ['CHANGELOG.md']) && control.stale_kind === 'prose-only',
        label + ' [control]: the finding itself classifies the drift prose-only; got '
        + JSON.stringify({ p: control.stale_paths, k: control.stale_kind }));
      assert(eq(checks.stale_paths, ['CHANGELOG.md']),
        label + ': `checks.stale_paths` names the prose file; got ' + JSON.stringify(checks.stale_paths));
      assert(checks.stale_kind === 'prose-only',
        label + ': `checks.stale_kind` reads `prose-only` — THE discrimination #1002 exists for: this '
        + 'envelope and T15a\'s were identical before, and they demand different actions; got '
        + JSON.stringify(checks.stale_kind));
      assert(lines.includes('stale_kind: prose-only'),
        label + ': the durable `## Validation` records `stale_kind: prose-only`; got ' + JSON.stringify(lines));
      assert(lines.includes('stale_paths:') && lines.includes('- CHANGELOG.md'),
        label + ': and names the prose culprit; got ' + JSON.stringify(lines));
      assert(!lines.includes('- newcode.js'),
        label + ': and names nothing the code leg named; got ' + JSON.stringify(lines));
    }
  });

  // ---- TRUNCATED: more culprits than the producer will list. The cap is production's to choose, so
  // nothing here spells it — the control says what the finding held and the consumers must match it
  // EXACTLY, flag included. A consumer that copies the list and drops the flag reports twenty paths
  // as if they were all of them.
  leg({
    project: 'issue-9103', issue: 9103, label: 'T15c (truncated)',
    staleTree: repo => {
      for (let i = 0; i < 40; i++) {
        fs.writeFileSync(path.join(repo, 'bulk' + String(i).padStart(2, '0') + '.js'), 'module.exports = ' + i + ';\n');
      }
    },
    check: ({ label, checks, control, lines }) => {
      assert(control.stale_paths_truncated === true && (control.stale_paths || []).length < 40,
        label + ' [control]: the finding capped its list and flagged the cap; got length='
        + (control.stale_paths || []).length + ' truncated=' + JSON.stringify(control.stale_paths_truncated));
      assert(eq(checks.stale_paths, control.stale_paths),
        label + ': `checks.stale_paths` reproduces the finding\'s list exactly — same members, same '
        + 'cap, same order; got ' + JSON.stringify(checks.stale_paths));
      assert(checks.stale_paths_truncated === true,
        label + ': `checks.stale_paths_truncated` survives too — without it a capped list reads as a '
        + 'complete one; got ' + JSON.stringify(checks.stale_paths_truncated));
      assert(lines.includes('stale_paths_truncated: true'),
        label + ': and the durable `## Validation` says the list was cut; got ' + JSON.stringify(lines.slice(0, 8)));
      assert((control.stale_paths || []).length > 0 && control.stale_paths.every(p => lines.includes('- ' + p)),
        label + ': every path the finding kept is a bullet in the durable section; got '
        + JSON.stringify(lines.slice(0, 8)));
    }
  });

  // ---- DEGRADE (dirty-stamped receipt) and DEGRADE (no headSha). computeChainsStaleDiagnostics
  // refuses to answer over a receipt it cannot bind to a clean commit. Both consumers must then be
  // SILENT — no key, not an empty one.
  for (const d of [
    { project: 'issue-9104', issue: 9104, label: 'T15d (dirty-stamped receipt)',
      mutateReceipt: r => Object.assign({}, r, { workTreeHash: 'deadbeefdeadbeef' }) },
    { project: 'issue-9105', issue: 9105, label: 'T15e (receipt carries no headSha)',
      mutateReceipt: r => { const c = Object.assign({}, r); delete c.headSha; return c; } },
  ]) {
    leg({
      project: d.project, issue: d.issue, label: d.label, mutateReceipt: d.mutateReceipt,
      staleTree: repo => fs.writeFileSync(path.join(repo, 'newcode.js'), 'module.exports = 1002;\n'),
      check: ({ label, checks, control, lines }) => {
        assert(!has(control, 'stale_paths') && !has(control, 'stale_kind'),
          label + ' [control]: the finding itself declines to diagnose an unbindable receipt; got '
          + JSON.stringify({ p: control.stale_paths, k: control.stale_kind }));
        assert(!has(checks, 'stale_paths') && !has(checks, 'stale_kind'),
          label + ': so the pre-flight emits NEITHER key — `[]` would read as "measured, nothing '
          + 'changed", which over a stale receipt is a claim nothing made; got '
          + JSON.stringify({ stale_paths: checks.stale_paths, stale_kind: checks.stale_kind }));
        assert(!lines.some(l => /^stale_(paths|kind)/.test(l)),
          label + ': and the durable `## Validation` invents no diagnostics either; got '
          + JSON.stringify(lines));
      }
    });
  }
})();

// ---------------------------------------------------------------------------
// Final result — AUTHORITATIVE. Two appended blocks now sit after this file's original footer, and
// the counters are cumulative, so the two earlier summary lines are intermediate totals and THIS is
// the one that decides the exit code.
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('finalize-door tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('finalize-door tests passed (' + passed + ' assertions)');
}
