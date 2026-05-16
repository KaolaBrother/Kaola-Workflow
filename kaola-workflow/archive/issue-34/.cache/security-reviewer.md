# Security Review — Issue-34 Phase 5

## CRITICAL
None.

## HIGH
None.

## MEDIUM

### M1: Sweep GC second pass checks only coordRoot lock, not legacy root lock
Location: `kaola-workflow-claim.js` sweep second pass, `fs.existsSync(lockPath(coordRoot, entry.name))`.

`migrateLegacyCoordState` moves legacy locks from `root/kaola-workflow/.locks/` to `coordRoot/kaola-workflow/.locks/`, but is only called in `cmdClaim`, not `cmdSweep`. A session with a legacy-path lock file would not be found by the coordRoot check alone. Remaining guards (heartbeat-updated `expires` field in workflow-state.md, no phase artifacts) still protect live sessions in practice, but this is a defense-in-depth gap.

Fix: `if (fs.existsSync(lockPath(coordRoot, entry.name)) || fs.existsSync(lockPath(root, entry.name))) continue;`

## LOW

### L1: State write before rename — contradictory state on rename failure
`workflow-state.md` updated to `status: closed` before `fs.renameSync`. If rename fails, source dir is left with stale closed status. Data-integrity issue, not a security vulnerability.

### L2: TOCTOU between existsSync and readFileSync in cmdFinalize
Cannot cause session-ownership bypass — wrong-session check after parse covers the race. Error handling (catch → exit 1) is correct.

### L3: Session ownership in cmdFinalize is string-comparison only (existing trust model)
`lock.session_id !== args.session` is the only check when `KAOLA_ENFORCE_PLATFORM_SESSION` is unset. Architecturally intentional for local single-operator use. Flag for future multi-tenant review.

## Phase 6 Readiness
No CRITICAL or HIGH. Phase 6 is not blocked by security findings.
