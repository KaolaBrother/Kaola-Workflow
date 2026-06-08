## finalize evidence

CHANGELOG.md entry written under [Unreleased] > Fixed for issue #300.

Entry covers:
- forge-parity port of checkDispatchAttestations into GitLab + Gitea sink-merge
- archive-first candidate ordering, between buildClosureReceipt and checkClosureInvariants
- RED→GREEN test assertions in test-gitlab-sinks.js Test 22 + test-gitea-sinks.js Test 22
- npm test green across all four editions
- G1 code-review: verdict: pass / findings_blocking: 0
- #286 R2 provenance documented

No doc-updater needed: closure_receipt schema/enums in docs/api.md are unchanged (field was already documented; this populates an already-documented field on the forge runtime path).
