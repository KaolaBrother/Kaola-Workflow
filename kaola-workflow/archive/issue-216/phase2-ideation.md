# Phase 2 - Ideation: issue-216

## Approaches Evaluated

### Option A: Inline early-exit in `main()` after checkout + Layer 2 guard in `postMergeCleanup` (recommended)
- **Summary:** Add `!exists(liveDir) && exists(archiveDir)` early-exit in `main()` in the disk window after feature-branch checkout but before `ffMergeLoop`, plus defense-in-depth Layer 2 guard inside `postMergeCleanup` before `fs.mkdirSync`. Apply byte-identically to Codex copy. Add regression test using `initGitRepoWithBareRemote` + real git + `FORCE_MERGE_IMPOSSIBLE`.
- **Pros:** Smallest diff; no function extraction; operative guard fires in the disk window where the archive is materialized; preserves existing inline-`main()` shape; behaviorally faithful to two-layer forge pattern
- **Cons:** Placement diverges from forge's pre-checkout early-exit (behavioral-equivalent-but-not-line-aligned); needs a comment explaining the placement
- **Risk:** Low — surgical change, two files, mirrored from forge reference
- **Complexity:** Small
- **⚠ Placement is provisional** — see Open Question below

### Option B: Two early-exits (pre-git forge-aligned + post-checkout operative)
- **Summary:** Add both a pre-git early-exit (matching forge lines 320–328) and a post-checkout early-exit, plus Layer 2 guard in cleanup.
- **Pros:** Maximally defensive; pre-git exit is line-comparable to forge
- **Cons:** Three copies of same predicate; pre-git guard is dead weight for the actual scenario and creates an untested code branch; over-builds
- **Risk:** Medium — untested branch could mask bugs
- **Complexity:** Medium

### Option C: Extract `runDirectMerge` wrapper to match forge structure
- **Summary:** Refactor entire `main()` body into a `runDirectMerge` function, mirroring GitLab structure.
- **Pros:** Strongest structural alignment across editions
- **Cons:** Large surface for a small bug; root lacks forge-specific drivers (`skipGit`, `finalValidationPassed`, `getRoot`/`options.root`); violates "surgical changes" project rule; "exact" parity is illusory without also porting finalValidationPassed
- **Risk:** High — regression surface across the entire merge pipeline
- **Complexity:** Large

---

## Advisor Findings

The advisor confirmed Approach A is the correct family and the "don't build wrapper / don't port finalValidationPassed" calls are sound.

**Critical open question raised by advisor:** The guard placement decision depends on whether workflow folders are git-tracked or untracked. `git reset --hard` only removes tracked files; untracked files survive. From git status: `?? kaola-workflow/issue-216/` (live folder is untracked on main). If `cmdFinalize` moves the project via `fs.renameSync` (untracked), the archive is on disk at script start regardless of branch — the forge's pre-git guard would fire without the novel post-checkout placement. If `cmdFinalize` uses `git mv` + commit (tracked), the archive only appears after checkout and reset wipes it — post-checkout placement is required.

**Resolution:** The failing test in Phase 4 is the discriminator. Write it first against current code; let the actual on-disk behavior (does the phantom folder actually appear?) drive placement.

---

## Selected Approach

**Option A** — inline early-exit guard + defense-in-depth Layer 2 guard in `postMergeCleanup`

**Rationale:**
- The only option whose operative guard is placed where the root flow actually exposes the archive on disk (for the committed-archive-on-branch scenario)
- Smallest, most surgical change — aligns with project's non-negotiable "surgical changes" rule
- Delivers genuine two-layer defense behaviorally, matching the forge pattern's substance without importing forge-specific structural drivers that root never had

**Provisional placement:** After `assertNoLiveWorkflowFolder` (~line 329) and before `ffMergeLoop`. Exact line confirmed in Phase 4 by writing failing test first and observing on-disk behavior.

---

## Out of Scope (explicit)

- `runDirectMerge` wrapper extraction (Approach C) — no forge-specific drivers in root
- `finalValidationPassed` gate — separate gap, separate issue (guard would PASS in this scenario anyway)
- Modifying `cmdSinkFallback` in `claim.js` — already correct
- GitLab/Gitea editions — already carry both guards
- Verbatim copy of forge `testFallbackGuardsAfterArchive` (OFFLINE + `fs.renameSync` — doesn't cover reset path, would pass against buggy code)
- Adding a pre-git early-exit (Approach B extra guard) without a test that exercises it

---

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
