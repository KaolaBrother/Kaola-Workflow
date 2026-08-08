# Issue #936 — implementation record

- **Worktree**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-936`
- **Branch**: `workflow/issue-936` · **Commit**: `40d4a5c9` (parent `ecdb2c88`) · **not pushed, no PR**
- **Verification tier**: `tests-green`
- **Test custody honoured**: no test file was written or edited. The four suites arrived RED and are
  committed unchanged from how `tdd-guide` left them.

---

## 1. What changed, per file

Nine files in the commit: five production, one CHANGELOG, three test files carried in unmodified.

| file | change |
|---|---|
| `scripts/kaola-workflow-claim.js` | `clearAdvisoryClaim` gains a 4th param `opts`, threaded into **all four** `ghExec` calls (label, advisory comment, comment LIST, comment DELETE). Exported. |
| `scripts/kaola-workflow-sink-merge.js` | `clearAdvisoryClaim` added to the claim.js require. Three release sites (below). |
| `plugins/kaola-workflow/scripts/{claim,sink-merge}.js` | byte-identical copies, produced by `node scripts/edition-sync.js --write` (2 files written). Never hand-copied. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `clearAdvisoryClaim` gains a 5th param `opts`, threaded into `forge.updateIssue` / `createIssueNote` / `listIssueNotes` / `deleteIssueNote`. Already exported. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | require + three release sites, in this port's idiom. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | same, over `forge.updateIssueLabels` / `createIssueComment` / `listIssueComments` / `deleteIssueComment`. Already exported. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | require + three release sites + `releaseClaimArtifacts` (see §3). |
| `CHANGELOG.md` | new `## [Unreleased]` → `### Fixed`. Required by the standing user-visible-change rule; not in the brief's write set. |

### The three release sites (same three in each of the four sink copies)

1. **`runSinkTransaction` closure step** — a new `else` arm on `if (!keepIssueOpen)`, which previously
   had none. Releases both artifacts on `args.issue` and on every member of `args.issueNumbers`,
   de-duplicated. In gitlab/gitea the `!keepIssueOpen` test sits on the *outer* gate rather than a
   nested `if`, so there the arm is a preceding sibling block instead of an `else` — those ports are
   divergent hand-ports and keep their own shape.
2. **`postMergeCleanup` primary** (canonical `:961`) — split into `if (keepIssueOpen) { full release }
   else { label only, unchanged }`. The full-release return value feeds `claimLabelRemoved`, which
   takes exactly the enum `clearAdvisoryClaim` returns, so **the receipt shape is untouched**.
3. **`postMergeCleanup` `#403.6` keep-open bundle arm** (canonical `:971`) — label-only call replaced
   by the full release.

**Left alone, as instructed**: `:996`, `:1006`, `:2829`, `:2840` and their port mirrors. All are close
paths, and a marker on a closed issue is inert (the classifier short-circuits on closed state before
any claim check), so adding comment-list + delete round-trips there buys nothing.

**Not touched**: any classifier, the sink receipt schema/fields, and the four adjacent defects the
brief scoped out (`args.project` reconciliation, OFFLINE finalize reporting `status: closed`,
`cmdRepairLabels` / `closeIssueIdempotent` leaving markers on closed issues).

## 2. The cwd trap

Every forge call the fix makes carries a cwd that resolves the repository — `{ cwd: mainRoot }` on
canonical, `{ execOptions: { cwd: mainRoot } }` on the ports (that is where `glabExec`/`teaExec` read
exec options; a top-level `cwd` would have been silently ignored). No `REJECTED-wrong-cwd:` line
appears in any suite's call log, and the `(#936 control)` leg proves that clause is not vacuous.

## 3. One thing the brief did not anticipate — a regression I introduced and then removed

Gitea's `clearAdvisoryClaim` gates its **label** removal on `projectInfo.full_name`, and gitea's
`readProjectInfo` can return an empty `full_name`: its fallback is `forge.discoverProject()`, which is
cwd-resolved and this process has already chdir'd to `os.tmpdir()`. The pre-#936 sink called
`forge.updateIssueLabels(...)`, which ignores its project argument, so it removed the label
regardless. Routing that site through `clearAdvisoryClaim` alone therefore **stops removing the label**
whenever the run record carries no `full_name` — strictly worse than what shipped.

`releaseClaimArtifacts` (gitea sink only) falls back to the bare label call when, and only when,
identity is unresolved — so a label call that genuinely failed is still reported `failed`, not retried.

**A/B'd rather than reasoned about.** A scratchpad fixture with `full_name:` empty, driven through the
real gitea sink:

