# impl-sink.md — #973 the sink worktree data-loss guard, untracked half

STATUS: **COMPLETE.**

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
Branch: `workflow/bundle-973-974-975`

**Custody**: `scripts/test-sink-merge.js` is READ-ONLY to me. I read it and ran it; I did not edit it.
Its md5 is `74110486caa4b7ac524bcc626466daac`, measured immediately before AND after the verifying run
— identical, so the green run is not a moving target.

**Verification tier: `tests-green`** — the authored suite passes.

---

## 1. The repair family, and why

**Family A — widen the probe, subtract lane paths, refuse.** Chosen over B (preserve-and-report) for
three reasons, in the order they decided it:

1. **It extends a mechanism that is already here.** `assertWorktreeClean` already refuses on a dirty
   worktree; the defect is that its probe cannot *see* one whole population. Family A repairs the
   probe and leaves the verdict machinery untouched — rung 2 of the solution ladder. Family B adds a
   new concept (preserved artifacts, and an answer to "where did my file go?") to fix a blindness.
2. **`CLAUDE.md` already states this outcome as an invariant**: an operation that would destroy
   something "still fails loudly … a sink over a tree carrying uncommitted work". That sentence was
   false for untracked work. Family A makes it true; family B would leave it true-ish in a different
   vocabulary and require the sentence to be rewritten.
3. **One entry point cannot be repaired without the other.** `assertWorktreeClean` is shared by the
   `--sink` transaction (`sinkPreflight`, canonical `:1731`) and the legacy `main()` (canonical
   `:3210`). A probe-side repair covers both by construction; arm (i) exists precisely because a
   repair inside the transaction would not.

**Refusal is legitimate here** and is not a "nothing refuses" violation: that rule's own carve-out is
operations that destroy something, and this is the example it names.

A fourth reason arrived after I had chosen, and it would have decided it the same way: a family-B
preserve written with `copyFileSync` **follows the link and throws ELOOP** on `plugins/plugins ->
plugins`, so it rescues nothing for the exact artifact #975 produces — arm (h) reds on all four
editions while (e) and (i) go green, i.e. it *looks* complete. Family A never copies anything, so it
has no dereference to get wrong: the worktree is left standing, links and all. Recorded because it is
the strongest single argument against the family I did not pick, and because if anyone revisits this
seam with a preserve-shaped repair, `lstat` + `readlink` + `symlink` is the floor, proven against the
self-referential shape rather than a regular file.

## 2. What changed, in all four copies

One helper added, and three lines changed inside `assertWorktreeClean`, per copy.

| copy | file | probe was | probe now | helper at |
|---|---|---|---|---|
| root | `scripts/kaola-workflow-sink-merge.js` | `:520` | `:558` | `:499` |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `:520` | `:558` | `:499` (byte-identical to root) |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `:488` | `:517` | `:463` |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `:503` | `:532` | `:478` |

The three edits, identical in shape everywhere:

1. the probe flag: `'--untracked-files=no'` → `'-uall'`;
2. the verdict: `if (status)` → `const dirt = worktreeDirtRecords(status); if (dirt.length)`, and the
   message now lists `dirt` rather than the raw status (so the operator sees exactly what blocks);
3. a new module-level helper `worktreeDirtRecords(statusText)` above `assertWorktreeClean`:

```js
function worktreeDirtRecords(statusText) {
  const kept = [];
  for (const record of String(statusText || '').split('\n')) {
    if (!record.trim()) continue;
    if (record.startsWith('??')) {
      const rel = parsePorcelainPaths(record)[0];
      if (rel && isParkedLanePath(rel, [])) continue;
    }
    kept.push(record);
  }
  return kept;
}
```

(The gitlab/gitea ports call the same two kernel helpers through their `adaptiveSchema.` namespace,
which is how those files already reach `parsePorcelainPaths` at gitlab `:1750`.)

Nothing is exported, so the `forge sink-merge module.exports superset` family in
`validate-script-sync.js` is unaffected. **No test file, no doc, no other script was touched.**

### Three details that are decisions, not typing

- **`-uall`, not `--untracked-files=normal`.** `=normal` collapses a wholly-untracked directory into
  ONE record, and the filter reads a path's *project segment*; a collapsed `kaola-workflow/` record
  has no project segment, would classify as work, and would refuse every ordinary run. `-uall` yields
  one record per file, which classifies unambiguously.
