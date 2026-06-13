evidence-binding: n1-design 06699e8abc2c

# D-437-01 — Lane-Group Co-Open + Group-Scoped Close Barrier (Design)

Issue #437 / D-419 Part 2. This is the SINGLE SOURCE OF TRUTH for the implement nodes
n2 (plan-validator), n3 (adaptive-node), n4 (parallel-batch). Implementers MUST NOT re-derive
the brief — everything needed is here.

`design-decision: group-scoped close barrier replaces per-member serial barrier under KAOLA_LANE_CONTAINMENT`
`design-decision: parallel-safe is a new validator CLI flag exposing the existing antichain pair-loop`

All 3 touched scripts are GENERATED_AGGREGATORS (verified at edition-sync.js:46-56). The new
behavior is gated EXCLUSIVELY on `resolveLaneContainment(process.env)` (adaptive-schema.js:352).
Flag OFF ⇒ byte-identical to today (INV-6, proven per-file in §8).

--------------------------------------------------------------------------------
## 0. Anchors verified in the tree (so implementers don't re-read)

- `resolveLaneContainment(env)` — adaptive-schema.js:352. Returns true ONLY for env value
  `'1'|'true'|'yes'`; else false. The schema is the ×4 byte-identical drift anchor — NO new
  constant goes here unless byte-identical across editions (and it doesn't need to: see §1).
- `RUNNING_SET_NAME = 'running-set.json'` — adaptive-schema.js:92 (already exported, already imported
  by adaptive-node.js:44). The lane group lives INSIDE this same file (one new top-level key), so NO
  new schema constant and NO new file is introduced.
- `barrierCheck(content, actualPaths, opts)` — plan-validator.js:658. PURE, toggle-agnostic, exported
  (plan-validator.js:2097). `opts.nodeId` ⇒ per-node allowlist (the node's OWN writeSet);
  no `opts.nodeId` ⇒ WHOLE-PLAN union allowlist. The group barrier reuses the WHOLE-PLAN-style
  union semantics but scoped to a SUBSET of nodes (the group members) — see §4.
- `unattributed_write` precedence rank-4 — the out-of-allowlist arm at plan-validator.js:708-711
  (`outOfAllow = production.filter(p => !declared.has(p))`). The ADR's "no fifth reason" is correct:
  the group barrier REUSES this exact arm. NO new reason code.
- antichain pair-loop (the parallel-safe disjoint check) — plan-validator.js:1155-1183. EXACT-file
  overlap ⇒ RED (1168-1172); coarse/shared-infra ⇒ `classifier.disjointWriteSets([A,B])` (1180).
  `--parallel-safe` exposes a 2-node subset of THIS logic (§3).
- `classifier.disjointWriteSets(nodeWriteSets)` — classifier.js:327. red/yellow/green verdict.
- per-node baseline helpers (plan-validator CLI scope, defined inside main() ~1682-1694):
  `cacheBaseFile(nid)`, `barrierRef(nid)`, `openTokenFile(nid)`, `snapshotWorktree(root,tag)`
  (1525), `anchorBase(root,refName,tree)` (1549), `headNow()`. The group baseline reuses
  `cacheBaseFile`/`barrierRef`/`anchorBase` keyed by a GROUP id string (§1, §4).
- adaptive-node shells the validator/commit-node WITHOUT a custom env (shellNode at :150 uses
  `execFileSync('node', …)` with NO `env:` option ⇒ inherits process.env). So a subprocess sees the
  SAME `KAOLA_LANE_CONTAINMENT`. The group barrier in plan-validator/commit-node is itself
  toggle-agnostic (it runs only because adaptive-node, under the flag, chose to invoke it).

--------------------------------------------------------------------------------
## 1. SETTLEMENT 1 — Lane Group in running-set.json

### 1.1 Schema extension (additive, OUTSIDE plan_hash)

`running-set.json` today (top-level): `{ state, max_concurrent, nodes: [...], updatedAt? }`.
Each node entry: `{ id, role, kind, declared_write_set, model, baseline, opening?, openedAt? }`.

ADD ONE optional top-level key `lane_group` (singular — at most one write lane group is live at a
time; a write group runs ALONE, exactly as a single write node does today). Shape:

```json
{
  "state": "open",
  "max_concurrent": 8,
  "lane_group": {
    "group_id": "lg-n2a-n2b",
    "members": ["n2a", "n2b"],
    "baseline": "<commit-sha>",
    "write_union": ["scripts/x.js", "scripts/y.js", "plugins/.../x.js"],
    "openedAt": "2026-06-13T10:12:00.000Z"
  },
  "nodes": [
    { "id": "n2a", "role": "tdd-guide", "kind": "write", "group_id": "lg-n2a-n2b",
      "declared_write_set": "scripts/x.js", "model": "opus", "baseline": "recorded" },
    { "id": "n2b", "role": "tdd-guide", "kind": "write", "group_id": "lg-n2a-n2b",
      "declared_write_set": "scripts/y.js", "model": "opus", "baseline": "recorded" }
  ]
}
```

Field-by-field:
- `group_id` (string): `'lg-' + members.sort().join('-')`, sanitized for ref/file keys by the SAME
  `String(x).replace(/[^A-Za-z0-9_-]/g,'_')` rule `cacheBaseFile`/`barrierRef` already apply. Stable
  & deterministic ⇒ a crash-resume reconstructs the same id.
- `members` (string[]): the co-opened node ids, sorted, length ≥ 2.
- `baseline` (string): ONE shared baseline commit SHA captured at group-open time via
  `snapshotWorktree(root, group_id)` + `anchorBase(root, barrierRef(group_id), tree)`. Written to
  `cacheBaseFile(group_id)` + anchored ref `barrierRef(group_id)` + `openTokenFile(group_id)` — i.e.
  a GROUP reuses the per-node baseline machinery, keyed by `group_id` instead of a node id. This is
  the diff anchor for the group barrier (§4).
- `write_union` (string[]): the union of every member's parsed declared_write_set, recorded at open
  time so the group barrier and the crash-resume both have it without re-parsing (the plan rows ARE
  authoritative; this is a convenience snapshot — the group barrier re-reads the plan for attribution,
  see §4, so a tampered union here cannot weaken the gate).
- each node entry gains `group_id` (string) tying it to the group (so close-node knows it is a member
  and which group). Members keep their OWN `declared_write_set` (per-member attribution depends on it).

`max_concurrent` continues to mean what #436 made it mean; a write lane group respects it as a single
unit (the group opens ≤ max_concurrent members; default cap path = FANOUT_CAP write cap, see §1.3).

### 1.2 WHERE it is written — open-ready (adaptive-node runOpenReady)

NEW arm in `runOpenReady` (adaptive-node.js:2490), gated on `resolveLaneContainment(process.env)`.
The arm is reached ONLY when: flag ON, the running set is empty of writes, AND the ready frontier has
≥ 2 write nodes that form an antichain with disjoint write sets.

Current control flow (flag OFF — UNCHANGED):
```
readOnly = frontier.filter(isReadOnlyNode)
writeNodes = frontier.filter(!isReadOnlyNode)
if (readOnly.length > 0) → fan out read-only            // unchanged
else if (liveNodes.length===0 && writeNodes.length>0) → open ONE write node  // serial, isolated
else → write_awaits_drain
```

NEW control flow (the ONLY structural change), inserted in the `else if` write branch:
```
} else if (liveNodes.length === 0 && writeNodes.length > 0) {
  const containment = resolveLaneContainment(process.env);              // NEW
  if (containment && writeNodes.length >= 2) {                          // NEW arm
    // attempt a co-open lane group from the write frontier (§1.3)
    const grp = tryFormLaneGroup(writeNodes, planPath, shell);          // NEW helper
    if (grp.ok) { toOpen = grp.members; openKind = 'write'; groupForm = grp; }
    else        { toOpen = [writeNodes[0]]; openKind = 'write'; }       // degrade to serial
  } else {
    toOpen = [writeNodes[0]]; openKind = 'write';                       // EXISTING line, unchanged
  }
}
```

When `groupForm` is set, the Phase-1/2/3 running-set writer (currently building `openingSet`/`finalSet`)
ALSO:
- records the SHARED group baseline ONCE before per-member baselines:
  `shell(validatorPath, [planPath, '--record-base', '--node-id', groupForm.group_id, '--json'])`
  (record-base is idempotent + ref-anchored; keying by group_id is byte-compatible with its sanitizer).
- still records each member's per-member baseline via `commit-node --start` (members keep their own
  baseline for crash-reconcile drop, mirroring §existing). The GROUP baseline is the diff anchor for
  the close barrier; the per-member baselines are retained only for reconcile cleanup (drop on
  rollback) and are NOT used by the group barrier.
- sets `openingSet.lane_group = { group_id, members: sorted ids, baseline: <recorded sha>,
  write_union: union(member writeSets), openedAt }` and stamps each member node entry with `group_id`.

CRITICAL crash-safety (mirror the existing two-phase): write `state:'opening'` WITH `lane_group`
present BEFORE flipping any ledger row; flip rows; promote to `state:'open'`. A crash mid-open is
reconcilable (§5).

### 1.3 tryFormLaneGroup helper (NEW, adaptive-node, internal)

Signature:
```
function tryFormLaneGroup(writeNodes, planPath, shell) → { ok, members?, group_id?, write_union?, reason? }
```
Logic:
1. Candidate = the write frontier (`writeNodes`), already an antichain among themselves (they are all
   in `nextAction.readyPending` with no live write blocking — next-action's ready set is a frontier;
   pairwise antichain among ready-pending write siblings holds because a dep edge between two of them
   would keep the dependent un-ready). Still, the validator re-checks disjointness authoritatively (2).
2. Shell the NEW `--parallel-safe` validator check over the candidate ids (§3):
   `shell(validatorPath, [planPath, '--parallel-safe', '--nodes', ids.join(','), '--json'])`.
   - `result:'ok'` ⇒ members are pairwise-disjoint and safe to co-open ⇒ return
     `{ ok:true, members: ids.sort(), group_id:'lg-'+ids.sort().join('-'), write_union: union }`.
   - `result:'refuse'` (overlapping non-empty) ⇒ return `{ ok:false, reason:'overlapping_write_sets',
     overlapping: r.overlapping }` ⇒ caller DEGRADES to single-write serial (opens writeNodes[0]).
3. Cap: if `writeNodes.length` exceeds the write cap (resolveFanoutCap, the conservative write ceiling
   — NOT the read cap), take the first `cap` disjoint members; if a prefix subset is not all-disjoint,
   degrade to serial (keep it simple — do not search for a maximal disjoint subset; the planner is
   rewarded for authoring disjoint antichains, D-419 P3, so the common case is "all disjoint").
   For #437's scope the realistic group is exactly the 2-member fixture; a ≥3 disjoint frontier
   co-opens all up to cap.

`write_union` = union over `classifier.parseWriteSetCell(member.declared_write_set)` for each member.

### 1.4 Flag-OFF invariant (INV-6) for open-ready

When `resolveLaneContainment(process.env) === false`: the NEW arm's guard `if (containment && …)` is
false, so control falls to the EXISTING `else { toOpen=[writeNodes[0]] … }` line — byte-identical to
today. `tryFormLaneGroup` is NEVER called, `lane_group` is NEVER written, `groupForm` stays undefined,
and the running-set writer skips the `lane_group` assignment (guarded by `if (groupForm)`). The
serial single-write open is the SAME object shape as today. `write_node_exclusive` (returned at
:2531-2533 when a write is already live) is UNCHANGED and still fires identically.

--------------------------------------------------------------------------------
## 2. SETTLEMENT 2 — Member close: deferred barrier + per-member vacuity

### 2.1 close-node behavior under containment ON for a GROUP MEMBER

Modify `runCloseNode` (adaptive-node.js:2676). Detect group membership by reading the running set and
finding the closing node's `group_id` (and the live `lane_group`). The detection + new path is gated
on `resolveLaneContainment(process.env)` AND the node actually being a group member; otherwise the
EXISTING serial close path runs verbatim.

```
const containment = resolveLaneContainment(process.env);
const running0 = readRunningSet(runningSetPath, cacheExists, readFile);
const lg = (containment && running0 && running0.lane_group) ? running0.lane_group : null;
const isMember = !!(lg && lg.members.includes(nodeId));
```

When `isMember` (the NEW member-close path):
1. Evidence-shape PRESENCE + binding check — IDENTICAL to today (the §(a) block at 2690-2720,
   including the #392 nonce check). Refuse `evidence_*` on failure.
2. PER-MEMBER VACUITY GUARD (restores #283 in lane form): scope a `git status --porcelain` to the
   member's DECLARED set (parse `nodeInfo.declared_write_set` via classifier.parseWriteSetCell) and
   require it NON-EMPTY, UNLESS the evidence file contains a `no_op: <reason>` line.
   - Implementation: `git status --porcelain -- <each declared path>` from repo root (the barrier root
     pin already requires cwd==toplevel for the validator; close-node runs git via `shell`/execFileSync
     at repo root). Non-empty stdout ⇒ member wrote something in-lane ⇒ pass. Empty ⇒ check evidence for
     `/^no_op:\s*\S/m`. Present ⇒ pass (declared no-op). Absent ⇒ REFUSE
     `{ result:'refuse', reason:'member_vacuous', nodeId, detail:'declared set has no changes and evidence declares no no_op:<reason>' }`.
     (Note: this is intentionally an in-lane PRESENCE check, NOT the full diff barrier — the diff
     barrier is DEFERRED to the group.)
3. DEFER the barrier: do NOT shell `commit-node --node-id <member> --json` (the §(b) block at 2725-2729
   is SKIPPED for a non-last member). Instead record `barrier: deferred_to_group` (see 2.3).
4. Ledger close: in_progress → complete — IDENTICAL to today (§(c), 2731-2740).
5. Compliance row: append as today (§(c) tail, 2742-2750) BUT the evidence-summary / status carries the
   deferred marker — record a compliance row that includes `barrier: deferred_to_group` so the audit
   trail shows the member did NOT run its own barrier. Concretely: append `barrier: deferred_to_group`
   into the row's Evidence cell (e.g. `… | deferred_to_group | |`) OR add it to the returned payload —
   the row text MUST contain the literal `deferred_to_group` so a grep-audit and the test can assert it.
6. Selector routing (§(d)) — N/A here (group members are write roles, never selector sources); the
   existing block self-skips (`selectorCheck.isSelector !== true`). Leave it.
7. Remove the member from `running_set.nodes` (§(e)) AND from `lane_group.members`. Rewrite
   running-set.json. KEEP `lane_group` while ≥1 member remains.
8. LAST-MEMBER DETECTION: after removing this member, if `lane_group.members` is now EMPTY ⇒ this was
   the LAST member ⇒ run the GROUP BARRIER (§4) BEFORE finalizing the close. (Ordering subtlety in 2.2.)

### 2.2 Last-member detection + group barrier ordering

The last member must NOT be marked `complete` until the group barrier passes — otherwise a failing
group barrier leaves a closed-but-unverified group. Therefore for the LAST member specifically:

```
remaining = lane_group.members minus nodeId
if (remaining.length > 0) {
   // NON-LAST member: steps 1,2,4,5,7 above; record deferred_to_group; DONE (no barrier).
   // return { result:'ok', closed:nodeId, barrier:'deferred_to_group', group_id, allDone:false-or-recompute, … }
} else {
   // LAST member: steps 1,2 (evidence + vacuity) FIRST.
   // THEN run the GROUP BARRIER (§4) over the FULL original member list (lg.members before removal),
   //   diffing lane_group.baseline → now against the write_union, with per-path attribution.
   //   group barrier REFUSE ⇒ return { result:'refuse', reason:<unattributed_write|write_set_overflow|…>,
   //                                   group_id, … } and DO NOT close this member / DO NOT drop the group.
   //   group barrier PASS ⇒ proceed: close this member (ledger complete), compliance row, remove member,
   //                        CLEAR lane_group (delete the key / unlink running-set if empty),
   //                        drop the group baseline (validator --drop-base --node-id <group_id>),
   //                        then fused readiness recompute (§(f)) as today.
}
```

The group barrier is invoked via the NEW commit-node flag (§4.3):
`shell(commitNodePath, [planPath, '--group-barrier', '--group-id', lg.group_id, '--json'])`.
commit-node internally shells the validator's group-barrier mode (which reads running-set.json to learn
the members, baseline, and union). The barrier is run at the PARENT planPath (members are parent-side —
co-open writers share the parent worktree; there are no member worktrees in #437 scope, matching the
"cross-lane protection is advisory" posture in §5).

### 2.3 Recording `barrier: deferred_to_group`

For NON-LAST members the close payload sets `barrier: 'deferred_to_group'` and the compliance row text
contains the literal `deferred_to_group`. For the LAST member the payload sets
`barrier: 'group_pass'` (or the refusal). This lets tests assert the deferred marker on early closes
and the single real barrier on the terminal close.

### 2.4 Flag-OFF invariant (INV-6) for close-node

When `resolveLaneContainment(process.env) === false`: `lg` is null (guarded by `containment &&`),
`isMember` is false, so the ENTIRE member-close branch is skipped and the existing serial close path
(evidence → `commit-node --node-id <node> --json` barrier → ledger complete → compliance → selector →
remove → recompute) runs BYTE-IDENTICALLY. No `git status` vacuity probe, no group barrier, no
running-set `lane_group` read affects the serial path (a serial run never has a `lane_group` key).

--------------------------------------------------------------------------------
## 3. SETTLEMENT 3 — `--parallel-safe` validator CLI flag

### 3.1 New CLI handler in plan-validator main()

Add a handler arm (alongside `--barrier-check` etc., e.g. after `--selector-check`):
```
if (args.includes('--parallel-safe')) {
  const flagVal = name => { const i=args.indexOf(name); return i>=0 && i+1<args.length ? args[i+1] : null; };
  const nodesArg = flagVal('--nodes');
  if (!nodesArg) { emit refuse 'missing_nodes' ['--parallel-safe requires --nodes A,B[,C]']; exit 1; }
  const ids = nodesArg.split(',').map(s=>s.trim()).filter(Boolean);
  if (ids.length < 2) { emit refuse 'too_few_nodes' ['--parallel-safe needs >= 2 node ids']; exit 1; }
  const allNodes = parseNodes(content);
  const sel = ids.map(id => allNodes.find(n => n.id === id));
  const missing = ids.filter((id,i) => !sel[i]);
  if (missing.length) { emit refuse 'node_not_found' ['unknown node ids: '+missing.join(',')]; exit 1; }
  // EXPOSE the existing pair-loop: exact-file overlap OR coarse/shared-infra overlap (NON-green) ⇒ refuse.
  const overlapping = [];
  for (let i=0;i<sel.length;i++) for (let j=i+1;j<sel.length;j++) {
    const A=sel[i], B=sel[j];
    // exact-file (the plan-validator.js:1168 rule)
    let exact=null; for (const p of A.writeSet) if (B.writeSet.has(p)) { exact=p; break; }
    if (exact) { overlapping.push({ a:A.id, b:B.id, kind:'exact', path:exact }); continue; }
    // coarse/shared-infra (classifier.disjointWriteSets — the plan-validator.js:1180 rule)
    const dj = classifier.disjointWriteSets([A.writeSet, B.writeSet]);
    if (dj.verdict !== 'green') overlapping.push({ a:A.id, b:B.id, kind:dj.verdict, reasoning:dj.reasoning });
  }
  const ok = overlapping.length === 0;
  emit { result: ok?'ok':'refuse', reason: ok?undefined:'overlapping_write_sets', nodes: ids, overlapping };
  if (!ok) process.exitCode = 1;
  return;
}
```

This is READ-ONLY (no fs writes, no baseline, no git diff). It is PURE over the parsed plan + the
classifier — it REUSES the exact two predicates the antichain pair-loop already uses (no classifier
inlining, no new disjointness logic). It does NOT consult the install switch (toggle-agnostic); it is
the caller (adaptive-node open-ready, under the flag) that decides to call it.

### 3.2 open-ready refuses to co-open on overlap

Per §1.3 step 2: `result:'refuse'` ⇒ `tryFormLaneGroup` returns `ok:false` ⇒ open-ready DEGRADES to
opening ONE write node (writeNodes[0]) serially. So an overlapping write frontier NEVER co-opens —
it serializes, exactly as the flag-OFF path would. The validator pair-check is the authoritative gate
(belt-and-suspenders over next-action's antichain-frontier guarantee).

### 3.3 Help text

Add a `--parallel-safe --nodes A,B` line to `printHelp()` (plan-validator.js:1558). This is the only
prose surface; it is NOT a contract-pinned command (§6), so no count-bump.

--------------------------------------------------------------------------------
## 4. SETTLEMENT 4 — The GROUP BARRIER (last member close)

### 4.1 What it diffs and how it attributes

Inputs (read from running-set.json's `lane_group` + the frozen plan):
- baseline = `lane_group.baseline` (the shared group baseline commit recorded at open time).
- members = the FULL original member id list (lg.members BEFORE the last removal — the group barrier
  re-reads the running set, which still carries lane_group with the last member just removed; so the
  barrier mode reads members from `lane_group.members ∪ {the closing member}` — see 4.3 note, OR more
  robustly: commit-node passes the closing member explicitly so the validator unions it back in).
- write_union = the union of each member's `declared_write_set` (re-parsed from the FROZEN plan rows,
  the authoritative source — NOT trusting running-set's cached `write_union`).

Diff: `git diff-tree -r --name-only <baseline> <now-snapshot>` where now = `snapshotWorktree(root,
group_id+'-now')` — IDENTICAL mechanics to the per-node barrier (plan-validator.js:1823-1827), just
keyed by group_id and scoped to the union allowlist.

Attribution (REUSE barrierCheck, plan-validator.js:658):
- Call `barrierCheck(content, actualPaths, { groupMembers: [ids], root, project })` — a NEW opts arm
  that sets the `declared` allowlist to the UNION over the NAMED members' write sets (NOT all nodes,
  NOT one node). i.e.:
  ```
  if (opts.groupMembers && opts.groupMembers.length) {
    for (const id of opts.groupMembers) {
      const n = nodes.find(x => x.id === id);
      if (n) for (const p of n.writeSet) declared.add(p);
    }
  } else if (ownNode) { … existing per-node … }
  else { … existing whole-plan union … }
  ```
  Everything downstream (sensitivity teeth, foreign-archive, the `outOfAllow = production.filter(p =>
  !declared.has(p))` rank-4 arm at :708) is UNCHANGED. A path in the union ⇒ attributed to its
  member (no refusal). A path in NO member's set AND not exempt ⇒ lands in `outOfAllow` ⇒ the EXISTING
  `unattributed_write`/overflow refusal (rank 4). NO new reason code — exactly the issue's settlement.

Per-path "unique member" attribution (the issue's wording): because the group is formed from
DISJOINT write sets (Settlement 3 guaranteed pairwise-disjoint at open), a path that IS in the union
is in EXACTLY ONE member's set ⇒ attribution is unambiguous by construction. The barrier doesn't need
to print which member — it only needs the UNION allowlist to pass in-union paths and refuse the rest.
(If a future non-disjoint group slipped through, the rank-4 arm still refuses on the foreign path; it
never silently mis-attributes because the allowlist is a flat union membership test.)

### 4.2 The sibling-stray scenarios (the structural fix)

- A+B co-open. A's evidence is ready, B is still open. A closes (NON-last). A's close runs evidence +
  per-member vacuity ONLY — NO diff barrier. So if B has ALREADY written a stray into B's OWN declared
  lane (legitimately), A's close does NOT see it and does NOT false-refuse `write_set_overflow`. THIS
  IS THE WHOLE POINT — the ADR's broken close-side story diffed A against B's in-lane writes; this
  design never diffs at a non-last close. ✔ (matches Plan Notes lines 8-9, 18-26).
- B closes LAST. Group barrier diffs baseline→now over union(A,B). B's in-lane writes ∈ union ⇒
  attributed. A's in-lane writes ∈ union ⇒ attributed. PASS. ✔
- A stray write into NEITHER member's set (a cross-lane file e.g. `scripts/z.js` no one declared) ⇒
  ∈ production, ∉ union ⇒ `outOfAllow` ⇒ group `unattributed_write` REFUSE. ✔
- A stray in B's declared set written WHILE A closes (A non-last) ⇒ A's close is vacuity-only ⇒ NO
  false refusal at A. At B's last close it's in union ⇒ attributed ⇒ pass. ✔

### 4.3 Invocation surface — `commit-node --group-barrier --group-id <id>`

NEW commit-node flag. In commit-node.js main() add a mode BEFORE the existing per-node/whole-plan
branch:
```
const hasGroupBarrier = args.includes('--group-barrier');
const groupIdIdx = args.indexOf('--group-id');
const groupId = (groupIdIdx>=0 && groupIdIdx+1<args.length) ? args[groupIdIdx+1] : null;
if (hasGroupBarrier) {
  if (!groupId) { emit refuse ['--group-barrier requires --group-id']; exit 1; return; }
  // ONE validator spawn: --group-barrier --group-id <id> --json
  const gb = shellValidator(validatorPath, planPath, ['--group-barrier', '--group-id', groupId, '--json']);
  const out = combineResults({ barrierCheck: gb /* shaped */ }, { mode:'group-barrier', groupId });
  emit out; exit (out.overallOk ? 0 : 1); return;
}
```
combineResults gains a trivial `mode:'group-barrier'` arm: `overallOk = barrierCheck.result==='pass'`.

In plan-validator main() add the `--group-barrier` handler (mirrors `--barrier-check --node-id` but
group-scoped):
```
if (args.includes('--group-barrier')) {
  const flagVal = …; const groupId = flagVal('--group-id');
  if (!groupId) { emit refuse ['--group-barrier requires --group-id']; exit 1; }
  // root-pin (same as --barrier-check, plan-validator.js:1780-1789) unless --skip-root-pin
  // read running-set.json to learn members + baseline:
  const rsPath = path.join(path.dirname(path.resolve(planPath)), '.cache', 'running-set.json');
  const rs = JSON.parse(fs.readFileSync(rsPath,'utf8'));      // fail-closed refuse on parse error
  const lg = rs.lane_group;
  if (!lg || lg.group_id !== groupId) { emit refuse 'group_not_found'; exit 1; }
  const base = fs.readFileSync(cacheBaseFile(groupId),'utf8').trim();   // the group baseline
  // (#368 cross-check the group baseline ref ↔ file SHA — same barrier_base_mismatch guard as per-node)
  const now = snapshotWorktree(root, groupId+'-now');
  const diffOut = execFileSync('git', ['-C', root, 'diff-tree','-r','--name-only', base, now], …);
  const actualPaths = diffOut.split('\n').map(s=>s.trim()).filter(Boolean);
  // members for the union allowlist = lg.members PLUS the just-closing member if commit-node passes it.
  // SIMPLER + crash-safe: members = the ORIGINAL group membership recovered from the plan rows carrying
  //   group_id==groupId is NOT in the plan (group_id is a runtime running-set field). So recover members
  //   from running-set node entries' group_id AND lg.members AND the closing member. To avoid the
  //   "last member already removed from lg.members" race, adaptive-node passes the closing id via an
  //   explicit --member <id> on the commit-node/validator call; the validator unions lg.members ∪ {member}.
  const members = unique([...(lg.members||[]), flagVal('--member')].filter(Boolean));
  const r = barrierCheck(content, actualPaths, { groupMembers: members, root, project: projTag });
  emit r; if (r.result!=='pass') process.exitCode = 1; return;
}
```
DESIGN CHOICE (members source): adaptive-node, at the LAST member close, calls the group barrier
BEFORE removing the last member from lg.members (so lg.members still contains all members), OR passes
`--member <lastId>`. PREFER: run the group barrier while lg.members STILL holds the full set (remove
the member from lg.members only AFTER a barrier pass). This avoids the `--member` plumbing entirely:
the validator reads the complete `lg.members` directly. Implementers SHOULD use this ordering (group
barrier first over full lg.members, then remove + clear). The `--member` fallback is documented but
not required.

### 4.4 Group baseline `--drop-base` on clear

After a group-barrier PASS and clearing `lane_group`, drop the group baseline:
`shell(validatorPath, [planPath, '--drop-base', '--node-id', group_id, '--json'])` (idempotent; the
group_id is `pending`-equivalent since it has no ledger row, so the #424 drop_base_window_open guard —
which keys on ledger status of the id — sees no `in_progress` row for a group_id and permits the drop).
NOTE for implementer n2: `--drop-base`'s window-lock at plan-validator.js:1750 reads
`parseLedger(content).get(nodeId)`; a group_id has no ledger row ⇒ `get` returns undefined ≠
'in_progress' ⇒ drop is permitted. ✔ No change needed to --drop-base.

--------------------------------------------------------------------------------
## 5. SETTLEMENT 5 — Hook posture (DOCS, authored by n7)

- The write-lane containment HOOK (#376, the `resolveLaneContainment`-gated enforce-out-of-lane-writes
  hook) is UNCHANGED by #437. No hook code is touched.
- Cross-lane protection BETWEEN co-open writers is ADVISORY: while A and B run concurrently in the
  shared parent worktree, nothing PREVENTS A from writing into B's lane in real time. ENFORCEMENT is
  retrospective: (a) the GROUP BARRIER at the last close (refuses an out-of-union stray), and (b) the
  #424 finalize attribution sweep (every branch change must map to a complete node's declared set).
- n7 documents this honestly in the kernel docs (docs/architecture.md adaptive section + the
  D-437-01 decision record): "co-open writers are not runtime-isolated; the group barrier + finalize
  sweep are the teeth." This is a deliberate scope boundary, not a gap.

--------------------------------------------------------------------------------
## 6. NO COUNT-BUMP CONFIRMATION

VERIFIED in-tree:
- `grep -rn 'parallel.safe|parallel_safe' scripts/validate-workflow-contracts.js plugins/` returns
  ONLY PROSE hits (planner rubric in `*.toml` / `*.md` / SKILL.md describing the validator-DERIVED
  `parallel_safe` ANNOTATION concept from D-419 P3). NONE is a contract PIN asserting a `--parallel-safe`
  CLI flag or a count. The contract validators pin COMMAND prose (e.g. `--resume-check` in finalize.md
  route-reachability), not the validator's internal subcommands.
- `--parallel-safe` and `--group-barrier` are NEW validator/commit-node CLI FLAGS. The group barrier is
  a barrier-SHAPE change. NEITHER is a new role, script, agent, or command. So:
  - NO `validate-*-contracts.js` count file changes.
  - NO `test-*-workflow-scripts.js` agent-count changes.
  - NO `validate-vendored-agents.js` listing changes.
  - NO new COMMON_SCRIPTS / install.sh SUPPORT_SCRIPT_NAMES entries (no new script file).
CONFIRMED: zero count-bump surface.

--------------------------------------------------------------------------------
## 7. GENERATED_AGGREGATORS CONFIRMATION (edition-sync)

VERIFIED at edition-sync.js:46-56 — all three changed scripts are in `GENERATED_AGGREGATORS`:
  `kaola-workflow-adaptive-node.js`  (line 47)
  `kaola-workflow-parallel-batch.js` (line 50)
  `kaola-workflow-plan-validator.js` (line 55)

Per-implement-node procedure (n2, n3, n4 EACH):
1. Edit root `scripts/X.js`.
2. Edit its byte-pair `plugins/kaola-workflow/scripts/X.js` (kept byte-identical by
   validate-script-sync.js — the codex tree is a literal byte copy, NOT renamed).
3. Run `node scripts/edition-sync.js --write` to REGENERATE the 2 forge ports
   (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-X.js` and
   `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-X.js`). NEVER hand-edit forge ports.
4. Declare all 4 files in the node's write set (already done in workflow-plan.md:96-98).
5. The `--write` output confirms the gitlab/gitea ports were regenerated; `edition-sync.js --check`
   (run in the gitlab/gitea chains) asserts rename-normalized parity.

Whole 4-file family per script lives in ONE node ⇒ NO separate forge-mirror node, NO forge-port
ordering gap. The forge spec is "regenerate via edition-sync.js --write" (mechanical), never a hand diff.

--------------------------------------------------------------------------------
## 8. FLAG-OFF BYTE-IDENTITY (INV-6) — per changed file

### plan-validator.js
- `--parallel-safe` and `--group-barrier` are NEW handler arms reached ONLY when those literal flags
  are in argv. NO existing handler (`--barrier-check`, `--record-base`, `--node-end`, etc.) is touched.
- `barrierCheck` gains ONE new opts arm `if (opts.groupMembers && opts.groupMembers.length) { … }`
  placed BEFORE the existing `else if (ownNode)`/`else` allowlist construction. When `opts.groupMembers`
  is absent (every existing caller — per-node and whole-plan never pass it), the new branch is skipped
  and the allowlist is built EXACTLY as today.
- This file does NOT read `resolveLaneContainment` — it is toggle-agnostic. Its new code paths are
  reached only when adaptive-node (under the flag) invokes the new flags. With the flag OFF, adaptive-
  node never invokes them ⇒ this file behaves byte-identically. The ×4 walkthroughs (which never pass
  `--parallel-safe`/`--group-barrier`) exercise the unchanged paths.

### adaptive-node.js
- `runOpenReady`: the ONLY new code is `const containment = resolveLaneContainment(process.env)` + the
  `if (containment && writeNodes.length>=2) { … } else { <existing line> }` wrapper around the EXISTING
  single-write open. Flag OFF ⇒ `containment===false` ⇒ the `if` is dead ⇒ the existing `else` line runs
  verbatim. `tryFormLaneGroup` never called; `groupForm` undefined; the `if(groupForm)` lane_group
  writer is skipped; the running-set object is the SAME shape as today.
- `runCloseNode`: the new member-close branch is gated `if (containment && lg && lg.members.includes(
  nodeId))`. Flag OFF ⇒ `containment===false` ⇒ `lg=null` ⇒ branch dead ⇒ the existing serial close
  (evidence→`commit-node --node-id <node>` barrier→complete→compliance→selector→remove→recompute) runs
  verbatim. The `readRunningSet` call for `running0` is read-only and a serial run has no `lane_group`
  key, so even if `containment` were on, a serial node (`lg=null` because no lane_group) takes the
  unchanged path. No `git status` vacuity probe, no group barrier on the serial path.
- Reading `running0.lane_group` is additive: a today's running-set has no `lane_group` key ⇒
  `running0.lane_group` is `undefined` ⇒ `lg=null` ⇒ serial. Existing reconcile/orient code reads
  `running.nodes`/`state`/`max_concurrent` only; an absent `lane_group` is invisible to them.

### parallel-batch.js
- The group lane co-open is a WRITE-LANE concern owned by adaptive-node's running-set scheduler, NOT
  the batch (fan-out) machine. parallel-batch's behavioral change is MINIMAL: its tests (n4) exercise
  the group barrier via the REAL subprocess path (commit-node `--group-barrier` + validator), and any
  code change is limited to NOT regressing seal-member/seal under the flag. The seal-member barrier
  (parallel-batch.js:656, shells `commit-node --node-id <member>`) is UNCHANGED — write-role batches
  serial-degrade today and never co-open a write group, so the flag-OFF AND flag-ON batch paths are
  byte-identical here. If n4 finds NO production change is required in parallel-batch.js (only test
  additions), that is the EXPECTED outcome — the file is in the write set primarily so its byte-pair +
  forge ports stay in sync if a shared helper is touched, and so test-parallel-batch.js can drive the
  real group-barrier subprocess. n4 MUST confirm: any parallel-batch.js production edit is gated on
  `resolveLaneContainment` OR is a no-op refactor that leaves flag-OFF behavior byte-identical.

INV-6 GLOBAL PROOF: with `KAOLA_LANE_CONTAINMENT` unset/`0`/`false`/`no`, EVERY new arm in all 3 files
is dead (the validator's flags are simply never passed by adaptive-node; adaptive-node's containment
guards are false). The flag-OFF ×4 walkthroughs are the assertion (no new test lines needed there).

--------------------------------------------------------------------------------
## 9. TEST DESIGN (the io-shim trap, #292)

The group-barrier close-side fix lives in the REAL subprocess CLI path. Tests MUST drive the REAL
`node plan-validator.js … --group-barrier`/`--parallel-safe` and `node adaptive-node.js close-node`
subprocesses in a REAL git repo under $TMPDIR — NEVER inject a shim, NEVER call combineResults/
runCloseNode in-process with a fake git. Reuse the existing harness:
- test-parallel-batch.js already has `runBatchCli` + `makeRealGitRepo` (real git init, real --freeze)
  at :1026-1100 — clone that pattern for adaptive-node/commit-node CLIs (a `runNodeCli`/`runValidatorCli`
  helper rooted at repoRoot, env carrying `KAOLA_LANE_CONTAINMENT=1`).
- test-commit-node.js currently tests the PURE combineResults; ADD a real-subprocess section for
  `--group-barrier` (init git, freeze a 2-write-member plan, write running-set.json with a lane_group +
  baseline, make real file changes, run the validator `--group-barrier`, assert real attribution).

### n2 — test-commit-node.js (plan-validator group barrier + parallel-safe)
Real-subprocess scenarios (each: mkdtemp git repo, frozen 2-member plan A(decl x.js) B(decl y.js)):
- T-PS-1 disjoint: `plan-validator --parallel-safe --nodes A,B --json` ⇒ `result:'ok'`, `overlapping:[]`.
- T-PS-2 exact overlap: A,B both decl `x.js` ⇒ `result:'refuse'`, `reason:'overlapping_write_sets'`,
  `overlapping[0].kind==='exact'`.
- T-PS-3 missing flag value: `--parallel-safe` with no `--nodes` ⇒ refuse `missing_nodes`.
- T-PS-4 <2 nodes: `--nodes A` ⇒ refuse `too_few_nodes`.
- T-GB-1 group pass: record group baseline (validator --record-base --node-id lg-A-B), make real edits
  to x.js (A's lane) and y.js (B's lane), write running-set.json `{lane_group:{group_id:'lg-A-B',
  members:['A','B'],baseline:<sha>,write_union:['x.js','y.js']}, nodes:[…]}`,
  `commit-node --group-barrier --group-id lg-A-B --json` ⇒ `overallOk:true` / validator `result:'pass'`.
- T-GB-2 cross-lane stray (NEITHER set): also edit `z.js` (undeclared) ⇒ group barrier
  `result:'refuse'`, error names `z.js` as out-of-allowlist (the rank-4 unattributed_write arm).
  ASSERT the refusal text contains `z.js` and is the overflow/unattributed arm (NOT a new reason code).
- T-GB-3 in-union both-member edits ⇒ pass even though A's set has only x.js and B's only y.js
  (proves UNION allowlist, not per-node).
- T-GB-4 group_not_found: `--group-id lg-WRONG` ⇒ refuse `group_not_found`.
MUTATION CHECK (prove the test bites): with the group barrier removed/short-circuited, T-GB-2 must
flip to pass — assert the real subprocess refuses, so a false-green is impossible.

### n3 — test-adaptive-node.js (open-ready co-open + close-node deferred/last)
Real-subprocess scenarios, env `KAOLA_LANE_CONTAINMENT=1`, real git repo, frozen plan with a 2-write
antichain frontier (A,B both ready, disjoint x.js/y.js, code-reviewer gate + finalize sink):
- T-OR-1 co-open: `adaptive-node open-ready --project P --json` ⇒ opens BOTH A and B; running-set.json
  has `lane_group` with members [A,B], a baseline sha, write_union [x.js,y.js]; both ledger rows
  in_progress.
- T-OR-2 overlap degrade: A,B both decl x.js ⇒ open-ready opens ONE write (writeNodes[0]) serially,
  NO lane_group written (the --parallel-safe refuse path).
- T-CL-1 non-last close (deferred): after T-OR-1, write A's evidence (binding nonce) + make a real
  in-lane edit to x.js; `adaptive-node close-node --node-id A --project P --json` ⇒ `result:'ok'`,
  `barrier:'deferred_to_group'`; A ledger complete; compliance row contains `deferred_to_group`;
  running-set lane_group.members now [B]; NO group barrier ran (assert no group-barrier provenance).
- T-CL-2 last close (group barrier pass): then write B's evidence + real in-lane edit to y.js;
  `close-node --node-id B` ⇒ runs the REAL group barrier over union(A,B); `result:'ok'`,
  `barrier:'group_pass'`; lane_group CLEARED; group baseline dropped.
- T-CL-3 sibling stray, NO false refusal at A: in T-OR-1 state, make BOTH x.js (A) and y.js (B) edits
  BEFORE closing A (simulating B writing its lane while A closes). Close A ⇒ STILL `result:'ok'`
  deferred (vacuity scoped to A's set sees x.js non-empty; NO diff barrier ⇒ B's y.js stray is
  invisible to A). PROVES no false write_set_overflow at the non-last close.
- T-CL-4 cross-lane stray ⇒ last close refuses: T-OR-1 state, edit x.js, y.js, AND z.js (undeclared);
  close A (deferred ok), close B (LAST) ⇒ group barrier `result:'refuse'` reason maps to
  `unattributed_write`/overflow naming z.js; B NOT closed; lane_group NOT cleared.
- T-CL-5 per-member vacuity: T-OR-1 state, write A's evidence but make NO file change and NO `no_op:`
  line ⇒ close A ⇒ `result:'refuse'`, `reason:'member_vacuous'`. Then add `no_op: nothing to change`
  to A's evidence ⇒ close A ⇒ `result:'ok'` deferred.
MUTATION CHECK: T-CL-3 with the deferred path replaced by the serial per-member barrier must flip to a
false write_set_overflow refusal — assert the real subprocess returns ok, so the structural fix is
proven (this is the ADR-broken-story regression guard).

### n4 — test-parallel-batch.js
- T-PB-1 drive the group-barrier subprocess via the SAME real-repo harness (reuse makeRealGitRepo +
  runBatchCli pattern) to confirm parallel-batch's seal path does NOT regress and the group barrier is
  reachable through the shared commit-node CLI. Assert seal-member under flag-ON is byte-identical to
  flag-OFF (write batches serial-degrade; no group co-open in the batch machine).
- T-PB-2 (if any shared helper is touched) confirm the helper's flag-OFF byte-identity.

### Flag-OFF test (all three)
Run the existing ×4 walkthroughs UNCHANGED (no `KAOLA_LANE_CONTAINMENT` set ⇒ OFF). Their passing IS
the flag-OFF byte-identity assertion. No new flag-OFF test lines are added.

--------------------------------------------------------------------------------
## 10. FUNCTION SIGNATURES (new / modified) — quick index for implementers

plan-validator.js:
- `barrierCheck(content, actualPaths, opts)` — MODIFIED: opts gains optional `groupMembers: string[]`.
  When present, the `declared` allowlist = union over named members' writeSets (placed before the
  existing ownNode/whole-plan arms). Everything else unchanged.
- NEW CLI handler `--parallel-safe --nodes A,B[,C] [--json]` → `{result, reason?, nodes, overlapping[]}`.
- NEW CLI handler `--group-barrier --group-id <id> [--member <id>] [--skip-root-pin] [--json]` →
  the barrierCheck envelope (`{result:'pass'|'refuse', errors[], reason?}`), group-baseline diff.
- `printHelp()` — add the two new flag lines.

commit-node.js:
- NEW mode `--group-barrier --group-id <id>` in main() → shells validator `--group-barrier`,
  `combineResults({…},{mode:'group-barrier',groupId})` → `{overallOk, …}`.
- `combineResults(parts, meta)` — MODIFIED: add a `mode:'group-barrier'` arm
  (`overallOk = barrierCheck.result==='pass'`).

adaptive-node.js:
- `tryFormLaneGroup(writeNodes, planPath, shell)` — NEW internal →
  `{ok, members?, group_id?, write_union?, reason?, overlapping?}`.
- `runOpenReady(opts)` — MODIFIED: new containment-gated co-open arm + lane_group writer.
- `runCloseNode(opts)` — MODIFIED: new containment-gated member-close path (evidence + vacuity +
  deferred/last + group barrier).
- `runReconcileRunningSet(opts)` — MODIFIED (crash repair, §5 below): treat a `lane_group` member set
  consistently with the node set on rollback; clear lane_group when its members all roll back; keep it
  when ≥1 member rolls forward.

adaptive-schema.js: NO change required (resolveLaneContainment, RUNNING_SET_NAME already exist). Do
NOT add a constant here unless byte-identical ×4 — the group lives inside running-set.json (no new
schema constant needed). The `barrier: deferred_to_group` / `group_pass` strings are local literals,
not schema constants.

### Crash-safety note for reconcile (§5 of settlement, implementer n3)
`runReconcileRunningSet` must handle a crashed group open/close:
- crashed group OPEN (state:'opening' with lane_group + opening:true members): roll forward members
  whose ledger flipped to in_progress (keep in lane_group.members); roll back the rest (drop from
  lane_group.members AND drop their per-member baseline). If ALL roll back ⇒ delete lane_group +
  drop the group baseline (--drop-base --node-id group_id). If ≥1 rolls forward ⇒ keep lane_group with
  the surviving members + the SAME group baseline.
- crashed group CLOSE (last member ledger==complete but group barrier/clear didn't finish): the #384
  close-direction already drops terminal members from running.nodes; ALSO clear lane_group when its
  member set empties and drop the group baseline. This is additive to the existing terminal-drop loop.
- These are gated implicitly: a today's (flag-OFF) running set has no lane_group key, so the
  reconcile lane_group handling is a no-op (`running.lane_group` undefined) ⇒ byte-identical.

--------------------------------------------------------------------------------
## 11. SUMMARY OF DESIGN DECISIONS

1. The lane group is ONE additive `lane_group` key inside the EXISTING running-set.json — no new file,
   no new schema constant, outside plan_hash. Rationale: minimal surface, reconcile-compatible,
   flag-OFF invisible.
2. The group baseline reuses the per-node baseline machinery (cacheBaseFile/barrierRef/anchorBase/
   snapshotWorktree/--record-base/--drop-base) keyed by group_id. Rationale: zero new baseline code;
   gc-anchored + #368 mismatch-guarded for free.
3. Member close = evidence + per-member in-lane vacuity ONLY; the diff barrier is DEFERRED to the LAST
   member. Rationale: THE structural fix — never diff a member against a still-open sibling's writes
   (the ADR's broken close-side story).
4. The group barrier REUSES barrierCheck with a union-of-members allowlist ⇒ the EXISTING rank-4
   unattributed_write arm fires on cross-lane strays. Rationale: no new reason code (issue settlement),
   disjoint members ⇒ unique-member attribution by construction.
5. `--parallel-safe` EXPOSES the existing antichain pair-loop predicates (exact-file +
   classifier.disjointWriteSets) as a read-only 2+-node CLI check. Rationale: no classifier inlining;
   open-ready degrades to serial on overlap, so overlap never co-opens.
6. Cross-lane runtime protection is ADVISORY; the group barrier + #424 finalize sweep are the teeth.
   Rationale: honest scope boundary, documented by n7.
7. ALL new behavior gated on resolveLaneContainment; flag OFF ⇒ byte-identical ×4 (INV-6) — the
   validator's new flags are simply never invoked, and adaptive-node's guards are false.

`barrier: design-evidence-complete`
`no_op: code-architect is a read-only role — design document only, no code written`
