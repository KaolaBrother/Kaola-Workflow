# Finalization Summary — bundle-619-620-631

Closes: #619, #620, #631 (all-or-nothing bundle closure)

## Path

`workflow_path: adaptive`. 6-node DAG split per-file (claim.js/sink-merge.js are COMMON_SCRIPTS with
byte-identical codex twins + DIVERGENT gitlab/gitea hand-ports — not edition-sync-generated, so each
node is the sole root-writer of its file to satisfy the #340 forge-port-ordering wall): n1-sink
(tdd-guide — all sink-merge.js edits) → n2-claim (tdd-guide — all claim.js edits, consumes n1's
published_head field) → n3-review (code-reviewer, reasoning, G1) → {n4-adversary (adversarial-verifier,
reasoning) ‖ n5-docs (doc-updater)} → n6-finalize.

## What shipped

- **#619** — every close site (sink-merge legacy + --sink + bundle loop, and claim.js close-helper via
  un-memoized `probeIssueClosedLive`) now post-probes the live forge state on the SUCCESS path;
  exit-0-but-open buckets `failed` → typed `sink_incomplete` + exit 1 on both legacy and --sink paths.
  push_upstream parity check. Dead `worktree_sync` step removed (copy moved inline to the merge step,
  stage-then-land-post-checkout).
- **#631** — additive `published_head` receipt field (branch_head untouched, #518-safe); cmdVerifySink
  prefers it, falling back to branch_head for legacy receipts.
- **#620** (data-safety) — stale-worktree-cleanup proves `merge-base --is-ancestor` before `git branch -D`,
  else safe `-d` / `skipped_unmerged` — never destroys committed-but-unmerged work. Unconditional-`-D`
  `removeBranch` now reachable only from the consented-discard `cmdRelease` path.

## Gates

- n3-review (code-reviewer, model=fable): verdict pass, 0 blocking. Confirmed all 5 areas against the
  diff; the critical #620 confirmation that `removeBranch` survives only in `cmdRelease` (grepped all
  four editions). 3 LOW non-blocking findings (R1/R2/R3).
- n4-adversary (adversarial-verifier, model=fable): verdict pass, 0 blocking. 68/68 checks across 5
  independent from-scratch reproduction drivers — could not destroy unmerged work under any input
  (diverged, FF-ahead, unresolvable default branch, pruned-upstream-only-copy, dirty), could not make a
  failed close look sinked, could not false-alarm verify-sink or mutate branch_head. 1 LOW non-blocking
  finding (R4, doc-clarity — documented in D-619-01).
- Script-enforced gates (re-verified against the final committed tree): --resume-check pass,
  --gate-verify pass, --barrier-check pass (0 errors/unattributed), --verdict-check pass
  (n3-review + n4-adversary both verdict:pass).
- --finalize-check (chain-receipt, regenerated post-doc-edits): pass — codex chain green; claude/gitlab/
  gitea waived `--accept-known-red …:635` for the pre-existing test-run-chains signal-death load-flake.

## Cross-edition (#307)

Diff touches the edition trees (sink-merge.js + claim.js codex twins + gitlab/gitea hand-ports).
Canonical↔codex byte-identical for both scripts (validate-script-sync clean). Substantive content green:
test-claim-hardening 169, test-bundle-finalize 135, walkthrough, field-parity 61, codex chain exit 0,
both forge sink suites + edition walkthroughs green standalone. The ONLY red is the orthogonal
test-{run,gitlab-run,gitea-run}-chains signal-death sub-test (#635), confirmed pre-existing (different
T/G-numbers each run, zero references to sink-merge/claim.js) via git-stash A/B by both implementers and
independently by the reviewer.

## Run gaps

- deferred_red_chain (claude:635): filed: #635
- deferred_red_chain (gitlab:635): filed: #635
- deferred_red_chain (gitea:635): filed: #635

Additional (non-swept, recorded for completeness):
- **n2-claim reclaim** — the n2-claim tdd-guide completed its implementation + wrote full evidence but
  got stuck in a redundant final re-validation loop (repeatedly re-running the #635-flaky chains);
  the orchestrator stopped it after confirming the deliverable (code + 140-line evidence) was complete
  and validated (169 assertions, byte-parity clean). noise: no rework — the work was done and correct;
  only a redundant validation tail was terminated. delegation_outcome for n2-claim: completed (deliverable
  present). Captured as a durable gotcha (agents can over-loop on the #635-flaky chains).
- n3-review R2/R3, n4-adversary R4: noise: LOW-severity cosmetic/doc-clarity nits (R4 documented in the
  ADR); not product defects through normal operation.

## Implementation commits

- `f661ca5f` — `fix(claim/sink): fail-close the sink/close pipeline + never delete unmerged work` (13
  code/test files, main-session authored — per-file serial write nodes never auto-commit).
- `7fd3ccb3` — `docs: D-619-01 ADR + api.md/state-contract + CHANGELOG`.

## Goal attestation

`KAOLA_GOAL` reflects the standing session goal (finish all Kaola-Workflow issues via the adaptive
workflow, reviewer subagents on the fable model) — `goal_check: satisfied` expected.
