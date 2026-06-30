evidence-binding: n1-design 8df0c6f285eb
## Architecture Blueprint: Harden Concurrent Same-Repo Sessions (issue #579)

### Ground-truth findings
- `adaptive-schema.js` is require-clean (only inline `require('fs')`/`require('path')` in `writeFileAtomicReplace` at :575-576). Hosting the resolver needs only `child_process.execFileSync`+`fs`+`path` (inline-required) — NO new require cycle. It is a 4-tree BYTE_IDENTICAL group (validate-script-sync.js:178-184).
- Resolver is genuinely triplicated: `getCoordRoot`+`mainRootFromCoord` in claim.js:228-243; re-impl as `getMainRoot` in adaptive-node.js:325-333 (comment :318-324 "Mirrors claim.js getCoordRoot/mainRootFromCoord (local re-impl)"); `mainRootFromCoord` again in sink-merge.js:77-79 (already imports getCoordRoot from claim at sink-merge.js:6).
- RETIRED liveness scheme exists & is actively stripped: `removeLegacyStateBlocks` (claim.js:655-669, called :1755/:2108) deletes `## Lease` block + fields `session_id`,`owner_session_id`,`last_heartbeat`,`claim_comment_id`,`expires`. NEW marker MUST NOT reuse any of those names or a `## Lease` heading.
- `classifier.js` & `active-folders.js` already exist (modify, not create). Forge-rename is disk-driven (edition-sync.js:66-77); adaptive-schema keeps canonical name in every tree → its `require('./kaola-workflow-adaptive-schema')` token is never rewritten → new shared-resolver imports are byte-identical across 4 editions automatically.

