#!/usr/bin/env node
'use strict';

// test-shard-lib.js — scenario sharding for the hand-rolled suites.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script; it exists so a suite's wall-clock can be split across worker
// processes WITHOUT changing a single assertion.
//
// Model
// -----
// A hand-rolled suite in this repo is a flat, ordered list of self-contained
// scenario blocks. Each block owns its own fixtures (mkdtemp roots, fixture repos)
// and shares nothing with its neighbours except pure helpers and the pass/fail
// counters. That makes the list partitionable: N worker processes can each run a
// DISJOINT slice, and every scenario still runs exactly once across the shard set,
// in its original relative order inside its own shard.
//
// CLI contract
// ------------
//   --shard i/N   run only the scenarios whose 0-based ordinal satisfies
//                 (ordinal % N) === (i - 1).  i is 1-based, 1 <= i <= N.
//   (absent)      run EVERY scenario in file order — behaviour identical to the
//                 pre-shard suite, so a bare `node scripts/<suite>.js` is unchanged.
//
// A STRIDE partition (ordinal % N) is used rather than contiguous ranges because
// scenario cost is unevenly distributed through these files (long fixture-driven
// blocks cluster together); a stride interleaves cheap and expensive scenarios
// across every shard and keeps the shards' wall-clocks close.
//
// Coverage self-report
// --------------------
// Every sharded run prints ONE machine-readable coverage line:
//
//   ##KW-SHARD {"suite":"...","index":2,"total":8,"scenarios":277,"ran":35,...}
//
// `scenarios` is the FULL registered count (every shard sees the whole list and
// filters it), `ran` is this shard's slice. A runner that fans a suite out asserts
// sum(ran) === scenarios and that every shard agrees on `scenarios`; a partition
// that ever dropped or duplicated a scenario turns the gate RED instead of quietly
// testing less.

const MARKER = '##KW-SHARD ';

/**
 * Parse `--shard i/N` out of an argv array.
 * @returns {{index:number,total:number}|null} null when the flag is absent.
 * @throws {Error} on a malformed or out-of-range value (never silently ignored —
 *   a typo must not degrade into "ran everything twice").
 */
/**
 * `auto/N` slice index — deterministic WITHIN a commit, rotating ACROSS commits.
 *
 * This exists to buy wall-clock by SAMPLING, which is a real coverage reduction per
 * run: only 1/N of the registry executes. The rotation is what bounds the loss —
 * consecutive commits execute different slices, so a regression anywhere in the
 * registry surfaces within N commits rather than never. A fixed slice would leave
 * the other N-1 permanently unexecuted, which is a strictly worse trade for the
 * same runtime.
 *
 * Seeded from HEAD so a given commit always runs the same slice: a red is
 * reproducible, and re-running the gate cannot shuffle a failure out of view.
 * KAOLA_SHARD_SEED overrides for tests. No repo / git failure => slice 1, never throws
 * (the gate must degrade to a stable subset, never to a crash).
 */
function autoIndex(total) {
  let seed = String(process.env.KAOLA_SHARD_SEED || '');
  if (!seed) {
    try {
      seed = require('child_process').execFileSync('git', ['rev-parse', 'HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_) { seed = ''; }
  }
  if (!seed) return 1;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h * 31) + seed.charCodeAt(i)) >>> 0;
  return (h % total) + 1;
}

function parseShard(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const at = args.indexOf('--shard');
  if (at === -1) return null;
  const raw = String(args[at + 1] === undefined ? '' : args[at + 1]).trim();
  const m = /^(\d+|auto)\s*\/\s*(\d+)$/.exec(raw);
  if (!m) throw new Error('--shard expects i/N or auto/N (1-based), got: ' + JSON.stringify(raw));
  const total = parseInt(m[2], 10);
  if (!(total >= 1)) throw new Error('--shard total must be >= 1, got: ' + raw);
  const index = m[1] === 'auto' ? autoIndex(total) : parseInt(m[1], 10);
  if (!(index >= 1) || index > total) throw new Error('--shard index must be in 1..' + total + ', got: ' + raw);
  return { index, total };
}

/**
 * Build the ownership selector for this process.
 * Unsharded => { sharded:false, index:1, total:1, owns:() => true }.
 */
function selector(argv) {
  const parsed = parseShard(argv);
  const index = parsed ? parsed.index : 1;
  const total = parsed ? parsed.total : 1;
  return {
    sharded: !!parsed,
    index,
    total,
    owns(ordinal) { return owns(ordinal, index, total); },
  };
}

/** Pure stride-partition predicate. Exported so it can be exhaustively unit-tested. */
function owns(ordinal, index, total) {
  if (!(total > 1)) return true;
  return (((ordinal % total) + total) % total) === (index - 1);
}

/** Render the coverage line a sharded suite prints exactly once, at the end of its run. */
function coverageLine(payload) {
  return MARKER + JSON.stringify(payload);
}

/**
 * Print the coverage line for a suite run. Called by every shard-aware suite right
 * before its own pass/fail summary, sharded or not.
 */
function reportCoverage(suite, sel, scenarios, ran, passed, failed, log) {
  const write = log || console.log;
  write(coverageLine({
    suite: String(suite),
    index: sel.index,
    total: sel.total,
    scenarios,
    ran,
    passed,
    failed,
  }));
}

/**
 * Extract every coverage line from a captured stdout/stderr blob.
 * @returns {Array<object>} parsed payloads, in emission order (malformed lines skipped).
 */
function parseCoverage(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const at = line.indexOf(MARKER);
    if (at === -1) continue;
    try { out.push(JSON.parse(line.slice(at + MARKER.length))); } catch (_) { /* not ours */ }
  }
  return out;
}

/**
 * Fail-closed audit of a fanned-out suite's shard set.
 * Returns { ok:true, scenarios, ran } or { ok:false, error, detail } — the caller
 * turns a non-ok verdict into a RED gate. Checks, in precedence order:
 *   1. every shard reported (a silent shard is a dropped slice)
 *   2. all shards agree on the registered scenario count
 *   3. the slices sum to exactly that count (no drop, no duplicate)
 */
function auditShardCoverage(suite, expectedTotal, reports) {
  const mine = (reports || []).filter(r => r && r.suite === suite);
  if (mine.length !== expectedTotal) {
    return {
      ok: false,
      error: 'shard_report_missing',
      detail: suite + ': expected ' + expectedTotal + ' shard coverage lines, got ' + mine.length,
    };
  }
  const seen = new Set(mine.map(r => r.index));
  if (seen.size !== expectedTotal) {
    return { ok: false, error: 'shard_report_duplicate', detail: suite + ': shard indexes were not 1..' + expectedTotal };
  }
  const counts = new Set(mine.map(r => r.scenarios));
  if (counts.size !== 1) {
    return {
      ok: false,
      error: 'shard_registry_drift',
      detail: suite + ': shards disagree on the registered scenario count: ' + JSON.stringify([...counts]),
    };
  }
  const scenarios = mine[0].scenarios;
  const ran = mine.reduce((s, r) => s + (r.ran || 0), 0);
  if (ran !== scenarios) {
    return {
      ok: false,
      error: 'shard_coverage_mismatch',
      detail: suite + ': shards ran ' + ran + ' scenarios but ' + scenarios + ' are registered',
    };
  }
  return { ok: true, scenarios, ran };
}

module.exports = {
  MARKER,
  parseShard,
  selector,
  owns,
  coverageLine,
  reportCoverage,
  parseCoverage,
  auditShardCoverage,
};
