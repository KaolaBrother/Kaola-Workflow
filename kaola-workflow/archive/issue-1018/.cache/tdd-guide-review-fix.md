# TDD guide review fix evidence

Assigned task: repair the shipped walkthrough's profile-class assertion for the three Codex pin
tiers introduced by Issue #1018 / PR #1019, and add heavy-roster parity coverage to the root,
GitLab, and Gitea contract validators. Scope was limited to the four validator/walkthrough test
files, the route-reachability test, and this evidence file.

## Test authored

In `testInstallSchemaPruneManifest332`, each installed role is now classified against
`CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES`, and
`CODEX_PINNED_HEAVY_ROLES`. The assertion still requires exactly one matching class, so a role
missing from all rosters or appearing in more than one roster fails.

## Baseline failure

- Commit: `f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438`
- Command: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Exit: `1`
- Failure signature: `Error: #332 AC3: code-architect must belong to exactly one profile class`
- Stack location: `simulate-kaola-workflow-walkthrough.js:1348:7`

This is the expected baseline failure: `code-architect` belongs to the heavy roster, while the
old assertion only compared standard and reasoning membership.

## Post-edit walkthrough

- Command: `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- Exit: `0`
- Output summary: `testInstallSchemaPruneManifest332 (#332 AC3-AC6,AC9-path): PASSED`, all listed
  walkthrough checks reported `PASSED`, followed by `Kaola-Workflow walkthrough simulation passed`
  and `spawn-census: {"suite":"simulate-kaola-workflow-walkthrough","spawns":171}`.

## Cross-edition parity validators

The root, GitLab, and Gitea contract validators now each compare installer and preflight heavy-role
rosters against their adaptive-schema heavy roster, alongside the existing standard and reasoning
comparisons.

- Command: `node scripts/validate-kaola-workflow-contracts.js` — exit `0`; output:
  `Kaola-Workflow Codex contract validation passed`
- Command: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
  — exit `0`; output: `Kaola-Workflow GitLab contract validation passed`
- Command: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
  — exit `0`; output: `Kaola-Workflow Gitea contract validation passed`

## Claude command dispatch acceptance RED

Added acceptance assertions to
`scripts/test-route-reachability.js` for the canonical Claude command surfaces
`commands/workflow-next.md` and `commands/kaola-workflow-finalize.md`. Each must carry the single
bounded reviewer-class heavy re-dispatch (a reasoning-tier attempt failed to finish the review OR
the surface is judged complex before dispatch) and require each reviewer dispatch to state the
dispatched surface and acceptance. In-memory Grok and Cursor renders of both commands are also
asserted to omit that dynamic reviewer escalation, preserving ADR 0019's declared divergence.

- Baseline commit: `f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438`
- Command: `node scripts/test-route-reachability.js`
- Exit: `1`
- Failure signature (intended RED):
  - `T20 Claude contract: commands/workflow-next.md must carry the one bounded reviewer-class heavy re-dispatch (reasoning-tier attempt failed to finish the review OR surface judged complex before dispatch)`
  - `T20 Claude contract: commands/workflow-next.md must require each reviewer dispatch to state the dispatched surface under review and what acceptance looks like`
  - `T20 Claude contract: commands/kaola-workflow-finalize.md must carry the one bounded reviewer-class heavy re-dispatch (reasoning-tier attempt failed to finish the review OR surface judged complex before dispatch)`
  - `T20 Claude contract: commands/kaola-workflow-finalize.md must require each reviewer dispatch to state the dispatched surface under review and what acceptance looks like`
- Test summary: `Route-reachability test FAILED: 4 failure(s), 551 passed.` The Grok/Cursor divergence
  assertions passed on the same run; no production files were changed.

## T20 explicit heavy re-dispatch model contract

Extended the T20 Claude command assertions in `scripts/test-route-reachability.js` so the sole
reviewer heavy re-dispatch exception must explicitly pass `model="fable"` (accepting the Markdown
backticks around that token) instead of the installed resting reviewer `opus` profile. The existing
Grok/Cursor dynamic-escalation omission assertions remain unchanged.

The shared worktree contained concurrent production wording updates in the two command surfaces
and their routing skeletons before this run; this test change itself touched only the test and this
evidence file.

- Commit at invocation: `f36fab89aefbcbbeb6aed3c7b14f6be7b8fbc438` (with the concurrent uncommitted
  candidate wording present)
- Command: `node scripts/test-route-reachability.js`
- Exit: `0` (GREEN)
- Exact output: `Route-reachability test passed (557 assertions).`

## Additive-edition test comment cleanup

Updated comments only in `scripts/test-grok-edition.js` and `scripts/test-cursor-edition.js` so their
top-level descriptions and Grok runtime/G1 notes describe the standard, reasoning, and heavy
three-tier model contract, including Grok's `xhigh` heavy pin and Cursor's medium/high/xhigh pins.
No executable behavior changed.

- `rg -n -i "two[- ]tier|two canonical model classes" scripts/test-grok-edition.js scripts/test-cursor-edition.js`
  — no matches
- `rg -n "standard/reasoning([^/]|$)" scripts/test-grok-edition.js scripts/test-cursor-edition.js`
  — no matches
- `git diff --check` — passed
