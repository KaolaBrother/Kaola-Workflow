# Advisor — issue-159 Plan Gate

## Verdict: Approve with one BLOCKER fix to the implementation patch

The plan is comprehensive, well-grounded against the source (file line numbers verified), and the build sequence is dependency-correct. Tests-first discipline with a predicted-failure verification step is the right structure. One implementation detail needs a fix before Group I writes.

## BLOCKER — filename parsing breaks on legal filenames

The patch uses:
```js
const untrackedOut = execFileSync('git', ['-C', wtPath, 'ls-files', '--others', '--exclude-standard'], ...);
const untrackedFiles = untrackedOut.trim().split('\n').filter(Boolean);
```

Two real defects for a recovery feature:
1. **Newlines in filenames** (legal on Unix) split into multiple bogus entries → silent partial loss.
2. **Non-ASCII filenames** emerge as `"na\303\257ve.txt"` (core.quotepath=true default). `path.join(wtPath, file)` refers to a non-existent path → `copyFileSync` throws → outer catch returns `null` → worktree lands in `failed_preserve`. User is protected but failure is silent.

**Fix (apply identically in all 4 claim files):**
```js
const untrackedOut = execFileSync('git', ['-C', wtPath, 'ls-files', '-z', '--others', '--exclude-standard'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const untrackedFiles = untrackedOut.split('\x00').filter(Boolean);
```

No test impact (sc9/sc10 use ASCII filenames), but implementation should be robust.

## Process Notes (non-blocking)

1. **Verify-fail step is a hard checkpoint.** After Group T writes, run all 3 walkthroughs and confirm the *expected* failure signature before any Group I write. Enforce explicitly in Phase 4.

2. **Caller change is lockstep with implementation.** All 4 files: `push(p)` → `push(...p)` MUST land together with the `exportWorktreeDiff` rewrite. Mismatched yields `exported = [['/path/to/patch']]` — nested array — breaking existing assertions. Bind impl + caller per-file as one atomic write set.

3. **Codex plugin validation gap.** No test walkthrough for `plugins/kaola-workflow/`. If one exists, add to validation commands. If not, document the gap.

4. **CHANGELOG.md.** CLAUDE.md checklist includes a CHANGELOG entry under [Unreleased]. Phase 6's responsibility per usual pattern — confirm or fold into Phase 4 docs task.

5. **Existing sc5 regression.** sc5 accesses `exported[0]` as a string — still works with array return. Explicitly run sc5–sc8 in verify-pass step.

## Nits (skip)

- Same-millisecond timestamp collision: 1-in-billions, skip.
- Symlinks: `copyFileSync` follows by default — acceptable for recovery snapshot.
- Disk-full / EACCES: handled by outer catch → `failed_preserve`.

## Summary

- **BLOCK** on the `-z` / null-byte split fix. Apply to all 4 claim files.
- **PROCEED** to write `phase3-plan.md` and route to Phase 4 after fix is folded in.
- Phase 4 task list must enforce: tests-first verify-fail gate; impl+caller lockstep per file; CHANGELOG in Phase 6; Codex walkthrough gap acknowledged.
