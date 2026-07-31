#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// P1 — the kill test. A1 EXECUTED, not asserted.
//
//   A1 (Successor). At any interruption, a fresh agent with zero conversational context must
//   be able to pick the run up from durable state alone.
//
// Everything else is derived from A1, and until this suite existed A1 was the one axiom
// nothing ran. `test-kernel-conformance.js` rules WHICH artifacts are the kernel and proves
// the atomic-write obligation is scoped to it — that ruling is this suite's specification —
// but it only observes writes that COMPLETED. It cannot interrupt anything.
//
//   1. Drive a REAL run to a genuinely mid-lifecycle point: the production CLI over a real
//      git repository and a real frozen plan, advanced until a node is open.
//   2. KILL IT MID-WRITE — SIGKILL inside the atomic-replace window, after the bytes are
//      fsynced to the temp file and before the rename publishes them. A kill that only ever
//      lands between transactions cannot observe T2 at all.
//   3. Delete every artifact the ruling calls `derivable` or `preference`. What survives is
//      the durable kernel and nothing else.
//   4. Prove a FRESH PROCESS orients coherently and the run advances.
//   5. MUTATION-PROVE it: delete one genuine RECORD band and the successor must FAIL. Without
//      this, every green above is equally consistent with "the successor needed nothing at
//      all", and A1 would be satisfied and untested by the same run.
//
// Both process boundaries are the property under test: killing a process and re-reading what
// it left is not expressible in-process, and the cross-process durable handoff IS A1.
//
// Run: node scripts/test-kernel-successor.js        (~40s; every scenario does real git work)
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ===========================================================================
// THE CRASH VEHICLE — this file is ALSO its own `node --require` preload.
//
// The kill has to happen inside the production writer's atomic replace, which means inside the
// child process, which means something must be loaded into it. Keeping that in this same file
// rather than a sibling is deliberate: the preload and the assertions about what it did are one
// artifact, so the vehicle cannot drift away from the suite that depends on it.
//
// INERT unless KAOLA_SUCCESSOR_KILL_AT names a target basename — a normal `require` of this
// module patches nothing. When armed, it intercepts the rename that COMPLETES the atomic
// replace and kills the process before it lands, so the target keeps its previous bytes while
// the fully-written replacement sits beside it as an orphan temp. Both versions on disk, the
// published one whole: that is the T2 window, observed.
// ===========================================================================

const KILL_AT = process.env.KAOLA_SUCCESSOR_KILL_AT;
if (KILL_AT) {
  const realRenameSync = fs.renameSync.bind(fs);
  fs.renameSync = function (from, to) {
    if (path.basename(String(to)) === KILL_AT) {
      // Record the interception BEFORE dying, so the suite can prove the kill fired at the
      // intended target. A scenario whose target name is wrong would otherwise run to a clean
      // exit and assert happily about a crash that never happened.
      try {
        fs.appendFileSync(process.env.KAOLA_SUCCESSOR_KILL_LOG,
          JSON.stringify({ from: String(from), to: String(to), pid: process.pid }) + '\n');
      } catch (_) { /* never throw out of the vehicle */ }
      process.kill(process.pid, 'SIGKILL');
    }
    return realRenameSync(from, to);
  };
}

// Heavy modules are loaded lazily so an armed child pays nothing for them.
let _schema = null;
function schema() {
  if (_schema === null) _schema = require('./kaola-workflow-adaptive-schema');
  return _schema;
}
let _validator = null;
function validator() {
  if (_validator === null) _validator = require('./kaola-workflow-plan-validator');
  return _validator;
}

const NODE_CLI = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
const PLAN_VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

let passed = 0;
const assert = require('assert');
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Kernel Successor', GIT_AUTHOR_EMAIL: 'successor@example.com',
  GIT_COMMITTER_NAME: 'Kernel Successor', GIT_COMMITTER_EMAIL: 'successor@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};
// The suite's own environment must never carry the vehicle's arming variables into a successor
// call — a successor that kills itself would look exactly like a successor that cannot resume.
const BASE_ENV = Object.assign({}, process.env, GIT_ENV);
delete BASE_ENV.KAOLA_SUCCESSOR_KILL_AT;
delete BASE_ENV.KAOLA_SUCCESSOR_KILL_LOG;

const TEMP_DIRS = [];

// The kill journal lives OUTSIDE the fixture repository. Measured the hard way: written inside
// it, the journal is an undeclared path in the work tree and the next barrier check refuses
// `write_set_overflow` — a harness artifact that reads exactly like a kernel finding.
//
// Created lazily, because this module is loaded into every armed child too: allocating it at
// module scope leaked one orphan temp directory per kill (measured: 123 of them across a few
// runs) and made the preload path do filesystem work before the CLI under test had started.
let _killLog = null;
function killLog() {
  if (_killLog === null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-successor-log-'));
    TEMP_DIRS.push(dir);
    _killLog = path.join(dir, 'kills.jsonl');
  }
  return _killLog;
}

