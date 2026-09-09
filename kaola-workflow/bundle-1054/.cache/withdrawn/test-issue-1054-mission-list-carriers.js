#!/usr/bin/env node
'use strict';

// test-issue-1054-mission-list-carriers.js — acceptance oracle for issue #1054: the finalize
// Mission List coherence probe (and the sink-time ledger-regression guard) must read a mission
// list written as a markdown TABLE the same as one written in the line form, because every
// current run writes the table form (docs/decisions/0017-the-mission-list.md fixes the four
// FIELDS, item/status/dispatched/result — not the carrier syntax) while the probe historically
// understood only `- item:` / `  status:` / `  result:` lines. Measured at `0082b978`: the
// archived `kaola-workflow/archive/bundle-1053/mission-list.md` — 7 rows, all `done` with a
// result — read as `items: 0` in `finalization-summary.md`.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// PUBLIC PATH USED: `probeMissionListCoherence(authorityDir)`, exported from `kaola-workflow-claim.js`
// (and its three hand-ported copies) for direct unit coverage — the same function the finalize
// transaction calls with the same argument shape (a directory holding `mission-list.md`, per
// `adaptiveSchema.MISSION_LIST_FILE`). No mock of the reader: every fixture below is a real file
// on disk read by the real function, exactly as the finalize transaction invokes it. For
// `kaola-workflow-ledger-compare.js` the exported `countComplete` / `compareLedgers` pair is
// called directly — that module has been exported this way since #399.
//
// FIXTURE DISCIPLINE. `scripts/fixtures/issue-1054/bundle-1053-mission-list.md` is a byte-for-byte
// copy of the real archived record (`cmp` verified at authoring time), so group A pins the exact
// record the issue measured — never the main-root file at runtime, which a later archive could
// change or which would not exist in a fresh checkout.
//
// Usage
//   node scripts/test-issue-1054-mission-list-carriers.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures', 'issue-1054');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

// ---------------------------------------------------------------------------
// Load the four claim.js ports and the four ledger-compare copies. A port that does not export
// `probeMissionListCoherence` (true at baseline `662bcd33`, before #1054) fails loudly per-port
// instead of throwing the whole suite off the rails, so every other group still runs and reports.
// ---------------------------------------------------------------------------
const CLAIM_PORTS = Object.freeze([
  { name: 'canonical (scripts/kaola-workflow-claim.js)',
    file: path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js') },
  { name: 'codex (plugins/kaola-workflow/scripts/kaola-workflow-claim.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js') },
  { name: 'gitlab (plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js') },
  { name: 'gitea (plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js') },
]);
const LEDGER_PORTS = Object.freeze([
  { name: 'canonical (scripts/kaola-workflow-ledger-compare.js)',
    file: path.join(repoRoot, 'scripts', 'kaola-workflow-ledger-compare.js') },
  { name: 'codex (plugins/kaola-workflow/scripts/kaola-workflow-ledger-compare.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-ledger-compare.js') },
  { name: 'gitlab (plugins/kaola-workflow-gitlab/scripts/kaola-workflow-ledger-compare.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-workflow-ledger-compare.js') },
  { name: 'gitea (plugins/kaola-workflow-gitea/scripts/kaola-workflow-ledger-compare.js)',
    file: path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-workflow-ledger-compare.js') },
]);

function loadClaimPort(port) {
  let mod;
  try { mod = require(port.file); }
  catch (e) {
    return { probe: null, error: 'require() threw: ' + e.message };
  }
  if (typeof mod.probeMissionListCoherence !== 'function') {
    return { probe: null, error: 'does not export `probeMissionListCoherence` (found: ' + typeof mod.probeMissionListCoherence + ')' };
  }
  return { probe: mod.probeMissionListCoherence, error: null };
}
function loadLedgerPort(port) {
  let mod;
  try { mod = require(port.file); }
  catch (e) {
    return { countComplete: null, compareLedgers: null, error: 'require() threw: ' + e.message };
  }
  if (typeof mod.countComplete !== 'function' || typeof mod.compareLedgers !== 'function') {
    return { countComplete: null, compareLedgers: null, error: 'does not export countComplete/compareLedgers as functions' };
  }
  return { countComplete: mod.countComplete, compareLedgers: mod.compareLedgers, error: null };
}

