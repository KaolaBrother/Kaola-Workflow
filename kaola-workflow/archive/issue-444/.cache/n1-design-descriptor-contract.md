evidence-binding: n1-design-descriptor-contract b714018d2074

# Design Contract — D-421 P1+P2 dispatch descriptor (`buildDispatch`) + `record-evidence --verify`

This is the settled contract n2 (implementer) executes verbatim. It is grounded in the
**as-built** source of `scripts/kaola-workflow-adaptive-node.js`,
`scripts/kaola-workflow-next-action.js`, and `scripts/kaola-workflow-plan-validator.js`
as they stand at HEAD (a6c91eb). Where the task brief's premise diverges from the as-built
code, that divergence is flagged explicitly (FLAG-*).

---

## FLAG-0 (read first): three brief fields are NOT "already in scope"

The brief states `working_dir`, `forge_rider`, and `nonce` are "already in the openers / already
in scope". Verified against source:

- `nonce` — TRUE. Computed in all three openers today (`openNonce` L1223, per-node `nonceById`
  L2429, `fusedNonce` L1589), all via `recordBase.base.slice(0,12)`.
- `working_dir` — **FALSE.** `grep -c 'working_dir' adaptive-node.js` = 0. The openers receive
  NO working-dir argument. `main()` computes `repoRoot`/`mainRoot`/`realRepoRoot` for the
  worktree-mirror probe (L2940-2943) but does NOT pass any of them into `runOpenNext`/
  `runOpenReady`/`runCloseAndOpenNext`. The active worktree path lives in
  `workflow-state.md:worktree_path` and is resolved by the **orchestrator PROSE**
  (commands/kaola-workflow-plan-run.md L43-47), not by these functions.
- `forge_rider` — **FALSE.** `grep -c 'forge_rider' adaptive-node.js` = 0. There is no
  forge-neutral rider variable in scope in any opener.
- `goal_line` — **FALSE.** No `goal`/`goal_line` field exists on the next-action node object
  (`computeNextAction` map at L117-124 emits only: id, role, dependsOn, model,
  declared_write_set, shape). No goal text is parsed anywhere reachable from the openers.

CONSEQUENCE / boundary decision for these four fields (see also §5):
- `nonce` — emit as-is (already computed).
- `working_dir` — the builder CANNOT source it from opener-local data. It must be PLUMBED IN
  as a `context` field. The CLI `main()` resolves it once (from `worktree_path` in
  `workflow-state.md`, falling back to `repoRoot`) and threads it into each opener's opts.
  This is a NEW small touchpoint in `main()` arg-resolution + the three opener signatures —
  it is in-scope for n2 (all inside adaptive-node.js, no aggregator edit). See §5.A.
- `forge_rider` — there is no forge-rider concept in this script today. Settled: emit the
  forge-neutral terminology rider as a CONSTANT string the builder owns (the edition is fixed
  at install time; this script ships per-edition). Default `forge_rider: null` until a concrete
  rider string is supplied. n2 must NOT invent a cross-edition rider resolver — if a real
  per-edition rider value is required, that is a FLAG for plan-repair, not silent scope growth.
- `goal_line` — OPTIONAL (`goal_line?`). Omit the key entirely when no goal is available
  (it is not on the next-action node object). Do NOT add a goal parser. If a goal line is
  later wanted, it is sourced from the node's `## Nodes` table description column — that is a
  next-action.js change (FLAG for plan-repair, see §5.B), out of scope here.

---

## 1. `dispatch` descriptor field set (the FOLD)

Every opener's `opened` payload gains ONE new key, `dispatch`, that FOLDS the scattered
per-node fields under a single object. The pre-existing sibling fields on `opened`
(`id`, `role`, `model`, `declared_write_set`, `nonce`, `evidence_file`, `required_tokens`,
and for open-ready `kind`) STAY in place for one release (back-compat with any reader that
already destructures them) — `dispatch` is ADDITIVE, not a replacement, this release.

Exact field set (the single source of truth `buildDispatch` returns):

