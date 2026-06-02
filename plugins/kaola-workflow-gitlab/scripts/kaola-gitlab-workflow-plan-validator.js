#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-gitlab-workflow-plan-validator.js (issue #227 — adaptive path)
//
// Validates a frozen `workflow-plan.md` against the closed grammar and computes
// the auto-run / ask / typed-refusal governance decision. The agent freely
// authors any in-grammar DAG; this script proves the result is in-grammar and
// classifies its risk. It is TOGGLE-AGNOSTIC: well-formedness is independent of
// whether new adaptive runs are currently offerable (the install switch gates
// SELECTION only — never resume or well-formedness). This validator NEVER reads
// the adaptive install switch or its env mirror.
//
// Checks (post-dominance + structural properties over ANY topology):
//   - runtime-closed role library (installed set) — unknown role => refuse
//   - exactly three shapes: SEQUENCE / FAN-OUT (N <= FANOUT_CAP, pairwise-disjoint
//     write-role sets) / BOUNDED LOOP (static cap) — heterogeneous fan-out => refuse
//   - a single unique `finalize` sink; acyclic DAG (loops are annotated single nodes)
//   - G1 code-reviewer post-dominates every implement node (trivial-docs exemption)
//   - G2 security-reviewer post-dominates every sensitive node (when sensitive)
//   - caps: FANOUT_CAP, FILE_CEILING per node, LOOP_CAP
//   - read-only roles declare no write set
//
// Post-dominance is computed as reachability-after-removal (equivalent over a
// unique sink): gate role G post-dominates target N iff, after removing every
// node whose role == G, N can no longer reach the sink.
//
// Governance (in-grammar plans only): risky => ASK, else AUTO-RUN. Risk is
// over-approximated and fail-closed (uncertain => risky => ask).
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const classifier = require('./kaola-gitlab-workflow-classifier');
const schema = require('./kaola-workflow-adaptive-schema');

const TERMINAL_ROLE = 'finalize';

// The canonical roles that are ALWAYS installed (vendored). The validator unions
// this baseline with any maintainer-added roles discovered under <root>/agents,
// so the library is runtime-closed over the INSTALLED set (not the literal nine).
const CANONICAL_ROLES = [
  'code-explorer', 'docs-lookup', 'planner', 'code-architect', 'tdd-guide',
  'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier',
];
// Roles that may legitimately declare a repo write set (by TOOL MANIFEST; note
// security-reviewer is Write by manifest, review-only only by governance posture).
const WRITE_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'doc-updater', 'security-reviewer']);
const IMPLEMENT_ROLES = new Set(['tdd-guide', 'build-error-resolver']);

// Phase-5 sensitivity categories (phase5.md:45-46): auth, payments, user data,
// filesystem access, external API calls, secrets. Over-approximated from the
// declared write set + frozen labels (fail-closed); the strongest signal (a
// `.cache` re-scan of files actually written) is enforced at the barrier.
const SENSITIVE_PATTERNS = [
  /auth/i, /login/i, /password/i, /secret/i, /token/i, /credential/i,
  /payment/i, /billing/i, /checkout/i, /user-?data/i, /\bpii\b/i,
  /filesystem/i, /external-?api/i, /api-?key/i, /oauth/i, /session/i,
];
const SENSITIVE_LABELS = new Set(['security', 'auth', 'payments', 'secrets', 'user-data']);

