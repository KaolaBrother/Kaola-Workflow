# Finalization Summary — issue-1114

## Delivered

- **Repeat-finalize archive authority loss fixed** through the existing receipt/authority mechanics: a collision archive (`archive/<project>.archived-<ts>/`) now carries a no-steps identity receipt (`project`, `claim_ts`, `archive_dest`, `branch` when present) before the live folder is gone; `resolveFinalizeAuthority` resolves via that same anchor; sink journals are never touched; a live directory still resolves.
- **Anchor retirement is identity-gated in three steps** (each an outer-review repair): only a dest carrying `claim_ts` (2966c7ac), then only one that itself supplies identity — valid self-anchor or parseable steps-bearing journal (be0d9b1f), then only a journal whose `project` and `claim_ts` match the destination (e2f87bbc). Corrupt, absent, foreign, or stale-mismatched receipts retire nothing; their bytes stay untouched; zero or multiple anchors still refuse.
- **Offline/online sink refusal behavior faithfully classified and locked** (no production change): offline diverged candidate refuses `sink_incomplete@push_main` with `publication: unknown`, never forced; online static-remote non-descendant reports `non_fast_forward`, never `--force`; offline local fast-forward is stamped local-only and keeps `publication: unknown`; `archive_commit` resume-trusts-done semantics classified (pre-marked done proves nothing skipped).
- Tests: `scripts/test-issue-1114-archive-authority.js` (81 checks ×4 editions incl. corrupt-receipt, foreign-journal, claim-mismatch, and valid-journal control classes), `scripts/test-issue-1114-sink-refusals.js` (54 ×4), both registered in the required chains.
- Docs: CHANGELOG `[Unreleased]`, `docs/api.md` (`archive_authority_ambiguous` semantics + same-name resolution caveat), README repeat-finalize reference, `package.json` chain registration, plugin mirrors via the sanctioned writers.

## Candidate

- Branch `workflow/issue-1114` @ `e2f87bbc96be92c2071a72b6dceeceda98d469e9` (base `d0b5160b`, 5 commits: `2539532b`, `c97d74bc`, `2966c7ac`, `be0d9b1f`, `e2f87bbc`; all author/committer `KaolaBrother <yanleichen@hotmail.com>`; worktree clean).
- Outer personal acceptance: `.kaola/outer-review-1114/accepted-e2f87bbc.md` — issue-candidate verdict; publication gate is separate and stricter.

## Evidence

- Chain receipt: `kaola-workflow/issue-1114/.cache/chain-receipt.json` (sha256 `68fbeb3b…`; recorded head `e2f87bbc`; 4 edition chains exit 0, unwaived; native `evaluateChainReceipt` → `chains_green`).
- Durable full chain output: `.cache/chain-e2f87bbc96be92c2071a72b6dceeceda98d469e9.log` (ends `npm_test_exit:0`).
- Outer review records: `.kaola/outer-review-1114/preliminary-2966c7ac.md`, `review-be0d9b1f.md`, `accepted-e2f87bbc.md`.
- Mission ledger: `kaola-workflow/.ledger/issue-1114.jsonl` (m1/m2/m3/m5 done; m4 release pending, owner-authorized, post-closure).

## Known failures and unverified scope

- No open product defect: every demonstrated defect (KPR #260 item 2 repeat-finalize; corrupt-receipt retirement; foreign/stale-journal retirement) is fixed with cross-edition regression coverage; outer personally ran 81×4 and 54×4 checks, all PASS.
- Non-product gaps kept honest and unverified: Worker-pool preset codex/luna start prerequisite not verified this run (start refused `codex-child-path`, nothing created; alternative default-pool seat used); earlier stopped-worker dispatch-index tombstones preserved (prompt-hash desync from same-assignment continuations; no fabricated dispatch history).
- Pre-existing `#931 n5` plain-archive receipt shape documented and unchanged; offline publication semantics intentionally conservative (`publication: unknown` offline).

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- docs/api.md
- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-claim.js
- scripts/test-issue-1114-archive-authority.js
- scripts/test-issue-1114-sink-refusals.js

## Follow-Up Items

- None filed: no run-discovered product defect remains open.
- Post-closure (owner-authorized, outside this issue candidate): official patch release 12.5.1 under the strict publication gate — fresh complete unwaived chains strictly bound to the exact publication commit, independent `--release-check`, official `--tag`, named-tag push + real Release creation, remote main/tag/release/latest verification, cleanup. No install.

## Final readiness

READY — outer-accepted candidate `e2f87bbc`, unwaived chains green, workspace clean (main carries only the active run folder), serial finalize/merge/closure authorized.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1114/.cache/chain-e2f87bbc96be92c2071a72b6dceeceda98d469e9.log
- kaola-workflow/archive/issue-1114/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1114/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1114/finalization-summary.md
- kaola-workflow/archive/issue-1114/mission-ledger.jsonl
- kaola-workflow/archive/issue-1114/workflow-state.md
