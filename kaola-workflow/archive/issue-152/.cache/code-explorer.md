# Code Explorer — issue-152: Phase 5/6 routed tdd-guide spawns missing explicit model badge dispatch

## Gap Summary

Four prose-only routed-dispatch sites across Phase 5 and Phase 6 command files reference `tdd-guide` and `build-error-resolver` without concrete `Agent(...)` spawn blocks carrying explicit `model=` parameters. Two validator gaps prevent catching these in CI.

## Affected Sections

### commands/kaola-workflow-phase5.md

**Lines 76-79 (Validation Delegation Policy — prose-only):**
```
Delegated validation should use a fresh validation subagent when available, or
the relevant fix agent (`tdd-guide` for behavior/test findings,
`build-error-resolver` for build/type/lint/tooling findings). Raw output goes to:
```
No `Agent(...)` block. No "You MUST pass model=" warning.

**Lines 210-224 (Fix Routing — "documented above" reference is broken):**
```
For every review-fix dispatch, include the explicit `model=` parameter in the
`Agent(...)` call exactly as documented above — never omit it.
```
"Exactly as documented above" is broken — the only Agent blocks above in phase5 are code-reviewer and security-reviewer. No tdd-guide or build-error-resolver Agent block exists above this line.

### commands/kaola-workflow-phase6.md

**Lines 111-113 (Validation Delegation Policy — prose-only):**
```
Delegated validation should use a fresh validation subagent when available, or
the relevant fix agent (`tdd-guide` for behavior/regression/coverage checks,
`build-error-resolver` for build/type/lint/tooling checks). Raw output goes to:
```
No `Agent(...)` block. No "You MUST pass model=" warning.

**Lines 235-251 (Final Validation Fix Routing — "documented above" reference is broken):**
```
For every delegated validation or routed final-validation fix, include the
explicit `model=` parameter in the `Agent(...)` call exactly as documented above —
never omit it.
```
"Exactly as documented above" — in phase6, the only Agent block above this section is doc-updater (haiku). No tdd-guide or build-error-resolver block exists above.

## Plugin Copies (identical gaps)
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md`

Note: `validate-script-sync.js` does NOT cover command file sync for plugin forks — no automated enforcement.

## Correct Spawn Pattern (from commands/kaola-workflow-phase4.md:238-250)

```
Invoke the Claude Code agent `tdd-guide` for the task:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Task {n}: {name}",
  prompt="..."
)
```
```

Same pattern in `commands/kaola-workflow-fast.md:133-146` for tdd-guide.

## Installer Placeholder Resolution

`install.sh` function `render_command_file` resolves:
- `{TDD_GUIDE_MODEL}` → `sonnet` (agents/tdd-guide.md has `model: sonnet`)
- `{BUILD_ERROR_RESOLVER_MODEL}` → `sonnet` (agents/build-error-resolver.md has `model: sonnet`)

**Critical:** `BUILD_ERROR_RESOLVER_MODEL` is defined in install.sh's resolver but currently UNUSED in any command .md file. The fix will be its first use.

## Validator Gaps

### scripts/validate-workflow-contracts.js lines 67-75 (current):
```javascript
assertIncludes(file, '## Agent Model Badge');
assertIncludes(file, 'You MUST pass `model=');
assertIncludes(file, 'model="{');
```
File-level contains only. Does NOT check that the routed-fix/delegated-validation sections specifically contain Agent call blocks for tdd-guide/build-error-resolver.

### scripts/test-install-model-rendering.js lines 35-43 (current):
```javascript
assert(phase4.includes('model="sonnet",'), 'tdd-guide should render as sonnet');
assert(phase5.includes('model="opus",'), 'higher profile should render reviewers as opus');
assert(phase6.includes('model="haiku",'), 'doc-updater should render as haiku');
```
No assertion checking that phase5/6 render `model="sonnet",` for tdd-guide/build-error-resolver routed-fix paths. After the fix, phase5 and phase6 will each have `model="sonnet",` from the new Agent blocks.

## Test Framework
- Both validators: hand-rolled, Node built-in `assert` module, no framework
- `test-install-model-rendering.js`: runs `install.sh --yes --forge=github --profile=higher --no-settings-merge` into temp HOME, reads rendered installed files via `readInstalledCommand(name)`
- Phase5/6 already pass `model="opus"` assertions; new `model="sonnet"` assertions will be net-new and fail until the Agent blocks are added

## Naming Conventions
- Placeholder: `{TDD_GUIDE_MODEL}` (all-caps with underscores, in curly braces)
- Warning prefix: `You MUST pass \`model="{TDD_GUIDE_MODEL}"\` in this Agent call exactly as shown —\ndo not omit the \`model=\` line.`
- Block: `` ```text `` fenced block containing `Agent(...)` with `model=` as second field

## Config & Env
None — internal command/script files only.
