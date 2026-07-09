evidence-binding: n3-fix-toml-parser 834977412fc2
upstream_read: n1-map-surfaces 1a20e9920656
upstream_read: n2-codex-runtime-evidence 6143b63e7918

assigned_task: n3-fix-toml-parser
status: partial - implementation and focused validation complete; Meta validation interrupted by parent wait budget.

summary:
- Extended parseTomlTableName in all seven lock-step helper copies to parse bare, basic quoted, literal quoted, and array-of-table TOML headers well enough to reset current-table state.
- Added regression coverage for dotted [features.multi_agent_v2] followed by quoted [projects."..."] and [plugins."..."] tables, plus array-of-table literal quoted segments.
- Added bounds coverage proving a later quoted unrelated table with max_concurrent_threads_per_session does not over-collect into features.multi_agent_v2.
- Duplicate-key ambiguity guard logic was not changed.
- MULTI_AGENT_V2_BOUNDS_NOTE was not changed; existing note assertions remain unchanged.

implementation_files_changed:
- scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js

tests_changed:
- scripts/test-install-model-rendering.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

RED:
- Command: node scripts/test-install-model-rendering.js
- Result: FAIL exit 1 before implementation.
- Failing signature: AssertionError [ERR_ASSERTION]: #647 quoted project/plugin tables after dotted v2 table reset parser state: dispatch_mode; actual "v1-thread-id"; expected "v2-task-name"; at scripts/test-install-model-rendering.js:332 and :360.

GREEN:
- Command: node scripts/test-install-model-rendering.js
- Result: PASS exit 0 after implementation.
- Passing signature: Install model rendering tests passed.

validation_commands:
- PASS: node scripts/test-install-model-rendering.js
- PASS: node scripts/validate-script-sync.js
  Output signature: OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.
- PASS: node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
  Output signature: Kaola-Workflow walkthrough simulation passed.
- PASS: node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  Output signature: GitLab workflow script tests passed.
- PASS: node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  Output signature: Gitea workflow script tests passed.
- INTERRUPTED: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
  Result: exit 130 after parent wait budget expired and the process was stopped with Ctrl-C.
  Progress observed: Claude chain completed and Codex chain had started; interruption occurred during the Codex chain's simulate-kaola-workflow-walkthrough output before the full Meta command completed.
  Classification: tooling/operational interruption, not an observed behavior/test failure in the scoped change.

current_blocker:
- Full Meta validation remains incomplete because the parent wait budget expired while it was still running.

repair_R1:
- status: focused repair complete; full cross-edition validation interrupted by parent wait budget.
- finding: Quoted single-segment TOML table names containing dots, such as `['features.multi_agent_v2']` and `["features.multi_agent_v2"]`, were being collapsed to the same scanner state as nested `[features.multi_agent_v2]`.
- fix: parse TOML table headers into path segments and match `features.multi_agent_v2` only when the parsed header has two path segments. Literal quoted single-segment dotted tables still reset scanner state, but no longer enable v2 or collect v2 numeric bounds.
- duplicate-key ambiguity fail-closed behavior: preserved; the existing `record()`/ambiguous handling was not changed.

repair_R1_changed_files:
- scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- scripts/test-install-model-rendering.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

repair_R1_RED:
- Command: node scripts/test-install-model-rendering.js
- Result: FAIL exit 1 before implementation.
- Failing signature: `AssertionError [ERR_ASSERTION]: #647 basic quoted literal dotted table must not enable v2: dispatch_mode`; actual `v2-task-name`; expected `v1-thread-id`; at `scripts/test-install-model-rendering.js:332` and `:360`.

repair_R1_GREEN:
- Command: node scripts/test-install-model-rendering.js
- Result: PASS exit 0 after implementation.
- Passing signature: `Install model rendering tests passed`.

repair_R1_validation_commands:
- PASS: node scripts/test-install-model-rendering.js
- PASS: node scripts/validate-script-sync.js
  Output signature: `OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.`
- PASS: node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
  Output signature: `Kaola-Workflow walkthrough simulation passed.`
- PASS: node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  Output signature: `GitLab workflow script tests passed.`
- PASS: node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  Output signature: `Gitea workflow script tests passed.`
- INTERRUPTED: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
  Result: exit 130 after parent wait budget expired and the process was stopped with Ctrl-C.
  Progress observed: Claude chain reached `scripts/test-release.js` closure-audit fixtures after passing `test-adaptive-node.js`, `test-plan-run.js`, bundle suites, route reachability, contract validation, fast/full/phase4 advance tests, and many release/finalize fixtures. Codex/GitLab/Gitea chains had not started.
  Classification: tooling/operational interruption, not an observed behavior/test failure in the R1 TOML parser repair.

repair_R2:
- status: bounded repair complete; full cross-edition validation interrupted by parent wait budget.
- finding: Unsupported array-of-table headers `[[features.multi_agent_v2]]` and `[[features."multi_agent_v2"]]` were treated as regular `[features.multi_agent_v2]` config, enabling v2 and adopting numeric bounds.
- fix: `parseTomlTableName` now preserves array-of-table metadata, and `tomlTableNameMatches` rejects array-of-table contexts while still letting valid array headers reset scanner state.
- R1 behavior preserved: quoted single-segment dotted tables such as `['features.multi_agent_v2']` and `["features.multi_agent_v2"]` still reset state without matching nested v2.
- duplicate-key ambiguity fail-closed behavior: preserved; the `record()` ambiguity logic was not changed.
- exact array header result: `[[features.multi_agent_v2]]` and `[[features."multi_agent_v2"]]` no longer enable v2 or adopt `max_concurrent_threads_per_session`; an exact array header after a real `[features.multi_agent_v2]` table resets state and does not over-collect bounds.

repair_R2_changed_files:
- scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- scripts/test-install-model-rendering.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

repair_R2_RED:
- Command: node scripts/test-install-model-rendering.js
- Result: FAIL exit 1 before implementation.
- Failing signature: `AssertionError [ERR_ASSERTION]: #647 R2 array-of-table dotted v2 table must not enable v2: dispatch_mode`; actual `v2-task-name`; expected `v1-thread-id`; at `scripts/test-install-model-rendering.js:332` and `:362`.

repair_R2_GREEN:
- Command: node scripts/test-install-model-rendering.js
- Result: PASS exit 0 after implementation.
- Passing signature: `Install model rendering tests passed`.

repair_R2_validation_commands:
- PASS: node scripts/test-install-model-rendering.js
- PASS: node scripts/validate-script-sync.js
  Output signature: `OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.`
- PASS: git diff --check
- PASS: node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
  Output signature: `Kaola-Workflow walkthrough simulation passed.`
- PASS: node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  Output signature: `GitLab workflow script tests passed.`
- PASS: node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
  Output signature: `Gitea workflow script tests passed.`
- INTERRUPTED: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
  Result: exit 130 after parent wait budget expired and the process was stopped with Ctrl-C.
  Progress observed: Claude chain completed; Codex chain completed; GitLab chain had passed contract validation and `simulate-gitlab-workflow-walkthrough.js` when interrupted before the remaining GitLab chain commands and before the Gitea chain.
  Classification: tooling/operational interruption, not an observed behavior/test failure in the R2 TOML parser repair.
