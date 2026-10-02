# Issue 1113: independent recheck v5 of the final candidate (devin-KW-i1113-indqa3)

This is a factual record for the Host (zcode-KW-orchestrator-keepopen-pr). It is not a verdict.
The Host holds the verdict, the meaning of each test, and the mission ledger. Paths are relative to
this directory (`kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v5/`) unless they are
absolute. Times are UTC on 2026-10-02 (local 2026-10-03, UTC+8).

## 1. Context, custody, binding

- **Workflow context.** I loaded the installed `workflow-next` for run context only and read the
  ledger line n=1, which is `in-flight` and names this v5 dispatch. I made no claim, no ledger
  write, no mission, no finalization, and no forge write. All forge traffic went to the local
  logging `gh` spy; real `gh` was never called.
- **Repository access was read-only:** `rev-parse`, `status`, `diff`, `log`, `show`, `ls-tree`, and
  `archive`. I made no edit, commit, push, or branch.
- **Frozen candidate:** `45e6deb17f57adc98e04e4cc56cd426d8b54a3f9` on `workflow/issue-1113`. Its
  only parent is `6423042a…`. The facts files `runs/00-binding/candidate-facts.txt` (17:11:50Z) and
  `runs/08-final-readonly-facts.txt` (17:13:06Z) match on every line except the date:
  - worktree HEAD = branch ref = `45e6deb1…`, current branch `workflow/issue-1113`, porcelain 0 lines;
  - MAIN HEAD `fe7e4443…`, MAIN status only `?? kaola-workflow/issue-1113/`;
  - Host ledger SHA-256 `e6d83b0b…f2ff`, mtime 01:06:46 local. I wrote no ledger bytes.
- **Prior results are untouched.**
  - The v1, v2, and v3 `ARTIFACT-HASHES` files hash to `619e46bb…`, `0c0e352f…`, and `bf0308ff…`.
  - v4 `REPORT.md` is `bd1d5f8d…`. v4 `ARTIFACT-HASHES.sha256` is OK, and so is the full
    `shasum -c ARTIFACT-HASHES`: all 23,678 listed files match.
  - No v4 file is newer than v4's sidecar. The v4 tree has 23,680 regular files: the listed files
    plus the manifest and its sidecar.
  - Step 07 read v4's `runs/candidate-6423042a/` (mode 0444) and wrote nothing into it.
- **Node:** `/Users/ylmacstudio/.local/bin/node` v24.21.0. All `stderr.raw` files from steps 01–08
  are empty.

## 2. Harness (v4 harness reused, fail-closed rules unchanged)

- **Byte-identical to v4** (`runs/00-binding/harness-identity.txt`, recorded with `cmp`):
  `adapter-v4.js`, `bound-source.js`, `controls-v3.js`, `fault-preload.js`, `gh-spy.js` (Pass B
  native defaults), `predicates.js` (`decideExit`, and `PUBLICATION_UNSAFE`, which includes
  `git.push`), `run-step.js`, `suite-v3.js`, and `trace-preload.js`.
- **New in v5.** Diffs against the v4 counterparts are in `runs/00-binding/*-v4-to-v5.diff`.
  - `env-v5.sh` points at `runs/candidate-45e6deb1` and sets the adapter to `adapter-v4.js`.
  - `new-rows-v5.js` is derived from `new-rows-v4.js` and keeps the same `commonNoEffect`, reuse,
    and create predicates and the same fail-closed exit. It adds the rows in §4 and these checks:
    - `refusalNamesCommitScan`: stderr carries the `assertNoClosingCommits` sentence, so the refusal
      came from the commit scan and not from the PR-text scan;
    - `noPushInGitTrace`;
    - `commitInHistory`;
    - per-row identity evidence, measured from the fixture bytes and the sink child's `GIT_TRACE`:
      the exact `claim_repository_id` lines in the MAIN state file; whether
      `git remote get-url origin` ran; and, where stated, that origin is an absolute local path.
  - `helper-probe-v5.js` is a traced child. It loads only the bound `sink-pr.js` and calls
    `closingIssueNumbers(text, identity)`. A `null` identity means the argument is omitted.
  - `blobdiff-v5.js` is the read-only scope check. `facts-v5.sh` collects the read-only facts.
