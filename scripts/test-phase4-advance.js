#!/usr/bin/env node
'use strict';

// test-phase4-advance.js (#458)
// Focused tests for the Phase 4 transaction owner kaola-workflow-phase4-advance.js.
// Hand-rolled assert pattern. The load-bearing contract (same as #457): the
// phase4->5 boundary runs repair-state.unresolvedCompliance(phase4-progress, state)
// WITH the live state, and the `tdd-guide executor task N` rows are
// delegation-controlled — so close-task of the LAST task must produce a table that
// passes the REAL two-arg gate under an active delegation_policy.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'kaola-workflow-phase4-advance.js');
const REPO = path.resolve(__dirname, '..');
const repair = require('./kaola-workflow-repair-state.js');
const NOW = '2026-01-02T03:04:05.000Z';
// #689: in-process require of the script itself for the parent-dir-fsync monkey-patch seam (every
// other test in this file spawns the script as a subprocess; this ONE direct require is needed
// because fs.<method> patching is only observable by the production function's OWN `require('fs')`
// binding when both live in the same process).
const { writeFileAtomic } = require('./kaola-workflow-phase4-advance.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

function run(root, args, stdin) {
  const opts = { cwd: REPO, encoding: 'utf8', env: { ...process.env } };
  if (stdin !== undefined) opts.input = stdin;
  const res = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root, '--now', NOW, '--json'], opts);
  let json = null;
  try { json = JSON.parse(res.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

const SINK = ['## Sink', 'branch: workflow/issue-1', 'issue_number: 1', 'sink: merge'].join('\n');
function stateBase(extra) {
  return ['phase: 4', 'phase_name: Execute', 'step: execute', 'workflow_path: full',
    'next_command: /kaola-workflow-phase4 issue-1', 'main_session_role: orchestrator',
    'inline_emergency_fallback_authorized: no', (extra || ''), '', SINK, ''].join('\n');
}
const PLAN = [
  '# Phase 3 - Plan: issue-1', '', '## Task List', '',
  '### Task 1: first thing', '- File: a/b.js', '- Write Set: a/b.js', '',
  '### Task 2: second thing', '- File: c/d.js', '- Write Set: c/d.js', '',
].join('\n');

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-p4-'));
  const dir = path.join(root, 'kaola-workflow', 'issue-1');
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, n), c);
  return root;
}
const pf = (root, n) => path.join(root, 'kaola-workflow', 'issue-1', n);
const readProgress = (root) => fs.readFileSync(pf(root, 'phase4-progress.md'), 'utf8');
const readState = (root) => fs.readFileSync(pf(root, 'workflow-state.md'), 'utf8');

