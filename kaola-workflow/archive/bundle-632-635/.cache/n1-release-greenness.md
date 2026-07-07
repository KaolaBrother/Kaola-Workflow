evidence-binding: n1-release-greenness a78b86097d0c

## Summary

#632: `chainReceiptGreenness` (`scripts/kaola-workflow-release.js:249`) fell fail-OPEN when
`receipt.chains` was an empty array or a missing key — the red-chain loop body never ran, so
"zero chains verified" read as "all chains green" (the second fail-open consumer of this
pattern; #618 only closed the plan-validator `--finalize-check` gate). Fixed with a
`chains_empty` guard mirroring the #618 precedence exactly: `chains_unverified > chains_stale >
chains_empty > chains_red`. Ported atomically to all four `release.js` editions (byte-identical
claude/codex twin + rename-normalized gitlab/gitea forge ports — the guard carries no
CLI-brand tokens so all four are identical in this region). Also corrected the stale `--cut`
comment (line ~364) — verified `runCut` never reads `green` (zero hits), so `--cut` stays
informational-only per the plan's VALUE-CALL RESOLUTION (no behavior change).

## RED

Added T14a/T14b to `scripts/test-release.js` asserting `chainReceiptGreenness` (via the
`--verify --json` `chain_greenness` envelope) over `{chains:[]}` and over a receipt with no
`chains` key returns `green:false, reason:'chains_empty'`. Pre-fix run:

```
FAIL: T14a: chainReceiptGreenness over an empty chains[] must be green:false (zero chains verified is not "all green"); got={"green":true}
FAIL: T14a: chainReceiptGreenness over an empty chains[] must report reason chains_empty; got={"green":true}
FAIL: T14b: chainReceiptGreenness over a receipt with NO chains[] key must be green:false; got={"green":true}
FAIL: T14b: chainReceiptGreenness over a receipt with NO chains[] key must report reason chains_empty; got={"green":true}

test-release: 4 test(s) FAILED, 107 passed
```

RED: T14a/T14b (chainReceiptGreenness over `{chains:[]}` and over a receipt with no `chains`
key) — AssertionError-equivalent: expected `{green:false, reason:'chains_empty'}`, got
`{"green":true}` (pre-impl fail-open confirmed on both empty-array and missing-key inputs).
T14c (precedence: stale+empty must report `chains_stale` not `chains_empty`) and T14d
(regression: a genuine all-green non-empty receipt must still pass) were added as
regression/precedence guards and already passed pre-fix (they exercise pre-existing behavior,
not the bug), confirming the new guard's insertion point does not need to disturb them.

## GREEN

Implemented the `chains_empty` guard in `chainReceiptGreenness` (inserted after the
`chains_stale` HEAD-bound check, before the red-chain loop) in all four editions
(`scripts/kaola-workflow-release.js`, `plugins/kaola-workflow/scripts/kaola-workflow-release.js`
via targeted `cp`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` via re-implementation),
plus the `--cut` comment correction. Re-run:

```
test-release: all 111 assertions passed
```

GREEN: T14a/T14b now pass (chain_greenness reports `{green:false, reason:'chains_empty'}` for
both empty-array and missing-key inputs); all 111/111 test-release.js assertions green (107
pre-existing + 4 new T14 assertions, T14c/T14d unaffected).

## Validation

- `node scripts/validate-script-sync.js` → `OK: 24 common scripts, 25 byte-identical groups, 8
  rename-normalized families, 1 config/hooks.json family, and 7 forge export-superset families
  in sync.`
- `node scripts/test-release.js` → `test-release: all 111 assertions passed`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`
- Confirmed via grep: `green` appears ONLY inside `chainReceiptGreenness` and `runVerify` in
  all four editions — zero hits in any `runCut` body — so the `--cut` comment fix reflects
  reality with no behavior change (no gating added).
- Did not run the full four-chain `npm test` suite (out of scope for this node per the task
  brief; n3-review owns that). Did not touch `scripts/test-run-chains.js` (n2's file).

## Write set touched

- `scripts/kaola-workflow-release.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-release.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js`
- `scripts/test-release.js`
