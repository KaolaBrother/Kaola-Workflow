# m-predicate-adopt — the sink adopts the shared `archiveSucceeded` predicate

**Task**: replace the hand-rolled archive-success test added by 6eed9801 in `runSinkTransaction`'s
`finalize` step with a call to the shared predicate `archiveSucceeded(result)`, in all four editions.
Pure refactor, no behaviour change.

**Verification tier**: `regression-green` — the four named suites green before AND after.

## THE REFACTOR

Removed from all four editions:

    const archiveHappened = !!(archiveResult && archiveResult.archived === true);
    const nothingToArchive = !!(archiveResult && archiveResult.skipped === 'source-missing');
    if (!archiveHappened && !nothingToArchive) {

Replaced by:

    const { archiveSucceeded } = require('<edition module>');
    if (!archiveSucceeded(archiveResult)) {

The `#899` comment block above the test is kept and extended by three lines naming the closure
contract as the boundary being crossed; the `#899` and `#700` markers are intact.

| edition | file | line | require idiom used |
|---|---|---|---|
| canonical | `scripts/kaola-workflow-sink-merge.js` | 1965–1966 | `require('./kaola-workflow-closure-contract')` |
| github plugin | `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | 1965–1966 | same (byte mirror) |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 1778–1779 | `require('./kaola-workflow-closure-contract')` |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | 1771–1772 | `require('./kaola-workflow-closure-contract')` |

### Why that idiom, and why it is the same string in all four

The closure-contract module is **not** forge-prefixed — all four editions ship it under the identical
name `kaola-workflow-closure-contract.js` (9117 bytes, byte-identical across the four). Every existing
require site already spells it without the `.js` extension, in every edition:

    scripts/kaola-workflow-claim.js:18                          const closureContract = require('./kaola-workflow-closure-contract');
    plugins/kaola-workflow/scripts/kaola-workflow-claim.js:18            (same)
    plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:25   (same)
    plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:25     (same)

That also matches the in-file precedent for the other shared, non-forge-prefixed module: line 15 of
all four sink files reads `require('./kaola-workflow-adaptive-schema')`, no extension. No cross-edition
require was introduced — resolution was proved per edition, not assumed:

    scripts/kaola-workflow-sink-merge.js                      -> scripts/kaola-workflow-closure-contract.js                        :: archiveSucceeded=function
    plugins/kaola-workflow/scripts/…-sink-merge.js            -> plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js :: archiveSucceeded=function
    plugins/kaola-workflow-gitlab/scripts/…-sink-merge.js     -> plugins/kaola-workflow-gitlab/…/kaola-workflow-closure-contract.js:: archiveSucceeded=function
    plugins/kaola-workflow-gitea/scripts/…-sink-merge.js      -> plugins/kaola-workflow-gitea/…/kaola-workflow-closure-contract.js :: archiveSucceeded=function

The require sits at the point of use, inside the `try`, matching the file's own local idiom (the same
block requires `archiveProjectDir` inline at canonical:1906). Placing it there rather than at module
top level keeps load-time behaviour byte-for-byte unchanged.

The github plugin copy was produced by `cp` from the canonical file, not by a second hand edit, so the
mandated byte mirror cannot drift; `diff` confirms zero bytes apart.

## REASON / DETAIL PRESERVATION

Only the **success test** changed. The body of the `if` — the reason and detail construction — is
untouched, and appears as unmodified context in the diff:

    reason: (archiveResult && archiveResult.reason) || 'archive_not_performed',
    detail: (archiveResult && archiveResult.detail)
      || ('archiveProjectDir returned without archiving: ' + JSON.stringify(archiveResult)),

The catch arm is **not in the diff at all** — the `TypeError`/`ReferenceError` rethrow (#555) and the
`archive_exception` record below it are byte-unchanged.

**Equivalence, measured not asserted.** A differential over 23 result shapes (every shape the archive
boundary produces, plus adversarial junk: `null`, `undefined`, `0`, `''`, `'x'`, `NaN`, `false`, `true`,
`[]`, `[1]`, `42`, `{archived:'true'}`, `{archived:1}`, `{skipped:true}`, `{skipped:'other'}`) compared
the old hand-rolled test against `archiveSucceeded`: **0 disagreements**. Algebraically the same —
`(r && a) || (r && b)` is `r && (a || b)`.

**Recorded reasons, computed through the shipped expression:**

| archiveProjectDir returns | recorded reason |
|---|---|
| `{archived:false, reason:'archive_forced_refusal'}` | `archive_forced_refusal` |
| `{archived:false, reason:'archive_exception', detail:'EACCES'}` | `archive_exception` (detail `EACCES`) |
| `{archived:false}` | `archive_not_performed` |
| `null` | `archive_not_performed` |
| `{archived:true}` | — no failure recorded |
| `{skipped:'source-missing'}` | — no failure recorded |

All three reasons named in the brief survive. `archive_forced_refusal` originates at
`scripts/kaola-workflow-claim.js:2406` and reaches the sink as `archiveResult.reason`, which the
untouched expression still prefers over the `archive_not_performed` fallback.

## EXIT CODES

Each captured with `$?` directly on the node invocation — no pipe, no `tail`.

| # | check | before | after |
|---|---|---|---|
| 1 | `node scripts/test-sink-merge.js` | **0** | **0** |
| 2 | `node scripts/validate-script-sync.js` | **0** | **0** |
| 3 | `node scripts/test-bundle-finalize.js` | **0** | **0** |
| 4 | `node scripts/test-finalize-door.js` | **0** | **0** |

Sanity check that the refactor is real, not cosmetic: `grep -rn "archiveHappened\|nothingToArchive"
scripts plugins` returns **no matches** anywhere in the tree, and all four files show both the require
and the `!archiveSucceeded(archiveResult)` call at the lines tabled above.

`git diff --stat` shows my four files at 6 insertions / 4 deletions each. `docs/api.md`,
`docs/architecture.md` and `CHANGELOG.md` also appear modified — none of those are mine. (`CHANGELOG.md`
was not dirty in the snapshot I was handed at start; another agent touched it during my run.)

## FINDING — the branch has no test coverage in the sink suite

Reported, not fixed: I do not write tests.

I mutation-proved the new call rather than trusting the green. Mutating `if (!archiveSucceeded(archiveResult))`
to `if (!true)` — i.e. making the sink treat **every** archive result as success, which is precisely the
#899 defect — left `node scripts/test-sink-merge.js` at **exit 0**. The mutation was applied to the
canonical and mirror copies together so the pair never diverged, and both were restored from scratch
copies (never `git checkout --`); the restored state is re-verified green above.

What the sink suite does cover: `(x1)` an archive that **threw** (the catch arm), `(x2)` the
`source-missing` no-op, `(x3)` a drifted `archiveProjectDir` export. What it does **not** cover is the
**RETURN** path — `archiveProjectDir` returning `{archived:false, reason:'archive_forced_refusal'}` — the
exact door the `#899` comment says a catch-only fix would leave open. `grep -rl "#899" scripts` matches
only `kaola-workflow-sink-merge.js`: no test file mentions #899 at all.

Two nearby suites look like coverage but are not:
- `scripts/test-bundle-finalize.js:1509-1516` unit-tests `archiveSucceeded` itself, not the sink's use of it.
- `simulate-workflow-walkthrough.js:9737 testArchiveCallersFailClosed699` drives `claim.js`
  `finalize`/`release`/`watch` under `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` — claim's four call
  sites, never the sink.

`test-sink-merge.js` has no force-refusal mechanism for the return path at all. The gap is in the
**test**, not in the code: the refactored branch is reachable in production — the sink requires
`archiveProjectDir` from claim.js at canonical:1906, and claim.js:2406 returns the `archived:false`
shape under that env var. This is coverage the `m899-archive-tests` work should close.

## ANYTHING NOT DELIVERED

Nothing from the assigned scope. All four editions refactored, all four checks exit 0, no commit made
(as instructed), no test file written or edited, no file outside my four touched.
