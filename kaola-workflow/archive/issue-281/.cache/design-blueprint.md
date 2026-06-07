# design-blueprint evidence — issue #281 parallel ready-set execution

Read-only `code-architect` blueprint. Downstream nodes (design-note, aggregator-core,
next-action-core, forge-forks, registration, contracts, plan-run-semantics,
planner-profile) build directly from this. Concrete file/line anchors cited throughout.

## ORCHESTRATOR CORRECTION (binds all impl nodes) — BATCH_STATES placement
The architect proposed a frozen `BATCH_STATES` vocabulary in `kaola-workflow-adaptive-schema.js`.
**DO NOT modify `adaptive-schema.js`.** No node in the frozen plan declares any
`*adaptive-schema.js` path in its write set, so the per-node barrier WOULD REFUSE that write.
Instead define `const BATCH_STATES = Object.freeze(['open','dispatched','sealed','joining','joined'])`
**inside `kaola-workflow-parallel-batch.js`** (in the aggregator-core write set; the renamed
forge forks carry it verbatim). This keeps the frozen plan executable with zero schema edits.

## 0. The frame
Harness's ONLY real concurrency = the MAIN SESSION issuing multiple `Agent()` calls in ONE
message. A script cannot spawn agents; a subagent cannot dispatch a subagent. Split:
- `kaola-workflow-parallel-batch.js` owns batch STATE ONLY; never dispatches; PURE COMPOSITION
  over next-action.js + commit-node.js (+ plan-validator.js), mirroring how adaptive-node.js
  shells siblings via execFileSync (adaptive-node.js:66-75) and never require()-and-mutates them.
- plan-run SKILL/command (main session) owns concurrent DISPATCH: open batch → multiple Agent()
  in one message → record evidence per member → seal → join → advance.
A green plan-run is NOT evidence of wall-clock parallelism. Unit tests prove STATE correctness.

## Design Decisions
- **D1 — next-action.js purely additive.** Leave `readySet`, `nextNode`, `allDone`, and the
  stall predicate BYTE-UNCHANGED (next-action.js:62,65-91,96). ADD two pure-subset fields:
  `readyPending` = readySet members whose OWN status === 'pending' (the openable frontier);
  `active` = every node whose own status === 'in_progress' (1 per legacy run, N per batch).
  Rationale: readySet still includes in_progress nodes (excludes only TERMINAL), so nextNode
  = readySet[0] keeps working AND a fully-in_progress frontier does NOT trip the deadlock
  refusal at line 86. test-next-action.js existing assertions must pass UNCHANGED (back-compat).
