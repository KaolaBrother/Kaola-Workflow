#!/usr/bin/env node
'use strict';

// Regression test for issue #197 (Fast-path calibration audit script).
// Exercises all exported functions from kaola-workflow-fast-audit.js with
// synthetic fixtures — never reads the real archive.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  splitSections,
  parseStatus,
  parseEscalationReason,
  parseFileCount,
  parseReviewMode,
  parseFastSummary,
  collectFastSummaryFiles,
  audit,
  formatTable,
  formatJson,
} = require(path.join(__dirname, 'kaola-workflow-fast-audit.js'));

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    process.stderr.write('FAIL: ' + msg + '\n');
    process.exit(1);
  }
  passed++;
}

// ---------------------------------------------------------------------------
// Fixture bodies
// ---------------------------------------------------------------------------

// F1: PASSED, two backtick file paths in Scope, Required Agent Compliance table
// with code-reviewer invoked, Escalation N/A.
const F1 = `# Fast Summary: issue-1

## Status
PASSED

## Scope
- \`scripts/a.js\` — does thing A
- \`scripts/b.js\` — does thing B

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
`;

// F2: PASSED, Scope = free prose (no backtick file paths), no RAC table,
// Escalation N/A.
const F2 = `# Fast Summary: issue-2

## Status
PASSED

## Scope
Harden core startup and sibling worktree pathing.

## Escalation
N/A
`;

// F3: ESCALATED, Escalation with escalated_to_full prefix and em-dash separator.
// Using literal U+2014 em-dash to match the real issue-75 format.
const F3 = `# Fast Summary: issue-3

## Status
ESCALATED

## Escalation
escalated_to_full: scope exceeds fast-path — 6 files across scripts/, commands/, plugins/ required
`;

// F4: IN_PROGRESS (minimal).
const F4 = `# Fast Summary: issue-4

## Status
IN_PROGRESS
`;

// F5: REVIEW (minimal).
const F5 = `# Fast Summary: issue-5

## Status
REVIEW
`;

// F6: PASSED, Scope with one real file path, plus non-path backtick spans.
// parseFileCount should return 1 (only scripts/foo.js qualifies).
const F6 = `# Fast Summary: issue-6

## Status
PASSED

## Scope
- \`scripts/foo.js\` — main entry
- \`myFunc()\` — helper call
- \`npm run test:x\` — test runner command

## Escalation
N/A
`;

// F7: PASSED, Escalation body starts with N/A — must NOT count as escalated.
// Matches issue-184 pattern exactly.
const F7 = `# Fast Summary: issue-7

## Status
PASSED

## Escalation
N/A — stayed within bounds (mechanical mirroring)
`;

// F8: active fast-summary (will be written under kaola-workflow/issue-999/).
// PASSED + delegated (code-reviewer invoked in RAC table).
const F8 = `# Fast Summary: issue-8 (active)

## Status
PASSED

## Scope
- \`scripts/active.js\` — active change

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
`;

// F9: garbage text, no ## headers at all.
const F9 = `This is just random text with no markdown headers.
Some more lines here.
Nothing structured.
`;

// ---------------------------------------------------------------------------
// Helper: write a fixture fast-summary.md
// active=true  -> kaola-workflow/issue-N/fast-summary.md
// active=false -> kaola-workflow/archive/issue-N/fast-summary.md
// ---------------------------------------------------------------------------
function writeSummary(root, issueN, body, active) {
  const dir = active
    ? path.join(root, 'kaola-workflow', 'issue-' + issueN)
    : path.join(root, 'kaola-workflow', 'archive', 'issue-' + issueN);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fast-summary.md'), body);
}

// ---------------------------------------------------------------------------
// Build temp directory and write all fixtures
// ---------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-audit-'));

