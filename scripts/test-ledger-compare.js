#!/usr/bin/env node
'use strict';

// Regression test for the worktree<->main anti-clobber fence (kaola-workflow-ledger-compare.js,
// issue #399 -> re-pointed at the MISSION LIST by #877 -> re-derived under #1054 from a done-COUNT
// proxy to a CONTENT-IDENTITY guard.
//
// #1054's trace (kaola-workflow/bundle-1054/.cache/sync-guard-trace.md) measured a real false-safe
// against production data: the retired `countComplete`'s `status: done` line-regex read 0 on the
// current TABLE-form Mission List, so `compareLedgers` reported SAFE on a copy that would have
// discarded 3 of 7 real finished rows because BOTH sides counted zero. The corrected guard drops
// the count proxy entirely and decides by byte content: dest absent/empty -> safe (`first_sync`);
// dest byte-identical to src -> safe (`identical`, an idempotent repeat); anything else -> unsafe
// (`content_diverged`, carrying a bounded diff) — no carrier/format detection, no parser, no
// schema for the free-text record.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { compareLedgers } = require('./kaola-workflow-ledger-compare');

function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

const scriptPath = path.join(__dirname, 'kaola-workflow-ledger-compare.js');
const fixturesDir = path.join(__dirname, 'fixtures', 'issue-1054');

let passed = 0;
function assert(cond, msg) {
  if (!cond) { throw new Error('FAIL: ' + msg); }
  passed++;
}

// A mission list in the documented LINE format (docs/decisions/0017-the-mission-list.md): H1 goal,
// `- item:` bullets, two-space-indented fields.
function record(items) {
  const lines = ['# fence fixture — one goal line', ''];
  for (const it of items) {
    const slug = it.item.replace(/\s+/g, '-');
    lines.push('- item: ' + it.item);
    lines.push('  status: ' + it.status);
    if (it.status !== 'todo') lines.push('  dispatched: agent, output to ' + slug + '.md');
    if (it.status === 'done') lines.push('  result: out/' + slug + '.md');
    lines.push('');
  }
  return lines.join('\n');
}

function cli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ledger-compare-'));

// --- (a) dest absent / empty / undefined -> SAFE, reason 'first_sync' -------------------------
{
  const src = record([{ item: 'a', status: 'done' }, { item: 'b', status: 'done' }]);
  const r1 = compareLedgers(src, null);
  assert(r1.safe === true && r1.reason === 'first_sync',
    '(a) dest absent (null) is a legitimate first sync; got ' + JSON.stringify(r1));
  const r2 = compareLedgers(src, '');
  assert(r2.safe === true && r2.reason === 'first_sync',
    '(a) dest empty string is a legitimate first sync; got ' + JSON.stringify(r2));
  const r3 = compareLedgers(src, undefined);
  assert(r3.safe === true && r3.reason === 'first_sync',
    '(a) dest undefined is a legitimate first sync; got ' + JSON.stringify(r3));

  const srcFile = path.join(tmp, 'first-sync-src.md');
  fs.writeFileSync(srcFile, src);
  const absentDest = path.join(tmp, 'does-not-exist.md');
  const c = cli(['--source', srcFile, '--dest', absentDest, '--json']);
  assert(c.status === 0, '(a) CLI exits 0 on a first sync (dest missing); got ' + c.status);
  assert(JSON.parse(c.stdout).reason === 'first_sync', '(a) CLI JSON names first_sync');
}

// --- (b) dest byte-identical to src -> SAFE, reason 'identical' (idempotent repeat) -----------
{
  const text = record([{ item: 'a', status: 'done' }, { item: 'b', status: 'in-flight' }]);
  const r = compareLedgers(text, text);
  assert(r.safe === true && r.reason === 'identical',
    '(b) byte-identical dest/src is a safe repeat; got ' + JSON.stringify(r));

  const same = path.join(tmp, 'same.md');
  fs.writeFileSync(same, text);
  const c = cli(['--source', same, '--dest', same, '--json']);
  assert(c.status === 0 && JSON.parse(c.stdout).reason === 'identical',
    '(b) CLI: comparing a file against itself is a safe repeat; got status ' + c.status);
}

