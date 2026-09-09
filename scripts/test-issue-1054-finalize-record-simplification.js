#!/usr/bin/env node
'use strict';

// Issue #1054 (bundle-1054, mission 6): finalize stops turning the orchestrator's human records
// into machine interfaces. TEST CUSTODY ONLY — no production code here.
//
// Pins audit items 1, 2, 3, 4, 5, 6, 7, 8 (the consumer side of item 23) from the rewritten issue
// body's "已核实的消费者与迁移落点" section, against docs/decisions/0017-the-mission-list.md:
//
//   A. Run gaps / gap-sweep no longer gate finalize; ARCHIVE_CACHE_SIDECAR_MD drops
//      `run-gaps-manual.md`; a kept scanner must not read that file.
//   B. The backlog-delta statistic (`follow_ups_filed` / `follow_up_numbers` / `net_backlog_delta`)
//      is retired: no format of `## Run gaps` produces a differing (or any) statistic.
//   C. One docking evidence file (`doc-docking.md`); `doc-updater.md` is no longer required or
//      cited by ARCHIVE_CACHE_SIDECAR_MD.
//   D. The generated Finalize surfaces (all 6: github/gitlab/gitea x command/skill, one skeleton)
//      stop instructing: issue-body-length transcription, writing a follow-up into a completed
//      Mission's `result`, the `## Run gaps` grammar / gap-sweep gate, and "## Mission List" as a
//      finalize-finding landing place — while KEEPING, as concept not wording: separating measured
//      facts from hypotheses, recording the duplicate-search probe, and confirming a filed issue
//      exists with a non-empty body.
//
// Group A/B/C touch the four claim/gap-sweep/closure-audit trees this repo carries per edition
// (canonical, codex, gitlab, gitea) at the SOURCE level (static, byte-cheap) and at the BEHAVIOR
// level on the canonical tree (a real `finalize` CLI transaction) — mirroring the split
// scripts/test-forge-finalize-findings.js uses (static registry parity + one real driven run).
// Group D is a single skeleton rendered in memory across all 6 registered surfaces, the same
// pattern scripts/test-issue-1053-next-task-quality.js uses for skeleton-sourced surfaces.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('  FAIL: ' + msg);
}
function eq(actual, expected, msg) {
  assert(actual === expected, msg + '\n    expected: ' + JSON.stringify(expected) + '\n    actual:   ' + JSON.stringify(actual));
}

// ---------------------------------------------------------------------------
// The four claim/gap-sweep/closure-audit trees, named the way
// scripts/test-forge-finalize-findings.js names its EDITIONS.
// ---------------------------------------------------------------------------
const EDITIONS = Object.freeze([
  {
    key: 'canonical',
    claim: 'scripts/kaola-workflow-claim.js',
    gapSweep: 'scripts/kaola-workflow-gap-sweep.js',
    closureAudit: 'scripts/kaola-workflow-closure-audit.js',
  },
  {
    key: 'codex',
    claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    gapSweep: 'plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js',
    closureAudit: 'plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js',
  },
  {
    key: 'gitlab',
    claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    gapSweep: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js',
    closureAudit: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js',
  },
  {
    key: 'gitea',
    claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    gapSweep: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js',
    closureAudit: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js',
  },
]);

