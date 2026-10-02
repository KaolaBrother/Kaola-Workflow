# Issue 1113 independent keep-open acceptance delivery

**Delivery status:** independent test meaning, frozen baseline proof, fixture harness, and proposed
test-only patch are ready for Host review. **No producer candidate was read or accepted.** The
provider baseline is demonstrably unsupported; fixture controls do not imply counterfactual
candidate PASS.

## Recovered run and authority

The current provider issue readback records #1113 **OPEN**, with one existing owner claim-marker
comment. Its full body, comments, and URL are retained in `provider-issue-1113-readback.json` (live
`gh issue view` exit 0). The existing MAIN `kaola-workflow/issue-1113/workflow-state.md` records the
already-claimed `workflow/issue-1113` worktree run; its SHA-256 is
`2b448db32217d7f0eded88d31b19368a1936667c9dd615820077f5d2f6eca7b5`. The existing MAIN ledger
contains one `in-flight` mission whose assignment matches this independent test-only task; its
SHA-256 at delivery is
`49f67367b89311050cb5c6eac9843d354c8c0de3defc428931c042e21edc5526`. I created neither a new
claim nor a state file, wrote no ledger bytes, and selected no other issue. Current provider MAIN
remains at `fe7e4443a8c367cfc111c65755191ae6790e`. The only untracked top-level path is
`kaola-workflow/issue-1113/`; it already contains the active run state and Host/owner cache evidence.
My writes stayed inside `.cache/keepopen-independent-pins/`.

The provider `AGENTS.md`, accepted Astra memo, and Host adoption were read and copied byte-for-byte
into this cache. SHA-256 values match the issue body: Astra memo
`3eedcc40d7568d4a9bfa95a5890e1e5b28e687abf54ad812cc1cf0a28213747a`; Host adoption
`4aeedbcf2d0e8cbba4eefcaa3a82355cb91c1220a7ea038efd1d82417fcdad50`. They authorize this bounded
provider capability and scoped later adoption. They leave Host responsible for candidate acceptance
and lifecycle; they grant no provider release or broad installation.

## Frozen source and genuine baseline gap

All source meaning comes from a read-only Git archive of commit
`fe7e4443a8c367cfc111c65755191ae6790e810e`. The retained archive is 68,024,320 bytes,
SHA-256 `e90846c5eac169ac2ade8afd65249c70c46dfb26a06571507398ec024921f594`; its embedded tar
commit id matches the requested commit and extraction exited 0. `ARTIFACT-HASHES` contains SHA-256
entries for every file in this cache except the manifest and its sidecar, including the archive,
extracted source, raw outputs, command receipts, and report; `ARTIFACT-HASHES.sha256` covers the
manifest itself.

The missing baseline capability is observable in real current code and the actual current command
path:

- Frozen `scripts/kaola-workflow-sink-pr.js` parses its current `--project`, `--branch`, `--issue`,
  and `--issue-numbers` arguments. Its existing `closesBody()` produces `Closes #143`. Before its
  OFFLINE return, it rejects live or archived state containing
  `issue_action: comment_keep_open` with “Keep-open is merge-sink-only”.
- `run-baseline.js` invoked that frozen CLI in an isolated no-commit fixture using only those current
  arguments. It ran OFFLINE with `pr_auto_merge: true`, isolated its config lookup, and placed a
  logging `gh` stub on `PATH`. The real CLI exited 1 on the explicit durable action. The `gh` log
  stayed empty; state/config hashes and fixture Git status were unchanged; HEAD remained unborn and
  no Git index was created.
- Therefore baseline classification is **UNSUPPORTED_CURRENT_ROUTE**, based on the real refusal and
  close-mode body builder. No hypothetical keep-open option was tried. `baseline-cli.stderr.raw`,
  `baseline-cli.exit`, and `baseline-source-capabilities.json` contain the raw and structured proof.

This does not establish a future adapter’s behavior. The actual `pr_auto_merge: true` request-only
guarantee, candidate receipts, and forge effects remain untested.

