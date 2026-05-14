# Code-Architect: parallel-classifier

## Architecture: parallel-classifier

### Design Decisions

- **Single subcommand surface**: `kaola-workflow-classifier.js classify --issue <N>` mirrors the claim.js subcommand pattern. `process.argv[2]` is the subcommand `'classify'`; `--issue <N>` is parsed via a shared `parseArgs` clone. This matches the claim.js dispatcher (`main()` → `cmdClassify()`).
- **Singular per-candidate invocation**: The classifier is called once per candidate issue by the router loop. The classifier's single internal `gh issue list` batch call hydrates the open-issue set once internally; it does not do per-issue `gh issue view` lookups for the candidate file-set analysis (only for `depends-on` resolution).
- **Yellow-warning persistence via `.cache/parallel-classifier.md`**: When verdict is yellow and the candidate is picked by the router, the router writes `kaola-workflow/{project}/.cache/parallel-classifier.md` containing the shared-infra warning. Phase 1 (which already reads `.cache/` files) appends this to `phase1-research.md` on first run. This avoids modifying `phase1-research.md` before the project exists. For Epic Case 6C the test creates an existing `phase1-research.md`, then calls the classifier, then asserts the warning was appended.
- **Config lazy-create**: Config file is read if present; created with `{"parallel_mode":"auto"}` only if absent. If `parallel_mode !== "auto"`, verdict is `{"verdict":"green","reasoning":"parallel_mode disabled; bypassing classifier"}` and the script exits immediately.
- **Router loop fall-through**: When every candidate yields red/blocked, the loop ends with no `PICK` set; the router falls through to Startup Step 3 selection without invoking claim.
- **`jq` dependency avoided**: The router bash snippet uses `node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).verdict)"` to parse the classifier's JSON. This keeps stdlib-only; `jq` is not guaranteed in all Claude Code environments.
- **Line budget**: Current `workflow-next.md` is 211 lines. Net addition: +14 lines → 225 lines. Adding 1 line to Required Output → 226 lines. This is within the new 230-line cap.
- **Section heading rename**: "Startup Step 0 - Sweep And Claim" → "Startup Step 0 - Sweep, Classify, And Claim".
- **Classifier exit codes**: Always exits 0 on valid verdict (including `blocked`). Exits 1 only on hard errors. Exits 2 when issue is already claimed.

---

### Files to Create

| File | Purpose |
|------|---------|
| `scripts/kaola-workflow-classifier.js` | Classifier script — classifies open issues as green/yellow/red/blocked |

---

### Files to Modify

| File | Changes |
|------|---------|
| `commands/workflow-next.md` | Rename Step 0 heading; expand candidate-scan bash fence (pre-claim) |
| `install.sh` | Add classifier.js to explicit copy loop |
| `scripts/validate-workflow-contracts.js` | Bump cap 220→230; add 4 new assertions |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 6 with sub-tests 6A-6F |
| `README.md` | Add classifier.js row to Scripts Reference table |
| `CHANGELOG.md` | Add entry under [Unreleased] |

---

### Data Flow

```
workflow-next.md Startup Step 0
  → sweeps stale locks (via claim.js sweep)
  → for each open issue from gh issue list:
       node classifier.js classify --issue N
         → reads ~/.config/kaola-workflow/config.json  [lazy create if absent]
         → reads kaola-workflow/.locks/*.lock           [build claimed-set]
         → if issue.number in claimed-set → exit 2 (skip)
         → checks roadmap file for depends-on indication (OFFLINE)
         → OR gh issue view N --json state,closedAt (online)
         → builds candidate file-set from body regex + area:* labels
         → builds claimed write-sets from claimed projects' phase3-plan.md bodies
         → compares sets at coarse-area level
         → emits {"verdict":"green"|"yellow"|"red"|"blocked","reasoning":"..."}
  → router reads verdict from stdout
  → green|yellow → PICK; if yellow → write .cache/parallel-classifier.md warning
  → PICK found → claim (via claim.js claim)
  → no PICK → fall through to Step 3 normal selection
```

---

### Build Sequence

