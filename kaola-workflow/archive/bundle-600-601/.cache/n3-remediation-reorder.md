evidence-binding: n3-remediation-reorder 3f6231fcde52
<!-- RED: paste RED here -->
RED:
Added order-assertions (indexOf('explicitly ask for sub-agents') < indexOf('model_reasoning_effort = "ultra"')
in the fresh-install stdout) to the three suites that already pin the dispatch-posture remediation
text, then ran each from the leg cwd BEFORE touching the implementation:

- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` -> real exit 1
  `AssertionError: #601: remediation must lead with the in-session ask before the effort-gated
  ultra clause: ... Kaola-Workflow Codex dispatch posture: Codex will refuse sub-agent spawns
  unless explicitly requested this session (multi_agent_mode: explicitRequestOnly). Set
  model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c
  model_reasoning_effort=ultra) for proactive delegation, or explicitly ask for
  sub-agents/delegation/parallel work in-session.`
  (thrown at simulate-kaola-workflow-walkthrough.js:1150, in testCodexDispatchPosture598)

- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> real exit 1
  `AssertionError [ERR_ASSERTION]: #601 gl: remediation must lead with the in-session ask before
  the effort-gated ultra clause: ...` (same old wording, ultra-before-ask)

- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> real exit 1
  `AssertionError [ERR_ASSERTION]: #601 gt: remediation must lead with the in-session ask before
  the effort-gated ultra clause: ...` (same old wording, ultra-before-ask)

All three real exit codes captured directly via `$?` (never piped through tail).

<!-- GREEN: paste GREEN here -->
GREEN:
Reworded `dispatchPostureRemediation()` in the preflight ×4 byte-group
(`scripts/kaola-workflow-codex-preflight.js` + the 3 plugin copies) and the installer ×3
byte-group (`plugins/kaola-workflow{,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js`)
to lead with the always-available in-session ask, then offer the effort route qualified as
undocumented/plan-gated. Propagated the exact new prose to README.md, docs/api.md, and the 6
workflow-init surfaces (3 commands + 3 SKILL.md). Fixed the install-opencode.sh adaptive-core
comment (dropped retired `auto`, corrected "6 files" -> "5 files"). Re-ran all three suites +
the sync/contract gates from the leg cwd, all real exit 0:

- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` -> real exit 0
  `Kaola-Workflow walkthrough simulation passed`
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> real exit 0
  `GitLab workflow script tests passed`
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> real exit 0
  `Gitea workflow script tests passed`
- `node scripts/validate-script-sync.js` -> real exit 0
  `OK: 24 common scripts, 25 byte-identical groups, 8 rename-normalized families, 1
  config/hooks.json family, and 7 forge export-superset families in sync.`
- `node scripts/validate-kaola-workflow-contracts.js` -> real exit 0 (codex contract, provenance
  ban + content parity over the edited workflow-init surfaces)
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` ->
  real exit 0
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` ->
  real exit 0
- `node scripts/edition-sync.js --check` -> real exit 0 (`10 forge aggregator ports in
  rename-normalized parity with canonical`)
- Sanity (not in the declared write set, unmodified): `node scripts/test-install-model-rendering.js`
  -> real exit 0 (`Install model rendering tests passed`) — confirms the reordered wording still
  carries every substring that suite pins.

## Final remediation wording

`dispatchPostureRemediation('none')`:
"Codex sub-agent spawn tools are not exposed ([features] multi_agent / multi_agent_v2
absent-or-false). Enable them, then explicitly ask for sub-agents/delegation/parallel work
in-session; or, if your Codex exposes an ultra reasoning effort for your model/plan
(undocumented as of codex-tui 0.142.5 — check the /model picker), set
model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c
model_reasoning_effort=ultra) for proactive delegation."

`dispatchPostureRemediation('explicitRequestOnly')`:
"Codex will refuse sub-agent spawns unless explicitly requested this session
(multi_agent_mode: explicitRequestOnly). To dispatch now, explicitly ask for
sub-agents/delegation/parallel work in-session; or, if your Codex exposes an ultra reasoning
effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker),
set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c
model_reasoning_effort=ultra) for proactive delegation."

`dispatchPostureRemediation('proactive')` is unchanged (`null`); `deriveDispatchPosture` and all
other derivation logic untouched (behavior-preserving per constraint 2). All four pinned
substrings retained verbatim: `model_reasoning_effort = "ultra"`, `codex -c
model_reasoning_effort=ultra`, `0.142.5`, and the proactive-posture-suppresses-remediation
behavior (`dispatchPostureRemediation('proactive') === null`).

## Files changed

Byte-groups (verified byte-identical within each group both before and after, and via
`validate-script-sync.js`):
- `scripts/kaola-workflow-codex-preflight.js`, `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js` (preflight x4)
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`,
  `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`,
  `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js` (installer x3)

Test suites (RED order-assertions added):
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

Prose:
- `README.md` (transcript excerpt + summarized-remediation prose)
- `docs/api.md` (JSON example's `dispatch_posture_warning` value)
- `commands/workflow-init.md`, `plugins/kaola-workflow-gitlab/commands/workflow-init.md`,
  `plugins/kaola-workflow-gitea/commands/workflow-init.md` (config-audit blockquote)
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`,
  `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`,
  `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` (`explicit_request_only`
  classification line)
- `install-opencode.sh` (comment-only: dropped retired `auto`, "6 files" -> "5 files")

No opencode mirror touched (out of scope per constraint 4 — the opencode sync strips this
blockquote). No issue refs / decision IDs / ADR citations introduced in any of the edited
prompt/command/skill surfaces (verified by grep + the three `validate-*-contracts.js`
provenance-ban gates, all green).

## Surprises

- The workflow-init config-audit blockquote (`commands/workflow-init.md` line ~174-181) already
  had the in-session-ask clause listed textually before the `ultra` clause in its
  `explicitRequestOnly` sentence, but with no "undocumented/plan-gated" qualifier on the ultra
  route. I still rewrote it to add the qualifier and make the "always available and always
  documented" framing explicit, for consistency with the reworded code output and the other two
  editions (which shared byte-identical text).
- `scripts/test-install-model-rendering.js` also pins `model_reasoning_effort = "ultra"` and
  `codex -c model_reasoning_effort=ultra` (not in the declared write set, and not touched) but
  does not assert ordering, so it stayed green untouched — confirms the reorder is
  backward-compatible with that suite's substring pins.
