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
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process'); // #231: ONLY the --barrier-check / --gate-verify CLI handlers shell out to git; the core functions stay IO-free.
const classifier = require('./kaola-gitea-workflow-classifier');
const schema = require('./kaola-workflow-adaptive-schema');

const TERMINAL_ROLE = 'finalize';

// The canonical roles that are ALWAYS installed (vendored). The validator unions
// this baseline with any maintainer-added roles discovered under <root>/agents,
// so the library is runtime-closed over the INSTALLED set (not the literal nine).
const CANONICAL_ROLES = [
  'code-explorer', 'docs-lookup', 'planner', 'code-architect', 'tdd-guide',
  'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier', 'implementer',
];
// Roles that may legitimately declare a repo write set (by TOOL MANIFEST; note
// security-reviewer is Write by manifest, review-only only by governance posture).
const WRITE_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'doc-updater', 'security-reviewer', 'implementer']);
const IMPLEMENT_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'implementer']);
// #251: roles that must emit a machine verdict block into their .cache evidence file.
const GATE_VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier']);

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
  if ((m = s.match(/^select\(([^)]+)\)$/))) return { kind: 'select', group: m[1].trim() }; // #263
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
      // #263: classifier node id this node is an arm of ('—'/'' => not an arm). Hash-covered
      // (lives in ## Nodes). Absent column => '' => treated as non-arm (back-compat).
      selectorSource: (() => { const v = get('selector_source'); return (v && v !== '—' && v !== '-') ? v : ''; })(),
    });
  }
  return nodes;
}
// Section slicing is delegated to classifier.sectionBody (fence-aware) so the validator,
// the plan_hash, and the executor's classifier.readPlanNodes share ONE reader and cannot
// diverge on the section boundary (audit B2/B3). The previous local, non-fence-aware
// sliceSection was removed for exactly that reason.

// #231: parse the mutable `## Node Ledger` (| id | status | ...) into id -> status. The ledger is
// OUTSIDE the plan_hash region (the hash covers ## Meta + ## Nodes only), so reading it does not
// couple to integrity — it reflects runtime progress. Fence-aware via classifier.sectionBody, the
// same reader the validator/hash/executor share. Returns an empty Map when absent/unparseable.
function parseLedger(content) {
  const body = classifier.sectionBody(content, schema.LEDGER_HEADING);
  const rows = body.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (rows.length < 2) return new Map();
  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  const ledger = new Map();
  if (idIdx < 0 || stIdx < 0) return ledger;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].split('|').slice(1, -1).map(c => c.trim());
    if (/^[-:\s]+$/.test(cells.join(''))) continue;
    const id = cells[idIdx];
    if (id) ledger.set(id, (cells[stIdx] || '').toLowerCase());
  }
  return ledger;
}

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

// --- #231 runtime gate enforcement ------------------------------------------
// verify gate EXECUTION over the runtime `## Node Ledger` — a static-presence gate (post-dominance
// proven at freeze) does not prove the reviewer actually RAN. A target node that reached `complete`
// must be post-dominated by a gate node that ALSO reached `complete`; a gate left pending or marked
// `n/a` while a node it covers is complete is an unsatisfied gate (audit G1: "a post-dominating
// reviewer can be marked n/a at runtime"; audit H5: the only script-backed cross-check was dead on
// the adaptive path). PURE: reads parsed nodes + ledger only — never git/IO, never the install
// switch (toggle-agnostic). Surfaced NON-blocking on resume (routeAdaptive) and a HARD merge gate
// in phase6 (where every row is already complete/n-a, so any unsatisfied row is a real leak).
function verifyGateExecution(content, opts) {
  opts = opts || {};
  const unsatisfied = [];
  const nodes = parseNodes(content);
  if (!nodes.length) return { ok: false, unsatisfied: [{ requirement: '## Nodes', reason: 'unparseable' }] };
  const sink = uniqueSink(nodes);
  if (!sink) return { ok: false, unsatisfied: [{ requirement: 'unique sink', reason: 'no unique finalize sink' }] };
  const ledger = parseLedger(content);
  const labels = parseLabels(classifier.sectionBody(content, 'Meta'));
  const done = id => ledger.get(id) === 'complete';
  function checkGate(isTarget, gateRole, gid) {
    // RELABEL (not remove) non-complete gate nodes so the topology stays intact: gateUncovered
    // removes only nodes whose role === gateRole, i.e. only the COMPLETE gates. A pending/n-a gate
    // stays a pass-through, so a complete target that can still reach the sink through it (without
    // crossing a COMPLETE gate) is an uncovered leak. (Filtering the node out instead would
    // disconnect the target from the sink and silently MASK the leak — the n/a-gate evasion.)
    const relabeled = nodes.map(n => (n.role === gateRole && !done(n.id))
      ? Object.assign({}, n, { role: gateRole + 'pending' })
      : n);
    const leak = gateUncovered(relabeled, n => isTarget(n) && done(n.id), gateRole, sink);
    for (const id of leak) unsatisfied.push({ requirement: gid + ' gate execution', reason: `node ${id} reached complete but no completed ${gateRole} post-dominates it` });
  }
  checkGate(producesCode, 'code-reviewer', 'G1');
  const sensitiveByLabel = labelsAreSensitive(labels);
  const sensitiveNodes = nodes.filter(nodeIsSensitive);
  if (sensitiveByLabel || sensitiveNodes.length) {
    checkGate(n => (sensitiveByLabel && producesCode(n)) || sensitiveNodes.includes(n), 'security-reviewer', 'G2');
  }
  return { ok: unsatisfied.length === 0, unsatisfied };
}

