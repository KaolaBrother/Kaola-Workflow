# Documentation Docking — bundle-629-637 (#629 edition-guard net + #637 fn-closure-audit hardening)

## Changed files (git diff vs merge-base)
Code/test (6): validate-script-sync.js, edition-sync.js, test-validate-script-sync.js, test-edition-sync.js (#629); required-blocks.js, test-route-reachability.js (#637).
Docs: docs/decisions/D-629-01.md (NEW), docs/decisions/D-637-01.md (NEW), CHANGELOG.md.

## Doc-vs-change reconciliation
| Change | Doc reflected? | Where |
|---|---|---|
| #629 HOOKS_JSON_FAMILY + agents.toml byte-group + edition-sync create-on-missing | ✅ | D-629-01 + CHANGELOG ### Fixed |
| checkNormalizedFamily/checkByteIdenticalGroup behavior-preserving refactor | ✅ | D-629-01 Decision |
| --check/--write asymmetry residual → #638 | ✅ | D-629-01 Non-goals + CHANGELOG + #638 filed |
| #637 sink_incomplete distinctive interior token + red-proof | ✅ | D-637-01 + CHANGELOG |
| #637 = closed loop from #630's own change-gate adversary | ✅ | D-637-01 Context + CHANGELOG |

## No-impact surfaces (correctly untouched)
- docs/conventions.md — n5-docs judged NOT warranted: both fixes EXTEND already-documented mechanisms (the validate-script-sync guard-family pattern documented for CONFIG_HOOKS_FAMILY/BYTE_IDENTICAL_GROUPS; the Layer-1 manifest content_tokens pattern documented for #630), not a new durable policy. Correct call.
- No hooks.json / config/agents.toml DATA file written (they were already in parity — guard config only).
- README/api/architecture/.env.example — no user-facing feature/API/env change. No new env vars.
- The 12 #630-generated routing surfaces + the 6 finalize surfaces — byte-unchanged (#637 adds a manifest token already present on them).

## Verdict
Docking clean. Both fixes reflected in D-629-01 / D-637-01 + CHANGELOG; the pre-existing --check asymmetry filed as #638; conventions.md correctly untouched.
