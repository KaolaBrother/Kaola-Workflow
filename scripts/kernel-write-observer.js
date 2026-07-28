#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kernel-write-observer — a `node --require` preload that records EVERY filesystem write
// landing inside a `kaola-workflow/{project}/` folder, in this process and (because
// NODE_OPTIONS is inherited) in every node child it spawns.
//
// Why a preload and not a static scan: the atomic-write obligation is a claim about what
// actually happens at runtime, and a static scan can only ever read the call sites it knows
// how to resolve. A write reaching a kernel record through a helper, a callback, an injected
// `writeFile` option, or a spawned CLI is invisible to grep and fully visible here.
//
// INERT unless `KAOLA_KERNEL_WRITE_LOG` names an output file. Nothing is patched, nothing is
// written, and no output is produced when the variable is absent — so shipping this file costs
// a normal run nothing, and the observer can never alter a run's behavior. It never writes to
// stdout/stderr (suites assert on those) and never throws out of a hook: an observer that can
// change an outcome is not an observer.
//
// Output: one JSON object per line, appended.
//   { api, rel, abs, flags?, from? }
//     api  — 'writeFileSync' | 'appendFileSync' | 'copyFileSync' | 'openSync' | 'createWriteStream'
//            | 'writeFile' | 'appendFile' | 'rename'
//     rel  — the project-relative path (see projectRelativeArtifactPath)
//     from — for 'rename': the source, and whether it was an atomic-replace temp file
//
// The atomic-replace sequence is recognized from the event stream alone: `writeFileAtomicReplace`
// creates `.<basename>.<pid>.<ms>.<rand>.tmp` beside the target, fsyncs it, and renames it onto
// the target. So a rename whose SOURCE matches that temp shape is an atomic write of its
// destination, and no other event needs to be trusted to know it.
// ---------------------------------------------------------------------------

const LOG = process.env.KAOLA_KERNEL_WRITE_LOG;

if (LOG) {
  const fs = require('fs');
  const path = require('path');

  // The temp-file shapes of an atomic replace, matched on the BASENAME so they are independent of
  // where the project folder sits. Two exist in the tree and the observer recognizes the SHAPE, not
  // the helper — "write a fresh temp path, fsync it, rename it onto the target" is the property that
  // matters, and a second implementation of it is not a second-class one:
  //   `.<base>.<pid>.<ms>.<rand>.tmp`  writeFileAtomicReplace (adaptive-schema.js)
  //   `<base>.tmp-<pid>-<hex>`         the re-plan source publisher (adaptive-node.js)
  const ATOMIC_TMP = /(^\..+\.\d+\.\d+\.[0-9a-z]+\.tmp$)|(\.tmp-\d+-[0-9a-f]+$)/;

  // Resolve to the project-relative artifact path, or null. Loaded lazily and defensively: the
  // observer must stay inert if the schema module is mid-edit or unavailable.
  let toRel = null;
  function relOf(p) {
    if (toRel === null) {
      try {
        toRel = require('./kaola-workflow-adaptive-schema').projectRelativeArtifactPath;
      } catch (_) { toRel = false; }
    }
    if (!toRel) return null;
    try { return toRel(path.resolve(String(p))); } catch (_) { return null; }
  }

  const realAppend = fs.appendFileSync.bind(fs);
  let depth = 0;                    // reentrancy guard: the observer's own write must not log
  function emit(event) {
    if (depth) return;
    depth++;
    try { realAppend(LOG, JSON.stringify(event) + '\n'); } catch (_) { /* never throw */ }
    depth--;
  }

  // callerOf — the first stack frame outside this observer and outside node internals, as
  // `<basename>:<line>`. This is what makes the observation an audit of PRODUCTION writers rather
  // than of whatever fixture code a suite happens to run: a fixture writing `workflow-plan.md`
  // directly is a legitimate test setup, while a production script doing it is the defect.
  const SELF = path.basename(__filename);
  const FRAME_DEPTH = 8;
  function framesOf() {
    const stack = new Error().stack || '';
    const out = [];
    for (const line of stack.split('\n').slice(1)) {
      const m = /\(?((?:\/|[A-Za-z]:\\)[^()]+?):(\d+):\d+\)?$/.exec(line.trim());
      if (!m) continue;
      const file = m[1];
      const base = path.basename(file);
      if (base === SELF) continue;
      if (file.startsWith('node:')) continue;
      out.push(base + ':' + m[2]);
      if (out.length >= FRAME_DEPTH) break;
    }
    return out;
  }

  function record(api, target, extra) {
    try {
      if (typeof target !== 'string') return;          // fd writes carry no path; the open did
      const base = path.basename(target);
      if (ATOMIC_TMP.test(base)) return;               // transient half of an atomic replace
      const rel = relOf(target);
      if (!rel) return;
      emit(Object.assign({ api, rel, abs: path.resolve(target), frames: framesOf() }, extra || {}));
    } catch (_) { /* never throw */ }
  }

  // A write-intent open. Read-only opens are not writes and are not recorded.
  function isWriteFlag(flags) {
    if (flags === undefined || flags === null) return false;
    if (typeof flags === 'number') return (flags & 3) !== 0 || (flags & 0o100) !== 0;
    const f = String(flags);
    return f.includes('w') || f.includes('a') || f.includes('+');
  }

  const wrap = (name, handler) => {
    const original = fs[name];
    if (typeof original !== 'function') return;
    fs[name] = function (...args) {
      try { handler(args); } catch (_) { /* never throw */ }
      return original.apply(this, args);
    };
  };

  wrap('writeFileSync', args => record('writeFileSync', args[0]));
  wrap('appendFileSync', args => record('appendFileSync', args[0]));
  wrap('writeFile', args => record('writeFile', args[0]));
  wrap('appendFile', args => record('appendFile', args[0]));
  wrap('createWriteStream', args => record('createWriteStream', args[0]));
  wrap('copyFileSync', args => record('copyFileSync', args[1]));
  wrap('copyFile', args => record('copyFile', args[1]));
  wrap('truncateSync', args => record('truncateSync', args[0]));
  wrap('openSync', args => { if (isWriteFlag(args[1])) record('openSync', args[0], { flags: String(args[1]) }); });
  wrap('open', args => { if (isWriteFlag(args[1])) record('open', args[0], { flags: String(args[1]) }); });
  wrap('renameSync', args => {
    const from = String(args[0]);
    record('rename', args[1], { from, atomic_tmp: ATOMIC_TMP.test(path.basename(from)) });
  });
  wrap('rename', args => {
    const from = String(args[0]);
    record('rename', args[1], { from, atomic_tmp: ATOMIC_TMP.test(path.basename(from)) });
  });

  // fs.promises mirrors the same surface through a separate object.
  try {
    const p = fs.promises;
    const wrapP = (name, handler) => {
      const original = p[name];
      if (typeof original !== 'function') return;
      p[name] = function (...args) {
        try { handler(args); } catch (_) {}
        return original.apply(this, args);
      };
    };
    wrapP('writeFile', args => record('writeFile', args[0]));
    wrapP('appendFile', args => record('appendFile', args[0]));
    wrapP('copyFile', args => record('copyFile', args[1]));
    wrapP('rename', args => {
      const from = String(args[0]);
      record('rename', args[1], { from, atomic_tmp: ATOMIC_TMP.test(path.basename(from)) });
    });
  } catch (_) { /* never throw */ }
}