// #251: Pure (no fs). Verify that every completed gate-role node's .cache evidence file carries a
// machine verdict of 'pass' with findings_blocking === 0. Injectable readCache/globCache for tests.
// Per-node (opts.nodeId): role-self-skip for non-gate roles; fanout adversarial-verifier uses glob
// + majority-refute; sequence gate roles read <nodeId>.md directly.
// Whole-plan (no opts.nodeId): parseLedger; only complete gate-role nodes are checked.
function verifyVerdictBlock(content, opts) {
  opts = opts || {};
  const readCache = opts.readCache || (() => null);
  const globCache = opts.globCache || (() => []);
  const nodes = parseNodes(content);
  if (!nodes.length) return { ok: false, failures: [{ nodeId: null, role: null, reason: 'unparseable ## Nodes' }], checked: [] };
  function checkOne(node) {
    const role = node.role;
    if (!GATE_VERDICT_ROLES.has(role)) {
      return { ok: true, nodeId: node.id, role, verdict: null, findings_blocking: null, found: false };
    }
    if (role === 'adversarial-verifier' && node.shape && node.shape.kind === 'fanout') {
      const files = globCache('adversarial-verifier-');
      const verdicts = [];
      for (const f of files) {
        const v = schema.parseNodeVerdict(readCache(f) || '');
        if (!v.found || v.verdict === null) { verdicts.push('fail'); continue; }
        verdicts.push((v.verdict === 'fail' || (v.findings_blocking || 0) > 0) ? 'fail' : 'pass');
      }
      if (!verdicts.length) {
        return { ok: false, nodeId: node.id, role, verdict: 'fail', findings_blocking: null, found: false,
          reason: 'fanout adversarial-verifier: no per-instance .cache/adversarial-verifier-*.md found' };
      }
      const refutes = verdicts.filter(x => x === 'fail').length;
      const majorityRefute = refutes * 2 > verdicts.length;
      return majorityRefute
        ? { ok: false, nodeId: node.id, role, verdict: 'fail', findings_blocking: null, found: true,
            reason: `fanout majority-refute: ${refutes}/${verdicts.length} skeptics refuted` }
        : { ok: true, nodeId: node.id, role, verdict: 'pass', findings_blocking: null, found: true };
    }
    const raw = readCache(node.id + '.md');
    if (raw == null) {
      return { ok: false, nodeId: node.id, role, verdict: null, findings_blocking: null, found: false,
        reason: `gate role ${role} node ${node.id} has no .cache/${node.id}.md verdict evidence` };
    }
    const v = schema.parseNodeVerdict(raw);
    if (!v.found || v.verdict === null) {
      return { ok: false, nodeId: node.id, role, verdict: v.verdict, findings_blocking: v.findings_blocking, found: v.found,
        reason: `gate role ${role} node ${node.id} verdict missing or unparseable` };
    }
    const blocking = v.findings_blocking || 0;
    const ok = v.verdict === 'pass' && blocking === 0;
    return { ok, nodeId: node.id, role, verdict: v.verdict, findings_blocking: v.findings_blocking, found: true,
      reason: ok ? undefined : `gate role ${role} node ${node.id} verdict=${v.verdict} findings_blocking=${blocking}` };
  }
  if (opts.nodeId) {
    const node = nodes.find(n => n.id === opts.nodeId);
    if (!node) return { ok: false, nodeId: opts.nodeId, role: null, verdict: null, findings_blocking: null, found: false,
      reason: `--node-id "${opts.nodeId}" not found in the frozen plan` };
    return checkOne(node);
  }
  const ledger = parseLedger(content);
  const failures = [];
  const checked = [];
  for (const node of nodes) {
    if (!GATE_VERDICT_ROLES.has(node.role)) continue;
    if (ledger.get(node.id) !== 'complete') continue;
    checked.push(node.id);
    const r = checkOne(node);
    if (!r.ok) failures.push({ nodeId: node.id, role: node.role, reason: r.reason || 'verdict not pass' });
  }
  return { ok: failures.length === 0, failures, checked };
}