// --- discovery of the installed role library -------------------------------
function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12 && dir; i++) {
    if (fs.existsSync(path.join(dir, 'agents')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
function installedRoles(root) {
  const roles = new Set(CANONICAL_ROLES);
  try {
    for (const f of fs.readdirSync(path.join(root, 'agents'))) {
      if (f.endsWith('.md')) roles.add(f.slice(0, -3));
    }
  } catch (_) { /* no agents dir (e.g. test fixture) => baseline only */ }
  return roles;
}

// --- parsing ----------------------------------------------------------------
function parseShape(cell) {
  const s = String(cell || 'sequence').trim();
  let m;
  if (s === '' || s === 'sequence') return { kind: 'sequence' };
  if ((m = s.match(/^fanout\(([^)]+)\)$/))) return { kind: 'fanout', group: m[1].trim() };
  if ((m = s.match(/^loop\((\d+)\)$/))) return { kind: 'loop', cap: parseInt(m[1], 10) };
  return { kind: 'invalid', raw: s };
}
// frozen issue labels live in `## Meta` as `labels: a, b` (a non-author field).
// Returns null when absent (=> sensitivity uncertain => fail-closed risky).
function parseLabels(content) {
  const m = String(content || '').match(/^labels:[ \t]*(.*)$/m);
  if (!m) return null;
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}
// Parse the plan into validator-shaped nodes (reusing classifier's table reader
// via a temp-free in-memory path is not possible — classifier.readPlanNodes reads
// a file — so we re-read here from the same `## Nodes` section but keep parity by
// delegating write-set extraction to classifier.extractFilePaths).
function parseNodes(content) {
  const body = sliceSection(content, schema.NODES_HEADING);
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
      writeSet: classifier.extractFilePaths(get('declared_write_set')),
      cardinality: get('cardinality'),
      shape: parseShape(get('shape')),
    });
  }
  return nodes;
}
// h2 section slicer (mirrors classifier.sectionBody semantics, kept local so the
// validator needs no extra classifier export).
function sliceSection(content, heading) {
  const lines = String(content || '').split('\n');
  const re = new RegExp('^##\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  let start = -1;
  for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { start = i + 1; break; } }
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) { if (/^##\s+/.test(lines[i])) break; out.push(lines[i]); }
  return out.join('\n');
}

// --- graph helpers ----------------------------------------------------------
function adjacency(nodes) {
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) if (adj.has(d)) adj.get(d).push(n.id);
  return adj;
}
function uniqueSink(nodes) {
  const ids = new Set(nodes.map(n => n.id));
  const hasOut = new Set();
  for (const n of nodes) for (const d of n.dependsOn) if (ids.has(d)) hasOut.add(d);
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  return terminals.length === 1 ? terminals[0].id : null;
}
function hasCycle(nodes) {
  const adj = adjacency(nodes);
  const color = new Map(nodes.map(n => [n.id, 0]));
  let cyc = false;
  const dfs = u => {
    color.set(u, 1);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === 1) { cyc = true; return; }
      if (color.get(v) === 0) dfs(v);
    }
    color.set(u, 2);
  };
  for (const n of nodes) if (color.get(n.id) === 0) dfs(n.id);
  return cyc;
}
// gate coverage via reachability-after-removal (== post-dominance over unique sink)
function gateUncovered(nodes, isTarget, gateRole, sink) {
  const adj = adjacency(nodes);
  const removed = new Set(nodes.filter(n => n.role === gateRole).map(n => n.id));
  const violations = [];
  for (const n of nodes) {
    if (!isTarget(n) || removed.has(n.id)) continue;
    const seen = new Set([n.id]);
    const stack = [n.id];
    let reaches = false;
    while (stack.length) {
      const cur = stack.pop();
      if (cur === sink) { reaches = true; break; }
      for (const nx of adj.get(cur) || []) if (!removed.has(nx) && !seen.has(nx)) { seen.add(nx); stack.push(nx); }
    }
    if (reaches) violations.push(n.id);
  }
  return violations;
}

