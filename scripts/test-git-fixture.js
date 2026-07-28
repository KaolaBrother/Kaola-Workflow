#!/usr/bin/env node
'use strict';

// test-git-fixture.js — the suites' single process-boundary decision point for git.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or required by a
// production script. It is a library, not a suite: no chain entry runs it.
//
// Why this file exists
// --------------------
// ADR 0013's razor says a child process earns its place only where the property under test
// lives AT the process boundary. A `git commit` inside a fixture is not a property under
// test at all — it is ARRANGEMENT. And unlike a spawn of one of this repo's own CLIs, it
// cannot be converted: there is no in-process git here, so the process is unavoidable.
//
// Both halves are true at once. The resolution is neither "annotate 1,300 arrangement lines
// with a boundary class they do not have" nor "pretend they are convertible". It is to stop
// them from being 1,300 independent DECISIONS. Every git fixture call routes through `git()`
// below, so the repo holds exactly one place where a test decides to spawn git, one place
// where fixture identity and encoding are fixed, and one place to change if an in-process
// git ever exists.
//
// Honesty note, because the census is a measurement and must not be gamed
// ----------------------------------------------------------------------
// Consolidating here removes CALL SITES, not PROCESSES. The runtime census
// (`test-spawn-census`) is the number that does NOT move when a suite is routed through
// this file, and it is the number to quote when claiming a speed win. Processes actually
// disappear in the node-CLI slice, where the spawned program is one of this repo's own CLIs
// and a `module.exports` API already exists. Those are different work; do not conflate the
// two numbers in a report.
//
// Semantics
// ---------
// Every helper is a thin, argv-faithful wrapper: it builds the SAME argv the inline call it
// replaces built, so a conversion to this library is behaviour-preserving by inspection. No
// helper adds a flag the caller did not ask for, and none of them assert — a fixture that
// wants a failure checked calls `gitOk`, and one that deliberately tolerates failure keeps
// using `git`. Anything without a helper uses `git()` directly rather than growing a
// one-caller helper.
//
// Usage
//   const G = require('./test-git-fixture');       // root scripts/
//   const G = require('../../../scripts/test-git-fixture'); // an edition tree
//   G.init(repo, { branch: 'main' });
//   G.commitAll(repo, 'initial');
//   const sha = G.head(repo);
//   G.git(repo, ['tag', 'v1']);                    // escape hatch, still one site

// Resolved at CALL time, never destructured at require time: the advisory runtime census
// (test-spawn-census) installs pass-through wrappers onto the child_process module object,
// and a require-time destructure would capture whichever binding happened to exist first.
// Reading the property per call makes this library countable no matter the require order.
//
// The same late binding is a HAZARD in one place, so it is written down rather than left to
// be rediscovered: scripts/test-run-chains.js deliberately replaces
// `child_process.spawnSync` to intercept the chain runner. A fixture call routed through
// `git()` inside that file's patched window would be intercepted too. Its git fixture calls
// are all on the execFileSync side, which it does NOT patch, so nothing is intercepted
// today — but a future conversion there must check the patch before using `git`/`raw`.
function spawnGit(args, opts) {
  return require('child_process').spawnSync('git', args, opts);
}

// The execFileSync half. It is a genuinely different contract from spawnSync — it RETURNS
// stdout and THROWS on a non-zero exit — so it gets its own entry point rather than a flag
// on the one above. Options are forwarded exactly, including `undefined`: execFileSync's own
// default already pipes stdout and inherits stderr, which is what an inline call with no
// options was getting, and substituting a default here would silently turn a Buffer return
// into a string.
function execGit(args, opts) {
  return require('child_process').execFileSync('git', args, opts);
}

// Options are passed through VERBATIM whenever the caller supplies them, and defaulted only
// when they do not. Merging a default under a caller's object would be a silent semantic
// change: `{ stdio: 'pipe' }` alone yields Buffer stdout, and quietly folding
// `encoding: 'utf8'` into it would turn that into a string under a caller that may be
// reading `.stdout` as bytes. The default exists solely so a bare `git(repo, args)` does not
// inherit the parent's stdio and spray the suite's output.
const NO_OPTS = { encoding: 'utf8' };

/** Normalise `paths` given as a string or an array into an argv tail. */
function pathArgs(paths) {
  if (paths === undefined || paths === null) return [];
  return Array.isArray(paths) ? paths.map(String) : [String(paths)];
}

