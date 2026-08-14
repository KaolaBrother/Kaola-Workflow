#!/usr/bin/env node
'use strict';

// test-relative-tmpdir-escape.js — no installer or fixture temporary write lands inside the
// working checkout, whatever TMPDIR holds (#976).
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE FAULT, measured at 51db5d2d. Eight shell installer sites (install.sh bootstrap +
// install_managed_agent + two manifest snapshots; install-opencode.sh two manifest snapshots +
// seed_config render; install-kimi.sh hooks backup) rely on mktemp's OWN TMPDIR consultation —
// bare `mktemp` / `mktemp -d` / `mktemp -t NAME` — which is NOT the `"${TMPDIR:-/tmp}/x.XXXXXX"`
// idiom test-fixture-sandbox.js pins: `:-` guards an EMPTY value, and mktemp itself resolves a
// relative TMPDIR against the current directory. On the Node side `os.tmpdir()` returns a
// relative TMPDIR VERBATIM, so every `mkdtempSync(path.join(os.tmpdir(), …))` root — the
// walkthrough's module-load HOME sandbox included — lands in the cwd. Measured harm, not
// hypothetical litter: a bare walkthrough under `TMPDIR=.` put four fixture roots in the
// checkout root, MODIFIED A TRACKED FILE (and left a new untracked artifact) under
// kaola-workflow/archive/, and failed; a bare
// `bash install.sh` on a GNU system put its manifest/agent temp files in the checkout root and
// exited 0, cleaning them up so no before/after check can see it.
//
// THE PROPERTY IS PLATFORM-CONDITIONAL, which is why this suite carries a shim. On macOS,
// /usr/bin/mktemp derives its directory from _CS_DARWIN_USER_TEMP_DIR and IGNORES TMPDIR even
// when TMPDIR is absolute (man mktemp; measured), so the shell sites cannot escape there and a
// suite that simply ran the installers on a Mac would pass with or without a fix — vacuously.
// On GNU coreutils (measured at 9.7) mktemp consults a relative TMPDIR verbatim: `mktemp` and
// `mktemp -d` create in the cwd, and `mktemp -t kaola-kimi-hooks` (a template with no X's) is
// "too few X's in template", exit 1 — which under `set -euo pipefail` ABORTS the kimi install
// whenever a config exists. The mktemp shim below reproduces that measured GNU behaviour table
// and is put FIRST on PATH for the installer scenarios, so the shell half of the result is
// observable on every platform this suite runs on, and the kimi abort is reproduced here on a
// Mac. What the shim can NOT prove: that a real GNU mktemp binary behaves as the shim does —
// that is a measurement, and the shim encodes it rather than establishes it. The shim also logs
// every path it creates (absolutised) to a side file, so WHERE temp writes landed is judged
// deterministically instead of racing their lifetime; the live poller stays anyway, for writes
// that do not pass through mktemp.
//
// The Node half needs no shim: `os.tmpdir()` returns "." verbatim on every platform.
//
// TWO IDIOMS THAT LOOK LIKE THE FIX AND ARE MEASURED DEAD (same measurements as
// test-fixture-sandbox.js): `fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), …)))`
// absolutises the returned STRING after the directory was already created in the cwd — the
// run-chains scenario below observes exactly that shape: the chain child receives a perfectly
// ABSOLUTE private TMPDIR that sits INSIDE the runner's cwd, which at finalize is the working
// checkout. And `path.resolve(os.tmpdir())` is absolute at creation and IS the cwd. Absolute is
// not the property that matters; not resolving against the current directory is. This suite
// pins RESULTS — where writes landed, whether the install still succeeds — never the mechanism:
// a shared guard, per-site templates, or an env normalisation are all acceptable ways to pass
// it. The one instrument-shaped assertion (the shim observed at least one mktemp call) exists
// so a bypassed instrument cannot read as a clean run, and says so in its message.
//
// WHY THIS SUITE IS NOT ITSELF THE ESCAPE: as in test-fixture-sandbox.js, every induced child
// runs against a COPY of the checkout (or a scratch fixture repo) inside a sandbox, never this
// repository; the real checkout is watched for fixture-shaped debris the whole time, and any
// such entry is a hard failure.
//
// Usage
//   node scripts/test-relative-tmpdir-escape.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// Top-level entries the copied checkout does not need: the run-record band, worktrees, git
// history, and the developer's own local surfaces.
const SKIP_TOP = new Set(['.git', '.kw', 'kaola-workflow', 'node_modules', '.claude']);
const POLL_MS = 15;
const MIN_TICKS = 10;      // below this, "nothing was seen" is a statement about the window
const TIMEOUT_SCALE = Math.max(1, Number(process.env.KAOLA_TEST_TIMEOUT_SCALE) || 1);
const SCENARIO_TIMEOUT_MS = 120000 * TIMEOUT_SCALE;

// The real checkout's contents BEFORE this suite makes anything — read first, deliberately, for
// the same reason test-fixture-sandbox.js does: taken after the sandbox exists, it would have
// swallowed a sandbox that landed in the checkout, which is exactly what happens if THIS suite
// is itself run under a relative TMPDIR.
const repoBefore = new Set(fs.readdirSync(repoRoot));

// A hermetic child environment: a developer's own KAOLA_*/KW_* exports must not reach the
// children under test (a leaked KW_TMPDIR or offline flag silently changes what a scenario
// measures), and fixture git commands must not read developer git config.
function childEnv(extra) {
  const base = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('KAOLA_') || k.startsWith('KW_')) continue;
    base[k] = v;
  }
  base.GIT_CONFIG_GLOBAL = '/dev/null';
  base.GIT_CONFIG_NOSYSTEM = '1';
  return Object.assign(base, extra);
}

