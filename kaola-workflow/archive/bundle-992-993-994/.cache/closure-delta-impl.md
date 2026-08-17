# Closure backlog-delta fields — implementation

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994`.
Baseline: `c62e8a3f`. **Nothing committed.** **No test file touched** — the diff on the three test
files is still `374 insertions, 0 deletions`, byte-for-byte what the test author reported.

**Verification tier: `tests-green`.**

---

## 1. Result

| suite | command | exit | before | after |
|---|---|---|---|---|
| bundle-finalize | `node scripts/test-bundle-finalize.js` | **0** | `12 test(s) FAILED, 180 passed` (exit 1) | `all 192 tests passed` |
| finalize-door | `node scripts/test-finalize-door.js` | **0** | `FAILED (40 failures, 539 passed)` (exit 1) | `passed (579 assertions)` |
| walkthrough | `node scripts/simulate-workflow-walkthrough.js` | **0** | throws at `:356` (exit 1) | `scenarios:184, ran:184, passed:184, failed:0` |

Each exit code was read directly from the command, never after a pipe. The walkthrough ran at
**FULL scope, not a shard** — its own shard line proves it: `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}`.

Arithmetic confirms no pre-existing assertion moved: `192 − 12 = 180` and `579 − 40 = 539`, the two
baselines exactly.

**One extra suite, run on my own judgement and reported as such:** `node scripts/test-sink-merge.js`
→ **exit 0**, `1063 assertions`. It is the third `appendClosureBlock` call site
(`persistSinkClosureMetadata`), which my change gives defaults to, and it was outside the three
suites I was told to run. It is cheap and read-only; leaving the lane I changed unmeasured seemed
worse than running it.

**Zero new forge calls — confirmed by the live control, which stayed green.** The three
coverage-5 assertions in `test-bundle-finalize.js:1198-1228` all pass: zero `issue close` calls per
leg, no call anywhere naming a follow-up number, and legs A/C and B/C produce **byte-identical**
call logs (each leg's log is 13 lines, so the non-vacuity premise `calls.length >= 4` holds). The
resolution is a single `fs.readFileSync` of the archived `finalization-summary.md`.

---

## 2. The seam I chose, and why

**Exported `parseGapSection` from gap-sweep; claim.js requires it as a same-tree sibling.**
`scripts/kaola-workflow-gap-sweep.js:587` is now `module.exports = { main, parseGapSection };`.

I chose this over hoisting the parser into `kaola-workflow-adaptive-schema.js`, and the deciding
measurement is one I made rather than assumed:

- **The kernel writes nothing to stdout or stderr today.** `grep -n "process.stderr\|process.stdout\|console\." scripts/kaola-workflow-adaptive-schema.js` returns **zero hits**; even `refuse()` (`:548`) only *returns* an object. `parseGapSection` writes an advisory malformed-line warning to stderr (`gap-sweep.js:276-279`). Hoisting it unchanged would break that property of the cross-edition drift anchor, and hoisting it *changed* would fork the one grammar into two behaviours.
- **The grammar and the gate that refuses on it stay in one file.** The closure block now reports over the same rows the gate refuses on; splitting the parser from its refusal is how two spellings of one grammar start.
- **Cost.** Export seam: 8 files, one of them a one-line export. Kernel hoist: 12 files, relocating ~60 lines through a 4-copy byte-identical group policed by two separate checks.

**The one thing the kernel seam would have bought — a single require string in all four editions —
is already covered by a shipping test.** `test-finalize-door.js:1633-1638` defines `CLAIM_EDITIONS`
as all four claim scripts and **T14 drives every one of them**, so a wrong or missing require path
in either hand-ported forge tree reds the suite immediately. I verified this is not theoretical: all
four claim modules load, and the load test dereferences an export so it cannot pass on a no-op.

Load-time safety was measured, not assumed: `grep -nE "^[^ /*]"` over gap-sweep shows its entire
column-0 surface is `'use strict'`, two `require`s (fs, path), function declarations, a
`require.main === module` guard, and `module.exports`. **Zero top-level side effects**, so importing
it from claim.js is inert. No cycle: gap-sweep requires only fs, path and the kernel.

---

## 3. Files changed (9)

```
 docs/workflow-state-contract.md                                        |  6 +-
 scripts/kaola-workflow-claim.js                                        | 67 +++++++-
 scripts/kaola-workflow-gap-sweep.js                                    |  5 +-
 plugins/kaola-workflow/scripts/kaola-workflow-claim.js                 | 67 +++++++-
 plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js             |  5 +-
 plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js   | 67 +++++++-
 plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js | 5 +-
 plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js     | 67 +++++++-
 plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js |  5 +-
 9 files changed, 281 insertions(+), 13 deletions(-)
