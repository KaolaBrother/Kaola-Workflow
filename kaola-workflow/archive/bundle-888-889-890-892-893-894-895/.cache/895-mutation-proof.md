# #895 — canonical closed-issue exclusion: test + mutation proof

**Baseline commit:** `fa5157b3f62caab0ff8bc13d330d994c0962ceed`
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
**Write-set touched:** `scripts/simulate-workflow-walkthrough.js` only.

---

## 1. What was added

One scenario in `scripts/simulate-workflow-walkthrough.js`:

- `callReadActiveFolders(root, binDir)` — a subprocess driver (`node -e`), modelled on the
  neighbouring `callProbeIssueState`. It is a subprocess because `OFFLINE` is frozen at module load
  (`const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at the top of
  `kaola-workflow-active-folders.js`); an in-process call from the walkthrough would short-circuit
  `issueIsClosed` and read green whatever the filter did. It scrubs inherited `KAOLA_*` (an
  inherited `KAOLA_ISSUE_STATE_SNAPSHOT` would pre-seed the memo under test), sets
  `KAOLA_WORKFLOW_OFFLINE=0` and `KAOLA_GH_MOCK_SCRIPT` via `ghMockEnv(binDir)`, and is annotated
  `// spawn-class: environment`.
  It emits three things per run: `control` (the projects returned with `excludeClosedIssues: false`),
  `projects` and `issue_numbers` (the projects returned on the DEFAULT options path).
  The control call runs FIRST and makes no probe at all — with the flag off, `prefetchIssueStates`
  is skipped and `issueIsClosed` is never called — so it cannot seed the memo the measured call
  depends on.

- `testActiveFoldersExcludesClosedIssue895` — plants `open-project` (issue 10) and `closed-project`
  (issue 11) via the existing `plantActiveFolder`, then drives `readActiveFolders(root)` with
  DEFAULT options against a gh mock, twice:

  - **Sub-case A (batched path).** `gh issue list` returns
    `[{"number":10,"state":"OPEN"},{"number":11,"state":"CLOSED"}]`; every `gh issue view` exits 1.
    So the exclusion can only come from `prefetchIssueStates`' memo — a prefetch that stopped
    memoizing would fall through to a throwing probe, `issueIsClosed` would catch and return false,
    and the closed folder would survive.
  - **Sub-case B (per-issue fallback).** `gh issue list` returns `[]` (nothing to memoize); the
    per-issue `gh issue view N --json state` answers `CLOSED` for 11 and `OPEN` for 10. So the
    exclusion can only come from `issueIsClosed`' own probe.

  Each sub-case asserts three things:
  1. `control.length === 2` — non-vacuity: both folders really are visible with the filter off, so
     a single survivor below is the filter's doing and not a fixture that planted one folder.
  2. `projects` is exactly `['open-project']`.
  3. `issue_numbers[0] === 10` (the canonical field; mirrors the forge suites' `issue_iid` check).

Registered as `add('testActiveFoldersExcludesClosedIssue895', …)` in `buildRegistry()`, immediately
after `testProbeIssueStateGhThrows`, matching file order. `--list` shows it at line 24 of the
listing; `test-suite-registration.js` and `test-spawn-classification.js` both pass.

Shape mirrors — deliberately, not invented —
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:677` and
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:693`.

## 2. Green on unmutated code

```
$ node scripts/simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895
testActiveFoldersExcludesClosedIssue895: PASSED
Walkthrough --only subset passed (1 scenarios)
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":7}
EXIT=0
```

Neighbours + harness self-check, unmutated:

```
$ node scripts/simulate-workflow-walkthrough.js --only testHarnessSelfCheck --only testProbeIssueState --only testActiveFoldersExcludesClosedIssue895
testActiveFoldersExcludesClosedIssue895: PASSED
testHarnessSelfCheck: PASSED
Walkthrough --only subset passed (6 scenarios)
EXIT=0
```

## 3. Mutation method (no `git checkout --`, no `git stash`)

Other agents hold uncommitted work in this worktree, so nothing git-side was used to revert.
`scripts/kaola-workflow-active-folders.js` was copied pristine to
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/pristine-active-folders.js`
first. Every mutation is applied by writing `pristine → target` with one anchored string
substitution (`scratchpad/mutate.js`), and the anchor count is asserted `=== 1` before writing, so a
drifted anchor exits 2 instead of silently mutating nothing. Restore is `cp pristine → target`.

**md5 of the pristine copy and the file, before any mutation:**

```
MD5 (scratchpad/pristine-active-folders.js)      = 483d381830b9d9c4fdb1bb89505a8284
MD5 (scripts/kaola-workflow-active-folders.js)   = 483d381830b9d9c4fdb1bb89505a8284
```

`483d381830b9d9c4fdb1bb89505a8284` was re-verified on the working file after **every** restore
below, and `git status --porcelain` at the end lists only
`M scripts/simulate-workflow-walkthrough.js` — `kaola-workflow-active-folders.js` is not modified.

## 4. The mutations

### M1 — the exclusion itself is a no-op (arms the whole scenario)

`scripts/kaola-workflow-active-folders.js:260`

```diff
-    if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
+    if (false && opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
```

RED:

```
Error: #895 (batched): default options must keep ONLY the open issue's folder, got ["closed-project","open-project"]
    at assert (…/scripts/simulate-workflow-walkthrough.js:36:25)
    at Object.testActiveFoldersExcludesClosedIssue895 [as fn] (…/scripts/simulate-workflow-walkthrough.js:1537:5)
EXIT=1
```

restore → `MD5 … = 483d381830b9d9c4fdb1bb89505a8284`

### M2 — the batched prefetch stops memoizing (arms sub-case A specifically)

`prefetchIssueStates`, line 92:

```diff
-      rememberIssueState(it.number, String(it.state || '').toLowerCase() === 'closed' ? 'closed' : 'open');
+      /* M2: prefetch memoization removed */
```

The per-issue fallback is untouched by this mutation; sub-case A's mock makes `gh issue view` exit 1,
so only the batched arm can catch it — and it does:

```
Error: #895 (batched): default options must keep ONLY the open issue's folder, got ["closed-project","open-project"]
    at Object.testActiveFoldersExcludesClosedIssue895 [as fn] (…/scripts/simulate-workflow-walkthrough.js:1537:5)
```

restore → `MD5 … = 483d381830b9d9c4fdb1bb89505a8284`

### M3 — `issueIsClosed`' per-issue probe returns nothing (arms sub-case B specifically)

`issueIsClosed`, lines 104-105. The identical `ghExec(['issue','view',…])` line also appears in
`probeIssueState`, so the anchor carries the `if (!raw) return false;` that only `issueIsClosed`
has (the first attempt anchored on the bare line and correctly refused: *"M3: anchor matched 2
times, expected 1"*).

```diff
-    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
-    if (!raw) return false;
+    const raw = ''; if (!raw) return false; /* M3: per-issue probe removed */
```

RED — and note the failure is the **per-issue** arm, which proves sub-case A ran and PASSED under
this mutation (the batched memo still answered), i.e. the two sub-cases are independently armed:

```
Error: #895 (per-issue): default options must keep ONLY the open issue's folder, got ["closed-project","open-project"]
    at Object.testActiveFoldersExcludesClosedIssue895 [as fn] (…/scripts/simulate-workflow-walkthrough.js:1556:5)
```

restore → `MD5 … = 483d381830b9d9c4fdb1bb89505a8284`

### M4 — the exclusion ignores the option and always filters (arms the non-vacuity control)

```diff
-    if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
+    if (state.issue_number != null && issueIsClosed(state.issue_number)) continue;
```

RED on the control assertion, at the per-issue sub-case (in the batched sub-case the control call
skips the prefetch and the mocked `gh issue view` exits 1, so nothing is filtered there):

```
Error: #895 fixture (per-issue): both folders must be visible with the filter OFF, got ["open-project"]
    at Object.testActiveFoldersExcludesClosedIssue895 [as fn] (…/scripts/simulate-workflow-walkthrough.js:1554:5)
```

restore → `MD5 … = 483d381830b9d9c4fdb1bb89505a8284`

**Every assertion in the new scenario is armed**: the two `projects` assertions by M1/M2/M3, the two
`control` non-vacuity assertions by M4, and `issue_numbers[0] === 10` rides the same survivor set.

---

## 5. The `released` question — NOT a second instance of the gap

**Finding: the `released`-status exclusion still has a surviving canonical assertion. Nothing was
added for it.**

Where it lives: `scripts/test-bundle-claim.js`, Test (11) *"the twin rule — every `target_set_X`
classifies and exits like its scalar twin X"*, the `target_set_conflicts_active_work` /
`target_occupied` row at `scripts/test-bundle-claim.js:1341-1346`:

```js
['target_set_conflicts_active_work', 'target_occupied',
  { argv: ['startup', '--target-issues', '42,47'], roadmap: [42, 47], gh: OPEN,
    folders: [{ project: 'issue-42', issue: 42, status: 'in_progress' }] },
  // The scalar twin needs a folder that readActiveFolders SKIPS (so the claim is not `owned`)
  // whose state file nonetheless survives — that is the EEXIST arm that emits target_occupied.
  { argv: ['startup', '--target-issue', '42'], roadmap: [42], gh: OPEN,
    folders: [{ project: 'issue-42', issue: 42, status: 'released' }] }, true],
```

The scalar twin's *only* mechanism for not being `owned` is `readActiveFolders` dropping a
`status: released` folder. That is asserted, and the suite also carries a DRIVEN-COVERAGE
non-vacuity assertion (`drivenPairs === PAIRS.length`) so a row that stopped being reached would
red rather than pass silently. `test-bundle-claim.js` is in the **fast gate**
(`test:kaola-workflow:claude`), not only the full tier.

Proven, not inferred — **M5**, `isInactiveStatus` at `scripts/kaola-workflow-active-folders.js:227`:

```diff
-  return ['released', 'closed', 'abandoned'].includes(String(status || '').toLowerCase());
+  return ['closed', 'abandoned'].includes(String(status || '').toLowerCase());
```

```
$ node scripts/test-bundle-claim.js
…
Test (11): the twin rule — every target_set_X classifies and exits like its scalar twin X
FAIL: fixture: the scalar lane produced "owned", expected target_occupied
stdout: {"verdict":"owned","claim":"owned","selected_project":"issue-42",…,
         "folder":{"project":"issue-42",…,"status":"released","issue_number":42,…}}
FAIL: DRIVEN COVERAGE: expected all 5 twin pairs to be exercised on BOTH lanes, got 4

test-bundle-claim: 2 test(s) FAILED, 184 passed
```

restore → `MD5 … = 483d381830b9d9c4fdb1bb89505a8284`; unmutated re-run:

```
$ node scripts/test-bundle-claim.js
test-bundle-claim: all 188 tests passed
EXIT=0
```

Two nearby things that look like coverage and are **not**, checked by reading rather than grep:

- `scripts/test-claim-hardening.js:903` — *"Two active folders — status: in_progress survives
  readActiveFolders (not released/closed/abandoned)"* is a **comment** on an `in_progress` fixture.
  Nothing there plants a `released` folder or asserts an exclusion.
- `scripts/simulate-workflow-walkthrough.js:200-201` — `release.released === true` plus
  `!fs.existsSync(kaola-workflow/issue-63)` asserts that `release` **archives** (removes) the
  folder. The directory is gone, so `readActiveFolders`' status filter is never consulted.
- `scripts/simulate-workflow-walkthrough.js:8330` (`testClaimReclaimsStatelessOrphanDir`) does drive
  the same `isInactiveStatus` filter to `target_occupied`, but with `status: closed` — it covers the
  `closed` arm, not `released`. M5 (which only removes `released`) leaves it green.

One piece of residue noticed, deliberately not touched (outside the write-set and outside scope):
the comment block at `scripts/simulate-workflow-walkthrough.js:845-849` still advertises
*"Issue #64 classifier behavior — folder-based overlap, closed-issue residue, status:released
exclusion"* as the heading for the classifier section, though #891 deleted both of those scenarios.

## 6. Checks run

| command | result |
|---|---|
| `simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895` | exit 0 |
| `simulate-workflow-walkthrough.js --only testHarnessSelfCheck --only testProbeIssueState --only testActiveFoldersExcludesClosedIssue895` | exit 0, 6 scenarios |
| `simulate-workflow-walkthrough.js --list` | new scenario listed (line 24) |
| `test-suite-registration.js` | exit 0 — 472 assertions |
| `test-spawn-classification.js` | exit 0 — 588 sites, 166 classified, 136 slack |
| `test-bundle-claim.js` (unmutated) | exit 0 — 188 tests |

The full walkthrough was **not** run at full scope: other agents are concurrently editing production
scripts in this worktree, so a full-scope red could not be attributed. That run belongs to whoever
integrates the bundle.
