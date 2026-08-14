#!/usr/bin/env node
'use strict';

// test-fixture-sandbox.js — a test fixture cannot leave artifacts in the working checkout.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE FAULT, measured at 69264936. `scripts/test-install-all.js` builds every fixture root with
// `fs.mkdtempSync(path.join(os.tmpdir(), …))`, and the `install-all.sh` it drives does the same on
// the shell side with `mktemp "${TMPDIR:-/tmp}/…"`. `os.tmpdir()` returns `TMPDIR` VERBATIM and
// `:-` guards an EMPTY value, not a relative one — so a relative `TMPDIR` makes every one of those
// roots relative, and a relative root resolves against the current directory. That directory is
// the checkout for the suite, and the checkout again for the wrapper it spawns (`cwd: REPO`).
// Run that way, the suite puts dozens of `kaola-install-all-*` roots directly into the checkout,
// each holding a `plugins/` tree.
//
// WHY THE OBVIOUS CHECK CANNOT SEE IT. The suite's `cleanup()` deletes every root it made, so a
// `git status` before and after the run is identical and reports nothing. The escape exists only
// WHILE the suite runs; anything that looks afterwards concludes, wrongly, that there was none.
// The observation here is therefore a live one — a poller reading the directory during the run,
// plus an `fs.watch` recorder for anything that lives less than one tick.
//
// WHAT THIS SUITE DOES NOT PRESCRIBE, and why it names two measurements instead. Two idioms look
// like the fix and neither is; both were measured under `TMPDIR=.`, and stating either one as
// "the fix" in a failure message would send its reader somewhere that does not work.
//
//   fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), …)))
//       returns an ABSOLUTE path and leaves the directory in the cwd. It absolutises the returned
//       STRING, after the directory has already been created wherever the relative path pointed.
//       What `kaola-workflow-run-chains.js` gets out of it is a safe value to hand CHILDREN as
//       their `TMPDIR` (`:326-333`) — real, and it is why a suite run under a chain is not
//       exposed. Its own root still landed in the cwd.
//
//   fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), …))
//       is absolute at the moment of creation, which is the usual statement of the rule, and it
//       ALSO lands in the cwd: `path.resolve(".")` IS the cwd. Absolute is not the property that
//       matters.
//
// The property that matters is that a fixture root must not resolve against the current
// directory, and this suite pins that RESULT — nothing appears beside the checkout while the
// suite runs — rather than any of the ways to reach it. Both language halves are read: a fix to
// the Node side alone leaves `install-all.sh` writing its per-runtime logs into the checkout,
// silently, because a failed `mktemp` there costs only the log.
//
// WHY THIS SUITE IS NOT ITSELF THE ESCAPE. It tests a class defined by fixtures escaping into the
// live checkout, so it must not become an instance of one. It never runs the suite against this
// repository: it copies the tree the suite needs into a scratch sandbox and points the child at
// the COPY, so `REPO`, the child's cwd and the wrapper's cwd are all inside the sandbox and every
// escape lands there, where it is observed and then deleted with the sandbox. The real checkout is
// watched throughout anyway, and any fixture-shaped entry appearing in it is a hard failure rather
// than an assumption.
//
// Usage
//   node scripts/test-fixture-sandbox.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// Top-level entries the copied checkout does NOT need. `kaola-workflow/` is the run-record band
// and is by far the largest thing in the tree; the suite reads installers, `scripts/` and
// `plugins/`, and runs no git command at all (every `git` in it is prose).
const SKIP_TOP = new Set(['.git', '.kw', 'kaola-workflow', 'node_modules', '.opencode']);
// Planted before the child starts, and asserted observed. Without it a detector that watched the
// wrong directory, or never ran, would report "no escapes" and be believed.
const CONTROL = '__detector-control__';
const POLL_MS = 15;
const MIN_TICKS = 20;      // below this, "nothing was seen" is a statement about the window
const HARD_BOUND_MS = 300000;

// The real checkout's contents BEFORE this suite makes anything — read first, deliberately. Taken
// after the sandbox was created it would have swallowed a sandbox that landed in the checkout
// (which is exactly what happens if THIS suite is run under a relative TMPDIR), and the guard that
// exists to stop this suite becoming an instance of its own class would have been unarmed in the
// one case it is for.
const repoBefore = new Set(fs.readdirSync(repoRoot));

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fixture-sandbox-')));
const checkout = path.join(sandbox, 'checkout');
fs.mkdirSync(checkout, { recursive: true });
for (const name of fs.readdirSync(repoRoot)) {
  if (SKIP_TOP.has(name)) continue;
  fs.cpSync(path.join(repoRoot, name), path.join(checkout, name),
    { recursive: true, dereference: false, force: true });
}

// Everything the copied checkout legitimately holds. Anything appearing beside it during the run
// arrived from a fixture that resolved its root against the current directory.
const baseline = new Set(fs.readdirSync(checkout));
fs.mkdirSync(path.join(checkout, CONTROL), { recursive: true });

const seen = new Set();
let ticks = 0;
let watcher = null;
try {
  // Second, independent recorder, for a root that is created and removed inside one poll interval.
  // `fs.watch` names the watched directory itself in some events on this platform, so its
  // filenames are only ever ADDED to what the poller found and filtered against the baseline
  // below rather than trusted as children.
  watcher = fs.watch(checkout, { persistent: false }, (_ev, name) => { if (name) seen.add(name); });
} catch (_) { watcher = null; }

const poll = setInterval(() => {
  ticks++;
  try { for (const n of fs.readdirSync(checkout)) seen.add(n); } catch (_) { /* mid-write */ }
}, POLL_MS);

