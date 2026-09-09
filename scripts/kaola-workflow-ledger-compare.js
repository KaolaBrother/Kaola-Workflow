#!/usr/bin/env node
'use strict';

// issue #399, re-derived under #1054: record-regression guard for the finalize transaction's
// Step-8a artifact mirror.
//
// The Step-8a mirror `cp -R`s `kaola-workflow/{project}/.` from the main checkout into the
// linked worktree right before archive. Run from the WRONG direction (cwd = main checkout with a
// staler main copy), it clobbers a finished run's record — resetting closed work back to open so
// the archive commits an unfinished-looking run (the 2026-06-11 audit reproduced this live at
// v5.14.0). This guard decides by CONTENT, not by counting how much work either side records as
// done — issue #1054's trace (`kaola-workflow/bundle-1054/.cache/sync-guard-trace.md`) measured a
// real false-safe against production data: a `status: done` line-regex reads 0 on the current
// TABLE-form Mission List, so `compareLedgers` reported SAFE on a copy that would have erased 3 of
// 7 finished rows, because both sides counted zero. A count is a proxy for "did the destination
// know about finished work"; the actual property is "does this copy discard content the
// destination already had" — content identity answers that directly, with no schema for a
// free-text field and no carrier (line-form vs table-form) to keep in sync.
//
// FORGE-NEUTRAL: this file carries no `kaola-<forge>-workflow-` token, so it byte-copies to every
// edition unchanged (BYTE_IDENTICAL_GROUPS + `npm run sync:editions`).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// A diff's information lives in line boundaries, not byte count, so the truncation bound here is
// LINES — the same idea as the `.slice(0, 400)` byte truncation claim.js already applies to other
// refusal detail, sized for a diff instead of a sentence.
const MAX_DIFF_LINES = 60;

function truncateDiffLines(text) {
  const trimmed = text.replace(/\n$/, '');
  const lines = trimmed.split('\n');
  if (lines.length <= MAX_DIFF_LINES) return trimmed;
  const omitted = lines.length - MAX_DIFF_LINES;
  return lines.slice(0, MAX_DIFF_LINES).join('\n') + '\n… (' + omitted + ' more line(s) omitted)';
}

// A bounded unified-diff summary between two mission-list texts, for the operator to reconcile by
// hand. Reuses the codebase's existing idiom for "report what changed" (claim.js and
// kaola-workflow-sink-merge.js already shell `git diff` ~10x for exactly this duty) — this
// comparison has no git repo backing arbitrary caller-supplied text, so it writes both sides to a
// scratch dir and runs a plain `diff -u`, falling back to `git diff --no-index` if `diff` is
// unavailable. Returns { summary, unavailable }; `unavailable` is true only when NEITHER tool could
// produce output, in which case `summary` is ''.
function diffSummary(destText, srcText) {
  let dir = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ledger-diff-'));
    const destFile = path.join(dir, 'dest-mission-list.md');
    const srcFile = path.join(dir, 'src-mission-list.md');
    fs.writeFileSync(destFile, destText);
    fs.writeFileSync(srcFile, srcText);
    const runDiff = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      const out = runDiff('diff', ['-u', '-L', 'dest (worktree copy)', '-L', 'src (main copy)', destFile, srcFile]);
      return { summary: truncateDiffLines(out), unavailable: false };
    } catch (e) {
      // `diff` exits 1 (not an error) when the files differ; its stdout still carries the diff.
      if (e && typeof e.stdout === 'string' && e.stdout.length > 0) {
        return { summary: truncateDiffLines(e.stdout), unavailable: false };
      }
      try {
        const out = runDiff('git', ['diff', '--no-index', '--', destFile, srcFile]);
        return { summary: truncateDiffLines(out), unavailable: false };
      } catch (e2) {
        if (e2 && typeof e2.stdout === 'string' && e2.stdout.length > 0) {
          return { summary: truncateDiffLines(e2.stdout), unavailable: false };
        }
        return { summary: '', unavailable: true };
      }
    }
  } catch (_) {
    return { summary: '', unavailable: true };
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// Compare a SOURCE (main copy, about to be copied OUT) against a DEST (worktree copy, about to be
// OVERWRITTEN), by content:
//   - dest absent/empty         -> safe, reason 'first_sync'    (the legitimate first mirror)
//   - dest byte-identical to src -> safe, reason 'identical'     (an idempotent re-run)
//   - otherwise                 -> unsafe, reason 'content_diverged', carrying a bounded `diff`
//     summary of what the copy would discard/overwrite (dest -> src); if no diff tool could run,
//     reason 'diff_unavailable' instead, still unsafe, with `diff` == ''.
// No count, no carrier/format detection, no parser: the decision is textual identity.
function compareLedgers(srcText, destText) {
  if (destText == null || destText === '') {
    return { safe: true, reason: 'first_sync' };
  }
  const src = srcText || '';
  if (destText === src) {
    return { safe: true, reason: 'identical' };
  }
  const { summary, unavailable } = diffSummary(destText, src);
  if (unavailable) {
    return { safe: false, reason: 'diff_unavailable', diff: '' };
  }
  return { safe: false, reason: 'content_diverged', diff: summary };
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
        '  exit 0  safe to copy source over dest (first_sync, identical)\n' +
        '  exit 3  unsafe: content_diverged (dest carries content the copy would discard/overwrite) or diff_unavailable\n' +
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
      (result.diff ? '\n' + result.diff + '\n' : '\n'));
  }
  return result.safe ? 0 : 3;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { compareLedgers, main };
