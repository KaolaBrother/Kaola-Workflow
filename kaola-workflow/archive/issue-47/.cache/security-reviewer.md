# Security Review: issue-47 — cmdBootstrap Changes

## Scope
`cmdBootstrap` (L1223-1279), `claimExplicitTarget`, `assertSafeSession`, `ownedActiveProject`, `runBootstrapClaim`.

## Verdict: APPROVED FOR MERGE
CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 | LOW: 1

## Findings

### [LOW] Missing --sink / --runtime validation in cmdBootstrap
`args.sink` and `args.runtime` are not validated at entry in `cmdBootstrap`. Child `cmdClaim` re-validates both, so no exploitable path exists. Breaks defense-in-depth parity with `cmdStartup`/`cmdPickNext`.
Recommended follow-up: add assert for sink and runtime at top of cmdBootstrap.

## Verified Correct
- `--target-issue` validation: assert at L1227 checks positive integer — PASS
- Session ID safety: `assertSafeSession` + `isSafeName` rejects dangerous chars — PASS
- classifierScript path: `path.join(__filename dirname, literal)` — not user-controlled — PASS
- Child process spawning: all via `execFileSync(process.execPath, [...])`, no shell — PASS
- Exit code handling: `process.exitCode = 1` (not throw or process.exit) — PASS
- JSON no-target output: only `{project:null, issue:null, verdict, claim, session}` — PASS
- `runBootstrapClaimFirstAvailable` fully removed — PASS
