#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-telemetry-report.js — the INTERRUPTION-COST RANKING over the outcome recorder.
//
// The recorder writes one line per CLI emission; this is the half that READS them. A recorder
// nobody reads measures nothing, and a subtraction campaign that ranks by anecdote subtracts the
// wrong thing — so this projects the recorded population into a per-`reason` ranking keyed on
// MEASURED interruption time.
//
// AN ANSWER VERB, AND AN INSTRUMENT.
//   * exit 0 always, `result: 'ok'` always. No refusal token, no gate, no halt: a reporting layer
//     that could refuse would be one more mid-run interrupt in a campaign whose whole purpose is
//     to remove them.
//   * IT WRITES NOTHING. No directory is created, no sidecar rewritten, and it records no outcome
//     of its own — an instrument that appended to the log it reads would, from its second run on,
//     be measuring itself.
//   * It PROJECTS what the recorder wrote and re-derives nothing. `route` is read off the record
//     rather than re-resolved through the registry, so the report and the record can never
//     disagree about a refusal's classification.
//
// USAGE
//   node kaola-workflow-telemetry-report.js --project <name> [--json]
//
// INPUTS — kaola-workflow/{project}/.cache/
//   outcome-log.jsonl    the ranked population.
//   node-timings.jsonl   re-dispatch evidence (`opened` events).
//   dispatch-log.jsonl   re-dispatch evidence (agent spawns).
// All three writers are error-swallowing best-effort sidecars, so each file is INDEPENDENTLY
// optional and an absent one is the ordinary case, never an error.
//
// OUTPUT
//   { result, v, project, totals, ranking }
//   totals  = { events, malformed_lines, refusals, unattributed_refusals }
//   row     = { reason, count, redispatch_count, median_triage_ms, total_triage_ms,
//               measured_count, routeless_count }
//
// THE PROPERTIES THAT MAKE THE NUMBER HONEST (each is pinned as a scenario in
// scripts/test-outcome-recorder.js PART F, not merely stated here):
//
//   POPULATION.  One row per DISTINCT non-null `reason` on a `result:'refuse'` record. `halt` is
//     deliberately NOT ranked — the consent valve is a legitimate interrupt by design, and ranking
//     it would put the one thing that must never be subtracted at the top of a subtraction list.
//     `warn` / `ok` / `other` are not ranked either, but they ARE read: the natural resume after a
//     refusal is an `ok`, and that is what closes the triage window. A reason that FIRED but never
//     caused a re-dispatch gets a row reading 0; a reason that never fired gets NO row. Those mean
//     opposite things for subtraction, so zero-filling every known token would be a defect.
//
//   TRIAGE WINDOW.  For a refusal at t0 on `(script, op, node)`, the window ends at the NEXT
//     outcome-log record carrying the same triple in APPEND order (the recorder appends in emit
//     order). A window is MEASURED only when both instants parse and the delta is >= 0. A missing
//     successor, an unparseable instant and a negative delta are all UNMEASURED and report
//     `median_triage_ms: null` — never a fabricated 0, because 0 is a real observation (a refusal
//     cleared inside the same millisecond) and "we could not see it" must not read as "it was free".
//
//   RE-DISPATCH.  A dispatch-log entry or a node-timings `opened` event whose `ts` falls in
//     (t0, t_end] — strictly after the refusal (a spawn at the refusal instant cannot have been
//     caused by it) and at-or-before the resume (a spawn at the resume instant IS the resume). At
//     most ONE per refusal however many signals fire: the metric is "this refusal cost real work",
//     not "how many processes started". An unmeasured refusal has no window and contributes 0 —
//     running an open window to end-of-log would invent re-dispatches the run never made.
//
//   ORDER — a TOTAL order, because an exact-JSON contract is flaky by construction without one:
//     1. `total_triage_ms` DESC — COST, not frequency. Aggregate measured stop-time is the
//        interruption cost the next subtraction wave is ranked by, so a cheap refusal firing three
//        times sorts BELOW one expensive refusal.
//     2. `reason` ASC — lexicographic, and `reason` is unique per row, so the order is total.
//        Deliberately only two tiers: when two reasons cost the same measured time there is no
//        further evidence, and weighting the remaining columns would be a number this instrument
//        cannot support. `routeless_count` in particular is REPORTED, never ranked — ranking
//        exit-less refusals first would put cheap ones above expensive ones.
//
//   REPORT-ALL.  One malformed line is one `malformed_lines` tick. It never takes the report down
//     and never breaks window pairing across it. A line is well-formed iff it parses as JSON to a
//     plain object; a blank line is neither well-formed nor damage (every writer appends '\n', so a
//     trailing newline must not read as corruption).
//
//   EMPTY IS NOT A SPECIAL CASE.  An empty log, a log of blank lines and NO LOG AT ALL produce the
//     same well-formed empty report, byte for byte. And an empty RANKING is not an empty LOG: a run
//     with successes and no refusals still reports its denominator.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  OUTCOME_LOG_NAME,
  NODE_TIMINGS_LOG_NAME,
  DISPATCH_LOG_NAME,
} = require('./kaola-workflow-adaptive-schema');

