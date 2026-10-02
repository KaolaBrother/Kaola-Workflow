# Issue 1113: independent recheck of the repaired candidate, v4 (devin-KW-i1113-indqa2)

This is a factual record for the Host (zcode-KW-orchestrator-keepopen-pr). It is not a verdict.
The Host holds the verdict, the meaning of each test, and the mission ledger. Paths are relative to
this directory (`kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v4/`) unless they are
absolute. Times are UTC on 2026-10-03.

## 1. Context, custody, binding

- **Workflow context.** I invoked the installed `workflow-next` for run context only. I made no
  claim, no ledger write, no mission, no finalization, and no forge write. I made no real `gh`
  call. All forge traffic went to the local logging `gh` spy.
- **Repository access was read-only:** `rev-parse`, `status`, `diff`, `log`, `ls-tree`, `archive`.
  I made no edit, commit, push, or branch. `.kaola/outer-review-1113/` was only read and hashed.
- **Frozen candidate:** `6423042aa1679564db6ca317bb4cf448f316da5c` on `workflow/issue-1113`.
  The facts files `runs/00-binding/candidate-facts.txt` (16:41:59Z) and
  `runs/13-final-readonly-facts.txt` (16:44:04Z) record the same values:
  - worktree HEAD and branch ref are both `6423042a…`, and porcelain has 0 lines;
  - MAIN HEAD is `fe7e4443…`, and MAIN status is only `?? kaola-workflow/issue-1113/`;
  - the Host ledger SHA-256 is `6348cb88…35a0`, mtime 00:32:45 local. I wrote no ledger bytes.
- **Bound source (step 01).** `bound-source.js build <MAIN> 6423042a… runs/candidate-6423042a`
  exited 0. It uses the same 7 named files as v3, read through `git ls-tree` and `git archive`;
  nothing is walked.
  - Manifest digest `4b1f23cd…55bf`, tar `8cebb822…aa6`.
  - The final `verify` returned `ok: true`, 7 files, exit 0.
- **Blob diff 1203f765 → 6423042a in the bound set:** only `scripts/kaola-workflow-sink-pr.js`
  changed. The other six files are blob-identical (`runs/02-carryover.json` `blobDiff`). The
  candidate's other changes are outside the bound set: docs, ADR, the plugins mirror, and the
  walkthrough.
- **Node:** `/Users/ylmacstudio/.local/bin/node` v24.21.0.
- **Every row in every run records `binding.commit = 6423042a…`.** Bound-source verification was
  ok before and after every suite/controls/new-rows run. The trace audit was ok in every run with
  `outOfSet: []` (suite 275 records, controls 80, new rows 79).

## 2. Prior results preserved (not rerun beyond the affected rows)

