evidence-binding: n_decisions 38a65f17c0e0

## Created

`docs/decisions/D-429-01.md` — Script-owned resumable worktree sink (#429)
`docs/decisions/D-434-01.md` — Sanctioned repair primitives for adaptive node overflow and reviewer findings (#434)

## D-429-01 key decisions recorded

- `--sink` mode added to `kaola-workflow-sink-merge.js` owns the full 9-step worktree sink transaction.
- `sink_blocked` preflight scans for foreign-dirty files before any mutation; lists exact paths; auto-stashes only `kaola-workflow/.roadmap/issue-N.md` entries in the `--issues` set.
- `sink-receipt.json` written atomically (temp + rename); per-step `state: 'done'` entries enable crash-safe resume; re-invocation skips already-done steps.
- Nine steps: `stash_roadmap`, `push_upstream`, `merge_no_ff`, `worktree_sync`, `finalize_internals`, `close_issues`, `stash_restore`, `archive_commit`, `push_main`.
- `push_upstream`/`push_main` tolerate already-pushed by probing remote ref vs. local HEAD.
- `close_issues` calls `probeIssueClosed()` before each close for idempotency.
- `cmdFinalize` routes to `--sink` for the worktree case.
- Typed refusals: `sink_blocked`, `sink_receipt_corrupt`, `step_failed`.

## D-434-01 key decisions recorded

- `revert-overflow` subcommand: reads `outOfAllow` from barrier check, runs `git checkout <baselineSha> -- <paths>` scoped to those paths only, confirms barrier clean; DOES NOT move the baseline.
- `repair-node` subcommand: anti-laundering primitive — resets writer from `complete` to `in_progress` KEEPING the original `barrier-base-{nodeId}`; deletes only downstream gate baselines; returns `baselineReused: true`.
- `requires_redispatch` signal in `orient`: emitted when a node is `in_progress` but evidence is absent or nonce-mismatched; typed `redispatch_reason` (`evidence_absent`, `binding_mismatch`, `evidence_incomplete`); closes the crash-resume prose gap.
- Anti-laundering invariant (normative): baseline MUST NOT be moved forward past writes the barrier is responsible for detecting; `repair-node` keeps original baseline; `reopen-node` (fresh baseline) is only correct for a genuinely clean slate; using `reopen-node` for post-write recovery is the explicit anti-pattern.
- Contrast documented: `repair-node` vs `reopen-node` have distinct contracts and must not be conflated.