// The REPORT schema version, independent of the record's own `v`: the two evolve separately (a new
// derived column changes this and not the recorder).
const REPORT_SCHEMA_VERSION = 1;

const USAGE =
  'usage: kaola-workflow-telemetry-report.js --project <name> [--json]\n' +
  '  Ranks the recorded refusal population of one project by MEASURED interruption cost.\n' +
  '  Reads kaola-workflow/<project>/.cache/{' + OUTCOME_LOG_NAME + ',' + NODE_TIMINGS_LOG_NAME
    + ',' + DISPATCH_LOG_NAME + '}.\n' +
  '  An ANSWER verb: exit 0 always, writes nothing, never refuses.\n';

// Resolve the USER-REPO root so a `--project` name maps to the same folder every other lifecycle
// script resolves. Mirrors the sibling aggregators' helper exactly (git top-level, cwd fallback);
// `git rev-parse` is a pure read, so the write-nothing property is untouched.
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// An absent sidecar is the ORDINARY case (all three writers are best-effort), so absence and an
// unreadable path both read as an empty file rather than as an error.
function readOr(fpath, fallback) {
  try { return fs.readFileSync(fpath, 'utf8'); } catch (_) { return fallback; }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// parseJsonl — REPORT-ALL. Returns the well-formed plain-object rows plus a count of damaged lines.
// A blank line is skipped without counting: every writer terminates with '\n', so the trailing
// empty segment is an artifact of splitting, not corruption.
function parseJsonl(raw) {
  const rows = [];
  let malformed = 0;
  for (const line of String(raw || '').split('\n')) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch (_) { malformed++; continue; }
    if (!isPlainObject(value)) { malformed++; continue; }
    rows.push(value);
  }
  return { rows, malformed };
}

