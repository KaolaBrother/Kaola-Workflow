# G1 Review Gate — adaptive node `review` (issue-242 / #242 Part A)

**Verdict: PASS**

Post-dominates code nodes: `impl-resolver`, `impl-install`, `version-claude`, `version-codex`.
Scope reviewed: `git diff HEAD -- . ':!kaola-workflow/'`.

## Gate results (command + exit code)

| Gate | Exit |
|------|------|
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/validate-vendored-agents.js` | 0 |
| `node scripts/test-agent-model-resolver.js` | 0 |
| `node scripts/test-install-model-rendering.js` | 0 |
| `node scripts/test-install-adaptive-config.js` | 0 |
| `node scripts/simulate-workflow-walkthrough.js` | 1 (see note — deferred-surface only, not a code regression) |
| `bash -n install.sh` | 0 |
| `bash -n uninstall.sh` | 0 |

### Walkthrough exit-1 explained (NOT a code regression)
`simulate-workflow-walkthrough.js` aborts at `testContractValidatorOfflineSkip`
(simulate-workflow-walkthrough.js:6077), which spawns `validate-workflow-contracts.js`.
That contract fails ONLY because README.md still carries `3.23.0`/`1.14.0`
release-surface refs (README.md:435-440) and CHANGELOG has no `## [4.0.0]` heading —
the lagging surface the LATER `docs-a` node bumps.

Proven attribution: with README+CHANGELOG bumped to target (4.0.0 / 2.0.0) in a
scratch state and restored via `git checkout`:
- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` → exit 0 ("Workflow contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 (captured `$?` directly; sentinel "Workflow walkthrough simulation passed")

So the walkthrough failure is 100% the deferred release-surface, with zero
contribution from the resolver/install changes under review.

## DEFERRAL (explicit)
`node scripts/validate-workflow-contracts.js` and `npm test` were NOT run as
blocking gates here. That cross-file release-surface contract requires README's
"Claude Code command install … 4.0.0" lines and "Codex … plugin manifest: 2.0.0"
refs + a `## [4.0.0]` CHANGELOG heading, all owned by the later `docs-a` node and
gated by the `finalize` node. Running it as a blocker now would false-fail on the
lagging README/CHANGELOG. **Deferred to `finalize` (after `docs-a`).**

## Correctness findings

No blocking findings. Confirmations:

1. **Byte-identity (sync-group):** `validate-script-sync.js` green — "5 byte-identical
   file group in sync" (4 resolver copies: `scripts/` + 3 plugin dirs).

2. **Precedence + back-compat** (`scripts/kaola-workflow-resolve-agent-model.js:45-69`):
   manifest → frontmatter(≠inherit) → DEFAULT → ''. Manifest hit wins (line 53-56);
   missing/unparseable manifest caught by `try/catch` (line 57), falls through without
   throwing (tests CASE 4/5). A literal `inherit` in DEFAULT/frontmatter maps to ''.

3. **`KAOLA_AGENT_DIR` alignment:** resolver `defaultAgentDir()` honors it (line 26);
   installer `AGENTS_DIR="${KAOLA_AGENT_DIR:-…}"` (install.sh:36) and uninstall.sh:5.
   Read dir (resolver) == write dir (installer) == remove dir (uninstall).

4. **Badge preserved:** `install_managed_agent` flattens installed frontmatter `model:`
   to `inherit` (install.sh:312-314). The manifest (written from the PRE-flatten source
   via `resolve_agent_model_for_install`, install.sh:431-442) is therefore the ONLY
   authoritative profile-aware source — without it the resolver would fall to DEFAULT
   (all-sonnet) and downgrade the higher trio. Dispatch still passes explicit `model=`.

5. **Profile-aware authority:** `agent_source_file` selects `profiles/higher/<agent>.md`
   under `--profile=higher` (install.sh:298). Tests prove: higher → security-reviewer/
   code-architect/code-reviewer = `opus`; common → `sonnet`; planner = `opus` in both.

6. **install.sh robustness:** `emit_agent_model_manifest` (install.sh:462-487) called at
   top level (line 489) AFTER `install_agent_files` (invoked line 397) has mkdir'd
   `$AGENTS_DIR` (line 326). All transitive deps defined before line 489
   (resolve@431, default_agent_model@399, agent_source_file@295, extract@413,
   AGENTS_DIR@36, REQUIRED_AGENTS@40). Valid JSON (quoted keys/values, comma join,
   trailing newline); all-inherit `{}` edge handled (line 480-482). `bash -n` clean
   under `set -euo pipefail`. `uninstall.sh` removes the manifest (line 84-87); test (g) covers it.

7. **Version internal consistency (visible-now surface):**
   - `package.json` = `4.0.0`
   - `plugins/kaola-workflow-gitlab/.claude-plugin` = `4.0.0`
   - `plugins/kaola-workflow-gitea/.claude-plugin` = `4.0.0`
   - 3× `.codex-plugin` (kaola-workflow, -gitlab, -gitea) = `2.0.0`
   Note: there is NO `plugins/kaola-workflow/.claude-plugin/plugin.json` (GitHub Claude
   edition's version source is `package.json`/rootVersion per
   validate-workflow-contracts.js:386). The 2-of-3 `.claude-plugin` count is therefore
   correct and complete, not a missed bump.
