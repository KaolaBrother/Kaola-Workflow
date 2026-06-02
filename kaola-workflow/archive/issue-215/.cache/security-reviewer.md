# Security Review: Issue #215 — fence-aware sectionBody()

## Files reviewed
- scripts/kaola-workflow-classifier.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js (byte-identical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js (logic-identical)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js (logic-identical)

## MEDIUM — Unterminated pre-Scope fence causes path under-count (false GREEN)

inFence/fenceFamily state is shared across heading-seek and body-collect loops. If a fence opens in a section BEFORE ## Scope and is never closed, inFence stays true through the seek loop → ## Scope never matched → i reaches EOF → returns ''.

False-GREEN chain: for fast projects, fastScope is the only path source in combined. When sectionBody returns '', claimedPaths is empty → no overlap found → verdict GREEN. Two sessions can be cleared to write the same file.

Verified: pre-#215 input (## Status / unterminated ```sh / ## Scope / - Write Set:) → path COUNTED. Post-#215 same input → returns '', path DROPPED.

Severity: MEDIUM (not HIGH/CRITICAL — unreachable on well-formed output; ## Status is the only pre-Scope section and never opens a fence; impact is write-collision, not RCE/exfil/privesc).

Fix direction (not implemented): fail open rather than fail silent. If heading never matched while inFence===true at EOF, fall back to scanning full content or reset fence state at the heading-search boundary. Returning '' is the one outcome that flips the safety bias the wrong way.

New test needed alongside fix: pre-Scope unterminated fence case (assert verdict RED, not GREEN).

## Cleared items
1. ReDoS — SAFE. fenceRe anchored at ^, linear-time, two alternatives begin with different chars (no ambiguous overlap). Per-line matching on trimmed strings.
2. Injection / path traversal — SAFE. Change only decides which lines are included in slice. No line content interpreted as path/command here. extractFilePaths/isSafeName unchanged.
3. Safety invariant — one regression (see MEDIUM). Unterminated fence INSIDE ## Scope causing over-inclusion is acceptable (false RED direction).
4. Hardcoded credentials/secrets — NONE in any of the 4 modified files.
5. Scope — CONFIRMED. No new I/O, network, or auth paths. Content arrives as string argument.

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 1     |
| LOW      | 0     |

Verdict: APPROVE (MEDIUM does not block per Phase 5 rules; logged as follow-up)
