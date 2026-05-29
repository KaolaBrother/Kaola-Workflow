#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { readActiveFolders } = require('./kaola-workflow-active-folders');

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
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function ghExec(args) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], { encoding: 'utf8' }).trim();
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function getRepoOwnerName() {
  const raw = ghExec(['repo', 'view', '--json', 'owner,name']);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return { owner: d.owner.login, name: d.name };
  } catch (_) { return null; }
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
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
// File-path extraction
// ---------------------------------------------------------------------------

const FILE_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
const AREA_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])([A-Za-z0-9_-]+)\/(?=$|[^A-Za-z0-9_./-])/g;

function normalizeRepoPath(raw) {
  return String(raw || '')
    .replace(/^touches:/, '')
    .replace(/^[`'"]+/, '')
    .replace(/[`'",.;:)\]}]+$/, '')
    .trim();
}

function areaForPath(filePath) {
  if (filePath.startsWith('plugins/kaola-workflow/')) {
    const parts = filePath.split('/');
    if (parts.length >= 3) return parts.slice(0, 3).join('/');
    return 'plugins/kaola-workflow';
  }
  return filePath.split('/')[0];
}

function extractFilePaths(text) {
  const paths = new Set();
  const source = String(text || '');
  let match;
  FILE_PATH_REGEX.lastIndex = 0;
  while ((match = FILE_PATH_REGEX.exec(source)) !== null) {
    const filePath = normalizeRepoPath(match[1]);
    if (filePath.includes('/')) paths.add(filePath);
  }
  return paths;
}

function extractCoarseAreas(text) {
  const areas = new Set();
  for (const filePath of extractFilePaths(text)) {
    areas.add(areaForPath(filePath));
  }
  const source = String(text || '');
  let match;
  AREA_PATH_REGEX.lastIndex = 0;
  while ((match = AREA_PATH_REGEX.exec(source)) !== null) {
    const area = normalizeRepoPath(match[1]);
    if (area) areas.add(area);
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

function parseAreaLabelsFromText(text) {
  return parseAreaLabels((String(text || '').match(/area:[A-Za-z0-9_-]+/g) || []).map(s => ({ name: s })));
}

function labelName(label) {
  return String((label && label.name) || label || '');
}

function issueHasWorkflowInProgressLabel(labels) {
  return (labels || []).some(function(label) {
    return labelName(label) === 'workflow:in-progress';
  });
}

function issueHasRemoteClaimComment(issueNum) {
  if (OFFLINE) return false;
  const repo = getRepoOwnerName();
  if (!repo) return false;
  try {
    const raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/' + issueNum + '/comments']);
    const comments = JSON.parse(raw || '[]');
    return comments.some(function(comment) {
      if (!comment || !comment.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(comment.body)) return false;
      if (!comment.updated_at) return true;
      return Date.now() - new Date(comment.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (_) {
    return false;
  }
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

const SHARED_INFRA = new Set(['scripts', 'hooks', 'plugins/kaola-workflow/scripts']);

function scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, activeFolders, root) {
  let hasExactOverlap = false;
  let exactOverlapPath = '';
  let hasDirectOverlap = false;
  let directOverlapArea = '';
  let hasSharedInfraOverlap = false;
  let sharedOverlapArea = '';
  let hasAreaLabelOverlap = false;
  let anyClaimedAtPhaseLeTwo = false;

  for (const folder of activeFolders) {
    if (!isSafeName(folder.project)) continue;
    const projectDir = path.join(root, 'kaola-workflow', folder.project);
    if (!fs.existsSync(projectDir)) continue;

    let phase3Content = '';
    let phase1Content = '';
    try { phase3Content = fs.readFileSync(path.join(projectDir, 'phase3-plan.md'), 'utf8'); } catch (_) {}
    try { phase1Content = fs.readFileSync(path.join(projectDir, 'phase1-research.md'), 'utf8'); } catch (_) {}

    const combined = phase3Content + phase1Content;
    const claimedPaths = extractFilePaths(combined);
    const claimedAreas = extractCoarseAreas(combined);
    const claimedAreaLabels = parseAreaLabelsFromText(combined);

    if (!fs.existsSync(path.join(projectDir, 'phase3-plan.md'))) anyClaimedAtPhaseLeTwo = true;

    for (const filePath of candidatePaths) {
      if (claimedPaths.has(filePath)) {
        if (!hasExactOverlap) exactOverlapPath = filePath;
        hasExactOverlap = true;
      }
    }

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

  return { hasExactOverlap, exactOverlapPath, hasDirectOverlap, directOverlapArea, hasSharedInfraOverlap, sharedOverlapArea, hasAreaLabelOverlap, anyClaimedAtPhaseLeTwo };
}

function checkDependsOn(depN) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depN + ' label present; conservative block' };
  }
  let depState = 'open';
  try {
    const raw = ghExec(['issue', 'view', String(depN), '--json', 'state,closedAt']);
    depState = String(JSON.parse(raw).state || 'open').toLowerCase();
  } catch (_) {}
  if (depState !== 'closed') {
    return { verdict: 'blocked', reasoning: 'depends-on:#' + depN + ' is still open' };
  }
  return null;
}

function classify(issue, activeFolders, root) {
  const depN = parseDependsOn(issue.labels || []);
  if (depN !== null) {
    const blocked = checkDependsOn(depN);
    if (blocked) return blocked;
  }

  const candidatePaths = extractFilePaths(issue.body || '');
  const candidateAreas = extractCoarseAreas(issue.body || '');
  const candidateAreaLabels = parseAreaLabels(issue.labels || []);
  for (const area of parseAreaLabelsFromText(issue.body || '')) candidateAreaLabels.add(area);

  const {
    hasExactOverlap, exactOverlapPath,
    hasDirectOverlap, directOverlapArea,
    hasSharedInfraOverlap, sharedOverlapArea,
    hasAreaLabelOverlap, anyClaimedAtPhaseLeTwo,
  } = scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, activeFolders, root);

  if (hasExactOverlap) {
    return { verdict: 'red', reasoning: 'exact file path overlap at "' + exactOverlapPath + '" with a claimed project' };
  }

  if (hasDirectOverlap) {
    return { verdict: 'red', reasoning: 'file-set overlap at coarse area "' + directOverlapArea + '" with a claimed project' };
  }

  const noPathInfo = candidateAreas.size === 0 && candidateAreaLabels.size === 0;
  if (noPathInfo && activeFolders.length > 0 && anyClaimedAtPhaseLeTwo) {
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

function cmdClassify(argv) {
  const args = parseArgs(argv || process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' }) + '\n');
    return;
  }

  const root = getRoot();
  const activeFolders = readActiveFolders(root);
  const activeStateIssues = new Set(activeFolders.map(folder => folder.issue_number).filter(Boolean));

  // Already claimed → exit 2, no stdout
  if (activeStateIssues.has(args.issue)) {
    process.exitCode = 2;
    return;
  }

  // OFFLINE path — read from local roadmap file
  if (OFFLINE) {
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_number === args.issue)) {
      process.stdout.write(JSON.stringify({
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
      }) + '\n');
      return;
    }
    let labels = [];
    let body = '';
    if (fs.existsSync(roadmapFile)) {
      const content = fs.readFileSync(roadmapFile, 'utf8');
      const nextStep = field(content, 'next_step');
      if (/blocked by #\d+/i.test(nextStep)) {
        const m = nextStep.match(/#(\d+)/);
        if (m) labels = [{ name: 'depends-on:#' + m[1] }];
      }
      for (const area of parseAreaLabelsFromText(content)) labels.push({ name: 'area:' + area });
      body = content;
    }
    const result = classify({ number: args.issue, labels, body }, activeFolders, root);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  // Online path
  let issue;
  try {
    const raw = ghExec(['issue', 'view', String(args.issue), '--json', 'number,title,body,labels,state']);
    issue = JSON.parse(raw);
  } catch (_) {
    process.stdout.write(JSON.stringify({ verdict: 'target_unavailable', reasoning: 'gh issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  if (issueHasWorkflowInProgressLabel(issue.labels || []) || issueHasRemoteClaimComment(args.issue)) {
    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');
    return;
  }

  const result = classify(issue, activeFolders, root);
  process.stdout.write(JSON.stringify(result) + '\n');
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(
    'usage: kaola-workflow-classifier.js [classify] --issue <N> [--json]\n' +
    '       kaola-workflow-classifier.js --issue <N> [--json]   (top-level form)\n' +
    '       kaola-workflow-classifier.js --help\n'
  );
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-classifier.js [classify] --issue <N>');
  if (sub === '--help' || sub === '-h') { printHelp(); return; }
  if (sub === '--issue') return cmdClassify(process.argv.slice(2));
  if (sub === 'classify') return cmdClassify(process.argv.slice(3));
  throw new Error('unknown subcommand: ' + sub);
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
