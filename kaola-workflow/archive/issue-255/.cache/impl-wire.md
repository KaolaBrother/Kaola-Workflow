# impl-wire evidence — issue #255

## Baseline (pre-edit)

```
OK: 13 common scripts and 5 byte-identical file group in sync.
EXIT: 0
```

## RED — validate-script-sync.js failing (mirror missing)

Edit: added `'kaola-workflow-adaptive-handoff.js',` after `'kaola-workflow-commit-node.js'` in COMMON_SCRIPTS (with `// #255` comment).

```
Missing files:
  - plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
EXIT: 1
```

## GREEN — validate-script-sync.js passing (after cp)

Command: `cp scripts/kaola-workflow-adaptive-handoff.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js`

```
OK: 14 common scripts and 5 byte-identical file group in sync.
EXIT: 0
```

## Byte-identity diff

```
diff scripts/kaola-workflow-adaptive-handoff.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
DIFF_EXIT: 0
```

Empty diff — files are byte-identical.

## package.json JSON parse

```
package.json OK
```

## New test:kaola-workflow:claude fragment (relevant excerpt)

```
...node scripts/test-commit-node.js && node scripts/test-adaptive-handoff.js && node scripts/test-release-surface-drift.js...
```

## Sanity checks

Mirror usage (no throw):
```
usage: kaola-workflow-adaptive-handoff.js (--project NAME | --plan PATH) --json [--state-mtime ISO]
  --project NAME  derive plan from kaola-workflow/<NAME>/workflow-plan.md
  --plan PATH     explicit plan path; state is the sibling workflow-state.md
  --json          required; emit JSON output
  --state-mtime   optional injectable clock -> recorded_at in Planning Evidence
EXIT: 0
```

test-adaptive-handoff.js:
```
adaptive-handoff tests passed (45 assertions)
EXIT: 0
```
