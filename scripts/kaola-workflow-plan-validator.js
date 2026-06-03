#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-plan-validator.js (issue #227 — adaptive path)
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
const classifier = require('./kaola-workflow-classifier');
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
  // `filesystem` spelled out AND the bare `fs/` path-segment shorthand. Anchored on a
  // path-segment boundary ((^|/) ... /) so it matches fs/x.js, src/fs/x.js, ./fs/x.js
  // but NOT refs/, prefs/, dfs/, fsutil/, configs/fs.js, or a root file named fs.js.
  /filesystem/i, /(^|\/)fs\//i, /external-?api/i, /api-?key/i, /oauth/i, /session/i,
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
// Parse the plan into validator-shaped nodes. Parity with the executor's reader is
// load-bearing: section slicing is delegated to classifier.sectionBody (FENCE-AWARE) and
// write-set parsing to classifier.parseWriteSetCell, so the validator, the plan_hash, and
// classifier.readPlanNodes (which the executor uses) all see the SAME nodes — closing the
// divergence where a fenced `## ` line inside `## Nodes` hid appended nodes from the
// validator+hash but not the executor (audit B2/B3) — and the SAME write sets, so root-level
// and dot-leading paths can no longer be silently dropped from the gates (audit A2/A2′).
function parseNodes(content) {
  const body = classifier.sectionBody(content, schema.NODES_HEADING);
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
      writeSetRaw: get('declared_write_set'),
      writeSet: classifier.parseWriteSetCell(get('declared_write_set')),
      cardinality: get('cardinality'),
      shape: parseShape(get('shape')),
    });
  }
  return nodes;
}
// Section slicing is delegated to classifier.sectionBody (fence-aware) so the validator,
// the plan_hash, and the executor's classifier.readPlanNodes share ONE reader and cannot
// diverge on the section boundary (audit B2/B3). The previous local, non-fence-aware
// sliceSection was removed for exactly that reason.

