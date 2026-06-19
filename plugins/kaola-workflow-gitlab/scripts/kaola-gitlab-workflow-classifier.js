#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema'); // #238: curated root-path vocabulary (byte-identical anchor)

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
    const defaults = { parallel_mode: 'auto', installed_paths: [] };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}

// issue #237: leading-dot first segment captures dot-leading CI/CD + supply-chain paths
// (.github/workflows/*, .gitlab-ci.yml when slash-bearing) on both sides of the claim-overlap
// check; a slash is still required so a BARE word never matches. NOTE (v3.20.1): a dot-leading
// slash-bearing prose token (.NET/Core, .config/x) CAN over-match — accepted as the safe
// over-block direction (consistent with the pre-existing word/word prose over-match).
const FILE_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])(\.?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
const AREA_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])([A-Za-z0-9_-]+)\/(?=$|[^A-Za-z0-9_./-])/g;
const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;
const SHARED_INFRA = new Set(['scripts', 'hooks', 'plugins/kaola-workflow-gitlab/scripts']);

function isSharedInfra(area) {
  return SHARED_INFRA.has(area);
}

// #463 (D-419 write-overlap): PROTECTED concrete files — these STAY BLOCKING at EVERY write_overlap_policy
// tier even when their coarse area relaxes. PROTECTED is a CONCRETE-FILE concept (a specific path / a
// basename pattern), DISTINCT from the SHARED_INFRA *area* set: a file under a relaxable area is still
// refused if it is PROTECTED. The set: dependency lockfiles, the generated roadmap mirror, the changelog,
// install manifests, finalization/archive artifacts, and the byte-identical-×4 anchor
// kaola-workflow-adaptive-schema.js (relaxing it would let two legs diverge the cross-edition anchor).
const PROTECTED_BASENAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'poetry.lock', 'Gemfile.lock', 'composer.lock', 'go.sum',
  'CHANGELOG.md', 'ROADMAP.md',
  'kaola-workflow-install-manifest.js', 'kaola-workflow-adaptive-schema.js',
]);
const PROTECTED_PATH_MARKERS = [
  'kaola-workflow/ROADMAP.md',
  'kaola-workflow/.roadmap/',
  'kaola-workflow/archive/',
  '.archived-',
];
function isProtected(filePath) {
  const p = String(filePath || '').trim();
  if (!p) return false;
  const base = p.split('/').pop();
  if (PROTECTED_BASENAMES.has(base)) return true;
  for (const marker of PROTECTED_PATH_MARKERS) { if (p.indexOf(marker) !== -1) return true; }
  return false;
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
      // #382: per-node model tier — parity with validator.parseNodes (absent/'—' => '').
      model: (() => { const v = get('model'); return (v && v !== '—' && v !== '-') ? v.toLowerCase() : ''; })(),
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
        if (b.has(p)) return { verdict: 'red', kind: 'exact', reasoning: 'exact file path overlap at "' + p + '" between nodes ' + i + ' and ' + j };
      }
      const areasB = new Set();
      for (const p of b) areasB.add(areaForPath(p));
      let sharedHit = '';
      for (const p of a) {
        const area = areaForPath(p);
        if (areasB.has(area)) {
          if (!SHARED_INFRA.has(area)) return { verdict: 'red', kind: 'coarse', reasoning: 'coarse-area overlap at "' + area + '" between nodes ' + i + ' and ' + j };
          if (!sharedHit) sharedHit = area;
        }
      }
      if (sharedHit) return { verdict: 'yellow', kind: 'shared-infra', reasoning: 'shared-infra area "' + sharedHit + '" overlap between nodes ' + i + ' and ' + j };
    }
  }
  return { verdict: 'green', kind: null, reasoning: 'node write sets are pairwise disjoint' };
}

