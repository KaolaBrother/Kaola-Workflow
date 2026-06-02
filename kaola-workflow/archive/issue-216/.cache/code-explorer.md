# Code Explorer — issue-216: sink-merge postMergeCleanup archive-safety guard

## Entry Points

- `scripts/kaola-workflow-sink-merge.js` — root GitHub edition, `main()` → `postMergeCleanup()`
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — Codex edition (byte-synced copy of root)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — GitLab edition with guard
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — Gitea edition with guard

---

## Finding 1: Root `postMergeCleanup` — exact code, no archive guard

**File:** `scripts/kaola-workflow-sink-merge.js`, lines 197–231

```javascript
function postMergeCleanup(args, mainRoot, wtRemovedStatus) {
  // Step 7 — Push (with merge-impossible auto-fallback)
  try {
    if (FORCE_MERGE_IMPOSSIBLE) {
      throw new Error('synthetic merge-impossible: ' + FORCE_MERGE_IMPOSSIBLE);
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'push', 'origin', 'main'], { encoding: 'utf8' });
    }
  } catch (e) {
    const token = classifyMergeError(e.stderr || e.message || '');
    if (token === null) {
      throw e;
    }
    // Classified merge-impossible: reset local main, write receipt, signal exit 3
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' }); // LINE 214
    } catch (_) {}
    const receiptPath = path.join(
      mainRoot,
      'kaola-workflow', args.project, '.cache', 'sink-fallback.json'
    );
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });   // LINE 220 — unconditional mkdir
    fs.writeFileSync(receiptPath, JSON.stringify({...}, null, 2) + '\n');
    return { exitCode: 3 };
  }
}
```

Flow: `classifyMergeError` returns token → `git reset --hard origin/main` (line 214) → `fs.mkdirSync` unconditionally creates `kaola-workflow/{project}/.cache/` (line 220) → `sink-fallback.json` written. No archive check exists.

---

## Finding 2: `cmdSinkFallback` archive guard

**File:** `scripts/kaola-workflow-claim.js`, lines 976–990

```javascript
function cmdSinkFallback() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(isSafeName(args.project), 'unsafe project name');
  if (!fs.existsSync(projectDir(root, args.project))) {        // LINE 981 — the guard
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  const reason = args.reason || 'merge fallback';
  updateState(root, args.project, content => content
    .replace(/^sink:.*$/m, 'sink: pr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'pr', reason });
}
```

Detection: `fs.existsSync(projectDir(root, args.project))` — if live dir absent, returns `{ updated: false, reason: 'project archived' }`.

**The bypass:** `postMergeCleanup` runs `fs.mkdirSync` first, creating `kaola-workflow/{project}/.cache/` which re-creates the parent. Guard at line 981 then finds the directory and falls through to `updateState`, finding no `workflow-state.md`.

---

## Finding 3: GitLab guard implementation

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

**Layer 1 — `runDirectMerge` early-exit, lines 320–328 (BEFORE any git operation):**

```javascript
const _liveDir = path.join(mainRoot, 'kaola-workflow', args.project);
const _archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
if (!fs.existsSync(_liveDir) && fs.existsSync(_archiveDir)) {
  process.stderr.write('sink-merge: project archived (' + args.project + '), skipping merge\n');
  return { exitCode: 3 };
}
```

**Layer 2 — `postMergeCleanup` defense-in-depth guard, lines 241–246 (after reset, before mkdir):**

```javascript
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
      return { exitCode: 3 };
    }
    const receiptPath = path.join(liveProjectDir, '.cache', 'sink-fallback.json');
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
```

Gitea edition (`kaola-gitea-workflow-sink-merge.js`) is byte-identical for this section.

Both forge editions also have `finalValidationPassed(root, args.project)` assert at top of `runDirectMerge` (line 308 in GitLab). Root has no such gate.

---

## Finding 4: git reset --hard interaction — CRITICAL

The reset is at line 214 (root) BEFORE any directory check.

**Real-git flow sequence:**
1. `cmdFinalize` commits the archive move: `git add kaola-workflow/ && git commit` → archive is in the feature branch commit
2. FF-merge to local `main` → archive commit is now on local `main`, `kaola-workflow/archive/{project}/` exists on disk
3. Push to `origin/main` fails (branch_protected). `origin/main` still at pre-archive commit.
4. `git reset --hard origin/main` resets local `main` to the pre-archive commit → **removes `kaola-workflow/archive/{project}/` from disk** (git-tracked)
5. After reset: `!exists(live) && exists(archive)` → both false. The forge guard condition is FALSE. Guard never fires.
6. `fs.mkdirSync` resurrects the live dir.

