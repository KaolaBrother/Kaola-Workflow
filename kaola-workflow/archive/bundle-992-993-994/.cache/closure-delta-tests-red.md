# Closure-delta tests — RED

Baseline commit: **`c62e8a3fb6c38ae17c721211065233dca1f38442`** (`c62e8a3f`, `chore: release 9.10.0`).
Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994`.
Tests authored, left in place, RED. **No production file touched** — the diff on my three files is
374 insertions and 0 deletions, so no existing test was altered or removed.

---

## 1. Clean-baseline PASS, per suite

Run on the clean tree at `c62e8a3f` before any edit. Exit codes read directly, never after a pipe.

| suite | command | exit | tail |
|---|---|---|---|
| `scripts/test-bundle-finalize.js` | `node scripts/test-bundle-finalize.js` | **0** | `test-bundle-finalize: all 160 tests passed` |
| `scripts/test-finalize-door.js` | `node scripts/test-finalize-door.js` | **0** | `finalize-door tests passed (515 assertions)` |
| `scripts/simulate-workflow-walkthrough.js` | `--only testKeepOpenArchiveStamp --only testE2EGitHubMergeFullChain` | **0** | `testKeepOpenArchiveStamp: PASSED` / `testE2EGitHubMergeFullChain: PASSED` / `Walkthrough --only subset passed (2 scenarios)` |
| `scripts/test-gap-sweep.js` | `node scripts/test-gap-sweep.js` | **0** | `gap-sweep tests passed (173 assertions)` |

`test-gap-sweep.js` was baselined because I read its fixture shapes, but **I added nothing to it** —
its `## Run gaps` grammar is reused inside the other suites' fixtures instead.

**Pre-existing assertions are all still green after my edits** — the arithmetic confirms it, so the
concurrent agent's in-flight edits (`commands/`, `templates/routing/`, `plugins/**/SKILL.md`) reach
none of these suites:

* bundle: `180 passed, 12 FAILED` → `180 − 20 new-passing = 160` = the baseline count exactly.
* door: `539 passed, 40 FAILED` → `539 − 24 new-passing = 515` = the baseline count exactly.

---

## 2. What I added, and where

### `scripts/test-bundle-finalize.js:1004-1249` — coverage 1, 3, 5

Three helpers plus one scenario, inserted after the neighbouring `#508` merge-lane test:

* `closureBlockFields(dest)` (`:1039`) — the archived `## Closure` block as a field map.
* `writeLoggingGhMock(binDir, callsLog, fullLog)` (`:1057`) — logs **every** gh invocation twice:
  verb+subject to `calls.log`, full argv to `full.log`.
* `runClosureDeltaLeg(gapRows)` (`:1086`) — a four-member bundle (`bundle-9201-9204`, members
  `9201..9204`) finalized `--keep-worktree` over a summary whose `## Run gaps` section carries
  `gapRows`. Three legs, all with the **same project name and members in separate roots**, so their
  forge traffic is directly comparable.
* `testClosureBlockRecordsBacklogDelta` (`:1119`) — legs A (4 filed + 1 `noise:`), B (14 filed),
  C (empty section).

### `scripts/test-finalize-door.js:2686-2820` — coverage 4

* `closureBlockOf(dest)` (`:2715`).
* `T14_closureDeltaDegradesToATokenNeverToZero` (`:2730`) — three legs × **all four
  `CLAIM_EDITIONS`** (root, codex, gitlab, gitea), following T13's precedent: `absent` (no summary
  at all), `empty` (`## Run gaps` heading, nothing under it), `freetext` (`- none` under it), on the
  main-resident + linked-worktree posture via `buildMainResidentRun` / `runFinalizeKeepWorktree`.

### `scripts/simulate-workflow-walkthrough.js:349-358` — coverage 2

One assertion added inside the existing `testKeepOpenArchiveStamp`, immediately after its
`issue_disposition: kept-open` pin.

---

## 3. Which test pins which coverage point

