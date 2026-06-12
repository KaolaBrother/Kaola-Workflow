evidence-binding: n1-architect-finalize-contract f8d210c9afe3

# Shared Contract: Finalize / Closure / Roadmap / Bundle-Claim (#426 / #427 / #428 / #430)

## 0. Orientation — what's actually true in the code today (verified, read-only)

- **Byte-pair scope.** `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` are **byte-identical** (pinned by `validate-script-sync.js:43` BYTE_IDENTICAL_GROUPS). Every edit to the root file MUST be applied byte-for-byte to the codex pair. The gitlab/gitea editions (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`) carry the SAME functions but with forge-specific bodies — they are NOT byte-identical and NOT caught by base-filename `find`.

- **Worktree detection idiom (already in the codebase, reuse it verbatim).**
  ```js
  const mainRoot   = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
  const linkedRoot = fs.realpathSync(root);
  // linked-worktree run  ⇔  mainRoot !== linkedRoot
  ```
  `getCoordRoot` (claim.js:170) runs `git rev-parse --git-common-dir`; `mainRootFromCoord` (claim.js:183) strips trailing `.git`. This idiom already appears four times in `archiveProjectDir`/`cmdFinalize` (lines 1506-1510, 1712-1714, 1739-1743, 1957-1961). Do not invent a new detector — factor/reuse this one.

- **Current archive ordering is a `renameSync`, not a copy.** `archiveProjectDir` (claim.js:1455) does `fs.renameSync(src, dest)` at line 1505 — moves the live worktree folder into `{worktreeRoot}/kaola-workflow/archive/{project}`, then at 1511-1514 deletes the main-repo live copy (`mainLive`) with `fs.rmSync(..., {recursive:true, force:true})`. **This is the #426 data-loss site**: the archive lands in the *worktree's* archive dir (removed when the worktree is removed at cmdFinalize:1758), while the main repo's copy is *deleted* — net result on the adaptive worktree sink is no durable archive in main and no `finalization-summary.md`.

- **`reconcileRoadmapForClosure` is single-rooted for the source unlink.** claim.js:1395. It `fs.unlinkSync`s only `path.join(root, 'kaola-workflow', '.roadmap', 'issue-N.md')` (the **worktree** root, line 1401-1408). The `mainRoot`-side block (1418-1444) only handles staged-ADD orphans via `git rm --cached` for files NOT on main's HEAD — it does NOT remove a main-repo `.roadmap/issue-N.md` that IS committed on main's HEAD. **This is the #428 site**.

- **No `gh issue close` exists in `cmdFinalize`.** Confirmed: zero hits for `issue', 'close'` in `cmdFinalize`. The only real closes are in `sink-merge.js:440` (primary) and `:481` (bundle members). `cmdFinalize` only **probes** state (lines 1860-1862) and records a disposition token `remote_issue_closed` + `close_disposition:'close_pending'`. **This is the #427 site**.

- **`cmdStartup` bundle path does NOT re-verify the claimed set.** claim.js:1208-1219 calls `claimExplicitBundle` but there is **no post-claim assertion** that the `issue_numbers` persisted to `workflow-state.md` equals `args.targetIssues`. **This is the #430 site.**

- **Receipt schema is closed.** `buildClosureReceipt` (claim.js:2551) filters to `CLOSURE_RECEIPT_FIELDS` (`closure-contract.js:20`) and **drops any key not in the schema** — extra fields must be **attached post-build** (Decision-5 trap, see existing precedent at claim.js:1891 `probe_degraded`, `:1896` `issue_numbers`). `closure-contract.js` is **byte-identical across all four trees** (BYTE_IDENTICAL_GROUPS). New receipt fields that should *survive the builder filter* go in `CLOSURE_RECEIPT_FIELDS`; new fields attached post-build do not need a schema entry but are invisible to invariant checks.

---

## 1. cmdFinalize step-ordering contract (#426)

### 1.1 The invariant

> For a linked-worktree finalize, the durable archive must exist in **main** and be **verified complete** before ANY live folder (worktree OR main) is deleted, and before the worktree is removed. A crash at any point must leave either (a) the pre-finalize state recoverable, or (b) a complete main archive — never a half-deleted in-between.

### 1.2 Mandated sequence (linked-worktree run only)

| Step | Operation | Landmark |
|------|-----------|---------|
| (a) | Resolve `mainRoot` + `linkedRoot` + `isLinkedRun = mainRoot && mainRoot !== linkedRoot` | hoist BEFORE `renameSync` (currently resolved AFTER it at line 1506 — **move it before**) |
| (b) | **Archive-COPY into main first.** `copyDir(src, mainArchiveDest)` — NOT rename. `copyDir` already exists (claim.js:2315). `mainArchiveDest = {mainRoot}/kaola-workflow/archive/{project}{suffix}` | replaces `fs.renameSync` for the linked run |
| (c) | **Verify archive completeness.** Assert `mainArchiveDest` exists AND contains `workflow-state.md`. Return typed `archive_incomplete` failure (do NOT proceed to deletions) if verification fails. | new helper `verifyArchiveComplete(dest, expectedFiles)` returning `{ok, missing:[...]}` |
| (d) | **Delete live folders in BOTH trees** — only after (c) passes: remove `src` (worktree live folder) AND `mainLive = {mainRoot}/kaola-workflow/{project}` | existing `mainLive` rm at 1511-1514 stays but moves AFTER copy+verify; add worktree-src removal |
| (e) | **Remove the worktree from `mainRoot` context.** Change `removeWorktree` cwd to `mainRoot` for the linked run so git is not operating from inside the directory it deletes. | `removeWorktree` (claim.js:363) — pass `mainRoot` as `cwd`; cmdFinalize:1758 call is `removeWorktree(root, args.project, folder)` |
| (f) | **Write `finalization-summary.md` / crash receipt BEFORE any deletion.** Target `mainArchiveDest` and flush before step (d). | reorder: `appendClosureBlock` (currently cmdFinalize:1943-1950) and summary sanitization (archiveProjectDir:1475-1500) must target `mainArchiveDest` and run before deletions |

### 1.3 Concrete shape for `archiveProjectDir`

Keep existing single-tree behavior for non-worktree runs (`mainRoot === linkedRoot`) — the current `renameSync` is fine there. Branch:

```js
// inside archiveProjectDir, replacing the renameSync block at ~1501-1514
let mainRoot, linkedRoot;
try {
  mainRoot   = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
  linkedRoot = fs.realpathSync(root);
} catch (_) { mainRoot = null; }
const isLinkedRun = mainRoot && mainRoot !== linkedRoot;

let dest;
if (isLinkedRun) {
  // (b) copy INTO main first
  const mainArchiveBase = path.join(mainRoot, 'kaola-workflow', 'archive');
  fs.mkdirSync(mainArchiveBase, { recursive: true });
  dest = path.join(mainArchiveBase, project + (suffix || ''));
  if (fs.existsSync(dest)) dest += '.archived-' + isoStamp();
  copyDir(src, dest);
  // (c) verify before any delete
  const v = verifyArchiveComplete(dest, ['workflow-state.md']);
  if (!v.ok) return { skipped: undefined, archived: false, archive_incomplete: true, missing: v.missing, dest };
  // (d) delete BOTH live copies (archive confirmed)
  fs.rmSync(src, { recursive: true, force: true });          // worktree live
  const mainLive = path.join(mainRoot, 'kaola-workflow', project);
  if (fs.existsSync(mainLive) && fs.realpathSync(mainLive) !== dest) {
    fs.rmSync(mainLive, { recursive: true, force: true });   // main live
  }
} else {
  // in-place: existing renameSync path unchanged
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  fs.mkdirSync(archiveBase, { recursive: true });
  dest = path.join(archiveBase, project + (suffix || ''));
  if (fs.existsSync(dest)) dest += '.archived-' + isoStamp();
  fs.renameSync(src, dest);
}
```

`verifyArchiveComplete(dest, expectedFiles)`:
```js
function verifyArchiveComplete(dest, expectedFiles) {
  const missing = [];
  if (!fs.existsSync(dest)) return { ok: false, missing: ['<dest>'] };
  for (const f of expectedFiles) {
    if (!fs.existsSync(path.join(dest, f))) missing.push(f);
  }
  return { ok: missing.length === 0, missing };
}
```

**Critical constraints for n2:**
- The `#324` summary sanitization (lines 1475-1500) operates on `src` BEFORE the move today. With copy-not-rename it must sanitize the copied `dest` files, OR sanitize `src` before copy (either works; sanitize-before-copy keeps the existing block in place — pick this to minimize churn).
- The `#395.2` resume backstop in `cmdFinalize` (lines 1707-1751) must be kept and updated: `result.dest` for a linked run must point at the **main** archive, and the backstop's `destDir` computation (line 1695) must become worktree-aware (`mainRoot`-rooted when linked): `path.join(isLinkedRun ? mainRoot : root, 'kaola-workflow', 'archive', args.project)`.
- `readActiveFolders` reads from `root` (worktree). After step (d) the worktree live folder is gone — that's correct.

---

## 2. Closure receipt schema (#426/#427/#428 shared)

### 2.1 `anchored_root` — schema field (survives builder)
Add to `CLOSURE_RECEIPT_FIELDS` (`closure-contract.js`, all four trees byte-identical):
```js
anchored_root: 'string',   // absolute path to the main repo root the finalize operated against
```
Populated in `cmdFinalize`'s `buildClosureReceipt(...)` steps object: `anchored_root: mainRoot` (equals `root` for an in-place run).

### 2.2 `closure` — POST-BUILD attached object (not a flat schema field)
The schema's flat tokens (`remote_issue_closed`, bundle arrays `closed_issues`/`failed_issue_closures`/`open_issues`) stay as-is for backward compat. Add a **structured roll-up** attached after `buildClosureReceipt` (Decision-5 trap precedent at line 1895):
```js
closureReceipt.closure = {
  attempted:       [...],   // every member we tried to close (issueNumbers || [issueNumber])
  closed:          closedIssues,
  failed:          failedIssueClosures,
  skipped_offline: OFFLINE ? attempted : [],
  kept_open:       keepIssueOpen ? attempted : [],
};
```
This is a **superset view** of the existing scattered arrays — n3 populates it from the same `closedIssues`/`failedIssueClosures`/`openIssues` buckets already computed at claim.js:1811-1853.

### 2.3 `roadmap_removed` — POST-BUILD attached object (per-member, per-root)
```js
closureReceipt.roadmap_removed = {
  <N>: { worktree: <bool>, main: <bool> },   // per member issue number
  ...
};
```
`true` = the `.roadmap/issue-N.md` source was removed (or already absent) in that root; `false` = it still exists after the attempt. n4 produces this from the dual-root reconcile (§4). For an in-place run `worktree` and `main` describe the SAME root — set both to the single result.

### 2.4 `roadmap_residue` — POST-BUILD attached typed-error array
```js
// attach ONLY when at least one source survived removal
closureReceipt.roadmap_residue = [
  { issue: N, root: 'worktree'|'main', path: '<abs>', reason: 'unlink_failed'|'still_present_on_head' },
  ...
];
```
Replaces the current silent omission: today `reconcileRoadmapForClosure` records `thisRemoved='failed'` (line 1411) but the failure is only reflected as a scalar token; a surviving main-repo source produces no receipt signal at all.

**Recommendation:** keep the existing invariant `roadmap-source-absent` as-is and add a new informational check: if `roadmap_residue.length > 0`, push a `roadmap-residue-clean` violation. Add `{ id: 'roadmap-residue-clean', description: 'No .roadmap/issue-N.md source survives in any tree after closure.' }` to `CLOSURE_INVARIANTS` (byte-identical, all four trees). **n3 owns the `closure-contract.js` edits** (adding `anchored_root` to `CLOSURE_RECEIPT_FIELDS` and `roadmap-residue-clean` to `CLOSURE_INVARIANTS`, all four byte-identical copies). n2/n4 attach their fields post-build.

---

## 3. #427 — closure execution (where `gh issue close` fires)

### 3.1 Call site
The actual `gh issue close` must fire **inside `cmdFinalize`**, in the window:
- **AFTER** archive copy+verify+deletions complete (preserves the `remote-closed-after-publish` invariant)
- **AFTER** the probe loop (existing claim.js:1808-1864), reusing the buckets already computed there

Concretely: a new block immediately after the probe/bucket computation (after line 1864, before `closePendingFinalize` is computed at 1872). It must run only when `!keepIssueOpen && !OFFLINE`.

### 3.2 Composition with the existing `close_pending` marker
- If `cmdFinalize` **successfully closes** a member → `closedIssues`, `remote_issue_closed` becomes `closed`/`already_closed`, `close_disposition` is left unset for that run.
- `close_pending` is now reserved for the narrow case where `cmdFinalize` is explicitly told NOT to close here. Keep `computeClosePendingFinalize` (claim.js:1872) but feed it the post-close token.

### 3.3 Idempotency (probe-before-close)
Mirror sink-merge's `#396.5` pattern (sink-merge.js:442-446) exactly:
```js
function closeIssueIdempotent(n, opts) {
  const probe = probeIssueState(n);
  if (probe.state === 'closed') return 'already_closed';
  if (probe.state === 'unavailable') return 'failed';
  try {
    ghExec(['issue', 'close', String(n), '--comment', 'Closed via finalize.'], opts);
    try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], opts); } catch (_) {}
    return 'closed';
  } catch (e) {
    return probeIssueState(n).state === 'closed' ? 'already_closed' : 'failed';
  }
}
```
Loop over `issueNumbers` (bundle) or `[issueNumber]` (scalar). The `opts` must be `{ cwd: mainRoot }` so `gh` runs in the main checkout (consistent with sink-merge's `forgeOpts = {cwd: mainRoot}` at sink-merge.js:433).

**Idempotency vs sink-merge:** both `cmdFinalize` and `sink-merge` now probe-before-close, whichever runs second sees `state==='closed'` and reports `already_closed` — no double-close, no false failure.

**Edition note for n3:** gitlab/gitea use `issueIsClosed(iid)` / `issueIid` instead of `probeIssueState`/`gh` (see kaola-gitlab-workflow-claim.js:1785). Port the *shape* (probe→close→reprobe), not the literal `gh` call.

---

## 4. #428 — dual-root roadmap removal in `reconcileRoadmapForClosure`

### 4.1 Current signature (keep it)
```js
function reconcileRoadmapForClosure(root, memberNumbers, primaryNumber, opts, mainRoot, linkedRoot)
```
`mainRoot`/`linkedRoot` are ALREADY passed by both callers (archiveProjectDir:1534, cmdFinalize:1744). The bug is the function only `unlinkSync`s the **worktree** path (line 1401-1408) and only does `git rm --cached` orphan cleanup on main (1418-1444) — it never removes a **committed** main-repo source.

### 4.2 The fix
Inside the per-member loop, after the worktree unlink, add a **main-root committed-source removal** for the linked run (`mainRoot && mainRoot !== linkedRoot`):

```js
// existing: worktree unlink (lines 1407-1413) → produces `thisRemoved`
let thisRemovedWorktree = thisRemoved;
let thisRemovedMain = (mainRoot && mainRoot !== linkedRoot) ? 'absent' : thisRemovedWorktree;

if (mainRoot && mainRoot !== linkedRoot && !(opts && opts.keepRoadmapSource)) {
  const mainRoadmapAbs = path.join(mainRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
  // (1) remove the working-tree file in main
  try { fs.unlinkSync(mainRoadmapAbs); thisRemovedMain = 'removed'; }
  catch (e) { thisRemovedMain = (e.code === 'ENOENT') ? 'absent' : 'failed'; }
  // (2) if committed on main's HEAD, stage the deletion so the sink commit drops it
  //     (existing 1418-1444 block handles staged-ADD-only orphan; this handles ON-HEAD committed case)
  try {
    const rel = path.join('kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
    execFileSync('git', ['-C', mainRoot, 'rm', '--cached', '--force', '--ignore-unmatch', rel],
      { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch (_) {}
}
```

Build per-member dual-root record and residue:
```js
roadmapByRoot[issueN] = {
  worktree: thisRemovedWorktree === 'removed' || thisRemovedWorktree === 'absent' || thisRemovedWorktree === 'kept',
  main:     thisRemovedMain     === 'removed' || thisRemovedMain     === 'absent' || thisRemovedMain     === 'kept',
};
if (!(opts && opts.keepRoadmapSource)) {
  if (fs.existsSync(roadmapFilePath))
    residue.push({ issue: issueN, root: 'worktree', path: roadmapFilePath, reason: 'unlink_failed' });
  if (mainRoot && mainRoot !== linkedRoot) {
    const mainAbs = path.join(mainRoot, 'kaola-workflow', '.roadmap', 'issue-' + issueN + '.md');
    if (fs.existsSync(mainAbs))
      residue.push({ issue: issueN, root: 'main', path: mainAbs, reason: 'unlink_failed' });
  }
}
```

### 4.3 Return shape (extend, don't break)
Current return (line 1452): `{ roadmap_source_removed, roadmap_regenerated, roadmap_sources_removed, roadmap_staged_reconciled }`. **Add** `roadmap_removed_by_root` (feeds §2.3) and `roadmap_residue` (feeds §2.4). Keep all existing keys.

### 4.4 Regeneration must cover both roots
After removing the main source files, also `regenerateRoadmap(mainRoot)` so main's mirror is self-consistent even before the merge lands. Add it guarded on `mainRoot !== linkedRoot`.

**keep-open interaction:** when `opts.keepRoadmapSource` is true, BOTH roots keep the source — set `thisRemovedMain='kept'`, skip the main unlink, emit NO residue.

---

## 5. #430 — `target_set_mismatch` in `cmdStartup`

### 5.1 Where
In `cmdStartup`, the bundle path (claim.js:1208-1219), **after** `claimExplicitBundle` returns `status:'acquired'` and **before** the `output(...)` at 1210.

### 5.2 The comparison
```js
if (bundleTargets) {
  const result = claimExplicitBundle(root, args);
  if (result.status === 'acquired') {
    const declared = (args.targetIssues || []).slice().sort((a, b) => a - b);
    let claimed = Array.isArray(result.issue_numbers) ? result.issue_numbers.slice().sort((a, b) => a - b) : [];
    // belt-and-suspenders: re-read workflow-state.md so a writeState that dropped/coerced a member cannot pass a stale in-memory array
    try {
      const sf = stateFile(root, result.project);
      const persisted = (field(fs.readFileSync(sf, 'utf8'), 'issue_numbers') || '')
        .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      if (persisted.length) claimed = persisted;
    } catch (_) {}
    const same = declared.length === claimed.length && declared.every((n, i) => n === claimed[i]);
    if (!same) {
      output({
        verdict: 'target_set_mismatch', status: 'target_set_mismatch', claim: 'none',
        selected_project: result.project || null, selected_issue: null,
        target_source: 'user_directed',
        declared_set: declared, claimed_set: claimed,
        reasoning: 'bundle claim persisted issue set ' + JSON.stringify(claimed) +
          ' does not match the declared --target-issues ' + JSON.stringify(declared) +
          '; refusing to proceed on a silently-collapsed bundle (#430).'
      }, 1);
      return;
    }
  }
  output(Object.assign({ /* existing 1210-1217 */ }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
  return;
}
```

### 5.3 Why read-back, not just `result.issue_numbers`
The `#393a` gate in `writeState` (claim.js:557-562) emits `issue_numbers` **only when `length > 1`** — a single-element "bundle" silently has no `issue_numbers` line, so `parseStateFile` reads it back as a **scalar** project. The read-back catches exactly this collapse: `declared=[42]`, `claimed=[]` → mismatch → typed refusal.

**Recommended:** refuse on ANY declared≠claimed (including 1-element), since the planner prose passing `--target-issues A,B,C` and getting a scalar claim is exactly the silent collapse the issue targets. Document the 1-element edge in the refusal reasoning.

### 5.4 Token registration
`target_set_mismatch` joins the existing `target_set_*` refusal family. Add a positive test (declared set with a dropped member → `target_set_mismatch`, exit 1) AND a negative (matching set → `acquired`, exit 0) to `scripts/test-bundle-claim.js` and `scripts/simulate-workflow-walkthrough.js`.

---

## 6. Cross-cutting guidance for n2–n5

### 6.1 Serialization order
1. **n2 (#426 ordering)** first — restructures `archiveProjectDir` (copy-not-rename, verify, dual-delete) and the `cmdFinalize` step order. Everything else layers on the new ordering.
2. **n4 (#428 dual-root roadmap)** second — extends `reconcileRoadmapForClosure`, which n2's new ordering already calls.
3. **n3 (#427 close execution)** third — adds the `gh issue close` block in `cmdFinalize` and the `closure` receipt roll-up; depends on n2's "archive published before close" ordering for the `remote-closed-after-publish` invariant.
4. **n5 (#430 claim-side)** last — only touches `cmdStartup` + `claimExplicitBundle` read-back; no dependency on n2–n4.

Note: The plan serializes as n2→n3→n4→n5 (the recommended ideal order would be n2→n4→n3→n5, but as long as n2 runs first and n3 runs after n2, the invariant is safe — n4's dual-root removal does not depend on n3's close block and both n3 and n4 layer on top of n2's archive ordering).

### 6.2 Receipt-field additions — single owner
**n3 owns the `closure-contract.js` edits** (adds `anchored_root` to `CLOSURE_RECEIPT_FIELDS` and `roadmap-residue-clean` to `CLOSURE_INVARIANTS`, all four byte-identical copies). n2/n4 attach their fields **post-build** (no schema edit needed). This keeps the byte-identical `closure-contract.js` edited by exactly one node.

### 6.3 Four-tree propagation (non-negotiable)
Every node's fix lands in **all four** claim files:
- `scripts/kaola-workflow-claim.js` (root) — primary
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — **byte-identical**, copy verbatim
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — edition port, forge-adapted
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — edition port, forge-adapted

And `closure-contract.js` in all four trees (byte-identical group, n3 only). Each node MUST run the full four-chain gate:
```
npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && \
  npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
```
Each node's declared write-set MUST include the two root+codex claim files PLUS the affected test files (`scripts/test-bundle-claim.js`, `scripts/test-claim-hardening.js`, `scripts/simulate-workflow-walkthrough.js`) — `scripts/test-*.js` are PRODUCTION, not isTestPath-exempt.

### 6.4 Crash-resume backstops must survive
The `#395.2`/`#395.4` resume backstops in `cmdFinalize` (lines 1707-1751) and the `#333` manual-archive backstop (1689-1706) are load-bearing for crash recovery and are exercised by the walkthrough. n2's copy-not-rename restructure MUST keep these convergent — after the change, `result.dest` for a linked run must point at the **main** archive, and the backstop's `destDir` computation (line 1695) must become worktree-aware (`mainRoot`-rooted when linked).

### 6.5 Key landmark strings (grep targets)
- `function archiveProjectDir`
- `fs.renameSync(src, dest)`
- `mainRootFromCoord(getCoordRoot(root))`
- `function reconcileRoadmapForClosure`
- `function cmdFinalize`
- `close_disposition`
- `function claimExplicitBundle`
- `if (bundleTargets)`
- `CLOSURE_RECEIPT_FIELDS`
- `CLOSURE_INVARIANTS`
