# Closure Decision — issue-161

## Trigger
Closure Decision Gate scan found one deferred item requiring a decision:
**AC5 ("stale closed issues cleaned by audit command")** is not satisfied by
this issue. The audit command is built in issue #165.

## Advisor Status
Advisor was temporarily overloaded during this gate. Decision proceeds from
Phase 1 research documentation, which is authoritative and unambiguous.

## Evidence From Phase 1 Research
Phase 1 `phase1-research.md` explicitly documents:

> **Critical constraint: AC5 is a dependency on #165**
> - The acceptance criteria include: "stale closed issues cleaned by audit command"
> - The audit command is built in issue #165 (kaola-workflow-audit)
> - Close #161 after all follow-ups ship (AC5 satisfied when audit command exists)

This is a documented, intentional deferral — not an omission.

## Decision

**Do not close issue #161 via sink-merge.**

Rationale:
- AC5 cannot be verified until #165 ships the audit command.
- Phase 1 explicitly instructs: "Close #161 after all follow-ups ship."
- AC1–AC4 are fully satisfied by this issue's implementation.
- The `--issue` flag in `sink-merge.js` is optional (lines 56, 229–231);
  omitting it merges the feature branch and archives the workflow folder
  without closing or commenting on the remote issue.

## Action Plan
1. Run `cmdFinalize` (Step 8b) with the workflow folder only — archive
   atomically; set `status: closed` + `step: complete` in archived state.
2. Run `sink-merge` **without** `--issue 161` to merge the feature branch
   and delete it without touching the remote issue.
3. Post a manual comment on GitHub issue #161 with: what was delivered
   (AC1–AC4), the final commit hash, and that AC5 is deferred to #165.
4. Keep issue #161 open until #165 ships.

## Roadmap Implication
Phase 6 Step 7 will delete `kaola-workflow/.roadmap/issue-161.md` and
regenerate `ROADMAP.md`. The per-issue file exists to track active workflow
work; its deletion is correct even though the GitHub issue stays open —
the implementation work is done.

## Status
DECIDED — no user input required. Advisor recommendation is inferred from
Phase 1 research, which was explicitly written to cover this case.
