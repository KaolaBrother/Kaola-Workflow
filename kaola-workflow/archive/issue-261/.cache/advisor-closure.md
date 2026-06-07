# Closure Decision — issue-261

## Deferred items found in phase artifacts
- S1 (security-review, MEDIUM, non-blocking, action=document status=resolved): the Phase-6 Staging Guard interpolates a render-time `{project}` into a `grep -E` pattern without the `[A-Za-z0-9_-]` sanitization that `projTag` gets. Fail-open only under a pathological project name AND an off-path broad `git add`, behind two string-comparison script layers (barrier-check + cmdFinalize) that never use regex. Recorded in CHANGELOG.
- S2/S3 (security): pre_existing/by-design, no action.
- G1 R3 (code-review): pre_existing/document — phase6 bash guard has no executable harness (consistent with all phase6 bash blocks).

## Advisor consult
- #261 is closeable: all of its AC (AC1/AC2/AC3/AC4) are met; the 4 script-enforced gates pass; npm test green ×4 editions; both reviewers verdict:pass findings_blocking:0.
- S1 is a recorded NON-BLOCKING follow-up. The correct fix is to sanitize the `{project}` render token at its source (broader than #261's archive-pollution scope), so it belongs in a new issue, not in-band.
- Creating a GitHub issue is outward-facing → requires explicit user permission (Closure Decision Gate + outward-action rule). NOT auto-created.

## Decision
- CLOSE #261 (workflow goal; AC satisfied).
- S1 follow-up: file pending user OK. Ready-to-file title/body surfaced in the final orchestrator message. Not dropped (CHANGELOG commits to its existence).