// --- sensitivity ------------------------------------------------------------
function nodeIsSensitive(node) {
  for (const p of node.writeSet) if (SENSITIVE_PATTERNS.some(re => re.test(p))) return true;
  return false;
}
function labelsAreSensitive(labels) {
  return Array.isArray(labels) && labels.some(l => SENSITIVE_LABELS.has(String(l).toLowerCase()));
}
// A docs-only path (markdown / docs/ tree) is the trivial band that may skip review.
function isDocsPath(p) { return /\.md$/i.test(p) || /(^|\/)docs\//.test(p); }
// A node "produces code" — and therefore needs the review gate — if it is an implement
// role, OR a non-implement WRITE role (e.g. doc-updater) whose declared write set touches
// a non-docs file. This closes the evasion where code is routed through doc-updater to
// skip G1: G1 is not implement-role-only, it is "produces non-trivial code changes".
function producesCode(node) {
  if (IMPLEMENT_ROLES.has(node.role)) return true;
  if (!WRITE_ROLES.has(node.role)) return false;
  for (const p of node.writeSet) if (!isDocsPath(p)) return true;
  return false;
}

// --- plan hash --------------------------------------------------------------
// Hash the AUTHOR-IMMUTABLE content — both `## Meta` (frozen labels, which feed the
// G2/risk sensitivity decision) and `## Nodes` (the DAG) — normalized so whitespace
// churn does not change it. The mutable `## Node Ledger` (statuses update during the
// run) and the plan_hash comment itself are excluded. Stored inside the plan as an HTML
// comment. Covering `## Meta` closes the integrity hole where tampering the labels after
// freeze (e.g. security -> chore) would otherwise be invisible to --resume-check and
// silently drop the G2 security requirement on resume.
function computePlanHash(content) {
  const norm = section => sliceSection(content, section)
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  const body = norm('Meta') + '\n---NODES---\n' + norm(schema.NODES_HEADING);
  return crypto.createHash('sha256').update(body).digest('hex');
}
function readStoredHash(content) {
  const m = String(content || '').match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/);
  return m ? m[1] : null;
}

