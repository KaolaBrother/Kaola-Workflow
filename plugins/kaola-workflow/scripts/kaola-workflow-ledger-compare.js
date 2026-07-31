#!/usr/bin/env node
'use strict';

// issue #399: record-regression guard for the finalize transaction's Step-8a artifact mirror.
//
// The Step-8a mirror `cp -R`s `kaola-workflow/{project}/.` from the main checkout into the
// linked worktree right before archive. Run from the WRONG direction (cwd = main checkout with a
// staler main copy), it clobbers a finished run's record — resetting closed work back to open so
// the archive commits an unfinished-looking run (the 2026-06-11 audit reproduced this live at
// v5.14.0). This guard compares the two `mission-list.md` files by how much work each records as
// DONE, and refuses the copy when the main (source) copy is staler than the worktree (dest) copy.
//
// THE PROPERTY IS THE POINT, NOT ITS DERIVATION. The question it answers — would this copy lose
// work the destination already recorded? — is worktree management, and it outlives the node
// executor whose `## Node Ledger` it used to count. What changed is only what it counts: the
// `status: done` items of the one durable coordination record.
//
// FORGE-NEUTRAL: this file carries no `kaola-<forge>-workflow-` token, so it byte-copies to every
// edition unchanged (BYTE_IDENTICAL_GROUPS + `npm run sync:editions`), and it owns its own tiny
// parse so a finalize-time guard never couples to another reader.

const fs = require('fs');

// Count the items a mission list records as finished: `status: done` lines, at any indent (the
// documented format indents item fields by two spaces under the `- item:` bullet, but a hand-edited
// file legitimately varies). Own tiny parse, no dependency.
//
// Returns 0 when the file is empty or records nothing done — the fail-open signal compareLedgers
// relies on for the legitimate first sync. It deliberately does NOT try to identify WHICH items
// are done: the guard's question is comparative ("does the destination know about more finished
// work than the source?"), and a count answers it without inventing a schema for a free-text field.
function countComplete(missionListText) {
  if (typeof missionListText !== 'string' || missionListText.length === 0) return 0;
  let count = 0;
  for (const raw of missionListText.split('\n')) {
    if (/^[ \t]*(?:-[ \t]+)?status:[ \t]*done[ \t]*$/i.test(raw)) count++;
  }
  return count;
}

// Compare a SOURCE (main copy, about to be copied OUT) against a DEST (worktree copy, about to be
// OVERWRITTEN). Refuse only when the dest is present AND records strictly more done work than the
// source — i.e. the copy would regress a finished worktree record back to a staler main one.
//
// FAIL-OPEN (safe:true) when dest is absent/empty/records nothing done: that is the legitimate
// first sync (the mirror pushing Finalization artifacts INTO a worktree that has no record yet).
// Equal counts pass (STRICT >) so an idempotent re-run of the mirror is never refused.
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
        'Usage: kaola-workflow-ledger-compare.js --source <mission-list.md> --dest <mission-list.md> [--json]\n' +
        '  exit 0  safe to copy source over dest (or fail-open first sync)\n' +
        '  exit 3  unsafe: would_regress_complete_ledger (dest records strictly more done work)\n' +
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
