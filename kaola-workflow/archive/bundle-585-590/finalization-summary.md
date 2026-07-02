# Finalization Summary — bundle-585-590

Bundle run closing BOTH #585 and #590 (closure_policy: all_or_nothing).
Branch: `workflow/bundle-585-590` — impl commit `e41c2be4 fix: enforce scheduler mutual exclusion and baseline-first open-next (#585, #590)`.

## Delivered

- **#585 — scheduler mutual-exclusion lock (O_EXCL).** The running-set scheduler now takes an
  O_EXCL (`openSync 'wx'`) scheduler lock with typed `scheduler_locked` / `scheduler_lock_stale`
  refusals. NO auto-takeover of a stale lock: the round-1 auto-takeover path was refuted by this
  run's own adversarial gate (concurrent stale-takeover double-acquire) and repaired in-run to a
  fail-closed typed stale refusal with a one-session operator recovery hint (pid/host/since +
  exact `rm "<lockPath>"`). Regression-pinned by T-585-stale-race.
- **#590 — baseline-first open-next reorder.** `open-next` records the barrier baseline BEFORE
  flipping the ledger, so a crash can no longer leave a pending node with no baseline; a
  `baseline_failed` refusal occurs before any plan write, and the close path promotes the
  validator's `no_barrier_base` emit with a new operator hint.
- Tests: `test-adaptive-node.js` 1078 → 1127 assertions (exit 0).
- ADRs: `docs/decisions/D-585-01.md`, `docs/decisions/D-590-01.md`.

## Final Validation Evidence

- `kaola-workflow/bundle-585-590/.cache/chain-receipt.json` — all four chains green:
  claude exitCode 0, codex exitCode 0, gitlab exitCode 0, gitea exitCode 0 (all `accepted_red: false`).
- Finalize gate pre-verified: `plan-validator --finalize-check --json` →
  `{"result":"pass","mode":"chain-receipt","checkedChanges":16}` (exit 0). The gate's freshness
  key is the recomputed `codeTreeHash`; the receipt covers the final candidate code tree.
- Validation-reuse boundary, stated honestly: one post-round-1 inline edit exists — a
  comment-only fix in `scripts/test-adaptive-node.js` (stale-takeover wording at a test-section
  comment describing the refuted round-1 design). The chains ran AFTER that comment fix; the
  receipt covers the final candidate state including the inline comment fix.

## Documentation Docking

DOCKED — n4-docs updated `CHANGELOG.md` (`[Unreleased]` entries for #585 and #590, including the
truthful refuted-takeover history and exact refusal-reason spellings), the two ADRs
(`D-585-01`, `D-590-01`), `docs/api.md`, `docs/architecture.md`,
`docs/workflow-state-contract.md`, and the frontier-batch card.

## Required Agent Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| code-architect (n1-lock-design) | subagent-invoked | `.cache/n1-lock-design.md` |
| tdd-guide (n2-impl, incl. in-run repair after reopen-node) | subagent-invoked | `.cache/n2-impl.md` |
| adversarial-verifier (n3-adversarial, round-1 verdict fail → repair → re-verified pass) | subagent-invoked | `.cache/n3-adversarial.md` |
| doc-updater (n4-docs) | subagent-invoked | `.cache/n4-docs.md` |
| code-reviewer (n5-review) verdict: pass, findings_blocking: 0 | subagent-invoked | `.cache/n5-review.md` |
| finalize (n6-finalize) | main-session-direct | `.cache/n6-finalize.md` |
| final validation | invoked | `.cache/chain-receipt.json` |
| roadmap refresh / archive / final commit | invoked | this finalization |

## Run gaps

One swept class in `.cache/run-gaps.json`: `in_run_repair` (sample n2-impl, count 1).
The round-1 #585 lock shipped an auto-takeover path that the run's own adversarial gate refuted
(concurrent stale-takeover double-acquire: 6/500 at N=2, 111/500 at N=6). Repaired in-run via
architect re-decision (takeover removed, fail-closed typed stale refusal), node reopened with a
fresh baseline (reopen-node), re-verified 0/1000 adversarial trials, pinned by regression test
T-585-stale-race.

- in_run_repair (n2-impl): noise: defect existed only in this run's unmerged round-1 implementation; repaired and re-verified in-run before any merge; regression-pinned by T-585-stale-race; no shipped or residual defect to track.
