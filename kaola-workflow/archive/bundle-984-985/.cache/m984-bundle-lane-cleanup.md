# m984: bundle-lane cleanup — dead helper + stale comments after the seam was ported to production

Agent `tdd984` (tdd-guide), worktree `bundle-984-985`, branch `workflow/bundle-984-985`. **Nothing
committed.** Test path only: `scripts/test-forge-bundle-lane.js`.

## What was found and removed

Verified the seam port first (`node scripts/test-forge-bundle-lane.js`, exit 0, 59 assertions,
matching what was reported) before touching anything.

Grepped for every trace of the old two-edition limitation before editing, not just the one function
named in the brief — `editionSupportsClassifierMock`, `gitlab.*gitea`, `two edition`, `blocked`,
`structural`, `cannot be fixed`, `BLOCKER` — and separately grepped for any `edition.name ===` /
`.filter(e =>` conditional anywhere in the file. Result: **the dead helper and its comment block were
the only trace.** No leg of Part A/B/C or `partCrossEditionAgreement` special-cased gitlab/gitea —
they were always iterated uniformly over all four `EDITIONS`, and `KAOLA_CLASSIFIER_MOCK_SCRIPT` was
already being set in `runClaim`'s env unconditionally for every edition (harmless-until-now on
gitlab/gitea, live now). **Nothing was being skipped** — this is a dead-code + stale-comment cleanup
only, not a finding.

Removed:
- `editionSupportsClassifierMock(edition)` (was ~:185-187) — zero call sites, confirmed by grep both
  before and after the edit.
- The 14-line comment block above it (~:171-184) describing the root/codex-only limitation, the
  in-process-vs-subprocess divergence, and the `target_set_conflicts_active_work` dead-end — all now
  false, since the hook exists in gitlab/gitea's dispatch too.
- The `runClaim` env comment ("Read only by root/codex ... inert on gitlab/gitea") beside
  `KAOLA_CLASSIFIER_MOCK_SCRIPT: CLASSIFIER_MOCK_SCRIPT` — same reason.
- The `makeRepo` comment's trailing clause "for the two editions that can be bootstrapped at all (see
  editionSupportsClassifierMock)" → "for all four editions".

Replaced with one short paragraph (~:171-176) stating what's now true: the seam is honoured by all
four editions, gitlab/gitea route to it the same shape canonical/codex already used, the shipped
in-process path stays byte-identical behind an early return, and it names the old limitation and the
deleted helper for anyone tracing history — without asserting a constraint that no longer holds.

## Gates, each echoed separately

```
$ node scripts/test-forge-bundle-lane.js
forge bundle lane: all 59 assertions passed
GATE_BUNDLE_LANE_EXIT:0
```

```
$ node scripts/simulate-workflow-walkthrough.js   (full, unsharded)
...
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":186,"ran":186,"passed":186,"failed":0}
Workflow walkthrough simulation passed
GATE_WALKTHROUGH_EXIT:0
```

59 assertions in `test-forge-bundle-lane.js`, unchanged from before this cleanup (matches the number
reported after the seam port) — nothing weakened, nothing added or removed from the assertion count.
186/186 walkthrough scenarios, unchanged.

## Nothing else in scope

No other file touched. No production code touched. Nothing committed.
