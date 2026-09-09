# Acceptance evidence v2 — issue #1054, PART 1 (finalize stops parsing the Mission List)

## Files
- `scripts/test-issue-1054-mission-list-carriers.js` — new suite, 116 assertions when the new
  behavior is in place (3 layouts x 4 claim.js trees for 1a, one hand-written-survives leg for 1b,
  4-tree symbol-absence check for 1c).
- `scripts/fixtures/issue-1054/bundle-1053-mission-list.md` — reused byte-identical copy of the
  real archived bundle-1053 table (from `.cache/withdrawn/fixtures-issue-1054/`).
- `scripts/test-finalize-door.js` — REWROTE the retired T17 assertions (see below); rest of the
  file untouched (839 assertions total now, was 839 before too — 3 old items:2 assertions replaced
  1:1 with 3 stays-empty assertions).
- `package.json` — registered the new suite on both `test:kaola-workflow:claude` and `:claude:full`;
  `node scripts/test-suite-registration.js` passes (688 assertions).

## Public path
The real `finalize` CLI, spawned per claim.js tree exactly as `scripts/test-finalize-door.js`'s T17
and `scripts/test-forge-finalize-findings.js` drive it: a real git fixture repo (no package.json,
so the validation gate takes the `final-validation.md` arm — no chain execution needed), offline
(`KAOLA_WORKFLOW_OFFLINE=1`, no gh mock required), real `finalization-summary.md` output read back
from disk. No mock of finalize itself.

## What's pinned and why it's meaning-level
- **1a** (12 legs: 4 trees x 3 layouts — real table, line-form, an unfamiliar numbered-bold layout):
  the finalize envelope carries no `mission_list` key; the durable summary has no `items: N` line,
  no "carrying an outcome..." line, and no "unrecognized/unsupported format" text; `goal_declared`
  (`closure_receipt.goal_declared`) stays `true` regardless of layout — proving `parseGoal`/
  `computeGoalDeclaration` are untouched while the Mission List's BODY is no longer read at all.
- **1b**: a hand-written `## Mission List` paragraph survives byte-for-byte and the heading occurs
  exactly once — the existing fill-if-empty discipline for OTHER headings must not regress into
  touching this one.
- **1c**: `probeMissionListCoherence` / `persistMissionListToSummary` do not appear anywhere (regex
  word-boundary, not a broad "mission" ban) in any of the 4 claim.js trees, and are not exported —
  by symbol, not just by behavior.
