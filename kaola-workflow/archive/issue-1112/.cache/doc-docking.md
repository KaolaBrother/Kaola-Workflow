# Documentation docking — issue-1112

Candidate: workflow/issue-1112 @ 9ba77d37 (rebased onto main 17aba5d8)

| File | Result |
|---|---|
| CHANGELOG.md | FIXED — [Unreleased] ### Fixed #1112 entry, merged into the single section with #1110 (Fixed) and #1111 (Changed) |
| docs/api.md | FIXED — install-droid.sh and install-all.sh rows (shared root, runtime-neutral renders, preflight-before-any-write, missing/stale/conflict, advisory note, off-PATH wording) |
| docs/droid-edition.md | FIXED — install layout, native facts (both roots supported), cross-runtime note, uninstall/check semantics |
| docs/runtime-capabilities.md | FIXED — droid_skills fact lists ~/.factory/skills and ~/.agents/skills (observed 2026-09-28) |
| templates/agents/runtime-capabilities.json | FIXED — source of the droid_skills fact |
| install-droid.sh header/usage | FIXED — public-interface comments/usage |
| README.md | NO IMPACT — names the Droid installer and dispatch only; no skills path |
| docs/README.md index | NO IMPACT — no new doc |
| ADR | NO IMPACT — distribution choice for one installer, no design-record change |

DOCKED
