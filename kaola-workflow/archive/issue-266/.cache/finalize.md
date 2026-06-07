# finalize (sink) — issue #266

## Deliverable
Added the `## [Unreleased]` → `### Added` CHANGELOG.md entry for #266 (the finalize node's only
production write). It documents all 8 acceptance criteria (A–H), the 3 deliberate plan deviations
(AC-A scope-down to the genuine operational leak; version-parity no-op; AGENTS.md kept redirect-only),
and the deferred AC-3 runtime-wiring follow-up.

## Phase-6 barrier gates (all green, real exit codes captured directly)
- `--resume-check` → ok (plan_hash 1db18045… intact)
- `--gate-verify` → ok (every code/sensitive node post-dominated by a completed reviewer)
- `--barrier-check` (whole-plan) → pass (no out-of-allowlist or unattributed production writes)
- `--verdict-check` → ok (security-review + code-review both `verdict: pass` / `findings_blocking: 0`)

## Validation (cited per de-dup — already run green)
- `npm test` green across all 4 editions — confirmed by the `script-registration` and `tests` nodes.
- `node scripts/simulate-workflow-walkthrough.js` green.

## Closure decision
- Acceptance: 8/8 ACs met within the frozen scope (code-review gate PASS, findings_blocking 0).
- Deferred (non-blocking, surfaced by the code-review gate): AC-3's automatic reconcile-on-every-resume
  wiring (invoking the task-mirror generator from `adaptive-node.js orient` / `adaptive-handoff.js`)
  is delivered as a documented contract + standalone generator, but not wired at runtime — those
  aggregators are outside every frozen node write set. Recommended as a follow-up issue (offered to
  the user, not auto-created — per the Phase-6 Closure Decision Gate, follow-up issue creation needs
  user permission).
- A version bump + tagged release is a separate, deliberate release action (offered to the user).

## Sink
Merge sink to branch `workflow/issue-266`; issue #266 closed on a clean merge. Contractor runs the
mechanical finalization (8a/8b/7/8); orchestrator runs Step 9 sink-merge.