**Conclusion: The verbatim `postMergeCleanup` guard ported from GitLab is non-operative in a real-git flow.** The operative protection is the `runDirectMerge` early-exit (Layer 1) which fires BEFORE any git operation and before the archive can be wiped. Root has no `runDirectMerge` wrapper and no early-exit.

---

## Finding 5: Codex edition

**File:** `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`

Byte-for-byte copy of root. Same unconditional `fs.mkdirSync` at line 220, same `main()` with no `runDirectMerge` wrapper, no early-exit archive check. Gap is identical.

---

## Finding 6: `testFallbackGuardsAfterArchive` — why it passes despite the bug

**Files:**
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`, lines 24–82
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`, lines 24–82

**Test structure:**
1. Creates bare tmpdir — NO git repo init
2. Writes `liveDir/workflow-state.md` and `liveDir/phase6-summary.md` as plain files
3. Archives via `fs.renameSync(liveDir, archiveDest)` — NOT a git commit
4. Invokes sink-merge with `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected'` and `KAOLA_WORKFLOW_OFFLINE: '1'`
5. Asserts exit code 3, no live dir, stderr mentions "project archived"
6. Invokes `cmdSinkFallback` and asserts `updated: false`

**Why it passes:** With OFFLINE=1, test hits the `runDirectMerge` early-exit (sees `!exists(live) && exists(archive)` → true at that moment), returns exit 3, never reaches `postMergeCleanup`. The `git reset` is never executed. The test does NOT validate `postMergeCleanup`'s reset-then-guard sequence.

**What the test does NOT cover:** A real git repo with the archive committed on a feature branch and `origin/main` behind. A root test must use a real git repo with `initGitRepoWithBareRemote` to faithfully expose the gap.

---

## Finding 7: Root walkthrough test structure

**File:** `scripts/simulate-workflow-walkthrough.js`

Key helpers:
- `initGitRepo(tmp)` (line 867): `git init -b main`, add README, commit
- `initGitRepoWithBareRemote(tmp)` (line 876): calls `initGitRepo`, adds bare remote, pushes `main`
- `writeShimFiles(shimPath, jsLines)` (line 852): writes `.js` mock script for `KAOLA_GH_MOCK_SCRIPT`
- `testSinkMergeMockabilityAndReceipt` (line 3487): full pattern — create git repo, feature branch + worktree commit, plant archive dir, run sink-merge, check exit code
- `testSinkFallbackSkipsArchivedProject` (line 1138): tests `cmdSinkFallback` in isolation (no `postMergeCleanup` coverage)

**Pattern for root regression test:**
1. `initGitRepoWithBareRemote(tmp)` — real `origin/main` at initial commit
2. Create feature branch with commit that includes `git rm -r kaola-workflow/{project}/` and `git add kaola-workflow/archive/{project}/` (simulating finalize)
3. Verify `origin/main` still at initial commit (predates archive commit)
4. FF-merge feature branch to local `main` (local `main` has the archive)
5. Run sink-merge with `FORCE_MERGE_IMPOSSIBLE: 'branch_protected'`, `OFFLINE: '0'` (real git, forced push fail)
6. Assert exit code 3
7. Assert archive dir NOT recreated (`!fs.existsSync(liveDir)`)
8. Assert `sink-fallback.json` NOT written

---

## Finding 8: Archive-aware guard pattern

Recurring pattern:
```javascript
const liveDir   = path.join(root, 'kaola-workflow', project);
const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);
if (!fs.existsSync(liveDir) && fs.existsSync(archiveDir)) {
  // project is archived — skip or return guard result
}
```

Used at:
- `cmdSinkFallback` (claim.js:981): live-only check (weaker form)
- GitLab `runDirectMerge` early-exit (sink-merge.js:325): AND logic
- GitLab `postMergeCleanup` guard (sink-merge.js:243): AND logic
- Gitea: identical to GitLab

---

## Architecture Summary

**Two-layer defense in forge editions:**
- Layer 1: `runDirectMerge` early-exit — fires BEFORE any git op; this is the OPERATIVE protection
- Layer 2: `postMergeCleanup` defense-in-depth — fires after reset, but reset wipes archive first in real-git flow

**Root has neither layer.** Root has no `runDirectMerge` wrapper; `main()` calls `postMergeCleanup` directly with no prior archive check.

**`finalValidationPassed` gate:** present in GitLab/Gitea at top of `runDirectMerge` (line 308); absent from root entirely. Separate gap, out of scope for this issue.