// --- the validator ----------------------------------------------------------
// opts: { root, fanoutCap }
function validatePlan(content, opts) {
  opts = opts || {};
  const nodes = parseNodes(content);
  const labels = parseLabels(content);
  const roles = opts.installedRoles || installedRoles(opts.root || process.cwd());
  const fanoutCap = Number.isInteger(opts.fanoutCap) ? opts.fanoutCap : schema.resolveFanoutCap(process.env);
  const errors = [];

  if (!nodes.length) {
    return { result: 'refuse', errors: ['plan has no parseable ## Nodes table'], planHash: computePlanHash(content) };
  }
  const ids = new Set(nodes.map(n => n.id));

  // closed library (runtime-closed over the installed set)
  for (const n of nodes) {
    if (n.role === TERMINAL_ROLE) continue;
    if (!roles.has(n.role)) errors.push(`unknown role "${n.role}" not in installed library (node ${n.id})`);
  }
  // dangling deps
  for (const n of nodes) for (const d of n.dependsOn) if (!ids.has(d)) errors.push(`node ${n.id} depends_on unknown node "${d}"`);
  // acyclic
  if (hasCycle(nodes)) errors.push('cycle detected (bounded loops are annotated single nodes, not DAG cycles)');
  // unique sink
  const sink = uniqueSink(nodes);
  if (!sink) errors.push('no unique finalize sink (need exactly one terminal node)');
  // read-only roles must not declare a write set; file ceiling per node
  for (const n of nodes) {
    if (n.role !== TERMINAL_ROLE && !WRITE_ROLES.has(n.role) && n.writeSet.size) {
      errors.push(`read-only role ${n.role} (node ${n.id}) declares a write set`);
    }
    if (n.writeSet.size > schema.FILE_CEILING) {
      errors.push(`node ${n.id} declares ${n.writeSet.size} files > FILE_CEILING ${schema.FILE_CEILING}`);
    }
  }

  // shapes: fan-out groups + loops
  const groups = new Map();
  let loopPresent = false;
  let writeRoleFanout = false;
  let sharedInfraTouch = false;
  for (const n of nodes) {
    if (n.shape.kind === 'invalid') errors.push(`node ${n.id} has invalid shape "${n.shape.raw}"`);
    if (n.shape.kind === 'fanout') {
      if (!groups.has(n.shape.group)) groups.set(n.shape.group, []);
      groups.get(n.shape.group).push(n);
    }
    if (n.shape.kind === 'loop') {
      loopPresent = true;
      if (n.shape.cap > schema.LOOP_CAP) errors.push(`node ${n.id} loop cap ${n.shape.cap} > LOOP_CAP ${schema.LOOP_CAP}`);
    }
    for (const p of n.writeSet) if (classifier.isSharedInfra(classifier.areaForPath(p))) sharedInfraTouch = true;
  }
  for (const [g, members] of groups) {
    const memberRoles = new Set(members.map(m => m.role));
    if (memberRoles.size > 1) errors.push(`fan-out group "${g}" is heterogeneous (roles: ${[...memberRoles].join(', ')})`);
    if (members.length > fanoutCap) errors.push(`fan-out group "${g}" width ${members.length} > FANOUT_CAP ${fanoutCap}`);
    const role = members[0].role;
    const readOnly = !WRITE_ROLES.has(role);
    if (!readOnly) {
      if (members.length >= 2) writeRoleFanout = true;
      const dj = classifier.disjointWriteSets(members.map(m => m.writeSet));
      if (dj.verdict === 'red') errors.push(`fan-out group "${g}" write sets not pairwise disjoint (${dj.reasoning})`);
      if (dj.verdict === 'yellow') errors.push(`fan-out group "${g}" touches shared infra (${dj.reasoning}) — must serialize, not fan out`);
    }
    // read-only fan-out: width bounded by FANOUT_CAP alone (no clamp to #disjoint groups)
  }

  // gates (need a unique sink to be decidable)
  if (sink) {
    // G1: code-reviewer post-dominates every code-producing node (implement roles, plus a
    // doc-updater/other write role that writes non-docs — so code can't dodge review by
    // routing through doc-updater).
    const g1 = gateUncovered(nodes, producesCode, 'code-reviewer', sink);
    if (g1.length) errors.push(`G1: code-reviewer does not post-dominate code-producing node(s): ${g1.join(', ')}`);

    // G2: security-reviewer post-dominates every sensitive node. The target set is the
    // UNION (never a replacement): any node whose declared write set touches a Phase-5
    // category, AND — when the frozen labels are sensitive — every code-producing node.
    // (Replacing with implement-only previously let a sensitive label DROP a sensitive
    // non-implement node from G2 — a soundness hole.)
    const sensitiveByLabel = labelsAreSensitive(labels);
    const sensitiveNodes = nodes.filter(nodeIsSensitive);
    if (sensitiveByLabel || sensitiveNodes.length) {
      const isTarget = n => (sensitiveByLabel && producesCode(n)) || sensitiveNodes.includes(n);
      const g2 = gateUncovered(nodes, isTarget, 'security-reviewer', sink);
      if (g2.length) errors.push(`G2: security-reviewer does not post-dominate sensitive node(s): ${g2.join(', ')}`);
    }
  }

  const planHash = computePlanHash(content);
  if (errors.length) return { result: 'refuse', errors, planHash, sink };

  // --- risk assessment (in-grammar): auto-run vs ask, over-approximated, fail-closed ---
  const reasons = [];
  let sensitivity = false, blastRadius = false, uncertain = false;
  if (labelsAreSensitive(labels)) { sensitivity = true; reasons.push('frozen labels touch a Phase-5 category'); }
  for (const n of nodes) if (nodeIsSensitive(n)) { sensitivity = true; reasons.push(`declared write set touches a Phase-5 category (node ${n.id})`); }
  if (labels === null) { uncertain = true; reasons.push('frozen labels unavailable — fail closed'); }
  if (writeRoleFanout) { blastRadius = true; reasons.push('write-role fan-out (N>=2)'); }
  if (sharedInfraTouch) { blastRadius = true; reasons.push('declared write set touches SHARED_INFRA'); }
  if (loopPresent) { blastRadius = true; reasons.push('bounded loop present'); }

  const decision = (sensitivity || blastRadius || uncertain) ? 'ask' : 'auto-run';
  return {
    result: 'in-grammar', decision, planHash, sink,
    risk: { sensitivity, blastRadius, uncertain, reasons },
    nodeCount: nodes.length,
  };
}