function readTree(rel) {
  const abs = path.join(REPO, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

// =================================================================================================
// GROUP A — gap-sweep / run-gaps no longer gate finalize (audit items 1, 2, 4). STATIC, four trees.
// =================================================================================================

for (const ed of EDITIONS) {
  const src = readTree(ed.claim);
  assert(src !== null, 'A: ' + ed.key + ' claim script exists at ' + ed.claim);
  if (src === null) continue;

  // A1: ARCHIVE_CACHE_SIDECAR_MD (the archive-completeness exemption set) no longer names
  // `run-gaps-manual.md` — the manual gap-registration sidecar the free-text gate consumed.
  const setBlock = src.match(/ARCHIVE_CACHE_SIDECAR_MD\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert(setBlock !== null, 'A1: ' + ed.key + ': ARCHIVE_CACHE_SIDECAR_MD is readable from ' + ed.claim);
  const shipped = setBlock ? (setBlock[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)) : [];
  assert(!shipped.includes('run-gaps-manual.md'),
    'A1: ' + ed.key + ': ARCHIVE_CACHE_SIDECAR_MD must not list run-gaps-manual.md any more (#1054 '
    + 'item 4 — the manual gap-registration chain is retired); got ' + JSON.stringify(shipped));

  // A2 (audit item 3): the backlog-delta statistic and its computation are retired outright, not
  // merely decoupled from the gap section — no format of `## Run gaps` may leave ANY trace of it.
  for (const token of ['follow_ups_filed', 'follow_up_numbers', 'net_backlog_delta',
    'followUpsFiled', 'followUpNumbers', 'netBacklogDelta', 'computeBacklogDelta']) {
    assert(!src.includes(token),
      'A2: ' + ed.key + ': ' + ed.claim + ' must carry no trace of the retired backlog-delta '
      + 'statistic (#1054 item 3) — found token ' + JSON.stringify(token));
  }
}

for (const ed of EDITIONS) {
  const src = readTree(ed.gapSweep);
  // A3: if a scanner script is kept at all (as an optional diagnostic, per the issue body), it must
  // not read the hand-written manual-seed sidecar any more — that chain is retired, not merely
  // decoupled from finalize.
  if (src === null) continue; // deleting the file outright also satisfies the constraint
  assert(!src.includes('run-gaps-manual.md'),
    'A3: ' + ed.key + ': ' + ed.gapSweep + ' is kept but still reads .cache/run-gaps-manual.md — '
    + 'a kept optional diagnostic must not read the retired manual-seed sidecar (#1054 item 1/4)');
}

// A4 (BEHAVIORAL, canonical): a scanner run over a .cache/ that carries a run-gaps-manual.md must
// not surface any manual: reasonClass from it — proving the file is not merely unused by finalize
// but genuinely not read, whatever the scanner still does with chain-receipt.json.
(function A4_scannerIgnoresManualSeedFile() {
  const gapSweepPath = path.join(REPO, 'scripts', 'kaola-workflow-gap-sweep.js');
  if (!fs.existsSync(gapSweepPath)) return; // file retired outright — nothing to drive
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1054-gapsweep-'));
  try {
    const project = 'issue-99001';
    const cacheDir = path.join(tmp, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'run-gaps-manual.md'),
      'gap: a-real-observation — something this run actually saw\n');
    const r = spawnSync(process.execPath, [gapSweepPath, '--project', project, '--json'], {
      cwd: tmp, encoding: 'utf8', timeout: 30000,
      env: Object.assign({}, process.env, { KAOLA_GAP_ROOT: tmp }),
    });
    let out = null;
    try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) { out = null; }
    assert(out !== null, 'A4: scanner run produced parseable JSON; stdout=' + JSON.stringify(r.stdout));
    const classes = out && Array.isArray(out.sweptClasses) ? out.sweptClasses : [];
    assert(!classes.some(c => String(c.reasonClass || '').startsWith('manual:')),
      'A4: a scan over a .cache/ carrying run-gaps-manual.md must not emit any manual: reasonClass '
      + '(#1054 item 1/4 — the manual seed file is no longer read); got ' + JSON.stringify(classes));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

// =================================================================================================
// GROUP B — the backlog-delta statistic is retired, format-independently (audit item 3). BEHAVIORAL,
// canonical tree: a real `finalize` transaction, three legs over the SAME claimed set differing only
// in how `## Run gaps` is written (canonical bullets / free prose / a markdown table).
// =================================================================================================

const claimScript = path.join(REPO, 'scripts', 'kaola-workflow-claim.js');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema.js');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1054-finrec-'));
}
function sh(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + r.stderr);
  return r;
}
function initGitRepo(tmp) {
  fs.mkdirSync(tmp, { recursive: true });
  sh(tmp, ['init', '-q', '-b', 'main']);
  sh(tmp, ['config', 'user.email', 'test@example.test']);
  sh(tmp, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  sh(tmp, ['add', 'README.md']);
  sh(tmp, ['commit', '-q', '-m', 'init']);
}
function seedFinalizeFixture(tmpRoot, project) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  let cand = '';
  try {
    cand = adaptiveSchema.computeCodeTreeHash(tmpRoot, project, adaptiveSchema.VALIDATION_TEST_CONSUMES) || '';
  } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}
