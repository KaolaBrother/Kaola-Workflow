# Security Review: issue-108

## Scope
New archive-guard code in:
- `kaola-gitlab-workflow-sink-merge.js` (runDirectMerge early-exit, postMergeCleanup guard)
- `kaola-gitlab-workflow-claim.js` (cmdSinkFallback archive check)

## Note: isSafeName Implementation
The actual isSafeName uses a denylist (`!includes('/')`, `!includes('\')`, `!includes('\0')`, `!== '.'`, `!== '..'`) — no length cap, no allowlist. Review is based on the real implementation.

## Findings

| Check | Severity | Verdict |
|-------|----------|---------|
| Path traversal via args.project | — | No finding — isSafeName blocks all traversal chars |
| isSafeName missing length cap | LOW | Robustness gap only; ENAMETOOLONG bubbles as exit 1 |
| Stderr information disclosure | — | No finding — only safe project name emitted |
| TOCTOU on existsSync pair | LOW | Informational; no security boundary crossed |
| Shell injection in path construction | — | No finding — path.join with validated input; no shell exec |
| Security gate bypass / privilege escalation | — | No finding — finalValidationPassed runs before archive guard |
| AND vs OR inconsistency across guard sites | LOW | Consistency risk; fail-open for sink-merge if both dirs coexist (vanishingly rare due to atomic rename) |

## Recommendation
Unify guard predicates to fail-closed `!live || archive` for consistency. Addressed via code comment (AND predicate rationale documented).

## Overall: No CRITICAL or HIGH findings
