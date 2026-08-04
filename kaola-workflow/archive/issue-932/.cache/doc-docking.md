# Documentation docking — issue-932

Verdict: **DOCKED**

Done inline rather than dispatched to `doc-updater`. Reason stated rather than assumed: every
section this change could touch is a structured API/behaviour surface, and the standing caution for
that role is that it fabricates schema unless handed exact text or real `--json` output. The sweep
below was run against the source and against live command output, and the one prose artifact owed
(the CHANGELOG entry) was written from the shipped diff.

## Changed files reviewed

| file | user-visible? | doc consequence |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | yes — behaviour change on the failed-claim path | CHANGELOG entry |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | same, byte-identical copy | covered by the same entry |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same, hand-port | covered by the same entry |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | same, hand-port | covered by the same entry |
| `scripts/simulate-workflow-walkthrough.js` | no — test artifact | none |
| `scripts/test-bundle-claim.js` | no — test artifact | none |
| `scripts/test-forge-claim-rollback-scoping.js` | no — new test artifact | none |
| `package.json` | no — test wiring only, 5 chain entries | none |
| `CHANGELOG.md` | the entry itself | — |

## Documents checked

- **`CHANGELOG.md`** — UPDATED. New `## [Unreleased]` / `### Fixed` section (none existed; `9.5.3`
  was at the top). Written from the shipped diff, not from intent: it states the effect, and names
  the three things the change is NOT (a reserved-name guard, a decision to stop deleting, a fix for
  the adoption door) plus the two measured properties left alone.
- **`README.md`** — NO IMPACT, verified by grep rather than assumed. Its only rollback reference is
  `target_set_label_rollback_failed` (line 1332), the in-progress-LABEL rollback, which this change
  does not touch. No install, overview or command-surface change.
- **`docs/api.md`** — NO IMPACT. Line 108 documents `partial` carrying `dir` among the applied-step
  record. This change tightens `dir`'s meaning from "reached this step" to "created it", which makes
  the human-facing cleanup record MORE accurate, not less; the line states no falsehood either way
  and enumerates no semantics that changed.
- **`docs/workflow-state-contract.md`** — NO IMPACT, and this is a finding rather than an omission.
  Lines 127-135 describe `workflow_project` being adopted verbatim with only `isSafeName` filtering
  it. That is still exactly true — it is the subject of #933, not of this fix. Re-measured live this
  run, not inferred: `startup` against a `workflow_project: .roadmap` source still returns
  `{"claim":"acquired","project":".roadmap"}` at exit 0.
- **`docs/architecture.md`** — NO IMPACT. No structural change: two file-local helpers added beside
  `persistSelectionRecord`, no new module, no new surface, no changed call graph between components.
- **`docs/decisions/`** — NO IMPACT. No ADR-level decision was made or reversed. The one value call
  that arose (whether the claim should refuse a reserved name) was explicitly NOT taken in this run
  and is carried on #933 for its own deliberation.
- **`.env.example`** — NO IMPACT. No environment variable added, read or changed.
- **`kaola-workflow/ROADMAP.md`** — generated mirror, not hand-edited. Closure regenerates it.

## Deliberately not edited

The released `## [9.5.3]` CHANGELOG entry contains "**The claim side is deliberately unchanged**".
That is accurate as history of what #930 did, and rewriting a shipped entry to reflect later work
would be worse than leaving it — the `[Unreleased]` entry states the current position. The LIVE test
comment carrying the same sentence WAS corrected, under test custody, after both of its halves were
re-measured.
