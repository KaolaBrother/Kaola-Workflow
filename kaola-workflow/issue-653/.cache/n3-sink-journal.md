evidence-binding: n3-sink-journal b039e808d87b
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca

RED: before any sink-merge.js implementation edit, flipped 4 test sites to assert the NEW
terminal-disposal contract and confirmed each failed against the unmodified script:
`node scripts/simulate-workflow-walkthrough.js --only testSinkTransactionCleanEndToEnd` ->
`Error: #653: a terminally successful sink must report journal_disposed:true, got
{"result":"ok","status":"sinked","receipt":{...steps all done...}}` (field absent — pre-fix).
`node scripts/simulate-workflow-walkthrough.js --only testSinkTransactionCrashResume` ->
`Error: #653: the resumed run must reach terminal success and dispose its journal, got
{"result":"ok","status":"sinked","receipt":{...}}` (journal_disposed absent on the second/resumed
run's stdout emit). `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` ->
`AssertionError [ERR_ASSERTION]: #653-gitlab: a terminally successful sink must report
journal_disposed:true, got {"result":"ok","status":"sinked",...}` (actual: undefined, expected:
true) at test-gitlab-sinks.js:1275. `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
-> identical shape at test-gitea-sinks.js:1227 (`#653-gitea`, actual: undefined, expected: true).

GREEN: after implementing `disposeSinkJournals` + wiring it into the terminal-success emit (root +
codex sink-merge.js pair, hand-mirrored into both forge sink-merge ports) and fixing the two
stdout-vs-disk read sites (`#592` in both forge sink test files), all four flipped sites pass:
`testSinkTransactionCleanEndToEnd: PASSED`, `testSinkTransactionCrashResume: PASSED` (both via
`node scripts/simulate-workflow-walkthrough.js` full suite -> "Workflow walkthrough simulation
passed"), `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` -> "GitLab sink tests
passed", `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` -> "Gitea sink tests
passed". Full focused-validation checklist, all green: `node scripts/simulate-workflow-walkthrough.js`
-> "Workflow walkthrough simulation passed"; `node
plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` -> "Kaola-Workflow walkthrough
simulation passed"; `node scripts/validate-script-sync.js` -> "OK: 24 common scripts, 27
byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and
7 forge export-superset families in sync."; all 5 contract validators green (`validate-workflow-contracts.js`,
`validate-kaola-workflow-contracts.js`, gitlab, gitea); `node scripts/test-route-reachability.js` ->
"Route-reachability test passed (369 assertions)." Cross-edition four-chain, run SEQUENTIALLY per
policy (not `&&`-shortcircuited): `npm run test:kaola-workflow:claude` EXIT_STATUS 0 (includes
`generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton.` and
`test-generate-routing-surfaces: all 33 assertions passed.`); `npm run test:kaola-workflow:codex`
EXIT_STATUS 0; `npm run test:kaola-workflow:gitlab` EXIT_STATUS 0; `npm run test:kaola-workflow:gitea`
EXIT_STATUS 0. Byte identity confirmed post-fix: `md5 scripts/kaola-workflow-sink-merge.js
plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` -> both `84a2d34412e5865ed5af5a00eb575472`;
`scripts/kaola-workflow-claim.js` / codex copy unchanged, both `b8fce212135edd714601e1986d8ecbc4`
(confirming zero claim.js hunks from this node, see below).

## Gitlab chain transient flake (investigated, non-blocking)

A first `npm run test:kaola-workflow:gitlab` run failed inside
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` at line 951
(`claimExplicitTarget` mock test: `AssertionError: actual 'target_indeterminate' !== expected
'acquired'`) — a file this node's declared write set does NOT touch and whose exercised code path
(`kaola-gitlab-workflow-claim.js` `claimExplicitTarget`) this node never edits. Isolated the cause by:
(1) `git stash` on every file this node touched, re-running the single test file against the clean
tree twice — both PASSED (0 failures); (2) `git stash pop` restoring this node's changes, re-running
the same file in isolation — PASSED; (3) re-running the full `npm run test:kaola-workflow:gitlab`
chain end-to-end — EXIT_STATUS 0, fully green. Confirms a pre-existing transient/timing flake in the
gitlab claim mock harness, unrelated to this node's diff — not filed (no reproducible signature to
attach an issue to; the chain is required green at close and IS green).

## Anchors verified (against n1-design's B section claims, before editing)

- `disposeSinkJournals(mainRoot, project)` hook point confirmed exactly where n1-design stated:
  `finalReceipt` is parsed from disk into memory at (pre-edit) scripts/kaola-workflow-sink-merge.js
  :1554-1556, immediately before the `{ result:'ok', status:'sinked', receipt: finalReceipt }` emit
  at :1557 — this sits strictly AFTER the SINK_STEPS loop (:1112-1505), the #484 freshness-guard
  ancestry check (:1507-1532), and worktree/branch teardown (:1534-1551), so any earlier
  crash/refusal path returns before ever reaching the dispose call.
- `#520` staging exclusion (sink-merge.js :1292-1298 archive_commit `:(exclude)` pathspecs,
  commit-side :1315) is unrelated code that stays untouched — it excludes the journals from `git
  add`/`git commit`; my change deletes the underlying files from disk afterward, a materially
  different and non-overlapping mechanism. Verified by re-running the crash-abort test's early
  section unchanged and the `#520` git-ls-files-empty assertions in both the root walkthrough and
  both forge sink test files, all still green.
