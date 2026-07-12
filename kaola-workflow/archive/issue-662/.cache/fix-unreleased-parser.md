evidence-binding: fix-unreleased-parser 70252d93b933
RED: `node scripts/test-release.js` exited 1 before implementation: `FAIL: Unreleased reaches EOF and deduplicates exact refs in source order ... changelog_refs:[]`; the next-heading, heading-like-text, and `changelog_incomplete` cases failed with the same vacuously empty parse; summary `test-release: 4 test(s) FAILED, 232 passed`.
GREEN: `node scripts/test-release.js` exited 0 after implementation and after refactor: `test-release: all 236 assertions passed`.

Assigned task: Fix the release verifier's vacuously empty `[Unreleased]` parsing with focused RED -> GREEN regression coverage and cross-edition mirror parity.

Write set:
- scripts/test-release.js
- scripts/kaola-workflow-release.js
- plugins/kaola-workflow/scripts/kaola-workflow-release.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js
- kaola-workflow/issue-662/.cache/fix-unreleased-parser.md (evidence only)

Tests changed:
- Added black-box `--verify` regression cases for exact reference values and encounter order, EOF termination, next real level-2 heading termination, non-truncation by level-3/inline heading-like text, source-order deduplication, and exact `changelog_incomplete` `missing:[731]` output.

Implementation files changed:
- Added one forge-neutral `unreleasedSection(text)` helper returning `{ section: '', refs: [] }` when absent, otherwise a structurally bounded section and unique source-ordered refs.
- Reused the helper in both `issuesOkay()` and `runVerify()`, removing the duplicated multiline-dollar parser.
- Preserved the independent `--prepare` `no_unreleased_section` guard.
- Applied the full canonical change to the byte-identical Codex mirror and rename-normalized GitLab/Gitea ports without adding registration surface.

Validation commands:
- RED: `node scripts/test-release.js` -> exit 1, 4 focused failures, 232 passes.
- GREEN/refactor: `node scripts/test-release.js` -> exit 0, 236 assertions passed.
- `cmp -s scripts/kaola-workflow-release.js plugins/kaola-workflow/scripts/kaola-workflow-release.js` -> exit 0.
- `node scripts/validate-script-sync.js --check` -> exit 0; 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 7 forge export-superset families in sync.
- `git diff --check` -> exit 0.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js` -> exit 1, tooling/contract failure on pre-existing `/GitHub/` in the release file's README edition loop (line 204), unrelated to the changed parser.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` -> exit 1, tooling/contract failure on pre-existing `/GitLab/` in the release file's README edition loop (line 204), unrelated to the changed parser.
- Meta validation: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` -> exit 0; all four edition chains passed, including both full forge contract validators and release regression coverage.

Refactor note: Replaced the remaining level-2 terminator expression with `^##[ \\t]+` and uses `text.length` explicitly for EOF, so no multiline `$` acts as the EOF alternative.
