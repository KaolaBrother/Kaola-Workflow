# Documentation Docking — issue-636 (build run: cross-runtime dispatch-pin single-sourcing)

## Changed files (git diff vs merge-base)
Code/prose (12): 3 plan-run commands + 3 plan-run SKILLs (fenced blocks + PIN markers); test-route-reachability.js; validate-workflow-contracts.js + byte mirror; validate-kaola-workflow-contracts.js; gitlab + gitea contract validators.
Docs (2): docs/decisions/D-636-01.md (NEW); CHANGELOG.md.

## Doc-vs-change reconciliation
| Change | Doc reflected? | Where |
|---|---|---|
| #636 dead-prose fence + pin relocation | ✅ | CHANGELOG [Unreleased] ### Fixed + D-636-01 |
| The #611-fork SKILL-only load-bearing correction | ✅ | CHANGELOG + D-636-01 (recorded as the designed-out four-chain-red risk) |
| Two semantic PIN markers set up #630 slot boundaries | ✅ | CHANGELOG + D-636-01 Consequences |
| #636 = #627's descoped fix#2 completed | ✅ | CHANGELOG + D-636-01 Context (links D-627-01) |
| Design provenance | ✅ | docs/investigations/2026-07-08-630-636-routing-generation-seam.md (already on main from the shaping run) |

## No-impact surfaces (correctly untouched)
- README.md / docs/api.md / docs/architecture.md / .env.example — the change is a behavior-preserving contract relocation; no user-facing feature, API, env, or architecture change. `docs/conventions.md` six-surface rule is unchanged (the surfaces still exist + are still pinned; only which surface carries which runtime block moved). No new env vars.
- The gitea/gitlab `mr|pr)` finalize-sink contract pins — deliberately left untouched.

## Verdict
Docking clean. Every behavioral-adjacent aspect (the relocation, the load-bearing correction, the markers, the #627-fix#2 completion) is reflected in the CHANGELOG + D-636-01. #630 remains open (its generation-seam build is next).
