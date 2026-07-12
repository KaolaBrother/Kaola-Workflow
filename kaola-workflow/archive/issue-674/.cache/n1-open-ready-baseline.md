evidence-binding: n1-open-ready-baseline 05653332978a

## Defects fixed (issue #674)

(a) `runOpenReady`'s stub-commit staged the seeded member evidence stubs with `git add -- <paths>`
    (no `-f`), so a consumer repo that gitignores `.cache/` refuses the add and the co-open aborts
    with `stub_commit_failed`, serial-degrading the authored parallel-write antichain. Fix: `git add
    -f -- <paths>` (the paths are explicitly enumerated by seedEvidenceFile, never a glob, so forcing
    is safe and required — the stub MUST be tracked so every leg inherits it).

(b) The per-member baseline-recording loop (BEFORE the stub commit) records `--record-base` baselines
    for every `toOpen` group member at the pre-run tree. A group-form abort AFTER that loop did NOT
    drop those baselines. `--record-base`'s crash-resume idempotent reuse then let a LATER serial
    open of the same member id REUSE the stale pre-abort snapshot, so its close barrier misattributed
    a sibling's uncommitted writes (landed in the shared, leg-less tree between the abort and the
    re-open) as an out-of-declared-set `write_set_overflow` (the vrpai-cli#948 incident). Fix: track
    every member id the loop has recorded a baseline for (`recordedBaselineIds`) and, on EVERY
    group-form abort after ≥1 baseline was recorded, call the existing `--drop-base --node-id <id>`
    primitive (validator CLI; file+ref together, idempotent) for each recorded id before returning
    the refusal. `--drop-base` is legal at every one of these abort points because the ledger flip to
    `in_progress` happens in Phase 2, strictly AFTER this whole leg-provisioning block — every member
    is still `pending` on-disk when the drop fires, so `drop_base_window_open` never triggers.

### Every group-form abort path audited in the leg-provisioning transaction (`runOpenReady`,
    scripts/kaola-workflow-adaptive-node.js, the `if (groupForm && legCoupled) { ... }` block) —
    all 5 confirmed to now drop baselines:

1. `group_baseline_failed` (the GROUP baseline itself, BEFORE the member-baseline loop starts) —
   OUT OF SCOPE for the drop: no member baseline has been recorded yet at this point, nothing to
   drop. Left as-is (matches the task's explicit enumeration, which does not name this reason).
2. mid-loop `baseline_failed` (a member's OWN `--record-base --start` call refuses) — drops
   `recordedBaselineIds`, the PRIOR members this loop already recorded a baseline for (the failing
   member itself never recorded one, correctly excluded).
3. `stub_commit_failed` (the `git add -f` / `git commit` for the tracked stubs throws) — the member
   loop has fully completed by this point (all of `toOpen` recorded), so drops the FULL
   `recordedBaselineIds` set.
4. `leg_provision_failed` (baseRev resolution: `git rev-parse HEAD` fails) — after the member loop
   AND the stub commit both completed; drops the FULL set.
5. `leg_provision_failed` (per-member `provisionLeg` returns `!r.ok`, inside the leg-provisioning
   loop) — drops the FULL set (in addition to the existing per-call leg teardown rollback).
6. `leg_provision_failed` (`leg_base_anchor_failed` — the `git update-ref` for the leg-base ref
   fails) — drops the FULL set (in addition to the existing leg teardown rollback).

Explicitly OUT of this transaction's scope (verified NOT to need a drop, since the running set was
already committed to disk by the time these can fire — the existing #385 reconcile-running-set
baseline-drop machinery, `scripts/kaola-workflow-adaptive-node.js` ~:6239-6249, already handles
this class): Phase 2's own `baseline_failed` (the SAME `--record-base --start` call re-invoked per
`toOpen` member AFTER `running-set.json` has already been written to `state:'opening'`) — a crash
there is a running-set-mid-open scenario recovered via `reconcile-running-set`, not a clean
pre-running-set-write abort. Distinct code path, already covered, untouched by this fix.

RED: node scripts/test-adaptive-node.js (production code unfixed) — both new #674a/#674b regressions
fail as designed:
```
FAIL: #674a: gitignored .cache/ must not abort the co-open (the stub add needs -f), got {"result":"refuse","reason":"stub_commit_failed"}
FAIL: #674a: the lane group [A,B] still forms despite gitignored .cache/, got undefined
FAIL: #674a: running set reaches open state with both legs provisioned, got null
FAIL: #674a: both A and B in_progress (co-opened, not serial-degraded)
FAIL: #674b: A's member baseline is DROPPED as part of the group-form abort (never left stranded for a later stale reuse)
FAIL: #674b: A's close must NOT false-positive write_set_overflow on the sibling's (B's) landed diff — the reused stale baseline must not misattribute it, got {"exitCode":1,"result":"refuse","reason":"write_set_overflow","outOfAllow":["by.js"], ...}
adaptive-node tests FAILED (6 failures, 1791 passed)
```
(captured via `git stash push -- scripts/kaola-workflow-adaptive-node.js` against the current
test-adaptive-node.js, then `git stash pop` to restore the fix — full run, ~2m45s.)

GREEN: node scripts/test-adaptive-node.js (production code fixed) — 0 failures:
```
adaptive-node tests passed (1797 assertions)
```
(1789 pre-existing + 8 new #674a/#674b assertions, all green.)

Also green:
- `node scripts/test-parallel.js --self-test` — 13 assertions passed, "test-parallel self-test
  passed" (exit 0). Does not exercise open-ready (the four-chain test-parallelism harness is
  unrelated to the adaptive-node scheduler); ran per the brief regardless.
- `node scripts/simulate-workflow-walkthrough.js` — "Workflow walkthrough simulation passed",
  exit 0.
- `node scripts/edition-sync.js --check` — clean: "10 forge aggregator ports, 24 COMMON_SCRIPTS
  mirrors, and 27 byte-identical groups in parity with canonical." (after `npm run sync:editions`
  regenerated the 3 edition ports from the canonical source — codex twin
  (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`) + gitlab/gitea
  `@generated` ports.)

Note: a pre-existing, unrelated stderr artifact ("fatal: .git/index: index file smaller than
expected" / "fatal: not a git repository: (null)") appears at the end of both the RED and GREEN
full-suite runs, and also on an UNMODIFIED baseline run (verified via `git stash` of only the test
file) — confirmed pre-existing flake in the test suite, not caused by this change, and does not
affect pass/fail counts or exit code.

Write-set: exactly the 5 files (canonical + 3 edition ports + test file). No ledger/state/baseline
files touched by this node beyond this evidence file.