```
dispatch: {
  node_id:            <string>,    // the node's id            (== opened.id)
  role:               <string>,    // the node's role string   (== opened.role)
  model:              <string|null>, // resolved model          (== opened.model, may be null)
  working_dir:        <string>,    // active worktree path (from context, see §2/§5.A)
  declared_write_set: <string>,    // RAW write-set cell as next-action returns it (writeSetRaw)
  evidence_file:      <string>,    // '.cache/<node-id>.md'    (== seedResult.evidence_file)
  nonce:              <string|null>, // per-open evidence-binding nonce (== opened.nonce)
  required_tokens:    <string[]>,  // ROLE_TOKEN_REGISTRY[role] (== seedResult.required_tokens)
  forge_rider:        <string|null>, // forge-neutral rider constant (null until supplied, §FLAG-0)
  guards:             <string[]>,  // computed array, see §3
  goal_line:          <string>     // OPTIONAL — key present ONLY when a goal line exists (§FLAG-0)
}
```

Notes on shapes (must match as-built producers, do not "normalize"):
- `declared_write_set` is the RAW cell string (`node.writeSetRaw`, surfaced by next-action as
  `declared_write_set`). The brief calls it "array of declared write set tokens"; the as-built
  value is the RAW STRING, not a pre-split array. Settled: `dispatch.declared_write_set`
  carries the RAW string for byte-fidelity with today's `opened.declared_write_set`; the
  builder ALSO needs the parsed token SET internally for §3 guard derivation (via
  `parseWriteSetCell`) but does NOT change the emitted shape. (If a parsed-array field is
  genuinely wanted, add a separate `declared_write_set_tokens` — do not mutate the existing
  string field.)
- `model` may be `null` (open-ready already emits `model: n.model || null`).
- `nonce` may be `null` on a legacy/offline path (no baseline SHA).
- `required_tokens` ALWAYS includes `'evidence-binding'` as element 0 (registry shape).

---

## 2. Single shared builder invariant — `buildDispatch(nodeInfo, context)`

ONE module-level function assembles `dispatch` for ALL THREE openers. This closes the #411
class (a descriptor present in serial open but absent in fused advance) by construction: there
is exactly one producer, so the three call sites cannot drift.

### Signature

```js
function buildDispatch(nodeInfo, context) { ... }
```

### `nodeInfo` — the per-node facts (one node)
The builder reads ONLY these fields off `nodeInfo`; each opener passes the next-action node
object (or the running-set node object) it already has in hand:

```
nodeInfo = {
  id:                 <string>,      // required
  role:               <string>,      // required
  model:              <string|null>, // node.model || resolveModel(role); null allowed
  declared_write_set: <string>,      // RAW write-set cell (next-action: declared_write_set; running-set: declared_write_set)
}
```

All three openers ALREADY have an object with these fields:
- `runOpenNext`: `targetNode` (from `nextAction.readySet`/`nextNode`) — has id, role, model,
  declared_write_set. ✔ complete.
- `runCloseAndOpenNext` fused advance: `nextNode` (== `nextAction.nextNode`) — same shape. ✔ complete.
- `runOpenReady`: per-member `n` in the `newNodes`/`toOpen` map — has id, role,
  declared_write_set; model is `n.model || null`. ✔ complete (model already normalized to null).

There is NO field one opener has but another lacks at the `nodeInfo` level — the next-action
node descriptor is identical across `readySet`/`nextNode`/`readyPending`. The builder needs no
special-casing per opener.

### `context` — the per-OPEN facts (computed in the opener, not on the node)
These are the fields the openers compute at dispatch time that are NOT on the node object:

```
context = {
  nonce:        <string|null>,  // openNonce / nonceById[id] / fusedNonce (recordBase.base.slice(0,12))
  evidence_file:<string>,       // seedResult.evidence_file / fusedSeed.evidence_file / '.cache/'+id+'.md'
  required_tokens:<string[]>,   // seedResult.required_tokens / fusedSeed.required_tokens / registry lookup
  working_dir:  <string>,       // threaded from main() — the active worktree path (§5.A). NEW plumbing.
  forge_rider:  <string|null>,  // forge-neutral rider constant (null this release, §FLAG-0)
  goal_line:    <string|undefined>, // optional; undefined => key omitted
}
```

Per-opener `context` sourcing (all data the opener ALREADY computes today, except working_dir):
- `runOpenNext`: nonce=`openNonce`, evidence_file/required_tokens=`seedResult.*`. ✔ in hand.
- `runOpenReady`: nonce=`nonceById[n.id]`, evidence_file/required_tokens from the per-member
  registry lookup it already does (L2465-2468). ✔ in hand.
