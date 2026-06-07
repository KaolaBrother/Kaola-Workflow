# fix node evidence — issue #280

## RED failures (observed)

### RED 1 — M1 back-fill (testPlannerAttestFlagBackfillsDispatchLog fails without parseArgs + claimProject patch)

Before the M1 fix, running the walkthrough fails at the first AC1 assertion:

```
Error: M1 (#280): --attest-planner-spawn must create dispatch-log.jsonl at
/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-280-ac1-aIJufL/kaola-workflow/issue-280001/.cache/dispatch-log.jsonl
    at assert (…simulate-workflow-walkthrough.js:24:25)
    at testPlannerAttestFlagBackfillsDispatchLog (…simulate-workflow-walkthrough.js:8874:5)
    at main (…simulate-workflow-walkthrough.js:8841:5)
```

### RED 2 — M2 sink-merge (testPlannerAttestFlagBackfillsDispatchLog sink-merge assertion fails without sink-merge patch)

Temporarily removing the `checkDispatchAttestations(...)` call from kaola-workflow-sink-merge.js
(while keeping the M1 back-fill in place) produces the exact #277 bug:

```
Error: M2 (#280): sink-merge closure_receipt.claim_planner_attested must be attested, got: failed
    at assert (…simulate-workflow-walkthrough.js:24:25)
    at testPlannerAttestFlagBackfillsDispatchLog (…simulate-workflow-walkthrough.js:8934:5)
    at main (…simulate-workflow-walkthrough.js:8841:5)
```

The `'failed'` value is the emptyReceipt default that was never overwritten — the exact
false-failure described in #277.

### RED 3 — contract guard (testPlannerAttestFlagPresentInPlannerAgent fails without planner.md patch)

Removing `--attest-planner-spawn` (and the inline note) from agents/workflow-planner.md,
while AC1/AC2 code fixes are present so they pass, isolates the contract guard:

```
Error: contract guard (#280): agents/workflow-planner.md startup invocation must contain
--attest-planner-spawn, got (excerpt): startup (workflow-state.md; the adaptive claim provisions
a repo-local worktree at <repo-root>/.kw/worktrees/<project>/; the planner authors and freezes...
    at assert (…simulate-workflow-walkthrough.js:24:25)
    at testPlannerAttestFlagPresentInPlannerAgent (…simulate-workflow-walkthrough.js:9027:3)
    at main (…simulate-workflow-walkthrough.js:8843:5)
```

## GREEN walkthrough result

```
testPlannerAttestFlagBackfillsDispatchLog: PASSED
testPlannerAttestFlagAbsentStaysMissing: PASSED
testPlannerAttestFlagPresentInPlannerAgent: PASSED
Workflow walkthrough simulation passed
```

Full npm test (EXIT:0): validate-script-sync byte-identity + GitHub + Codex + GitLab + Gitea all pass.

## Diffs applied

### 1. scripts/kaola-workflow-claim.js (+ byte-mirror plugins/kaola-workflow/scripts/kaola-workflow-claim.js)

**parseArgs** — added boolean flag handler (after `--keep-branch`, before the generic key=value branch):
```js
// M1 (#280): planner self-attest flag; a boolean flag like --json/--force.
if (key === '--attest-planner-spawn') { args.attestPlannerSpawn = true; continue; }
```

**claimProject** — added back-fill block after postAdvisoryClaim(), before return (~line 613):
```js
// M1 (#280): planner self-attest back-fill.
// The SubagentStart hook logs dispatched agents to .cache/dispatch-log.jsonl but cannot
// log the planner's OWN spawn (no project state file exists at that moment — this claim
// creates it). When --attest-planner-spawn is supplied by the planner's own startup
// invocation, back-fill a workflow-planner entry so checkDispatchAttestations sees it.
// Gated strictly on the flag: a main-session inline bypass (no flag) writes nothing →
// claim_planner_attested stays missing/failed (inline-bypass detector still fires).
// Wrapped in try/catch: attestation is warn-first and must NEVER block the claim.
if (args.attestPlannerSpawn) {
  try {
    const cacheDir = path.join(root, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const entry = JSON.stringify({ ts, agent_type: 'workflow-planner', agent_id: 'claim-backfill', cwd: root });
    fs.appendFileSync(path.join(cacheDir, 'dispatch-log.jsonl'), entry + '\n');
  } catch (_) { /* fail-open: attestation is warn-first */ }
}
```

### 2. scripts/kaola-workflow-sink-merge.js (+ byte-mirror plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js)

**Import line** — added `checkDispatchAttestations` to destructured require from claim.js (~line 6):
```js
const { getCoordRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations } = require('./kaola-workflow-claim.js');
```

**After buildClosureReceipt call, before checkClosureInvariants** (~lines 301-302):
```js
// M2 (#280): WARN-FIRST dispatch attestation check, archive-first (matching cmdFinalize).
// cmdFinalize archives .cache/ before sink-merge runs, so the live path is absent;
// check archive candidate first, then live as fallback. emptyReceipt 'failed' defaults
// are overwritten here so a real dispatch-log (with both lines) yields 'attested'.
checkDispatchAttestations([
  path.join(archiveDest, '.cache'),
  path.join(mainRoot, 'kaola-workflow', args.project, '.cache')
], receipt);
```

### 3. agents/workflow-planner.md

Startup invocation updated to add `--attest-planner-spawn`:
```
node <claim.js> startup --runtime claude --workflow-path adaptive [--sink <sink>] --target-issue <N> --attest-planner-spawn
```

Added inline note:
```
`--attest-planner-spawn` lets claim.js back-fill the planner's own (otherwise-unloggable) dispatch
marker into `.cache/dispatch-log.jsonl`; only a genuinely-dispatched workflow-planner running this
startup procedure passes it (#280).
```

### 4. scripts/simulate-workflow-walkthrough.js

Added three new test functions before `main()` and registered them in `main()`:
- `testPlannerAttestFlagBackfillsDispatchLog` — AC1: M1 back-fill + M2 sink-merge attestation
- `testPlannerAttestFlagAbsentStaysMissing` — AC2: no-flag path stays not-attested
- `testPlannerAttestFlagPresentInPlannerAgent` — contract guard: planner.md contains the flag

## Byte-mirror verification

Both plugin copies cp'd from scripts/ after all edits:
- scripts/kaola-workflow-claim.js == plugins/kaola-workflow/scripts/kaola-workflow-claim.js (IDENTICAL)
- scripts/kaola-workflow-sink-merge.js == plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js (IDENTICAL)

validate-script-sync: OK: 17 common scripts and 7 byte-identical file group in sync.
