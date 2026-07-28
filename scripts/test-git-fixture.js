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
function spawnGit(args, opts) {
  return require('child_process').spawnSync('git', args, opts);
}

const DEFAULT_OPTS = { encoding: 'utf8' };

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
    Object.assign({}, DEFAULT_OPTS, opts || {}));
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
  const r = spawnGit(['-C', String(repo)].concat(args),
    Object.assign({}, DEFAULT_OPTS, opt.spawn || {}));
  if (opt.identity !== false) {
    git(repo, ['config', 'user.email', opt.email || 'test@example.com'], opt.spawn);
    git(repo, ['config', 'user.name', opt.name || 'Test User'], opt.spawn);
  }
  return r;
}

/** `git init --bare <dir>` — the argument is the repo being CREATED, not a cwd. */
function initBare(dir, opts) {
  return spawnGit(['init', '--bare', String(dir)],
    Object.assign({}, DEFAULT_OPTS, opts || {}));
}

/** `git clone <src> <dest>`. */
function clone(src, dest, extraArgs, opts) {
  return spawnGit(['clone'].concat((extraArgs || []).map(String), [String(src), String(dest)]),
    Object.assign({}, DEFAULT_OPTS, opts || {}));
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
  git, gitOk, out,
  init, initBare, clone,
  add, commit, commitAll, commitPaths,
  head, checkout, remoteAdd,
};