| variant | call log |
|---|---|
| shipped fix | `[REJECTED-wrong-cwd:…repo view, comment-deleted:93791, label-removed:9370]` → **label removed** |
| same file, fallback mutated to `if (false)` | `[REJECTED-wrong-cwd:…repo view, comment-deleted:93791]` → **label NOT removed** |

The mutant was a scratch copy alongside the original (so its relative requires resolved) and was
deleted; the worktree carried no untracked file afterwards. The `REJECTED-wrong-cwd` line in both is
`readProjectInfo`'s own pre-existing `discoverProject()` fallback at a site that already called it
before this change — not something the fix introduced, and absent from every suite (they plant a real
identity).

GitLab needs no such fallback: its `clearAdvisoryClaim` label arm is ungated and its `readProjectInfo`
has no `discoverProject` fallback, so its behaviour is call-for-call what the sink did before.

## 4. Verification — commands and exit codes

Exit codes read directly from `$?` after a redirect, never after a pipe.

### Baseline (before any production edit)

| command | exit | detail |
|---|---|---|
| `node scripts/test-sink-merge.js` | **1** | 8 failed, 772 passed — all 8 are `#936 a/b/c` |
| `node scripts/simulate-workflow-walkthrough.js` | **1** | threw at `testSinkKeepOpenReleasesClaimMarker` (`:7538`), `calls=[]` |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **1** | AssertionError `#936-gitlab` label clause; every prior leg green |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **1** | AssertionError `#936-gitea` label clause; every prior leg green |

The standing caution that an unset `init.defaultBranch` reds the two port suites at baseline **did not
hold here** — both were green apart from their `#936` leg, because the suites now pin `-b main`
themselves. Every red above is attributable to the new legs alone.

`validate-script-sync.js` was not run by me at pure baseline; the edition census recorded exit 0 at
`ecdb2c88`. I did observe it exit **1** naming both `kaola-workflow-{claim,sink-merge}.js` after my
canonical-only edits, and exit 0 after `edition-sync --write` — an independent confirmation that the
byte-identity guard is armed.

### After (at `40d4a5c9`, tree untouched between the run and the commit)

| command | exit | detail |
|---|---|---|
| `node scripts/test-sink-merge.js` | **0** | 780 assertions, 0 failed |
| `node scripts/simulate-workflow-walkthrough.js` | **0** | `{"scenarios":207,"ran":207,"passed":207,"failed":0}` |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | **0** | `GitLab #936 keep-open sink releases BOTH claim artifacts: PASSED` |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | **0** | `Gitea #936 keep-open sink releases BOTH claim artifacts: PASSED` |
| `node scripts/validate-script-sync.js` | **0** | 15 common scripts, 27 byte-identical groups, 6 export-superset families |
| `node scripts/edition-sync.js --check` | **0** | 8 forge aggregator ports in parity |
| `node scripts/generate-routing-surfaces.js --check` | **0** | all 18 surfaces byte-match |
| `node scripts/test-bundle-finalize.js` | **0** | 149 tests |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` | **0** | clearAdvisoryClaim marker-deletion tests |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | **0** | clearAdvisoryClaim marker-deletion tests |
| `node scripts/test-forge-claim-rollback-scoping.js` | **0** | 120 passed |
| `node scripts/test-forge-claim-reserved-project.js` | **0** | 364 passed |
| `node scripts/test-forge-finalize-findings.js` | **0** | 133 passed |

The last six were not in the brief's list; they are every other suite in the repo that references
`clearAdvisoryClaim`, plus the three hoisted suites that drive all four editions of claim.js — the
signature change reaches them, so they were run rather than assumed.

An earlier full-walkthrough run overlapped a comment-only edit to the gitea sink. It also reported
207/207 exit 0, but it is not the record above; the run in the table was started afterwards with the
tree untouched.

## 5. Not done, and not verifiable here

- **The live end-to-end leak is still unreproduced.** Every leg runs against a mock. Confirming
  claim → sink → re-claim on a real forge needs mutating calls against a real GitHub repository; that
  is an outward-facing action and was not taken.
- **`npm test` was not run.** No four-chain receipt was produced. The diff touches all four editions,
  so `run-chains.js` would fail closed to all four chains — that is the orchestrator's call to make,
  and `test-sink-merge.js` is in no chain regardless, so it must stay a by-hand run either way.
- **Nothing was pushed** and no PR was opened. No commit prose contains `#936`; the only `#` reference
  in the message is `#403.6`, so nothing can auto-close the issue.