// --- (c) content genuinely diverges (dest holds finished work the source lacks) -> UNSAFE ------
// The ORDINARY regression case, reproduced over the REAL archived bundle-1053 table (byte-copied
// fixture): a staler source missing 3 of the 7 real finished rows, compared against the full dest.
{
  const fullTable = fs.readFileSync(path.join(fixturesDir, 'bundle-1053-mission-list.md'), 'utf8');
  const rows = fullTable.split('\n');
  const doneRowIdx = rows.map((l, i) => [l, i]).filter(([l]) => l.includes('| done |')).map(([, i]) => i);
  assert(doneRowIdx.length === 7, '(c) fixture premise — bundle-1053 has 7 `| done |` rows; got ' + doneRowIdx.length);
  const drop = new Set(doneRowIdx.slice(4)); // the last 3 done rows never landed in the stale copy
  const staleSrc = rows.filter((_, i) => !drop.has(i)).join('\n');

  const r = compareLedgers(staleSrc, fullTable);
  assert(r.safe === false && r.reason === 'content_diverged',
    '(c) a source missing 3 of 7 real finished rows must be UNSAFE against the full dest — the exact '
    + 'false-safe #1054 measured against production data; got ' + JSON.stringify(r));
  assert(typeof r.diff === 'string' && r.diff.length > 0,
    '(c) the refusal carries a non-empty diff summary; got ' + JSON.stringify(r.diff));
  assert(r.diff.includes('dest (worktree copy)') && r.diff.includes('src (main copy)'),
    '(c) the diff names which side is which; got ' + r.diff.slice(0, 200));

  const srcFile = path.join(tmp, 'stale-src.md');
  const destFile = path.join(tmp, 'full-dest.md');
  fs.writeFileSync(srcFile, staleSrc);
  fs.writeFileSync(destFile, fullTable);
  const c = cli(['--source', srcFile, '--dest', destFile, '--json']);
  assert(c.status === 3, '(c) CLI exits 3 on a content-diverged copy; got ' + c.status);
  const cJson = JSON.parse(c.stdout);
  assert(cJson.reason === 'content_diverged' && typeof cJson.diff === 'string' && cJson.diff.length > 0,
    '(c) CLI JSON carries reason + diff; got ' + JSON.stringify(cJson).slice(0, 300));

  // And the REVERSE direction — a full, more-advanced source copied over the stale dest, the
  // ORDINARY legitimate "main has progressed further" case — is refused TOO, deliberately. Byte
  // identity is the only safe non-first-sync arm; the trace evaluated and rejected a containment
  // check ("does dest's content live wholly inside src?") as unable to hold under the Mission
  // List's in-place-mutation write model without re-deriving field semantics. So any divergence at
  // all — including this legitimate one-sided advance — now surfaces to the Main Orchestrator
  // instead of being silently allowed. Pinned here as the corrected scope's deliberate trade
  // ("safety never judged by counts"), not an oversight.
  const rBack = compareLedgers(fullTable, staleSrc);
  assert(rBack.safe === false && rBack.reason === 'content_diverged',
    '(c-reverse) even a source that only ADDS content differs byte-for-byte from a stale dest and '
    + 'is refused — no containment check exists, by design; got ' + JSON.stringify(rBack));
}

