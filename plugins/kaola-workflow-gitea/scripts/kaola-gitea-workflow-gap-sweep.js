#!/usr/bin/env node
// @generated from scripts/kaola-workflow-gap-sweep.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-gap-sweep.js
//
// #1054 item 1/2/4: this used to be a two-mode gate — a scanner that wrote a
// structured run-gaps artifact, and a `--check` reconciliation that refused
// finalization unless every swept signal was hand-mapped into the free-text
// `## Run gaps` section of finalization-summary.md. That reconciliation is
// retired: it judged the ORCHESTRATOR's real record by regex-parsing its
// prose, and equivalent legitimate expressions of the same disposition
// (bullets / free prose / a table) were accepted or silently misread as
// zero. Nothing in finalize depends on this script any more.
//
// What remains is an OPTIONAL, non-gating diagnostic: scan a project's
// .cache/ for machine-observable signals (today: a chain accepted red in
// chain-receipt.json) and write/print them. It is never invoked by finalize
// and its output settles nothing on its own — an orchestrator may run it,
// read it, or ignore it.
//
// Usage:
//   node kaola-gitea-workflow-gap-sweep.js --project <name> [--json] [--output <path>]
//
// Options:
//   --project <name>          REQUIRED — project folder under kaola-workflow/.
//   --json                    Emit a JSON summary line to stdout.
//   --output <path>           Override artifact path.
//                             Default: kaola-workflow/<P>/.cache/run-gaps.json
//   -h / --help               Print usage.
//
// Root override (for tests):
//   KAOLA_GAP_ROOT=<dir>      Use <dir> as the repo root, in place of the tree the run folder
//                             is found in. Takes precedence over everything.
//
// Reason classes (closed enum):
//   deferred_red_chain        chain in chain-receipt.json with accepted_red:true
//
// FORGE-NEUTRAL: this file invokes no forge-specific CLI binary or brand name
// and makes no forge API calls. The codex plugin copy is byte-identical; the
// gitlab/gitea ports are rename-normalised identical.
// ---------------------------------------------------------------------------

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Scanner helpers
// ---------------------------------------------------------------------------

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
// Scanner
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
  const sweptClasses = dedup(scanChainReceipt(cacheDir));

  // Ensure output directory exists.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const artifact = { project, sweptClasses };
  // `run-gaps.json` is a diagnostic record, kept crash-safe like every other record write: a
  // half-written artifact would parse as a SHORTER swept-class list than the scan actually found.
  require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace(
    outputPath, JSON.stringify(artifact, null, 2) + '\n');

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
// Argument parsing + main
// ---------------------------------------------------------------------------

// The root whose kaola-workflow/<project>/ this run's record lives in. The record does not move
// when the operator does: at finalize the folder is resident in the main checkout while the
// operator stands in the linked worktree, and after the transaction's mirror it is resident in the
// worktree too. So the answer is the tree that HAS the folder — this one when it does, the main
// checkout otherwise — and cwd when neither has it (a first scan, or no repository to ask).
// KAOLA_GAP_ROOT overrides the search outright.
//
// HAVING A FOLDER OF THAT NAME IS NOT THE SAME AS HOLDING THE RUN. The stop condition is a bare
// existence test, so anything of that name terminates the search: the stray a pre-#971 sweep wrote
// into the worktree, or an empty directory an operator created by hand. Standing in front of the
// real record, such a leftover makes the scanner sweep an empty .cache — the vacuous pass exits 0
// while the evidence sits one tree over, and it does so whether or not the sweep itself ever
// succeeded. workflow-state.md is the file the claim transaction writes into the folder it creates
// — later writers only update a copy that already exists, or (the finalize mirror) carry that one
// forward — so its presence is the one signal on disk separating a folder some claim created from a
// directory that merely shares its name.
//
// It is a TIE-BREAK, never a requirement. This tree still wins when it carries the signature — the
// post-mirror window, where BOTH trees legitimately do and the worktree copy is the one to read —
// and still wins when neither tree carries it, which is the folder run-chains writes on a first run
// and the reading that leaves #971's answer intact. Main is reached for in exactly one case: it
// carries the signature and this tree does not.
function resolveRunRoot(project) {
  if (process.env.KAOLA_GAP_ROOT) return path.resolve(process.env.KAOLA_GAP_ROOT);
  const cwd = process.cwd();
  const holds = r => fs.existsSync(path.join(r, 'kaola-workflow', project));
  const claimed = r => fs.existsSync(path.join(r, 'kaola-workflow', project, 'workflow-state.md'));
  if (holds(cwd) && claimed(cwd)) return cwd;
  let mainRoot = cwd;
  try {
    mainRoot = require('./kaola-workflow-adaptive-schema').resolveMainRoot(cwd);
  } catch (_) { /* nothing to ask: cwd stands */ }
  if (holds(mainRoot) && (claimed(mainRoot) || !holds(cwd))) return mainRoot;
  return cwd;
}

function main(argv) {
  const args = argv.slice(2);

  let project     = null;
  let outputArg   = null;  // resolved against the run root, once the project names it
  let asJson      = false;

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
      outputArg = val;
    } else if (a === '--json') {
      asJson = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'Usage: kaola-gitea-workflow-gap-sweep.js --project <name> [--json] [--output <path>]\n' +
        '\n' +
        'Optional diagnostic: scan .cache/ for machine-observable run gaps and write/print them.\n' +
        'Not part of the finalize transaction and gates nothing.\n'
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

  const root = resolveRunRoot(project);

  const defaultCacheDir = path.join(root, 'kaola-workflow', project, '.cache');
  const outputPath = outputArg
    ? path.resolve(root, outputArg)
    : path.join(defaultCacheDir, 'run-gaps.json');

  return runScan({ project, outputPath, asJson, root });
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
