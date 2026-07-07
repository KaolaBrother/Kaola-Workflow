# Documentation Docking — issue-630 (two-layer routing-surface generation seam)

## Changed files (git diff vs merge-base)
Code (new): scripts/generate-routing-surfaces.js, scripts/test-generate-routing-surfaces.js, templates/routing/required-blocks.js, plan-run.skeleton.md, next.skeleton.md, slots.js, rename-table.js.
Code (modified): scripts/test-route-reachability.js (manifest checker + red-proof + superset), package.json (4-chain --check wiring).
Docs: docs/conventions.md (§ Routing/adaptive: generation contract), docs/decisions/D-630-01.md (NEW), CHANGELOG.md.
The 12 plan-run/next routing surfaces: BYTE-UNCHANGED (no-op capture) — nothing to dock.

## Doc-vs-change reconciliation
| Change | Doc reflected? | Where |
|---|---|---|
| Two-layer generation seam (manifest + generator) | ✅ | D-630-01 + CHANGELOG ### Added + docs/conventions.md |
| 12 surfaces GENERATED — edit templates/routing/ + --write, never hand-edit | ✅ | docs/conventions.md § Routing/adaptive |
| --check byte-guard in all 4 chains | ✅ | conventions.md + CHANGELOG + package.json |
| Finalize Layer-1-only (manifest-guarded, hand-authored) | ✅ | D-630-01 + conventions.md |
| Silent-block-drop impossible by construction (#624 class) | ✅ | D-630-01 Decision + CHANGELOG |
| Behavior-preserving no-op capture (surfaces byte-unchanged) | ✅ | D-630-01 + CHANGELOG |
| Accepted residual (fn-closure-audit) → #637 | ✅ | D-630-01 Non-goals + CHANGELOG + #637 filed |
| Design provenance | ✅ | docs/investigations/2026-07-08-...md (already on main) |

## No-impact surfaces (correctly untouched)
- README.md / docs/api.md / docs/architecture.md / .env.example — no user-facing feature/API/env/architecture change beyond the internal generation infra (documented in conventions + ADR); no new env vars.
- The 12 generated routing surfaces + the 6 finalize surfaces — byte-unchanged (the seam is a no-op capture; docs/workflow-state-contract.md unaffected).
- #624-fix gate pins + gitea/gitlab mr|pr) finalize-sink pins — deliberately untouched.

## Verdict
Docking clean. Every behavioral-adjacent aspect (the two layers, the generation contract, the by-construction guarantee, the no-op-capture property, the accepted residual → #637) is reflected in D-630-01 + CHANGELOG + docs/conventions.md.
