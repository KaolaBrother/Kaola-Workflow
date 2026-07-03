evidence-binding: n2-synth-review dc5425f04c53
# n2-synth-review — code-reviewer gate over n1-synth-install (issue-600 lane)

Scope reviewed: install.sh, uninstall.sh, scripts/test-install-model-rendering.js vs merge-base with main.

verdict: pass
findings_blocking: 0

## Findings

- LOW (non-blocking): install.sh:365-377 `default_agent_model()` case has no `synthesizer)` arm (every other REQUIRED_AGENTS entry has one). Currently inert: agents/synthesizer.md declares `model: opus` explicitly in frontmatter and no profiles/higher override exists, so extract_agent_model always resolves before this fallback fires — verified live in a sandboxed $HOME that .kaola-agent-models.json writes "synthesizer": "opus". Recommended as a defense-in-depth follow-up one-liner, not blocking.

## Verification performed

- REQUIRED_AGENTS edits in install.sh + uninstall.sh: identical tail-appends, no duplicates, match convention.
- All other roster-coupled surfaces (install_agent_files, emit_agent_model_manifest, post-install verify loop, both uninstall.sh loops) iterate the array generically — no further edits needed. render_command_file placeholder list correctly excludes synthesizer (no {SYNTHESIZER_MODEL} in any command template).
- New test assertions bite on the pre-fix tree and match the hand-rolled assert style.
- `node scripts/test-install-model-rendering.js` pass; `bash -n install.sh uninstall.sh` clean.
- Sandboxed-$HOME install/uninstall round-trip: synthesizer.md deploys with model: inherit + managed marker, manifest maps opus, uninstall removes it (15-agent roster confirmed).
- Cross-edition: codex agents.toml ×3 already register synthesizer; opencode globs agent sources (no roster array) — nothing disturbed.

## Process incident (recorded)

During early verification a sandbox chain's FIRST install.sh invocation lacked the HOME= override and deployed branch content (commit 7f9e0e63, pre-gate) into the real ~/.claude/kaola-workflow/. No corrective action taken by the reviewer; orchestrator decision: true up via a standard reinstall from main at the finalize seam. All subsequent verification used HOME="$TMPHOME" sandboxes.
