# Design Recipe — Issue #292: Complete write-role fanout batch joins (R3 gitCheckout ref-vs-path + AC#3)

Author: `design` node (code-architect, read-only). Consumed by `build` (tdd-guide), `build-forge` (implementer), `docs` (implementer).

## 0. Verified ground truth (probed against real files/git)

| Claim | Verification |
|---|---|
| `runJoin` calls `gitCheckout(m.worktreePath, paths)` | `scripts/kaola-workflow-parallel-batch.js:554` |
| io shim shells `git -C <projectDir> checkout <worktreePath> -- <paths>` | lines 667-674; `projectDir = repoRoot/kaola-workflow/{project}` (line 648) |
| `worktreePath` is ALWAYS `null` today | `runOpenBatch` line 326 — join path is dormant |
| False-green at join: `joined:true` set even when `worktreePath` falsy | line 552 guards checkout `if (m.worktreePath && ...)`, line 560 sets `joined:true` unconditionally |
| No test passes `gitCheckout` into `runJoin` | I5/I5b omit it; the shim git invocation is NEVER exercised — why R3 went undetected |
| False-green TWIN at seal | `sealOne` (377) + `runOpenBatch --start` (313) shell `commit-node` with the PARENT planPath → validator `findRepoRoot(dirname(planPath))` = repoRoot → baseline+barrier diff PARENT-scoped. A member writing in an isolated worktree → EMPTY parent diff → barrier trivially passes → lane overflow invisible. §6.2's "seals against its own worktree/baseline" is the TARGET, not today's code. |
| git `checkout <commit-SHA> -- <path>` works (sibling worktree, shared objects) | PROBE A |
| git `checkout <raw-tree-SHA> -- <path>` works | PROBE B |
| git `checkout <filesystem-path> -- <path>` → `fatal: invalid reference` | PROBE C (reproduces R3) |
| git `checkout <ref> -- <absent-path>` → pathspec did not match | PROBE D (deletion edge) |
| `findRepoRoot` resolves a LINKED worktree (`.git` FILE) | validator:81; probed member-scoped snapshot+diff sees member.js |
| `snapshotWorktree`/`anchorBase` NOT in `module.exports` | validator:1172+ → cannot `require()` |
| forge ports differ ONLY at line 5 header + consts 41-46 | shim 667-674 byte-identical ×4; claude copy byte-identical |
| Contracts presence-only; registrations exist from #281 | validate-workflow-contracts.js:620-623; forge :178/:199-200; install.sh:158/188/223; package.json:36 |

## 1. Design Decisions
- D1 — Re-implement the gc-safe snapshot recipe LOCALLY in parallel-batch.js (~12 lines); do NOT export validator internals (byte-synced across 4 editions; widens blast radius). Local helper is pure git → byte-identical ×4 automatically.
- D2 — member-ref = a gc-anchored COMMIT captured at SEAL, stored on the manifest member as `mergeRef`. Decouples join from worktree liveness; survives gc across crash (#239 pattern). join checks out `mergeRef`, NOT the worktree path.
- D3 — Member-scoped barrier via a per-member plan copy. `open-batch` copies `workflow-plan.md` into each member worktree's `kaola-workflow/{project}/`. BOTH the `--start` baseline AND the seal barrier shelled with the MEMBER planPath → findRepoRoot resolves the member worktree → member-scoped diff. Closes the false-green twin.
- D4 — False-green killed BY CONSTRUCTION via degraded mode. Capability-absent → `{result:'ok', degraded:true, reason:'worktree_unavailable', opened:[]}` ZERO mutation. Invariant: a write-role manifest exists ⇒ every member has a real `worktreePath` + `mergeRef`. Then runJoin falsy-`mergeRef` branch = corruption → fail-closed refuse, NEVER `joined:true`.
- D5 — Seed each member worktree from the parent's CURRENT (uncommitted) state, not bare HEAD (prior terminal nodes' writes uncommitted until sink). Snapshot parent → commit-tree → `git worktree add <path> <seedCommit>`. `--start` baseline recorded AFTER seeding so the barrier diff contains ONLY this member's writes (#239 over-attribution invariant, per-member).
- D6 — parent worktree root = repoRoot (active worktree), NOT projectDir. R3 `-C` fix targets repoRoot. Declared paths are repo-root-relative pathspecs.

## 2. Files to Modify
- `scripts/kaola-workflow-parallel-batch.js` (P0): R3 shim fix; local snapshotMember/anchorMergeRef helpers; worktree activation + degraded mode in runOpenBatch; member-scoped baseline/barrier; mergeRef capture in sealOne; fail-closed runJoin; cleanup.
- `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` (P0): BYTE-IDENTICAL copy.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js` (P0): same diff; ONLY line 5 header + consts 41-46 edition-renamed.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js` (P0): same as gitlab.
- `scripts/test-parallel-batch.js` (P0): add E1/E2/E3 subprocess-CLI tests (real git).
- `commands/kaola-workflow-plan-run.md` + 3 forge copies + SKILL (P1, docs node): degraded-mode JSON + orchestrator reaction.