- `runCloseAndOpenNext`: nonce=`fusedNonce`, evidence_file/required_tokens=`fusedSeed.*`. ✔ in hand.
- `working_dir`: NOT in hand in any opener today — threaded from `main()` via opts (§5.A).

### Builder body (settled logic)

```js
function buildDispatch(nodeInfo, context) {
  const ctx = context || {};
  const d = {
    node_id:            nodeInfo.id,
    role:               nodeInfo.role,
    model:              (nodeInfo.model != null ? nodeInfo.model : null),
    working_dir:        ctx.working_dir,                 // may be undefined if not plumbed — see §5.A
    declared_write_set: nodeInfo.declared_write_set,     // RAW string (byte-fidelity)
    evidence_file:      ctx.evidence_file,
    nonce:              (ctx.nonce != null ? ctx.nonce : null),
    required_tokens:    ctx.required_tokens || deriveRequiredTokens(nodeInfo.role),
    forge_rider:        (ctx.forge_rider != null ? ctx.forge_rider : null),
    guards:             deriveGuards(nodeInfo),          // §3
  };
  if (ctx.goal_line != null && String(ctx.goal_line).trim() !== '') {
    d.goal_line = String(ctx.goal_line);
  }
  return d;
}
```

`deriveRequiredTokens(role)` is the SAME registry lookup the three openers do today
(`(ROLE_TOKEN_REGISTRY[role] || ['evidence-binding']).slice()`), factored into one helper so
the builder is self-sufficient if `context.required_tokens` is ever absent. (Prefer reusing
the already-computed `context.required_tokens` to avoid a redundant require.)

### Each opener change (surgical)
At the `return { result:'ok', ..., opened: {...} }` site, add ONE line building `dispatch` and
attach it to `opened`:
- `runOpenNext` (~L1236): `opened.dispatch = buildDispatch(targetNode, { nonce: openNonce,
  evidence_file: seedResult.evidence_file, required_tokens: seedResult.required_tokens,
  working_dir, forge_rider });`
- `runCloseAndOpenNext` fused advance (~L1602): `opened.dispatch = buildDispatch(nextNode,
  { nonce: fusedNonce, evidence_file: fusedSeed.evidence_file,
  required_tokens: fusedSeed.required_tokens, working_dir, forge_rider });`
- `runOpenReady` per-member map (~L2464): inside the `.map`, build `dispatch` per node with
  `nonce: nonceById[n.id]`, the member's `evidence_file`/`required_tokens`, and attach to each
  member's opened object. (open-ready returns `opened` as an ARRAY — each element gets its own
  `dispatch`.)