| artifact | SHA-256 at start and end |
|---|---|
| v1 `ARTIFACT-HASHES` | `619e46bb…a12e` (the Host's recorded value) |
| v2 `ARTIFACT-HASHES` | `0c0e352f…ebb6` (the Host's recorded value) |
| v3 `ARTIFACT-HASHES` | `bf0308ff…ff10`; `shasum -c ARTIFACT-HASHES.sha256` OK |
| outer review `probe.cjs` / `reuse-probe.cjs` / `review.md` | `1c71e412…` / `e8b352d1…` / `822844a0…` |
| outer review result JSONs (partial-marker / manual-linked / auto-enabled) | `203680e5…` / `95c55ef5…` / `fe354d85…` |

I wrote nothing into the v1, v2, or v3 directories or into `.kaola/`. Pass A executed the v3
`controls/` files in place without writing to them, and the v3 manifest still verifies.

## 3. Harness: what was reused, what changed

Two harness variants ran against the same bound source.

### Pass A: v3 harness by reference

These are the unmodified v3 bytes: `$V3/controls/{run-step,suite-v3,controls-v3,adapter-v3}.js`.
Only the environment changed, to point at the 6423042a manifest (`controls/env-v4.sh`).

### Pass B: v4 copy in `controls/`

- **Byte-identical to v3:** `bound-source.js`, `predicates.js`, `run-step.js`, `trace-preload.js`,
  `fault-preload.js`, `suite-v3.js`, `controls-v3.js`. So the fail-closed `decideExit`, the
  `PUBLICATION_UNSAFE` set (which includes `git.push`), the bounded binding, the trace audit, and
  the stage/candidate mapping are unchanged.
- **`gh-spy.js`** (`runs/00-binding/gh-spy-v3-to-v4.diff`). This is the only behavioural change.
  - When `--json` requests `closingIssuesReferences` / `autoMergeRequest` and the stored synthetic
    PR has no such key, the spy answers `[]` / `null`: GitHub's values for a PR with no closing
    association and auto-merge off.
  - A stored value is returned as stored. A key named in the stored PR's `__omitFields` is left
    out, which presents an unmeasured field.
  - Each answer logs `native_defaults_applied`.
  - **Why:** the v3 spy returns stored objects without those keys, while real `gh` returns every
    requested field. Pass A (§5) shows this makes every v3 OPEN-reuse row refuse
    `native_closing_unmeasured`. That is a harness-fidelity artifact, not a discrimination.
- **`adapter-v4.js`** (`runs/00-binding/adapter-v3-to-v4.diff`). The changes are additive fixture
  knobs. When a knob is absent, every v3 default is unchanged:
  - `cliKeepOpen` (null means no `--keep-open-pr`);
  - `stateKeepOpenMarker: false`;
  - `recordPrUrl: false`, a discovery lane with no `pr_url` and no record;
  - `offline` (`KAOLA_WORKFLOW_OFFLINE=1` in the candidate child only, added to the env whitelist);
  - `existingPr.{closingIssuesReferences, autoMergeRequest, omitNative}`.
  It also adds `rawEvidence.ghStateSha256Before/After`, `ghStateAfter`, and
  `stateOfflinePlaceholder`, and exports `registerTraceFile`.
- **New files:**
  - `new-rows-v4.js`, the new discriminations, fail-closed through the same `decideExit`;
  - `helper-probe-v4.js`, a traced child that loads only the bound `sink-pr.js`;
  - `carryover-v4.js`;
  - `env-v4.sh`;
  - `probes/*-v4.cjs`.
- **Control hashes** are recorded at the start of every step in `runs/NN-*/process.json`
  (`controlsAtStart`) and in both facts files:
  - adapter-v4 `8b144589…`, gh-spy `b2f27058…`, new-rows-v4 `f1c6c4dc…`;
  - suite-v3 `0c1f08f5…` and controls-v3 `f187fe2c…`, identical to v3.

## 4. Steps run

| step | command (abbrev.; full argv in `runs/NN-*/process.json`) | exit | binding / stage |
|---|---|---|---|
| 00 | read-only facts plus harness diffs → `runs/00-binding/` | — | 6423042a, gate passed |
| 01 | `bound-source.js build <MAIN> 6423042a… runs/candidate-6423042a` | 0 | 7 named files |
| 02 | `carryover-v4.js <v3> <v4 manifest> runs/02-carryover.json` | 0 | reads v3 traces only; 33/33 carry over |
| 03 | A: `$V3/run-step … $V3/suite-v3.js`, `KW_V3_ONLY_ROWS` = 40 affected rows | **1** | 6423042a; 20 PASS / 20 RED |
| 04 | A: `$V3/run-step … $V3/controls-v3.js`, 16 sink-group rows | **1** | 6423042a; sink refusal 12/15, positive PASS |
| 05 | B: `controls/run-step … suite-v3.js`, adapter-v4, same 40 rows | **1** | 6423042a; 22 PASS / 18 RED |
| 06 | B: `controls/run-step … controls-v3.js`, adapter-v4, 16 sink rows | **1** | 6423042a; sink refusal 12/15, positive PASS |
| 07 | B: `controls/run-step … new-rows-v4.js` | **0** | 6423042a; **16/16 PASS** |
| 08 / 09 / 10 | empty-selection probes (`KW_V3_ONLY_ROWS=__no_such_row__`) for suite, controls, new rows | 1 / 1 / 1 | fail-closed: zero rows ⇒ exit 1 |
| 11 | `probes/probe-v4.cjs` (cwd MAIN) | 0 | 6423042a bound source; v3 adapter by reference |
| 12 | `probes/reuse-probe-v4.cjs` (cwd MAIN) | 0 | same |
| 13 | read-only facts again plus `bound-source.js verify` | 0 | unchanged |

All `stderr.raw` files from steps 01–12 are empty.

The "watch refusal 0/24" text printed by steps 04 and 06 is a summary-count artifact: the row
filter excluded the watch group, so those 24 rows did not run.

### Affected-row selection

Only `sink-pr.js` changed in the bound set, so the affected rows are every row with a sink-pr child:
- 40 of 47 suite rows (all rows whose stages include `request`);
- 16 sink-group controls (15 refusals plus the positive).

**Not rerun, carried over by byte identity (step 02):** 7 watcher-only suite rows and 26
watch-group controls. Those are `live-watch-{open,closed,unknown}`,
`archive-watch-{open,closed,unknown}`, `unrelated-watch-scope`, the 24 `wctl-*` refusals, and
2 positives. The evidence:
- their retained v3 candidate traces show no sink child;
- they never touched `scripts/kaola-workflow-sink-pr.js`;
- every file they touched is blob-identical in both manifests: claim, active-folders,
  closure-contract, adaptive-schema, and classifier.

Their v3 results on 1203f765 stand unchanged: 7/7 PASS, watch 24/24 PASS, positives PASS/PASS.

## 5. Results on 6423042a: affected v3 rows

### Suite (`runs/{A-suite-v3harness,B-suite-v4harness}-6423042a/suite-summary.json`)

| row(s) | v3 @1203f765 | A (v3 harness) | B (v4 harness) | observed on 6423042a |
|---|---|---|---|---|
| 20 refusal rows: legacy-keep-open-refusal, missing/malformed/conflicting-action, member-mismatch, unsupported-bundle, mixed-disposition, missing/malformed-branch, branch-mismatch, closing-commit-reference-create, wrong-base, wrong-head, closed-unmerged | PASS | PASS | PASS | Same refusal reason as v3 for every row (e.g. `mode_mismatch`, `ambiguous_identity`, `bundle_refused`, `branch_mismatch`, `closing_linkage`, `base_mismatch`, `head_mismatch`, `pr_closed_unmerged`, legacy merge-sink-only). |
| legacy-default-close | PASS | PASS | PASS | Marker-free close mode is still `Closes #143`. |
| stage-request-merged-live / -archive, stage-final-archive-not-on-origin | PASS | PASS | PASS | MERGED request stage: `already_merged` plus `pending_reconciliation`; `local_only` is not final publication. |
| retry-push | PASS | PASS | PASS | — |
| **retry-create, retry-record, retry-archive** | PASS | **RED** | PASS | **A:** the recovery attempt finds the PR without native fields and refuses `native_closing_unmeasured` (fail-closed; "retry escaped MAIN"). **B:** recovery reuses PR 206; one create; `pr_auto_merge: suppressed_request_only`. |
| **qualified-closing-commit-reference-reuse** | PASS | PASS (vacuous) | **RED** | Commit `Fixes KaolaBrother/VRPCadCore#143`, OPEN reuse. **A** refused for the wrong reason (`native_closing_unmeasured`, a fidelity artifact). **B:** sink exit 0, `sink_pr: reused`, operations `pr.view` + `archive` (project inventory/path change), no refusal. On 1203f765 this row refused `closing_linkage`. See §7. |
| live-open-reuse, archive-open-reuse | RED | RED | RED | **A:** refused `native_closing_unmeasured`, publication did not happen. **B:** reuse succeeds (`sink_pr: reused`, `suppressed_request_only`, no create or merge; the spy applied `[]`/`null` defaults). The only remaining failure is the `receipt.identity` assertion, the same as v3 group 1. |
| live-create, archive-create, open-probe-failure, merged-open-not-republished, merged-closed-violation, merged-probe-unknown | RED | RED | RED | Only `receipt.identity` assertions fail; v3 group 1 is unchanged. MERGED rows keep their stage assertions PASS. |
| missing/malformed-repository, repository-mismatch, missing/malformed-digest, digest-mismatch, unsupported-forge, missing-member, malformed-member | RED | RED | RED | Unchanged from v3 groups 2 and 3: the sink exits 0 and publishes. Claim repository and digest are not validated, and the member fixtures are valid singleton shapes. |

### Controls (`runs/{A,B}-controls-*-6423042a/controls-summary.json`)

A and B gave identical results, and the same as v3:
- 12/15 refusals PASS, with the same reasons as v3 (`ambiguous_identity` ×5, `malformed_issue` ×7);
- the positive control PASS;
- RED: `duplicate-repository-field`, `duplicate-digest-field`, and
  `duplicate-claim-identity-section`. These are the unvalidated claim-identity class: exit 0 with
  `pr.create`, `git.push`, `request.record`, and `archive`.

All controls take the create lane, so the native-field fidelity change does not affect them.

## 6. Results on 6423042a: new discriminations

Source: `runs/B-newrows-6423042a/new-rows-summary.json`; raw children are in `scenarios/v4-*/`.
The result is **16/16 PASS**, and step 07 exited 0.

Every refusal row asserted all of the following:
- exit ≠ 0 with no signal;
- stderr contains `explicit_keep_open_refused: <reason>`;
- outcome `refused`, with no `sink_pr:` line;
- no `PUBLICATION_UNSAFE` operation, which includes `git.push`, `pr.create`, `request.record`,
  `archive`, `pr.merge`, and `merge_queue`;
- `gh` calls limited to `pr view` / `pr list`;
- no `Closes #143` in any `gh` argv, and no `--auto`;
- MAIN and linked-worktree project inventories unchanged, and MAIN HEAD/index and branch head
  unchanged;
- claim identity, ledger, and evidence unchanged;
- synthetic forge state hash unchanged, so the PR was not edited;
- no `OFFLINE_PLACEHOLDER`.

| row | input | observed |
|---|---|---|
| (a) v4-a1-empty-dup-marker-online | No `--keep-open-pr`, no `issue_action`, no default marker. State appends `keep_open_pr: ` then `keep_open_pr: explicit_singleton`. `pr_auto_merge: true`. | Exit 1 `ambiguous_identity`; **zero gh calls**, zero operations. |
| (a) v4-a2-empty-dup-marker-offline | Same bytes; the child env has `KAOLA_WORKFLOW_OFFLINE=1` (verified in `process.json`). | Exit 1 `ambiguous_identity`; zero gh calls; no placeholder in either state file. |
| (a) v4-a3-single-empty-marker-online | A single `keep_open_pr: ` line, no flag, no action. | Exit 1 `partial_marker`; zero gh calls. |
| (b) v4-b1-native-linked-view | OPEN reuse through the recorded `pr_url`; `closingIssuesReferences: [{number:143}]`. | Exit 1 `native_closing_linkage`; only `pr view`. |
| (b) v4-b3-native-linked-discovery | Same, but discovery through `pr list` (no `pr_url`). | Exit 1 `native_closing_linkage`; only `pr list`. |
| (b, control) v4-b2-native-other-issue-view | `closingIssuesReferences: [{number:999}]`. | Exit 0, `sink_pr: reused`, `suppressed_request_only`; no create, merge, or PR-mutation call; native state unchanged. |
| (c) v4-c1 / v4-c2 automerge-enabled (view / discovery) | `autoMergeRequest: {enabledAt, mergeMethod:SQUASH}`. | Exit 1 `auto_merge_enabled`; no `pr merge` (including `--disable-auto`); stored `autoMergeRequest` unchanged. |
| (d) v4-d1 closing-refs-absent | Field omitted from the `gh` answer. | Exit 1 `native_closing_unmeasured`. |
| (d) v4-d2 closing-refs-malformed | `[{url:…}]`, an element with no `number`. | Exit 1 `native_closing_unmeasured`. |
| (d) v4-d3 automerge-absent | Field omitted. | Exit 1 `auto_merge_unmeasured`. |
| (d) v4-d4 automerge-malformed | `"enabled"`, a string. | Exit 1 `auto_merge_unmeasured`. |
| (e) v4-e1-clean-open-reuse | Explicitly stored `[]` and `null`. | Exit 0, `sink_pr: reused`, `pr_request: request_only`, `mainline_publication: pending`, `pr_auto_merge: suppressed_request_only`. No create, merge, queue, or PR-mutation call. The candidate requested both fields and received them. |
| (f) v4-f2-lowercase-closes-commit-create | Commit `closes #143`, create lane. | Exit 1 `closing_linkage` before push; only `pr list`. |
| (f) v4-f3-nonassociated-commit-create | Commits `Fixes other/repo#143` and `Fix #999; related #143`. | Exit 0, `sink_pr: created`, exactly one create. Body has `Keeps #143 open` and no closing keyword before `#143`; no `--fill`; `suppressed_request_only`; no merge. |
| (f) v4-f1-scanner-helper | Traced child; `closingIssueNumbers()` from the bound `sink-pr.js`. | `Fixes #143` → [143]; `closes #143` → [143]; `Fixes other/repo#143` → []; `Fix #999; related #143` → [999]. |

**Recorded, not asserted** (helper output, also in step 11 stdout):
- `Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143` → `[]`
- `Closes https://github.com/other/repo/issues/143` → `[]`
- `Fixes KaolaBrother/VRPCadCore#143` → `[]`

I record the full-URL forms as an unverified compatibility gap, consistent with the ADR. I am not
recording them as a pass or a fail.

## 7. Observation for the Host's meaning decision: same-repository qualified reference

On 6423042a the scanner drops **every** `owner/repo#N`, including a reference to the fixture's own
claim repository (`KaolaBrother/VRPCadCore`). The ADR and code comment state "owner/repo#N is not
this repository".

As a result, the v3 row `qualified-closing-commit-reference-reuse` changed from refusing
`closing_linkage` on 1203f765 to a successful explicit reuse (Pass B, §5): sink exit 0, with an
`archive` operation (project inventory/path change).

Primary-source facts I checked (GitHub docs, "Linking a pull request to an issue", fetched today):
- The `OWNER/REPOSITORY#N` syntax is documented for an issue in a *different* repository.
- Closing keywords in a **commit message** close the issue when the commit reaches the default
  branch, "but the pull request that contains the commit will not be listed as a linked pull
  request". So for commit messages, `closingIssuesReferences` is not a backstop, and the text
  scanner is the only guard.

What I did not establish: whether GitHub closes #143 for a same-repository qualified reference.
The docs page does not state it, and I made no live-forge test. I therefore record this as an
unverified gap alongside the full-URL forms. Whether the v3 row's expected refusal remains the
intended meaning is the Host's decision.

## 8. Outer-review probes re-run (steps 11, 12)

The probes are copies under `probes/`. The originals were copied as `probes/*.orig.cjs`, with
hashes equal to `.kaola/` (§2).

The copies differ only in paths (`runs/00-binding/probe*-orig-to-v4.diff`):
- the candidate source and manifest point to `runs/candidate-6423042a/`;
- outputs go to `probes/out/` instead of `.kaola/outer-review-1113/`;
- the helper `require` loads the bound `sink-pr.js` instead of the worktree file, which has the
  same bytes at clean HEAD.

The v3 adapter is still loaded by reference. The reuse probe's in-memory needle insertion is
unchanged. The fixtures are unchanged.

| probe | process exit | sink outcome | effects |
|---|---|---|---|
| `probe-v4.cjs` (empty plus `explicit_singleton` marker, no flag or action, `pr_auto_merge: true`) | 0 | `refused`, sink exit 1 | `operations: []`: no push, create, `Closes`, queue probe, or merge. `finalPublication: false`. |
| `reuse-probe-v4.cjs` `manual-linked-reuse` | 0 | `refused`, sink exit 1 | one `pr.view` only; no archive, push, or merge. |
| `reuse-probe-v4.cjs` `auto-enabled-reuse` | 0 | `refused`, sink exit 1 | one `pr.view` only; no `suppressed_request_only` success. |

- The helper lines are the same as the repair seat's report: `Closes #143` → [143],
  `Fixes other/repo#143` → [], `Fix #999; related #143` → [999], full URL → [].
- `stages.request.recordMainline: pending` in the reuse outputs is the pre-seeded fixture record,
  not a sink write; no `request.record` operation occurred.
- The probe's helper call runs in-process and untraced, as the original does. The bound source
  still verified at step 13.
- Outputs: `probes/out/partial-marker-result.json`, `probes/out/{manual-linked,auto-enabled}-reuse.json`,
  and the raw children under `probes/out/{runs,reuse-runs}/`.

These three outcomes match the repair seat's `probe-sandbox` report. Mine were reproduced
independently against the 6423042a bound manifest; the repair seat used a 1203f765 extraction
overlaid with the repaired file.

## 9. Not run, and why

- **v1 / v2 / v3 historical processes:** I reran only the affected v3 rows (§4). The 33
  watcher-lane rows were carried over by byte identity, not re-executed.
- **v3 harness self-test (`harness-selftest.js`):** not rerun, because `predicates.js` and
  `bound-source.js` are byte-identical to the self-tested v3 files. The fail-closed rule was
  re-exercised by steps 08–10, and by steps 03–06 exiting 1 on RED.
- **`npm test`, the producer chains, and `simulate-workflow-walkthrough.js`** (including the repair's
  `testExplicitKeepOpenPrP1Repairs`): not run. This seat is repository read-only, and the
  candidate-bound chain receipt belongs to a later seat or the Host.
- **No authenticated forge compatibility:** the `gh` spy is synthetic. The native-field shapes
  (`[]` / `null` / object) follow the outer review's reading of the installed `gh` and GitHub docs;
  I did not measure them against a live forge.
- **Not decided here** (the Host's meaning): §7, the same-repository qualified reference; the
  unchanged `receipt.identity` and claim-repository/digest RED classes, which the outer review says
  should remain explicit limitations; and whether the Pass B native-default fidelity change carries
  the intended meaning for the v3 reuse rows.
- No production repair, no integration patch, no verdict.

## 10. Artifacts

- `controls/`: the v4 harness. Byte-identical copies are listed in §3.
- `probes/`: originals (`*.orig.cjs`), path-adapted copies (`*-v4.cjs`), and `out/`.
- `runs/00-binding/`: facts plus the four harness diffs. `runs/13-final-readonly-facts.txt`.
- `runs/candidate-6423042a/`: tar, manifest, initial verify, and the read-only extraction.
- `runs/NN-*-step/`: per step, `stdout.raw`, `stderr.raw`, `exit`, and `process.json`.
- `runs/02-carryover.json`.
- `runs/{A-suite-v3harness,A-controls-v3harness,B-suite-v4harness,B-controls-v4harness,B-newrows}-6423042a/`:
  summaries plus per-scenario fixtures, child argv/pid/cwd/exit/stdout/stderr, gh JSONL,
  `GIT_TRACE`, candidate traces, `normalized-result.json`, and `execution-custody.json` (each with
  `binding.commit` and `stages`).
- `runs/failclosed-empty-*`: the empty-selection probe outputs.
- `ARTIFACT-HASHES` / `ARTIFACT-HASHES.sha256`: SHA-256 of every regular file here except the
  manifest and its sidecar, generated after this report.