```

Nothing else was touched. `templates/`, `commands/`, `plugins/**/commands`, `plugins/**/skills` and
`CHANGELOG.md` carry the other agent's completed change and are untouched by me — including
`CHANGELOG.md`, which I deliberately left alone per the brief; **the four new fields are a
user-visible change and still owe a `[Unreleased]` entry**, which is the orchestrator's to write
alongside the entry already there.

### How each edition copy was verified

| copy | class | how it was produced | how it was verified |
|---|---|---|---|
| `scripts/kaola-workflow-claim.js` | canonical | hand-edited | the three suites |
| `scripts/kaola-workflow-gap-sweep.js` | canonical | hand-edited | the three suites |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | codex, `COMMON_SCRIPTS` byte-identical | `cp` from canonical | `diff -q` → identical; T14(codex) green |
| `plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js` | codex, `COMMON_SCRIPTS` byte-identical | `cp` from canonical | `diff -q` → identical |
| `plugins/kaola-workflow-gitlab/.../kaola-gitlab-workflow-gap-sweep.js` | **generated** (`edition-sync` `GENERATED_AGGREGATORS`) | hand-edited to the exact bytes generation produces | `node scripts/edition-sync.js --check` → **exit 0**, `8 forge aggregator ports in parity with canonical` |
| `plugins/kaola-workflow-gitea/.../kaola-gitea-workflow-gap-sweep.js` | **generated** | same | same run |
| `plugins/kaola-workflow-gitlab/.../kaola-gitlab-workflow-claim.js` | **hand-ported, unguarded** | hand-edited | T14(gitlab) green; module-load test; added-line diff vs canonical |
| `plugins/kaola-workflow-gitea/.../kaola-gitea-workflow-claim.js` | **hand-ported, unguarded** | hand-edited | T14(gitea) green; module-load test; added-line diff vs canonical |

I did **not** run `edition-sync.js --write` — it regenerates broadly and would have reached the
other agent's in-flight surfaces. I hand-wrote the two generated ports to generation's exact bytes
and proved it with the read-only `--check`, which passed.

**The forge claim ports diverge from canonical in exactly two places, both declared.** I proved it
by diffing the added lines:

1. the require path — `require('./kaola-{gitlab,gitea}-workflow-gap-sweep')`, the tree's rename;
2. one comment drops the GitHub binary name: canonical says ``not a count of `gh issue close` calls``,
   the ports say `not a count of close calls`. This is the existing house pattern, not an invention
   — the forge ports carry **zero** `gh ` references (`grep -c` → 0 in both), and the parallel
   comment at `kaola-gitlab-workflow-claim.js:4468` already reads "execute forge issue close" where
   canonical reads ``execute `gh issue close` ``.

Normalising the forge token, the gitlab and gitea additions are **identical**.

---

## 4. What was built

### `appendClosureBlock` — four lines, and a default for the lanes that do not measure

The block gains `issues_closed`, `follow_ups_filed`, `follow_up_numbers`, `net_backlog_delta` after
`closure_invariants`. **No new disposition field** — `issue_disposition` above them is the
disposition token, unchanged.

`appendClosureBlock` has three callers and only `cmdFinalize` holds both terms, so the writer maps a
missing field to `unknown` rather than to `undefined`:

```js
const delta = key => (fields[key] === undefined || fields[key] === null) ? 'unknown' : fields[key];
```

This is a decision I made that the brief did not cover, so state it plainly: **`cmdWatchPr`'s MERGED
lane and `sink-merge`'s `persistSinkClosureMetadata` now stamp `unknown` for all four.** Neither
reads a summary, and `persistSinkClosureMetadata`'s own header already says its fields are "honestly
PENDING here". `unknown` × 4 is consistent with that posture; the alternative — emitting
`issues_closed: undefined`, or varying the block's field set by lane — is worse in both directions.
`test-sink-merge.js` (1063 assertions) and the walkthrough's watch-pr MERGED leg are both green over
it. **If the sink should instead report its own authoritative `closed_issues` here, that is a
separate design call and I did not make it.**

### `computeBacklogDelta(issuesClosed, projectDirCandidates)`

New function beside `appendClosureBlock`. Probes `finalization-summary.md` in
`[result.dest, kaola-workflow/<project>]` — archive candidate first, then live, the order and reason
`probeSelectionEvidence` uses. First candidate whose parse is non-null wins.

- `follow_ups_filed` = `entries.filter(e => e.kind === 'filed').length` — the parser's own `kind`
  discriminator, so **`noise:` rows contribute nothing**, which is what leg A (5 rows, 1 noise → `4`)
  pins.
- `follow_up_numbers` = those entries' `ref`s joined with `,`, **in document order** (`filed.map`
  over the parse, no sort), `none` when empty.
- `net_backlog_delta` = `filed.length − issuesClosed`, rendered `0` bare, `+n` for growth,
  `-n` for shrink.

### `issues_closed`

```js
keepIssueOpen ? 0 : ((closureReceipt.closure && closureReceipt.closure.attempted) || []).length
```

The claimed set (`closure.attempted`, assigned unconditionally ~90 lines above at `claim.js:4744`),
not a count of close calls — zero on the shipped merge lane. Keep-open stamps `0`. It never degrades
to a token: the door test's `absent` leg pins `issues_closed === '1'` while its three companions read
`unknown`.

---

## 5. Where the design did not survive contact with the code

### 5a. **The middle degradation rule is wrong, and the tests forbid it.** (the one real correction)

The brief specifies three states:

> - parser returns `[]` **and the section contains at least one line starting with `- `** → same
>   three `unknown` values (content was seen and could not be read)

**That rule fails `test-finalize-door.js`.** T14's `freetext` leg writes
`'# Finalization Summary\n\n## Run gaps\n\n- none\n'` — a located section, parser returns `[]`, and
the section **does** contain a line starting with `- `. The brief says `unknown`; the test asserts:

```js
assert(freeText.follow_ups_filed === '0', ... 'counting bullets rather than `filed:` refs reads 1; got ' ...)
assert(freeText.follow_up_numbers === 'none', ...)
```

The test is right and the brief is wrong. `parseGapSection`'s own comment (`gap-sweep.js:267-281`)
states that free-text bullets "are ignored by design for back-compat and must never warn" — so a
`- ` bullet is not evidence of unreadable content, and the brief's own next sentence ("Count bullets
only") is precisely the implementation the test calls "wrong twice over". The test author flagged
this in `closure-delta-tests-red.md` §6a before I got here.

**I implemented two states, not three:** `null` → `unknown` × 3; any array → measured, counted by
`kind === 'filed'`. I did not edit the test, and I built no all-rows-malformed detector — that would
be a second copy of the parser's "looks like a mapping attempt" regex
(`/^-\s+.*\(.*\):\s*(filed:|noise:)/`), justified by no observed failure and pinned by nothing.
**If `unknown` is genuinely wanted for a section whose rows all fail the strict grammar, it needs an
owner call and a mechanism inside `parseGapSection`, not beside it.**

### 5b. `follow_up_numbers` under degradation — the brief's call, taken, and it is unpinned

`unknown`, as the brief specifies. No test asserts it (T14's `absent` leg deliberately skips it), so
this value rests on the brief alone and nothing would catch a change to it.

### 5c. Everything else in the brief checked out

- `closure.attempted` really is `[9201,9202,9203,9204]` with `closed: []` on the merge lane.
- `claim.js:4765-4771` really does compute both cache dirs, and `probeSelectionEvidence` really is
  the archive-then-live precedent one line above the call site. I needed the **project** dirs, not
  the `.cache` dirs (the summary sits one level up), so I passed `[result.dest, path.join(root,
  'kaola-workflow', args.project)]` — the same pair `computeGoalDeclaration` already takes at `:4775`.
- The heading presence-guard, the commit-last ordering, and the five-field starting block are all as
  described. The walkthrough's `testE2EGitHubMergeFullChain` clean-tree assert (`:4936-4944`) is
  green, so the four new lines land inside the same `chore: archive` commit.
- `docs/api.md` and `docs/architecture.md` do **not** enumerate the block's fields (only
  `workflow-state-contract.md` does), so the brief's doc scoping was right and no second prose copy
  now disagrees.

---

## 6. Doc change

`docs/workflow-state-contract.md:291-296`, the `## Closure` bullet. The four names append to the
existing enumeration **in emission order**, keeping the file's convention (flat bullet, inline code
spans, serial "and"), followed by two sentences saying what the four are and that `unknown` exists.
Longest new line is 98 columns; the surrounding section already runs to 110.
