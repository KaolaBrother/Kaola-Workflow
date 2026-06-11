#!/usr/bin/env node
'use strict';

// #356: claim fail-open hardening — gh round-trips are timeout-bounded (claim's ghExec was the one
// uncapped copy), and branch args reject a leading-dash/NUL so a malformed ref can't reach git as a
// flag. REMOTE_TIMEOUT_MS resolves at module load, so the timeout env is set BEFORE require.

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = '500';   // tiny cap for the hang test (set before require)
delete process.env.KAOLA_WORKFLOW_OFFLINE;        // ensure ghExec actually shells the mock

const { ghExec, isSafeBranchArg, removeBranch, postAdvisoryClaim } = require('./kaola-workflow-claim.js');
const { writeFileAtomicReplace } = require('./kaola-workflow-adaptive-schema.js');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

// --- isSafeBranchArg ---------------------------------------------------------
assert(isSafeBranchArg('workflow/issue-1') === true, '#356: a normal branch is safe');
assert(isSafeBranchArg('-rf') === false, '#356: a leading-dash branch is rejected (would be a git flag)');
assert(isSafeBranchArg('--force') === false, '#356: a double-dash branch is rejected');
assert(isSafeBranchArg('') === false, '#356: an empty branch is rejected');
assert(isSafeBranchArg('a\0b') === false, '#356: a NUL-bearing branch is rejected');
assert(isSafeBranchArg(null) === false, '#356: a non-string branch is rejected');

// --- removeBranch guard (refuses without invoking git) -----------------------
assert(removeBranch(os.tmpdir(), '-D') === false, '#356: removeBranch refuses a leading-dash branch (guard returns false)');

// --- ghExec timeout (a hung remote must not wedge the claim) ------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ghto-'));
  const mock = path.join(dir, 'gh.js');
  // Keep the process alive ~10s but responsive to SIGTERM (execFileSync's timeout kill).
  fs.writeFileSync(mock, 'setTimeout(() => process.exit(0), 10000);');
  process.env.KAOLA_GH_MOCK_SCRIPT = mock;
  const t0 = Date.now();
  let threw = false;
  try { ghExec(['issue', 'view', '1', '--json', 'state']); } catch (_) { threw = true; }
  const elapsed = Date.now() - t0;
  delete process.env.KAOLA_GH_MOCK_SCRIPT;
  fs.rmSync(dir, { recursive: true, force: true });
  assert(threw, '#356: a hung gh mock makes ghExec throw (killed by the timeout), not hang');
  assert(elapsed < 4000, '#356: ghExec returned within the 500ms cap window (~' + elapsed + 'ms), not the 30s default hang');
}

// --- postAdvisoryClaim truthful status (#356) -------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-pac-'));
  // Mock gh: succeed everything → label added → 'posted'.
  const okMock = path.join(dir, 'gh-ok.js');
  fs.writeFileSync(okMock, "process.stdout.write(''); process.exit(0);");
  // Mock gh: FAIL `issue edit` (the --add-label) → label NOT added → 'failed'.
  const failMock = path.join(dir, 'gh-fail.js');
  fs.writeFileSync(failMock, "const a=process.argv.slice(2); if(a[0]==='issue'&&a[1]==='edit'){process.exit(1);} process.exit(0);");

  process.env.KAOLA_GH_MOCK_SCRIPT = okMock;
  assert(postAdvisoryClaim(1, 'issue-1') === 'posted', '#356: a successful add-label → remote_claim:posted');
  process.env.KAOLA_GH_MOCK_SCRIPT = failMock;
  assert(postAdvisoryClaim(1, 'issue-1') === 'failed', '#356: a failed add-label → remote_claim:failed (zero-footprint claim is VISIBLE)');
  delete process.env.KAOLA_GH_MOCK_SCRIPT;
  fs.rmSync(dir, { recursive: true, force: true });
  // (offline → 'skipped_offline' is covered by the OFFLINE-const guard; not unit-testable here
  // because OFFLINE resolves at module load, before this test can set the env.)
}

