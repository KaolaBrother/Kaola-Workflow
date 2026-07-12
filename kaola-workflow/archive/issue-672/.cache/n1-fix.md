evidence-binding: n1-fix effb2a71ceaa

## Site 1 — synthesizeLevel leg-dirty probe (scripts/kaola-workflow-adaptive-node.js)

RED: `node scripts/test-adaptive-node.js` (pre-fix) — new S5-PROBE-FAILED-REFUSE regression, corrupting legA's worktree `.git` link (a broken git invocation, not a genuinely-missing leg) so `git -C legA status --porcelain` throws, while legA carries real uncommitted content (`ax.js`):
```
FAIL: S5-PROBE-FAILED-REFUSE: a leg-dirty probe failure refuses loudly (never silently treated clean), got {"ok":true,"mergeCommit":"395052cba137223e79e2e917232a538c2594617e"}
FAIL: S5-PROBE-FAILED-REFUSE: HEAD unchanged after the refuse (no partial merge landed, dropping A silently), got 395052cba137223e79e2e917232a538c2594617e vs base b61eed65f293a64662b172c3b3ab2bf9f132c714
adaptive-node tests FAILED (2 failures, 1787 passed)
```
This proves the live bug: the probe-error catch masked the failure as `dirty=''` (clean), so A's uncommitted `ax.js` was never captured/committed, the octopus merge proceeded with only B's branch, and `synth.ok===true` with a mergeCommit that silently omits A's content — the exact silent-merge-loss the issue describes.

GREEN: fixed the catch at the leg-dirty probe (`~:4522`, inside `synthesizeLevel`) to refuse loudly instead of defaulting `dirty=''`:
```js
let dirty = '';
try {
  dirty = execFileSync('git', ['-C', leg.legPath, 'status', '--porcelain'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
} catch (e) {
  // #672 fail-closed: a probe failure (>maxBuffer porcelain, a broken git invocation on the
  // leg, ...) must NEVER be read as "leg is clean" — that would silently OMIT real committed/
  // working leg content from the octopus merge below (never captured, never folded into M).
  // Refuse loudly instead of guessing clean — mirrors the leg_capture_failed typed refusal
  // just below for the symmetric capture-side failure.
  return { ok: false, reason: 'leg_dirty_probe_failed', nodeId: id, leg: id, detail: String((e && e.message) || e) };
}
if (dirty) { ... }
```
Fail-closed choice: LOUD REFUSE (typed `leg_dirty_probe_failed`), not conservative-fold. Chosen because it matches the function's existing error-handling idiom (the symmetric `leg_capture_failed` typed refusal for the capture-side failure two lines below, plus `merge_conflict`/`merge_head_unresolved`/`no_leg_branches`) and genuinely prevents silent loss — a refuse surfaces the problem to the orchestrator/operator immediately instead of guessing what "conservative fold" should mean for an unprobeable tree (which could itself mis-fold if the underlying git state is broken, not just oversized). The existing `GIT_MAX_BUFFER` (64MB) cap on this probe was already present — the catch-side fix was the missing half (the cap alone does not save you once a >cap tree throws).

`node scripts/test-adaptive-node.js` (post-fix): `adaptive-node tests passed (1789 assertions)` — 1787 baseline + 2 new (both S5-PROBE-FAILED-REFUSE assertions green).

## Site 2 — worktreeDirtyState probe failure (scripts/kaola-workflow-claim.js)

RED: `node scripts/test-claim-hardening.js` (pre-fix) — new #672 regression, a real legacy worktree under `<parent>/<repo>.kw/issue-96722` with its `.git` link corrupted (path EXISTS, `git status --porcelain` throws) and real content (`real-work.txt`), driven through the actual `legacy-worktree-cleanup --execute` subcommand:
```
FAIL: #672: removed must NOT include the unprobeable worktree, got ["/private/var/.../kw-672-repo-XXXXXX.kw/issue-96722"]
FAIL: #672: skipped_unprobeable must record the unprobeable worktree (fail LOUD, not silent), got {"dry_run":false,"removed":["/private/var/.../kw-672-repo-XXXXXX.kw/issue-96722"],"skipped_dirty":[],"stashed":[],"exported":[],"failed_preserve":[],"container_not_empty":"..."}
claim-hardening tests FAILED (2 failures, 171 passed)
```
This proves the live bug: `worktreeDirtyState`'s catch conflated "probe FAILED" with "path MISSING" (both returned `'missing'`), so `cmdLegacyWorktreeCleanup` routed the still-present, unprobeable worktree into the `state === 'missing'` branch (`git worktree prune` + unconditional `buckets.removed.push(wtPath)`) — falsely reporting it removed and disconnecting it from git's worktree registry (an orphaned, no-longer-tracked directory a future cleanup pass will never see or protect again), despite `real-work.txt` never having been proven clean or gone.