const escapesSoFar = () => [...seen].filter(n => n !== CONTROL && !baseline.has(n));

// The real checkout, watched for the whole run — read-only, and scoped to the shapes this suite's
// fixtures actually make, so an unrelated file another process leaves there cannot red it.
const FIXTURE_PREFIXES = ['kaola-install-all-', 'kw-fixture-sandbox-', 'tmp.'];
const repoBreach = new Set();
const repoPoll = setInterval(() => {
  try {
    for (const n of fs.readdirSync(repoRoot)) {
      if (repoBefore.has(n)) continue;
      if (FIXTURE_PREFIXES.some(p => n.startsWith(p))) repoBreach.add(n);
    }
  } catch (_) { /* transient */ }
}, 25);

// `TMPDIR=.` is the measured hazard shape, and it is safe here only because the cwd it resolves
// against — for this child AND for the wrapper the child spawns — is the copied checkout.
const child = spawn(process.execPath, [path.join(checkout, 'scripts', 'test-install-all.js')], {
  cwd: checkout,
  env: Object.assign({}, process.env, { TMPDIR: '.' }),
});
let childOut = '';
child.stdout.on('data', d => { childOut += d; });
child.stderr.on('data', d => { childOut += d; });

// The red path is fast: once an escape is proven there is nothing left to learn from the rest of a
// multi-minute suite. `killedByProbe` is what the exit-code assertion reads, so a deliberate kill
// is never reported as a failing suite.
//
// The two kills are recorded SEPARATELY. Suppressing the exit-code assertion is right for a kill
// that follows a proven escape — that failure is already reported — and wrong for the hard bound,
// where nothing has been proven and silence would let a suite that hung report "0 failed". A
// timeout is its own failure, asserted below.
let killedByProbe = false;
let hitHardBound = false;
const bail = setInterval(() => {
  if (escapesSoFar().length > 0 || repoBreach.size > 0) {
    killedByProbe = true;
    try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
  }
}, 50);
const hardBound = setTimeout(() => {
  killedByProbe = true;
  hitHardBound = true;
  try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
}, HARD_BOUND_MS);

child.on('exit', (code) => {
  clearInterval(poll);
  clearInterval(repoPoll);
  clearInterval(bail);
  clearTimeout(hardBound);
  if (watcher) { try { watcher.close(); } catch (_) { /* best effort */ } }

  const escapes = escapesSoFar().sort();

  // ---- the detector is armed -------------------------------------------------------------------
  assert(seen.has(CONTROL),
    'the detector never saw its own control entry ' + CONTROL + ' in ' + checkout + ' — it is '
      + 'reading the wrong directory or never ran, and "no escapes" below would be a statement '
      + 'about the detector rather than about the suite. Observed: ' + JSON.stringify([...seen]));
  assert(baseline.has('install-all.sh') && baseline.has('scripts') && baseline.has('plugins'),
    'the copied checkout is missing what the suite reads — the child cannot have exercised the '
      + 'fixture-root sites at all. Baseline: ' + JSON.stringify([...baseline].sort()));

  // ---- nothing escaped into the checkout --------------------------------------------------------
  assert(escapes.length === 0,
    'the suite created ' + escapes.length + ' fixture artifact(s) in the checkout root under a '
      + 'relative TMPDIR. `os.tmpdir()` returns TMPDIR verbatim and `mktemp "${TMPDIR:-/tmp}/…"` '
      + 'guards only an EMPTY value, so a relative one resolves against the current directory — '
      + 'which for this suite and for the `install-all.sh` it spawns is the checkout. What is '
      + 'required is that a fixture root not resolve against the current directory; how is open. '
      + 'Two idioms that look sufficient and are not, both measured under TMPDIR=. : wrapping the '
      + '`mkdtempSync` in `realpathSync` (absolutises the returned STRING, after the directory has '
      + 'already been created in the cwd), and joining onto `path.resolve(os.tmpdir())` (absolute '
      + 'at creation, and `path.resolve(".")` IS the cwd). Observed: '
      + JSON.stringify(escapes.slice(0, 12))
      + (escapes.length > 12 ? ' … and ' + (escapes.length - 12) + ' more' : ''));
  assert(escapes.length > 0 || ticks >= MIN_TICKS,
    'the detector ticked only ' + ticks + ' time(s), so "nothing escaped" says more about the '
      + 'observation window than about the suite. The clean result is only meaningful over a run '
      + 'long enough to reach the fixture-root sites on both sides.');

  // ---- and nothing reached the real checkout ------------------------------------------------------
  assert(repoBreach.size === 0,
    'this suite wrote fixture artifacts into the working checkout ' + repoRoot + ' — it has become '
      + 'an instance of the class it tests. Entries: ' + JSON.stringify([...repoBreach]));

  // ---- the observation ran to a conclusion --------------------------------------------------------
  assert(!hitHardBound,
    'the install-all suite was still running after ' + HARD_BOUND_MS + 'ms and was killed. Nothing '
      + 'above is a verdict: no escape was proven and none was ruled out, because the run never '
      + 'reached its end. Child output (tail):\n' + childOut.slice(-2000));

  // ---- the suite still passes under a relative TMPDIR ---------------------------------------------
  if (!killedByProbe) {
    assert(code === 0,
      'the install-all suite exits ' + code + ' under a relative TMPDIR — the fixture roots must '
        + 'become absolute without the suite losing what it measures. Child output (tail):\n'
        + childOut.slice(-2000));
  }

  fs.rmSync(sandbox, { recursive: true, force: true });

  console.log('fixture sandbox: a relative TMPDIR leaves nothing in the checkout: done');
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
});
