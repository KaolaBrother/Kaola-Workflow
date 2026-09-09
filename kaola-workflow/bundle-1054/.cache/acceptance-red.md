# Acceptance evidence — issue #1054 (mission list dual-carrier read)

## Test paths
- `scripts/test-issue-1054-mission-list-carriers.js` (new suite, 7 groups; 46 assertions total when
  the probed functions exist — verified 46/46 passing against this worktree's current WIP
  implementation as a sanity check; groups short-circuit on a missing export at baseline, so the
  RED run below reports 16 failed / 7 passed of the smaller assertion set baseline can reach)
- `scripts/fixtures/issue-1054/bundle-1053-mission-list.md` — byte-for-byte copy of the real
  `kaola-workflow/archive/bundle-1053/mission-list.md` (`cmp` verified identical at authoring time;
  7 `| done |` rows).
- `package.json` — registered `test-issue-1054-mission-list-carriers.js` in both
  `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full` (right after the #1053 suite,
  before `test-zcode-install-trust.js`). `node scripts/test-suite-registration.js` passes (688
  assertions) with the new suite counted in the 57 registered.

## Public path used
`probeMissionListCoherence(authorityDir)` and `persistMissionListToSummary` live in
`scripts/kaola-workflow-claim.js` and its three hand-ported copies
(`plugins/kaola-workflow/…`, `plugins/kaola-workflow-gitlab/…`, `plugins/kaola-workflow-gitea/…`).
At the assigned baseline (`662bcd33`) neither is exported. **By the time I wrote this suite, a
concurrent implementer had already exported `probeMissionListCoherence` from all four claim.js
copies** (visible in this worktree's working tree, uncommitted) — I used that export directly
(`require(file).probeMissionListCoherence`), calling it exactly as the finalize transaction does:
a real temp directory holding a real `mission-list.md`, no mock of the reader. This matches the
brief's "minimal exported helper the implementer may add" option. `countComplete` /
`compareLedgers` in `kaola-workflow-ledger-compare.js` (canonical + 3 copies) were already exported
since #399, so those are called directly with no dependency on the concurrent work.

I derived every expected value independently from ADR 0017 / the issue body / standard GFM table
cell-splitting semantics (escaped `\|`, pipe-inside-backtick code spans, header case-
insensitivity) **before** reading the implementer's row-splitting code, then confirmed the derived
oracle against their current WIP as a sanity check (46/46 assertions pass there) — not the other
way around.

## What each group pins and why it's meaning-level
- **A** — the exact measured regression: the real archived bundle-1053 table (byte-copied fixture)
  must read `items: 7`, `outcome_while_not_done: []`. This is the literal case #1054 reports.
- **B** — line-form semantics must not move: last `status:` line wins, tested in BOTH directions
  (corrected to `done` — not flagged; corrected away from `done` to `in-flight` — flagged). B2 is
  the direction that actually falsifies a first-status-wins implementation.
- **C** — table-form basics: header row and `|---|` separator row are never items; H1 goal line and
  prose paragraphs (including ones quoting `status: done` / `result: PASS` as commentary) are
  ignored; an empty result cell on a non-done row is NOT flagged; a non-empty one IS, by exact line
  number.
- **D** — real cell-boundary cases drawn from this repo's own records: an escaped-pipe cell
  (mirrors `templates/routing/next.skeleton.md:112`, the ADR 0017 field table's own `status` cell:
  `` `todo` \| `in-flight` \| `done` ``), a pipe inside backticks quoting the separator syntax
  itself, colon-bearing prose inside a cell, a result cell quoting another row's `status: done` as
  prose (classification must come from the status COLUMN, never a text scan), whitespace-padded
  cells, and a differently-cased/spaced header (`| Item | Status | Dispatched | Result |`) — each
  case is falsifiable: a naive delimiter-only splitter misaligns columns and either mis-flags or
  under-flags the row.
- **E** — `countComplete`/`compareLedgers` over table-form text: counts the 7 done rows of the real
  fixture; UNSAFE when a less-complete table would overwrite a more-complete one (equivalent to the
  documented `destComplete > sourceComplete` contract — see note below); SAFE on an idempotent
  same-table re-run; and two mixed-carrier cases (line-form source vs table-form dest) showing the
  guard compares counts, not carriers.
- **F** — cross-tree parity: same fixture through all 4 claim.js ports and all 4 ledger-compare
  copies, asserting identical readings; a port that doesn't export the function is reported by name
  and excluded from parity rather than silently skipped.
- **N** — negative pins: a garbled/malformed table never throws (always yields a count); no new CLI
  flag naming carrier/format/table on `kaola-workflow-ledger-compare.js`'s usage text; `adaptive-schema.js`
  still declares one `MISSION_LIST_FILE = 'mission-list.md'` constant (no new field/schema).

**One deliberate correction to the brief's E wording**: the brief said
"`compareLedgers(source=7-row table, dest=table with 3 done rows)` is UNSAFE." Under
`compareLedgers`'s actual documented contract (`destComplete > sourceComplete` ⇒ unsafe — the dest,
about to be overwritten, would lose work), a 7-done SOURCE over a 3-done DEST is the normal
safe direction (source is more complete). I pinned the semantically correct assignment instead —
UNSAFE with a 3-done SOURCE and the real 7-done bundle-1053 table as DEST, SAFE with the 7-done
table compared to itself — so the oracle encodes the guard's real regression-prevention property
rather than a self-contradictory literal reading.

