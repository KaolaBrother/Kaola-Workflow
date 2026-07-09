# Workflow Plan - issue 647

<!-- plan_hash: 91aa999583f96fa1d277dd46ee4b6f6315f39b6983602104753ddb0bfb1d5bb2 -->

Fix the Codex TOML table-state leak in the lock-step preflight and installer parser helpers. The
implementation must preserve the existing duplicate-key fail-closed behavior while recognizing valid
TOML table headers that use quoted segments or array-of-table brackets, then prove the fix across the
root preflight script, plugin mirror copies, installer mirror copies, and the edition assertion
surfaces that exercise Codex dispatch-mode and multi-agent-v2 bound reporting.

## Meta
speculative_open_policy: auto

labels: workflow:in-progress
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-map-surfaces | code-explorer | - | - | 1 | sequence | standard |
| n2-codex-runtime-evidence | knowledge-lookup | - | - | 1 | sequence | standard |
| n3-fix-toml-parser | tdd-guide | n1-map-surfaces, n2-codex-runtime-evidence | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 11 | sequence | standard |
| n4-review | code-reviewer | n3-fix-toml-parser | - | 1 | sequence | reasoning |
| n5-adversarial-repro | adversarial-verifier | n4-review | - | 1 | sequence | reasoning |
| n6-finalize | finalize | n5-adversarial-repro | CHANGELOG.md | 1 | sequence | - |

## Node Briefs

### n1-map-surfaces
Map the exact lock-step surfaces before any implementation: the four `kaola-workflow-codex-preflight.js`
copies, the three plugin `install-codex-agent-profiles.js` copies, `validate-script-sync.js` mirror
groups, and the existing dispatch-mode / multi-agent-v2 bounds assertions in the declared test
surfaces. Record which assertions already cover simple dotted-table v2 and where the new quoted-table
regressions should be added.

### n2-codex-runtime-evidence
Gather source-backed Codex runtime evidence without editing files. Prefer official OpenAI/Codex
documentation or manual text for supported config shapes; if the docs are silent, use direct local
environment verification from non-secret config shape observations or hermetic fixtures. Record the
minimum evidence needed for downstream agents to justify treating quoted `[projects."..."]`,
`[plugins."..."]`, and similar tables as real Codex config shapes.

### n3-fix-toml-parser
Read `n1-map-surfaces` and `n2-codex-runtime-evidence` before starting. RED first: add regression
coverage for a `[features.multi_agent_v2]` dotted table followed by quoted `[projects."..."]` and
`[plugins."..."]` tables so dispatch stays `v2-task-name`, plus a later quoted unrelated table with
`max_concurrent_threads_per_session` so bounds do not over-collect. Cover array-of-table headers and
basic/literal quoted segments where the local helper shape makes that cheap. GREEN by extending
`parseTomlTableName` in all seven lock-step helper copies to recognize valid quoted-segment and
array-of-table headers well enough to reset current-table state; exact quoted segment fidelity is only
needed for comparisons against `features` and `features.multi_agent_v2`. Keep the duplicate-key
ambiguity guard unchanged. If the multi-agent-v2 bounds note is changed to avoid the scalar/table
conflict, update its mirrored copies and the existing note assertions in this same node. Run focused
tests for the edited assertion surfaces, then reuse the Meta `validation_command` for full validation.

### n4-review
Review the parser and tests as a cross-edition Codex runtime bug fix. Confirm the seven helper copies
remain in their byte-identical mirror groups, the test fixtures fail on the original parser behavior,
the duplicate-key ambiguity behavior did not weaken, and no unrelated config parsing behavior was
broadened. Verify the four-chain command recorded in Meta is green or identify the exact blocker.

### n5-adversarial-repro
Try to refute the fix after review. Use direct config strings or focused scripts to reproduce both
failure arms: quoted tables after `[features.multi_agent_v2]` must not make detection fall back to
v1, and numeric fields under unrelated quoted tables must not be adopted as v2 bounds. Also probe
comments, literal quoted segments, and array-of-table headers for table-state leaks. Return a verdict
with blocking findings only if a real regression or unproven acceptance criterion remains.

### n6-finalize
Finalize only after the review and adversarial verdict pass. Add the concise user-visible
`CHANGELOG.md` entry for the Codex TOML quoted-table parser fix and preserve all existing changelog
formatting.

## Node Ledger

| id | status |
| --- | --- |
| n1-map-surfaces | complete |
| n2-codex-runtime-evidence | complete |
| n3-fix-toml-parser | complete |
| n4-review | complete |
| n5-adversarial-repro | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-map-surfaces) | subagent-invoked | evidence-binding: n1-map-surfaces 1a20e9920656 | |
| knowledge-lookup (n2-codex-runtime-evidence) | subagent-invoked | evidence-binding: n2-codex-runtime-evidence 6143b63e7918 | |
| tdd-guide (n3-fix-toml-parser) | subagent-invoked | evidence-binding: n3-fix-toml-parser 834977412fc2 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review b0239a9f8a44 | |
| adversarial-verifier (n5-adversarial-repro) | subagent-invoked | verdict: fail | |
| finalize (n6-finalize) | main-session-direct | n/a: finalize opened before adversarial repair was routed; closing this stub so  | |