// ---------------------------------------------------------------------------
// T1: init-progress stamps one Tasks + one compliance row per Phase 3 task
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  const r = run(root, ['init-progress', '--project', 'issue-1']);
  assert(r.status === 0 && r.json && r.json.result === 'ok' && r.json.task_count === 2, 'T1: init-progress ok with 2 tasks');
  const p = readProgress(root);
  assert(/\| 1 \| first thing \| pending \|/.test(p), 'T1: task 1 row pending');
  assert(/\| 2 \| second thing \| pending \|/.test(p), 'T1: task 2 row pending');
  assert(/\| tdd-guide executor task 1 \| pending \|/.test(p), 'T1: compliance row task 1');
  assert(/\| tdd-guide executor task 2 \| pending \|/.test(p), 'T1: compliance row task 2');
  assert(p.includes('## Failure Routing Ledger') && p.includes('## Build Status') && /## Build Status\nclean/.test(p), 'T1: build status clean + ledger present');
  assert(p.includes(NOW), 'T1: Last Updated set');
  // idempotent re-run (create-only)
  const r2 = run(root, ['init-progress', '--project', 'issue-1']);
  assert(r2.json && r2.json.idempotent === true && r2.json.created === false, 'T1: init-progress idempotent (create-only)');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T2: init-progress refusals
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase() });
  const r = run(root, ['init-progress', '--project', 'issue-1']);
  assert(r.status === 1 && r.json && r.json.reason === 'plan_missing', 'T2: refuses plan_missing');
  fs.writeFileSync(pf(root, 'phase3-plan.md'), '# Phase 3 - Plan\n\n## Task List\n\n(no tasks)\n');
  const r2 = run(root, ['init-progress', '--project', 'issue-1']);
  assert(r2.status === 1 && r2.json && r2.json.reason === 'no_tasks', 'T2: refuses no_tasks');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T3: open-task pointer + Sink preservation + invalid_task
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  const r = run(root, ['open-task', '--project', 'issue-1', '--task', '1']);
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T3: open-task ok');
  const st = readState(root);
  assert(/^step: delegate-task$/m.test(st) && /^task: 1$/m.test(st), 'T3: pointer -> delegate-task/task 1');
  assert(st.includes(SINK), 'T3: Sink preserved');
  const bad = run(root, ['open-task', '--project', 'issue-1', '--task', '9']);
  assert(bad.status === 1 && bad.json && bad.json.reason === 'invalid_task', 'T3: invalid_task refused');
  const r2 = run(root, ['open-task', '--project', 'issue-1', '--task', '1']);
  assert(r2.json && r2.json.idempotent === true, 'T3: open-task idempotent');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T4: record-failure appends ledger row; dedupe idempotent; missing_field
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  const pkt = JSON.stringify({ failing_command: 'node x.js', classification: 'behavior', routed_to: 'tdd-guide', evidence: '.cache/v-1.md', status: 'open' });
  const r = run(root, ['record-failure', '--project', 'issue-1', '--task', '1', '--stdin'], pkt);
  assert(r.status === 0 && r.json && r.json.appended === true, 'T4: record-failure appends');
  const p = readProgress(root);
  assert(/\| 1 \| node x\.js \| behavior \| tdd-guide \| \.cache\/v-1\.md \| open \|/.test(p), 'T4: ledger row rendered');
  const r2 = run(root, ['record-failure', '--project', 'issue-1', '--task', '1', '--stdin'], pkt);
  assert(r2.json && r2.json.idempotent === true && r2.json.appended === false, 'T4: identical failure row deduped (idempotent)');
  const bad = run(root, ['record-failure', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ failing_command: 'x' }));
  assert(bad.status === 1 && bad.json && bad.json.reason === 'missing_field', 'T4: missing_field refused');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T5: close-task (not last) marks complete + files + compliance flip + advances
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  const r = run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'],
    JSON.stringify({ files_modified: ['a/b.js'], build_status: 'clean' }));
  assert(r.status === 0 && r.json && r.json.result === 'ok' && r.json.all_complete === false, 'T5: close task 1 ok, not all complete');
  const p = readProgress(root);
  assert(/\| 1 \| first thing \| complete \| a\/b\.js \|/.test(p), 'T5: task 1 complete + files');
  assert(/\| tdd-guide executor task 1 \| invoked \| \.cache\/tdd-task-1\.md \|/.test(p), 'T5: compliance row 1 flipped (no policy -> invoked)');
  assert(/\| 2 \| second thing \| pending \|/.test(p), 'T5: task 2 still pending');
  const st = readState(root);
  assert(/^task: 2$/m.test(st), 'T5: pointer advanced to next open task 2');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T6: close LAST task -> all_complete, routes phase5, passes the real gate
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ files_modified: 'a/b.js' }));
  const r = run(root, ['close-task', '--project', 'issue-1', '--task', '2', '--stdin'], JSON.stringify({ files_modified: 'c/d.js' }));
  assert(r.status === 0 && r.json && r.json.all_complete === true, 'T6: last close -> all_complete');
  const st = readState(root);
  assert(/^step: complete$/m.test(st) && /^next_command: \/kaola-workflow-phase5 issue-1$/m.test(st), 'T6: routes to phase5');
  assert(/^next_skill: kaola-workflow-review issue-1$/m.test(st), 'T6: next_skill review');
  const p = readProgress(root);
  assert(repair.unresolvedCompliance(p, st).length === 0, 'T6: phase4-progress PASSES the real two-arg gate at the boundary; got ' + JSON.stringify(repair.unresolvedCompliance(p, st)));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T7: delegation_policy: delegate — the #457-class regression. Default close
// must flip rows to subagent-invoked so the final boundary passes the two-arg gate.
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase('delegation_policy: delegate'), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ files_modified: 'a/b.js' }));
  const r = run(root, ['close-task', '--project', 'issue-1', '--task', '2', '--stdin'], JSON.stringify({ files_modified: 'c/d.js' }));
  assert(r.status === 0 && r.json && r.json.all_complete === true, 'T7: closes under delegate policy');
  const p = readProgress(root), st = readState(root);
  assert(/\| tdd-guide executor task 1 \| subagent-invoked \|/.test(p), 'T7: row uses subagent-invoked under delegate');
  assert(repair.unresolvedCompliance(p, st).length === 0, 'T7: boundary PASSES the two-arg gate under delegate policy (the regression this closes); got ' + JSON.stringify(repair.unresolvedCompliance(p, st)));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T8: delegate policy + explicit `invoked` compliance_status on the LAST close ->
