# Advisor — Plan Gate (issue-210)

Plan sound and primary-source-verified. This is the LAST pre-implementation gate;
implement after this, don't gate again until the done-check.

## Catch 1 — TDZ confirmed (architect was right)
`assertPolicyAllowed`'s body dereferences `const repairState` (github L167 /
gitlab L271 / gitea L278) at call time → any call above that line throws in the
temporal dead zone. Split: sentinel asserts at top (hoisted helpers + string path
only); the two #210 `assertPolicyAllowed` tests appended at the BOTTOM, below the
require + existing policy cluster.

## Catch 2 — NEW gap: KAOLA_DELEGATION_POLICY is never assigned
The old Write-order step 1 ("Ask the user… hold policy in-session") was what bound
the variable. Removing it leaves the printf expanding `"$KAOLA_DELEGATION_POLICY"`
with nothing set → writes `delegation_policy:` (empty) → repair-state treats it as
ABSENT, not `delegate`. That misses AC line 2 ("records a deterministic delegation
policy, defaulting to `delegate`").
**Fix (adopted):** Write-order step 1 becomes an explicit assignment —
`Set KAOLA_DELEGATION_POLICY=delegate` (use `local-authorized` only on the user's
explicit request). Keeps every sentinel intact; makes the default deterministic.
Add `KAOLA_DELEGATION_POLICY=delegate` as a 7th include-sentinel to lock it.

## Implementation-time checks (verify while editing, per forge)
- Confirm `assertIncludes`/`assertNotIncludes` helpers EXIST in the gitlab/gitea
  validators before using them; research showed those files use raw
  `assert(read(file).includes(needle), msg)` + a `delegationNegativeChecks` array.
  If the helper isn't defined there, use the raw form (and `assert(!read(...).includes(...))`
  for the negative guards).
- Run EACH forge's validator immediately after its prose edit (RED→GREEN per forge),
  not just the final `npm test` — a sentinel mismatch then points at one file.

## Final gate (both — they check different things)
- `npm test` → all 4 suites exit 0 (nothing broke).
- `git status --porcelain` (NOT `git diff --name-only`, which won't show untracked
  `issue-210/` artifacts): the only TRACKED source modifications must be the 9
  expected files; none of package.json / `commands/` / byte-synced scripts /
  `plugins/kaola-workflow/scripts/*` may appear (nothing was touched).

## Note
The new `delegate + tool-unavailable` policy test nearly duplicates the existing
L202-204 assertion — keep it as a labeled regression lock, but the genuinely NEW
coverage is the `local-authorized` explicit-fallback test. Don't count the delegate
one as the new-path proof.
