# Adaptive Workflow Plan — bundle-600-601

<!-- plan_hash: 2f9bb73780561d874a0bf98fa3df80e7d53f721406c7dbc63ba9f496ac431cf1 -->

bundle(area:scripts): (#600) the Claude edition never installs the `synthesizer` agent —
`install.sh`/`uninstall.sh` `REQUIRED_AGENTS` list 14 of 15 roles; and (#601) the Codex
dispatch-posture remediation leads with the undocumented, server-gated `ultra` reasoning
effort — reorder it to lead with the always-available documented in-session explicit ask.

## Meta
speculative_open_policy: auto

labels: bug, enhancement, area:scripts

validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Two genuinely-independent, exact-path-disjoint concerns share this same-scope (`area:scripts`)
bundle, authored as an antichain so the scheduler can overlap them.

**#600 (synthesizer install).** `agents/synthesizer.md` already exists, already carries
`model: opus` in its own front matter (so it is Opus-floor in BOTH profiles with NO
`profiles/higher/` override needed — the install rewrites the file to `model: inherit` and the
emitted `.kaola-agent-models.json` manifest carries the real `opus`), is already in
`validate-vendored-agents.js` `localAgents`, `kaola-workflow-plan-validator.js` `CANONICAL_ROLES`,
all three `config/agents.toml` codex-dispatch tables, and is installed by the Codex/opencode
runtimes (all assert 15). The ONLY miss is `install.sh` + `uninstall.sh` `REQUIRED_AGENTS`, which
list 14 (the plan-validator agent-registration-gap check only fires when a plan ADDS a new agent
FILE, so the #463 addition slipped install/uninstall). No Claude-side count/roster pin asserts 14
(grepped): `test-install-model-rendering.js`'s roster loop is a 12-name subset that omits synthesizer
AND issue-scout and never asserts a count. The RED-first test (n1) adds the synthesizer roster +
manifest→opus assertion to the claude-chain `test-install-model-rendering.js`; the fix adds
synthesizer to both `REQUIRED_AGENTS` arrays. Cross-edition parity (AC4) is verified by the union of
existing edition chains once the claude chain also asserts 15 — no new parity harness needed.

**#601 (remediation reorder).** The `dispatchPostureRemediation` helper is duplicated across TWO
byte-groups enforced by `validate-script-sync.js`: the installer group
(`install-codex-agent-profiles.js` ×3) and the preflight group (`kaola-workflow-codex-preflight.js`
×4), so all seven files MUST move together. The same wording is quoted in prose (README Codex
section, `docs/api.md`, and the `workflow-init` config-audit blockquote across 3 editions ×
command+skill = 6 surfaces). Because the identical wording lives in BOTH code and prose, the whole
reorder is authored in ONE node (n3) so the wording is written once and propagated consistently —
semantically-coupled cross-edition prose must not be split. The reorder LEADS with "explicitly ask
for sub-agents/delegation/parallel work in-session" (always available, officially documented) and
THEN offers the effort route qualified as "if your Codex exposes an ultra reasoning effort for your
model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker)". It is behavior-
PRESERVING: no change to `deriveDispatchPosture`, still REPORT/WARN non-fatal, and every pinned
substring the suites already assert (`model_reasoning_effort = "ultra"`, `codex -c
model_reasoning_effort=ultra`, `0.142.5`, the proactive-suppresses-remediation check) is retained.
There are NO contract-validator needles pinning the remediation text (grepped — only the codex
walkthrough + the two forge `test-*-workflow-scripts.js` assert it). The RED-first order assertion
(in-session ask must precede the effort clause) is added to those three suites; byte-identity of the
preflight group means verifying the plugin preflight order transitively covers the root
`scripts/kaola-workflow-codex-preflight.js` copy, so `test-install-model-rendering.js` (owned by #600)
is deliberately LEFT to #600 and #601 does not touch it — keeping the two lanes exact-path disjoint.
The opencode `workflow-init` mirror structurally STRIPS the Codex config-audit blockquote (the
`sync-opencode-edition.js` note-cleanup consumes the whole `>` body), so changing the wording inside
it does not drift the opencode mirror; the ride-along `install-opencode.sh:28` comment ("6 files … auto
…") is corrected to 5 (auto was removed in v6.11.0). No ADR is authored — both changes are a
roster-omission fix and a behavior-preserving wording reorder; the CHANGELOG `[Unreleased]` entries
(one Fixed for #600, one Changed for #601) at the sink are the durable record.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-synth-install | tdd-guide | — | install.sh, uninstall.sh, scripts/test-install-model-rendering.js | 1 | sequence | sonnet |
| n2-synth-review | code-reviewer | n1-synth-install | — | 1 | sequence | sonnet |
| n3-remediation-reorder | tdd-guide | — | plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, README.md, docs/api.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, install-opencode.sh | 1 | sequence | sonnet |
| n4-remediation-review | code-reviewer | n3-remediation-reorder | — | 1 | sequence | opus |
| n5-finalize | finalize | n2-synth-review, n4-remediation-review | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-synth-install | complete |
| n2-synth-review | complete |
| n3-remediation-reorder | complete |
| n4-remediation-review | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-synth-install) | subagent-invoked | deferred_to_group | |
| tdd-guide (n3-remediation-reorder) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n2-synth-review dc5425f04c53 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize f174c800bcd0 | |
