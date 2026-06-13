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
  const cacheDir = path.join(root, 'kaola-workflow', project, '.cache');

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
    const m = l.match(/^-\s+(\S+)\s+\(([^)]+)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/);
    if (!m) continue;
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

  // Vacuous pass on empty sweep.
  if (sweptClasses.length === 0) {
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

  // Parse ## Run gaps section.
  const gapEntries = parseGapSection(summaryPath);

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
