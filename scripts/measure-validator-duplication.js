#!/usr/bin/env node
'use strict';

// measure-validator-duplication.js — which contract-validator token assertions does the
// required-block manifest already prove?
//
// DIAGNOSTIC ONLY. Not a gate, not wired into any chain, not shipped or installed. Run it by hand
// before deleting validator assertions as duplicated.
//
// WHY THIS EXISTS AS A FILE RATHER THAN A THROWAWAY. A clean ZERO from a hand-rolled version of this
// measurement has been wrong twice: once from a quoted-literal scan blind to a template-literal path,
// and once from a capture that died partway while its harness swallowed the failure in a bare catch,
// so a truncated run was indistinguishable from a complete one. The completeness gate below is the
// structural fix, and a structural fix that lives in someone's scratchpad guards nothing.
//
// TWO INVARIANTS, BOTH LOAD-BEARING:
//
//   1. THE CAPTURE ASSERTS ITS OWN COMPLETENESS. Distinct call sites recorded must equal static call
//      sites, per file. A mismatch names the missing line numbers and exits non-zero. Partial output
//      is never returned to the caller as if it were whole.
//   2. NOTHING IS SWALLOWED. There is no bare catch here. Every catch binds its error and reports it.
//
// MECHANICS worth knowing before editing:
//   * Each validator is compiled UNDER ITS OWN FILENAME. The forge validators derive `root` three
//     levels up from __dirname (the root ones use one level), so a temp-directory copy silently
//     mis-roots them and dies on the first read.
//   * The assert helpers are overridden by APPENDING duplicate function declarations. In JS the last
//     declaration in a scope wins at hoist time, so every original line number survives byte-for-byte
//     and no function body is rewritten.
//   * `assert` is overridden to record-and-continue rather than throw, because a throwing assert is
//     precisely what truncated the earlier capture. Failures are reported, never discarded.
//   * The obligation set is built from the LIVE deriveObligated / MANIFEST_EDITIONS / TOPIC_BASENAME
//     / norm inside test-route-reachability.js. A second copy of that derivation would be the same
//     drift hazard that produced the wrong zeros.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..');

const VALIDATORS = [
  'scripts/validate-workflow-contracts.js',
  'scripts/validate-kaola-workflow-contracts.js',
  'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js',
  'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js',
];

const OVERRIDE = `
function assertIncludes(file, needle) { global.__KW_REC.record('includes', file, needle); }
function assertNotIncludes(file, needle) { global.__KW_REC.record('notIncludes', file, needle); }
function assert(condition, message) { if (!condition) global.__KW_REC.assertFailed(String(message)); }
`;

