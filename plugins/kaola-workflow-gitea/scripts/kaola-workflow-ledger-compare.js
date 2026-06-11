#!/usr/bin/env node
'use strict';

// issue #399: ledger-regression guard for the contractor's Step-8a artifact mirror.
//
// The Step-8a mirror `cp -R`s `kaola-workflow/{project}/.` from the main checkout into the
// linked worktree right before archive. Run from the WRONG direction (cwd = main checkout with a
// staler main copy), it clobbers a finished run's worktree ledger — resetting `complete` rows to
// `pending` so the archive commits a pending-ledger plan (the 2026-06-11 audit reproduced this
// live at v5.14.0). This guard compares the two `## Node Ledger` tables by COMPLETENESS and
// refuses the copy when the main (source) copy is staler than the worktree (dest) copy.
//
// FORGE-NEUTRAL: this file carries no `kaola-<forge>-workflow-` token, so it byte-copies to the
// codex edition unchanged (COMMON_SCRIPTS + `npm run sync:editions`). It deliberately does NOT
// import plan-validator's parseLedger — it owns a small self-contained `## Node Ledger` count so a
// finalize-time guard never couples to the integrity reader.

const fs = require('fs');

// Count `| <id> | complete |` rows in the `## Node Ledger` table.
//
// Own 5-line section-scoped regex parse (NO plan-validator dependency): slice from the
// `## Node Ledger` heading to the next `## ` heading, then count table rows whose SECOND
// pipe-delimited cell is exactly `complete` (case-insensitive). Returns 0 when the section or
// table is absent — the fail-open signal compareLedgers relies on for the legitimate first sync.
function countComplete(planMdText) {
  if (typeof planMdText !== 'string' || planMdText.length === 0) return 0;
  const lines = planMdText.split('\n');
  let inLedger = false;
  let count = 0;
  for (const raw of lines) {
    if (/^##[ \t]+Node Ledger[ \t]*$/.test(raw)) { inLedger = true; continue; }
    if (inLedger && /^##[ \t]/.test(raw)) break; // next section ends the ledger table
    if (!inLedger) continue;
    const cells = raw.split('|');
    // A real table row is `| c0 | c1 | ... |` → split yields ['', ' id ', ' status ', ..., ''].
    if (cells.length < 3) continue;
    if ((cells[2] || '').trim().toLowerCase() === 'complete') count++;
  }
  return count;
}

// Compare a SOURCE (main copy, about to be copied OUT) against a DEST (worktree copy, about to be
// OVERWRITTEN). Refuse only when the dest is present AND strictly more complete than the source —
// i.e. the copy would regress a finished worktree ledger back to a staler main one.
//
// FAIL-OPEN (safe:true) when dest is absent/empty/has-no-ledger: that is the legitimate first sync
// (the mirror pushing Finalization artifacts INTO a worktree that has no plan yet). Equal
// completeness passes (STRICT >) so an idempotent re-run of the mirror is never refused.
function compareLedgers(srcText, destText) {
  const sourceComplete = countComplete(srcText || '');
  // Fail-open when there is no dest ledger to protect (absent/empty/no `## Node Ledger` table).
  if (destText == null || destText === '' || countComplete(destText) === 0) {
    return { safe: true, reason: 'ok', sourceComplete, destComplete: countComplete(destText || '') };
  }
  const destComplete = countComplete(destText);
  if (destComplete > sourceComplete) {
    return { safe: false, reason: 'would_regress_complete_ledger', sourceComplete, destComplete };
  }
  return { safe: true, reason: 'ok', sourceComplete, destComplete };
}

function readOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function main(argv) {
  const args = argv.slice(2);
  let source = null;
  let dest = null;
  let asJson = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source') { source = args[++i]; }
    else if (a === '--dest') { dest = args[++i]; }
    else if (a === '--json') { asJson = true; }
    else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: kaola-workflow-ledger-compare.js --source <plan.md> --dest <plan.md> [--json]\n' +
        '  exit 0  safe to copy source over dest (or fail-open first sync)\n' +
        '  exit 3  unsafe: would_regress_complete_ledger (dest strictly more complete than source)\n' +
        '  exit 1  usage error / source unreadable\n');
      return 0;
    } else {
      process.stderr.write('ledger-compare: unknown argument: ' + a + '\n');
      return 1;
    }
  }
  if (!source) {
    process.stderr.write('ledger-compare: --source <path> is required\n');
    return 1;
  }
  const srcText = readOrNull(source);
  if (srcText === null) {
    // The source (main copy) is the thing we are about to copy OUT; if it cannot be read this is a
    // usage/environment error, not a regression verdict.
    process.stderr.write('ledger-compare: cannot read --source ' + source + '\n');
    return 1;
  }
  // The dest may legitimately not exist yet (first sync); readOrNull → null → fail-open.
  const destText = dest ? readOrNull(dest) : null;
  const result = compareLedgers(srcText, destText);
  if (asJson) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      (result.safe ? 'SAFE' : 'UNSAFE') + ' reason=' + result.reason +
      ' sourceComplete=' + result.sourceComplete + ' destComplete=' + result.destComplete + '\n');
  }
  return result.safe ? 0 : 3;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { countComplete, compareLedgers, main };