// ---------------------------------------------------------------------------
// The reducer side. Exported so the conformance suite (and any later kill-test harness) reads an
// observation stream through ONE implementation.
//
// PRODUCTION_WRITER — the file whose write is subject to the atomic obligation. A suite's own
// fixture setup writes kernel paths directly all the time and must: it is building the state a
// production run would already have. So a direct write counts against production only when the
// INNERMOST frame — the line that actually called the fs API — is a production script.
//
// Innermost, not "first production frame anywhere in the stack", and the difference is not
// cosmetic: several suites inject a plain `writeFile` test double into a production entry point.
// A rule that scanned downward for the first production frame would credit that double's write to
// the production caller sitting one frame below it and report a defect that does not exist. The
// first draft of this reducer did exactly that, on three real paths.
const PRODUCTION_WRITER = /^kaola-workflow-[a-z0-9-]+\.js:\d+$/;

// The atomic-replace helper lives in the schema module, so the frame performing the rename is
// always inside it. For an atomic write the useful attribution is the caller ABOVE the helper,
// which is why that one lookup does scan downward — it is reporting, not adjudication.
const ATOMIC_HELPER = 'kaola-workflow-adaptive-schema.js';

// productionFrame — `innermost` (the default) adjudicates: production iff frames[0] is production.
// `skipHelper` reports: the nearest production frame that is not the atomic helper itself.
function productionFrame(frames, opts) {
  const list = Array.isArray(frames) ? frames : [];
  if (opts && opts.skipHelper) {
    for (const frame of list) {
      if (!PRODUCTION_WRITER.test(frame)) continue;
      if (frame.startsWith(ATOMIC_HELPER + ':')) continue;
      return frame;
    }
    return null;
  }
  return (list.length && PRODUCTION_WRITER.test(list[0])) ? list[0] : null;
}

// reduceObservedWrites — fold an observation log into a per-path verdict.
//
// Returns { paths: Map<rel, { atomic:Set<origin>, direct:Map<api, Set<frame>> }>, events }.
//   atomic — the path was replaced atomically; the set names the calling site above the helper.
//   direct — PRODUCTION frames that wrote the path in place, keyed by API. Fixture writes are not
//            recorded here at all, so a non-empty `direct` is by construction a production writer.
// A path may carry both (a fixture seeds what production later replaces atomically); only `direct`
// is adjudicated.
function reduceObservedWrites(text) {
  const paths = new Map();
  const events = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch (_) { continue; }
    if (!event || typeof event.rel !== 'string') continue;
    events.push(event);
    if (!paths.has(event.rel)) paths.set(event.rel, { atomic: new Set(), direct: new Map() });
    const slot = paths.get(event.rel);
    if (event.api === 'rename' && event.atomic_tmp === true) {
      slot.atomic.add(productionFrame(event.frames, { skipHelper: true }) || 'external');
      continue;
    }
    const frame = productionFrame(event.frames);
    if (!frame) continue;                      // fixture / harness write — not the audit's subject
    if (!slot.direct.has(event.api)) slot.direct.set(event.api, new Set());
    slot.direct.get(event.api).add(frame);
  }
  return { paths, events };
}

module.exports = { reduceObservedWrites, productionFrame, PRODUCTION_WRITER };
