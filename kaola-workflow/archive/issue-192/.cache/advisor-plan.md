# Advisor Output — Plan Gate, issue-192

## Verdict: Plan is sound and implementable — proceed to Phase 4

Core invariant re-traced and confirmed. The reopened-archive-only case (issue archived locally as closed, reopened on GitHub): before the fix, probe sees `open` but no detector acts (no source file, not active); after the fix, 950 not probed — same outcome. Only observable delta is timed-out archive-only probes stop landing in `unresolved_closed_state`, sanctioned by AC #2.

## Three Checks for Phase 4 Implementer

**1. Delete by pattern, verify resulting expression per file — don't trust line numbers.**
The deletion target is the text `.concat(Array.from(archiveClosed))`. After removing it, confirm the chain is still a syntactically valid single expression in each of the 4 files (no dangling `.filter`, no orphaned `;`). The ports may order the `.concat` calls differently — read each before editing.

**2. Confirm `closedSet` is detector-only before prod edit.**
Grep `buildAuditReport` for every use of the `closed` set returned by `collectClosedSet`. It must only be *passed as an argument* to the five detectors. If it also appears in the returned object (e.g. `closed: Array.from(closedSet)` or a `closed_count`), shrinking the probe set silently changes output and no planned test guards it.
- If clean (as Phase 1 suggests): add one secondary assertion that `result.drift` does NOT contain issue 950 in any field, to lock D3's "no drift-output change" claim.

**3. Preserve per-forge TEST→PROD ordering in Phase 4.**
The parallelization table must NOT be read as "fire all prod tasks and all test tasks simultaneously." Correct: three independent TEST→PROD pipelines (GitHub+Codex / GitLab / Gitea) running in parallel with each other, but never prod-before-test within a forge. Subagent orchestration must preserve this ordering per forge.

## What Does NOT Block

- `unresolved_closed_state` delta under timeouts — known, sanctioned by AC #2.
- Hypothetical future cross-check detector — fix is correct for current code; out of scope.