/**
 * THE one git spawn in the suites. Runs `git -C <repo> <...args>`.
 * @returns the raw spawnSync result — callers that care read `.status` / `.stdout`.
 */
function git(repo, args, opts) {
  return spawnGit(['-C', String(repo)].concat(args.map(String)),
    opts === undefined ? NO_OPTS : opts);
}

/**
 * git with NO `-C`: for the calls whose repo is an argument rather than a working
 * directory — `init --bare <path>`, `clone <src> <dest>`, `--version` probes.
 */
function raw(args, opts) {
  return spawnGit(args.map(String), opts === undefined ? NO_OPTS : opts);
}

/** `execFileSync('git', ['-C', repo, ...args], opts)` — returns stdout, throws on failure. */
function exec(repo, args, opts) {
  return execGit(['-C', String(repo)].concat(args.map(String)), opts);
}

/** execFileSync git with NO `-C`, for calls whose repo is an argument or that need none. */
function execRaw(args, opts) {
  return execGit(args.map(String), opts);
}

/** As `git`, but throws with the child's own stderr when the command fails. */
function gitOk(repo, args, opts) {
  const r = git(repo, args, opts);
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed in ' + repo
      + ' (status ' + r.status + '): ' + String(r.stderr || '').trim());
  }
  return r;
}

/** Trimmed stdout of a git command. */
function out(repo, args, opts) {
  return String(git(repo, args, opts).stdout || '').trim();
}

/**
 * `git init` in `repo`, then the fixture identity.
 * @param {object} [o] `branch` adds `-b <branch>` (omit it to keep the host default, which
 *   is what an inline `git init` with no flag does); `email`/`name` override the identity;
 *   `identity: false` skips the two config calls entirely.
 */
function init(repo, o) {
  const opt = o || {};
  const args = ['init'];
  if (opt.branch) args.push('-b', String(opt.branch));
  const r = git(repo, args, opt.spawn);
  if (opt.identity !== false) {
    git(repo, ['config', 'user.email', opt.email || 'test@example.com'], opt.spawn);
    git(repo, ['config', 'user.name', opt.name || 'Test User'], opt.spawn);
  }
  return r;
}

/** `git init --bare <dir>` — the argument is the repo being CREATED, not a cwd. */
function initBare(dir, opts) {
  return spawnGit(['init', '--bare', String(dir)], opts === undefined ? NO_OPTS : opts);
}

/** `git clone <src> <dest>`. */
function clone(src, dest, extraArgs, opts) {
  return spawnGit(['clone'].concat((extraArgs || []).map(String), [String(src), String(dest)]),
    opts === undefined ? NO_OPTS : opts);
}

/** `git add <paths>` — defaults to `-A`. */
function add(repo, paths, opts) {
  const p = pathArgs(paths);
  return git(repo, ['add'].concat(p.length ? p : ['-A']), opts);
}

/** `git commit -m <message>` plus any extra argv (e.g. `['--allow-empty']`). */
function commit(repo, message, extraArgs, opts) {
  return git(repo, ['commit', '-m', String(message)].concat((extraArgs || []).map(String)), opts);
}

/** `git add -A` then `git commit -m <message>`. Returns the COMMIT result. */
function commitAll(repo, message, extraArgs, opts) {
  add(repo, null, opts);
  return commit(repo, message, extraArgs, opts);
}

/** `git add <paths>` then `git commit -m <message>`. Returns the COMMIT result. */
function commitPaths(repo, paths, message, extraArgs, opts) {
  add(repo, paths, opts);
  return commit(repo, message, extraArgs, opts);
}

/** Resolved sha of `ref` (default HEAD), trimmed. */
function head(repo, ref, opts) {
  return out(repo, ['rev-parse', ref === undefined ? 'HEAD' : String(ref)], opts);
}

/** `git checkout <ref>`, or `git checkout -b <ref>` with `{ create: true }`. */
function checkout(repo, ref, o, opts) {
  const create = o && o.create;
  return git(repo, create ? ['checkout', '-b', String(ref)] : ['checkout', String(ref)], opts);
}

/** `git remote add <name> <url>`. */
function remoteAdd(repo, name, url, opts) {
  return git(repo, ['remote', 'add', String(name), String(url)], opts);
}

module.exports = {
  git, raw, exec, execRaw, gitOk, out,
  init, initBare, clone,
  add, commit, commitAll, commitPaths,
  head, checkout, remoteAdd,
};