// ---------------------------------------------------------------------------
// The fixture: a real repository, a real frozen plan, a real claim.
// ---------------------------------------------------------------------------

function git(repoRoot, args) {
  // A real git repository is the environment the production CLI resolves its baselines and
  // barrier diffs against; a stub work tree would make every position record meaningless.
  // spawn-class: environment
  return spawnSync('git', ['-C', repoRoot, ...args],
    { encoding: 'utf8', env: BASE_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
}

function buildRun() {
  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-successor-')));
  TEMP_DIRS.push(repoRoot);
  git(repoRoot, ['init', '-b', 'main']);
  git(repoRoot, ['config', 'user.name', 'Kernel Successor']);
  git(repoRoot, ['config', 'user.email', 'successor@example.com']);
  git(repoRoot, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoRoot, 'product.js'), 'module.exports = 1;\n');
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-m', 'root']);
  git(repoRoot, ['checkout', '-b', 'workflow/issue-777']);

  const project = 'issue-777';
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });

  let plan = [
    '# Workflow Plan — ' + project, '', '## Meta', 'project: ' + project, 'plan_form: spine',
    'labels: enhancement', 'speculative_open_policy: auto',
    'validation_command: node -e "process.exit(0)"', 'validation_timeout_minutes: 30',
    'plan_schema_version: 2', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| impl | tdd-guide | — | product.js | 1 | sequence | standard | — | — | — | — |',
    '| verify | code-reviewer | impl | — | 1 | sequence | standard | — | — | — | — |',
    '| finalize | finalize | verify | — | 1 | sequence | — | — | — | — | — |',
    '', '## Design', '',
    'Decompose the spine into concrete role nodes; every sequence edge is a real data dependency (S1) or a gate ordering. Done means validation passes.',
    '', '## Acceptance', '', 'A1: the declared write set lands the change the issue asked for.',
    'A2: the recorded validation_command passes over the candidate.',
    '', '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| impl | pending |', '| verify | pending |', '| finalize | pending |',
    '', '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |',
    '| --- | --- | --- | --- |', '| tdd-guide (impl) | pending | | |',
    '| code-reviewer (verify) | pending | | |', '| finalize (finalize) | pending | | |', '',
  ].join('\n');
  const planHash = validator().computePlanHash(plan);
  plan = plan.replace(/^# Workflow Plan[^\n]*\n/, match => match + '\n<!-- plan_hash: ' + planHash + ' -->\n');
  fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), plan);
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'step: start', 'next_command: /kaola-workflow-plan-run ' + project,
    'next_skill: kaola-workflow-plan-run ' + project,
    '', '## Planning Evidence', 'plan_hash: ' + planHash, 'decision: auto-run',
    'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
    'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink', 'branch: workflow/issue-777',
    'issue_number: 777', 'sink: merge', 'main_root: ' + repoRoot, 'session_marker: kernel-successor',
    'claim_ts: 2026-07-28T00:00:00.000Z', 'worktree_path: ' + repoRoot, '',
  ].join('\n'));
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-m', 'seed']);
  return { repoRoot, project, projectDir };
}

// successor — a FRESH PROCESS with no shared heap, reading the kernel off disk. Every call here
// is the durable handoff: whatever the previous process left on disk is the whole of what this
// one knows. Converting these to in-process calls would delete the only place A1 is checked.
function successor(run, args, input) {
  const opts = {
    cwd: run.repoRoot, encoding: 'utf8', env: BASE_ENV, stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (input !== undefined) opts.input = input;
  // spawn-class: durable-handoff
  const result = spawnSync(process.execPath, [NODE_CLI, ...args], opts);
  let out = null;
  try { out = JSON.parse(result.stdout); } catch (_) { /* a throw leaves no envelope; that is data */ }
  return { status: result.status, signal: result.signal, out, stdout: result.stdout, stderr: result.stderr };
}

// killDuring — run one CLI subcommand under the armed crash vehicle. Returns the dead child.
function killDuring(run, target, args) {
  const log = killLog();
  const before = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  fs.writeFileSync(log, before);
  const env = Object.assign({}, BASE_ENV, {
    KAOLA_SUCCESSOR_KILL_AT: target,
    KAOLA_SUCCESSOR_KILL_LOG: log,
    NODE_OPTIONS: [process.env.NODE_OPTIONS || '', '--require', __filename].filter(Boolean).join(' '),
  });
  // Kill mid-write, restart, recover — the property lives at the process boundary by
  // construction: an in-process "crash" is a thrown exception with the heap still intact, which
  // is the one thing a successor never gets.
  // spawn-class: crash
  const result = spawnSync(process.execPath, [NODE_CLI, ...args],
    { cwd: run.repoRoot, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  const after = fs.readFileSync(log, 'utf8').slice(before.length);
  const kills = after.split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { status: result.status, signal: result.signal, kills };
}

function artifacts(projectDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      out.push(path.relative(projectDir, full).split(path.sep).join('/'));
    }
  })(projectDir);
  return out.sort();
}

