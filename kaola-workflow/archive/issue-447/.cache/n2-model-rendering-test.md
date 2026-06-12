evidence-binding: n2-model-rendering-test 8a343f1564de

# n2-model-rendering-test (implementer) — claude-chain coverage of the global-hook invariant

non_tdd_reason: Test-harness extension only — the behavior under test (global hook install via n1's
change to install-codex-agent-profiles.js) was implemented in n1. This node adds the characterization
test in the claude chain; no product logic. The test passes immediately because it characterizes
behavior already landed.

verification_tier: regression-green
write_set: scripts/test-install-model-rendering.js

before_result: `Install model rendering tests passed` (exit 0)
after_result: `Install model rendering tests passed` (exit 0); full `npm run test:kaola-workflow:claude`
green through `Workflow walkthrough simulation passed`.

Assertions added (temp HOME `kaola-codex-447-home-*` + temp project `kaola-codex-447-proj-*`; installer
invoked via execFileSync('node', [codexInstallerPath, cproj], {env:{...process.env, HOME: chome}})):
1. AC1 — <tempHOME>/.codex/hooks.json exists after install.
2. AC1 — the four kaola-workflow: entries (compact-context, pre-commit-guard, write-lane,
   subagent-dispatch-log) all present in the global hooks.json.
3. AC1 — <tempHOME>/.codex/kaola-workflow/{hooks,scripts}/ populated.
4. AC5 — <tempProject>/.codex/hooks.json does NOT exist (hooks global only).
5. AC2 — <tempProject>/.codex/agents/kaola-workflow/*.toml exist (profiles project-local).
6. AC2 — <tempProject>/.codex/config.toml contains `# BEGIN kaola-workflow agents`.
