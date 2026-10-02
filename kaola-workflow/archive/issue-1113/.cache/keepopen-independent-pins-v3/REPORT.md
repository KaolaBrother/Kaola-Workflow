# Issue 1113 — independent acceptance-test correction v3 (devin-KW-i1113-indqa)

This is a factual record for the Host (zcode-KW-orchestrator-keepopen-pr). It is not a QA verdict.
The Host holds the verdict, the final test meaning, and the mission ledger. Every path below is
relative to this directory (`kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v3/`)
unless it is absolute. All times are UTC (2026-10-02).

## 1. Run context and custody

- Workflow context: I resumed the existing `issue-1113` run read-only. `workflow-state.md` records
  branch `workflow/issue-1113`, worktree `.kw/worktrees/issue-1113`, and sink `merge`. Ledger
  `kaola-workflow/.ledger/issue-1113.jsonl` has n=1 `in-flight`, and its details name this seat
  and this report path. I created no claim, worktree, ledger entry, or mission, and finalized
  nothing.
- Frozen candidate: `1203f76510f5dff3418b18ae6b5db116e0c1899a`. Readings were taken at the start
  (`runs/00-binding/candidate-facts.txt`, 15:29:32Z) and at the end
  (`runs/09-final-readonly-facts.txt`, 15:32:52Z):
  - worktree HEAD = branch ref = `1203f765…`;
  - `git status --porcelain` has 0 lines;
  - MAIN HEAD is `fe7e4443…`;
  - the MAIN status shows only `?? kaola-workflow/issue-1113/`.
  The Host ledger SHA-256 at the end was `91861bd7…6117`, with mtime 15:17:15Z. That mtime is
  earlier than my first run, and I wrote no ledger bytes.
- Read-only repository access: I used only `git rev-parse`, `ls-tree`, `show`, `diff`, `log`,
  `status`, and `archive` against the shared object store. I made no edit, commit, push, branch,
  or worktree change. I made no change to shared tests or mirrors.
- Isolation: candidate processes ran only in local fixture repositories under `runs/`. They used
  local bare remotes and a local logging `gh` spy (`controls/gh-spy.js`, byte-identical to the v2
  spy). They made zero real Forge calls and no network authentication.
  - The only real Forge call in this assignment was the read-only `gh issue view 1113`. Its
    output is retained at `inputs/issue-1113-readback.json`: state OPEN, owner-corrected body.
  - During exploration I wrote three scratch files (`/tmp/kw1113-*`). I moved the issue readback
    into `inputs/` and deleted the others. No other file outside this directory was written.
- Inputs read, with their hashes, are listed in `runs/v3-inputs-sha256.txt`:
  - the Host review `inputs/host-independent-real-process-review.md` (`c8445788…`);
  - the v1 and v2 REPORTs;
  - the v2 RESULT and CONTROL matrices and the v2 execution log;
  - the rejected draft `proposals/build-integration-proposal.js` (`17dd4d19…`) and
    `proposals/integration-bundle/` (adapter `2e4399df…`, suite `d155560a…`, controls `4c805e98…`).
  I left the rejected draft unmodified in `proposals/`.

## 2. Prior immutable results: preserved, and what they are bound to

