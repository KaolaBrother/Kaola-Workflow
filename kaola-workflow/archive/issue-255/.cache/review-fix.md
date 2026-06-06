# Review Fix Evidence — Issue #255

Consolidated review-fix pass (G1 gate, 3 BLOCKING + MINOR fixes).

---

## BLOCKING 1 — `--project` resolves user-repo root (getRoot fix)

### getRoot helper copied from active-folders.js / roadmap.js

Exact convention used (same in both):

```js
function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}
```

Added above the sibling script constants in both:
- `scripts/kaola-workflow-adaptive-handoff.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js`

`main()` changed: `const repoRoot = path.resolve(__dirname, '..')` → `const repoRoot = getRoot()`
(with explanatory comment preserved).

Sibling constants (`validatorPath`/`commitNodePath`/`roadmapPath`) remain resolved via `__dirname` — correct.

### RED evidence (old code — install-dir resolution bug)

Reverted ONLY `const repoRoot = getRoot()` → `const repoRoot = path.resolve(__dirname, '..')` in
the canonical, then ran `node scripts/simulate-workflow-walkthrough.js`:

```
Error: testAdaptiveHandoffProjectFlagResolvesRepoRoot: exit must be 0, got 1
stderr:
stdout: {"handoff_status":"plan_invalid","result":"refuse","errors":["workflow-state.md missing — planner did not claim"],"validator_verdict":null}

    at assert (simulate-workflow-walkthrough.js:23:25)
    at testAdaptiveHandoffProjectFlagResolvesRepoRoot (simulate-workflow-walkthrough.js:7078:5)
    at main (simulate-workflow-walkthrough.js:7248:5)
```

The test creates a fresh git repo in `/tmp/...` (simulating a user's project). The script is
executed from that tmp cwd. With `__dirname/..`, the script resolves `repoRoot` to the KAOLA-WORKFLOW
repo (`/Volumes/.../kaola-workflow/`), not the tmp user repo. `workflow-state.md` is not found
there → `plan_invalid`. The test asserts `r.status === 0` → FAIL. GREEN after restoring `getRoot()`:
`testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED`.

### GREEN evidence (new test — `testAdaptiveHandoffProjectFlagResolvesRepoRoot`)

Added to `scripts/simulate-workflow-walkthrough.js`:
- Creates a fresh tmp git repo (`adaptiveTmp('handoff-proj-root')`)
- Plants `kaola-workflow/issue-255-proj-root/workflow-plan.md` (in-grammar, G1-compliant: explore→review→done)
- Plants `workflow-state.md`
- Runs `node <repoRoot>/scripts/kaola-workflow-adaptive-handoff.js --project issue-255-proj-root --json` with cwd=tmp
- Asserts `handoff_status === 'ready_to_dispatch_first_node'`
- Registered in `main()` after the other handoff tests

Result: `testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED`

---

## BLOCKING 2 — contract-validator mirror drift

`scripts/validate-workflow-contracts.js` was amended for #255 (un-ban 'handoff' token +
lock `ready_to_dispatch_first_node`/`plan_invalid`). Plugin mirror was out of sync.

Fix:
```
cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
```

Verification:
```
diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
# empty (byte-identical)

node scripts/validate-script-sync.js
# OK: 14 common scripts and 5 byte-identical file group in sync. EXIT: 0
```

Additionally found: `scripts/validate-kaola-workflow-contracts.js` (Codex-only validator, NOT in
COMMON_SCRIPTS) still had `'hand' + 'off'` in its retired list, causing `npm test` to fail on the
`kaola-workflow-adapt` skill. Fixed by removing the bare 'handoff' entry and adding the same
`#255` comment as the canonical. Also added #255 handoff status assertions to Codex validator.

---

## BLOCKING 3 — forge handoff ports created

Examined `kaola-gitlab-workflow-commit-node.js` and `kaola-gitlab-workflow-next-action.js`
to see the forge-port pattern:
- Only `VALIDATOR = 'kaola-gitlab-workflow-plan-validator.js'` (and COMMIT_NODE/ROADMAP) differ
- `require('./kaola-workflow-resolve-agent-model')` stays (common module, present in both forge trees)
- `require('./kaola-gitlab-workflow-next-action')` for gitlab

Created:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js`
  - VALIDATOR = `kaola-gitlab-workflow-plan-validator.js`
  - COMMIT_NODE = `kaola-gitlab-workflow-commit-node.js`
  - ROADMAP = `kaola-gitlab-workflow-roadmap.js`
  - computeNextAction from `./kaola-gitlab-workflow-next-action`

- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js`
  - VALIDATOR = `kaola-gitea-workflow-plan-validator.js`
  - COMMIT_NODE = `kaola-gitea-workflow-commit-node.js`
  - ROADMAP = `kaola-gitea-workflow-roadmap.js`
  - computeNextAction from `./kaola-gitea-workflow-next-action`

Both verified to run (print usage, no throw):
```
node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js --help
# usage: kaola-gitlab-workflow-adaptive-handoff.js ... EXIT: 0

node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js --help
# usage: kaola-gitea-workflow-adaptive-handoff.js ... EXIT: 0
```

The forge adapt command dispatch in `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`
and `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md` already references these
script names — they now exist.

### Forge-port fidelity check (post-advisor review)

