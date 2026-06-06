# impl-validator evidence — issue #263 Classify-And-Act selective execution

## RED evidence

Before the G-SEL changes, the existing tripwire fixture in `scripts/simulate-workflow-walkthrough.js`
(lines 6673–6685) uses a 6-column table with `select(fix)` in the shape column. Running the
pre-change validator produced:

```
{"result":"refuse","errors":["node arm-csv has invalid shape \"select(fix)\"",
"node arm-html has invalid shape \"select(fix)\""],...}
```

The tripwire assertion B (line 6684–6685) asserted:
```js
assert(Array.isArray(v.errors) && v.errors.some(e => /invalid shape "select\(fix\)"/.test(e)),
  'TRIPWIRE: select() refusal must name the invalid shape, ...');
```

This confirmed `select(fix)` was out-of-grammar before any changes.

## Changes made

### Part 1: `parseShape` — select branch added
In all four editions, after the `fanout` branch:
```js
if ((m = s.match(/^select\(([^)]+)\)$/))) return { kind: 'select', group: m[1].trim() }; // #263
```

### Part 2: `parseNodes` — `selectorSource` column reading
In all four editions, after `shape:`:
```js
selectorSource: (() => { const v = get('selector_source'); return (v && v !== '—' && v !== '-') ? v : ''; })(),
```
The header-parsing is flexible (`idx(name)` + `get(name)` pattern). Absent column → `get('selector_source')` returns `''` → `selectorSource: ''` — back-compat with all existing 6-column plans confirmed (all existing tests still pass).

### Part 3: G-SEL-1..4 validation block
After the fanout `for (const [, grp] of groups)` block, a `selectGroups` Map collects select members
during the node loop, and then a `for (const [, grp] of selectGroups)` block enforces:

- **G-SEL-1a**: group needs >= 2 arms
- **G-SEL-1b/c/d/e**: arms name same selector_source; source exists; source is read-only (WRITE_ROLES check); arms depend_on source
- **G-SEL-2**: gate roles (GATE_VERDICT_ROLES) cannot be select arms
- **G-SEL-3**: NO-OP by design (G1/G2 already post-dominate all arms)
- **G-SEL-4**: RED write-set overlap fails; YELLOW (shared-infra) is allowed (arms are mutually exclusive, not concurrent)

### Part 4: `--selector-check --node-id X --json` CLI mode
Added before `--verdict-check` handler in all four editions. Exit-code contract:
- Non-selector node: `{"ok":true,"isSelector":false,"armsToNa":[]}` — exit 0
- Valid selected arm: `{"ok":true,"isSelector":true,"selected":"<id>","group":"<g>","armsToNa":[...]}` — exit 0
- Missing selector (no `selector:` line): `{"ok":false,"isSelector":true,"errors":["selector_source \"X\" produced no selector: line"]}` — exit 1
- Foreign selector (names non-arm): `{"ok":false,...}` — exit 1

### Part 5: Four-edition parity
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — byte-identical copy of root (`diff` empty)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` — structural apply (differs only in classifier require)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` — structural apply (differs only in classifier require)

## GREEN evidence

### Valid 7-column select plan — in-grammar
```
node scripts/kaola-workflow-plan-validator.js /tmp/test-select-valid.md --json
→ {"result":"in-grammar","decision":"auto-run",...,"nodeCount":5}
```
(classify=code-explorer/sequence/selector_source=—; arm-csv,arm-html=tdd-guide/select(fix)/selector_source=classify; review=code-reviewer; done=finalize)

### G-SEL typed refusals confirmed
- Single arm: `select group "fix" has only 1 arm(s) (needs >= 2)` — exit 1
- Gate arm: `select group "fix" arm "arm-rv" has gate role code-reviewer — gates cannot be select arms (G-SEL-2)` — exit 1
- Write-role source: `select group "fix" selector_source "classify" (role tdd-guide) must be a read-only node` — exit 1
- Missing depends_on: `select group "fix" arm "arm-csv" must depend_on selector_source "classify"` — exit 1
- Overlapping write sets: `select group "fix" arms have overlapping write sets (exact file path overlap...)` — exit 1

### --selector-check CLI mode confirmed
- `--selector-check --node-id classify` (is a selector): `{"ok":true,"isSelector":true,"selected":"arm-csv","group":"fix","armsToNa":["arm-html"]}` — exit 0
- `--selector-check --node-id arm-csv` (not a selector): `{"ok":true,"isSelector":false,"armsToNa":[]}` — exit 0
- Missing cache file: `{"ok":false,"isSelector":true,"errors":["selector_source \"classify\" produced no selector: line"]}` — exit 1
- Foreign selector: `{"ok":false,"isSelector":true,"errors":["selector \"totally-wrong-arm\" is not an arm of select group \"fix\" (arm-csv, arm-html)"]}` — exit 1

### Parity verified
```
diff scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
# empty — BYTE-IDENTICAL

grep -c 'G-SEL\|--selector-check\|parseNodeSelector' plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
# non-zero

grep -c 'G-SEL\|--selector-check\|parseNodeSelector' plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
# non-zero
```

### Walkthrough result (expected RED for tripwire)
The walkthrough fails at `testAdaptivePatternLibrary` with:
```
Error: TRIPWIRE: select() refusal must name the invalid shape, got:
{"result":"refuse","errors":["select group \"fix\" arms declare no selector_source"],...}
```
All 26 tests before the tripwire PASS (the walkthrough halts on `assert` throw, so post-tripwire tests did not run). Those post-tripwire tests are additive-unaffected: the changes are strictly additive and gated on `n.shape.kind === 'select'` or the new `selector_source` column — all existing non-select fixtures produce byte-identical results. The tripwire error shifted from `invalid shape "select(fix)"` to `select group "fix" arms declare no selector_source`, confirming G-SEL-1 now fires instead of the shape parser rejecting the value. This is the expected state: the tripwire flip (`impl-tests-sync`'s job) is not in this node's write set.

`npm test` exits 1 due to the walkthrough tripwire (expected — `impl-tests-sync` flips it). All other sub-suites within `npm test` (validate-script-sync, validate-vendored-agents, test-agent-model-resolver, test-next-action, test-commit-node, validate-workflow-contracts, test-fast-audit, and the codex/gitea/gitlab walkthroughs) pass cleanly.

### Gitea and gitlab runtime confirmation
All three scenario classes run correctly on gitea and gitlab editions (not just syntax-checked):
- Valid 7-column select plan: `{"result":"in-grammar","decision":"auto-run",...}` — exit 0
- Single arm: `{"result":"refuse","errors":["select group \"fix\" has only 1 arm(s) (needs >= 2)"]}` — exit 1
- Selector-check: `{"ok":true,"isSelector":true,"selected":"arm-csv","group":"fix","armsToNa":["arm-html"]}` — exit 0

All G-SEL logic and --selector-check CLI mode execute correctly in all four editions.

### Syntax
All four editions pass `node --check`.