NO new files. NO count-bump. Contracts presence-only; all registrations exist from #281. Do NOT add any contract to a write set. The build node's declared_write_set MUST explicitly enumerate ALL FOUR ports by edition-renamed filenames + test-parallel-batch.js.

## 3. Exact code recipe (base; apply byte-identically to all 4 ports)

### 3.1 R3 io-shim fix (main(), replacing 667-674)
```js
gitCheckout: (mergeRef, paths) => {
  try {
    execFileSync('git', ['-C', repoRoot, 'checkout', mergeRef, '--', ...paths], { encoding: 'utf8' });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: String(err && err.message || err) };
  }
},
```
runJoin line 554: `const res = gitCheckout(m.mergeRef, paths);`

### 3.2 Local gc-safe helpers (NEW, top-level, after getRoot)
```js
function snapshotMember(worktreeRoot, tag) {
  const os = require('os'); const fs = require('fs');
  const idx = path.join(os.tmpdir(), 'kw-batch-idx-' + process.pid + '-' + String(tag).replace(/[^A-Za-z0-9_-]/g, '_'));
  try { fs.unlinkSync(idx); } catch (_) {}
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: idx });
  try {
    try { execFileSync('git', ['-C', worktreeRoot, 'read-tree', 'HEAD'], { env, stdio: ['ignore','ignore','ignore'] }); } catch (_) {}
    execFileSync('git', ['-C', worktreeRoot, 'add', '-A'], { env, stdio: ['ignore','ignore','ignore'] });
    return execFileSync('git', ['-C', worktreeRoot, 'write-tree'], { env, encoding: 'utf8' }).trim();
  } finally { try { fs.unlinkSync(idx); } catch (_) {} }
}
function anchorMergeRef(repoRoot, refName, tree) {
  const env = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'kaola-workflow', GIT_AUTHOR_EMAIL: 'kaola-workflow@localhost',
    GIT_COMMITTER_NAME: 'kaola-workflow', GIT_COMMITTER_EMAIL: 'kaola-workflow@localhost',
  });
  const commit = execFileSync('git', ['-C', repoRoot, 'commit-tree', tree, '-m', 'kaola-workflow batch merge ref'], { env, encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', repoRoot, 'update-ref', refName, commit], { stdio: ['ignore','ignore','ignore'] });
  return commit;
}
```
Inject into io in main(): worktreeAdd (`git -C repoRoot worktree add --detach <wtPath> <seedCommit>`), worktreeRemove (`git -C repoRoot worktree remove --force <wtPath>`), snapshotMember, anchorMergeRef(refName,tree), repoRoot. All injectable for test seaming.

### 3.3 Worktree activation + degraded mode in runOpenBatch (write-role only)
After disjointness re-check (299) + capping (302), for kind==='write_role' ONLY, BEFORE baselines-first loop: snapshot parent → seedTree; if null → `{result:'ok',degraded:true,reason:'worktree_unavailable',opened:[],allDone:false}` (ZERO mutation). anchorMergeRef(seedTree)→seedCommit; if null → same degraded return.
Then per write-role member, BEFORE recording baseline: `git worktree add` under `path.join(repoRoot,'.kw','batch',projTag,m.id)`; mkdirp + copy plan to `<memberWt>/kaola-workflow/{project}/workflow-plan.md`; record baseline against MEMBER planPath; record worktreePath. On ANY add/copy failure → rollback every worktree created so far AND return degraded (zero ledger/manifest mutation — manifest still written LAST). `projTag = path.basename(projectDir)` (validator:1003). Read-only members unchanged (parent planPath, worktreePath null).

### 3.4 Member-scoped seal + mergeRef capture in sealOne (371-406)
```js
const isWriteRole = !!member.worktreePath;
const barrierPlanPath = isWriteRole
  ? path.join(member.worktreePath, 'kaola-workflow', ctx.project, 'workflow-plan.md')
  : planPath;
const barrierOut = shell(commitNodePath, [barrierPlanPath, '--node-id', member.id, '--json']);
if (barrierOut.exitCode !== 0 || barrierOut.result !== 'ok') {
  return { ok: false, reason: 'barrier_failed', barrierOut, manifest, planContent };
}
let mergeRef = member.mergeRef || null;
if (isWriteRole) {
  const tree = ctx.snapshotMember(member.worktreePath, 'merge-' + member.id);
  mergeRef = ctx.anchorMergeRef('refs/kaola-workflow/batch-merge/' + ctx.projTag + '/' + member.id, tree);
  if (!mergeRef) return { ok: false, reason: 'merge_ref_failed', manifest, planContent };
}
```
Manifest member flip also sets mergeRef: `m.id===member.id ? {...m, sealed:true, mergeRef} : m`. Ledger close/compliance/manifest write stay on PARENT plan; only barrier/snapshot are member-scoped. Thread project, projTag, snapshotMember, anchorMergeRef, repoRoot through sealOne ctx from runSealMember/runSeal.

