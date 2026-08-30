# Documentation update — issue-1044

verdict: DOCKED

Verified ground truth transcribed from the frozen candidate and runtime probes:

- `README.md` documents the final compact carriers: Claude/Codex static SessionStart artifacts, Grok native Rule, Cursor alwaysApply Rule, and no new lifecycle for OpenCode/Kimi/ZCode.
- `CHANGELOG.md` records the user-visible dispatch-always-loaded change, the removal of tool-use recovery hooks and compact-time JS, the ZCode gate retirement, and the measured Grok hook-to-Rule correction.
- `docs/api.md` documents the shared dispatch/recovery generator inputs and installed artifacts.
- `docs/architecture.md` records common core + runtime overlay + complete generated artifact, with no session sidecar or second phase machine.
- `docs/conventions.md` records the measured carrier rule and zero ordinary-tool recovery overhead.
- `docs/runtime-capabilities.md` records all seven runtime carriers, tier defaults, tool/custody boundaries, native routes, reload and unknown fields.
- `docs/cursor-edition.md`, `docs/grok-edition.md`, `docs/kimi-edition.md`, and `docs/zcode-edition.md` match their final installers and measured boundaries.

Verification sources:

- `templates/agents/runtime-capabilities.json`
- `templates/routing/{next,finalize,compact-recovery}.skeleton.md`
- `templates/routing/dispatch-contract.md`
- `install-{cursor,grok,kimi,opencode,zcode}.sh` and `install.sh`
- `node scripts/generate-routing-surfaces.js --check`: 24 surfaces byte-match
- `./install-all.sh --check`: all seven runtimes PLAN, dry-run only
- live Cursor CLI and Grok compact probes recorded in Issue #1044

No `.env.example` change: the implementation introduces no environment variable or secret.
No documentation index change: no new standalone public document was added.