- **Control hashes** are in `runs/00-binding/candidate-facts.txt` and in every
  `runs/NN-*/process.json` under `controlsAtStart`. Examples: new-rows-v5 `94ea5b76…`,
  helper-probe-v5 `66139072…`, and adapter-v4 `8b144589…` (the same as v4).

## 3. Bound source and blob-diff scope (steps 01, 02, 08)

- **Step 01.** `bound-source.js build <MAIN> 45e6deb1… runs/candidate-45e6deb1` exited 0. The same
  7 named files are read through `git ls-tree` and `git archive`. Manifest digest
  `3cc700393240ede74edef9f919dc021a0e0be4266fa8339110bb343eadf23cf5`, tar `99b59e6b…cd1c`.
- **Step 08.** `bound-source.js verify` returned `ok: true`, 7 files, exit 0.
- **Step 02.** `blobdiff-v5.js` compared the v4 manifest (6423042a) with the v5 manifest (45e6deb1)
  and exited 0, `ok: true` (`runs/02-blobdiff.json`; full sink diff in `runs/02-blobdiff-sink.diff`):
  - **Bound set.** Only `scripts/kaola-workflow-sink-pr.js` changed (`48f72eeb` → `5f1251ac`).
    These six files are blob-identical:
    - `kaola-workflow-claim.js` `3e5708f6`
    - `kaola-workflow-active-folders.js` `bb7b6d23`
    - `kaola-workflow-adaptive-schema.js` `df54ad4a`
    - `kaola-workflow-classifier.js` `df5599bf`
    - `kaola-workflow-closure-contract.js` `c407c9be`
    - `test-git-fixture.js` `26b21f8f`
  - **Whole range (one commit).** The commit modified `CHANGELOG.md`, `docs/api.md`,
    `docs/decisions/0031-…md`, `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`,
    `scripts/kaola-workflow-sink-pr.js`, and `scripts/simulate-workflow-walkthrough.js`.
  - **Mirror.** The plugins mirror is blob `5f1251ac`, the same as the canonical file
    (`mirrorEqualsCanonical: true`).
  - **Sink hunk headers** (`git diff -U0`), all in the scanner/identity region or its call sites:
    ```
    @@ -28 +28,3 @@                                   (header comment: qualified-reference rule)
    @@ -156,5 +158,38 @@ function closesBody(members) { (scanner comment + CLOSING_ASSOC_RE capture groups)
    @@ -162 +197,4 @@ const CLOSING_ASSOC_RE = …      (asOwnerRepo, sameRepository, closingIssueNumbers signature)
    @@ -168 +206,2 @@ function closingIssueNumbers(text) { (match[4] bare / match[1..3] qualified + sameRepository)
    @@ -174,0 +214,33 @@ function closingIssueNumbers(text) { (claimRepositoryFromTexts, originOwnerRepo, resolveClaimRepositoryIdentity)
    @@ -212 +284 @@ function strictIssueList(raw) {   (keepOpenLinkageBody signature)
    @@ -217 +289 @@ function keepOpenLinkageBody(issue) { (self-check passes identity)
    @@ -341 +413 @@ function commitMessagesNotOnBase(…) { (assertNoClosingCommits signature)
    @@ -344 +416 @@ function assertNoClosingCommits(…) { (scan passes identity)
    @@ -376 +448 @@ function assertExplicitOpenNativeSafe(…) { (assertExplicitReuseSafe signature)
    @@ -378 +450 @@ function assertExplicitReuseSafe(…) { (scan passes identity)
    @@ -682,0 +755,6 @@ function main() {             (one repositoryIdentity, explicitMode only, after the OFFLINE return)
    @@ -745 +823 @@ function main() {                 (MERGED explicit note scan)
    @@ -769,2 +847,2 @@ function main() {               (OPEN explicit reuse: text + commit scans)
    @@ -795,2 +873,2 @@ function main() {               (create lane: commit scan + generated body)
    @@ -798 +876 @@ function main() {                 (generated title scan)
    ```
