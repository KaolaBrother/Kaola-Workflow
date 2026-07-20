evidence-binding: n9-selfdev-guard c2c63a3d893e

## RED

Added `#736[selfdev-named-kaola-workflow]` to `scripts/test-adaptive-node.js`, in the reviewer-runtime-detection
test block (after the `#712/#717[opencode-unchanged]` case), seeding a fixture checkout whose directory is
literally named `kaola-workflow` with a sibling `package.json` (`{"name":"kaola-workflow"}`) one level up
from its `scripts/` dir, and asserting `resolveReviewerProfileIdentity('code-reviewer', {})` resolves
`runtime: 'claude'` for a probe rooted at that fixture's `scripts/` dir.

RED: isolated standalone probe against pre-fix `detectReviewRuntime()` (same fixture shape as the added
test) returned the wrong runtime — the opencode tail-pattern (`/[/\\]kaola-workflow[/\\]scripts$/` with no
`/plugins/` segment) swallowed the self-dev-named checkout before any self-dev guard existed:
```
{"ok":true,"reason":null,"runtime":"opencode","path":".../kaola-workflow/agents/code-reviewer.md"}
```
Expected `runtime:"claude"`, got `runtime:"opencode"` — reproduces the #736 defect exactly as described
(directory literally named `kaola-workflow` + sibling `package.json` named `kaola-workflow` misclassified
as an opencode install). The added assertion in `test-adaptive-node.js` fails against this same pre-fix
code for the identical reason (`p.runtime === 'claude'` check fails, actual `'opencode'`).

## GREEN

Fix: in `detectReviewRuntime()` (`scripts/kaola-workflow-adaptive-node.js`, ~L784-843 post-fix), inserted a
self-dev guard immediately BEFORE the opencode tail-pattern (after the `.claude/kaola-workflow/scripts`
claude-install check, before the `#708` opencode comment): reads `path.join(__dirname, '..', 'package.json')`
and, if it parses and its `name` is `'kaola-workflow'`, returns `'claude'` — the same self-dev predicate
`kaola_script()` uses in `sync-opencode-edition.js`/`sync-kimi-edition.js`. Wrapped in try/catch so a missing
or unreadable sibling package.json (the genuine-opencode-install case, which has no sibling repo
package.json at that path) falls through unchanged to the existing opencode/claude branches.

GREEN: same standalone probe re-run against the fixed code returned the correct runtime:
```
{"ok":true,"reason":null,"runtime":"claude","path":".../kaola-workflow/agents/code-reviewer.md"}
```
The added `#736[selfdev-named-kaola-workflow]` assertion in `scripts/test-adaptive-node.js` now passes.

## Verification

- `node scripts/test-adaptive-node.js` — full suite green: `adaptive-node tests passed (2488 assertions)`,
  exit code 0 (run twice for confirmation; the added #736 assertion plus all pre-existing #712/#717
  layout-detection assertions — codex source-tree, codex installed-cache tuples x3, KAOLA_WORKFLOW_RUNTIME
  override, fail-closed unknown layout, claude native/native-default/legacy, kimi-unchanged,
  opencode-unchanged — stayed green, confirming the guard does not swallow any other layout).
- `node scripts/validate-script-sync.js` — green:
  `OK: 22 common scripts, 26 byte-identical groups, 5 rename-normalized families, 2 hooks.json families
  (config + hooks dir), and 7 forge export-superset families in sync.`
  (the mirrored guard is byte-identical across `scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`, and
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`).

## Write set

Touched exactly the frozen write set (`git diff --stat`):
- `scripts/kaola-workflow-adaptive-node.js` (+14)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (+14)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (+14)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (+14)
- `scripts/test-adaptive-node.js` (+23)

No other files modified. `scripts/validate-script-sync.js` was run for verification only (not edited — it
is outside the frozen write set and required no change).