// --- writeFileAtomicReplace (#353) ------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-atomic-'));
  const target = path.join(dir, 'sub', 'workflow-state.md'); // nested dir must be created
  const wrote1 = writeFileAtomicReplace(target, 'alpha');
  assert(wrote1 === true, '#353: first write returns true');
  assert(fs.readFileSync(target, 'utf8') === 'alpha', '#353: content written');
  const wrote2 = writeFileAtomicReplace(target, 'alpha');
  assert(wrote2 === false, '#353: unchanged content → no rewrite (returns false)');
  const wrote3 = writeFileAtomicReplace(target, 'beta');
  assert(wrote3 === true && fs.readFileSync(target, 'utf8') === 'beta', '#353: changed content rewritten atomically');
  // No leftover .tmp scratch in the directory (tmp + rename leaves no residue on success).
  const residue = fs.readdirSync(path.dirname(target)).filter(n => n.includes('.tmp'));
  assert(residue.length === 0, '#353: no leftover .tmp file after atomic replace, got ' + JSON.stringify(residue));
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- #398.1 assertSafeBranchArg (THROW at creation sites) / #398.2 / #403.8 --
{
  const { assertSafeBranchArg, assertNoNewline, classifyWorktreeError } = require('./kaola-workflow-claim.js');
  let threw = false;
  try { assertSafeBranchArg('-evil', 'test'); } catch (_) { threw = true; }
  assert(threw, '#398.1: assertSafeBranchArg throws on a leading-dash branch');
  threw = false;
  try { assertSafeBranchArg('main\nworktree_path: /tmp/EVIL', 'test'); } catch (_) { threw = true; }
  assert(threw, '#398.1: assertSafeBranchArg throws on a newline-bearing branch (field injection)');
  let ok = true;
  try { assertSafeBranchArg('workflow/issue-1', 'test'); } catch (_) { ok = false; }
  assert(ok, '#398.1: assertSafeBranchArg accepts a normal branch');

  threw = false;
  try { assertNoNewline('a\nb', 'worktree_path'); } catch (_) { threw = true; }
  assert(threw, '#398.2: assertNoNewline throws on a newline value');
  threw = false;
  try { assertNoNewline('safe-value', 'branch'); } catch (_) { threw = true; }
  assert(!threw, '#398.2: assertNoNewline accepts a single-line value');

  assert(classifyWorktreeError("fatal: 'wt' already exists") === 'already_exists', '#403.8: already_exists classified');
  assert(classifyWorktreeError('fatal: not a valid object name') === 'invalid_ref', '#403.8: invalid_ref classified');
  assert(classifyWorktreeError('') === '', '#403.8: empty error → empty class');
  assert(classifyWorktreeError('some weird error') === 'unclassified', '#403.8: unknown error → unclassified');
}

// --- #395.1 buildClosureReceipt undefined-skip (receipt-field-survival) ------
{
  const { buildClosureReceipt } = require('./kaola-workflow-claim.js');
  const r = buildClosureReceipt('proj', 7, { roadmap_source_removed: undefined, roadmap_regenerated: 'regenerated' });
  assert(r.roadmap_source_removed === 'failed', '#395.1: undefined step keeps the seeded failed default (field never vanishes)');
  assert(r.roadmap_regenerated === 'regenerated', '#395.1: a defined step still overwrites the default');
  assert(!('close_disposition' in r), '#395.1/#396.4: undefined close_disposition is not emitted');
  const r2 = buildClosureReceipt('proj', 7, { close_disposition: 'close_pending', keep_open_requested: true });
  assert(r2.close_disposition === 'close_pending', '#396.4: a set close_disposition survives into the receipt');
  assert(r2.keep_open_requested === true, '#396.3: keep_open_requested survives into the receipt');
}

if (failed > 0) {
  console.error('claim-hardening tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('claim-hardening tests passed (' + passed + ' assertions)');
}