1. `kaola-workflow-classifier.js` — all logic; no new dependencies
2. `workflow-next.md` — router injection depends on classifier interface being settled
3. `install.sh` — copy loop addition
4. `validate-workflow-contracts.js` — assertions depend on above being defined
5. `simulate-workflow-walkthrough.js` — Epic Case 6 depends on classifier.js being runnable
6. `README.md` — documentation
7. `CHANGELOG.md` — documentation

---

### Task List

#### Task 1 — CREATE `scripts/kaola-workflow-classifier.js`
- Write Set: `scripts/kaola-workflow-classifier.js`
- Depends On: nothing
- Parallel Group: A
- Key interfaces:
  - `cmdClassify()`: reads args, config, locks; calls `classify()`
  - `classify(issue, claimedLocks, root)`: returns `{verdict, reasoning}`
  - `readLockFiles(root)`: returns array of lock objects
  - `readOrCreateConfig()`: returns config object
  - `extractCoarseAreas(text)`: returns Set of top-level dir names
  - `parseDependsOn(labels)`: returns issue number or null
  - `parseAreaLabels(labels)`: returns Set of area values
  - `parseArgs(argv)`: returns `{issue: number, json: boolean}`
- Validate: `node scripts/kaola-workflow-classifier.js 2>&1 | grep "usage:"`

#### Task 2 — MODIFY `commands/workflow-next.md`
- Write Set: `commands/workflow-next.md`
- Depends On: Task 1 (interface settled)
- Parallel Group: B
- Change: Rename Step 0 heading; replace code fence with 19-line classify-and-pick loop; add `Parallel decision:` to Required Output
- Validate: `wc -l commands/workflow-next.md && node scripts/validate-workflow-contracts.js`

#### Task 3 — MODIFY `install.sh`
- Write Set: `install.sh`
- Depends On: Task 1 (filename final)
- Parallel Group: B
- Change: Add `kaola-workflow-classifier.js` to copy loop
- Validate: `grep kaola-workflow-classifier.js install.sh`

#### Task 4 — MODIFY `scripts/validate-workflow-contracts.js`
- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: Tasks 1, 2, 3
- Parallel Group: C
- Changes: bump cap to 230; add exists assertion for classifier.js; add assertIncludes for install.sh + workflow-next.md
- Validate: `node scripts/validate-workflow-contracts.js`

#### Task 5 — MODIFY `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1
- Parallel Group: C
- Change: Add Epic Case 6 (sub-tests 6A-6F) before final console.log
- Validate: `node scripts/simulate-workflow-walkthrough.js`

#### Task 6 — MODIFY `README.md`
- Write Set: `README.md`
- Depends On: Task 1
- Parallel Group: B
- Change: Add classifier.js row to Scripts Reference table
- Validate: `grep kaola-workflow-classifier.js README.md`

#### Task 7 — MODIFY `CHANGELOG.md`
- Write Set: `CHANGELOG.md`
- Depends On: Tasks 1-6 complete
- Parallel Group: D
- Change: Add entry under [Unreleased]
- Validate: `grep kaola-workflow-classifier.js CHANGELOG.md`

---

### Parallelization Plan

| Group | Tasks | Notes |
|-------|-------|-------|
| A | Task 1 | Standalone creation; no dependencies |
| B | Tasks 2, 3, 6 | Once Task 1 spec frozen; all touch separate files |
| C | Tasks 4, 5 | Once Tasks 1+2+3 are merged; disjoint write sets |
| D | Task 7 | Can run any time |

---

### External Dependencies

None. Node.js stdlib only (`fs`, `path`, `os`, `child_process`). `gh` CLI is already a project dependency.

---

### Out-of-Scope Items

1. Non-`auto` `parallel_mode` semantics
2. Modifying `kaola-workflow-claim.js` claim flow
3. Cross-machine coordination beyond lock files
4. Concurrent classifier invocations / classifier-level locking
5. Network retry / rate-limit logic
6. Modifying any phase command (phase1–phase6)
7. `project-name` subcommand on `kaola-workflow-roadmap.js`
8. UI or interactive output
