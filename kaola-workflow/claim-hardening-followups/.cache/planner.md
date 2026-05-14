# Planner: claim-hardening-followups

## Overview

Four small, independent hygiene fixes spanning one production file and one test file.
No new dependencies, new tests, or architectural changes. Single PR.

## Item 1 Approaches — updateSinkLease replace parity

### Option 1A: Function-form callback (recommended)
- Change both `.replace()` calls: `sinkBlock` → `() => sinkBlock`, `'\n' + leaseBlock.slice(1)` → `() => '\n' + leaseBlock.slice(1)`
- Pros: matches cmdPatchBranch line 387 idiom, minimal diff, categorically removes `$`-expansion risk
- Cons: none
- Risk: Low | Complexity: Trivial

### Option 1B: Escape `$` in replacement string
- Pre-process with `.replace(/\$/g, '$$$$')`
- Pros: keeps string-form
- Cons: less idiomatic, error-prone, more code
- Risk: Low-medium | Complexity: Low

### Option 1C: Sanitize at source (validate all fields upstream)
- Add guards to pr_url, expires, sink, etc.
- Pros: defense in depth
- Cons: scope creep, would break legitimate inputs (`:` in ISO times, `/` in URLs)
- Risk: Medium | Complexity: High

**Recommendation: 1A**

## Item 2 Approaches — Test 8D assertion tightening

### Option 2A: Two sequential asserts (recommended)
- `assert(entry8d != null, '...')` then `assert(entry8d.drift.includes(...), '...')`
- Pros: clear failure messages, pins contract, matches hand-rolled assert style
- Cons: none
- Risk: Low | Complexity: Trivial

### Option 2B: Single combined assert (no disjunction)
- `assert(entry8d != null && entry8d.drift.includes(...), '...')`
- Pros: one line
- Cons: combined message hides which sub-condition failed
- Risk: Low | Complexity: Trivial

### Option 2C: Pin exact drift array with deepStrictEqual
- Inconsistent with hand-rolled assert style, over-pins
- Risk: Medium | Complexity: Low

**Recommendation: 2A**

## Item 3 Approaches — Test 8E label correction

### Option 3A: Update inline comment only (recommended)
- `// 8E: claim-after-release — second claim must refresh issue_number and claimed_at (M1 probe)`
- Pros: zero behavioral change, exactly what issue asks
- Risk: None | Complexity: Trivial

### Option 3B: Also update assertion messages
- Slight scope expansion; messages today already describe the specific invariant
- Risk: Very low | Complexity: Trivial

**Recommendation: 3A**

## Item 4 Approaches — runClaim stderr surfacing

### Option 4A: Switch to spawnSync, throw on non-zero with stderr (recommended)
- Matches spawnSync pattern already used at lines 1105, 1145, 1218, 1244
- Throw includes `r.status`, `r.stdout`, `r.stderr` in message
- Pros: consistent with rest of file, surfaces both streams on failure
- Risk: Very low | Complexity: Trivial

### Option 4B: try/catch execFileSync, extract err.stderr
- Keeps execFileSync
- Cons: inconsistent with rest of file, brittle Buffer/string handling
- Risk: Low-medium | Complexity: Low

### Option 4C: Shared helper utility
- Scope creep, YAGNI
- Risk: Medium | Complexity: Medium

**Recommendation: 4A**

## Implementation Order

1. Item 3 (comment) — zero risk
2. Item 1 (production change) — two-line security parity
3. Item 2 (test tightening) — independent
4. Item 4 (test diagnostics) — independent

Validate after all four: `node scripts/simulate-workflow-walkthrough.js` → exit 0

## Commit Strategy (open question)

Planner recommends: one PR, four commits:
- Item 1: `fix: convert updateSinkLease to function-form replace (security parity)`
- Item 2: `test: tighten 8D assertion to fail on missing entry`
- Item 3: `test: correct 8E label to claim-after-release`
- Item 4: `test: surface stderr in runClaim helper`

## Out of Scope

- updateLeaseInPlace string-form replaces (lines 147-148) — ISO dates, very low risk
- New unit tests for updateSinkLease with `$&` in values
- True re-claim test (active lock re-claimed by same session)
- Shared runNode helper refactor
- Conversion to Node's assert module
- CHANGELOG/README changes
