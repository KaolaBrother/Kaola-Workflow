# #1054 mission 6 — acceptance RED evidence (finalize stops parsing records)

Baseline: `6ae5374b` (frozen candidate). RED captured in an isolated worktree
(`git worktree add /private/tmp/claude-501/kw-1054-red3 6ae5374b`), copying the test files below
in, running each with the baseline production tree untouched, then `git worktree remove --force`.
The shared bundle-1054 worktree has concurrent production edits in flight from other agents during
this session (claim.js, gap-sweep.js, closure-audit.js, finalize.skeleton.md, slots.js and the
behavior-contracts.json role redesign) — the frozen-baseline worktree is what makes this evidence
trustworthy independent of that traffic.

## New suite

`scripts/test-issue-1054-finalize-record-simplification.js` — 142 assertions total.

RED on 6ae5374b: exit 1, **45 passed, 97 failed**.

Groups (each ties to a numbered audit item from the issue's "已核实的消费者与迁移落点"):
- **A** (items 1, 2, 4 — gap-sweep/run-gaps no longer gate finalize). Static: `ARCHIVE_CACHE_SIDECAR_MD`
  must not list `run-gaps-manual.md`, across the 4 claim trees (canonical/codex/gitlab/gitea).
  Structural: the backlog-delta tokens (`follow_ups_filed`, `computeBacklogDelta`, camelCase
  variants) must be entirely absent from each of the 4 claim trees. A kept `gap-sweep.js` must not
  reference `run-gaps-manual.md`, across its 4 trees. One behavioral leg drives the real scanner
  over a `.cache/` carrying a manual-seed file and asserts no `manual:` class is emitted.
  Example failure: `A1: codex: ARCHIVE_CACHE_SIDECAR_MD must not list run-gaps-manual.md any
  more ... got ["final-validation.md","run-gaps-manual.md","selection-evidence.md","doc-docking.md","doc-updater.md"]`.
- **B** (item 3 — backlog-delta statistic retired). Behavioral: a real `finalize` CLI transaction,
  four legs over the same claimed set (canonical bullets / free prose / markdown table / no summary
  at all). Pins that the archived `## Closure` block carries none of `follow_ups_filed` /
  `follow_up_numbers` / `net_backlog_delta`, and that the canonical-bullets and free-prose/table legs
  produce byte-identical closure blocks (module `archived_at`) despite differing filing counts.
  Example failure: canonical-bullets closure carried `"follow_ups_filed":"2","net_backlog_delta":"+1"`
  while free-prose carried `"follow_ups_filed":"0","net_backlog_delta":"-1"` — proving the retired
  mechanism really was format-dependent, which is exactly what B asserts must stop.
- **C** (item 5 — one docking file). Static: `ARCHIVE_CACHE_SIDECAR_MD` must not list
  `doc-updater.md` and must still list `doc-docking.md`, across the 4 trees. Behavioral: an archive
  citing only `.cache/doc-docking.md` reports zero missing citations from `archiveCitedMissing`
  (this leg already passes at baseline — a non-regression control, not a RED-bearing assertion; see
  "What is not RED" below).
- **D** (items 6, 7, 8 + Mission List landing). All 6 registered finalize surfaces
  (github/gitlab/gitea × command/skill), rendered in memory from the one skeleton via
  `generate-routing-surfaces.js`'s exported `renderSkeleton`. Negative: no `gap-sweep` / `Run gaps`
  / `run-gaps-manual.md` / `run-gaps.json` token; no "body length" instruction; no "mission list's
  result line" framing; the sentence naming where "the finalize transaction's own findings land"
  must not include `## Mission List`. Positive (concept, paraphrase-tolerant sentence-window
  detector, same technique as `test-issue-1053-next-task-quality.js`): the measured/hypothesis
  distinction, the duplicate-search-probe instruction, and the confirm-issue-exists-with-non-empty-
  body instruction must all still be present. All three positive detectors passed against the
  CURRENT (unmodified) skeleton at baseline, which is evidence they are not vacuously true.

Registered on both `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full` in
`package.json`; `node scripts/test-suite-registration.js` accepts the new file (the one remaining
registration failure it reports, a dangling reference to
`scripts/test-issue-1054-role-redesign.js`, belongs to a different concurrently-worked mission in
this same bundle, not to this suite).

## Existing suites rewritten (meaning I own, per team-lead authorization)

1. **`scripts/validate-workflow-contracts.js`** — `assertIncludes('commands/kaola-workflow-finalize.md',
   'run-gaps-manual.md')` pinned the OPPOSITE of #1054 item 1/4 (that the manual-seed sidecar reach
   the generated surface). Replaced with a new `assertExcludes` helper and two negative assertions
   (`run-gaps-manual.md`, `gap-sweep`).
   RED on 6ae5374b: exit 1 — `Error: commands/kaola-workflow-finalize.md must not include (retired
   #1054): run-gaps-manual.md`. (The full validator throws on first failure; an unrelated
   pre-existing assertion earlier in the file — `agents/implementer.md` smoke-integration — is
   concurrent-edit noise in the LIVE shared worktree only; confirmed absent at the frozen baseline,
   where the validator reaches my assertion and throws on it directly, as shown above.)

