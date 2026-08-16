# #988 — the removal is correct; it costs a witness the issue did not know about

## What #988 asked for, and what is done

Remove the dead `kaola-workflow/ROADMAP.md` pathspec, keep `.roadmap`. Applied in all four editions
(canonical + gitea + gitlab hand-ports; codex copies ride `edition-sync --write`), plus two stale
prose sites that asserted the sink still regenerates a mirror.

## The part the issue got wrong

> **Nothing breaks.** ... confirm `test-sink-merge.js` and the finalize-door suite stay green.

Measured: `node scripts/test-forge-finalize-findings.js` → **252 passed, 1 failed**.

```
FAIL: behavioural-C[claude/canonical] WITNESS MISSING: the failing `git add` was expected to stage
kaola-workflow/ROADMAP.md beside the gitignored kaola-workflow/.roadmap, but git does not track it.
Without a path that DID stage there is nothing here to contradict the message. ls-files: ""
```

`behavioural-C` pins **honest partial-stage reporting**: when `git add -A -- <candidates>` exits
non-zero because one candidate is gitignored, the run must still report which paths *did* reach the
index, and must not list a successfully-staged path in `archive_unstaged` or in the finding's
not-staged list. That is live production behaviour (`pathsNotStaged`), untouched by #988.

**It needs two fixed candidates with different ignore status.** The fixture used `.roadmap`
(gitignored) and `ROADMAP.md` (addable). After the removal, a linked run has exactly one fixed
candidate — `destRel` is excluded on a linked worktree because `path.relative(root, dest)` escapes it
(#832). So the witness is **structurally unavailable, not relocated**.

## Rebuilding it inside `.roadmap` does not work — probed, not reasoned

A repo with `.gitignore` = `kaola-workflow/.roadmap/issue-1.md`, holding an ignored `issue-1.md` and
an addable `_rules.md`, then `git add -A -- kaola-workflow/.roadmap`:

```
exit=0
staged: kaola-workflow/.roadmap/_rules.md
```

**Exit 0.** A directory pathspec silently skips ignored members; git only errors when the pathspec
*explicitly names* ignored files. So one directory candidate can never produce the
failing-add-with-partial-stage state the leg exists to witness.

## Scope notes

- `behavioural-C[codex]` passed only because the codex copy was unsynced at measurement time; it will
  fail identically once `edition-sync --write` runs.
- The gitea/gitlab ports have **no** behavioural-C leg (they stage with a single unscoped `git add`),
  so the forge edits break nothing.
- Post-removal, `archive_stage_failed` *with a partial stage* stays reachable on an **in-place** run
  (two candidates: the archive dest + `.roadmap`) and on the `source-missing` branch. It is only the
  linked-worktree shape that loses it.

## The fork

**A. Rebuild the witness on a run shape that still has two candidates** (in-place, or the
`source-missing` branch). Keeps the coverage; costs a real fixture rewrite in a suite whose fixture
builder is shared, and it is test authoring that the implementer of the production change should not
be the one to do.

**B. Accept the loss, written down.** Delete the ADDABLE assertions with a stated reason, keep the
rest of behavioural-C (the gitignored candidate still refuses, the finding still fires). Cheap and
honest, but genuinely less coverage than yesterday.

**C. Keep `ROADMAP.md` in canonical `candidatePaths`.** Rejected on the facts: it would keep dead
production code alive purely to feed a fixture, which is the defect #988 was filed about.

Not decided unilaterally — A and B trade coverage against scope, and #988's author priced this as
"small, worth doing when someone is next in those files".
