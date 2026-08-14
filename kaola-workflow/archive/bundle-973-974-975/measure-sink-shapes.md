# measure-sink-shapes.md — the two shape measurements behind #973 arms (h) and (i)

STATUS: COMPLETE. Measurement only — I authored no test code and edited nothing in either tree.

Baseline commit: `6926493661e1a69c910e50f5a3d82b09af85e4ee`
Suite snapshot measured: `scripts/test-sink-merge.js` md5 `634f0ffc1be11512e7a5f628b29a2b34`
(hashed before and after the full run — identical, so the run is not a moving target).
Probes: `…/0ea58e86-…/scratchpad/probe-{symlink,legacy,legacy2,legacy3,gitlab-legacy,posture,noliveguard}.js`

Custody: `scripts/test-sink-merge.js` and `tests-sink.md` belong to `tests-sink` and are untouched by
me. This file is the only thing I wrote. (It supersedes and replaces a scratch note I had written at
`tests-sink-hi-measurements.md` before you named this path; that file is removed, nothing lost.)

---

# MEASUREMENT 1 — does `git status --porcelain -uall` report a self-referential symlink?

## **YES. It reports it. Widening the flag DOES see the #975 artifact.**

Stating this loudly in the direction you asked for: the "not reported" branch — the one that would
have constrained the repair family — **did not happen.** A probe-side widening can see the exact
shape #975 observed. No repair family is ruled out by this.

Fixture: a git repo with `plugins/real.txt` committed, then `plugins/plugins -> plugins` (the
self-referential link) and `plugins/resolves -> real.txt` created untracked.

```
$ git status --porcelain --untracked-files=no
                                                  ← empty
$ git status --porcelain --untracked-files=normal
?? plugins/plugins
?? plugins/resolves
$ git status --porcelain -uall
?? plugins/plugins
?? plugins/resolves
```

Same answer inside a real linked worktree carrying a link and a regular file:

```
$ git -C <wt> status --porcelain --untracked-files=no
                                                  ← empty: the guard's own flag form is blind
$ git -C <wt> status --porcelain -uall
?? plugins/genuine.js
?? plugins/plugins
```

And the destruction is real — `git worktree remove --force` took it:

```
before:  lstat(<wt>/plugins/plugins).isSymbolicLink() === true
$ git -C <root> worktree remove --force <wt>       → exit 0
after:   lstat(<wt>/plugins/plugins)               → GONE (ENOENT)
```

## The finding that DOES constrain something — it constrains the TEST, not the fix

Git can see the link. **Node's ordinary file idioms cannot**, and that is why arm (h) needs its own
oracle rather than a parameter on (e):

| probe on `plugins/plugins -> plugins` | result | consequence |
|---|---|---|
| `fs.existsSync(link)` | **false** | an `existsSync` survivor check calls the artifact destroyed while it sits there |
| `fs.lstatSync(link)` | `isSymbolicLink:true`, `isFile:false`, `isDirectory:false` | the only oracle that resolves |
| `fs.statSync(link)` | throws **ELOOP** | any follow-the-link check dies |
| `fs.readFileSync(link)` | throws **ELOOP** | a nonce BYTE search cannot reach it |
| `Dirent` for the link | `isFile:false`, `isDirectory:false`, `isSymbolicLink:true` | a walk shaped `if (isDirectory) recurse; if (!isFile) continue;` **skips it in silence** |
| `fs.readlinkSync(link)` | `'plugins'` | the survivable identity to assert on |

The last two rows are the trap: (e)'s `filesContaining973` is exactly that walk, so pointing it at a
symlink returns `[]` whether the link survived or not. `tests-sink`'s `symlinksTo973`
(`test-sink-merge.js:4143`) walks on `Dirent.isSymbolicLink()` then `readlinkSync` — correct, and I
confirmed every premise its arm asserts.

---

# MEASUREMENT 2 — does the LEGACY entry point reach `assertWorktreeClean`, or stop earlier?

## Root and codex: **it reaches it**, and only because the fixture is in the archived posture.

Your hypothesis is right, and it is a real hazard rather than a theoretical one. Two legs against the
shipped root sink, differing in exactly one thing — whether the branch tip carries
`kaola-workflow/<project>/workflow-state.md` — each with a real linked worktree holding genuine
untracked work (`probe-noliveguard.js`):

