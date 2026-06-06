# impl-schema evidence — parseNodeSelector (#263)

## RED evidence

Before any changes, `parseNodeSelector` was absent from the schema module:

```
$ node -e "const s=require('./scripts/kaola-workflow-adaptive-schema.js'); console.log('parseNodeSelector:', typeof s.parseNodeSelector);"
parseNodeSelector: undefined
```

The frozen plan (`kaola-workflow/issue-263/workflow-plan.md` L55) confirms impl-schema's
declared write set is only the 4 schema files:
```
scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
```

The task prompt asked for a unit test to be written in
`scripts/simulate-workflow-walkthrough.js`, but that file is NOT in impl-schema's declared
write set — it belongs to `impl-tests-sync` (confirmed by plan L58 and plan.md L159–160:
"Do NOT touch the walkthrough, validator, or commit-node from this node"). RED was
demonstrated via the `typeof` check above and the 5 pure-case inline smoke tests run
in `$TMPDIR`-equivalent inline mode below.

## GREEN evidence

### Change 1 — parseNodeSelector function added

Inserted immediately after `parseNodeVerdict` (before the `// #238` CURATED_ROOT_PATHS
comment block) in all four schema files. Exact body per plan.md L122–128:

```js
// #263: the mechanical SELECTOR vocabulary a read-only classifier (selector_source) emits
// into its `.cache/{node-id}.md` evidence. Same discipline as parseNodeVerdict: native
// multiline regex ONLY (no classifier import — cross-edition byte-identity). FENCE-BLIND BY
// ANCHOR: a selector line is recognised ONLY at column 0 (`^selector:`). Last-match-wins.
// Value is a single bare token (an arm id — no whitespace). No vocabulary clamp: which arm
// ids are legal is plan-relative and is checked by the validator's --selector-check.
// Returns { found, selector: <arm-id>|null }.
function parseNodeSelector(cacheText) {
  const text = String(cacheText || '');
  const re = /^selector:[ \t]*([^\s]+)[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(text)) !== null) { last = m[1]; }
  return { found: last !== null, selector: last };
}
```

### Change 2 — export added

`parseNodeSelector,` inserted in `module.exports` immediately after `parseNodeVerdict,`
(per plan.md L131–138) in all four files.

### Pure-case smoke (5 cases, all GREEN)

```
empty -> {"found":false,"selector":null}
col-0 selector: fix-arm -> {"found":true,"selector":"fix-arm"}
indented selector -> {"found":false,"selector":null}       (col-0 anchor blocks indented lines)
last-match-wins -> {"found":true,"selector":"arm-b"}
no selector: line -> {"found":false,"selector":null}
All 5 pure cases pass
```

These cover:
- Empty string => `{ found: false, selector: null }`
- Column-0 `selector: fix-arm` => `{ found: true, selector: 'fix-arm' }`
- Indented `    selector: arm-csv` => `{ found: false, selector: null }` (fence-blind by col-0 anchor)
- Last-match-wins: `selector: arm-a\nselector: arm-b` => `{ found: true, selector: 'arm-b' }`
- Text with no `selector:` line => `{ found: false, selector: null }`

### Byte-identity verification (diff output empty = PASS)

```
$ diff scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
codex: IDENTICAL
$ diff scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
gitea: IDENTICAL
$ diff scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
gitlab: IDENTICAL
```

All three diffs produced zero output.

### validate-script-sync.js

```
$ node scripts/validate-script-sync.js
OK: 13 common scripts and 5 byte-identical file group in sync.
```

The existing `adaptive-schema constant copies` group (L100–106) already covers all four
editions — no new group entry was needed (confirmed: plan.md L147–149 and explore.md §8).

### Full walkthrough

```
$ node scripts/simulate-workflow-walkthrough.js | tail -5
testAdaptiveVerdictCheck: PASSED
testAdaptivePatternLibrary: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0

The `select()` tripwire in `testAdaptivePatternLibrary` still asserts `refuse` +
`invalid shape "select(fix)"`. This is expected and correct — the tripwire flip belongs to
`impl-tests-sync` (plan L466–504), NOT impl-schema.

## Write-set deviation note

The task prompt instructed adding unit tests to `scripts/simulate-workflow-walkthrough.js`
(RED->GREEN requirement). That file is NOT in impl-schema's frozen write set (plan L55;
plan.md L159–160 explicitly: "Do NOT touch the walkthrough … from this node — they belong
to later nodes"). Writing to the walkthrough would trip the per-node barrier at commit time.
RED/GREEN was demonstrated via inline smoke tests instead. The parallel `parseNodeSelector`
unit-test block in the walkthrough is impl-tests-sync's deliverable (plan L518–540).
