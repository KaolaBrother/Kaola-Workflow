# m897 — three regressions that left `testActiveFoldersExcludesClosedIssue895` green

Baseline commit: `3e2019f6f7ff8fc4663db6bc5a08ff9949ec32cf`
Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898`
File touched (test only): `scripts/simulate-workflow-walkthrough.js`
Production code (`scripts/kaola-workflow-active-folders.js`) is **unmodified** in the worktree.

## WHAT WAS ADDED

Three sub-cases appended to `testActiveFoldersExcludesClosedIssue895`, plus one helper change.
All line numbers are in the worktree copy of `scripts/simulate-workflow-walkthrough.js`.

**Helper — `callReadActiveFolders(root, binDir, offlineFlag)`** (`:1404`, `:1432`)
Third optional parameter; `KAOLA_WORKFLOW_OFFLINE` is now `offlineFlag || '0'` instead of the
hard-wired `'0'`. Existing two call sites are unchanged and keep the `'0'` default.

**Sub-case C — a FAILED probe is not a closure** (`:1492`–`:1512`)
Shim: `gh issue list` → `[]` (memoizes nothing), `gh issue view 10` → stderr + `exit 1`,
`gh issue view 11` → `{"state":"CLOSED"}`.
- `:1508` fixture control — both folders visible with the filter OFF.
- **`:1510`** — survivors must be exactly `['alpha-project']`: issue 10 (unanswerable probe) survives,
  issue 11 (genuinely CLOSED) does not. Issue 11's exclusion is the non-vacuity control — it proves
  the shim is wired and the filter is live on that run.
- `:1512` — the survivor's `issue_number` is 10.

**Sub-case D — an EMPTY answer is not a closure** (`:1514`–`:1532`)
Roles inverted against C (10 CLOSED, 11 answers exit-0 with no stdout), so no property of a folder
number predicts the survivor across C and D.
- `:1528` fixture control.
- **`:1530`** — survivors must be exactly `['beta-project']`.
- `:1532` — the survivor's `issue_number` is 11.

**Sub-case E — OFFLINE excludes nothing** (`:1534`–`:1560`)
ONE fixture and ONE shim (`issue list` reports 10 CLOSED / 11 OPEN, per-issue views agree), run twice,
differing only in `KAOLA_WORKFLOW_OFFLINE`.
- `:1551` fixture control (**online**, `OFFLINE=0`) — this shim really does exclude issue 10's folder.
  This is what makes the offline assertion non-vacuous: same fixture, same shim, only the flag differs.
- `:1554` fixture control (offline, filter OFF) — both folders visible.
- **`:1557`** — with `OFFLINE=1` BOTH folders survive, in exactly the run that excluded one online.
- `:1560` — both issue numbers survive.

Every assertion reads what `readActiveFolders` actually returned (project names and issue numbers
marshalled out of the driver), not a verdict or an envelope field.

## MUTATION PROOFS

Method: the worktree was copied to a scratch mirror at
`/private/tmp/claude-501/.../scratchpad/m897/mirror`; every mutation was applied and reverted **there**,
never in the worktree. Each mutation was run twice — once against the **pre-change** scenario
(`git show HEAD:scripts/simulate-workflow-walkthrough.js`) to demonstrate the gap was real, and once
against the new scenario. Isolation via `--only testActiveFoldersExcludesClosedIssue895` (~15 s;
verified by the scenario name the run prints). Exit codes captured from `$?` directly, never a pipe.

### Gap 1 — a failed probe read as "closed" (`issueIsClosed`)

```diff
@@ -108,7 +108,7 @@
     rememberIssueState(key, closed ? 'closed' : 'open');
     return closed;
   } catch (_) {
-    return false;
+    return true;
   }
 }
```

| run | exit |
|---|---|
| mutation + **pre-change** scenario | **0** (the gap: the regression was invisible) |
| mutation + **new** scenario | **1** |
| mutation reverted + new scenario | **0** |

RED signature: `Error: #895 (unreachable): a FAILED probe must not be read as closed — issue 10's
folder must survive and issue 11's (genuinely CLOSED) must not, got []`