## Existing coverage retained

The proposed patch adds a new standalone suite and leaves historical tests untouched. Reuse these
existing baseline cases rather than duplicating their close-mode subjects:

- `simulate-workflow-walkthrough.js`: `testSinkPrKeepOpenRefusal` (7911) checks live and archived
  legacy refusal; `testSinkPrClosesEveryMember` (7955) preserves singleton and bundle closing-body
  behavior.
- Existing close-mode cases include `testSinkPrReusesExistingPr` (8139),
  `testSinkPrAlreadyMergedSkipsRepublish` (8256), `testSinkPrClosedUnmergedRefuses` (8313),
  `testSinkPrReuseRefusesMissingCloses` (8358), `testSinkPrReuseRefusesBaseMismatch` (8399),
  `testSinkPrLinkedPosturePublishesArchive` (8442), merge-queue controls (8607 and 8673), retry
  push (8803), and probe failure (8865).
- The live watcher’s `testE2EGitHubPrFullChain` (5778) already proves a MERGED PR plus a probed OPEN
  issue records `issue_disposition: kept-open`; that is probe-derived and does not assert an explicit
  durable keep-open request. `testWatchPrMergedClosureReceipt` (7235) covers its receipt shape.
  Archived watcher tests `testWatchPrReconcilesMergedPublishedRun` (8964),
  `testWatchPrReconcilesOpenRunPending` (9015), and `testWatchPrReconcilesClosedRunUntouched`
  (9046) cover normal publication and issue-state outcomes, without the keep-open intent case.
- `test-sink-merge.js` and the walkthrough retain the merge sink’s keep-open behavior. The frozen
  merge sink’s `assertBranchHasNonWorkflowChanges()` at line 670 and existing
  `testSinkReportsWorkflowOnlyBranch` / `testSinkAllowsMixedBranch` at walkthrough lines 11650 and
  11703 preserve its artifact predicate. The exact consumer candidate was not inspected, so I do not
  infer how that predicate classifies its current six-path diff.

Those cases protect historical/default behavior and parts of watcher state observation. They do not
prove an explicit keep-open PR mode: the PR sink’s current close-reference generator and reuse
checks are for close-mode, and the watcher controls do not condition “kept open” on durable explicit
intent.

## Proposed additive test suite

`proposed-test-integration.patch` adds
`scripts/test-issue-1113-keepopen-pr.js` and an opt-in
`test:issue-1113:keepopen-pr` npm command. It does not add the suite to the default or full producer
chains. Patch SHA-256 is
`2416b368c531eb917be8b62243840814dc411561350cc0b7025bee94a7abe5a0`; the test source SHA-256 is
`213d047aba06a28d8a7ab93d40af5eaaa5246e942ff23983f5c4b2228a47a565`. The suite defines a
**test-only adapter boundary**:
`adapter.run(fixture)` returns normalized identity, custody, operation, PR, issue-observation, and
receipt evidence. Its values `explicit-singleton-keep-open` and `legacy-default` are semantic fixture
labels; they are not production flags. The adapter must bind to the producer’s actual supported API
after handoff, and derive results from real process arguments, Git/filesystem changes, `gh` spies,
and actual receipts. `adapter-boundary.md` states those requirements.

The suite has 42 scenarios:

- live and archived singleton creation and OPEN reuse, linked-worktree caller cwd resolving archive
  and records to canonical MAIN, and exact claim/member/branch/ledger/evidence identity preservation;
- unchanged default close behavior and unchanged legacy keep-open refusal;
- missing, malformed, and conflicting action/repository/digest/branch; missing or malformed member
  set; mismatched repository/digest/member/branch; unsupported GitLab, unsupported bundle, and mixed
  disposition refusal before archive, request, record, push, close, merge, or index effects;
- issue mention retained without closing syntax or forge closing association, checking PR title,
  body, and every head commit message; request-only behavior with `pr_auto_merge: true` and no
  automatic merge or queue operation;
