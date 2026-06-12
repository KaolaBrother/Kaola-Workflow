evidence-binding: n1-installer-global-hooks eaadd3d98195

# n1-installer-global-hooks (tdd-guide) — Codex hooks install globally into ~/.codex

## RED (failing assertions before the installer change)
testInstallProfilesFeaturesTableHandling (gitlab + gitea):
  AssertionError [ERR_ASSERTION]: #447 AC1: fresh install must create HOME/.codex/hooks.json (global),
  not found at: /var/folders/8s/.../kw-gl-codex-home-fresh-Wg8eoj/.codex/hooks.json
(pre-impl the installer still wrote <project>/.codex/hooks.json; the global path did not exist)

## GREEN (passing after the change)
- gitlab + gitea: testInstallProfilesFeaturesTableHandling, testUpdateHooksHardening325,
  test409StableHomeSurvivesDirDeletion all PASS — global hooks.json exists at HOME/.codex,
  NO project-local <project>/.codex/hooks.json written, $schema + event keys correct.
- "GitLab workflow script tests passed" + "Gitea workflow script tests passed" (full forge chains green).

## Implementation
Canonical plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:
- added `const os = require('os')`; `globalCodexDir = path.join(os.homedir(), '.codex')`.
- repointed hook targets ONLY: targetHooks -> globalCodexDir/hooks.json;
  targetStableDir/targetStableHooksDir/targetStableScriptsDir -> globalCodexDir/kaola-workflow.
- updateHooks() mkdirs globalCodexDir; buildManagedHooks substitutes the global stable home.
- copyAgentProfiles()/updateConfig()/manifest/agents dir LEFT project-local (AC2).
- summary stdout repointed to ~/-relative paths for the hook lines.
uninstall.sh: hook cleanup repointed $PWD/.codex -> $HOME/.codex/{hooks.json,kaola-workflow};
  profile/config cleanup kept project-local; ASYMMETRY comment updated; `bash -n` passes.
Forge tests (not byte-identical): runInstallProfiles gains extraEnv; temp-HOME subprocess isolation;
  assert hooks at HOME/.codex/hooks.json + assert no <project>/.codex/hooks.json (AC1/AC5).

## Byte-identity + guards
- npm run sync:editions propagated canonical -> gitlab/gitea installer copies.
- node scripts/validate-script-sync.js: OK: 19 common scripts, 30 byte-identical groups,
  2 rename-normalized families, 1 config/hooks.json family in sync.
- --forbidden-only on both installer copies: GitLab + Gitea forbidden-only check passed (1 file each).
- NOTE: forge TEST files carry pre-existing /GitHub/ (gitlab) and /GitLab/ (gitea) comment mentions
  that PREDATE this issue (verified against original) and are not enforced by the forge chains (both green).
