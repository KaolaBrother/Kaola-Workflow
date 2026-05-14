# Phase 1 - Research / Discovery: claim-hardening-followups

## Deliverable

Four hygiene fixes deferred from the claim-hardening security pass (issue #10):

1. `updateSinkLease` (kaola-workflow-claim.js lines 133–137): convert two string-form
   `.replace()` calls to function-form callbacks to prevent `$&`/`$1` JS expansion
   when `lockData.project` or `lockData.session_id` values contain those sequences.
2. Test 8D (simulate-workflow-walkthrough.js lines 1112–1115): tighten assertion to
   fail loudly when `entry8d` is null, instead of silently passing.
3. Test 8E (simulate-workflow-walkthrough.js line 1180): correct comment label from
   "re-claim" framing to "claim-after-release".
4. `runClaim` helper (simulate-workflow-walkthrough.js lines 1062–1077): surface stderr
   on failure by switching from `execFileSync` to `spawnSync`.

## Why

Security parity: item 1 closes a theoretical `$&`/`$1` replacement expansion path in
`updateSinkLease` that was flagged during the Phase 5 security review. The cmdPatchBranch
function was already fixed; this brings updateSinkLease to the same standard.

Test correctness: items 2–4 make the test suite more reliable — item 2 prevents a silent
false pass, item 3 makes the test's intent accurate, item 4 shortens the debug cycle when
a runClaim invocation fails.

## Affected Area

- `scripts/kaola-workflow-claim.js` — `updateSinkLease` function (lines 113–139)
- `scripts/simulate-workflow-walkthrough.js` — tests 8D/8E + runClaim helper

## Key Patterns Found

1. Function-form replace model: `cmdPatchBranch` line 387 — `content.replace(/regex/m, () => 'branch: ' + args.branch)`; use `() => sinkBlock` and `() => '\n' + leaseBlock.slice(1)` for items 1a and 1b.
2. Hand-rolled assert pattern (lines 10–13): `assert(condition, 'message')` throws Error on false.
3. `spawnSync` already imported at line 5 of the test file — no new import needed for item 4.

## Test Patterns

- Framework: hand-rolled assert (no external framework)
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: mkdtempSync isolation, subprocess via execFileSync/spawnSync, assert() calls
- Validation command: `node scripts/simulate-workflow-walkthrough.js` → exit 0

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — disables `gh` calls in all tests
- `HOME: workdir` — isolates machine-id reads/writes in tests

## External Docs

None — pure Node.js built-in behavior (String.prototype.replace second-argument semantics).
Docs-lookup N/A: internal patterns sufficient.

## GitHub Issue

KaolaBrother/Kaola-Workflow#11

## Completeness Score

10/10

- Goal clarity: 3/3 (four concrete line-level changes)
- Expected outcome: 3/3 (test passes, security parity, diagnostic improvement)
- Scope boundaries: 2/2 (two files, four items, no architectural change)
- Constraints: 2/2 (must not break existing Epic Cases 1–8; updateLeaseInPlace out of scope)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | pure Node.js built-ins; no external library or framework behavior needed |

## Notes / Future Considerations

- `updateLeaseInPlace` (lines 147–148) also has string-form replaces with `lockData.expires`
  and `lockData.last_heartbeat` (ISO dates). These are internally generated and low-risk.
  Not in scope for #11 but noted for a future hardening pass.