// ---------------------------------------------------------------------------------------------
// Sandbox: a copy of this checkout, the shim, and the per-scenario HOME/target dirs.
// ---------------------------------------------------------------------------------------------
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reltmp-')));
const checkout = path.join(sandbox, 'checkout');
fs.mkdirSync(checkout, { recursive: true });
for (const name of fs.readdirSync(repoRoot)) {
  if (SKIP_TOP.has(name)) continue;
  fs.cpSync(path.join(repoRoot, name), path.join(checkout, name),
    { recursive: true, dereference: false, force: true });
}
const checkoutReal = fs.realpathSync(checkout);

// Refresh the generated edition trees IN THE COPY, before any observation. The edition
// installers self-heal a stale/missing .opencode/.kimi by regenerating it into the repo —
// a legitimate write into the observed root that would be indistinguishable from an escape,
// so it must have already happened by the time a baseline is taken.
for (const gen of ['sync-opencode-edition.js', 'sync-kimi-edition.js']) {
  // spawn-class: environment
  const r = spawnSync(process.execPath,
    [path.join(checkout, 'scripts', gen), '--forge=github', '--write'],
    { cwd: checkout, env: childEnv({}), encoding: 'utf8' });
  assert(r.status === 0,
    'setup: ' + gen + ' --write failed in the copied checkout (exit ' + r.status + ') — the '
      + 'edition scenarios below would misattribute a self-heal regeneration as an escape. '
      + 'Output: ' + String(r.stdout || '') + String(r.stderr || ''));
}

