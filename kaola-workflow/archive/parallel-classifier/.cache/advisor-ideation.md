# Advisor Ideation Gate: parallel-classifier

## Ruling

Approach A is sound — commit to it. Fix bugs below in Phase 3 task definitions.

## Critical Bugs in Proposed Router Snippet

**Bug 1 — exit 0 terminates router:**
`[ "$KAOLA_WORKFLOW_OFFLINE" = "1" ] && exit 0` kills the whole `/workflow-next` session under OFFLINE.
Fix: use an `if ... fi` guard block around the scan loop, not `exit`.

**Bug 2 — Yellow not accepted:**
`grep -q '"verdict":"green"'` drops yellow. Issue spec says `if v in {green, yellow}: claim c, break`.
Fix: accept both `green` and `yellow` in the pick condition.

## Spec Gaps to Resolve in phase2-ideation.md

**Gap 3 — Claimed-set filtering missing:**
Issue spec line 3: `candidates = open issues − claimed`. The snippet iterates every open issue without reading `kaola-workflow/.locks/*.lock` to subtract already-claimed ones. Sibling sessions' claims won't be visible.
Fix: pass claimed issue numbers from lock files into the candidate scan; skip claimed ones before classifying.

**Gap 4 — Step 0 vs Step 3 sequencing conflict:**
Step 0 already runs `claim.js claim` when `KAOLA_SESSION_ID` is set. The classifier scan is a *pre-claim* decision (choose what to claim), not post-claim. If scan runs in Step 3 after Step 0's claim, the sessions fight over the same work.
Fix: scan must occur BEFORE Step 0's claim, or Step 0 must be deferred until a candidate is chosen.
Design decision to record in phase2-ideation.md: candidate scan runs first in Step 0, then claim follows for the selected issue.

**Gap 5 — depends-on resolution fragile:**
Using `gh pr list --search "fixes #N"` misses commit-closed issues.
Fix: use `gh issue view N --json state,closedAt` — reliable for both PR-close and commit-close.

## Phase 3 Plan-Level Notes (not blockers)

**Note 6 — N+1 gh calls:**
Batch via `gh issue list --json number,title,body,labels,state` — returns everything the classifier needs in one call. Cache it and pass to classify per-candidate in-process.

**Note 7 — 9-line headroom:**
Section header + fences + 7 lines + explanation = ~11 actual lines. Do `wc -l` after dry-write. If exceeded, raise cap to 230 (not 225) with matching `validate-workflow-contracts.js:151` update — all in one diff.

**Note 8 — Epic Case 6 concrete sub-tests (name them now):**
- 6A: green → selected
- 6B: red (file overlap from claimed phase3-plan.md) → skipped
- 6C: yellow (shared infra) → selected + "shared-infra warning" appended to candidate's phase1-research.md
- 6D: blocked (depends-on:#N open) → skipped
- 6E: OFFLINE + depends-on:#N label → blocked (conservative)
- 6F: claimed-set filtering — issue already in lock file → skipped before classify

**Note 9:**
`Co-active Leases` section in workflow-next.md should reference the candidate scan so the design is self-consistent.

## Date
2026-05-15T08:30:00Z