GREEN: fixed `worktreeDirtyState` (`~:480`) to distinguish the two cases, plus taught BOTH destructive consumers of the shared helper (`cmdStaleWorktreeCleanup` at `collectStale`'s call site `~:2859`, and `cmdLegacyWorktreeCleanup` at `~:3470`) to unconditionally KEEP an `'unprobeable'` leg — fixing `cmdStaleWorktreeCleanup` too was necessary, not scope creep: leaving it unfixed would have flipped its own probe-failure handling from the current "prune, mislabeled removed" bug into an actually-destructive `removeWorktree(...)` (`git worktree remove --force`) call, since `'unprobeable'` would otherwise match neither its `'dirty'` skip check nor its `'missing'` prune branch and fall through to the `else` force-remove branch — the shared helper's contract change demanded updating every consumer to stay correct.
```js
function worktreeDirtyState(wtPath) {
  if (!fs.existsSync(wtPath)) return 'missing';
  try {
    const out = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: GIT_MAX_BUFFER });
    return out.trim().length > 0 ? 'dirty' : 'clean';
  } catch (_) {
    // #672 fail-closed: the path EXISTS but the probe itself failed (>maxBuffer porcelain, a
    // corrupted/broken git invocation, a transient lock, ...) — this must NEVER be read as
    // 'missing' (a destructive consumer treats 'missing' as prune-and-report-removed, silently
    // dropping git's tracking of real, possibly-dirty content that was merely unprobeable).
    // Report a distinct state every removal branch treats as KEEP.
    return 'unprobeable';
  }
}
```
In both `cmdStaleWorktreeCleanup` and `cmdLegacyWorktreeCleanup`, immediately after computing `state`:
```js
if (state === 'unprobeable') {
  (dryRun ? dryBuckets : buckets).skipped_unprobeable.push(wt.path /* or wtPath */);
  continue;
}
```
(each `buckets`/`dryBuckets` literal grew a `skipped_unprobeable: []` field.)

Fail-closed choice: the kept state is `'unprobeable'` — a NEW, distinct state from `'dirty'`, treated as an UNCONDITIONAL keep (no `--force`/`--archive`/`--export` override, unlike `'dirty'`, whose content IS known and can be consciously overridden). Rationale: with `'dirty'` the operator has seen real diff content and can choose to override; with `'unprobeable'` nothing about the content was ever confirmed, so forcing through is strictly riskier and gets no override path — confirmed the destructive consumer keeps on EVERY removal branch (the `'unprobeable'` check runs before the `'dirty'` skip-check, the dry-run branch, the archive/export pre-step, and the `'missing'`-vs-`else` removal split — it `continue`s out before any of them).

`node scripts/test-claim-hardening.js` (post-fix): `claim-hardening tests passed (173 assertions)` — 171 baseline + 2 new (both #672 assertions green; `real-work.txt` and the worktree directory verified to survive `--execute`, `removed` does not include it, `skipped_unprobeable` records it).

## Cross-edition sync

- `scripts/kaola-workflow-adaptive-node.js` is a GENERATED_AGGREGATOR: edited the canonical copy only, then `npm run sync:editions` regenerated `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex twin) + `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (`@generated` ports). Confirmed `leg_dirty_probe_failed` present in all three regenerated files.
- `scripts/kaola-workflow-claim.js` is COMMON canonical↔codex (regenerated by `sync:editions`, confirmed `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` picked up the fix via the same `sync:editions` run) with DIVERGENT hand-ported gitlab/gitea forge ports: hand-applied the identical `worktreeDirtyState` fix + the identical `skipped_unprobeable` guard in both `cmdStaleWorktreeCleanup` and `cmdLegacyWorktreeCleanup` to `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`.
- `node scripts/edition-sync.js --check` (post-sync + post-hand-port): `edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical.` — clean.

## GREEN proof summary

- `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1789 assertions)`
- `node scripts/test-claim-hardening.js` → `claim-hardening tests passed (173 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)
- `node scripts/edition-sync.js --check` → clean, all editions updated (10 write-set files: 2 canonical + 2 tests + 2 codex twins + 2 gitlab + 2 gitea)

Did NOT run the four npm chains (finalize's responsibility, per brief). Write-set stayed to exactly the 2 production scripts (×3 edition mirrors each = 6 forge files + 2 canonical = 8 code files) + 2 test files + this evidence file (10 write-set files + evidence). No ledger/state/baseline files touched.
