evidence-binding: n10-finalize 85eb04b623f3
upstream_read: n8-adversary 4f8238411572
upstream_read: n9-docs 47d7e98fe9eb
compliance: main-session-direct

## Phase 6 — Finalization sink (main-session-direct, non-delegable)

Project issue-653 (single issue #653). All nine upstream nodes complete; gate chain: n7-review
pass (findings_blocking: 0; 2 low fenced notes), n8-adversary pass NOT-REFUTED (findings_blocking:
0; 3 low fenced findings, all dispositioned resolved).

## Steps

1. CHANGELOG.md: added the #653 entry (Added — self-contained adaptive-cycle evidence archive:
   attestation propagation + warning persistence, terminal journal disposal, consumer candidate
   binding, selection/run-gap durability; in-run generated-surface discovery recorded) at the top
   of the existing `## [Unreleased]` section (which already carries #651/#652 awaiting the release
   cut). Last test-consumed prose edit before the receipt stamp (stamp-last discipline).
2. Feature commit on workflow/issue-653 (worktree): 6ec5dfc9, 118 files +4377/−163 (all five
   implementation lanes, both gate re-verifications, docs, CHANGELOG, workflow state).
3. Serial four-chain receipt via kaola-workflow-run-chains.js --project issue-653, stamped LAST at
   the feature commit: DONE below.
4. Finalize gate + push + sink-merge from main root + closure (#653 closed with CLOSED-state
   verification, roadmap source removed, ROADMAP regenerated, folder archived, journals
   self-disposed by the new lifecycle): recorded in the closure receipt / sink output.

## Validation

`KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-653
--json` → `{"result":"pass","failed":[]}`, exit 0. Receipt: headSha
6ec5dfc9b66a3407e8a5976a15438dbb83b7b61e (== HEAD, the feature commit), workTreeHash "clean",
chains claude/codex/gitlab/gitea all exitCode 0, all accepted_red false — UNWAIVED four-chain green
receipt at the finalize candidate, stamped after the last test-consumed prose edit (CHANGELOG).
Stamp-last discipline held: no code or test-consumed prose changed after the stamp.
