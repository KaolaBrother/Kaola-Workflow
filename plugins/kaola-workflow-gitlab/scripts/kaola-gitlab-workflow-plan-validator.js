#!/usr/bin/env node
// @generated from scripts/kaola-workflow-plan-validator.js by `npm run sync:editions` (issue #365) — edit canonical and regenerate; do NOT hand-edit this forge port.
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
//   - caps: FANOUT_CAP, LOOP_CAP
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
const classifier = require('./kaola-gitlab-workflow-classifier');
const schema = require('./kaola-workflow-adaptive-schema');
// #274: byte-identity / sync-group write-set gap check. Root-only module (no plugin
// copy) — resolves in the Claude scripts/ tree; throws+caught (null) in the forge/codex
// edition trees, where the gap check below becomes a graceful no-op (zero false positives).
let syncMeta = null;
try { syncMeta = require('./validate-script-sync'); } catch (_) { /* forge/codex/user install: no sync module */ }
// #431: the generated-aggregator port-split freeze-wall reads the DECLARED generated-aggregator set
// (and the canonical->forge rename mapping) from edition-sync.js — the single source of truth for
// which canonical scripts are byte-/rename-generated into the four edition trees. Root-only module
// (no plugin copy): resolves in the Claude scripts/ tree; throws+caught (null) in the forge/codex
// edition trees, where the split-wall below becomes a graceful no-op. The check is ADDITIONALLY anchor-gated
// at call time on scripts/edition-sync.js existing under the validated root, so a consumer install
// that vendors the module (but not the repo tree) still never false-refuses.
let editionSync = null;
try { editionSync = require('./edition-sync'); } catch (_) { /* forge/codex/user install: no edition-sync module */ }

// #445 (D-445-01): per-aggregator operator hint registry. One entry per typed reason this
// script can emit; generated at emit time (never stored). Forge-neutral: no gh/glab/tea tokens.
// Vocabulary contract (D-445-01 §3): write_set_overflow family → revert-overflow (the laundering anti-pattern is excluded);
// crash-repair → repair-node; no forge CLI tokens in any hint.
const OPERATOR_HINT_REGISTRY = {
  nodes_unparseable: () => 'Plan has no parseable ## Nodes table. Check the Markdown table syntax and re-freeze.',
  no_unique_sink: () => 'Plan has no unique finalize sink node. Add exactly one `finalize` role node and re-freeze.',
  gate_unsatisfied: (ctx) => `Gate check failed: ${ctx.reason || 'a required reviewer did not complete'}. Ensure all code nodes are post-dominated by a completed reviewer.`,
  verdict_not_pass: (ctx) => `Verdict check failed for node ${ctx.nodeId || '(unknown)'}. Check .cache/${ctx.nodeId || '<node-id>'}.md for verdict: pass and findings_blocking: 0.`,
  node_not_found: (ctx) => `Node "${ctx.nodeId || '(unknown)'}" not found in the frozen plan. Check the node ID.`,
  governance_ack_stale: () => 'Plan hash changed after governance-ack was recorded. Re-run --freeze-checked to get a fresh hash, then --freeze --governance-ack <newHash>.',
  overlapping_write_sets: (ctx) => `Nodes ${(ctx.nodes || []).join(', ')} have overlapping write sets — they cannot co-schedule. Adjust the plan so parallel nodes have disjoint write sets.`,
  missing_nodes: () => '--parallel-safe requires --nodes A,B[,C] with at least 2 node IDs.',
  too_few_nodes: () => '--parallel-safe needs >= 2 node IDs.',
  drop_base_window_open: (ctx) => `Cannot drop baseline for in_progress node "${ctx.nodeId || '(unknown)'}". Reset the node to pending first (ledger-reset → pending → drop → fresh open).`,
  root_mismatch: () => 'Run the barrier from the repo root so write-set paths and the baseline diff measure against one root.',
  write_set_overflow: (ctx) => `Node ${ctx.nodeId || '(unknown)'} wrote files outside its declared write set. Run: node scripts/kaola-gitlab-workflow-adaptive-node.js revert-overflow --project <project> --node-id ${ctx.nodeId || '<node-id>'} --json`,
  write_set_granularity: (ctx) => `Node ${ctx.nodeId || '(unknown)'} wrote files outside its declared write set (granularity). Run: node scripts/kaola-gitlab-workflow-adaptive-node.js revert-overflow --project <project> --node-id ${ctx.nodeId || '<node-id>'} --json`,
  lockfile_write: (ctx) => `Node ${ctx.nodeId || '(unknown)'} wrote a lockfile outside its declared write set. Add the lockfile to the write set or run revert-overflow.`,
  mirror_write: (ctx) => `Node ${ctx.nodeId || '(unknown)'} wrote a mirror file outside its declared write set. Add the mirror to the write set or run revert-overflow.`,
  count_bump: (ctx) => `Node ${ctx.nodeId || '(unknown)'} wrote a count-bump file outside its declared write set. Add the file or run revert-overflow.`,
  foreign_archive: () => 'A file from a foreign archive was written. This is never allowed — revert the archive write.',
  sensitive_write_unreviewed: () => 'A sensitive file was written without a completed security-reviewer node. Add a security-reviewer gate to the plan.',
  unattributed_write: (ctx) => `File "${ctx.file || '(unknown)'}" was written but not attributed to any node\'s write set. Add it to a node\'s declared write set.`,
  unattributed_change: () => 'A file changed on this branch is not attributed to any complete node\'s write set. Attribute the file to a node or run revert-overflow.',
  barrier_base_mismatch: (ctx) => `Barrier baseline mismatch for node "${ctx.nodeId || '(unknown)'}". Use repair-node to restore the baseline ref, or reset the node to pending and re-open to record a fresh baseline.`,
  no_group_base: (ctx) => `No recorded group baseline for "${ctx.nodeId || '(unknown)'}". Run --record-base --node-id <group_id> at group open.`,
  running_set_unreadable: () => 'Cannot read running-set.json — the group barrier needs the live lane_group. Check the file exists and is valid JSON.',
  group_not_found: (ctx) => `No live lane_group "${ctx.nodeId || '(unknown)'}" in running-set.json. Ensure the group was opened before running the group barrier.`,
  chains_unverified: () => 'No chain receipt found. Run kaola-gitlab-workflow-run-chains.js after the last commit so HEAD is covered.',
  chains_stale: () => 'Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.',
  chains_red: () => 'One or more chains are RED with no waiver. Fix the failing chain or waive it explicitly (--accept-known-red <name>:<open-issue>).',
  plan_not_frozen: () => 'plan_hash missing — the plan is not frozen. Run --freeze to stamp the hash.',
  plan_hash_mismatch: () => 'plan_hash mismatch — workflow-plan.md was modified after freeze. Re-run --freeze to re-stamp.',
  unknown_role: (ctx) => `Unknown role "${ctx.role || '(unknown)'}" (node ${ctx.nodeId || '?'}) is not in the installed library. Check agents/ and re-freeze.`,
  dangling_depends_on: (ctx) => `Node ${ctx.nodeId || '(unknown)'} depends_on a node that does not exist. Fix the depends_on reference and re-freeze.`,
  cycle: () => 'Cycle detected in the plan DAG. Bounded loops are annotated single nodes, not DAG cycles. Fix the dependency edges and re-freeze.',
  too_many_nodes: () => `Plan exceeds MAX_NODES. Reduce the plan size and re-freeze.`,
  no_selector_line: (ctx) => `selector_source "${ctx.nodeId || '(unknown)'}" produced no selector: line in its evidence. Write a selector: <arm-id> line to .cache/${ctx.nodeId || '<node-id>'}.md.`,
  foreign_selector: (ctx) => `selector "${ctx.selector || '(unknown)'}" is not a valid arm of the select group. Use one of the declared arm IDs.`,
  missing_node_id: () => 'This subcommand requires --node-id <id>. Provide the node ID.',
  plan_invalid: () => 'Plan is out of grammar. Fix the listed errors and re-freeze.',
  plan_unreadable: () => 'Cannot read the plan file. Check the path and file permissions.',
  invalid_args: () => 'Invalid argument combination. Check the command usage (--help).',
  no_barrier_base: (ctx) => `No recorded baseline for node "${ctx.nodeId || '(unknown)'}". Run: node scripts/kaola-gitlab-workflow-plan-validator.js <plan> --record-base --node-id ${ctx.nodeId || '<node-id>'} before dispatching the node.`,
  missing_group_id: () => '--group-barrier requires --group-id <id>. Provide the lane group ID.',
  internal_error: () => 'Validator encountered an unexpected internal error. Check the plan file for malformed Markdown and re-run.',
};

function getOperatorHint(reason, ctx) {
  const fn = OPERATOR_HINT_REGISTRY[reason];
  if (fn) return fn(ctx || {});
  return `Operation refused (reason: ${reason}). Check the plan and evidence files, then consult docs/plan-run-cards/.`;
}

const TERMINAL_ROLE = 'finalize';

// #334: the non-delegable main-session gate. Like TERMINAL_ROLE it is a BUILT-IN role
// token, not an installed subagent — the closed-library check skips it. Read-only (not in
// WRITE_ROLES), verdict-bearing (GATE_VERDICT_ROLES), shape `sequence` only, and covered
// by its own post-dominance gate G3 (freeze) + G3 execution check (--gate-verify).
const MAIN_SESSION_GATE = schema.MAIN_SESSION_GATE_ROLE;

// The canonical roles that are ALWAYS installed (vendored). The validator unions
// this baseline with any maintainer-added roles discovered under <root>/agents,
// so the library is runtime-closed over the INSTALLED set (not the literal nine).
const CANONICAL_ROLES = [
  'code-explorer', 'knowledge-lookup', 'planner', 'code-architect', 'tdd-guide',
  'build-error-resolver', 'code-reviewer', 'security-reviewer', 'doc-updater',
  'adversarial-verifier', 'implementer', 'issue-scout',
];
// Roles that may legitimately declare a repo write set (by TOOL MANIFEST; note
// security-reviewer is Write by manifest, review-only only by governance posture).
const WRITE_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'doc-updater', 'security-reviewer', 'implementer']);
const IMPLEMENT_ROLES = new Set(['tdd-guide', 'build-error-resolver', 'implementer']);
// #388: canonical node-id sanitizer. MUST stay byte-identical to the inline regex in
// cacheBaseFile/barrierRef (the --record-base / --drop-base / --barrier-check .cache + ref keys)
// so the freeze-time sanitize-collision check sees the SAME collisions the barrier keys do
// (`a.b` and `a_b` both → `barrier-base-a_b`). Used ONLY at freeze (dup-id + collision wall) and
// for the #385 freshness-token file name.
function sanitizeNodeId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}
// #251: roles that must emit a machine verdict block into their .cache evidence file.
// #334: MAIN_SESSION_GATE joins the set so a non-delegable gate gets per-node + whole-plan
// verdict enforcement (verifyVerdictBlock sequence branch reads .cache/<id>.md, requires
// verdict:pass / findings_blocking:0 / no unresolved in-scope fixes — the #279 contract) and
// G-SEL-2 (a gate can never be a select arm) for free.
const GATE_VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier', MAIN_SESSION_GATE]);

// #433 (D-433-01): the SINGLE-SOURCE role-token registry. Maps each role to its required evidence
// token CLASSES. A class containing `|` is an ALTERNATION — ANY one of the alternatives satisfies it
// (the implementer's `regression-green|build-green|smoke-integration` is the #359 verification-tier
// vocabulary). This map is the ONE source for BOTH the evidence-shape GATE (the validator's reader)
// and the open-time evidence SEED (adaptive-node.js's writer) — no second copy. Exported via
// module.exports so adaptive-node.js imports the SAME object and the two never drift.
const ROLE_TOKEN_REGISTRY = {
  'tdd-guide':             ['evidence-binding', 'RED', 'GREEN'],
  'implementer':          ['evidence-binding', 'non_tdd_reason', 'regression-green|build-green|smoke-integration'],
  'code-reviewer':        ['evidence-binding', 'verdict', 'findings_blocking'],
  'security-reviewer':    ['evidence-binding', 'verdict', 'findings_blocking'],
  'adversarial-verifier': ['evidence-binding', 'verdict'],
  'doc-updater':          ['evidence-binding'],
  'main-session-gate':    ['evidence-binding', 'verdict', 'findings_blocking'],
};