function normalizeRepoPath(raw) {
  return String(raw || '')
    .replace(/^touches:/, '')
    .replace(/^[`'"]+/, '')
    .replace(/[`'",.;:)\]}]+$/, '')
    .trim()
    // v3.21.0: canonicalize the same physical file — strip leading `./` segments and collapse
    // repeated slashes so `./lib/foo.js` / `lib//foo.js` compare equal to `lib/foo.js` (closes the
    // exact-file clobber / disjointness gap found adversarially). `../` left untouched on purpose.
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/{2,}/g, '/')
    // #388: collapse INNER `/./` segments so the SAME physical file compares equal everywhere
    // (`src/./app.js` === `src/app.js`) — closes the antichain/clobber evasion + the barrier-death
    // shape. NO refusal here and NOT exported; trailing-`/` directory semantics (#381) preserved.
    .replace(/\/\.\//g, '/')
    .replace(/\/\.$/, '/');
}

function areaForPath(filePath) {
  if (filePath.startsWith('plugins/kaola-workflow-gitlab/')) {
    const parts = filePath.split('/');
    if (parts.length >= 3) return parts.slice(0, 3).join('/');
    return 'plugins/kaola-workflow-gitlab';
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
// CI or config directory). Those drops let code / secret / CI writes evade the G1/G2 gates. Here
// every non-empty normalized token counts (fail-closed: an author who
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

// #519 (site 5 equivalent): claim-DETECTION is best-effort. A no-CLI / spawn fault, a genuine
// non-zero, or a malformed/swallowed body all stay a return-false (no detectable claim), UNCHANGED.
// We re-throw a TransientFetchError ONLY when the exec stderr carries a KNOWN transient-infra
// signature (TLS timeout / rate-limit / DNS) — that blip would otherwise conflate to "no claim". The
// narrow signature predicate keeps the no-CLI / offline path returning false (not escalating).
function isInfraTransientExec(e) {
  if (e instanceof TransientFetchError || e.transient === true) return true;
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

function issueHasRemoteClaimNotes(issueIid) {
  if (OFFLINE) return false;
  let project;
  try {
    project = forge.discoverProject();
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('glab repo view transient fault', e);
    return false;
  }
  if (!project || !project.project_id) return false;
  try {
    const notes = forge.listIssueNotes(project, issueIid) || [];
    return notes.some(function(note) {
      if (!note || !note.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(note.body)) return false;
      if (!note.updated_at) return true;
      return Date.now() - new Date(note.updated_at).getTime() < 24 * 60 * 60 * 1000;
    });
  } catch (e) {
    if (isInfraTransientExec(e)) throw new TransientFetchError('glab api notes transient fault', e);
    return false;
  }
}

function scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, candidateCuratedRoot, activeFolders) {
  let exactOverlapPath = '';
  let directOverlapArea = '';
  let sharedOverlapArea = '';
  let hasAreaLabelOverlap = false;
  let curatedRootOverlapName = '';
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
    // issue #227 / #238: fold the adaptive plan's STRUCTURED write set in directly (it natively
    // carries root-level + dot-leading paths) instead of stringifying it and re-extracting via the
    // prose path-finder, which re-drops the root-level ones.
    const structuredClaimed = new Set();
    try {
      for (const n of readPlanNodes(path.join(folder.project_dir, 'workflow-plan.md'))) {
        for (const p of n.writeSet) structuredClaimed.add(p);
      }
    } catch (_) {}

    const claimedPaths = extractFilePaths(combined);
    const claimedAreas = extractCoarseAreas(combined);
    const claimedAreaLabels = parseAreaLabelsFromText(combined);
    // #238: curated root (slashless) files — prose via the matcher, structured folded directly.
    const claimedCuratedRoot = adaptiveSchema.extractCuratedRootPaths(combined);
    for (const p of structuredClaimed) {
      claimedPaths.add(p);
      claimedAreas.add(areaForPath(p));
      // curated-root overlap: store the CANONICAL name (case-folded) so it intersects the canonical
      // candidate/prose sets — a raw add would fail open for a non-canonical-case declaration (#238 v3.21.0).
      const canon = adaptiveSchema.canonicalCuratedRoot(p);
      if (canon) claimedCuratedRoot.add(canon);
    }

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

    // #238: candidate (prose) curated root file ∩ claimed curated root file -> ASK (yellow), never RED.
    for (const p of candidateCuratedRoot) {
      if (claimedCuratedRoot.has(p) && !curatedRootOverlapName) curatedRootOverlapName = p;
    }
  }

  return { exactOverlapPath, directOverlapArea, sharedOverlapArea, hasAreaLabelOverlap, curatedRootOverlapName, anyClaimedAtPhaseLeTwo };
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
  const candidateCuratedRoot = adaptiveSchema.extractCuratedRootPaths(body); // #238

  const overlap = scanClaimedOverlap(candidatePaths, candidateAreas, candidateAreaLabels, candidateCuratedRoot, activeFolders);
  if (overlap.exactOverlapPath) return { verdict: 'red', reasoning: 'exact file path overlap at "' + overlap.exactOverlapPath + '" with a claimed project' };
  if (overlap.directOverlapArea) return { verdict: 'red', reasoning: 'file-set overlap at coarse area "' + overlap.directOverlapArea + '" with a claimed project' };
  // #238: a named curated root file IS footprint info — don't conservative-red a curated-only candidate.
  if (candidateAreas.size === 0 && candidateAreaLabels.size === 0 && candidateCuratedRoot.size === 0 && activeFolders.length > 0 && overlap.anyClaimedAtPhaseLeTwo) {
    return { verdict: 'red', reasoning: 'no extractable file paths or area labels; claimed project in phase <= 2; conservative red' };
  }
  if (overlap.sharedOverlapArea) return { verdict: 'yellow', reasoning: 'shared-infra area "' + overlap.sharedOverlapArea + '" overlap; proceed with caution' };
  // #238: curated root-file overlap -> ASK (never RED).
  if (overlap.curatedRootOverlapName) return { verdict: 'yellow', reasoning: 'curated root file "' + overlap.curatedRootOverlapName + '" overlap (CI/secrets/lockfile/manifest) with a claimed project; proceed with caution' };
  if (overlap.hasAreaLabelOverlap) return { verdict: 'yellow', reasoning: 'area:* label overlap with a claimed project; proceed with caution' };
  return { verdict: 'green', reasoning: 'no file-set overlap, no dependency block; file sets are disjoint' };
}

// #507: boundary-2 fetch error classification — mirrors root classifier classifyFetchError.
// Partitions the error from a glab/forge CLI fetch into three buckets:
//   'spawn_fault'   — CLI never started (ENOENT/EAGAIN/EMFILE/ENOMEM; e.status is null, no signal)
//   'killed'        — CLI was signalled or timed out (e.killed===true or e.signal present)
//   'clean_nonzero' — CLI ran and exited non-zero (e.status is a non-null number); determinate
function classifyFetchError(e) {
  if (e.status != null) return 'clean_nonzero';
  if (e.killed === true || e.signal) return 'killed';
  if (e.code && ['ENOENT', 'EAGAIN', 'EMFILE', 'ENOMEM'].indexOf(e.code) !== -1) return 'spawn_fault';
  return 'killed'; // unknown non-status fault — treat as transient
}

// #519: AXIS REPLACEMENT — partition a glab/forge CLI fetch error by its stderr ERROR-CLASS, not by
// exit code alone. A clean_nonzero exit carrying a TRANSIENT-INFRA signature (TLS handshake timeout /
// API rate-limit / DNS "Could not resolve host" / connection reset / ETIMEDOUT / 5xx) escalates like
// a killed/spawn-fault; a genuine-negative (404 / "Could not resolve to an Issue" / closed) — and ANY
// UNRECOGNIZED stderr — stays determinate-refuse (escalation requires positive infra evidence).
const TRANSIENT_FETCH_STDERR = [
  /\bTLS\b/i,
  /handshake/i,
  /\btimed?\s*out\b/i,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /connection reset/i,
  /connection refused/i,
  /\bECONNREFUSED\b/i,
  /rate limit/i,
  /\b429\b/,
  /could not resolve host/i,
  /\bEAI_AGAIN\b/i,
  /temporary failure in name resolution/i,
  /\bdial tcp\b/i,
  /\b5\d\d\b\s*(?:internal|bad gateway|service unavailable|gateway timeout)?/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway time-?out/i,
  /\bi\/o timeout\b/i,
  /network is unreachable/i,
  /\bEHOSTUNREACH\b/i,
];

// #519: true iff captured stderr/stdout carries a KNOWN transient-infra signature.
function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #519: a typed transient-fetch fault — thrown when a transient-infra exec fault (e.g. discoverProject
// / listIssueNotes for claim-detection) must route to the indeterminate/escalate emitter instead of
// silently catching to "no claim". Mirrors the root classifier's TransientFetchError.
class TransientFetchError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransientFetchError';
    this.transient = true;
    this.cause = cause;
    if (cause) { this.code = cause.code; this.signal = cause.signal; }
  }
}

// #519: combine the exit-code class with the stderr error-class into a single transient verdict.
// spawn_fault / killed → always transient; clean_nonzero → transient only on a known stderr signature.
function isTransientFetchError(e) {
  const cls = classifyFetchError(e);
  if (cls !== 'clean_nonzero') return true;
  const combined = String((e && e.stderr) || '') + '\n' + String((e && e.stdout) || '');
  return isTransientFetchStderr(combined);
}

// #507: overridable backoff for boundary-2 retry. Tests set KAOLA_CLASSIFIER_BACKOFF_MS=0.
function fetchBackoffMs() {
  const v = parseInt(process.env.KAOLA_CLASSIFIER_BACKOFF_MS || '', 10);
  return (Number.isFinite(v) && v >= 0) ? v : 50;
}

// #507: synchronous sleep for retry backoff (Atomics.wait — safe in sync path).
function syncSleepFetch(ms) {
  if (ms <= 0) return;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {}
}

// #507/#519: shared fetch-with-retry logic used by both classifyIssue (in-process) and cmdClassify.
// The transient/genuine partition is by stderr ERROR-CLASS (isTransientFetchError), not exit code
// alone (#519): a clean_nonzero carrying a transient-infra signature now retries + escalates; a
// genuine-negative / unrecognized clean_nonzero stays determinate-refuse. (The #510 exit-0-degraded
// case — empty/unparseable body swallowed by parseJson to {} — is handled by the _st guard in the
// callers, mapped to indeterminate, so forge.viewIssue stays the single stubbable fetch seam.)
// Returns { issue } on success; { error: 'target_unavailable'|'indeterminate', payload } on failure.
function fetchIssueWithRetry(issueIid, forgeViewFn) {
  const viewFn = forgeViewFn || forge.viewIssue.bind(forge);
  const MAX_FETCH_ATTEMPTS = 3;
  const backoffMs = fetchBackoffMs();
  let lastFetchErr = null;
  let lastFetchTransient = false;
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) syncSleepFetch(backoffMs);
    try {
      const issue = viewFn(issueIid);
      return { issue };
    } catch (e) {
      lastFetchErr = e;
      lastFetchTransient = isTransientFetchError(e);
      if (!lastFetchTransient) break; // genuine-negative / unrecognized — determinate, do not retry
    }
  }
  if (!lastFetchTransient) {
    return { error: 'target_unavailable', payload: { verdict: 'target_unavailable', reasoning: 'glab issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' } };
  }
  const errCode = (lastFetchErr && lastFetchErr.code) || '';
  const signal = (lastFetchErr && lastFetchErr.signal) || '';
  return {
    error: 'indeterminate',
    payload: {
      verdict: 'indeterminate',
      reasoning_class: 'classifier_error',
      reasoning: 'glab issue fetch transient fault after ' + MAX_FETCH_ATTEMPTS + ' attempts' +
        (errCode ? ' (code=' + errCode + ')' : '') +
        (signal ? ' (signal=' + signal + ')' : '')
    }
  };
}

