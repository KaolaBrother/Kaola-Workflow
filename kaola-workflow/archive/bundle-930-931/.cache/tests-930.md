# Tests for issue #930 — archiving must never relocate a directory that is not a project folder

**Baseline commit: `68cb48f4a71c1d125d403ed7e251d47d7077b730`** (main, clean except the untracked
`kaola-workflow/bundle-930-931/`, plus another agent's in-flight sink-merge edits — see §7).

No production code was touched. Two test files changed:

| File | What landed |
|---|---|
| `scripts/simulate-workflow-walkthrough.js` | `testArchiveNeverRelocatesReservedDir930` — 3 reserved names × 2 lanes, root edition |
| `scripts/test-forge-archive-scoping.js` | a `#930` section — `.roadmap` × the linked-worktree lane, **per edition, all four** |

---

## 1. What is pinned, and why that

The issue's demanded result verbatim: *"Archiving must never relocate a directory that is not a
project folder … `.roadmap` and its sources must still be in place afterwards."* Four assertions,
applied by ONE predicate to every name in every lane:

1. **Preservation** — the reserved directory still exists and every file of its own is present,
   byte-identical, **in every checkout**.
2. **No relocation** — `kaola-workflow/archive/<reserved>/` does not exist.
3. **Not a silent success** — `status !== 0 || (archived !== true && closure_receipt.archive !== 'closed')`.
   A run that did not archive the directory must not report that it did.
4. **The branch** — the feature-branch HEAD still carries the reserved directory's files. This is
   the worst lane's real damage: finalize authors `chore: archive .roadmap` deleting tracked files
   onto the branch the sink merges to main.

**FOREIGN vs the run's own.** Only content that predates the claim is pinned. `workflow-state.md`,
`.cache/` and the run's OWN roadmap source (`issue-<n>.md` for the issue being closed) are
deliberately unconstrained — closure removing the closed issue's source file is the documented
contract, and pinning it would forbid a legal fix. This is what keeps the pin method-neutral: it
does not care whether the implementer refuses, resolves the name, or does something else.

**No mechanism is pinned.** No reason token, no exit code, no field name that today's code does not
already carry, no predicate spelling. §6 shows the assertions pass under an implementation that
refuses and would equally pass under one that reports and continues.

## 2. Lanes and names covered

| Suite | Name | Lane | Baseline |
|---|---|---|---|
| walkthrough | `.roadmap` | in place, cwd = main checkout | **RED** |
| walkthrough | `.roadmap` | linked worktree, `--keep-worktree`, cwd = worktree | **RED** |
| walkthrough | `.origin` | in place | **RED** |
| walkthrough | `.origin` | linked worktree | **RED** |
| walkthrough | `archive` | in place | green — **CONTROL** |
| walkthrough | `archive` | linked worktree | green — **CONTROL** |
| scoping ×4 editions | `.roadmap` | linked worktree | **RED in all four** |

`.origin` is there because the class is not one name (premise fact 3). `archive` is the control.

### One deliberate deviation from the brief, flagged

The brief said of the `archive` control: *"Pin that this keeps refusing."* I pinned it at the same
strength as everything else — **nothing lost, and not a silent success** — rather than `exit != 0`.

Reason: "keeps refusing" is a mechanism, and this repo's own rule is *specify the result, never the
method*, with a first principle that the refusal count is zero except where destruction is at stake.
A uniform fix that converts `archive` from today's `EINVAL` dead-end into an explicit reported skip
at exit 0 destroys nothing and is arguably better; forcing `exit != 0` would red-flag it. What my
control forbids is exactly what matters: losing the archive's contents, or reporting a successful
archive that did not happen. It is green at baseline (today's exit 1 satisfies it). **If the lead
wants the stronger pin, it is a one-line change to `assertSurvived` — say so and I will make it.**

## 3. The baseline failure output

### Walkthrough — full scope, not a shard

```
$ node scripts/simulate-workflow-walkthrough.js
… 166 scenarios PASSED …
testOfflineNoHistoryClaimRoot699: PASSED
Error: #930 .roadmap / main lane: kaola-workflow/.roadmap must still exist in the main checkout after finalize
exit: 0
stdout: {"status":"closed","archived":true,"dest":"…/kaola-workflow/archive/.roadmap", …
         "closure_receipt":{…,"archive":"closed",…},"closure_invariants":{"ok":true,"violations":[]}, …}
    at assertSurvived (scripts/simulate-workflow-walkthrough.js:2591:7)
    at testArchiveNeverRelocatesReservedDir930 (scripts/simulate-workflow-walkthrough.js:2670:9)
EXIT=1
```

```
RED: testArchiveNeverRelocatesReservedDir930 — Error: #930 .roadmap / main lane: kaola-workflow/.roadmap must still exist in the main checkout after finalize (exit 0, archived=true, closure_invariants {ok:true,violations:[]})
baseline: 68cb48f4a71c1d125d403ed7e251d47d7077b730
```

Isolate it with `node scripts/simulate-workflow-walkthrough.js --only testArchiveNeverRelocatesReservedDir930`
(`--only` takes a name; no shard arithmetic needed). Registry is now 215 scenarios; the new one is
appended last, so no existing shard ordinal moved.

### Per-edition scoping suite

```
$ node scripts/test-forge-archive-scoping.js
scoping[claude/canonical] archive commit efc4bee3 carried 4 path(s): done     <- pre-existing, green
scoping[codex] … scoping[gitlab] … scoping[gitea] … done                      <- pre-existing, green
FAIL: 930[claude/canonical] the main checkout lost or altered kaola-workflow/.roadmap/_rules.md — archiving relocated a directory that is not a project folder
FAIL: 930[claude/canonical] nothing may be archived under kaola-workflow/archive/.roadmap — it is not a project folder; found: [".cache",".gitkeep","_rules.md","finalization-summary.md","issue-1.md","issue-930.md","workflow-state.md"]
FAIL: 930[claude/canonical] finalize must not exit 0 reporting a successful archive of .roadmap that it did not perform — archived=true, closure_receipt.archive="closed", closure_invariants={"ok":true,"violations":[]}
FAIL: 930[claude/canonical] the feature-branch HEAD no longer carries kaola-workflow/.roadmap/_rules.md — finalize committed the deletion onto the branch the sink merges to main; branch now holds: []
… the same 11 lines for [codex], [gitlab], [gitea] …
88 passed, 44 failed
EXIT=1
```

**All 44 failures are `^FAIL: 930`; zero pre-existing assertions regressed** (measured:
`grep '^FAIL' | grep -vc '^FAIL: 930'` = 0).

## 4. Arming — every assertion proven to fire, independently

Mutation-proven in a **scratch APFS clone of the repo**, never in the real tree; the clone was
deleted afterwards.

| # | Proof | Result |
|---|---|---|
| A | Plausible fix (early return for `archive` or dot-prefix in `archiveProjectDir`) → run the scenario | **PASSED** — all 6 legs green, incl. the 3 controls. Not stuck-red. |
| B | Fix `.roadmap` ONLY → run | **RED on `.origin`/main lane** — name coverage is armed, and both `.roadmap` legs went green |
| C | Fix gated on `!isLinkedRun` (in-place lane only) → run | **RED on `.roadmap`/linked-worktree lane** — lane coverage is armed |
| D | Reorder so (3) runs first, unfixed code | **RED**: `finalize must not exit 0 reporting a successful archive … archived=true, closure_receipt.archive="closed"` |
| E | Neuter (1)+(3), leave (2)+(4) | **RED**: `nothing may be archived under kaola-workflow/archive/.roadmap … found: [".cache",".gitkeep","_rules.md",…]` |
| F | Neuter (1)+(2)+(3), leave (4) | **RED**: `the feature-branch HEAD no longer carries kaola-workflow/.roadmap/.gitkeep — finalize committed the deletion onto the branch the sink merges to main` / `git show: fatal: path … does not exist in 'HEAD'` |

Each of the four assertions fails on its own at baseline, and none of them is load-bearing only
through another.

## 5. The cross-edition gap (brief item 8) — closed behaviourally

The premise report measured that **no guard in the tree can see an incomplete four-copy fix**: root
alone → `validate-script-sync` exit 1; root + github → exit 0; gitlab alone → invisible to both
`validate-script-sync` and `edition-sync --check`.

`test-forge-archive-scoping.js` was the right lever and needed no new wiring: it already drives all
four `claim.js` copies' real CLI offline in a linked-worktree fixture, and it **already runs in all
four chains** (`test:kaola-workflow:claude|codex|gitlab|gitea`). Adding a section there beats a new
file, which would have needed four `package.json` edits plus suite registration.

Mutation-proven, same scratch clone:

| Fix applied | `test-forge-archive-scoping.js` |
|---|---|
| none (baseline) | **88 passed, 44 failed** — all four editions red |
| root + github plugin ONLY | **110 passed, 22 failed** — root/codex green, **gitlab and gitea still red** |
| all four copies | **132 passed, 0 failed** |

An incomplete propagation is now visible, and the suite is satisfiable.

## 6. Rest of the suite

| Run | Result |
|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (**full scope, not the 1/12 shard**) | 166 scenarios PASSED; the **only** error is `testArchiveNeverRelocatesReservedDir930` |
| `node scripts/test-forge-archive-scoping.js` | 88 passed / 44 failed; **all 44 are mine**, 0 pre-existing regressions |
| `node scripts/test-suite-registration.js` | exit 0 — 43 files, 40 registered, 3 exempt; 505 assertions |
| `node scripts/test-spawn-classification.js` | exit 0 — 623 spawn sites, 126 slots of slack |
| `node scripts/validate-script-sync.js` | exit 0 — 27 byte-identical groups, 4 kernel copies identical |

## 7. Two things that change the picture

**(a) No existing test pinned the destructive behaviour — verified, not assumed.**
The premise report left this open. I measured it:
- no test anywhere passes a dot-prefixed or `archive` value as a project — `grep -E "(plantActiveFolder|writeProject|projectDir|statePath|seedAdaptiveFinalizeFixture)\([^,]+, *'\."` and `grep -E "project *[:=] *'archive'|'--project', *'archive'"` across `scripts/*.js` both return **nothing**;
- `test-forge-archive-scoping.js:333` and `test-claim-hardening.js:1528,2043` use `.roadmap` as the roadmap SOURCE directory with an ordinary project name — no conflict;
- `test-forge-archive-scoping.js:333` asserts the run's own `kaola-workflow/.roadmap/issue-1.md` removal reaches the archive commit. My "foreign vs the run's own" split was chosen partly so a fix cannot be forced to break it.

**Nothing needs rewriting or deleting.** No existing pin is in tension with the fix.

**(b) gitlab and gitea were READ-only in the premise; they are now DRIVEN, and the destruction is
real in both.** The premise report listed this under "Open / not measured" and expected the same
behaviour by reading `archiveProjectDir`'s byte-identical opening. Confirmed by measurement: both
ports relocate `.roadmap`, in both checkouts, at exit 0 with `archived:true`,
`closure_receipt.archive:"closed"`, `closure_invariants {ok:true,violations:[]}`, and commit the
deletion of the tracked sources onto the feature branch. No GitLab/Gitea forge was needed —
`KAOLA_WORKFLOW_OFFLINE=1` plus that suite's `stateForgeSection` fixture is sufficient.

**(c) Concurrent edits in the checkout.** My suite runs executed on a tree that also carried another
agent's in-flight modifications to `scripts/kaola-workflow-sink-merge.js`, its three plugin copies,
and `scripts/test-sink-merge.js` (issue #931's lane). Everything except my #930 legs was green with
those present. I did not touch them.

## 8. For the implementer

- **Do not edit either test file.** `tdd-guide` holds the test artifact.
- Both lanes need covering: `archiveProjectDir`'s in-place `fs.renameSync` branch AND the linked
  `copyDir` + `fs.rmSync` branch. Assertion set C above shows a one-lane fix stays red.
- **Four copies.** `scripts/`, `plugins/kaola-workflow/scripts/`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. The scoping suite now
  refuses an incomplete propagation (§5).
- **`isSafeName` is likely the wrong place** (premise inference, medium-high): it is the shared
  path-safety predicate for `claimProject`, both sinks and `closure-audit`, and widening it makes
  `archiveProjectDir`'s `assert` **throw** rather than report — which my assertion (3) tolerates
  (non-zero exit) but which changes every other caller's meaning.
- The claim side is out of scope by owner ruling; nothing here forces a claim-side change.

---

# Round 2 — response to adv-930 (R1, R2, R5)

Tree at the time of this round: HEAD still `68cb48f4`, with `impl-930`'s candidate uncommitted in the
working tree. **No production code touched.** Same two test files.

## R1 — the case-variant arm

**Verified the premise myself before building.** `os.tmpdir()` and this repo's volume are both
case-insensitive (`CaseProbe` → `caseprobe` exists; `/Users/…/Kaola-Workflow/claude.md` resolves,
control: `CLAUDE.md` exists). My first probe of the repo volume was mis-pathed and read
"case-sensitive"; re-run correctly it is case-INSENSITIVE, agreeing with adv-930.

**The fix had already landed when I got the message.** The predicate is now
`n.toLowerCase() === 'archive' || n.startsWith('.')`, and `--project Archive` already refuses
(driven: exit 1, `archive_reserved_directory`, band preserved in both checkouts; lowercase control
identical). So I could not show a red against the live tree. **I showed it against the pre-fix
predicate instead**, reverting exactly `n.toLowerCase() === 'archive'` → `n === 'archive'` in all
four `*claim.js` copies in a scratch clone.

**What landed.** A fourth arm in the walkthrough (`archive` directory, `Archive` as the caller-supplied
name, both lanes) and a second spec in the per-edition suite (`Archive`, linked lane, ×4 editions).
The two are now split into `dir` (the directory on disk) and `given` (the string the caller passes),
because a name-equality test on the caller's string is not a test about the directory it protects.

**It runs only where the aliasing is real** — a `CaseProbe`/`caseprobe` write-and-stat in `os.tmpdir()`,
probed not assumed. On a case-sensitive filesystem `Archive` is a genuinely distinct directory and
there is nothing to protect, so the arm skips **with a printed reason** and the scenario's PASSED line
carries the ran/total count (`4/4 names x 2 lanes`), so a skip can never be silent. This is also what
keeps your over-refusal trade free: the suite says nothing at all about `Archive` on a case-sensitive
host, so refusing it there is neither required nor forbidden by me.

**The red, pre-fix predicate, walkthrough:**

```
Error: #930 Archive / linked-worktree lane: the main checkout gained undeclared entries inside
kaola-workflow/archive/: ["Archive/.cache/final-validation.md","Archive/finalization-summary.md",
"Archive/issue-9300/mission-list.md","Archive/issue-9300/workflow-state.md","Archive/workflow-state.md"]
— archiving must not write into a directory that is not a project folder.
exit: 1
```

**Per edition, pre-fix predicate:** `184 passed, 4 failed` — one failure per edition, all on the
`Archive` arm, `.roadmap` arms all green. Restore the fold → `188 passed, 0 failed`.

**One thing worth knowing about what this arm catches.** Pre-fix, `--project Archive` on my fixture
ends in `archive_incomplete` (exit 1) having left a partial self-copy of the band at
`archive/Archive/` — bypass, residue, no loss. So it is assertion **(1b)**, not (1) or (3), that
catches it. adv-930's *destroying* variant additionally needs a repo-wide `*.md` ignore rule, which
empties `missingFromMain` and lets both `rmSync`s run. **I could not fold that condition into this
arm**: the destruction requires every band entry to be ignorable, while assertion (4) requires them
tracked on the branch — the two are mutually exclusive in one fixture. If the band were destroyed,
assertion (1) would fire; what this arm actually pins is that the guard is not bypassed at all.

## R2 — set-equality, and what strength I chose

**What I chose:** exact set-equality against a pre-run snapshot of the directory, in every checkout,
with a **named allowance** — `KNOWN_ADDITIONS = new Set(['finalization-summary.md'])` — rather than
either failing on the pre-existing write or ignoring additions entirely.

**Why that strength.** Failing the run over `finalization-summary.md` would red a pre-existing writer
you told me not to fail on. Ignoring additions leaves exactly the hole you named. Naming it does
three things at once: the write is on the record instead of invisible; any *other* addition fails
immediately; and if a future change stops writing it, the allowance is permissive, not mandatory, so
nothing breaks. The failure message names the constant, so the next person either fixes the writer or
declares it deliberately.

**Armed, and the allowance is load-bearing.** Emptying `KNOWN_ADDITIONS` in a scratch clone:

```
walkthrough: Error: #930 .roadmap / main lane: the main checkout gained undeclared entries inside
             kaola-workflow/.roadmap/: ["finalization-summary.md"]
scoping:     FAIL: 930[claude/canonical/.roadmap] the worktree checkout gained undeclared entries
             inside kaola-workflow/.roadmap/: ["finalization-summary.md"]   (and codex, gitlab, gitea)
```

Note the root differs by lane — main checkout in the in-place lane, worktree in the linked lane —
which is consistent with the persist writers running in the invoking root. With the allowance
restored both suites are green, so **`finalization-summary.md` is the only entry either suite's
reserved directory gains, in any lane, in any edition**. Measured, not assumed.

**A correction to R2's second measurement, and a gap I am leaving open deliberately.**
R2 also reports `.cache/final-validation.md` overwritten (`d7548b69… -> c5a93e23…`). In **my**
fixtures it is not: I instrumented the per-edition suite to digest that file before and after, in
both roots, all four editions and both specs — `c5a93e233cc8 -> c5a93e233cc8` every time. The reason
is that my fixtures align the two roots' validation record the way a real run does (one authored
record; the walkthrough has `alignFinalizeFixtureAcrossRoots` for exactly this), so the Step-8a mirror
is a no-op in content. R2's overwrite is real as a mechanism but only *observable* where the two roots
disagree. I did not rig the fixture to make them disagree: that would be a less realistic run, and it
would pin a content fact about the run's OWN artifact, which is deliberately unconstrained.

**The gap that leaves, stated plainly:** a change that *modifies* an existing file inside the reserved
directory is invisible to both suites **for the run's own paths only**. Foreign paths are already
byte-compared, and any *new* path anywhere is now caught. If you want the run's own artifacts pinned
too, say so — it is a different decision from this one and I did not take it unilaterally.

## R5 — the refuted prose, corrected

You are right and I have removed the claim. The scenario comment used to read: *"`archive` is the
CONTROL — the one reserved name that already survives today (its rename dead-ends EINVAL)"*. Two
things were wrong with it: the fact (adv-930's control C shows a linked-lane `--project archive` at
HEAD exiting 0 and destroying both bands), and the form — it was a mechanism claim, which is exactly
the kind that rots.

It now states the durable fact instead:

> Four names run through ONE predicate, and NONE of them is a control: every one of them could be
> destroyed. `archive` in particular is not the safe sibling it looks like — whether it survived used
> to depend on the FIXTURE, not on the name. A large archive band made the completeness verifier
> refuse; a small one copies cleanly and the run deletes both live copies at exit 0. Any claim that
> one of these names is inherently safe is a claim about a fixture.

This also retires the "control" framing from my round-1 report and from §2's table: the `archive` legs
are ordinary arms, and my round-1 note that they were "green at baseline" was true only of the
fixtures I happened to build. The round-1 deviation I flagged — pinning the `archive` arm at
result-strength rather than `exit != 0` — is unaffected and, if anything, better supported: a name
whose survival depended on fixture size was never a refusal contract worth freezing.

## Round-2 suite state

| Run | Result |
|---|---|
| `simulate-workflow-walkthrough.js` (**full scope**) | **exit 0** — 167 PASSED, `testArchiveNeverRelocatesReservedDir930: PASSED (4/4 names x 2 lanes)` |
| `test-forge-archive-scoping.js` | **exit 0** — `188 passed, 0 failed`; 4 editions × `.roadmap` + 4 editions × `Archive` |
| `test-suite-registration.js` | exit 0 — 505 assertions |
| `test-spawn-classification.js` | exit 0 — 623 spawn sites, 126 slots of slack |
| `validate-script-sync.js` | exit 0 — 27 byte-identical groups, 4 kernel copies identical |

Mutation ledger for round 2 (all in scratch clones of the working tree, deleted after; the real tree
was never modified and `git checkout --` was never run):

| Mutation | Walkthrough | Per-edition suite |
|---|---|---|
| none (candidate) | PASSED 4/4 | 188 / 0 |
| predicate `toLowerCase()` → exact-match, ×4 copies | **RED** on `Archive`/linked lane | **184 / 4** — one per edition, `Archive` only |
| `KNOWN_ADDITIONS` emptied | **RED** naming `finalization-summary.md` | **RED** in all 4 editions, both specs |