2. **`scripts/test-finalize-door.js` T6g** — `EXPECTED_SIDECARS_901` hardcoded the 5-name sidecar set
   including `run-gaps-manual.md` and `doc-updater.md`. Narrowed to the 3 surviving names
   (`final-validation.md`, `selection-evidence.md`, `doc-docking.md`); the rest of T6g is
   self-driving off the live `ARCHIVE_CACHE_SIDECAR_MD` read from claim.js source, so it needed no
   further change.
   RED on 6ae5374b: `FAIL: T6g: the exempt-sidecar set is exactly the five names the arms below
   drive ... got ["final-validation.md","run-gaps-manual.md","selection-evidence.md","doc-docking.md","doc-updater.md"]`.

3. **`scripts/test-finalize-door.js` T14** (renamed `T14_backlogDeltaStatisticRetiredAcrossEveryRunGapsShape`)
   — fully rewritten. The retired test pinned a DEGRADATION PAIR (`unknown` vs a measured `0`)
   across seven verbatim archived `## Run gaps` shapes (absent/empty/freetext/no-sample/wrapped/
   table/prose), each producing a DIFFERENT statistic from the retired mechanism. All seven fixture
   bodies are kept unchanged (they are this repo's own archival evidence, cited by issue/archive
   name in the original comments); every assertion is replaced with: no statistic key survives on
   any shape, `issues_closed` is untouched, and — the sharpest form of "no differing statistic
   anywhere" — all seven legs' `## Closure` blocks (minus `archived_at`) must be byte-identical to
   the `absent` leg's, across all 4 claim editions (`CLAIM_EDITIONS`).
   RED on 6ae5374b: exit 1, **97 failures / 778 passed** in the whole file (T14 plus the T6g pin
   above; T1–T13, T15–T17 all still pass unmodified). Representative failure:
   `T14(gitea) empty vs absent: identical ## Closure blocks are required once the backlog-delta
   statistic is gone ... absent={...,"follow_ups_filed":"unknown",...} empty={...,"follow_ups_filed":"0",...}`.

4. **`scripts/test-bundle-finalize.js` `testClosureBlockRecordsBacklogDelta`** (renamed
   `testClosureBlockNoLongerRecordsBacklogDelta`) — same pattern as (3) on the bundle (4-member,
   merge-lane) path: the three legs (4 filed with one `noise:` row / 14 filed / 0 filed) are kept
   verbatim; assertions rewritten to "no statistic key" plus "identical closure blocks across all
   three legs" (module `archived_at`); the `issues_closed`/`issue_disposition` coverage and the
   zero-new-forge-calls controls are untouched (still valid, and the file-level comment explains
   they are now trivially rather than merely true).
   RED on 6ae5374b: exit 1, **11 failures / 183 passed**. Representative: `#1054 A (4 filed) vs C (0
   filed): identical ## Closure blocks are required ... C={...,"follow_ups_filed":"0",...} A (4
   filed)={...,"follow_ups_filed":"4",...}`.

5. **`scripts/test-generate-routing-surfaces.js`** — the `finalize` topic's `requiredByTopic` token
   list required the literal string `'doc-updater'` to propagate to every render. Replaced with
   `'doc-docking'` (already present in the current skeleton, so this edit is mechanical/non-RED by
   itself — the retirement of `doc-updater.md` as a *requirement* is pinned by Groups C1/D1 in the
   new suite instead). Verified this edit does not destabilize the file: `all 480 assertions
   passed` at baseline, unchanged from before the edit.

## What is not RED (documented, not hidden)

- **C2** (`closureAuditAcceptsDocDockingAlone`, in the new suite) is a non-regression control: it
  passes at baseline too, since `archiveCitedMissing` is citation-driven and was never keyed to
  `doc-updater.md` specifically. It stays in the suite because it is real coverage for "keep
  whatever the transaction genuinely needs" (item 5's second half), just not a RED-bearing
  assertion on its own; C1 (the `ARCHIVE_CACHE_SIDECAR_MD` symbol pin) carries item 5's RED weight.
