# Documentation Docking — issue-715

## Changed code/config/test/workflow files reviewed

- scripts/kaola-workflow-claim.js + plugins/kaola-workflow/scripts/kaola-workflow-claim.js + plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js + plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — epoch-2 dest-exempt restore gate + in-helper base-branch guard at both call sites; epoch-3 guard-hardening (sentinel rejection, argument-array rev-parse --verify refs/heads/<base>, discardedBranch refusal, sweep defaultBase constraint, post-commit re-resolution + merge-base --is-ancestor reachability downgrade), all inside commitDiscardArchive (:2364-2469) with release (:3422-3499) and sweep (:4430-4495) call-site disclosures
- scripts/kaola-workflow-sink-merge.js + the three plugin mirrors — epoch-1 SINK_RECEIPT_EXEMPT anchored single-segment regex (byte-identical in all four copies; no epoch-3 hunks)
- scripts/simulate-workflow-walkthrough.js, scripts/test-claim-hardening.js, scripts/test-sink-merge.js — RED-first regression fixtures (485 + 105 assertions; five N5-A/N5-B walkthrough cells + 21 hardening pins + the #715 preflight-exemption pins)
- CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md — the documentation delta itself (n2)
- kaola-workflow/issue-715/** — workflow state (validation-invisible)

## Documents checked

- CHANGELOG.md — two [Unreleased] ### Fixed entries (epoch-2 dest-exempt restore + in-helper base guard + sweep pre-read; epoch-3 sentinel/falsified-base refusal + post-commit re-verification + truthful downgrade): MATCHES the shipped code clause-for-clause (verified by n3 against helper :2389-2461)
- docs/api.md — NATIVE=0 paragraph + Closure Contract "Discard-archive commit (issue #715)" paragraph: names exactly the shipped fields discard_archive_committed / discard_archive_branch (on success AND skip) / discard_archive_commit_detail (+ warnings[] on failure), matching emit sites :3496-3499 / :4492-4495 and the helper result shape: MATCHES the diff
- docs/workflow-state-contract.md § Terminal journal disposal — base-branch binding, dest-exempt restore gate, off-base sweep skip with truthful committed:false + branch disclosure, sentinel/falsified-base refusal before staging, post-commit re-verification: MATCHES the code; no invented fields
- README.md — no feature/usage/env change in the diff: no-impact, skipped
- docs/architecture.md — no structure change: no-impact, skipped
- .env.example — no new env vars: no-impact, skipped
- Inline comments — edit-site comments updated with the fix hunks (verified in the n3 certifier pass)
- Issue comments — posted by the sink at closure (Step 9), not a pre-commit document

## Gaps found and fixed

None. (n2's docs delta was verified line-by-line against the code by the n3 code certifier and re-attacked by the n5 adversarial gate; both zero findings; n4 confirmed no new field or trust surface.)

## Explicit no-impact reasons

- README/architecture/.env.example: discard-archive commit hardening and sink-preflight exemption are internal lifecycle correctness fixes — no public surface, setup, architecture, or env change.

final verdict: DOCKED