// self-validation REFUSES (would brick the boundary), zero mutation.
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase('delegation_policy: delegate'), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ files_modified: 'a/b.js' }));
  const r = run(root, ['close-task', '--project', 'issue-1', '--task', '2', '--stdin'], JSON.stringify({ files_modified: 'c/d.js', compliance_status: 'invoked' }));
  assert(r.status === 1 && r.json && r.json.reason === 'unresolved_compliance', 'T8: explicit invoked on final close -> unresolved_compliance refusal; got ' + (r.json && r.json.reason));
  const st = readState(root);
  assert(!/^step: complete$/m.test(st), 'T8: state pointer NOT advanced on refusal (zero mutation)');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T9: Sink preserved + idempotent close re-run (timestamp not bumped)
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  const pkt = JSON.stringify({ files_modified: 'a/b.js' });
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], pkt);
  const before = readProgress(root);
  const r2 = run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], pkt);
  assert(r2.json && r2.json.idempotent === true, 'T9: identical close re-run idempotent');
  assert(readProgress(root) === before, 'T9: progress file byte-unchanged on idempotent re-run (no timestamp bump)');
  assert(readState(root).includes(SINK), 'T9: Sink preserved through close');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T10: orient
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  let o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.initialized === false, 'T10: orient pre-init');
  run(root, ['init-progress', '--project', 'issue-1']);
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.initialized === true && o.json.first_open_task === '1' && o.json.all_complete === false, 'T10: orient first_open_task 1');
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ files_modified: 'a/b.js' }));
  run(root, ['close-task', '--project', 'issue-1', '--task', '2', '--stdin'], JSON.stringify({ files_modified: 'c/d.js' }));
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.all_complete === true && o.json.next_command.endsWith('/kaola-workflow-phase5 issue-1'), 'T10: orient all_complete -> phase5');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T12: a literal pipe in a task name must NOT corrupt the table (cell sanitize)
// ---------------------------------------------------------------------------
{
  const PLAN_PIPE = ['# Phase 3 - Plan: issue-1', '', '## Task List', '',
    '### Task 1: support a|b syntax', '- Write Set: a/b.js', '',
    '### Task 2: normal task', '- Write Set: c/d.js', ''].join('\n');
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN_PIPE });
  run(root, ['init-progress', '--project', 'issue-1']);
  const p = readProgress(root);
  // the task-1 row must have exactly 5 columns (id|name|status|files|notes), not shifted
  const row1 = p.split('\n').find(l => /^\| 1 \|/.test(l));
  assert(row1 && row1.split('|').slice(1, -1).length === 5, 'T12: piped task name stays single-column (5 cells); got ' + JSON.stringify(row1));
  // progressTaskRows must read task 1 as pending (status not mis-shifted)
  const o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.first_open_task === '1', 'T12: first_open_task correctly 1 (status not mis-read from a piped name)');
  // close it and confirm status reads complete, task 2 next
  const c = run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'], JSON.stringify({ files_modified: 'a/b.js' }));
  assert(c.status === 0 && c.json && c.json.all_complete === false, 'T12: close piped-name task 1 ok');
  const o2 = run(root, ['orient', '--project', 'issue-1']);
  assert(o2.json && o2.json.first_open_task === '2', 'T12: after close, first_open_task is 2');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T13: a `$1`/`$&` token in build_status must NOT be interpreted as a replacement
