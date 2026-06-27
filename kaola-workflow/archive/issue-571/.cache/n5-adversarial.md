evidence-binding: n5-adversarial 8734410d3680
verdict: pass
findings_blocking: 0

## Claim under test
"The n2 change to kaola-workflow-codex-preflight.js (accept a fresh GLOBAL ~/.codex scope, else fall through to project scope) is correct and STILL FAILS CLOSED — the gate only PASSES when a genuinely-fresh global OR project scope exists, and REFUSES (non-zero, typed) whenever NEITHER is valid. The --global installer flag writes to ~/.codex." (Issue #571.)

## Method
Drove the gate via HOME/USERPROFILE-controlled temp homes (os.homedir() honors $HOME on this macOS) against the plugin-tree preflight (real config/agents.toml, 15 roles). `node <preflight> --project-root <empty-dir> --no-autofix --json`. Tried to force a PASS when no valid scope exists. Could not.

## Per-scenario (project .codex absent unless noted)
- 1 neither scope valid: EXIT=1 profiles_missing; project .codex NOT created. PASS (fail-closed).
- 2a delete one global role .toml: EXIT=1 profiles_missing. PASS.
- 2c retired docs-lookup.toml in global agents dir: EXIT=1. PASS.
- 2d zero-byte global config.toml: EXIT=1. PASS.
- 2e remove [agents.code-reviewer] header from managed block (redone correctly after a harness no-op): EXIT=1 profiles_missing. PASS.
- 2f ~/.codex exists but empty: EXIT=1. PASS.
- 2g malformed required global profile (blank name): EXIT=1. PASS.
- 2h retired role [agents.docs-lookup] INSIDE managed block (staleRolesInBlock): EXIT=1. PASS.
- 2i unsupported manifest schema_version=99 in global: EXIT=1. PASS.
- 3 foreign [agents.foo] OUTSIDE markers in global: EXIT=1 (did NOT silently pass). PASS.
- 4 fresh global, absent project: EXIT=0 status=ok scope:global; project .codex NOT created (no redundant copy). PASS.
- 5 absent-global / fresh project: EXIT=0 status=ok via project path (back-compat). PASS.
- 6a --global from arbitrary cwd: writes ~/.codex/agents/kaola-workflow/*.toml + ~/.codex/config.toml, no cwd pollution; config_file relative resolves under ~/.codex. PASS.
- 6b --global --with-fast: composes; gate passes scope:global. PASS.
- 6c latent leading-flag bug (--with-fast "$PWD"): installs into positional project, not a dir named --with-fast. PASS.
- 7 &&s.exists guard — absent global never short-circuits: confirmed EXIT=1. An absent ~/.codex reads "not stale" inside scopeIsStale (the s.exists && short-circuit), but scopeIsFresh = s.exists && !scopeIsStale(s) forces false. Load-bearing guard present at scripts/kaola-workflow-codex-preflight.js:680-682.
- Ordering — fresh global must not mask a non-template plan role: FRESH global + --plan with bogus-role-xyz → EXIT=3 role_not_in_template (L427 guard fires BEFORE the L455 short-circuit). PASS.
- Byte-identical: preflight ×4 IDENTICAL; installer ×3 IDENTICAL.
- Regression: node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js + node scripts/simulate-workflow-walkthrough.js both green; testCodexPreflight571/266/332 all PASSED — the 266/332 passes prove the hermetic-HOME retrofit landed (else ambient ~/.codex would short-circuit those discriminators to ok).

## Clarification (NOT a refutation)
Under autofix-ON with neither scope valid, the gate does not "refuse" — it runs the installer to create a project-local scope and re-verifies, passing only if that scope becomes valid (else installer_failed exit 5). Pre-existing #266/#332 contract; at pass-time a valid project scope exists, and the short-circuit only ADDS the fresh-global PASS. The refusal property holds under --no-autofix and when autofix cannot reach a valid scope. No fail-open.

## Verdict
NOT-REFUTED (confidence: high). The gate's fail-closed semantics survive every adversarial scenario; the short-circuit only widens PASS to the genuinely-fresh-global case; --global writes ~/.codex correctly. findings_blocking: 0.
Files: scripts/kaola-workflow-codex-preflight.js (short-circuit L447-466, scopeIsFresh L680-682), plugins/kaola-workflow/scripts/install-codex-agent-profiles.js (--global L8-18).