// Resume re-validation: ONLY closed-library membership + structural grammar + hash
// integrity — NOT the full gate rubric (re-running it would brick an in-flight plan
// if the rubric tightened after freeze). Structure + library are stable.
function revalidateForResume(content, opts) {
  opts = opts || {};
  const stored = readStoredHash(content);
  const computed = computePlanHash(content);
  if (!stored) return { ok: false, reason: 'plan_hash missing — plan is not frozen' };
  if (stored !== computed) return { ok: false, reason: 'plan_hash mismatch — workflow-plan.md tampered after freeze' };
  const nodes = parseNodes(content);
  if (!nodes.length) return { ok: false, reason: 'workflow-plan.md ## Nodes unparseable' };
  const roles = opts.installedRoles || installedRoles(opts.root || process.cwd());
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    if (n.role !== TERMINAL_ROLE && !roles.has(n.role)) return { ok: false, reason: `unknown role "${n.role}" (node ${n.id})` };
    for (const d of n.dependsOn) if (!ids.has(d)) return { ok: false, reason: `node ${n.id} depends_on unknown "${d}"` };
  }
  if (hasCycle(nodes)) return { ok: false, reason: 'cycle detected' };
  if (!uniqueSink(nodes)) return { ok: false, reason: 'no unique sink' };
  return { ok: true, planHash: computed };
}

// Freeze: validate, and if in-grammar, inject/update the plan_hash comment.
function freezePlan(content) {
  const v = validatePlan(content, {});
  if (v.result !== 'in-grammar') return { ...v, frozen: false };
  const stamped = injectHash(content, v.planHash);
  return { ...v, frozen: true, content: stamped };
}
function injectHash(content, hash) {
  const marker = `<!-- plan_hash: ${hash} -->`;
  if (/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(content)) {
    return content.replace(/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/, marker);
  }
  // place after the first H1, else prepend
  const lines = content.split('\n');
  const h1 = lines.findIndex(l => /^#\s+/.test(l));
  if (h1 >= 0) { lines.splice(h1 + 1, 0, '', marker); return lines.join('\n'); }
  return marker + '\n' + content;
}

// --- CLI --------------------------------------------------------------------
function printHelp() {
  process.stdout.write(
    'usage: kaola-gitlab-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze] [--resume-check]\n' +
    '  default       validate + print the governance verdict; exit 1 on typed refusal\n' +
    '  --freeze      validate, then write the computed plan_hash into the plan file\n' +
    '  --resume-check  re-validate library + structure + hash only (not the gate rubric)\n'
  );
}
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') { printHelp(); return; }
  const planPath = args[0];
  const json = args.includes('--json');
  const root = findRepoRoot(path.dirname(path.resolve(planPath)));
  let content;
  try { content = fs.readFileSync(planPath, 'utf8'); }
  catch (_) {
    const out = { result: 'refuse', errors: [`cannot read plan: ${planPath}`] };
    process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
    process.exitCode = 1;
    return;
  }

  if (args.includes('--resume-check')) {
    const r = revalidateForResume(content, { root });
    process.stdout.write((json ? JSON.stringify(r) : (r.ok ? 'resume ok' : 'typed refusal: ' + r.reason)) + '\n');
    if (!r.ok) process.exitCode = 1;
    return;
  }
  if (args.includes('--freeze')) {
    const r = freezePlan(content);
    if (r.frozen) fs.writeFileSync(planPath, r.content);
    process.stdout.write((json ? JSON.stringify({ result: r.result, decision: r.decision, planHash: r.planHash, frozen: r.frozen, risk: r.risk, errors: r.errors }) : (r.frozen ? `frozen (${r.decision}) plan_hash=${r.planHash}` : 'typed refusal: ' + (r.errors || []).join('; '))) + '\n');
    if (!r.frozen) process.exitCode = 1;
    return;
  }

  const v = validatePlan(content, { root });
  if (json) process.stdout.write(JSON.stringify(v) + '\n');
  else if (v.result === 'refuse') process.stdout.write('typed refusal (out of grammar): ' + v.errors.join('; ') + '\n');
  else process.stdout.write(`in-grammar: ${v.decision}` + (v.risk.reasons.length ? ' — ' + v.risk.reasons.join('; ') : '') + '\n');
  if (v.result === 'refuse') process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  validatePlan,
  revalidateForResume,
  freezePlan,
  computePlanHash,
  readStoredHash,
  parseNodes,
  parseLabels,
  uniqueSink,
  gateUncovered,
  installedRoles,
};