// The runtime BARRIER (audit H1/H3). Given the files a node (or the whole plan) ACTUALLY wrote
// (the CLI supplies them from `git diff`; this function is PURE), refuse on:
//   (a) a SENSITIVITY hit — an actual write matches a Phase-5 SENSITIVE_PATTERN — when the frozen
//       plan has NO security-reviewer node at all (H1: a `labels: refactor` plan that auto-ran with
//       no security gate must not silently merge a write into src/auth/session.js); and
//   (b) an out-of-ALLOWLIST production write — an actual non-docs, non-test, non-workflow-artifact
//       write not in the union of the frozen declared write sets (H3 overflow).
// declared is the UNION over ALL nodes (prefer-fewer-false-refusals; the sensitivity scan is the
// teeth). Toggle-agnostic; never reads the install switch.
function barrierCheck(content, actualPaths, opts) {
  opts = opts || {};
  const errors = [];
  const nodes = parseNodes(content);
  if (!nodes.length) return { result: 'refuse', errors: ['plan has no parseable ## Nodes table'] };
  const ownNode = opts.nodeId ? nodes.find(n => n.id === opts.nodeId) : null;
  if (opts.nodeId && !ownNode) {
    return { result: 'refuse', errors: [`--node-id "${opts.nodeId}" not found in the frozen plan`] };
  }
  // #239: per-instance allowlist. In PER-NODE mode the allowlist is the node's OWN declared write set
  // (so a fan-out instance writing into a SIBLING's declared lane refuses — the per-instance overflow
  // the union check could not see); in WHOLE-PLAN mode it is the union over all nodes (the floor).
  const declared = new Set();
  if (ownNode) { for (const p of ownNode.writeSet) declared.add(p); }
  else { for (const n of nodes) for (const p of n.writeSet) declared.add(p); }
  const real = (actualPaths || []).map(p => String(p || '').trim()).filter(Boolean);
  const isWorkflowArtifact = p => /^kaola-workflow\//.test(p);
  const isTestPath = p => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /\.(test|spec)\.[A-Za-z0-9]+$/i.test(p);
  // A "production" actual write is one that is NOT docs / tests / a workflow artifact — those bands
  // never need the code/security gate. They are exempt from BOTH the sensitivity teeth and the
  // allowlist (v3.20.1: the sensitivity scan previously lacked this exemption, so a docs/test path
  // whose NAME matched a Phase-5 pattern — e.g. `test/login.test.js`, `docs/auth.md` — was wrongly
  // refused at the merge gate, with no in-grammar escape).
  const isExempt = p => isWorkflowArtifact(p) || isDocsPath(p) || isTestPath(p);
  const production = real.filter(p => !isExempt(p));
  // (a) sensitivity teeth (H1): a sensitive PRODUCTION write on a plan with no security-reviewer node.
  const hasSecReviewer = nodes.some(n => n.role === 'security-reviewer');
  const sensitiveHits = production.filter(p => SENSITIVE_PATTERNS.some(re => re.test(p)));
  if (sensitiveHits.length && !hasSecReviewer) {
    errors.push(`actual writes touch a Phase-5 sensitive area (${sensitiveHits.join(', ')}) but the plan has no security-reviewer node — revoke and escalate (G2)`);
  }
  // (b) allowlist (H3): a production write not in the union of declared write sets.
  const outOfAllow = production.filter(p => !declared.has(p));
  if (outOfAllow.length) {
    errors.push(`actual writes outside the declared allowlist (${outOfAllow.join(', ')}) — overflow beyond the frozen write set`);
  }
  // (c) v3.20.1 — ledger consistency, closing the n/a/pending-TARGET gate bypass (the symmetric hole
  // the #231 n/a-GATE relabel missed). WHOLE-PLAN / merge mode ONLY (no nodeId): at the per-node
  // barrier the triggering node is still `in_progress` (step 4 runs before step 5 marks it complete),
  // so this would false-refuse its own writes. At phase6 every ledger row is complete/n-a, so a
  // production write whose declaring node(s) are ALL non-complete means the file WAS written but the
  // producer claims it did not run — unattributed + unreviewed (and the ledger, outside `plan_hash`,
  // can be flipped to n/a post-freeze undetected by --resume-check). Forcing the producer to
  // `complete` puts it back into verifyGateExecution's G1/G2 target set, so --gate-verify (run
  // alongside --barrier-check at phase6) then enforces review — the two checks compose. A genuinely
  // skipped n/a node that wrote NOTHING is never flagged: its declared file is absent from the diff.
  if (!opts.nodeId) {
    const ledger = parseLedger(content);
    const anyCompleteOwner = new Map();
    for (const n of nodes) for (const p of n.writeSet) {
      if (!anyCompleteOwner.has(p)) anyCompleteOwner.set(p, false);
      if (ledger.get(n.id) === 'complete') anyCompleteOwner.set(p, true);
    }
    const unattributed = production.filter(p => declared.has(p) && anyCompleteOwner.get(p) === false);
    if (unattributed.length) {
      errors.push(`actual writes (${unattributed.join(', ')}) are declared only by non-complete (n/a/pending) node(s) — the producing node claims it did not run, so the write is unreviewed`);
    }
  }
  return { result: errors.length ? 'refuse' : 'pass', errors, sensitiveHits, outOfAllow };
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
  const selectGroups = new Map();   // #263: select(<group>) label -> { label, members: [] }
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
      const key = n.shape.group + '' + fanoutOriginKey(n, ids);
      if (!groups.has(key)) groups.set(key, { label: n.shape.group, origin: fanoutOriginKey(n, ids), members: [] });
      groups.get(key).members.push(n);
    }
    if (n.shape.kind === 'select') {
      // #263: collect select group members for G-SEL validation below.
      if (!selectGroups.has(n.shape.group)) selectGroups.set(n.shape.group, { label: n.shape.group, members: [] });
      selectGroups.get(n.shape.group).members.push(n);
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

  // --- #271 G-SEL-1 pre-pass: globally-unique group names ---------------------------------
  // selectGroups is keyed by bare group name, so two independent select(<group>) groups that
  // share a name merge into one map entry. Detect this by collecting the distinct
  // selector_source values per group name: if a name is associated with more than one
  // selector_source node, the plan has duplicate group names in independent branches and must
  // refuse with a clear, actionable message before the per-group checks run.
  for (const [, grp] of selectGroups) {
    const srcsForName = new Set(grp.members.map(m => m.selectorSource).filter(Boolean));
    if (srcsForName.size > 1) {
      errors.push(`G-SEL-1: select group name "${grp.label}" used by arms with different selector_source nodes; use distinct group names for independent groups`);
    }
  }

  // --- #263 G-SEL: selective-execution (Classify-And-Act) groups -----------------------------
  // All four rules fail-closed (push to errors => refuse). Post-dominance over the superset
  // (G-SEL-3) needs NO code here: G1/G2 below already run over ALL nodes including every arm,
  // because all arms are present in the frozen DAG (documented, not re-implemented).
  for (const [, grp] of selectGroups) {
    const members = grp.members;
    const g = grp.label;

    // G-SEL-1a — exactly-one membership: a select group needs >= 2 arms.
    if (members.length < 2) {
      errors.push(`select group "${g}" has only ${members.length} arm(s) (needs >= 2)`);
    }

    // G-SEL-1b — every arm names a selector_source, and all arms in the group name the SAME one.
    const srcs = new Set(members.map(m => m.selectorSource).filter(Boolean));
    if (srcs.size === 0) {
      errors.push(`select group "${g}" arms declare no selector_source`);
    } else if (srcs.size > 1) {
      errors.push(`select group "${g}" arms name conflicting selector_source(s): ${[...srcs].join(', ')}`);
    } else {
      const srcId = [...srcs][0];
      const srcNode = nodes.find(n => n.id === srcId);
      // G-SEL-1c — the selector_source must EXIST in the plan.
      if (!srcNode) {
        errors.push(`select group "${g}" selector_source "${srcId}" not found in plan`);
      } else {
        // G-SEL-1d — the selector_source must be READ-ONLY. Use the SAME predicate the fanout
        // read-only carve-out uses: !WRITE_ROLES.has(role). NOT a hand-listed allowlist.
        if (WRITE_ROLES.has(srcNode.role)) {
          errors.push(`select group "${g}" selector_source "${srcId}" (role ${srcNode.role}) must be a read-only node`);
        }
        // G-SEL-1e — every arm must depend_on the selector_source (it runs strictly before them).
        for (const m of members) {
          if (!m.dependsOn.includes(srcId)) {
            errors.push(`select group "${g}" arm "${m.id}" must depend_on selector_source "${srcId}"`);
          }
        }
      }
    }

    // G-SEL-2 — gates are never selectable. GATE_VERDICT_ROLES already exists at module scope.
    for (const m of members) {
      if (GATE_VERDICT_ROLES.has(m.role)) {
        errors.push(`select group "${g}" arm "${m.id}" has gate role ${m.role} — gates cannot be select arms (G-SEL-2)`);
      }
    }

    // G-SEL-3 — NO-OP by design. G1/G2 (below) already run over ALL nodes including every arm
    // (all arms are frozen in the DAG), which is strictly-more-conservative post-dominance over
    // the superset. Do not duplicate.

    // G-SEL-4 — disjoint-or-identical write sets across arms. Reuse classifier.disjointWriteSets.
    // Only RED is fatal: select arms are mutually exclusive (only one ever runs), so a shared-infra
    // (yellow) touch is not a concurrency hazard — unlike concurrent fanout arms. Do not copy the
    // fanout yellow push. (red = exact-path / coarse-area overlap = a stale mis-attributable
    // declaration = still fatal.)
    const dj = classifier.disjointWriteSets(members.map(m => m.writeSet));
    if (dj.verdict === 'red') {
      errors.push(`select group "${g}" arms have overlapping write sets (${dj.reasoning})`);
    }
  }

  // --- #232 (audit A3): inferred concurrent-sibling write disjointness ------------------------
  // The declared fan-out groups loop above only checks nodes carrying a fanout(...) tag. Two
  // structurally-parallel WRITE nodes (same depends_on, concurrently reachable, e.g. two tdd-guide
  // with shape:sequence) could declare identical/overlapping write sets and pass. Check every
  // ANTICHAIN pair (neither reaches the other) of write-bearing nodes, per-PAIR (concurrency is
  // non-transitive). Verdict policy splits by certainty (v3.20.1):
  //   - EXACT same file => RED/refuse for ANY antichain pair, regardless of a common ancestor — an
  //     unordered pair writing the same file is a guaranteed shared-worktree clobber.
  //   - COARSE-area / shared-infra (non-exact) overlap => ASK, but ONLY when truly concurrent (a
  //     shared common ANCESTOR). Independent branches share only the finalize sink (a descendant,
  //     never an ancestor); flagging them on a mere coarse-area touch would be a false refusal.
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
        // EXACT-file overlap => RED/refuse for ANY antichain pair, REGARDLESS of a common ancestor
        // (v3.20.1): two unordered nodes writing the same exact file both land in the ready-set and
        // both write the shared worktree — a guaranteed clobber. There is no safe authoring of it
        // (the fix is a dep edge serializing them), so refusing is not a false refusal. This also
        // closes the #233-introduced regression where two same-label fan-out members on independent
        // branches (split into separate origin-scoped groups) lost the disjointness coverage the
        // old merged-label group used to provide.
        let exact = null;
        for (const p of A.writeSet) if (B.writeSet.has(p)) { exact = p; break; }
        if (exact) {
          errors.push(`concurrent siblings ${A.id} and ${B.id} both write "${exact}" (parallel non-fanout write overlap)`);
          continue;
        }
        // COARSE-area / shared-infra overlap (NON-exact) => ASK, and ONLY when truly concurrent
        // (a shared common ANCESTOR). Independent branches share only the finalize sink (a
        // descendant, never an ancestor); flagging them on a mere coarse-area touch (e.g. two
        // features both under src/) would be a false refusal, so they are skipped here.
        let sharedAncestor = false;
        for (const a of ancOf.get(A.id)) if (ancOf.get(B.id).has(a)) { sharedAncestor = true; break; }
        if (!sharedAncestor) continue;
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
// #239 (v3.21.0): snapshot the LANDABLE worktree into a throwaway index and return the tree SHA. The
// index is first seeded from HEAD (`read-tree HEAD`), then `git add -A` layers the working state on
// top. This captures exactly the set that will be committed and merged: tracked changes (INCLUDING a
// modification to a tracked-but-gitignored file — committed then later gitignored, but still tracked,
// so still landable) + untracked-NON-ignored files. Genuinely-untracked .gitignored paths stay OUT
// OF SCOPE: the sink only ever stages approved/explicit paths (never `git add -f`), so such a write
// never lands, and the whole-plan Phase-6 merge gate (`git diff <merge-base>`, committed-only) cannot
// see it either — the per-node barrier scopes to the same landable set, by design (parity with the
// gate it pre-checks; `-Af` would make it stricter than the merge gate and brick normal runs by
// attributing test-run artifacts like coverage/ and __pycache__/). A zero-commit repo has no HEAD →
// the read-tree is skipped (the bare empty-index `add -A` still records a valid base). Diffing two
// such snapshots (node-start vs barrier) yields EXACTLY this node's own LANDABLE changes — new /
// modified / deleted — and natively excludes prior nodes' still-uncommitted source writes and
// pre-existing strays (the over-attribution false-refusal a bare `git ls-files --others` caused), and
// never folds a dirty tree into the base. The index lives OUTSIDE the repo (os.tmpdir) and is keyed by
// pid+tag so concurrent fan-out barriers never collide, and so its own path can never leak into the
// snapshot. Shells out to git like the other CLI handlers; the pure cores stay IO-free.
function snapshotWorktree(root, tag) {
  const idx = path.join(os.tmpdir(), 'kw-barrier-idx-' + process.pid + '-' + String(tag).replace(/[^A-Za-z0-9_-]/g, '_'));
  try { fs.unlinkSync(idx); } catch (_) {}
  try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: idx });
  try {
    // Seed tracked state from HEAD so a tracked-but-gitignored modification is captured (it is
    // landable). Fails closed-harmlessly in a zero-commit repo (no HEAD) → empty index, bare add -A.
    try { execFileSync('git', ['-C', root, 'read-tree', 'HEAD'], { env, stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    execFileSync('git', ['-C', root, 'add', '-A'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    return execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8' }).trim();
  } finally {
    try { fs.unlinkSync(idx); } catch (_) {}
    try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  }
}
// #239 (v3.21.0): a per-node baseline must SURVIVE `git gc` between node-start and the barrier (an
// explicit `gc --prune=now`, or default gc on a >2-week-paused resume — the exact resume case this
// targets). A bare `write-tree` object is unreachable and therefore prunable, which bricked the node.
// We wrap the base tree in a commit (`commit-tree`) and anchor it under a ref keyed by (project,
// node-id) so concurrent projects (which reuse node-ids like "a") never clobber each other's base.
// commit-tree gets an explicit identity so it works even where git user.* is unset (CI). The refs are
// intentionally left in place — bounded by node count, negligible — so an idempotent re-record / a
// crash re-dispatch resolves the same base. Returns the commit SHA stored in .cache.
function anchorBase(root, refName, tree) {
  const env = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'kaola-workflow', GIT_AUTHOR_EMAIL: 'kaola-workflow@localhost',
    GIT_COMMITTER_NAME: 'kaola-workflow', GIT_COMMITTER_EMAIL: 'kaola-workflow@localhost',
  });
  const commit = execFileSync('git', ['-C', root, 'commit-tree', tree, '-m', 'kaola-workflow barrier base'], { env, encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', root, 'update-ref', refName, commit], { stdio: ['ignore', 'ignore', 'ignore'] });
  return commit;
}
function printHelp() {
  process.stdout.write(
    'usage: kaola-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze] [--resume-check] [--gate-verify] [--barrier-check [--node-id ID] [--base REF]] [--verdict-check [--node-id ID]] [--selector-check --node-id ID]\n' +
    '  default        validate + print the governance verdict; exit 1 on typed refusal\n' +
    '  --freeze       validate, then write the computed plan_hash into the plan file\n' +
    '  --resume-check re-validate library + structure + hash only (not the gate rubric)\n' +
    '  --gate-verify  verify gate EXECUTION over the ## Node Ledger (G1/G2 ran); exit 1 if a completed node is uncovered\n' +
    '  --record-base --node-id ID  snapshot the full worktree as node ID\'s per-instance baseline (.cache); run at node start.\n' +
    '                 Idempotent: reuses an existing baseline (resume-safe — a re-dispatch never launders a crashed attempt)\n' +
    '  --barrier-check re-scan ACTUAL writes and refuse a sensitive write with no security-reviewer, or an out-of-allowlist\n' +
    '                 write; exit 1 on refusal. Whole-plan (no --node-id): union allowlist, diff vs merge-base of HEAD and\n' +
    '                 --base (default origin/main). Per-node (--node-id ID): the node\'s OWN allowlist, tree-diff vs its recorded\n' +
    '                 node-start snapshot (--base is rejected per-node — the baseline is the recorded snapshot)\n' +
    '  --verdict-check verify that every completed gate-role node\'s .cache evidence file carries verdict:pass/findings_blocking:0;\n' +
    '                 exit 1 on any failure. Per-node (--node-id ID): check one node; non-gate roles self-skip (exit 0).\n' +
    '  --selector-check --node-id ID  check which select arm the selector_source node chose, and compute which arms to mark n/a.\n' +
    '                 Non-selector nodes return ok:true/isSelector:false (never false-blocks). Missing/foreign selector => exit 1.\n'
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
  if (args.includes('--gate-verify')) {
    const r = verifyGateExecution(content, { root });
    process.stdout.write((json ? JSON.stringify(r) : (r.ok ? 'gate execution verified' : 'typed refusal: ' + r.unsatisfied.map(u => `${u.requirement}: ${u.reason}`).join('; '))) + '\n');
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const cacheBaseFile = nid => path.join(path.dirname(path.resolve(planPath)), '.cache', 'barrier-base-' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_'));
  // Anchor ref keyed by (project, node-id): concurrent projects reuse node-ids like "a", so a node-id-
  // only ref would let project B clobber project A's base and let gc prune it. The project token is the
  // project folder name (parent of the plan file).
  const projTag = path.basename(path.dirname(path.resolve(planPath))).replace(/[^A-Za-z0-9_-]/g, '_') || 'plan';
  const barrierRef = nid => 'refs/kaola-workflow/barrier/' + projTag + '/' + String(nid).replace(/[^A-Za-z0-9_-]/g, '_');
  if (args.includes('--record-base')) {
    // #239 (v3.21.0): snapshot the full landable worktree as a per-node baseline at NODE START via
    // snapshotWorktree(), anchor it under a ref (anchorBase) so `git gc` cannot prune it before the
    // barrier, and store the anchoring commit SHA in .cache keyed by node-id so the step-4 barrier
    // tree-diffs exactly THIS node's writes. Script-owned, explicit, resume-safe (ref-reachable).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', errors: ['--record-base requires --node-id <id>'] }) : 'typed refusal: --record-base requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    // Idempotent (critic-2): if a baseline already exists for this node (a crash + re-dispatch, or a
    // consent-halt re-entry), REUSE it. Re-snapshotting a now-dirty tree would fold the crashed
    // attempt's writes into a fresh baseline and launder them past the only check that can see them.
    let existing = '';
    try { existing = fs.readFileSync(cacheBaseFile(nodeId), 'utf8').trim(); } catch (_) {}
    if (existing) {
      process.stdout.write((json ? JSON.stringify({ result: 'ok', nodeId, base: existing, reused: true }) : 'reused base ' + existing + ' for node ' + nodeId) + '\n');
      return;
    }
    const baseTree = snapshotWorktree(root, nodeId);
    const baseCommit = anchorBase(root, barrierRef(nodeId), baseTree);
    fs.mkdirSync(path.dirname(cacheBaseFile(nodeId)), { recursive: true });
    fs.writeFileSync(cacheBaseFile(nodeId), baseCommit);
    process.stdout.write((json ? JSON.stringify({ result: 'ok', nodeId, base: baseCommit }) : 'recorded base ' + baseCommit + ' for node ' + nodeId) + '\n');
    return;
  }
  if (args.includes('--barrier-check')) {
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    // Robustness: a PRESENT but empty `--node-id` is a malformed per-node invocation, not whole-plan.
    if (args.includes('--node-id') && !nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', errors: ['--node-id requires a value'] }) : 'typed refusal: --node-id requires a value') + '\n');
      process.exitCode = 1; return;
    }
    let actualPaths;
    if (nodeId) {
      // PER-NODE (#239, v3.21.0): tree-diff the CURRENT full-worktree snapshot against THIS node's
      // recorded node-start snapshot — exactly this node's own changes, checked against its OWN
      // declared set. --base is REJECTED here: the baseline is the recorded snapshot, and honoring a
      // caller --base (e.g. `--base HEAD` after the node committed) would empty the diff and neuter
      // the gate. The whole-plan / phase-6 branch keeps --base.
      if (args.includes('--base')) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', errors: ['--base is not allowed with --node-id (per-node diffs vs the recorded node-start snapshot)'] }) : 'typed refusal: --base is not allowed with --node-id') + '\n');
        process.exitCode = 1; return;
      }
      let base = '';
      try { base = fs.readFileSync(cacheBaseFile(nodeId), 'utf8').trim(); } catch (_) { base = ''; }
      if (!base) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', errors: ['no recorded per-node base for "' + nodeId + '" (run --record-base --node-id at node start)'] }) : 'typed refusal: no recorded per-node base for ' + nodeId) + '\n');
        process.exitCode = 1; return;
      }
      const now = snapshotWorktree(root, nodeId + '-now');
      // base is the ref-anchored commit (resolves to the node-start tree); now is the barrier tree.
      // diff-tree prints only the changed paths (no leading object header for explicit tree-ishes).
      const diffOut = execFileSync('git', ['-C', root, 'diff-tree', '-r', '--name-only', base, now], { encoding: 'utf8' });
      actualPaths = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      // WHOLE-PLAN (phase6 merge gate): cumulative diff vs the merge-base of HEAD and the integration
      // branch (default origin/main) — committed + staged + unstaged together, so a committed sensitive
      // write is not invisible. Union allowlist + the ledger-consistency floor. A git failure throws ->
      // the top-level catch converts it to a typed (fail-closed) refusal.
      const base = flagVal('--base') || 'origin/main';
      const mergeBase = execFileSync('git', ['-C', root, 'merge-base', 'HEAD', base], { encoding: 'utf8' }).trim();
      const diffOut = execFileSync('git', ['-C', root, 'diff', '--name-only', mergeBase], { encoding: 'utf8' });
      actualPaths = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
    }
    const r = barrierCheck(content, actualPaths, { nodeId: nodeId || undefined, root });
    process.stdout.write((json ? JSON.stringify(r) : (r.result === 'pass' ? 'barrier ok' : 'typed refusal: ' + r.errors.join('; '))) + '\n');
    if (r.result !== 'pass') process.exitCode = 1;
    return;
  }
  if (args.includes('--selector-check')) {
    // #263: mechanical n/a computation for Classify-And-Act selective execution.
    // Inputs: plan path, --node-id <selector_source-id>. Non-selector nodes return ok:true/isSelector:false
    // (never false-blocks a normal commit). Missing/foreign selector => ok:false/exit 1 (fail-closed).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      const out = { ok: false, errors: ['--selector-check requires --node-id <id>'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: --selector-check requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    const nodes = parseNodes(content);
    if (!nodes.length) {
      const out = { ok: false, errors: ['plan has no parseable ## Nodes table'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      const out = { ok: false, errors: [`--node-id "${nodeId}" not found in the frozen plan`] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    // Determine the select group this node is the selector_source of.
    const arms = nodes.filter(n => n.selectorSource === nodeId);
    if (!arms.length) {
      // Not a selector_source — non-selector node, never false-blocks.
      const out = { ok: true, isSelector: false, armsToNa: [] };
      process.stdout.write((json ? JSON.stringify(out) : 'selector-check ok: not a selector') + '\n');
      return;
    }
    // Determine the group label (all arms must share one — if somehow multiple groups point here, use first).
    const group = arms[0].shape.group;
    const cacheDir = path.join(path.dirname(path.resolve(planPath)), '.cache');
    let cacheText = null;
    try { cacheText = fs.readFileSync(path.join(cacheDir, nodeId + '.md'), 'utf8'); } catch (_) { cacheText = null; }
    const parsed = schema.parseNodeSelector(cacheText || '');
    // FAIL-CLOSED: selector not found.
    if (!parsed.found) {
      const out = { ok: false, isSelector: true, errors: [`selector_source "${nodeId}" produced no selector: line`] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const selected = parsed.selector;
    const armIds = arms.map(a => a.id);
    // FAIL-CLOSED: selector names an id not among the arms (foreign).
    if (!armIds.includes(selected)) {
      const out = { ok: false, isSelector: true, errors: [`selector "${selected}" is not an arm of select group "${group}" (${armIds.join(', ')})`] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    // Valid selected arm: return armsToNa (all arms except the selected one).
    const armsToNa = armIds.filter(id => id !== selected);
    const out = { ok: true, isSelector: true, selected, group, armsToNa };
    process.stdout.write((json ? JSON.stringify(out) : `selector-check ok: selected="${selected}" group="${group}" armsToNa=[${armsToNa.join(',')}]`) + '\n');
    return;
  }
  if (args.includes('--verdict-check')) {
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (args.includes('--node-id') && !nodeId) {
      process.stdout.write((json ? JSON.stringify({ ok: false, errors: ['--node-id requires a value'] }) : 'typed refusal: --node-id requires a value') + '\n');
      process.exitCode = 1; return;
    }
    const cacheDir = path.join(path.dirname(path.resolve(planPath)), '.cache');
    const readCache = fileName => { try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; } };
    const globCache = prefix => { try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; } };
    const r = verifyVerdictBlock(content, { nodeId: nodeId || undefined, readCache, globCache });
    process.stdout.write((json ? JSON.stringify(r) : (r.ok ? 'verdict ok' : 'typed refusal: verdict-check failed')) + '\n');
    if (!r.ok) process.exitCode = 1;
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
  parseLedger,
  uniqueSink,
  gateUncovered,
  verifyGateExecution,
  verifyVerdictBlock,
  barrierCheck,
  installedRoles,
};