// keepRecordsOnly — take away everything the successor is not entitled to. The ruling in
// KERNEL_ARTIFACT_REGISTRY decides, not this suite: `record` survives, everything else goes.
// `unclassified` goes too, and that band is not empty — a torn atomic replace leaves an orphan
// temp file no registry row covers (see the MEASURED notes at the foot of this file).
function keepRecordsOnly(projectDir) {
  const removed = [];
  for (const rel of artifacts(projectDir)) {
    const ruling = schema().classifyDurableArtifact(rel).ruling;
    if (ruling === 'record') continue;
    fs.unlinkSync(path.join(projectDir, rel));
    removed.push(ruling + ':' + rel);
  }
  return removed;
}

function ledgerOf(projectDir) {
  const plan = fs.readFileSync(path.join(projectDir, 'workflow-plan.md'), 'utf8');
  const section = plan.split('## Node Ledger')[1] || '';
  return section.split('##')[0];
}

// ===========================================================================
// PART 1 — the kill lands INSIDE the atomic-replace window (T2 observed).
//
// The kernel record chosen is workflow-plan.md, whose ## Node Ledger is the position half of the
// Plan record: `open-next` flips `impl` from pending to in_progress by replacing that file. The
// vehicle kills the process between the fsync and the rename.
// ===========================================================================

