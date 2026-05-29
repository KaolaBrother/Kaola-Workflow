# Advisor Ideation Gate — issue-185

## Verdict

Option A (`Math.min(n, 600000)` inline) is correct. No approach missed. Recommendation is sound. Option-C-passes-test-while-being-wrong insight confirmed as a real trap.

## Execution guards to bake into Phase 3 plan

### 1. Use an immediate-success mock (never a hang shim)
Post-fix the internal timeout is 600000ms. If the mock hangs, the test waits 10 min and blows the harness's 60000ms `spawnSync` cap → false failure. The success path never waits on the timeout — that's the whole point.

### 2. Verify RED pre-fix before claiming the test is a regression guard
Run the new test against unfixed code first. Pre-fix failure mode: process crash (exit≠0) OR misroute to non-`closed_remote` state depending on whether the exec wrapper catches the ERR_OUT_OF_RANGE throw. Either is a valid RED — confirm it. A test accidentally green pre-fix guards nothing.

### 3. Byte-identity is a separate gate
The walkthrough does NOT run `validate-script-sync.js`. Edit Sites 1+3 and 2+4 with identical text, then run `node scripts/validate-script-sync.js` explicitly.

### 4. Confirm exactly 6 sites before editing
Run `grep -rn KAOLA_GH_REMOTE_TIMEOUT_MS` across the repo to rule out stragglers. The code-explorer was thorough but a quick grep is cheap insurance.

### 5. For gitlab/gitea: confirm test path invokes `remoteTimeoutMs()`
The ERR_OUT_OF_RANGE check was generic Node behavior. Verify the forge exec wrapper actually passes the timeout through so RED→GREEN holds in the forge test suites.

## Scope line (reaffirmed)
No `isFinite` swap, no named constant, no IIFE-into-helper refactor. Hold exactly what the planner drew.
