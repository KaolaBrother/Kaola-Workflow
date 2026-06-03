#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const forge = require('./kaola-gitea-forge');
const active = require('./kaola-gitea-workflow-active-folders');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function labelName(label) {
  return String((label && label.name) || label || '');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function readOrCreateConfig() {
  const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const defaults = { parallel_mode: 'auto', enable_adaptive: false };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}

// issue #237: leading-dot first segment captures dot-leading CI/CD + supply-chain paths
// (.github/workflows/*, .gitea/* when slash-bearing) on both sides of the claim-overlap
// check; a slash is still required so a BARE word never matches. NOTE (v3.20.1): a dot-leading
// slash-bearing prose token (.NET/Core, .config/x) CAN over-match — accepted as the safe
// over-block direction (consistent with the pre-existing word/word prose over-match).
const FILE_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])(\.?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
const AREA_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])([A-Za-z0-9_-]+)\/(?=$|[^A-Za-z0-9_./-])/g;
const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;
const SHARED_INFRA = new Set(['scripts', 'hooks', 'plugins/kaola-workflow-gitea/scripts']);

function isSharedInfra(area) {
  return SHARED_INFRA.has(area);
}

// issue #227 (adaptive path): parse the `## Nodes` table of a frozen workflow-plan.md
// into node objects (tolerant to column reorder; write set via parseWriteSetCell so root-level
// and dot-leading paths are not silently dropped (audit A2/A2′); read-only carve-out applies).
function readPlanNodes(planPath) {
  let content = '';
  try { content = fs.readFileSync(planPath, 'utf8'); } catch (_) { return []; }
  const body = sectionBody(content, 'Nodes');
  const rows = body.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (rows.length < 2) return [];
  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idx = name => header.indexOf(name);
  const nodes = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].split('|').slice(1, -1).map(c => c.trim());
    if (/^[-:\s]+$/.test(cells.join(''))) continue;
    const get = n => (idx(n) >= 0 ? cells[idx(n)] : '') || '';
    const id = get('id');
    if (!id) continue;
    nodes.push({
      id,
      role: get('role'),
      dependsOn: get('depends_on').split(',').map(s => s.replace(/[#\s]/g, '')).filter(s => s && s !== '—' && s !== '-'),
      writeSet: parseWriteSetCell(get('declared_write_set')),
      cardinality: get('cardinality'),
      shape: get('shape'),
    });
  }
  return nodes;
}

// issue #227 (adaptive path): N-way pairwise disjointness verdict over declared node
// write sets, applied WITHIN one issue. Mirrors classify()'s direct verdict: exact-path
// RED > non-shared coarse-area RED > shared-infra YELLOW > GREEN. PASS on empty sets.
function disjointWriteSets(nodeWriteSets) {
  const sets = (nodeWriteSets || []).map(s => (s instanceof Set ? s : new Set(s || [])));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i], b = sets[j];
      if (a.size === 0 || b.size === 0) continue;
      for (const p of a) {
        if (b.has(p)) return { verdict: 'red', reasoning: 'exact file path overlap at "' + p + '" between nodes ' + i + ' and ' + j };
      }
      const areasB = new Set();
      for (const p of b) areasB.add(areaForPath(p));
      let sharedHit = '';
      for (const p of a) {
        const area = areaForPath(p);
        if (areasB.has(area)) {
          if (!SHARED_INFRA.has(area)) return { verdict: 'red', reasoning: 'coarse-area overlap at "' + area + '" between nodes ' + i + ' and ' + j };
          if (!sharedHit) sharedHit = area;
        }
      }
      if (sharedHit) return { verdict: 'yellow', reasoning: 'shared-infra area "' + sharedHit + '" overlap between nodes ' + i + ' and ' + j };
    }
  }
  return { verdict: 'green', reasoning: 'node write sets are pairwise disjoint' };
}

