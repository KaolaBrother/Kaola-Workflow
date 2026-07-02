evidence-binding: n1-fix 8932b5303689
<!-- RED: paste RED here -->
RED: `node scripts/test-bundle-finalize.js` against the unfixed `scripts/kaola-workflow-sink-merge.js`
(closure gate still `!OFFLINE && args.issue != null`), new test `testSinkIssueNumbersOnlyRunsClosureLoop`
driving the real `--sink --issue-numbers 9601,9602 --sink --json` transaction (no `--issue`) against a
real git repo + bare remote:
```
Test (#592): --sink --issue-numbers A,B (no --issue) must close every member, not skip closure
FAIL: #592: issue 9601 close must be ATTEMPTED (bug: closure loop skipped entirely when --issue is
  absent); calls=[]
FAIL: #592: issue 9602 close must be ATTEMPTED; calls=[]
FAIL: #592: receipt.closed_issues must record both actually-closed members, got undefined
test-bundle-finalize: 3 test(s) FAILED, 114 passed
```
`result.status === 0` and `status:sinked` both still reported (the exact live bug: closure:done
having closed zero issues) even though `calls=[]` proves `gh issue close` was never invoked and the
receipt carries no `closed_issues`. Same RED reproduced against the unfixed gitlab port
(`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`, via `git stash` of just
that file) and the unfixed gitea port, using the mirrored `#592` tests in `test-gitlab-sinks.js` /
`test-gitea-sinks.js`:
```
AssertionError [ERR_ASSERTION]: #592-gitlab: issue 9601 close must be ATTEMPTED (bug: closure loop
  skipped entirely when --issue is absent); calls=[]
```
```
AssertionError [ERR_ASSERTION]: #592-gitea: issue 9601 close must be ATTEMPTED (bug: closure loop
  skipped entirely when --issue is absent); calls=[]
```

<!-- GREEN: paste GREEN here -->
GREEN: `node scripts/test-bundle-finalize.js` after the fix (all four editions restored):
```
Test (#592): --sink --issue-numbers A,B (no --issue) must close every member, not skip closure
test-bundle-finalize: all 118 tests passed
```
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` → `GitLab #592 --issue-numbers-only
sink closure test: PASSED` / `GitLab sink tests passed`. `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
→ `Gitea #592 --issue-numbers-only sink closure test: PASSED` / `Gitea sink tests passed`.
`node scripts/simulate-workflow-walkthrough.js` → 40/40 assertions PASSED, exit 0,
"Workflow walkthrough simulation passed" (run twice, before and after the port edits — no regression).

## Fix summary (per edition)

Root cause: the closure step's gate was `!OFFLINE && args.issue != null` — a bundle sink invoked with
ONLY `--issue-numbers A,B` (no primary `--issue`) tripped the gate false, so the entire close loop
(probe-before-close + close + label-removal, for every member) never ran, yet execution still fell
through to the unconditional `stepDone('closure')` a few lines below — the receipt reported
`closure: done` having closed zero issues and the transaction reported `status: sinked` even though
both issues stayed open on the forge.

- `scripts/kaola-workflow-sink-merge.js` (canonical): widened the gate to
  `!OFFLINE && (args.issue != null || (issueNumbers.length > 0))`; split the single `closeOne(args.issue,
  …)` call to run only `if (args.issue != null)`; widened the bundle-member loop condition from
  `issueNumbers.length > 1` to `issueNumbers.length > (args.issue != null ? 1 : 0)` so it also iterates
  every member when there is no primary; added `receipt.closed_issues = closed.sort(...)` (on the
  success path, in addition to the pre-existing failure-path recording) so a resume can verify the
  actually-closed set rather than silently skip. The existing probe-before-close + closed/failed
  bucketing + fail-closed `sink_incomplete` refusal on any genuine failure is unchanged and now also
  covers the no-primary shape (AC2's resume-retries-unclosed-members requirement was already satisfied
  by that mechanism — my change only makes the loop actually run for the bundle-only invocation).
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`: byte-identical copy of the canonical
  (verified via `cmp`, COMMON_SCRIPTS parity).
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`: same gate/loop/receipt
  restructuring, ported to the glab forge nouns (`forge.closeIssue` / `forge.updateIssue` with
  `unlabels`), preserving the file's condensed single-line style.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`: same restructuring, ported
  to the tea forge nouns (`forge.closeIssue` / `forge.updateIssueLabels`).

AC3 (single-issue `--issue N` and bundle-with-primary `--issue N --issue-numbers A,B` unchanged):
verified by inspection — when `args.issue != null`, the new gate condition is still true via the first
disjunct regardless of `issueNumbers`; the bundle-member loop bound `issueNumbers.length > (args.issue
!= null ? 1 : 0)` reduces to the original `> 1` in that case; and the full pre-existing regression suite
(single-issue + primary+bundle tests in test-bundle-finalize.js, test-gitlab-sinks.js,
test-gitea-sinks.js, simulate-workflow-walkthrough.js) all still pass unmodified.

## RED-first coverage added

- `scripts/test-bundle-finalize.js`: new helper `initGitRepoWithBareRemote` (mirrors
  simulate-workflow-walkthrough.js's) + new top-level `sinkMergeScript` const + new test
  `testSinkIssueNumbersOnlyRunsClosureLoop` — drives `kaola-workflow-sink-merge.js --sink
  --issue-numbers 9601,9602 --sink --json` (no `--issue`) end to end against a real git repo + bare
  remote + gh mock, asserting both `gh issue close` calls were attempted and
  `receipt.closed_issues === [9601, 9602]`.
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`: mirrored `#592` block driving the real
  `--sink` transaction with a dedicated glab mock (`KAOLA_GLAB_MOCK_SCRIPT`), same assertions ported to
  `issue view` / `issue close` / `issue update` nouns.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: mirrored `#592` block with a dedicated tea
  mock (`KAOLA_TEA_MOCK_SCRIPT`), same assertions ported to `issues view` / `issues close` / `issues
  edit` nouns.

## Verification commands run (all green, final state)

- `node scripts/test-bundle-finalize.js` → `test-bundle-finalize: all 118 tests passed`
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` → `GitLab sink tests passed`
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` → `Gitea sink tests passed`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0,
  40/40 PASSED lines)
- `cmp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
  → silent (byte-identical)
- Contract needle grep (`--issue-numbers`, `isSinkMode`, `sink-receipt.json`, `sink_blocked`) present in
  all four edited sink-merge scripts.

## Deviations

None — no files outside the frozen write set were touched. Did not run the full four `npm run
test:kaola-workflow:*` chains per the node's scope note (that happens at all-done); the two forge sink
test files were run standalone per the node instructions, and are already transitively wired into
`npm run test:kaola-workflow:{gitlab,gitea}` via `simulate-{gitlab,gitea}-{,codex-}workflow-walkthrough.js`'s
`run('test-{gitlab,gitea}-sinks.js')` calls, so no additional wiring was needed.