// A call site is a line invoking the helper that is NOT its declaration.
function staticCallSites(source) {
  const sites = [];
  source.split('\n').forEach((text, i) => {
    // A comment naming the helper is not a call site. Prose like
    //   // ... re-target the old `assertIncludes('install.sh', …)` registration checks ...
    // otherwise inflates the static count and the capture can never reach it.
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    if (/^\s*function\s+assert(Not)?Includes\b/.test(text)) return;
    if (/\bassertIncludes\s*\(/.test(text)) sites.push({ line: i + 1, kind: 'includes' });
    else if (/\bassertNotIncludes\s*\(/.test(text)) sites.push({ line: i + 1, kind: 'notIncludes' });
  });
  return sites;
}

// The override block lives in the same file, so its own frames carry this filename and are the
// innermost match. Attribute to the first frame inside the ORIGINAL source.
function callerLine(abs, originalLines) {
  const stack = new Error().stack.split('\n');
  for (const frame of stack) {
    if (!frame.includes(abs)) continue;
    const m = /:(\d+):\d+\)?\s*$/.exec(frame);
    if (!m) continue;
    const line = Number(m[1]);
    if (line <= originalLines) return line;
  }
  return null;
}

function recordValidator(relPath) {
  const abs = path.join(REPO, relPath);
  const source = fs.readFileSync(abs, 'utf8');
  const originalLines = source.split('\n').length;
  const sites = staticCallSites(source);
  const records = [];
  const assertFailures = [];

  global.__KW_REC = {
    record: (kind, file, needle) => records.push({
      kind, file: String(file), needle: String(needle), line: callerLine(abs, originalLines) }),
    assertFailed: (message) => assertFailures.push(message),
  };

  const mod = new Module(abs, null);
  mod.filename = abs;
  mod.paths = Module._nodeModulePaths(path.dirname(abs));
  let died = null;
  // The module must look like the MAIN module. validate-workflow-contracts.js opens with
  //   if (require.main !== module) { module.exports = {...}; return; }
  // so a non-main compile exports its helpers and returns before executing a single assertion —
  // a silent zero, which is the exact failure class this tool exists to prevent. Running as main is
  // also the faithful posture: these validators are invoked as `node <validator>`.
  const priorMain = process.mainModule;
  process.mainModule = mod;
  try {
    mod._compile(source + OVERRIDE, abs);
  } catch (err) {
    died = err;                       // BOUND and reported below — never discarded.
  } finally {
    process.mainModule = priorMain;
  }

  const recorded = new Set(records.map(r => r.line).filter(n => n !== null));
  const staticLines = new Set(sites.map(s => s.line));
  return {
    relPath, records, assertFailures, died,
    staticCount: sites.length,
    recordedDistinct: recorded.size,
    missing: [...staticLines].filter(n => !recorded.has(n)).sort((a, b) => a - b),
    unexpected: [...recorded].filter(n => !staticLines.has(n)).sort((a, b) => a - b),
  };
}

function loadManifestDerivation() {
  const abs = path.join(REPO, 'scripts', 'test-route-reachability.js');
  const source = fs.readFileSync(abs, 'utf8');
  const mod = new Module(abs, null);
  mod.filename = abs;
  mod.paths = Module._nodeModulePaths(path.dirname(abs));
  const realExit = process.exit;
  let exited = null;
  process.exit = (code) => { exited = code; };
  try {
    mod._compile(source + '\nmodule.exports = { deriveObligated, MANIFEST_EDITIONS, TOPIC_BASENAME, norm };\n', abs);
  } catch (err) {
    process.exit = realExit;
    throw new Error('test-route-reachability failed to load (reported, not swallowed): ' + err.message);
  }
  process.exit = realExit;
  if (exited !== null && exited !== 0) {
    throw new Error('test-route-reachability signalled exit ' + exited
      + ' — it is red, so an obligation set derived from it would be untrustworthy');
  }
  return mod.exports;
}

function buildObligations() {
  const { deriveObligated, MANIFEST_EDITIONS, TOPIC_BASENAME, norm } = loadManifestDerivation();
  const { REQUIRED_BLOCKS } = require(path.join(REPO, 'templates', 'routing', 'required-blocks.js'));
  const byToken = new Map();
  const blockOf = new Map();
  for (const b of REQUIRED_BLOCKS) {
    const { error, files } = deriveObligated(b, MANIFEST_EDITIONS, TOPIC_BASENAME);
    if (error) throw new Error('manifest block ' + b.block_id + ' does not derive: ' + error);
    for (const tok of b.content_tokens) {
      const nt = norm(tok);
      if (!byToken.has(nt)) byToken.set(nt, new Set());
      for (const f of files) { byToken.get(nt).add(f); blockOf.set(nt + ' ' + f, b.block_id); }
    }
  }
  return { byToken, blockOf, norm };
}

function classify(rec, ob) {
  if (rec.kind === 'notIncludes') {
    return { verdict: 'KEEP', why: 'absence claim — a presence manifest can never obligate it' };
  }
  const nt = ob.norm(rec.needle);
  const files = ob.byToken.get(nt);
  if (!files) return { verdict: 'KEEP', why: 'not a manifest content_token (exact equality)' };
  if (!files.has(rec.file)) return { verdict: 'KEEP', why: 'manifest token, but this FILE is outside its obligated set' };
  return { verdict: 'DUP', why: 'manifest obligates this exact (token, file) pair', block: ob.blockOf.get(nt + ' ' + rec.file) };
}

function main() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const targets = only.length ? VALIDATORS.filter(v => only.some(o => v.includes(o))) : VALIDATORS;
  if (!targets.length) throw new Error('no validator matched ' + JSON.stringify(only));

  const captures = targets.map(recordValidator);
  let complete = true;

  console.log('=== COMPLETENESS GATE — output is unusable unless every capture is COMPLETE ===');
  for (const c of captures) {
    const ok = !c.died && c.missing.length === 0 && c.unexpected.length === 0;
    if (!ok) complete = false;
    console.log('--- ' + c.relPath);
    console.log('    static call sites       : ' + c.staticCount);
    console.log('    distinct sites recorded : ' + c.recordedDistinct);
    if (c.died) console.log('    RUN DIED                : ' + String(c.died.message).split('\n')[0]);
    if (c.assertFailures.length) console.log('    non-token asserts failed: ' + c.assertFailures.length);
    if (c.missing.length) console.log('    MISSING LINES           : ' + c.missing.join(', '));
    if (c.unexpected.length) console.log('    UNEXPECTED LINES        : ' + c.unexpected.join(', '));
    console.log('    ' + (ok ? 'COMPLETE' : 'INCOMPLETE'));
  }
  if (!complete) {
    console.error('\nREFUSING to report duplications: at least one capture is incomplete.');
    process.exitCode = 1;
    return;
  }

  const ob = buildObligations();
  console.log('\n=== DUPLICATION PARTITION (counts sum per file) ===');
  for (const c of captures) {
    const seen = new Set();
    const rows = [];
    for (const r of c.records) {
      const key = r.kind + ' ' + r.file + ' ' + r.needle;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...r, ...classify(r, ob) });
    }
    const dup = rows.filter(r => r.verdict === 'DUP');
    console.log('--- ' + c.relPath);
    console.log('    distinct assertions : ' + rows.length);
    console.log('    DUP                 : ' + dup.length);
    console.log('    KEEP                : ' + (rows.length - dup.length));
    console.log('    sums                : ' + (dup.length + (rows.length - dup.length) === rows.length ? 'OK' : 'MISMATCH'));
    const byBlock = {};
    for (const d of dup) byBlock[d.block] = (byBlock[d.block] || 0) + 1;
    for (const [blk, n] of Object.entries(byBlock).sort((a, b) => b[1] - a[1])) {
      console.log('      ' + String(n).padStart(3) + '  ' + blk);
    }
  }
  console.log('\nA DUP is a candidate only. Before deleting one, prove it in the SUBTRACTION direction:');
  console.log('remove the assertion, then remove that token from the surface it named, and confirm');
  console.log('test-route-reachability goes RED. Green there means coverage was lost, not duplicated.');
}

if (require.main === module) main();

module.exports = { recordValidator, staticCallSites, buildObligations, classify, VALIDATORS };