// --- (d) THE COUNT-PROXY TRAP: equal `status: done` counts, genuinely different content --------
// The retired guard counted `status: done` lines and passed on equal counts (STRICT >, so equal
// was always safe). Two records can carry the SAME count of finished items while recording
// DIFFERENT finished work — this must be UNSAFE under the content guard even though a count-based
// reader would have called it safe.
{
  const destText = record([
    { item: 'investigate the timeout', status: 'done' },
    { item: 'patch the retry loop', status: 'done' },
    { item: 'write the regression test', status: 'in-flight' },
  ]);
  // Same status SHAPE (2 done, 1 not-done), but the completed items are DIFFERENT missions — a
  // real divergent record, not a relabel.
  const srcText = record([
    { item: 'investigate the timeout', status: 'done' },
    { item: 'roll back the bad config', status: 'done' },
    { item: 'write the regression test', status: 'todo' },
  ]);
  const r = compareLedgers(srcText, destText);
  assert(r.safe === false && r.reason === 'content_diverged',
    '(d) equal done-counts (2/2) but genuinely different completed work must be UNSAFE — the exact '
    + 'count-proxy trap #1054 retired the old guard for; got ' + JSON.stringify(r));
}

// --- (e) layout independence: an unfamiliar (non-line-form) text goes through the SAME two safe
// arms — no carrier/format branch exists anywhere in the guard.
{
  const unfamiliar = ['# goal: numbered layout', '', '1. **A** — done', '2. **B** — todo', ''].join('\n');
  const rIdentical = compareLedgers(unfamiliar, unfamiliar);
  assert(rIdentical.safe === true && rIdentical.reason === 'identical',
    '(e) an unfamiliar layout compared to itself is still a safe repeat; got ' + JSON.stringify(rIdentical));
  const rFirstSync = compareLedgers(unfamiliar, null);
  assert(rFirstSync.safe === true && rFirstSync.reason === 'first_sync',
    '(e) an unfamiliar layout with no dest yet is still a safe first sync; got ' + JSON.stringify(rFirstSync));
}

// --- usage errors are exit 1 (never a regression verdict) --------------------------------------
{
  const c = cli(['--json']);
  assert(c.status === 1, 'missing --source must exit 1 (usage), got ' + c.status);
  const c2 = cli(['--source', path.join(tmp, 'no-such-source.md'), '--dest', path.join(tmp, 'x.md')]);
  assert(c2.status === 1, 'an unreadable --source must exit 1 (usage/environment), got ' + c2.status);
  const c3 = cli(['--source', path.join(tmp, 'no-such-source.md'), '--frobnicate']);
  assert(c3.status === 1, 'an unknown argument must exit 1, got ' + c3.status);
  const h = cli(['--help']);
  assert(h.status === 0 && /content_diverged/.test(h.stdout),
    '--help documents the content_diverged unsafe exit code; got ' + h.status + '\n' + h.stdout);
}