try {
  writeSummary(tmp, 1,   F1, false);
  writeSummary(tmp, 2,   F2, false);
  writeSummary(tmp, 3,   F3, false);
  writeSummary(tmp, 4,   F4, false);
  writeSummary(tmp, 5,   F5, false);
  writeSummary(tmp, 6,   F6, false);
  writeSummary(tmp, 7,   F7, false);
  writeSummary(tmp, 8,   F8, false);  // archived copy of F8-like data
  writeSummary(tmp, 9,   F9, false);  // garbage, archived
  writeSummary(tmp, 999, F8, true);   // F8 active (extra PASSED+delegated run)
  // 10 files total (F1-F9 archived + F8-active under issue-999)

  // -------------------------------------------------------------------------
  // 1. totalRuns — 10 fixtures written
  // -------------------------------------------------------------------------
  const report = audit(tmp);
  assert(report.totalRuns === 10, 'totalRuns should be 10, got ' + report.totalRuns);

  // -------------------------------------------------------------------------
  // 2. statusCounts
  // PASSED: F1,F2,F6,F7,F8-archived,F8-active = 6
  // IN_PROGRESS: F4 = 1
  // REVIEW: F5 = 1
  // ESCALATED: F3 = 1
  // UNKNOWN: F9 = 1
  // -------------------------------------------------------------------------
  const sc = report.statusCounts;
  assert(sc.PASSED      === 6, 'PASSED should be 6, got '      + sc.PASSED);
  assert(sc.IN_PROGRESS === 1, 'IN_PROGRESS should be 1, got ' + sc.IN_PROGRESS);
  assert(sc.REVIEW      === 1, 'REVIEW should be 1, got '      + sc.REVIEW);
  assert(sc.ESCALATED   === 1, 'ESCALATED should be 1, got '   + sc.ESCALATED);
  assert(sc.UNKNOWN     === 1, 'UNKNOWN should be 1, got '      + sc.UNKNOWN);

  // statusCounts sums to totalRuns
  const scSum = sc.PASSED + sc.IN_PROGRESS + sc.REVIEW + sc.ESCALATED + sc.UNKNOWN;
  assert(scSum === report.totalRuns, 'statusCounts sum ' + scSum + ' !== totalRuns ' + report.totalRuns);

  // -------------------------------------------------------------------------
  // 3. reviewModeCounts
  // delegated:   F1, F8-archived, F8-active (have code-reviewer | invoked in RAC) = 3
  // escalated:   F3 = 1
  // self-review: F2, F4, F5, F6, F7, F9 = 6
  // -------------------------------------------------------------------------
  const rm = report.reviewModeCounts;
  assert(rm.delegated    === 3, 'delegated should be 3, got '    + rm.delegated);
  assert(rm['self-review'] === 6, 'self-review should be 6, got ' + rm['self-review']);
  assert(rm.escalated    === 1, 'escalated should be 1, got '    + rm.escalated);

  // reviewModeCounts sums to totalRuns
  const rmSum = rm.delegated + rm['self-review'] + rm.escalated;
  assert(rmSum === report.totalRuns, 'reviewModeCounts sum ' + rmSum + ' !== totalRuns ' + report.totalRuns);

  // -------------------------------------------------------------------------
  // 4. parseFileCount unit tests
  // -------------------------------------------------------------------------
  assert(parseFileCount(splitSections(F1)) === 2,
    'F1 should have fileCount 2, got ' + parseFileCount(splitSections(F1)));
  assert(parseFileCount(splitSections(F2)) === 'unknown',
    'F2 should have fileCount unknown, got ' + parseFileCount(splitSections(F2)));
  assert(parseFileCount(splitSections(F6)) === 1,
    'F6 should have fileCount 1, got ' + parseFileCount(splitSections(F6)));

  // -------------------------------------------------------------------------
  // 5. escalationHistogram: exactly 1 key, 'scope exceeds fast-path' with count 1
  // F7 has N/A escalation body but status PASSED — contributes nothing
  // -------------------------------------------------------------------------
  const eh = report.escalationHistogram;
  const ehKeys = Object.keys(eh);
  assert(ehKeys.length === 1, 'escalationHistogram should have exactly 1 key, got ' + ehKeys.length + ': ' + JSON.stringify(ehKeys));
  assert(eh['scope exceeds fast-path'] === 1,
    'escalationHistogram["scope exceeds fast-path"] should be 1, got ' + eh['scope exceeds fast-path']);

  // -------------------------------------------------------------------------
  // 6. parseReviewMode unit test: code-reviewer mention ONLY in ## Review prose
  //    (not in Required Agent Compliance) should return 'self-review'
  // -------------------------------------------------------------------------
  const reviewProseSections = {
    'Status': 'PASSED',
    'Review': 'PASS — code-reviewer confirmed all items pass.',
    // No 'Required Agent Compliance' key at all
  };
  assert(
    parseReviewMode(reviewProseSections, 'PASSED') === 'self-review',
    'code-reviewer mention in Review prose only should yield self-review'
  );

  // -------------------------------------------------------------------------
  // 7. audit on fresh empty temp dir → totalRuns 0, all status buckets present
  // -------------------------------------------------------------------------
  const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-audit-empty-'));
  try {
    const emptyReport = audit(emptyTmp);
    assert(emptyReport.totalRuns === 0, 'empty dir: totalRuns should be 0');
    assert('PASSED'      in emptyReport.statusCounts, 'empty dir: statusCounts.PASSED present');
    assert('IN_PROGRESS' in emptyReport.statusCounts, 'empty dir: statusCounts.IN_PROGRESS present');
    assert('REVIEW'      in emptyReport.statusCounts, 'empty dir: statusCounts.REVIEW present');
    assert('ESCALATED'   in emptyReport.statusCounts, 'empty dir: statusCounts.ESCALATED present');
    assert('UNKNOWN'     in emptyReport.statusCounts, 'empty dir: statusCounts.UNKNOWN present');
    assert(emptyReport.statusCounts.PASSED === 0, 'empty dir: PASSED should be 0');
    assert('delegated'    in emptyReport.reviewModeCounts, 'empty dir: reviewModeCounts.delegated present');
    assert('self-review'  in emptyReport.reviewModeCounts, 'empty dir: reviewModeCounts[self-review] present');
    assert('escalated'    in emptyReport.reviewModeCounts, 'empty dir: reviewModeCounts.escalated present');
  } finally {
    fs.rmSync(emptyTmp, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // 8. audit on temp dir with NO kaola-workflow/ subdir → totalRuns 0, no throw
  // -------------------------------------------------------------------------
  const noKwTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-audit-nokw-'));
  try {
    const noKwReport = audit(noKwTmp);
    assert(noKwReport.totalRuns === 0, 'no-kw dir: totalRuns should be 0');
  } finally {
    fs.rmSync(noKwTmp, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // 9. parseFastSummary on F9 garbage → does not throw, status UNKNOWN
  // -------------------------------------------------------------------------
  const f9Parsed = parseFastSummary(F9);
  assert(f9Parsed.status === 'UNKNOWN', 'F9 garbage should yield status UNKNOWN, got ' + f9Parsed.status);

  // -------------------------------------------------------------------------
  // 10. formatTable is non-empty string containing four section labels
  // -------------------------------------------------------------------------
  const tableStr = formatTable(report);
  assert(typeof tableStr === 'string' && tableStr.length > 0, 'formatTable should return non-empty string');
  assert(tableStr.includes('Status'), 'formatTable should contain "Status"');
  assert(tableStr.includes('Escalation'), 'formatTable should contain "Escalation"');
  assert(tableStr.includes('File-count'), 'formatTable should contain "File-count"');
  assert(tableStr.includes('Review'), 'formatTable should contain "Review"');

  // -------------------------------------------------------------------------
  // 11. formatJson round-trips through JSON.parse with deep-equal
  // -------------------------------------------------------------------------
  const jsonStr = formatJson(report);
  const reparsed = JSON.parse(jsonStr);
  assert(reparsed.totalRuns === report.totalRuns, 'formatJson round-trip: totalRuns');
  assert(reparsed.statusCounts.PASSED === report.statusCounts.PASSED, 'formatJson round-trip: statusCounts.PASSED');
  assert(reparsed.reviewModeCounts.delegated === report.reviewModeCounts.delegated, 'formatJson round-trip: reviewModeCounts.delegated');
  assert(JSON.stringify(reparsed) === JSON.stringify(report), 'formatJson round-trip: deep-equal');

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Fast-audit regression passed (' + passed + ' assertions)');
process.exit(0);
