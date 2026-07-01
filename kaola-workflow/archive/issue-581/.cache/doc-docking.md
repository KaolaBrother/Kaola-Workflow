# Documentation Docking - issue-581

Verdict: DOCKED

## Changed behavior/config/test surfaces reviewed

- `scripts/kaola-workflow-adaptive-node.js` and generated Codex/GitLab/Gitea copies: dispatch
  descriptors carry `codex_dispatch_mode`, `codex_task_name`, and direct `codex_reasoning_effort`.
- `scripts/kaola-workflow-codex-preflight.js` and generated copies: schema checks require source
  metadata and report `dispatch_mode` / `multi_agent_v2_enabled`.
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` and forge copies: source and
  installed standalone TOMLs are validated against `config/agents.toml` metadata.
- `plugins/kaola-workflow*/agents/*.toml`: standalone role profiles now include `description` and
  `nickname_candidates`.
- `commands/kaola-workflow-plan-run.md` and the three Codex plan-run skill/forge command surfaces:
  v1/v2 dispatch instructions and direct `reasoning_effort` guidance updated.
- `scripts/test-adaptive-node.js`, `scripts/test-install-model-rendering.js`, and the three contract
  validators: dispatch mode, task-name, profile metadata, and per-spawn effort contracts pinned.

## Documents checked

- `README.md`: updated. Matches the implementation: base profiles omit pinned effort, profile TOMLs
  carry metadata, v1 is honest about possible thread-id rows, and v2 uses `codex_task_name`.
- `docs/api.md`: updated. The contractor Codex profile registration no longer describes old
  session-inherited effort.
- `docs/architecture.md`: updated. Agent profile structure now reflects unpinned base profiles,
  per-spawn dispatch metadata, and TOML metadata parity.
- `docs/decisions/D-581-01.md`: added. Captures the accepted task-name / direct-effort / metadata
  decision.
- `CHANGELOG.md`: updated under the current release heading.
- `.env.example`: no edit. The user-facing v2 switch documented by this change is Codex config
  `multi_agent_v2`; the Kaola env aliases in `resolveCodexDispatchMode` are advanced runtime/test
  overrides and are not required for normal setup.
- `docs/workflow-state-contract.md`: no edit. No durable workflow-state field was added.
- `docs/agents-source.md`: no edit. No vendored-agent provenance changed.

## Gaps found and fixed

The docking sweep found stale current prose in `docs/api.md` and `docs/architecture.md` that still
described the older session-effort mechanism. Both were updated before the final chain receipt was
regenerated.

## Final verdict

DOCKED - public docs, command/skill guidance, decision record, and release notes now match the
implemented dispatch/profile contract.
