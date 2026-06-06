# implement node evidence — issue #268

## Pre-check insertion location

All four validator files received the same logical pre-check inserted immediately before
the `// shapes: fan-out groups + loops` comment (before the `selectGroups` Map is
declared and aggregated).

- `scripts/kaola-workflow-plan-validator.js` — inserted at line 548 (before original line 548)
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — byte-identical copy of scripts/ file
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — same pre-check, same string
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` — same pre-check, same string

The pre-check block:

```js
// #268 G-SEL-1b pre-check — every select arm must name a non-empty selector_source.
// Run BEFORE selectGroups aggregation so a blank arm cannot slip past the .filter(Boolean)
// in the per-group srcs Set and masquerade as the sole source (phantom arm bypass).
for (const n of nodes) {
  if (n.shape.kind === 'select' && !n.selectorSource) {
    errors.push(`G-SEL-1b: arm "${n.id}" in select group "${n.shape.group}" has no selector_source declared`);
  }
}
```

## Exact error string produced

```
G-SEL-1b: arm "arm-html" in select group "fix" has no selector_source declared
```

`n.id` = the node id cell, `n.shape.group` = the group name parsed from `select(<group>)`.
`!n.selectorSource` catches blank, `—`, and `-` because line 140 of the validator already
coerces all three to `''` during node parsing.

## Test case

File: `scripts/simulate-workflow-walkthrough.js`
Function: `testAdaptivePatternLibrary`
Inserted after the G-SEL-1e block, before the G-SEL-4 block.

Test name (assertion message prefix):
  `G-SEL-1b (#268): blank selector_source arm must refuse with per-arm G-SEL-1b message`

Fixture: a 5-node plan with `arm-html` having `— ` in the `selector_source` column.
Before fix: validator returned `{"result":"in-grammar",...}` — test failed (RED confirmed).
After fix: validator returns `{"result":"refuse","errors":[...G-SEL-1b...]}` — test passes (GREEN).

Assertion:
```js
assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => e.includes('G-SEL-1b: arm "arm-html" in select group "fix" has no selector_source declared')),
  'G-SEL-1b (#268): blank selector_source arm must refuse with per-arm G-SEL-1b message, got: ' + JSON.stringify(r));
```

## Test run results

`node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation passed"
`npm test` — exit 0, all suites passed (claude, codex, gitlab, gitea)

## Deviations from plan

None. The fix is purely additive. All five declared write-set files were touched.
Files 1 and 2 are byte-identical (confirmed with `diff`). Files 3 and 4 carry the same
pre-check block and identical error string as required.