// A fresh temp dir holding one `mission-list.md`, exactly the shape `probeMissionListCoherence`
// reads (`authorityDir` = a directory; the file name is the adaptive-schema constant, `mission-list.md`
// on every port measured directly from `scripts/kaola-workflow-adaptive-schema.js`).
function withMissionListDir(text, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1054-mlist-'));
  try {
    fs.writeFileSync(path.join(dir, 'mission-list.md'), text);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Runs `probe(dir)` on every claim.js port with the SAME fixture text and returns
// { name -> result-or-error }. A port whose export is missing/broken reports its own reason and
// is excluded from the cross-port parity comparison (parity over zero comparable ports is not a
// pass — callers must check `.length` of the comparable set).
function probeAcrossPorts(text) {
  const out = {};
  for (const port of CLAIM_PORTS) {
    const { probe, error } = loadClaimPort(port);
    if (!probe) { out[port.name] = { error }; continue; }
    try {
      out[port.name] = { result: withMissionListDir(text, (dir) => probe(dir)) };
    } catch (e) {
      out[port.name] = { error: 'threw: ' + e.message };
    }
  }
  return out;
}

function lineNumberOf(text, needle) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return -1;
}

// ===========================================================================
// GROUP A — the exact measured regression: the real archived bundle-1053 table, byte-copied.
// ===========================================================================
(function groupA_realArchivedTable() {
  console.log('A: probeMissionListCoherence reads the real archived bundle-1053 table (7 rows, all done)');
  const fixturePath = path.join(fixturesDir, 'bundle-1053-mission-list.md');
  const text = fs.readFileSync(fixturePath, 'utf8');
  assert(/\| done \|/.test(text) && (text.match(/\| done \|/g) || []).length === 7,
    'A: fixture premise — the byte-copied bundle-1053 record really does carry 7 `| done |` rows; '
    + 'got ' + ((text.match(/\| done \|/g) || []).length));

  const { probe, error } = loadClaimPort(CLAIM_PORTS[0]);
  assert(probe !== null,
    'A: scripts/kaola-workflow-claim.js exports `probeMissionListCoherence` for direct unit '
    + 'coverage of the dual-carrier read; ' + (error || ''));
  if (!probe) return;

  const result = withMissionListDir(text, (dir) => probe(dir));
  assert(result !== null, 'A: the probe returns a reading for a directory that has a mission-list.md');
  assert(result && result.items === 7,
    'A: the archived bundle-1053 table has 7 rows and the probe must report `items: 7` — the '
    + 'exact regression #1054 measured (finalization-summary.md line 97 reads `items: 0` at '
    + '`0082b978`); got ' + JSON.stringify(result));
  assert(result && Array.isArray(result.outcome_while_not_done) && result.outcome_while_not_done.length === 0,
    'A: every row in the bundle-1053 fixture is `done` with a result, so nothing contradicts '
    + 'itself; got ' + JSON.stringify(result && result.outcome_while_not_done));
})();

// ===========================================================================
// GROUP B — line-form semantics UNCHANGED: last `status:` wins, in both directions.
// ===========================================================================
(function groupB_lineFormLastStatusWins() {
  console.log('B: line-form reading is unchanged — the LAST status: line wins, either direction');
  const { probe, error } = loadClaimPort(CLAIM_PORTS[0]);
  assert(probe !== null, 'B: probe export present; ' + (error || ''));
  if (!probe) return;

  // B1: a stale status corrected UNDER it, ending on `done` — not flagged, because the outcome
  // and the LAST status now agree.
  const b1 = [
    '# goal: line-form last-status-wins, corrected to done',
    '',
    '- item: line-form item whose stale status is corrected underneath',
    '  status: in-flight',
    '  status: done',
    '  result: fixed underneath, matching the archive\'s own convention',
    ''
  ].join('\n');
  const r1 = withMissionListDir(b1, (dir) => probe(dir));
  assert(r1 && r1.items === 1, 'B1: one item in the fixture; got ' + JSON.stringify(r1));
  assert(r1 && r1.outcome_while_not_done.length === 0,
    'B1: the LAST status line reads `done`, and the outcome agrees, so nothing is flagged even '
    + 'though a stale `in-flight` line sits above it (first-line reading would agree here too — '
    + 'see B2 for the direction that actually distinguishes first-wins from last-wins); got '
    + JSON.stringify(r1));

  // B2: the distinguishing case — a status corrected FROM done back to in-flight (a reopened
  // item), underneath the stale `done` line. A first-status reader would see `done` and miss the
  // contradiction; the archive's own convention (11 duplicate-status items, all corrected UNDER
  // the stale line) requires the LAST line to win.
  const itemLabel = 'line-form item reopened after its outcome landed';
  const b2 = [
    '# goal: line-form last-status-wins, corrected to in-flight',
    '',
    '- item: ' + itemLabel,
    '  status: done',
    '  status: in-flight',
    '  result: reopened — a regression was found after the result landed',
    ''
  ].join('\n');
  const r2 = withMissionListDir(b2, (dir) => probe(dir));
  const expectedLine = lineNumberOf(b2, '- item: ' + itemLabel);
  assert(r2 && r2.items === 1, 'B2: one item in the fixture; got ' + JSON.stringify(r2));
  assert(r2 && r2.outcome_while_not_done.length === 1 && r2.outcome_while_not_done[0] === expectedLine,
    'B2: the LAST status line reads `in-flight`, not `done`, while the outcome (result) is '
    + 'non-empty — a first-status reader would read `done` here and miss the contradiction; a '
    + 'last-wins reader must flag item line ' + expectedLine + '; got ' + JSON.stringify(r2));
})();

// ===========================================================================
// GROUP C — table-form basics: header/separator excluded, empty vs non-empty result cell,
// blank lines and prose ignored, H1 goal not an item.
// ===========================================================================
(function groupC_tableFormBasics() {
  console.log('C: table-form basics — header/separator not items, empty result not flagged, prose ignored');
  const { probe, error } = loadClaimPort(CLAIM_PORTS[0]);
  assert(probe !== null, 'C: probe export present; ' + (error || ''));
  if (!probe) return;

  const flaggedItem = 'in-flight row whose outcome already landed, a contradiction';
  const text = [
    '# Mission — Issue #9954: table-form coherence basics',
    '',
    '| item | status | dispatched | result |',
    '|---|---|---|---|',
    '| todo row with nothing done yet | todo |  |  |',
    '| ' + flaggedItem + ' | in-flight | self → note | landed already, before the status caught up |',
    '| finished row | done | self | done cleanly |',
    '',
    'This paragraph is ordinary prose between sections. It happens to mention that an earlier row\'s ' +
      'status: done ought to have been true a day sooner, and it even quotes result: PASS as an example ' +
      'of what NOT to write inline, but none of this prose is a field.',
    '',
    'Constraints: not a mission item; this is trailing prose after the table.',
    ''
  ].join('\n');

  const result = withMissionListDir(text, (dir) => probe(dir));
  assert(result !== null, 'C: fixture premise — a directory with mission-list.md returns a reading');
  assert(result && result.items === 3,
    'C: three data rows in the table; the header row (`| item | status | dispatched | result |`), '
    + 'the `|---|---|---|---|` separator row, the H1 goal line, the blank lines, and the two prose '
    + 'paragraphs (one of which quotes `status: done` and `result: PASS` as commentary) must all be '
    + 'excluded; got ' + JSON.stringify(result));

  const flaggedLine = lineNumberOf(text, flaggedItem);
  assert(result && result.outcome_while_not_done.length === 1 && result.outcome_while_not_done[0] === flaggedLine,
    'C: only the in-flight row with a non-empty result cell is flagged (line ' + flaggedLine + '); '
    + 'the todo row has an EMPTY result cell (two blank-padded cells, `|  |  |`) and must NOT be '
    + 'flagged even though its status is not done — an empty cell is the absence of an outcome, not '
    + 'one; got ' + JSON.stringify(result));
})();

// ===========================================================================
// GROUP D — real Markdown cell-boundary edge cases: escaped pipes, backtick pipe spans,
// colon-bearing prose inside a cell, a result cell quoting another row's vocabulary, whitespace,
// and a differently-cased/spaced header.
// ===========================================================================
(function groupD_cellBoundaries() {
  console.log('D: real cell boundaries — escaped pipes, backtick spans, quoted prose, header casing');
  const { probe, error } = loadClaimPort(CLAIM_PORTS[0]);
  assert(probe !== null, 'D: probe export present; ' + (error || ''));
  if (!probe) return;

  // D1: an ESCAPED pipe inside a cell (the exact pattern the Next route's own field table uses —
  // `templates/routing/next.skeleton.md`: "`todo` \\| `in-flight` \\| `done`"). The item cell below
  // quotes that same status-enum vocabulary with two escaped pipes; a splitter that does not
  // respect `\|` as literal content would misalign the status/dispatched/result columns.
  const d1Item = 'render `status` values `todo` \\| `in-flight` \\| `done` for the schema table';
  // D2: a pipe inside BACKTICKS, unescaped — a cell quoting the separator syntax itself
  // (`` `|---|` ``), which is the case that broke a hand-rolled row splitter that only knew about
  // backslash escapes.
  const d2Item = 'the separator syntax `|---|` needs a written example in the docs';
  // D3: multi-sentence prose with an embedded "result: PASS"-shaped colon phrase, inside a cell —
  // must not be read as a nested field.
  const d3Item = 'write a paragraph that says "earlier attempts logged result: PASS even when nothing had shipped"';
  // D4: a row whose STATUS cell is genuinely non-done, but whose RESULT cell quotes another row's
  // "status: done" as prose. Classification must come from the status COLUMN, never a substring
  // scan of the row text.
  const d4Item = 'audit whether a result cell quoting status: done as prose is ever misread as this row\'s own status';
  // D5: leading/trailing whitespace inside cells.
  const d5Item = 'whitespace-padded item';

  const text = [
    '# Mission — Issue #9955: cell-boundary edge cases',
    '',
    '| item | status | dispatched | result |',
    '|---|---|---|---|',
    '| ' + d1Item + ' | in-flight | self → schema doc | landed already in the schema doc, contradicting the in-flight status |',
    '| ' + d2Item + ' | in-flight | self → docs | drafted a paragraph quoting `|---|` verbatim, but the doc edit has not landed |',
    '| ' + d3Item + ' | done | self | corrected the note; nothing here is itself a field, just prose quoting the vocabulary |',
    '| ' + d4Item + ' | in-flight | self → audit | the sibling row from last quarter said status: done in its own result field, but that quote does not change THIS row\'s status |',
    '|   ' + d5Item + '   |   done   |  self  |  padded result  |',
    ''
  ].join('\n');

  const result = withMissionListDir(text, (dir) => probe(dir));
  assert(result !== null, 'D: fixture premise — a directory with mission-list.md returns a reading');
  assert(result && result.items === 5,
    'D: five data rows, none of them corrupted into extra items by the escaped pipes, the '
    + 'backtick-quoted separator syntax, or the embedded colons; got ' + JSON.stringify(result));

  const d1Line = lineNumberOf(text, d1Item);
  const d2Line = lineNumberOf(text, d2Item);
  const d3Line = lineNumberOf(text, d3Item);
  const d4Line = lineNumberOf(text, d4Item);
  const flagged = (result && result.outcome_while_not_done) || [];

  assert(flagged.includes(d1Line),
    'D1: the item cell contains two ESCAPED pipes (`\\|`) quoting the status-enum vocabulary; a '
    + 'splitter that treats `\\|` as a delimiter instead of literal content would misalign the '
    + 'status/result columns and could miss this row\'s real status (`in-flight`) and its non-empty '
    + 'result — expected line ' + d1Line + ' flagged; got ' + JSON.stringify(result));
  assert(flagged.includes(d2Line),
    'D2: the result cell quotes the separator syntax `` `|---|` `` inside backticks — an unescaped '
    + 'pipe inside a code span is content, not a column delimiter. This row\'s real status is '
    + '`in-flight` with a non-empty result — expected line ' + d2Line + ' flagged; got '
    + JSON.stringify(result));
  assert(!flagged.includes(d3Line),
    'D3: this row\'s status is `done`, so it must NOT be flagged even though its own cells contain '
    + 'colon-bearing prose ("result: PASS") that could be mis-scanned as a nested field; got '
    + JSON.stringify(result));
  assert(flagged.includes(d4Line),
    'D4: this row\'s STATUS COLUMN reads `in-flight` (not done) and its result cell is non-empty; '
    + 'the result cell also quotes another row\'s "status: done" as prose, and a substring-scanning '
    + 'implementation could wrongly read that quoted text as THIS row\'s status and skip flagging it '
    + '— classification must come from column position, not text search; expected line ' + d4Line
    + ' flagged; got ' + JSON.stringify(result));

  const d5Line = lineNumberOf(text, d5Item);
  assert(!flagged.includes(d5Line),
    'D5: a row with leading/trailing whitespace inside every cell (`|   done   |`) must still '
    + 'classify as `status: done` after trimming, and so must not be flagged; got '
    + JSON.stringify(result));

  // D6: a differently-cased, differently-spaced header — `| Item | Status | Dispatched | Result |`
  // — must still be recognized as a header (excluded from the item count) and its data row must
  // still be read. ADR 0017 fixes the four FIELD NAMES, not a byte-exact header spelling.
  const d6Text = [
    '# Mission — Issue #9956: differently-cased header',
    '',
    '| Item | Status | Dispatched | Result |',
    '|---|---|---|---|',
    '| a row under a differently-cased header | todo |  |  |',
    ''
  ].join('\n');
  const d6 = withMissionListDir(d6Text, (dir) => probe(dir));
  assert(d6 && d6.items === 1,
    'D6: `| Item | Status | Dispatched | Result |` (title-cased, same spacing as the plain form) '
    + 'is still a header row, excluded from the count, and case-insensitively so — the one data '
    + 'row under it must be read; got ' + JSON.stringify(d6));
})();

// ===========================================================================
// GROUP E — countComplete / compareLedgers over table-form records.
// ===========================================================================
(function groupE_ledgerCompareTableForm() {
  console.log('E: countComplete/compareLedgers read table-form done rows, and mix carriers by count');
  const port = LEDGER_PORTS[0];
  const { countComplete, compareLedgers, error } = loadLedgerPort(port);
  assert(countComplete !== null, 'E: ' + port.name + ' exports countComplete/compareLedgers; ' + (error || ''));
  if (!countComplete) return;

  const table7Done = fs.readFileSync(path.join(fixturesDir, 'bundle-1053-mission-list.md'), 'utf8');
  assert(countComplete(table7Done) === 7,
    'E1: countComplete must count the 7 `| done |` rows of the real archived bundle-1053 table; '
    + 'got ' + countComplete(table7Done));

  // Line-form counting is unchanged (regression already pinned in scripts/test-ledger-compare.js;
  // repeated here as a same-suite sanity anchor for the cross-port parity check below).
  const lineForm2Done = [
    '# fixture goal',
    '- item: a', '  status: done', '  result: a.md',
    '- item: b', '  status: in-flight',
    '- item: c', '  status: done', '  result: c.md',
    ''
  ].join('\n');
  assert(countComplete(lineForm2Done) === 2,
    'E2: line-form `status: done` counting must still work; got ' + countComplete(lineForm2Done));

  // A table with 3 done rows out of, say, 5 — built independently of the bundle-1053 fixture so
  // group E does not depend on group A's byte-copy for its own premise.
  function table(doneCount, totalCount) {
    const lines = ['# fixture goal', '', '| item | status | dispatched | result |', '|---|---|---|---|'];
    for (let i = 0; i < totalCount; i++) {
      const done = i < doneCount;
      lines.push('| mission ' + (i + 1) + ' | ' + (done ? 'done' : 'todo') + ' | ' + (done ? 'self' : '') + ' | ' + (done ? ('out/' + (i + 1) + '.md') : '') + ' |');
    }
    return lines.join('\n') + '\n';
  }
  const table3Done = table(3, 5);
  assert(countComplete(table3Done) === 3,
    'E3: fixture premise — a 5-row table with 3 done rows counts 3; got ' + countComplete(table3Done));

  // UNSAFE: dest (worktree, about to be overwritten) already records MORE done work than source
  // (main, about to be copied out) — copying source over dest would regress 4 finished items back
  // to open. This is the guard's documented contract (`destComplete > sourceComplete`), read
  // against table-form text instead of line-form text.
  const unsafe = compareLedgers(table3Done, table7Done);
  assert(unsafe.safe === false && unsafe.reason === 'would_regress_complete_ledger'
    && unsafe.sourceComplete === 3 && unsafe.destComplete === 7,
    'E4: compareLedgers(source=3-done table, dest=7-done table) must be UNSAFE — the dest already '
    + 'records strictly more done work, table-form counted; got ' + JSON.stringify(unsafe));

  // SAFE: an idempotent re-run of the mirror over the SAME table (equal counts pass, STRICT >).
  const safeSame = compareLedgers(table7Done, table7Done);
  assert(safeSame.safe === true && safeSame.sourceComplete === 7 && safeSame.destComplete === 7,
    'E5: compareLedgers(table, the SAME table) must be SAFE — equal counts are not a regression; '
    + 'got ' + JSON.stringify(safeSame));

  // Mixed carriers: source is line-form, dest is table-form. The guard compares COUNTS, not
  // carriers — no special-casing needed once both sides count correctly.
  const mixedUnsafe = compareLedgers(lineForm2Done, table3Done); // 2 vs 3 -> unsafe
  assert(mixedUnsafe.safe === false && mixedUnsafe.sourceComplete === 2 && mixedUnsafe.destComplete === 3,
    'E6: mixing a line-form SOURCE (2 done) with a table-form DEST (3 done) must compare the two '
    + 'counts and refuse, exactly as a same-carrier 2-vs-3 comparison would; got ' + JSON.stringify(mixedUnsafe));
  const lineForm5Done = [
    '# fixture goal',
    '- item: a', '  status: done', '  result: a.md',
    '- item: b', '  status: done', '  result: b.md',
    '- item: c', '  status: done', '  result: c.md',
    '- item: d', '  status: done', '  result: d.md',
    '- item: e', '  status: done', '  result: e.md',
    ''
  ].join('\n');
  const mixedSafe = compareLedgers(lineForm5Done, table3Done); // 5 vs 3 -> safe
  assert(mixedSafe.safe === true && mixedSafe.sourceComplete === 5 && mixedSafe.destComplete === 3,
    'E7: mixing a line-form SOURCE (5 done) with a table-form DEST (3 done) must be SAFE, by count; '
    + 'got ' + JSON.stringify(mixedSafe));
})();

// ===========================================================================
// GROUP F — cross-tree parity: all four claim.js ports and all four ledger-compare copies must
// agree on the same table-form fixture.
// ===========================================================================
(function groupF_crossTreeParity() {
  console.log('F: cross-tree parity — 4 claim.js ports and 4 ledger-compare copies agree on table form');
  const fixture = fs.readFileSync(path.join(fixturesDir, 'bundle-1053-mission-list.md'), 'utf8');

  const probeResults = probeAcrossPorts(fixture);
  const comparable = Object.entries(probeResults).filter(([, v]) => !v.error);
  assert(comparable.length === CLAIM_PORTS.length,
    'F1: all four claim.js ports export a callable `probeMissionListCoherence` — a port missing '
    + 'the export is not "in parity", it is absent from the comparison entirely; got '
    + JSON.stringify(probeResults, (k, v) => v, 2));
  if (comparable.length > 0) {
    const [firstName, firstVal] = comparable[0];
    const firstJson = JSON.stringify(firstVal.result);
    for (const [name, val] of comparable.slice(1)) {
      assert(JSON.stringify(val.result) === firstJson,
        'F2: ' + name + ' must read the bundle-1053 table the same as ' + firstName + '; '
        + firstName + '=' + firstJson + ' ' + name + '=' + JSON.stringify(val.result));
    }
  }

  const ledgerResults = {};
  for (const port of LEDGER_PORTS) {
    const { countComplete, error } = loadLedgerPort(port);
    ledgerResults[port.name] = countComplete ? { count: countComplete(fixture) } : { error };
  }
  const ledgerComparable = Object.entries(ledgerResults).filter(([, v]) => !v.error);
  assert(ledgerComparable.length === LEDGER_PORTS.length,
    'F3: all four ledger-compare copies export a callable `countComplete`; got '
    + JSON.stringify(ledgerResults));
  for (const [name, val] of ledgerComparable) {
    assert(val.count === 7,
      'F4: ' + name + ' must count 7 done rows for the bundle-1053 table, matching every other '
      + 'copy; got ' + val.count);
  }
})();

// ===========================================================================
// NEGATIVE PINS — no new schema, no new CLI flag, no format-error/refusal path, and
// adaptive-schema is unchanged by this issue.
// ===========================================================================
(function negativePins() {
  console.log('N: negative pins — no new field/flag/refusal path, adaptive-schema unchanged');

  // A list the reader cannot parse still yields a COUNT, never a throw — a malformed or empty
  // table row must not crash the probe or the ledger counter.
  const { probe, error } = loadClaimPort(CLAIM_PORTS[0]);
  assert(probe !== null, 'N: probe export present; ' + (error || ''));
  if (probe) {
    const garbled = [
      '# goal',
      '| item | status |', // too few columns to be a valid 4-field row
      '| half a row without a closing pipe',
      '```',
      '| not | a | table | row | either | because | of | extra | columns |',
      ''
    ].join('\n');
    let threw = null;
    let result = null;
    try { result = withMissionListDir(garbled, (dir) => probe(dir)); }
    catch (e) { threw = e; }
    assert(threw === null,
      'N1: a malformed/garbled mission-list.md must still yield a count, never throw; threw '
      + (threw && threw.message));
    assert(result && typeof result.items === 'number',
      'N1: ...and the result is still the same shape (`items`, `outcome_while_not_done`); got '
      + JSON.stringify(result));
  }

  const { countComplete } = loadLedgerPort(LEDGER_PORTS[0]);
  if (countComplete) {
    let threw = null;
    try { countComplete('| item | status |\n| broken\n'); }
    catch (e) { threw = e; }
    assert(threw === null, 'N2: countComplete must not throw on a malformed table; threw ' + (threw && threw.message));
  }

  // No new CLI flag on the ledger-compare script's usage text.
  const cliText = fs.readFileSync(path.join(repoRoot, 'scripts', 'kaola-workflow-ledger-compare.js'), 'utf8');
  assert(!/--\w*(carrier|format|table)\w*/i.test(cliText.split('Usage:')[1] || ''),
    'N3: no new CLI flag naming "carrier", "format", or "table" was introduced on '
    + 'kaola-workflow-ledger-compare.js\'s usage text — this issue is a READER fix, not a schema change');

  // adaptive-schema.js is unchanged: MISSION_LIST_FILE stays the single filename constant, and no
  // new mission-list field name is declared there.
  const schemaText = fs.readFileSync(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'), 'utf8');
  assert(/MISSION_LIST_FILE\s*=\s*'mission-list\.md'/.test(schemaText),
    'N4: adaptive-schema.js keeps a single MISSION_LIST_FILE = \'mission-list.md\' constant — '
    + 'this issue does not introduce a second file or a new field/phase/approval-gate schema');
})();

// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('test-issue-1054-mission-list-carriers.js FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('test-issue-1054-mission-list-carriers.js passed (' + passed + ' assertions)');
}