### Gap 2 — an empty answer read as "closed" (`issueIsClosed`)

```diff
     const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
-    if (!raw) return false;
+    if (!raw) return true;
     const data = JSON.parse(raw);
```

| run | exit |
|---|---|
| mutation + **pre-change** scenario | **0** (the gap) |
| mutation + **new** scenario | **1** |
| mutation reverted + new scenario | **0** |

RED signature: `Error: #895 (empty answer): an EMPTY gh response must not be read as closed — issue
11's folder must survive and issue 10's (genuinely CLOSED) must not, got []`

### Gap 3 — the `KAOLA_WORKFLOW_OFFLINE` short-circuit removed

The short-circuit is **redundant across sites**, so removing any single site is unobservable through
`readActiveFolders` (measured below). The mutation that actually removes the short-circuit from this
path is the two observable sites together:

```diff
 function ghExec(args, opts) {
-  if (OFFLINE) return '';
   const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
@@
 function issueIsClosed(issueNumber) {
-  if (OFFLINE || issueNumber == null) return false;
+  if (issueNumber == null) return false;
```

| run | exit |
|---|---|
| mutation + **pre-change** scenario | **0** (the gap) |
| mutation + **new** scenario | **1** |
| mutation reverted + new scenario | **0** |
| mutation + new scenario, `--only testProbeIssueStateOffline` | **0** |

RED signature: `Error: #895 (offline): KAOLA_WORKFLOW_OFFLINE=1 must short-circuit the closed-issue
probe entirely — BOTH folders must survive the same shim that excluded issue 10 online, got
["beta-project"]`

The fourth row is the attribution proof: the pre-existing OFFLINE scenario
(`testProbeIssueStateOffline`, which covers `probeIssueState`) stays **green** under this mutation, so
the new sub-case is the only thing in the walkthrough that catches it.

**Measured, secondary — the same gap at the source of the flag:**

```diff
-const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
+const OFFLINE = false;
```
new scenario → exit **1** (same assertion). `testProbeIssueStateOffline` → exit **1** as well
(`OFFLINE=1 must return state open, got: unavailable`), i.e. this coarser mutation was already caught
elsewhere. That is why the finer two-site mutation above is the one reported as the proof.

**Measured, negative — single-site removals are behaviourally inert on this path:**

| single-site mutation | new scenario exit |
|---|---|
| `issueIsClosed`: drop `OFFLINE \|\|` from its guard, `ghExec` guard intact | **0** |
| `prefetchIssueStates`: drop `if (OFFLINE) return;`, `ghExec` guard intact | **0** |

In both, `ghExec`'s own `if (OFFLINE) return ''` still returns an empty string, `issueIsClosed`'s
`if (!raw) return false` then reports "not closed", and no folder is excluded — the outcome is
identical to correct behaviour, so **no assertion against `readActiveFolders` can distinguish them**.
This is a redundancy in the production code, not a hole in the test; recorded rather than papered over.

## FULL SUITE RESULT

`node scripts/simulate-workflow-walkthrough.js` (no shard, no `--only`), run in the worktree against
the **delivered** file, exit code captured from `$?`:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":1958}
FULL_SUITE_EXIT=0
```

Run twice, both **exit 0** / 184 of 184 (an earlier run preceded a one-word fix inside a `//` comment
on `:1396`; the second run is the one above and is bound to the delivered bytes). Log:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/176fc27c-8e46-48f3-80d7-313c6ebcdc4b/scratchpad/m897/full-suite-final.log`

## ANYTHING NOT DELIVERED

- Nothing was skipped. All three gaps have an assertion and each is separately mutation-proven armed.
- The two single-site OFFLINE removals above are **not** armed against, and cannot be from this seam:
  they produce output identical to correct behaviour. Reported as a measurement, not claimed as coverage.
- No production code was written or modified. No test was deleted or relaxed.
- Not committed, per instruction — the change is left in the worktree working tree.
