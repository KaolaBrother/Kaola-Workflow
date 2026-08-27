## Summary

One integrated candidate closes #1039 and #1037. PR #1040 was closed unmerged so the runtime-surface and active-run changes could converge under one review/freeze cycle.

- **#1039:** global-first, receipt-owned Cursor installation with distinct standalone CLI, App local IDE, and App-started Cloud host facts.
- **#1037:** outcome-level missions, failure-frontier convergence, and per-managed-change active-run instruction adoption without changing the four-field Mission List.

Final candidate: `58d26e916dd9313f2aa5e671ea463cca1792895e` (base `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`).

## Cursor installation and surfaces (#1039)

- `install-cursor.sh --global` writes only the executing machine's `${CURSOR_HOME:-~/.cursor}` authority and never mutates an ambient Git repository. Explicit `--target DIR` materialization is receipt/hash/ownership bound, collision- and symlink-safe, idempotent, and uninstall-safe.
- `install-all.sh` installs only the computer where it runs. It has no Cursor Cloud deployment mode; `--cloud` is rejected before any installer runs.
- Only after an Agent establishes it is inside Cursor Cloud environment setup may it install the Workflow for that remote machine and selected repository. The user manually saves the tested Build, then opens a new top-level Cloud Agent in the same repository and verifies its Build/live catalog.
- Standalone CLI point-of-use materialization remains limited to the measured CLI/local surface. Cursor App local IDE and Cloud do not inherit that rule; `sessionStart` performs compact resume only.
- `--doctor` reports the selected product/host without inference. Historical Cloud evidence remains typed under its evidence stamp; absent a current live observation, current Build/catalog/capability fields remain unknown.
- A `--no-scripts` transition retains receipt ownership of prior non-missing skipped assets and hook entries, so uninstall remains complete for unchanged owned bytes. A later ordinary project install promotes a partial authority before materialization without retiring an independently active receipt-owned global live hook.

### Live surface evidence

- **Standalone CLI** `2026.08.25-3e8eec8`: explicit project catalog; exact `implementer` dispatch; raw Task carrier resolved `cursor-grok-4.6-medium`.
- **Cursor App local IDE** `3.17.21`: independent 14-role catalog and exact `implementer` dispatch; child model/profile source remains unobservable.
- **Cursor Cloud negatives:** a branch catalog not installed by the environment Build and a saved user-global-only Build both remained built-in-only.
- **Cursor Cloud positive:** environment setup installed exact candidate `101250f293a5439ed73e8ee2127c7501fba9e883` for the remote authority plus selected repository. The user manually saved Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`. New same-repository parent `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d` visibly used that Build, exposed nine native plus all 14 Kaola types, and exact `implementer` child `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49` returned `PROBE_OK_CURSOR_CLOUD_FINAL_SAVED_REPO_IMPLEMENTER` with no substitute, per-call model override, or repository mutation.
- Receipt-less released 10.0.1 Cursor installs converge only under exact published per-forge hashes; a one-byte mutation remains an unmanaged collision.

## Active-run adoption and convergence (#1037)

- `workflow-init` remains runtime-independent and installs no runtime/global assets.
- The project-instruction helper classifies each managed change independently as `authority_layout_equivalent`, `execution_default_change`, `state_schema_incompatible`, or `unknown_or_mixed`.
- Compatible layout applies without freezing an unrelated safe handoff. Execution-default changes require explicit conversation consent bound to an unchanged plan; incompatible state remains preserved and fenced.
- Claim, branch, worktree, Mission List bytes/results, and live dispatch locators are never migrated by this helper.
- Missions remain the ADR 0017 four fields and describe outcomes, not selectors, commands, attempts, roles, models, or scheduler nodes.
- The run used one affected-frontier convergence pass, one immutable candidate, and one final independent review batch.

## Validation

- `node scripts/test-cursor-edition.js` — 788 assertions
- `node scripts/test-runtime-agent-architecture.js` — 798 assertions
- `node scripts/test-install-all.js` — 275 assertions
- `node scripts/test-generate-routing-surfaces.js` — 520 assertions
- `node scripts/simulate-workflow-walkthrough.js` — 179/179
- `npm test` — all Claude, Codex, GitLab, and Gitea local chains passed
- Exact-SHA producer receipt: clean `58d26e916dd9313f2aa5e671ea463cca1792895e`, codeTreeHash `b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54`, all four chains exited 0 once, with no accepted RED, retry, timeout, or signal.

Fixes #1039
Fixes #1037