- **test-finalize-door.js T17** (owned rewrite, per the brief's explicit authorization): removed
  `## Mission List` from `SCRIPT_OWNED_HEADINGS` (now `['## Validation', '## Changed Paths']`);
  replaced the three `items: 2` / contradiction-line assertions (legs A, B, C) with
  `mBody.trim() === ''` — the heading Step 6 plants must stay exactly as planted, never filled,
  since it is no longer script-owned at all. Updated the two stale comments describing "three
  reports"/"THREE FINALIZE REPORTS". Nothing else in the file changed; sanity-run against the
  current WIP implementation: 839/839 assertions pass (was 839 before my edit too — 1:1 swap).

## RED proof
```
git worktree add /private/tmp/claude-501/kw-1054-p1-baseline 662bcd33
# copied scripts/test-issue-1054-mission-list-carriers.js, scripts/fixtures/issue-1054/, and the
# rewritten scripts/test-finalize-door.js into that worktree
node scripts/test-issue-1054-mission-list-carriers.js   # exit 1
node scripts/test-finalize-door.js                       # exit 1
```
Baseline: `662bcd339c6efef5f0e29dbe13f33189a27f2848`.

**New suite: 44 failures / 72 passed, exit 1.** Representative:
```
FAIL: gitea/unfamiliar: the finalize envelope carries no `mission_list` measurement; got
{"items":0,"outcome_while_not_done":[]}
FAIL: gitea/line-form: no `items: N` line in the durable summary; got summary containing "items: 2"
FAIL: 1c: claude/canonical: `probeMissionListCoherence` does not appear anywhere in
scripts/kaola-workflow-claim.js
```

**test-finalize-door.js: 3 failures / 836 passed, exit 1** (all three are the rewritten T17 legs):
```
FAIL: T17a (consecutive-heading form): `## Mission List` is left EMPTY — finalize no longer parses
or counts the record (#1054); got "\nitems: 2\ncarrying an outcome while their status is not
`done`: 1\n\n...- line 6\n"
```
Temp worktree removed with `git worktree remove --force` after capture.

## Part 1 status: DONE — implementer can reconcile against it now.

## Not pinned / left to reviewer attention
- I did not assert anything about WHETHER `## Mission List` remains in the Step 6 skeleton's
  heading list at all (docs/template changes are out of my scope; behavior-only pin here).
- Did not run `npm test`, `:claude:full`, or the walkthrough.

# PART 2 — the record is never overwritten by a staler copy (content, not counts)

Authority: `kaola-workflow/bundle-1054/.cache/sync-guard-trace.md`.

## Files
- `scripts/test-ledger-compare.js` — REWROTE entirely (I own this file per the brief): dropped all
  `countComplete` assertions, added content-identity pins (22 assertions): first-sync (null/''/
  undefined dest), byte-identical repeat, a real-data content-diverged case (bundle-1053 table
  minus 3 done rows vs the full table, both directions), the count-proxy trap (equal done-counts,
  different content), layout independence (an unfamiliar layout through the same two safe arms),
  CLI exit codes (0/3/1), `--help` text, and a negative pin that `countComplete` is no longer
  exported.
- `scripts/test-issue-1054-ledger-guard.js` — new integration suite (28 assertions): drives the
  real `finalize --keep-worktree`/`--check` CLI over a genuine main-root + linked-worktree git
  fixture, per claim.js port.
- `package.json` — registered the new suite on both Claude chains; `test-suite-registration.js`
  passes (699 assertions, 58 registered).

## What's pinned and why it's meaning-level
- **(a) first sync copies**: dest project folder entirely absent; after a real finalize, the
  worktree's mission-list.md is byte-identical to the main copy (read via the envelope's own
  `dest` field — a `--keep-worktree` run archives under the resolved main-checkout authority, not
  necessarily the worktree path, so guessing the location would silently test the wrong tree).
- **(b) identical repeat is a safe no-op**: byte-identical src/dest, finalize succeeds, record
  unchanged.
- **(c) staler source refused fail-closed, BOTH sides byte-unchanged afterward**: the real
  regression case, over the REAL archived bundle-1053 table (3 of 7 done rows missing from the
  stale source). Asserts `result:'refuse'`, `reason:'finalize_mirror_refused'`,
  `inner_reason:'mirror_sync_failed'`, AND — the actual regression this part closes — that the
  MAIN-side copy is untouched too, proving the retired worktree-wins auto-repair does not fire.
  Also covers the REVERSE direction (a source that only adds content is refused too — a deliberate
  trade the trace names: no containment check exists, so ANY divergence, including a legitimate
  one-sided advance, now surfaces to the orchestrator instead of being silently allowed).
- **(d) count-proxy trap end-to-end**: line-form fixture, 2/2 done counts equal but the completed
  missions differ — a real CLI run still refuses, proving the retired count-based false-safe cannot
  slip through the real transaction, not just the unit function.
- **(e) refusal names both paths + diff**: asserted inline in (c) — `detail` contains both absolute
  mission-list.md paths and diff-shaped content (`dest (worktree copy)`/`src (main copy)` markers).
- **(f) every forge port**: leg (c) repeated identically across canonical/codex/gitlab/gitea, reached
  the way `test-forge-finalize-findings.js` reaches them (real claim.js binary per edition, its own
  schema module for the code-tree hash).
- **(g) `finalize --check` predicts read-only**: same divergent fixture, `--check` reports
  `checks.mirror:'sync_failed'` and `reasons` includes `mirror_sync_failed`, asserts BOTH files are
  byte-unchanged after `--check` runs, then runs the real finalize on the SAME untouched fixture and
  confirms it reaches the identical refusal — proving the prediction and the real path agree.

## RED proof
```
git worktree add /private/tmp/claude-501/kw-1054-p2-baseline 662bcd33
# copied scripts/test-ledger-compare.js, scripts/test-issue-1054-ledger-guard.js, and
# scripts/fixtures/issue-1054/ into that worktree
node scripts/test-ledger-compare.js         # exit 1
node scripts/test-issue-1054-ledger-guard.js # exit 1
```
Baseline: `662bcd339c6efef5f0e29dbe13f33189a27f2848`.

**test-ledger-compare.js** — hard stop on the first assertion (this file's own `assert` throws,
matching the pre-existing style):
```
Error: FAIL: (a) dest absent (null) is a legitimate first sync; got
{"safe":true,"reason":"ok","sourceComplete":2,"destComplete":0}
```
(the retired count-based `reason:'ok'` where the new contract demands `reason:'first_sync'`).

**test-issue-1054-ledger-guard.js** — reaches leg 2c and throws (the old auto-repair/count-based
mirror behavior does not produce the file layout the new contract assumes):
```
Error: ENOENT: no such file or directory, open
'.../kw1054lg-canonical-FOJkxI.kw/issue-99g3/kaola-workflow/issue-99g3/mission-list.md'
    at stalerSourceRefusedNoMutation (scripts/test-issue-1054-ledger-guard.js:234:26)
```
Temp worktree removed with `git worktree remove --force` after capture.

## Part 2 status: DONE.

# RECONCILIATION — scripts/test-claim-hardening.js T2a (post-acceptance, both parts already accepted)

The implementer's landing left one internal inconsistency: T2a (issue-816b fixture) still pinned
the RETIRED behavior — "`--check` classifies a staler-but-writable main as `sync_required`", "the
transaction repairs worktree→main and proceeds", "receipt records `synced_from_worktree`",
"surviving record keeps the worktree's 3 done items" (implying main's 1-done record was
overwritten), "main-only artifact survives the repair". Rewrote T2a ONLY (T2b, T2c, and everything
else in the file untouched — confirmed by diff: no `T2b`/`T2c` lines touched) to the new contract:
same 3-done-worktree-vs-1-done-main fixture, same main-only `finalization-summary.md` artifact, but
now asserts **preservation by refusal** instead of repair:
- `--check` classifies `sync_failed` (not the retired `sync_required`), `ok:false`,
  `reasons` includes `mirror_sync_failed`, both records byte-unchanged (unchanged assertion).
- The real transaction refuses (`result` implied by non-zero exit, `reason:'finalize_mirror_refused'`,
  `inner_reason:'mirror_sync_failed'`), `detail` names BOTH absolute mission-list.md paths and
  carries a diff-shaped summary.
- Both the worktree record (3 done) AND the main record (1 done) are byte-identical to what was
  planted — the retired worktree-wins repair does not fire and does not overwrite main.
- The main-only Finalization artifact is untouched.
- Nothing is archived.

No production files or `package.json` touched (git status confirms only test files + the
implementer's own pre-existing production diffs). `node scripts/test-claim-hardening.js` now passes
**838 assertions, 0 failures** (was 6 failures / 827 passed before this rewrite).

**Assertion delta for T2a**: old block had 9 assertions (repair-shaped); new block has 15
assertions (2 unchanged verbatim: the `--check` byte-unchanged check, and — reworded but same
predicate — the countDone-3 worktree check; 13 new/changed: `ok:false`, `sync_failed` classification,
`reasons` array check, refusal `reason`/`inner_reason`, two path-naming checks, one diff-shape
check, main-record-preserved check, artifact-untouched check, archive-nothing check). Net +6
assertions in the file overall (833 attempted -> 838 passing, since the old run stopped counting at
its 6th failure rather than continuing).

STOPPING HERE per instruction — no further expansion; run paused for joint design review.

## Not pinned / left to reviewer attention
- Did not test the `MAX_DIFF_LINES` truncation boundary (60 lines) — real behavior, but not named
  in the brief's outcome list; flagging as untested rather than silently assuming it.
- Did not attempt a genuinely-unwritable-tree fixture (permission-denied mirror write) — out of
  this part's stated scope (content/direction/authority, not I/O-failure handling, which existing
  T9-class tests in test-finalize-door.js already cover for the general mirror-write-failure shape).
- Did not run `npm test`, `:claude:full`, or the walkthrough.
