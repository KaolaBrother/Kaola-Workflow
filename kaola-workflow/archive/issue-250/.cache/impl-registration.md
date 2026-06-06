# Node `impl-registration` evidence — issue #250 (`implementer` role registration)

Change type: registration (adding implementer to localAgents array and 3 config/agents.toml files).
non_tdd_reason: configuration registration — no behavioral logic added; verified by validate-vendored-agents.js RED→GREEN transition + byte-identity checks + install/sync gates.

## Files Changed

1. `plugins/kaola-workflow/config/agents.toml` — inserted `[agents.implementer]` block after `[agents.tdd-guide]`, before `[agents.build-error-resolver]`
2. `plugins/kaola-workflow-gitlab/config/agents.toml` — identical insertion (byte-identical to github)
3. `plugins/kaola-workflow-gitea/config/agents.toml` — identical insertion (byte-identical to github)
4. `scripts/validate-vendored-agents.js` — added `'implementer'` to `localAgents` array (after `'contractor'`, before `'workflow-planner'`)

## Pre-edit Byte-Identity Confirmation

All 3 config/agents.toml files confirmed byte-identical BEFORE edit:
```
PRE-EDIT: all 3 byte-identical
```

## RED Baseline (validate-vendored-agents.js before localAgents edit)

Command: `node scripts/validate-vendored-agents.js`
Exit code: 1

Output (verbatim from pre-edit run):
```
/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/validate-vendored-agents.js:41
  if (!condition) throw new Error(message);
                  ^

Error: agents directory must contain exactly: adversarial-verifier.md, build-error-resolver.md, code-architect.md, code-explorer.md, code-reviewer.md, contractor.md, doc-updater.md, docs-lookup.md, planner.md, security-reviewer.md, tdd-guide.md, workflow-planner.md
    at assert (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/validate-vendored-agents.js:41:25)
    at Object.<anonymous> (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/validate-vendored-agents.js:55:1)
    at Module._compile (node:internal/modules/cjs/loader:1812:14)
    at Object..js (node:internal/modules/cjs/loader:1943:10)
    at Module.load (node:internal/modules/cjs/loader:1533:32)
    at Module._load (node:internal/modules/cjs/loader:1335:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/main/run_main_module:154:5)
    at node:internal/main/run_main_module:33:47

Node.js v24.14.0
```

Explanation: `agents/implementer.md` exists (created by impl-profiles node) but `implementer` was not yet in the `localAgents` array — set-membership mismatch.

## GREEN (validate-vendored-agents.js after localAgents edit)

Command: `node scripts/validate-vendored-agents.js`
Exit code: 0

Output (verbatim):
```
Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
```

## Post-edit Byte-Identity (cmp proof)

```
cmp plugins/kaola-workflow/config/agents.toml plugins/kaola-workflow-gitlab/config/agents.toml
cmp plugins/kaola-workflow/config/agents.toml plugins/kaola-workflow-gitea/config/agents.toml
POST-EDIT: all 3 byte-identical
```

All 3 config/agents.toml files are byte-identical after the identical `[agents.implementer]` block insertion.

## Deferred Gate Results (previously RED from impl-profiles/impl-model nodes)

| Command | Exit Code | Output |
|---------|-----------|--------|
| `node scripts/test-install-model-rendering.js` | 0 | `Install model rendering tests passed` |
| `node scripts/test-install-upgrade-rewrite.js` | 0 | `Install upgrade rewrite tests passed` |
| `node scripts/validate-script-sync.js` | 0 | `OK: 14 common scripts and 5 byte-identical file group in sync.` |

## Registration Confirmation

`implementer` is now a registered managed local agent: listed in `localAgents` in `scripts/validate-vendored-agents.js` (after `'contractor'`, before `'workflow-planner'`), registered in all 3 `config/agents.toml` files (byte-identical), and validated by `validate-vendored-agents.js` (exit 0, 13 agents total).