// The GNU-coreutils-shaped mktemp shim (semantics of coreutils 9.7, as measured): consults
// $TMPDIR even when relative; requires >= 3 trailing X's with -t (and for explicit templates);
// logs every created path, absolutised against its own cwd, to $KW_MKTEMP_SHIM_LOG.
const shimDir = path.join(sandbox, 'shim');
fs.mkdirSync(shimDir, { recursive: true });
fs.writeFileSync(path.join(shimDir, 'mktemp'), [
  '#!/usr/bin/env bash',
  '# GNU-coreutils-shaped mktemp shim — see test-relative-tmpdir-escape.js.',
  'set -u',
  "is_dir=0 dry=0 quiet=0 under_tmpdir=0 tmpdir_val='' template='' have_template=0",
  'while [[ $# -gt 0 ]]; do',
  '  case "$1" in',
  '    -d|--directory) is_dir=1; shift ;;',
  '    -u|--dry-run)   dry=1; shift ;;',
  '    -q|--quiet)     quiet=1; shift ;;',
  '    -t)             under_tmpdir=1; shift ;;',
  '    -p)             under_tmpdir=1; tmpdir_val="$2"; shift 2 ;;',
  '    --tmpdir=*)     under_tmpdir=1; tmpdir_val="${1#--tmpdir=}"; shift ;;',
  '    --tmpdir)       under_tmpdir=1; shift ;;',
  '    --)             shift; if [[ $# -gt 0 ]]; then template="$1"; have_template=1; shift; fi ;;',
  '    -*)             echo "mktemp: invalid option -- \'$1\' (shim: unsupported)" >&2; exit 1 ;;',
  '    *)              template="$1"; have_template=1; shift ;;',
  '  esac',
  'done',
  'if [[ "$have_template" -eq 0 ]]; then',
  "  template='tmp.XXXXXXXXXX'",
  '  under_tmpdir=1',
  'fi',
  'target="$template"',
  'if [[ "$under_tmpdir" -eq 1 ]]; then',
  '  base="${tmpdir_val:-${TMPDIR:-/tmp}}"',
  '  target="$base/$template"',
  'fi',
  'stem="$template"',
  'xs=0',
  'while [[ "$stem" == *X ]]; do stem="${stem%X}"; xs=$((xs + 1)); done',
  'if [[ "$xs" -lt 3 ]]; then',
  '  [[ "$quiet" -eq 1 ]] || echo "mktemp: too few X\'s in template \'$template\'" >&2',
  '  exit 1',
  'fi',
  'base_stem="${target%"$(printf \'X%.0s\' $(seq 1 $xs))"}"',
  "alnum='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'",
  'attempt=0',
  'while [[ "$attempt" -lt 100 ]]; do',
  '  attempt=$((attempt + 1))',
  "  suffix=''",
  '  i=0',
  '  while [[ "$i" -lt "$xs" ]]; do',
  '    suffix="$suffix${alnum:RANDOM%62:1}"',
  '    i=$((i + 1))',
  '  done',
  '  candidate="$base_stem$suffix"',
  '  if [[ "$dry" -eq 1 ]]; then',
  "    printf '%s\\n' \"$candidate\"",
  '    exit 0',
  '  fi',
  '  if [[ "$is_dir" -eq 1 ]]; then',
  '    if mkdir -m 700 "$candidate" 2>/dev/null; then created=1; else created=0; fi',
  '  else',
  '    if ( set -C; umask 077; : > "$candidate" ) 2>/dev/null; then created=1; else created=0; fi',
  '  fi',
  '  if [[ "$created" -eq 1 ]]; then',
  '    case "$candidate" in',
  '      /*) abs="$candidate" ;;',
  '      *)  abs="$PWD/$candidate" ;;',
  '    esac',
  '    if [[ -n "${KW_MKTEMP_SHIM_LOG:-}" ]]; then',
  "      printf '%s\\n' \"$abs\" >> \"$KW_MKTEMP_SHIM_LOG\"",
  '    fi',
  "    printf '%s\\n' \"$candidate\"",
  '    exit 0',
  '  fi',
  'done',
  '[[ "$quiet" -eq 1 ]] || echo "mktemp: failed to create via template \'$template\'" >&2',
  'exit 1',
  '',
].join('\n'), { mode: 0o755 });

const shimLog = path.join(sandbox, 'mktemp-shim.log');
const shimPath = shimDir + path.delimiter + (process.env.PATH || '');
function shimLinesFrom(offset) {
  let raw = '';
  try { raw = fs.readFileSync(shimLog, 'utf8'); } catch (_) { raw = ''; }
  const lines = raw.split('\n').filter(Boolean);
  return lines.slice(offset).map(p => path.resolve(p));
}
function shimLineCount() {
  let raw = '';
  try { raw = fs.readFileSync(shimLog, 'utf8'); } catch (_) { raw = ''; }
  return raw.split('\n').filter(Boolean).length;
}
const insideCheckout = p => p === checkoutReal || p.startsWith(checkoutReal + path.sep);

// ---- the instrument is armed: shim + relative-TMPDIR mechanism, proven live on THIS platform.
// Without this, "no shim-logged path was inside the checkout" could be a statement about a shim
// that never ran (wrong PATH order, unexecutable file), and the installer scenarios would go
// green with the defect present — the exact vacuity the shim exists to prevent.
{
  const controlDir = path.join(sandbox, 'shim-control');
  fs.mkdirSync(controlDir, { recursive: true });
  // spawn-class: environment
  const r = spawnSync('bash', ['-c', 'mktemp'], {
    cwd: controlDir,
    env: childEnv({ PATH: shimPath, TMPDIR: '.', KW_MKTEMP_SHIM_LOG: shimLog }),
    encoding: 'utf8',
  });
  const logged = shimLinesFrom(0);
  assert(r.status === 0 && logged.length === 1
      && logged[0].startsWith(fs.realpathSync(controlDir) + path.sep),
    'the mktemp shim control failed: a bare `mktemp` under TMPDIR=. from ' + controlDir
      + ' must be served by the shim, create inside that cwd, and log it. exit=' + r.status
      + ' stdout=' + JSON.stringify(String(r.stdout || '').trim()) + ' log='
      + JSON.stringify(logged) + '. Every shell-side verdict below rests on this instrument.');
}