| # | claim | pinned by |
|---|---|---|
| **1** | merge-lane run stamps `issues_closed` = claimed-set size (not 0), with `issue_disposition: close-pending` | bundle legs A/B/C: `f.issues_closed === '4'` + `f.issue_disposition === 'close-pending'` (3 legs). Door T14 `absent` leg adds the single-issue instance, `issues_closed === '1'`, × 4 editions |
| **2** | keep-open run stamps `issues_closed: 0` | walkthrough `testKeepOpenArchiveStamp`, `/^issues_closed: 0$/m` |
| **3** | N follow-ups → `follow_ups_filed: N`, `follow_up_numbers` in order, correct signed delta | bundle leg A (`4` / `7001,7002,7003,7004` / `0`), leg B (`14` / 14 numbers / `+10`), leg C (`0` / `none` / `-4`) |
| **4** | the degradation pair | door T14: `absent` → `unknown`+`unknown`; `empty` and `freetext` → `0`+`none`; **plus two explicit pair assertions** that `absent.follow_ups_filed !== empty.follow_ups_filed` and `absent.net_backlog_delta !== empty.net_backlog_delta` |
| **5** | zero new forge calls | bundle legs: zero `issue close`; no call in `full.log` naming any follow-up number; `calls.log` **byte-identical** across A/C and B/C |

Coverage 1 and 2 are a **pair by construction**: a build hardcoding `closure.attempted.length` reds
on the keep-open leg (walkthrough); a build hardcoding `closure.closed.length` reds on the bundle
legs (which are `[]` on that lane). Neither test alone pins the field.

---

## 4. RED output, verbatim

### `scripts/test-bundle-finalize.js` — exit **1**, `12 test(s) FAILED, 180 passed`

```
Test (#992/#993/#994): the archived ## Closure block records the run's backlog delta
FAIL: #992 A: `issues_closed` is the size of the set this run's closure decision is closing — the four claimed members the sink will close after the merge — NOT the number of `gh issue close` calls this process made, which is zero on this lane by design (#508). A `0` here is `closure.closed.length`; a `1` is the scalar `issue_number` instead of the member array; got undefined with closure={"attempted":[9201,9202,9203,9204],"closed":[],"failed":[],"skipped_offline":[],"kept_open":[]}
FAIL: #992 B: `issues_closed` ... ; got undefined with closure={"attempted":[9201,9202,9203,9204],"closed":[],...}
FAIL: #992 C: `issues_closed` ... ; got undefined with closure={"attempted":[9201,9202,9203,9204],"closed":[],...}
FAIL: #992 A: `follow_ups_filed` counts the `filed:` refs in `## Run gaps`, and that section carries FIVE rows of which one is `noise:` — a noise row is an observation the run decided not to file, so counting rows rather than filings reads 5; got undefined
FAIL: #992 A: `follow_up_numbers` lists the filed issue numbers in the order the section names them, comma-separated with no spaces — and the `noise:` row contributes none, because it has no number to contribute; got undefined
FAIL: #992 A: four closed and four filed is a net-zero run, and zero renders bare — the sign is explicit only when there is a direction to state; got undefined
FAIL: #992 B: fourteen `filed:` rows is fourteen filings; got undefined
FAIL: #992 B: every filed number is listed, in section order; got undefined
FAIL: #992 B: fourteen filed against four closed GREW the backlog by ten, and a growth reported as `10` reads as a magnitude with no direction — the leading `+` is what makes the sign of the delta legible without arithmetic; got undefined
FAIL: #992 C: a `## Run gaps` section that is PRESENT and carries no filing is a measured zero, and it must read as one; got undefined
FAIL: #992 C: with nothing filed the number list is `none` — an empty value would be indistinguishable from a field that failed to render; got undefined
FAIL: #992 C: four closed and nothing filed SHRANK the backlog by four; got undefined

test-bundle-finalize: 12 test(s) FAILED, 180 passed
```

Every failure is **field absent** (`got undefined`), never a crash or a fixture fault. The premise
assertions in the same legs all PASS, so each leg genuinely reaches its target: `status === 0`, the
`## Closure` block parses, `issue_disposition === 'close-pending'`, and the gh mock was reached
(≥ 4 calls). The `closure=` tail printed in the message is the live envelope and confirms the source
the implementer must read: `closure.attempted` is `[9201,9202,9203,9204]` while `closure.closed` is
`[]`.

### `scripts/test-finalize-door.js` — exit **1**, `40 failures, 539 passed`

10 failures × 4 editions. One edition quoted in full; the other three are byte-identical modulo the
`T14(<edition>)` tag.