- `resolveSinkReceiptPath` (:798-808) / `writeSinkReceipt` (:791-796) confirmed as the two live+
  archive path helpers `disposeSinkJournals` parallels (4 candidates: live+archive x receipt+
  fallback) rather than reuses, since disposal needs to hit ALL 4 possible stale locations
  unconditionally, not just the one path a `.cache` write would resolve to.
- `sink-fallback.json`'s only write site (postMergeCleanup, :487-509, exit-code-3 merge-impossible
  fallback) confirmed to live entirely inside the LEGACY (non-`--sink`) code path, invoked only from
  `main()`'s non-`--sink` branch (:1642 calls `runSinkTransaction` only when `--sink` is passed,
  :1615/:1754 route the legacy `postMergeCleanup` path otherwise) — `disposeSinkJournals` inside
  `runSinkTransaction`'s terminal-success emit can never race with or short-circuit the exit-3
  fallback-receipt write; the two are mutually exclusive by construction, confirming n1-design's
  "sink-pr's fallback read is the PR lane, out of scope" note.

## B1 — delete-on-terminal-success (implementation)

New helper `disposeSinkJournals(mainRoot, project)` added beside `resolveSinkReceiptPath` in
scripts/kaola-workflow-sink-merge.js (+ byte-identical codex copy): unlinks all 4 candidate paths
(live `.cache`/archive `.cache` x `sink-receipt.json`/`sink-fallback.json`), per-file try/catch,
treats `ENOENT` as success (already absent, not a failure) and any other unlink error as a
stderr-WARNING-only non-fatal degradation (never throws, never fails an otherwise-successful sink).
Returns `true` iff nothing remains on disk afterward. Call site: immediately after `finalReceipt` is
parsed from disk, before the success emit; the emit now carries `journal_disposed: true|false`
alongside the unchanged `result`/`status`/`receipt` fields. Crash-resume is untouched by
construction — verified by re-running `testSinkTransactionCrashResume`'s first (aborted) run
assertions unchanged (receipt still found on disk mid-transaction, `merge:'done'`,
`finalize!=='done'`) while extending only the SECOND (terminally-successful, resumed) run's
assertions to read from the stdout receipt and confirm on-disk absence.

## B2 — forge sink-merge ports (hand-mirrored, divergent)

`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` are DIVERGENT hand-ports
(confirmed NOT part of any byte-identical/rename-normalized family by `validate-script-sync.js`,
which stayed green with zero new complaints after this edit) — mirrored the identical
`disposeSinkJournals` helper (same logic, ported to each file's more compact existing comment style)
and the identical `journal_disposed` emit-field wiring, by hand, matching each port's existing
`runSinkTransaction(args, mainRoot, defBranch)` signature (no `rawArgs`/`args` split, unlike root/codex).
Behavior asserted via the `#653` needles added to `test-gitlab-sinks.js` / `test-gitea-sinks.js`
(the `#520` journal-exclusion test flipped to check post-disposal absence + `journal_disposed:true`;
the `#592` bundle-closure test's post-success receipt read switched from disk to the stdout
`p.receipt` object, since the on-disk copy no longer exists after terminal success).

## B3 — prose fix ("clean and synced" trap)

Provenance-free rule text added verbatim (byte-identical wording) to 6 surfaces:
- `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md` — one paragraph
  inserted right after the `Required Agent Compliance` table's closing fence (same insertion point
  in all 3, each pre-edit-verified byte-identical at that table row before editing).
- `commands/kaola-workflow-finalize.md` — extended the existing Crash-resume paragraph + the
  `sink-merge.js` exit-0 bullet (the "post-sink confirm" — `git status --short --branch`) to name the
  disposal contract and `journal_disposed: true` field.
- `commands/kaola-workflow-plan-run.md` + its 3 SKILL mirrors — one sentence appended to the
  All-done "delegate/proceed to finalize" line.

