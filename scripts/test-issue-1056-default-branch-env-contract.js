#!/usr/bin/env node
'use strict';

// test-issue-1056-default-branch-env-contract.js — #1056: defaultBranch must consult
// KAOLA_WORKFLOW_OFFLINE / KAOLA_GH_REMOTE_TIMEOUT_MS at CALL TIME, not at the module-load time
// of whichever copy of scripts/kaola-workflow-adaptive-schema.js happened to be required first.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE DEFECT (measured on baseline e72407b8 with an execFileSync mock). adaptive-schema.js
// captures two toggles as module-level consts:
//   const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
//   const REMOTE_TIMEOUT_MS = (parse of KAOLA_GH_REMOTE_TIMEOUT_MS, clamped to 600000, default 30000);
// defaultBranch(root) closes over both. claim.js re-exports the SAME function object
// (`const { ..., defaultBranch } = adaptiveSchema;`). Node's require() cache means
// adaptive-schema.js's module body runs exactly ONCE per process — the FIRST require wins. So if
// ANYTHING requires adaptive-schema.js (directly, or indirectly through some other module) before
// the caller sets KAOLA_WORKFLOW_OFFLINE / KAOLA_GH_REMOTE_TIMEOUT_MS, every later require of
// claim.js gets a defaultBranch permanently wired to the stale toggle values — even though the env
// was set before claim.js itself, and before defaultBranch() was ever CALLED. That is a real
// invocation shape: any script (a test harness, a future CLI entry point, a REPL) that imports
// adaptive-schema.js for an unrelated helper before wiring KAOLA_WORKFLOW_OFFLINE reproduces it.
//
// WHY A FRESH CHILD PROCESS PER SCENARIO. The property under test is require-cache + module-load
// ORDER, which is per-process state; the parent test process' own module cache and any earlier
// scenario's requires would otherwise contaminate the next one. Each scenario is driven by a
// throwaway `node -e <script>` child that mocks child_process.execFileSync IN THAT CHILD before
// requiring anything under test, then prints one JSON line to stdout the parent asserts on. No
// scenario ever touches the network — the mock always answers synchronously.
//
// SCENARIO -> ASSERTION MAP (see kaola-workflow/bundle-1056/acceptance.md for the measured RED/
// GREEN table against baseline e72407b8):
//   1. load-order offline (kernel)      -> offline-after-adaptive-schema-load must still short
//                                          circuit with ZERO network probes, and claim's export
//                                          must stay literally the same function as schema's.
//   2. load-order timeout (kernel)      -> a timeout set after adaptive-schema loads (but before
//                                          claim loads and before the call) must still reach the
//                                          stage-2 execFileSync call's `timeout` option.
//   3. env-before-any-require (kernel)  -> the shipped CLI order; both offline and timeout must
//                                          keep working (GREEN pin).
//   4. probe order + fallback (kernel)  -> stage order, master/trunk/main resolution, and a
//                                          timeout-shaped stage-2 error falling through to stage 3
//                                          without an escaping exception (GREEN pin).
//   5. timeout clamp (kernel)           -> 9999999 clamps to 600000 and 'abc' falls back to 30000,
//                                          BOTH when the env is set before load (GREEN pin) and
//                                          when set after load but before the call (RED today).
//   6. gitlab / gitea claim ports       -> see the note above buildPortOfflineDriver: the port's
//                                          own defaultBranch (NOT re-exported from its local
//                                          adaptive-schema.js copy today) captures OFFLINE as a
//                                          module-level const of the PORT'S OWN claim.js. RED today
//                                          under the order that reproduces the same class of bug
//                                          for the port: requiring the port before the env is set.
//
// The only real (repo-process) synchronous spawn site is runChild's spawnSync, annotated there.
// The `cp.execFileSync = function ...` mock assignments below live inside generated STRING
// source for the child driver, not in this file's own executable code, so the spawn-classification
// scanner never sees them as call sites — nothing to annotate there.

const path = require('path');
const { spawnSync } = require('child_process');

// KW_TEST_1056_REPO_ROOT lets a copy of this suite (e.g. run from a scratch directory against an
// extracted baseline or candidate tree) point REPO somewhere other than its own parent directory,
// without touching any file the suite itself resolves paths from. Unset, behavior is unchanged.
const REPO = process.env.KW_TEST_1056_REPO_ROOT
  ? path.resolve(process.env.KW_TEST_1056_REPO_ROOT)
  : path.resolve(__dirname, '..');