// ---------------------------------------------------------------------------
{
  const root = makeProject({ 'workflow-state.md': stateBase(), 'phase3-plan.md': PLAN });
  run(root, ['init-progress', '--project', 'issue-1']);
  run(root, ['close-task', '--project', 'issue-1', '--task', '1', '--stdin'],
    JSON.stringify({ files_modified: 'a/b.js', build_status: 'failing: cost $1 and $& fix' }));
  const p = readProgress(root);
  const body = (p.match(/##\s+Build Status\s*\n([^\n]*)/) || [, ''])[1];
  assert(body === 'failing: cost $1 and $& fix', 'T13: Build Status body is the literal input ($-tokens not expanded); got ' + JSON.stringify(body));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T11: edition tokens — the only contiguous token is the repair-state require
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const toks = [...new Set(src.match(/kaola-workflow-[a-z0-9-]+/g) || [])];
  assert(toks.length === 1 && toks[0] === 'kaola-workflow-repair-state', 'T11: only contiguous token is the repair-state require; found ' + JSON.stringify(toks));
  const routeLeaks = toks.filter(t => /(phase|research|ideation|plan|execute|review|finalize)$/.test(t));
  assert(routeLeaks.length === 0, 'T11: no route-token leaks; ' + routeLeaks.join(','));
}

// ---------------------------------------------------------------------------
// #689 — writeFileAtomic parent-directory fsync ORDERING (same gap #685 fixed on the adaptive path's
// writeFileAtomicReplace, copied verbatim). Node's require('fs') is a process-wide singleton, so
// patching fs.<method> here is observed by the production function's own `require('fs')` binding
// (same seam as test-claim-hardening.js's #685 regression). Every patched method is restored in a
// `finally` so the spy never leaks into a later test in this process.
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-phase4-atomic-dirfsync-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const calls = [];
  const fdToPath = new Map();
  const origOpenSync = fs.openSync;
  const origFsyncSync = fs.fsyncSync;
  const origRenameSync = fs.renameSync;
  const origCloseSync = fs.closeSync;
  fs.openSync = function (p, ...rest) {
    const fd = origOpenSync.call(fs, p, ...rest);
    fdToPath.set(fd, p);
    calls.push({ fn: 'openSync', arg: p, fd });
    return fd;
  };
  fs.fsyncSync = function (fd) {
    calls.push({ fn: 'fsyncSync', arg: fdToPath.get(fd), fd });
    return origFsyncSync.call(fs, fd);
  };
  fs.renameSync = function (a, b) {
    calls.push({ fn: 'renameSync', arg: [a, b] });
    return origRenameSync.call(fs, a, b);
  };
  fs.closeSync = function (fd) {
    calls.push({ fn: 'closeSync', arg: fdToPath.get(fd), fd });
    return origCloseSync.call(fs, fd);
  };
  let wrote;
  try {
    wrote = writeFileAtomic(target, 'gamma');
  } finally {
    fs.openSync = origOpenSync;
    fs.fsyncSync = origFsyncSync;
    fs.renameSync = origRenameSync;
    fs.closeSync = origCloseSync;
  }
  assert(wrote === true, '#689: write with the order-tracking spy in place still returns true');
  const renameIdx = calls.findIndex(c => c.fn === 'renameSync');
  assert(renameIdx !== -1, '#689: renameSync was called, got ' + JSON.stringify(calls));
  const tmpFsyncIdx = calls.findIndex((c, i) => i < renameIdx && c.fn === 'fsyncSync');
  assert(tmpFsyncIdx !== -1, '#689: the tmp-file fd is fsynced BEFORE renameSync (pre-existing contract), got ' + JSON.stringify(calls));
  const dirOpenIdx = calls.findIndex((c, i) => i > renameIdx && c.fn === 'openSync' && c.arg === parentDir);
  assert(dirOpenIdx !== -1, '#689: parent directory opened AFTER renameSync, got ' + JSON.stringify(calls));
  const dirOpenFd = dirOpenIdx !== -1 ? calls[dirOpenIdx].fd : undefined;
  const dirFsyncIdx = calls.findIndex((c, i) => i > dirOpenIdx && c.fn === 'fsyncSync' && c.fd === dirOpenFd);
  assert(dirFsyncIdx !== -1,
    '#689: the parent-directory fd is fsynced after open+rename — full required order is ' +
    'fsyncSync(tmpFd) -> renameSync -> openSync(dir) -> fsyncSync(dirFd) -> closeSync(dirFd), got ' + JSON.stringify(calls));
  const dirCloseIdx = calls.findIndex((c, i) => i > dirFsyncIdx && c.fn === 'closeSync' && c.fd === dirOpenFd);
  assert(dirCloseIdx !== -1, '#689: the parent-directory fd is closed after its own fsync, got ' + JSON.stringify(calls));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #689 — platform fail-soft on the parent-directory fsync. A directory open/fsync can be refused on
// some platforms/filesystems (Windows, EISDIR, EACCES, EINVAL). That failure must degrade SILENTLY —
// never propagate, never turn a previously-accepted write into a refusal.
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-phase4-atomic-failsoft-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const origOpenSync = fs.openSync;

  function patchOpenSyncToFaultOnDir(code) {
    fs.openSync = function (p, ...rest) {
      if (p === parentDir) {
        const err = new Error('#689 fault injection: simulated ' + code + ' opening the parent directory');
        err.code = code;
        throw err;
      }
      return origOpenSync.call(fs, p, ...rest);
    };
  }

  let wrote1, threw1 = false;
  patchOpenSyncToFaultOnDir('EISDIR');
  try { wrote1 = writeFileAtomic(target, 'delta'); } catch (_) { threw1 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw1 === false, '#689: a directory-open failure during the fsync step must NOT propagate (fail-soft)');
  assert(wrote1 === true, '#689: the write still completes and returns its normal true contract despite the fsync failure');
  assert(fs.readFileSync(target, 'utf8') === 'delta', '#689: content is durably written even when parent-dir fsync is unsupported');

  let wrote2, threw2 = false;
  patchOpenSyncToFaultOnDir('EACCES');
  try { wrote2 = writeFileAtomic(target, 'epsilon'); } catch (_) { threw2 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw2 === false && wrote2 === true, '#689: fail-soft degrades every call, not just the first');
  assert(fs.readFileSync(target, 'utf8') === 'epsilon', '#689: content is durably written on the second fail-soft call too');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log('\nphase4-advance tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
console.log('test-phase4-advance passed');