- **Where the new code runs.** I read every changed call site at 45e6deb1. All of them sit inside
  `if (explicitMode)` branches. Close mode computes `repositoryIdentity = ''` and never calls the
  scanner.
  - Identity is computed at line 757. That is after the partial-marker, legacy, and malformed gates
    (lines 715–718), after the explicit-OFFLINE refusal (line 720), and after the OFFLINE return.
  - On OPEN reuse, `assertExplicitOpenNativeSafe` (unchanged) still runs before the text and
    commit scans (lines 846–848).
  - `originOwnerRepo` wraps `execFileSync` in `try`/`catch`. `asOwnerRepo`,
    `claimRepositoryFromTexts`, and `sameRepository` are pure. None of the new functions can throw
    into a lane that did not scan before.
  - A bare `#N` is captured as `match[4]` and added exactly as `match[1]` was before. The only new
    detections come from qualified `owner/repo#N` text.

## 4. Steps run and results (all bound 45e6deb1 unless stated)

| step | command (abbrev.; full argv/env in `runs/NN-*/process.json`) | exit | binding / stage |
|---|---|---|---|
| 00 | `facts-v5.sh`, `cmp` harness identity, harness diffs → `runs/00-binding/` | — | 45e6deb1, gate passed |
| 01 | `bound-source.js build <MAIN> 45e6deb1… runs/candidate-45e6deb1` | 0 | 7 named files |
| 02 | `blobdiff-v5.js <MAIN> <v4 manifest> <v5 manifest> runs/02-blobdiff.json` | 0 | only sink-pr.js in bound set |
| 03 | `suite-v3.js` (Pass B adapter-v4), `KW_V3_ONLY_ROWS=qualified-closing-commit-reference-reuse,closing-commit-reference-create` | **0** | 2/2 PASS; stage `request` |
| 04 | `controls-v3.js` (adapter-v4), `KW_V3_ONLY_ROWS=safe-explicit-singleton-positive,duplicate-action-field,noninteger-cli-issue-prefix` | **0** | 3/3 PASS; stage `request` |
| 05 | `new-rows-v5.js` (adapter-v4) | **0** | **10/10 PASS**; stage `request` |
| 06 | `new-rows-v5.js` with `KW_V3_ONLY_ROWS=__no_such_row__` | 1 | fail-closed: 0 rows plus an empty trace audit ⇒ exit 1 |
| 07 | `new-rows-v5.js` against the **6423042a** bound source (v4 manifest, read-only) | 1 | discrimination control: 4/10 PASS, 6 RED (expected) |
| 08 | `facts-v5.sh` again, then `bound-source.js verify` | 0 | unchanged; verify ok |

The text "sink refusal 2/15" printed by step 04 is a count artifact of the row filter, the same as
in v4. Only the three selected rows ran.

For steps 03, 04, and 05, the bound source verified before and after every row, and every row
records `binding.commit = 45e6deb1…`. The trace audit was `ok` with `outOfSet: []`: 10 records in
the suite, 15 in the controls, and 49 in the new rows.

### 4.1 Row (a): same-repository qualified closing commit reference, v3 meaning restored

| row | input | observed on 45e6deb1 |
|---|---|---|
| v3 suite `qualified-closing-commit-reference-reuse` (step 03) | Commit `Fixes KaolaBrother/VRPCadCore#143`. OPEN reuse. State `claim_repository_id: https://github.com/KaolaBrother/VRPCadCore.git`. | **PASS**. Sink exit 1, `explicit_keep_open_refused: closing_linkage. Commit messages reachable from workflow/issue-143 and not from main close issue(s) 143. Nothing was pushed or created.` Operations `["pr.view"]` only, no `archive`. The sink child's GIT_TRACE has no `remote get-url`, so the state identity won. On 6423042a (v4 Pass B) this row was RED: exit 0, `sink_pr: reused`, with an `archive` operation. |
| `v5-a1-own-qualified-commit-reuse-mixedcase-https` | State `claim_repository_id: https://github.com/KAOLABROTHER/vrpcadcore.git`, mixed case with `.git`. Commit `Fixes KaolaBrother/VRPCadCore#143`. OPEN reuse with natives `[]`/`null`. | **PASS**, 21 checks. Exit 1 `closing_linkage` from the commit scan. Only `pr view`. No PUBLICATION_UNSAFE operation, no push in GIT_TRACE. MAIN and worktree project, MAIN HEAD/index, branch, claim, ledger, and evidence are unchanged. The synthetic PR state hash is unchanged. No OFFLINE placeholder. The state line is the seeded line, and origin was not consulted. |
| `v5-a2-own-qualified-commit-create-gitat` | State `claim_repository_id: git@github.com:KaolaBrother/VRPCadCore.git`. Commit `fixes kaolabrother/vrpcadcore#143`, lower case. Create lane. | **PASS**, 21 checks. Exit 1 `closing_linkage` before push. Only `pr list`. Same no-effect set. Origin was not consulted. |

