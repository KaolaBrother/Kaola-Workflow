# Tests — issue #971 (run folder resolved against cwd, not the tree it lives in)

**Baseline: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`** (worktree `.kw/worktrees/bundle-969-970-971-972`,
branch `workflow/bundle-969-970-971-972`). Both suites land RED on it.

## Files changed (test paths only — no production file touched)

| file | change |
|---|---|
| `scripts/test-gap-sweep.js` | +T25a–T25f, a real-linked-worktree fixture, a no-`KAOLA_GAP_ROOT` runner |
| `scripts/test-bash-block-guards.js` | +Test F — executes Step 9's capture block from all 6 rendered finalize surfaces |

## Assertion counts and exit codes

| suite | before | after (baseline) | after (fixed) |
|---|---|---|---|
| `scripts/test-gap-sweep.js` | **127 passed, exit 0** | **142 passed / 8 FAILED, exit 1** | 151 passed, exit 0 |
| `scripts/test-bash-block-guards.js` | **7 passed, exit 0** | **31 passed / 18 FAILED, exit 1** | 42 relevant assertions ok |

(150 vs 151 in gap-sweep is not a discrepancy: one T25c assertion is nested behind
`sweptClasses[0]` existing, and on the baseline that array is empty so it never runs.)

## RED — literal output, `node scripts/test-gap-sweep.js`, exit 1

```
FAIL: T25b (#971): the gate run from the linked worktree reads MAIN's run folder and refuses gaps_unswept, the same verdict it reaches from main — got {"result":"refuse","reason":"artifact_missing","detail":"run-gaps.json not found; run --project proj-t25b first"}
FAIL: T25c (#971): the scanner run from the linked worktree sweeps MAIN's seeded gap rather than an empty worktree .cache, got []
FAIL: T25c (#971): the artifact lands in MAIN's .cache, got /private/var/folders/.../kw-gap-wt-wsUeA3/wt/kaola-workflow/proj-t25c/.cache/run-gaps.json
FAIL: T25c: run-gaps.json exists in MAIN's .cache after a worktree scan
FAIL: T25c (#971): the scanner leaves NO stray run folder in the worktree — mkdirSync on a cwd-resolved output path is what creates one
FAIL: T25c (#971): scan-then-check entirely from the worktree must NOT exit 0 while a real gap sits unswept in main — got exit 0 / {"result":"pass","mapped":0,"filed":0,"noise":0}
FAIL: T25c (#971): the gate refuses gaps_unswept instead of taking the vacuous-pass branch, got {"result":"pass","mapped":0,"filed":0,"noise":0}
FAIL: T25c (#971): the unmapped gap is named, got undefined
gap-sweep tests FAILED (8 failures, 142 passed)
```

The load-bearing line is the sixth: `got exit 0 / {"result":"pass","mapped":0,"filed":0,"noise":0}`
— the silent green, reproduced, with a real gap sitting unswept in main's cache.

## RED — literal output, `node scripts/test-bash-block-guards.js`, exit 1

18 failures, 3 on each of the 6 rendered surfaces. One surface's set verbatim:

```
FAIL: F (#971): commands/kaola-workflow-finalize.md — run from the linked worktree, Step 9 must bind SINK_BRANCH from MAIN's workflow-state.md; the sink consumes it. Got SINK_BRANCH=[]
FAIL: F (#971): commands/kaola-workflow-finalize.md — SINK_ISSUE captured from the worktree, got []
FAIL: F (#971): commands/kaola-workflow-finalize.md — SINK_ISSUE_NUMBERS captured from the worktree, got []
...
test-bash-block-guards: 18 failed, 31 passed
```

Repeated identically for the Claude SKILL and the four gitlab/gitea surfaces.

## What is pinned

### gap-sweep (`scripts/test-gap-sweep.js`, T25)

Fixture: a real `git worktree add` linked worktree; the run folder created in MAIN **after** the
worktree exists and left uncommitted — the run-time topology.
Seeded gap: `gap: flaky-suite — the sink suite went red once` in **main's** `.cache/run-gaps-manual.md`.

- **T25a — reference (passes today).** Scanner + `--check` from main: swept 1 class, gate exits 1
  with `gaps_unswept`. Everything else must match this.
- **T25b — RED.** Scanner from main, gate from the worktree: must refuse `gaps_unswept`, not
  `artifact_missing`. Pinned on the **reason**, not the message text — the emitted path is absolute
  and a verbatim pin would freeze a string the script never emits.
- **T25c — RED, the false green.** Scanner *and* gate both from the worktree, the operator's
  natural recovery. Four things pinned: the scanner sweeps main's class (not `[]`); the artifact
  lands in **main's** `.cache`; **no stray run folder** appears in the worktree; the gate exits 1
  with `gaps_unswept` and names `manual:flaky-suite` instead of taking the vacuous-pass branch.
- **T25d — `KAOLA_GAP_ROOT` precedence, armed (passes today, must keep passing).** The override
  points at a **third** tree seeded with a *different* gap (`manual:env-root-gap`), so the swept
  class names which root was actually read — a git lookup winning would show `manual:flaky-suite`.
  Both modes are checked, and nothing may be written into main.
- **T25e — the run folder in the invoking tree stays there (passes today).** Folder resident only
  in the worktree, absent from main. An unconditional reach for main breaks this; the rule is *the
  tree the run folder lives in*, not *always main*.
- **T25f — no git, no override (passes today).** A cwd outside any repository still scans. A tree
  lookup that throws must not take the script with it.

### Step 9 (`scripts/test-bash-block-guards.js`, Test F)

A meaningful automated pin **is** constructible here, and it is executable rather than textual: the
block is extracted from each **rendered** surface, `{project}` substituted the way the agent
substitutes it, and run under `bash` in a main+worktree fixture. Per surface: exactly one block
found (non-vacuity), then `SINK_BRANCH` / `SINK_ISSUE` / `SINK_ISSUE_NUMBERS` bound correctly from
cwd=worktree (RED), `ACTIVE_WORKTREE_PATH` still resolving to the linked worktree, and the same run
from cwd=main unchanged (control). `HOME` is redirected at the fixture so the Codex resolver's
`find "$HOME/.codex/plugins/cache"` cannot reach this machine.

## Satisfiability proof (scratch mirror — nothing landed in the repo)

A pin that cannot go green is worth nothing, and T25d/T25e pin the *inverse* of the new behaviour,
so both were proven reachable together.

- gap-sweep: `scripts/` copied to the scratchpad, the copy's resolution patched to
  *this-tree-first-then-`resolveMainRoot`* with `KAOLA_GAP_ROOT` still short-circuiting.
  `node <mirror>/scripts/test-gap-sweep.js` → **`gap-sweep tests passed (151 assertions)`, exit 0**.
  The 8 RED assertions flip and all six controls hold.
- Step 9: each block body patched with
  `SINK_MAIN_ROOT="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"` and the state
  file rooted at it. All 42 assertions across the 6 surfaces pass. That is one *plausible* fix, not
  a prescription — the assertions accept any fix that binds the variables.

## Collateral guards checked

`test-spawn-classification.js` (ceiling 1 on `test-gap-sweep.js`, 2 on `test-bash-block-guards.js`)
reds on any unclassified new spawn site. Every new site carries a `// spawn-class:` marker
(`environment` for git fixture setup, `cli-contract` for the CLI runs) — it exits 0. The marker must
sit on the site's own line or the one directly above; a marker above the enclosing `function` line
does not count. `validate-script-sync.js`, `test-validate-script-sync.js` and
`test-suite-registration.js` all exit 0; neither test file is mirrored into the edition trees.

## FLAG FOR THE IMPLEMENTER — a production pin will red on the Step 9 fix

`scripts/validate-workflow-contracts.js:521` pins the defective literal exactly:

```js
assertIncludes('commands/kaola-workflow-finalize.md', 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"');
```

Any fix that changes that assignment reds it. I did not touch it: it is an existing pin someone else
relies on, and relaxing it is a call for the orchestrator, not for me. It needs to move **with** the
mechanism — re-pointed at whatever the fixed assignment is, in the same change, not repaired ahead
of it or after it.

## What I deliberately did not pin

- **The `artifact not found` string.** Measured absolute, quoted relative in the issue. Pinning the
  reason token instead.
- **gap-sweep run from a subdirectory of main.** Same defect class in principle, never observed or
  measured. Adding it would specify a mechanism the issue does not demand.
- **The both-trees-resident case** (post-mirror, folder in main *and* worktree). Which tree wins is
  genuinely ambiguous there and no measurement settles it; freezing a guess would be a confidently
  wrong oracle.
- **The 2 untracked edition surfaces** (`.opencode/command/…`, `.kimi/skills/…`). They do not exist
  in a fresh worktree, so a suite assertion over them is not constructible; they inherit the fix
  through the skeleton and their own installers. Propagation is 6 tracked + 2 edition = 8.
- **`--output` / `--summary` relative-path resolution against the new root.** Existing callers pass
  absolute paths; pinning it would over-specify.
- **`resolveRecordFolder` / `resolveMainRoot` by name.** The assertions specify the result. Which
  helper delivers it is the implementer's call.

---

# Follow-up — the `validate-workflow-contracts.js:521` pin (routed back under test custody)

**Outcome: the pin is REMOVED, not rewritten.** I could not construct a rewrite that meets the
brief's constraints, and the reason is a measurement, not a preference. Below is the measurement,
then the justification in the terms the brief asked for.

## Files changed in this follow-up

| file | change |
|---|---|
| `scripts/validate-workflow-contracts.js` | `assertIncludes(... 'SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"')` dropped; replaced by a comment recording why and where the property now lives |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | the same bytes — this file has one vendored copy and `validate-script-sync.js` enforces byte-identity (it went RED when I edited only the root; diff now verified IDENTICAL) |

## Assertion counts and exit codes — `validate-workflow-contracts.js`

It aborts on first failure and prints no count, so the count is static call sites.

| | assertion sites | exit |
|---|---|---|
| before | **220** | 0 (`Workflow contract validation passed`) |
| after | **219** | 0 (`Workflow contract validation passed`) |

Note the "before" column: the pin was **green on the defective surface**. It exited 0 at
`7e962bdc` *because* the cwd-relative path was there. That is what it was for — it certified the
defect's spelling.

## The measurement that forced removal

A `cd`-only fix — prepend `cd "$(dirname "$(git rev-parse --git-common-dir)")"` to the Step 9 block
and leave `SINK_STATE_FILE` **byte-identical** — makes the capture cwd-independent and **passes Test
F on all six surfaces, 48/48, exit 0** (scratch harness, `proto-step9-cdonly.js`). The rooted fix
(`SINK_MAIN_ROOT=...` then a rooted path) also passes, **49/49 against the real suite in a full repo
mirror**, and it *deletes* the pinned string.

So the two valid fixes have **no common text at that site**. Every static candidate I built fails on
one of them:

| candidate | rooted fix | `cd`-only fix | verdict |
|---|---|---|---|
| the existing verbatim `assertIncludes` | RED | green | blocks a valid fix — this is the reported defect |
| `assertNotIncludes` on the same string (retire the defect spelling) | green | **RED** | rejects a valid fix |
| "the path must be rooted / must not start with `kaola-workflow/`" | green | **RED** | rejects a valid fix |
| "rooted **or** a `cd` appears in the block" | green | green | passes both, but it is a two-branch enumeration of routes — it *is* route inspection, and a third route (replacing the capture with a script call) reds it |

`docs/conventions.md:851` — "Hand an agent the **form of the result** and check whether it arrived.
Do not specify how, **and do not inspect the route**." A substring matcher over prose has no access
to the result here: "the capture binds the sink metadata whichever tree the operator stands in" is a
runtime property of a shell block. Every static approximation of it is a route inspection, and the
table above is the evidence that each one misfires on a fix a reviewer should accept.

## Justified as a mechanism removed with its test, not a test removed to get green

- **Not "to get green".** `validate-workflow-contracts.js` was green before my change and is green
  after. My own tests live in two other files and never touched it. Nothing of mine passes because
  of this removal.
- **The mechanism being removed is the freeze itself.** The pin's entire content was *"today's
  spelling of this line"*. The fix changes that spelling (or does not, per the table) — either way
  the thing the pin pinned is gone or is no longer the thing that matters. It is deleted **with** its
  mechanism, in the same bundle, not ahead of it.
- **Precedent in the file, same shape.** Lines 575-578 already drop the two `assertBefore` calls for
  the finalize commit with the note that ordering "is enforced by the code path (and its suite), not
  by token order in a command surface." That is this argument exactly, one property earlier.

## Coverage: what the old pin covered, and where each part went

| the old pin asserted | now asserted by | strictly stronger? |
|---|---|---|
| the GitHub command surface carries a Step 9 sink-metadata capture | Test F `blocks.length === 1` per surface, **plus running it** | yes — 6 surfaces, not 1 |
| that capture reads the project's `workflow-state.md` | Test F binds `SINK_ISSUE_NUMBERS` / `SINK_ISSUE_ACTION` values that exist **only** in that file | yes — a value, not a substring |
| the `{project}` render token is present in the path | Test F substitutes it; a missing or hard-coded token makes the read miss and the binds come back empty | yes |

**Mutation-proven, not asserted.** In a full repo mirror with the rooted fix applied (Test F green,
49/49), I deleted the Step 9 capture from `commands/kaola-workflow-finalize.md` — the exact defect
the old pin existed to catch. Test F went **RED, 4 failures, exit 1**:

```
FAIL: F (#971): commands/kaola-workflow-finalize.md — run from the linked worktree, Step 9 must bind SINK_BRANCH from MAIN's workflow-state.md; the sink consumes it. Got SINK_BRANCH=[]
FAIL: F control: commands/kaola-workflow-finalize.md — run from main, SINK_BRANCH is unchanged, got []
test-bash-block-guards: 4 failed, 45 passed
```

The control leg firing is the important half: that is the direction the old pin covered, and it is
caught.

## What is genuinely lost

One thing, and it is small: the old pin would red if a future edit made Step 9 obtain the branch
from somewhere **other than** `workflow-state.md` — say `git rev-parse --abbrev-ref HEAD`. Test F
would accept that for `SINK_BRANCH` alone. It does **not** accept it overall, because `SINK_ISSUE`
and `SINK_ISSUE_NUMBERS` have no source but the state file and Test F pins both. So the residue is
narrower still: a hybrid capture that read the branch from git and the issue fields from the state
file would pass Test F and would have passed the old pin too — the old pin never asserted where
`SINK_BRANCH` came from either. On inspection nothing is lost that the old pin actually held.

## RED, honestly

A deletion cannot be RED, and I will not manufacture one: every candidate that *is* red on the
baseline is red on a valid fix as well, which makes it a guard against the implementer rather than
against the defect. The RED evidence for this behaviour is Test F's **18 failures across 6 surfaces,
exit 1, on `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`**, recorded above — and Test F is still RED on
the current tree, because the Step 9 skeleton fix has not landed yet.

## State of the tree at the time of writing (a fact for the orchestrator, not my verdict)

The gap-sweep production fix has landed across all four tracked copies while I was on this task, so
`scripts/test-gap-sweep.js` now reports **151 assertions, exit 0** — the exact count my scratch-mirror
satisfiability proof predicted, with the 8 RED assertions flipped and all six controls holding.
Whether that fix is correct is a verdict for a reader, not for the author of the tests it passes.
`test-bash-block-guards.js` remains **18 failed / 31 passed, exit 1**; Step 9 is still open.
