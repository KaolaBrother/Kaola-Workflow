# impl-install node evidence — issue #242 Part A

## (a) RED — new test assertions failing before the change

Both test files were extended with new assertions before install.sh was touched.

`node scripts/test-install-model-rendering.js`:
```
AssertionError [ERR_ASSERTION]: higher-profile install must write .kaola-agent-models.json
```

`node scripts/test-install-adaptive-config.js`:
```
AssertionError [ERR_ASSERTION]: manifest must exist after install (prerequisite for uninstall test)
```

## (b) GREEN — gates passing after the change

All four gates pass:

```
bash -n install.sh uninstall.sh
install.sh: syntax OK
uninstall.sh: syntax OK

node scripts/test-install-model-rendering.js
Install model rendering tests passed

node scripts/test-install-adaptive-config.js
Install adaptive-config tests passed

node scripts/simulate-workflow-walkthrough.js
testAdaptiveResumeHashDeletedTypedRefusal: PASSED
testAdaptiveValidatorNodeCap: PASSED
testAdaptiveCheapWinFixes: PASSED
testAdaptiveAuditCoverage: PASSED
Workflow walkthrough simulation passed
```

## (c) Actual manifest contents from temp installs

### Default install (--profile=higher, no explicit flag; higher IS the default)

```json
{
  "code-explorer": "sonnet",
  "docs-lookup": "sonnet",
  "planner": "opus",
  "code-architect": "opus",
  "tdd-guide": "sonnet",
  "build-error-resolver": "sonnet",
  "code-reviewer": "opus",
  "security-reviewer": "opus",
  "doc-updater": "sonnet",
  "adversarial-verifier": "sonnet"
}
```

### --profile=higher (explicit)

Identical to the default above (default profile IS higher).

### --profile=common

```json
{
  "code-explorer": "sonnet",
  "docs-lookup": "sonnet",
  "planner": "opus",
  "code-architect": "sonnet",
  "tdd-guide": "sonnet",
  "build-error-resolver": "sonnet",
  "code-reviewer": "sonnet",
  "security-reviewer": "sonnet",
  "doc-updater": "sonnet",
  "adversarial-verifier": "sonnet"
}
```

### KAOLA_AGENT_DIR override (higher profile, agents and manifest in custom dir)

Gate command: `HOME=$TMP KAOLA_AGENT_DIR=$TMP/custom-agents bash install.sh --yes --forge=github --profile=higher --no-settings-merge`

Manifest landed in `$KAOLA_AGENT_DIR/.kaola-agent-models.json` (NOT in $HOME/.claude/agents). Confirmed: no manifest at `$HOME/.claude/agents/`.

## (d) Manifest path resolution

`AGENTS_DIR` is the variable reused throughout install.sh and uninstall.sh for the agent target directory. It was changed from the hardcoded `"$HOME/.claude/agents"` to:

```bash
AGENTS_DIR="${KAOLA_AGENT_DIR:-$HOME/.claude/agents}"
```

This single-line change (applied identically to install.sh line 36 and uninstall.sh line 5) means:
- When `KAOLA_AGENT_DIR` is unset: behavior identical to before (no regression for existing tests using HOME override)
- When `KAOLA_AGENT_DIR` is set: agents AND the manifest land in that directory, matching where the resolver reads (`KAOLA_AGENT_DIR || ~/.claude/agents`)

The manifest is emitted by `emit_agent_model_manifest()`, called after `model_for_placeholder()` is defined (past line 456, not at line 397 where `install_agent_files` is called — that call precedes the helper function definitions in execution order, so placing emission there would hit function-not-found under set -euo pipefail).

The uninstall uses `rm -f "$AGENTS_DIR/.kaola-agent-models.json"` (guarded, same `$AGENTS_DIR` variable).

## (e) End-to-end resolver check (producer/consumer fit)

Resolver invoked with `--agent-dir <temp-install>` to read the manifest directly:

### Higher profile
```
security-reviewer: opus
code-architect: opus
planner: opus
tdd-guide: sonnet
```

### Common profile
```
security-reviewer: sonnet
code-architect: sonnet
planner: opus
```

The resolver reads the manifest as precedence step 1 and returns the correct profile-aware model. The producer (install.sh) and consumer (resolver) are confirmed to fit end-to-end.

## (f) npm test result
`npm test` exited 0 (all suites pass including the new manifest assertions).