- wrong PR base/head and CLOSED-unmerged refusal; OPEN reuse; MERGED recognition without
  republishing; unavailable issue probe reported as unknown; actual CLOSED reported as violation;
- crash/retry at archive, create, durable-record, and push boundaries with one stable PR identity,
  unchanged ledger/evidence, and unchanged MAIN HEAD/index;
- both live and archived watcher lanes for actual OPEN, CLOSED, and unavailable observations, plus an
  unrelated-project preservation check.

The cache-only `fixture-adapter.js` is a source-independent semantic positive control. Its run passed
all 42 scenarios (exit 0). `run-negative-controls.js` mutated 19 unsafe traces; every one exited 1
at the named assertion (the control runner exited 0). Mutants include closing body and qualified
commit references, merge/queue calls, identity loss, ledger/evidence mutation, wrong base/head,
duplicate PR, index/HEAD mutation, false OPEN claims after failed/closed probes, unsafe refusal
effects, automatic issue reopen, unrelated folder changes, and MERGED republish. These controls show the assertions reject
unsafe normalized results. They do not exercise provider production code.

The patch applies cleanly to the frozen snapshot (`git apply --check`, exit 0). It does not alter
existing tests, default/full chain membership, or production code. Required-chain registration and
the producer-bound adapter are deferred until Host receives the actual API handoff; no production
option was guessed.

## Remaining candidate matrix

Every row below is **pending** because no changing provider candidate was read. The 42 fixture
scenarios specify the assertions; Host acceptance still needs an adapter that runs them against an
exact frozen candidate with raw calls, file hashes, receipts, and exits.

| Candidate area | Required evidence before Host acceptance |
|---|---|
| Shipped invocation and defaults | Actual parser accepts the documented explicit mode; absent/default action still closes; legacy keep-open path still refuses; unsupported forge/bundle/mixed inputs refuse. |
| Finalize, archive, resume, MAIN | Real linked-worktree invocation resolves canonical MAIN; durable action, repository/digest/member/branch, ledger bytes, full evidence inventory, and run identity survive preflight, archive, and retry. |
| PR create and reuse | No close/fix/resolve reference or forge close association in create/reuse content, including qualified references and commit messages; exact issue remains identifiable; base/head/action checked before effects. |
| Request-only semantics | With global auto-merge true, raw `gh` spy shows no merge or queue call; created/reused request remains distinct from mainline publication. |
| Failures and retry | Wrong-base/head, closed-unmerged, and failed probes are truthful; archive/create/record/push crash retries preserve one request identity and do not mutate MAIN HEAD/index or lose evidence. |
| Reconciliation | Live and archived watchers consult durable intent plus measured issue state: OPEN = intentionally kept open, CLOSED = violation, failed probe = unknown; unrelated folders remain unchanged. Closure audit/invariants agree. |
| Installed consumer compatibility | Host verifies exact resolver-selected caller, sink, and both watcher paths against the real #143 state, then performs only the separately authorized scoped adoption. Fixture behavior alone is insufficient. |
| Host QA and lifecycle | Host runs the required producer-selected focused/full chains on the frozen candidate, accepts the candidate and compatibility evidence, and separately owns any later archive/PR/publication lifecycle. |

## Custody and limits

The raw issue response, provider instructions, accepted decisions, frozen tar and extracted source,
baseline fixture and raw refusal, semantic suite, 19 final negative-control logs, patch, command
exits, and hashes remain in this directory. Earlier 33-case and 42-case semantic-control runs are
retained under their named `iterations/` folders. One earlier 18-control run exposed the missing
watcher `issue.reopen` assertion; that run and the fixed 19-control rerun are both preserved.

I did not read the changing Grok candidate, edit shared source/tests/docs, write a mission ledger,
create another worktree or claim, install anything, run `npm test` or the walkthrough, finalize/archive,
commit/push/merge, publish/release, or mutate Forge state. The only Forge query was the current
read-only issue view. The final report is also mirrored to the requested consuming VRPCadCore #143
cache. Mainline test meaning and release/lifecycle acceptance remain with Host.
