# impl-tests-sync evidence — issue #263 (Classify-And-Act selective execution)

## RED evidence

Before changes, `node scripts/simulate-workflow-walkthrough.js` exited 1 at the tripwire assertion B in `testAdaptivePatternLibrary`:

```
Error: TRIPWIRE: select() refusal must name the invalid shape, got: {"result":"refuse","errors":["select group \"fix\" arms declare no selector_source"],"planHash":"e084c3edf6fbc4cb5eca533de8c8aca35818dbbb9d6db07a2cb3006ef51fbebe","sink":"done"}
    at assert (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/simulate-workflow-walkthrough.js:22:25)
    at testAdaptivePatternLibrary (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/simulate-workflow-walkthrough.js:6684:5)
```

Cause: impl-validator had landed. The fixture still lacked a `selector_source` column, so assertion A passed (`result === 'refuse'` still held — G-SEL-1 fires instead of invalid-shape) but assertion B failed because the error was now `select group "fix" arms declare no selector_source` (G-SEL-1b), not `invalid shape "select(fix)"`.

## GREEN evidence

After changes, `node scripts/simulate-workflow-walkthrough.js` prints:

```
testAdaptiveVerdictCheck: PASSED
testAdaptivePatternLibrary: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0.

`npm test` passes all four suites (claude/codex/gitlab/gitea). Confirmed exit code 0. Final sentinel lines:
```
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
NPM_TEST_EXIT: 0
```

## Changes made to `scripts/simulate-workflow-walkthrough.js`

### 1. parseNodeSelector unit tests (inside `testAdaptiveVerdictCheck`, after parseNodeVerdict cases)

Added 5 pure-case assertions for `schema.parseNodeSelector`:
- `selector: arm-csv` at column-0 → `{ found: true, selector: 'arm-csv' }`
- last-match-wins: two `selector:` lines → returns last
- empty text → `{ found: false, selector: null }`
- indented `    selector: arm-csv` (not col-0) → `{ found: false }` (col-0 anchor)
- no keyword → `{ found: false, selector: null }`

### 2. --selector-check CLI tests (inside `testAdaptiveVerdictCheck`, after --verdict-check CLI tests)

Added 4 CLI assertions against a 7-column plan written to a temp dir:
- non-selector node (`review`) → exit 0, `{ ok: true, isSelector: false, armsToNa: [] }`
- selector_source with missing cache → exit 1, `{ ok: false, isSelector: true }`
- selector_source with valid `selector: arm-csv` cache → exit 0, `{ ok: true, isSelector: true, selected: 'arm-csv', group: 'fix', armsToNa: ['arm-html'] }`
- selector_source with foreign `selector: arm-unknown` cache → exit 1, `{ ok: false, isSelector: true }`

### 3. Tripwire flip (inside `testAdaptivePatternLibrary`)

Replaced the 6-column `validatePlanFixture` call + refuse assertions with:
- An inline 7-column plan written via `fs.writeFileSync` + `runNode(planValidatorScript, [planPath, '--json'], tmp)`
- Assertion A: `result === 'in-grammar'` (was `'refuse'`)
- Assertion B: `decision === 'ask' || decision === 'auto-run'` (was error-message check; actual value: `'auto-run'`)

### 4. G-SEL typed-refusal cases (inside `testAdaptivePatternLibrary`, after the happy-path flip)

5 inline 7-column fixtures, each written via `fs.writeFileSync`, each asserting `result === 'refuse'` + the matching G-SEL error substring:
- G-SEL-1a: single-arm group → `select group "fix" has only 1 arm`
- G-SEL-2: gate arm (`code-reviewer` in select group) → `gates cannot be select arms`
- G-SEL-1d: write-role selector_source (`tdd-guide`) → `must be a read-only node`
- G-SEL-1e: arm missing `depends_on` the selector_source → `must depend_on selector_source`
- G-SEL-4: overlapping arm write sets (same file) → `overlapping write sets`

### 5. validate-script-sync.js (read-only pass — no changes)

Confirmed: the `adaptive-schema constant copies` group (lines 100–106) already lists all four `kaola-workflow-adaptive-schema.js` paths. The `parseNodeSelector` export auto-syncs through the existing group. No edit needed or made.

`node scripts/validate-script-sync.js` exits 0 with "OK: 13 common scripts and 5 byte-identical file group in sync."