- **Only `??` records are filtered.** Every tracked record is dirt exactly as before, so the tracked
  half of the guard (pinned by #912 b) is untouched — the diff cannot change its verdict.
- **Fail-closed on an undecodable record**: if `parsePorcelainPaths` yields nothing for a line, the
  line is kept and the sink refuses.

## 3. The lane/work boundary — why it is right, not merely convenient

The filter is `isParkedLanePath(rel, [])`: the **existing kernel predicate**, unchanged, with an
empty owned-projects list. That is one wording for one rule, reused rather than re-derived.

**Why a boundary is needed at all**: the blind flag was not an accident. Every run leaves untracked
lane content in its worktree — `kaola-workflow/<project>/.cache/…` — which is why a bare flag flip
reds arm (f) on all four editions plus `#707 h` nine times. My second mutation proof below
reproduces exactly that.

**Why *this* boundary**:

- It is the boundary the sink **already draws in the main root**. `assertCleanWorktree` filters its
  records through `isParkedLanePath` (canonical `:432`) and its comment says the untracked lane dirs
  are deliberately excluded. I did not invent a classification; I pointed the existing one at the
  second probe, which never had one because it could not see the population it applies to.
- The population it exempts is one the sink itself treats as recoverable, not as work: the `--sink`
  merge step **stages `<wt>/kaola-workflow/<project>/` into a temp dir before removing the worktree**
  and lands it after checkout (canonical `:2164`), so that untracked `.cache/` evidence survives —
  and `#707 h` pins that end to end. Refusing over content the transaction is in the middle of
  rescuing would be incoherent.
- **`[]` for ownedProjects is the one deliberate divergence** from the main-root call, and it is
  load-bearing. In the main root the run's own lane folder is the live record about to be published,
  so it is deliberately NOT exempt. In the *linked worktree* the same path is the throwaway copy that
  every run carries and no run means to keep — it is the commonest shape there is, which is why the
  brief's measurement 3 (flip + `isParkedLanePath(p,[project])`) refuses on ordinary runs and arm (f)
  catches it. Reusing the helper with `[]` is the difference between "own project" meaning *the
  record* and meaning *the scratch copy*.
- **What stays counted as work**, and I judge this correct rather than incidental:
  `kaola-workflow/.roadmap/**`, `kaola-workflow/archive/**`, and files sitting directly under
  `kaola-workflow/` (`ROADMAP.md`, `config.json`) are all `false` under `isParkedLanePath` and so
  still refuse. Those are durable state, not scratch — the sink's own preflight has a dedicated
  auto-stash bucket for untracked roadmap sources rather than discarding them.
- **Ignored files are outside this by construction, not by choice.** No `--untracked-files` setting
  reports them (`status --porcelain -uall` over ignored-only content is empty — measured, and arm (g)
  asserts it as a premise). So the repair never sees them and arm (g) stays green. A repair reaching
  for `--ignored` would red (g) on all four editions; this one cannot.

**The corner I did not cut, stated plainly**: an untracked non-lane path that is genuinely
disposable — a stray `.DS_Store` in a worktree of a repo that does not gitignore it — now refuses the
sink where before it was destroyed in silence. That is the intended direction (the operator is told
and can discard), but it is a real behaviour change for a real shape, so it is written down here.

## 4. How the legacy entry point is covered

`assertWorktreeClean` is shared. The `--sink` path calls it from `sinkPreflight` (canonical `:1731`),
which converts the throw into `{ok:false, reason:'worktree_dirty'}` → `result:'refuse'`, exit 1, zero
mutation. The legacy path calls it as the last Step-2 precondition (canonical `:3210`); the throw
reaches `main()`'s `catch`, which writes stderr and exits 1 **with no JSON envelope** — that is this
entry point's existing terminal for a thrown precondition, not something I introduced (canonical
`:3314`: `try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }`).
Both forge ports have the same two call sites (gitlab `:1205`/`:1720`, gitea `:1214`/`:1729`),
verified by grep, and both are exercised red-to-green by arms (i) and (e)/(h) respectively on all
four editions.

### The gitlab/gitea legacy path had no prior coverage — so it gets its own evidence

`finalValidationPassed` is a gitlab/gitea-only precondition, and the pre-existing legacy fixtures
drove the root script only, so **nothing in this repo had ever exercised the gitlab/gitea legacy path
before these arms.** I am therefore not leaning on the surrounding green there. Both directions are
proven for those two editions specifically, from my own mutation runs:

- guard reverted → `(i/gitlab)` and `(i/gitea)` both red, ×2 each ("the untracked work must still
  exist after the LEGACY sink" + "must not report unqualified success") — the arms are live on those
  editions and my change is what turns them green;
- filter made over-broad → `(i-control/gitlab)` and `(i-control/gitea)` both red ("the legacy run
  must still complete over lane-only untracked content") — the must-not-break control is armed there
  too, so the green is not the vacuous kind the measurement report found before the fixture posture
  was fixed.

## 5. Verification

All commands run from the worktree. Real exit codes captured directly, never through a pipe.

| command | before | after | exit |
|---|---|---|---|
| `node scripts/test-sink-merge.js` | `FAILED: 24 failed, 910 passed` | `passed: 942 assertions` | 1 → **0** |
| `node scripts/validate-script-sync.js` | (n/a) | `OK: 15 common scripts, 27 byte-identical groups, … 6 forge export-superset families in sync` + `committed kernel parity: 4 Oracle Kernel copies identical at HEAD` | **0** |
| `node scripts/edition-sync.js --check` | (n/a) | `8 forge aggregator ports in parity with canonical` + `committed kernel parity verified at HEAD` | **0** |
| `node scripts/simulate-workflow-walkthrough.js` | (n/a) | `{"index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}` — **full scope, not a shard** | **0** |
| `npm run test:kaola-workflow:claude` | green before my change (lead) | `7 passed, 0 failed` (final line of the gate's own tally) | **0** |
| `node scripts/test-claim-hardening.js` | (n/a) | `claim-hardening tests passed (766 assertions)` | **0** |

`edition-sync --write` was **not** needed and deliberately not run: the sink forge ports are
HAND-PORTED, not generated (`edition-sync.js:30-34` states this), and `--write` would also have
propagated other agents' in-flight canonical edits. The codex copy was produced by the one operation
`--write` would have performed for this file — `cp` canonical → codex — and verified byte-identical
with `cmp`.

### Baseline, my own run (not inherited)

```
$ node scripts/test-sink-merge.js
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 24 failed, 910 passed.
REAL_EXIT=1
```
24 = (e)×2 + (h)×2 + (i)×2 on each of root, codex, gitlab, gitea. `(f)`, `(g)`, `(i-control)` green.
Identical to the baseline the lead measured.

### After

```
$ node scripts/test-sink-merge.js
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite passed: 942 assertions.
REAL_EXIT=0
```

## 6. Mutation proofs — both directions

Run on **scratch mirrors** under the scratchpad (`rsync -a` copies of the worktree). Neither the real
tree nor the real worktree was ever mutated, and `git checkout --` was never used.

### 6a. Revert the guard → the arms go red again, on all four editions

The four sink copies in the mirror were replaced with their **committed HEAD blobs** — i.e. exactly
the pre-change file. Nothing else in the mirror changed.

```
$ node <mirror>/scripts/test-sink-merge.js
Sink-merge … test suite FAILED: 24 failed, 918 passed.
REAL_EXIT=1
```
Reds, counted by arm — exactly the population my change fixes, and nothing else:
```
2 #973 (e/root)   2 #973 (e/codex)   2 #973 (e/gitlab)   2 #973 (e/gitea)
2 #973 (h/root)   2 #973 (h/codex)   2 #973 (h/gitlab)   2 #973 (h/gitea)
2 #973 (i/root)   2 #973 (i/codex)   2 #973 (i/gitlab)   2 #973 (i/gitea)
```
```
FAIL: #973 (e/root): the untracked work must still exist after the sink. … exit=0 status="sinked"
      reason=undefined worktree_still_present=false survivors=[]
FAIL: #973 (i/gitlab): the untracked work must still exist after the LEGACY sink. … exit=0
      status="merged" reason=undefined worktree_still_present=false survivors=[]
```

### 6b. Mutate the other way — classify EVERY untracked path as work → the controls go red

In a second mirror the one filter line became `if (false) continue;` in all four copies (the mutation
was asserted to have applied; a no-op would have exited 2).

```
$ node <mirror>/scripts/test-sink-merge.js
Sink-merge … test suite FAILED: 21 failed, 919 passed.
REAL_EXIT=1
```
```
9 #707 h
1 #973 (f/root)          1 (f/codex)          1 (f/gitlab)          1 (f/gitea)
1 #973 (i-control/root)  1 (i-control/codex)  1 (i-control/gitlab)  1 (i-control/gitea)
1 #973 (i/root) premise  1 (i/codex) premise  1 (i/gitlab) premise  1 (i/gitea) premise
```
```
FAIL: #973 (f/root): the run must still complete. Every run leaves untracked lane content in its
      worktree, so a guard that treats untracked-means-dirty refuses EVERY sink … got exit=1
      status=undefined reason="worktree_dirty"

FAIL: #707 h: sink exits 0; got 1
  stdout: {"result":"refuse","reason":"worktree_dirty","detail":"sink-merge refused: … Uncommitted:\n
          ?? kaola-workflow/issue-70701/.cache/n1-impl.md\n  ?? kaola-workflow/issue-70701/.cache/n2-review.md"}
```
That is the trap the brief warned about, reproduced under my own hand — so the lane subtraction is
doing real work and is not decoration. It **reconciles exactly** with the lead's corrected count of
17 for a bare flag flip: `(f)`×4 + `(i-control)`×4 + `#707 h`×9 = 17, and my 21 is those 17 plus the
four `(i)`-premise assertions that fire once `(i-control)` has stopped completing. Both must-not-break
controls fire on **both** entry points, as the corrected count says they should.

Arm (g) stayed GREEN under both mutations, confirming the ignored population is untouched either way.

## 7. Observations I owe you

- **A transient version of `test-sink-merge.js` carried a rule my repair would red — RESOLVED, no
  action.** While running a control I saw four failures reading `#973 (i/<edition>)
  LITERAL-NULL-ENVELOPE-RULE: an arm whose envelope is null has measured nothing` — with
  `worktree_still_present=true` and `survivors=[".kw/worktrees/issue-97341/src/util/helper.js"]`,
  i.e. the work survived and only the *envelope* clause failed. That string is **not** in the current
  file (verified by byte-read on both the worktree copy and my mirror). The lead has since confirmed
  that rule is **wrong for this seam and was deliberately not implemented**: the legacy terminal is
  `try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }`
  (canonical `:3314`, verified by me), so a thrown refusal emits no envelope — which a legitimate
  Family-A refusal also does. Envelope-presence therefore cannot serve as a non-vacuity premise;
  `(i-control)` is `(i)`'s control instead, and my repair satisfies it on all four editions.
  **Nothing asks the legacy path to emit an envelope on refusal, and I have not made it do so.**
- **The scratchpad is shared between agents in this session.** My first mirror was at
  `<scratchpad>/mirror` and another agent was using the same obvious name; two runs over what should
  have been one static copy disagreed, which is what surfaced the string above. Every measurement in
  §6 was redone under uniquely-named directories (`<scratchpad>/implsink/m-revert`, `.../m-broad`)
  and each is internally consistent. Worth knowing before someone else trusts `<scratchpad>/mirror`.
- **I did not run `test:kaola-workflow:claude:full`.** It is never mandated, and the suite this
  change lives in was run by name at full scope.

## 8. Which suites actually cover this, and the one I added on my own initiative

The fast gate **defers four suites**, measured from `package.json` rather than assumed:
`test-claim-hardening.js`, `test-sink-merge.js`, `test-run-chains.js`, and the full walkthrough (the
gate runs `--shard auto/12` instead). I ran three of them at full scope: sink-merge (the suite that
holds these arms), the walkthrough, and — not asked for, but `test-claim-hardening.js` references
`sink-merge` ten times, so leaving it unrun would have been a gap I could see — claim-hardening.
`test-run-chains.js` contains zero references to sink-merge and was not run.

`test:kaola-workflow:claude:full` was not run; it is never mandated and everything in it that touches
this change has been run by name.

## 9. Safety and cleanliness

Every fixture the suite builds lives under `os.tmpdir()`, and the arms assert the realpath is under
the temp dir before anything destructive spawns. **No probe of mine was ever pointed at the real
repository or the real worktree**, and I ran no `git worktree` command anywhere outside a fixture.

Both mutation mirrors were deleted after their proofs; only the logs remain in the scratchpad. No
`kw-sink-*` or `kw-probe-*` fixture root survives under the temp dir.

**Worktree** (`git status --short --untracked-files=all`) — my four files, and nothing else of mine:
```
 M plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js     ← mine
 M plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js   ← mine
 M plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js                 ← mine
 M scripts/kaola-workflow-sink-merge.js                                        ← mine
 M …33 other files (CHANGELOG, docs, install*.sh, claim.js ×4, gap-sweep ×4,
   validation-runner ×4, test-*.js ×9, package.json, ROADMAP.md)              ← other agents'
?? kaola-workflow/.roadmap/issue-97{3,4,5}.md, scripts/test-fixture-sandbox.js  ← other agents'
```
Diffstat of my four: `4 files changed, 150 insertions(+), 12 deletions(-)` — 12 deletions = the
3 replaced lines × 4 copies.

**Main tree**: untracked run records under `kaola-workflow/bundle-973-974-975/` only; `impl-sink.md`
is the one I wrote. No tracked file in the main tree was touched.

**`git worktree list`**: 2 entries, unchanged (`main` at `69264936`, `workflow/bundle-973-974-975`).

## 10. What I could not reach

- **The legacy entry point emits no JSON envelope when it refuses**, so a legacy-path refusal is
  machine-readable only by exit code. That is pre-existing (`main()`'s terminal at canonical `:3314`)
  and **deliberate** — the lead confirmed nothing asks for an envelope here, and adding one to
  satisfy a non-vacuity premise would be the wrong fix for the wrong problem. Recorded as a property
  of the seam, not as a gap I left. See §7.
- **I did not measure the cost of `-uall` on a very large worktree.** It is one `git status` per sink
  over the linked worktree only, replacing a cheaper one. I judged the exposure acceptable and did
  not benchmark it; if anyone has a repo where `status -uall` is slow, that is where it would show.