```
T14: an unmeasurable follow-up count degrades to `unknown`, and a measured zero stays `0`
FAIL: T14(root) absent: there is no `## Run gaps` section to read, so the number of follow-ups this run filed was never measured. `0` here is a claim — "this run filed nothing" — that nobody made and nothing checked, and the archived record is the last place that claim can be corrected; got undefined
FAIL: T14(root) absent: the delta is arithmetic over a term that was not measured, so it is not measured either — an implementation that treats the missing count as zero reports a confident `-1` for a run whose net effect on the backlog is simply not known; got undefined
FAIL: T14(root) absent: `issues_closed` comes from the claimed set, not from the summary, so an unreadable gap section must not degrade it too; got undefined
FAIL: T14(root) empty: a `## Run gaps` section that is present and carries no filing is a measurement whose answer is zero, and it must read as a number; got undefined
FAIL: T14(root) empty: with nothing filed the list reads `none` — an empty value would be indistinguishable from a field that failed to render; got undefined
FAIL: T14(root) empty: one issue closed and nothing filed is a backlog one shorter, and with both terms measured the delta is too; got undefined
FAIL: T14(root) freetext: `- none` is a free-text bullet the gap grammar ignores by design, so the section carries zero FILINGS — counting bullets rather than `filed:` refs reads 1; got undefined
FAIL: T14(root) freetext: and no numbers to list; got undefined
FAIL: T14(root): "nobody measured" and "measured, and it was zero" must not render the same. This is the assertion the field exists for: an implementation that always says `unknown` passes the absent leg, one that always says `0` passes the empty leg, and only a build that actually distinguishes the two passes here. Both read undefined
FAIL: T14(root): and the delta inherits the distinction — a run whose effect on the backlog is unknown must not be recorded as the same fact as a run that measurably shortened it by one. Both read undefined
...
FAIL: T14(codex) ... (10, identical)
FAIL: T14(gitlab) ... (10, identical)
FAIL: T14(gitea) ... (10, identical)
finalize-door tests FAILED (40 failures, 539 passed)
```

Again all field-absent. The 24 new PASSING assertions are the per-leg premises (exit 0 + block
parses, 2 per leg × 3 legs × 4 editions), so no leg is passing vacuously through a fixture that
stopped reaching finalize.

### `scripts/simulate-workflow-walkthrough.js --only testKeepOpenArchiveStamp` — exit **1**

The walkthrough throws on first failure, so every assertion before mine passed:

```
Error: #992: a keep-open run closes nothing, so its ## Closure block must record issues_closed: 0 — stamping the claimed-set size here would report a closure that was explicitly declined; got: # Kaola-Workflow State
...
## Closure
archived_at: 2026-08-17T10:45:56.075Z
issue_disposition: kept-open
claim_label_removed: skipped_offline
worktree_removed: missing
closure_invariants: ok

    at assert (.../scripts/simulate-workflow-walkthrough.js:50:25)
    at Object.testKeepOpenArchiveStamp [as fn] (.../scripts/simulate-workflow-walkthrough.js:356:5)
```

The dumped block is the whole evidence: five fields, no `issues_closed`.

### Compact signatures

```
RED: #992 A (test-bundle-finalize) — `issues_closed` absent; got undefined, closure.attempted=[9201,9202,9203,9204]
RED: T14(root|codex|gitlab|gitea) absent (test-finalize-door) — `follow_ups_filed` absent; got undefined
RED: T14(root|codex|gitlab|gitea) pair (test-finalize-door) — absent and empty both read undefined
RED: testKeepOpenArchiveStamp (simulate-workflow-walkthrough:356) — /^issues_closed: 0$/m did not match the archived ## Closure block
baseline: c62e8a3fb6c38ae17c721211065233dca1f38442
```

---

## 5. The coverage-5 assertions are CONTROLS, and I mutation-proved them

**They pass on the baseline, and they must.** Before the fields exist there is no new forge call to
make, so a "zero new forge calls" assertion cannot be red-first — it can only fire against a bad
implementation. Saying otherwise would be reporting a green as a red.

Because a control that reds nothing is more likely broken than redundant, I armed them by planting
the exact defect they exist to catch: a temporary mutant in `runClosureDeltaLeg` that, after
finalize returns, invokes the gh mock with `issue view <N>` once per `filed:` row — standing in for
an implementation that resolves the numbers over the wire instead of off the disk the summary is
already sitting on. Run with `KW_MUTATE_FORGE_PROBE=1`, **four control assertions fired**:

```
FAIL: #992 A: no forge call may NAME a follow-up issue number ... ; got ["7001","7002","7003","7004"]
FAIL: #992 B: no forge call may NAME a follow-up issue number ... ; got ["7101","7102","7103","7104","7105","7106","7107","7108"]
FAIL: #992: legs A and C claim the SAME four members under the SAME project name and differ only in how many follow-ups their summary names, so their forge traffic must be identical. ...
FAIL: #992: and fourteen filings cost no more forge traffic than zero. ...
```

Leg C stayed green under the mutant, correctly — it files nothing, so there is no extra call to
make. **The mutant has been fully reverted**; the suite is back to `12 test(s) FAILED, 180 passed`.

The byte-identity comparison is also guarded against vacuity: a `leg.calls.length >= 4` premise
means two empty logs cannot satisfy it by never reaching the mock. Measured live, each leg's log is
13 lines (`issue list …`, `issue view` × 4, `issue edit` × 4, `issue comment` × 4).

---

## 6. Things in the design that did not survive contact with the code

Four items. The first two are places where I **deliberately did not freeze an answer**, because
freezing the wrong one is worse than leaving it open.

### 6a. "**missing or malformed** `## Run gaps` → `unknown`" — the *malformed* half is not deliverable from the named source

