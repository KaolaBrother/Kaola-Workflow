#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { readActiveFolders } = require('./kaola-workflow-active-folders');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema'); // #238: curated root-path vocabulary (byte-identical anchor)

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
    const defaults = { parallel_mode: 'auto', enable_adaptive: false };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// File-path extraction
// ---------------------------------------------------------------------------

// issue #237: the FIRST path segment admits an optional leading dot (`\.?`) so dot-leading
// CI/CD + supply-chain paths (`.github/workflows/*`, `.circleci/config.yml`, `.gitlab-ci.yml`
// when slash-bearing) are captured on BOTH sides of the cross-project claim-overlap check
// (candidate issue.body prose AND the claimed-side combined blob, which already stringifies
// the plan/fast write sets). A slash is STILL required, so a BARE word never matches (`Node.js`,
// `package.json`, `config.json` stay empty — the preceding-char guard `[^A-Za-z0-9_./-]` rejects
// a `.` before the token, so `..`/`x.` cannot start a match and `\.?` admits at most one leading
// dot). NOTE (v3.20.1): a dot-leading SLASH-BEARING prose token (e.g. `.NET/Core`, `.config/x`)
// CAN still over-match — accepted as the safe OVER-block direction (it conservatively blocks a
// claim the user resolves by editing the issue body, identical in kind to the pre-existing
// `word/word` prose over-match like `read/write`). Closes the audit A2′ blind spot.
const FILE_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])(\.?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
const AREA_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])([A-Za-z0-9_-]+)\/(?=$|[^A-Za-z0-9_./-])/g;