// ---- the real checkout, watched for the whole run — read-only, scoped to fixture shapes.
const REPO_PREFIXES = ['kw-', 'tmp.', 'kaola-'];
const repoBreach = new Set();
const repoPoll = setInterval(() => {
  try {
    for (const n of fs.readdirSync(repoRoot)) {
      if (repoBefore.has(n)) continue;
      if (REPO_PREFIXES.some(p => n.startsWith(p))) repoBreach.add(n);
    }
  } catch (_) { /* transient */ }
}, 25);

// ---------------------------------------------------------------------------------------------
// Scenario runner: spawn one child while observing one directory (poller + fs.watch + a planted
// control entry + a final readdir). Everything it reports is a RESULT: what appeared beside the
// baseline, what the child printed, how it exited.
// ---------------------------------------------------------------------------------------------
const CONTROL_PREFIX = '__kw976-control-';
const SETTLE_MS = 150;

async function runObserved(label, argv, opts) {
  return new Promise((resolve) => {
    const dir = opts.observeDir;
    // Control names share one prefix and the filter below excludes the PREFIX, not just this
    // scenario's own name: fs.watch on this platform can deliver a PREVIOUS scenario's events
    // (its control deletion, a transient file that scenario correctly reported) after the next
    // watcher starts — observed live, twice. The settle window below absorbs those stale
    // deliveries into the baseline before the child spawns, so every scenario's verdict is
    // about its own child; the prefix filter stays for a straggler that outlives the window.
    const control = CONTROL_PREFIX + label + '__';
    const before = new Set(fs.readdirSync(dir));
    const seen = new Set();
    let ticks = 0;
    let watcher = null;
    try {
      watcher = fs.watch(dir, { persistent: false }, (_ev, n) => { if (n) seen.add(n); });
    } catch (_) { watcher = null; }
    const poll = setInterval(() => {
      ticks++;
      try { for (const n of fs.readdirSync(dir)) seen.add(n); } catch (_) { /* mid-write */ }
    }, POLL_MS);

    const start = () => {
      for (const n of seen) before.add(n);
      seen.clear();
      fs.mkdirSync(path.join(dir, control), { recursive: true });

      const child = spawn(argv[0], argv.slice(1), {
        cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { out += d; });
      let timedOut = false;
      const bound = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch (_) { /* already gone */ }
      }, SCENARIO_TIMEOUT_MS);
      child.on('exit', (code) => {
        clearTimeout(bound);
        // A child fast enough to finish inside MIN_TICKS polls does not make the window claim
        // false — keep observing the directory until the floor is met (leftovers are exactly
        // what a post-exit tick still sees), bounded so a dead poller fails the tick assertion
        // honestly instead of hanging here.
        const finish = () => {
          clearInterval(poll);
          if (watcher) { try { watcher.close(); } catch (_) { /* best effort */ } }
          try { for (const n of fs.readdirSync(dir)) seen.add(n); } catch (_) { /* gone */ }
          try { fs.rmSync(path.join(dir, control), { recursive: true, force: true }); } catch (_) {}
          const newEntries = [...seen]
            .filter(n => !n.startsWith(CONTROL_PREFIX) && !before.has(n)).sort();
          resolve({ code, out, timedOut, ticks, newEntries, sawControl: seen.has(control) });
        };
        if (ticks >= MIN_TICKS) { finish(); return; }
        const floorDeadline = Date.now() + 3000;
        const waitFloor = setInterval(() => {
          if (ticks >= MIN_TICKS || Date.now() > floorDeadline) {
            clearInterval(waitFloor);
            finish();
          }
        }, POLL_MS);
      });
    };
    setTimeout(start, SETTLE_MS);
  });
}

function assertObservation(label, r) {
  assert(r.sawControl,
    label + ': the observer never saw its own planted control entry — it read the wrong '
      + 'directory or never ran, and any "nothing escaped" verdict for this scenario would be '
      + 'about the observer, not the child.');
  assert(!r.timedOut,
    label + ': the child was still running after ' + SCENARIO_TIMEOUT_MS + 'ms and was killed. '
      + 'Nothing in this scenario is a verdict. Output (tail):\n' + r.out.slice(-2000));
  assert(r.newEntries.length > 0 || r.ticks >= MIN_TICKS,
    label + ': the observer ticked only ' + r.ticks + ' time(s); a clean result over that '
      + 'window says more about the window than the child.');
}

