evidence-binding: n9-impl-sink-idem-427 234edbc6a22b
non_tdd_reason: defensive guard — probe-before-close idempotency for already-closed issues; regression-green four-chain suite verifies no regressions
regression-green

## Task

Add a probe-before-close guard in `kaola-workflow-sink-merge.js` (and its three edition ports) so that if cmdFinalize already closed the issue before sink-merge runs, sink-merge skips the redundant close call rather than trying and receiving a guaranteed exit-1 error.

## Change Summary

Added a pre-close probe (`probeIssueClosed`) in the primary issue-close arm (the `else` branch of `if (keepIssueOpen)`) of all four sink-merge files. The guard:

1. Probes the issue state BEFORE attempting `gh issue close` / `forge.closeIssue()`.
2. If already closed, sets `remoteIssueClosed = 'already_closed'` and logs a message to stderr.
3. If open (or probe unavailable/offline), falls through to the existing try/catch close logic (including the existing catch-side probe for idempotency after a crash mid-run).

The existing catch-side probe-in-catch logic (#396.5) is retained as a second defense layer for crash-resume scenarios.

## Files Changed

- `scripts/kaola-workflow-sink-merge.js` — primary GitHub edition
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — byte-identical Codex twin
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — GitLab forge port (uses `forge.closeIssue`)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — Gitea forge port (uses `forge.closeIssue`)

## Byte-Identical Twin Verification

```
diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
```
Exit code 0, empty output.

## Verification Commands and Results

Baseline (before change): all four chains green (exit 0 — confirmed by prior completed tasks in session).

After change:
- `npm run test:kaola-workflow:claude` — exit 0
- `npm run test:kaola-workflow:codex` — exit 0
- `npm run test:kaola-workflow:gitlab` — exit 0
- `npm run test:kaola-workflow:gitea` — exit 0
