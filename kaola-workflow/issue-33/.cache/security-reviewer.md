# Security Review — issue-33
Generated: 2026-05-16

## Files Reviewed
- scripts/kaola-workflow-sink-merge.js (mainRootFromCoord, process.chdir, process.on('exit'), KAOLA_WORKFLOW_DEBUG_CWD probe)

## CRITICAL
None.

## HIGH
None.

## MEDIUM
None.

## LOW / Informational

**L1 — KAOLA_WORKFLOW_DEBUG_CWD controls a write path (informational, not a vulnerability)**
Lines 166-171. Path from env var, content is `process.cwd()` (benign). No privilege boundary: the principal setting the env var already controls the process. No fix required.

**L2 — TOCTOU between existsSync and writeFileSync (informational)**
Narrow race; no exploitable boundary. Worst case is silent ENOENT caught by surrounding try/catch. No fix required.

**L3 — Silent catch blocks (code-quality, not security)**
Multiple `catch (_) {}` blocks. Violates project's coding-style rule. Not a security issue.

## Specific Questions Answered
1. `KAOLA_WORKFLOW_DEBUG_CWD` path traversal: Not a vulnerability — same-principal, benign content.
2. `process.chdir()` with attacker-controlled path: Not a risk — coordRoot from env or git subprocess, no shell, wrapped in try/catch.
3. `existsSync`/`writeFileSync` TOCTOU: Sufficient for purpose; no exploitable boundary.
4. `process.on('exit')` safety: Safe — internal runtime event, synchronous handler, cannot be triggered by external input.

## Positive Findings
- All external commands use `execFileSync` (not shell strings) — injection structurally impossible
- `isSafeName` blocks `/`, `\`, `\0`, `.`, `..` in project names before path concatenation
- `args.branch` validation rejects leading `-`, null bytes, `.`, `..` before git usage

## Verdict
No CRITICAL, HIGH, or MEDIUM security issues. Changes are safe to ship.