### 3.5 Fail-closed runJoin (550-562)
```js
for (const m of writeRoleMembers) {
  if (m.joined) { joined.push(m.id); continue; }
  if (!m.mergeRef || typeof gitCheckout !== 'function') {
    return { result: 'refuse', reason: 'missing_merge_ref', nodeId: m.id, state: 'joining' };
  }
  const paths = Array.from(parseWriteSet(m.declared_write_set));
  const res = gitCheckout(m.mergeRef, paths);
  if (!res || res.ok !== true) {
    return { result: 'refuse', reason: 'join_failed', nodeId: m.id, detail: res && res.detail, state: 'joining' };
  }
  manifest = { ...manifest, members: manifest.members.map(x => x.id === m.id ? { ...x, joined: true } : x) };
  joined.push(m.id);
  // 3.6 cleanup: worktreeRemove(m.worktreePath) best-effort after success
}
```
Removes the `if (m.worktreePath && ...)` guard entirely — `joined:true` reachable ONLY after a real checkout. Idempotent+crash-safe: repeat skips m.joined; crash mid-join leaves manifest joining + per-member flags; re-run re-checks out ONLY unmerged (no-op on identical content; mergeRef gc-anchored).

### 3.6 Cleanup
Remove member worktrees in runJoin AFTER successful checkout (mergeRef already anchored): `worktreeRemove(m.worktreePath)` best-effort. mergeRef left in place (bounded by node count). Build node MUST verify `.kw/batch/` never enters the sink commit.

## 4. End-to-end test design (test-parallel-batch.js) — REAL git via subprocess CLI
Shared `makeRealGitRepo()`: git init $TMPDIR repo, config user.*, commit initial plan with two write-role siblings wa (decl wa.js) wb (decl wb.js) depending on complete a, plus finalize.
- E1 (core): open-batch → assert ok, kind write_role, two members non-null worktreePath. Write distinct content in each member worktree (wa.js→AAA, wb.js→BBB). Write .cache/wa.md, .cache/wb.md evidence. seal → assert state sealed + each member non-empty mergeRef. join → assert ok, state joined, joined [wa,wb]. **E1a** parent worktree contains wa.js=="AAA". **E1b** parent contains wb.js=="BBB". **E1c** second join → ok/joined/same (idempotent).
- E2 (no false-green at seal): member writes file OUTSIDE declared set → seal/seal-member → assert refuse, reason barrier_failed; member NOT sealed/joined. Proves member-scoped barrier sees overflow.
- E3 (degraded fallback): worktree-add unavailable / non-git dir → assert result ok, degraded true, reason worktree_unavailable, opened []; no manifest; ledger rows still pending.
Keep ALL existing P1-P6, I1-I7, R1/R2/R4a assertions BYTE-UNCHANGED. I2 not_disjoint still applies before worktree work.

## 5. Orchestrator reaction to degraded (docs node)
open-batch degraded:true → orchestrator MUST NOT batch-dispatch; log() the reason; fall back to single-node legacy path (open-next one at a time) for that frontier — serial write-role siblings, same lifecycle, correctness preserved, parallelism forgone (§10.3). JSON: `{result:'ok',degraded:true,reason:'worktree_unavailable',opened:[],allDone:false}`. Document at plan-run.md batch-path block (~183-237) + 3 forge copies + SKILL. Read-only batches unaffected.

## 6. Four-edition parity (mechanical mirror)
Diff byte-identical ×4 EXCEPT line 5 header + consts 41-46. Shim + ALL new helpers/logic byte-identical (zero edition token — pure git + repoRoot/project/projTag runtime values). Apply identical diff to all 4; gitlab/gitea keep ONLY their 7 renamed lines. validate-script-sync byte-compares base vs claude copy — keep identical.

## 7. Contract / count-bump check
NO bump. All presence-only, registrations exist from #281 (validate-workflow-contracts.js:620-623; validate-kaola-workflow-contracts.js:468-469; forge :178/:199-200; install.sh:158/188/223; package.json:36). Do NOT add any contract/test-enumeration to a write set.

## 8. Risks for adversarial-verify gate
1. Member-scoped barrier resolution rests on commit-node(member planPath)→findRepoRoot resolving member worktree (`.git` FILE, probed). E2 is the proof; gate must re-confirm seal refuses an out-of-lane member write.
2. Deletion edge (PROBE D): `git checkout <ref> -- <declared-path>` errors if member DELETED a declared path. mergeRef captures via `add -A` so deletion = absent from tree → checkout errors → join_failed. Scope assumes additive/modify; flag if deletion must be supported (needs git rm/checkout two-step).
3. Seed-from-current-state attribution: confirm --start baseline recorded AFTER worktree add <seedCommit> so prior nodes' writes cancel (no over-attribution).
4. gc between seal and join: mergeRef commit-tree+update-ref anchored. Confirm join uses stored mergeRef SHA, never a re-snapshot of a cleaned worktree.
5. `.kw/batch/` must not leak into sink: confirm cleanup + `.kw/` git-internal/ignored.
6. Two-file non-atomicity in open-batch: rollback removes created worktrees BEFORE any ledger flip (baselines-first preserved) → crash leaves zero orphan rows. Confirm rollback returns degraded with zero mutation.
