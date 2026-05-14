#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

// ---------------------------------------------------------------------------
// Shared utilities (copied from kaola-workflow-claim.js)
// ---------------------------------------------------------------------------

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':\\s*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (_) {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// Config utilities
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');

function readOrCreateConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    const defaults = { parallel_mode: 'auto' };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Lock-file reader
// ---------------------------------------------------------------------------

function readLockFiles(root) {
  const dir = path.join(root, 'kaola-workflow', '.locks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.lock'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return null; } })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// File-path extraction
// ---------------------------------------------------------------------------

const FILE_PATH_REGEX = /(scripts|commands|hooks|kaola-workflow)\/[A-Za-z0-9_./-]+/g;
const COARSE_AREAS = new Set(['scripts', 'commands', 'hooks', 'kaola-workflow']);

function extractCoarseAreas(text) {
  const matches = text.match(FILE_PATH_REGEX) || [];
  const areas = new Set();
  for (const m of matches) {
    const top = m.split('/')[0];
    if (COARSE_AREAS.has(top)) areas.add(top);
  }
  return areas;
}

// ---------------------------------------------------------------------------
// Label parsers
// ---------------------------------------------------------------------------

const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;

function parseDependsOn(labels) {
  for (const lbl of labels) {
    const m = String(lbl.name || lbl).match(DEPENDS_ON_REGEX);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parseAreaLabels(labels) {
  const areas = new Set();
  for (const lbl of labels) {
    const name = String(lbl.name || lbl);
    if (name.startsWith('area:')) areas.add(name.slice(5).trim());
  }
  return areas;
}

// ---------------------------------------------------------------------------
// Args parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Core classify function
// ---------------------------------------------------------------------------

const SHARED_INFRA = new Set(['scripts', 'hooks']);

function scanClaimedOverlap(candidateAreas, candidateAreaLabels, claimedLocks, root) {
  let hasDirectOverlap = false;
  let directOverlapArea = '';
  let hasSharedInfraOverlap = false;
  let sharedOverlapArea = '';
  let hasAreaLabelOverlap = false;
  let anyClaimedAtPhaseLeTwo = false;

  for (const lock of claimedLocks) {
    if (!isSafeName(lock.project)) continue;
    const projectDir = path.join(root, 'kaola-workflow', lock.project);

    let phase3Content = '';
    let phase1Content = '';
    try { phase3Content = fs.readFileSync(path.join(projectDir, 'phase3-plan.md'), 'utf8'); } catch (_) {}
    try { phase1Content = fs.readFileSync(path.join(projectDir, 'phase1-research.md'), 'utf8'); } catch (_) {}

    const combined = phase3Content + phase1Content;
    const claimedAreas = extractCoarseAreas(combined);
    const claimedAreaLabels = parseAreaLabels(
      (combined.match(/area:[A-Za-z0-9_-]+/g) || []).map(s => ({ name: s }))
    );

    if (!fs.existsSync(path.join(projectDir, 'phase3-plan.md'))) anyClaimedAtPhaseLeTwo = true;

    for (const area of candidateAreas) {
      if (claimedAreas.has(area)) {
        if (!SHARED_INFRA.has(area)) {
          if (!hasDirectOverlap) directOverlapArea = area;
          hasDirectOverlap = true;
        } else {
          if (!hasSharedInfraOverlap) sharedOverlapArea = area;
          hasSharedInfraOverlap = true;
        }
      }
    }

    for (const label of candidateAreaLabels) {
      if (claimedAreaLabels.has(label)) { hasAreaLabelOverlap = true; break; }
    }
  }

  return { hasDirectOverlap, directOverlapArea, hasSharedInfraOverlap, sharedOverlapArea, hasAreaLabelOverlap, anyClaimedAtPhaseLeTwo };
}

function checkDependsOn(depN) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depN + ' label present; conservative block' };
  }
  let depState = 'open';
  try {
    const raw = ghExec(['issue', 'view', String(depN), '--json', 'state,closedAt']);
    depState = JSON.parse(raw).state || 'open';
  } catch (_) {}
  if (depState !== 'closed') {
    return { verdict: 'blocked', reasoning: 'depends-on:#' + depN + ' is still open' };
  }
  return null;
}

function classify(issue, claimedLocks, root) {
  const depN = parseDependsOn(issue.labels || []);
  if (depN !== null) {
    const blocked = checkDependsOn(depN);
    if (blocked) return blocked;
  }

  const candidateAreas = extractCoarseAreas(issue.body || '');
  const candidateAreaLabels = parseAreaLabels(issue.labels || []);

  const {
    hasDirectOverlap, directOverlapArea,
    hasSharedInfraOverlap, sharedOverlapArea,
    hasAreaLabelOverlap, anyClaimedAtPhaseLeTwo,
  } = scanClaimedOverlap(candidateAreas, candidateAreaLabels, claimedLocks, root);

  if (hasDirectOverlap) {
    return { verdict: 'red', reasoning: 'file-set overlap at coarse area "' + directOverlapArea + '" with a claimed project' };
  }

  const noPathInfo = candidateAreas.size === 0 && candidateAreaLabels.size === 0;
  if (noPathInfo && claimedLocks.length > 0 && anyClaimedAtPhaseLeTwo) {
    return { verdict: 'red', reasoning: 'no extractable file paths or area labels; claimed project in phase <= 2; conservative red' };
  }

  if (hasSharedInfraOverlap) {
    return { verdict: 'yellow', reasoning: 'shared-infra area "' + sharedOverlapArea + '" overlap; proceed with caution' };
  }

  if (hasAreaLabelOverlap) {
    return { verdict: 'yellow', reasoning: 'area:* label overlap with a claimed project; proceed with caution' };
  }

  return { verdict: 'green', reasoning: 'no file-set overlap, no dependency block; file sets are disjoint' };
}

// ---------------------------------------------------------------------------
// cmdClassify
// ---------------------------------------------------------------------------

function cmdClassify() {
  const args = parseArgs(process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' }) + '\n');
    return;
  }

  const root = getRoot();
  const locks = readLockFiles(root);

  // Already claimed → exit 2, no stdout
  if (locks.some(l => l.issue_number === args.issue)) {
    process.exitCode = 2;
    return;
  }

  // OFFLINE path — read from local roadmap file
  if (OFFLINE) {
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    let labels = [];
    let body = '';
    if (fs.existsSync(roadmapFile)) {
      const content = fs.readFileSync(roadmapFile, 'utf8');
      const nextStep = field(content, 'next_step');
      if (/blocked by #\d+/i.test(nextStep)) {
        const m = nextStep.match(/#(\d+)/);
        if (m) labels = [{ name: 'depends-on:#' + m[1] }];
      }
      try { body = field(content, 'body'); } catch (_) {}
    }
    const result = classify({ number: args.issue, labels, body }, locks, root);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  // Online path
  let issue;
  try {
    const raw = ghExec(['issue', 'view', String(args.issue), '--json', 'number,title,body,labels,state']);
    issue = JSON.parse(raw);
  } catch (_) {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'gh issue fetch failed; defaulting to green' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  const result = classify(issue, locks, root);
  process.stdout.write(JSON.stringify(result) + '\n');
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-classifier.js <classify>');
  if (sub === 'classify') return cmdClassify();
  throw new Error('unknown subcommand: ' + sub);
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