The v3 suite row needed no fixture change. Its `KaolaBrother/VRPCadCore` comes from the fixture's
`claim_repository_id` (the adapter constant `REPOSITORY`).

### 4.2 Row (b): another repository's qualified reference and non-associated references

| row | input | observed |
|---|---|---|
| `v5-b1-foreign-nonassociated-commit-create` | Commits `Fixes other/repo#143` and `Fix #999; related #143`. Create lane. The claim identity is present. | **PASS**. Exit 0, `sink_pr: created`, exactly one `pr create`. The body has `Keeps #143 open`. No closing keyword precedes `#143` in the body or title. No `--fill`. `pr_auto_merge: suppressed_request_only`. No merge, close, or reopen. Both commits are in history. |
| `v5-b2-foreign-nonassociated-commit-reuse` | The same commits, on the OPEN reuse lane with natives `[]`/`null`. | **PASS**. Exit 0, `sink_pr: reused`, `suppressed_request_only`. The request record is `request_only` / `pending`. No create, merge, or PR-mutation call. Native fields were requested and served. Native state is unchanged. Operations `["pr.view","archive"]`. |

### 4.3 Row (c): repository identity cannot be established, so qualified references count

| row | input | observed |
|---|---|---|
| `v5-c1-scan-unknown-foreign-qualified-create` | No `claim_repository_id` line in the MAIN state (measured: `[]`). Origin is the absolute local bare path `…/repo/origin.git` (measured). Commit `Fixes other/repo#143`. Create lane. | **PASS**, 22 checks. The sink child ran `git remote get-url origin` (in GIT_TRACE). Exit 1 `closing_linkage` before push. Only `pr list`. Full no-effect set. |
| `v5-c2-scan-unknown-nonassociated-create` (control) | The same unknown identity. Commit `Fix #999; related #143`. | **PASS**. The origin lookup ran. Exit 0, `sink_pr: created`, the same operations as a normal create. An unknown identity does not refuse by itself; only a qualified reference counts. |
| `v5-c3-disagreeing-state-foreign-qualified-create` (additional, inside the changed bytes) | MAIN state has two lines: `https://github.com/KaolaBrother/VRPCadCore.git` and an appended `https://github.com/other/repo.git` (measured). Commit `Fixes other/repo#143`. | **PASS**. Disagreeing lines produced no state identity. The origin lookup ran, the local path did not parse, and the sink refused with exit 1 `closing_linkage` before push. Full no-effect set. |

In c1 and c3 the linked worktree carries a decoy state with
`claim_repository_id: https://github.com/decoy/not-the-claim.git`. The refusals show that the sink
did not take its identity from the decoy: with the decoy's identity, `other/repo#143` would not
count.

### 4.4 Row (d): helper controls on the bound sink bytes (`v5-d1-scanner-helper`, PASS, 20 checks)

Output: `runs/B-newrows-45e6deb1/scenarios/v5-d1-scanner-helper/`. Every asserted case is an exact
array match.