| leg | exit | envelope | worktree after | untracked work | destructive step |
|---|---|---|---|---|---|
| branch tip carries a **LIVE** run folder | 1 | `result:"report"`, `status:"not_merged"`, `reason:"run_not_finalized"` | **still present** | **SURVIVES** | **never ran** |
| branch tip **FINALIZED** (archived) | 0 | `status:"merged"` | gone | destroyed, `survivors:[]` | ran |

The first leg is precisely the failure you named: an arm built on a live-folder fixture would go
green — work survives, and the non-zero exit satisfies any "was the operator told?" clause — while
certifying coverage that does not exist. `assertNoLiveWorkflowFolder` fired, `assertWorktreeClean`
was never reached. `tests-sink`'s `buildLegacyWorktreeFixture973` (`:4383`) uses the archived posture
and so clears this guard.

## Gitlab and gitea: **it does NOT reach it** — and arm (i) is green and vacuous there today

This is the same hazard, one layer deeper, and it is live in the suite right now. Those two sinks
carry two legacy-path preconditions the root and codex copies do not, and **both stop the run before
Step 3**:

1. `assert(finalValidationPassed(root, args.project), 'Final validation evidence is required before
   direct merge sink runs')` — gitlab `:1079`, gitea `:1090`. `finalValidationPassed` (gitlab `:404`)
   requires the resolved `finalization-summary.md` to match `/Final Validation/i` **and** `/pass/i`
   **and not** `/blocked|failed/i`. The fixture body `# Finalization Summary\n\nREADY FOR FINAL GIT
   GATE\n` matches none of the three.
2. the archived early-exit, gitlab `:1103` — `!exists(<main>/kaola-workflow/<project>) &&
   exists(<main>/kaola-workflow/archive/<project>)` → `return { exitCode: 3 }` before touching git.
   The archived posture that clears guard (1) on root satisfies this one exactly.

Measured against the shipped gitlab sink (`probe-gitlab-legacy.js`), the two are sequential — fixing
only the summary moves the stop from the first to the second:

```
summary as shipped in the fixture     exit 1  worktree still present  survivors [helper.js]
  stderr: Final validation evidence is required before direct merge sink runs
summary satisfying finalValidationPassed  exit 3  worktree still present  survivors [helper.js]
  stderr: sink-merge: project archived (issue-97395) — fallback receipt written to archive .cache
```

Nothing is destroyed, so the survival clause passes; the non-zero exit makes the `told` clause pass.
**Both clauses pass while measuring nothing.** The arm's own non-vacuity guard
(`test-sink-merge.js:4412`) cannot catch it: it tests `unrelated.includes(out.reason)`, but there is
no envelope at all — `out` is `null`.

## A third stop, on every edition, if the archive is committed only on the branch

`removeWorktree` (`kaola-workflow-claim.js:588`) copies `<wt>/kaola-workflow/archive/<project>/` up
into the main root when the main root lacks it — **before** the force-removal. Those copies land
untracked and abort Step 4:

```
error: The following untracked working tree files would be overwritten by checkout:
	kaola-workflow/archive/issue-97399/.cache/final-validation.md
	…
→ exit 1, and NO envelope (lastJson === null)
```

`tests-sink` reached this fix independently — `buildLegacyWorktreeFixture973` commits the archive on
main, so the branch inherits it, `rootArchive` exists and the rescue is skipped. Recorded because the
trap is invisible until a legacy fixture is given a worktree, and nothing else in the corpus does.

## The posture that drives ALL FOUR editions to the destructive step

`probe-posture.js`, 8 legs = 4 editions × the live-dir axis. Constant in every leg: archive committed
on main, and a summary satisfying `finalValidationPassed` written to **both** the archive and the
live copy:

```
# Finalization Summary

## Final Validation

verdict: pass

READY FOR FINAL GIT GATE
```

The axis is an **untracked live dir** `kaola-workflow/<project>/` in the main root. It defeats the
gitlab/gitea archived early-exit; `--untracked-files=no` keeps it invisible to the main-root
cleanliness probe, and it is not on the branch tip, so `assertNoLiveWorkflowFolder` stays silent.

