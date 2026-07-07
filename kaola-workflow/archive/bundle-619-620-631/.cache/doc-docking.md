evidence-binding: doc-docking (main-session)

# Documentation Docking — bundle-619-620-631 (#619, #620, #631)

## Changed surfaces (bundle's own diff, f55b1801..HEAD)

Code (commit f661ca5f):
- `scripts/kaola-workflow-sink-merge.js` + codex twin + gitlab/gitea hand-ports — #619 (4 fail-closed
  arms) + #631 `published_head` stamp.
- `scripts/kaola-workflow-claim.js` + codex twin + gitlab/gitea hand-ports — #619 close-helper live
  post-probe + #620 `removeBranchIfMerged` is-ancestor guard + #631 `cmdVerifySink` published_head
  preference.
- tests: `scripts/test-bundle-finalize.js`, `scripts/simulate-workflow-walkthrough.js`,
  `scripts/test-claim-hardening.js`, `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js`.

Docs (commit 7fd3ccb3):
- `docs/decisions/D-619-01.md` (NEW ADR, 204 lines) — the receipt-integrity + data-safety decision.
- `docs/api.md` — Merge Sink fail-closed close verification + push_upstream `sink_incomplete` shape +
  `KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL` hook + stale-cleanup `skipped_unmerged` bucket/schema.
- `docs/workflow-state-contract.md` — `published_head` sink-receipt field vs `branch_head` + verify-sink
  preference order.
- `CHANGELOG.md` — `[Unreleased]` entry.

## Checklist

- [x] README.md — no user-facing feature/usage/env-var surface changed (internal script contract); no update.
- [x] API docs (`docs/api.md`) — updated (sink-receipt schema + refusal shapes + cleanup bucket).
- [x] CHANGELOG.md — updated (commit 7fd3ccb3).
- [x] Architecture docs (`docs/architecture.md`) — no structural change to the workflow architecture
      (these are fail-closed hardening + a data-safety guard within existing sink/cleanup flows); no update.
- [x] `.env.example` — no new persistent env vars (`KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL` is a
      test-only hook, documented in api.md, not a user-facing config var).
- [x] Inline comments — added in-code (each fix carries a rationale comment: #619 memo-trap, #620
      is-ancestor guard, #631 published_head additive).
- [x] `docs/decisions/D-619-01.md` — NEW ADR authored (primary durable artifact).
- [x] `docs/workflow-state-contract.md` — updated (published_head field; this file is
      SELF_HOST_TEST_CONSUMED, so the chain receipt is generated AFTER it landed).

## Deferred/low-severity findings (from the gates, non-blocking)

- n3-review R1 (#635 flake → filed, waived at finalize), R2 (wtStageDir temp-dir leak on merge-abort —
  negligible, follow-up), R3 (dry-run `would_delete_branch` cosmetic preview).
- n4-adversary R4 (pushed-at-parity branch deleted via safe `-d` lands in `deleted_branch` not
  `skipped_unmerged` — NOT data loss, tip reachable via origin; documented in D-619-01 per the finding).

Judgment: R2/R3/R4 are LOW-severity cosmetic/doc-clarity nits (R4 is already documented in the ADR),
not product defects reachable through normal operation causing loss. Recorded as `noise` in the run-gaps
section rather than filed. R1/#635 is filed and waived.

## Verdict

No documentation gap. Proceed to closure.