Normalized diffs after all MINOR fixes exposed that the forge ports were sed'd from a pre-fix
canonical snapshot and were missing:
1. Dead `const padded` removal (still present in both ports)
2. `roadmap_staged` advisory comment (missing in both ports)

Fixed both ports. Verified via normalized diff:
```
diff <(sed 's/kaola-gitlab-workflow-/kaola-workflow-/g' \
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js) \
  scripts/kaola-workflow-adaptive-handoff.js
# empty (CLEAN)

diff <(sed 's/kaola-gitea-workflow-/kaola-workflow-/g' \
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js) \
  scripts/kaola-workflow-adaptive-handoff.js
# empty (CLEAN)
```

Note: the forge ports are NOT in COMMON_SCRIPTS (they are forge-specific), so `validate-script-sync.js`
does not check them. The normalized diff above IS the authoritative fidelity check.

---

## MINOR fixes (applied to BOTH byte-identical handoff copies)

### 1. Planning-Evidence splice byte-idempotency

`splicePlanningEvidence` replace-in-place branch: removed `.trimEnd()` call AND added
`.replace(/\n+$/, '\n')` to normalize trailing newlines.

Before: `return content.replace(existing, newBlock.trimEnd());`
After:  `return content.replace(existing, newBlock).replace(/\n+$/, '\n');`
(with explanatory comment in both changes)

Analysis: The `existing` regex `/## Planning Evidence\s*\n[\s\S]*?(?=\n## |\s*$)/` uses a
zero-width lookahead `\s*$`. When PE is in the MIDDLE (before `\n## Last Updated`): the
lookahead matches at the `\n## Last Updated` boundary and the match terminates there, consuming
the blank line's first `\n`. Without `.trimEnd()`, `newBlock` ends in `\n`, leaving a blank
line before `## Last Updated` — correct.

When PE is at EOF (EOF-append case): `\s*$` matches the trailing `\n` without consuming it
(lookahead). The match stops before the trailing `\n`, leaving it in the content. `newBlock` adds
its own trailing `\n`, yielding a double `\n`. The `.replace(/\n+$/, '\n')` normalizes to one
`\n` — making the EOF-append path byte-idempotent too.

This second fix (EOF normalization) was found by T5b — a new test case added during the advisor
review cycle.

Strengthened T5 in `scripts/test-adaptive-handoff.js`:
- Added discriminating assertion: `stateAfterRun1.includes('first_node_role: code-explorer\n\n## Last Updated')` — fails with `.trimEnd()`, passes with fix.
- Added run3 to T5 and asserts `stateAfterRun3 === stateAfterRun2` (3-way stability).
- Added T5b: EOF-append fixture (state has NO `## Last Updated`, NO `## Sink`); runs `runHandoff`
  three times and asserts `s5b1 == s5b2 == s5b3` (all three byte-identical).

Result: 61 assertions (was 45), all pass.

RED evidence for idempotency fix: T5b FAILED before the `.replace(/\n+$/, '\n')` fix:
```
FAIL: T5b: state byte-identical run1==run2 (EOF-append branch idempotency)
FAIL: T5b: state byte-identical run2==run3 (3-way EOF-append stability)
adaptive-handoff tests FAILED (2 failures, 59 passed)
```
GREEN after fix: `adaptive-handoff tests passed (61 assertions)`

### 2. Remove dead `const padded`

Removed dead variable `const padded = (' ' + newStatus + ' ').padEnd(...)` from
`spliceLedgerNode` (was never read — `newCell` uses the re-computed cell spacing below it).

### 3. roadmap_staged advisory comment

Added one-line comment to Step 7 in `runHandoff`:
```
// roadmap_staged is ADVISORY/best-effort: a non-EEXIST init-issue failure does
// NOT block ready_to_dispatch_first_node; the finalize sink regenerates the roadmap.
```

No behavior change — documentation only.

---

## Verification — all exit codes

| Check | Exit |
|---|---|
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | empty (byte-identical) |
| `node scripts/test-adaptive-handoff.js` | 0 (61 assertions) |
| `node scripts/simulate-workflow-walkthrough.js` | 0 (Workflow walkthrough simulation passed) |
| `node scripts/validate-vendored-agents.js` | 0 |
| `npm test` | 0 (all 4 lanes green) |

## Byte-identity diff

```
diff scripts/kaola-workflow-adaptive-handoff.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
# empty (BYTE-IDENTICAL)
```

Note: `node plugins/kaola-workflow/scripts/validate-workflow-contracts.js` exits 1 when invoked
directly from the repo root (pre-existing: its `root = path.resolve(__dirname, '..')` points to
`plugins/kaola-workflow/` in that invocation context, so `commands/kaola-workflow-phase1.md` is
not found). This was broken before this fix pass. Verified byte-identical to canonical via
validate-script-sync (exit 0). The plugin copy is designed to run from within a Codex workspace
where `commands/` is at the plugin's parent.

---

## New finding during fix pass

`validate-kaola-workflow-contracts.js` (Codex-only, not in COMMON_SCRIPTS) still banned
`'handoff'` as a retired token — this caused `npm test` (codex lane) to fail because the
`kaola-workflow-adapt` skill SKILL.md now legitimately uses 'handoff' (it references the
adaptive-handoff script). Fixed by removing the bare 'handoff' entry and adding the same
`#255` comment explaining why it's no longer retired. Also added `ready_to_dispatch_first_node`
and `plan_invalid` assertions for the adapt skill, and existence check for the handoff script.
