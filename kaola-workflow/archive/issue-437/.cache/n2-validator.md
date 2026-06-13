evidence-binding: n2-validator c61508fa560e

# n2-validator — D-437-01 Part 2 (plan-validator group barrier + parallel-safe)

Implemented the three validator changes from `n1-design.md` §3/§4/§10, plus their
test-commit-node.js coverage, edition byte-pair, and the two regenerated forge ports.
All new arms are dead code when `KAOLA_LANE_CONTAINMENT` is OFF / the new flags are absent
(INV-6): the validator is toggle-agnostic — its new flags are simply never passed.

RED: T-PS-1 (disjoint A,B → result ok) — FAIL, got {"result":"in-grammar",...} because --parallel-safe did not exist and fell through to default validatePlan (pre-impl)
GREEN: commit-node tests passed (85 assertions); T-PS-1..5, GB-PURE-a..d, T-GB-1..6 all green; exit 0

## What changed (write set)

- `scripts/kaola-workflow-plan-validator.js`
  - `barrierCheck(content, actualPaths, opts)` — NEW `opts.groupMembers` arm placed BEFORE the
    existing `ownNode`/whole-plan allowlist construction. When present, `declared` = UNION over the
    named members' write sets; the whole-plan ledger-floor (`unattributed`) block is ALSO skipped in
    group mode (members are `in_progress` during the last-member close, exactly like the per-node
    in_progress carve-out). Cross-lane strays land in the EXISTING rank-4 `outOfAllow` arm → reason
    `write_set_overflow` (NO new reason code). Absent `groupMembers` ⇒ byte-identical to today.
  - NEW CLI `--parallel-safe --nodes A,B[,C] --json` — read-only pairwise-disjointness over a named
    node subset, exposing the antichain pair-loop (exact-file rule + `classifier.disjointWriteSets`).
    Refuses: `missing_nodes` / `too_few_nodes` / `node_not_found` / `overlapping_write_sets` (with an
    `overlapping[]` array carrying `{a,b,kind,path|reasoning}`). No fs/git writes.
  - NEW CLI `--group-barrier --group-id ID [--member ID] [--skip-root-pin] --json` — the group-scoped
    close barrier. Root-pin + reads `running-set.json`'s `lane_group`, resolves the group baseline via
    `cacheBaseFile(group_id)` with the #368 ref↔file mismatch cross-check, snapshots now, tree-diffs
    baseline→now, and calls `barrierCheck(... {groupMembers: lg.members})`. Refuses: `group_not_found`
    / `running_set_unreadable` / `no_group_base` / `barrier_base_mismatch` / `root_mismatch`.
  - `printHelp()` — two new flag lines.
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — byte-identical copy (confirmed
  `diff` empty).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` and
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — regenerated via
  `node scripts/edition-sync.js --write` (never hand-edited).
- `scripts/test-commit-node.js` — added the #437 real-subprocess section (GB-PURE-{a..d} pure-fn
  groupMembers, T-PS-{1..5} parallel-safe CLI, T-GB-{1..6} group-barrier CLI in a real git repo under
  $TMPDIR), incl. the T-GB-6 mutation check that a lone undeclared stray MUST refuse (so a
  short-circuit/vacuous group barrier is impossible to false-green).

## RED — failing tests BEFORE implementation

Ran `node scripts/test-commit-node.js` against the UNMODIFIED validator (new tests present, no impl):

```
FAIL: GB-PURE-c: groupMembers:[A] only allows ax.js → by.js overflows   (no groupMembers arm; [A] treated as whole-plan union, by.js did not overflow)
FAIL: T-PS-1: disjoint A,B → result ok, got {"result":"in-grammar",...}  (no --parallel-safe flag; fell through to default validatePlan)
FAIL: T-PS-2: overlapping[0].kind === exact, got undefined              (overlapping[] absent → TypeError on r.overlapping[0])
exit 1; 6 FAIL lines + TypeError (parallel-safe / group-barrier flags do not exist yet)
```

The T-GB-* group-barrier cases could not even reach their assertions (the T-PS-2 crash halts the run),
confirming the feature is wholly absent in RED.

## GREEN — passing tests AFTER implementation

Ran `node scripts/test-commit-node.js`:

```
commit-node tests passed (85 assertions); exit 0
```

GB-PURE-a/b/c/d, T-PS-1..5, T-GB-1..6 all green — incl. T-GB-2/T-GB-6 REAL-subprocess cross-lane
stray z.js refuses via `write_set_overflow` (rank-4), and T-GB-3 by.js-alone passes under union(A,B)
proving the UNION-not-per-node allowlist. 85 assertions, up from 56 (29 new #437 assertions).

## edition-sync --check — byte-parity confirmed

```
$ node scripts/edition-sync.js --check
edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.   (exit 0)
```

`diff scripts/...plan-validator.js plugins/kaola-workflow/scripts/...plan-validator.js` → empty (byte-identical pair).

## npm run test:kaola-workflow:claude — pass confirmed

Captured the REAL exit code (not a piped tail):

```
$ npm run test:kaola-workflow:claude > /tmp/claude-chain.txt 2>&1; echo "REAL-RC: $?"
REAL-RC: 0
Workflow walkthrough simulation passed
```

Regression guard (validator callers): `node scripts/test-parallel-batch.js` → 205 assertions, exit 0;
`node scripts/test-adaptive-node.js` → 579 assertions, exit 0 (flag-OFF byte-identity holds — the new
arms are never invoked by the existing ×4 walkthroughs / caller tests).

## forbidden-only contract checks — pass confirmed

```
$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only scripts/kaola-workflow-plan-validator.js
Kaola-Workflow GitLab forbidden-only check passed (1 file(s))   (exit 0)

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only scripts/kaola-workflow-plan-validator.js
Kaola-Workflow Gitea forbidden-only check passed (1 file(s))    (exit 0)
```

## Notes for downstream nodes

- commit-node.js's `--group-barrier` mode (n1-design §4.3) is NOT in this node's write set and is NOT
  authored here — the validator's `--group-barrier` CLI is invoked directly by my tests, and the
  adaptive-node `close-node` path (n3) will shell either commit-node or the validator. The validator
  group-barrier CLI is self-contained (reads running-set.json itself), so n3 can shell it directly.
- The design's preferred ordering (run the group barrier while `lane_group.members` STILL holds the
  full set, then remove + clear after a pass) is supported directly; the `--member <id>` fallback for
  the remove-then-barrier ordering is also wired (unioned into members).

barrier: green
no_op: not applicable — tests + production code written