INVARIANT n2 must assert (test): for the SAME node, the `dispatch` object produced by the
serial open path (`open-next`) and by the fused-advance path (`close-and-open-next`) is
field-for-field identical (this is the #411 anti-drift guard, mechanically testable).

---

## 3. `guards[]` derivation — `deriveGuards(nodeInfo)` (script-owned)

The builder computes `guards[]` from the node's role + declared write set. PURE, no fs except
the one require for `parseWriteSetCell` (already used by `isReadOnlyNode`). Settled order
(stable, deterministic):

```js
function deriveGuards(nodeInfo) {
  const guards = [];
  const role = nodeInfo.role;

  // (a) Gate roles → read-only. Use the SAME gate vocabulary as runReopenNode L1834.
  //     Promote that inline Set to a module-level GATE_ROLES const (see §3 note) so this
  //     does not duplicate-define the gate vocabulary (single source of truth).
  if (GATE_ROLES.has(role)) guards.push('read-only');

  // (b) tdd-guide → RED fixture must live in $TMPDIR, never the worktree (#424).
  if (role === 'tdd-guide') guards.push('RED-fixture-in-$TMPDIR');

  // (c) sync:editions — ONLY when the declared write set ACTUALLY contains a generated-port
  //     sibling. Reuse the #431 validator language exactly: the trigger is a write-set token
  //     that is a canonical GENERATED_AGGREGATORS member 'scripts/<base>' OR any of its
  //     edition siblings (codex twin or forge port under plugins/kaola-workflow*/).
  if (writeSetTouchesGeneratedPort(nodeInfo.declared_write_set)) guards.push('sync:editions');

  return guards;
}
```

### (a) GATE_ROLES
Settled: promote the inline `const GATE_ROLES = new Set([...])` at L1834 (inside
`runReopenNode`) to a MODULE-LEVEL constant and reference it from both `runReopenNode` and
`deriveGuards`. Value is unchanged:
`new Set(['code-reviewer','security-reviewer','adversarial-verifier','main-session-gate'])`.
Adds guard `'read-only'`. (This matches `VERDICT_ROLES` already being module-level at L662 —
consistent placement.)

### (b) tdd-guide
Adds guard `'RED-fixture-in-$TMPDIR'`. Literal string exactly as written (the `$TMPDIR` token
is part of the guard label, not interpolated). Rationale: #424 forbids writing a RED fixture
into the worktree; a tdd-guide node must stage its RED fixture in `$TMPDIR`.

### (c) sync:editions — write-set-conditional ONLY
The guard fires IFF the node's declared write set actually contains a generated-port sibling.
The detection MUST reuse the #431 validator's exact notion (no re-invention). Settled helper:

```js
function writeSetTouchesGeneratedPort(writeSetRaw) {
  let editionSync = null;
  try { editionSync = require('./edition-sync'); } catch (_) { return false; }
  if (!editionSync || !Array.isArray(editionSync.GENERATED_AGGREGATORS)
      || typeof editionSync.forgeRel !== 'function') return false;
  let tokens;
  try {
    const { parseWriteSetCell } = require('./kaola-workflow-classifier');
    tokens = parseWriteSetCell(writeSetRaw);          // a Set
  } catch (_) { return false; }
  const codexRel = base => 'plugins/kaola-workflow/scripts/' + base;
  for (const base of editionSync.GENERATED_AGGREGATORS) {
    const sibs = ['scripts/' + base, codexRel(base),
                  editionSync.forgeRel(base, 'gitlab'), editionSync.forgeRel(base, 'gitea')];
    for (const s of sibs) if (tokens.has(s)) return true;
  }
  return false;
}
```

DESIGN NOTE: the #431 freeze-wall already REFUSES a plan that declares the canonical without
its full sibling set in the SAME node (`generated_port_split`). So at OPEN time a node that
touches a generated aggregator is guaranteed to declare the full sibling set. The
`sync:editions` guard is therefore an OPERATOR REMINDER ("this node edits a generated
aggregator + ports — keep them byte-synced / run edition-sync"), keyed on ANY sibling being
present. Anchor-gated identically to the validator: if `edition-sync.js` is not require-able
(forge/codex/user installs), the helper returns false → no guard → zero false positives. This
mirrors the validator's `editionSync && ...` anchor (L973-975) so guard and wall agree.

NO OTHER guards this release. Do not add speculative guards.

### Edition portability of the guard set
`adaptive-node.js` ships in 4 editions (byte-/rename-generated). The guard STRINGS
(`'read-only'`, `'RED-fixture-in-$TMPDIR'`, `'sync:editions'`) and GATE_ROLES are
forge-neutral and identical across editions — they belong in the canonical source and
propagate by the normal edition-sync rename (no per-edition divergence). n2's write set MUST
include the generated-aggregator sibling set for `kaola-workflow-adaptive-node.js`
(canonical + codex twin + both forge ports) or the #431 freeze-wall refuses — this node IS a
generated-port-touching node and must declare its own siblings.

---

## 4. `record-evidence --verify` subcommand

A NEW READ-ONLY mode of `record-evidence` that verifies an on-disk `.cache/<node>.md` WITHOUT
stdin transit. The existing `--stdin` write path is UNCHANGED and stays one release for compat.

### CLI surface
```
record-evidence --project P --node-id N --verify        (READ-ONLY: verifies on-disk evidence)
record-evidence --project P --node-id N --stdin         (MUTATES .cache — existing, kept 1 release)
```
- `--verify` and `--stdin` are mutually exclusive. `--verify` present → verify path; else the
  existing stdin path. (`--node-id` is already required for record-evidence; reuse that guard.)
- Verify is PURE READ — never writes, never mkdirs, never appends telemetry. Fail-closed: on a
  missing file it returns a typed refuse, not a throw.

### New function `runVerifyEvidence(opts)` (READ-ONLY)
```
opts = { planPath, project, nodeId, readFile, cacheExists }
```
Behavior:
1. Resolve role: parse `## Nodes` (read-only) via `parseNodesFromContent(readFile(planPath))`;
   `role = nodeInfo ? nodeInfo.role : 'unknown'` (mirror close-and-open-next L1341-1343).
2. Resolve evidence path: `cachePath = path.join(path.dirname(planPath), '.cache', nodeId+'.md')`
   and `evidence_file = '.cache/' + nodeId + '.md'`.
3. If absent (`!cacheExists(cachePath)`):
   `return { result:'refuse', reason:'evidence_absent', nodeId, role, evidence_file };`
4. Read content; resolve `expectedNonce = readNonce(planPath, nodeId, readFile)` (the SAME #392
   per-open nonce the close path uses, L1358).
5. Run the SAME checker the close path uses — `checkEvidenceShape(role, nodeId, content,
   { expectedNonce, expectedNodeId: nodeId })`. This covers BOTH required parts atomically:
   - (a) evidence-binding line present with correct nonce format (the #392 binding block,
     L562-583), AND
   - (b) all required_tokens for the role present (the per-role token checks, L585-642).
   Reusing `checkEvidenceShape` is mandatory — it reads from the SAME ROLE_TOKEN_REGISTRY
   semantics the #433 seed and the close-side shape checker already use, so `--verify` can
   never drift from the gate that actually blocks the close.
6. Map the result to the typed return:
   - `shapeCheck.ok === true` → `{ result:'ok', nodeId, role, evidence_file }`
   - else → `{ result:'refuse', reason:'evidence_shape_failed', nodeId, role,
              missingTokenClass: shapeCheck.missingTokenClass || null,
              evidence_file, expected: shapeCheck.expected || [],
              detail: shapeCheck.reason }`
     - Per the brief, `--verify` returns the single typed family
       `reason:'evidence_shape_failed'` with `missingTokenClass:'<class>'` naming the failed
       class. NOTE the close path further discriminates `evidence_stale`/`evidence_unbound`
       (L1368-1370) off `shapeCheck.evidenceStale`/`evidenceUnbound`. Settled for `--verify`:
       ADDITIVELY surface those discriminators too — set `reason` to `evidence_stale` /
       `evidence_unbound` when the corresponding flag is set, else `evidence_shape_failed`
       (identical mapping to L1368-1370). This keeps `--verify` and the close gate returning
       the SAME `reason` for the SAME on-disk file (no verify/close skew). `missingTokenClass`
       is always populated from `shapeCheck.missingTokenClass`.

### ROLE_TOKEN_REGISTRY source (settled, no new copy)
The registry is defined ONCE in `scripts/kaola-workflow-plan-validator.js` L96-104 and exported
(L2099). `adaptive-node.js` already imports it lazily in `seedEvidenceFile` (L270) and the
open-ready map (L2466). `--verify` does NOT need to import the registry DIRECTLY — it delegates
to `checkEvidenceShape`, whose per-role logic is the runtime expression of that registry. If a
`required_tokens` LIST is needed in the verify payload, derive it the existing way
(`(ROLE_TOKEN_REGISTRY[role] || ['evidence-binding']).slice()`); do NOT hand-roll a second
registry literal in adaptive-node.js (that is the exact #383-family "fix present where named,
absent at sibling" drift the audit calls out).

### CLI wiring (in `main()`, the record-evidence branch ~L2996-3008)
```
} else if (subcommand === 'record-evidence') {
  if (!nodeId) {
    result = { result:'refuse', errors:['--node-id required for record-evidence'] };
  } else if (args.indexOf('--verify') >= 0) {
    result = runVerifyEvidence({ planPath, project, nodeId, readFile, cacheExists });
  } else if (!hasStdin) {
    result = { result:'refuse', errors:['--stdin or --verify required for record-evidence'] };
  } else {
    /* existing stdin write path, unchanged */
  }
}
```
Update the `--help`/usage block (L2872) to list the `--verify` line. Update the header
banner comment (L15) to document `record-evidence --verify` as READ-ONLY.

### Deprecation note
`--stdin` stays this release for compat; a follow-up removes it (FLAG for a future issue — do
NOT remove it in n2). Provenance/telemetry (`appendNodeTiming(... 'evidence')`) belongs ONLY to
the write path; `--verify` writes nothing.

---

## 5. Boundary decision (explicit) — next-action.js / commit-node.js are NOT edited

The descriptor is assembled in the OPENER (adaptive-node.js) from data that `next-action` and
`commit-node` ALREADY return. Confirmed:

- `next-action` ALREADY returns, per node, everything `nodeInfo` needs: `id`, `role`, `model`
  (resolved), `declared_write_set` (raw cell), `shape` (computeNextAction L117-124). No new
  field is required there for items §1/§2/§3.
- `commit-node` ALREADY returns `recordBase.base` (the baseline SHA the openers slice to 12
  for the nonce). No new field required for §1.

NO edit to `scripts/kaola-workflow-next-action.js` or `scripts/kaola-workflow-commit-node.js`
(and therefore none to their codex/forge ports) is required by this issue. Both stay byte-frozen.

### Required NEW touchpoints — all INSIDE adaptive-node.js (in scope for n2):
- **§5.A working_dir plumbing.** The active worktree path is not on the node object and not in
  the openers today. `main()` resolves it ONCE and threads it into the three openers' opts:
  parse `worktree_path` from `workflow-state.md` (the regex already used at L1059:
  `/^worktree_path:\s*(.+)$/m`), fall back to `repoRoot` when absent/unmirrored. Pass
  `working_dir` through `runOpenNext`/`runOpenReady`/`runCloseAndOpenNext` opts → into each
  `buildDispatch(... { working_dir })` context. This is local to adaptive-node.js (+ its
  generated ports via edition-sync) — NOT a next-action/commit-node change.
- **GATE_ROLES promotion** to module level (§3a) — local refactor, no aggregator touch.
- **new helpers** `buildDispatch`, `deriveGuards`, `writeSetTouchesGeneratedPort`,
  `runVerifyEvidence` — all local to adaptive-node.js.

### FLAGS for plan-repair (do NOT silently expand scope):
- **FLAG-A (forge_rider).** No forge-rider value source exists. n2 emits `forge_rider: null`
  (constant placeholder). If the owner requires a concrete per-edition rider STRING, that is a
  scope addition needing a plan-repair node (it implies an edition-keyed constant +
  cross-edition propagation to the 4 ports + possibly the 6 prose surfaces). Surface, do not
  invent.
- **FLAG-B (goal_line).** The node's goal/description is NOT on the next-action node object
  (only id/role/dependsOn/model/declared_write_set/shape). Emitting a REAL `goal_line` would
  require next-action.js to surface the `## Nodes` description column — a next-action change,
  hence a plan-repair (and a 4-port + frozen-aggregator change). This release: OMIT `goal_line`
  (key absent). The `goal_line?` optionality in §1 documents the forward shape only.

Both FLAGS keep the four generated aggregators (next-action, commit-node and their ports)
untouched this issue, honoring the brief's boundary.

---

## Self-check — n2 acceptance criteria (testable)
1. `buildDispatch` is the ONLY producer of a `dispatch` object; all three openers call it.
2. For an identical node, `open-next`.opened.dispatch === `close-and-open-next`.opened.dispatch
   field-for-field (the #411 anti-drift assertion).
3. `deriveGuards`: gate role → ['read-only']; tdd-guide → ['RED-fixture-in-$TMPDIR']; a node
   whose write set contains a generated-port sibling → includes 'sync:editions'; a plain
   write node with none of these → [].
4. `record-evidence --verify --node-id N` on a well-formed, correctly-bound evidence file →
   `{result:'ok'}`; on a missing token → `{result:'refuse', reason:'evidence_shape_failed',
   missingTokenClass:'<class>'}`; on a stale/unbound nonce → reason `evidence_stale`/
   `evidence_unbound` (matching the close gate); writes NOTHING to disk.
5. `next-action.js` and `commit-node.js` (and their 4 ports) are byte-unchanged.
6. adaptive-node.js node write set includes its own generated-aggregator sibling set
   (canonical + codex + gitlab + gitea) so the #431 freeze-wall passes; all 4 npm chains green.
