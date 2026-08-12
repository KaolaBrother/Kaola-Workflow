# impl-960 — test custody surgery on `scripts/test-parallel.js`

Role: tdd-guide (test artifact only). Worktree:
`.kw/worktrees/bundle-956-957-958-959-960-961-962`, branch
`workflow/bundle-956-957-958-959-960-961-962`, baseline `8742f5b80bbb912cbbb46e9809b8a9d8bab70de1`.

Scope held to exactly one file: `scripts/test-parallel.js`. `scripts/run-chain-pool.js` NOT touched.

## Edits made — three cuts, `1 insertion(+), 54 deletions(-)`

Line numbers verified against the file before cutting; they matched the premise exactly.

| # | what | line range (pre-edit) |
|---|---|---|
| 1 | section-(f) lead comment retitled `(f) Within-chain step pool + scenario sharding.` → `(f) Scenario sharding.` | 341 (within the 340–347 block) |
| 2 | `const pool = require('./run-chain-pool');` removed | 349 |
| 3 | sections f6–f9 removed whole, with the trailing blank line | 414–464 (+465 blank) |

The comment's body (lines 342–346) was left verbatim: it already described only the shard partition and
the coverage audit, both surviving. Only the "Within-chain step pool + " half named the dead mechanism.

Cut on structure (section markers `// (f6)` … through the closing `}` of f9), not on blind line numbers.

## Survivors — untouched, verified

- Line 348 `const shardLib = require('./test-shard-lib');` — **kept**.
- Sections a–e and f1–f5 — **kept, byte-identical**. The diff shows no change inside any of them.
- No assertion weakened, skipped, commented out, or renumbered. No test added.
- `grep -nP 'pool|POOL|chain-pool' scripts/test-parallel.js` → exit 1, zero hits.

## Verification

`scripts/run-chain-pool.js` **still existed in the worktree** when this ran — the implementer had not
yet landed the deletion (the only staged change in `scripts/` was an unrelated
`D scripts/fixtures-orphan-legality.js`). Per the brief I did not run the self-test in-tree, since a
green there would say nothing about the post-deletion state.

Instead I built the post-deletion condition in a scratch mirror — a copy of `scripts/` with
`run-chain-pool.js` removed **in the mirror only**. The worktree's mechanism file was confirmed
untouched before and after. Mirrors:
`…/scratchpad/mirror-960` (mechanism deleted) and `…/scratchpad/mirror-960-intact` (mechanism present).

**RED control** — baseline (pre-edit) `test-parallel.js` + mechanism deleted:

```
exit=1
Error: Cannot find module './run-chain-pool'
    at selfTest (…/mirror-960/scripts/test-parallel.js:349:16)
```

This is the failure the premise predicted, and it proves the cut is load-bearing rather than cosmetic.

**GREEN** — edited `test-parallel.js` + mechanism deleted:

```
exit=0
self-test: 23 assertions passed, 0 failed
test-parallel self-test passed
```

stderr empty (0 bytes). Exit codes captured directly via `echo "exit=$?"`, never through a pipe.

**Exact delta.** Baseline + mechanism intact: `36 assertions passed, 0 failed`. After: 23. A label-by-label
`comm` of the two PASS sets shows the 13 lost assertions are exactly `(f6a) (f6b) (f6c) (f6d) (f7) (f8a)
(f8b) (f8c) (f8d) (f8e) (f8f) (f8g) (f9)` — all pool — and **zero** assertions present after but absent
before. No survivor was lost; nothing was added.

**Downstream couplings** (all still resolve — `test-parallel.js` keeps its name and both chain steps):

- `package.json`: three references — `test:parallel` (line 44) and `--self-test` in
  `test:kaola-workflow:claude` (40) and `:claude:full` (46). All intact.
- `node scripts/test-suite-registration.js` → **exit 0**, `45 test-*.js files, 42 registered, 3 exempt`.
  This is the guard (checks A and G) that the literal filed plan would have turned red.
- `scripts/test-spawn-classification.js`: no `test-parallel` reference — the removed block contained no
  spawn sites, so its expected-count map is unaffected.

## Contradicting the evidence

One minor correction to premise-960 §6, non-blocking: it states "`test-parallel.js` stays registered"
in `test-suite-registration.js`, but that file contains **no literal `test-parallel` string**.
Registration is derived from the package.json chain steps, not from a hand-listed name. The conclusion
is unchanged — the guard runs green (exit 0 above) and my edit does not touch it — but the mechanism is
not the one the premise described.

Everything else in premise-960 reproduced exactly: line 348/349 requires as described, f6–f9 at 414–464,
the (f) comment at 340–347, and the MODULE_NOT_FOUND failure mode on the literal plan.

## Outstanding

The in-tree `node scripts/test-parallel.js --self-test` still needs to run once
`scripts/run-chain-pool.js` is actually deleted. The mirror run above is the same condition and passed,
but it is not the shipped tree. That run is the implementer's or the orchestrator's, not the test
author's — a passing suite is a verdict on the implementation, and I do not grade the code my tests judge.

— tdd-guide · 2026-08-12
