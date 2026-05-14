# Code Review: parallel-classifier

## HIGH Findings

**[HIGH-1] classify() function is 92 lines — exceeds 50-line limit**
File: `scripts/kaola-workflow-classifier.js:130–221`
Fix: Extract lock-scanning loop (lines 162–200) into `scanClaimedOverlap(candidateAreas, candidateAreaLabels, claimedLocks, root)` returning `{hasDirectOverlap, hasSharedInfraOverlap, hasAreaLabelOverlap, directOverlapArea, sharedOverlapArea}`. Also `cmdClassify()` is 56 lines — acceptable near-miss, or split OFFLINE branch to helper.

**[HIGH-2] Step 0 bash block missing CLAIM_JS + KAOLA_SESSION_ID guards**
File: `commands/workflow-next.md` Step 0 bash block
`node "$CLAIM_JS" sweep` runs unconditionally (no `[ -f "$CLAIM_JS" ]`). The claim call runs when KAOLA_PICK is set but no outer `[ -n "$KAOLA_SESSION_ID" ]` guard, so an empty KAOLA_SESSION_ID triggers claim.js assert → exit 1 error.
Fix: wrap entire block with:
```bash
if [ -f "$CLAIM_JS" ] && [ -n "$KAOLA_SESSION_ID" ]; then
  node "$CLAIM_JS" sweep
  # ... rest
fi
```

## MEDIUM Findings

**[MEDIUM-1] `project-name` subcommand not implemented in kaola-workflow-roadmap.js**
Silent degradation to `issue-${N}` fallback. Acceptable for now — documented in Out-of-Scope.

**[MEDIUM-2] gh fetch failure defaults to green — overly optimistic on network errors**
`classify --issue N` when gh fails returns `{verdict: 'green', ...}`. More conservative would be `red` or `unknown`.

## LOW Findings

**[LOW-1] Line cap at 235 with only 3 lines headroom** — consider raising to 240.

**[LOW-2] `try { body = field(content, 'body'); } catch (_) {}` is dead defensive code** — `field()` cannot throw.

## Verified Correct
- Exit codes: 0 (verdict), 1 (error), 2 (claimed) ✓
- OFFLINE guard: if/fi, no exit 0 ✓
- Both green AND yellow accepted in router ✓
- Epic Case 6 sub-tests 6A-6F+6E' all present ✓
- install.sh copy loop ✓
- validate-workflow-contracts.js assertions ✓
- No console.log or debug statements ✓
- issue_number type safety ✓

## Status
WARNING — 2 HIGH findings to fix before Phase 6
