# Tests for #978 — three arms (j)(k)(l), all four editions, RED on baseline

Test author record. One file changed: `scripts/test-sink-merge.js` (+249 lines, insertions only,
placed directly after the #973 (e)–(i) block). No production file touched. The inserted text is
byte-identical to the text proven below (diff-verified between the worktree and the proof clone).

**baseline: 51db5d2d** (proof runs in a scratch clone of the repo checked out at that commit, so
the RED transcript is against pristine production code regardless of implementer progress in the
worktree).

## The arms and the RESULT each pins

Same lettering space as #973's (e)–(i); every arm drives all four editions through the same
4-tuple table as (e)–(i) (`root`, `codex`, `gitlab` + `KAOLA_GLAB_MOCK_SCRIPT`, `gitea` +
`KAOLA_TEA_MOCK_SCRIPT`). Issues 97801–97804 (j), 97811–97814 (k), 97821–97824 (l).

| arm | fixture | result pinned |
|---|---|---|
| **(j)** `assertBackslashLaneNameIsNotSilentlyDestroyed978` | `--sink` transaction; worktree carrying ordinary lane `.cache` content plus ONE untracked root-level file literally named `kaola-workflow\proj<issue>\notes.md` | the file's bytes still exist somewhere after the sink (NONCE search), AND no unqualified success is reported over it (non-zero exit, typed reason, or the segment named in output all count) |
| **(k)** `assertEmbeddedRepoUnderLanePrefixIsNotSilentlyDestroyed978` | `--sink` transaction; a REAL `git init` repository at `wt/kaola-workflow/crashed-<issue>/` with one commit (no remote — committed-but-unpushed) and two uncommitted files | the repository's work still exists somewhere (NONCE in 3 files: committed working copy + 2 uncommitted), AND no unqualified success reported |
| **(l)** `assertLegacyRouteKeepsTheWorktreeOnlyJournal978` | LEGACY (no `--sink`) entry point; `buildLegacyWorktreeFixture973` posture; worktree-only untracked `kaola-workflow/<project>/.cache/{n7-worktree-only.md, sink-fallback.json}` | the legacy run COMPLETES (non-vacuity clause — refusing here refuses every legacy sink, (i-control) is the arm that says so) AND the worktree-only journal still exists somewhere afterwards. "Told" is deliberately NOT accepted in place of survival for (l): the `--sink` route preserves this content silently as its ordinary outcome |

Result-not-method throughout, in (e)'s exact idiom: survival is searched by NONCE across the whole
fixture (a repair that relocates the bytes is not mistaken for one that destroyed them), and each
arm carries a **pre-run positive control** proving the NONCE search finds the files while they
exist and finds them only inside the worktree — so "found afterwards" can only mean preserved past
the removal. No arm asserts a classifier verdict, a probe flag, or a call.

Premises additionally pinned per arm (all measured, all green at baseline):
- (j): the worktree ROOT holds a single directory ENTRY with the literal backslash name; the
  guard's own probe form (`status --porcelain -uall`) REPORTS the C-quoted record
  `?? "kaola-workflow\\proj<issue>\\notes.md"` — blindness is not the failure here, classification is.
- (k): the embedded repo has a commit and no remote; the two files are uncommitted INSIDE it
  (probed `-uall` inside); the OUTER probe emits ONE collapsed record `?? kaola-workflow/<seg>/`
  and no per-file records — pinning the collapse, so the arm is not re-measuring the per-file
  exemption (f) already holds. Per the premise-check correction: the arm pins "a foreign repository
  hides behind one exempted segment", NOT "the collapse causes the exemption".
- (l): both journal files untracked in the worktree; nonce found in exactly the two worktree copies
  pre-run.

## Baseline failure transcript (the RED)

Full suite (`node scripts/test-sink-merge.js`) in a clone at **51db5d2d** with the arms inserted:

```
Sink-merge (…) test suite FAILED: 20 failed, 994 passed.   exit 1
```

All 20 failures are #978 pins — zero non-#978 failures; all 942 pre-existing assertions green, and
all 52 of my premise/positive-control assertions green. Distribution: (j) 2 pins × 4 editions,
(k) 2 × 4, (l) 1 × 4. Signatures (root shown; codex/gitlab/gitea identical in shape):

```
RED (j): FAIL: #978 (j/root): the backslash-named file must still exist after the sink. …
         exit=0 status="sinked" reason=undefined worktree_still_present=false survivors=[]
RED (k): FAIL: #978 (k/root): the embedded repository's work must still exist after the sink. …
         exit=0 status="sinked" reason=undefined worktree_still_present=false survivors=[]
RED (l): FAIL: #978 (l/root): the worktree-only journal must still exist somewhere after a completed
         legacy sink. … exit=0 status="merged" result=undefined reason=undefined survivors=[]
baseline: 51db5d2d
```

i.e. every shape is a **completed, silent** destruction at baseline: exit 0, `sinked`/`merged`,
worktree gone, zero survivors — exactly the filed defect.

Log: `scratchpad/tests978/red-full.log` (scratchpad =
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad`).

## Mutation / satisfiability proof

Two directions, because a red test can be red for the wrong reason:

1. **The pins fire on the real defect** — the baseline RED above is against shipped, unmodified
   production code; nothing was mocked and the destructive step really ran (worktree_still_present=false).
2. **The pins are satisfiable, and satisfying them breaks nothing** — a scratch **mirror**
   (`scratchpad/tests978/mirror`, never the real tree) carries a minimal candidate repair in all
   four sink copies: keep `??` records whose decoded rel contains `\` or ends with `/` as dirt
   (shapes 1+2 → refusal), plus a pre-removal per-file union copy of `<wt>/kaola-workflow/<project>/`
   into the main root on legacy Step 3 (shape 3 → survival; union semantics of
   `fs.cpSync {force:false}` verified standalone: existing files win, worktree-only files land).
   Full suite in the mirror: **`test suite passed: 1014 assertions`, exit 0** — my 20 pins and 52
   premises green, AND all 942 pre-existing assertions green, including the two hard constraints
   re-run on all four editions: **(f)** ordinary lane content still sinks at exit 0, **(g)** ignored
   content stays invisible (the candidate repair does not touch the `-uall` probe), plus
   (e)(h)(i)(i-control) and the #707 h archived-evidence pins. Log: `scratchpad/tests978/mirror-full.log`.
   The mirror repair is a satisfiability witness, NOT a recommendation — the implementer chooses the
   mechanism.
3. Premise armed-ness got a live demonstration during authoring: the (k) inner-status premise
   caught a real fixture defect on its first run (inner probe without `-uall` collapses
   `sub/deeper.txt` to `?? sub/`), red on all four editions until the fixture was fixed —
   `scratchpad/tests978/iter1.log`.

## Four editions

Yes — every arm runs on root, codex, gitlab, gitea exactly as (e)–(i) do (same table, same mock-env
plumbing, `--keep-issue-open` on every run for the same reason (e)–(i) carry it). 5 assertions per
edition per (j)/(k) fixture path, 4 per (l): 18 per edition, 72 total added (52 green + 20 red at
baseline).

## Constraints respected

- Arms (f) and (g) untouched (my diff is insertions-only in one file) and re-proven live in the
  mirror run on all four editions.
- No production file modified; no existing test modified or deleted.
- Fixtures inherit nothing that disables the guard: (j)/(k) run through `runSinkAt`
  (`KAOLA_WORKFLOW_OFFLINE: '0'`, real bare remote, gh-shaped mock), (l) through `runSinkLegacyAt` —
  the same plumbing as the (e)–(i) arms, not the OFFLINE fixture builders.

## Not pinned, and why

- **Shapes 1/2 on the LEGACY entry point.** (j)/(k) drive the `--sink` transaction only. Both routes
  share `assertWorktreeClean`, so every guard-level repair (classifier, dirt-records) is covered on
  both routes by these arms; only a repair confined to the `--sink` transaction body (a widened
  stage) would fix `--sink` and leave legacy destroying these two shapes, and no such repair
  plausibly reaches them (the stage copies the own-project lane dir; the backslash name is a
  root-level file and the embedded repo is a foreign segment). Flag for review if the implementer
  goes the rescue route.
- **Survival of the embedded repo's `.git` specifically.** (k)'s oracle is byte-survival of the
  three nonce files (incl. the committed one's working copy), not the git object store — requiring
  the `.git` directory itself to survive would pin the preservation mechanism. The premise pins that
  unpushed history is at stake (commit + no remote); the assert message names it.
- **The main-root preflight seam against backslash names** — the premise check lists it as not
  measured; out of #978's filed scope, not tested here.

## Arm (m) — review finding R1, added after the implementation landed

**The pin**: a symlink the legacy stage cannot copy must not turn the rescue back into silent
destruction. Fixture: `buildLegacyWorktreeFixture973` + two worktree-only journal files (NONCE)
+ a DANGLING symlink (`.cache/dangling-link → no-such-target-<n>`) and a SELF-REFERENTIAL one
(`.cache/self-link → self-link`) inside `kaola-workflow/<project>/.cache/`. The pin is a
**disjunction**, unlike (l): `survivors.length > 0 || told` — refusing, reporting (typed reason /
non-zero exit / artifacts named in output) and surviving anyway are all acceptable; the one
forbidden pair is destroyed-at-exit-0-with-nothing-said. Non-vacuity premises as in (i): exit 3
and the unrelated-reason list are ruled out, plus the link-shape premise (lstat true, existsSync
false on both links) and the NONCE positive control. All four editions, issues 97831–97834.
The unreadable-file (EACCES) trigger is deliberately NOT fixtured — a permission fixture reads
differently under root; named omission instead.

**RED against the current candidate** (worktree at 51db5d2d + the implementer's uncommitted #978
fix; sink scripts at RED time: root/codex `430650f8e4c3`, gitlab `10e462d9c2a9`, gitea
`e551b3c86c1c`):

```
Sink-merge (…) test suite FAILED: 4 failed, 1034 passed.   exit 1
RED (m): FAIL: #978 (m/root): a stage that throws must not hand the journal back to silent destruction. …
         exit=0 status="merged" result=undefined reason=undefined survivors=[]
```

All 4 failures are the (m) pin (root/codex/gitlab/gitea); **zero non-R1 failures** — (j)(k)(l) and
all 1014 pre-existing assertions green against the candidate, and (m)'s 20 premise asserts green.
Log: `scratchpad/tests978/r1-red-full.log`.

**Mutation proof**: `scratchpad/tests978/mirror2` = rsync copy of the candidate tree with ONE
change — the legacy stage's `catch (_) { wtStageDir = null; }` replaced by a refuse-on-throw
(stderr + exit 1 + return) in all four editions, at the legacy site only (verified adjacent to the
legacy `removeWorktree`, `--sink` site untouched). Full suite there: **1038 assertions passed,
exit 0** — the pin goes green under the reviewer's constraint-safe repair shape and NO green arm
flips ((i-control), (l), #937 c/d legacy terminals, #707 h all green). The candidate tree without
that repair is byte-identical otherwise and reds the pin — the removing-the-repair direction is
the RED run above. The mirror repair is a witness, not a recommendation.

## Arm (n) — the `--sink` twin of (m), ruled IN by the lead

The transaction's merge step carries the identical swallow (`sinkCopyDir` in try/catch →
`wtStageDir = null`; root/codex `:2177`, gitlab `:2038`, gitea `:2047`), and it sits on the route
every shipped finalize takes — the legacy route is reachable only by a direct no-flag invocation.
Arm (n) = (m)'s fixture shapes (both symlink triggers in one lane dir, journal NONCE, positive
control, EACCES omission named) driven through `runSinkAt` on `buildWorktreeEvidenceFixture`, same
disjunction pin, same non-vacuity premise (with `worktree_dirty` deliberately NOT on the
unrelated list — a guard refusing over an uncopyable lane entry is a legitimate repair). All four
editions, issues 97841–97844.

**Blast radius, answered for the implementer** (read from both stage blocks in the candidate):
IDENTICAL content scope — both stages copy exactly `<wt>/kaola-workflow/<args.project>/` via the
same `sinkCopyDir`, swallow the same way, and land through the same `sinkLandStagedUnion` with the
same `SINK_STAGE_SKIP`; on failure both routes proceed to the same forced removal of the whole
worktree. Neither loses more content than the other; content outside the own-project lane dir is
in the GUARD's jurisdiction on both routes alike ((e)–(l) pin that separately). What differs is
reach (every shipped finalize) and the terminal the loss hides under (`status:"sinked"`).

**RED against the current candidate** (same tree state as (m)'s RED):

```
Sink-merge (…) test suite FAILED: 8 failed, 1050 passed.   exit 1
RED (n): FAIL: #978 (n/root): the --sink stage that throws must not hand the journal back to silent
         destruction … exit=0 status="sinked" reason=undefined survivors=[]
```

The 8 are exactly (m)×4 + (n)×4; zero other failures. Log: `scratchpad/tests978/r1n-red-full.log`.

**Mutation proof, three trees** (each a fresh rsync of the candidate + suite):
- `mirror4` — refuse-on-throw at BOTH stage sites, all four editions: **1058 assertions passed,
  exit 0**. Both pins green, no green arm flips.
- `mirror5` — the same repair at the LEGACY site only: **4 failed, 1054 passed** — the four
  failures are exactly (n) on the four editions, (m) green. This is simultaneously (n)'s
  remove-the-repair direction and the independence proof: (n) tracks the `--sink` site
  specifically; a legacy-only fix cannot satisfy it, and neither pin shadows the other.
- The unrepaired worktree is the both-removed direction: (m) and (n) both red.
Logs: `r1n-mirror4.log`, `r1n-mirror5.log`; patcher: `patch-stage.js` (occurrence-ordered per
edition: the two stage sites are [--sink, legacy] in root/codex and [legacy, --sink] in the ports).

## Files

- Tests: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978/scripts/test-sink-merge.js`
  (the `#978` block after the #973 (e)–(i) arms: five `…978` functions — arms (j)(k)(l)(m)(n) —
  + one four-edition forEach; insertions only).
- Proof artifacts: `scratchpad/tests978/{red-full.log, mirror-full.log, r1-red-full.log, r1-mirror-full.log, r1n-red-full.log, r1n-mirror4.log, r1n-mirror5.log, iter1.log, iter2.log, arms-978.js, patch-stage.js, base/, mirror/, mirror2/, mirror4/, mirror5/}`.