// --- (f) R1 (#1054 review, candidate 5743eb15): the mirror must accept its own prior write when
// the SOURCE legitimately advances after a successful mirror. compareLedgers gains a third,
// OPTIONAL options argument: `{ priorDigest }`, the sha256 hex of the bytes the mirror itself
// copied into dest the last time it ran safely. When dest's CURRENT bytes still hash to exactly
// that digest — i.e. dest is untouched since that copy — a source that has since diverged is not a
// conflict, it is the mirror's own forward progress, and the verdict is safe, reason 'prior_mirror'.
// This is additive and narrow: every existing arm (first_sync / identical / content_diverged, with
// no third argument or an empty options object) is unchanged, and a dest that does NOT hash to the
// supplied digest — because it was independently edited, or because no digest was ever supplied —
// falls straight through to the existing content-identity comparison. No new leniency is created for
// any pair the old guard already called unsafe; this only recognizes the ONE additional pair the old
// guard mis-called unsafe: dest is exactly what THIS mirror last wrote, and nothing else touched it.
{
  const v1 = record([{ item: 'a', status: 'done' }, { item: 'b', status: 'in-flight' }]);
  const v2 = record([{ item: 'a', status: 'done' }, { item: 'b', status: 'done' }, { item: 'c', status: 'todo' }]);
  const digestV1 = sha256(v1);

  // (f1) dest untouched since the mirror wrote it (hashes to priorDigest); src has since advanced
  // to v2 — SAFE, reason prior_mirror, even though dest !== src and dest is neither empty nor
  // byte-identical to src (the two arms that already covered it).
  const rPrior = compareLedgers(v2, v1, { priorDigest: digestV1 });
  assert(rPrior.safe === true && rPrior.reason === 'prior_mirror',
    '(f1) dest unchanged since the mirror wrote it must be safe against an advanced source, reason '
    + 'prior_mirror; got ' + JSON.stringify(rPrior));

  // (f2) dest was independently edited after the mirror (even by one byte) — its current bytes no
  // longer hash to priorDigest, so this must NOT take the prior_mirror arm; it falls through to the
  // ordinary content comparison and is refused exactly as before.
  const v1Edited = v1 + '\n<!-- one byte of drift -->\n';
  const rEdited = compareLedgers(v2, v1Edited, { priorDigest: digestV1 });
  assert(rEdited.safe === false && rEdited.reason === 'content_diverged',
    '(f2) a dest independently edited after the mirror must still refuse content_diverged even with '
    + 'a priorDigest supplied — the digest has to match dest\'s CURRENT bytes, not merely exist; got '
    + JSON.stringify(rEdited));

  // (f3) no priorDigest at all (undefined options, or omitted third argument) — today's behaviour,
  // completely unchanged. This is the regression control: every call site that does not yet supply
  // a digest (or a caller on an older signature) must see the identical old verdict.
  const rNoOpt3 = compareLedgers(v2, v1);
  assert(rNoOpt3.safe === false && rNoOpt3.reason === 'content_diverged',
    '(f3a) calling with no third argument at all must be byte-for-byte today\'s behaviour; got '
    + JSON.stringify(rNoOpt3));
  const rNoOpt4 = compareLedgers(v2, v1, {});
  assert(rNoOpt4.safe === false && rNoOpt4.reason === 'content_diverged',
    '(f3b) an empty options object (no priorDigest key) must also be today\'s behaviour; got '
    + JSON.stringify(rNoOpt4));
  const rNoOpt5 = compareLedgers(v2, v1, { priorDigest: null });
  assert(rNoOpt5.safe === false && rNoOpt5.reason === 'content_diverged',
    '(f3c) an explicit null priorDigest must also fall through to today\'s behaviour; got '
    + JSON.stringify(rNoOpt5));

  // (f4) a WRONG/corrupt digest (garbage, or the hash of something else entirely) must not be
  // treated as a match by coincidence or by a loose comparison — refused exactly as (f2).
  const rWrongDigest = compareLedgers(v2, v1, { priorDigest: 'not-a-real-sha256-digest' });
  assert(rWrongDigest.safe === false && rWrongDigest.reason === 'content_diverged',
    '(f4) a corrupt/garbage priorDigest must not match dest\'s real hash and must refuse; got '
    + JSON.stringify(rWrongDigest));

  // (f5) priorDigest must never override the two EARLIER, stronger arms. A first-sync dest (absent)
  // is still first_sync regardless of any digest supplied, and a byte-identical dest/src pair is
  // still 'identical', not 'prior_mirror' — the new arm only ever fires on the THIRD, previously-
  // unsafe case, never reclassifying the two that were already safe.
  const rStillFirstSync = compareLedgers(v2, null, { priorDigest: digestV1 });
  assert(rStillFirstSync.safe === true && rStillFirstSync.reason === 'first_sync',
    '(f5a) a genuinely absent dest is still first_sync even with a priorDigest supplied; got '
    + JSON.stringify(rStillFirstSync));
  const rStillIdentical = compareLedgers(v2, v2, { priorDigest: digestV1 });
  assert(rStillIdentical.safe === true && rStillIdentical.reason === 'identical',
    '(f5b) a byte-identical dest/src pair is still \'identical\', never \'prior_mirror\', even with an '
    + 'unrelated priorDigest supplied; got ' + JSON.stringify(rStillIdentical));
}

// --- negative pin: the retired count proxy is gone from this module entirely -------------------
{
  const mod = require('./kaola-workflow-ledger-compare');
  assert(typeof mod.countComplete === 'undefined',
    'countComplete (the retired count proxy) is not exported; got ' + typeof mod.countComplete);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Ledger-compare fence regression passed (' + passed + ' assertions)');
