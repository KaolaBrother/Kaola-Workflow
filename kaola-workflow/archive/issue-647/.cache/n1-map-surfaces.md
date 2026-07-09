evidence-binding: n1-map-surfaces 1a20e9920656

findings: See detailed findings below.

Facts:
- Read-only node; no files edited.
- The four `kaola-workflow-codex-preflight.js` copies are:
  - `scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`
  - `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`
- The three `install-codex-agent-profiles.js` copies are:
  - `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`
  - `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`
  - `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js`
- Current SHA-256 lock-step proof:
  - all four preflight copies: `330c08f03f2e62787ead292dde21678b75e18cec5897d7f2abff9bfbbbe8f74a`
  - all three installer copies: `bf5000c802d3eb92ae709ab194a68b5d923b17eb1b0803387f43d88d56f34639`
- `node scripts/validate-script-sync.js` currently passes: `OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.`

Lock-step helper surfaces:
- `parseTomlTableName` currently accepts only unquoted bare table names via `/^\s*\[([A-Za-z0-9_.-]+)\]\s*$/`: preflight copies at `scripts/kaola-workflow-codex-preflight.js:119`; installer copies at `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:744`.
- `detectCodexDispatchMode` calls `parseTomlTableName` and keeps the last table name until another recognized table header appears: preflight `scripts/kaola-workflow-codex-preflight.js:179` with table update at `:200-203`; installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:804` with table update at `:825-828`.
- `parseFeaturesMultiAgentEnabled` also depends on `parseTomlTableName`: preflight `scripts/kaola-workflow-codex-preflight.js:246-279`; installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:851-884`.
- `parseMultiAgentV2NumericFields` also keeps the last recognized table name; quoted unrelated tables after `[features.multi_agent_v2]` can be scanned as if still in the v2 table: preflight `scripts/kaola-workflow-codex-preflight.js:371-418`; installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:976-1023`.
- Bounds note constants are duplicated at preflight `scripts/kaola-workflow-codex-preflight.js:349-356` and installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:954-961`.
- Exported pure helpers available for tests: preflight `scripts/kaola-workflow-codex-preflight.js:1493-1518`; installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:1179-1206`.

`validate-script-sync.js` mirror groups:
- `COMMON_SCRIPTS` includes `kaola-workflow-codex-preflight.js`, enforcing root `scripts/` to `plugins/kaola-workflow/scripts/` parity at `scripts/validate-script-sync.js:44-66` and loop `:516-524`.
- `BYTE_IDENTICAL_GROUPS` includes the four-file `codex-preflight copies` group at `scripts/validate-script-sync.js:186-197` and the three-file `codex agent-profile installer copies` group at `:198-207`, checked at `:526-530`.

Current before-fix behavior observed via exported root preflight helpers:
- Simple dotted-table v2 passes: `detectCodexDispatchMode('[features.multi_agent_v2]...')` returns `v2-task-name`; `deriveMultiAgentV2Bounds('[features.multi_agent_v2]...max_concurrent_threads_per_session = 2...', true)` returns configured width `1` and all numeric fields.
- Quoted-table leak currently reproduces: `[features.multi_agent_v2] enabled = true` followed by quoted `[projects."/tmp/proj"]` and quoted `[plugins."example"] enabled = true` returns `dispatch_mode: "v1-thread-id"`, `multi_agent_v2_enabled: false`.
- Numeric over-collection currently reproduces: `[features.multi_agent_v2] enabled = true` followed by quoted `[mcp_servers."srv"] max_concurrent_threads_per_session = 99` returns `max_concurrent_threads_per_session: 99`, `effective_subagent_width: 98`.

Declared test surfaces and recommended insertion points:
- `scripts/test-install-model-rendering.js`: add dispatch quoted-table regression after `:358`; add bounds regression near `:441-450` and pure-function fixture near `:616-617`.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`: add dispatch quoted-table regression after `:1009`; add bounds regression near `:1207-1225`.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`: add dispatch quoted-table regression after `:3649`; no existing bounds assertions found.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`: add dispatch quoted-table regression after `:3601`; no existing bounds assertions found.
- Bounds fixture should use `[features.multi_agent_v2] enabled = true`, then an unrelated quoted table such as `[mcp_servers."srv"] max_concurrent_threads_per_session = 99`; expected result should remain observed default `4`, source `observed_default`, width `3`, and should not adopt `99`.

Likely validation commands:
- `node scripts/validate-script-sync.js`
- `node scripts/test-install-model-rendering.js`
- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Full plan validation: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`

Assumptions:
- Line numbers are from `/Users/ylpromax5/.codex/worktrees/kaola-workflow-issue-647-standalone/.kw/worktrees/issue-647`.
- Because helper families are byte-identical within groups, canonical line numbers for one file apply to each copy in that group.
- Keep `parseTomlTableName` unexported unless a separate reason appears; current tests can exercise via exported helpers and subprocess paths.

Unknowns / plan blockers:
- No blocker found for implementation.
- Open implementer design choice: whether to add forge bounds tests in GitLab/Gitea despite no existing bounds assertions, or rely on byte-identical installer groups plus root/Codex plugin bounds coverage.