function normalizeRepoPath(raw) {
  return String(raw || '')
    .replace(/^touches:/, '')
    .replace(/^[`'"]+/, '')
    .replace(/[`'",.;:)\]}]+$/, '')
    .trim();
}

function areaForPath(filePath) {
  if (filePath.startsWith('plugins/kaola-workflow-gitea/')) {
    const parts = filePath.split('/');
    if (parts.length >= 3) return parts.slice(0, 3).join('/');
    return 'plugins/kaola-workflow-gitea';
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

// issue #227 audit fix (A2/A2′): parse a frozen plan's declared_write_set CELL structurally.
// The cell is an author-declared, comma/space-separated path list — NOT free prose — so it must
// be parsed structurally, not with the prose-oriented extractFilePaths() path-finder. That
// finder requires a "/" AND a non-dot first segment, which SILENTLY DROPS root-level files
// (Dockerfile, Makefile, secrets.yaml, build.env) and any dot-leading path (a "."-prefixed
// CI or config directory). Those drops let code / secret / CI writes evade the G1/G2 gates and the
// FILE_CEILING. Here every non-empty normalized token counts (fail-closed: an author who
// declares a write is taken at their word). The empty / dash markers preserve the read-only
// carve-out (no declared writes => trivially disjoint).
function parseWriteSetCell(cell) {
  const set = new Set();
  const raw = String(cell || '').trim();
  if (!raw || raw === '—' || raw === '-') return set;
  for (const tok of raw.split(/[\s,]+/)) {
    const p = normalizeRepoPath(tok);
    if (p && p !== '—' && p !== '-') set.add(p);
  }
  return set;
}

function extractCoarseAreas(text) {
  const areas = new Set();
  for (const filePath of extractFilePaths(text)) areas.add(areaForPath(filePath));
  const source = String(text || '');
  let match;
  AREA_PATH_REGEX.lastIndex = 0;
  while ((match = AREA_PATH_REGEX.exec(source)) !== null) {
    const area = normalizeRepoPath(match[1]);
    if (area) areas.add(area);
  }
  return areas;
}

// Return the body of a `## {heading}` markdown section, up to the next h2
// heading (or EOF). Used to read only a fast-summary.md's `## Scope` block.
// issue #213: h2-only so a `#`-prefixed line inside a fenced code block in the
// section body does not truncate the slice.
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  // issue #215: fence-aware body collector — a fenced `## ` heading inside ## Scope must not
  // trigger the h2 boundary. Family-only tracking: close only on a same-family delimiter
  // (backtick closes backtick, tilde closes tilde). Run-length not tracked — workflow output
  // never emits 4+ backtick fences (input-contract assumption, not a universal guarantee).
  // The heading-locator loop below has no fence tracking: ## Scope is never inside a fenced
  // block in well-formed fast-summary.md output, so tracking there would only introduce a
  // false-GREEN regression if a pre-Scope section left an unclosed fence.
  const fenceRe = /^(`{3,}|~{3,})/;
  let inFence = false;
  let fenceFamily = '';
  let i = 0;
  for (; i < lines.length; i++) {
    if (headRe.test(lines[i])) { i++; break; }
  }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    const fm = lines[i].trim().match(fenceRe);
    if (fm) {
      const fam = fm[1][0];
      if (!inFence) { inFence = true; fenceFamily = fam; }
      else if (fam === fenceFamily) { inFence = false; fenceFamily = ''; }
    }
    if (!inFence && /^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function parseDependsOn(labels) {
  for (const label of labels || []) {
    const match = labelName(label).match(DEPENDS_ON_REGEX);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function parseAreaLabels(labels) {
  const areas = new Set();
  for (const label of labels || []) {
    const name = labelName(label);
    if (name.startsWith('area:')) areas.add(name.slice(5).trim());
  }
  return areas;
}

function parseAreaLabelsFromText(text) {
  return parseAreaLabels((String(text || '').match(/area:[A-Za-z0-9_-]+/g) || []).map(name => ({ name })));
}

function checkDependsOn(depIid) {
  if (OFFLINE) {
    return { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + depIid + ' label present; conservative block' };
  }
  let state = 'open';
  try {
    state = forge.viewIssue(depIid).state || 'open';
  } catch (_) {}
  if (state !== 'closed') return { verdict: 'blocked', reasoning: 'depends-on:#' + depIid + ' is still open' };
  return null;
}

function localRoadmapIssue(issueIid, repoRoot) {
  const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
  const labels = [];
  let body = '';
  if (fs.existsSync(roadmapFile)) {
    const content = fs.readFileSync(roadmapFile, 'utf8');
    const nextStep = field(content, 'next_step');
    if (/blocked by #\d+/i.test(nextStep)) {
      const match = nextStep.match(/#(\d+)/);
      if (match) labels.push({ name: 'depends-on:#' + match[1] });
    }
    for (const area of parseAreaLabelsFromText(content)) labels.push({ name: 'area:' + area });
    body = content;
  }
  return { issue_iid: issueIid, labels, body };
}

function issueHasWorkflowInProgressLabel(labels) {
  return (labels || []).some(function(label) {
    return labelName(label) === forge.CLAIM_LABEL;
  });
}

function issueHasRemoteClaimNotes(issueIid) {
  if (OFFLINE) return false;
  let project;
  try {
    project = forge.discoverProject();
  } catch (_) {
    return false;
  }
  if (!project || !project.full_name) return false;
  try {
    const notes = forge.listIssueComments(project, issueIid) || [];
    return notes.some(function(note) {
      if (!note || !note.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(note.body)) return false;
      if (!note.updated_at) return true;
      return Date.now() - new Date(note.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (_) {
    return false;
  }
}

function scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, activeFolders) {
  let exactOverlapPath = '';
  let directOverlapArea = '';
  let sharedOverlapArea = '';
  let hasAreaLabelOverlap = false;
  let anyClaimedAtPhaseLeTwo = false;

  for (const folder of activeFolders) {
    if (!active.isSafeName(folder.project)) continue;
    const phase3 = path.join(folder.project_dir, 'phase3-plan.md');
    const phase1 = path.join(folder.project_dir, 'phase1-research.md');
    const fastSummary = path.join(folder.project_dir, 'fast-summary.md');
    let combined = '';
    try { combined += fs.readFileSync(phase3, 'utf8'); } catch (_) {}
    try { combined += fs.readFileSync(phase1, 'utf8'); } catch (_) {}
    // issue #207: read a fast project's declared write set from fast-summary.md's
    // `## Scope` section only, so its in-flight files are visible to overlap detection.
    try { combined += '\n' + sectionBody(fs.readFileSync(fastSummary, 'utf8'), 'Scope'); } catch (_) {}
    // issue #227: an adaptive project declares its write set in workflow-plan.md's
    // `## Nodes` table; fold it in so its footprint is visible to cross-issue overlap.
    try {
      combined += '\n' + readPlanNodes(path.join(folder.project_dir, 'workflow-plan.md'))
        .map(n => Array.from(n.writeSet).join(' ')).join('\n');
    } catch (_) {}

    const claimedPaths = extractFilePaths(combined);
    const claimedAreas = extractCoarseAreas(combined);
    const claimedAreaLabels = parseAreaLabelsFromText(combined);

    if (!fs.existsSync(phase3)) anyClaimedAtPhaseLeTwo = true;

    for (const filePath of candidatePaths) {
      if (claimedPaths.has(filePath) && !exactOverlapPath) exactOverlapPath = filePath;
    }

    for (const area of candidateAreas) {
      if (!claimedAreas.has(area)) continue;
      if (SHARED_INFRA.has(area)) {
        if (!sharedOverlapArea) sharedOverlapArea = area;
      } else if (!directOverlapArea) {
        directOverlapArea = area;
      }
    }

    for (const label of candidateAreaLabels) {
      if (claimedAreaLabels.has(label)) { hasAreaLabelOverlap = true; break; }
    }
  }

  return { exactOverlapPath, directOverlapArea, sharedOverlapArea, hasAreaLabelOverlap, anyClaimedAtPhaseLeTwo };
}

function classify(issue, activeFolders) {
  const depIid = parseDependsOn(issue.labels || []);
  if (depIid !== null) {
    const blocked = checkDependsOn(depIid);
    if (blocked) return blocked;
  }

  const body = issue.body || issue.description || '';
  const candidatePaths = extractFilePaths(body);
  const candidateAreas = extractCoarseAreas(body);
  const candidateAreaLabels = parseAreaLabels(issue.labels || []);
  for (const area of parseAreaLabelsFromText(body)) candidateAreaLabels.add(area);

  const overlap = scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, activeFolders);
  if (overlap.exactOverlapPath) return { verdict: 'red', reasoning: 'exact file path overlap at "' + overlap.exactOverlapPath + '" with a claimed project' };
  if (overlap.directOverlapArea) return { verdict: 'red', reasoning: 'file-set overlap at coarse area "' + overlap.directOverlapArea + '" with a claimed project' };
  if (candidateAreas.size === 0 && candidateAreaLabels.size === 0 && activeFolders.length > 0 && overlap.anyClaimedAtPhaseLeTwo) {
    return { verdict: 'red', reasoning: 'no extractable file paths or area labels; claimed project in phase <= 2; conservative red' };
  }
  if (overlap.sharedOverlapArea) return { verdict: 'yellow', reasoning: 'shared-infra area "' + overlap.sharedOverlapArea + '" overlap; proceed with caution' };
  if (overlap.hasAreaLabelOverlap) return { verdict: 'yellow', reasoning: 'area:* label overlap with a claimed project; proceed with caution' };
  return { verdict: 'green', reasoning: 'no file-set overlap, no dependency block; file sets are disjoint' };
}

function classifyIssue(issueIid, root) {
  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    return { verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' };
  }

  const repoRoot = root || active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);
  if (activeFolders.some(folder => folder.issue_iid === issueIid)) {
    return { verdict: 'owned', reasoning: 'active local folder already exists' };
  }

  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === issueIid)) {
      return {
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + issueIid + ' (no kaola-workflow/.roadmap/issue-' + issueIid + '.md and no active folder in this repository)'
      };
    }
    return classify(localRoadmapIssue(issueIid, repoRoot), activeFolders);
  }

  let issue;
  try {
    issue = forge.viewIssue(issueIid);
  } catch (_) {
    return { verdict: 'target_unavailable', reasoning: 'tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
  }

  const _st = (issue.state || '').toLowerCase();
  if (_st !== 'open' && _st !== 'closed') {
    return { verdict: 'target_unavailable', reasoning: 'tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    return { verdict: 'red', reasoning: 'issue #' + issueIid + ' is already closed' };
  }

  if (issueHasWorkflowInProgressLabel(issue.labels || []) || issueHasRemoteClaimNotes(issueIid)) {
    return { verdict: 'blocked', reasoning: 'issue #' + issueIid + ' has a remote workflow claim' };
  }

  return classify(issue, activeFolders);
}

function cmdClassify() {
  const args = parseArgs(process.argv.slice(3));
  assert(Number.isFinite(args.issue) && args.issue > 0, '--issue <N> required for classify');

  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    process.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' }) + '\n');
    return;
  }

  const repoRoot = active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);

  if (activeFolders.some(function(folder) { return folder.issue_iid === args.issue; })) {
    process.stdout.write(JSON.stringify({ verdict: 'owned', reasoning: 'active local folder already exists' }) + '\n');
    return;
  }

  if (OFFLINE) {
    const roadmapFile = path.join(repoRoot, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    if (!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_iid === args.issue)) {
      process.stdout.write(JSON.stringify({
        verdict: 'target_unverified',
        reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no kaola-workflow/.roadmap/issue-' + args.issue + '.md and no active folder in this repository)'
      }) + '\n');
      return;
    }
    const result = classify(localRoadmapIssue(args.issue, repoRoot), activeFolders);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  let issue;
  try {
    issue = forge.viewIssue(args.issue);
  } catch (_) {
    process.stdout.write(JSON.stringify({ verdict: 'target_unavailable', reasoning: 'tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' }) + '\n');
    return;
  }

  const _st2 = (issue.state || '').toLowerCase();
  if (_st2 !== 'open' && _st2 !== 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'target_unavailable', reasoning: 'tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  if (issueHasWorkflowInProgressLabel(issue.labels || []) || issueHasRemoteClaimNotes(args.issue)) {
    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');
    return;
  }

  const result = classify(issue, activeFolders);
  process.stdout.write(JSON.stringify(result) + '\n');
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitea-workflow-classifier.js <classify>');
  if (sub === 'classify') return cmdClassify();
  throw new Error('unknown subcommand: ' + sub);
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  classify,
  classifyIssue,
  extractCoarseAreas,
  extractFilePaths,
  parseWriteSetCell,
  sectionBody,
  areaForPath,
  SHARED_INFRA,
  isSharedInfra,
  readPlanNodes,
  disjointWriteSets,
  issueHasRemoteClaimNotes,
  issueHasWorkflowInProgressLabel,
  parseDependsOn,
  readOrCreateConfig
};
