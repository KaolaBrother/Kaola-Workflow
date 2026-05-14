# Phase 2 - Ideation: claim-hardening-followups

## Approaches Evaluated

### Item 1 — updateSinkLease replace parity

#### Option 1A: Function-form callbacks (selected)
- Summary: Change both `.replace()` calls in `updateSinkLease` to use arrow-function second args: `() => sinkBlock` and `() => '\n' + leaseBlock.slice(1)`
- Pros: matches `cmdPatchBranch` line 387 idiom exactly; categorically removes `$&`/`$1` expansion risk; minimal two-line diff
- Cons: none
- Risk: Low
- Complexity: Trivial

#### Option 1B: Escape `$` in replacement string
- Summary: Pre-process replacement strings with `.replace(/\$/g, '$$$$')`
- Pros: keeps string-form
- Cons: less idiomatic, error-prone, more code
- Risk: Low-medium
- Complexity: Low

#### Option 1C: Sanitize at source
- Summary: Add guards upstream to reject `$`-containing project/session_id values
- Pros: defense in depth
- Cons: scope creep, would break legitimate inputs; out of scope
- Risk: Medium
- Complexity: High

### Item 2 — Test 8D assertion tightening

#### Option 2A: Two sequential asserts (selected)
- Summary: `assert(entry8d != null, '8D: ...')` then `assert(entry8d.drift.includes(...), '8D: ...')`
- Pros: clear failure messages, pins null-safety contract, matches hand-rolled assert style
- Cons: none
- Risk: Low
- Complexity: Trivial

#### Option 2B: Single combined assert
- Summary: `assert(entry8d != null && entry8d.drift.includes(...), '...')`
- Cons: combined message hides which sub-condition failed
- Risk: Low
- Complexity: Trivial

### Item 3 — Test 8E label correction

#### Option 3A: Update inline comment only (selected)
- Summary: Change line 1180 comment to `// 8E: claim-after-release — second claim must refresh issue_number and claimed_at (M1 probe)`
- Pros: zero behavioral change, exactly what issue asks
- Risk: None
- Complexity: Trivial

#### Option 3B: Also update assertion messages
- Summary: Slight scope expansion; current messages already describe the specific invariant
- Risk: Very low
- Complexity: Trivial

### Item 4 — runClaim stderr surfacing

#### Option 4A: Switch to spawnSync (selected)
- Summary: Replace `execFileSync` call in `runClaim` with `spawnSync`; throw on non-zero with status + stdout + stderr
- Pros: matches spawnSync pattern already used at lines 1105, 1145, 1218, 1244; surfaces both streams on failure; consistent
- Cons: none
- Risk: Very low
- Complexity: Trivial

#### Option 4B: try/catch execFileSync
- Summary: Keep execFileSync, catch thrown Error, extract err.stderr
- Cons: inconsistent with rest of file, brittle Buffer/string handling
- Risk: Low-medium
- Complexity: Low

## Advisor Findings

All four recommended approaches (1A/2A/3A/4A) confirmed sound and match project idioms.

**Commit strategy override**: ONE commit at Phase 6, not four. Matches established workflow pattern (claim-hardening was one commit for six fixes). Message: `fix: claim-hardening follow-ups (updateSinkLease + test hygiene)` (closes #11).

**Three empirical guards for Phase 3 task list**:
1. Run suite baseline before tightening 8D to confirm it is currently GREEN. If tightened `entry8d != null` fails after the change, route to tdd-guide (cmdStatus may be dropping the entry).
2. `grep -n "execFileSync" scripts/simulate-workflow-walkthrough.js` before editing — if runClaim is the only call site, drop `execFileSync` from the destructured import; otherwise leave it.
3. Test 8E is the existing regression guard for Item 1 (updateSinkLease "Sink already exists" path). After Item 1 change, 8E must still pass on the same lockData shape. No new test needed.

**Out of scope reaffirmed**: updateLeaseInPlace lines 147–148 (ISO dates, no `$` patterns ever), shared runNode helper, new `$&`-injection unit test, test file decomposition (M-2).

## Selected Approach

- **Item 1**: 1A — function-form callbacks `() => sinkBlock` and `() => '\n' + leaseBlock.slice(1)` (security parity with cmdPatchBranch)
- **Item 2**: 2A — two sequential asserts: presence check first, then drift content check
- **Item 3**: 3A — comment-only update at line 1180 to prepend "claim-after-release — "
- **Item 4**: 4A — spawnSync with throw on non-zero, surfacing status + stdout + stderr

Implementation order: Item 3 (zero risk) → Item 1 (production change) → Item 2 (test tightening) → Item 4 (test diagnostics).

## Out of Scope (explicit)

- `updateLeaseInPlace` string-form replaces (lines 147–148): ISO dates, internally generated, no `$` patterns
- New unit tests for `updateSinkLease` with `$&` in values
- True re-claim test (active lock re-claimed by same session)
- Shared runNode helper refactor
- Conversion to Node's assert module
- Test file decomposition

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
