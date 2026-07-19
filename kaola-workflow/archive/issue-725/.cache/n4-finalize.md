evidence-binding: n4-finalize 5ff03cb9075d

upstream_read: n2-code-certify 83bb71e5fd84
upstream_read: n3-security-certify ef7db60618c3

## Finalize sink transaction (main-session-direct, partial close of epic #725 — Phase A)

Certifier freshness: n2-code-certify (approved, 0 blocking, nonce 83bb71e5fd84) and n3-security-certify (approved, 0 blocking, nonce ef7db60618c3) both complete in the ledger; both certified candidate_digest 8b9854fef90489dd88f06de1a80f3788a23ae5f17c9aefb8fc4ae49062bd781d.

Feature commit: 98384667a1c472268519ba5a2d426cc89ee5f215 on workflow/issue-725 ("feat: retire fast/full paths — adaptive-only consolidation Phase A (#725)", 217 paths — 56 deletions + n3-n10 + n1-repair + D-725-01 ADR + project state).

Sink chain receipt: kaola-workflow/issue-725/.cache/chain-receipt.json — KAOLA_RUN_CHAINS_CONCURRENCY=serial, source npm-default, headSha 98384667, workTreeHash clean, codeTreeHash 8b9854fe (byte-match to the certified candidate digest). All four chains exit 0 first attempt: claude 756s, codex 19s, gitlab 89s, gitea 83s. Additive suites green in the claude-chain run context earlier this run: test-opencode-edition.js (396 asserts), test-kimi-edition.js (440 asserts).

Partial-close contract: issue #725 stays OPEN with workflow:in-progress label (epic continues Phase B); #718 untouched (closes with Phase D). Sink steps after this close: cmdFinalize --keep-worktree -> push workflow/issue-725 -> sink-merge --sink from the main root -> brief Phase-A comment on #725.

Run gaps: all mapped in .cache/run-gaps-manual.md — filed #734, #735; workarounds recorded for #719/#720/#722; proxy flake noise-class.
