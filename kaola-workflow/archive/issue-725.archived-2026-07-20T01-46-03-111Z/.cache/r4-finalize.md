evidence-binding: r4-finalize 12dff2f15549

upstream_read: r3-security-certify c46c6860bd4c

compliance: main-session-direct

## Sink transaction — Phase C partial close of epic #725 (issue stays OPEN, label stays in place)

Certifier freshness confirmed: r2-code-certify (code wall) and r3-security-certify (security wall)
both complete, both `verdict: pass` / `findings_blocking: 0`, both binding
certified_candidate_digest 48619143aecb2ed96bdc2b9a0b0462bfdcf9f0ef42debcb075c60af99af8cd49.

Feature commit: `2a48342c` "feat: guard dedup — edition-sync single-pass mirrors, plan-integrity
hash fast-path, advisory hook retirement (#725 Phase C)" on branch workflow/issue-725 — 46 files,
+226/−1791, no closing keywords adjacent to the issue ref.

Serial four-chain receipt: `KAOLA_RUN_CHAINS_CONCURRENCY=serial kaola-workflow-run-chains.js
--project issue-725` — scope decision `all-four` (reason `edition_coupling`, base 0a9f652a);
claude exit 0 (681s, one transient retry), codex exit 0 (17s), gitlab exit 0 (88s), gitea exit 0
(83s); receipt codeTreeHash 48619143aecb2ed96bdc2b9a0b0462bfdcf9f0ef42debcb075c60af99af8cd49 —
byte-match to both certifier walls' certified candidate. Receipt at .cache/chain-receipt.json.

Defect observations filed this run: NEW #738 (cross-epoch child journal wedges sequential
schema-2 gates: ordinal-scope collision + lineage-reader version refusal; workaround = patched
copy, repo untouched); recurrence comments on #722 (third), #719/#720/#734 (third, verbatim);
avoidance note on #737 (freeze-before-attest commits first-try). Full detail in
.cache/run-gaps-manual.md (GAP-1..GAP-5, including the planner consumer-side needle-grep lesson
for Phase D/E briefs).

Remaining sink steps executed main-session after this node closes (the sink transaction's own
bookkeeping): cmdFinalize --keep-worktree --keep-open → push workflow/issue-725 → sink-merge
--sink from the MAIN root → verify #725 still OPEN. opencode/kimi not re-synced (Phase D scope).