function writeSingleStateFile(tmpRoot, project, issueNumber) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'runtime: claude', 'step: complete', 'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project, 'main_session_role: orchestrator',
    'implementation_owner: N/A', 'fix_owner: N/A', 'inline_emergency_fallback_authorized: no', '',
    '## Pending Gates', '- finalization', '', '## Last Evidence', 'phase_file: N/A',
    'cache_file: N/A', 'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', new Date().toISOString(), '', '## Sink',
    'branch: workflow/issue-' + issueNumber, 'issue_number: ' + issueNumber, 'sink: merge',
    'run_posture: in-place',
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), lines.join('\n') + '\n');
  seedFinalizeFixture(tmpRoot, project);
}
function writeGhMock(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "'use strict';",
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'if (a.includes("repo view")) {',
    '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
    '  process.exit(0);',
    '}',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  process.stdout.write(JSON.stringify({number:parseInt(viewM[1]),state:"open",title:"t",body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (/^issue close /.test(a)) { process.stdout.write("\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("api")) { process.exit(0); }',
    'process.stdout.write("\\n");',
    'process.exit(0);',
  ].join('\n'));
}
function runFinalize(args, cwd, binDir) {
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '0',
      KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
    }),
  });
}
function parseOutput(result) {
  const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}
function closureBlockFields(dest) {
  let s = '';
  try { s = fs.readFileSync(path.join(dest, 'workflow-state.md'), 'utf8'); } catch (_) { return null; }
  const m = s.match(/^## Closure$/m);
  if (!m) return null;
  const rest = s.slice(m.index + m[0].length);
  const end = rest.indexOf('\n## ');
  const fields = {};
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// One leg: a single-issue finalize on the merge lane, with the given `## Run gaps` body (or null
// for "write no summary at all"). Returns the archived closure block fields.
function runGapFormatLeg(label, issueNumber, project, gapSectionBody) {
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeSingleStateFile(tmpRoot, project, issueNumber);
    if (gapSectionBody !== null) {
      fs.writeFileSync(
        path.join(tmpRoot, 'kaola-workflow', project, 'finalization-summary.md'),
        '# Finalization Summary\n\n## Run gaps\n\n' + gapSectionBody);
    }
    writeGhMock(binDir);
    const result = runFinalize(['finalize', '--project', project, '--keep-worktree'], tmpRoot, binDir);
    const out = parseOutput(result);
    return {
      label, status: result.status, out,
      fields: out && out.dest ? closureBlockFields(out.dest) : null,
      stderr: result.stderr,
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

(function B_backlogDeltaRetiredFormatIndependently() {
  console.log('B: the backlog-delta statistic is gone from the ## Closure block, for every ## Run gaps format');

  const legs = [
    runGapFormatLeg('canonical-bullets', 98801, 'issue-98801',
      '- manual:flaky-probe (a transient probe timeout): filed: #8801\n'
      + '- manual:slow-suite (the suite ran long): filed: #8802\n'),
    runGapFormatLeg('free-prose', 98802, 'issue-98802',
      'Nothing to report. The run swept clean and filed one follow-up, #8801, already covered above.\n'),
    runGapFormatLeg('markdown-table', 98803, 'issue-98803',
      '| Gap | Disposition |\n|---|---|\n| a transient probe timeout | filed: #8801 |\n'
      + '| the suite ran long | filed: #8802 |\n'),
    runGapFormatLeg('no-summary-at-all', 98804, 'issue-98804', null),
  ];

  for (const leg of legs) {
    assert(leg.status === 0,
      'B (' + leg.label + '): finalize must exit 0 regardless of ## Run gaps layout; got ' + leg.status
      + '\nstderr: ' + String(leg.stderr || '').slice(0, 400));
    assert(leg.fields !== null,
      'B (' + leg.label + '): the archived state must carry a parseable ## Closure block; dest='
      + JSON.stringify(leg.out && leg.out.dest));
  }

  for (const leg of legs) {
    const f = leg.fields || {};
    for (const key of ['follow_ups_filed', 'follow_up_numbers', 'net_backlog_delta']) {
      assert(!(key in f),
        'B (' + leg.label + '): the ## Closure block must carry no ' + key + ' line at all — #1054 '
        + 'item 3 retires the statistic outright, not merely its accuracy; got ' + JSON.stringify(f));
    }
  }

  // The property the issue states directly: different legitimate expressions/layouts of the SAME
  // filed follow-ups must not produce a differing statistic ANYWHERE — proven here as producing NO
  // statistic (a stronger form: not merely "the same wrong number", but nothing at all) across
  // three formats that, under the retired mechanism, produced three DIFFERENT results (2, unknown,
  // unknown respectively for follow_ups_filed).
  const nonTimestampFields = obj => {
    const clone = Object.assign({}, obj);
    delete clone.archived_at;
    return clone;
  };
  eq(JSON.stringify(nonTimestampFields(legs[0].fields)), JSON.stringify(nonTimestampFields(legs[1].fields)),
    'B: canonical-bullets and free-prose ## Run gaps layouts must leave an identical ## Closure '
    + 'block (module archived_at) — no format-dependent statistic survives');
  eq(JSON.stringify(nonTimestampFields(legs[0].fields)), JSON.stringify(nonTimestampFields(legs[2].fields)),
    'B: canonical-bullets and markdown-table ## Run gaps layouts must leave an identical ## Closure '
    + 'block (module archived_at) — no format-dependent statistic survives');

  // issues_closed (a genuinely measured, non-retired field) must still be present and correct —
  // this suite retires the backlog-delta STATISTIC, not the whole ## Closure block.
  for (const leg of legs) {
    assert((leg.fields || {}).issues_closed === '1',
      'B (' + leg.label + '): issues_closed is unrelated to the retired statistic and must still be '
      + 'recorded; got ' + JSON.stringify(leg.fields));
  }
})();

// =================================================================================================
// GROUP C — one docking evidence file (audit item 5). doc-updater.md is no longer required or cited.
// =================================================================================================

for (const ed of EDITIONS) {
  const src = readTree(ed.claim);
  if (src === null) continue;
  const setBlock = src.match(/ARCHIVE_CACHE_SIDECAR_MD\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const shipped = setBlock ? (setBlock[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)) : [];
  assert(!shipped.includes('doc-updater.md'),
    'C1: ' + ed.key + ': ARCHIVE_CACHE_SIDECAR_MD must not list doc-updater.md any more (#1054 item '
    + '5 — one docking evidence file, doc-docking.md) — got ' + JSON.stringify(shipped));
  assert(shipped.includes('doc-docking.md'),
    'C1: ' + ed.key + ': ARCHIVE_CACHE_SIDECAR_MD must still list doc-docking.md — the one surviving '
    + 'docking evidence file; got ' + JSON.stringify(shipped));
}

// C2: closure-audit's citation-completeness check (archiveCitedMissing) must not report anything
// missing for an archive whose finalization-summary.md cites only `.cache/doc-docking.md` (present)
// and never mentions doc-updater.md at all — a run whose only doc evidence is doc-docking.md is a
// complete archive, not one flagged for a file it never claimed to hold. Driven directly against the
// exported function (same style test-finalize-door.js and test-bundle-finalize.js use for
// closure-audit internals) rather than the CLI, since root-resolution is not this pin's concern.
(function C2_closureAuditAcceptsDocDockingAlone() {
  const closureAudit = require('./kaola-workflow-closure-audit.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1054-closureaudit-'));
  try {
    fs.mkdirSync(path.join(tmp, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'finalization-summary.md'),
      '# Finalization Summary\n\nDocumentation Docking: DOCKED, see `.cache/doc-docking.md`.\n');
    fs.writeFileSync(path.join(tmp, '.cache', 'doc-docking.md'), 'DOCKED\nchecked: README.md\n');
    // deliberately no doc-updater.md anywhere in this archive
    const missing = closureAudit.archiveCitedMissing(tmp);
    assert(Array.isArray(missing) && missing.length === 0,
      'C2: an archive citing only doc-docking.md (present) must report no missing citations; got '
      + JSON.stringify(missing));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

// =================================================================================================
// GROUP D — the generated Finalize surfaces (audit items 6, 7, 8 + Mission List landing). Meaning,
// not wording; rendered in memory across all 6 registered surfaces from the one canonical skeleton.
// =================================================================================================

const gen = require('./generate-routing-surfaces.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
const ir = { slots: SLOTS, splices: SPLICES };

const finalizeRows = gen.GENERATED_SURFACES.filter(r => r.topic === 'finalize');
eq(finalizeRows.length, 6, 'D: GENERATED_SURFACES carries exactly six finalize rows (3 forges x command+skill)');

// sentenceWindows/conceptPresent — small paraphrase-tolerant detector, same technique
// scripts/test-issue-1053-next-task-quality.js uses for skeleton-sourced meaning pins: a concept is
// present when every fragment regex co-occurs within one 1- or 2-sentence window, so a rewrap or a
// rephrase that preserves meaning still passes and this suite is not pinning the author's sentence.
function sentenceWindows(text) {
  const sentences = String(text || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const windows = sentences.slice();
  for (let i = 0; i < sentences.length - 1; i++) windows.push(sentences[i] + ' ' + sentences[i + 1]);
  return windows;
}
function conceptPresent(text, fragments) {
  return sentenceWindows(text).some(w => fragments.every(re => re.test(w)));
}

const renderedByRow = new Map();
for (const row of finalizeRows) {
  let rendered = null;
  try {
    rendered = gen.renderSkeleton(gen.loadSkeleton(row.skeleton, row.topic),
      { surface_type: row.surface_type, forge: row.forge }, ir);
  } catch (e) {
    assert(false, 'D: render ' + row.path + ' did not throw: ' + e.message);
  }
  renderedByRow.set(row.path, rendered);
}

for (const row of finalizeRows) {
  const rendered = renderedByRow.get(row.path) || '';
  const label = row.path;

  // D-neg-1 (item 1/4): no gap-sweep / ## Run gaps free-text-gate instruction survives anywhere.
  for (const needle of ['gap-sweep', 'Run gaps', 'run-gaps-manual.md', 'run-gaps.json']) {
    assert(!rendered.includes(needle),
      'D1: ' + label + ' must carry no ' + JSON.stringify(needle) + ' — the run-gap free-text gate '
      + 'and its reconciliation instructions are retired (#1054 items 1, 2, 4)');
  }

  // D-neg-2 (item 6): no issue-body-length transcription instruction.
  assert(!/body length/i.test(rendered),
    'D2: ' + label + ' must not instruct recording the issue body length (#1054 item 6)');

  // D-neg-3 (item 7): a filed follow-up's record must not land in a completed Mission's `result`
  // line — ADR 0017 holds completed Mission results immutable, and Finalization is not a Mission
  // List item, so nothing here may write new facts back into one.
  assert(!/mission list.{0,20}result line|mission.{0,10}result.{0,10}line/i.test(rendered),
    'D3: ' + label + ' must not describe a filed follow-up\'s record as "the mission list\'s result '
    + 'line" (#1054 item 7 — new facts land in the finalize transaction\'s own record, never a '
    + 'completed Mission result)');

  // D-neg-4 (item 8 / Mission List landing): the sentence naming where the finalize transaction's
  // own findings land must not include "## Mission List" — Mission List holds completed, immutable
  // run results, not finalize's own discoveries.
  const landIdx = rendered.indexOf('findings land');
  if (landIdx !== -1) {
    const windowText = rendered.slice(Math.max(0, landIdx - 200), landIdx + 20);
    assert(!/##\s*Mission List/.test(windowText),
      'D4: ' + label + ' names "## Mission List" as a landing place for the finalize transaction\'s '
      + 'own findings (#1054 item 8) — window: ' + JSON.stringify(windowText));
  }

  // D-pos-1: the measured/hypothesis distinction must survive as a concept.
  assert(conceptPresent(rendered,
    [/measured/i, /observ/i]) && conceptPresent(rendered, [/hypothesis/i, /(attribut|not.{0,15}confirm)/i]),
    'D5: ' + label + ' must still separate measured facts (what this run observed) from hypotheses '
    + '(unconfirmed attributions) as a concept, even though #1054 retires other prose scaffolding');

  // D-pos-2: recording the duplicate-search probe (query + hit count) must survive as a concept.
  assert(conceptPresent(rendered, [/duplicate/i, /(search|probe)/i]),
    'D6: ' + label + ' must still instruct recording the duplicate-search probe actually run');

  // D-pos-3: confirming a filed issue exists with a non-empty body must survive as a concept.
  assert(conceptPresent(rendered, [/confirm/i, /exist/i, /(non-empty|not empty)/i]),
    'D7: ' + label + ' must still instruct confirming a filed issue exists with a non-empty body');
}

// D8: generated-surface byte identity is the standing `generate-routing-surfaces.js --check` step
// (already in both claude chains) and is not re-pinned here; this suite is about MEANING, not bytes.

// ---------------------------------------------------------------------------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