function normalizeRepoPath(raw) {
  return String(raw || '')
    .replace(/^touches:/, '')
    .replace(/^[`'"]+/, '')
    .replace(/[`'",.;:)\]}]+$/, '')
    .trim()
    // v3.21.0: canonicalize so the SAME physical file compares equal everywhere — strip leading
    // `./` segments and collapse repeated slashes. Without this, a declared `./lib/foo.js` vs
    // `lib/foo.js` (or `lib//foo.js`) are distinct strings, which defeated the exact-file
    // clobber refusal + disjointness check and skewed areaForPath (`.` vs `lib`). (Adversarial
    // finding against the v3.20.1 #232/#233 exact-file fix.) `../` is left untouched on purpose
    // (resolving it changes meaning and is out of scope).
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/{2,}/g, '/');
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

// issue #227 audit fix (A2/A2′): parse a frozen plan's declared_write_set CELL structurally.
// The cell is an author-declared, comma/space-separated path list — NOT free prose — so it must
// be parsed structurally, not with the prose-oriented extractFilePaths() path-finder. That
// finder requires a "/" AND a non-dot first segment, which SILENTLY DROPS root-level files
// (Dockerfile, .env, secrets.yaml) and dot-leading paths (.github/workflows/deploy.yml,
// .gitlab-ci.yml). Those drops let code / secret / CI writes evade the G1/G2 gates and the
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

// Return the body of a `## {heading}` markdown section, up to the next h2
// heading (or EOF). Used to read only a fast-summary.md's `## Scope` block,
// excluding later evidence/review sections that carry incidental path tokens.
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

function isSharedInfra(area) {
  return SHARED_INFRA.has(area);
}

// issue #227 (adaptive path): parse the `## Nodes` table of a frozen workflow-plan.md
// into node objects. Tolerant to column reorder (maps by header name). The
// declared_write_set cell is parsed structurally with parseWriteSetCell() so root-level
// and dot-leading paths are not silently dropped (audit A2/A2′); the empty/dash read-only
// carve-out still applies. depends_on splits on comma.
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
    if (/^[-:\s]+$/.test(cells.join(''))) continue; // separator row
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

// issue #227 (adaptive path): N-way pairwise disjointness verdict over declared
// node write sets, applied WITHIN one issue (the cross-folder scanClaimedOverlap
// is candidate-vs-active only). Mirrors classify()'s direct verdict and reuses
// areaForPath + SHARED_INFRA: exact-path RED > non-shared coarse-area RED >
// shared-infra YELLOW > GREEN. Empty / role-namespaced sets are trivially
// disjoint by construction (read-only fan-out carve-out → GREEN/PASS).
function disjointWriteSets(nodeWriteSets) {
  const sets = (nodeWriteSets || []).map(s => (s instanceof Set ? s : new Set(s || [])));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i], b = sets[j];
      if (a.size === 0 || b.size === 0) continue; // read-only carve-out: PASS on empty
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

function scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, candidateCuratedRoot, activeFolders, root) {
  let hasExactOverlap = false;
  let exactOverlapPath = '';
  let hasDirectOverlap = false;
  let directOverlapArea = '';
  let hasSharedInfraOverlap = false;
  let sharedOverlapArea = '';
  let hasAreaLabelOverlap = false;
  let hasCuratedRootOverlap = false;
  let curatedRootOverlapName = '';
  let anyClaimedAtPhaseLeTwo = false;

  for (const folder of activeFolders) {
    if (!isSafeName(folder.project)) continue;
    const projectDir = path.join(root, 'kaola-workflow', folder.project);
    if (!fs.existsSync(projectDir)) continue;

    let phase3Content = '';
    let phase1Content = '';
    let fastScope = '';
    try { phase3Content = fs.readFileSync(path.join(projectDir, 'phase3-plan.md'), 'utf8'); } catch (_) {}
    try { phase1Content = fs.readFileSync(path.join(projectDir, 'phase1-research.md'), 'utf8'); } catch (_) {}
    // issue #207: a fast project produces no phase files; its only file-set-bearing
    // artifact is fast-summary.md. Read its declared write set from the `## Scope`
    // section only, so its in-flight files are visible to overlap detection (parity
    // with full projects). Scope-only avoids false overlaps from command/test-output
    // path tokens in the Implementation Evidence / Review sections.
    try { fastScope = sectionBody(fs.readFileSync(path.join(projectDir, 'fast-summary.md'), 'utf8'), 'Scope'); } catch (_) {}
    // issue #227 / #238: an adaptive project declares its write set STRUCTURALLY in
    // workflow-plan.md's `## Nodes` table. Fold those parsed paths in DIRECTLY (they
    // natively carry root-level + dot-leading + slash paths) instead of stringifying
    // them and re-extracting via the prose path-finder, which silently re-drops the
    // root-level ones (the v3.20.x #237 partial-fix gap). The prose artifacts
    // (phase1/phase3/fast Scope) still go through the prose extractors.
    const structuredClaimed = new Set();
    try {
      for (const n of readPlanNodes(path.join(projectDir, 'workflow-plan.md'))) {
        for (const p of n.writeSet) structuredClaimed.add(p);
      }
    } catch (_) {}

    const combined = phase3Content + '\n' + phase1Content + '\n' + fastScope;
    const claimedPaths = extractFilePaths(combined);
    const claimedAreas = extractCoarseAreas(combined);
    const claimedAreaLabels = parseAreaLabelsFromText(combined);
    // #238: curated root (slashless) files on the claimed side — prose artifacts via the matcher,
    // structured plan write sets folded directly (exact membership, no lossy re-tokenize).
    const claimedCuratedRoot = adaptiveSchema.extractCuratedRootPaths(combined);
    for (const p of structuredClaimed) {
      claimedPaths.add(p);                                   // exact-overlap (slash/dot paths)
      claimedAreas.add(areaForPath(p));                       // coarse-area overlap
      if (adaptiveSchema.isCuratedRoot(p)) claimedCuratedRoot.add(p);  // curated-root overlap
    }

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

    // #238: candidate (issue-body prose) curated root file ∩ claimed curated root file. Routed to
    // ASK (yellow), never RED — both sides can name a curated file in prose, so over-ask is the safe
    // direction (vs the prose-allowlist over-block that #237 deliberately avoided).
    for (const p of candidateCuratedRoot) {
      if (claimedCuratedRoot.has(p)) { if (!hasCuratedRootOverlap) curatedRootOverlapName = p; hasCuratedRootOverlap = true; }
    }
  }

  return { hasExactOverlap, exactOverlapPath, hasDirectOverlap, directOverlapArea, hasSharedInfraOverlap, sharedOverlapArea, hasAreaLabelOverlap, hasCuratedRootOverlap, curatedRootOverlapName, anyClaimedAtPhaseLeTwo };
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
  // #238: curated root (slashless) filenames named in the issue-body prose (Dockerfile, .env, …).
  const candidateCuratedRoot = adaptiveSchema.extractCuratedRootPaths(issue.body || '');

  const {
    hasExactOverlap, exactOverlapPath,
    hasDirectOverlap, directOverlapArea,
    hasSharedInfraOverlap, sharedOverlapArea,
    hasAreaLabelOverlap, hasCuratedRootOverlap, curatedRootOverlapName, anyClaimedAtPhaseLeTwo,
  } = scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, candidateCuratedRoot, activeFolders, root);

  if (hasExactOverlap) {
    return { verdict: 'red', reasoning: 'exact file path overlap at "' + exactOverlapPath + '" with a claimed project' };
  }

  if (hasDirectOverlap) {
    return { verdict: 'red', reasoning: 'file-set overlap at coarse area "' + directOverlapArea + '" with a claimed project' };
  }

  // #238: a named curated root file IS footprint info — don't treat a curated-only candidate as
  // "no path info" and conservatively red it.
  const noPathInfo = candidateAreas.size === 0 && candidateAreaLabels.size === 0 && candidateCuratedRoot.size === 0;
  if (noPathInfo && activeFolders.length > 0 && anyClaimedAtPhaseLeTwo) {
    return { verdict: 'red', reasoning: 'no extractable file paths or area labels; claimed project in phase <= 2; conservative red' };
  }

  if (hasSharedInfraOverlap) {
    return { verdict: 'yellow', reasoning: 'shared-infra area "' + sharedOverlapArea + '" overlap; proceed with caution' };
  }

  // #238: curated root-file overlap → ASK (never RED): both sides can name a curated file in prose.
  if (hasCuratedRootOverlap) {
    return { verdict: 'yellow', reasoning: 'curated root file "' + curatedRootOverlapName + '" overlap (CI/secrets/lockfile/manifest) with a claimed project; proceed with caution' };
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

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  extractFilePaths,
  extractCoarseAreas,
  parseWriteSetCell,
  sectionBody,
  areaForPath,
  SHARED_INFRA,
  isSharedInfra,
  readPlanNodes,
  disjointWriteSets,
};