| text | identity argument | detected |
|---|---|---|
| `Fixes KaolaBrother/VRPCadCore#143` | `KaolaBrother/VRPCadCore` | [143] |
| `Fixes KaolaBrother/VRPCadCore#143` | `https://github.com/KAOLABROTHER/vrpcadcore.git` | [143] |
| `fixes kaolabrother/vrpcadcore#143` | `https://github.com/KaolaBrother/VRPCadCore.git` | [143] |
| `Fixes KaolaBrother/VRPCadCore#143` | `https://github.com/KaolaBrother/VRPCadCore/` · `git@github.com:…/VRPCadCore.git` · `ssh://git@github.com/…/VRPCadCore.git` · `git://github.com/…/VRPCadCore.git` | [143] each |
| `Fixes other/repo#143` | `KaolaBrother/VRPCadCore` · `https://github.com/KaolaBrother/VRPCadCore.git` | [] each |
| `Fixes KaolaBrother/VRPCadCore#143` | `https://github.com/other/repo.git` | [] |
| `Fixes #143` / `closes #143` | `KaolaBrother/VRPCadCore` | [143] / [143] |
| `Fix #999; related #143` | `KaolaBrother/VRPCadCore` | [999] |
| `Fixes other/repo#143` | `''` · omitted · `/tmp/fixture/repo/origin.git` (unparsed) | [143] each (empty identity, so every qualified reference counts) |
| `Fixes KaolaBrother/VRPCadCore#143` | `''` | [143] |
| `Fix #999; related other/repo#143` | `''` | [999] |

**Recorded, not asserted.** These lines are also in the step 05 stdout.

- **Full URLs: the unverified gap**, consistent with the ADR. None of these is counted:
  - `Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143`, with the own identity and with
    `''`: [] / []
  - `Fixes https://github.com/KaolaBrother/VRPCadCore#143`: []
  - `Closes https://github.com/other/repo/issues/143`: []
- **Identity shapes that do not parse, so every qualified reference counts (over-refusal):**
  - `http://github.com/KaolaBrother/VRPCadCore.git`: [143]
  - `https://www.github.com/KaolaBrother/VRPCadCore.git`: [143]