- **D2 — manifest at `kaola-workflow/{project}/.cache/active-batch.json`.** Single active batch;
  project-local; NON-HASHED (hash covers only ## Meta + ## Nodes, schema:70-73); sits beside
  `barrier-base-{nodeId}` SHA files (validator:986) and `.cache/{node-id}.md` evidence; survives
  a lost/regenerated workflow-state.md. Not the ledger (that's single-boolean markers like
  consent_halt); structured multi-field data → JSON in the non-hashed .cache lane.
- **D3 — BATCH_STATES closed vocabulary** = open → dispatched → sealed → joining → joined.
  KEEP IN parallel-batch.js (see correction above).
- **D4 — batches add ZERO new barrier/gate surface.** A batch opens/seals N nodes vs 1. Each
  member seals through the UNCHANGED per-node `commit-node --node-id N` barrier (own baseline
  diff, validator:1019-1048). --gate-verify/--verdict-check operate over ## Node Ledger + .cache.
  Phase-6 whole-plan --barrier-check stays the union floor (validator:1049-1058). Compatibility
  holds because there is NO new machinery — only N invocations of existing per-node machinery.
- **D5 — ordered capability.** Read-only members (empty write set) need no worktree isolation
  and no join. Write-role fanout members need isolated node worktrees + validator-proven disjoint
  write sets + idempotent path-scoped parent joins. seal/join are NO-OPS for read-only members,
  real work for write-role. Read-only ships first/complete; write-role is the fuller capability.

## 1. next-action.js change (AC#1/AC#5)
Add after the existing readySet/allDone block (do NOT touch it):
```js
const readyPending = readySet.filter(n => st(n.id) === 'pending');
const active = nodes.filter(n => st(n.id) === 'in_progress').map(n => ({
  id:n.id, role:n.role, dependsOn:n.dependsOn, model:resolveModel(n.role),
  declared_write_set:n.writeSetRaw, shape:n.shape.kind }));
```
Return: `{ result:'ok', readySet, nextNode: readySet[0]||null, allDone, readyPending, active }`.
readyPending = the batch frontier the scheduler opens; active.length>1 = the AC#5 multi-in_progress
signal. The byte-identical claude pair + the two renamed forge forks mirror the same addition.

## 2. parallel-batch.js subcommands (CLI mirrors adaptive-node.js:11-20: `<sub> --project P --json`)
Resolve planPath/statePath/cacheDir via getRoot()+path.join(repoRoot,'kaola-workflow',project,...)
(adaptive-node.js:40-49,774-778). Manifest path = path.join(cacheDir,'active-batch.json').
Sibling-script filename constants (the ONLY lines the forge forks rename):
`NEXT_ACTION='kaola-workflow-next-action.js'; COMMIT_NODE='kaola-workflow-commit-node.js';
VALIDATOR='kaola-workflow-plan-validator.js'`. Reuse shellNode (adaptive-node.js:66-75).
For ledger flips, `require('./kaola-workflow-adaptive-node').spliceLedgerNode` (exported at
:834-843; it is PURE — importing a pure splicer is composition; mutation happens via the
aggregator's own writeFile) OR copy an equivalently-guarded pure splice. tdd-guide's call.

- **open-batch --project P [--max N] --json**: shell next-action; members = readyPending; if
  empty → `{result:'ok',allDone,opened:[]}` (defers to legacy loop / Phase-6). Eligibility:
  all-read-only → eligible no isolation; all-write-role over pairwise-disjoint sets → eligible
  (re-confirm disjoint, fail-closed on overlap); NEVER mix read-only + write-role in one batch
  (open the read-only subset first); cap min(readyPending.length, FANOUT_CAP=4 [schema:44, env
  KAOLA_FANOUT_CAP], --max). Flip each member ledger row to in_progress (allowFrom:['pending']),
  write plan once. For each: shell `commit-node --node-id id --start --json` (idempotent baseline,
  validator:1003-1017) — identical to runOpenNext:442-453, looped N. Write manifest state:'open'.
  Output `{result:'ok',batchId,state:'open',members:[{id,role,model,declared_write_set,
  kind:'read_only'|'write_role',baseline,worktreePath:null}],allDone:false}`. Refuse shapes:
  next_action_failed / not_disjoint / baseline_failed / node_not_in_ledger.
- **seal-member --project P --node-id N --json**: shell `commit-node --node-id N --json`
  (per-node barrier, validator:1028-1048 — identical to runCloseAndOpenNext step b, adaptive-node:528).
  On ok: ledger row → complete (allowFrom:['in_progress','n/a']) + append compliance row
  (adaptive-node:550-565) + selector routing if applicable (:567-590); manifest member sealed:true.
  Does NOT advance. Refuse on barrier fail → no close.
- **seal --project P --json**: seal every still-open member in document order; manifest → 'sealed'
  only when ALL members complete/n a. Output `{result,state,sealed:[],pending:[],failures:[]}`.
- **join --project P --json**: precondition manifest state 'sealed' else refuse not_all_sealed.
  No-op for all-read-only batch. For each write-role member with worktreePath: path-scoped
  `git -C <parent> checkout <member-ref> -- <each declared path>` (disjoint → conflict-free),
  staged into parent. IDEMPOTENT (re-checkout of identical content is a no-op). Crash mid-join →
  manifest state 'joining' + per-member joined flags; resume re-runs only unmerged remainder. On
  full success manifest → 'joined'; orchestrator deletes manifest + re-enters next-action.
  Output `{result:'ok',state:'joined',joined:[],skipped_read_only:[]}`.
- **status --project P --json**: read-only; returns parsed manifest (or {active:false}) +
  cross-check manifest members vs ledger statuses vs .cache evidence/baseline presence. Never mutates.

Manifest shape: `{batchId,state,kind:'read_only'|'write_role',members:[{id,role,
declared_write_set,baseline,worktreePath,sealed,joined}],createdAt}`.

## 3. Lifecycle states for crash/resume (AC#6) — resume is a PURE function of durable artifacts
Rule (AC#5): multiple in_progress ledger rows are LEGAL ONLY with a valid active manifest whose
member set EXACTLY equals them; else typed refusal/repair.
- open: manifest 'open'; N rows in_progress; N baselines; NO member evidence → re-dispatch all
  (baselines idempotent).
- dispatched: manifest 'open'/'dispatched'; some members have .cache/{id}.md → per-member
  recovery as single-node (SKILL:76-81): absent evidence → re-dispatch; present evidence but
  ledger still in_progress → re-run seal-member ONLY (do not re-dispatch).
- sealed: manifest 'sealed'; all member rows complete/n a → if write_role run join; if read-only
  delete manifest + re-enter next-action.
- joining: manifest 'joining' + joined flags → re-run join (idempotent on merged members).
- joined: transient → delete manifest, re-enter next-action.
orient change: runOrient (adaptive-node:341-371) today finds FIRST in_progress and break@357
(assumes ONE active node). Change: enumerate ALL in_progress rows; read parallel-batch status;
legality gate: (≤1 in_progress AND no manifest → legacy path, keep inProgressNode/cacheState
fields) | (≥1 in_progress AND manifest present AND member-set equals in_progress set → valid
batch, return new `batch` field) | (>1 in_progress AND no manifest/mismatch → typed refuse
orphan_multi_in_progress). Keep consentHalt/escalatedToFull/allDone unchanged. Return adds
inProgressNodes:[...] and batch:{state,members:[{id,cacheState,sealed}]}|null.

## 4. Read-only first, write-role second (AC#2/AC#3)
Read-only: no isolation/join; open-batch flips in_progress + records empty-diff baseline; SKILL
dispatches all N in one message, per-instance evidence .cache/{role}-{claim-id}.md (plan-run:256);
seal-member barriers each (empty declared set → empty diff → trivially passes); downstream opens
once all complete. FULLY FEASIBLE today (Fanout-And-Synthesize / Adversarial-Verification / quorum).
Write-role: each member in isolated node worktree; baseline keyed by (projTag,node-id) ref
(validator:987-991) so N concurrent members never clobber; sealed against own worktree/baseline
(existing per-node barrier catches lane overflow); join merges disjoint paths idempotently (no
attribution ambiguity — each path belongs to exactly one member, disjointness proven at freeze +
re-confirmed in open-batch). Downstream stays CLOSED automatically: next-action readiness requires
all depends_on TERMINAL (next-action:70), so a downstream node won't enter readyPending until all
members terminal. No new gate.

## 5. plan-run protocol: "one role node" → "one FRONTIER UNIT"
Frontier unit = a single node (legacy, when readyPending has one openable node or a serial chain)
OR a batch (when readyPending has ≥2 eligible siblings). THE SCRIPT NEVER DISPATCHES.
1. orient → judge resume (batch-aware).
2. Decide unit from next-action readyPending: ≥2 eligible siblings → batch; else single-node.
3. Single-node unit: today's open-next → dispatch → record-evidence → close-and-open-next. ZERO change.
4. Batch unit: (a) parallel-batch open-batch; (b) CONCURRENT DISPATCH = multiple Agent() in ONE
   message, one per member, subagent_type=member role, model= per member, write-role members carry
   `Working directory: <member worktree>`, read-only carry shared ${ACTIVE_WORKTREE_PATH}; (c)
   record-evidence per member; (d) parallel-batch seal; (e) parallel-batch join (no-op read-only)
   + delete manifest; (f) re-enter next-action — terminal members unblock downstream.
5. write-halt governance (consent/security/test_thrash) unchanged, applies per member.
Bake into prose: "The script manages batch STATE; the orchestrator (main session) owns DISPATCH.
The only true concurrency is the main session issuing multiple Agent() calls in one message;
kaola-workflow-parallel-batch.js never spawns an agent."

## 6. workflow-planner efficient-DAG instruction (canonical string, byte-identical ×4 so contracts assertIncludes matches)
"Author EFFICIENT DAGs, not merely valid DAGs. Minimize the safe critical path; expose
independent work as siblings (a shared ready frontier) so the executor can open them as one batch;
serialize only for true dependencies, shared file lanes, selectors, loops, or gates. Read-only
verification/research siblings are zero-blast-radius — prefer fanning them out. Write-role siblings
must declare disjoint write sets to be batch-eligible."

## 7. Gate/verdict/Phase-6 compatibility (AC#7) — CONFIRMED, zero new surface
per-node barrier = N× unchanged commit-node --node-id (commit-node:91-110; validator:1028-1048);
--gate-verify over ## Node Ledger (validator:980-984) — batch produces normal complete rows;
--verdict-check per-node informational/whole-plan blocking (commit-node:107-120) — read-only
skeptic batch is exactly the quorum case (#251/#279); Phase-6 --barrier-check union floor
(validator:1049-1058) — after join all member writes in parent tree, covered by union allowlist.

## 8. Four-edition parity (AC#8)
parallel-batch.js: root + claude-plugin BYTE-IDENTICAL pair → add 'kaola-workflow-parallel-batch.js'
to COMMON_SCRIPTS (validate-script-sync:39-65; compare loop 147-155). Forge forks RENAMED:
kaola-gitlab-workflow-parallel-batch.js, kaola-gitea-workflow-parallel-batch.js (rename only the
NEXT_ACTION/COMMIT_NODE/VALIDATOR sibling consts + the spliceLedger require path to forge-named
siblings — same one-line discipline as commit-node.js:31-37).
next-action.js: byte-identical root↔claude (already COMMON_SCRIPTS:54) + two renamed forge forks.
adaptive-schema.js: NOT TOUCHED (BATCH_STATES lives in parallel-batch.js per correction).
install.sh: add base name to github/codex block + kaola-gitlab-* to gitlab block + kaola-gitea-*
to gitea block (3 SUPPORT_SCRIPT_NAMES arrays ~142/174/208).
package.json: add `node scripts/test-parallel-batch.js` to claude test chain (~:36); test file is
ROOT-ONLY (shared logic covers all editions, like test-next-action.js/test-adaptive-node.js).
Contracts: root validate-workflow-contracts.js + claude pair add assert(exists(parallel-batch.js))
+ assertIncludes(install.sh, names) (#272 pattern ~:521-548); root validate-kaola-workflow-contracts.js
asserts pluginRoot copy exists (~:283-288); two forge validate-kaola-workflow-{forge}-contracts.js
add fork name to script-name enumeration (gitlab ~:160-177).
CONFIRMED NON-SURFACES (do not edit): validate-script-sync.js + validate-kaola-workflow-contracts.js
have NO claude byte-identical sibling (root-only). Forge TEST files do NOT enumerate aggregator
scripts (grep -c=0) — a count-bump there is spurious; SKIP.

## 9. Honest infeasibility (record in the design note; do not silently drop)
- Wall-clock parallelism NOT demonstrable by the aggregator or its unit tests — a script can't
  dispatch agents. The aggregator provides STATE machinery only; dispatch (the one real concurrency
  primitive: multiple Agent() in one message) lives in the SKILL and runs only at host runtime.
  test-parallel-batch.js proves state correctness, NOT concurrency. State this plainly.
- The BUILD of this feature uses ZERO concurrency (runs through the installed one-node executor);
  the BUILD DAG is sequential by design. The FEATURE supports write-role fanout; building it doesn't.
  Consistent, not contradictory.
- Write-role join is the genuine hard edge / honest partial: read-only batches (AC#2) ship complete;
  write-role joins (AC#3) depend on host worktree support. Design handles it via (a) re-confirm
  disjointness in open-batch fail-closed, (b) seal each member against its own baseline (existing
  barrier catches overflow), (c) path-scoped + idempotent join recovers a partial/crashed join.
  Where the host lacks isolated worktrees, the write-role frontier DEGRADES TO SERIALIZED execution
  (open members one at a time) — correctness preserved, parallelism forgone. Document as honest
  partial, not a silent drop.

## Verification ("Verified" =)
`node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough simulation passed")
+ `npm test` (now running test-parallel-batch.js after the package.json edit) + new
test-parallel-batch.js + test-next-action.js additions + contract presence-assertions all green.
Executor-consistency trap: contract presence-assertion STRINGS must BYTE-MATCH the prose the
plan-run-semantics + planner-profile nodes add ("frontier unit"/"efficient DAG"). Byte-identity +
assertion-matches-prose only need to hold at FINALIZE (per-node barrier checks write-set
containment, not npm test). Keep substrings stable.