### Design Decisions
- D1 — Resolver home = adaptive-schema.js: export `getCoordRoot(root)`, `mainRootFromCoord(coordRoot)`, `resolveMainRoot(root)`=mainRootFromCoord(getCoordRoot(root)).
- D2 — Keep call sites byte-stable via local re-bindings. claim.js: `const { getCoordRoot, mainRootFromCoord } = adaptiveSchema;` (all ~30 bare call sites unchanged: :299,304,513,1792,2088,2118,2147,2431,…). adaptive-node.js: collapse `getMainRoot` to one-line `return resolveMainRoot(root)` (call sites :4037,4630,4693,4800,5232 unchanged).
- D3 — `getRoot` (plain --show-toplevel) is NOT the split source; leave it per-file (active-folders.js:26-35, sink-merge.js:66-75, adaptive-node.js:307-316 all resolve current cwd toplevel identically, never diverge). Document scoping in ADR. Fallback if strict single-source wanted: add getRoot to adaptive-schema, import in sink-merge/adaptive-node, leave active-folders leaf copy.
- D4 — Record resolved root inside `writeState` itself (claim.js:552), not per-caller. writeState(root,data) already has root; compute `main_root: resolveMainRoot(root)` once → covers claimProject(:951), claimBundle(:1145), cmdStartup, every claim-time serialize in one edit; guarantees claim-time-only (no refresh).
- D5 — Liveness marker also stamped in writeState (claim-time only). Single insertion point makes "no periodic refresh" structurally true (partial edits go through updateState/regex, won't touch marker).
- D6 — Four-bucket lane logic = pure function in classifier.js; state fields surfaced by active-folders.js. Consumed in-process by claim.js (require classifier), not subprocess.
- D7 — Selectivity exempts only per-PROJECT lane folders, never shared durable state (kaola-workflow/.roadmap/, ROADMAP.md, config.json, archive/ stay STRICT).

### Deliverable 1 — Shared resolver (adaptive-schema.js)
Add near writeFileAtomicReplace/locateSection, export in block :699-768:
- `getCoordRoot(root)->string` — body lifted verbatim from claim.js:228-239 (one `git rev-parse --git-common-dir` shell-out via execFileSync, with existing fallback `path.join(root,'.git')`).
- `mainRootFromCoord(coordRoot)->string` — `path.basename(coordRoot)==='.git' ? path.dirname(coordRoot) : coordRoot`.
- `resolveMainRoot(root)->string` — mainRootFromCoord(getCoordRoot(root)); returns `root` on failure (byte-equiv to adaptive-node getMainRoot catch→return root).
- execFileSync inline-required inside getCoordRoot (preserve side-effect-free module-load convention).
DELETE claim.js:228-239 (getCoordRoot) + 241-243 (mainRootFromCoord); add `const { getCoordRoot, mainRootFromCoord } = adaptiveSchema;` after require at :21. module.exports (:3231-…) keeps getCoordRoot (now schema binding — preserves sink-merge.js:6 import + forge claim export-superset validate-script-sync.js:385) and ADDS mainRootFromCoord.
DELETE adaptive-node.js getMainRoot body 325-333; add resolveMainRoot to schema destructure :45; getMainRoot(root)→one-line `return resolveMainRoot(root);`. Update stale comment :318-324.
sink-merge.js: delete local mainRootFromCoord :77-79; extend destructure :6 `const { getCoordRoot, mainRootFromCoord, … } = require('./kaola-workflow-claim.js');`. Call sites :1415-1416,1432-1433 unchanged.

### Deliverable 2 — Recorded-root field
- Field name: `main_root`. Format: `main_root: <absolute path>` (value resolveMainRoot(root), NOT realpath'd at write — executor realpaths on read per adaptive-node.js:5233). Absolute, no trailing slash.
- Section: append to `## Sink` block in writeState immediately after run_posture line (claim.js:607).
- Write guard: `assertNoNewline(data.main_root || resolveMainRoot(root), 'main_root')` alongside guards :558-561.
- Read-back adaptive-node.js:5232: replace `let mainRoot = getMainRoot(repoRoot);` with read `/^main_root:\s*(.+)$/m` from LOCAL statePath(:5216); if present use it else getMainRoot(repoRoot); then fs.realpathSync (keep :5233). The #466 split-guard :5245-5266 (reads worktree_path independently) keeps working.
- active-folders.js: add `main_root: field(content,'main_root')` to parseStateFile return (:204-218) + readActiveFolders item (:256-272).

### Deliverable 3 — Liveness-marker schema
- Field names (verified NOT in removeLegacyStateBlocks retired set): `session_marker: <id>` (session identity), `claim_ts: <ISO-8601>` (claim-time timestamp / liveness anchor).
- Lives in kaola-workflow/<project>/workflow-state.md `## Sink` block (next to main_root), written by writeState, parsed by active-folders.parseStateFile.
- Session id source: `resolveSessionMarker(env)` (new in classifier.js) = env.KAOLA_SESSION_MARKER if set, else minted `'s-'+process.pid+'-'+Date.now().toString(36)`. Orchestrator sets KAOLA_SESSION_MARKER once per session so `mine` bucket is reliable across the run's multiple invocations. No refresh/heartbeat — stamped only in writeState.
- claim_ts value: new Date().toISOString().
- Parse-back: active-folders.parseStateFile adds session_marker + claim_ts; surfaced on readActiveFolders item.
- Staleness constant (single): `LANE_STALENESS_MS = 86_400_000` (24h), new export in adaptive-schema.js. Rationale: a run completes well within a day; a claim newer than 24h could be an active co-tenant → cautious `ask`; only >24h untouched → resumable leftover. Conservative = err toward ask/live. 48h is the more-conservative alt if preferred; keep one constant.

### Deliverable 4 — Four-bucket classifier API (classifier.js)
`classifyLane(lane, ctx) -> { bucket, reasoning }`
- Inputs: lane = readActiveFolders item {project, issue_number, issue_numbers, session_marker, claim_ts,…}; ctx = { ownSession, explicitResumeIssues:Set<number>, coTenantSignal:bool, now:Date.now() injectable, staleMs:default adaptiveSchema.LANE_STALENESS_MS injectable }.
- Buckets (exactly 4): 'mine' | 'live' | 'stale' | 'ambiguous'.
- Per-lane precedence ladder (top-down, first match wins):
  1. lane.session_marker===ctx.ownSession → 'mine'.
  2. ctx.explicitResumeIssues intersects {lane.issue_number}∪lane.issue_numbers → 'stale' (explicit "resume 790" adopts as resumable, beats liveness — fresh marker overridden by explicit instruction).
  3. ctx.coTenantSignal → 'live' (blanket "another session is working" → leave untouched).
  4. liveness: fresh = lane.claim_ts && (ctx.now - Date.parse(lane.claim_ts) < ctx.staleMs); fresh → 'ambiguous' (ask — don't stomp); not-fresh OR absent claim_ts → 'stale' (old/untouched + backward-compat default for pre-#579 markerless folders).
- Pure + unit-testable (inject now/staleMs/ctx). Helper resolveSessionMarker(env) also exported.
Consumption:
- claim.js cmdStatus (:2552-2565): annotate each active folder with lane_bucket=classifyLane(folder,ctx).bucket before output(...). Build ctx once (ownSession from resolveSessionMarker(process.env); coTenantSignal from process.env.KAOLA_COTENANT==='1'; explicitResumeIssues from --target-issue/KAOLA_TARGET_ISSUE).
- claim.js cmdResume (:1537-1573): before active.length>1 ambiguity refusal (:1544), classify candidates & partition: drop 'live'; resume candidates = 'stale'(+'mine'); if any 'ambiguous' (or >1 resume candidate) → keep resume_ambiguous refusal (carry lane_bucket per candidate). Realizes "live excluded from resume, stale resumable, ambiguous asks".
- issue-scout (n3 prose): reads claim status JSON; treats lane_bucket:'live' lanes' issues as occupied, selects DISJOINT issue, combining with existing write-set overlap verdict from classify(:632-682). Prompt-guidance only.

### Deliverable 5 — Clean-check selectivity predicate (adaptive-schema.js, exported)
- `PARKED_LANE_PREFIXES = ['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']` (POSIX repo-relative).
- `parsePorcelainPaths(statusText)->string[]`: split \n; drop 2-char XY status + leading space (path col 3); rename line (` -> `) take destination; strip surrounding quotes. Returns fwd-slash repo-relative paths.
- `isParkedLanePath(relPath, ownedProjects)->bool` (true=ignore as non-owned lane scratch): path under a PARKED_LANE_PREFIX with second segment seg, AND seg is project-shaped (NOT .roadmap, NOT archive, NOT .-leading, NOT ROADMAP.md/config.json for kaola-workflow/ prefix), AND seg ∉ ownedProjects. Everything else (real code src/scripts/docs, shared durable state, own <project> folders) → false → still dirty.
- Ownership: ownedProjects = [args.project](+bundle members) at sink; [project] at claim-time. Own in-progress state NOT exempted.
Touch-points (apply predicate ON TOP of each site's existing untracked posture — don't change --untracked-files flags):
- sink-merge.js assertCleanWorktree(:136-141): new sig assertCleanWorktree(mainRoot, ownedProjects). Existing `git status --porcelain --untracked-files=no` then assert(parsePorcelainPaths(status).filter(p=>!isParkedLanePath(p,ownedProjects)).length===0). Caller :1486 passes set.
- sink-merge.js assertWorktreeClean(:173-235): new sig assertWorktreeClean(mainRoot, branch, ownedProjects); same filter on INNER worktree status :210. Fail-closed probe-fault (:188-195,:217-225) byte-unchanged — unverifiable still DIRTY. Callers :870,:1490 pass set.
- claim.js treeDirty(:450-461): parked-aware variant treeDirty(root, ownedProjects) filtering parsePorcelainPaths by isParkedLanePath before .length>0 for in-place gates :902,:1080-1086. Preserve KAOLA_WORKFLOW_FORCE_STATUS_FAIL/catch→true exactly. worktreeDirtyState(:410-419) OUT of scope (gates destruction of a specific worktree).

### Move 3 (no-change-but-document)
ffMergeLoop(sink-merge.js:359) + true-conflict halt byte-unchanged. assertCleanWorktree/assertWorktreeClean run BEFORE ffMergeLoop(:1486-1530) so loosening non-owned exemption can't change conflict handling. "lane cleans own branch/worktree/folder only after own merge lands" documented in n3 finalize prose + n4 architecture/conventions. Existing assertNoLiveWorkflowFolder(:143-166) enforces own-folder-not-on-HEAD, untouched.

### Files to modify (build order)
1. adaptive-schema.js (resolver + LANE_STALENESS_MS + parked predicate/parser + exports) — primitives first.
2. active-folders.js (parseStateFile + readActiveFolders gain main_root/session_marker/claim_ts).
3. classifier.js (classifyLane 4-bucket+ladder; resolveSessionMarker; exports) — RED-first unit tests.
4. claim.js (rebind resolver, export mainRootFromCoord; writeState stamps main_root+session_marker+claim_ts +assertNoNewline; treeDirty parked-aware 902,1080; cmdStatus/cmdResume consume classifyLane).
5. sink-merge.js (drop local mainRootFromCoord, import from claim; assertCleanWorktree/assertWorktreeClean take ownedProjects+parked filter; ffMergeLoop untouched).
6. adaptive-node.js (getMainRoot→delegate resolveMainRoot; read main_root from statePath before re-derive 5232).
7. Edition mirrors: byte-copy codex twins {claim,sink-merge,classifier,active-folders,adaptive-schema}+adaptive-node; regenerate gitlab/gitea adaptive-node via `node scripts/edition-sync.js --write` (GENERATED_AGGREGATOR, never hand-edit); hand-port 4 renamed forge families (claim,sink-merge,classifier,active-folders) rename-normalized; keep schema base-named.
8. Tests/fixtures: test-claim-hardening.js (classifyLane 4-bucket+ladder, parked selectivity, recorded-root authority-split regression, update state fixtures e.g. :1034-1064), test-adaptive-node.js, simulate-workflow-walkthrough.js (two-lanes-in-one-checkout sim) + 4 forge/codex walkthroughs + test-{gitlab,gitea}-workflow-scripts.js (update claim-record-shape fixtures).
9. Validate: node scripts/validate-script-sync.js, node scripts/edition-sync.js --check, then 4 chains serially.

### RISKS / ordering constraints (implementer MUST respect)
1. RETIRED-FIELD COLLISION (highest): do NOT name marker fields session_id/last_heartbeat/expires/owner_session_id/claim_comment_id or use `## Lease` — removeLegacyStateBlocks(claim.js:655-669,:1755,:2108) erases on archive/close. session_marker/claim_ts/main_root verified non-matching.
2. adaptive-schema.js 4-tree byte-identical (validate-script-sync.js:178-184): all 4 copies byte-equal; keep inline-require convention (side-effect-free load).
3. adaptive-node.js GENERATED_AGGREGATOR (edition-sync.js:46-56): edit canonical+codex twin (byte-identical), then `node scripts/edition-sync.js --write` for gitlab/gitea ports; never hand-edit. require('./kaola-workflow-adaptive-schema') correctly base-named.
4. Forge export-superset (validate-script-sync.js:383-391): adding mainRootFromCoord to canonical claim.js exports → forge claim ports must export too; classifyLane/resolveSessionMarker to classifier.js → forge classifier ports too. Mirror exports in same node or superset guard reds.
5. getCoordRoot must stay exported by claim.js (re-export schema binding) — sink-merge.js:6 imports it, export-superset pins it.
6. #307 four-chain: n6 gate runs KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test — all 4 chains green sequential. Default auto SIGKILLs octopus-merge test in test-adaptive-node.js (touched here) — serial mandatory.
7. Fail-closed (precedence #1): parked filter applied AFTER existing probe-fault/catch→dirty/--untracked-files handling; unverifiable tree still DIRTY (sink-merge.js:188-225, claim.js:457-460). Exemption narrows WHICH known-clean states pass, never weakens unverifiable→dirty.
8. main_root readback path-asymmetry: executor reads main_root from LOCAL cwd-relative statePath(adaptive-node.js:5216) — in a linked worktree that's the worktree's copy (copied at provision, test-claim-hardening.js:1110-1112). Breaks chicken-and-egg with #466 guard. Absent main_root (legacy) → fall back getMainRoot — backward compatible.
9. Marker stamped only in writeState: verify no resume/update path re-invokes writeState on an existing live folder (partial edits use updateState/regex :2579-2582, stampTerminalState); re-stamping resets claim_ts & corrupts liveness.
10. n4 docs ordering: docs/workflow-state-contract.md (validation_test_consumes) documents main_root/session_marker/claim_ts, MUST land before n6 chain gate (n4→n5→n6 guarantees it).
