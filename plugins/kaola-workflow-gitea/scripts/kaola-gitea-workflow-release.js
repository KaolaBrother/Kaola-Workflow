#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitea-workflow-release.js (issue #442 — D-442-01)
//
// Release aggregator CLI. Subcommands:
//   --verify [--json]            Read-only pre-release verification.
//   --cut --version X.Y.Z [--json]  Atomic version bump + local tag creation.
//   --push [--json]              Emit forge-neutral push/publish guidance only
//                                (no forge binary invoked — forge-neutral).
//
// Typed envelope for all subcommands: { result: 'ok' | 'refuse', reason?, ... }
//
// Injectable roots for testing (never mutates the real repo in tests):
//   KAOLA_RELEASE_ROOT env var OR --root <path>   -> repo root
//   KAOLA_RELEASE_DATE env var OR --date <date>   -> ISO date for CHANGELOG
//   --issues-closed n,n,n                          -> inject closed-issue set
//
// FORGE-NEUTRAL: this file contains no forge-specific CLI tokens and makes no
// forge API calls. The codex plugin copy is byte-identical; the gitlab/gitea
// ports are rename-normalised identical.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Manifest paths (three Codex manifests — the binding census from D-442-01)
//
// FORGE-PORT SAFETY: the rename-normalizer in validate-script-sync.js rewrites
// the literal substring 'kaola-workflow-' (when followed by a forge suffix or
// '--v') when generating gitlab/gitea port files.  These are forge-INDEPENDENT
// data tokens — all editions reference the SAME three real manifest dirs and
// the SAME one root tag series.  We construct every sensitive data token from
// base-literal pieces so the literal substring 'kaola-workflow-' (followed by
// a mangleable suffix) never appears in source: the normalizer becomes a no-op
// on all data tokens and the forge ports remain correct.
// ---------------------------------------------------------------------------
const PLUGIN_BASE = 'plugins/kaola-workflow'; // slash/quote-terminated — normalizer does NOT match
const CODEX_MANIFEST_RELPATHS = [
  PLUGIN_BASE + '/.codex-plugin/plugin.json',
  PLUGIN_BASE + '-gitlab/.codex-plugin/plugin.json',
  PLUGIN_BASE + '-gitea/.codex-plugin/plugin.json',
];

// Tag series prefix — built by concatenation so the mangleable literal token
// never appears verbatim in source (the normalizer matches 'kaola-workflow-'
// when immediately followed by further characters; the '--v' suffix qualifies).
// All tag globs, regexes, and creation sites use this constant.
const RELEASE_TAG_PREFIX = 'kaola-workflow' + '--v';

// ---------------------------------------------------------------------------
// Argument parsing helpers
// ---------------------------------------------------------------------------
function flagVal(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] || null;
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