- **`test-generate-routing-surfaces.js`**'s edit (item 5) — see (5) above.

## Scope note: what I did not touch

`scripts/test-gap-sweep.js` (~40 assertions pinning `gap-sweep.js --check`'s own refusal semantics
— `gaps_unswept` / `observed_gap_unseeded`) was surveyed but not rewritten. The acceptance text
frames item 1 as "if gap-sweep --project is kept as an optional diagnostic" — conditional on a
production decision (delete the script outright vs. keep it read-only as a diagnostic with its
refusal semantics removed vs. keep the refusal semantics for some other, non-finalize caller) that
is not settled by the issue text or ADR 0017 alone. My new suite's Group A pins the CONSUMER-SIDE
outcome that does not depend on that decision (finalize never requires the sweep; a kept scanner
must not read the manual-seed file). Rewriting test-gap-sweep.js's ~40 internal gate-semantic
assertions would mean freezing an interpretation of a still-open implementation choice into the
suite, which risks exactly the "confidently wrong oracle" this custody role is meant to avoid.
Flagging this for the implementer/team-lead to resolve explicitly rather than deciding it here.

`docs/api.md`, `docs/workflow-state-contract.md`, `README.md` prose describing `run-gaps-manual.md`
/ `doc-updater.md` / backlog-delta fields is production documentation, owned by the doc-updater
role, not test-owned; left untouched.

## Update: scripts/test-gap-sweep.js rewritten (gap-sweep settled as optional non-gating scanner)

Production decision (team lead, confirmed against the live rewritten
`scripts/kaola-workflow-gap-sweep.js`, 4-tree byte-identical/rename-normalised): the script
survives only as an optional diagnostic — `--project`, `--json`, `--output`, `-h`/`--help`; one
reason class (`deferred_red_chain`); the `project_archived`/`foreign_run_gaps_output` write-safety
refusals. `--check`, `## Run gaps` reconciliation, `--summary`, `--offline`, and the
`run-gaps-manual.md` seed grammar are gone from the script entirely (confirmed by reading the live
419-line-diff header and full body before editing).

**Fully rewrote `scripts/test-gap-sweep.js`** (26 tests -> 12 groups, 75 assertions).

Deleted outright (one-line reason each, no observable replacement exists for a refusal path the
script no longer has):
- T2, T3, T4, T5 — `--check` gate refuse/pass/noise/vacuous-pass semantics (the gate is gone).
- T8, T9, T10, T11 — `run-gaps-manual.md` seeding and #653 reverse-containment (`observed_gap_unseeded`)
  semantics (both the seed grammar and the gate are gone).
- T17, T18, T19, T20 — #726 sample-containment/lazy-vs-greedy grammar fixes inside the retired
  `parseGapSection`/gate (the parser and the section it parsed are gone).
- T21, T22, T23, T23b, T24 — #836 containment fail-closed legs, same reason.

Kept unchanged in substance (pure scanner-side; never touched `--check` or the seed grammar): T1
(dedup — manual-seed half dropped, chain-receipt half unchanged), T6 (missing `--project`), T7
(unknown argument), T12–T16 (#675/#679/#681 write-safety refusals).

Rewritten (dropped `--check` calls; substituted `chain-receipt.json` seeds — reason class
`deferred_red_chain`, sample `seed:<tag>` — for the retired `run-gaps-manual.md` grammar; kept the
verbatim root-resolution/leftover-artifact claims each fixture proved):
- T25(a,c,d,e,f) -> the resolve-against-SCAN legs (T25b dropped as redundant: it and T25c drove the
  identical "worktree reads main" claim, one through `--check` and one through a scan, and only the
  scan form survives).
- T26(baseline,a,b,c,d,e) -> consolidated to 4 legs. The retired file's differential lived in
  `--check`'s vacuous-pass envelope (`{"result":"pass","mapped":0,...}`); since that's gone, the
  claim is pinned on the SCAN's own observable instead (an empty `sweptClasses` from a leftover
  tree must differ from the legitimate-empty-run baseline, or name the other tree). The
  pre-#971-leftover and bare-empty-directory populations (retired T26a/T26b/T26c) collapsed into
  one representative leg (new T26a) since both reached the identical scan-observable state; the
  two controls (post-mirror T26d, `KAOLA_GAP_ROOT` precedence T26e) survive unchanged in substance.

