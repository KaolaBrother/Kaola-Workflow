# Documentation update — bundle-1045

verdict: DOCKED

Verified ground truth transcribed from implementation commit
`5a0a1895817771992b2ebb81199eec25ec721b88` and the final runtime probes:

- `README.md` documents flat named `subagent_type`, required per-call model omission, exact-tier
  post-resolution verification, provider evidence, and the installed capability authority.
- `CHANGELOG.md` records both user-visible #1045 fixes.
- `docs/api.md` matches the global install transaction, installed doctor input/output, and
  `dispatch_contract` fields.
- `docs/architecture.md` records one source registry and the receipt-owned installed Cursor copy,
  including `--no-scripts` behavior.
- `docs/cursor-edition.md` keeps controller call shape, profile resolution, provider evidence,
  installed authority, doctor, and CLI/App/Cloud boundaries distinct.
- `docs/runtime-capabilities.md` records the same three field spaces without adding host-specific
  prompt composition.

Verification sources:

- `templates/agents/runtime-capabilities.json`
- `scripts/generate-agent-profiles.js`
- `scripts/kaola-workflow-cursor-surface.js`
- generated Cursor Workflow Next and Finalization bytes
- hermetic installed doctor/ensure-target output
- fresh Cursor CLI controller calls and three independent child provider stores
- Issue #1045 body, updated to 10,903 bytes

No `.env.example` change: no environment variable or secret was introduced.
No documentation index change: no new standalone public document was added.
No App/Cloud success is inferred from the standalone CLI proof; post-release installation and live
acceptance remain #1046.
