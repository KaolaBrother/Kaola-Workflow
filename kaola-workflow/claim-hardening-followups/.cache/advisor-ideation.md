# Advisor Ideation Gate: claim-hardening-followups

## Verdict

Plan is sound. Approaches 1A/2A/3A/4A all match project idioms and issue scope.
No missed approaches. Risks are accurately characterized.

## Empirical Guards for Phase 3 Task List

1. **Item 2 baseline**: Run suite once on current state before tightening 8D to confirm
   baseline GREEN. If tightened `entry8d != null` fails after the change, route to tdd-guide —
   cmdStatus may be dropping the entry rather than surfacing it (Phase 5 said it doesn't, but
   verify empirically before assuming).

2. **Item 4 import cleanup**: `grep -n "execFileSync" scripts/simulate-workflow-walkthrough.js`
   before editing. If `runClaim` is the only call site, drop `execFileSync` from the destructured
   import; otherwise leave it. Make this a task step, not a post-hoc follow-up.

3. **Item 1 regression coverage**: Test 8E exercises the `updateSinkLease` "Sink already exists"
   path being changed. After 1A, 8E must still pass on the same lockData shape. That's the
   existing regression guard — no new test needed.

## Commit Strategy (overrides planner recommendation)

One commit, not four. Matches the established workflow pattern (claim-hardening = one commit for 6
fixes). Commit at Phase 6 with message:
`fix: claim-hardening follow-ups (updateSinkLease + test hygiene)`
Closes #11.

## No Missed Approaches

1B ($-escaping) and 4B (try/catch execFileSync) correctly rejected as less idiomatic.
1C (upstream validation) correctly out of scope.

## Out of Scope Reaffirmed

- `updateLeaseInPlace` lines 147-148 (ISO timestamps, no `$` patterns ever)
- Shared runNode helper
- New `$&`-injection unit test (file separately if desired)
- Test file decomposition (M-2 — already excluded per closure decision)

## Date
2026-05-15T04:15:00Z