const SCHEMA = path.join(REPO, 'scripts', 'kaola-workflow-adaptive-schema.js');
const CLAIM = path.join(REPO, 'scripts', 'kaola-workflow-claim.js');
const GITLAB_SCHEMA = path.join(REPO, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-workflow-adaptive-schema.js');
const GITLAB_CLAIM = path.join(REPO, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js');
const GITEA_SCHEMA = path.join(REPO, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-workflow-adaptive-schema.js');
const GITEA_CLAIM = path.join(REPO, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// --- shared mock harness source, inlined into every child driver -----------------------------
// `plan` maps stage name ('stage1' | 'stage2' | 'stage3') to either
//   { mode: 'throw', message, code, signal }   -- execFileSync throws
//   { mode: 'return', value }                  -- execFileSync returns `value` (stdout text)
// A stage absent from `plan` throws a generic error (matches an unreachable-in-practice stage
// still needing SOME answer if the mock is hit unexpectedly — a bug in itself, and visible in
// __calls).
function harnessSource(plan) {
  return [
    "const cp = require('child_process');",
    'const __calls = [];',
    'function __stage(args) {',
    "  if (args.indexOf('symbolic-ref') !== -1) return 'stage1';",
    "  if (args.indexOf('remote') !== -1 && args.indexOf('show') !== -1) return 'stage2';",
    "  if (args.indexOf('ls-remote') !== -1) return 'stage3';",
    "  return 'unknown';",
    '}',
    'const __plan = ' + JSON.stringify(plan) + ';',
    // spawn-class: environment
    'cp.execFileSync = function(cmd, args, opts) {',
    '  const s = __stage(args);',
    '  __calls.push({ argv: args.join(" "), timeout: opts && opts.timeout });',
    "  const cfg = __plan[s] || { mode: 'throw', message: 'unconfigured-stage:' + s };",
    "  if (cfg.mode === 'throw') {",
    "    const e = new Error(cfg.message || 'mock-fail');",
    '    if (cfg.code) e.code = cfg.code;',
    '    if (cfg.signal) e.signal = cfg.signal;',
    '    throw e;',
    '  }',
    '  return cfg.value;',
    '};',
  ].join('\n');
}

function printSource(exprAssignments) {
  // exprAssignments: object of extra fields to JSON-serialize onto the printed line, evaluated
  // as raw JS source (so it can reference in-scope child variables like `result` and `__calls`).
  const fields = Object.keys(exprAssignments)
    .map((k) => JSON.stringify(k) + ': (' + exprAssignments[k] + ')')
    .join(', \n    ');
  return 'process.stdout.write(JSON.stringify({\n    ' + fields + '\n  }));';
}

function runChild(source) {
  // A fresh-environment driver: the module under test resolves its module-level env toggles once
  // at load, and the require-cache/load-order wiring under test only exists in a process this one
  // does not already own.
  // spawn-class: environment
  const r = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0 || r.error) {
    throw new Error('child driver crashed (exit ' + r.status + '): ' + (r.stderr || r.error) + '\n---source---\n' + source);
  }
  const line = (r.stdout || '').trim().split('\n').filter((l) => l.trim().startsWith('{')).pop();
  if (!line) throw new Error('child driver printed no JSON line. stdout=' + JSON.stringify(r.stdout) + ' stderr=' + JSON.stringify(r.stderr));
  try { return JSON.parse(line); } catch (e) { throw new Error('child driver printed unparseable JSON: ' + line); }
}

// ===============================================================================================
// Scenario 1 — load-order offline (kernel). schema required FIRST (no env), THEN env set, THEN
// claim required. Offline must short-circuit with zero network probes: stage 1 throws, and the
// contract says nothing past it may fire.
// ===============================================================================================
{
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: should-not-be-called\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const source = [
    harnessSource(plan),
    'const schema = require(' + JSON.stringify(SCHEMA) + ');',
    "process.env.KAOLA_WORKFLOW_OFFLINE = '1';",
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    "const result = claim.defaultBranch('/tmp/kw-1056-s1');",
    printSource({
      result: 'result',
      calls: '__calls',
      sameFn: 'claim.defaultBranch === schema.defaultBranch',
    }),
  ].join('\n');
  const out = runChild(source);
  assert(out.result === 'main',
    '#1056 scenario 1: offline set AFTER adaptive-schema loads (but before claim loads and before the call) must still resolve "main"; got ' + JSON.stringify(out.result));
  const argvs = (out.calls || []).map((c) => c.argv);
  assert(argvs.length === 1 && /symbolic-ref/.test(argvs[0] || ''),
    '#1056 scenario 1: offline must make ZERO network probes (only the local symbolic-ref stage may run); got argv sequence ' + JSON.stringify(argvs));
  assert(out.sameFn === true,
    '#1056 scenario 1: claim.js must still re-export the identical defaultBranch function object as adaptive-schema.js (not a wrapper), regardless of load order');
}

// ===============================================================================================
// Scenario 2 — load-order timeout (kernel). schema required FIRST (no env), THEN
// KAOLA_GH_REMOTE_TIMEOUT_MS set, THEN claim required (offline left UNSET). Stage 1 throws, stage
// 2 answers 'develop'; the timeout option passed to that stage-2 execFileSync call must be 1234.
// ===============================================================================================
{
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: develop\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const source = [
    harnessSource(plan),
    'require(' + JSON.stringify(SCHEMA) + ');',
    "process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = '1234';",
    "delete process.env.KAOLA_WORKFLOW_OFFLINE;",
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    "const result = claim.defaultBranch('/tmp/kw-1056-s2');",
    printSource({ result: 'result', calls: '__calls' }),
  ].join('\n');
  const out = runChild(source);
  assert(out.result === 'develop',
    '#1056 scenario 2: stage-2 answer "develop" must be returned; got ' + JSON.stringify(out.result));
  const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
  assert(!!stage2Call, '#1056 scenario 2: precondition — stage 2 (remote show origin) must have been called; got ' + JSON.stringify(out.calls));
  assert(stage2Call && stage2Call.timeout === 1234,
    '#1056 scenario 2: KAOLA_GH_REMOTE_TIMEOUT_MS=1234 set AFTER adaptive-schema loads (but before claim loads and before the call) must reach the stage-2 execFileSync timeout option; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
}

// ===============================================================================================
// Scenario 3 — env set before ANY require (the shipped CLI order). GREEN pin: both offline and
// timeout must keep working exactly as they do on baseline.
// ===============================================================================================
{
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: should-not-be-called\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const source = [
    harnessSource(plan),
    "process.env.KAOLA_WORKFLOW_OFFLINE = '1';",
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    "const result = claim.defaultBranch('/tmp/kw-1056-s3a');",
    printSource({ result: 'result', calls: '__calls' }),
  ].join('\n');
  const out = runChild(source);
  assert(out.result === 'main', '#1056 scenario 3 (offline, env-before-any-require): expected "main", got ' + JSON.stringify(out.result));
  const argvs = (out.calls || []).map((c) => c.argv);
  assert(argvs.length === 1 && /symbolic-ref/.test(argvs[0] || ''),
    '#1056 scenario 3 (offline, env-before-any-require): must make zero network probes; got ' + JSON.stringify(argvs));
}
{
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: develop\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const source = [
    harnessSource(plan),
    "process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = '4242';",
    "delete process.env.KAOLA_WORKFLOW_OFFLINE;",
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    "const result = claim.defaultBranch('/tmp/kw-1056-s3b');",
    printSource({ result: 'result', calls: '__calls' }),
  ].join('\n');
  const out = runChild(source);
  assert(out.result === 'develop', '#1056 scenario 3 (timeout, env-before-any-require): expected "develop", got ' + JSON.stringify(out.result));
  const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
  assert(stage2Call && stage2Call.timeout === 4242,
    '#1056 scenario 3 (timeout, env-before-any-require): KAOLA_GH_REMOTE_TIMEOUT_MS=4242 must reach the stage-2 timeout option; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
}

// ===============================================================================================
// Scenario 4 — probe order and fallback (kernel), env fully unset (online). GREEN pin.
// ===============================================================================================
function runProbeScenario(plan) {
  const source = [
    harnessSource(plan),
    "delete process.env.KAOLA_WORKFLOW_OFFLINE;",
    "delete process.env.KAOLA_GH_REMOTE_TIMEOUT_MS;",
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    "const result = claim.defaultBranch('/tmp/kw-1056-s4');",
    printSource({ result: 'result', calls: '__calls' }),
  ].join('\n');
  return runChild(source);
}
{
  // 4a: stage 1 alone resolves "origin/master" -> "master", zero network calls.
  const out = runProbeScenario({
    stage1: { mode: 'return', value: 'origin/master\n' },
    stage2: { mode: 'return', value: 'HEAD branch: should-not-be-called\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  });
  assert(out.result === 'master', '#1056 scenario 4a: symbolic-ref hit "origin/master" must resolve "master"; got ' + JSON.stringify(out.result));
  const argvs = (out.calls || []).map((c) => c.argv);
  assert(argvs.length === 1 && /symbolic-ref/.test(argvs[0] || ''),
    '#1056 scenario 4a: a resolving stage 1 must make zero network probes; got ' + JSON.stringify(argvs));
}
{
  // 4b: stage 1 throws, stage 2 answers "(unknown)" (unusable), stage 3 resolves "trunk". Argv
  // order must be exactly [symbolic-ref, remote show, ls-remote].
  const out = runProbeScenario({
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: (unknown)\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/trunk\tHEAD\n' },
  });
  assert(out.result === 'trunk', '#1056 scenario 4b: stage-3 fallback must resolve "trunk"; got ' + JSON.stringify(out.result));
  const argvs = (out.calls || []).map((c) => c.argv);
  assert(argvs.length === 3 && /symbolic-ref/.test(argvs[0]) && /remote show/.test(argvs[1]) && /ls-remote/.test(argvs[2]),
    '#1056 scenario 4b: probe order must be exactly [symbolic-ref, remote show, ls-remote]; got ' + JSON.stringify(argvs));
}
{
  // 4c: all three stages throw -> hardcoded "main".
  const out = runProbeScenario({
    stage1: { mode: 'throw', message: 'a' },
    stage2: { mode: 'throw', message: 'b' },
    stage3: { mode: 'throw', message: 'c' },
  });
  assert(out.result === 'main', '#1056 scenario 4c: all three probes failing must fall back to "main"; got ' + JSON.stringify(out.result));
}
{
  // 4d: stage 1 throws, stage 2 throws a timeout-shaped error (ETIMEDOUT + SIGTERM, the shape
  // execFileSync's own `timeout` option produces), stage 3 resolves "trunk". No exception may
  // escape defaultBranch.
  const out = runProbeScenario({
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'throw', message: 'Command timed out', code: 'ETIMEDOUT', signal: 'SIGTERM' },
    stage3: { mode: 'return', value: 'ref: refs/heads/trunk\tHEAD\n' },
  });
  assert(out.result === 'trunk',
    '#1056 scenario 4d: a timeout-shaped stage-2 error must fall through to stage 3 without an exception escaping defaultBranch; got ' + JSON.stringify(out.result));
}

// ===============================================================================================
// Scenario 5 — timeout clamp (kernel): 9999999 clamps to 600000; 'abc' falls back to 30000. Both
// BEFORE load (GREEN pin) and AFTER load but before the call (RED today).
// ===============================================================================================
function runClampScenario(timeoutEnvValue, setBeforeLoad) {
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: develop\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const setLine = "process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = " + JSON.stringify(timeoutEnvValue) + ";";
  const source = [
    harnessSource(plan),
    "delete process.env.KAOLA_WORKFLOW_OFFLINE;",
    "delete process.env.KAOLA_GH_REMOTE_TIMEOUT_MS;",
    setBeforeLoad ? setLine : '',
    'const claim = require(' + JSON.stringify(CLAIM) + ');',
    setBeforeLoad ? '' : setLine,
    "const result = claim.defaultBranch('/tmp/kw-1056-s5');",
    printSource({ result: 'result', calls: '__calls' }),
  ].filter(Boolean).join('\n');
  return runChild(source);
}
{
  const out = runClampScenario('9999999', true);
  const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
  assert(stage2Call && stage2Call.timeout === 600000,
    '#1056 scenario 5a (before load): KAOLA_GH_REMOTE_TIMEOUT_MS=9999999 must clamp to 600000; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
}
{
  const out = runClampScenario('abc', true);
  const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
  assert(stage2Call && stage2Call.timeout === 30000,
    '#1056 scenario 5b (before load): a non-numeric KAOLA_GH_REMOTE_TIMEOUT_MS=abc must fall back to the 30000 default; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
}
{
  const out = runClampScenario('9999999', false);
  const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
  assert(stage2Call && stage2Call.timeout === 600000,
    '#1056 scenario 5c (AFTER load, before call): KAOLA_GH_REMOTE_TIMEOUT_MS=9999999 set after claim.js loads (but before defaultBranch is called) must still clamp to 600000; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
}

// ===============================================================================================
// Scenario 6 — gitlab and gitea claim ports.
//
// UNLIKE the kernel, each port's defaultBranch is a SEPARATE function defined directly inside
// kaola-<forge>-workflow-claim.js (not re-exported from its own local adaptive-schema.js copy —
// that copy's identical defaultBranch sits unused). The port's OFFLINE is therefore captured as a
// module-level const of the PORT'S OWN claim.js file, not of adaptive-schema.js.
//
// MEASURED: requiring the port's local adaptive-schema.js copy first, then setting
// KAOLA_WORKFLOW_OFFLINE, then requiring the port (the literal order scenario 1 uses for the
// kernel) is ALREADY offline-safe today, because the port's own OFFLINE const is captured when
// the port itself loads, which happens after the env is set in that order — that specific order
// is not a regression for the ports and is asserted below as a same-shape GREEN pin.
//
// The order that DOES reproduce a load-order regression for the ports is requiring the PORT
// ITSELF before the env is set (env arrives before the CALL, but after the port's own module body
// already captured OFFLINE=false): RED today. After the fix described in the task (the ports
// re-export a call-time-aware defaultBranch from their own adaptive-schema.js copy), this order
// must also resolve offline with zero network calls, because a call-time read no longer cares when
// any module loaded relative to the env.
// ===============================================================================================
function buildPortOfflineDriver(schemaPath, claimPath, requirePortFirst) {
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: should-not-be-called\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const requireSchema = 'const schema = require(' + JSON.stringify(schemaPath) + ');';
  const setEnv = "process.env.KAOLA_WORKFLOW_OFFLINE = '1';";
  const requirePort = 'const port = require(' + JSON.stringify(claimPath) + ');';
  const lines = requirePortFirst
    ? [requireSchema, requirePort, setEnv]
    : [requireSchema, setEnv, requirePort];
  return [
    harnessSource(plan),
    ...lines,
    "const result = port.defaultBranch('/tmp/kw-1056-s6');",
    printSource({ result: 'result', calls: '__calls', isFn: "typeof port.defaultBranch === 'function'" }),
  ].join('\n');
}

// N1 (review): after the import swap the ports delegate their whole defaultBranch to their own
// adaptive-schema.js copy, which reads KAOLA_GH_REMOTE_TIMEOUT_MS per call — unlike their deleted
// local copies, which hard-coded `timeout: 30000` and ignored the env entirely. Requires the
// PORT before the env is set (matching scenario 6's own reproduction order for the ports) so the
// pin exercises the same "env arrives after the module that used to own the toggle" shape; a
// call-time contract must not care. `timeoutEnvValue === null` leaves the env fully unset, pinning
// the untouched default.
function buildPortTimeoutDriver(schemaPath, claimPath, timeoutEnvValue) {
  const plan = {
    stage1: { mode: 'throw', message: 'no symbolic-ref' },
    stage2: { mode: 'return', value: 'HEAD branch: develop\n' },
    stage3: { mode: 'return', value: 'ref: refs/heads/should-not-be-called\tHEAD\n' },
  };
  const lines = [
    'const schema = require(' + JSON.stringify(schemaPath) + ');',
    "delete process.env.KAOLA_WORKFLOW_OFFLINE;",
    "delete process.env.KAOLA_GH_REMOTE_TIMEOUT_MS;",
    'const port = require(' + JSON.stringify(claimPath) + ');',
  ];
  if (timeoutEnvValue !== null) {
    lines.push('process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = ' + JSON.stringify(timeoutEnvValue) + ';');
  }
  return [
    harnessSource(plan),
    ...lines,
    "const result = port.defaultBranch('/tmp/kw-1056-s6t');",
    printSource({ result: 'result', calls: '__calls' }),
  ].join('\n');
}

for (const edition of [
  { name: 'gitlab', schema: GITLAB_SCHEMA, claim: GITLAB_CLAIM },
  { name: 'gitea', schema: GITEA_SCHEMA, claim: GITEA_CLAIM },
]) {
  // Same literal order as kernel scenario 1 (schema, THEN env, THEN the claim module). Measured
  // already offline-safe today for the ports — kept as a same-shape GREEN pin, not a regression.
  {
    const out = runChild(buildPortOfflineDriver(edition.schema, edition.claim, false));
    assert(out.isFn === true, '#1056 scenario 6 (' + edition.name + ', schema-then-env-then-port): port.defaultBranch must be a function; got ' + JSON.stringify(out.isFn));
    assert(out.result === 'main', '#1056 scenario 6 (' + edition.name + ', schema-then-env-then-port): expected "main"; got ' + JSON.stringify(out.result));
    const argvs = (out.calls || []).map((c) => c.argv);
    assert(argvs.length === 1 && /symbolic-ref/.test(argvs[0] || ''),
      '#1056 scenario 6 (' + edition.name + ', schema-then-env-then-port): must make zero network probes; got ' + JSON.stringify(argvs));
  }
  // The order that DOES reproduce a load-order regression for the ports: requiring the port
  // itself before the env is set.
  {
    const out = runChild(buildPortOfflineDriver(edition.schema, edition.claim, true));
    assert(out.isFn === true, '#1056 scenario 6 (' + edition.name + ', port-before-env): port.defaultBranch must be a function; got ' + JSON.stringify(out.isFn));
    assert(out.result === 'main', '#1056 scenario 6 (' + edition.name + ', port-before-env): expected "main"; got ' + JSON.stringify(out.result));
    const argvs = (out.calls || []).map((c) => c.argv);
    assert(argvs.length === 1 && /symbolic-ref/.test(argvs[0] || ''),
      '#1056 scenario 6 (' + edition.name + ', port-before-env): offline set AFTER the port itself loads (but before the call) must still make zero network probes; got ' + JSON.stringify(argvs));
  }
  // N1: KAOLA_GH_REMOTE_TIMEOUT_MS set AFTER the port loads must reach the stage-2 timeout.
  {
    const out = runChild(buildPortTimeoutDriver(edition.schema, edition.claim, '1234'));
    assert(out.result === 'develop', '#1056 N1 (' + edition.name + ', timeout=1234 after port load): expected "develop"; got ' + JSON.stringify(out.result));
    const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
    assert(stage2Call && stage2Call.timeout === 1234,
      '#1056 N1 (' + edition.name + ', timeout=1234 after port load): stage-2 execFileSync timeout must be 1234 (the port used to hard-code 30000 regardless of env); got ' + JSON.stringify(stage2Call && stage2Call.timeout));
  }
  // N1: with KAOLA_GH_REMOTE_TIMEOUT_MS unset, the 30000 default must be unchanged.
  {
    const out = runChild(buildPortTimeoutDriver(edition.schema, edition.claim, null));
    assert(out.result === 'develop', '#1056 N1 (' + edition.name + ', timeout unset): expected "develop"; got ' + JSON.stringify(out.result));
    const stage2Call = (out.calls || []).find((c) => /remote show/.test(c.argv));
    assert(stage2Call && stage2Call.timeout === 30000,
      '#1056 N1 (' + edition.name + ', timeout unset): default timeout must stay 30000; got ' + JSON.stringify(stage2Call && stage2Call.timeout));
  }
}

// N2 (review): an assertion-count floor — a child scenario that silently ran zero assertions (a
// driver bug that never reaches its own assert() calls without throwing) must fail the suite even
// though every assert() that DID run passed. EXPECTED_ASSERTIONS includes this floor check itself.
const EXPECTED_ASSERTIONS = 40;
assert(passed + failed + 1 === EXPECTED_ASSERTIONS,
  '#1056 N2: assertion-count floor — expected exactly ' + EXPECTED_ASSERTIONS + ' total assertions to run (including this floor check), got ' + (passed + failed + 1) + '; a silently skipped child scenario must fail the suite, not pass quietly');

console.log('\n' + passed + ' passed, ' + failed + ' failed (test-issue-1056-default-branch-env-contract.js)');
process.exit(failed ? 1 : 0);