// The instant of a record, in ms, or null when it does not parse. `null` propagates all the way to
// an UNMEASURED window — it is never coerced to 0.
function instant(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// The identity a triage window is paired on. `script`/`op`/`node` are exactly the attribution the
// recorder writes; a null node (a project-scoped verb) pairs with other null nodes.
function tripleKey(record) {
  return JSON.stringify([
    typeof record.script === 'string' ? record.script : null,
    typeof record.op === 'string' ? record.op : null,
    typeof record.node === 'string' ? record.node : null,
  ]);
}

function nonEmptyString(value) {
  return (typeof value === 'string' && value.trim()) ? value : null;
}

// median — even n is the MEAN of the two middles, rounded. `null` for an empty sample, which is the
// honesty pin: an unseen cost reported as 0 would rank a wedge at the bottom of a subtraction list.
function median(samples) {
  if (!samples.length) return null;
  const sorted = samples.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * buildReport — PURE. Raw sidecar text in, one canonical report object out. No clock, no path and
 * no iteration-order value reaches the output, so two runs over the same bytes are byte-identical.
 *
 * @param {{project: string, outcome: string, timings: string, dispatch: string}} input
 * @returns {object} the report envelope, keys in contract order
 */
function buildReport(input) {
  const project = nonEmptyString(input && input.project);
  const parsed = parseJsonl(input && input.outcome);
  const records = parsed.rows;

  // Every re-dispatch signal instant, from both independently-optional sources. A node-timings row
  // counts only when it is an `opened` event — a `closed` is the END of work, never the start of
  // new work. Deliberately NOT filtered by node id: the question is whether the run spent a
  // dispatch inside the stop-to-resume interval, and recovery work frequently lands on another node.
  const signals = [];
  for (const row of parseJsonl(input && input.dispatch).rows) {
    const at = instant(row.ts);
    if (at !== null) signals.push(at);
  }
  for (const row of parseJsonl(input && input.timings).rows) {
    if (row.event !== 'opened') continue;
    const at = instant(row.ts);
    if (at !== null) signals.push(at);
  }

  // Successor index: for each record, the NEXT record carrying the same (script, op, node). Built
  // by ONE backwards pass so the pairing cost stays linear in the log — a whole-run log is the
  // ordinary input, not a fixture.
  const nextSameTriple = new Array(records.length).fill(-1);
  const lastSeen = new Map();
  for (let i = records.length - 1; i >= 0; i--) {
    const key = tripleKey(records[i]);
    nextSameTriple[i] = lastSeen.has(key) ? lastSeen.get(key) : -1;
    lastSeen.set(key, i);
  }

  let refusals = 0;
  let unattributed = 0;
  const byReason = new Map();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.result !== 'refuse') continue;
    refusals++;

    const reason = nonEmptyString(record.reason);
    if (!reason) { unattributed++; continue; }

    let row = byReason.get(reason);
    if (!row) {
      row = { count: 0, redispatch: 0, windows: [], routeless: 0 };
      byReason.set(reason, row);
    }
    row.count++;
    // `route` is READ, never re-derived: a refusal whose record carries no typed exit is the ADR
    // route-contract gap this column exists to size.
    if (record.route == null) row.routeless++;

    const opened = instant(record.ts);
    const successorIdx = nextSameTriple[i];
    const closed = successorIdx >= 0 ? instant(records[successorIdx].ts) : null;
    if (opened === null || closed === null) continue;      // unmeasurable: no fabricated window
    const delta = closed - opened;
    if (delta < 0) continue;                                // a skewed clock is not a measurement
    row.windows.push(delta);
    // (t0, t_end] — strictly after the refusal, at-or-before the resume. At most ONE per refusal.
    if (signals.some(at => at > opened && at <= closed)) row.redispatch++;
  }

  const ranking = [...byReason.entries()].map(([reason, row]) => {
    const total = row.windows.reduce((sum, ms) => sum + ms, 0);
    return {
      reason: reason,
      count: row.count,
      redispatch_count: row.redispatch,
      median_triage_ms: median(row.windows),
      total_triage_ms: total,
      measured_count: row.windows.length,
      routeless_count: row.routeless,
    };
  }).sort((a, b) => (b.total_triage_ms - a.total_triage_ms)
    || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));

  return {
    result: 'ok',
    v: REPORT_SCHEMA_VERSION,
    project: project,
    totals: {
      events: records.length,
      malformed_lines: parsed.malformed,
      refusals: refusals,
      unattributed_refusals: unattributed,
    },
    ranking: ranking,
  };
}

// reportProject — read the three sidecars for one project and project them. Read-only end to end.
function reportProject(repoRoot, project) {
  const cacheDir = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  return buildReport({
    project,
    outcome: readOr(path.join(cacheDir, OUTCOME_LOG_NAME), ''),
    timings: readOr(path.join(cacheDir, NODE_TIMINGS_LOG_NAME), ''),
    dispatch: readOr(path.join(cacheDir, DISPATCH_LOG_NAME), ''),
  });
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper; all FS and process I/O lives here. There is no refusal branch and no
// non-zero exit anywhere below: an under-specified invocation prints the usage banner, which is an
// answer too.
// ---------------------------------------------------------------------------
function main(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
  const projectIdx = args.indexOf('--project');
  const project = (projectIdx >= 0 && projectIdx + 1 < args.length)
    ? nonEmptyString(args[projectIdx + 1]) : null;
  if (!project) {
    process.stdout.write(USAGE);
    return;
  }
  process.stdout.write(JSON.stringify(reportProject(getRoot(), project)) + '\n');
}

if (require.main === module) {
  main(process.argv.slice(2));
}

// buildReport is exported as the PURE core so the ranking contract can be driven over raw text
// without a repository fixture; reportProject is the read half.
module.exports = { buildReport, reportProject, REPORT_SCHEMA_VERSION };
