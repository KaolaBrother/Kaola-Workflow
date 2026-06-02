# Planner — issue-216: sink-merge archive-safety guard

## Important correction to Phase 1 framing (verified against source)

**Critical timing subtlety:** The Phase 1 framing described the operative fix as a "runDirectMerge early-exit BEFORE any git operation." The planner verified this is NOT correct for the canonical scenario (archive committed on feature branch, live dir already removed by finalize).

Disk state timeline for the canonical scenario:
1. Script start: local `main` == `origin/main` (pre-archive). Both live dir and archive dir absent from disk. A pre-git early-exit evaluating `!exists(live) && exists(archive)` → FALSE. Does NOT fire.
2. checkout feature branch → archive materializes on disk (it's a tracked file on that branch)
3. FF-merge to local main → archive still on disk
4. push fails → `git reset --hard origin/main` wipes archive from disk
5. After reset: both absent → `postMergeCleanup`-internal guard is also FALSE

**Conclusion:** The operative guard must be placed AFTER the feature branch checkout but BEFORE the reset (i.e., in `main()` after checkout completes, before `ffMergeLoop`). The forge's pre-checkout placement (lines 320-328) catches the "already-archived-on-disk" scenario (the `fs.renameSync` test), NOT the branch-committed-archive scenario. Root's fix must be placement-aware of this distinction.

---

## Approach A — Inline early-exit in `main()`, evaluated AFTER checkout (recommended)

**What changes:**
- In `main()`, after the feature-branch checkout (~line 328) and after `assertNoLiveWorkflowFolder`, but BEFORE the merge/ffMergeLoop block, add the AND-guard: `if (!exists(liveDir) && exists(archiveDir)) { process.stderr.write(...); process.exitCode = 3; return; }`. This is the disk window where a committed archive is materialized but the destructive reset has not run.
- Add the defense-in-depth Layer 2 guard inside `postMergeCleanup` immediately before `fs.mkdirSync` (line 220), matching forge lines 241-246 verbatim.
- Apply byte-identically to the Codex copy.

**Pros:**
- Actually fires on the canonical scenario (committed archive on branch) because it reads disk in the window where the archive exists
- Smallest diff; no function extraction, no signature churn
- Preserves existing inline-`main()` shape of root/Codex

**Cons/risks:**
- Placement diverges from the forge's pre-checkout early-exit location (behavioral-equivalent-but-not-line-aligned)
- Needs a comment explaining the placement so future parity audits don't "correct" it back to pre-checkout

**Complexity:** Small

**Architectural fit:** Behaviorally faithful to two-layer forge pattern; operative layer intentionally placed where root flow actually exposes the archive on disk.

---

## Approach B — Two early-exits: pre-git (forge-aligned) + post-checkout (operative)

**What changes:**
- Add a pre-git early-exit after `mainRoot` is computed (line 287), line-aligned with forge 320-328 — catches "already archived on disk before the script runs"
- Add a second early-exit after checkout (as in Approach A) — catches the committed-archive-on-branch case
- Add Layer 2 guard in `postMergeCleanup` as well

**Pros:** Maximally defensive; pre-git exit is line-comparable to forge

**Cons/risks:**
- Three copies of the same predicate; higher duplication
- Pre-git guard is dead weight for the issue's actual scenario and won't be exercised by the regression test (untested branch)
- Over-builds relative to the confirmed bug

**Complexity:** Medium

---

## Approach C — Extract a `runDirectMerge` wrapper to match forge structure

**What changes:** Refactor root/Codex `main()` body into a `runDirectMerge(args, opts)` function.

**Pros:** Strongest structural alignment across editions

**Cons/risks:**
- Large surface for a small bug; touches entire merge pipeline
- Root lacks forge-specific drivers (`skipGit`, `finalValidationPassed`, `getRoot`/`options.root`); "exact" parity is illusory
- Violates "surgical changes / touch only what the task requires" project rule

**Complexity:** Large

---

## Key question answers

**Q1: `runDirectMerge` wrapper vs. inline early-exit?**
Inline early-exit (Approach A). The forge wrapper is a forge-specific artifact with forge-specific drivers that root/Codex never had.

**Q2: Minimum reliable git setup for the regression test?**

Using `initGitRepoWithBareRemote(tmp)`:
1. On `main`, create and commit a live `kaola-workflow/<project>/workflow-state.md`, push → `origin/main` is the pre-archive baseline
2. Create feature branch; on it, `git mv` live dir to `kaola-workflow/archive/<project>/` and commit → archive committed on branch; push `-u`
3. Return to `main`
4. Run sink-merge with `OFFLINE: '0'` + `FORCE_MERGE_IMPOSSIBLE: 'branch_protected'` → reset actually runs and wipes archive
5. Assert: exit code 3; `!exists(kaola-workflow/<project>)` (no phantom live dir); no `sink-fallback.json`; stderr mentions "project archived"

Brittleness guards: pin git identity via `GIT_AUTHOR_*`/`GIT_COMMITTER_*`, use `fs.realpathSync(mkdtempSync(...))` for macOS symlink, clean up both `tmp` and `remotePath` in `finally`.

**Critical caveat:** Architect must verify empirically that the Approach A early-exit must sit AFTER `assertNoLiveWorkflowFolder` (line 329) — since the feature branch moved the file to archive, `HEAD` no longer has the live path, so that guard passes. Write failing test first, watch phantom dir resurrect, then add the guard.

---

## Recommendation: Approach A

- Only option whose operative guard fires in the correct disk window
- Smallest, surgical, no signature/export churn
- Delivers genuine two-layer defense behaviorally
- Aligns with project's "surgical changes" and "keep it simple" rules

## Do NOT build
- `runDirectMerge` wrapper (Approach C) — imports forge structure without forge drivers
- `finalValidationPassed` gate — explicitly out of scope
- Pre-git early-exit (Approach B extra guard) without a test to exercise it
- Verbatim copy of forge `testFallbackGuardsAfterArchive` (OFFLINE + `fs.renameSync` — doesn't cover reset path)
