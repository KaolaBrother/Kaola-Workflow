#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitlab-workflow-gap-sweep.js (issue #435 — run-gap capture gate)
//
// Machine-verifiable gap capture. Scans the per-project .cache/ for run-
// discovered defect signals, deduplicates them by (reasonClass, sample),
// writes a structured run-gaps artifact, and optionally gates finalization by
// checking that every swept gap has been mapped in the ## Run gaps section of
// the finalization summary.
//
// Usage:
//   node kaola-gitlab-workflow-gap-sweep.js --project <name> [options]
//
// Subcommands / modes:
//   (default)   Scanner: scan .cache/, write artifact, emit JSON if --json.
//   --check     Gate: read artifact + summary ## Run gaps section; pass or refuse.
//
// Options:
//   --project <name>          REQUIRED — project folder under kaola-workflow/.
//   --json                    Emit a JSON summary line to stdout.
//   --check                   Gate mode (reads existing artifact + summary).
//   --summary <path>          Override finalization-summary.md path.
//                             Default: kaola-workflow/<P>/finalization-summary.md
//   --output <path>           Override artifact path.
//                             Default: kaola-workflow/<P>/.cache/run-gaps.json
//   --offline                 Skip live issue-existence probe (always skipped
//                             when KAOLA_WORKFLOW_OFFLINE is set).
//   -h / --help               Print usage.
//
// Root override (for tests):
//   KAOLA_GAP_ROOT=<dir>      Use <dir> as the repo root instead of process.cwd().
//
// Reason classes (closed enum):
//   in_run_repair             nodeId with >1 open event in provenance-log.jsonl
//   deferred_red_chain        chain in chain-receipt.json with accepted_red:true
//   manual:<kebab-slug>       lines in .cache/run-gaps-manual.md (gap: <class> — <text>)
//
// FORGE-NEUTRAL: this file invokes no forge-specific CLI binary or brand name
// and makes no forge API calls. The codex plugin copy is byte-identical; the
// gitlab/gitea ports are rename-normalised identical.
// ---------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isOffline() {
  return process.env.KAOLA_WORKFLOW_OFFLINE === '1' ||
         process.env.KAOLA_WORKFLOW_OFFLINE === 'true';
}

// Slugify a free-form string into a kebab identifier.
function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'gap';
}

// ---------------------------------------------------------------------------
// Scanner helpers
// ---------------------------------------------------------------------------

// Read provenance-log.jsonl and return in_run_repair items.
// A nodeId with >1 open event = one item per unique nodeId; count = extra opens.
function scanProvenance(cacheDir) {
  const p = path.join(cacheDir, 'provenance-log.jsonl');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const openCounts = {};  // nodeId -> number of open events
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let obj;
    try { obj = JSON.parse(l); } catch (_) { continue; }
    if (obj.event === 'open' && obj.nodeId) {
      openCounts[obj.nodeId] = (openCounts[obj.nodeId] || 0) + 1;
    }
  }
  const items = [];
  for (const [nodeId, cnt] of Object.entries(openCounts)) {
    if (cnt > 1) {
      items.push({ reasonClass: 'in_run_repair', sample: nodeId, count: cnt - 1 });
    }
  }
  return items;
}

// Read chain-receipt.json and return deferred_red_chain items.
function scanChainReceipt(cacheDir) {
  const p = path.join(cacheDir, 'chain-receipt.json');
  if (!fs.existsSync(p)) return [];
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return []; }
  const chains = Array.isArray(receipt.chains) ? receipt.chains : [];
  return chains
    .filter(ch => ch.accepted_red === true)
    .map(ch => ({
      reasonClass: 'deferred_red_chain',
      sample: ch.name + ':' + ch.accepted_red_issue,
      count: 1,
    }));
}

// Read optional run-gaps-manual.md and return manual:<slug> items.
// Line grammar: "gap: <class> — <text>" (em-dash or simple dash accepted).
function scanManual(cacheDir) {
  const p = path.join(cacheDir, 'run-gaps-manual.md');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const items = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('gap:')) continue;
    // Strip "gap: " prefix then split on em-dash (—) or " - ".
    const body = l.slice(4).trim();
    let cls, text;
    // Support both em-dash and ASCII dash separator.
    const emIdx = body.indexOf('—');
    const dashIdx = body.indexOf(' - ');
    if (emIdx !== -1) {
      cls  = body.slice(0, emIdx).trim();
      text = body.slice(emIdx + 1).trim();
    } else if (dashIdx !== -1) {
      cls  = body.slice(0, dashIdx).trim();
      text = body.slice(dashIdx + 3).trim();
    } else {
      cls  = body;
      text = body;
    }
    const slug = toKebab(cls);
    items.push({ reasonClass: 'manual:' + slug, sample: text || cls, count: 1 });
  }
  return items;
}

