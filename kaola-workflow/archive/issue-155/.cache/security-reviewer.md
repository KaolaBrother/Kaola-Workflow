# Security Review — issue-155

## Verdict: No CRITICAL or HIGH findings. Phase 6 unblocked.

The change is a security strengthening: converts fail-open to typed refusal, improving OWASP A01 (Broken Access Control) posture.

## Clean findings

- **Command injection via issue numbers — NOT PRESENT.** Issue numbers flow through `parseInt` → `Number.isFinite` → `execFileSync` array args (no shell spawn). Structurally safe.
- **Path traversal — NOT PRESENT.** Input-derived paths use validated positive integers; `isSafeName` gate blocks path separators and special chars.
- **Hardcoded secrets — NONE.** No credentials in modified sections.
- **Error-message leakage — NONE.** `reasoning` strings contain only validated integers + static text. Raw CLI errors swallowed via `catch (_)`.
- **OFFLINE bypass — NOT exploitable.** Requires local process control (which already supersedes in-process checks); documented user behavior.
- **`probeIssueState` / `!OFFLINE && unavailable` guard — SAFE.** Adds deny path only; cannot grant a claim the prior code would have refused.

## Informational (LOW, non-blocking)

- Edition parity drift in `claimProject` ordering (GitHub probe before existing-folder check; GitLab/Gitea after) — not a security issue, same finding as code reviewer.

## Corroborating

- Vendored copies byte-identical to canonical (verified via diff).
- `node scripts/simulate-workflow-walkthrough.js` exits 0.
