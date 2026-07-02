# Finalization Summary — bundle-588-591

## Delivered

- **#591** — per-member `leg_path`/`leg_branch` dispatch routing threaded into the running-set open output (write co-open legs carry their isolated leg fields into dispatch; serial/read paths byte-unchanged), plus the six-surface routing prose propagation (3 Claude commands + 3 Codex SKILL packs) and the frontier-batch card.
- **#588** — width/mix coverage hardening for write co-open (width-4 antichain, mixed read/write frontier pin), including the fixed write-cap `max_concurrent` defect (reintroduced cap bug yields 8; test asserts `rs.max_concurrent === 4`).
- Tests: `test-adaptive-node` assertions 1127 → 1219.
- ADRs: `docs/decisions/D-588-01.md`, `docs/decisions/D-591-01.md`.
- Impl commit: `b2c23803 feat: thread per-member leg routing into dispatch and harden write co-open coverage (#591, #588)`.

## Final Validation Evidence

- Chain receipt: `kaola-workflow/bundle-588-591/.cache/chain-receipt.json` — all four chains green (`claude`, `codex`, `gitlab`, `gitea` exitCode 0, `accepted_red: false` each).
- Receipt covers the final candidate tree: `--finalize-check` re-verified at finalization → `{"result":"pass","mode":"chain-receipt","checkedChanges":16}` (freshness key `codeTreeHash` matches the current code tree; receipt `headSha` is the impl commit's parent because the chains ran over the identical pre-commit working tree).
- Gap sweep: `run-gaps.json` `sweptClasses: []` (clean).

## Documentation Docking

DOCKED — `CHANGELOG.md` (`[Unreleased]` entries for #591 and #588) + 2 ADRs (`D-588-01`, `D-591-01`) + `docs/api.md` (dispatch fields, lane_group example 8→4, ceiling doc) by n4-docs; six routing surfaces + the frontier-batch card by n2-prose.

## Required Agent Compliance

- n1-impl (`tdd-guide`): subagent-invoked → `.cache/n1-impl.md`
- n2-prose (implementer): subagent-invoked → `.cache/n2-prose.md`
- n3-adversarial (`adversarial-verifier`): subagent-invoked, `verdict: pass` → `.cache/n3-adversarial.md`
- n4-docs (`doc-updater`): subagent-invoked → `.cache/n4-docs.md`
- n5-review (`code-reviewer`): subagent-invoked, `verdict: pass`, `findings_blocking: 0` → `.cache/n5-review.md`
- n6-finalize (finalize): main-session-direct → `.cache/n6-finalize.md`
- Final validation: invoked → `.cache/chain-receipt.json` (four chains green; `--finalize-check` pass)
- Roadmap refresh / archive / final commit: invoked (this finalization)

## Run gaps

none (sweep clean — `run-gaps.json` `sweptClasses: []`)