`parseGapSection` (`scripts/kaola-workflow-gap-sweep.js:234-293`) returns `null` in exactly two
cases: the summary file does not exist (`:235`), or the `## Run gaps` heading never appears
(`:293`, `return inSection ? entries : null`). A section that **is** present but whose rows all fail
the strict grammar returns `[]` — to the caller, byte-identical to a section that is present and
genuinely empty. And the parser's own comment (`:267-281`) states that free-text bullets (`- none`,
prose notes) are ignored **by design** for back-compat and *must never even warn*.

So "malformed rows → `unknown`" cannot be produced by the grammar the brief names as the source. An
implementer would have to add a distinction the parser deliberately refuses to make (e.g. counting
`- ` bullets and comparing against parsed entries) — which would then also misread `- none` as
malformed.

**What I pinned instead** is the unambiguous half: the section could not be **located** — no summary
at all, or a summary with no such heading — yields `unknown`. That is what T14's `absent` leg tests,
and it is the reading the source actually supports. **I wrote no test that freezes either answer for
the all-rows-malformed case.** If `unknown` is genuinely wanted there, it needs an owner call and a
mechanism beyond `parseGapSection`.

### 6b. `follow_up_numbers` has no stated value under degradation

The spec is `follow_up_numbers: <a,b,c>|none`, with no `unknown` alternative, while both its
companions carry one. I did **not** assert `follow_up_numbers` on T14's `absent` legs: `none` there
would freeze exactly the measured-zero/not-measured conflation the other two fields exist to
prevent, and `unknown` would invent a token the spec does not list. The pair distinction is fully
pinned by `follow_ups_filed` regardless, so the suite is complete without it — but the implementer
will have to pick something, and **whatever they pick is currently unpinned**. Owner call.

### 6c. `noise:` rows counting as filings — my reading, stated so it can be overruled

The brief names the strict grammar as the source but does not say whether a `noise:` row counts.
Leg A carries five rows, one of them `noise:`, and asserts `follow_ups_filed === '4'`. My reasoning:
the field is named `follow_ups_**filed**`, and a noise row has no issue number to contribute to
`follow_up_numbers`, so counting it would make the two fields disagree by construction. If the owner
wants noise counted, **this assertion is where to overrule me** — `test-bundle-finalize.js:1165`.

### 6d. "in order" — I did not force a choice

`follow_up_numbers` "listing them in order" admits document order or sorted order. I wrote every
fixture's rows in ascending numeric order so the two coincide; the suite does not decide between
them, and would not catch an implementation that sorts.

### 6e. Verified-correct (re-measured by RUNNING, not read)

Everything else in the brief and the survey held up:

* **The merge lane closes nothing.** Live envelope from a four-member bundle finalized
  `--keep-worktree`: `closure = {"attempted":[9201,9202,9203,9204],"closed":[],"failed":[],
  "skipped_offline":[],"kept_open":[]}`, `issue_disposition: close-pending`, **zero** `issue close`
  calls in the mock log. `closure.attempted` is the only honest source for `issues_closed`.
* **The block is exactly five fields today** — confirmed on three different postures (in-place
  bundle, main-resident linked worktree, offline keep-open).
* **A `## Run gaps` section pre-seeded into the live run folder survives into `result.dest`**,
  followed by finalize's own `## Validation` / `## Changed Paths` — so `parseGapSection`'s
  "stop at the next `## ` heading" terminates it correctly and the sections do not bleed.
* **`appendClosureBlock` is heading-guarded**, so the sink cannot revise the block — the reason
  `issues_closed` cannot be a close count.

### 6f. `parseGapSection` export — NOT needed, and I did not add it

The brief allowed me to export it. **I did not.** Every assertion goes through the finalize CLI and
reads the archived `## Closure` block, so no test addresses `parseGapSection` directly and
`scripts/kaola-workflow-gap-sweep.js:587` is still `module.exports = { main };`, unmodified. The
implementer should treat the export as an open choice, not a done deal.

### 6g. `simulate-workflow-walkthrough.js:4936-4944` — left alone on purpose