## RED proof
```
git -C /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow worktree add \
  /private/tmp/claude-501/kw-1054-baseline 662bcd33
# copied scripts/test-issue-1054-mission-list-carriers.js and
# scripts/fixtures/issue-1054/bundle-1053-mission-list.md into that worktree
cd /private/tmp/claude-501/kw-1054-baseline
git log -1 --format='%H'   # 662bcd339c6efef5f0e29dbe13f33189a27f2848
node scripts/test-issue-1054-mission-list-carriers.js
```
Baseline: `662bcd339c6efef5f0e29dbe13f33189a27f2848`.

Result: **16 failures / 7 passed, exit 1.**

Failure signature (representative):
```
FAIL: A: scripts/kaola-workflow-claim.js exports `probeMissionListCoherence` for direct unit
coverage of the dual-carrier read; does not export `probeMissionListCoherence` (found: undefined)
FAIL: E1: countComplete must count the 7 `| done |` rows of the real archived bundle-1053 table;
got 0
FAIL: F4: canonical (scripts/kaola-workflow-ledger-compare.js) must count 7 done rows for the
bundle-1053 table, matching every other copy; got 0
test-issue-1054-mission-list-carriers.js FAILED (16 failures, 7 passed)
```
Full output logged at
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/9c76cf4c-865e-479e-8386-fa1b8a580d28/scratchpad/red-1054.log`
(that scratchpad path is session-local and will not survive after this session; the excerpt above
is the durable record). Temp worktree removed with `git worktree remove --force
/private/tmp/claude-501/kw-1054-baseline` after capture.

Groups A–D and N red for the same reason (missing export on the canonical port, which is the first
one every group probes) — this correctly demonstrates the export/behavior gap without needing 4x
redundant baseline runs; group E reds independently (ledger-compare's `countComplete` at baseline
really does return 0 for every table-form fixture, proving the counting gap on its own, with no
dependency on the claim.js export).

## Not covered / left to reviewer attention
- I did NOT run `npm test`, `:claude:full`, or the walkthrough (per instructions).
- I did not verify the table-form field-order convention (`item | status | dispatched | result`)
  against every one of the 76 archived mission lists — only against the ADR 0017 field table, the
  Next-route skeleton, and the one byte-copied real fixture (bundle-1053). If a future archive uses
  a different column order this suite would not catch it.
- Group D's "backtick pipe span" and "escaped pipe" fixtures are realistic reconstructions (the
  escaped-pipe pattern is a verbatim quote of `templates/routing/next.skeleton.md:112`; the
  backtick-pipe case is constructed from the brief's description, since I could not find a literal
  archived instance of `` `|---|` `` inside a table cell in this repo's history).
- I did not touch `scripts/kaola-workflow-claim.js`, `scripts/kaola-workflow-ledger-compare.js`, or
  any of their plugin copies — those are already modified in this worktree by a concurrent
  implementer; I only read them to confirm export shape and never altered production code.