| edition | live dir in main root | exit | envelope | worktree gone | survivors | destruction reached |
|---|---|---|---|---|---|---|
| root | no | 0 | `merged` | yes | `[]` | **yes** |
| root | **yes** | 0 | `merged` | yes | `[]` | **yes** |
| codex | no | 0 | `merged` | yes | `[]` | **yes** |
| codex | **yes** | 0 | `merged` | yes | `[]` | **yes** |
| gitlab | no | **3** | none | **no** | `[helper.js]` | no — vacuous |
| gitlab | **yes** | 0 | `merged` | yes | `[]` | **yes** |
| gitea | no | **3** | none | **no** | `[helper.js]` | no — vacuous |
| gitea | **yes** | 0 | `merged` | yes | `[]` | **yes** |

With the live dir, all four editions complete at **exit 0 reporting `status: "merged"`** and silently
destroy the genuine untracked file — survival false AND told false, with no exit code and no reason
for the arm to hide behind. That is the strongest red available for (i), on all four.

(The gitea leg prints `fatal: not a git repository` from my minimal stand-in mock; the suite's own
cwd-honest `writeGhMock` does not. It did not change the outcome — exit 0, destroyed.)

## One more, and it is not a shape question: the legacy terminal token is `merged`, not `sinked`

`postMergeCleanup` emits `{ status: 'merged', … }` (`kaola-workflow-sink-merge.js:1131`); `sinked`
belongs to the `--sink` transaction. The current (i-control) asserts `out.status === 'sinked'`, so it
is red on root and codex purely on the token. Every pre-existing legacy test asserts exit 0 and never
the token — #936 c (`:5188`) is the precedent.

---

# Whole-suite state at the snapshot

```
$ node scripts/test-sink-merge.js
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 24 failed, 910 passed.
REAL_EXIT=1
```

| arm | root | codex | gitlab | gitea |
|---|---|---|---|---|
| (e) genuine untracked file, `--sink` | RED ×2 | RED ×2 | RED ×2 | RED ×2 |
| (h) untracked SYMLINK, `--sink` | RED ×2 | RED ×2 | RED ×2 | RED ×2 |
| (i) genuine untracked file, LEGACY | RED ×2 | RED ×2 | **GREEN — vacuous** | **GREEN — vacuous** |
| (i-control) lane-only, LEGACY | RED (token) | RED (token) | RED (early stop) | RED (early stop) |
| (f), (g) controls | green | green | green | green |

24 = 8 (e) + 8 (h) + 4 (i) + 4 (i-control). Representative signatures:

```
FAIL: #973 (h/root): the untracked SYMLINK must still exist after the sink, by lstat.
      exit=0 status="sinked" reason=undefined worktree_still_present=false surviving_links=[]
FAIL: #973 (i/root): the untracked work must still exist after the LEGACY sink.
      exit=0 status="merged" reason=undefined worktree_still_present=false survivors=[]
FAIL: #973 (i-control/gitlab): the legacy run must still complete over lane-only untracked content;
      got exit=1 status=null reason=null
      stderr: Final validation evidence is required before direct merge sink runs
baseline: 6926493661e1a69c910e50f5a3d82b09af85e4ee
```

`node scripts/test-suite-registration.js` → exit 0 (46 test files, 43 registered, 3 exempt).

---

# What I did not do

- **No test code, no counter-mutation re-run.** Both belong with whoever holds the arms; mutating a
  file being edited would measure a snapshot nobody ships.
- **No claim the suite is verified.** 24 failed / 910 passed describes a live file at one hash.

# Safety and cleanliness

Every fixture was built under `os.tmpdir()`; `probe-noliveguard.js` asserts the realpath is under the
temp dir **before** spawning the sink, which is what runs `git worktree remove --force`. No probe was
ever pointed at the real repository or the real worktree. Every probe cleans up in a `finally`; no
`kw-probe-*` root survives. Both trees at the end:

```
$ git -C /Users/ylpromax5/Workspace/Kaola-Workflow status --short --untracked-files=all
?? kaola-workflow/bundle-973-974-975/…    (run records; this file is the only one I wrote)

$ git -C …/.kw/worktrees/bundle-973-974-975 status --short --untracked-files=all
 M scripts/test-sink-merge.js             ← tests-sink's, not mine
 M …31 other files                        ← other agents' in-flight work
?? kaola-workflow/.roadmap/issue-97{3,4,5}.md
?? scripts/test-fixture-sandbox.js
```

`git worktree list` unchanged (2 entries).
