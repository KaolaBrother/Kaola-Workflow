# Doc Updater - issue-581

Status: local-fallback-tool-unavailable

Evidence:
- `.codex/agents/kaola-workflow/` is absent in this checkout.
- The active session policy did not allow subagent delegation.
- Node evidence: `.cache/n3-docs.md` (`evidence-binding: n3-docs 5cc85310323b`).

Documents updated from verified source:
- `README.md`: Codex role profile metadata, v1/v2 dispatch identity, and direct per-spawn
  `reasoning_effort`.
- `docs/decisions/D-581-01.md`: accepted decision for task-name identity, direct effort overrides,
  and standalone profile metadata.
- `docs/api.md`: contractor Codex TOML profile registration now describes unpinned base profiles,
  per-spawn dispatch effort, and standalone metadata.
- `docs/architecture.md`: profile structure now describes unpinned base profiles, per-spawn dispatch
  effort, and TOML metadata parity.
- `CHANGELOG.md`: release entry for issue 581.

verdict: pass