// #424 (D-424-01): the NARROW `.md`/attribution allowband. A repo-root-relative path is
// barrier-INVISIBLE (may be written by a node WITHOUT declaring it, and is `attributed` at finalize)
// if and ONLY if it matches one of:
//   - docs/**                       — the documentation tree (any depth).
//   - CHANGELOG.md (repo root only) — release notes.
//   - README.md    (repo root only) — project readme.
//   - kaola-workflow/{project}/**   — the active project's workflow state + `.cache/` evidence
//                                     (this clause preserves the #271 `.cache/{node-id}.md` carve-out).
// This REPLACES the blanket suffix exemption (ANY `*.md` passed). Matching is path-SHAPE, not suffix:
// a nested `plugins/.../README.md` is NOT at the repo root, so it is OUTSIDE the band; `agents/*.md`,
// `commands/*.md`, `plugins/*/skills/**/*.md`, `plugins/*/agents/*.toml` are all behavioral and MUST
// be declared. Pure (no fs). `project` is the active project folder name (the `## Meta` tag / plan
// dir basename); when absent, the `kaola-workflow/{anything}/**` band is honored (the per-node barrier
// already separately exempts the whole `kaola-workflow/` workflow-artifact band via isWorkflowArtifact).
function isBarrierInvisible(p, project) {
  const rel = String(p || '').trim().replace(/^\.\//, '');
  if (!rel) return false;
  if (rel === 'CHANGELOG.md') return true;          // repo-root only
  if (rel === 'README.md') return true;             // repo-root only
  if (/^docs\//.test(rel)) return true;             // docs/** (any depth)
  if (project) {
    if (rel === 'kaola-workflow/' + project) return true;
    if (rel.startsWith('kaola-workflow/' + project + '/')) return true;
    return false;
  }
  // No project context: honor the generic workflow-state band so the finalize sweep / barrier never
  // false-flags any path under the active-project tree (isWorkflowArtifact covers the rest).
  return /^kaola-workflow\/[^/]+\//.test(rel);
}

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
// #441 (D-441-01 decision 1): the operator's bundle goal lives in `## Meta` as a single
// `goal: <prose>` line — additive, hash-covered for free (computePlanHash already normalizes the
// WHOLE `## Meta` body), READER-ONLY (no goal GATE; freeze accepts goal-absent plans unchanged).
// Decoy-immune by construction: the read is SCOPED to the hash-covered `## Meta` section via the
// SAME `classifier.sectionBody(content, 'Meta')` reader parseLabels is fed (the #B1 audit scoping),
// so a stray `goal:` line elsewhere in the plan cannot override the frozen value. Returns
// { goal: <string> } when present, { goal: null } when absent.
function parseGoal(content) {
  const meta = classifier.sectionBody(content, 'Meta');
  const m = String(meta || '').match(/^goal:[ \t]*(.*)$/m);
  return { goal: m ? m[1].trim() : null };
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
      // #382: optional per-node model tier ({opus|sonnet}). Hash-covered (lives in ## Nodes).
      // Absent column / '—' => '' => today's role-static resolution (back-compat; old plans hash-stable).
      model: (() => { const v = get('model'); return (v && v !== '—' && v !== '-') ? v.toLowerCase() : ''; })(),
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

// #425: the alias sets the planner mis-authors for the two required ledger columns. `| node |`,
// `| node_id |`, `| node-id |` all mean `id`; `| state |` means `status`. A ledger with such a
// header passes freeze today (parseLedger silently returns an empty Map) then bricks open-next
// with node_not_in_ledger. The freeze-wall (validatePlan) refuses it; --repair (reconcileLedger)
// normalizes the alias to the canonical column name (hash-safe — the ledger is outside plan_hash).
const LEDGER_ID_ALIASES = new Set(['id', 'node', 'node_id', 'node-id', 'nodeid']);
const LEDGER_STATUS_ALIASES = new Set(['status', 'state']);

// #425: inspect a PRESENT ## Node Ledger's header row. Returns null when the section is absent or
// has no header row (nothing to validate). Otherwise returns { cells, hasId, hasStatus } where
// `cells` is the lower-cased header column list, hasId/hasStatus are the canonical-column presence
// flags. Fence-aware via the same sectionBody reader parseLedger uses.
function ledgerHeaderInfo(content) {
  if (schema.locateSection(content, schema.LEDGER_HEADING).start < 0) return null;
  const body = classifier.sectionBody(content, schema.LEDGER_HEADING);
  const rows = body.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (!rows.length) return null;
  const cells = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  return {
    cells,
    hasId: cells.indexOf('id') >= 0,
    hasStatus: cells.indexOf('status') >= 0,
  };
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
// #340: transitive ancestor sets — Map<id, Set<ancestorIds>> over `dependsOn`. Memoized DFS;
// the memo-before-recurse guard makes it terminate even on a cyclic graph (cycles are refused
// separately by hasCycle; a partial set on an already-refusing plan is harmless). <= MAX_NODES.
function transitiveDeps(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const memo = new Map();
  function ancestors(id) {
    if (memo.has(id)) return memo.get(id);
    const acc = new Set();
    memo.set(id, acc); // set BEFORE recursing so a cycle terminates on the in-progress entry
    const node = byId.get(id);
    if (!node) return acc;
    for (const d of node.dependsOn) {
      if (!byId.has(d)) continue;
      acc.add(d);
      for (const a of ancestors(d)) acc.add(a);
    }
    return acc;
  }
  for (const n of nodes) ancestors(n.id);
  return memo;
}
// #340 mechanism 1: the registration surface of an agent-set delta. Each path either
// holds an exact-match registry that REDS A CHAIN on any add/remove, or a by-name
// enumeration whose omission ships a SILENT cross-edition divergence (config/agents.toml
// codex dispatch tables, uninstall.sh REQUIRED_AGENTS — both missed by #328). All are
// keyed on NO symbol of the new file, so the #306 symbol-grep cannot find them. All plugin-prefixed
// strings are segment-joined so no `plugins/<root>/scripts` literal forms in the forge
// plan-validator copies (forge contract validators forbid that token — see the existing
// tmplPair/codexScriptsPrefix convention at the #274 block).
function agentRegistrationSurface(name) {
  const cx = ['plugins', 'kaola-workflow'].join('/');
  const gl = ['plugins', 'kaola-workflow-gitlab'].join('/');
  const ge = ['plugins', 'kaola-workflow-gitea'].join('/');
  // #401 Part 2: plan-validator base name, segment-joined so edition-sync's renderForgePort rename
  // regex (`kaola-gitlab-workflow-plan-validator`) finds NO contiguous literal here. When THIS file is
  // generated as a forge port (now in GENERATED_AGGREGATORS), the canonical + codex registry entries
  // below MUST keep the canonical name — only the gl/ge entries are edition-renamed. A naive rename of
  // 323-324 would list two forge entries and DROP the canonical+codex surfaces (the exact drift this
  // registry exists to catch). The header comment + usage string keep the bare literal on purpose so
  // renderForgePort DOES render them to the forge name (the #401 item-4 cosmetic-identity fix).
  const pv = ['kaola', 'workflow', 'plan-validator.js'].join('-');
  return [
    'agents/' + name + '.md',
    cx + '/agents/' + name + '.toml',
    gl + '/agents/' + name + '.toml',
    ge + '/agents/' + name + '.toml',
    // codex-runtime dispatch registration ([agents.<name>] managed-block templates) —
    // the #328 miss: profile copied, table absent => agent undispatchable in 3 editions.
    cx + '/config/agents.toml',
    gl + '/config/agents.toml',
    ge + '/config/agents.toml',
    ['scripts', 'validate-vendored-agents.js'].join('/'),
    'install.sh',
    'uninstall.sh', // REQUIRED_AGENTS enumeration drives managed-agent removal (uninstall.sh:8,:59-82)
    ['scripts', 'kaola-workflow-resolve-agent-model.js'].join('/'),
    [cx, 'scripts', 'kaola-workflow-resolve-agent-model.js'].join('/'),
    [gl, 'scripts', 'kaola-workflow-resolve-agent-model.js'].join('/'),
    [ge, 'scripts', 'kaola-workflow-resolve-agent-model.js'].join('/'),
    ['scripts', pv].join('/'),
    [cx, 'scripts', pv].join('/'),
    [gl, 'scripts', 'kaola-gitlab-workflow-plan-validator.js'].join('/'),
    [ge, 'scripts', 'kaola-gitea-workflow-plan-validator.js'].join('/'),
    [gl, 'scripts', 'validate-kaola-workflow-gitlab-contracts.js'].join('/'),
    [ge, 'scripts', 'validate-kaola-workflow-gitea-contracts.js'].join('/'),
    [gl, 'scripts', 'test-gitlab-workflow-scripts.js'].join('/'),
    [ge, 'scripts', 'test-gitea-workflow-scripts.js'].join('/'),
  ];
}
// #340 mechanism 2 — forge-port mirror ordering. The canonical spec of a forge-port
// mirror is the FULL ACCUMULATED root diff, which only exists after ALL root edits have
// landed; a port node parallel to (or upstream of) a root edit mirrors a stale/partial
// root. Pure graph+path check, no fs: inert in any repo that never declares these plugin paths.
const FORGE_PORT_PREFIXES = [
  ['plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-'].join('/'),
  ['plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-'].join('/'),
];
function forgePortRootSource(p) {
  for (const prefix of FORGE_PORT_PREFIXES) {
    if (p.startsWith(prefix) && p.endsWith('.js')) {
      return ['scripts', 'kaola-workflow-' + p.slice(prefix.length)].join('/');
    }
  }
  return null;
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
  // #406: DUAL-EMIT — add the canonical {result, reasonCode} envelope ALONGSIDE the established
  // `ok` (and `unsatisfied`). Every consumer (commit-node gateVerify.ok) still reads `ok`; the typed
  // fields are additive (back-compat shim, removal date in docs/api.md). result agrees with `ok`.
  if (!nodes.length) return { ok: false, result: 'refuse', reasonCode: 'nodes_unparseable', operator_hint: getOperatorHint('nodes_unparseable'), unsatisfied: [{ requirement: '## Nodes', reason: 'unparseable' }] };
  const sink = uniqueSink(nodes);
  if (!sink) return { ok: false, result: 'refuse', reasonCode: 'no_unique_sink', operator_hint: getOperatorHint('no_unique_sink'), unsatisfied: [{ requirement: 'unique sink', reason: 'no unique finalize sink' }] };
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
  // #334 G3 execution: (a) a completed code-producing node must be post-dominated by a
  // COMPLETED main-session-gate (same relabel discipline as G1/G2); (b) n/a-evasion — the
  // ledger lives outside plan_hash, so a frozen non-delegable gate flipped to n/a would be
  // invisible to --resume-check; it has no legal n/a route (never a select arm, G-SEL-2),
  // so an n/a row is an unsatisfied gate outright.
  if (nodes.some(n => n.role === MAIN_SESSION_GATE)) {
    checkGate(producesCode, MAIN_SESSION_GATE, 'G3');
    for (const n of nodes) {
      if (n.role === MAIN_SESSION_GATE && ledger.get(n.id) === 'n/a') {
        unsatisfied.push({ requirement: 'G3 gate execution', reason: `main-session-gate ${n.id} is marked n/a — a non-delegable gate cannot be skipped` });
      }
    }
  }
  return { ok: unsatisfied.length === 0, result: unsatisfied.length ? 'refuse' : 'pass', reasonCode: unsatisfied.length ? 'gate_unsatisfied' : null, operator_hint: unsatisfied.length ? getOperatorHint('gate_unsatisfied', { reason: unsatisfied[0] && unsatisfied[0].reason }) : undefined, unsatisfied };
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
  // #406: DUAL-EMIT — {result, reasonCode} ADDED alongside the established `ok` on every return.
  // Consumers (commit-node verdictCheck.ok) still read `ok`; the typed fields are additive shims.
  if (!nodes.length) return { ok: false, result: 'refuse', reasonCode: 'nodes_unparseable', operator_hint: getOperatorHint('nodes_unparseable'), failures: [{ nodeId: null, role: null, reason: 'unparseable ## Nodes' }], checked: [] };
  function checkOne(node) {
    const role = node.role;
    if (!GATE_VERDICT_ROLES.has(role)) {
      return { ok: true, nodeId: node.id, role, verdict: null, findings_blocking: null, found: false };
    }
    if (role === 'adversarial-verifier' && node.shape && node.shape.kind === 'fanout') {
      const files = globCache('adversarial-verifier-');
      const verdicts = [];
      for (const f of files) {
        const cacheText = readCache(f) || '';
        const v = schema.parseNodeVerdict(cacheText);
        if (!v.found || v.verdict === null) { verdicts.push('fail'); continue; }
        // #279: an unresolved in-scope action:fix finding refutes the instance even on verdict:pass.
        const fixes = schema.unresolvedInScopeFixes(schema.parseNodeFindings(cacheText));
        verdicts.push((v.verdict === 'fail' || (v.findings_blocking || 0) > 0 || fixes.length > 0) ? 'fail' : 'pass');
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
    // #279: an unresolved in-scope action:fix finding fails the gate EVEN on verdict:pass /
    // findings_blocking:0 — an actionable in-scope defect can never silently become a follow-up.
    const unresolvedFixes = schema.unresolvedInScopeFixes(schema.parseNodeFindings(raw));
    const ok = v.verdict === 'pass' && blocking === 0 && unresolvedFixes.length === 0;
    const fixIds = unresolvedFixes.map(f => f.id || f.raw).join(', ');
    return { ok, nodeId: node.id, role, verdict: v.verdict, findings_blocking: v.findings_blocking,
      unresolvedFixes: unresolvedFixes.map(f => ({ id: f.id || null, fix_role: f.fix_role || null, severity: f.severity || null, raw: f.raw })),
      found: true,
      reason: ok ? undefined
        : (v.verdict === 'pass' && blocking === 0
          ? `gate role ${role} node ${node.id} verdict=pass but ${unresolvedFixes.length} unresolved in-scope action:fix finding(s): ${fixIds}`
          : `gate role ${role} node ${node.id} verdict=${v.verdict} findings_blocking=${blocking}`) };
  }
  // #406: stamp the canonical {result, reasonCode} onto a top-level return alongside its `ok`.
  const decorate = r => Object.assign({}, r, { result: r.ok ? 'pass' : 'refuse', reasonCode: r.ok ? null : 'verdict_not_pass', operator_hint: r.ok ? undefined : getOperatorHint('verdict_not_pass', { nodeId: r.nodeId }) });
  if (opts.nodeId) {
    const node = nodes.find(n => n.id === opts.nodeId);
    if (!node) return { ok: false, result: 'refuse', reasonCode: 'node_not_found', operator_hint: getOperatorHint('node_not_found', { nodeId: opts.nodeId }), nodeId: opts.nodeId, role: null, verdict: null, findings_blocking: null, found: false,
      reason: `--node-id "${opts.nodeId}" not found in the frozen plan` };
    return decorate(checkOne(node));
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
  return { ok: failures.length === 0, result: failures.length ? 'refuse' : 'pass', reasonCode: failures.length ? 'verdict_not_pass' : null, operator_hint: failures.length ? getOperatorHint('verdict_not_pass', { nodeId: failures[0] && failures[0].nodeId }) : undefined, failures, checked };
}

// #404 (#381 Part C, build-smaller): STRUCTURAL detection of the write-set GRANULARITY artifact —
// a per-node overflow whose out-of-allow files are ALL strict subtrees of one of the node's OWN
// directory-shaped declared tokens. PURE (no fs): a "directory token" is one ending in `/` (the
// #388-(b) trailing-slash shape) OR a bare segment that the operator meant as a directory (`src`);
// both are normalized to `tok + '/'` for a literal-string subtree prefix. STRICT subtree = p starts
// with `tok/` AND p !== tok (a directory grant can never equal a file write). True iff outOfAllow is
// NON-EMPTY and EVERY member is covered by one of the node's own dir tokens — a single foreign
// (non-subtree) write keeps it plain write_set_overflow. NO mutation, NO re-freeze, NO auto-repair:
// the build-smaller scope (guards 3-7 / the auto-repair machine are documented-deferred).
function isWriteSetGranularity(ownNode, outOfAllow) {
  if (!ownNode || !outOfAllow || !outOfAllow.length) return false;
  const dirTokens = [];
  for (const tok of (ownNode.writeSet || [])) {
    const t = String(tok || '').trim();
    if (!t) continue;
    dirTokens.push(t.endsWith('/') ? t : t + '/');
  }
  if (!dirTokens.length) return false;
  return outOfAllow.every(p => dirTokens.some(d => p.startsWith(d) && p !== d.slice(0, -1)));
}

// #440 (D-440-01 decisions 1 + 6): NARROW write_set_overflow into one of three mechanical
// subtypes — lockfile_write / mirror_write / count_bump — when EVERY out-of-allow path matches a
// SINGLE subtype's literal-pattern table. The table lives in adaptive-schema.js (the byte-identical
// forge-neutral home — decision 1) so a path classifies identically across all four editions. These
// are LABELS under write_set_overflow, NEVER a fifth precedence family (decision 6 / D-419-02
// [INV-13] do-not-fork-the-taxonomy): a path matching none stays plain write_set_overflow, and paths
// spanning MULTIPLE subtypes (no single narrowing) also stay plain write_set_overflow. PURE: a
// literal-pattern test over outOfAllow (no fs, no mutation, no re-freeze), exactly as #404's
// granularity classifier is. Returns the subtype key string, or null when there is no single match.
function classifyOverflowSubtype(outOfAllow) {
  if (!outOfAllow || !outOfAllow.length) return null;
  const table = schema.WRITE_SET_OVERFLOW_SUBTYPES;
  let matched = null;
  for (const p of outOfAllow) {
    let hit = null;
    for (const key of Object.keys(table)) {
      if (table[key].patterns.some(re => re.test(p))) { hit = key; break; }
    }
    if (!hit) return null;                 // a path matching no subtype => plain write_set_overflow
    if (matched === null) matched = hit;
    else if (matched !== hit) return null; // paths span multiple subtypes => plain write_set_overflow
  }
  return matched;
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
  if (!nodes.length) return { result: 'refuse', reason: 'nodes_unparseable', operator_hint: getOperatorHint('nodes_unparseable'), errors: ['plan has no parseable ## Nodes table'] };
  const ownNode = opts.nodeId ? nodes.find(n => n.id === opts.nodeId) : null;
  if (opts.nodeId && !ownNode) {
    return { result: 'refuse', reason: 'node_not_found', operator_hint: getOperatorHint('node_not_found', { nodeId: opts.nodeId }), errors: [`--node-id "${opts.nodeId}" not found in the frozen plan`] };
  }
  // #239: per-instance allowlist. In PER-NODE mode the allowlist is the node's OWN declared write set
  // (so a fan-out instance writing into a SIBLING's declared lane refuses — the per-instance overflow
  // the union check could not see); in WHOLE-PLAN mode it is the union over all nodes (the floor).
  // #437 (D-419 P2): GROUP mode — opts.groupMembers is a SUBSET of node ids (the co-opened lane group);
  // the allowlist is the UNION over JUST those members' write sets. A path in the union ⇒ attributed to
  // its (by-construction-unique, disjoint) member; a path in NO member's set ⇒ the EXISTING rank-4
  // out-of-allowlist arm refuses it (no new reason code). This arm is reached ONLY when an explicit
  // opts.groupMembers is passed (the --group-barrier CLI path); every existing caller (per-node and
  // whole-plan, which never pass groupMembers) is byte-identical — the new branch is skipped.
  const declared = new Set();
  if (opts.groupMembers && opts.groupMembers.length) {
    for (const id of opts.groupMembers) {
      const n = nodes.find(x => x.id === id);
      if (n) for (const p of n.writeSet) declared.add(p);
    }
  } else if (ownNode) { for (const p of ownNode.writeSet) declared.add(p); }
  else { for (const n of nodes) for (const p of n.writeSet) declared.add(p); }
  const real = (actualPaths || []).map(p => String(p || '').trim()).filter(Boolean);
  const archiveProj = opts.project || null;
  const foreignArchive = p => {
    const m = /^kaola-workflow\/archive\/([^/]+)\//.exec(p);
    if (!m) return false;
    if (!archiveProj) return true;
    const dir = m[1];
    return dir !== archiveProj && !dir.startsWith(archiveProj + '.archived-');
  };
  const isWorkflowArtifact = p => /^kaola-workflow\//.test(p) && !foreignArchive(p);
  const isTestPath = p => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /\.(test|spec)\.[A-Za-z0-9]+$/i.test(p);
  // A "production" actual write is one that is NOT in the narrow .md allowband / tests / a workflow
  // artifact — those bands never need the code/security gate. They are exempt from BOTH the
  // sensitivity teeth and the allowlist (v3.20.1: the sensitivity scan previously lacked this
  // exemption, so a docs/test path whose NAME matched a Phase-5 pattern — e.g. `test/login.test.js`,
  // `docs/auth.md` — was wrongly refused at the merge gate, with no in-grammar escape).
  // #424 (D-424-01): the blanket `.md` suffix exemption (isDocsPath) is REPLACED by the NARROW
  // allowband (isBarrierInvisible) — only docs/**, repo-root CHANGELOG.md/README.md, and
  // kaola-workflow/{project}/** are invisible. Behavioral `.md`/`.toml` (agents/*.md, commands/*.md,
  // plugins/*/skills/**/*.md, plugins/*/agents/*.toml, any nested non-root README.md) is now
  // PRODUCTION and MUST be declared — the agents/workflow-planner.md live escape is closed.
  const isExempt = p => isWorkflowArtifact(p) || isBarrierInvisible(p, archiveProj) || isTestPath(p);
  const production = real.filter(p => !isExempt(p) && !foreignArchive(p));
  // (AC3) foreign-archive refusal: a write to another project's archive band must be blocked.
  const foreignArchiveHits = real.filter(foreignArchive);
  if (foreignArchiveHits.length) {
    errors.push(`actual writes touch a FOREIGN project's archive band (${foreignArchiveHits.join(', ')}) — a stray archive/<other>/ must not be swept onto this branch (finalized project: ${archiveProj || 'unknown'})`);
  }
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
  // #437: GROUP mode (opts.groupMembers) ALSO skips this whole-plan ledger floor — exactly as per-node
  // does. When the LAST group member closes, the barrier runs BEFORE that member is marked `complete`
  // (steps 1-2 then barrier then complete), so its in-lane writes are declared only by an `in_progress`
  // owner; running the floor here would false-refuse the group's own legitimate writes. The group's
  // attribution gate is the union allowlist (the rank-4 outOfAllow arm) — the same teeth, group-scoped.
  let unattributed = [];
  if (!opts.nodeId && !(opts.groupMembers && opts.groupMembers.length)) {
    const ledger = parseLedger(content);
    const anyCompleteOwner = new Map();
    for (const n of nodes) for (const p of n.writeSet) {
      if (!anyCompleteOwner.has(p)) anyCompleteOwner.set(p, false);
      if (ledger.get(n.id) === 'complete') anyCompleteOwner.set(p, true);
    }
    unattributed = production.filter(p => declared.has(p) && anyCompleteOwner.get(p) === false);
    if (unattributed.length) {
      errors.push(`actual writes (${unattributed.join(', ')}) are declared only by non-complete (n/a/pending) node(s) — the producing node claims it did not run, so the write is unreviewed`);
    }
  }
  // #406: a typed `reason` carrying the HIGHEST-precedence matched failure family, so consumers
  // classify the refusal STRUCTURALLY (never by English-substring matching the `errors` strings).
  // Precedence: foreign_archive(1) > sensitive_write_unreviewed(2) > write_set_overflow(3) >
  // unattributed_write(4). `reason` is null when result==='pass'. ADDITIVE — no consumer reads
  // barrierCheck.reason today; the new surfaced arrays (foreignArchiveHits, unattributed; sensitiveHits
  // and outOfAllow were already returned) let #404's structural classifier read the families directly.
  let reason = null;
  if (foreignArchiveHits.length) reason = 'foreign_archive';
  else if (sensitiveHits.length && !hasSecReviewer) reason = 'sensitive_write_unreviewed';
  else if (outOfAllow.length) {
    // #404 (#381 Part C, build-smaller): a per-node overflow whose EVERY out-of-allow path is a
    // strict subtree of one of THIS node's OWN directory-shaped declared tokens (`src/` or bare
    // `src`) is the mechanical granularity artifact — the operator authored a directory grant a
    // pre-#381 freeze let through, and the exact-path barrier can never match the real files. It is
    // a SUBTYPE of overflow (structural literal-string-prefix detection — NO mutation, NO re-freeze,
    // NO auto-repair). Plan-run surfaces an actionable "enumerate the files + re-freeze" consent
    // halt instead of the generic overflow halt. Per-node only (ownNode); a foreign (non-subtree)
    // write in the set keeps it plain write_set_overflow.
    // #440 (D-440-01): granularity (the per-node directory-grant artifact) is checked FIRST; if the
    // overflow is NOT that artifact, classify it against the lockfile/mirror/count_bump subtype table
    // (a single matched subtype narrows the label; multiple or none stays plain write_set_overflow).
    // All three are LABELS under write_set_overflow — the precedence family is unchanged (decision 6).
    if (ownNode && isWriteSetGranularity(ownNode, outOfAllow)) {
      reason = 'write_set_granularity';
    } else {
      reason = classifyOverflowSubtype(outOfAllow) || 'write_set_overflow';
    }
  }
  else if (unattributed.length) reason = 'unattributed_write';
  return { result: errors.length ? 'refuse' : 'pass', reason, operator_hint: (errors.length && reason) ? getOperatorHint(reason, { nodeId: opts.nodeId, file: unattributed[0] }) : undefined, errors, sensitiveHits, outOfAllow, foreignArchiveHits, unattributed };
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
  // #303: logical fan-out width wider than FANOUT_CAP is IN-GRAMMAR. FANOUT_CAP is a
  // RUNTIME concurrency limit (max concurrently-running subagents the executor's
  // open-batch/top-up will dispatch), NOT a planning-validity cap. Over-cap groups are
  // recorded here as non-blocking diagnostics so a very wide fan-out stays observable.
  const wideFanouts = [];

  if (!nodes.length) {
    return { result: 'refuse', reason: 'nodes_unparseable', operator_hint: getOperatorHint('nodes_unparseable'), errors: ['plan has no parseable ## Nodes table'], planHash: computePlanHash(content) };
  }
  // Input-size backstop: refuse an oversized plan as OUT OF GRAMMAR before any graph
  // algorithm runs (a multi-thousand-node depends_on chain would otherwise blow the DFS
  // stack — a crash, not a typed refusal). 200 is ~28x the largest realistic plan.
  if (nodes.length > schema.MAX_NODES) {
    return { result: 'refuse', reason: 'too_many_nodes', operator_hint: getOperatorHint('too_many_nodes'), errors: [`plan has ${nodes.length} nodes > MAX_NODES ${schema.MAX_NODES} (out of grammar)`], planHash: computePlanHash(content) };
  }
  const ids = new Set(nodes.map(n => n.id));

  // #388 (FREEZE-ONLY): duplicate node ids + sanitize-collisions freeze in-grammar today (nodeCount
  // counts both; barrierCheck's nodes.find judges the 2nd against the 1st's write set; parseLedger is
  // last-wins; cacheBaseFile/barrierRef COLLIDE on `barrier-base-<sanitized>`). Refuse at the
  // authoring gate. NOT added to revalidateForResume — a legacy frozen plan with a dup id must still
  // resume-check (the #381 freeze-only landmine). O(n): a raw-id Set + a sanitized->rawid Map.
  {
    const seenRaw = new Set();
    const seenSan = new Map();
    for (const n of nodes) {
      if (seenRaw.has(n.id)) {
        errors.push(`duplicate node id "${n.id}" — node ids must be unique (the per-node barrier/ledger key on id; a duplicate is silently judged against the first row)`);
      }
      seenRaw.add(n.id);
      const san = sanitizeNodeId(n.id);
      if (seenSan.has(san) && seenSan.get(san) !== n.id) {
        errors.push(`node ids "${seenSan.get(san)}" and "${n.id}" sanitize to the same barrier/ref key "${san}" — they would collide on .cache/barrier-base-${san}; rename one`);
      } else if (!seenSan.has(san)) {
        seenSan.set(san, n.id);
      }
    }
  }

  // closed library (runtime-closed over the installed set)
  for (const n of nodes) {
    // #334: MAIN_SESSION_GATE is a built-in non-subagent token (like the finalize sink) — skip
    // the installed-library lookup (it has no agents/*.md profile and is never dispatched).
    if (n.role === TERMINAL_ROLE || n.role === MAIN_SESSION_GATE) continue;
    if (!roles.has(n.role)) errors.push(`unknown role "${n.role}" not in installed library (node ${n.id})`);
  }
  // dangling deps
  for (const n of nodes) for (const d of n.dependsOn) if (!ids.has(d)) errors.push(`node ${n.id} depends_on unknown node "${d}"`);
  // acyclic
  if (hasCycle(nodes)) errors.push('cycle detected (bounded loops are annotated single nodes, not DAG cycles)');
  // unique sink
  const sink = uniqueSink(nodes);
  if (!sink) errors.push('no unique finalize sink (need exactly one terminal node)');
  // #425: ledger-header freeze-wall. A PRESENT ## Node Ledger whose header row lacks the required
  // `id` and/or `status` columns (the planner authored `| node |` / `| node_id |` / `| state |`)
  // passes freeze today — parseLedger silently returns an empty Map — then bricks open-next with
  // node_not_in_ledger mid-run. Refuse it at the authoring gate with a typed error naming the
  // columns found. Freeze-only (revalidateForResume is NOT touched) so a legacy in-flight plan
  // never bricks; --repair (reconcileLedger) normalizes the alias header hash-safely.
  {
    const hdr = ledgerHeaderInfo(content);
    if (hdr && (!hdr.hasId || !hdr.hasStatus)) {
      const missing = [!hdr.hasId ? 'id' : null, !hdr.hasStatus ? 'status' : null].filter(Boolean).join(', ');
      errors.push(`## Node Ledger header is missing required column(s) "${missing}" (ledger_header_invalid) — header columns found: [${hdr.cells.join(', ')}]; the ledger must declare \`id\` and \`status\` (run --freeze --repair to normalize \`node\`/\`node_id\`/\`state\` aliases)`);
    }
  }
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
    // #381: directory-shaped or path-traversal write-set entries freeze in-grammar but are DEAD at
    // the per-node barrier — barrierCheck matches EXACT file paths (declared.has(p)), so a directory
    // grant like `src/` can never match a real write `src/foo.js` and is guaranteed to refuse mid-run,
    // escalating a purely-mechanical authoring artifact to a maximally-expensive human consent halt.
    // Refuse at FREEZE (the authoring gate) instead. The check runs on the normalized n.writeSet
    // members: classifier.normalizeRepoPath preserves a trailing `/` and leaves `../` untouched.
    // Placed ahead of the remaining write-set shape checks so a `src/` token is reported as a
    // SHAPE error (it parses to size 1). Freeze-only — revalidateForResume is NOT
    // touched, so an in-flight legacy plan frozen by a pre-#381 validator still resumes (its barrier
    // failure falls through to the unchanged write-halt --reason consent net).
    // #388: freeze-wall round 2 — close the residual write-set shapes that freeze in-grammar
    // (--json exit 0) yet die at the exact-path barrier (re-creating the #381 "mechanical artifact
    // → maximally-expensive consent halt"). Freeze-only — revalidateForResume is NOT touched so a
    // legacy in-flight plan never bricks. Backslash + bare-dir + case-collision below.
    const freezeRoot = opts.root || process.cwd();
    const lcSeen = new Map(); // sibling-only case-collision (NOT tree-wide)
    for (const tok of n.writeSet) {
      // #415: an absolute-path token is never a valid in-repo relative path and would always
      // fail the exact-path barrier. Two forms: Unix `/` prefix and Windows drive-letter `C:`.
      // Checked BEFORE backslash so the typed reason is absolute_path, not backslash_in_path.
      if (tok.startsWith('/')) {
        errors.push(`node ${n.id} declared_write_set token "${tok}" is an absolute path (absolute_path) — declare relative in-repo file paths only`);
      } else if (tok.match(/^[A-Za-z]:/)) {
        errors.push(`node ${n.id} declared_write_set token "${tok}" is a Windows drive-letter path (absolute_path) — declare relative in-repo file paths only`);
      } else
      // #388 (c)/(d): a backslash-bearing token — `src\app.js` or the traversal evasion
      // `..\notes.txt` (the #381 `..` wall split is `/`-only) — is dead at the POSIX exact-path
      // barrier. Checked BEFORE the trailing-`/` check so a Windows-ism is reported as such.
      if (tok.includes('\\')) {
        errors.push(`node ${n.id} declared_write_set token "${tok}" contains a backslash (backslash_in_path) — declare POSIX in-repo file paths (a backslash never matches at the exact-path barrier)`);
      } else if (tok.endsWith('/')) {
        errors.push(`node ${n.id} declared_write_set entry "${tok}" is directory-shaped — declare exact file paths (the barrier matches files exactly; a directory grant is dead at the per-node barrier)`);
      } else if (tok.split('/').indexOf('..') !== -1) {
        errors.push(`node ${n.id} declared_write_set token "${tok}" contains '..' — declare exact in-repo file paths`);
      } else {
        // #388 (a): a BARE directory name (no trailing slash) is indistinguishable from a
        // root-file like `Dockerfile` to the string check, but the fs knows. statSync relative to
        // the repo root: a real directory is dead at the exact-path barrier and must refuse at
        // freeze. A statSync throw (a not-yet-created new file) is a clean skip — a new file is
        // legitimate; a Dockerfile-style root FILE isDirectory()===false → green.
        try {
          if (fs.statSync(path.join(freezeRoot, tok)).isDirectory()) {
            errors.push(`node ${n.id} declared_write_set entry "${tok}" resolves to an existing directory (directory_shaped_bare) — declare exact file paths (a directory grant is dead at the per-node barrier)`);
          }
        } catch (_) { /* path does not exist yet — a new file, legitimate */ }
      }
      // #388 (e): case-variant SIBLINGS in the SAME node (`SRC/app.js` + `src/app.js`) freeze
      // in-grammar but the exact-string barrier is case-exact, and macOS is case-insensitive, so
      // one write lands and the other silently never matches. Sibling-scoped only (NOT a tree
      // walk) — the minimum AC the issue asks for.
      const lc = tok.toLowerCase();
      if (lcSeen.has(lc) && lcSeen.get(lc) !== tok) {
        errors.push(`node ${n.id} declared_write_set has case-colliding siblings "${lcSeen.get(lc)}" and "${tok}" (case_collision) — the exact-path barrier is case-exact; one would never match on a case-insensitive filesystem`);
      } else if (!lcSeen.has(lc)) {
        lcSeen.set(lc, tok);
      }
    }
    // #388 (minor): a multi-token cell silently drops a token that normalizes to empty (e.g.
    // `src/app.js ./` froze green with the `./` grant vanished — the A2 fail-closed backstop is
    // per-CELL, not per-token). Fail closed per token: split writeSetRaw the SAME way
    // parseWriteSetCell does (/[\s,]+/) and refuse any non-sentinel token that parses to size 0.
    {
      const rawCell = (n.writeSetRaw || '').trim();
      if (rawCell && rawCell !== '—' && rawCell !== '-') {
        for (const rt of rawCell.split(/[\s,]+/)) {
          if (rt === '' || rt === '—' || rt === '-') continue;
          if (classifier.parseWriteSetCell(rt).size === 0) {
            errors.push(`node ${n.id} declared_write_set token "${rt}" normalizes to empty (token_empty_normalized) — a grant would silently vanish; remove it or declare an exact path`);
          }
        }
      }
    }
    // #382: optional per-node model tier — minimal freeze-time validation. An absent/'—' cell parses
    // to '' (role-static fallback, no check). A non-empty cell must be a closed tier token; a
    // main-session-gate must never carry a model (it is never dispatched as a subagent).
    if (n.model) {
      if (schema.NODE_MODEL_TIERS.indexOf(n.model) === -1) {
        errors.push(`node ${n.id} model "${n.model}" is not a valid tier (model_invalid) — use one of: ${schema.NODE_MODEL_TIERS.join(', ')}`);
      }
      if (n.role === MAIN_SESSION_GATE) {
        errors.push(`node ${n.id} is a main-session-gate and must not declare a model (it is never dispatched as a subagent)`);
      }
      // #390(c): the finalize sink, like a main-session-gate, is never dispatched as a subagent
      // (the main session runs Phase-6 finalize itself), so a model cell on it is meaningless.
      // Refuse it at freeze for wall symmetry. Freeze-only (revalidateForResume untouched).
      if (n.role === TERMINAL_ROLE) {
        errors.push(`node ${n.id} is the finalize sink and must not declare a model (it is never dispatched as a subagent)`);
      }
    }
  }

  // #431: generated-aggregator port-split freeze-wall. A canonical script in GENERATED_AGGREGATORS
  // (scripts/<base>) is byte-/rename-generated into the codex twin + both forge ports by
  // edition-sync.js. A plan that declares the canonical WITHOUT its full sibling set in the SAME node
  // splits a canonical aggregator from its ports across nodes — the exact #291 defect where a
  // canonical edit lands and its forge ports drift (caught only post-merge by `edition-sync --check`,
  // forcing a mid-run plan-repair). Refuse it at the authoring gate naming the missing siblings.
  // Anchor-gated on scripts/edition-sync.js existing under the validated root AND the module being
  // require()-able (forge/codex/user installs: editionSync === null) — silently inert otherwise, so
  // zero false positives where the generated mapping does not exist. Freeze-only (not in
  // revalidateForResume) so a legacy in-flight plan never bricks.
  if (editionSync && Array.isArray(editionSync.GENERATED_AGGREGATORS) && typeof editionSync.forgeRel === 'function') {
    const portWallRoot = opts.root || process.cwd();
    if (fs.existsSync(path.join(portWallRoot, 'scripts', 'edition-sync.js'))) {
      const codexRel = base => ['plugins', 'kaola-workflow', 'scripts'].join('/') + '/' + base;
      for (const n of nodes) {
        for (const base of editionSync.GENERATED_AGGREGATORS) {
          const canon = 'scripts/' + base;
          if (!n.writeSet.has(canon)) continue;
          // The SAME node must declare the full sibling set: codex twin + both forge ports.
          const siblings = [codexRel(base), editionSync.forgeRel(base, 'gitlab'), editionSync.forgeRel(base, 'gitea')];
          const missing = siblings.filter(s => !n.writeSet.has(s));
          if (missing.length) {
            errors.push(`generated_port_split: node ${n.id} declares the generated aggregator "${canon}" without its sibling port(s) "${missing.join('", "')}" in the same node — a generated aggregator and its codex twin + forge ports must be edited atomically (a split ships forge-port drift, the #291/#431 defect)`);
          }
        }
      }
    }
  }

  // #268 G-SEL-1b pre-check — every select arm must name a non-empty selector_source.
  // Run BEFORE selectGroups aggregation so a blank arm cannot slip past the .filter(Boolean)
  // in the per-group srcs Set and masquerade as the sole source (phantom arm bypass).
  for (const n of nodes) {
    if (n.shape.kind === 'select' && !n.selectorSource) {
      errors.push(`G-SEL-1b: arm "${n.id}" in select group "${n.shape.group}" has no selector_source declared`);
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
    // #334: a non-delegable gate is run serially by the main session — it can never be a
    // fan-out member or a loop body. (Select-arm membership is already refused by G-SEL-2.)
    if (n.role === MAIN_SESSION_GATE && n.shape.kind !== 'sequence') {
      errors.push(`main-session-gate node ${n.id} must be shape sequence — a non-delegable gate cannot be a fan-out member or loop`);
    }
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
    // #303: width > FANOUT_CAP is NOT a refusal — it is a runtime concurrency concern the
    // executor drains via rolling bounded dispatch. Record it as a diagnostic only.
    if (members.length > fanoutCap) wideFanouts.push({ group: g, width: members.length, cap: fanoutCap });
    const role = members[0].role;
    const readOnly = !WRITE_ROLES.has(role);
    if (!readOnly) {
      if (members.length >= 2) writeRoleFanout = true;
      const dj = classifier.disjointWriteSets(members.map(m => m.writeSet));
      if (dj.verdict === 'red') errors.push(`fan-out group "${g}" write sets not pairwise disjoint (${dj.reasoning})`);
      if (dj.verdict === 'yellow') errors.push(`fan-out group "${g}" touches shared infra (${dj.reasoning}) — must serialize, not fan out`);
    }
    // read-only fan-out: any width is in-grammar (empty write sets are trivially disjoint);
    // the executor concurrency-limits dispatch to FANOUT_CAP at runtime (#303).
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

    // #334 G3: a declared non-delegable main-session gate is an ACCEPTANCE gate for the whole
    // change — it must post-dominate every code-producing node, so a numerical-green implement
    // path can never reach the sink without crossing the manual/visual decision (the #210
    // bypass). Active ONLY when the role is present: existing plans never newly refuse.
    if (nodes.some(n => n.role === MAIN_SESSION_GATE)) {
      const g3 = gateUncovered(nodes, producesCode, MAIN_SESSION_GATE, sink);
      if (g3.length) errors.push(`G3: main-session-gate does not post-dominate code-producing node(s): ${g3.join(', ')}`);
    }
  }

  // #274 / #301: byte-identity write-set CO-OCCURRENCE gap. A frozen plan that edits one half of a
  // byte-identical group WITHOUT its partner(s) in the SAME node would diverge the locked bytes —
  // whole-file for the sync-script pairs, the marked region for the workflow-init CLAUDE.md-template
  // pairs — and SHIP drift that the post-merge contract validators / validate-script-sync.js then
  // reject, forcing a mid-run discard + re-author (the #286 discard #2). Refuse at freeze instead.
  //
  // #301 inverts the original UNION check (peer anywhere in the plan) to CO-OCCURRENCE (peer in the
  // SAME node's write set): splitting halves across nodes is itself the defect — the pair must be
  // edited atomically, so per-node the two copies are left inconsistent. #301 also adds the per-forge
  // CLAUDE.md-template pairs, which validate-script-sync.js does NOT export (they are region-, not
  // whole-file-identical), so they are hardcoded here and enforced in EVERY edition; the sync-script
  // arm stays inert where the sync module is absent (forge/codex/user installs: syncMeta === null).
  const byteIdentityGroups = [];

  // (A) Per-forge workflow-init CLAUDE.md-template pairs (#301 / #286). Region byte-locked per pair
  // by validate-kaola-workflow-contracts.js (commands/workflow-init.md <-> the edition's init SKILL).
  // Segments are join()ed so no `plugins/<root>/scripts` literal forms in the forge plan-validator
  // copies (the forge contract validator forbids that token) — these are /skills + /commands paths,
  // but the join keeps the convention and guards against a future /scripts sibling.
  const skillInit = ['skills', 'kaola-workflow-init', 'SKILL.md'].join('/');
  const tmplPair = (cmdDir, root, label) => ({ label, files: [`${cmdDir}/workflow-init.md`, `${root}/${skillInit}`] });
  byteIdentityGroups.push(tmplPair('commands', ['plugins', 'kaola-workflow'].join('/'), 'workflow-init template pair (github)'));
  byteIdentityGroups.push(tmplPair(['plugins', 'kaola-workflow-gitlab', 'commands'].join('/'), ['plugins', 'kaola-workflow-gitlab'].join('/'), 'workflow-init template pair (gitlab)'));
  byteIdentityGroups.push(tmplPair(['plugins', 'kaola-workflow-gitea', 'commands'].join('/'), ['plugins', 'kaola-workflow-gitea'].join('/'), 'workflow-init template pair (gitea)'));

  // (B) validate-script-sync.js whole-file groups — repo root only (syncMeta === null elsewhere).
  if (syncMeta) {
    const COMMON = Array.isArray(syncMeta.COMMON_SCRIPTS) ? syncMeta.COMMON_SCRIPTS : [];
    const GROUPS = Array.isArray(syncMeta.BYTE_IDENTICAL_GROUPS) ? syncMeta.BYTE_IDENTICAL_GROUPS : [];
    const codexScriptsPrefix = ['plugins', 'kaola-workflow', 'scripts'].join('/');
    for (const name of COMMON) byteIdentityGroups.push({ label: 'common script pair (#274)', files: [`scripts/${name}`, `${codexScriptsPrefix}/${name}`] });
    for (const group of GROUPS) byteIdentityGroups.push(group);
  }

  // Co-occurrence enforcement: every declared group member must have ALL its peers in the SAME
  // node's write set (n.writeSet is a Set). Membership is path-exact, so a non-group path never
  // false-refuses.
  for (const n of nodes) {
    for (const group of byteIdentityGroups) {
      const members = Array.isArray(group.files) ? group.files : [];
      for (const p of members) {
        if (!n.writeSet.has(p)) continue;
        for (const peer of members) {
          if (peer !== p && !n.writeSet.has(peer)) {
            errors.push(`sync-group gap: node ${n.id} declares "${p}" without its byte-identical peer "${peer}" (${group.label || '#274'}, #301)`);
          }
        }
      }
    }
  }

  // #340 mechanism 1 — agent-set delta registration completeness. An exact-match
  // directory/registry assertion (validate-vendored-agents.js agents-listing, the forge
  // agent-profile counts) breaks on ANY agent add, keyed on no symbol of the new file —
  // invisible to #306 symbol scoping (the #328 issue-scout plan-repair). Anchor-gated to
  // the Kaola-Workflow repo itself; inert in user installs (zero false positives).
  const regRoot = opts.root || process.cwd();
  if (fs.existsSync(path.join(regRoot, 'scripts', 'validate-vendored-agents.js'))) {
    const union = new Set();
    for (const n of nodes) for (const p of n.writeSet) union.add(p);
    const pluginAgentDirs = [
      ['plugins', 'kaola-workflow', 'agents'].join('/') + '/',
      ['plugins', 'kaola-workflow-gitlab', 'agents'].join('/') + '/',
      ['plugins', 'kaola-workflow-gitea', 'agents'].join('/') + '/',
    ];
    const newAgents = new Set();
    for (const p of union) {
      let name = null;
      const mdMatch = /^agents\/([a-z0-9-]+)\.md$/.exec(p);
      if (mdMatch) name = mdMatch[1];
      else for (const dir of pluginAgentDirs) {
        if (!p.startsWith(dir)) continue;
        const tomlMatch = /^([a-z0-9-]+)\.toml$/.exec(p.slice(dir.length));
        if (tomlMatch) { name = tomlMatch[1]; break; }
      }
      if (name && !fs.existsSync(path.join(regRoot, p))) newAgents.add(name);
    }
    for (const name of [...newAgents].sort()) {
      for (const req of agentRegistrationSurface(name)) {
        if (!union.has(req)) {
          errors.push(`agent-registration gap: plan adds new agent "${name}" but no node declares "${req}" — an agent-set delta must carry its full registration surface (#340)`);
        }
      }
    }
  }

  // #340 mechanism 2 — forge-port mirror ordering. A node whose write set contains a
  // gitlab/gitea edition-named PORT of a root script must be a transitive descendant of
  // every OTHER node that writes that root script — the canonical mirror spec is the FULL
  // accumulated root diff, which only exists after all root edits land. Same-node co-writes
  // (atomic mirror) and ports with no root writer (forge-only fix) are allowed. Pure graph
  // check, fs-free: inert in any plan that declares no such port path.
  {
    const ancestorSets = transitiveDeps(nodes);
    for (const n of nodes) {
      for (const p of n.writeSet) {
        const rootSrc = forgePortRootSource(p);
        if (!rootSrc) continue;
        for (const other of nodes) {
          if (other.id === n.id || !other.writeSet.has(rootSrc)) continue;
          if (!(ancestorSets.get(n.id) || new Set()).has(other.id)) {
            errors.push(`forge-port ordering gap: node ${n.id} writes port "${p}" but node ${other.id} writes its root source "${rootSrc}" and is not upstream of ${n.id} — order forge-port mirror nodes after ALL root edits and mirror the full accumulated root diff (#340)`);
          }
        }
      }
    }
  }

  const planHash = computePlanHash(content);
  if (errors.length) return { result: 'refuse', reason: 'plan_invalid', operator_hint: getOperatorHint('plan_invalid'), errors, planHash, sink };

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
    diagnostics: { wideFanout: wideFanouts },
  };
}

// Resume re-validation: ONLY closed-library membership + structural grammar + hash
// integrity — NOT the full gate rubric (re-running it would brick an in-flight plan
// if the rubric tightened after freeze). Structure + library are stable.
function revalidateForResume(content, opts) {
  opts = opts || {};
  // #406: DUAL-EMIT — every refuse return carries the canonical {result:'refuse', reasonCode}
  // alongside the established `ok` and the HUMAN `reason` string (consumers echo `reason` on stderr:
  // --resume-check, adaptive-handoff:340, adaptive-node:2051, parallel-batch:453 — and gate on `ok`).
  // The typed token lives in the NEW `reasonCode` field, never by overwriting `reason`.
  const refuse = (reasonCode, reason, ctx) => ({ ok: false, result: 'refuse', reasonCode, reason, operator_hint: getOperatorHint(reasonCode, ctx || {}) });
  const stored = readStoredHash(content);
  const computed = computePlanHash(content);
  if (!stored) return refuse('plan_not_frozen', 'plan_hash missing — plan is not frozen');
  if (stored !== computed) return refuse('plan_hash_mismatch', 'plan_hash mismatch — workflow-plan.md tampered after freeze');
  const nodes = parseNodes(content);
  if (!nodes.length) return refuse('nodes_unparseable', 'workflow-plan.md ## Nodes unparseable');
  // Same input-size backstop as validatePlan: the resume path also calls hasCycle, so an
  // oversized frozen plan must be refused before the DFS rather than overflow the stack.
  if (nodes.length > schema.MAX_NODES) return refuse('too_many_nodes', `plan has ${nodes.length} nodes > MAX_NODES ${schema.MAX_NODES} (out of grammar)`);
  const roles = opts.installedRoles || installedRoles(opts.root || process.cwd());
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    // #334: MAIN_SESSION_GATE is a built-in token (like TERMINAL_ROLE) — never in the installed library.
    if (n.role !== TERMINAL_ROLE && n.role !== MAIN_SESSION_GATE && !roles.has(n.role)) return refuse('unknown_role', `unknown role "${n.role}" (node ${n.id})`, { role: n.role, nodeId: n.id });
    for (const d of n.dependsOn) if (!ids.has(d)) return refuse('dangling_depends_on', `node ${n.id} depends_on unknown "${d}"`, { nodeId: n.id });
  }
  if (hasCycle(nodes)) return refuse('cycle', 'cycle detected');
  if (!uniqueSink(nodes)) return refuse('no_unique_sink', 'no unique sink');
  return { ok: true, result: 'pass', reasonCode: null, planHash: computed };
}

// Freeze: validate, and if in-grammar, inject/update the plan_hash comment.
// #340: opts thread the repo root so Check 1's anchor-gated agent-registration surface
// resolves against the validated root (not process.cwd()); backward-compatible (opts optional).
function freezePlan(content, opts) {
  const v = validatePlan(content, opts || {});
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

// #308: reconcileLedger — bring the `## Node Ledger` into agreement with the `## Nodes`
// table for a plan-repair (a node added to a frozen plan re-froze without a ledger row →
// next-action could never schedule it). Adds a `pending` row for every node present in
// `## Nodes` but absent from the ledger; NEVER drops or rewrites an existing status. The
// row is built to match the ledger header's column structure (id/status, plus role if the
// ledger carries it). plan_hash covers only `## Meta` + `## Nodes`, so adding ledger rows
// does NOT move the hash. Returns { content, added:[...ids] }; a no-op when nothing is
// missing or the ledger section/header is unparseable (fail-safe — never corrupts).
function reconcileLedger(content) {
  // #425: FIRST normalize a mis-authored ## Node Ledger header (`| node |`/`| node_id |`/`| state |`
  // -> `| id |`/`| status |`) so the missing-row reconcile below — and the executor's open-next —
  // can read the ledger. The header is rewritten in place via a single cell substitution per aliased
  // column; the row/rule lines and statuses are untouched. plan_hash excludes the ledger, so the
  // rewrite is hash-safe. Reports header_normalized so --freeze --repair can surface it.
  const norm = normalizeLedgerHeader(content);
  content = norm.content;
  const headerNormalized = norm.normalized;

  const nodes = parseNodes(content);
  const ledger = parseLedger(content);
  const missing = nodes.filter(n => !ledger.has(n.id));
  if (!missing.length) return { content, added: [], header_normalized: headerNormalized };

  // #354: route through the shared fence-aware locator (was the lone fence-BLIND validator slicer)
  // so an upstream fenced `## Node Ledger` decoy heading is skipped — parity with parseLedger which
  // already uses the fence-aware classifier.sectionBody.
  const { start: ledgerIdx, next: afterLedger } = schema.locateSection(content, schema.LEDGER_HEADING);
  if (ledgerIdx < 0) return { content, added: [], header_normalized: headerNormalized };
  const sectionEnd = afterLedger >= 0 ? afterLedger : content.length;
  const section = content.slice(ledgerIdx, sectionEnd);

  const rowLines = section.split('\n').filter(l => l.trim().startsWith('|'));
  if (rowLines.length < 1) return { content, added: [], header_normalized: headerNormalized };
  const headerCells = rowLines[0].split('|').slice(1, -1).map(c => c.trim());
  const lower = headerCells.map(c => c.toLowerCase());
  const idIdx = lower.indexOf('id');
  const stIdx = lower.indexOf('status');
  const roleIdx = lower.indexOf('role');
  if (idIdx < 0 || stIdx < 0) return { content, added: [] };

  const nodeRole = new Map(nodes.map(n => [n.id, n.role]));
  const buildRow = id => {
    const cells = new Array(headerCells.length).fill('');
    cells[idIdx] = id;
    cells[stIdx] = 'pending';
    if (roleIdx >= 0) cells[roleIdx] = nodeRole.get(id) || '';
    return '| ' + cells.join(' | ') + ' |';
  };
  const newRows = missing.map(n => buildRow(n.id)).join('\n');

  const lastRow = rowLines[rowLines.length - 1];
  const lastOffsetInSection = section.lastIndexOf(lastRow);
  const insertAt = ledgerIdx + lastOffsetInSection + lastRow.length;
  const updated = content.slice(0, insertAt) + '\n' + newRows + content.slice(insertAt);
  return { content: updated, added: missing.map(n => n.id), header_normalized: headerNormalized };
}

// #425: rewrite a mis-authored ## Node Ledger header's column names to the canonical `id`/`status`.
// Operates ONLY on the header row's cells, leaving the rule line and data rows byte-identical (the
// data rows are positional — only the column LABELS change). Returns { content, normalized } where
// `normalized` is true iff at least one alias label was rewritten. A no-op (returns the original
// content, normalized:false) when the ledger is absent, has no header, or already declares the
// canonical columns. Fence-aware via the shared locateSection slicer (parity with reconcileLedger).
function normalizeLedgerHeader(content) {
  const { start: ledgerIdx, next: afterLedger } = schema.locateSection(content, schema.LEDGER_HEADING);
  if (ledgerIdx < 0) return { content, normalized: false };
  const sectionEnd = afterLedger >= 0 ? afterLedger : content.length;
  const section = content.slice(ledgerIdx, sectionEnd);

  // Find the first table row (the header) within the section, preserving its exact source text so
  // the splice offsets stay byte-accurate.
  const sectionLines = section.split('\n');
  let headerLine = null;
  for (const ln of sectionLines) {
    if (ln.trim().startsWith('|')) { headerLine = ln; break; }
  }
  if (headerLine === null) return { content, normalized: false };

  const lower = headerLine.split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const hasId = lower.indexOf('id') >= 0;
  const hasStatus = lower.indexOf('status') >= 0;
  if (hasId && hasStatus) return { content, normalized: false };

  // Rewrite each cell whose trimmed/lower-cased label is an id/status alias to the canonical name,
  // preserving the cell's surrounding whitespace. Only rename the FIRST occurrence of each canonical
  // target so two alias cells can't both collapse onto `id`.
  let renamedId = hasId, renamedStatus = hasStatus, changed = false;
  const cells = headerLine.split('|');
  const newCells = cells.map((cell, idx) => {
    if (idx === 0 || idx === cells.length - 1) return cell; // table-edge empties
    const m = cell.match(/^(\s*)(.*?)(\s*)$/);
    const lead = m[1], label = m[2], trail = m[3];
    const lc = label.toLowerCase();
    if (!renamedId && LEDGER_ID_ALIASES.has(lc)) { renamedId = true; changed = true; return lead + 'id' + trail; }
    if (!renamedStatus && LEDGER_STATUS_ALIASES.has(lc)) { renamedStatus = true; changed = true; return lead + 'status' + trail; }
    return cell;
  });
  if (!changed) return { content, normalized: false };
  const newHeaderLine = newCells.join('|');

  // Splice the rewritten header back at its exact source offset.
  const headerOffsetInSection = section.indexOf(headerLine);
  const absStart = ledgerIdx + headerOffsetInSection;
  const updated = content.slice(0, absStart) + newHeaderLine + content.slice(absStart + headerLine.length);
  return { content: updated, normalized: true };
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
    'usage: kaola-gitlab-workflow-plan-validator.js <workflow-plan.md> [--json] [--freeze [--repair]] [--resume-check] [--gate-verify] [--barrier-check [--node-id ID] [--base REF]] [--verdict-check [--node-id ID]] [--selector-check --node-id ID]\n' +
    '  default        validate + print the governance verdict; exit 1 on typed refusal\n' +
    '  --freeze       validate, then write the computed plan_hash into the plan file\n' +
    '  --freeze --repair  also reconcile the ## Node Ledger to ## Nodes (add missing rows as pending; never drop a status) AND normalize a mis-authored ledger header (node/node_id/state -> id/status) before freezing\n' +
    '  --resume-check re-validate library + structure + hash only (not the gate rubric)\n' +
    '  --gate-verify  verify gate EXECUTION over the ## Node Ledger (G1/G2/G3 ran; G3 = a non-delegable main-session-gate is complete — never n/a — and post-dominates completed code nodes); exit 1 if a completed node is uncovered\n' +
    '  --record-base --node-id ID  snapshot the full worktree as node ID\'s per-instance baseline (.cache); run at node start.\n' +
    '                 Idempotent: reuses an existing baseline (resume-safe — a re-dispatch never launders a crashed attempt)\n' +
    '  --drop-base --node-id ID  delete node ID\'s baseline .cache file AND its anchored ref together (reopen/repair cleanup).\n' +
    '                 Idempotent: a missing file/ref is a clean no-op. Prevents a dangling ref tripping barrier_base_mismatch.\n' +
    '  --barrier-check re-scan ACTUAL writes and refuse a sensitive write with no security-reviewer, or an out-of-allowlist\n' +
    '                 write; exit 1 on refusal. Whole-plan (no --node-id): union allowlist, diff vs merge-base of HEAD and\n' +
    '                 --base (default origin/main). Per-node (--node-id ID): the node\'s OWN allowlist, tree-diff vs its recorded\n' +
    '                 node-start snapshot (--base is rejected per-node — the baseline is the recorded snapshot)\n' +
    '  --verdict-check verify that every completed gate-role node\'s .cache evidence file carries verdict:pass/findings_blocking:0;\n' +
    '                 exit 1 on any failure. Per-node (--node-id ID): check one node; non-gate roles self-skip (exit 0).\n' +
    '  --selector-check --node-id ID  check which select arm the selector_source node chose, and compute which arms to mark n/a.\n' +
    '                 Non-selector nodes return ok:true/isSelector:false (never false-blocks). Missing/foreign selector => exit 1.\n' +
    '  --finalize-check  the FINALIZE-TIME gate (#424/#432): (A) chain-receipt gate — a fresh, HEAD-bound, all-green\n' +
    '                 .cache/chain-receipt.json must exist (chains_unverified > chains_stale > chains_red); then (B) attribution\n' +
    '                 sweep — every `git diff <base>...HEAD` change must be in the .md allowband OR a `complete` node\'s declared\n' +
    '                 write set, else unattributed_change. [--base REF (default main)] [--receipt PATH] [--head SHA]\n' +
    '  --parallel-safe --nodes A,B[,C]  read-only check (#437): are the named nodes\' declared write sets pairwise-disjoint\n' +
    '                 (safe to co-open as a lane group)? Exposes the antichain pair-loop (exact-file + classifier disjointness).\n' +
    '                 result:ok | refuse(reason:overlapping_write_sets,overlapping[]). No fs/git writes.\n' +
    '  --group-barrier --group-id ID [--member ID] [--skip-root-pin]  the GROUP-scoped close barrier (#437): diff the group\n' +
    '                 baseline (recorded via --record-base --node-id ID) -> now over the UNION of the lane_group members\'\n' +
    '                 write sets (read from running-set.json); an out-of-union stray refuses via the rank-4 overflow arm.\n'
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
    const out = { result: 'refuse', reason: 'plan_unreadable', operator_hint: getOperatorHint('plan_unreadable'), errors: [`cannot read plan: ${planPath}`] };
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
  if (args.includes('--parallel-safe')) {
    // #437 (D-419 P2, Settlement 3): a READ-ONLY pairwise-disjointness check over a NAMED subset of
    // plan nodes, EXPOSING the EXISTING antichain pair-loop predicates (the exact-file rule at
    // plan-validator.js's antichain loop + classifier.disjointWriteSets for coarse/shared-infra). No
    // fs writes, no baseline, no git diff; pure over the parsed plan + the classifier. Called by
    // adaptive-node open-ready (under KAOLA_LANE_CONTAINMENT) BEFORE co-opening a write lane group:
    // result:'ok' ⇒ the members are safe to co-open; result:'refuse' ⇒ open-ready degrades to a single
    // serial write open. Toggle-agnostic (it does not read the install switch — the caller gates it).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodesArg = flagVal('--nodes');
    if (!nodesArg) {
      const out = { result: 'refuse', reason: 'missing_nodes', operator_hint: getOperatorHint('missing_nodes'), errors: ['--parallel-safe requires --nodes A,B[,C]'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const ids = nodesArg.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length < 2) {
      const out = { result: 'refuse', reason: 'too_few_nodes', operator_hint: getOperatorHint('too_few_nodes'), nodes: ids, errors: ['--parallel-safe needs >= 2 node ids (got ' + ids.length + ')'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const allNodes = parseNodes(content);
    const sel = ids.map(id => allNodes.find(n => n.id === id));
    const missing = ids.filter((id, i) => !sel[i]);
    if (missing.length) {
      const out = { result: 'refuse', reason: 'node_not_found', operator_hint: getOperatorHint('node_not_found', { nodeId: missing[0] }), nodes: ids, errors: ['unknown node ids: ' + missing.join(',')] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    // Pair-loop: exact-file overlap (the antichain RED rule) OR coarse/shared-infra non-green
    // (classifier.disjointWriteSets — the antichain ASK rule). Either ⇒ NOT parallel-safe.
    const overlapping = [];
    for (let i = 0; i < sel.length; i++) {
      for (let j = i + 1; j < sel.length; j++) {
        const A = sel[i], B = sel[j];
        let exact = null;
        for (const p of A.writeSet) if (B.writeSet.has(p)) { exact = p; break; }
        if (exact) { overlapping.push({ a: A.id, b: B.id, kind: 'exact', path: exact }); continue; }
        const dj = classifier.disjointWriteSets([A.writeSet, B.writeSet]);
        if (dj.verdict !== 'green') overlapping.push({ a: A.id, b: B.id, kind: dj.verdict, reasoning: dj.reasoning });
      }
    }
    const ok = overlapping.length === 0;
    const out = { result: ok ? 'ok' : 'refuse', nodes: ids, overlapping };
    if (!ok) { out.reason = 'overlapping_write_sets'; out.operator_hint = getOperatorHint('overlapping_write_sets', { nodes: ids }); }
    process.stdout.write((json ? JSON.stringify(out) : (ok ? 'parallel-safe ok: ' + ids.join(',') : 'typed refusal: overlapping_write_sets (' + overlapping.map(o => o.a + '/' + o.b + ':' + o.kind).join(', ') + ')')) + '\n');
    if (!ok) process.exitCode = 1;
    return;
  }
  if (args.includes('--freeze-checked')) {
    // #408 (#366 deferred): SPAWN 1 of the fused handoff freeze chain (3→2). Validate and return
    // the governance-relevant payload (decision/risk) PLUS the computed planHash, WITHOUT writing.
    // The handoff runs its decision-record governance off this payload, then SPAWN 2
    // (--freeze --governance-ack <planHash>) re-validates, asserts the hash is unchanged, writes
    // atomically, and folds --resume-check into its emission. refuse → same {result:'refuse',errors}.
    const v = validatePlan(content, { root });
    if (v.result !== 'in-grammar') {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'plan_invalid', operator_hint: getOperatorHint('plan_invalid'), errors: v.errors }) : 'typed refusal (out of grammar): ' + (v.errors || []).join('; ')) + '\n');
      process.exitCode = 1; return;
    }
    const out = {
      result: 'in-grammar', decision: v.decision, risk: v.risk, planHash: v.planHash,
      frozen: false, governance: { decision: v.decision, risk: v.risk },
    };
    process.stdout.write((json ? JSON.stringify(out) : `checked (${v.decision}) plan_hash=${v.planHash} (not yet frozen)`) + '\n');
    return;
  }
  if (args.includes('--freeze')) {
    // #308: --freeze --repair reconciles the ## Node Ledger to ## Nodes (adds missing rows
    // as pending, never drops a status) BEFORE freezing. plan_hash excludes the ledger, so
    // the reconcile never moves the hash; plain --freeze stays byte-stable.
    let toFreeze = content;
    let reconciledAdded = [];
    let headerNormalized = false;
    if (args.includes('--repair')) {
      const rec = reconcileLedger(content);
      toFreeze = rec.content;
      reconciledAdded = rec.added;
      // #425: --repair also normalizes a mis-authored ledger header (`node`/`node_id`/`state` -> the
      // canonical `id`/`status`); hash-safe (the ledger is outside plan_hash). Surface it so the
      // operator sees the alias was fixed (the plan would otherwise have bricked open-next).
      headerNormalized = !!rec.header_normalized;
    }
    // #408 (#366 deferred): SPAWN 2 of the fused handoff chain. --governance-ack <planHash> asserts
    // the plan has NOT mutated between SPAWN 1 (--freeze-checked) and the freeze — the planHash the
    // handoff approved must still match the one this content computes. A mismatch (the plan was
    // edited between the two spawns, dodging the governance the operator ack'd) refuses
    // governance_ack_stale with NO write. The ack covers the SAME author-immutable Meta+Nodes the
    // hash covers, so --repair's ledger-only reconcile (hash-neutral) is compatible.
    const ackIdx = args.indexOf('--governance-ack');
    const ackHash = ackIdx >= 0 && ackIdx + 1 < args.length ? args[ackIdx + 1] : null;
    if (ackIdx >= 0) {
      const computed = computePlanHash(toFreeze);
      if (!ackHash || ackHash !== computed) {
        const out = { result: 'refuse', reason: 'governance_ack_stale', operator_hint: getOperatorHint('governance_ack_stale'), frozen: false,
          errors: ['--governance-ack ' + (ackHash || '(missing)') + ' does not match the plan\'s current hash ' + computed + ' — the plan mutated between governance and freeze; re-run --freeze-checked'] };
        process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: governance_ack_stale (' + (ackHash || 'missing') + ' != ' + computed + ')') + '\n');
        process.exitCode = 1; return;
      }
    }
    const r = freezePlan(toFreeze, { root });
    // #389: route the plan_hash-stamping freeze write (also the mid-run plan-repair re-freeze
    // writer that carries a populated ## Node Ledger) through the crash-safe atomic replace.
    // A torn workflow-plan.md would mismatch plan_hash and brick --resume-check with no recovery
    // (#353's verbatim motivating scenario), and the ledger is not covered by any other artifact.
    if (r.frozen) schema.writeFileAtomicReplace(planPath, r.content);
    // #408: FOLD --resume-check into the freeze emission — the freeze already computed the hash it
    // would re-verify, so the handoff's SPAWN 2 needs no separate --resume-check spawn. resumeOk is
    // emitted ONLY when an ack was supplied (the fused handoff path); plain --freeze stays byte-stable.
    let resumeOk;
    if (r.frozen && ackIdx >= 0) {
      const rr = revalidateForResume(r.content, { root });
      resumeOk = !!rr.ok;
    }
    const payload = { result: r.result, decision: r.decision, planHash: r.planHash, frozen: r.frozen, risk: r.risk, errors: r.errors, reconciled: reconciledAdded, header_normalized: headerNormalized };
    if (resumeOk !== undefined) payload.resumeOk = resumeOk;
    process.stdout.write((json ? JSON.stringify(payload) : (r.frozen ? `frozen (${r.decision}) plan_hash=${r.planHash}${reconciledAdded.length ? ' reconciled=' + reconciledAdded.join(',') : ''}${resumeOk !== undefined ? ' resumeOk=' + resumeOk : ''}` : 'typed refusal: ' + (r.errors || []).join('; '))) + '\n');
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
  // #385: a freshness TOKEN file recording the HEAD that was current when this node's baseline was
  // first recorded. The idempotent reuse branch (a crash re-dispatch, a consent-halt re-entry) must
  // REUSE the original baseline — but a stale baseline whose HEAD has since advanced (an unrelated
  // serial write node landed a tracked commit between this node's rollback and its reopen, the
  // #281/#296 trap) silently mis-attributes those foreign writes. We WARN (never refuse) so the
  // legitimate same-HEAD re-dispatch is not bricked. The scheduler drops the base on every rollback.
  const openTokenFile = nid => path.join(path.dirname(path.resolve(planPath)), '.cache', 'barrier-open-' + sanitizeNodeId(nid));
  const headNow = () => { try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { return ''; } };
  if (args.includes('--record-base')) {
    // #239 (v3.21.0): snapshot the full landable worktree as a per-node baseline at NODE START via
    // snapshotWorktree(), anchor it under a ref (anchorBase) so `git gc` cannot prune it before the
    // barrier, and store the anchoring commit SHA in .cache keyed by node-id so the step-4 barrier
    // tree-diffs exactly THIS node's writes. Script-owned, explicit, resume-safe (ref-reachable).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--record-base requires --node-id <id>'] }) : 'typed refusal: --record-base requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    // Idempotent (critic-2): if a baseline already exists for this node (a crash + re-dispatch, or a
    // consent-halt re-entry), REUSE it. Re-snapshotting a now-dirty tree would fold the crashed
    // attempt's writes into a fresh baseline and launder them past the only check that can see them.
    let existing = '';
    try { existing = fs.readFileSync(cacheBaseFile(nodeId), 'utf8').trim(); } catch (_) {}
    if (existing) {
      // #385: REUSE the existing baseline (idempotent), but FLAG it stale when HEAD has advanced
      // since it was recorded. A same-HEAD re-dispatch (a true crash re-entry) is NOT stale and
      // must stay quiet so it is never bricked; a stale base whose token-HEAD !== current HEAD means
      // an intervening tracked commit it would now wrongly attribute to this node. WARN, never
      // refuse — the scheduler reads `reused.stale` and drops the base on every rollback.
      let openHead = '';
      try { openHead = fs.readFileSync(openTokenFile(nodeId), 'utf8').trim(); } catch (_) {}
      const cur = headNow();
      const stale = !!(openHead && cur && openHead !== cur);
      const out = { result: 'ok', nodeId, base: existing, reused: true };
      if (stale) { out.stale = true; out.staleReason = 'head_advanced'; out.recordedHead = openHead; out.currentHead = cur; }
      process.stdout.write((json ? JSON.stringify(out) : 'reused base ' + existing + ' for node ' + nodeId + (stale ? ' (WARN: stale — head advanced ' + openHead + '->' + cur + ')' : '')) + '\n');
      return;
    }
    const baseTree = snapshotWorktree(root, nodeId);
    const baseCommit = anchorBase(root, barrierRef(nodeId), baseTree);
    fs.mkdirSync(path.dirname(cacheBaseFile(nodeId)), { recursive: true });
    fs.writeFileSync(cacheBaseFile(nodeId), baseCommit);
    // #385: stamp the freshness token = the HEAD at first record. The reuse branch compares this
    // against the live HEAD to detect a baseline that predates an intervening tracked commit.
    fs.writeFileSync(openTokenFile(nodeId), headNow() + '\n');
    process.stdout.write((json ? JSON.stringify({ result: 'ok', nodeId, base: baseCommit }) : 'recorded base ' + baseCommit + ' for node ' + nodeId) + '\n');
    return;
  }
  if (args.includes('--drop-base')) {
    // #368: delete a node's baseline FILE and its anchored REF together so reopen/repair never
    // leaves a dangling ref (which would later trip --barrier-check's barrier_base_mismatch) or a
    // file pointing at a pruned commit. Idempotent: a missing file/ref is a clean no-op success.
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--drop-base requires --node-id <id>'] }) : 'typed refusal: --drop-base requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    // #424 (D-424-01) WINDOW-LOCK: --drop-base is honored ONLY pre-open (ledger status `pending`).
    // Once the node is `in_progress`, dropping the baseline launders any write made since the open
    // (the next --barrier-check sees an empty diff and passes vacuously). Refuse `drop_base_window_open`
    // mid-node; the legal stale-baseline recovery is ledger-reset → `pending` → drop → fresh open.
    const dropLedger = parseLedger(content);
    if (dropLedger.get(nodeId) === 'in_progress') {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'drop_base_window_open', operator_hint: getOperatorHint('drop_base_window_open', { nodeId }), errors: ['--drop-base refused: node "' + nodeId + '" is in_progress — dropping the baseline now would launder writes made since the open (vacuous-pass). Reset the node to pending before dropping (ledger-reset → pending → drop → fresh open).'] }) : 'typed refusal: drop_base_window_open (node ' + nodeId + ' is in_progress)') + '\n');
      process.exitCode = 1; return;
    }
    let fileRemoved = false;
    try { fs.unlinkSync(cacheBaseFile(nodeId)); fileRemoved = true; } catch (_) {}
    let refRemoved = false;
    try { execFileSync('git', ['-C', root, 'update-ref', '-d', barrierRef(nodeId)], { stdio: ['ignore', 'ignore', 'ignore'] }); refRemoved = true; } catch (_) {}
    // #385: drop the freshness token too, so a fresh re-record after a rollback re-stamps the
    // open-HEAD (and the next reuse compares against the NEW open event, not a stale one).
    try { fs.unlinkSync(openTokenFile(nodeId)); } catch (_) {}
    process.stdout.write((json ? JSON.stringify({ result: 'ok', nodeId, fileRemoved, refRemoved }) : 'dropped base for node ' + nodeId + ' (file=' + fileRemoved + ', ref=' + refRemoved + ')') + '\n');
    return;
  }
  if (args.includes('--barrier-check')) {
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    // Robustness: a PRESENT but empty `--node-id` is a malformed per-node invocation, not whole-plan.
    if (args.includes('--node-id') && !nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--node-id requires a value'] }) : 'typed refusal: --node-id requires a value') + '\n');
      process.exitCode = 1; return;
    }
    // #424 (D-424-01) ROOT-PINNING: the write-set paths resolve repo-root-relative, but the barrier
    // reads process.cwd()-relative git state. In a worktree whose CWD is not the repo toplevel the two
    // diverge and a path is measured against the wrong root (silent mis-attribution). Refuse
    // `root_mismatch` when process.cwd() !== `git rev-parse --show-toplevel`. Fails CLOSED: an empty /
    // errored rev-parse is treated as a mismatch. Opt-out for tests/callers that resolve the plan from
    // outside the repo CWD on purpose via --skip-root-pin (the per-node baseline is still ref-anchored).
    if (!args.includes('--skip-root-pin')) {
      let toplevel = '';
      try { toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: process.cwd() }).trim(); } catch (_) { toplevel = ''; }
      const cwdReal = (() => { try { return fs.realpathSync(process.cwd()); } catch (_) { return process.cwd(); } })();
      const topReal = toplevel ? (() => { try { return fs.realpathSync(toplevel); } catch (_) { return toplevel; } })() : '';
      if (!topReal || topReal !== cwdReal) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'root_mismatch', operator_hint: getOperatorHint('root_mismatch'), errors: ['barrier root mismatch: process.cwd() "' + cwdReal + '" != git toplevel "' + (topReal || '(unresolved)') + '" — run the barrier from the repo toplevel so write-set paths and the baseline diff measure against ONE root'] }) : 'typed refusal: root_mismatch (cwd ' + cwdReal + ' != toplevel ' + (topReal || 'unresolved') + ')') + '\n');
        process.exitCode = 1; return;
      }
    }
    let actualPaths;
    if (nodeId) {
      // PER-NODE (#239, v3.21.0): tree-diff the CURRENT full-worktree snapshot against THIS node's
      // recorded node-start snapshot — exactly this node's own changes, checked against its OWN
      // declared set. --base is REJECTED here: the baseline is the recorded snapshot, and honoring a
      // caller --base (e.g. `--base HEAD` after the node committed) would empty the diff and neuter
      // the gate. The whole-plan / phase-6 branch keeps --base.
      if (args.includes('--base')) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'invalid_args', operator_hint: getOperatorHint('invalid_args'), errors: ['--base is not allowed with --node-id (per-node diffs vs the recorded node-start snapshot)'] }) : 'typed refusal: --base is not allowed with --node-id') + '\n');
        process.exitCode = 1; return;
      }
      let base = '';
      try { base = fs.readFileSync(cacheBaseFile(nodeId), 'utf8').trim(); } catch (_) { base = ''; }
      if (!base) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'no_barrier_base', operator_hint: getOperatorHint('no_barrier_base', { nodeId }), errors: ['no recorded per-node base for "' + nodeId + '" (run --record-base --node-id at node start)'] }) : 'typed refusal: no recorded per-node base for ' + nodeId) + '\n');
        process.exitCode = 1; return;
      }
      // #368: cross-check the .cache base file against the gc-anchored ref. --record-base writes
      // BOTH (the file SHA and refs/kaola-workflow/barrier/<proj>/<id>). Overwriting the file with
      // the SHA of a fresh current-tree snapshot would empty the node's diff and neuter the ONLY
      // check that sees a node's actual writes — and unlike the warn-first dispatch log this gates a
      // BLOCKING check. The cross-check is nearly free (the ref already exists). Refuse
      // barrier_base_mismatch when the ref is missing while the file exists, or the SHAs disagree.
      let refSha = '';
      try { refSha = execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', barrierRef(nodeId) + '^{commit}'], { encoding: 'utf8' }).trim(); } catch (_) { refSha = ''; }
      if (!refSha) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'barrier_base_mismatch', operator_hint: getOperatorHint('barrier_base_mismatch', { nodeId }), errors: ['anchored baseline ref missing for "' + nodeId + '" while a .cache base file exists — run --drop-base then --record-base, or restore the ref; note: a fresh re-record after work was done would launder the crashed attempt, so prefer ref-restore where work exists'] }) : 'typed refusal: barrier_base_mismatch (anchored ref missing for ' + nodeId + ')') + '\n');
        process.exitCode = 1; return;
      }
      if (refSha !== base) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'barrier_base_mismatch', operator_hint: getOperatorHint('barrier_base_mismatch', { nodeId }), errors: ['.cache base SHA for "' + nodeId + '" does not match the anchored ref (file ' + base + ' != ref ' + refSha + ') — run --drop-base then --record-base, or restore the ref; note: a fresh re-record after work was done would launder the crashed attempt, so prefer ref-restore where work exists'] }) : 'typed refusal: barrier_base_mismatch for ' + nodeId) + '\n');
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
    const r = barrierCheck(content, actualPaths, { nodeId: nodeId || undefined, root, project: projTag });
    process.stdout.write((json ? JSON.stringify(r) : (r.result === 'pass' ? 'barrier ok' : 'typed refusal: ' + r.errors.join('; '))) + '\n');
    if (r.result !== 'pass') process.exitCode = 1;
    return;
  }
  if (args.includes('--group-barrier')) {
    // #437 (D-419 P2, Settlement 4): the GROUP-SCOPED close barrier. Runs ONCE at the LAST group
    // member's close (adaptive-node close-node, under KAOLA_LANE_CONTAINMENT). Mirrors the per-node
    // --barrier-check mechanics (root-pin + ref-anchored baseline + #368 mismatch cross-check + tree
    // diff) but keyed by a GROUP id and scoped to the UNION over the group members' write sets. Reads
    // running-set.json to learn the lane_group's members + the group baseline SHA. The barrier diffs
    // the group baseline → now and refuses any path in NO member's set via the EXISTING rank-4
    // outOfAllow arm (no new reason code). Toggle-agnostic — invoked only because adaptive-node (under
    // the flag) chose to call it.
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const groupId = flagVal('--group-id');
    if (!groupId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_group_id', operator_hint: getOperatorHint('missing_group_id'), errors: ['--group-barrier requires --group-id <id>'] }) : 'typed refusal: --group-barrier requires --group-id') + '\n');
      process.exitCode = 1; return;
    }
    // ROOT-PINNING (same fail-closed guard as --barrier-check): the write-set paths resolve
    // repo-root-relative while git state is process.cwd()-relative; run from the repo toplevel so they
    // measure against ONE root. Opt out with --skip-root-pin for callers resolving the plan externally.
    if (!args.includes('--skip-root-pin')) {
      let toplevel = '';
      try { toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: process.cwd() }).trim(); } catch (_) { toplevel = ''; }
      const cwdReal = (() => { try { return fs.realpathSync(process.cwd()); } catch (_) { return process.cwd(); } })();
      const topReal = toplevel ? (() => { try { return fs.realpathSync(toplevel); } catch (_) { return toplevel; } })() : '';
      if (!topReal || topReal !== cwdReal) {
        process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'root_mismatch', operator_hint: getOperatorHint('root_mismatch'), errors: ['barrier root mismatch: process.cwd() "' + cwdReal + '" != git toplevel "' + (topReal || '(unresolved)') + '" — run the group barrier from the repo toplevel so write-set paths and the baseline diff measure against ONE root'] }) : 'typed refusal: root_mismatch (cwd ' + cwdReal + ' != toplevel ' + (topReal || 'unresolved') + ')') + '\n');
        process.exitCode = 1; return;
      }
    }
    // Read running-set.json (project-local .cache, beside the plan) to learn the live lane_group.
    const rsPath = path.join(path.dirname(path.resolve(planPath)), '.cache', schema.RUNNING_SET_NAME);
    let rs = null;
    try { rs = JSON.parse(fs.readFileSync(rsPath, 'utf8')); } catch (_) { rs = null; }
    if (!rs || typeof rs !== 'object') {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'running_set_unreadable', operator_hint: getOperatorHint('running_set_unreadable'), errors: ['cannot read/parse running-set.json at ' + rsPath + ' — the group barrier needs the live lane_group'] }) : 'typed refusal: running_set_unreadable') + '\n');
      process.exitCode = 1; return;
    }
    const lg = rs.lane_group;
    if (!lg || lg.group_id !== groupId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'group_not_found', operator_hint: getOperatorHint('group_not_found', { nodeId: groupId }), errors: ['no live lane_group "' + groupId + '" in running-set.json (found: ' + (lg ? lg.group_id : 'none') + ')'] }) : 'typed refusal: group_not_found (' + groupId + ')') + '\n');
      process.exitCode = 1; return;
    }
    // Members for the union allowlist = the lane_group members (the LAST-member close runs the barrier
    // while lg.members STILL holds the full set, per the design ordering), UNIONed with an optional
    // explicit --member fallback (for the alternate "remove-then-barrier" ordering).
    const members = Array.from(new Set([...(Array.isArray(lg.members) ? lg.members : []), flagVal('--member')].filter(Boolean)));
    if (!members.length) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'group_not_found', operator_hint: getOperatorHint('group_not_found', { nodeId: groupId }), errors: ['lane_group "' + groupId + '" has no members'] }) : 'typed refusal: group_not_found (no members)') + '\n');
      process.exitCode = 1; return;
    }
    // Group baseline: the shared SHA recorded at open via --record-base --node-id <group_id>. Same
    // #368 cross-check as the per-node barrier — the .cache file SHA must match the gc-anchored ref, or
    // a fresh re-record would launder writes made since open into an empty diff (vacuous pass).
    let base = '';
    try { base = fs.readFileSync(cacheBaseFile(groupId), 'utf8').trim(); } catch (_) { base = ''; }
    if (!base) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'no_group_base', operator_hint: getOperatorHint('no_group_base', { nodeId: groupId }), errors: ['no recorded group baseline for "' + groupId + '" (run --record-base --node-id <group_id> at group open)'] }) : 'typed refusal: no_group_base for ' + groupId) + '\n');
      process.exitCode = 1; return;
    }
    let refSha = '';
    try { refSha = execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', barrierRef(groupId) + '^{commit}'], { encoding: 'utf8' }).trim(); } catch (_) { refSha = ''; }
    if (!refSha || refSha !== base) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'barrier_base_mismatch', operator_hint: getOperatorHint('barrier_base_mismatch', { nodeId: groupId }), errors: ['group baseline for "' + groupId + '" mismatches the anchored ref (file ' + base + ' != ref ' + (refSha || '(missing)') + ') — run --drop-base then --record-base for the group, or restore the ref'] }) : 'typed refusal: barrier_base_mismatch for group ' + groupId) + '\n');
      process.exitCode = 1; return;
    }
    const now = snapshotWorktree(root, groupId + '-now');
    const diffOut = execFileSync('git', ['-C', root, 'diff-tree', '-r', '--name-only', base, now], { encoding: 'utf8' });
    const actualPaths = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
    const r = barrierCheck(content, actualPaths, { groupMembers: members, root, project: projTag });
    process.stdout.write((json ? JSON.stringify(r) : (r.result === 'pass' ? 'group barrier ok' : 'typed refusal: ' + r.errors.join('; '))) + '\n');
    if (r.result !== 'pass') process.exitCode = 1;
    return;
  }
  if (args.includes('--finalize-check')) {
    // #424 (D-424-01) part 3 + #432 (D-432-01) part 3: the FINALIZE-TIME gate. Runs ONLY at
    // finalization (cmdFinalize), never per-node. Two coupled checks, precedence-ordered:
    //   (A) chain-receipt gate (#432): a machine-verifiable `.cache/chain-receipt.json` bound to HEAD
    //       must exist, be fresh, and be all-green-or-waived — prose "all four chains green" can no
    //       longer pass.  chains_unverified > chains_stale > chains_red.
    //   (B) attribution sweep (#424): every file changed since the branch diverged from main must be
    //       either in the narrow allowband OR covered by a `complete` node's declared write set; an
    //       orphan (crash residue, out-of-window edit) surfaces as `unattributed_change`.
    // The chain-receipt gate runs FIRST (an unverified/stale/red chain set is the higher-precedence
    // finalize blocker). `--base` overrides the integration branch (default main); `--receipt` and
    // `--head` override the receipt path / current-HEAD probe (test seams).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const cacheDir = path.join(path.dirname(path.resolve(planPath)), '.cache');
    // ---- (A) chain-receipt gate (#432) ----
    const receiptPath = flagVal('--receipt') || path.join(cacheDir, 'chain-receipt.json');
    let receiptRaw = null;
    try { receiptRaw = fs.readFileSync(receiptPath, 'utf8'); } catch (_) { receiptRaw = null; }
    if (receiptRaw == null) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'chains_unverified', operator_hint: getOperatorHint('chains_unverified'), errors: ['no chain receipt at ' + receiptPath + ' — run kaola-gitlab-workflow-run-chains.js after the LAST commit so HEAD is covered; prose "all four chains green" cannot pass'] }) : 'typed refusal: chains_unverified (no ' + receiptPath + ')') + '\n');
      process.exitCode = 1; return;
    }
    let receipt = null;
    try { receipt = JSON.parse(receiptRaw); } catch (_) { receipt = null; }
    if (!receipt || typeof receipt !== 'object') {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'chains_unverified', operator_hint: getOperatorHint('chains_unverified'), errors: ['chain receipt at ' + receiptPath + ' is unparseable JSON — regenerate it'] }) : 'typed refusal: chains_unverified (unparseable receipt)') + '\n');
      process.exitCode = 1; return;
    }
    const currentHead = flagVal('--head') || (() => { try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { return ''; } })();
    if (!currentHead || String(receipt.headSha || '').trim() !== currentHead) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'chains_stale', operator_hint: getOperatorHint('chains_stale'), errors: ['chain receipt headSha "' + (receipt.headSha || '(missing)') + '" != current HEAD "' + (currentHead || '(unresolved)') + '" — the tree advanced since the chains ran; regenerate the receipt over HEAD'] }) : 'typed refusal: chains_stale (' + (receipt.headSha || 'missing') + ' != ' + (currentHead || 'unresolved') + ')') + '\n');
      process.exitCode = 1; return;
    }
    const chains = Array.isArray(receipt.chains) ? receipt.chains : [];
    const redChains = chains.filter(c => c && c.exitCode !== 0 && c.accepted_red !== true);
    if (redChains.length) {
      const names = redChains.map(c => c.name || '(unnamed)').join(', ');
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'chains_red', operator_hint: getOperatorHint('chains_red'), redChains: redChains.map(c => ({ name: c.name || null, exitCode: c.exitCode })), errors: ['chain(s) RED with no waiver: ' + names + ' — fix the chain or waive it explicitly (--accept-known-red <name>:<open-issue>)'] }) : 'typed refusal: chains_red (' + names + ')') + '\n');
      process.exitCode = 1; return;
    }
    // ---- (B) attribution sweep (#424) ----
    // Enumerate every file changed since the branch diverged from main (`git diff <base>...HEAD`).
    const base = flagVal('--base') || 'main';
    let changed = [];
    try {
      const diffOut = execFileSync('git', ['-C', root, 'diff', base + '...HEAD', '--name-only'], { encoding: 'utf8' });
      changed = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
    } catch (e) {
      // Fail CLOSED: a git failure (no such base, detached) is a refusal, not a silent pass.
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'unattributed_change', operator_hint: getOperatorHint('unattributed_change'), errors: ['attribution sweep could not enumerate `git diff ' + base + '...HEAD` (' + (e && e.message ? e.message.split('\n')[0] : 'git error') + ') — cannot prove every change is attributed'] }) : 'typed refusal: attribution sweep git error') + '\n');
      process.exitCode = 1; return;
    }
    const nodes = parseNodes(content);
    const ledger = parseLedger(content);
    // A path is ATTRIBUTED if it is in the narrow allowband OR covered by a `complete` node's declared
    // write set. The declared set unions only COMPLETE nodes (a pending/n-a node never ran).
    const completeDeclared = new Set();
    for (const n of nodes) {
      if (ledger.get(n.id) === 'complete') for (const p of (n.writeSet || [])) completeDeclared.add(p);
    }
    const unattributed = changed.filter(p =>
      !isBarrierInvisible(p, projTag) && !/^kaola-workflow\//.test(p) && !completeDeclared.has(p));
    if (unattributed.length) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'unattributed_change', operator_hint: getOperatorHint('unattributed_change'), unattributed, errors: ['branch-level writes (' + unattributed.join(', ') + ') are neither in the .md allowband nor covered by any `complete` node\'s declared write set — crash residue or out-of-window edits; attribute them to a node or remove them'] }) : 'typed refusal: unattributed_change (' + unattributed.join(', ') + ')') + '\n');
      process.exitCode = 1; return;
    }
    process.stdout.write((json ? JSON.stringify({ result: 'pass', checkedChanges: changed.length, chains: chains.map(c => ({ name: c.name || null, exitCode: c.exitCode, accepted_red: c.accepted_red === true })) }) : 'finalize ok (' + changed.length + ' changes attributed, ' + chains.length + ' chains verified)') + '\n');
    return;
  }
  if (args.includes('--node-end')) {
    // #366: FUSED per-node end-of-node check — barrier-check + gate-verify + verdict-check +
    // selector-check in ONE process / ONE plan parse, emitting the SAME per-check payloads keyed in
    // one envelope (back-compat: commit-node's per-node end-mode reads barrierCheck/gateVerify/
    // verdictCheck/selectorCheck). Replaces four separate validator spawns with one. selector-check
    // runs only when the node IS a selector source (cheap non-selector short-circuit otherwise).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--node-end requires --node-id <id>'] }) : 'typed refusal: --node-end requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    // (1) per-node barrier — same logic + #368 cross-check as --barrier-check --node-id.
    let barrierCheckOut;
    let base = '';
    try { base = fs.readFileSync(cacheBaseFile(nodeId), 'utf8').trim(); } catch (_) { base = ''; }
    if (!base) {
      barrierCheckOut = { result: 'refuse', reason: 'no_barrier_base', operator_hint: getOperatorHint('no_barrier_base', { nodeId }), errors: ['no recorded per-node base for "' + nodeId + '" (run --record-base --node-id at node start)'] };
    } else {
      let refSha = '';
      try { refSha = execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', barrierRef(nodeId) + '^{commit}'], { encoding: 'utf8' }).trim(); } catch (_) { refSha = ''; }
      if (!refSha) {
        barrierCheckOut = { result: 'refuse', reason: 'barrier_base_mismatch', operator_hint: getOperatorHint('barrier_base_mismatch', { nodeId }), errors: ['anchored baseline ref missing for "' + nodeId + '" while a .cache base file exists — run --drop-base then --record-base, or restore the ref; note: a fresh re-record after work was done would launder the crashed attempt, so prefer ref-restore where work exists'] };
      } else if (refSha !== base) {
        barrierCheckOut = { result: 'refuse', reason: 'barrier_base_mismatch', operator_hint: getOperatorHint('barrier_base_mismatch', { nodeId }), errors: ['.cache base SHA for "' + nodeId + '" does not match the anchored ref (file ' + base + ' != ref ' + refSha + ') — run --drop-base then --record-base, or restore the ref; note: a fresh re-record after work was done would launder the crashed attempt, so prefer ref-restore where work exists'] };
      } else {
        const now = snapshotWorktree(root, nodeId + '-now');
        const diffOut = execFileSync('git', ['-C', root, 'diff-tree', '-r', '--name-only', base, now], { encoding: 'utf8' });
        const actualPaths = diffOut.split('\n').map(s => s.trim()).filter(Boolean);
        barrierCheckOut = barrierCheck(content, actualPaths, { nodeId, root, project: projTag });
      }
    }
    // (2) gate-verify (informational at the per-node level — commit-node tags it so).
    const gateVerifyOut = verifyGateExecution(content, { root });
    // (3) verdict-check (informational per-node).
    const cacheDir = path.join(path.dirname(path.resolve(planPath)), '.cache');
    const readCache = fileName => { try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; } };
    const globCache = prefix => { try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; } };
    const verdictCheckOut = verifyVerdictBlock(content, { nodeId, readCache, globCache });
    // (4) selector-check — only when this node is a selector_source (else cheap isSelector:false).
    let selectorCheckOut;
    {
      const nodes = parseNodes(content);
      const arms = nodes.filter(n => n.selectorSource === nodeId);
      if (!arms.length) {
        selectorCheckOut = { ok: true, isSelector: false, armsToNa: [] };
      } else {
        const group = arms[0].shape.group;
        let cacheText = null;
        try { cacheText = fs.readFileSync(path.join(cacheDir, nodeId + '.md'), 'utf8'); } catch (_) { cacheText = null; }
        const parsed = schema.parseNodeSelector(cacheText || '');
        if (!parsed.found) {
          selectorCheckOut = { ok: false, isSelector: true, errors: [`selector_source "${nodeId}" produced no selector: line`] };
        } else if (!arms.map(a => a.id).includes(parsed.selector)) {
          selectorCheckOut = { ok: false, isSelector: true, errors: [`selector "${parsed.selector}" is not an arm of select group "${group}" (${arms.map(a => a.id).join(', ')})`] };
        } else {
          selectorCheckOut = { ok: true, isSelector: true, selected: parsed.selector, group, armsToNa: arms.map(a => a.id).filter(id => id !== parsed.selector) };
        }
      }
    }
    const out = {
      result: 'ok', mode: 'node-end', nodeId,
      barrierCheck: barrierCheckOut,
      gateVerify: gateVerifyOut,
      verdictCheck: verdictCheckOut,
      selectorCheck: selectorCheckOut,
    };
    process.stdout.write(JSON.stringify(out) + '\n');
    // The validator EMITS the fused data; the consumer (commit-node) computes overallOk + exit.
    return;
  }
  if (args.includes('--selector-check')) {
    // #263: mechanical n/a computation for Classify-And-Act selective execution.
    // Inputs: plan path, --node-id <selector_source-id>. Non-selector nodes return ok:true/isSelector:false
    // (never false-blocks a normal commit). Missing/foreign selector => result:'refuse'/exit 1 (fail-closed).
    // #406 Class-C: the standalone --selector-check REFUSE paths emit the canonical {result:'refuse',
    // reason, errors} envelope (the only deliberate consumer change — the 2 walkthrough scJson.ok===false
    // asserts flip to result==='refuse'). The SUCCESS shapes keep `ok:true` (commit-node's legacy-fallback
    // selectorCheck.ok===true read), and the FUSED --node-end selectorCheckOut keeps `ok` too (unmigrated).
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (!nodeId) {
      const out = { result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--selector-check requires --node-id <id>'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: --selector-check requires --node-id') + '\n');
      process.exitCode = 1; return;
    }
    const nodes = parseNodes(content);
    if (!nodes.length) {
      const out = { result: 'refuse', reason: 'nodes_unparseable', operator_hint: getOperatorHint('nodes_unparseable'), errors: ['plan has no parseable ## Nodes table'] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      const out = { result: 'refuse', reason: 'node_not_found', operator_hint: getOperatorHint('node_not_found', { nodeId }), errors: [`--node-id "${nodeId}" not found in the frozen plan`] };
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
      const out = { result: 'refuse', reason: 'no_selector_line', operator_hint: getOperatorHint('no_selector_line', { nodeId }), isSelector: true, errors: [`selector_source "${nodeId}" produced no selector: line`] };
      process.stdout.write((json ? JSON.stringify(out) : 'typed refusal: ' + out.errors[0]) + '\n');
      process.exitCode = 1; return;
    }
    const selected = parsed.selector;
    const armIds = arms.map(a => a.id);
    // FAIL-CLOSED: selector names an id not among the arms (foreign).
    if (!armIds.includes(selected)) {
      const out = { result: 'refuse', reason: 'foreign_selector', operator_hint: getOperatorHint('foreign_selector', { selector: selected }), isSelector: true, errors: [`selector "${selected}" is not an arm of select group "${group}" (${armIds.join(', ')})`] };
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
      // #406 Class-C: arg-error refuses with the canonical {result:'refuse', reason} envelope.
      process.stdout.write((json ? JSON.stringify({ result: 'refuse', reason: 'missing_node_id', operator_hint: getOperatorHint('missing_node_id'), errors: ['--node-id requires a value'] }) : 'typed refusal: --node-id requires a value') + '\n');
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
    const out = { result: 'refuse', reason: 'internal_error', operator_hint: getOperatorHint('internal_error'), errors: ['validator internal error: ' + err.message] };
    process.stdout.write((json ? JSON.stringify(out) : 'typed refusal (out of grammar): ' + out.errors[0]) + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  validatePlan,
  revalidateForResume,
  freezePlan,
  reconcileLedger,
  computePlanHash,
  readStoredHash,
  parseNodes,
  parseLabels,
  parseGoal,
  parseLedger,
  uniqueSink,
  gateUncovered,
  verifyGateExecution,
  verifyVerdictBlock,
  barrierCheck,
  installedRoles,
  ROLE_TOKEN_REGISTRY,
  isBarrierInvisible,
};