function classifyIssue(issueIid, root) {
  const config = readOrCreateConfig();
  if (config.parallel_mode !== 'auto') {
    return { verdict: 'green', reasoning: 'parallel_mode=' + config.parallel_mode + '; bypassing classifier' };
  }

  const repoRoot = root || active.getRoot();
  const activeFolders = active.readActiveFolders(repoRoot);
  // #328: bundle-member overlap — owned if scalar or bundle member
  if (activeFolders.some(folder => folder.issue_iid === issueIid) ||
      activeFolders.some(folder => Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(issueIid))) {
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

  // #507/#519: bounded retry; transient/genuine by stderr-class. A genuine-negative clean_nonzero
  // (e.g. 404) is determinate-refuse; a transient-infra fault retries → indeterminate.
  const fetchResult = fetchIssueWithRetry(issueIid, forge.viewIssue.bind(forge));
  if (fetchResult.error) return fetchResult.payload;
  const issue = fetchResult.issue;

  // #510: an exit-0 unparseable/empty body is swallowed by parseJson(raw,{}) to {} → state 'unknown'.
  // Under the corrected taxonomy this is a TRANSIENT degradation (escalate), NOT a determinate refuse:
  // a malformed/empty response is an infra-degradation signal, not a genuine "issue gone".
  const _st = (issue.state || '').toLowerCase();
  if (_st !== 'open' && _st !== 'closed') {
    return { verdict: 'indeterminate', reasoning_class: 'classifier_error', reasoning: 'glab issue response unparseable/empty (exit 0); transient' };
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    return { verdict: 'red', reasoning: 'issue #' + issueIid + ' is already closed' };
  }

  // #519: issueHasRemoteClaimNotes can throw a TransientFetchError (site-5 equivalent) — route it to
  // the indeterminate emitter rather than crashing or silently catching to "no remote claim". The
  // label check runs FIRST and short-circuits (preserving the pre-#519 OR order) so the remote-claim
  // probe is skipped — and cannot transient-fault — when the in-progress label already says blocked.
  let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimNotes(issueIid);
    } catch (e) {
      if (e instanceof TransientFetchError || e.transient === true) {
        return {
          verdict: 'indeterminate',
          reasoning_class: 'classifier_error',
          reasoning: 'glab remote-claim probe transient fault' +
            (e.code ? ' (code=' + e.code + ')' : '') + (e.signal ? ' (signal=' + e.signal + ')' : '')
        };
      }
      throw e;
    }
  }
  if (blocked) {
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

  // #328: bundle-member overlap — owned if scalar or bundle member
  if (activeFolders.some(function(folder) { return folder.issue_iid === args.issue; }) ||
      activeFolders.some(function(folder) { return Array.isArray(folder.issue_numbers) && folder.issue_numbers.includes(args.issue); })) {
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

  // #507/#519: bounded retry; transient/genuine by stderr-class. A genuine-negative clean_nonzero
  // (e.g. 404) is determinate-refuse; a transient-infra fault retries → indeterminate.
  const fetchResult2 = fetchIssueWithRetry(args.issue, forge.viewIssue.bind(forge));
  if (fetchResult2.error) {
    process.stdout.write(JSON.stringify(fetchResult2.payload) + '\n');
    return;
  }
  const issue = fetchResult2.issue;

  // #510: an exit-0 unparseable/empty body swallowed to {} → state 'unknown' is a TRANSIENT
  // degradation (escalate), NOT a determinate refuse (mirrors classifyIssue above).
  const _st2 = (issue.state || '').toLowerCase();
  if (_st2 !== 'open' && _st2 !== 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'indeterminate', reasoning_class: 'classifier_error', reasoning: 'glab issue response unparseable/empty (exit 0); transient' }) + '\n');
    return;
  }

  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }

  // #519: issueHasRemoteClaimNotes can throw a TransientFetchError (site-5 equivalent) — route it to
  // the indeterminate emitter rather than crashing or silently catching to "no remote claim". The
  // label check runs FIRST and short-circuits (preserving the pre-#519 OR order) so the remote-claim
  // probe is skipped — and cannot transient-fault — when the in-progress label already says blocked.
  let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimNotes(args.issue);
    } catch (e) {
      if (e instanceof TransientFetchError || e.transient === true) {
        process.stdout.write(JSON.stringify({
          verdict: 'indeterminate',
          reasoning_class: 'classifier_error',
          reasoning: 'glab remote-claim probe transient fault' +
            (e.code ? ' (code=' + e.code + ')' : '') + (e.signal ? ' (signal=' + e.signal + ')' : '')
        }) + '\n');
        return;
      }
      throw e;
    }
  }
  if (blocked) {
    process.stdout.write(JSON.stringify({ verdict: 'blocked', reasoning: 'issue #' + args.issue + ' has a remote workflow claim' }) + '\n');
    return;
  }

  const result = classify(issue, activeFolders);
  process.stdout.write(JSON.stringify(result) + '\n');
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitlab-workflow-classifier.js <classify>');
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
  PROTECTED_BASENAMES,
  PROTECTED_PATH_MARKERS,
  isProtected,
  readPlanNodes,
  disjointWriteSets,
  issueHasRemoteClaimNotes,
  issueHasWorkflowInProgressLabel,
  parseDependsOn,
  readOrCreateConfig
};