**Generated-surface correction (load-bearing discovery, not in n1-design's spec).**
`commands/kaola-workflow-plan-run.md` and its 3 SKILL packs — PLUS the two gitlab/gitea
`commands/kaola-workflow-plan-run.md` copies that n1-design's declared write set did NOT list — are
MACHINE-GENERATED by `scripts/generate-routing-surfaces.js` from a single source
(`templates/routing/plan-run.skeleton.md` + the `pr-alldone-intro` splice in
`templates/routing/slots.js`), not hand-editable files. My first attempt hand-edited the 4 declared
rendered files directly; `npm run test:kaola-workflow:claude` caught this immediately as
`generate-routing-surfaces --check: 4 surface(s) drifted from the skeleton` (a REAL, not
false-positive, failure — verified the piped `tail` had masked a nonzero exit by re-running without
the pipe and checking `$?` explicitly). Corrected by reverting the 4 hand-edits (`git checkout --`),
instead editing the skeleton's `REGION:command+github` block (github command variant) and all 3
`pr-alldone-intro` splice variants in slots.js (`command.gitlab`, `command.gitea`, `skill` — the
`skill` variant is shared verbatim across all 3 forge SKILL packs), then running `node
scripts/generate-routing-surfaces.js --write` to regenerate all 12 plan-run+next surfaces
mechanically. This is a mechanical consequence of the shared-skeleton architecture (same class as
n2-attestation's A3 "extra touch outside its two declared hunks" — not new scope), and IS why
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` and
`plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` also changed in this node's diff
despite not being in the declared write set: they render from the same skeleton and would otherwise
silently drift. Post-fix: `node scripts/generate-routing-surfaces.js --check` -> "all 12 surfaces
byte-match the skeleton"; confirmed no provenance leaked into any of the 6 declared prose surfaces
(`grep -rln '#653'` across all finalize/plan-run command+SKILL files returns nothing — issue refs
only appear in code comments/tests, which are not agent-facing).

## Claim.js hunks from this node: ZERO (confirmed)

Per spec ("NO claim.js edit needed — keeps n6's mirror smaller"): `scripts/kaola-workflow-claim.js`
and its codex byte-copy are UNCHANGED by this node — confirmed via `git diff` (empty for both paths
in this node's working tree at close) and via the byte-identity md5 check above matching the
pre-existing hash. `scripts/test-claim-hardening.js` (declared-but-expected-untouched) confirmed
untouched: its only sink-merge-adjacent tests (`--help`/`--bogus` no-op probes) never reach terminal
success, and its two `verify-sink` tests (`#631`) write a synthetic `sink-receipt.json` directly and
invoke `claim.js verify-sink`, never `sink-merge.js --sink` — outside this node's change surface by
construction; ran green unchanged (part of the full `test:kaola-workflow:claude` chain).
`scripts/test-route-reachability.js` (declared-but-expected-untouched) confirmed untouched and green
(369 assertions) — routes did not change.

## Per-file summary

- `scripts/kaola-workflow-sink-merge.js` + `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
  — B1 `disposeSinkJournals` + emit wiring, byte-identical pair (md5 confirmed).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — B2 hand-mirror.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — B2 hand-mirror.
- `scripts/simulate-workflow-walkthrough.js` — B4 RED->GREEN flips: `testSinkTransactionCleanEndToEnd`
  (stdout-receipt + journal-absence + `journal_disposed:true` + `git status --porcelain` no-residue
  asserts) and `testSinkTransactionCrashResume` (resumed-run assertions only; the pre-terminal-success
  abort assertions at the top of the function are byte-unchanged).
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` / `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
  — `#520` test flipped to post-disposal-absence + `journal_disposed:true`; `#592` test's post-success
  receipt read switched from disk to `p.receipt`, plus a `journal_disposed:true` assert added.
- `commands/kaola-workflow-finalize.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md`
  — B3 prose, hand-edited directly (finalize is NOT a generated-surface topic).
- `commands/kaola-workflow-plan-run.md`, `plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-plan-run/SKILL.md`,
  `templates/routing/plan-run.skeleton.md`, `templates/routing/slots.js` — B3 prose, sourced through
  the skeleton/splice generation mechanism (see Generated-surface correction above); also
  mechanically regenerated (not hand-edited) `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
  and `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` (outside the declared write
  set, required by the shared-skeleton architecture).
- `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
  `scripts/test-claim-hardening.js`, `scripts/test-route-reachability.js` — declared-but-untouched,
  confirmed (see above).

## Chain posture at close

All four cross-edition chains green, run sequentially (not `&&`-chained): claude, codex, gitlab,
gitea — each EXIT_STATUS 0 (gitlab's first attempt hit an unrelated pre-existing transient flake,
investigated above, non-blocking; re-run green). `node scripts/simulate-workflow-walkthrough.js`,
the codex walkthrough, both forge sink test files, `validate-script-sync.js`, all 5 contract
validators, and `test-route-reachability.js` all independently green as the focused-validation
checklist required.