`testE2EGitHubMergeFullChain`'s "feature worktree must be clean after finalize --keep-worktree"
assert is already the guard for "the new field's bytes land inside the same `chore: archive`
commit". It needs no new test: it will red on its own if the append moves out of the commit-last
ordering. Verified still green after my edits (exit 0).

---

## 7. Not run, deliberately

Per the brief: **no `npm test`, no four-chain run** — another agent is editing `commands/`,
`templates/routing/` and the plugin SKILL surfaces in this same worktree concurrently. Only the four
suites above were run. Nothing was committed.

---

## Follow-up: `follow_up_numbers` pin

Closing §6b — the one value in the `## Closure` block that rested on prose alone. Shipped
behaviour is `computeBacklogDelta` returning `followUpNumbers: 'unknown'` when
`parseGapSection` yields `null` (`scripts/kaola-workflow-claim.js:2465-2467`), and nothing
asserted it: a regression to the documented `none`, or dropping the line, would have stayed
green forever.

### The assertions added

Both in `scripts/test-finalize-door.js`, inside T14, running across all four `CLAIM_EDITIONS`.

**1. The direct value**, in the `absent` leg beside the two degradation assertions already there
(`:2776-2786`):

```js
assert(absent.follow_up_numbers === 'unknown',
  base + ' absent: the number list degrades with its count. `none` here would assert that this '
  + 'run filed nothing, over a section nobody could read — the same false confidence '
  + '`follow_ups_filed: unknown` exists to refuse, one field to its left; got '
  + JSON.stringify(absent.follow_up_numbers));
```

**2. The pair**, beside the `follow_ups_filed` / `net_backlog_delta` pair assertions (`:2830-2834`):

```js
assert(absent.follow_up_numbers !== empty.follow_up_numbers,
  base + ': and so does the list. The regression this forbids is the plausible one — the field '
  + 'spec enumerates `<a,b,c>|none` and no third token, so collapsing the unmeasured lane onto '
  + 'the documented `none` looks like tidying and is the conflation itself. Both read '
  + JSON.stringify(absent.follow_up_numbers));
```

Two are needed, not one: the pair form alone would still pass if the field were dropped entirely
(`undefined !== 'none'`), and the direct form alone does not say what it is being distinguished
*from*. `8 = 2 × 4 editions` new assertions.

**Pre-mutation green:** `node scripts/test-finalize-door.js` → exit **0**,
`finalize-door tests passed (587 assertions)` — `579 + 8`, so nothing pre-existing moved.

### The mutant

One value, one file, one edition: `scripts/kaola-workflow-claim.js:2467`,
`followUpNumbers: 'unknown'` → `followUpNumbers: 'none'`. The three other editions carry their own
claim copies and were left untouched, so they double as the control.

`node scripts/test-finalize-door.js` → exit **1**:

```
FAIL: T14(root) absent: the number list degrades with its count. `none` here would assert that this run filed nothing, over a section nobody could read — the same false confidence `follow_ups_filed: unknown` exists to refuse, one field to its left; got "none"
FAIL: T14(root): and so does the list. The regression this forbids is the plausible one — the field spec enumerates `<a,b,c>|none` and no third token, so collapsing the unmeasured lane onto the documented `none` looks like tidying and is the conflation itself. Both read "none"
finalize-door tests FAILED (2 failures, 585 passed)
```

**Exactly the two new assertions fired, and only on `T14(root)`** — the one edition whose claim.js
was mutated. `585 + 2 = 587`, so no pre-existing assertion moved either way, and the untouched
codex/gitlab/gitea legs stayed green, which is what makes the red attributable to the mutated value
alone rather than to anything the run shares.

### Clean revert

Mutation reverted by restoring the original token. Verified three ways, exit codes read directly:

```
$ git diff --numstat -- scripts/kaola-workflow-claim.js
65      2       scripts/kaola-workflow-claim.js          # the implementer's diff, unchanged
$ diff -q scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
IDENTICAL                                                 # the COMMON_SCRIPTS byte-pin holds
$ git diff --numstat -- scripts/test-finalize-door.js
152     0       scripts/test-finalize-door.js             # my file, insertions only
```

No production residue: `65 2` is byte-for-byte the implementer's own numstat from before the
mutation, and canonical↔codex byte-identity — the pin `validate-script-sync.js` enforces — is intact.

### Final

```
$ node scripts/test-finalize-door.js
finalize-door tests passed (587 assertions)
EXIT=0
```

Nothing committed. Only `scripts/test-finalize-door.js` was modified this round.
