# Phase 1 - Research / Discovery: issue-152

## Deliverable
Add explicit model-bearing `Agent(...)` spawn blocks for `tdd-guide` and `build-error-resolver` in Phase 5 and Phase 6 routed-fix/delegated-validation paths (4 sites × 3 forge editions = 12 edits to command files), plus regression test assertions in two validator scripts.

## Why
Claude Code's inline model badge renders only when `model=` is explicit in the `Agent()` call. The routed-fix and delegated-validation paths in Phase 5/6 currently describe these agents in prose only — causing intermittent badge miss under the specific circumstances where review-fix or final-validation-fix spawns are needed.

## Affected Area

**Primary command files (root):**
- `commands/kaola-workflow-phase5.md` — lines 76-79 (Validation Delegation Policy) and 210-224 (Fix Routing / "documented above" is broken)
- `commands/kaola-workflow-phase6.md` — lines 111-113 (Validation Delegation Policy) and 235-251 (Final Validation Fix Routing / "documented above" is broken)

**Plugin mirror copies (identical gaps, no automated sync):**
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md`

**Validator scripts:**
- `scripts/validate-workflow-contracts.js` — file-level assertions only (lines 67-75); needs section-specific check for tdd-guide/build-error-resolver placeholders in phase5/6
- `scripts/test-install-model-rendering.js` — no sonnet assertion for phase5/6 routed paths (lines 35-43); needs new assertions

## Key Patterns Found
1. **Correct spawn pattern** (`commands/kaola-workflow-phase4.md:238-250`): `You MUST pass \`model="{TDD_GUIDE_MODEL}"\`...` warning followed by fenced `Agent(subagent_type="tdd-guide", model="{TDD_GUIDE_MODEL}", description="...", prompt="...")` block
2. **Same in fast-path** (`commands/kaola-workflow-fast.md:133-146`): identical pattern for tdd-guide
3. **`BUILD_ERROR_RESOLVER_MODEL` is defined in install.sh resolver but never yet used in any .md file** — the fix will be its first use; renders to `sonnet`
4. **Validator existing pattern** (`scripts/validate-workflow-contracts.js:67-75`): file-level `assertIncludes(file, 'model="{"')` — passes even without section-specific Agent blocks
5. **Install test pattern** (`scripts/test-install-model-rendering.js:35-43`): `assert(phase4.includes('model="sonnet",'), '...')` — same pattern needed for phase5/6 routed paths

## Test Patterns
- Framework: hand-rolled assert (Node built-in), no external framework
- Location: `scripts/validate-workflow-contracts.js` and `scripts/test-install-model-rendering.js`
- Structure: `assertIncludes(file, substring)` in contracts; `assert(renderedContent.includes(substring), msg)` in install test
- `test-install-model-rendering.js` runs `install.sh --yes --forge=github --profile=higher --no-settings-merge` into temp HOME, reads rendered installed commands

## Config & Env
- `{TDD_GUIDE_MODEL}` → resolved by install.sh to `sonnet` (agents/tdd-guide.md `model: sonnet`)
- `{BUILD_ERROR_RESOLVER_MODEL}` → resolved by install.sh to `sonnet` (agents/build-error-resolver.md `model: sonnet`)
- No env vars or feature flags

## External Docs
N/A — internal command/script files only.

## GitHub Issue
KaolaBrother/kaola-workflow#152

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | N/A | Internal command files and scripts only; no external library/API behavior needed |

## Notes / Future Considerations
- `validate-script-sync.js` does NOT cover command file sync for plugin forks — there is no automated enforcement. Manual updates to all 4 plugin copies are required.
- The description "exactly as documented above" in phase5 line 224 and phase6 line 250 will remain partially accurate after the fix (the Agent blocks will be added nearby but may not be literally "above" every mention). Consider whether to rephrase those lines to say "exactly as shown below" or "using the pattern above in this phase" — defer to architect.
