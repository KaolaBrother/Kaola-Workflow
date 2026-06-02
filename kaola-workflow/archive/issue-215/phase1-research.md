# Phase 1 - Research / Discovery: issue-215

## Deliverable
Make `sectionBody()` fence-aware in all 4 classifier editions by adding an `inFence` flag that suppresses the `^##\s` boundary check while inside a fenced code block. Add regression tests in the root walkthrough and both forge test harnesses.

## Why
`scanClaimedOverlap` is the sole cross-issue file-overlap guard. When `## Scope` in a `fast-summary.md` contains a fenced block with an h2 heading above the `- Write Set:` paths, the current code truncates the section body at that heading, dropping the claimed file paths. The overlap check then returns GREEN for a candidate that actually collides with an active fast project — the exact safety bypass the guard exists to prevent.

## Affected Area
- `scripts/kaola-workflow-classifier.js:129-142` — `sectionBody` (canonical)
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:129-142` — Codex mirror (must be byte-identical; use `cp` after editing root)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js:97-110` — GitLab hand-edited mirror
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js:102-115` — Gitea hand-edited mirror
- `scripts/simulate-workflow-walkthrough.js` — add `testClassifierFastScopeFenceHeadingRed()` after line 611; register after line 4096
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — add `withForge` block after line 537
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — add `withForge` block after line 543

## Key Patterns Found
1. `sectionBody()` splits content on `\n`, locates the heading with `headRe`, then collects lines until `/^##\s/` breaks — `scripts/kaola-workflow-classifier.js:129-142`
2. `fastScope` is the direct return value of `sectionBody()` fed into `extractFilePaths(combined)` — `scripts/kaola-workflow-classifier.js:242-245`
3. `validate-script-sync.js` enforces byte-identity for `kaola-workflow-classifier.js` between `scripts/` and `plugins/kaola-workflow/scripts/` — `scripts/validate-script-sync.js:41`
4. `testClassifierFastScopeFenceCommentRed` (lines 589-611) is the exact structural template for the new test; uses `writeState`/`tempRoot` + `plantRoadmapIssue` + `assert verdict === 'red'`

## Test Patterns
- Framework: hand-rolled `assert` (no Jest/Mocha); plain sequential function calls inside an async main runner
- Location: `scripts/simulate-workflow-walkthrough.js` (root); `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`; `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Structure: define `function testXxx()`, then call it at the bottom registration block
- Forge harness pattern: `withForge({ viewIssue() {...} }, () => { tempRoot → writeState → writeFileSync(fast-summary.md) → classifier.classifyIssue(iid, root) → assert.strictEqual(result.verdict, 'red') })`
- #213 fence tests are at lines 589-611 (root), 520-537 (gitlab), 526-543 (gitea); new #215 tests slot immediately after each

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — classifier gracefully skips network calls; not relevant to this fix
- `validate-script-sync.js` — run via `npm test` (both `test:kaola-workflow:claude` and `test:kaola-workflow:codex`); cp procedure maintains parity
- `npm test` chain: `test:kaola-workflow:claude` → `test:kaola-workflow:codex` → `test:kaola-workflow:gitlab` → `test:kaola-workflow:gitea`; forge test harnesses run via `execFileSync` inside their respective simulate-*-walkthrough.js

## External Docs
N/A — internal patterns only; fix uses Node.js built-ins

## GitHub Issue
KaolaBrother/Kaola-Workflow#215

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only; no external lib behavior needed |

## Notes / Future Considerations
- `validate-workflow-contracts.js` has its own `sectionBody` at line ~71 for cross-edition parity comparison; its intentional behavior (keeps fenced lines in the slice) is out of scope — noted, not silently dropped
- `inFence` toggle uses trimmed-prefix check (` ``` `/`~~~`); unbalanced-fence and CommonMark-strict parsing out of scope
- #215 is labeled `audit #1` — fixes the foundational overlap guard; #216-#222 are downstream audit findings