function escapeMessage(label, r, extra) {
  return label + ': ' + r.newEntries.length + ' entr(ies) appeared beside the observed root '
    + 'while the child ran under a relative TMPDIR: ' + JSON.stringify(r.newEntries.slice(0, 12))
    + (r.newEntries.length > 12 ? ' … and ' + (r.newEntries.length - 12) + ' more' : '') + '. '
    + 'Required: no installer or fixture temporary write lands inside the working checkout, '
    + 'whatever TMPDIR holds. ' + (extra || '');
}

// The measured mechanism, stated once and referenced by the failure messages below.
const MECHANISM = 'GNU mktemp consults a relative TMPDIR verbatim and resolves it against the '
  + 'cwd (macOS mktemp never consults TMPDIR — _CS_DARWIN_USER_TEMP_DIR — which is why the '
  + 'GNU-shaped shim serves these scenarios); `os.tmpdir()` returns a relative TMPDIR verbatim '
  + 'on every platform. `${TMPDIR:-/tmp}` guards only an EMPTY value. Wrapping mkdtempSync in '
  + 'realpathSync absolutises the STRING after the directory landed in the cwd, and '
  + 'path.resolve(os.tmpdir()) IS the cwd — both measured dead. How to meet the result is open.';

(async () => {
  // -------------------------------------------------------------------------------------------
  // A. `bash install.sh --yes --forge=github` from the copied checkout, GNU-shaped mktemp,
  //    TMPDIR=. — the agent-manifest snapshots and the 14 per-agent frontmatter rewrites.
  // -------------------------------------------------------------------------------------------
  {
    const home = path.join(sandbox, 'home-a');
    fs.mkdirSync(home, { recursive: true });
    const at = shimLineCount();
    const r = await runObserved('install.sh', ['bash', path.join(checkout, 'install.sh'), '--yes', '--forge=github'], {
      cwd: checkout,
      observeDir: checkout,
      env: childEnv({ HOME: home, PATH: shimPath, TMPDIR: '.', KW_MKTEMP_SHIM_LOG: shimLog }),
    });
    assertObservation('install.sh', r);
    const lines = shimLinesFrom(at);
    const inside = lines.filter(insideCheckout);
    assert(lines.length > 0,
      'install.sh: the shim observed ZERO mktemp calls during the install. Either the installer '
        + 'no longer uses mktemp at all — in which case this scenario\'s instrument must be '
        + 're-derived around whatever replaced it, not deleted — or the shim was bypassed '
        + '(absolute mktemp path, sanitised PATH), and every location verdict below is vacuous.');
    assert(inside.length === 0,
      'install.sh: ' + inside.length + ' of ' + lines.length + ' mktemp-created paths landed '
        + 'INSIDE the copied checkout: ' + JSON.stringify(inside.slice(0, 6)) + '. On a GNU '
        + 'system a bare `bash install.sh` does this to the real checkout and cleans up after '
        + 'itself, so nothing that looks afterwards can see it. ' + MECHANISM);
    assert(r.newEntries.length === 0, escapeMessage('install.sh', r, MECHANISM));
    assert(r.code === 0,
      'install.sh: exits ' + r.code + ' under a relative TMPDIR — the temp files must move out '
        + 'of the checkout without the install losing what it does. Output (tail):\n'
        + r.out.slice(-2000));
    const manifest = path.join(home, '.claude', 'agents', '.kaola-workflow-agent-manifest');
    assert(fs.existsSync(manifest) && fs.readFileSync(manifest, 'utf8').trim().length > 0,
      'install.sh: no agent manifest landed at ' + manifest + ' — a green exit that installed '
        + 'nothing is not a pass.');
  }

  // -------------------------------------------------------------------------------------------
  // B. `bash install-opencode.sh --yes --target <scratch>` — manifest snapshots + the rendered
  //    opencode.json seed.
  // -------------------------------------------------------------------------------------------
  {
    const home = path.join(sandbox, 'home-b');
    const target = path.join(sandbox, 'target-b');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    const at = shimLineCount();
    const r = await runObserved('install-opencode.sh',
      ['bash', path.join(checkout, 'install-opencode.sh'), '--yes', '--target', target], {
        cwd: checkout,
        observeDir: checkout,
        env: childEnv({ HOME: home, PATH: shimPath, TMPDIR: '.', KW_MKTEMP_SHIM_LOG: shimLog }),
      });
    assertObservation('install-opencode.sh', r);
    const lines = shimLinesFrom(at);
    const inside = lines.filter(insideCheckout);
    assert(lines.length > 0,
      'install-opencode.sh: the shim observed ZERO mktemp calls — either the installer no '
        + 'longer uses mktemp (re-derive this instrument around its replacement) or the shim '
        + 'was bypassed and the location verdicts are vacuous.');
    assert(inside.length === 0,
      'install-opencode.sh: ' + inside.length + ' of ' + lines.length + ' mktemp-created paths '
        + 'landed INSIDE the copied checkout: ' + JSON.stringify(inside.slice(0, 6)) + '. '
        + MECHANISM);
    assert(r.newEntries.length === 0, escapeMessage('install-opencode.sh', r, MECHANISM));
    assert(r.code === 0,
      'install-opencode.sh: exits ' + r.code + ' under a relative TMPDIR. Output (tail):\n'
        + r.out.slice(-2000));
    assert(fs.existsSync(path.join(target, 'opencode.json')),
      'install-opencode.sh: no opencode.json was seeded at the target — a green exit that '
        + 'deployed nothing is not a pass.');
  }

  // -------------------------------------------------------------------------------------------
  // C. `bash install-kimi.sh` with an EXISTING config.toml — the hooks-merge backup site. On
  //    GNU semantics the current `mktemp -t kaola-kimi-hooks` is "too few X's", exit 1, and
  //    `set -euo pipefail` aborts the whole install: a worse, unfiled defect at the same line,
  //    invisible on macOS and reproduced here through the shim.
  // -------------------------------------------------------------------------------------------
  {
    const home = path.join(sandbox, 'home-c');
    const target = path.join(sandbox, 'target-c');
    const kimiHome = path.join(sandbox, 'kimi-home-c');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(kimiHome, { recursive: true });
    const userLine = '[kw976_user_owned_section]';
    fs.writeFileSync(path.join(kimiHome, 'config.toml'), '# user config\n' + userLine + '\nkey = 1\n');
    const at = shimLineCount();
    const r = await runObserved('install-kimi.sh',
      ['bash', path.join(checkout, 'install-kimi.sh'), '--yes', '--target', target], {
        cwd: checkout,
        observeDir: checkout,
        env: childEnv({ HOME: home, KIMI_CODE_HOME: kimiHome, PATH: shimPath, TMPDIR: '.',
          KW_MKTEMP_SHIM_LOG: shimLog }),
      });
    assertObservation('install-kimi.sh', r);
    assert(r.code === 0,
      'install-kimi.sh: exits ' + r.code + ' under GNU mktemp semantics with an existing '
        + 'config.toml. `mktemp -t kaola-kimi-hooks` carries no X\'s: GNU rejects it ("too few '
        + 'X\'s in template"), and set -euo pipefail turns that into an aborted install for '
        + 'every GNU user who has a kimi config — macOS never sees it because its mktemp '
        + 'ignores TMPDIR and accepts -t without X\'s. Required: the install succeeds AND its '
        + 'temp/backup writes land outside the checkout; the backup mechanism itself is free '
        + 'to change shape. Output (tail):\n' + r.out.slice(-2000));
    const inside = shimLinesFrom(at).filter(insideCheckout);
    assert(inside.length === 0,
      'install-kimi.sh: mktemp-created paths landed INSIDE the copied checkout: '
        + JSON.stringify(inside.slice(0, 6)) + '. ' + MECHANISM);
    assert(r.newEntries.length === 0, escapeMessage('install-kimi.sh', r, MECHANISM));
    let cfg = null;
    try { cfg = fs.readFileSync(path.join(kimiHome, 'config.toml'), 'utf8'); } catch (_) { cfg = '<MISSING: config.toml no longer exists>'; }
    assert(cfg.includes(userLine) && cfg.includes('# >>> kaola-workflow kimi hooks'),
      'install-kimi.sh: after a green install the config must hold BOTH the user\'s own '
        + 'section and the managed hooks block — a green exit that skipped the merge (or '
        + 'destroyed the user half) is not a pass. Got:\n' + cfg.slice(0, 800));
  }

  // -------------------------------------------------------------------------------------------
  // C2. Same install, but a `kimi` binary whose `doctor` REJECTS the merged config. The backup
  //     exists to restore the user's file on rejection; a fix must not reach C\'s green exit by
  //     deleting the backup mechanism. Green at the current baseline BY CONSTRUCTION (the abort
  //     in C fires before the merge, leaving the config untouched) — this scenario is the
  //     companion pin that keeps the restore contract through the fix, not a baseline red.
  // -------------------------------------------------------------------------------------------
  {
    const home = path.join(sandbox, 'home-c2');
    const target = path.join(sandbox, 'target-c2');
    const kimiHome = path.join(sandbox, 'kimi-home-c2');
    const rejectDir = path.join(sandbox, 'shim-c2');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(kimiHome, { recursive: true });
    fs.mkdirSync(rejectDir, { recursive: true });
    fs.copyFileSync(path.join(shimDir, 'mktemp'), path.join(rejectDir, 'mktemp'));
    fs.chmodSync(path.join(rejectDir, 'mktemp'), 0o755);
    fs.writeFileSync(path.join(rejectDir, 'kimi'),
      '#!/usr/bin/env bash\necho "kw976 stub: doctor rejects" >&2\nexit 1\n', { mode: 0o755 });
    const preMerge = '# user config\n[kw976_user_owned_section]\nkey = 2\n';
    fs.writeFileSync(path.join(kimiHome, 'config.toml'), preMerge);
    const r = await runObserved('install-kimi.sh(doctor-reject)',
      ['bash', path.join(checkout, 'install-kimi.sh'), '--yes', '--target', target], {
        cwd: checkout,
        observeDir: checkout,
        env: childEnv({ HOME: home, KIMI_CODE_HOME: kimiHome,
          PATH: rejectDir + path.delimiter + (process.env.PATH || ''), TMPDIR: '.',
          KW_MKTEMP_SHIM_LOG: shimLog }),
      });
    assertObservation('install-kimi.sh(doctor-reject)', r);
    assert(r.code !== 0,
      'install-kimi.sh(doctor-reject): a config the kimi doctor rejects must abort the install '
        + 'non-zero — a green exit here means the validation was skipped or its verdict '
        + 'swallowed. Output (tail):\n' + r.out.slice(-2000));
    let cfg = null;
    try { cfg = fs.readFileSync(path.join(kimiHome, 'config.toml'), 'utf8'); } catch (_) { cfg = '<MISSING: config.toml no longer exists>'; }
    assert(cfg === preMerge,
      'install-kimi.sh(doctor-reject): the pre-merge config.toml must be restored '
        + 'byte-identically when the doctor rejects the merge. The backup that makes this '
        + 'possible is the same mechanism the TMPDIR fix touches — a fix that reaches the '
        + 'green install by deleting the backup destroys the user\'s config on this path. '
        + 'Got:\n' + cfg.slice(0, 800));
    assert(r.newEntries.length === 0, escapeMessage('install-kimi.sh(doctor-reject)', r, MECHANISM));
  }

  // -------------------------------------------------------------------------------------------
  // D. The walkthrough under TMPDIR=. — the Node half, observable on every platform, no shim.
  //    `--shard 1/999999` runs one scenario, but the module-load HOME sandbox (and the other
  //    module-level fixture roots) are created before any test runs, which is the point.
  // -------------------------------------------------------------------------------------------
  {
    const r = await runObserved('walkthrough',
      [process.execPath, path.join(checkout, 'scripts', 'simulate-workflow-walkthrough.js'),
        '--shard', '1/999999'], {
        cwd: checkout,
        observeDir: checkout,
        env: childEnv({ TMPDIR: '.' }),
      });
    assertObservation('walkthrough', r);
    assert(r.newEntries.length === 0,
      escapeMessage('walkthrough', r,
        'The walkthrough builds its HOME sandbox and fixture roots from os.tmpdir() at module '
        + 'load; under a relative TMPDIR they land in the checkout, and the measured full run '
        + 'went on to MODIFY A TRACKED FILE under kaola-workflow/archive/ before failing — '
        + 'a misdirected root redirects real writes, it does not just litter. ' + MECHANISM));
    assert(r.timedOut || r.code === 0,
      'walkthrough: exits ' + r.code + ' under a relative TMPDIR — a fixture root that became '
        + 'absolute must not cost the suite what it measures. Output (tail):\n'
        + r.out.slice(-2000));
    assert(r.timedOut || /"ran":1/.test(r.out),
      'walkthrough: the shard trailer does not report a scenario actually ran — a clean escape '
        + 'verdict over a walkthrough that executed nothing is vacuous. Output (tail):\n'
        + r.out.slice(-1200));
  }

  // -------------------------------------------------------------------------------------------
  // E. run-chains under TMPDIR=. — the per-chain private temp root, observed from a scratch
  //    fixture repo through the --mock-chain seam. The child-side hand-down contract itself
  //    (absolute TMPDIR/TMP/TEMP, private per chain, cleaned after) is pinned by
  //    test-run-chains.js T30/T31 and restated here only as far as this scenario relies on it.
  // -------------------------------------------------------------------------------------------
  {
    const fixture = path.join(sandbox, 'runchains-fixture');
    fs.mkdirSync(fixture, { recursive: true });
    const gitOpts = { env: childEnv({}), encoding: 'utf8' };
    G.init(fixture, { branch: 'main', email: 'test@example.com', name: 'Test', spawn: gitOpts });
    fs.writeFileSync(path.join(fixture, 'seed.txt'), 'seed\n');
    const commit = G.commitPaths(fixture, 'seed.txt', 'seed', ['-q'], gitOpts);
    assert(commit.status === 0,
      'setup: the run-chains fixture repo could not commit — ' + String(commit.stderr || ''));
    const marker = path.join(sandbox, 'runchains-probe.json');
    const probe = path.join(fixture, 'kw976-probe.js');
    fs.writeFileSync(probe, [
      '#!/usr/bin/env node',
      "'use strict';",
      "const fs = require('fs');",
      'fs.writeFileSync(' + JSON.stringify(marker) + ', JSON.stringify({',
      '  TMPDIR: process.env.TMPDIR || null,',
      '  TMP: process.env.TMP || null,',
      '  TEMP: process.env.TEMP || null,',
      "  existed: !!process.env.TMPDIR && fs.existsSync(process.env.TMPDIR),",
      "}) + '\\n');",
      'process.exit(0);',
      '',
    ].join('\n'), { mode: 0o755 });
    fs.mkdirSync(path.join(fixture, '.cache'), { recursive: true });
    const fixtureReal = fs.realpathSync(fixture);

    const r = await runObserved('run-chains',
      [process.execPath, path.join(checkout, 'scripts', 'kaola-workflow-run-chains.js'),
        '--chains', 'claude', '--mock-chain', 'claude:' + probe,
        '--output', '.cache/kw976-e.json'], {
        cwd: fixture,
        observeDir: fixture,
        env: childEnv({ TMPDIR: '.' }),
      });
    assertObservation('run-chains', r);
    assert(r.code === 0,
      'run-chains: exits ' + r.code + ' under a relative TMPDIR. Output (tail):\n'
        + r.out.slice(-2000));
    let m = null;
    try { m = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch (_) { m = null; }
    assert(m && m.TMPDIR && path.isAbsolute(m.TMPDIR) && m.existed === true
        && m.TMP === m.TMPDIR && m.TEMP === m.TMPDIR,
      'run-chains: the mock chain must still receive one existing, absolute, private '
        + 'TMPDIR/TMP/TEMP root (the hand-down half test-run-chains.js T30 pins). Got: '
        + JSON.stringify(m));
    const rootReal = (() => {
      if (!m || !m.TMPDIR) return null;
      try { return fs.realpathSync(m.TMPDIR); } catch (_) { return path.resolve(m.TMPDIR); }
    })();
    assert(rootReal !== null && rootReal !== fixtureReal
        && !rootReal.startsWith(fixtureReal + path.sep),
      'run-chains: the chain\'s private temp root ' + JSON.stringify(m && m.TMPDIR) + ' sits '
        + 'INSIDE the runner\'s own cwd ' + fixtureReal + '. It is absolute — realpathSync '
        + 'absolutises the STRING after mkdtempSync already created the directory in the cwd — '
        + 'and at finalize that cwd is the working checkout, so every chain child then '
        + 'faithfully fills a directory inside the checkout. Absolute is not the property that '
        + 'matters; not resolving against the cwd is. ' + MECHANISM);
    assert(r.newEntries.length === 0, escapeMessage('run-chains', r,
      'The kw-chain-* root itself appeared beside the fixture repo\'s files. ' + MECHANISM));
    const leftovers = fs.readdirSync(fixture).filter(n => n.startsWith('kw-chain-'));
    assert(leftovers.length === 0,
      'run-chains: chain temp roots left behind in the runner\'s cwd after the run: '
        + JSON.stringify(leftovers));
  }

  // ---- and nothing reached the real checkout ------------------------------------------------
  clearInterval(repoPoll);
  assert(repoBreach.size === 0,
    'this suite wrote fixture artifacts into the working checkout ' + repoRoot + ' — it has '
      + 'become an instance of the class it tests. Entries: ' + JSON.stringify([...repoBreach]));

  fs.rmSync(sandbox, { recursive: true, force: true });

  console.log('relative-TMPDIR escape: installers + walkthrough + run-chains leave nothing in the checkout: done');
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  clearInterval(repoPoll);
  console.error('UNEXPECTED: ' + (e && e.stack || e));
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