- **Relative two-segment identity shapes (for the Host's attention):**
  - `../origin.git` → [] and `repo/origin.git` → [] for `Fixes KaolaBrother/VRPCadCore#143`.
  - The bare `OWNER/REPO` alternative of `asOwnerRepo` (`/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/`)
    accepts these strings. They become a non-GitHub identity (`../origin`, `repo/origin`), so a
    same-repository qualified reference is **not** counted.
  - In the sink this can happen only when the state has no parseable `claim_repository_id` and
    origin is configured as such a relative path.
  - The scanner-fix report's statement "A local path does not parse" holds for absolute paths,
    which is what c1 and c3 exercised. I did not exercise a relative-path origin end to end. This is
    a recorded observation, not a pass or a fail.

### 4.5 Smoke: no scanner regression in the sink lanes

| row | observed |
|---|---|
| `v5-s1-explicit-create-clean` (new rows) | **PASS**. Exit 0, `sink_pr: created`, one create, keep-open body, no closing keyword, no `--fill`, `suppressed_request_only`, no merge. Origin was not consulted. |
| `safe-explicit-singleton-positive` (v3 controls, step 04) | **PASS**. `realSinkProcessSucceeded`, `actualRequestCreated`, `requestOnly`, `noCloseOrMerge`, `noClosingReference`, `autoMergeSuppressed`, `actualFixtureReceipt`. |
| `v5-s2-clean-open-reuse` (new rows; this is v4-e1) | **PASS**. `closingIssuesReferences: []` and `autoMergeRequest: null` were stored and served. Exit 0, `sink_pr: reused`, `pr_request: request_only`, `mainline_publication: pending`, `pr_auto_merge: suppressed_request_only`. No create, merge, queue, or PR mutation. |
| `duplicate-action-field` (v3 controls) | **PASS**. Exit 1 `explicit_keep_open_refused: ambiguous_identity`, with no unsafe operation, no archive or placeholder mutation, and MAIN, index, claim, and evidence unchanged. |
| `noninteger-cli-issue-prefix` (v3 controls) | **PASS**. Exit 1 `explicit_keep_open_refused: malformed_issue`, with the same no-effect checks. |
| `closing-commit-reference-create` (v3 suite, step 03) | **PASS**. Bare `Closes #143` in a commit refuses `closing_linkage` before push; operations `["pr.list"]`. |

### 4.6 Discrimination control (step 07: the same v5 rows on 6423042a)

Step 07 ran the same `new-rows-v5.js` against the previous candidate's bound source and showed that
the v5 rows discriminate. Summary: `runs/discrimination-newrows-on-6423042a/new-rows-summary.json`,
commit `6423042a`, digest `4b1f23cd…`, trace audit ok with 49 records.

- **a1, a2, c1, c3 RED.** The sink did not refuse.
  - a2, c1, and c3 published: `git.push`, `pr.create`, and `archive`.
  - a1 reused and archived.
- **c2 RED** only on `originLookupAsExpected`, because 6423042a has no origin fallback.
- **d1 RED** on the 11 cases that need same-repository or empty-identity counting.
- **b1, b2, s1, s2 PASS.**
- Exit 1. This is the expected result for that candidate, not a finding about 45e6deb1.

## 5. Carryover from v4 (bound 6423042a) by the recorded blob-diff scope

The only changed bound bytes are the scanner/identity region of `sink-pr.js` and its explicit-mode
call sites (§3). A v4 result carries to 45e6deb1 when its lane does not reach the new code, or when
every text it scans has no qualified `owner/repo#N`. In both cases `closingIssueNumbers` returns the
same set for every identity.

| v4 rows | v4 result @6423042a | carries? | why |
|---|---|---|---|
| 33 watcher-lane rows (7 suite rows plus 26 watch controls) | PASS (watch 24/24, positives, 7/7) | yes | They have no sink child, and every bound file they touch is blob-identical (v4 `runs/02-carryover.json`, re-confirmed by step 02). |
| v4-a1/a2/a3 (empty, duplicate, or partial marker, online and OFFLINE) and outer `probe-v4.cjs` | PASS / refused | yes | They refuse at lines 715–722, before identity is computed (line 757) and before any scan. |
| v4-b1/b3 (`native_closing_linkage`), c1/c2 (`auto_merge_enabled`), d1–d4 (`*_unmeasured`), and outer `reuse-probe-v4.cjs` manual-linked / auto-enabled | PASS / refused | yes | `assertExplicitOpenNativeSafe` (unchanged) refuses at line 846, before the scans that changed. The identity computation cannot throw. |
| v4-b2 (native other issue), v4-e1 (clean reuse) | PASS | yes; e1 re-run as s2 | The PR body and title (`Keeps #143 open. …`, `Publish issue-143 (keeps #143 open)`) and the commit range contain no qualified reference. |
| v4-f2 (`closes #143` create) | PASS | yes; same class re-run as suite `closing-commit-reference-create` | A bare reference is `match[4]`, the same as the old `match[1]`. |
| v4-f3 (foreign plus non-associated create) | PASS | **re-run** as v5-b1 (also b2 reuse) | It contains a qualified reference. |
| v4-f1 helper | PASS | **does not carry; superseded by v5-d1** | v4-f1 called `closingIssueNumbers(text)` with no identity and asserted `Fixes other/repo#143` → []. On 45e6deb1, an omitted identity counts every qualified reference (→ [143]), as ruling 2 directs. v5-d1 asserts the same text with an identity supplied (→ []) and asserts the omitted case → [143]. The outer probes' printed helper line `Fixes other/repo#143 → []` (no identity, not asserted there) would likewise print [143] now. |
| v3 suite `qualified-closing-commit-reference-reuse` | v4 B: RED (reused) | **re-run** (step 03) | It contains a qualified reference. It now PASSes. |
| Other 38 affected suite rows, Pass B: refusals (`mode_mismatch`, `ambiguous_identity`, `bundle_refused`, `branch_mismatch`, `base_mismatch`, `head_mismatch`, `pr_closed_unmerged`, legacy merge-sink-only); legacy-default-close; stage-request-merged-live/-archive; stage-final-archive-not-on-origin; retry-push/-create/-record/-archive; and the known RED classes | as v4 §5: 21 PASS / 17 RED among these 38 (v4 B's 22/18 minus closing-commit-reference-create PASS and the qualified row RED) | yes | No scanned text contains a qualified reference: no commit fixtures, and the seeded PR and generated body/title have only bare `#143` with no keyword before it. So the scan result is the same for every identity. Close-mode rows never reach the scanner. MERGED rows scan only the PR text (line 823). |
| Same, identity-input rows: `missing-repository`, `malformed-repository`, `repository-mismatch`, `unsupported-forge` | RED (publish; known claim-identity class) | yes | The identity input now differs: no line or an unparseable line falls back to origin, and mismatch gives a different identity. The texts contain no qualified reference, so the scan outcome does not change. v5-c2 measured the same publish operations under the origin fallback. |
| `receipt.identity` RED group (live-create, archive-create, live-open-reuse, archive-open-reuse, open-probe-failure, the merged-* rows) | RED (assertion only) | yes | The assertion reads the adapter receipt, not scanner output. Not re-run. |
| 13 sink controls not re-run (10 refusals plus `duplicate-repository-field`, `duplicate-digest-field`, `duplicate-claim-identity-section`) | 10 PASS, 3 RED (known class); v4 sink total 12/15 refusals + positive | yes | The refusals happen at the identity/marker gates, before line 757. The three RED rows publish. Two of them (`duplicate-repository-field`, `duplicate-claim-identity-section`) now produce disagreeing identity lines and fall back to count-all, but their texts carry no qualified reference, so the outcome does not change. v5-c3 covers that path with a qualified reference. |
| Pass A (v3 harness by reference) results | as v4 §5 | yes, unchanged in meaning | Ruling 1: Pass B decides reuse success. Pass A was not re-run. |

## 6. Not run, and why

- **Every other v4 row, and Pass A.** They carry over by the scope in §5. Only the scanner-affected
  rows and the smoke set were run, as assigned.
- **v3 `harness-selftest.js`.** Not re-run: `predicates.js` and `bound-source.js` are byte-identical.
  Steps 06 and 07 exercised the fail-closed exit again.
- **Outer-review probes.** Not re-run. Their refusals happen before the changed code (§5).
- **`npm test`, producer chains, `simulate-workflow-walkthrough.js`.** Not run, including the
  scanner fix's `testExplicitKeepOpenPrP1Repairs` extension. This seat is repository read-only, and
  the candidate-bound chain receipt belongs to the parallel chain seat or the Host.
- **No authenticated forge.** The `gh` spy is synthetic. Whether GitHub itself closes #143 for a
  same-repository qualified reference or for a full URL in a commit message was not measured. The
  full-URL forms remain the recorded unverified gap.
- **No GitHub-URL origin remote end to end.** Origin is always the local bare path. The URL shapes
  were exercised through the state line (a1, a2) and the helper (d1), which use the same
  `asOwnerRepo`.
- **Relative-path origin** (§4.4 observation): not exercised end to end.
- **Not decided here, for the Host:** the relative-path identity observation, and whether the
  supersession of v4-f1 by v5-d1 is the intended meaning.
- No production repair, no integration patch, no verdict.

## 7. Artifacts

- `controls/`: v5 harness (§2).
- `runs/00-binding/`: candidate facts, harness identity, and v4-to-v5 diffs.
  `runs/08-final-readonly-facts.txt`.
- `runs/candidate-45e6deb1/`: tar, manifest, initial verify, and the read-only extraction.
- `runs/02-blobdiff.json` and `runs/02-blobdiff-sink.diff`.
- `runs/NN-*-step/` for each step: `stdout.raw`, `stderr.raw`, `exit`, and `process.json`.
- `runs/{B-suite-45e6deb1,B-controls-45e6deb1,B-newrows-45e6deb1}/`: summaries
  (`suite-summary.json`, `controls-summary.json`, `new-rows-summary.json`) plus per-scenario
  fixtures and seed receipts, children (argv/pid/cwd/exit/stdout/stderr, `GIT_TRACE`, candidate
  traces), gh JSONL, and `results/normalized-result.json`.
- `runs/discrimination-newrows-on-6423042a/` and `runs/failclosed-empty-newrows/`.
- `ARTIFACT-HASHES` / `ARTIFACT-HASHES.sha256`: SHA-256 of every regular file here except the
  manifest and its sidecar, generated after this report.
