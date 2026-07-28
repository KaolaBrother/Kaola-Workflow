#!/usr/bin/env node
'use strict';

// test-spawn-census.js — advisory, fail-open runtime census of test-time process spawns.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script; it exists so a suite can report how many child processes it
// actually paid for, WITHOUT changing a single assertion.
//
// Contract
// --------
//   * ADVISORY. It reports a number. It never refuses, never writes a file, never
//     touches an exit code, and never fails a suite. Every step is wrapped so that a
//     census fault degrades to silence — fail-open BY CONSTRUCTION, not by convention.
//   * INERT. The counters wrap the child_process entry points in strict pass-through
//     form (same `this`, same arguments, same return value, same thrown error, same
//     `name`/`length`), so a suite's behaviour, assertion count and exit code are
//     byte-identical with the census installed or removed.
//   * ONE LINE PER RUN. A suite emits exactly one `spawn-census:` summary line.
//
// Why the counter sits at the child_process boundary rather than in a per-suite helper
// ------------------------------------------------------------------------------------
// Only the walkthrough has a single spawn choke point (`runNode` / `runNodeAsync`). The
// three unit suites grew per-scenario local helpers instead — dozens of them
// (`run665`, `g691`, `runClaim825`, `runValidator`, `runWithStub`, ...) plus direct
// call sites — so "instrument the helper" would mean ~150 edit sites in files the
// campaign is trying to hold still. Counting where every one of those helpers
// necessarily converges is the same measurement with a four-line diff per suite, and
// it cannot drift out of date when a new helper is added.
//
// Usage (at the very top of a suite, before it destructures child_process):
//   require('./test-spawn-census').install('test-adaptive-node');
// and, just before the suite's own pass/fail summary:
//   require('./test-spawn-census').report();

const COUNTED = ['spawnSync', 'execFileSync', 'execSync', 'spawn'];

let suiteName = null;
let spawns = 0;
let installed = false;
let reported = false;

/**
 * Install pass-through counting wrappers on the child_process entry points and arm the
 * fallback reporter. Idempotent. Never throws.
 */
function install(suite) {
  try {
    if (installed) return;
    installed = true;
    suiteName = String(suite);
    const cp = require('child_process');
    for (const name of COUNTED) {
      const original = cp[name];
      if (typeof original !== 'function') continue;
      const wrapped = function () {
        spawns++;
        return original.apply(this, arguments);
      };
      // Keep the wrapper indistinguishable from the original for anything that
      // introspects it.
      try {
        Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
        Object.defineProperty(wrapped, 'length', { value: original.length, configurable: true });
      } catch (_) { /* introspection polish only */ }
      cp[name] = wrapped;
    }
    // Fallback only: a suite that throws before its summary still reports. The normal
    // path is the explicit report() call, which keeps the line in stream order.
    process.on('exit', () => { report(true); });
  } catch (_) {
    // A census fault must never be visible to the suite under measurement.
  }
}

/**
 * Emit the single summary line. Idempotent — the first caller wins, so the explicit
 * call at the end of a suite and the exit fallback cannot both print.
 * @param {boolean} [fromExit] use a synchronous fd write; during 'exit' a buffered
 *   stdout write to a pipe can be dropped on some platforms.
 */
function report(fromExit) {
  try {
    if (reported || !installed) return;
    reported = true;
    const line = 'spawn-census: ' + JSON.stringify({ suite: suiteName, spawns }) + '\n';
    if (fromExit) {
      try { require('fs').writeSync(1, line); } catch (_) { /* nothing left to try */ }
    } else {
      process.stdout.write(line);
    }
  } catch (_) {
    // Fail-open: telemetry never fails a suite.
  }
}

/** Current count. Exported for the census's own coverage, not for assertions. */
function count() {
  return spawns;
}

module.exports = { install, report, count, COUNTED };
