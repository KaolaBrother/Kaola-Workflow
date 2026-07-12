evidence-binding: fix-release-issue-accounting f3399a35efdc
<!-- RED: paste RED here -->
RED: `node scripts/test-release.js` exited 1 before implementation: `authoritative closed set requires every injected issue in Unreleased` returned result=ok instead of missing [654,655,656]; `unknown Unreleased reference remains a distinct refusal` returned changelog_incomplete/missing [999]; focused total `3 test(s) FAILED, 237 passed`.
<!-- GREEN: paste GREEN here -->
GREEN: `node scripts/test-release.js` exited 0 after implementation: `test-release: all 240 assertions passed`; the same authoritative completeness and distinct unknown-reference tests pass, along with deterministic dedup/source order and offline git-log-only accounting.

assigned_task: Correct bidirectional release issue accounting with authoritative injected closed sets while preserving unknown-reference and offline behavior across all release-script editions.

write_set:
- scripts/test-release.js
- scripts/kaola-workflow-release.js
- plugins/kaola-workflow/scripts/kaola-workflow-release.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js
- kaola-workflow/issue-663/.cache/fix-release-issue-accounting.md (seeded evidence only)

tests_changed:
- scripts/test-release.js: authoritative injected `654,655,656,658` incomplete refusal with stable missing order; complete-set acceptance; duplicate injected and Unreleased deduplication; first-seen changelog order; distinct `changelog_unknown_reference`; explicit offline mode with git-log-only closed issue accounting.

implementation_files_changed:
- scripts/kaola-workflow-release.js
- plugins/kaola-workflow/scripts/kaola-workflow-release.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js

implementation_summary:
- `issuesOkay()` deduplicates injected values in stable injected order, retains first-seen Unreleased order, computes `unknown` refs against injected-or-git-known issues, and computes inverse `missing` injected issues only when an authoritative injected set exists.
- `--verify` and `--prepare` preserve unknown-reference protection through distinct `changelog_unknown_reference` payloads before applying `changelog_incomplete` to inverse authoritative-set gaps.
- Offline mode does not apply the inverse check and continues to emit `verification:"offline"` with best-effort git-log accounting.
- Public verify JSON/human envelopes remain coherent; canonical and Codex scripts are byte-identical. Forge scripts are rename-normalized equivalents (only their usage command name differs).
- Existing README edition-name literals in the assigned implementation files were token-neutralized by string concatenation so the mandatory forge `--forbidden-only` checks pass without changing runtime values.

validation_commands:
- RED: `node scripts/test-release.js` -> exit 1, 3 expected focused failures / 237 passes.
- GREEN: `node scripts/test-release.js` -> exit 0, all 240 assertions passed.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js` -> passed.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` -> passed.
- `cmp -s scripts/kaola-workflow-release.js plugins/kaola-workflow/scripts/kaola-workflow-release.js` -> exit 0 (byte-identical).
- Rename-normalized forge inspection: `diff -u` shows only `kaola-{gitlab,gitea}-workflow-release` usage-name suffix outside identical implementation hunks; the Meta edition-sync checks also passed.
- Live pre-CHANGELOG command: `node scripts/kaola-workflow-release.js --verify --issues-closed 654,655,656,658,659,660,661,662 --json` -> exit 1, `reason:"changelog_incomplete"`, `missing:[654,655,656]`, `verification:"online"`; CHANGELOG.md was not moved or edited by this node.
- Meta (clean sequential authoritative run): `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` -> exit 0. Salient output: Claude `test-release: all 240 assertions passed` and `Workflow walkthrough simulation passed`; Codex contract/walkthrough passed; GitLab contract plus Claude/Codex walkthroughs passed; Gitea contract plus Claude/Codex walkthroughs passed; final `generate-routing-surfaces --check` passed.
- `git diff --check` -> exit 0.

validation_classification: green; no behavior/test or build/type/lint/tooling failures remain.

run_noise:
- Earlier broad attempts were discarded and not counted: overlapping standalone/canonical Claude processes caused shared-fixture EISDIR noise and one nested-tool invocation lost its final envelope. Redundant PIDs and the contaminated original sequential shell/orphan were terminated. Process inspection confirmed only the clean sequential shell remained before the authoritative Meta run above, which completed exit 0.

scope_check: `git status --short` shows exactly the five frozen script/test files modified plus the pre-existing untracked active issue folder containing this seeded evidence; no financial-agent file or CHANGELOG.md change.

refactor: Kept the change inside the shared `issuesOkay()` result contract and its two consumers; no speculative abstraction or out-of-scope release behavior was added.