function part1_killLandsInsideTheWindow() {
  const run = buildRun();
  successor(run, ['orient', '--project', run.project, '--json']);
  const planPath = path.join(run.projectDir, 'workflow-plan.md');
  const before = fs.readFileSync(planPath);

  const dead = killDuring(run, 'workflow-plan.md', ['open-next', '--project', run.project, '--json']);

  // Non-vacuity of the crash itself. If the target basename were wrong the child would exit 0
  // and every assertion below would be about a run that was never interrupted.
  equal(dead.signal, 'SIGKILL', 'the child really died by signal, it did not exit');
  equal(dead.status, null, 'a signalled death carries no exit status');
  equal(dead.kills.length, 1, 'the vehicle fired exactly once, at the intended record');
  equal(path.basename(dead.kills[0].to), 'workflow-plan.md', 'the kill intercepted the Plan record write');

  // The window is real: the replacement was fully written and is sitting on disk unpublished.
  const orphans = artifacts(run.projectDir).filter(rel => /\.tmp$/.test(rel));
  equal(orphans.length, 1, 'the fsynced replacement survives the kill as an orphan temp — the kill was INSIDE the replace, not before it');
  const orphan = fs.readFileSync(path.join(run.projectDir, orphans[0]), 'utf8');
  ok(orphan.includes('| impl | in_progress |'),
    'the unpublished temp holds the NEXT version of the record, so both versions were on disk at the instant of death');

  // T2, the whole point: the successor sees the previous record WHOLE. Not mostly-whole.
  const after = fs.readFileSync(planPath);
  ok(before.equals(after),
    'the published Plan record is byte-identical to its pre-transaction bytes — a successor never sees half a record');
  ok(!ledgerOf(run.projectDir).includes('| impl | in_progress |'),
    'the ledger flip did not land: the transaction is absent, not partial');

  // And it is still a VALID kernel record, not merely an intact-looking file: the plan hash the
  // successor will re-check covers the bytes that survived.
  // spawn-class: durable-handoff
  const check = spawnSync(process.execPath, [PLAN_VALIDATOR, planPath, '--resume-check', '--json'],
    { encoding: 'utf8', env: BASE_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  const verdict = JSON.parse(check.stdout);
  equal(verdict.ok, true, 'the surviving Plan record still passes --resume-check: its hash covers intact bytes');

  // `dead` travels to PART 2 so the holder the report names can be checked against the pid this
  // vehicle actually killed. Without it, PART 2 could only assert that SOME holder was reported.
  return { run, dead };
}

// ===========================================================================
// PART 2 — the crashed holder is REPORTED, and the report carries a LIVE exit.
//
// This is the route contract met at a real crash rather than at a synthesized one. The dead
// process held the scheduler lock; nothing reclaims it. The successor is entitled to know both
// that it is blocked and how to get through, and the recorded route is FOLLOWED here — the verb
// is read out of the payload, never hard-coded, so a route that named a dead verb would fail this
// suite exactly the way a wedge would.
//
// THE CONVERSION THIS PART NOW PINS. Contention became an exit-0 report (`result: 'answer'`)
// instead of a stop. The mutual exclusion did not change and the body still does not run — what
// changed is that "I did not run" moved OUT of the exit code and INTO fields. That makes the
// fields load-bearing in a way they were not when a non-zero exit carried the same news, so every
// one of them is checked BY CONTENT here:
//
//   * did the body run?      `acquired` / `mutation_performed` / `did_not_run`, cross-checked
//                            against the LEDGER ON DISK — the envelope's claim is verified against
//                            the world, not taken at its word.
//   * who is holding it?     `holder.pid` must equal the pid the vehicle actually killed. A
//                            presence check would accept `{}`; identity cannot be faked.
//   * is the holder gone?    the liveness measurement, including the fact that staleness was
//                            concluded from the SIGNAL PROBE and not from the clock.
//   * how do I get through?  a runnable verb — not a terminal class — that is FOLLOWED, and whose
//                            holder-identity CAS proves the reported pid is not decoration.
// ===========================================================================

function part2_theRefusalRoutes(crashed) {
  const { run, dead } = crashed;
  const killedPid = dead.kills[0].pid;

  const blocked = successor(run, ['open-next', '--project', run.project, '--json']);

  // The conversion itself. Exit 0 and `answer` are the property, so they are asserted as the two
  // separate facts they are: a non-zero exit with an `answer` envelope, or exit 0 with a `refuse`
  // envelope, are both incoherent states this would catch.
  equal(blocked.status, 0, 'a crashed holder does not stop the successor: it reports at exit 0');
  equal(blocked.out.result, 'answer',
    'and reports it as an ANSWER — the successor is told it is blocked, rather than being stopped');
  equal(blocked.out.reason, 'scheduler_lock_stale', 'and it is told exactly what is holding it');
  equal(blocked.out.condition, 'scheduler_lock_stale',
    'the legacy condition token rides out with the report, so converting the verdict did not make the site invisible');
  equal(blocked.out.refusal_locus, 'L1', 'a crashed kernel-write holder is still located at L1');
  equal(blocked.out.refusal_family, 'kernel_lock_held', 'carried as a family code, not a bespoke one');
  equal(blocked.out.kind, 'scheduler',
    'discriminated within the family, which is what resolves the route: the family alone routes nowhere');

  // WHAT THE EXIT CODE STOPPED CARRYING. Before the conversion, non-zero WAS the statement that
  // the body did not run. Now it is three fields — and they are checked against the disk, because
  // an envelope that says `mutation_performed: false` over a mutation that happened is exactly the
  // complete-coherent-and-false record a successor cannot route around.
  equal(blocked.out.acquired, false, 'the report says the lock was not acquired');
  equal(blocked.out.mutation_performed, false, 'and that nothing was mutated');
  equal(blocked.out.did_not_run, 'open-next',
    'naming the subcommand that was skipped, so the successor knows WHAT to re-run and not merely that something failed');
  ok(!ledgerOf(run.projectDir).includes('| impl | in_progress |'),
    'and the LEDGER ON DISK agrees with that claim: the guarded body genuinely did not run, so the exit-0 report is not a lie the successor would have no move against');

  // WHO holds it, by identity. This is the assertion a presence check cannot make: the pid in the
  // report is the pid this suite's vehicle killed, so the holder block is a measurement of the
  // real crashed process rather than a placeholder shaped like one.
  equal(blocked.out.holder.pid, killedPid,
    'the reported holder IS the process the vehicle killed — holder identity by content, which `holder != null` would never catch');
  equal(blocked.out.holder.subcommand, 'open-next',
    'and it records what the dead holder was doing, so a successor can tell a crashed open from a crashed close');
  equal(blocked.out.holder.host, os.hostname(),
    'and where it was running — without a host a pid is not an identity across machines');
  ok(Number.isInteger(blocked.out.holder.ts) && blocked.out.holder.ts > 0
    && blocked.out.holder.ts <= Date.now(),
    'and when it claimed, as a real epoch stamp rather than a rendered string');
  ok(blocked.out.lockPath.startsWith(run.projectDir + path.sep) && fs.existsSync(blocked.out.lockPath),
    'the reported lockPath is this project\'s real, existing lockfile — the report points at the thing it describes');

  // IS THE HOLDER GONE — the liveness measurement the conversion kept. The load-bearing pin is the
  // last one: the holder is FAR younger than the staleness threshold, yet `stale` is true. So the
  // stale verdict came from probing the pid, not from a clock crossing a constant — which is the
  // difference between a measurement and the guess a 24h threshold would have made for it.
  equal(blocked.out.stale, true, 'the report classifies the holder as stale');
  equal(blocked.out.liveness.stale, true, 'and the liveness block agrees with the top-level field');
  equal(blocked.out.liveness.probe, 'same_host_signal_0',
    'naming the probe it actually ran, so a successor can weigh the verdict instead of trusting it');
  equal(blocked.out.liveness.signal_result, 'ESRCH',
    'and its measured result: the holder pid genuinely does not exist any more');
  equal(blocked.out.liveness.same_host, true, 'and that the probe was meaningful — the pid was probeable from here');
  ok(blocked.out.liveness.age_ms < blocked.out.liveness.staleness_threshold_ms,
    'the holder is far YOUNGER than the staleness threshold (' + blocked.out.liveness.age_ms + 'ms of '
    + blocked.out.liveness.staleness_threshold_ms + 'ms) yet is reported stale — the verdict came from the probe, never from the clock');
  ok(Number.isFinite(blocked.out.held_for_ms) && blocked.out.held_for_ms >= 0
    && blocked.out.held_for_ms === blocked.out.liveness.age_ms,
    'and the two durations the report carries are the same measurement, not two independent clocks that can disagree');

  // HOW TO GET THROUGH. An exit-0 report with no sanctioned exit is strictly worse than the stop
  // it replaced, so the exit is checked before it is followed: a runnable verb, not `environment`
  // (which on a provably-dead holder would tell the successor to wait for a process that is never
  // coming back), and `retry_after` naming the same exit as the route rather than a second opinion.
  const route = blocked.out.refusal_route;
  ok(route && typeof route.verb === 'string' && route.verb.length > 0,
    'the report carries a typed machine-readable route, not only prose');
  ok(route.verb !== 'environment' && route.verb !== 'consent',
    'and the route is a VERB the successor can run, not a terminal class — a dead holder that routes to `environment` is a wedge with a label on it');
  equal(route.script, 'adaptive-node', 'named as a script id, which is what makes the route forge-neutral');
  equal(blocked.out.retry_after, route.verb,
    'and `retry_after` names the same exit as the route — two fields for one fact must not be able to disagree');
  ok(blocked.out.operator_hint.includes(String(killedPid)) && blocked.out.operator_hint.includes(route.verb),
    'the human-readable hint carries the same pid and verb as the machine fields, so the two renderings cannot drift apart');

  // The reported holder identity is load-bearing, not decoration: the route verb CASes on it and
  // declines to clear a lock held by anyone else. Without this, `holder` could be any value at all
  // and the recovery would still work — which would make every assertion above cosmetic.
  const wrongPid = String(killedPid + 1);
  const refusedSteal = successor(run, [route.verb, '--project', run.project, '--holder', wrongPid, '--json']);
  equal(refusedSteal.out.unlocked, false,
    'unlocking with the WRONG holder pid removes nothing — the reported identity is what authorizes the clear');
  equal(refusedSteal.out.reason, 'scheduler_lock_holder_mismatch', 'and says so as a typed condition');
  ok(fs.existsSync(blocked.out.lockPath), 'and the lockfile really is still there after the declined steal');

  // Follow it. A route is a claim that this verb gets you unstuck; the claim is tested.
  const holder = String(blocked.out.holder.pid);
  const cleared = successor(run, [route.verb, '--project', run.project, '--holder', holder, '--json']);
  equal(cleared.status, 0, 'the recorded route verb `' + route.verb + '` exists and runs');
  equal(cleared.out.result, 'ok', 'the recorded route verb clears the condition it names');
  equal(cleared.out.requested_holder, holder, 'clearing the holder the report named, not whatever it found');
  equal(cleared.out.holder.pid, killedPid, 'and the lock it removed was the dead holder\'s, by identity');
  ok(!fs.existsSync(blocked.out.lockPath), 'the lockfile the report pointed at is gone');

  const resumed = successor(run, ['open-next', '--project', run.project, '--json']);
  equal(resumed.out.result, 'ok', 'and the run advances once the route is followed — the exit is real, not a label');
  equal(resumed.out.opened.id, 'impl', 'the successor opens the node the surviving ledger says is next');
}

// ===========================================================================
// PART 3 — the successor resumes from the KERNEL ALONE.
//
// Same crash, but now everything the ruling does not call a `record` is deleted first. What the
// fresh process is handed is the four records and nothing else.
// ===========================================================================

function part3_resumeFromRecordsAlone() {
  const run = buildRun();
  successor(run, ['orient', '--project', run.project, '--json']);
  const dead = killDuring(run, 'workflow-plan.md', ['open-next', '--project', run.project, '--json']);
  equal(dead.signal, 'SIGKILL', 'PART 3 fixture: the run really was interrupted');

  const removed = keepRecordsOnly(run.projectDir);
  ok(removed.length >= 3, 'the scrub actually took things away (' + removed.join(', ') + ')');
  for (const rel of artifacts(run.projectDir)) {
    equal(schema().classifyDurableArtifact(rel).ruling, 'record',
      'what survives the scrub is a kernel record and nothing else: ' + rel);
  }
  // The successor exercised only an entitlement the ruling grants it.
  for (const entry of removed) {
    const ruling = entry.split(':')[0];
    ok(ruling === 'derivable' || ruling === 'preference' || ruling === 'unclassified',
      'nothing ruled `record` was scrubbed: ' + entry);
  }

  const oriented = successor(run, ['orient', '--project', run.project, '--json']);
  equal(oriented.status, 0, 'a fresh process orients on the kernel alone');
  equal(oriented.out.result, 'ok', 'orient reports a position, not a refusal');
  equal(oriented.out.inProgressNode, null,
    'and it is the COHERENT position: the ledger flip never landed, so nothing is in progress');
  deepEqual(oriented.out.nextAction.readySet.map(node => node.id), ['impl'],
    'the ready frontier is what the surviving records imply');

  const opened = successor(run, ['open-next', '--project', run.project, '--json']);
  equal(opened.out.result, 'ok', 'and the run ADVANCES from durable state alone');
  equal(opened.out.opened.id, 'impl', 'opening the node the kernel says is next');
}

// ===========================================================================
// PART 4 + PART 5 — the mid-transition state, and the mutation that proves the test bites.
//
// The interesting kill is the one that lands AFTER the ledger flip: the position record says
// `impl | in_progress`, the node's evidence file was never created, and the dispatch nonce the
// dead process printed to a console nobody kept died with it. A successor that can finish that
// node has done the thing A1 claims, including recovering the nonce from `.cache/barrier-base-impl`
// — the open-time baseline record — rather than from anything it was told.
//
// PART 4 and PART 5 run the IDENTICAL sequence through one function. The only difference is the
// `victim` argument. That is deliberate: it makes the discriminator structural rather than a
// matter of two scenarios that happen to be written similarly.
// ===========================================================================

function midTransitionSuccessor(victim, label) {
  const run = buildRun();
  successor(run, ['orient', '--project', run.project, '--json']);

  // Kill at the evidence seed — by then the ledger flip has already been published.
  const dead = killDuring(run, 'impl.md', ['open-next', '--project', run.project, '--json']);
  equal(dead.signal, 'SIGKILL', label + ': the run really was interrupted mid-write');
  ok(ledgerOf(run.projectDir).includes('| impl | in_progress |'),
    label + ': the kill left a genuinely MID-TRANSITION position — the ledger says in_progress');
  ok(!fs.existsSync(path.join(run.projectDir, '.cache', 'impl.md')),
    label + ': and the work is not done — the evidence record was never written');

  keepRecordsOnly(run.projectDir);

  // Recover the dispatch nonce from the RECORD. This is the successor's whole problem in
  // miniature: the value was minted by a process that is gone, and the only surviving copy is
  // the open-time baseline the position record holds.
  const basePath = path.join(run.projectDir, '.cache', 'barrier-base-impl');
  const nonce = fs.readFileSync(basePath, 'utf8').trim().slice(0, 12);

  // Save the victim's bytes before removing it. Deleting a record and never being able to put it
  // back would leave the mutation proof one-directional: "it failed after I deleted something" is
  // weaker than "it failed, and putting exactly that back on the SAME fixture fixed it".
  let victimBytes = null;
  if (victim) {
    victimBytes = fs.readFileSync(path.join(run.projectDir, victim));
    fs.unlinkSync(path.join(run.projectDir, victim));
  }

  const attempt = advanceFromRecords(run, nonce);
  return Object.assign({ run, nonce, victim, victimBytes }, attempt);
}

// advanceFromRecords — the successor's move, isolated so the mutated and unmutated runs are
// literally the same code path and can be replayed on one fixture.
function advanceFromRecords(run, nonce) {
  const oriented = successor(run, ['orient', '--project', run.project, '--json']);
  const recorded = successor(run,
    ['record-evidence', '--project', run.project, '--node-id', 'impl', '--stdin', '--json'],
    'evidence-binding: impl ' + nonce + '\nRED: impl fails before implementation\nred_baseline: ' + nonce + '\n');
  const closed = successor(run, ['close-and-open-next', '--project', run.project, '--node-id', 'impl', '--json']);
  const advanced = closed.status === 0 && closed.out !== null && closed.out.result === 'ok'
    && closed.out.opened && closed.out.opened.id === 'verify';
  return { oriented, recorded, closed, advanced };
}

function part4_midTransitionResumes() {
  const green = midTransitionSuccessor(null, 'PART 4');

  equal(green.oriented.out.result, 'ok', 'the successor orients on a mid-transition kernel');
  equal(green.oriented.out.inProgressNode, 'impl',
    'and reports the coherent position: impl is open and unfinished');
  equal(green.oriented.out.cacheState, 'absent',
    'including the fact that its evidence has not been recorded — the successor is told what is missing');

  equal(green.recorded.out.result, 'ok',
    'the successor records evidence bound to a nonce it RECOVERED from the baseline record');
  ok(green.advanced,
    'and closes the node and opens the next one: the interrupted run runs to the following node from durable state alone');
  return green;
}

// PART 5 — the assertion the whole file exists for.
function part5_mutationProof(green) {
  // Guard the contrast before using it: if PART 4 had not advanced, "PART 5 does not advance"
  // would be worth nothing.
  ok(green.advanced, 'MUTATION PRECONDITION: the unmutated scenario advances, so a failure below is caused by the deletion');

  // The victim is a genuine RECORD band, and the ruling says so — not this suite.
  const ruling = schema().classifyDurableArtifact('.cache/barrier-base-impl');
  equal(ruling.ruling, 'record', 'the deleted artifact is ruled a kernel record');
  equal(ruling.record, 'position', 'specifically part of the Position record');

  const mutated = midTransitionSuccessor('.cache/barrier-base-impl', 'PART 5');

  ok(!mutated.advanced,
    'MUTATION: with one RECORD band deleted the successor CANNOT advance — the kernel is load-bearing, and every green above is therefore evidence');
  equal(mutated.recorded.out.result, 'refuse',
    'the successor is refused at the evidence gate, which is where the lost record was consumed');
  equal(mutated.recorded.out.reason, 'evidence_generation_stale',
    'and told which fact it can no longer establish');
  // The close is CONVERTED: it reports at exit 0 instead of stopping. The original assertion here
  // pinned `result: 'refuse'`, which read the verdict — and the verdict is precisely what the
  // substrate design deletes. What that assertion was actually protecting is the claim in its own
  // message: *the loss is not routed around*. That is a statement about EFFECT, so it is pinned as
  // one. `!mutated.advanced` above already proves the run did not progress; these prove the close
  // itself neither wrote anything nor quietly forgot what went missing.
  equal(mutated.closed.status, 0, 'the converted close reports rather than stopping');
  equal(mutated.closed.out.result, 'answer', 'and it reports as an answer, not a verdict');
  equal(mutated.closed.out.mutation_performed, false,
    'THE LOSS IS NOT ROUTED AROUND: the close wrote nothing. Exit 0 is a report about the world, not permission to change it');

  // The deleted record is named BY CONTENT in the report, so a successor learns which record is
  // gone rather than merely that something is wrong. This is the half a bare verdict never carried.
  equal(mutated.closed.out.evidence.baseline_nonce_recorded, false,
    'the report names the missing baseline directly, so the successor can identify the lost record');
  const lossAdvisory = (mutated.closed.out.advisories || [])
    .find(a => a && a.warning === 'evidence_binding_unverified');
  ok(lossAdvisory, 'the anti-replay gap opened by the deletion is REPORTED, not silently swallowed');
  equal(lossAdvisory.cause, 'no_recorded_baseline',
    'and it attributes the gap to the deleted baseline specifically, not to a generic failure');
  equal(lossAdvisory.binding_checked, false,
    'stating plainly that the binding was NOT checked — an unchecked binding must never read as a passed one');

  // The route still runs. A report that leaves the successor stuck is a refusal with worse manners.
  ok(mutated.closed.out.refusal_route && typeof mutated.closed.out.refusal_route.verb === 'string',
    'and the report still carries a typed machine-readable route out');

  // The failure is the MISSING RECORD, not a forgotten secret: the nonce was read off the record
  // BEFORE deleting it and handed to the successor anyway, and the successor still cannot proceed
  // — because what it must check the nonce AGAINST is what went missing.
  ok(/^[0-9a-f]{12}$/.test(mutated.nonce),
    'the successor was handed a well-formed nonce, so the refusal is about the record and not the token');

  // And the same-fixture A/B that closes the argument. Put exactly those bytes back — nothing
  // else changes — and the identical successor call now advances. One variable, both directions.
  fs.writeFileSync(path.join(mutated.run.projectDir, mutated.victim), mutated.victimBytes);
  const restored = advanceFromRecords(mutated.run, mutated.nonce);
  ok(restored.advanced,
    'RESTORING the deleted record — and changing nothing else on the same fixture — lets the identical successor call advance: the record is the cause, not a coincidence of the scenario');

  // A second, independent record band, to show the mutation proof is not a property of one file.
  const planRuling = schema().classifyDurableArtifact('workflow-plan.md');
  equal(planRuling.ruling, 'record', 'workflow-plan.md is ruled a kernel record');
  const noPlan = midTransitionSuccessor('workflow-plan.md', 'PART 5b');
  ok(!noPlan.advanced, 'MUTATION 2: with the Plan record deleted the successor cannot advance either');
  equal(noPlan.oriented.out.result, 'refuse', 'orient refuses rather than inventing a position');
  equal(noPlan.oriented.out.reason, 'plan_missing', 'naming the record that is gone');
}

// ===========================================================================
// PART 6 — the entitlement is real, in both directions.
//
// PART 3 and PART 4 lean on "a successor may drop derivable and preference artifacts". That is
// only safe if the derivable ones really do re-derive and the preference ones really are
// optional. Both halves are checked here rather than trusted, because if either is false the
// scrub above is not an entitlement — it is data loss the suite is calling recovery.
// ===========================================================================

function part6_theEntitlementHolds() {
  const run = buildRun();
  successor(run, ['orient', '--project', run.project, '--json']);

  // Derivable: delete it, re-run the derivation, get it back. `context-packet.md` is the one a
  // clean orient produces, and re-running orient IS its derivation.
  const packet = path.join(run.projectDir, '.cache', 'context-packet.md');
  ok(fs.existsSync(packet), 'orient produced the context packet');
  const first = fs.readFileSync(packet, 'utf8');
  fs.unlinkSync(packet);
  successor(run, ['orient', '--project', run.project, '--json']);
  ok(fs.existsSync(packet), 'a second orient re-derives it from the plan — losing it costs nothing');
  equal(fs.readFileSync(packet, 'utf8'), first,
    'and re-derives it BYTE-IDENTICALLY, which is what "derivable" has to mean to be safe to drop');

  // Preference / residue: the orphan temp a torn replace leaves behind must be inert. A
  // successor that keeps it must be no worse off than one that sweeps it.
  const kept = buildRun();
  successor(kept, ['orient', '--project', kept.project, '--json']);
  killDuring(kept, 'impl.md', ['open-next', '--project', kept.project, '--json']);
  const residue = artifacts(kept.projectDir).filter(rel => /\.tmp$/.test(rel));
  equal(residue.length, 1, 'the interrupted replace left residue to be inert ABOUT');
  for (const rel of artifacts(kept.projectDir)) {
    // Drop only the preference band; keep the crash residue in place on purpose.
    if (schema().classifyDurableArtifact(rel).ruling === 'preference') {
      fs.unlinkSync(path.join(kept.projectDir, rel));
    }
  }
  const nonce = fs.readFileSync(path.join(kept.projectDir, '.cache', 'barrier-base-impl'), 'utf8').trim().slice(0, 12);
  successor(kept, ['record-evidence', '--project', kept.project, '--node-id', 'impl', '--stdin', '--json'],
    'evidence-binding: impl ' + nonce + '\nRED: impl fails before implementation\nred_baseline: ' + nonce + '\n');
  const closed = successor(kept, ['close-and-open-next', '--project', kept.project, '--node-id', 'impl', '--json']);
  ok(closed.out !== null && closed.out.result === 'ok',
    'a successor that LEAVES the crash residue in place still advances — the orphan temp is inert, so sweeping it is a choice and not a precondition');
  ok(fs.existsSync(path.join(kept.projectDir, residue[0])),
    'and the residue really was still there while it advanced');
}

// ===========================================================================
// MEASURED — findings, recorded rather than asserted so that fixing one is not a test failure.
//
//  1. Three RECORD bands can be deleted from the mid-transition state and the node still closes
//     and advances: `.cache/barrier-open-impl`, `workflow-state.md`, `.cache/context-packet.md`.
//     Not evidence the ruling is wrong — barrier-open is consumed by staleness detection and
//     workflow-state.md by the sink, neither of which this scenario reaches — but the
//     node-advance path alone does not witness their necessity. A P1 driving finalize would.
//  2. `.cache/context-packet.md` re-derives byte-identically from `orient` (PART 6) yet the
//     registry rules it `record`/`evidence`, `writer: 'agent'`, via the broad free-form band.
//     A candidate mis-ruling: it inherits the atomic-write obligation without needing it.
//  3. A torn replace leaves `.<basename>.<pid>.<ms>.<rand>.tmp`, ruled `unclassified` — the
//     totality corpus is what ARCHIVED runs left, and no archived run crashed. PART 6 pins the
//     property that matters (it is inert) rather than the classification.
//  4. With the Plan record deleted, `close-and-open-next` exits on an uncaught ENOENT with no
//     JSON envelope where `orient` returns a typed `plan_missing`. PART 5b asserts the fix-safe
//     half only (it must not report success).
// ===========================================================================

function main() {
  const crashed = part1_killLandsInsideTheWindow();
  part2_theRefusalRoutes(crashed);
  // PART 3+ build their own fixtures; `crashed.run` is spent by the time PART 2 returns.
  part3_resumeFromRecordsAlone();
  const green = part4_midTransitionResumes();
  part5_mutationProof(green);
  part6_theEntitlementHolds();

  for (const dir of TEMP_DIRS) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  process.stdout.write('kernel successor (A1 kill test) passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

module.exports = { buildRun, keepRecordsOnly, artifacts };