// Deduplicate items by (reasonClass, sample). For duplicates, sum counts.
function dedup(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.reasonClass + '\0' + item.sample;
    if (map.has(key)) {
      map.get(key).count += item.count;
    } else {
      map.set(key, { reasonClass: item.reasonClass, sample: item.sample, count: item.count });
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Scanner (default mode)
// ---------------------------------------------------------------------------

function runScan(opts) {
  const { project, outputPath, asJson, root } = opts;
  const projectDir = path.join(root, 'kaola-workflow', project);
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);

  // #675: the active project folder is gone (already archived by cmdFinalize) while an archived
  // copy exists. The scanner only ever reads the ACTIVE .cache/ tree — scanning here would (a)
  // recreate a stray active kaola-workflow/<project>/ dir via the mkdirSync below, and (b) with an
  // explicit --output pointed at the archive, silently overwrite the archived run-gaps.json with an
  // empty re-scan. Refuse loudly instead of ever touching either path. A project that was never
  // claimed at all (neither active nor archived) is unaffected — that is the pre-existing vacuous
  // first-scan case, not the archived-project case this refusal targets.
  if (!fs.existsSync(projectDir) && fs.existsSync(archiveDir)) {
    const detail = 'project ' + project + ' is already archived at kaola-workflow/archive/' + project +
      '; the scanner only reads the active .cache/ tree and never re-scans or writes into an ' +
      'archived project. Run the scanner BEFORE cmdFinalize archives the project, or inspect ' +
      'kaola-workflow/archive/' + project + '/.cache/run-gaps.json directly.';
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'project_archived',
        detail,
      }) + '\n');
    } else {
      process.stderr.write('gap-sweep: ' + detail + '\n');
    }
    return 1;
  }

  const cacheDir = path.join(projectDir, '.cache');

  // #679/#681: the #675 refusal above only fires when the ACTIVE project dir is GONE. When a LIVE
  // project dir AND a same-named leftover archive (or any other foreign project) BOTH exist, and the
  // scan runs with an explicit --output aimed at a run-gaps.json that lives OUTSIDE this project's
  // own .cache/, the live scan's result would otherwise silently clobber that foreign/archived
  // run-gaps.json — destroying a prior cycle's durable gap evidence. Refuse whenever the resolved
  // --output path is itself a run-gaps.json file and is not this project's own default artifact
  // path — regardless of whether a file already exists there (#681: a scan must NEVER write a
  // run-gaps.json outside its own .cache/, even into a foreign/archive tree that has no file there
  // yet — leaving that precondition in place let an explicit --output at a NON-EXISTENT foreign
  // run-gaps.json silently write a stray fresh file). A brand-new or differently-named --output path
  // (any basename other than run-gaps.json) is unaffected.
  const ownArtifactPath = path.join(cacheDir, 'run-gaps.json');
  if (
    path.basename(outputPath) === 'run-gaps.json' &&
    path.resolve(outputPath) !== path.resolve(ownArtifactPath)
  ) {
    const detail = '--output ' + outputPath + ' points at a run-gaps.json outside this project\'s own ' +
      '.cache/ (' + ownArtifactPath + '); refusing to write there — a scan must never write a ' +
      'run-gaps.json into a foreign or archived cycle\'s tree, whether or not one already exists. ' +
      'Re-run without --output (writes to the project\'s own .cache/) or point --output at a path ' +
      'that is not named run-gaps.json.';
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'foreign_run_gaps_output',
        detail,
      }) + '\n');
    } else {
      process.stderr.write('gap-sweep: ' + detail + '\n');
    }
    return 1;
  }

  // Scope guard: only read from this project's .cache.
  const raw = [
    ...scanProvenance(cacheDir),
    ...scanChainReceipt(cacheDir),
    ...scanManual(cacheDir),
  ];
  const sweptClasses = dedup(raw);

  // Ensure output directory exists.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const artifact = { project, sweptClasses };
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

  if (asJson) {
    process.stdout.write(JSON.stringify({
      result: 'swept',
      project,
      sweptClasses,
      artifact: outputPath,
    }) + '\n');
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Gate (--check mode)
// ---------------------------------------------------------------------------

// Parse the ## Run gaps section from a summary file.
// Returns an array of { reasonClass, sample, kind, ref } or null if section absent.
function parseGapSection(summaryPath) {
  if (!fs.existsSync(summaryPath)) return null;
  const raw = fs.readFileSync(summaryPath, 'utf8');
  const lines = raw.split('\n');

  let inSection = false;
  const entries = [];

  for (const line of lines) {
    const l = line.trim();
    if (/^## Run gaps\s*$/.test(l)) {
      inSection = true;
      continue;
    }
    // Stop at the next ## heading.
    if (inSection && /^## /.test(l)) break;
    if (!inSection) continue;
    if (!l.startsWith('- ')) continue;

    // Grammar: "- <reasonClass> (<sample>): filed: #N"
    //       OR "- <reasonClass> (<sample>): noise: <text>"
    //
    // The sample group is LAZY — (.+?) — and that quantifier is load-bearing in BOTH directions:
    //   * a negated class ([^)]+) rejects any sample that itself contains ")" (e.g. an API symbol
    //     like "retryAfter(from:)"), so a correctly-written mapping row never parses and the gate
    //     refuses gaps_unswept for a gap the operator did map;
    //   * a GREEDY (.+) backtracks to the LAST "): " in the line, so a legal free-text noise
    //     justification that happens to contain "): filed: #N" is mis-carved into the sample and
    //     the gate refuses observed_gap_unseeded quoting a sample the operator never wrote.
    // Lazy takes the LEFTMOST "): " followed by a valid filed:/noise: tail, which disambiguates
    // both shapes. Do not "simplify" this quantifier.
    const m = l.match(/^-\s+(\S+)\s+\((.+?)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/);
    if (!m) {
      // A line that looks like a mapping attempt but fails the strict grammar used to be dropped
      // silently, and then surfaced far away as a gaps_unswept / observed_gap_unseeded refusal with
      // nothing pointing at the offending line. Warn on that population only: a parenthesised
      // sample immediately followed by a filed:/noise: tail marker. Free-text bullets ("- none",
      // prose notes) are ignored by design for back-compat and must never warn — they carry no
      // "(<sample>): filed:|noise:" shape, so they cannot reach this branch's condition. The
      // warning is advisory: it goes to stderr, never changes the parse result or the exit code,
      // and never contaminates the single --json line on stdout.
      if (/^-\s+.*\(.*\):\s*(filed:|noise:)/.test(l)) {
        process.stderr.write(
          'gap-sweep: ignoring malformed ## Run gaps mapping line (expected ' +
          '"- <class> (<sample>): filed: #N" or "- <class> (<sample>): noise: <text>"): ' + l + '\n'
        );
      }
      continue;
    }
    const reasonClass = m[1];
    const sample      = m[2];
    const full        = m[3];
    if (full.startsWith('filed:')) {
      entries.push({ reasonClass, sample, kind: 'filed', ref: m[4] });
    } else {
      entries.push({ reasonClass, sample, kind: 'noise', ref: m[5] || '' });
    }
  }

  return inSection ? entries : null;
}

function runCheck(opts) {
  const { project, outputPath, summaryPath, asJson, forceOffline } = opts;

  // Read the artifact.
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (e) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'artifact_missing',
        detail: 'run-gaps.json not found; run --project ' + project + ' first',
      }) + '\n');
    } else {
      process.stderr.write('gap-sweep: artifact not found at ' + outputPath + '; run scanner first\n');
    }
    return 1;
  }

  const sweptClasses = Array.isArray(artifact.sweptClasses) ? artifact.sweptClasses : [];

  // Parse ## Run gaps section FIRST — even when sweptClasses is empty. This is the reverse
  // containment check (#653 finding D): a manually observed gap that was never seeded through
  // .cache/run-gaps-manual.md must not pass vacuously just because the scanner swept nothing.
  const gapEntries = parseGapSection(summaryPath);

  // Reverse containment: every strict-regex ## Run gaps entry must exist in sweptClasses as an
  // exact (reasonClass, sample) tuple — i.e. it was actually seeded/observed by the scanner, not
  // hand-typed into the summary without ever being mapped to a machine-checked source.
  if (gapEntries !== null && gapEntries.length > 0) {
    const unseeded = gapEntries
      .filter(e => !sweptClasses.some(sc => sc.reasonClass === e.reasonClass && sc.sample === e.sample))
      .map(e => ({ reasonClass: e.reasonClass, sample: e.sample }));

    if (unseeded.length > 0) {
      const detail = 'seed via .cache/run-gaps-manual.md (gap: <class> — <text>), re-run the scanner, then --check';
      if (asJson) {
        process.stdout.write(JSON.stringify({
          result: 'refuse',
          reason: 'observed_gap_unseeded',
          unseeded,
          detail,
        }) + '\n');
      } else {
        process.stderr.write(
          'gap-sweep: observed gap(s) never seeded through .cache/run-gaps-manual.md: ' +
          unseeded.map(u => u.reasonClass + '(' + u.sample + ')').join(', ') + '\n' +
          detail + '\n'
        );
      }
      return 1;
    }
  }

  // Vacuous pass only when BOTH sides are empty.
  if (sweptClasses.length === 0 && (gapEntries === null || gapEntries.length === 0)) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'pass',
        mapped: 0,
        filed: 0,
        noise: 0,
      }) + '\n');
    }
    return 0;
  }

  // If section absent and swept is non-empty => all unmapped.
  if (gapEntries === null) {
    const unmapped = sweptClasses.map(c => ({ reasonClass: c.reasonClass, sample: c.sample }));
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'gaps_unswept',
        unmapped,
      }) + '\n');
    } else {
      process.stderr.write(
        'gap-sweep: ## Run gaps section absent in ' + summaryPath + '\n' +
        'Unmapped: ' + unmapped.map(u => u.reasonClass + '(' + u.sample + ')').join(', ') + '\n'
      );
    }
    return 1;
  }

  // Match each swept tuple against section entries.
  const unmapped = [];
  let filedCount = 0;
  let noiseCount = 0;

  for (const sc of sweptClasses) {
    const match = gapEntries.find(e =>
      e.reasonClass === sc.reasonClass && e.sample === sc.sample
    );
    if (!match) {
      unmapped.push({ reasonClass: sc.reasonClass, sample: sc.sample });
    } else if (match.kind === 'filed') {
      filedCount++;
    } else {
      noiseCount++;
    }
  }

  if (unmapped.length > 0) {
    if (asJson) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'gaps_unswept',
        unmapped,
      }) + '\n');
    } else {
      process.stderr.write(
        'gap-sweep: unmapped gaps: ' +
        unmapped.map(u => u.reasonClass + '(' + u.sample + ')').join(', ') + '\n'
      );
    }
    return 1;
  }

  // Online probe for filed: #N entries (when not forced offline and env not offline).
  const offline = forceOffline || isOffline();
  const verification = offline ? 'offline' : undefined;

  if (!offline) {
    // Probe is kept forge-neutral: we check if the issue number looks valid
    // syntactically (already done by regex) but skip live HTTP calls to avoid
    // forge coupling. Real wiring would use the forge-neutral HTTP layer.
    // Per n1-design: "if a forge probe is awkward to keep neutral, accept
    // filed:#N syntactically and rely on the offline/online flag — n1 says
    // the syntactic check is the floor."
    // Thus: syntactic check only; verification field omitted when online.
  }

  const out = {
    result: 'pass',
    mapped: sweptClasses.length,
    filed: filedCount,
    noise: noiseCount,
  };
  if (verification !== undefined) out.verification = verification;

  if (asJson) {
    process.stdout.write(JSON.stringify(out) + '\n');
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Argument parsing + main
// ---------------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);

  let project     = null;
  let outputPath  = null;  // computed after project resolved
  let summaryPath = null;  // computed after project resolved
  let asJson      = false;
  let checkMode   = false;
  let forceOffline = false;

  // Resolve repo root (injectable for tests via KAOLA_GAP_ROOT).
  const root = process.env.KAOLA_GAP_ROOT
    ? path.resolve(process.env.KAOLA_GAP_ROOT)
    : process.cwd();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project') {
      const val = args[++i];
      if (!val || val.startsWith('-')) {
        process.stderr.write('gap-sweep: --project requires a non-empty value\n');
        return 1;
      }
      project = val;
    } else if (a === '--output') {
      const val = args[++i];
      if (!val) {
        process.stderr.write('gap-sweep: --output requires a value\n');
        return 1;
      }
      outputPath = path.resolve(root, val);
    } else if (a === '--summary') {
      const val = args[++i];
      if (!val) {
        process.stderr.write('gap-sweep: --summary requires a value\n');
        return 1;
      }
      summaryPath = path.resolve(root, val);
    } else if (a === '--json') {
      asJson = true;
    } else if (a === '--check') {
      checkMode = true;
    } else if (a === '--offline') {
      forceOffline = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: kaola-gitlab-workflow-gap-sweep.js --project <name> [--json] [--check]\n' +
        '                                    [--summary <path>] [--output <path>]\n' +
        '                                    [--offline]\n' +
        '\n' +
        'Scanner (default): scan .cache/ for run gaps, write artifact, emit JSON.\n' +
        'Gate (--check):    verify all swept gaps are mapped in finalization summary.\n'
      );
      return 0;
    } else {
      process.stderr.write('gap-sweep: unknown argument: ' + a + '\n');
      return 1;
    }
  }

  if (!project) {
    process.stderr.write('gap-sweep: --project <name> is required\n');
    return 1;
  }

  // Resolve defaults after we know the project name.
  const defaultCacheDir = path.join(root, 'kaola-workflow', project, '.cache');
  if (!outputPath) {
    outputPath = path.join(defaultCacheDir, 'run-gaps.json');
  }
  if (!summaryPath) {
    summaryPath = path.join(root, 'kaola-workflow', project, 'finalization-summary.md');
  }

  if (checkMode) {
    return runCheck({ project, outputPath, summaryPath, asJson, forceOffline });
  } else {
    return runScan({ project, outputPath, asJson, root });
  }
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
