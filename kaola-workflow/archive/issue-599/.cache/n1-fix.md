evidence-binding: n1-fix 5438e5cbd7f4

## Fix (issue #599)

`selectSpeculativeWriteGroup` (scripts/kaola-workflow-adaptive-node.js, ~line 4306) was fail-OPEN on
a `--parallel-safe` validator subprocess failure without a well-formed `overlapping` array (subprocess
crash, unparseable JSON, or an unreachable non-ok shape that omits the field): the exclusion loop
`for (const o of (ps.overlapping || []))` iterated zero times and left every speculative write candidate
eligible — asymmetric with `tryFormLaneGroup` (~line 3440), which treats ANY non-ok result as
conservative (refuses the whole co-open batch).

Mirrored `tryFormLaneGroup`'s fail-closed posture: on a non-ok `--parallel-safe` result, branch on
whether `ps.overlapping` is a well-formed array (`Array.isArray`). If it IS an array (even empty) —
a genuine overlap report — keep the EXISTING per-pair exclusion loop unchanged. If it is NOT
(undefined/missing — crash, garbled JSON, or an unreachable non-ok shape) — exclude EVERY candidate
id, so `eligible`/`chosen` come out empty and no speculative member opens.

```js
if (!(ps.exitCode === 0 && ps.result === 'ok')) {
  if (Array.isArray(ps.overlapping)) {
    for (const o of ps.overlapping) {
      if (candIds.includes(o.a)) excluded.add(o.a);
      if (candIds.includes(o.b)) excluded.add(o.b);
    }
  } else {
    for (const id of candIds) excluded.add(id);
  }
}
```

## RED (pre-fix, captured via a direct unit-test fault injection against selectSpeculativeWriteGroup —
the same injectable `shell` seam T596-5 uses; mocks return the shellNode fail-closed shapes: a crash =
`{exitCode:1}` with no `result`/`overlapping`, an unparseable-JSON result = `{exitCode:0}` with no
`result`/`overlapping`)

```
FAIL: T599-1a: a validator subprocess crash excludes EVERY candidate (no speculative open), got {"chosen":[{"id":"writerW1","declared_write_set":"shared.js"}],"excluded":[],"ceiling":4}
FAIL: T599-1a: the crash-excluded candidate is named in excluded, got []
FAIL: T599-1b: an unparseable-JSON validator result excludes EVERY candidate too, got {"chosen":[{"id":"writerW1","declared_write_set":"shared.js"}],"excluded":[],"ceiling":4}
adaptive-node tests FAILED (3 failures, 1311 passed)
```

`writerW1` opened (chosen non-empty, excluded empty) despite the injected validator crash/garbled-JSON
result — confirms the fail-open bug on current (pre-fix) code. T599-1c (well-formed non-ok result with
an EMPTY `overlapping` array) already passed pre-fix, confirming the existing per-pair-exclusion path is
untouched by the fix.

## GREEN (post-fix)

```
adaptive-node tests passed (1314 assertions)
EXITCODE:0
```

All three T599-1 sub-assertions (a: crash excludes writerW1, chosen empty; b: garbled-JSON excludes
writerW1, chosen empty; c: well-formed empty-`overlapping` non-ok result leaves writerW1 eligible,
excluded empty) pass. 1310 baseline + 4 new assertions = 1314.

(Stack-trace noise present in both RED and GREEN raw stdout — `EISDIR ... workflow-tasks.json ...
kaola-workflow-task-mirror.js:143` from `d437-lane-*` tmp dirs — is the PRE-EXISTING, deliberately
pinned `#588-TASKMIRROR-FAILOPEN` fault-injection test (line ~6836 of test-adaptive-node.js), unrelated
to this change; those assertions pass in both runs.)

## Cross-edition sync

- Canonical edit: `scripts/kaola-workflow-adaptive-node.js`.
- `node scripts/edition-sync.js --write` → regenerated `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex-sync) + `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (generated).
- `node scripts/edition-sync.js --check` → "10 forge aggregator ports in rename-normalized parity with canonical." (exit 0)
- `node scripts/validate-script-sync.js` → "OK: 24 common scripts, 25 byte-identical groups, 8 rename-normalized families, 1 config/hooks.json family, and 7 forge export-superset families in sync." (exit 0)
- `git diff --stat` confirms all 4 editions carry the identical +15/-2 diff shape.

## Verification (this node's scope — full four-chain npm run NOT run, per instructions)

- `node scripts/test-adaptive-node.js` → 1314 assertions passed (was 1310 baseline; +4 from T599-1a/b/c).
- `node scripts/test-next-action.js` → 103 assertions passed (unchanged, still green).
- `node scripts/test-commit-node.js` → 123 assertions passed (unchanged, still green).
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (all 201 sub-tests PASSED), exit 0.

## Deviations

None. Write set matches exactly: `scripts/kaola-workflow-adaptive-node.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`,
`scripts/test-adaptive-node.js`.

RED: T599-1a/T599-1b — AssertionError: chosen non-empty / excluded empty on an injected validator
subprocess crash and garbled-JSON result (pre-fix; 3 failures, 1311 passed of 1314 total assertions).
GREEN: T599-1a/T599-1b/T599-1c pass post-fix; 1314/1314 adaptive-node assertions green.