**Added** T7b: each of the three retired flags (`--check`, `--summary`, `--offline`) must now fall
through to the generic "unknown argument" path (exit 1, stderr contains "unknown"), not be silently
accepted or ignored — the consumer-visible proof the gate is gone, not merely unwired.

RED on 6ae5374b (isolated worktree, same protocol as above): exit 1, **5 failures / 70 passed**.
All 5 failures are T7b, exactly as expected — at baseline `--check` still runs the (now-retired)
gate machinery (`artifact_missing` refusal, not "unknown argument") and `--summary`/`--offline`
are still silently accepted, exit 0. T1/T6/T7/T12-T16/T25/T26 all pass at baseline too, which is
correct: they exercise only the scanner mechanism, which is unchanged between baseline and the live
rewrite.

Live tree (already rewritten by impl-1054-finalize): **75/75 assertions pass**, confirming the
rewritten suite is not vacuous and matches the shipped behavior.

`node scripts/test-suite-registration.js`: **721 assertions, 0 failures** (the dangling
`test-issue-1054-role-redesign.js` reference noted in the prior update has since been resolved by
its author).

### Other hits for the retired flags/`run-gaps-manual.md` (reported, not edited, per instruction)

Grepped `scripts/`, `plugins/*/scripts/`, `docs/`, `templates/` for `run-gaps-manual.md`,
`gaps_unswept`, `observed_gap_unseeded`:

- **Production, not test-owned — flagging for the implementer:**
  - `templates/routing/required-blocks.js:482` — a `content_tokens` entry still REQUIRES the retired
    sentence `"append the matching gap: <class> — <text> line to .cache/run-gaps-manual.md and
    re-run the scanner..."` in the rendered finalize surface (audit item 28's `REQUIRED_COVERAGE`
    seven-key source metadata). Will fail `generate-routing-surfaces.js --check`/block validation
    once the skeleton text is removed, unless updated in step.
  - `scripts/kaola-workflow-adaptive-schema.js:1074` (byte-identical cross-edition anchor;
    mirrored in `plugins/kaola-workflow-gitea/`, `plugins/kaola-workflow-gitlab/` copies) — still
    lists `.cache/run-gaps-manual.md` as a `record/evidence/agent` entry.
  - `scripts/prose-census-baseline.json:380,396` — baseline snapshot still carries `gaps_unswept`/
    `observed_gap_unseeded` as recorded prose tokens; likely needs regeneration once the skeleton
    changes (whatever script owns that baseline).
  - `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
    — already reported in the first evidence update above (assertIncludes rewritten in canonical;
    the plugin/forge copies are the validator pass's territory per this instruction).
- **Test files, incidental (filename used only as an arbitrary marker/example, not asserting
  gap-sweep's own grammar — left unedited as out of finalize-assertion scope, reported for
  awareness):**
  - `scripts/test-validation-runner.js:585` — uses `run-gaps-manual.md` purely as example CONTENT
    written into a `.cache/` dir to give `resolveRecordFolder`'s #974 leftover-topology test
    something to distinguish "leftover" from "real" folder; any filename would serve.
  - `scripts/test-sink-merge.js:1842`, `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js:1757`,
    `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:1808` — `CACHE_EVIDENCE_901` fixture
    maps (also list `doc-updater.md`) used to prove the sink/archive path preserves EVERY
    `.cache/*.md` file as a git blob; the filenames are stand-ins for "some evidence file", not a
    claim about which files finalize actually produces today.
- **Docs (doc-updater's remit, not touched):** `docs/api.md:1606`, `docs/conventions.md:532-569`,
  `docs/workflow-state-contract.md:51,179`, `docs/decisions/D-653-01.md`, `D-435-01.md`,
  `D-676-01.md` (historical decision records — appropriately describe what was retired and why).

## Update: required-blocks.js couplings fixed (mission 7 handoff) + walkthrough fixture mechanical update

Two couplings from impl-1054-finalize's mission 7 (acceptance 142/0), both in this custody:

**1. `templates/routing/required-blocks.js` — two blocks fixed, one deleted.**

- `fn-forge-is-the-backlog` (finalize topic): dropped the retired token requiring
  `"append the matching gap: <class> — <text> line to .cache/run-gaps-manual.md and re-run the
  scanner..."`; replaced the retired body-length/Mission-List-result-line pair
  (`"record the issue number and the body length you saw..."` /
  `"That record is the mission list's result line..."`) with the two tokens the live surface
  actually carries: `"confirm the issue exists and its body is non-empty, and record that in this
  run's own finalize-transaction record"` and `"never in a completed Mission's result, which stays
  immutable"`. Verified byte-for-byte against `commands/kaola-workflow-finalize.md` and all 5 other
  live renders (identical text on every one) with whitespace-normalized matching (the same `norm()`
  the validator uses).
- `fn-mission-list-report` (finalize topic): the retired sentence `"## Validation, ## Changed Paths
  and ## Mission List are where the finalize transaction's own findings land"` replaced with the
  live surface's actual two-destination sentence (`## Mission List` dropped, `and` instead of a
  three-item list).
- `fn-run-gaps-grammar` (finalize topic): DELETED outright — the whole `## Run gaps` bullet grammar
  it required (`filed:`/`noise:` row forms, heading-qualifier rule) no longer exists on any
  rendered surface; no successor grammar to require. Confirmed no other file references this
  `block_id` before deleting.

**2. `scripts/test-route-reachability.js` T6c — rewritten, not deleted.** The retired version
required BOTH gap-sweep invocations (writing scan + `--check` gate, in order) plus the strict
`## Run gaps` row grammar, using a per-forge-correct basename derivation
(`GENERATED_SURFACES` + `edition-sync.forgeRel`). That derivation is real, non-redundant coverage
(the finalize-suite's own Group D1 pin only checks the literal string `"gap-sweep"`, not each
forge's renamed script basename), so I kept the mechanism and flipped the assertions: no finalize
surface may invoke the forge-correct gap-sweep basename with the retired `--check` flag, and none
may still state the retired row grammar sentence.

`node scripts/test-route-reachability.js`: **148 assertions, 0 failures** (live tree).

RED on 6ae5374b (isolated worktree `/private/tmp/claude-501/kw-1054-red-route`, copying in the
rewritten `required-blocks.js` + `test-route-reachability.js` only, removed after capture): exit 1,
**76 failures / 135 passed** — every failure a `missing-token` for the two `fn-forge-is-the-backlog`
tokens (`confirm the issue exists...`/`never in a completed Mission's result...`) against every one
of the 18 routing surfaces plus the additive-runtime plugin/skill copies the manifest still tracks
at that commit, confirming the rewritten blocks correctly reject the baseline's still-retired
surface text and only accept the live rendered one.

**3. `scripts/simulate-workflow-walkthrough.js` — mechanical fixture update, 4 sites.** `doc-docking.md`
is now the one surviving docking-evidence filename (`doc-updater.md` dropped from
`ARCHIVE_CACHE_SIDECAR_MD` per the earlier finalize-suite update): a live `.cache/doc-updater.md`
sidecar is no longer exempt from the archive-completeness gate, so the `#676` sidecar-denylist
fixture (lines ~13014-13020, `testArchiveIntegrity...`-family) would now false-refuse if left
unchanged — swapped to `doc-docking.md`, which IS still in the exempt set, preserving the same
"dropping a fixed-name machinery sidecar must NOT refuse" claim over a filename that actually is
one. Lines ~9779/9800 (`testClosureAuditCitationMissingReportsAndExcludesJsonl903`) are independent
of that set — `archiveCitedMissing` is generic-citation-driven — but were swapped too for
consistency, per instruction. `node --check scripts/simulate-workflow-walkthrough.js`: syntax OK.
**Full walkthrough not run standalone**: the script has no named-test/function-scoped selection
(only `--shard i/N`, an ordinal stride over the whole registry), and a full run is the
multi-thousand-assertion, multi-chain mission-13-scale operation this task's fallback anticipates;
correctness was instead verified by reasoning against the live `ARCHIVE_CACHE_SIDECAR_MD` set
(confirmed above) and the generic, set-independent nature of the citation-missing detector — both
mechanically low-risk, literal-string fixture swaps.

## Ruling: scripts/test-kernel-conformance.js part F — ledger-compare.js's two scratch writes

Team-lead-flagged finding: part F's static write-surface ratchet reported
`unledgered: ['kaola-workflow-ledger-compare.js writeFileSync']`. Measured (team lead): introduced
by this branch's own `6ae5374b` (`662bcd33` has 0 `writeFileSync` in that file) — a regression on
this branch, not pre-existing debt.

**Read the site** (`scripts/kaola-workflow-ledger-compare.js:48-80`, `diffSummary`): both calls
(lines ~54-55) write `destText`/`srcText` into `dest-mission-list.md`/`src-mission-list.md` inside a
directory from `fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ledger-diff-'))`, created fresh per call,
so that `diff -u` (falling back to `git diff --no-index`) can render a bounded unified-diff summary
for the operator. The directory is removed unconditionally in a `finally` block. Neither file is
ever read back for a correctness/durability decision — both are pure input to a diff CLI call whose
stdout is the only thing that survives the function.

**Ruling: legitimate exemption, class `outside-project-space`.** Part F's own stated scope is
records under `kaola-workflow/<project>/` reached by a non-atomic write route; its four existing
`outside-project-space` entries already cover targets provably outside that space by the same kind
of reasoning (a CWD debug probe, salvage patches under `archive/exports/`, repo-root release files).
A private, single-use OS-tmpdir scratch directory that is deleted before the function returns is the
same class of non-risk: nothing durable is written, no `kaola-workflow/` path is touched, and a torn
or lost write here has no observable consequence — the diff simply comes back empty or wrong for one
invocation, never a corrupted or discarded record. I did not judge a production change (a pure
in-process line diff) necessary: that would be a style/dependency-reduction improvement, not a fix
for a durability risk part F actually protects against, and rewriting a working, already-tested diff
path for that reason alone is more churn than the finding calls for.

**Added** one `NON_ATOMIC_EXEMPT` entry (`scripts/test-kernel-conformance.js`, `kaola-workflow-
ledger-compare.js` / `writeFileSync` / `outside-project-space`), stating this reasoning.

RED on 6ae5374b (isolated worktree, removed after; ran part F's own scan+ledger-diff logic directly
rather than the whole `main()`, since baseline's `test-kernel-conformance.js` module executes
`main()` only under `require.main === module` and I only needed `NON_ATOMIC_EXEMPT` +
`collectWriteSurface`'s logic): `unledgered: ["kaola-workflow-ledger-compare.js writeFileSync"]` —
reproducing exactly the reported finding. With my entry added, the same logic against the live tree
returns `unledgered: []` and `stale ledger entries: []`.

`node scripts/test-kernel-conformance.js` on the live tree: **throws in `partB`** (doc-ruling-table
row count 22 vs 21, `docs/workflow-state-contract.md` vs the `REGISTRY` array) — unrelated,
pre-existing, and not caused by this change: my diff to `test-kernel-conformance.js` is exactly the
4-line ledger entry (`git diff --stat`), I did not touch `REGISTRY`, and
`docs/workflow-state-contract.md` shows no local modification, so another agent's concurrent edit
to whatever defines `REGISTRY` is the live cause. `partB` runs before `partF` in `main()`'s
sequence, so the whole-file run cannot currently reach `partF` to demonstrate it green end-to-end;
the standalone logic reproduction above is offered as the substitute evidence, and I recommend a
rerun of the full suite once whichever agent owns `REGISTRY`/the state-contract table settles that
count.

**Update**: reran `test-kernel-conformance.js` end-to-end once `partB` cleared on its own (another
agent's concurrent fix landed) — it progressed past `partA`/`partAWitnessCoverage`/`partB`/`partC`/
`partF` (my ledger entry holds under the real run, not just the standalone reproduction) and into
`runVehicles()`, where it drives `simulate-workflow-walkthrough.js` as a write-observed vehicle and
threw on `testFinalizeReportsMissionListOutcomeWithoutDone` (#970) — a THIRD, separate finalize-
acceptance coupling, handled in the next section.

## Deletion: scripts/simulate-workflow-walkthrough.js — testFinalizeReportsMissionListOutcomeWithoutDone (#970)

Surfaced by the `test-kernel-conformance.js` vehicle run above:
`Error: #970 [issue-9700]: nothing on the finalize envelope reports that this run record contradicts
itself. 2 of its 6 items carry an outcome while their status is not \`done\` ... something on the
envelope has to say \`mission\`.` — this ~390-line test (lines 6485-6914, plus two now-orphaned
module-scope helpers `MISSION_REPORT_NAME` and `missionRecordFixture` used nowhere else) asserted
that finalize detects and reports a Mission List item whose outcome is filled in while its status is
not `done`, on two channels: an envelope key/typed-finding naming the record (matched by `/mission/i`)
and a durable `## `/`### ` summary section.

**Verified both channels are gone, not merely renamed.** Grepped `scripts/kaola-workflow-claim.js`
for every `MISSION_LIST_FILE`/`mission-list`/`mission_list` reference (6 hits): all are path
operations — the archive copy, the `#399`/`#1054` content-identity mirror-guard (the
`ledger-compare.js` ruling above), the evidence-sidecar enumeration. None parses `mission-list.md`
content for a status/outcome judgment, and nothing on the finalize JSON envelope names `mission` at
all. This matches ADR 0017 directly: "Note what the successor axiom does *not* derive: any check
that the records are *sufficient* ... Judging sufficiency would be the system deciding what the
agent needs, which is the move ADR 0016 deleted" (docs/decisions/0017-the-mission-list.md) — #970's
whole premise (a script judging whether a hand-authored record is internally coherent) is exactly
the move this design retires. There is no successor behavior to rewrite the test into.

**Ruling: delete, not rewrite** (team lead's own second option, taken). Removed the function, its
header comment, and the two orphaned helpers; removed its one `add(...)` registry line in `main()`'s
test list, replaced with a one-line pointer comment naming the retirement. Confirmed no other
reference to `testFinalizeReportsMissionListOutcomeWithoutDone`, `MISSION_REPORT_NAME`, or
`missionRecordFixture` remains (`grep` across the whole file). `node --check
scripts/simulate-workflow-walkthrough.js`: syntax OK.

**Verification**: no isolated-baseline RED capture applies here — #970 is not a new acceptance claim
I am authoring against a frozen candidate, it is an EXISTING test whose premise mission 7's own
production change (this session, after `6ae5374b` was frozen) already falsified; the assertion
failure captured above (against the live, already-mission-7'd tree) is the evidence the deletion
responds to. What I did verify: (1) the claimed replacement-channel absence, by reading the current
production source directly (above); (2) registry integrity after deletion — syntax check clean, zero
dangling references; (3) ran the FULL standalone walkthrough post-deletion —
`node scripts/simulate-workflow-walkthrough.js` — rather than only the fallback: **178/178
scenarios passed, 0 failed, exit 0** (`##KW-SHARD {"scenarios":178,"ran":178,"passed":178,"failed":0}`,
2088 spawns). The registry point where the retired test used to sit runs clean straight through
(`testFinalizeOfflineReportsSkippedClaimRelease: PASSED` immediately followed by
`testWatchPrEmitsClaimLabelReceipt: PASSED`, no `#970` assertion in between), and nothing else in
the whole walkthrough regressed. This supersedes the mission-13 fallback noted for the doc-updater
fixture task above — that task's fixture edits are covered by this same full green run.

## R1 acceptance (candidate 5743eb15): the mirror must accept its own prior write

Review finding R1 (medium), `kaola-workflow/bundle-1054/.cache/review-1054.md`: `mirrorFinalizationArtifacts`
copies main's `mission-list.md` into the linked worktree once (`first_sync`); the orchestrator then
legitimately advances the MAIN copy; the next mirror sees `worktree != main` and refuses
`mirror_sync_failed` — the mirror refuses its own prior write, not a real conflict. Design of record
(team lead, for the implementer, pinned here as the observable contract, not the code): the mirror
writes `.cache/mirror-digest.json` into the DEST project folder, mapping the mirrored basename to the
sha256 of the bytes it copied; `compareLedgers(src, dest, { priorDigest })` returns safe, reason
`prior_mirror`, when `sha256(dest) === priorDigest`.

**`scripts/test-ledger-compare.js`** — new block (f), unit-level, against `compareLedgers` directly:
- (f1) dest unchanged since the mirror wrote it, src advanced — safe, `prior_mirror`.
- (f2) dest independently edited by one byte after the mirror (digest supplied but no longer
  matches dest's current bytes) — still refuses `content_diverged`.
- (f3a/b/c) no third argument at all / empty options / explicit `priorDigest: null` — all
  byte-for-byte today's behavior (regression control for every caller not yet passing a digest).
- (f4) a corrupt/garbage `priorDigest` — refuses, not a coincidental match.
- (f5a/b) `first_sync` (dest absent) and `identical` (dest === src) are never reclassified as
  `prior_mirror` regardless of what digest is supplied — the new arm only ever fires on the one
  previously-unsafe case it targets.

**`scripts/test-issue-1054-ledger-guard.js`** — four new scenarios, reproducing the review's own
probe methodology exactly: calling the production `mirrorFinalizationArtifacts(root, project)`
directly, twice, with a main-side content change between calls (a real `git worktree add` fixture via
the existing `buildLinkedFixture` helper) — never two full `finalize` CLI runs, since the first CLI
run archives the project, making a genuine second mirror call unreachable through the CLI.
- **R1a**, all 4 editions: pass 1 (first sync) succeeds; main advances; worktree is left untouched;
  pass 2 must NOT refuse, must actually copy the advanced content down (not merely decline to
  refuse), and `.cache/mirror-digest.json` must exist in the dest project folder mapping
  `mission-list.md` to the sha256 of what pass 2 just copied.
- **R1b**: a worktree copy hand-edited by one byte after a successful mirror still refuses
  `content_diverged` even with main also advanced — the receipt existing is not enough; its digest
  has to match dest's CURRENT bytes.
- **R1c** (regression control): first-sync and an untouched identical repeat, driven through the
  same direct-call path the new legs use, are unchanged.
- **R1d**: a MISSING receipt (deleted after pass 1) and a CORRUPT receipt (unparseable JSON) both
  fall back to refusing `mirror_sync_failed` for the exact main-advanced/worktree-untouched shape
  R1a proves is otherwise safe — the corrupt-receipt leg also asserts the fallback never throws.

RED on `5743eb15` (isolated worktree, removed after capture — identical to the live-tree
reproduction):
- `test-ledger-compare.js`: exit 1, throws on assertion (f1) — `content_diverged` where `prior_mirror`
  is required.
- `test-issue-1054-ledger-guard.js`: exit 1, **18 failures / 49 passed** — 4 assertions x 4 editions
  for R1a (16), 1 precondition for R1b ("pass 1 must have written the receipt" — the rest of R1b's
  body still runs and happens to pass today, since a refusal is still today's correct answer once no
  receipt exists to consult), 1 precondition for R1d1 (same reason). R1c and R1d2 pass today as
  written — both are regression/fallback CONTROLS asserting behavior that is correct both before and
  after the implementer's change, not new claims.

`node scripts/test-suite-registration.js`: 721/721, unaffected (both files were already registered).

Land order per team lead: RED is now recorded here; impl-1054-finalize implements next, then
re-runs both suites.

## R1 follow-up: `finalize --check` must read the mirror receipt too

Gap surfaced by the docs agent while documenting R1: `probeFinalizeMirror` — the read-only twin
behind `finalize --check` — calls `compareLedgers(src, dest)` (`kaola-workflow-claim.js` ~3917)
without `priorDigest`, so `--check` still predicts `sync_failed` for exactly the main-advanced /
worktree-untouched pair the real transaction (as of the R1 implementation, now landed) accepts as
`prior_mirror`. `probeFinalizeMirror`'s own doc comment states the prediction "must agree with what
the transaction will actually do" — this is a live disagreement, not a hypothetical one.

**`scripts/test-issue-1054-ledger-guard.js`** — two new scenarios, driven through the real `finalize
--check` CLI (`runFinalize(ed, fx, project, ['--check'])`), on the SAME fixture-construction and
digest-receipt helpers R1a-d already established:
- **R1e**, all 4 editions: a real `mirrorFinalizationArtifacts` pass 1 (first sync), then main
  advances with the worktree copy left untouched (byte-identical to what R1a proves the real
  transaction now accepts) — `--check` must report `checks.mirror === 'ready'`, `reasons` must NOT
  include `mirror_sync_failed`, and the prediction must stay read-only: neither record file nor the
  mirror-digest receipt itself may be touched by `--check`.
- **R1f**, canonical only (control, mirrors R1b): the same setup but with the worktree copy also
  hand-edited by one byte after the mirror — `--check` must still predict `sync_failed` /
  `mirror_sync_failed`, since the receipt no longer matches dest's current bytes; the receipt alone
  is not a blanket relaxation for the prediction either.

**RED, live tree** (HEAD `5743eb15`, with `impl-1054-finalize`'s uncommitted R1 production changes
already applied to all 8 `kaola-workflow-claim.js` / `kaola-workflow-ledger-compare.js` files —
confirmed via `git status --short`): `test-issue-1054-ledger-guard.js` exit 1, **8 failures / 88
passed**. All 8 failures are R1e, 2 assertions x 4 editions — `checks.mirror` still reports
`sync_failed` and `reasons` still includes `mirror_sync_failed` for the pair the real mirror call
now accepts safely. This is corroborating evidence the gap is real: R1a-d (the real-transaction
legs, already implemented) all pass on this same live tree, while R1e (the `--check` twin) fails on
exactly the case R1a proves the transaction itself no longer refuses. R1f passes as written — the
diverged-prediction path was never broken, only the safe-prediction path was.

`node scripts/test-suite-registration.js`: 721/721, unaffected.

RED is now recorded here; impl-1054-finalize implements the `probeFinalizeMirror` fix (pass the
mirror's own `.cache/mirror-digest.json` receipt as `priorDigest` into its `compareLedgers` call)
next, then re-runs `test-issue-1054-ledger-guard.js` and `test-suite-registration.js`.
