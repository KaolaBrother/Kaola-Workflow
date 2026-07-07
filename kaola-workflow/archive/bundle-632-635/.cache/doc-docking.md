evidence-binding: doc-docking (main-session)

# Documentation Docking — bundle-632-635 (#632, #635)

## Changed surfaces (bundle's own diff, 3a4b4734..HEAD)

Code (lane-group leg/synth commits e6b2cebd/9c434361/cfd7b0de):
- `scripts/kaola-workflow-release.js` + codex twin + gitlab/gitea ports — #632 chains_empty guard + stale-comment fix.
- `scripts/test-release.js` — #632 RED tests (T14a-d).
- `scripts/test-run-chains.js` — #635 deterministic in-process signal-death seam.

Docs (commit 755f5757):
- `docs/decisions/D-632-01.md` (NEW ADR) — the #632 value-call resolution + fail-open close + #635 note.
- `CHANGELOG.md` — `[Unreleased]` entry.

## Checklist

- [x] README.md — no user-facing feature/usage/env-var surface changed; no update.
- [x] API docs (`docs/api.md`) — `release.js`'s `chainReceiptGreenness` reason enum is NOT documented
      there (verified by n5-docs/plan — api.md documents only the plan-validator `--finalize-check` gate);
      no api.md gap. The reason strings live in the ADR.
- [x] CHANGELOG.md — updated (commit 755f5757).
- [x] Architecture docs — no structural change (a fail-closed guard + a test-harness determinism fix); no update.
- [x] `.env.example` — no new env vars.
- [x] Inline comments — the corrected `--cut` comment landed in-code (all four release.js editions); the
      #635 seam carries a rationale comment.
- [x] `docs/decisions/D-632-01.md` — NEW ADR authored (the substantive #632 decision + #635 note).
- [x] `docs/workflow-state-contract.md` — not touched; no durable-state-contract change (release/test fix).

## Cross-edition (#307)

Diff touches the edition trees (release.js codex twin + gitlab/gitea ports). validate-script-sync clean;
all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains GREEN — **UNWAIVED** (no
`--accept-known-red`), the first clean unwaived four-chain receipt this session, itself the strongest
evidence #635's flake fix landed (the claude chain's `test-run-chains.js` now passes deterministically).

## Findings

- n3-review R1 (LOW, follow_up): latent silent-pass shape in the #635 in-process IIFE if `main()` ever
  hung — no trigger today (listener attachment is synchronous); cheap future hardening. noise.
- n4-adversary A1 (LOW, pre_existing, action=none): `chains:[null]` throws a TypeError in the red loop —
  a crash (non-zero exit), NOT a false green; fail-closed in effect, identical pre-fix behavior. noise.

Both are LOW, non-blocking, not defects introduced by this bundle. No follow-up filed (over-filing a
no-trigger hardening note and a pre-existing fail-closed crash-edge would be noise).

## Verdict

No documentation gap. Proceed to closure.