- Old artifacts are untouched. Their manifests recompute unchanged:
  - v1 `ARTIFACT-HASHES` is `619e46bb…a12e`;
  - v2 `ARTIFACT-HASHES` is `0c0e352f…ebb6` (the Host's recorded value);
  - v2 `REPORT.md` is `22bc94e7…18ed4`.
  I did not rerun any v1/v2 process and did not change any of their raw outputs, assertions, or
  failure meanings.
- **Binding fact (measured):** the v2 real-process results (44 rows, 26 PASS / 18 RED; 15 controls,
  0/15) executed a reconstruction of fe7e4443 + patch `0e582b2f`. Its bytes differ from the frozen
  candidate:

  | file | v2-executed sha256 | a0f02ea5 | 193abb2e | 1203f765 |
  |---|---|---|---|---|
  | `scripts/kaola-workflow-sink-pr.js` | `0a8be331…` | `20ba9a35…` | `20ba9a35…` | `20ba9a35…` |
  | `scripts/kaola-workflow-claim.js` | `3e5bab0b…` | `3e5bab0b…` | `4b02b82f…` | `4b02b82f…` |

  - The v2 sink-pr is **not** the a0f02ea5 sink-pr. a0f02ea5 already adds explicit-mode
    duplicate-field and canonical-token parsing (`diff` of the two files, first hunk at line 20).
  - 193abb2e changes `claim.js` watch-pr, adding `explicitSingletonWatchDecision`, a refusal
    before the live archive and before the archived MAIN/claim/worktree cleanup.
  - 1203f765 is docs-only over 193abb2e.

  So no v1/v2 actual-process result executed the candidate's sink-pr or watch-pr bytes. Under the
  issue's "mutation invalidates affected PASS evidence", every sink-lane and watcher-lane risk path
  was undiscriminated for 1203f765. v1 was source-independent modelling plus a baseline refusal on
  fe7e4443, so it discriminates nothing for 1203f765.

  On that basis I ran the corrected 44-meaning suite and 15 sink controls once against 1203f765.
  These are new candidate-bound processes, not a replay of the old ones. I also added only the
  checks that were missing:
  - 3 stage-separation rows;
  - 24 watcher-lane refusal controls with 2 watcher positives.

  I did not rerun the v1 semantic/negative models or the v2 reconstruction.

## 3. Returned defects and how v3 addresses each

| defect | v3 change | evidence |
|---|---|---|
| (a) The runner returned 0 despite RED | `controls/predicates.js` `decideExit(rows, infraErrors)` returns 0 only if ≥1 row ran, every row is PASS, there are no infrastructure errors, the bound source verifies before and after, and the trace audit is clean. `suite-v3.js` and `controls-v3.js` both set `process.exitCode` from it. `run-step.js` passes the child exit through. | Real runs: suite exit **1** (17 RED), controls exit **1** (3 RED); see `runs/05…/exit` and `runs/06…/exit`. Empty-selection probes exit **1** (`runs/07…`, `runs/08…`). A subset with all rows PASS exited 0 (`runs/04…`). Self-test: 6 exit-rule checks PASS (`runs/02-harness-selftest/`). |
| (b) The refusal predicate omitted `git.push` | One shared `PUBLICATION_UNSAFE` list, which includes `git.push`, is used by the suite's `assertNoUnsafeEffects` and by the sink controls. `WATCH_UNSAFE` adds `claim.cleanup` (gh `issue edit` / `issue comment` / `api … DELETE`) and `worktree.remove`, plus an emitted closure receipt in the watch controls. | The self-test reproduces the defect: the v2 regex misses a git.push-only trace, and the v3 sets flag it. In the real runs, the refusal rows that PASS (e.g. `wrong-base-existing-pr`, `closed-unmerged-existing-pr`) were checked with git.push included. |
| (c) Recursive whole-checkout census | `controls/bound-source.js`: a named 7-file set. Expected identities come from `git ls-tree 1203f765 -- <paths>`, and bytes from `git archive 1203f765 -- <paths>`. The tar member list must equal the named list. Files are extracted read-only to `runs/candidate-1203f765/source/`. Verification re-hashes only the named files; there is no directory walk. `adapter-v3.js` requires an explicit `KW_CANDIDATE_SOURCE` and manifest, and verifies before and after every row. `controls/trace-preload.js` (via `NODE_OPTIONS`) logs every module load, fs access, and child spawn under the candidate root in every candidate child. The audit fails closed on any out-of-set path. | Manifest `runs/candidate-1203f765/bound-source-manifest.json` (digest `52ab5fb2…c191`, tar `87860446…9743`, tree `f420f817…`). Trace audit: suite 352 records, controls 366 records, `outOfSet: []`; the 6 production files plus nothing else were touched. Self-test: tamper, missing-file, extra-file, and non-canonical-path checks PASS. |
| (d) Request stage vs final publication | The adapter reports three separate stages per row: `request` (sink stdout/record tokens), `liveWatch` (live-lane local archive cleanup), and `archiveReconcile` (`publication` / `archive`). `finalPublication` is true only when `archiveReconcile.archive === 'published'` **and** the adapter's own `git cat-file` shows the archived state on the bare origin's `main`. Every row records `commit` and `stagesTested`. | See §4 and `RESULT-MATRIX.tsv` columns `stages_tested`, `request_sink_mainline`, `archive_reconcile_archive`, `final_publication`. |

The suite and stage-mapping changes are listed here so the Host can review the test meaning.
Every v2 assertion body is kept verbatim except the one marked change below:
- **MERGED rows (3):** v2 asserted "verified archive-on-default-branch must report publication"
  but ran in the live lane, where only the gh PR state was flipped and no archive reached origin.
  v3 runs these rows in the archived lane, with the archive committed and pushed to origin `main`
  (measured: `originDefaultHasArchive.before = true`). I added stage assertions; I removed no
  assertion.
- **`assertKeepOpenPublication`, issue-observation branch (marked change):** in v2 this branch
  could be reached from request-stage-only rows (create/reuse run no watcher). There it demanded
  `UNKNOWN` from an issue that was never probed, and v2's first-failure assertions hid this behind
  the identity failure. v3 applies it only when a watcher stage ran. Request-stage-only rows must
  instead claim no observation (`NOT_PROBED`, disposition `null`).
- **Soft per-row evaluation:** v3 records every failing assertion of a row, not just the first.
  Any failure still makes the row RED.

The Host decides whether these corrections carry the intended meaning.

## 4. What ran

Node v24.21.0 (`/Users/ylmacstudio/.local/share/node-v24.21.0-darwin-arm64/bin/node`) was run from
the cwd of this directory. Each step's `process.json` holds argv, environment whitelist, pid,
start/finish, exit, stdout/stderr hashes, and the SHA-256 of every `controls/` file at start.

The controls executed by steps 05 and 06 are identical:
- adapter `62704308…`, suite `0c1f08f5…`, controls `f187fe2c…`, predicates `494512e1…`;
- bound-source `eaf6f2fe…`, trace-preload `d3d0a269…`, gh-spy `dcbdb0cb…`, fault-preload `4d6e392a…`.

`write-matrices.js` was added only after step 06.

| step | command (abbrev.) | exit | binding / stage | observed |
|---|---|---|---|---|
| 01 | `bound-source.js build <MAIN> 1203f765… runs/candidate-1203f765` | 0 | commit 1203f765, 7 named files | manifest written; initial verify ok |
| 02 | `harness-selftest.js <manifest> runs/02-harness-selftest-scratch` | 0 | no candidate process | 22/22 harness self-checks PASS |
| 03 | `suite-v3.js`, `KW_V3_ONLY_ROWS`=5 rows (smoke, before the §3 issue-observation fix) | 1 | 1203f765 | iteration record; surfaced the latent issue-observation branch; superseded by 05 |
| 04 | `controls-v3.js`, 8-row smoke | 0 | 1203f765 | all 8 PASS; superseded by 06 |
| **05** | `. controls/env-v3.sh suite-1203f765-attempt-01; run-step.js … node controls/suite-v3.js` (pid 29943, 15:30:54.624–15:31:37.391) | **1** | 1203f765, all rows | **30/47 PASS, 17 RED**; bound ok before/after; trace audit ok |
| **06** | `. controls/env-v3.sh controls-1203f765-attempt-01; run-step.js … node controls/controls-v3.js` (pid 74026, 15:31:55.076–15:32:26.950) | **1** | 1203f765, all rows | sink refusal **12/15**, sink positive PASS; watch refusal **24/24**, watch positives PASS/PASS; bound ok; trace audit ok |
| 07 / 08 | suite / controls with `KW_V3_ONLY_ROWS=__no_such_row__` | 1 / 1 | — | fail-closed probes: zero rows ⇒ exit 1 |
| 10 | `write-matrices.js` (reads summaries only) | 0 | — | `RESULT-MATRIX.tsv` (47), `CONTROL-MATRIX.tsv` (42) |

## 5. Observed results on 1203f765

Suite (`runs/suite-1203f765-attempt-01/suite-summary.json`, `RESULT-MATRIX.tsv`):
- **v2-meaning rows (44): 27 PASS / 17 RED.**
- **v3 stage rows (3): 3 PASS.**

Changes from the v2-source results:
- `conflicting-action` is now PASS.
- No row went PASS→RED.
- `wrong-base`, `wrong-head`, and `closed-unmerged` PASS with git.push now in the predicate.

The RED rows fall into three groups, using every recorded failure per row:

1. **Durable request-receipt identity missing (8 rows).** Rows: `live-create`, `archive-create`,
   `live-open-reuse`, `archive-open-reuse`, `open-probe-failure`, `merged-open-not-republished`,
   `merged-closed-violation`, `merged-probe-unknown`.
   - Each row's *only* failures are the `receipt.identity` assertions ("durable request / merged /
     watcher receipt lost claim/evidence identity").
   - The candidate record carries `keep_open_pr`, `pr_request`, and `mainline_publication`, but no
     identity object.
   - Every other assertion of these rows passed, including: canonical-MAIN resolution against the
     linked-worktree decoy; request-only with `pr_auto_merge: true` (`pr_auto_merge:
     suppressed_request_only`, no merge or queue call); no closing reference; stable PR 206;
     created/reused distinction; mainline `pending` at the request stage; the MERGED rows' v3 stage
     assertions (`already_merged` + `pending_reconciliation` at the request stage; `archive:
     published` and `finalPublication = true` at the archive-reconcile stage); kept_open /
     violation / unknown dispositions.
   - The Host previously classified durable identity as an independent assertion that the
     candidate does not implement.
2. **Claim repository / digest / forge not validated (7 rows).** Rows: `missing-repository`,
   `malformed-repository`, `repository-mismatch`, `missing-digest`, `malformed-digest`,
   `digest-mismatch`, `unsupported-forge`.
   - In each, the sink exited 0 and performed `pr.create`, `git.push`, `request.record`, and an
     archive-path change.
   - Candidate sink-pr reads no `claim_repository_id` or `claim_identity_digest`. Its identity
     fields are `issue_action`, `keep_open_pr`, `sink`, `issue_number`, `branch`, `issue_numbers`,
     and `base_branch`.
   - `unsupported-forge` changes only the state's `claim_repository_id` to a gitlab URL; the fixture
     remote and `gh` remain GitHub-shaped.
3. **Member rows whose inputs are valid singleton shapes (2 rows).**
   - `missing-member` writes no `issue_numbers` line. That is the ordinary singleton shape; the
     candidate accepts it and publishes.
   - `malformed-member` uses `members: ['143']`. That renders to the same state bytes and CLI
     argument as the valid fixture: the path-normalized state is identical to `live-create`'s. Its
     extra failure ("identity changed") comes from comparing the string `'143'` with the parsed
     number `143`.
   - These are properties of the v2 fixture design that I recorded as found. The Host decides the
     intended meaning.

Stage evidence (rows that passed; values from `stages`):

| row | request stage | watcher stage | origin has archive | finalPublication |
|---|---|---|---|---|
| `stage-request-merged-live` | `already_merged`, `pending_reconciliation`, exit 0 | none (only `request` ran) | false | false |
| `stage-request-merged-archive` | `already_merged`, `pending_reconciliation`, exit 0 | none | true | false (request evidence is never publication) |
| `stage-final-archive-not-on-origin` | `already_merged`, `pending_reconciliation` | archiveReconcile: `publication: published`, `archive: local_only` | false before/after | **false** |
| `merged-*` (archive lane) | `already_merged`, `pending_reconciliation` | archiveReconcile: `publication: published`, `archive: published` | true | true |
| `archive-watch-*` | — | archiveReconcile: `archive: published` | true | true |
| `live-watch-*`, `open-probe-failure` | — / created + `pending` | liveWatch: receipt `archive: closed` (local only) | false | false |

Observation, not asserted: in `stage-final-archive-not-on-origin` the archived reconcile also
performed claim cleanup (`gh issue edit` / `issue comment` / `api`) and linked-worktree removal
even though the archive was `local_only`.

Controls (`runs/controls-1203f765-attempt-01/controls-summary.json`, `CONTROL-MATRIX.tsv`):
- **Sink group:** 12 of 15 v2 controls now PASS. They exit 1 with
  `explicit_keep_open_refused: ambiguous_identity` or `malformed_issue`, with zero unsafe effects
  and unchanged project inventory, MAIN HEAD/index, identity, ledger, and evidence.
- **RED (3):** `duplicate-repository-field`, `duplicate-digest-field`,
  `duplicate-claim-identity-section`. Each exited 0 with `pr.create`, `git.push`,
  `request.record`, and archive effects; this is the same unvalidated-claim-identity class as group
  2 above.
- **Sink positive:** PASS (one `pr.create`, request-only, `pr_auto_merge: suppressed_request_only`).
- **Watch group (new):** 12 malformed variants × 2 lanes: live MERGED cleanup lane, and archived
  MERGED reconcile lane with the archive on origin.
  - **24/24 PASS**: watch-pr exit 1, with
    `archive_refusals[{folder: issue-143, reason: explicit_keep_open_refused}]` (details
    `ambiguous_identity` ×12, `mode_mismatch` ×2, `malformed_issue` ×4, `bundle_refused` ×2,
    `issue_mismatch` ×2, `branch_mismatch` ×2).
  - The only gh call was `pr view`. There was no archive, claim cleanup, worktree removal, closure
    receipt, push, or MAIN/index change.
  - Non-vacuity: the two valid watcher positives (PASS) recorded exactly those effects (`archive`,
    `claim.cleanup`, and `worktree.remove` in the live lane; `claim.cleanup` and `worktree.remove`
    in the archive lane), so the detectors fire when the effects occur.

## 6. Not run, and why

- No v1/v2 process was rerun, and the v2 candidate reconstruction was not repeated. Those results
  stay bound to their own source (§2).
- No producer chain, `npm test`, or walkthrough was run. These are owned by the parallel chains
  seat and the Host, and this seat has no write access to the worktree.
- No authenticated Forge compatibility: the gh spy is synthetic and closing linkage is
  content-derived.
- Nothing was installed or integrated: no shared-test integration patch was produced or applied,
  and `proposals/` holds the rejected draft unchanged. The Host holds integration.
- No repair of production source. No verdict on the candidate.
- I did not decide the meaning questions §3 raises (lane correction for the MERGED rows; the
  issue-observation branch) or §5 raises (groups 1–3). They are recorded for the Host.

## 7. Artifacts

- `controls/` — v3 adapter, suite, controls, predicates, bound-source, trace preload, gh spy, fault
  preload, harness self-test, `run-step.js`, `env-v3.sh`, `write-matrices.js`.
- `runs/candidate-1203f765/` — bound-source tar, manifest, initial verify, read-only extraction.
- `runs/NN-*-step/` — per-step raw stdout/stderr/exit/process.json.
- `runs/suite-1203f765-attempt-01/` and `runs/controls-1203f765-attempt-01/` — summaries,
  per-scenario fixtures, child argv/pid/cwd/exit/stdout/stderr, gh JSONL, GIT_TRACE, candidate
  trace JSONL, `normalized-result.json`, `execution-custody.json` (each with `binding.commit` and
  `stages`).
- Smoke iterations `runs/smoke-*-attempt-01/` and probes `runs/failclosed-probe-*/` are retained.
- `RESULT-MATRIX.tsv`, `CONTROL-MATRIX.tsv`; `inputs/issue-1113-readback.json`;
  `runs/v3-inputs-sha256.txt`.
- `ARTIFACT-HASHES` / `ARTIFACT-HASHES.sha256` — SHA-256 of every regular file in this directory,
  excluding the manifest and its sidecar. It is generated after this report is written.
