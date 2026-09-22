# ADR 0027 — The mission ledger

Status: Accepted · Date: 2026-09-22 · Issue: #1089 · Runner-side mirror:
KaolaBrother/kaola-project-runner#133

## Context

ADR 0017 derived four meanings per mission (`item`, `status`, `dispatched`, `result`) and three write
moments (create, dispatch, result), and carried them in one Markdown file,
`kaola-workflow/<project>/mission-list.md`. The meanings held; the carrier did not:

- The layout was never fixed. Line-form and table-form both existed (#1054 allowed both), so every
  reader had to parse free-form Markdown. The finalize Step-8a record-regression guard
  (`compareLedgers`) counted `status: done` lines with a regex that read zero on a table-form list
  and reported SAFE for a copy that would have erased 3 of 7 finished records. The Runner Host's
  progress bar had to parse the same free form.
- The format was loose enough that nobody kept the status current: the archived
  `kaola-workflow/archive/bundle-1088/mission-list.md` left all three missions at `status: todo`
  after the run closed and archived.
- The file was mirrored in both directions between the main checkout and
  `.kw/worktrees/<project>/`, guarded by `compareLedgers` plus a `.cache/mirror-digest.json`
  receipt (#399, #1054 R1). Once the record lives only in the main checkout, that machinery has no
  reason to exist.

## Decision

This ADR replaces **only ADR 0017's carrier** (file name, format, location). ADR 0017 stays
Accepted: its four meanings, three write moments, mission granularity, and the rule that
finalization, closure, archive, and sink are not missions all stand.

1. **Location.** `<main_root>/kaola-workflow/.ledger/issue-<N>.jsonl`. `main_root` is the main
   checkout (`workflow-state.md` `main_root`, the root the Runner binds with `--repo`); `N` is the
   run's `workflow-state.md` `issue_number`. A bundle run writes the one file named by its primary
   issue. The directory is gitignored (`kaola-workflow/.ledger/`), lives only in the main checkout,
   never appears under a worktree, and is never mirrored or copied.
2. **Shape.** One JSON object per line, one line per mission, keys exactly `n`, `name`, `details`,
   `status` in that order. `n` is positional, 1..k, never renumbered. `status` is one of `todo`,
   `in-flight`, `done`, `failed`, `blocked`. There is no header line and no goal line: the goal is the
   issue.
3. **Field folding.** `item` becomes `name` + `details`. `dispatched` and `result` are appended to
   `details` at write moments 2 and 3. `status` gains `failed` (the global contract's "one dispatch
   has one result, including FAIL") and `blocked` (the current owner cannot safely or legitimately
   continue; it may return to `in-flight` after a ruling).
4. **Writer.** The run's Main Orchestrator only, at the three ADR 0017 moments: create (`todo`),
   dispatch (`in-flight`; `details` gains where it went and where output lands), result (terminal
   status; `details` gains where the outcome landed). Each write rewrites the whole file (temp file +
   rename, or an in-place edit). `done` and `failed` lines are immutable afterwards.
5. **Claim and archive.** Claim creates `kaola-workflow/.ledger/` in the main checkout and reports
   `ledger_path`; when the path is not gitignored it reports a `ledger_not_gitignored` finding and
   never edits `.gitignore`. Archive moves the file to
   `kaola-workflow/archive/<project>/mission-ledger.jsonl`, which is tracked.
6. **Goal declaration.** The closure receipt's goal is declared by `KAOLA_GOAL` or by a non-empty
   ledger (`goal_declared_source: 'env' | 'ledger' | null`).

## Contract with the Runner

> **Mission ledger contract (Workflow ↔ Runner)**
> 1. Path: `<canonical-root>/kaola-workflow/.ledger/issue-<N>.jsonl`. `canonical-root` is the main checkout the Runner binds with `--repo`; `N` is the issue number in the session name and in the run's `workflow-state.md` `issue_number`. The folder is gitignored and exists only in the main checkout, never in a child worktree.
> 2. Shape: one JSON object per line, one line per mission, keys exactly `n` (1-based integer), `name` (string), `details` (string, may be empty), `status` ∈ `todo | in-flight | done | failed | blocked`. No header, no other keys.
> 3. Writer: the run's Workflow Main Orchestrator only, at three moments — create (`todo`), dispatch (`in-flight`, details gains where it went and where output lands), result (terminal status, details gains where the outcome landed). `done`/`failed` lines are immutable afterwards. The Runner never writes.
> 4. Reader: the Runner Host reads it read-only. Absent file → no live Workflow run has recorded missions for this issue (`unknown`). Present → progress = `done` lines / total lines; per-mission status by `n`. Identity verification stays on `workflow-state.md` (`claim_repository_id`, `issue_number`) as today.
> 5. Non-Workflow workers (diagnostics, issue-less tasks) have no file and are never given one.
> 6. Archive: on Workflow archive the file moves to `kaola-workflow/archive/<project>/mission-ledger.jsonl`; presence under `.ledger/` therefore means a live run.
> 7. Nothing else crosses this boundary: no timestamps, worker/session ids, heartbeat mirrors, or per-mission events. Session facts stay in Runner receipts; run facts stay in `workflow-state.md`.

A Host needs only `jq -c '{n,status}'`; `details` is read only when deciding about one mission.

## Retired

`mission-list.md`, the kernel's `MISSION_LIST_FILE` and `parseGoal`, the finalize Step-8a
`compareLedgers` guard and `scripts/kaola-workflow-ledger-compare.js` (all four trees), the
`.cache/mirror-digest.json` receipt, the finalize transaction field `ledger_compare`, and the suites
`test-ledger-compare.js`, `test-issue-1054-ledger-guard.js`, and
`test-issue-1054-mission-list-carriers.js`. There is no dual format, legacy reader, or fallback to
`mission-list.md`. The Step-8a mirror of the other run artifacts (`finalization-summary.md` and the
rest) remains.

## Consequences

- One layout, one parser rule; a Host reads status without parsing prose.
- Presence under `.ledger/` means a live run; the archived copy is tracked evidence.
- No second copy exists to diverge, so there is nothing to compare at finalize.

## Rejected alternatives

- Append-only (one line per write moment, reader takes the last): safe under concurrent writers, but
  two to three times the size and an extra last-wins rule, when the single writer is already
  guaranteed.
- One directory per issue (`.ledger/issue-<N>/missions.jsonl`): each directory would hold one file,
  and the extra level has no reader.
- `.kaola/ledger/`: `.kaola/` is the Runner Host's carrier directory; the ledger is written by
  Workflow, and each side keeps its own directory.