// --- graph helpers ----------------------------------------------------------
function adjacency(nodes) {
  const adj = new Map(nodes.map(n => [n.id, []]));
  for (const n of nodes) for (const d of n.dependsOn) if (adj.has(d)) adj.get(d).push(n.id);
  return adj;
}
// audit B6 (#233): the fan-out ORIGIN of a fanout member is the single in-graph parent it fans
// out from (its sole declared depends_on that exists in the graph). When a member has zero
// in-graph parents (a root fan-out) or two-plus (a diamond — the origin is ambiguous), there is
// no single shared origin, so return '*' and fall back to the label-only (global) bucket —
// matching pre-#233 behavior so a plan that passes today is never newly refused. Scoping fan-out
// groups by (label, origin) stops two topologically-independent branches that reuse the same
// label from being summed against FANOUT_CAP and cross-checked for disjointness as one fan-out.
function fanoutOriginKey(node, ids) {
  const parents = node.dependsOn.filter(d => ids.has(d));
  return parents.length === 1 ? parents[0] : '*';
}
// audit A3 (#232): reverse adjacency (child.id -> [parent ids]) + a forward-reachable-set walk,
// used by the inferred concurrent-sibling disjointness check below. Iterative-stack DFS mirroring
// hasCycle/gateUncovered so a deep chain cannot stack-overflow (MAX_NODES already bounds input).
function reverseAdjacency(nodes) {
  const radj = new Map(nodes.map(n => [n.id, []]));
  // edge "n depends_on d" => d is a PARENT of n. Map n.id -> [its real parents] (skip dangling
  // deps via radj.has(d)) so reachableSet(radj, x) walks ANCESTORS of x (not descendants).
  for (const n of nodes) for (const d of n.dependsOn) if (radj.has(d)) radj.get(n.id).push(d);
  return radj;
}
function reachableSet(adj, start) {
  const seen = new Set();
  const stack = [...(adj.get(start) || [])];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nx of adj.get(cur) || []) if (!seen.has(nx)) stack.push(nx);
  }
  return seen;
}
function uniqueSink(nodes) {
  const ids = new Set(nodes.map(n => n.id));
  const hasOut = new Set();
  for (const n of nodes) for (const d of n.dependsOn) if (ids.has(d)) hasOut.add(d);
  const terminals = nodes.filter(n => !hasOut.has(n.id));
  return terminals.length === 1 ? terminals[0].id : null;
}
// Iterative (explicit-stack) DFS so a deep depends_on chain cannot stack-overflow.
// White(0)/gray(1)/black(2): a forward edge to a GRAY node is a back edge => cycle.
// Each frame carries its own neighbor cursor `i`; a node is blackened only after all
// its neighbors are exhausted, preserving the recursive version's exact verdict. The
// MAX_NODES cap in validatePlan/revalidateForResume already bounds the input; this
// removes the recursion as a second, defense-in-depth backstop.
function hasCycle(nodes) {
  const adj = adjacency(nodes);
  const color = new Map(nodes.map(n => [n.id, 0])); // 0=white, 1=gray, 2=black
  for (const start of nodes) {
    if (color.get(start.id) !== 0) continue;
    color.set(start.id, 1);
    const stack = [{ id: start.id, i: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const nbrs = adj.get(frame.id) || [];
      if (frame.i < nbrs.length) {
        const v = nbrs[frame.i++];
        const c = color.get(v);
        if (c === 1) return true;            // back edge to a gray ancestor => cycle
        if (c === 0) { color.set(v, 1); stack.push({ id: v, i: 0 }); }
      } else {
        color.set(frame.id, 2);              // all neighbors done => blacken, pop
        stack.pop();
      }
    }
  }
  return false;
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
  // audit A1: the finalize SINK may only do docs/state bookkeeping (CHANGELOG.md, ROADMAP.md,
  // workflow-state.md). ANY non-docs write declared on the sink is unreviewed code reaching the
  // terminal node — and no gate can post-dominate the sink itself — so treat it as code-producing
  // and let G1 fire. (Previously finalize was in neither IMPLEMENT_ROLES nor WRITE_ROLES, so code
  // declared on the sink escaped G1 entirely.)
  if (node.role === TERMINAL_ROLE) {
    for (const p of node.writeSet) if (!isDocsPath(p)) return true;
    return false;
  }
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
  const norm = section => classifier.sectionBody(content, section)
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
  // audit B1: read labels ONLY from the hash-covered `## Meta` section. parseLabels used to
  // scan the whole document, so a decoy `labels:` line placed OUTSIDE `## Meta` (which the
  // plan_hash does not cover) could override the real labels and silently drop the G2 gate,
  // undetectable to --resume-check. Reader and hash now agree on where labels live.
  const labels = parseLabels(classifier.sectionBody(content, 'Meta'));
  const roles = opts.installedRoles || installedRoles(opts.root || process.cwd());
  const fanoutCap = Number.isInteger(opts.fanoutCap) ? opts.fanoutCap : schema.resolveFanoutCap(process.env);
  const errors = [];

  if (!nodes.length) {
    return { result: 'refuse', errors: ['plan has no parseable ## Nodes table'], planHash: computePlanHash(content) };
  }
  // Input-size backstop: refuse an oversized plan as OUT OF GRAMMAR before any graph
  // algorithm runs (a multi-thousand-node depends_on chain would otherwise blow the DFS
  // stack — a crash, not a typed refusal). 200 is ~28x the largest realistic plan.
  if (nodes.length > schema.MAX_NODES) {
    return { result: 'refuse', errors: [`plan has ${nodes.length} nodes > MAX_NODES ${schema.MAX_NODES} (out of grammar)`], planHash: computePlanHash(content) };
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
    // audit A2: fail closed if a non-empty declared_write_set parses to no recognizable path.
    // With structural cell parsing this should not happen for real paths; this backstops any
    // future drop so a write can never silently vanish from the gates.
    const rawWS = (n.writeSetRaw || '').trim();
    if (rawWS && rawWS !== '—' && rawWS !== '-' && n.writeSet.size === 0) {
      errors.push(`node ${n.id} declared_write_set "${rawWS}" yields no recognizable path (fail-closed refusal)`);
    }
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
  let concurrentAmbiguousOverlap = false; // #232: inferred concurrent siblings with coarse/shared (non-exact) write overlap => ask
  for (const n of nodes) {
    if (n.shape.kind === 'invalid') errors.push(`node ${n.id} has invalid shape "${n.shape.raw}"`);
    if (n.shape.kind === 'fanout') {
      // audit B6 (#233): key by (label, fan-out origin), not label alone, so the same label in
      // two independent branches forms two separate groups. NUL separator can never collide with
      // a real label (labels come from fanout(...) cell text, which cannot contain NUL).
      const key = n.shape.group + ' ' + fanoutOriginKey(n, ids);
      if (!groups.has(key)) groups.set(key, { label: n.shape.group, origin: fanoutOriginKey(n, ids), members: [] });
      groups.get(key).members.push(n);
    }
    if (n.shape.kind === 'loop') {
      loopPresent = true;
      // B7: a loop cap < 1 is out-of-grammar. parseShape matches loop((\d+)), so loop(0)
      // parses as a structurally-valid loop with cap 0 — a zero-iteration loop whose body
      // (e.g. a code-reviewer or build-error-resolver node) silently never runs.
      if (n.shape.cap < 1) errors.push(`node ${n.id} loop cap ${n.shape.cap} < 1 (a loop must run at least once)`);
      if (n.shape.cap > schema.LOOP_CAP) errors.push(`node ${n.id} loop cap ${n.shape.cap} > LOOP_CAP ${schema.LOOP_CAP}`);
    }
    for (const p of n.writeSet) if (classifier.isSharedInfra(classifier.areaForPath(p))) sharedInfraTouch = true;
  }
  for (const [, grp] of groups) {
    const members = grp.members;
    // display name: bare label for the global-fallback bucket (origin '*'), else label@origin
    const g = grp.origin === '*' ? grp.label : `${grp.label}@${grp.origin}`;
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

  // --- #232 (audit A3): inferred concurrent-sibling write disjointness ------------------------
  // The declared fan-out groups loop above only checks nodes carrying a fanout(...) tag. Two
  // structurally-parallel WRITE nodes (same depends_on, concurrently reachable, e.g. two tdd-guide
  // with shape:sequence) could declare identical/overlapping write sets and pass. Check every PAIR
  // of write-bearing nodes that are CONCURRENT:
  //   concurrent(A,B) := neither reaches the other (antichain) AND they share a common ANCESTOR
  //   (some node that reaches BOTH). Independent branches share only the finalize sink (a common
  //   DESCENDANT, never an ancestor), so they are NOT flagged — that asymmetry is the
  //   false-refusal guard. Concurrency is non-transitive, so it is computed per-PAIR.
  // Verdict policy (deliberately WEAKER than the declared-fanout path, since concurrency is here
  // INFERRED, not author-declared): EXACT same file => RED/refuse (unambiguous clobber);
  // coarse-area / shared-infra overlap => ASK (inference + weak signal compound = ambiguous).
  {
    const fwdAdj = adjacency(nodes);
    const revAdj = reverseAdjacency(nodes);
    const descOf = new Map(nodes.map(n => [n.id, reachableSet(fwdAdj, n.id)]));
    const ancOf = new Map(nodes.map(n => [n.id, reachableSet(revAdj, n.id)]));
    // Co-members of the SAME declared fan-out group (#233 origin-scoped key) are already checked by
    // the groups loop above; skip them here so a pair is not double-reported.
    const groupKeyOf = new Map();
    for (const [key, grp] of groups) for (const m of grp.members) groupKeyOf.set(m.id, key);
    const writeBearing = nodes.filter(n => n.writeSet && n.writeSet.size > 0);
    for (let i = 0; i < writeBearing.length; i++) {
      for (let j = i + 1; j < writeBearing.length; j++) {
        const A = writeBearing[i], B = writeBearing[j];
        if (groupKeyOf.has(A.id) && groupKeyOf.get(A.id) === groupKeyOf.get(B.id)) continue; // same declared group
        if (descOf.get(A.id).has(B.id) || descOf.get(B.id).has(A.id)) continue;              // not an antichain
        let sharedAncestor = false;
        for (const a of ancOf.get(A.id)) if (ancOf.get(B.id).has(a)) { sharedAncestor = true; break; }
        if (!sharedAncestor) continue; // independent branches share only the sink (a descendant) => skip
        let exact = null;
        for (const p of A.writeSet) if (B.writeSet.has(p)) { exact = p; break; }
        if (exact) {
          errors.push(`concurrent siblings ${A.id} and ${B.id} both write "${exact}" (parallel non-fanout write overlap)`);
          continue;
        }
        // coarse-area / shared-infra overlap => ASK (read only the verdict; the 2-element-array
        // index reasoning of disjointWriteSets is never surfaced).
        const dj = classifier.disjointWriteSets([A.writeSet, B.writeSet]);
        if (dj.verdict !== 'green') concurrentAmbiguousOverlap = true;
      }
    }
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
  if (concurrentAmbiguousOverlap) { blastRadius = true; reasons.push('concurrent non-fanout siblings touch overlapping coarse/shared-infra areas — ambiguous concurrency (#232)'); }

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
  // Same input-size backstop as validatePlan: the resume path also calls hasCycle, so an
  // oversized frozen plan must be refused before the DFS rather than overflow the stack.
  if (nodes.length > schema.MAX_NODES) return { ok: false, reason: `plan has ${nodes.length} nodes > MAX_NODES ${schema.MAX_NODES} (out of grammar)` };
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
    'usage: kaola-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze] [--resume-check]\n' +
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
  try { main(); }
  catch (err) {
    // Fail closed: ANY uncaught internal error becomes a TYPED REFUSAL on STDOUT (not a
    // bare stderr dump). main() is the only writer of the result, so on a throw stdout is
    // empty — a --json consumer (executor / --freeze / --resume-check, and the walkthrough's
    // validatePlanFixture which JSON.parses stdout) would otherwise crash on the empty parse.
    // Detect --json from argv here since we are outside main().
    const json = process.argv.includes('--json');
    const out = { result: 'refuse', errors: ['validator internal error: ' + err.message] };
    process.stdout.write((json ? JSON.stringify(out) : 'typed refusal (out of grammar): ' + out.errors[0]) + '\n');
    process.exitCode = 1;
  }
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