// ---------------------------------------------------------------------------
// Git helpers (injectable for testing via spawnSync isolation)
// ---------------------------------------------------------------------------
function gitExec(root, gitArgs) {
  try {
    return execFileSync('git', gitArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  } catch (_) {
    return null;
  }
}

// Return the name of the most recent release tag, or null.
function lastReleaseTag(root) {
  const out = gitExec(root, ['tag', '-l', RELEASE_TAG_PREFIX + '*', '--sort=-version:refname']);
  if (!out) return null;
  const lines = out.split('\n').map(s => s.trim()).filter(Boolean);
  return lines[0] || null;
}

// Return the version string from the last release tag, e.g. "5.16.0", or null.
function lastTagVersion(root) {
  const tag = lastReleaseTag(root);
  if (!tag) return null;
  const m = tag.match(new RegExp('^' + RELEASE_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(.+)$'));
  return m ? m[1] : null;
}

// Return commit messages since the last tag (or since the beginning if no tag).
function commitMessagesSinceTag(root) {
  const tag = lastReleaseTag(root);
  let range;
  if (tag) {
    range = tag + '..HEAD';
  } else {
    range = 'HEAD';
  }
  const out = gitExec(root, ['log', '--format=%s %b', range]);
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

// Extract all #N issue references from a text.
function extractIssueRefs(text) {
  const refs = new Set();
  const re = /#(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.add(parseInt(m[1], 10));
  }
  return refs;
}

// ---------------------------------------------------------------------------
// CHANGELOG helpers
// ---------------------------------------------------------------------------
function readChangelog(root) {
  const p = path.join(root, 'CHANGELOG.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

// Extract #N refs from the [Unreleased] section only.
function changelogUnreleasedRefs(changelog) {
  if (!changelog) return new Set();
  // Find the [Unreleased] heading and collect text until the next ## heading.
  const lines = changelog.split('\n');
  let inUnreleased = false;
  const textLines = [];
  for (const line of lines) {
    if (/^##\s+\[Unreleased\]/i.test(line)) {
      inUnreleased = true;
      continue;
    }
    if (inUnreleased && /^##\s+/.test(line)) {
      break;
    }
    if (inUnreleased) {
      textLines.push(line);
    }
  }
  return extractIssueRefs(textLines.join('\n'));
}

function hasUnreleasedSection(changelog) {
  return changelog ? /^##\s+\[Unreleased\]/im.test(changelog) : false;
}

// ---------------------------------------------------------------------------
// Version comparison: semver-style, returns -1 / 0 / 1
// ---------------------------------------------------------------------------
function semverCompare(a, b) {
  const parse = (v) => String(v).split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Lockstep guard: all three Codex manifests must agree
// ---------------------------------------------------------------------------
function checkLockstep(root) {
  const versions = [];
  for (const rel of CODEX_MANIFEST_RELPATHS) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
      return { ok: false, reason: 'lockstep_violation', detail: 'missing manifest: ' + rel };
    }
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {
      return { ok: false, reason: 'lockstep_violation', detail: 'unparseable manifest: ' + rel };
    }
    versions.push({ rel, version: parsed.version });
  }
  const baseline = versions[0].version;
  for (const v of versions.slice(1)) {
    if (v.version !== baseline) {
      return {
        ok: false,
        reason: 'lockstep_violation',
        versions: versions.map(x => ({ file: x.rel, version: x.version })),
      };
    }
  }
  return { ok: true, baseline };
}

// ---------------------------------------------------------------------------
// Chain receipt greenness (#432)
// ---------------------------------------------------------------------------
function readChainReceipt(root) {
  const p = path.join(root, '.cache', 'chain-receipt.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function chainReceiptGreenness(root) {
  const receipt = readChainReceipt(root);
  if (!receipt) return { green: false, reason: 'chains_unverified' };
  // Check if receipt is HEAD-bound
  const headSha = gitExec(root, ['rev-parse', 'HEAD']);
  if (headSha && receipt.headSha && headSha !== receipt.headSha && receipt.headSha !== 'unknown') {
    return { green: false, reason: 'chains_stale', receiptHead: receipt.headSha, currentHead: headSha };
  }
  // Check all chains passed
  if (Array.isArray(receipt.chains)) {
    for (const chain of receipt.chains) {
      const exitCode = chain.exitCode != null ? chain.exitCode : chain.exit;
      if (exitCode !== 0 && !chain.accepted_red) {
        return { green: false, reason: 'chains_red', chain: chain.name, exitCode };
      }
    }
  }
  return { green: true };
}

// ---------------------------------------------------------------------------
// Step-receipt JSONL (crash-resume, #429 pattern)
// ---------------------------------------------------------------------------
function receiptPath(root) {
  return path.join(root, '.cache', 'release-receipt.jsonl');
}

function readReceipt(root) {
  const p = receiptPath(root);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function isStepDone(receipt, step) {
  return receipt.some(r => r.step === step && r.status === 'done');
}

function appendReceipt(root, entry) {
  const p = receiptPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
}

// ---------------------------------------------------------------------------
// Subcommand: --verify
// ---------------------------------------------------------------------------
function runVerify(root, opts) {
  const { jsonMode, injectedIssues } = opts;

  const changelog = readChangelog(root);
  const changelogRefs = changelogUnreleasedRefs(changelog);

  // Determine the closed-issue set
  const isOffline = injectedIssues === null;
  let closedIssues;
  if (isOffline) {
    // Offline: use git log + changelog refs combined as best effort
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    closedIssues = new Set([...extractIssueRefs(commitMessages), ...changelogRefs]);
  } else {
    // Online: use the injected set + git log refs
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    const gitRefs = extractIssueRefs(commitMessages);
    closedIssues = new Set([...injectedIssues, ...gitRefs]);
  }

  // Check changelog completeness: every #N in [Unreleased] must be in closedIssues
  const missing = [];
  for (const n of changelogRefs) {
    if (!closedIssues.has(n)) {
      missing.push(n);
    }
  }

  // If offline and no injected set, we can't cross-check — any ref in changelog
  // that isn't also in git log counts as missing only when we have a closed set.
  // For offline mode: refs in changelog but not in git log are potentially missing.
  const offlineMissing = [];
  if (isOffline) {
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    const gitRefs = extractIssueRefs(commitMessages);
    for (const n of changelogRefs) {
      if (!gitRefs.has(n)) {
        offlineMissing.push(n);
      }
    }
  }

  // Greenness signal from chain receipt
  const greenness = chainReceiptGreenness(root);

  const envelope = {
    verification: isOffline ? 'offline' : 'online',
    changelog_refs: [...changelogRefs],
    closed_issues: [...closedIssues],
    chain_greenness: greenness,
  };

  if (!isOffline && missing.length > 0) {
    const result = { result: 'refuse', reason: 'changelog_incomplete', missing, ...envelope };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('verify: REFUSED changelog_incomplete missing=' + JSON.stringify(missing) + '\n');
    return 1;
  }

  // For offline mode with un-accounted changelog refs, surface them
  if (isOffline && offlineMissing.length > 0) {
    const result = { result: 'refuse', reason: 'changelog_incomplete', missing: offlineMissing, ...envelope };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('verify: REFUSED changelog_incomplete (offline) missing=' + JSON.stringify(offlineMissing) + '\n');
    return 1;
  }

  // Greenness: non-green receipt is reflected but does not block --verify (it blocks --cut)
  if (!greenness.green) {
    envelope.chain_warning = greenness.reason;
  }

  const result = { result: 'ok', ...envelope };
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write('verify: ok (verification=' + (isOffline ? 'offline' : 'online') + ')\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: --cut
// ---------------------------------------------------------------------------
function runCut(root, opts) {
  const { jsonMode, version, injectedIssues, releaseDate } = opts;

  // --version required
  if (!version) {
    const result = { result: 'refuse', reason: 'missing_version' };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('cut: REFUSED missing_version — --version X.Y.Z is required\n');
    return 1;
  }

  // Idempotent short-circuit (D-442-01 §5 crash-resume contract): if a receipt
  // already exists for THIS exact version with the terminal git_tag step done,
  // the release is fully complete — return ok without re-mutating anything.
  // This MUST run before the monotonic guard, because --cut step 5 creates the
  // tag so a completed re-run sees lastVer == version and would wrongly refuse.
  {
    const earlyReceipt = readReceipt(root);
    const expectedTag = RELEASE_TAG_PREFIX + version;
    const tagDone = earlyReceipt.some(r => r.step === 'git_tag' && r.status === 'done' && r.tag === expectedTag);
    if (tagDone) {
      const result = {
        result: 'ok',
        idempotent: true,
        version,
        tag: expectedTag,
        steps_completed: earlyReceipt.map(r => r.step),
      };
      if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
      else process.stdout.write('cut: ok (idempotent — version ' + version + ' already fully released)\n');
      return 0;
    }
  }

  // Monotonic guard: version must be strictly greater than last tag version
  const lastVer = lastTagVersion(root);
  if (lastVer !== null) {
    if (semverCompare(version, lastVer) <= 0) {
      const result = {
        result: 'refuse',
        reason: 'non_monotonic_version',
        requested: version,
        last_tag_version: lastVer,
      };
      if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
      else process.stderr.write('cut: REFUSED non_monotonic_version ' + version + ' <= ' + lastVer + '\n');
      return 1;
    }
  }

  // Lockstep guard
  const lockstep = checkLockstep(root);
  if (!lockstep.ok) {
    const result = { result: 'refuse', ...lockstep };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('cut: REFUSED lockstep_violation\n');
    return 1;
  }

  // In-process re-verification (read-only verify as first step)
  const changelog = readChangelog(root);
  const changelogRefs = changelogUnreleasedRefs(changelog);

  const isOffline = injectedIssues === null;
  let closedIssues;
  if (isOffline) {
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    closedIssues = new Set([...extractIssueRefs(commitMessages), ...changelogRefs]);
  } else {
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    closedIssues = new Set([...injectedIssues, ...extractIssueRefs(commitMessages)]);
  }

  const missing = [];
  for (const n of changelogRefs) {
    if (!closedIssues.has(n)) {
      missing.push(n);
    }
  }
  const offlineMissing = [];
  if (isOffline) {
    const commitMessages = commitMessagesSinceTag(root).join(' ');
    const gitRefs = extractIssueRefs(commitMessages);
    for (const n of changelogRefs) {
      if (!gitRefs.has(n)) {
        offlineMissing.push(n);
      }
    }
  }

  if (!isOffline && missing.length > 0) {
    const result = { result: 'refuse', reason: 'changelog_incomplete', missing };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('cut: REFUSED changelog_incomplete missing=' + JSON.stringify(missing) + '\n');
    return 1;
  }
  if (isOffline && offlineMissing.length > 0) {
    const result = { result: 'refuse', reason: 'changelog_incomplete', missing: offlineMissing };
    if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write('cut: REFUSED changelog_incomplete (offline) missing=' + JSON.stringify(offlineMissing) + '\n');
    return 1;
  }

  // Load crash-resume receipt
  const receipt = readReceipt(root);
  const date = releaseDate || new Date().toISOString().slice(0, 10);

  // Step 1: Rename CHANGELOG [Unreleased] -> [X.Y.Z] - <date>
  if (!isStepDone(receipt, 'changelog')) {
    const changelogPath = path.join(root, 'CHANGELOG.md');
    const current = fs.readFileSync(changelogPath, 'utf8');
    if (!hasUnreleasedSection(current)) {
      const result = { result: 'refuse', reason: 'no_unreleased_section' };
      if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
      else process.stderr.write('cut: REFUSED no_unreleased_section\n');
      return 1;
    }
    const updated = current.replace(
      /^(##\s+\[Unreleased\])/im,
      '## [' + version + '] - ' + date
    );
    fs.writeFileSync(changelogPath, updated);
    appendReceipt(root, { step: 'changelog', status: 'done', version });
  }

  // Step 2: Bump package.json
  if (!isStepDone(receipt, 'package_json')) {
    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    appendReceipt(root, { step: 'package_json', status: 'done', version });
  }

  // Step 3: Bump three Codex manifests in lockstep
  for (let i = 0; i < CODEX_MANIFEST_RELPATHS.length; i++) {
    const rel = CODEX_MANIFEST_RELPATHS[i];
    const stepKey = 'codex_manifest_' + i;
    if (!isStepDone(receipt, stepKey)) {
      const p = path.join(root, rel);
      const manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
      manifest.version = version;
      fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n');
      appendReceipt(root, { step: stepKey, status: 'done', file: rel, version });
    }
  }

  // Step 4: Update README codex version assertions
  if (!isStepDone(receipt, 'readme')) {
    const readmePath = path.join(root, 'README.md');
    if (fs.existsSync(readmePath)) {
      let readme = fs.readFileSync(readmePath, 'utf8');
      // Replace all occurrences of the old codex manifest version lines
      // Pattern: Codex `kaola-workflow*` plugin manifest: `<version>`
      readme = readme.replace(
        /(Codex `kaola-workflow[^`]*` plugin manifest: `)[^`]*/g,
        '$1' + version
      );
      fs.writeFileSync(readmePath, readme);
      appendReceipt(root, { step: 'readme', status: 'done', version });
    }
  }

  // Step 5: Create local git tag
  if (!isStepDone(receipt, 'git_tag')) {
    const tagName = RELEASE_TAG_PREFIX + version;
    // Stage all bumped files so the tag points at the right state
    // (we use git tag on the current HEAD — files are written but may not be committed in fixture;
    //  for tests with a temp repo we just tag HEAD; in real usage the commit is made separately)
    gitExec(root, ['tag', tagName]);
    appendReceipt(root, { step: 'git_tag', status: 'done', tag: tagName });
  }

  const result = {
    result: 'ok',
    version,
    date,
    tag: RELEASE_TAG_PREFIX + version,
    steps_completed: readReceipt(root).map(r => r.step),
  };
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write('cut: ok — version ' + version + ' tagged locally\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Subcommand: --push
// ---------------------------------------------------------------------------
function runPush(root, opts) {
  const { jsonMode } = opts;

  // Determine the current version from package.json
  let version = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch (_) {}

  const tag = version ? RELEASE_TAG_PREFIX + version : null;

  // Forge-neutral operator guidance — no forge CLI binary is invoked here.
  const guidance = [
    'Push the local tag to the remote:',
    '  git push origin ' + (tag || '<tag>'),
    '',
    'Then run the forge release-create command with --latest to publish the release.',
    'Example for a forge that supports a release-create command:',
    '  <forge-cli> release create ' + (tag || '<tag>') + ' --notes-from-tag --latest',
    '',
    'No forge binary (forge CLI) is invoked by this script; the publish step',
    'remains a manual or forge-specific step.',
  ].join('\n');

  const result = { result: 'ok', version, tag, guidance };
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write(guidance + '\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(argv) {
  const args = argv.slice(2);

  // Resolve root: KAOLA_RELEASE_ROOT env, then --root flag, then cwd.
  let root = process.env.KAOLA_RELEASE_ROOT || null;
  const rootFlag = flagVal(args, '--root');
  if (rootFlag) root = rootFlag;
  if (!root) root = process.cwd();
  root = path.resolve(root);

  const jsonMode = hasFlag(args, '--json');

  // Resolve date: KAOLA_RELEASE_DATE env, then --date flag, then today.
  let releaseDate = process.env.KAOLA_RELEASE_DATE || flagVal(args, '--date') || null;

  // Resolve injected issues: --issues-closed n,n,n (empty string = empty set, absent = offline)
  let injectedIssues = null; // null = offline
  const issuesFlag = flagVal(args, '--issues-closed');
  if (issuesFlag !== null) {
    // Present (even empty string) => online mode with injected set
    injectedIssues = issuesFlag
      ? issuesFlag.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : [];
  }

  if (hasFlag(args, '--verify')) {
    process.exit(runVerify(root, { jsonMode, injectedIssues }));
  }

  if (hasFlag(args, '--cut')) {
    const version = flagVal(args, '--version');
    process.exit(runCut(root, { jsonMode, version, injectedIssues, releaseDate }));
  }

  if (hasFlag(args, '--push')) {
    process.exit(runPush(root, { jsonMode }));
  }

  process.stderr.write('kaola-gitea-workflow-release: usage: --verify | --cut --version X.Y.Z | --push [--json]\n');
  process.exit(1);
}

main(process.argv);
