# docs-a evidence — issue #242 Part A

**Date:** 2026-06-04
**Node:** docs-a (adaptive, issue-242)

## Files changed

1. `README.md` — 6 version lines bumped in "## Release versioning"
2. `docs/architecture.md` — new "## Model Resolution (Install-Time, Profile-Aware)" section added at end; inline reference updated at line 24
3. `docs/api.md` — new "### Agent model manifest" entry added in the install-global config section (natural home: after `enable_adaptive` key, before "### Project-local config")

## The 6 README lines after the bump (lines 435–440)

```
- Claude Code command install, GitHub edition: `4.0.0`
- Claude Code command install, GitLab edition: `4.0.0`
- Claude Code command install, Gitea edition: `4.0.0`
- Codex `kaola-workflow` plugin manifest: `2.0.0`
- Codex `kaola-workflow-gitlab` plugin manifest: `2.0.0`
- Codex `kaola-workflow-gitea` plugin manifest: `2.0.0`
```

No other README content referenced the old versions — grep for `3.23.0` and `1.14.0` confirmed the strings were unique to those 6 lines.

## architecture.md addition

Added a new top-level section `## Model Resolution (Install-Time, Profile-Aware)` at the end of the file (after the Gitea sink section). Describes:
- The install-emitted manifest `~/.claude/agents/.kaola-agent-models.json` (respects `KAOLA_AGENT_DIR`)
- install.sh writes it, uninstall.sh removes it
- Resolver precedence: manifest → frontmatter (if ≠ inherit) → DEFAULT_AGENT_MODELS → ''
- Effect: adaptive nodes now resolve to profile-aware model + render badge; previously `model: inherit` frontmatter → '' → silently inherited Opus
- Also updated the inline reference at line 24 to point to the new section

## api.md decision

**Touched.** There is a natural home: the install-global config section lists all install-written artifacts (config.json keys). The manifest is a peer install-written artifact with a documented schema and resolver contract. Added a brief "### Agent model manifest" entry after the `enable_adaptive` key documenting the JSON shape, path, and resolver precedence. This fits the api.md pattern without being forced.
