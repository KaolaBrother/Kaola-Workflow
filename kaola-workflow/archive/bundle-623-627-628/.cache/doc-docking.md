# Documentation Docking — bundle-623-627-628

Matches the shipped changes against the doc surfaces. Prose-only routing-surface cluster (#623/#627/#628).

## Changed surfaces (git diff vs origin/main)

Routing surfaces (the six #400 propagation surfaces + their card/agent docs):
- `commands/kaola-workflow-plan-run.md` (+ gitlab/gitea command twins) — ladder + speculative restubs, #623 FANOUT_CAP correction.
- `commands/kaola-workflow-finalize.md` (+ gitlab/gitea twins) — Goal-Attestation compression, enum → docs/api.md, resolver self-containment.
- `commands/workflow-next.md` (+ gitlab/gitea twins) — `$CLAIM_JS`/`$claim_script` resolver-prefix.
- 3 Codex SKILL packs (canonical codex + gitlab-codex + gitea-codex) — mirrored plan-run / finalize / workflow-next prose.
- `agents/workflow-planner.md` — #628 three-tier speculation (§3 + §7), freeze-legal exact-path example; #623 topup scope.
- `docs/plan-run-cards/frontier-batch.md` — #628 three-tier rows, freeze-legal example; #623 read-only rolling-topup scope.
- `docs/plan-run-cards/README.md` — speculative-open row three-tier reword (R1, trivial-inline finalize edit).
- `docs/api.md` — new `### Goal Attestation` enum home (moved from the finalize command inline).

## Doc-vs-change reconciliation

| Change | Doc reflected? | Where |
|---|---|---|
| #627 skeleton debloat (fix#1/3/4/5) | ✅ | `docs/decisions/D-627-01.md` + CHANGELOG [Unreleased] |
| #627 fix#2 DESCOPED → follow-up | ✅ | D-627-01 (rationale) + CHANGELOG + `#636` filed + `.roadmap/issue-636.md` |
| #623 rolling-topup prose honesty | ✅ | `docs/decisions/D-623-01.md` + CHANGELOG; three surfaces corrected |
| #628 three-tier speculation + freeze-legal example | ✅ | frontier-batch.md + workflow-planner.md + README.md; CHANGELOG |
| Goal-Attestation enum relocation | ✅ | `docs/api.md` `### Goal Attestation` (n2 verified by grep on 4 of 6 surfaces + api.md) |

## No-impact surfaces (correctly untouched)

- `README.md` — no user-facing feature/install/env change (prose-internal routing edit).
- `.env.example` — no new env vars.
- `docs/architecture.md` / `docs/workflow-state-contract.md` — no structural/state-contract change.
- `docs/conventions.md` — the ~150-line skeleton target it already documents is what #627 restores toward; no edit needed.

## Verdict

Docking clean. Every public/behavioral-adjacent change (the descope, the topup-scope correction, the speculation-tier
framing, the enum relocation) is reflected in an ADR + CHANGELOG, and the deferred fix#2 is filed as #636. No gaps.
