# Evidence — node orient-batch-aware (issue #281, AC#5 typed refusal)

Role: tdd-guide. RED→GREEN. Defect repair: `runOrient` in `kaola-workflow-adaptive-node.js`
broke on the FIRST `in_progress` ledger row and never enforced AC#5 ("multiple in_progress rows
are legal ONLY with a valid active batch manifest; else typed refusal"). The script now emits
`orphan_multi_in_progress` (AC#5 is a SCRIPT emission — agent-prose enforcement is out-of-grammar).

## Declared write set (exactly 5 files — all touched, nothing else)
1. `scripts/kaola-workflow-adaptive-node.js` — `runOrient` change.
2. `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` — byte-identical copy.
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` — same change, gitlab renames preserved.
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` — same change, gitea renames preserved.
5. `scripts/test-adaptive-node.js` — added T20a–T20e (failing-first).

## RED (failing-first) — `node scripts/test-adaptive-node.js`
Added T20a–T20e BEFORE implementing. Field `inProgressNodes` / `batch` / refusal did not exist yet.

```
REAL EXIT CODE: 1
FAIL: T20a: inProgressNodes is an array (additive field)
  assert(result.inProgressNodes.length === 1, 'T20a: inProgressNodes lists exactly the one in_progress row');
TypeError: Cannot read properties of undefined (reading 'length')
```

`inProgressNodes` undefined → `orphan_multi_in_progress` un-emittable → `batch` field absent. RED proven.

## GREEN (after the additive `runOrient` change) — `node scripts/test-adaptive-node.js`

```
REAL EXIT CODE: 0
adaptive-node tests passed (135 assertions)
```

135 = the existing 104 assertions (UNCHANGED, T1–T19 incl. T9 single-node back-compat) + 31 new:
- T20a: single in_progress + NO manifest → `result:'ok'`, `inProgressNode` set as before,
  `inProgressNodes.length===1`, `batch:null` (back-compat proof).
- T20b: two in_progress + matching `active-batch.json` → `result:'ok'`, `batch.state` set,
  `batch.members` lists both, NO refusal.
- T20c: two in_progress + NO manifest → `result:'refuse'`, `reason:'orphan_multi_in_progress'`,
  `inProgressNodes` lists both. (The AC#5 emission.)
- T20d: two in_progress + MISMATCHED manifest member set → same typed refusal.
- T20e: consentHalt / escalatedToFull / allDone / inProgressNode-null paths all unchanged.

## Byte-identical pair (root ↔ claude plugin) — diff MUST be empty
```
$ diff scripts/kaola-workflow-adaptive-node.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
---CLAUDE PAIR DIFF EXIT: 0---
```
Empty diff (exit 0). validate-script-sync.js: `OK: 18 common scripts and 7 byte-identical file group in sync.` (exit 0).

## Forge forks — differ from root by ONLY the pre-existing 4 rename hunks (lines 5, 29–31, 246)
The `runOrient` change references NO sibling filename literal, so it added ZERO new diff lines.
gitlab/gitea diffs vs root remain exactly: header comment + COMMIT_NODE/NEXT_ACTION/VALIDATOR
consts + the parseNodes require path. All four editions parse:
```
PARSE OK: scripts/kaola-workflow-adaptive-node.js
PARSE OK: plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
PARSE OK: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
PARSE OK: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
```

## Full verification (REAL exit codes captured directly, not via tail)
- `node scripts/test-adaptive-node.js` → exit 0 (135 assertions)
- `node scripts/validate-script-sync.js` → exit 0
- `node scripts/simulate-workflow-walkthrough.js` → exit 0 ("Workflow walkthrough simulation passed")
- `npm test` → exit 0 (github + gitlab + gitea contract validation, walkthroughs, codex walkthroughs all PASSED)

## Per-node barrier scope (verified, not asserted)
This node's baseline `kaola-workflow/issue-281/.cache/barrier-base-orient-batch-aware` was recorded
AFTER all prior-node work was already in the working tree, so the barrier diff isolates ONLY this
node's delta. The 25 other modified files in `git status` belong to upstream nodes (design-blueprint
… planner-profile, all `complete`) and are invisible to this baseline.
```
$ node scripts/kaola-workflow-commit-node.js kaola-workflow/issue-281/workflow-plan.md --node-id orient-batch-aware --json
REAL EXIT: 0   result: ok   overallOk: true   barrier result: pass
outOfAllow: []   errors: []   sensitiveHits: []
```
Empty `outOfAllow` ⇒ every changed path is within the 5 declared files (`.cache/*.md` exempt). The
node touched exactly its declared write set and nothing else.

## Summary (additive, back-compat)
1. The change is STRICTLY ADDITIVE: `inProgressNode`/`cacheState` are still set to the first/only
   in_progress row, so the existing single-node resume path is byte-for-byte unchanged in behavior.
2. The existing 104 assertions (incl. T9) still pass; the only return-shape change is the ADDED
   `inProgressNodes:[...]` array and `batch:{state,members}|null` field.
3. `orphan_multi_in_progress` is now emitted by `orient` itself (a SCRIPT emission) whenever
   `inProgressNodes.length > 1` AND there is no manifest OR the manifest member-set ≠ the in_progress
   set — the load-bearing AC#5 enforcement from blueprint §3.
4. Manifest is read directly (READ-ONLY) from `.cache/active-batch.json` via the existing
   readFile/cacheExists seams (matching orient's read-the-artifact pattern; no new sibling literal,
   so the forge ports stay verbatim copies and orient stays mutation-free).
